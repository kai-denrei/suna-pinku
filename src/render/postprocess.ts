const postShader = `
struct PostView { texel: vec4f }
@group(0) @binding(0) var postSampler: sampler;
@group(0) @binding(1) var sourceTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> postView: PostView;
struct VertexOutput { @builtin(position) clip: vec4f, @location(0) uv: vec2f }
@vertex fn vertex(@builtin(vertex_index) index: u32) -> VertexOutput {
  let positions = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  let clip = positions[index];
  var output: VertexOutput;
  output.clip = vec4f(clip, 0.0, 1.0);
  output.uv = clip * vec2f(0.5, -0.5) + vec2f(0.5);
  return output;
}
fn luminance(color: vec3f) -> f32 {
  return dot(color, vec3f(0.2126, 0.7152, 0.0722));
}
fn bright(color: vec3f) -> vec3f {
  let threshold = 0.925;
  let knee = 0.035;
  let luma = luminance(color);
  let weight = smoothstep(threshold - knee, threshold + knee, luma);
  return color * max((luma - threshold) / max(luma, 0.0001), 0.0) * weight;
}
@fragment fn fragment(input: VertexOutput) -> @location(0) vec4f {
  let texel = postView.texel.xy;
  let base = textureSample(sourceTexture, postSampler, input.uv).rgb;
  let offsets = array<vec2f, 16>(
    vec2f(1.3, 0.0), vec2f(-1.3, 0.0), vec2f(0.0, 1.3), vec2f(0.0, -1.3),
    vec2f(1.0, 1.0), vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(-1.0, -1.0),
    vec2f(3.1, 0.0), vec2f(-3.1, 0.0), vec2f(0.0, 3.1), vec2f(0.0, -3.1),
    vec2f(5.4, 0.0), vec2f(-5.4, 0.0), vec2f(0.0, 5.4), vec2f(0.0, -5.4)
  );
  let weights = array<f32, 16>(0.13, 0.13, 0.13, 0.13, 0.105, 0.105, 0.105, 0.105, 0.065, 0.065, 0.065, 0.065, 0.028, 0.028, 0.028, 0.028);
  var bloom = vec3f(0.0);
  for (var index = 0u; index < 16u; index++) {
    bloom += bright(textureSample(sourceTexture, postSampler, input.uv + offsets[index] * texel).rgb) * weights[index];
  }
  let color = clamp(base + bloom * 2.15, vec3f(0.0), vec3f(1.0));
  return vec4f(color, 1.0);
}
`

export class SandPostProcess {
  private readonly uniform: GPUBuffer
  private readonly sampler: GPUSampler
  private readonly module: GPUShaderModule
  private pipeline!: GPURenderPipeline
  private bindGroup!: GPUBindGroup
  private scene?: GPUTexture
  private sceneView?: GPUTextureView
  private width = 0
  private height = 0

  private readonly device: GPUDevice
  private readonly sourceFormat: GPUTextureFormat
  private readonly targetFormat: GPUTextureFormat

  constructor(device: GPUDevice, sourceFormat: GPUTextureFormat, targetFormat: GPUTextureFormat) {
    this.device = device
    this.sourceFormat = sourceFormat
    this.targetFormat = targetFormat
    this.uniform = device.createBuffer({ label: 'Bloom post uniform', size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    this.sampler = device.createSampler({ label: 'Bloom post sampler', magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' })
    this.module = device.createShaderModule({ label: 'Bloom post WGSL', code: postShader })
  }

  async initialize() {
    this.pipeline = await this.device.createRenderPipelineAsync({ label: 'Bloom post process', layout: 'auto',
      vertex: { module: this.module, entryPoint: 'vertex' },
      fragment: { module: this.module, entryPoint: 'fragment', targets: [{ format: this.targetFormat }] },
      primitive: { topology: 'triangle-list' },
    })
  }

  resize(width: number, height: number) {
    if (width === this.width && height === this.height) return
    this.scene?.destroy()
    this.width = width
    this.height = height
    this.scene = this.device.createTexture({ label: 'Scene color', size: [width, height], format: this.sourceFormat, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING })
    this.sceneView = this.scene.createView()
    this.bindGroup = this.device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: this.sampler },
      { binding: 1, resource: this.sceneView },
      { binding: 2, resource: { buffer: this.uniform } },
    ] })
    this.device.queue.writeBuffer(this.uniform, 0, new Float32Array([1 / width, 1 / height, 0, 0]))
  }

  get target() {
    if (!this.sceneView) throw new Error('Post process textures are not initialized.')
    return this.sceneView
  }

  encode(encoder: GPUCommandEncoder, target: GPUTextureView) {
    const pass = encoder.beginRenderPass({ label: 'Bloom composite', colorAttachments: [{ view: target, clearValue: { r: 0.55, g: 0.44, b: 0.29, a: 1 }, loadOp: 'clear', storeOp: 'store' }] })
    pass.setPipeline(this.pipeline)
    pass.setBindGroup(0, this.bindGroup)
    pass.draw(3)
    pass.end()
  }

  dispose() { this.scene?.destroy(); this.uniform.destroy() }
}
