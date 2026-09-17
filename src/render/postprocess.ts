const legacyEncodeShader = `
@group(0) @binding(0) var sourceTexture: texture_2d<f32>;
struct VertexOutput { @builtin(position) clip: vec4f }
@vertex fn vertex(@builtin(vertex_index) index: u32) -> VertexOutput {
  let positions = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var output: VertexOutput;
  output.clip = vec4f(positions[index], 0.0, 1.0);
  return output;
}
fn toneMap(color: vec3f) -> vec3f {
  return clamp((color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14), vec3f(0.0), vec3f(1.0));
}
fn toSrgb(color: vec3f) -> vec3f {
  return select(color * 12.92, 1.055 * pow(max(color, vec3f(0.0)), vec3f(1.0 / 2.4)) - 0.055, color > vec3f(0.0031308));
}
@fragment fn fragment(input: VertexOutput) -> @location(0) vec4f {
  let pixel = vec2i(input.clip.xy);
  let radiance = textureLoad(sourceTexture, pixel, 0).rgb;
  return vec4f(toSrgb(toneMap(radiance)), 1.0);
}
`

const postShader = `
struct PostView { texel: vec4f }
@group(0) @binding(0) var postSampler: sampler;
@group(0) @binding(1) var sourceTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> postView: PostView;
@group(0) @binding(3) var glintTexture: texture_2d<f32>;
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
fn filmicGrade(color: vec3f, uv: vec2f) -> vec3f {
  let sourceLuma = max(luminance(color), 0.0001);
  let contrastCurve = sourceLuma * sourceLuma * (3.0 - 2.0 * sourceLuma);
  let gradedLuma = mix(sourceLuma, contrastCurve, 0.24);
  var graded = color * (gradedLuma / sourceLuma);

  let gradedGray = vec3f(luminance(graded));
  graded = mix(gradedGray, graded, 0.95);

  let mood = smoothstep(0.12, 0.86, gradedLuma);
  let shadowTone = vec3f(0.965, 0.985, 1.025);
  let highlightTone = vec3f(1.035, 1.005, 0.955);
  graded *= mix(shadowTone, highlightTone, mood);

  let centered = uv * 2.0 - 1.0;
  let vignette = 1.0 - smoothstep(0.36, 1.18, dot(centered, centered)) * 0.10;
  graded *= vignette;
  return clamp(graded, vec3f(0.0), vec3f(1.0));
}
@fragment fn fragment(input: VertexOutput) -> @location(0) vec4f {
  let texel = postView.texel.xy;
  let viewport = max(postView.texel.zw, vec2f(1.0));
  let portraitTame = 1.0 - smoothstep(0.70, 1.10, viewport.x / viewport.y);
  let glintTexel = texel * mix(1.0, 0.58, portraitTame);
  let glintGain = mix(1.0, 0.62, portraitTame);
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
  let bloomed = clamp(base + bloom * 2.15, vec3f(0.0), vec3f(1.0));
  let color = filmicGrade(bloomed, input.uv);

  let glintCenter = textureSample(glintTexture, postSampler, input.uv).r * glintGain;

  let hx1p = textureSample(glintTexture, postSampler, input.uv + vec2f(glintTexel.x, 0.0)).r * glintGain;
  let hx1m = textureSample(glintTexture, postSampler, input.uv - vec2f(glintTexel.x, 0.0)).r * glintGain;
  let hy1p = textureSample(glintTexture, postSampler, input.uv + vec2f(0.0, glintTexel.y)).r * glintGain;
  let hy1m = textureSample(glintTexture, postSampler, input.uv - vec2f(0.0, glintTexel.y)).r * glintGain;
  let hx2p = textureSample(glintTexture, postSampler, input.uv + vec2f(glintTexel.x * 2.0, 0.0)).r * glintGain;
  let hx2m = textureSample(glintTexture, postSampler, input.uv - vec2f(glintTexel.x * 2.0, 0.0)).r * glintGain;
  let hy2p = textureSample(glintTexture, postSampler, input.uv + vec2f(0.0, glintTexel.y * 2.0)).r * glintGain;
  let hy2m = textureSample(glintTexture, postSampler, input.uv - vec2f(0.0, glintTexel.y * 2.0)).r * glintGain;
  let hx3p = textureSample(glintTexture, postSampler, input.uv + vec2f(glintTexel.x * 3.0, 0.0)).r * glintGain;
  let hx3m = textureSample(glintTexture, postSampler, input.uv - vec2f(glintTexel.x * 3.0, 0.0)).r * glintGain;
  let hy3p = textureSample(glintTexture, postSampler, input.uv + vec2f(0.0, glintTexel.y * 3.0)).r * glintGain;
  let hy3m = textureSample(glintTexture, postSampler, input.uv - vec2f(0.0, glintTexel.y * 3.0)).r * glintGain;
  let hx4p = textureSample(glintTexture, postSampler, input.uv + vec2f(glintTexel.x * 4.5, 0.0)).r * glintGain;
  let hx4m = textureSample(glintTexture, postSampler, input.uv - vec2f(glintTexel.x * 4.5, 0.0)).r * glintGain;
  let hy4p = textureSample(glintTexture, postSampler, input.uv + vec2f(0.0, glintTexel.y * 4.5)).r * glintGain;
  let hy4m = textureSample(glintTexture, postSampler, input.uv - vec2f(0.0, glintTexel.y * 4.5)).r * glintGain;

  let d11 = textureSample(glintTexture, postSampler, input.uv + glintTexel).r * glintGain;
  let d12 = textureSample(glintTexture, postSampler, input.uv + vec2f(-glintTexel.x, glintTexel.y)).r * glintGain;
  let d13 = textureSample(glintTexture, postSampler, input.uv + vec2f(glintTexel.x, -glintTexel.y)).r * glintGain;
  let d14 = textureSample(glintTexture, postSampler, input.uv - glintTexel).r * glintGain;
  let d21 = textureSample(glintTexture, postSampler, input.uv + glintTexel * 2.0).r * glintGain;
  let d22 = textureSample(glintTexture, postSampler, input.uv + vec2f(-glintTexel.x * 2.0, glintTexel.y * 2.0)).r * glintGain;
  let d23 = textureSample(glintTexture, postSampler, input.uv + vec2f(glintTexel.x * 2.0, -glintTexel.y * 2.0)).r * glintGain;
  let d24 = textureSample(glintTexture, postSampler, input.uv - glintTexel * 2.0).r * glintGain;
  let d31 = textureSample(glintTexture, postSampler, input.uv + glintTexel * 3.0).r * glintGain;
  let d32 = textureSample(glintTexture, postSampler, input.uv + vec2f(-glintTexel.x * 3.0, glintTexel.y * 3.0)).r * glintGain;
  let d33 = textureSample(glintTexture, postSampler, input.uv + vec2f(glintTexel.x * 3.0, -glintTexel.y * 3.0)).r * glintGain;
  let d34 = textureSample(glintTexture, postSampler, input.uv - glintTexel * 3.0).r * glintGain;

  let crossTight = (hx1p + hx1m + hy1p + hy1m) * 0.20
    + (hx2p + hx2m + hy2p + hy2m) * 0.14
    + (hx3p + hx3m + hy3p + hy3m) * 0.09;
  let crossSoft = (hx1p + hx1m + hy1p + hy1m) * 0.18
    + (hx2p + hx2m + hy2p + hy2m) * 0.17
    + (hx3p + hx3m + hy3p + hy3m) * 0.13
    + (hx4p + hx4m + hy4p + hy4m) * 0.08;
  let diagonal = (d11 + d12 + d13 + d14) * 0.14
    + (d21 + d22 + d23 + d24) * 0.11
    + (d31 + d32 + d33 + d34) * 0.08;
  let star = crossTight + diagonal * 0.55;
  let smear = crossSoft * 0.56 + diagonal * 0.48;

  // Shape the glint as a softer optical reflection: a hot center, short
  // streak-like structure, and a broader smeared glow rather than a hard dot.
  let coreMask = smoothstep(0.010, 0.038, glintCenter);
  let streakMask = smoothstep(0.010, 0.080, star + glintCenter * 0.18);
  let smearMask = smoothstep(0.008, 0.070, smear + glintCenter * 0.22);
  let warmWhite = vec3f(1.0, 0.998, 0.988);
  let solarTint = vec3f(1.0, 0.992, 0.95);
  var composite = color + solarTint * smear * mix(0.16, 0.08, portraitTame);
  composite += warmWhite * star * mix(0.10, 0.05, portraitTame);
  composite = mix(composite, warmWhite, coreMask * mix(0.82, 0.50, portraitTame));
  composite += solarTint * streakMask * mix(0.07, 0.035, portraitTame);
  composite += vec3f(1.0, 0.99, 0.94) * smearMask * mix(0.06, 0.03, portraitTame);
  return vec4f(clamp(composite, vec3f(0.0), vec3f(1.0)), 1.0);
}
`

export const HDR_SCENE_FORMAT: GPUTextureFormat = 'rgba16float'
export const GLINT_FORMAT: GPUTextureFormat = 'r16float'

export class SandPostProcess {
  private readonly uniform: GPUBuffer
  private readonly sampler: GPUSampler
  private readonly legacyEncodeModule: GPUShaderModule
  private readonly postModule: GPUShaderModule
  private legacyEncodePipeline!: GPURenderPipeline
  private postPipeline!: GPURenderPipeline
  private legacyEncodeGroup!: GPUBindGroup
  private postGroup!: GPUBindGroup
  private hdrScene?: GPUTexture
  private hdrSceneView?: GPUTextureView
  private glintScene?: GPUTexture
  private glintSceneView?: GPUTextureView
  private legacyScene?: GPUTexture
  private legacySceneView?: GPUTextureView
  private width = 0
  private height = 0

  private readonly device: GPUDevice
  private readonly legacyFormat: GPUTextureFormat
  private readonly targetFormat: GPUTextureFormat

  constructor(device: GPUDevice, legacyFormat: GPUTextureFormat, targetFormat: GPUTextureFormat) {
    this.device = device
    this.legacyFormat = legacyFormat
    this.targetFormat = targetFormat
    this.uniform = device.createBuffer({ label: 'Filmic post uniform', size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    this.sampler = device.createSampler({ label: 'Filmic post sampler', magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' })
    this.legacyEncodeModule = device.createShaderModule({ label: 'Legacy display encode WGSL', code: legacyEncodeShader })
    this.postModule = device.createShaderModule({ label: 'Filmic post WGSL', code: postShader })
  }

  async initialize() {
    [this.legacyEncodePipeline, this.postPipeline] = await Promise.all([
      this.device.createRenderPipelineAsync({ label: 'Legacy display encode', layout: 'auto',
        vertex: { module: this.legacyEncodeModule, entryPoint: 'vertex' },
        fragment: { module: this.legacyEncodeModule, entryPoint: 'fragment', targets: [{ format: this.legacyFormat }] },
        primitive: { topology: 'triangle-list' },
      }),
      this.device.createRenderPipelineAsync({ label: 'Filmic post process', layout: 'auto',
        vertex: { module: this.postModule, entryPoint: 'vertex' },
        fragment: { module: this.postModule, entryPoint: 'fragment', targets: [{ format: this.targetFormat }] },
        primitive: { topology: 'triangle-list' },
      }),
    ])
  }

  resize(width: number, height: number) {
    if (width === this.width && height === this.height) return
    this.hdrScene?.destroy()
    this.glintScene?.destroy()
    this.legacyScene?.destroy()
    this.width = width
    this.height = height
    this.hdrScene = this.device.createTexture({ label: 'Linear HDR scene color', size: [width, height], format: HDR_SCENE_FORMAT, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING })
    this.hdrSceneView = this.hdrScene.createView()
    this.glintScene = this.device.createTexture({ label: 'Reflective mineral HDR glints', size: [width, height], format: GLINT_FORMAT, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING })
    this.glintSceneView = this.glintScene.createView()
    this.legacyScene = this.device.createTexture({ label: 'Legacy display scene color', size: [width, height], format: this.legacyFormat, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING })
    this.legacySceneView = this.legacyScene.createView()
    this.legacyEncodeGroup = this.device.createBindGroup({ layout: this.legacyEncodePipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: this.hdrSceneView },
    ] })
    this.postGroup = this.device.createBindGroup({ layout: this.postPipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: this.sampler },
      { binding: 1, resource: this.legacySceneView },
      { binding: 2, resource: { buffer: this.uniform } },
      { binding: 3, resource: this.glintSceneView },
    ] })
    this.device.queue.writeBuffer(this.uniform, 0, new Float32Array([1 / width, 1 / height, width, height]))
  }

  get target() {
    if (!this.hdrSceneView) throw new Error('Post process textures are not initialized.')
    return this.hdrSceneView
  }

  get glintTarget() {
    if (!this.glintSceneView) throw new Error('Post process textures are not initialized.')
    return this.glintSceneView
  }

  encode(encoder: GPUCommandEncoder, target: GPUTextureView) {
    if (!this.legacySceneView) throw new Error('Post process textures are not initialized.')
    const encodePass = encoder.beginRenderPass({ label: 'Legacy display encode', colorAttachments: [{ view: this.legacySceneView, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0.55, g: 0.44, b: 0.29, a: 1 } }] })
    encodePass.setPipeline(this.legacyEncodePipeline)
    encodePass.setBindGroup(0, this.legacyEncodeGroup)
    encodePass.draw(3)
    encodePass.end()

    const postPass = encoder.beginRenderPass({ label: 'Filmic composite', colorAttachments: [{ view: target, clearValue: { r: 0.55, g: 0.44, b: 0.29, a: 1 }, loadOp: 'clear', storeOp: 'store' }] })
    postPass.setPipeline(this.postPipeline)
    postPass.setBindGroup(0, this.postGroup)
    postPass.draw(3)
    postPass.end()
  }

  dispose() { this.hdrScene?.destroy(); this.glintScene?.destroy(); this.legacyScene?.destroy(); this.uniform.destroy() }
}
