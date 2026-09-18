import { waveShoreWgsl } from '../reset/wgsl'

export const waveResetShader = `
${waveShoreWgsl}
struct ResetParams {
  grid: vec4f,
  wave: vec4f,
}
@group(0) @binding(0) var<uniform> params: ResetParams;
@group(0) @binding(1) var<storage, read_write> state: array<vec4f>;

fn hash(position: vec2f) -> f32 {
  return fract(sin(dot(position, vec2f(127.1, 311.7))) * 43758.5453);
}
fn address(cell: vec2u) -> u32 {
  return cell.y * u32(params.grid.x) + cell.x;
}
fn location(cell: vec2u) -> vec2f {
  return (vec2f(cell) + 0.5) * params.grid.y - params.grid.z * 0.5;
}
fn initialHeight(position: vec2f, cell: vec2u) -> f32 {
  return params.grid.w + 0.00015 * (hash(vec2f(cell)) - 0.5)
    + 0.0004 * sin(position.x * 31.0 + sin(position.y * 23.0)) * sin(position.y * 27.0);
}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) invocation: vec3u) {
  if (any(invocation.xy >= vec2u(u32(params.grid.x)))) { return; }
  let position = location(invocation.xy);
  let previousFront = shorelineFront(position.x, params.wave.x, params.wave.z);
  let currentFront = shorelineFront(position.x, params.wave.y, params.wave.w);
  let coveredBefore = position.y >= previousFront;
  let coveredNow = position.y >= currentFront;
  if (!coveredNow || coveredBefore) { return; }
  state[address(invocation.xy)] = vec4f(initialHeight(position, invocation.xy), 0.0, 0.0, 0.0);
}
`
