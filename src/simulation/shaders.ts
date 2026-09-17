import { fluxLayout } from './flux'

export const simulationShader = `
${fluxLayout}
struct Params {
  grid: vec4f,
  physics: vec4f,
  start: vec4f,
  end: vec4f,
  motion: vec4f,
}
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> source: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> destination: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> flux: array<Flux>;
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
fn toolAt(position: vec2f) -> vec4f {
  let segment = params.end.xy - params.start.xy;
  let along = clamp(dot(position - params.start.xy, segment) / max(dot(segment, segment), 1e-10), 0.0, 1.0);
  let offset = position - params.start.xy - along * segment;
  let distance = length(offset) / params.start.z;
  let envelope = max(0.0, 1.0 - distance * distance);
  let coverage = envelope * envelope;
  let contactEnabled = select(0.0, 1.0, params.start.w > 0.0);
  let activeCoverage = coverage * contactEnabled;
  return vec4f(activeCoverage * params.start.w * params.end.z, activeCoverage, offset);
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
  let position = location(cell);
  let center = source[address(cell)];
  let contact = toolAt(position);
  let effectiveHeight = center.x + contact.x;
  let motionDirection = params.motion.xy / max(params.motion.z, 1e-8);
  let speedResponse = params.motion.z / (params.motion.z + 0.35);
  let contactEnabled = select(0.0, 1.0, params.start.w > 0.0);
  let centerShell = contactEnabled * (1.0 - smoothstep(0.9, 1.55, length(contact.zw) / params.start.z));
  var outgoing = Flux(vec4f(0.0), vec4f(0.0));
  var escape = Flux(vec4f(0.0), vec4f(0.0));
  for (var axis = 0u; axis < 8u; axis++) {
    let neighbor = cell + neighbors[axis];
    if (any(neighbor < vec2i(0)) || any(neighbor >= vec2i(i32(params.grid.x)))) { continue; }
    let other = source[address(neighbor)];
    let otherContact = toolAt(location(neighbor));
    let friction = mix(params.physics.z, params.physics.w, clamp(max(center.y, other.y) * 35.0, 0.0, 1.0));
    let linkLength = select(1.0, 1.41421356, axis >= 4u);
    let weight = select(0.66666667, 0.16666667, axis >= 4u);
    let axisDirection = vec2f(neighbors[axis]) / linkLength;
    let forward = max(0.0, dot(axisDirection, motionDirection));
    let neighborShell = contactEnabled * (1.0 - smoothstep(0.9, 1.55, length(otherContact.zw) / params.start.z));
    let contactYield = max(contact.y, otherContact.y);
    let disturbedShell = max(centerShell, neighborShell);
    let thresholdScale = min(mix(1.0, 0.08, contactYield), mix(1.0, 0.45, disturbedShell));
    let threshold = friction * params.grid.y * linkLength * thresholdScale;
    let excess = max(0.0, effectiveHeight - other.x - otherContact.x - threshold);
    let physicalThreshold = friction * params.grid.y * linkLength * mix(1.0, 0.45, disturbedShell);
    let physicalExcess = max(0.0, center.x - other.x - physicalThreshold);
    let supercritical = smoothstep(params.grid.y * 1.5, params.grid.y * 5.0, physicalExcess);
    let avalancheBoost = 1.0 + supercritical * mix(0.35, 0.85, max(contactYield, disturbedShell));
    var amount = excess * params.grid.w * params.end.w * weight * avalancheBoost;
    amount *= 1.0 + contact.y * speedResponse * forward * 0.55;
    let edge = max(0.0, contact.x - otherContact.x) / max(contact.x, 1e-7);
    let sideways = contact.y * (1.0 - abs(dot(axisDirection, motionDirection))) * 0.06;
    let escapeWeight = (edge + sideways) * (1.0 + speedResponse * forward * 0.8) * weight;
    if (axis < 4u) {
      outgoing.axial[axis] = amount;
      escape.axial[axis] = escapeWeight;
    } else {
      outgoing.diagonal[axis - 4u] = amount;
      escape.diagonal[axis - 4u] = escapeWeight;
    }
  }
  let targetHeight = params.physics.x - contact.x;
  let overlap = max(0.0, center.x - targetHeight);
  let existing = totalFlux(outgoing);
  let escapeTotal = totalFlux(escape);
  let evacuationFraction = mix(0.32, 0.46, speedResponse);
  let extra = max(0.0, overlap * evacuationFraction - existing);
  if (extra > 0.0 && escapeTotal > 1e-8) {
    outgoing.axial += escape.axial * (extra / escapeTotal);
    outgoing.diagonal += escape.diagonal * (extra / escapeTotal);
  }
  let total = totalFlux(outgoing);
  let available = max(0.0, center.x - params.physics.y);
  let limiter = min(1.0, available / max(total, 1e-10));
  flux[address(cell)] = Flux(outgoing.axial * limiter, outgoing.diagonal * limiter);
}
@compute @workgroup_size(8, 8)
fn integrate(@builtin(global_invocation_id) invocation: vec3u) {
  if (any(invocation.xy >= vec2u(u32(params.grid.x)))) { return; }
  let cell = vec2i(invocation.xy);
  let index = address(cell);
  let current = source[index];
  let outgoing = flux[index];
  var incoming = Flux(vec4f(0.0), vec4f(0.0));
  for (var axis = 0u; axis < 8u; axis++) {
    let neighbor = cell + neighbors[axis];
    if (any(neighbor < vec2i(0)) || any(neighbor >= vec2i(i32(params.grid.x)))) { continue; }
    let amount = component(flux[address(neighbor)], axis ^ 1u);
    if (axis < 4u) { incoming.axial[axis] = amount; }
    else { incoming.diagonal[axis - 4u] = amount; }
  }
  let transferred = f32(atomicExchange(&exchange[index], 0)) * 1e-9;
  let height = current.x + totalFlux(incoming) - totalFlux(outgoing) + transferred;
  let moved = totalFlux(incoming) + totalFlux(outgoing);
  let contact = toolAt(location(cell));
  let contactActivity = contact.y * params.start.w * params.motion.z * 0.004;
  let activity = max(max(current.y * exp(-params.grid.w * 10.0), moved / params.grid.w), contactActivity);
  let transportVelocity = (fluxVector(outgoing) - fluxVector(incoming)) * params.grid.y / max(height * params.grid.w, 1e-7);
  let slipCoupling = 0.38 / (1.0 + params.motion.z * 0.30);
  let toolVelocity = params.motion.xy * contact.y * params.start.w * slipCoupling;
  let velocity = transportVelocity + toolVelocity;
  destination[index] = vec4f(height, activity, mix(current.zw, velocity, 0.4));
}
`;

export const particleShader = `
${fluxLayout}
struct Params { grid: vec4f, physics: vec4f, start: vec4f, end: vec4f, motion: vec4f }
struct Grain { position: vec4f, velocity: vec4f }
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> bed: array<vec4f>;
@group(0) @binding(2) var<storage, read> flux: array<Flux>;
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
fn heightAt(cell: vec2i) -> f32 {
  let bounded = vec2u(clamp(cell, vec2i(0), vec2i(i32(params.grid.x) - 1)));
  return bed[bounded.y * u32(params.grid.x) + bounded.x].x;
}
fn contactAt(position: vec2f) -> vec3f {
  let coordinate = (position / params.grid.z + 0.5) * params.grid.x - 0.5;
  let cell = vec2i(floor(coordinate));
  let blend = fract(coordinate);
  let lowerLeft = heightAt(cell);
  let lowerRight = heightAt(cell + vec2i(1, 0));
  let upperLeft = heightAt(cell + vec2i(0, 1));
  let upperRight = heightAt(cell + vec2i(1, 1));
  if (blend.x + blend.y <= 1.0) {
    let gradient = vec2f(lowerRight - lowerLeft, upperLeft - lowerLeft);
    return vec3f(lowerLeft + dot(gradient, blend), gradient / params.grid.y);
  }
  let gradient = vec2f(upperRight - upperLeft, upperRight - lowerRight);
  return vec3f(upperRight + dot(gradient, blend - 1.0), gradient / params.grid.y);
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
    let contact = contactAt(grain.position.xz);
    if (grain.position.y <= contact.x + 0.00014) {
      let normal = normalize(vec3f(-contact.y, 1.0, -contact.z));
      let normalSpeed = dot(grain.velocity.xyz, normal);
      if (normalSpeed < -0.08 && grain.velocity.w < 0.22) {
        grain.position.y = contact.x + 0.00018;
        let tangent = grain.velocity.xyz - normal * normalSpeed;
        let friction = max(0.0, 1.0 - params.physics.w * 1.22 * abs(normalSpeed) / max(length(tangent), 1e-7));
        grain.velocity = vec4f(tangent * friction - normal * normalSpeed * 0.22, grain.velocity.w);
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
    let moved = totalFlux(flow);
    let reserve = bed[cell].x - moved - params.physics.y;
    let bedVelocity = bed[cell].zw;
    let speed = length(bedVelocity);
    let agitation = smoothstep(0.055, 0.24, speed);
    let sourceMoved = max(moved, bed[cell].y * params.grid.w * 0.35);
    let mass = mix(0.0000025, 0.0000055, random(seed + 13u));
    let launchMass = sourceMoved * f32(stride) * agitation * 0.004;
    let launchChance = min(1.0, launchMass / mass);
    if (reserve > mass * 1.2 && random(seed) < launchChance) {
      let position = (vec2f(f32(cell % u32(params.grid.x)), f32(cell / u32(params.grid.x))) + 0.5) * params.grid.y - params.grid.z * 0.5;
      let transport = fluxVector(flow);
      let direction = select(transport / max(length(transport), 1e-9), bedVelocity / max(speed, 1e-9), speed > 0.01);
      let side = vec2f(-direction.y, direction.x);
      let scatter = (random(seed + 31u) - 0.5) * (0.02 + speed * 0.12);
      let horizontal = bedVelocity * (0.68 + random(seed + 5u) * 0.22) + direction * (0.018 + speed * 0.12) + side * scatter;
      let lift = 0.018 + sqrt(max(speed, 0.0)) * (0.16 + random(seed + 7u) * 0.055);
      grain.position = vec4f(position.x, bed[cell].x + 0.0003, position.y, mass);
      grain.velocity = vec4f(horizontal.x, lift, horizontal.y, 0.0);
      atomicSub(&exchange[cell], i32(round(mass * 1e9)));
    }
  }
  grains[index] = grain;
}
`;
