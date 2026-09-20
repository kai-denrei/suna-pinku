import { JewelCollection, MAX_JEWELS } from '../play/jewels'
import { checkedShader } from '../platform/shader'
import type { SandSolver } from '../simulation/solver'
import { jewelMeshes } from './jewel-meshes'
import { GLINT_FORMAT, HDR_SCENE_FORMAT } from './postprocess'

export const jewelShader = `
struct View { eye: vec4f, forward: vec4f, right: vec4f, up: vec4f, light: vec4f, grid: vec4f, pointer: vec4f, shadowBounds: vec4f, control: vec4f }
struct Jewel { placement: vec4f, color: vec4f, detail: vec4f }
@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var<storage, read> bed: array<vec4f>;
@group(0) @binding(2) var<storage, read> jewels: array<Jewel>;
fn heightAt(point: vec2f) -> f32 {
  let cell = vec2u(clamp((point / view.grid.y + 0.5) * view.grid.x, vec2f(0.0), vec2f(view.grid.x - 1.0)));
  return bed[cell.y * u32(view.grid.x) + cell.x].x;
}
fn baseHeight(jewel: Jewel) -> f32 {
  let p = jewel.placement.xy;
  let r = jewel.placement.z * 0.6;
  let support = (heightAt(p + vec2f(r, 0.0)) + heightAt(p - vec2f(r, 0.0)) + heightAt(p + vec2f(0.0, r)) + heightAt(p - vec2f(0.0, r))) * 0.25;
  let age = max(0.0, view.right.w - jewel.detail.y);
  let fall = max(0.0, 0.045 - 0.9 * age * age);
  let lift = select(fall, 0.025, jewel.detail.z > 0.5);
  return mix(heightAt(p), support, 0.35) - 0.0015 + select(lift, 0.0, view.up.w > 0.5);
}
fn project(position: vec3f) -> vec4f {
  let relative = position - view.eye.xyz;
  let depth = dot(relative, view.forward.xyz);
  return vec4f(dot(relative, view.right.xyz) / (view.eye.w * view.forward.w), dot(relative, view.up.xyz) / view.eye.w, depth * 1.001001 - 0.01001001, depth);
}
fn rotate(vector: vec3f, angle: f32) -> vec3f {
  let c = cos(angle); let s = sin(angle);
  return vec3f(vector.x * c - vector.z * s, vector.y, vector.x * s + vector.z * c);
}
struct Vertex { @builtin(position) clip: vec4f, @location(0) world: vec3f, @location(1) normal: vec3f, @location(2) color: vec4f, @location(3) seed: f32 }
@vertex fn vertex(@location(0) position: vec3f, @location(1) normal: vec3f, @builtin(instance_index) index: u32) -> Vertex {
  let jewel = jewels[index];
  let world = vec3f(jewel.placement.x, baseHeight(jewel), jewel.placement.y) + rotate(position * jewel.placement.z, jewel.placement.w);
  return Vertex(project(world), world, rotate(normal, jewel.placement.w), jewel.color, jewel.detail.x);
}
struct Output { @location(0) color: vec4f, @location(1) glint: f32 }
@fragment fn fragment(input: Vertex, @builtin(front_facing) front: bool) -> Output {
  let normal = normalize(input.normal) * select(-1.0, 1.0, front);
  let light = normalize(view.light.xyz);
  let eye = normalize(view.eye.xyz - input.world);
  let halfVector = normalize(light + eye);
  let diffuse = max(0.0, dot(normal, light));
  let fresnel = pow(1.0 - max(0.0, dot(normal, eye)), 4.0);
  let pearl = input.color.w > 2.5;
  let specular = pow(max(0.0, dot(normal, halfVector)), select(85.0, 42.0, pearl));
  let reflection = reflect(-eye, normal);
  let studioBand = pow(max(0.0, 1.0 - abs(reflection.x + reflection.z * 0.25)), 20.0);
  let iridescence = vec3f(0.88 + 0.12 * sin(normal.x * 6.0), 0.77 + 0.18 * sin(normal.y * 6.0 + 2.0), 1.0);
  let body = input.color.rgb * (0.24 + diffuse * 1.2);
  let transmitted = input.color.rgb * pow(max(0.0, dot(-normal, light)), 2.0) * 0.3;
  let color = (body + transmitted) * select(vec3f(1.0), iridescence, pearl)
    + vec3f(1.0, 0.88, 0.97) * (specular * 3.5 + studioBand * 0.42 + fresnel * 0.48);
  return Output(vec4f(color, 1.0), specular * 0.55);
}
struct Quad { @builtin(position) clip: vec4f, @location(0) uv: vec2f, @location(1) intensity: f32 }
fn corner(index: u32) -> vec2f {
  let points = array<vec2f, 6>(vec2f(-1.0,-1.0), vec2f(1.0,-1.0), vec2f(-1.0,1.0), vec2f(-1.0,1.0), vec2f(1.0,-1.0), vec2f(1.0,1.0));
  return points[index];
}
@vertex fn shadowVertex(@builtin(vertex_index) index: u32, @builtin(instance_index) instance: u32) -> Quad {
  let jewel = jewels[instance];
  let uv = corner(index);
  let point = jewel.placement.xy + (uv * 1.35 + vec2f(-0.17, 0.17)) * jewel.placement.z;
  let world = vec3f(point.x, heightAt(point) + 0.00018, point.y);
  return Quad(project(world), uv, 1.0);
}
@fragment fn shadowFragment(input: Quad) -> Output {
  let alpha = exp(-dot(input.uv, input.uv) * 3.6) * 0.30;
  return Output(vec4f(vec3f(0.10, 0.015, 0.055) * alpha, alpha), 0.0);
}
@vertex fn sparkleVertex(@builtin(vertex_index) index: u32, @builtin(instance_index) instance: u32) -> Quad {
  let jewel = jewels[instance];
  let uv = corner(index);
  let phase = view.right.w * 1.8 + jewel.detail.x * 2.4;
  let pulse = select(0.25 + 0.75 * pow(0.5 + 0.5 * sin(phase), 6.0), 0.42, view.up.w > 0.5);
  let elevation = select(select(1.03, 0.58, jewel.color.w > 0.5), 1.70, jewel.color.w > 2.5);
  let center = vec3f(jewel.placement.x - jewel.placement.z * 0.20, baseHeight(jewel) + jewel.placement.z * elevation, jewel.placement.y);
  let world = center + (view.right.xyz * uv.x + view.up.xyz * uv.y) * jewel.placement.z * (0.32 + pulse * 0.4);
  return Quad(project(world), uv, pulse);
}
@fragment fn sparkleFragment(input: Quad) -> Output {
  let uv = abs(input.uv);
  let falloff = pow(max(0.0, 1.0 - max(uv.x, uv.y)), 1.8);
  let crossLight = exp(-min(uv.x, uv.y) * 35.0) * falloff;
  let core = exp(-dot(uv, uv) * 65.0);
  let alpha = clamp((crossLight + core) * input.intensity, 0.0, 1.0);
  if (alpha < 0.005) { discard; }
  return Output(vec4f(vec3f(3.0, 2.5, 2.1) * alpha, alpha), alpha * 1.4);
}
`

export class JewelRenderer {
  private readonly device: GPUDevice
  private readonly solver: SandSolver
  private readonly collection: JewelCollection
  private readonly uniform: GPUBuffer
  private readonly instances: GPUBuffer
  private readonly meshes: { buffer: GPUBuffer; count: number }[]
  private pipelines!: { solid: GPURenderPipeline; shadow: GPURenderPipeline; sparkle: GPURenderPipeline }
  private groups: GPUBindGroup[] = []
  private revision = -1
  private ranges: { first: number; count: number }[] = []
  private readonly data = new Float32Array(MAX_JEWELS * 12)

  constructor(device: GPUDevice, solver: SandSolver, collection: JewelCollection, uniform: GPUBuffer) {
    this.device = device; this.solver = solver; this.collection = collection; this.uniform = uniform
    this.instances = device.createBuffer({ label: 'Kira kira instances', size: this.data.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })
    this.meshes = jewelMeshes().map(data => {
      const buffer = device.createBuffer({ label: 'Kira kira mesh', size: data.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST })
      device.queue.writeBuffer(buffer, 0, data)
      return { buffer, count: data.length / 6 }
    })
  }
  async initialize() {
    const module = await checkedShader(this.device, 'Kira kira jewels', jewelShader)
    const layout = this.device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
    ] })
    const pipelineLayout = this.device.createPipelineLayout({ bindGroupLayouts: [layout] })
    const blend: GPUBlendState = { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } }
    const make = (vertex: string, fragment: string, solid: boolean) => this.device.createRenderPipelineAsync({
      label: `Kira kira ${fragment}`, layout: pipelineLayout,
      vertex: { module, entryPoint: vertex, buffers: solid ? [{ arrayStride: 24, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }] }] : [] },
      fragment: { module, entryPoint: fragment, targets: [{ format: HDR_SCENE_FORMAT, ...(solid ? {} : { blend }) }, { format: GLINT_FORMAT, ...(solid ? {} : { blend: { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } } as GPUBlendState }) }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' }, depthStencil: { format: 'depth24plus', depthWriteEnabled: solid, depthCompare: 'less-equal' },
    })
    const [solid, shadow, sparkle] = await Promise.all([make('vertex', 'fragment', true), make('shadowVertex', 'shadowFragment', false), make('sparkleVertex', 'sparkleFragment', false)])
    this.pipelines = { solid, shadow, sparkle }
    this.groups = this.solver.buffers.map(buffer => this.device.createBindGroup({ layout, entries: [
      { binding: 0, resource: { buffer: this.uniform } }, { binding: 1, resource: { buffer } }, { binding: 2, resource: { buffer: this.instances } },
    ] }))
  }
  private sync() {
    if (this.revision === this.collection.revision) return
    this.revision = this.collection.revision
    let index = 0
    this.ranges = this.meshes.map((_, kind) => {
      const first = index
      for (const jewel of this.collection.items.filter(item => item.preset.kind === kind)) {
        this.data.set([jewel.position.x, jewel.position.y, jewel.size, jewel.rotation, ...jewel.preset.color, kind, jewel.id, jewel.droppedAt, jewel.held ? 1 : 0, 0], index++ * 12)
      }
      return { first, count: index - first }
    })
    if (index) this.device.queue.writeBuffer(this.instances, 0, this.data, 0, index * 12)
  }
  draw(pass: GPURenderPassEncoder) {
    if (!this.collection.items.length) return
    this.sync()
    pass.setBindGroup(0, this.groups[this.solver.stateIndex])
    pass.setPipeline(this.pipelines.shadow)
    pass.draw(6, this.collection.items.length)
    pass.setPipeline(this.pipelines.solid)
    this.ranges.forEach((range, kind) => {
      if (!range.count) return
      pass.setVertexBuffer(0, this.meshes[kind].buffer)
      pass.draw(this.meshes[kind].count, range.count, 0, range.first)
    })
    pass.setPipeline(this.pipelines.sparkle)
    pass.draw(6, this.collection.items.length)
  }
  dispose() { this.instances.destroy(); this.meshes.forEach(mesh => mesh.buffer.destroy()) }
}
