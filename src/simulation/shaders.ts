export const simulationShader = `
struct Params {
  grid: vec4f,
  physics: vec4f,
  start: vec4f,
  end: vec4f,
}
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> source: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> destination: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> flux: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> exchange: array<atomic<i32>>;

fn hash(position: vec2f) -> f32 {
  return fract(sin(dot(position, vec2f(127.1, 311.7))) * 43758.5453);
}
fn address(cell: vec2i) -> u32 {
  let bounded = clamp(cell, vec2i(0), vec2i(i32(params.grid.x) - 1));
  return u32(bounded.y) * u32(params.grid.x) + u32(bounded.x);
}
fn location(cell: vec2i) -> vec2f {
  return (vec2f(cell) + 0.5) * params.grid.y - params.grid.z * 0.5;
}
fn pressureAt(position: vec2f) -> f32 {
  let segment = params.end.xy - params.start.xy;
  let along = clamp(dot(position - params.start.xy, segment) / max(dot(segment, segment), 1e-10), 0.0, 1.0);
  let distance = length(position - params.start.xy - along * segment) / params.start.z;
  let shape = max(0.0, 1.0 - distance * distance);
  return shape * shape * params.start.w * params.end.z;
}
@compute @workgroup_size(8, 8)
fn initialize(@builtin(global_invocation_id) invocation: vec3u) {
  if (any(invocation.xy >= vec2u(u32(params.grid.x)))) { return; }
  let cell = vec2i(invocation.xy);
  let position = location(cell);
  let height = params.physics.x + 0.00015 * (hash(vec2f(cell)) - 0.5)
    + 0.0004 * sin(position.x * 31.0 + sin(position.y * 23.0)) * sin(position.y * 27.0);
  destination[address(cell)] = vec4f(height, 0.0, 0.0, 0.0);
}
@compute @workgroup_size(8, 8)
fn transport(@builtin(global_invocation_id) invocation: vec3u) {
  if (any(invocation.xy >= vec2u(u32(params.grid.x)))) { return; }
  let cell = vec2i(invocation.xy);
  let center = source[address(cell)];
  let pressure = pressureAt(location(cell));
  let effectiveHeight = center.x + pressure;
  let offsets = array<vec2i, 4>(vec2i(-1, 0), vec2i(1, 0), vec2i(0, -1), vec2i(0, 1));
  var outgoing = vec4f(0.0);
  for (var axis = 0u; axis < 4u; axis++) {
    let neighbor = cell + offsets[axis];
    if (any(neighbor < vec2i(0)) || any(neighbor >= vec2i(i32(params.grid.x)))) { continue; }
    let other = source[address(neighbor)];
    let otherPressure = pressureAt(location(neighbor));
    let friction = mix(params.physics.z, params.physics.w, clamp(max(center.y, other.y) * 35.0, 0.0, 1.0));
    let threshold = friction * params.grid.y * select(1.0, 0.08, max(pressure, otherPressure) > 0.0001);
    outgoing[axis] = max(0.0, effectiveHeight - other.x - otherPressure - threshold) * params.grid.w * params.end.w;
  }
  let total = dot(outgoing, vec4f(1.0));
  let available = max(0.0, center.x - params.physics.y);
  flux[address(cell)] = outgoing * min(1.0, available / max(total, 1e-10));
}
@compute @workgroup_size(8, 8)
fn integrate(@builtin(global_invocation_id) invocation: vec3u) {
  if (any(invocation.xy >= vec2u(u32(params.grid.x)))) { return; }
  let cell = vec2i(invocation.xy);
  let index = address(cell);
  let current = source[index];
  let outgoing = flux[index];
  var incoming = vec4f(0.0);
  if (cell.x > 0) { incoming.x = flux[address(cell + vec2i(-1, 0))].y; }
  if (cell.x < i32(params.grid.x) - 1) { incoming.y = flux[address(cell + vec2i(1, 0))].x; }
  if (cell.y > 0) { incoming.z = flux[address(cell + vec2i(0, -1))].w; }
  if (cell.y < i32(params.grid.x) - 1) { incoming.w = flux[address(cell + vec2i(0, 1))].z; }
  let transferred = f32(atomicExchange(&exchange[index], 0)) * 1e-9;
  let height = current.x + dot(incoming - outgoing, vec4f(1.0)) + transferred;
  let moved = dot(incoming + outgoing, vec4f(1.0));
  let activity = max(current.y * exp(-params.grid.w * 10.0), moved / params.grid.w);
  let velocity = vec2f(outgoing.y - outgoing.x + incoming.x - incoming.y,
    outgoing.w - outgoing.z + incoming.z - incoming.w) * params.grid.y / max(height * params.grid.w, 1e-7);
  destination[index] = vec4f(height, activity, mix(current.zw, velocity, 0.4));
}
`;

export const particleShader = `
struct Params { grid: vec4f, physics: vec4f, start: vec4f, end: vec4f }
struct Grain { position: vec4f, velocity: vec4f }
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> bed: array<vec4f>;
@group(0) @binding(2) var<storage, read> flux: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> grains: array<Grain>;
@group(0) @binding(4) var<storage, read_write> exchange: array<atomic<i32>>;
fn random(seed: u32) -> f32 {
  var value = seed * 747796405u + 2891336453u;
  value = ((value >> ((value >> 28u) + 4u)) ^ value) * 277803737u;
  return f32((value >> 22u) ^ value) / 4294967295.0;
}
fn address(position: vec2f) -> u32 {
  let cell = vec2u(clamp((position / params.grid.z + 0.5) * params.grid.x, vec2f(0.0), vec2f(params.grid.x - 1.0)));
  return cell.y * u32(params.grid.x) + cell.x;
}
@compute @workgroup_size(64)
fn animate(@builtin(global_invocation_id) invocation: vec3u) {
  let index = invocation.x;
  if (index >= arrayLength(&grains)) { return; }
  var grain = grains[index];
  if (grain.position.w > 0.0) {
    grain.velocity.y -= 9.81 * params.grid.w;
    grain.position = vec4f(grain.position.xyz + grain.velocity.xyz * params.grid.w, grain.position.w);
    grain.velocity.w += params.grid.w;
    let limit = params.grid.z * 0.5 - params.grid.y;
    grain.position.x = clamp(grain.position.x, -limit, limit);
    grain.position.z = clamp(grain.position.z, -limit, limit);
    let cell = address(grain.position.xz);
    if (grain.position.y <= bed[cell].x + 0.00014) {
      if (abs(grain.velocity.y) > 0.08 && grain.velocity.w < 0.22) {
        grain.position.y = bed[cell].x + 0.00018;
        grain.velocity = vec4f(grain.velocity.xyz * vec3f(0.55, -0.22, 0.55), grain.velocity.w);
      } else {
        atomicAdd(&exchange[cell], i32(round(grain.position.w * 1e9)));
        grain.position.w = 0.0;
        grain.velocity.w = 0.0;
      }
    }
  } else {
    let stride = max(1u, u32(params.grid.x * params.grid.x) / arrayLength(&grains));
    grain.velocity.w += 1.0;
    let seed = index * 991u + u32(grain.velocity.w);
    let cell = min(index * stride + u32(grain.velocity.w) % stride, arrayLength(&bed) - 1u);
    let flow = flux[cell];
    let moved = dot(flow, vec4f(1.0));
    let reserve = bed[cell].x - moved - params.physics.y;
    if (moved > 0.00001 && reserve > 0.000008 && random(seed) < 0.18) {
      let position = (vec2f(f32(cell % u32(params.grid.x)), f32(cell / u32(params.grid.x))) + 0.5) * params.grid.y - params.grid.z * 0.5;
      let transport = vec2f(flow.y - flow.x, flow.w - flow.z);
      let direction = transport / max(length(transport), 1e-9);
      let speed = min(0.12, moved / params.grid.w * 8.0);
      grain.position = vec4f(position.x, bed[cell].x + 0.0003, position.y, 0.000004);
      grain.velocity = vec4f(direction.x * speed, 0.035 + random(seed + 7u) * 0.075, direction.y * speed, 0.0);
      atomicSub(&exchange[cell], 4000);
    }
  }
  grains[index] = grain;
}
`;
