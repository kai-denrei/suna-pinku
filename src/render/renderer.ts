import { WetSand } from './wet-sand'
import { JewelCollection } from '../play/jewels'
import { JewelRenderer } from './jewels'
import { SandMarkings } from './markings'
import { SAND, type Stroke } from '../config'
import { checkedShader } from '../platform/shader'
import type { WaveResetState } from '../reset/effect'
import { idleWaveResetState } from '../reset/effect'
import type { SandSolver } from '../simulation/solver'
import { AirborneShadow } from './airborne-shadow'
import { SandCamera } from './camera'
import { BedLighting } from './lighting'
import { GLINT_FORMAT, HDR_SCENE_FORMAT, SandPostProcess } from './postprocess'
import { surfaceShader } from './shaders'

const LIGHT_ANGLE = -0.8
const LIGHT_DIRECTION = [Math.cos(LIGHT_ANGLE), 0.65, Math.sin(LIGHT_ANGLE)] as const

export class SandRenderer {
  readonly camera = new SandCamera()
  readonly wetSand: WetSand
  readonly markings: SandMarkings
  private markingsGroup!: GPUBindGroup
  palette = 1
  reducedMotion = false
  readonly jewels = new JewelCollection()
  private readonly jewelRenderer: JewelRenderer
  private readonly uniform: GPUBuffer
  private readonly lighting: BedLighting
  private readonly shadowTexture: GPUTexture
  private readonly shadowSampler: GPUSampler
  private readonly airborneShadow: AirborneShadow
  private readonly post: SandPostProcess
  private readonly indices: GPUBuffer
  private readonly indexCount: number
  private pipeline!: GPURenderPipeline
  private grainPipeline!: GPURenderPipeline
  private grainGroup!: GPUBindGroup
  private groups: GPUBindGroup[] = []
  private depth: GPUTexture | undefined
  private width = 0
  private height = 0
  private readonly data = new Float32Array(36)

  private readonly device: GPUDevice
  private readonly solver: SandSolver
  private readonly mobileGrainFiltering: boolean
  constructor(device: GPUDevice, solver: SandSolver, format: GPUTextureFormat, mobileGrainFiltering = false) {
    this.markings = new SandMarkings(device)
    this.wetSand = new WetSand(device)
    this.device = device; this.solver = solver; this.mobileGrainFiltering = mobileGrainFiltering
    this.uniform = device.createBuffer({ label: 'Surface view', size: this.data.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    this.jewelRenderer = new JewelRenderer(device, solver, this.jewels, this.uniform)
    this.lighting = new BedLighting(device, solver, this.uniform)
    this.shadowTexture = device.createTexture({ label: 'Neutral studio shadow', size: [1, 1], format: 'r8unorm', usage: GPUTextureUsage.TEXTURE_BINDING })
    this.shadowSampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' })
    this.airborneShadow = new AirborneShadow(device, solver)
    this.post = new SandPostProcess(device, format, format)
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
    await Promise.all([this.jewelRenderer.initialize(), this.markings.initialize(), this.lighting.initialize(), this.airborneShadow.initialize(), this.post.initialize()])
    const module = await checkedShader(this.device, 'Granular surface WGSL', surfaceShader)
    this.pipeline = await this.device.createRenderPipelineAsync({ label: 'Granular sand surface', layout: 'auto',
      vertex: { module, entryPoint: 'vertex' }, fragment: { module, entryPoint: this.mobileGrainFiltering ? 'fragmentMobile' : 'fragment', targets: [{ format: HDR_SCENE_FORMAT }, { format: GLINT_FORMAT }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
    })
    this.markingsGroup = this.device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(1), entries: [
      { binding: 0, resource: { buffer: this.markings.uniform } },
      { binding: 1, resource: this.markings.texture.createView() },
      { binding: 2, resource: this.wetSand.texture.createView() },
      { binding: 3, resource: { buffer: this.wetSand.uniform } },
    ] })
    this.groups = this.solver.buffers.map((buffer) => this.device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: this.uniform } },
      { binding: 1, resource: { buffer } },
      { binding: 3, resource: { buffer: this.lighting.buffer } },
      { binding: 4, resource: this.shadowSampler },
      { binding: 5, resource: this.shadowTexture.createView() },
      { binding: 6, resource: this.airborneShadow.sampler },
      { binding: 7, resource: this.airborneShadow.texture.createView() },
    ] }))
    this.grainPipeline = await this.device.createRenderPipelineAsync({ label: 'Loose sand grains', layout: 'auto',
      vertex: { module, entryPoint: 'grainVertex' }, fragment: { module, entryPoint: 'grainFragment', targets: [
        { format: HDR_SCENE_FORMAT, blend: {
          color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        } },
        { format: GLINT_FORMAT, blend: {
          color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
        } },
      ] },
      primitive: { topology: 'triangle-list' }, depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less' },
    })
    this.grainGroup = this.device.createBindGroup({ layout: this.grainPipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: this.uniform } },
      { binding: 2, resource: { buffer: this.solver.particles } },
      { binding: 4, resource: this.shadowSampler },
      { binding: 5, resource: this.shadowTexture.createView() },
    ] })
  }

  resize(width: number, height: number) {
    if (width === this.width && height === this.height) return
    this.depth?.destroy()
    this.width = width; this.height = height
    this.camera.aspect = width / height
    this.depth = this.device.createTexture({ label: 'Surface depth', size: [width, height], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT })
    this.post.resize(width, height)
  }

  encode(encoder: GPUCommandEncoder, target: GPUTextureView, pointer: Stroke, now: number, showPointer = false, waveState: WaveResetState = idleWaveResetState()) {
    if (!this.depth) throw new Error('Renderer needs a nonzero drawing buffer')
    // Pink studio lighting: the palm mask stays unused.
    this.markings.update(now)
    this.wetSand.update()
    this.data.set([
      ...this.camera.eye, this.camera.tanHalfFov,
      ...this.camera.forward, this.camera.aspect,
      ...this.camera.right, now / 1000,
      ...this.camera.up, this.reducedMotion ? 1 : 0,
      ...LIGHT_DIRECTION, 0,
      this.solver.resolution, SAND.extent, this.width, this.height,
      pointer.to.x, pointer.to.y, pointer.radius, showPointer ? 1 : 0,
      0, 0, 1, 1,
      0, this.palette, 0, 0,
    ])
    this.device.queue.writeBuffer(this.uniform, 0, this.data)
    if (!waveState.active || !waveState.incoming) this.lighting.encode(encoder, LIGHT_ANGLE)
    if (waveState.justStarted) this.airborneShadow.clear(encoder)
    else if (!waveState.active) this.airborneShadow.encode(encoder, LIGHT_DIRECTION)
    const pass = encoder.beginRenderPass({ label: 'Sand image', colorAttachments: [
      { view: this.post.target, clearValue: { r: 0.7, g: 0.22, b: 0.4, a: 1 }, loadOp: 'clear', storeOp: 'store' },
      { view: this.post.glintTarget, clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' },
    ],
      depthStencilAttachment: { view: this.depth.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' },
    })
    pass.setPipeline(this.pipeline)
    pass.setBindGroup(0, this.groups[this.solver.stateIndex])
    pass.setBindGroup(1, this.markingsGroup)
    pass.setIndexBuffer(this.indices, 'uint32')
    pass.drawIndexed(this.indexCount)
    if (!waveState.active) {
      pass.setPipeline(this.grainPipeline)
      pass.setBindGroup(0, this.grainGroup)
      pass.draw(6, this.solver.particleCount)
    }
    this.jewelRenderer.draw(pass)
    pass.end()
    this.post.setWaveState(waveState, this.camera)
    this.post.encode(encoder, target)
  }

  dispose() { this.wetSand.dispose(); this.jewelRenderer.dispose(); this.markings.dispose(); this.lighting.dispose(); this.shadowTexture.destroy(); this.airborneShadow.dispose(); this.post.dispose(); this.uniform.destroy(); this.indices.destroy(); this.depth?.destroy() }
}
