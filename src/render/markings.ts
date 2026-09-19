import { SAND } from '../config'
import type { SandCamera } from './camera'

export const INTRO_TITLE = 'Cuteness Impermanence'
export function introDepth(elapsed: number) {
  if (elapsed < 0 || elapsed >= 7500) return 0
  const t = Math.min(1, Math.max(0, (elapsed - 4000) / 3500))
  return 1 - t * t * (3 - 2 * t)
}

// Shallow relief is lit with the sand's own normals, grains and material. These
// inscriptions live outside the mutable bed: the cog survives every reset, while
// the opening title loses its depth exactly once per launch.
export class SandMarkings {
  readonly texture: GPUTexture
  readonly uniform: GPUBuffer
  private readonly device: GPUDevice
  private readonly data = new Float32Array(12)
  private startedAt = Infinity
  private finished = false
  private reducedMotion = false

  constructor(device: GPUDevice) {
    this.device = device
    this.texture = device.createTexture({ label: 'Sand lettering mask', size: [1024, 256], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST })
    this.uniform = device.createBuffer({ label: 'Sand inscription layout', size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
  }

  async initialize() {
    if (typeof document !== 'undefined') {
      const handwriting = new FontFace('PinkuHand', `url(${import.meta.env.BASE_URL}fonts/caveat.ttf)`, { weight: '400 700' })
      await handwriting.load()
      document.fonts.add(handwriting)
      const canvas = document.createElement('canvas')
      canvas.width = 1024; canvas.height = 256
      const context = canvas.getContext('2d')!
      context.fillStyle = 'white'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.font = '500 126px PinkuHand'
      context.fillText('Cuteness', 498, 63, 950)
      context.font = '500 126px PinkuHand'
      context.fillText('Impermanence', 524, 178, 950)
      this.device.queue.writeTexture({ texture: this.texture }, context.getImageData(0, 0, 1024, 256).data, { bytesPerRow: 4096 }, [1024, 256])
    }
  }

  layout(camera: SandCamera, width: number, height: number, cogX: number, cogY: number) {
    const titleWidth = Math.min(width * 0.82, 620)
    const centerY = height * 0.36
    const left = camera.screenToBed((width - titleWidth) / 2, centerY - titleWidth / 8, width, height)
    const right = camera.screenToBed((width + titleWidth) / 2, centerY + titleWidth / 8, width, height)
    const cog = camera.screenToBed(cogX, cogY, width, height)
    const edge = camera.screenToBed(cogX + 20, cogY, width, height)
    this.data.set([left.x, left.y, right.x - left.x, right.y - left.y, cog.x, cog.y, Math.abs(edge.x - cog.x), 1])
  }

  start(now: number, reducedMotion: boolean) { this.startedAt = now; this.reducedMotion = reducedMotion }
  dismiss() { this.finished = true }
  update(now: number) {
    const elapsed = now - this.startedAt
    this.data[8] = this.finished ? 0 : this.reducedMotion ? Number(elapsed >= 0 && elapsed < 6000) : introDepth(elapsed)
    this.data[9] = SAND.extent
    this.device.queue.writeBuffer(this.uniform, 0, this.data)
  }
  dispose() { this.texture.destroy(); this.uniform.destroy() }
}

export const markingsShader = `
struct Markings { title: vec4f, cog: vec4f, timing: vec4f }
@group(1) @binding(0) var<uniform> markings: Markings;
@group(1) @binding(1) var lettering: texture_2d<f32>;
fn letterMask(position: vec2f) -> f32 {
  if (markings.timing.x <= 0.0 || markings.title.z <= 0.0) { return 0.0; }
  let uv = (position - markings.title.xy) / markings.title.zw;
  if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) { return 0.0; }
  let texel = uv * vec2f(1024.0, 256.0) - 0.5;
  let base = vec2i(floor(texel));
  let blend = fract(texel);
  let a = textureLoad(lettering, clamp(base, vec2i(0), vec2i(1023, 255)), 0).a;
  let b = textureLoad(lettering, clamp(base + vec2i(1, 0), vec2i(0), vec2i(1023, 255)), 0).a;
  let c = textureLoad(lettering, clamp(base + vec2i(0, 1), vec2i(0), vec2i(1023, 255)), 0).a;
  let d = textureLoad(lettering, clamp(base + vec2i(1, 1), vec2i(0), vec2i(1023, 255)), 0).a;
  return mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y) * markings.timing.x;
}
fn cogMask(position: vec2f) -> f32 {
  if (markings.cog.w <= 0.0 || markings.cog.z <= 0.0) { return 0.0; }
  let local = (position - markings.cog.xy) / markings.cog.z;
  let radius = length(local);
  if (radius > 1.1 || radius < 0.28) { return 0.0; }
  let angle = atan2(local.y, local.x);
  let teeth = smoothstep(0.0, 0.45, cos(angle * 8.0));
  let edge = 0.77 + teeth * 0.23;
  return (1.0 - smoothstep(edge - 0.055, edge + 0.025, radius)) * smoothstep(0.30, 0.38, radius);
}
fn inscriptionDepth(position: vec2f) -> f32 {
  return -0.0010 * letterMask(position) - 0.00095 * cogMask(position);
}
`
