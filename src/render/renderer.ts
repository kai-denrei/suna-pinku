import { SAND, type Stroke } from '../config'
import { checkedShader } from '../platform/shader'
import type { SandSolver } from '../simulation/solver'
import { SandCamera } from './camera'
import { BedLighting } from './lighting'
import { surfaceShader } from './shaders'

const LIGHT_ANGLE = -0.8

export class SandRenderer {
  readonly camera = new SandCamera()
  private readonly uniform: GPUBuffer
  private readonly lighting: BedLighting
  private readonly indices: GPUBuffer
  private readonly indexCount: number
  private pipeline!: GPURenderPipeline
  private grainPipeline!: GPURenderPipeline
  private grainGroup!: GPUBindGroup
  private groups: GPUBindGroup[] = []
  private depth: GPUTexture | undefined
  private width = 0
  private height = 0
  private readonly data = new Float32Array(28)

  private readonly device: GPUDevice
  private readonly solver: SandSolver
  private readonly format: GPUTextureFormat
  private readonly mobileGrainFiltering: boolean
  constructor(device: GPUDevice, solver: SandSolver, format: GPUTextureFormat, mobileGrainFiltering = false) {
    this.device = device; this.solver = solver; this.format = format; this.mobileGrainFiltering = mobileGrainFiltering
    this.uniform = device.createBuffer({ label: 'Surface view', size: 112, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    this.lighting = new BedLighting(device, solver, this.uniform)
    const resolution = solver.resolution
    this.indexCount = (resolution - 1) ** 2 * 6
    const indices = new Uint32Array(this.indexCount)
    let offset = 0
    for (let row = 0; row < resolution - 1; row++) {
      for (let column = 0; column < resolution - 1; column++) {
        const vertex = row * resolution + column
        indices.set([vertex, vertex + resolution, vertex + 1, vertex + 1, vertex + resolution, vertex + resolution + 1], offset)
        offset += 6
      }
    }
    this.indices = device.createBuffer({ label: 'Sand grid topology', size: indices.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST })
    device.queue.writeBuffer(this.indices, 0, indices)
  }

  async initialize() {
    await this.lighting.initialize()
    const module = await checkedShader(this.device, 'Granular surface WGSL', surfaceShader)
    this.pipeline = await this.device.createRenderPipelineAsync({ label: 'Granular sand surface', layout: 'auto',
      vertex: { module, entryPoint: 'vertex' }, fragment: { module, entryPoint: this.mobileGrainFiltering ? 'fragmentMobile' : 'fragment', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
    })
    this.groups = this.solver.buffers.map((buffer) => this.device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: this.uniform } }, { binding: 1, resource: { buffer } },
      { binding: 3, resource: { buffer: this.lighting.buffer } },
    ] }))
    this.grainPipeline = await this.device.createRenderPipelineAsync({ label: 'Loose sand grains', layout: 'auto',
      vertex: { module, entryPoint: 'grainVertex' }, fragment: { module, entryPoint: 'grainFragment', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list' }, depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
    })
    this.grainGroup = this.device.createBindGroup({ layout: this.grainPipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: this.uniform } }, { binding: 2, resource: { buffer: this.solver.particles } },
    ] })
  }

  resize(width: number, height: number) {
    if (width === this.width && height === this.height) return
    this.depth?.destroy()
    this.width = width; this.height = height
    this.camera.aspect = width / height
    this.depth = this.device.createTexture({ label: 'Surface depth', size: [width, height], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT })
  }

  encode(encoder: GPUCommandEncoder, target: GPUTextureView, pointer: Stroke, showPointer = false) {
    if (!this.depth) throw new Error('Renderer needs a nonzero drawing buffer')
    this.data.set([...this.camera.eye, this.camera.tanHalfFov, ...this.camera.forward, this.camera.aspect,
      ...this.camera.right, 0, ...this.camera.up, 0,
      Math.cos(LIGHT_ANGLE), 0.65, Math.sin(LIGHT_ANGLE), 0,
      this.solver.resolution, SAND.extent, this.width, this.height,
      pointer.to.x, pointer.to.y, pointer.radius, showPointer ? 1 : 0])
    this.device.queue.writeBuffer(this.uniform, 0, this.data)
    this.lighting.encode(encoder, LIGHT_ANGLE)
    const pass = encoder.beginRenderPass({ label: 'Sand image', colorAttachments: [{ view: target, clearValue: { r: 0.55, g: 0.44, b: 0.29, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
      depthStencilAttachment: { view: this.depth.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' },
    })
    pass.setPipeline(this.pipeline)
    pass.setBindGroup(0, this.groups[this.solver.stateIndex])
    pass.setIndexBuffer(this.indices, 'uint32')
    pass.drawIndexed(this.indexCount)
    pass.setPipeline(this.grainPipeline)
    pass.setBindGroup(0, this.grainGroup)
    pass.draw(6, this.solver.particleCount)
    pass.end()
  }

  dispose() { this.lighting.dispose(); this.uniform.destroy(); this.indices.destroy(); this.depth?.destroy() }
}
