import { WetnessField, WETNESS_SIZE } from '../play/wetness'

export class WetSand {
  readonly field = new WetnessField()
  readonly texture: GPUTexture
  readonly uniform: GPUBuffer
  private revision = -1
  private readonly device: GPUDevice
  constructor(device: GPUDevice) {
    this.device = device
    this.texture = device.createTexture({ label: 'Sand moisture', size: [WETNESS_SIZE, WETNESS_SIZE], format: 'r8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST })
    this.uniform = device.createBuffer({ label: 'Water impacts', size: this.field.splashes.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
  }
  update() {
    if (this.revision === this.field.revision) return
    this.revision = this.field.revision
    this.device.queue.writeTexture({ texture: this.texture }, this.field.pixels, { bytesPerRow: WETNESS_SIZE }, [WETNESS_SIZE, WETNESS_SIZE])
    this.device.queue.writeBuffer(this.uniform, 0, this.field.splashes)
  }
  dispose() { this.texture.destroy(); this.uniform.destroy() }
}

export const wetSandShader = `
@group(1) @binding(2) var moisture: texture_2d<f32>;
@group(1) @binding(3) var<uniform> impacts: array<vec4f, 8>;
fn wetnessAt(position: vec2f) -> f32 {
  return textureSampleLevel(moisture, shadowSampler, position / view.grid.y + 0.5, 0.0).r;
}
fn waterSplash(position: vec2f) -> f32 {
  if (view.up.w > 0.5) { return 0.0; }
  var light = 0.0;
  for (var i = 0u; i < 8u; i++) {
    let impact = impacts[i];
    let age = view.right.w - impact.z;
    if (age < 0.0 || age > 0.7) { continue; }
    let distance = length(position - impact.xy);
    let radius = impact.w * (0.08 + age * 1.25);
    let ring = exp(-pow((distance - radius) / 0.00065, 2.0));
    let bead = exp(-pow(distance / 0.0025, 2.0)) * max(0.0, 1.0 - age * 6.0);
    light += (ring * 0.32 + bead * 0.75) * pow(1.0 - age / 0.7, 2.0);
  }
  return min(light, 0.8);
}
`
