import { SAND, idleStroke, type Stroke } from '../config'
import { checkedShader } from '../platform/shader'
import { particleShader, simulationShader } from './shaders'

export class SandSolver {
  readonly buffers: GPUBuffer[]
  readonly flux: GPUBuffer
  readonly particles: GPUBuffer
  readonly particleCount: number
  private readonly exchange: GPUBuffer
  private particlePipeline!: GPUComputePipeline
  private particleGroups: GPUBindGroup[][] = []
  private readonly uniforms: GPUBuffer[]
  private pipelines!: Record<'initialize' | 'transport' | 'integrate', GPUComputePipeline>
  private groups: GPUBindGroup[][] = []
  private current = 0
  private generation = 0
  private readonly data = new Float32Array(16)
  readonly byteLength: number

  readonly device: GPUDevice
  readonly resolution: number
  constructor(device: GPUDevice, resolution: number = SAND.resolution) {
    this.device = device
    this.resolution = resolution
    this.byteLength = resolution * resolution * 16
    this.buffers = [0, 1].map((index) => device.createBuffer({ label: `Sand state ${index}`, size: this.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST }))
    this.flux = device.createBuffer({ label: 'Eight-neighbor conservative flux', size: this.byteLength * 2, usage: GPUBufferUsage.STORAGE })
    this.particleCount = Math.min(SAND.particles, resolution * resolution)
    this.particles = device.createBuffer({ label: 'Mass carrying grains', size: this.particleCount * 32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST })
    this.exchange = device.createBuffer({ label: 'Fixed-point grain exchange', size: resolution * resolution * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })
    this.uniforms = Array.from({ length: SAND.maxSteps }, () => device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }))
  }
  get state() { return this.buffers[this.current] }
  get stateIndex() { return this.current }
  get revision() { return this.generation }

  async initialize() {
    const module = await checkedShader(this.device, 'Sand transport WGSL', simulationShader)
    const layout = this.device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ] })
    const pipelineLayout = this.device.createPipelineLayout({ bindGroupLayouts: [layout] })
    const make = (entryPoint: string) => this.device.createComputePipelineAsync({ label: entryPoint, layout: pipelineLayout, compute: { module, entryPoint } })
    const [initialize, transport, integrate] = await Promise.all([make('initialize'), make('transport'), make('integrate')])
    this.pipelines = { initialize, transport, integrate }
    this.groups = this.uniforms.map((uniform) => [0, 1].map((index) => this.device.createBindGroup({ layout, entries: [
      { binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: { buffer: this.buffers[index] } },
      { binding: 2, resource: { buffer: this.buffers[1 - index] } }, { binding: 3, resource: { buffer: this.flux } },
      { binding: 4, resource: { buffer: this.exchange } },
    ] })))
    const particles = await checkedShader(this.device, 'Mass carrying grains WGSL', particleShader)
    this.particlePipeline = await this.device.createComputePipelineAsync({ layout: 'auto', compute: { module: particles, entryPoint: 'animate' } })
    this.particleGroups = this.uniforms.map((uniform) => this.buffers.map((buffer) => this.device.createBindGroup({ layout: this.particlePipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: { buffer } },
      { binding: 2, resource: { buffer: this.flux } }, { binding: 3, resource: { buffer: this.particles } },
      { binding: 4, resource: { buffer: this.exchange } },
    ] })))
    this.reset()
  }

  private writeParams(slot: number, stroke: Stroke) {
    this.data.set([this.resolution, SAND.extent / this.resolution, SAND.extent, SAND.step,
      SAND.depth, SAND.floor, SAND.repose, SAND.dynamicRepose,
      stroke.from.x, stroke.from.y, stroke.radius, stroke.active ? stroke.pressure : 0,
      stroke.to.x, stroke.to.y, SAND.indentation, SAND.rate])
    this.device.queue.writeBuffer(this.uniforms[slot], 0, this.data)
  }

  reset() {
    this.generation++
    this.writeParams(0, idleStroke())
    const encoder = this.device.createCommandEncoder()
    encoder.clearBuffer(this.particles)
    encoder.clearBuffer(this.exchange)
    const pass = encoder.beginComputePass()
    pass.setPipeline(this.pipelines.initialize)
    pass.setBindGroup(0, this.groups[0][1 - this.current])
    pass.dispatchWorkgroups(Math.ceil(this.resolution / 8), Math.ceil(this.resolution / 8))
    pass.end()
    this.device.queue.submit([encoder.finish()])
  }

  encode(encoder: GPUCommandEncoder, strokes: Stroke[]) {
    if (strokes.length > SAND.maxSteps) throw new Error('Simulation substep budget exceeded')
    strokes.forEach((stroke, slot) => {
      this.writeParams(slot, stroke)
      const pass = encoder.beginComputePass({ label: 'Sand conservative transport' })
      pass.setBindGroup(0, this.groups[slot][this.current])
      pass.setPipeline(this.pipelines.transport)
      pass.dispatchWorkgroups(Math.ceil(this.resolution / 8), Math.ceil(this.resolution / 8))
      pass.setPipeline(this.particlePipeline)
      pass.setBindGroup(0, this.particleGroups[slot][this.current])
      pass.dispatchWorkgroups(Math.ceil(this.particleCount / 64))
      pass.setPipeline(this.pipelines.integrate)
      pass.setBindGroup(0, this.groups[slot][this.current])
      pass.dispatchWorkgroups(Math.ceil(this.resolution / 8), Math.ceil(this.resolution / 8))
      pass.end()
      this.current = 1 - this.current
      this.generation++
    })
  }

  dispose() { [...this.buffers, this.flux, this.particles, this.exchange, ...this.uniforms].forEach((buffer) => buffer.destroy()) }
}
