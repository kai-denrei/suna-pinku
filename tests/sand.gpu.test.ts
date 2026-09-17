import { afterAll, beforeAll, expect, test } from 'vitest'
import { create, globals } from 'webgpu'
import { SAND, idleStroke, type Stroke } from '../src/config'
import { SandSolver } from '../src/simulation/solver'
import { SandRenderer } from '../src/render/renderer'

let device: GPUDevice
let gpu: GPU
const errors: string[] = []

beforeAll(async () => {
  Object.assign(globalThis, globals)
  gpu = create([])
  const adapter = await gpu.requestAdapter()
  if (!adapter) throw new Error('GPU tests require hardware WebGPU access; run outside the filesystem sandbox.')
  device = await adapter.requestDevice()
  device.addEventListener('uncapturederror', (event) => errors.push(event.error.message))
})
afterAll(() => { device?.destroy() })

async function readState(solver: SandSolver) {
  const staging = device.createBuffer({ size: solver.byteLength, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })
  const encoder = device.createCommandEncoder()
  encoder.copyBufferToBuffer(solver.state, 0, staging, 0, solver.byteLength)
  device.queue.submit([encoder.finish()])
  await staging.mapAsync(GPUMapMode.READ)
  const values = new Float32Array(staging.getMappedRange()).slice()
  staging.unmap(); staging.destroy()
  return values
}
function volume(state: Float32Array) {
  let sum = 0
  for (let index = 0; index < state.length; index += 4) sum += state[index]
  return sum
}
async function particleMass(solver: SandSolver) {
  const size = solver.particleCount * 32
  const staging = device.createBuffer({ size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })
  const encoder = device.createCommandEncoder()
  encoder.copyBufferToBuffer(solver.particles, 0, staging, 0, size)
  device.queue.submit([encoder.finish()])
  await staging.mapAsync(GPUMapMode.READ)
  const values = new Float32Array(staging.getMappedRange())
  let total = 0
  for (let index = 3; index < values.length; index += 8) total += values[index]
  staging.unmap(); staging.destroy()
  return total
}
function step(solver: SandSolver, stroke: Stroke, count: number) {
  for (let index = 0; index < count; index++) {
    const encoder = device.createCommandEncoder()
    solver.encode(encoder, [stroke])
    device.queue.submit([encoder.finish()])
  }
}

test('actual WGSL preserves mass, excavates a groove, deposits banks, and settles without erasing it', async () => {
  const solver = new SandSolver(device)
  await solver.initialize()
  try {
    const initial = await readState(solver)
    const stroke: Stroke = { from: { x: -0.06, y: 0 }, to: { x: 0.06, y: 0 }, radius: 0.014, pressure: 0.8, active: true }
    step(solver, stroke, 80)
    const pressed = await readState(solver)
    const airborne = await particleMass(solver)
    expect(airborne).toBeGreaterThan(0)
    expect(Math.abs((volume(pressed) + airborne) / volume(initial) - 1)).toBeLessThan(0.000002)
    let deepest = 0
    let highest = 0
    for (let index = 0; index < pressed.length; index += 4) {
      expect(Number.isFinite(pressed[index])).toBe(true)
      expect(pressed[index]).toBeGreaterThanOrEqual(SAND.floor - 1e-6)
      deepest = Math.max(deepest, initial[index] - pressed[index])
      highest = Math.max(highest, pressed[index] - initial[index])
    }
    expect(deepest).toBeGreaterThan(0.004)
    expect(highest).toBeGreaterThan(0.001)
    step(solver, idleStroke(), 360)
    const settled = await readState(solver)
    expect(Math.abs((volume(settled) + await particleMass(solver)) / volume(initial) - 1)).toBeLessThan(0.000004)
    const center = ((SAND.resolution / 2) * SAND.resolution + SAND.resolution / 2) * 4
    expect(settled[center]).toBeLessThan(SAND.depth - 0.002)
    step(solver, idleStroke(), 120)
    const later = await readState(solver)
    let drift = 0
    for (let index = 0; index < later.length; index += 4) drift = Math.max(drift, Math.abs(later[index] - settled[index]))
    expect(drift).toBeLessThan(0.00015)
    expect(errors).toEqual([])
  } finally { solver.dispose() }
})

test('surface pipeline compiles and renders nonuniform opaque pixels offscreen', async () => {
  const solver = new SandSolver(device, 128)
  await solver.initialize()
  const renderer = new SandRenderer(device, solver, 'rgba8unorm')
  const texture = device.createTexture({ size: [256, 192], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC })
  const staging = device.createBuffer({ size: 256 * 192 * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })
  try {
    await renderer.initialize()
    renderer.resize(256, 192)
    step(solver, { from: { x: -0.07, y: 0 }, to: { x: 0.07, y: 0 }, radius: 0.022, pressure: 1, active: true }, 100)
    device.pushErrorScope('validation')
    const encoder = device.createCommandEncoder()
    renderer.encode(encoder, texture.createView(), idleStroke())
    encoder.copyTextureToBuffer({ texture }, { buffer: staging, bytesPerRow: 1024 }, [256, 192])
    device.queue.submit([encoder.finish()])
    await staging.mapAsync(GPUMapMode.READ)
    const pixels = new Uint8Array(staging.getMappedRange())
    let minimum = 255; let maximum = 0
    for (let index = 0; index < pixels.length; index += 4) {
      minimum = Math.min(minimum, pixels[index]); maximum = Math.max(maximum, pixels[index])
      expect(pixels[index + 3]).toBe(255)
    }
    expect(maximum - minimum).toBeGreaterThan(5)
    expect(minimum).toBeGreaterThan(20)
    staging.unmap()
    expect(await device.popErrorScope()).toBeNull()
    expect(errors).toEqual([])
  } finally { renderer.dispose(); solver.dispose(); texture.destroy(); staging.destroy() }
})
