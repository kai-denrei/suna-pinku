import { expect, test, vi } from 'vitest'
import { SandCamera } from '../src/render/camera'
import { introDepth, SandMarkings } from '../src/render/markings'

test('opening lettering holds, erodes, and stays gone after its one-shot lifetime', () => {
  expect(introDepth(-1)).toBe(0)
  expect(introDepth(0)).toBe(1)
  expect(introDepth(4000)).toBe(1)
  expect(introDepth(5750)).toBeCloseTo(0.5)
  expect(introDepth(7500)).toBe(0)
  expect(introDepth(60000)).toBe(0)
  let previous = 1
  for (let time = 4000; time <= 8000; time += 100) {
    const depth = introDepth(time)
    expect(depth).toBeGreaterThanOrEqual(0)
    expect(depth).toBeLessThanOrEqual(previous)
    previous = depth
  }
})

test('sand gear follows its measured touch target across viewport and safe-area changes', () => {
  vi.stubGlobal('GPUTextureUsage', { TEXTURE_BINDING: 1, COPY_DST: 2 })
  vi.stubGlobal('GPUBufferUsage', { UNIFORM: 1, COPY_DST: 2 })
  let layout = new Float32Array()
  const device = { createTexture: () => ({}), createBuffer: () => ({}),
    queue: { writeBuffer: (_buffer: unknown, _offset: number, data: Float32Array) => { layout = data.slice() } } }
  try {
    const markings = new SandMarkings(device as unknown as GPUDevice)
    const camera = new SandCamera()
    for (const [width, height, bottom, right] of [[390, 844, 34, 0], [844, 390, 21, 47], [390, 844, 0, 0]]) {
      camera.aspect = width / height
      const x = width - right - 46, y = height - bottom - 46
      markings.layout(camera, width, height, x, y, 22)
      markings.update(0)
      const screen = camera.bedToScreen({ x: layout[4], y: layout[5] }, width, height)
      const edge = camera.bedToScreen({ x: layout[4] + layout[6], y: layout[5] }, width, height)
      expect(screen.x).toBeCloseTo(x, 3)
      expect(screen.y).toBeCloseTo(y, 3)
      expect(edge.x - screen.x).toBeCloseTo(22, 3)
    }
  } finally {
    vi.unstubAllGlobals()
  }
})
