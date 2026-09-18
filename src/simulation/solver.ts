import { SAND, type Stroke } from '../config'
import { checkedShader } from '../platform/shader'
import type { WaveResetState } from '../reset/effect'
import { particleShader, simulationShader } from './shaders'
import { waveResetShader } from './wave-reset-shader'

const paramVectors = 3 + SAND.maxContacts * 3
const paramBytes = paramVectors * 16

export class SandSolver {
  readonly buffers: GPUBuffer[]
  readonly flux: GPUBuffer
  readonly particles: GPUBuffer
  readonly particleCount: number
  private readonly exchange: GPUBuffer
  private readonly contact: GPUBuffer
  private readonly contactPressure: GPUBuffer
  private readonly impactBudget: GPUBuffer
  private particlePipeline!: GPUComputePipeline
  private particleGroups: GPUBindGroup[][] = []
  private readonly uniforms: GPUBuffer[]
  private readonly waveResetUniform: GPUBuffer
  private waveResetPipeline!: GPUComputePipeline
  private waveResetGroups: GPUBindGroup[] = []
  private pipelines!: Record<'initialize' | 'contact' | 'transport' | 'integrate', GPUComputePipeline>
  private groups: GPUBindGroup[][] = []
  private current = 0
  private generation = 0
  private readonly data = new Float32Array(paramVectors * 4)
  readonly byteLength: number

  readonly device: GPUDevice
  readonly resolution: number
  constructor(device: GPUDevice, resolution: number = SAND.resolution) {
    this.device = device
    this.resolution = resolution
    this.byteLength = resolution * resolution * 16
    this.buffers = [0, 1].map((index) => device.createBuffer({ label: `Sand state ${index}`, size: this.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST }))
    this.flux = device.createBuffer({ label: 'Eight-neighbor conservative flux', size: this.byteLength * 2, usage: GPUBufferUsage.STORAGE })
    this.contact = device.createBuffer({ label: 'Pointer contact field', size: this.byteLength, usage: GPUBufferUsage.STORAGE })
    this.contactPressure = device.createBuffer({ label: 'Pointer contact pressure', size: resolution * resolution * 4, usage: GPUBufferUsage.STORAGE })
    this.impactBudget = device.createBuffer({ label: 'Frontier impact ejection budget', size: resolution * resolution * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })
    this.particleCount = Math.min(SAND.particles, resolution * resolution)
    this.particles = device.createBuffer({ label: 'Mass carrying grains', size: this.particleCount * 32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST })
    this.exchange = device.createBuffer({ label: 'Fixed-point grain exchange', size: resolution * resolution * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })
    this.uniforms = Array.from({ length: SAND.maxSteps }, () => device.createBuffer({ size: paramBytes, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }))
    this.waveResetUniform = device.createBuffer({ label: 'Wave reset parameters', size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
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
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ] })
    const pipelineLayout = this.device.createPipelineLayout({ bindGroupLayouts: [layout] })
    const make = (entryPoint: string) => this.device.createComputePipelineAsync({ label: entryPoint, layout: pipelineLayout, compute: { module, entryPoint } })
    const [initialize, contact, transport, integrate] = await Promise.all([make('initialize'), make('contact'), make('transport'), make('integrate')])
    this.pipelines = { initialize, contact, transport, integrate }
    this.groups = this.uniforms.map((uniform) => [0, 1].map((index) => this.device.createBindGroup({ layout, entries: [
      { binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: { buffer: this.buffers[index] } },
      { binding: 2, resource: { buffer: this.buffers[1 - index] } }, { binding: 3, resource: { buffer: this.flux } },
      { binding: 4, resource: { buffer: this.exchange } }, { binding: 5, resource: { buffer: this.contact } },
      { binding: 6, resource: { buffer: this.contactPressure } },
      { binding: 7, resource: { buffer: this.impactBudget } },
    ] })))
    const particles = await checkedShader(this.device, 'Mass carrying grains WGSL', particleShader)
    this.particlePipeline = await this.device.createComputePipelineAsync({ layout: 'auto', compute: { module: particles, entryPoint: 'animate' } })
    this.particleGroups = this.uniforms.map((uniform) => this.buffers.map((buffer) => this.device.createBindGroup({ layout: this.particlePipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: { buffer } },
      { binding: 2, resource: { buffer: this.flux } }, { binding: 3, resource: { buffer: this.particles } },
      { binding: 4, resource: { buffer: this.exchange } }, { binding: 5, resource: { buffer: this.contact } },
      { binding: 6, resource: { buffer: this.contactPressure } }, { binding: 7, resource: { buffer: this.impactBudget } },
    ] })))

    const resetModule = await checkedShader(this.device, 'Wave reset WGSL', waveResetShader)
    this.waveResetPipeline = await this.device.createComputePipelineAsync({ layout: 'auto', compute: { module: resetModule, entryPoint: 'main' } })
    this.waveResetGroups = this.buffers.map((buffer) => this.device.createBindGroup({
      layout: this.waveResetPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.waveResetUniform } },
        { binding: 1, resource: { buffer } },
      ],
    }))
    this.reset()
  }

  private writeParams(slot: number, strokes: readonly Stroke[]) {
    const active = strokes.filter((stroke) => stroke.active && stroke.pressure > 0).slice(0, SAND.maxContacts)
    this.data.fill(0)
    this.data.set([
      this.resolution, SAND.extent / this.resolution, SAND.extent, SAND.step,
      SAND.depth, SAND.floor, SAND.repose, SAND.dynamicRepose,
      active.length, SAND.indentation, SAND.rate, 0,
    ])
    active.forEach((stroke, index) => {
      const offset = 12 + index * 12
      this.data.set([stroke.from.x, stroke.from.y, stroke.radius, stroke.pressure], offset)
      this.data.set([stroke.to.x, stroke.to.y, 0, 0], offset + 4)
      this.data.set([stroke.velocity.x, stroke.velocity.y, Math.hypot(stroke.velocity.x, stroke.velocity.y), 0], offset + 8)
    })
    this.device.queue.writeBuffer(this.uniforms[slot], 0, this.data)
    return active.length
  }

  reset() {
    this.writeParams(0, [])
    const encoder = this.device.createCommandEncoder()
    this.encodeFullReset(encoder)
    this.device.queue.submit([encoder.finish()])
  }

  encodeFullReset(encoder: GPUCommandEncoder) {
    this.generation++
    encoder.clearBuffer(this.particles)
    encoder.clearBuffer(this.exchange)
    encoder.clearBuffer(this.impactBudget)
    const pass = encoder.beginComputePass({ label: 'Full sand reset' })
    pass.setPipeline(this.pipelines.initialize)
    for (const group of [this.groups[0][0], this.groups[0][1]]) {
      pass.setBindGroup(0, group)
      pass.dispatchWorkgroups(Math.ceil(this.resolution / 8), Math.ceil(this.resolution / 8))
    }
    pass.end()
  }

  encodeWaveReset(encoder: GPUCommandEncoder, state: WaveResetState) {
    const data = new Float32Array([
      this.resolution, SAND.extent / this.resolution, SAND.extent, SAND.depth,
      state.erasePreviousBaseFront, state.eraseCurrentBaseFront, state.erasePreviousTime, state.eraseCurrentTime,
    ])
    this.device.queue.writeBuffer(this.waveResetUniform, 0, data)
    const pass = encoder.beginComputePass({ label: 'Wave reset' })
    pass.setPipeline(this.waveResetPipeline)
    for (const group of this.waveResetGroups) {
      pass.setBindGroup(0, group)
      pass.dispatchWorkgroups(Math.ceil(this.resolution / 8), Math.ceil(this.resolution / 8))
    }
    pass.end()
    this.generation++
  }

  clearTransientState(encoder: GPUCommandEncoder) {
    // Contact fields do not need clearing while the simulation is paused: a
    // zero contact count gates reads, and the next active contact pass rewrites
    // the full fields. Avoiding those clears saves several MB of GPU traffic per
    // reset frame and keeps STORAGE-only buffers out of clearBuffer().
    encoder.clearBuffer(this.particles)
    encoder.clearBuffer(this.exchange)
    encoder.clearBuffer(this.impactBudget)
  }

  encode(encoder: GPUCommandEncoder, steps: readonly (readonly Stroke[])[]) {
    if (steps.length > SAND.maxSteps) throw new Error('Simulation substep budget exceeded')
    steps.forEach((strokes, slot) => {
      const contactCount = this.writeParams(slot, strokes)
      const pass = encoder.beginComputePass({ label: 'Sand conservative transport' })
      pass.setBindGroup(0, this.groups[slot][this.current])
      if (contactCount > 0) {
        pass.setPipeline(this.pipelines.contact)
        pass.dispatchWorkgroups(Math.ceil(this.resolution / 8), Math.ceil(this.resolution / 8))
      }
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

  dispose() { [...this.buffers, this.flux, this.particles, this.exchange, this.contact, this.contactPressure, this.impactBudget, ...this.uniforms, this.waveResetUniform].forEach((buffer) => buffer.destroy()) }
}
