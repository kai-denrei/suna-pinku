import { SAND } from '../config'
import type { SandCamera } from './camera'
import type { WaveResetState } from '../reset/effect'
import { WAVE_RESET } from '../reset/effect'
import { waveShoreWgsl } from '../reset/wgsl'

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

const overlayShader = `
${waveShoreWgsl}
struct OverlayView {
  eye: vec4f,
  forward: vec4f,
  right: vec4f,
  up: vec4f,
  waveFront: vec4f,
  waveShape: vec4f,
  waveLook: vec4f,
}
struct WaveSample {
  height: f32,
  slope: vec2f,
  displacement: vec2f,
}
struct SurfaceHit {
  position: vec3f,
  normal: vec3f,
  waterDistance: f32,
}
@group(0) @binding(0) var postSampler: sampler;
@group(0) @binding(1) var sourceTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> overlay: OverlayView;
struct VertexOutput { @builtin(position) clip: vec4f, @location(0) uv: vec2f }
@vertex fn vertex(@builtin(vertex_index) index: u32) -> VertexOutput {
  let positions = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  let clip = positions[index];
  var output: VertexOutput;
  output.clip = vec4f(clip, 0.0, 1.0);
  output.uv = clip * vec2f(0.5, -0.5) + vec2f(0.5);
  return output;
}
fn hash21(point: vec2f) -> f32 {
  let p3 = fract(vec3f(point.x, point.y, point.x) * vec3f(0.1031, 0.1030, 0.0973));
  let q = p3 + dot(p3, p3.yzx + vec3f(33.33));
  return fract((q.x + q.y) * q.z);
}
fn valueNoise(point: vec2f) -> f32 {
  let cell = floor(point);
  let blend = fract(point);
  let curve = blend * blend * (3.0 - 2.0 * blend);
  let a = hash21(cell);
  let b = hash21(cell + vec2f(1.0, 0.0));
  let c = hash21(cell + vec2f(0.0, 1.0));
  let d = hash21(cell + vec2f(1.0, 1.0));
  return mix(mix(a, b, curve.x), mix(c, d, curve.x), curve.y);
}
fn fbm(point: vec2f) -> f32 {
  var value = 0.0;
  var amplitude = 0.5;
  var position = point;
  for (var octave = 0; octave < 4; octave++) {
    value += valueNoise(position) * amplitude;
    position = mat2x2f(1.72, 1.14, -1.14, 1.72) * position + vec2f(13.7, 9.2);
    amplitude *= 0.5;
  }
  return value;
}
fn toLinear(color: vec3f) -> vec3f {
  let low = color / 12.92;
  let high = pow(max((color + 0.055) / 1.055, vec3f(0.0)), vec3f(2.4));
  return select(low, high, color > vec3f(0.04045));
}
fn toSrgb(color: vec3f) -> vec3f {
  let safe = max(color, vec3f(0.0));
  let low = safe * 12.92;
  let high = 1.055 * pow(safe, vec3f(1.0 / 2.4)) - 0.055;
  return select(low, high, safe > vec3f(0.0031308));
}
fn viewRay(uv: vec2f) -> vec3f {
  let screen = vec2f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
  return normalize(
    overlay.forward.xyz
    + screen.x * overlay.eye.w * overlay.forward.w * overlay.right.xyz
    + screen.y * overlay.eye.w * overlay.up.xyz
  );
}
fn intersectBed(uv: vec2f) -> vec4f {
  let direction = viewRay(uv);
  let distance = (${SAND.depth} - overlay.eye.y) / direction.y;
  let world = overlay.eye.xyz + direction * distance;
  return vec4f(world.x, world.z, distance, select(0.0, 1.0, distance > 0.0));
}
fn projectWorld(world: vec3f) -> vec2f {
  let relative = world - overlay.eye.xyz;
  let forwardDistance = max(dot(relative, overlay.forward.xyz), 0.0001);
  let horizontal = dot(relative, overlay.right.xyz) / (forwardDistance * overlay.eye.w * overlay.forward.w);
  let vertical = dot(relative, overlay.up.xyz) / (forwardDistance * overlay.eye.w);
  return vec2f(horizontal * 0.5 + 0.5, 0.5 - vertical * 0.5);
}
fn waveBand(
  point: vec2f,
  directionRaw: vec2f,
  wavelength: f32,
  amplitude: f32,
  speed: f32,
  steepness: f32,
  phaseOffset: f32,
  time: f32
) -> WaveSample {
  let direction = normalize(directionRaw);
  let wavenumber = 6.28318530718 / wavelength;
  let phase = dot(point, direction) * wavenumber - time * speed * wavenumber + phaseOffset;
  let sinePhase = sin(phase);
  let cosinePhase = cos(phase);
  let height = amplitude * sinePhase;
  let slopeMagnitude = amplitude * wavenumber * cosinePhase;
  let displacement = direction * (amplitude * steepness * cosinePhase);
  return WaveSample(height, direction * slopeMagnitude, displacement);
}
fn waveField(point: vec2f, waterDistance: f32, time: f32) -> WaveSample {
  let shoreGain = mix(1.42, 0.86, smoothstep(0.0, 0.18, waterDistance));
  let rippleGain = mix(0.92, 1.12, clamp(overlay.waveLook.z / 24.0, 0.7, 1.4));
  let drift = max(overlay.waveLook.w, 0.05) / 0.48;

  let a = waveBand(point, vec2f(0.22, -1.0), 0.240, 0.00180 * shoreGain, 0.52 * drift, 0.55, 0.0, time);
  let b = waveBand(point, vec2f(-0.34, -0.94), 0.155, 0.00110 * shoreGain, 0.44 * drift, 0.50, 1.7, time);
  let c = waveBand(point, vec2f(0.78, -0.62), 0.105, 0.00065 * shoreGain, 0.37 * drift, 0.45, 3.1, time);
  let d = waveBand(point, vec2f(0.9211, 0.3894), 0.070, 0.00034 * rippleGain, 0.34 * drift, 0.35, 5.2, time);
  let e = waveBand(point, vec2f(0.6967, -0.7174), 0.058, 0.00028 * rippleGain, 0.31 * drift, 0.33, 2.4, time);
  let f = waveBand(point, vec2f(-0.1288, 0.9917), 0.048, 0.00022 * rippleGain, 0.29 * drift, 0.31, 4.5, time);
  let g = waveBand(point, vec2f(-0.8301, 0.5577), 0.040, 0.00017 * rippleGain, 0.26 * drift, 0.28, 0.9, time);
  let h = waveBand(point, vec2f(-0.5474, -0.8369), 0.034, 0.00013 * rippleGain, 0.24 * drift, 0.25, 2.9, time);

  return WaveSample(
    a.height + b.height + c.height + d.height + e.height + f.height + g.height + h.height,
    a.slope + b.slope + c.slope + d.slope + e.slope + f.slope + g.slope + h.slope,
    a.displacement + b.displacement + c.displacement + d.displacement + e.displacement + f.displacement + g.displacement + h.displacement
  );
}
fn filmDepth(waterDistance: f32) -> f32 {
  let entry = smoothstep(-overlay.waveShape.x * 0.08, overlay.waveShape.x * 1.25, waterDistance);
  let body = smoothstep(overlay.waveShape.x * 0.25, 0.17, waterDistance);
  return entry * mix(0.0010, 0.034, body);
}
fn frontCrest(waterDistance: f32) -> f32 {
  let center = overlay.waveShape.y * 0.46;
  let width = max(overlay.waveShape.y * 0.70, 0.008);
  let coordinate = (waterDistance - center) / width;
  return exp(-coordinate * coordinate * 2.2) * 0.0044;
}
fn waterSurface(point: vec2f, waterDistance: f32, time: f32) -> vec4f {
  let wave = waveField(point, waterDistance, time);
  let depth = filmDepth(waterDistance);
  let crest = frontCrest(waterDistance);
  let surfaceHeight = ${SAND.depth} + max(0.0007, depth + crest + wave.height);

  let frontScale = max(overlay.waveShape.y * 1.35, 0.012);
  let frontInfluence = exp(-pow((waterDistance - overlay.waveShape.y * 0.30) / frontScale, 2.0));
  let frontSlope = 0.085 * frontInfluence;
  let slope = wave.slope + vec2f(0.0, frontSlope);
  let normal = normalize(vec3f(-slope.x, 1.0, -slope.y));
  return vec4f(normal, surfaceHeight);
}
fn solveSurface(uv: vec2f, time: f32) -> SurfaceHit {
  let direction = viewRay(uv);
  var distance = (${SAND.depth} - overlay.eye.y) / direction.y;
  var position = overlay.eye.xyz + direction * distance;
  var waterDistance = position.z - shorelineFront(position.x, overlay.waveFront.y, time);
  var surface = waterSurface(position.xz, waterDistance, time);

  for (var iteration = 0; iteration < 3; iteration++) {
    distance = (surface.w - overlay.eye.y) / direction.y;
    position = overlay.eye.xyz + direction * distance;
    waterDistance = position.z - shorelineFront(position.x, overlay.waveFront.y, time);
    surface = waterSurface(position.xz, waterDistance, time);
  }
  position = overlay.eye.xyz + direction * ((surface.w - overlay.eye.y) / direction.y);
  waterDistance = position.z - shorelineFront(position.x, overlay.waveFront.y, time);
  surface = waterSurface(position.xz, waterDistance, time);
  return SurfaceHit(vec3f(position.x, surface.w, position.z), surface.xyz, waterDistance);
}
fn cloudMask(directionRaw: vec3f, time: f32) -> f32 {
  let direction = normalize(directionRaw);
  if (direction.y <= 0.018) { return 0.0; }
  var uv = direction.xz / max(direction.y, 0.055);
  uv = uv * 0.40 + vec2f(time * 0.0048, -time * 0.0027);
  let broad = fbm(uv * 0.78);
  let detail = fbm(uv * 2.05 + vec2f(12.7, -8.3));
  let density = broad * 0.72 + detail * 0.28;
  return smoothstep(0.49, 0.68, density) * smoothstep(0.025, 0.24, direction.y);
}
fn skyRadiance(directionRaw: vec3f, sunDirection: vec3f, time: f32) -> vec3f {
  let direction = normalize(directionRaw);
  let upward = clamp(direction.y, -1.0, 1.0);
  let horizon = vec3f(0.74, 0.89, 1.06);
  let zenith = vec3f(0.12, 0.40, 0.90);
  let below = vec3f(0.035, 0.085, 0.10);
  var color = select(
    mix(horizon, below, clamp(-upward * 3.0, 0.0, 1.0)),
    mix(horizon, zenith, pow(max(upward, 0.0), 0.46)),
    upward >= 0.0
  );

  let cloud = cloudMask(direction, time);
  let sunAmount = max(dot(direction, sunDirection), 0.0);
  let cloudLight = mix(vec3f(0.72, 0.80, 0.90), vec3f(1.30, 1.18, 1.02), 0.55 + 0.45 * sunAmount);
  color = mix(color, cloudLight, cloud * 0.82);

  // The solar disc itself is handled by the GGX/glitter terms below. The sky
  // contributes only the finite-area circumsolar atmosphere here, avoiding a
  // double-counted white disc reflected through the same bumpy normal.
  let innerAureole = pow(sunAmount, 420.0) * 1.8;
  let outerAureole = pow(sunAmount, 28.0) * 0.20;
  color += vec3f(1.0, 0.86, 0.64) * (innerAureole + outerAureole) * (1.0 - cloud * 0.62);
  return color;
}
fn fresnelDielectric(cosineIncident: f32, etaIncident: f32, etaTransmitted: f32) -> f32 {
  let cosI = clamp(cosineIncident, 0.0, 1.0);
  let eta = etaIncident / etaTransmitted;
  let sinT2 = eta * eta * max(0.0, 1.0 - cosI * cosI);
  if (sinT2 >= 1.0) { return 1.0; }
  let cosT = sqrt(max(0.0, 1.0 - sinT2));
  let rsNumerator = etaIncident * cosI - etaTransmitted * cosT;
  let rsDenominator = etaIncident * cosI + etaTransmitted * cosT;
  let rpNumerator = etaTransmitted * cosI - etaIncident * cosT;
  let rpDenominator = etaTransmitted * cosI + etaIncident * cosT;
  let rs = rsNumerator / max(abs(rsDenominator), 0.00001);
  let rp = rpNumerator / max(abs(rpDenominator), 0.00001);
  return clamp(0.5 * (rs * rs + rp * rp), 0.0, 1.0);
}
fn ggxDistribution(noH: f32, roughness: f32) -> f32 {
  let alpha = roughness * roughness;
  let alpha2 = alpha * alpha;
  let denominator = noH * noH * (alpha2 - 1.0) + 1.0;
  return alpha2 / max(3.14159265 * denominator * denominator, 0.0001);
}
fn smithVisibility(noV: f32, noL: f32, roughness: f32) -> f32 {
  let alpha = roughness * roughness;
  let k = alpha * 0.5;
  let gv = noV / max(noV * (1.0 - k) + k, 0.0001);
  let gl = noL / max(noL * (1.0 - k) + k, 0.0001);
  return gv * gl;
}
fn refractedBedWorld(surface: SurfaceHit, incident: vec3f, eta: f32) -> vec3f {
  let transmitted = refract(incident, surface.normal, eta);
  let distance = (${SAND.depth} - surface.position.y) / min(transmitted.y, -0.0001);
  return surface.position + transmitted * max(distance, 0.0);
}
fn flatLightLanding(surfacePoint: vec2f, time: f32, sunDirection: vec3f) -> vec2f {
  let waterDistance = surfacePoint.y - shorelineFront(surfacePoint.x, overlay.waveFront.y, time);
  let depth = filmDepth(waterDistance) + frontCrest(waterDistance);
  let originY = ${SAND.depth} + max(depth, 0.0007);
  let transmitted = refract(-sunDirection, vec3f(0.0, 1.0, 0.0), 1.0 / 1.333);
  let distance = (${SAND.depth} - originY) / min(transmitted.y, -0.0001);
  return surfacePoint + transmitted.xz * max(distance, 0.0);
}
fn waveLightLanding(surfacePoint: vec2f, time: f32, sunDirection: vec3f) -> vec2f {
  let waterDistance = surfacePoint.y - shorelineFront(surfacePoint.x, overlay.waveFront.y, time);
  let surface = waterSurface(surfacePoint, waterDistance, time);
  let wave = waveField(surfacePoint, waterDistance, time);
  let transmitted = refract(-sunDirection, surface.xyz, 1.0 / 1.333);
  let distance = (${SAND.depth} - surface.w) / min(transmitted.y, -0.0001);
  return surfacePoint + wave.displacement + transmitted.xz * max(distance, 0.0);
}
fn inverseLightSurface(bedPoint: vec2f, time: f32, sunDirection: vec3f) -> vec2f {
  var surfacePoint = bedPoint;
  for (var iteration = 0; iteration < 2; iteration++) {
    let landed = waveLightLanding(surfacePoint, time, sunDirection);
    surfacePoint -= (landed - bedPoint) * 0.92;
  }
  return surfacePoint;
}
fn differentialCaustic(bedPoint: vec2f, time: f32, sunDirection: vec3f) -> f32 {
  let surfacePoint = inverseLightSurface(bedPoint, time, sunDirection);
  let epsilon = 0.0018;
  let dx = vec2f(epsilon, 0.0);
  let dz = vec2f(0.0, epsilon);

  let newCenter = waveLightLanding(surfacePoint, time, sunDirection);
  let newDx = waveLightLanding(surfacePoint + dx, time, sunDirection) - newCenter;
  let newDz = waveLightLanding(surfacePoint + dz, time, sunDirection) - newCenter;
  let oldCenter = flatLightLanding(surfacePoint, time, sunDirection);
  let oldDx = flatLightLanding(surfacePoint + dx, time, sunDirection) - oldCenter;
  let oldDz = flatLightLanding(surfacePoint + dz, time, sunDirection) - oldCenter;

  let oldArea = abs(oldDx.x * oldDz.y - oldDx.y * oldDz.x);
  let newArea = max(abs(newDx.x * newDz.y - newDx.y * newDz.x), oldArea * 0.16);
  let concentration = clamp(oldArea / max(newArea, 1e-8), 0.48, 4.8);
  let depth = filmDepth(surfacePoint.y - shorelineFront(surfacePoint.x, overlay.waveFront.y, time));
  let resolvedStrength = smoothstep(0.004, 0.022, depth) * 0.68;
  return mix(1.0, concentration, resolvedStrength);
}
fn foamCoverage(point: vec2f, waterDistance: f32, time: f32) -> f32 {
  let advect = vec2f(time * 0.19, -time * 0.58);
  let broadBreakup = fbm(point * 11.0 + advect) - 0.5;
  let fineBreakup = fbm(point * 27.0 + vec2f(-time * 0.44, time * 0.21)) - 0.5;
  let warpedDistance = waterDistance + (broadBreakup * 0.78 + fineBreakup * 0.22) * overlay.waveShape.y * 0.92;

  let frontCenter = overlay.waveShape.y * 0.20;
  let frontBand = 1.0 - smoothstep(overlay.waveShape.y * 0.18, overlay.waveShape.y * 1.08, abs(warpedDistance - frontCenter));
  let trail = smoothstep(0.0, overlay.waveShape.z * 0.30, warpedDistance)
    * (1.0 - smoothstep(overlay.waveShape.z * 0.56, overlay.waveShape.z * 2.45, warpedDistance));

  let frothA = smoothstep(0.47, 0.74, fbm(point * 19.0 + vec2f(time * 0.26, -time * 0.39)));
  let frothB = smoothstep(0.50, 0.78, fbm(point * 38.0 + vec2f(-time * 0.63, time * 0.31)));
  let stringers = smoothstep(0.58, 0.80, fbm(vec2f(point.x * 10.0, point.y * 26.0) + vec2f(time * 0.10, -time * 0.72)));
  let micro = smoothstep(0.78, 0.92, valueNoise(point * 121.0 + advect * 4.2));
  let frontFroth = frontBand * (0.56 + frothA * 0.32 + frothB * 0.20);
  let trailingFroth = trail * (frothA * 0.36 + frothB * 0.24 + stringers * 0.22 + micro * 0.08);
  return clamp(frontFroth + trailingFroth, 0.0, 1.0);
}
@fragment fn fragment(input: VertexOutput) -> @location(0) vec4f {
  let source = textureSampleLevel(sourceTexture, postSampler, input.uv, 0.0);
  if (overlay.waveFront.x <= 0.5) { return source; }

  let bed = intersectBed(input.uv);
  if (bed.w < 0.5 || abs(bed.x) > overlay.waveFront.w || abs(bed.y) > overlay.waveFront.w) { return source; }

  let shoreline = shorelineFront(bed.x, overlay.waveFront.y, overlay.waveFront.z);
  let waterDistance = bed.y - shoreline;
  let waterMask = smoothstep(-overlay.waveShape.x * 0.06, overlay.waveShape.x, waterDistance);
  if (waterMask <= 0.0001) { return source; }

  let incident = viewRay(input.uv);
  let surface = solveSurface(input.uv, overlay.waveFront.z);
  let viewDirection = normalize(-incident);
  let noV = max(dot(surface.normal, viewDirection), 0.001);
  let sunDirection = normalize(vec3f(0.6967067, 0.65, -0.7173561));

  let reflectedDirection = reflect(incident, surface.normal);
  let fresnel = fresnelDielectric(noV, 1.0, 1.333);
  // The source sand has already been tone-mapped before this pass, while the
  // reflected sky is reconstructed analytically. Keep the daylight sky in an
  // HDR radiance range so the exact ~2% near-normal Fresnel term remains visible.
  let reflection = skyRadiance(reflectedDirection, sunDirection, overlay.waveFront.z) * 2.15;

  let bedRed = refractedBedWorld(surface, incident, 1.0 / 1.3310);
  let bedGreen = refractedBedWorld(surface, incident, 1.0 / 1.3330);
  let bedBlue = refractedBedWorld(surface, incident, 1.0 / 1.3370);
  let uvRed = clamp(projectWorld(bedRed), vec2f(0.001), vec2f(0.999));
  let uvGreen = clamp(projectWorld(bedGreen), vec2f(0.001), vec2f(0.999));
  let uvBlue = clamp(projectWorld(bedBlue), vec2f(0.001), vec2f(0.999));
  let redSample = textureSampleLevel(sourceTexture, postSampler, uvRed, 0.0).rgb;
  let greenSample = textureSampleLevel(sourceTexture, postSampler, uvGreen, 0.0).rgb;
  let blueSample = textureSampleLevel(sourceTexture, postSampler, uvBlue, 0.0).rgb;
  var refractedBed = toLinear(vec3f(redSample.r, greenSample.g, blueSample.b));

  let transmittedRay = refract(incident, surface.normal, 1.0 / 1.333);
  let pathLength = max((surface.position.y - ${SAND.depth}) / max(abs(transmittedRay.y), 0.06), 0.0);
  let causticField = differentialCaustic(bedGreen.xz, overlay.waveFront.z, sunDirection);
  let causticDeviation = causticField - 1.0;
  let causticGain = 1.0
    + max(causticDeviation, 0.0) * 0.72
    + min(causticDeviation, 0.0) * 0.22;
  refractedBed *= vec3f(causticGain * 1.018, causticGain * 1.008, causticGain * 0.988);

  let extinction = vec3f(0.34, 0.075, 0.030) * mix(0.84, 1.16, overlay.waveLook.x);
  let transmittance = exp(-extinction * pathLength);
  let scatterColor = vec3f(0.018, 0.115, 0.17) * mix(0.68, 1.14, overlay.waveLook.x);
  var transmission = refractedBed * transmittance + scatterColor * (vec3f(1.0) - transmittance);

  let halfVector = normalize(viewDirection + sunDirection);
  let noL = max(dot(surface.normal, sunDirection), 0.0);
  let noH = max(dot(surface.normal, halfVector), 0.0);
  let voH = max(dot(viewDirection, halfVector), 0.0);
  let roughness = mix(0.055, 0.024, clamp(overlay.waveLook.y, 0.0, 1.0));
  let microFresnel = fresnelDielectric(voH, 1.0, 1.333);
  let specularBrdf = ggxDistribution(noH, roughness) * smithVisibility(noV, noL, roughness) * microFresnel
    / max(4.0 * noV * max(noL, 0.001), 0.001);
  let sunSpecular = vec3f(1.0, 0.88, 0.69) * specularBrdf * noL * 2.4;

  let sunMirror = max(dot(reflectedDirection, sunDirection), 0.0);
  let glitter = pow(sunMirror, 340.0) * 2.2 + pow(sunMirror, 85.0) * 0.24;
  let waveMicro = 0.58 + 0.42 * fbm(surface.position.xz * 84.0 + vec2f(overlay.waveFront.z * 1.4, -overlay.waveFront.z * 1.1));
  let sunGlitter = vec3f(1.0, 0.92, 0.76) * glitter * waveMicro;

  let nearFront = 1.0 - smoothstep(0.0, overlay.waveShape.y * 2.2, surface.waterDistance);
  let forwardScatter = pow(max(dot(viewDirection, -sunDirection), 0.0), 4.0) * nearFront;
  transmission += scatterColor * (nearFront * 0.08 + forwardScatter * 0.11) * (1.0 - fresnel);

  var waterColor = transmission * (1.0 - fresnel) + reflection * fresnel + sunSpecular + sunGlitter;
  let opticalWeight = mix(0.88, 1.0, overlay.waveShape.w) * waterMask;
  let sourceLinear = toLinear(source.rgb);
  var color = mix(sourceLinear, waterColor, opticalWeight);

  let foam = foamCoverage(surface.position.xz, surface.waterDistance, overlay.waveFront.z) * waterMask;
  let foamLight = 0.62 + noL * 0.38;
  let foamColor = vec3f(0.94, 0.975, 1.0) * foamLight + reflection * 0.08;
  let foamOpacity = foam * mix(0.54, 0.82, smoothstep(0.0, 0.9, foam));
  color = mix(color, foamColor, foamOpacity);
  color += vec3f(1.0, 0.96, 0.88) * foam * sunGlitter * 0.07;

  return vec4f(clamp(toSrgb(color), vec3f(0.0), vec3f(1.0)), source.a);
}
`

export const HDR_SCENE_FORMAT: GPUTextureFormat = 'rgba16float'
export const GLINT_FORMAT: GPUTextureFormat = 'r16float'

export class SandPostProcess {
  private readonly uniform: GPUBuffer
  private readonly overlayUniform: GPUBuffer
  private readonly sampler: GPUSampler
  private readonly legacyEncodeModule: GPUShaderModule
  private readonly postModule: GPUShaderModule
  private readonly overlayModule: GPUShaderModule
  private legacyEncodePipeline!: GPURenderPipeline
  private postPipeline!: GPURenderPipeline
  private overlayPipeline!: GPURenderPipeline
  private legacyEncodeGroup!: GPUBindGroup
  private postGroup!: GPUBindGroup
  private overlayGroup!: GPUBindGroup
  private hdrScene?: GPUTexture
  private hdrSceneView?: GPUTextureView
  private glintScene?: GPUTexture
  private glintSceneView?: GPUTextureView
  private legacyScene?: GPUTexture
  private legacySceneView?: GPUTextureView
  private compositeScene?: GPUTexture
  private compositeSceneView?: GPUTextureView
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
    this.overlayUniform = device.createBuffer({ label: 'Wave overlay uniform', size: 112, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    this.sampler = device.createSampler({ label: 'Filmic post sampler', magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' })
    this.legacyEncodeModule = device.createShaderModule({ label: 'Legacy display encode WGSL', code: legacyEncodeShader })
    this.postModule = device.createShaderModule({ label: 'Filmic post WGSL', code: postShader })
    this.overlayModule = device.createShaderModule({ label: 'Wave overlay WGSL', code: overlayShader })
  }

  async initialize() {
    [this.legacyEncodePipeline, this.postPipeline, this.overlayPipeline] = await Promise.all([
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
      this.device.createRenderPipelineAsync({ label: 'Wave overlay composite', layout: 'auto',
        vertex: { module: this.overlayModule, entryPoint: 'vertex' },
        fragment: { module: this.overlayModule, entryPoint: 'fragment', targets: [{ format: this.targetFormat }] },
        primitive: { topology: 'triangle-list' },
      }),
    ])
  }

  resize(width: number, height: number) {
    if (width === this.width && height === this.height) return
    this.hdrScene?.destroy()
    this.glintScene?.destroy()
    this.legacyScene?.destroy()
    this.compositeScene?.destroy()
    this.width = width
    this.height = height
    this.hdrScene = this.device.createTexture({ label: 'Linear HDR scene color', size: [width, height], format: HDR_SCENE_FORMAT, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING })
    this.hdrSceneView = this.hdrScene.createView()
    this.glintScene = this.device.createTexture({ label: 'Reflective mineral HDR glints', size: [width, height], format: GLINT_FORMAT, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING })
    this.glintSceneView = this.glintScene.createView()
    this.legacyScene = this.device.createTexture({ label: 'Legacy display scene color', size: [width, height], format: this.legacyFormat, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING })
    this.legacySceneView = this.legacyScene.createView()
    this.compositeScene = this.device.createTexture({ label: 'Filmic composite scene color', size: [width, height], format: this.targetFormat, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING })
    this.compositeSceneView = this.compositeScene.createView()
    this.legacyEncodeGroup = this.device.createBindGroup({ layout: this.legacyEncodePipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: this.hdrSceneView },
    ] })
    this.postGroup = this.device.createBindGroup({ layout: this.postPipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: this.sampler },
      { binding: 1, resource: this.legacySceneView },
      { binding: 2, resource: { buffer: this.uniform } },
      { binding: 3, resource: this.glintSceneView },
    ] })
    this.overlayGroup = this.device.createBindGroup({ layout: this.overlayPipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: this.sampler },
      { binding: 1, resource: this.compositeSceneView },
      { binding: 2, resource: { buffer: this.overlayUniform } },
    ] })
    this.device.queue.writeBuffer(this.uniform, 0, new Float32Array([1 / width, 1 / height, width, height]))
  }

  setWaveState(waveState: WaveResetState, camera: SandCamera) {
    const data = new Float32Array([
      ...camera.eye, camera.tanHalfFov,
      ...camera.forward, camera.aspect,
      ...camera.right, 0,
      ...camera.up, 0,
      waveState.active ? 1 : 0, waveState.currentBaseFront, waveState.time, SAND.extent * 0.5,
      WAVE_RESET.shorelineFeather, WAVE_RESET.foamWidth, WAVE_RESET.foamTrail, WAVE_RESET.waterOpacity,
      WAVE_RESET.waterTintStrength, WAVE_RESET.washGloss, WAVE_RESET.rippleScale, WAVE_RESET.rippleDrift,
    ])
    this.device.queue.writeBuffer(this.overlayUniform, 0, data)
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
    if (!this.legacySceneView || !this.compositeSceneView) throw new Error('Post process textures are not initialized.')
    const encodePass = encoder.beginRenderPass({ label: 'Legacy display encode', colorAttachments: [{ view: this.legacySceneView, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0.55, g: 0.44, b: 0.29, a: 1 } }] })
    encodePass.setPipeline(this.legacyEncodePipeline)
    encodePass.setBindGroup(0, this.legacyEncodeGroup)
    encodePass.draw(3)
    encodePass.end()

    const postPass = encoder.beginRenderPass({ label: 'Filmic composite', colorAttachments: [{ view: this.compositeSceneView, clearValue: { r: 0.55, g: 0.44, b: 0.29, a: 1 }, loadOp: 'clear', storeOp: 'store' }] })
    postPass.setPipeline(this.postPipeline)
    postPass.setBindGroup(0, this.postGroup)
    postPass.draw(3)
    postPass.end()

    const overlayPass = encoder.beginRenderPass({ label: 'Wave overlay composite', colorAttachments: [{ view: target, clearValue: { r: 0.55, g: 0.44, b: 0.29, a: 1 }, loadOp: 'clear', storeOp: 'store' }] })
    overlayPass.setPipeline(this.overlayPipeline)
    overlayPass.setBindGroup(0, this.overlayGroup)
    overlayPass.draw(3)
    overlayPass.end()
  }

  dispose() {
    this.hdrScene?.destroy()
    this.glintScene?.destroy()
    this.legacyScene?.destroy()
    this.compositeScene?.destroy()
    this.uniform.destroy()
    this.overlayUniform.destroy()
  }
}
