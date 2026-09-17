import { describe, expect, test } from 'vitest'
import { shouldUseMobileGrainFiltering } from '../src/platform/mobile'
import { drawingBuffer } from '../src/platform/viewport'
import { FixedClock } from '../src/simulation/clock'
import { SandCamera } from '../src/render/camera'
import { StrokeQueue } from '../src/input/strokes'
import { SAND } from '../src/config'

describe('Drawing buffer policy', () => {
  test.each([[3840, 2160, 2], [7680, 4320, 2], [1440, 900, 2], [390, 844, 3]])('caps %s × %s at four million pixels', (width, height, dpr) => {
    const result = drawingBuffer(width, height, dpr)!
    expect(result.width * result.height).toBeLessThanOrEqual(4_000_000)
    expect(result.dpr).toBeLessThanOrEqual(1.7)
  })
  test('allows sub-one DPR at 4K and ignores transient empty sizes', () => {
    expect(drawingBuffer(3840, 2160, 2)!.dpr).toBeLessThan(1)
    expect(drawingBuffer(0, 200, 2)).toBeNull()
    expect(drawingBuffer(200, 0, 2)).toBeNull()
    expect(drawingBuffer(200, 200, NaN)!.dpr).toBe(1)
  })
})

describe('Mobile grain filtering selection', () => {
  test('enables the alias-safe surface path on phones and tablets', () => {
    expect(shouldUseMobileGrainFiltering({ maxTouchPoints: 5, coarsePointer: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) Mobile', width: 430, height: 932 })).toBe(true)
    expect(shouldUseMobileGrainFiltering({ maxTouchPoints: 5, coarsePointer: true, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari', width: 1024, height: 1366 })).toBe(true)
  })
  test('keeps the desktop renderer on the original shader', () => {
    expect(shouldUseMobileGrainFiltering({ maxTouchPoints: 0, coarsePointer: false, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', width: 1440, height: 900 })).toBe(false)
    expect(shouldUseMobileGrainFiltering({ maxTouchPoints: 10, coarsePointer: false, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', width: 1920, height: 1080 })).toBe(false)
  })
})

describe('Fixed simulation time', () => {
  test.each([30, 60, 120, 144])('executes 120 steps per second at %s Hz', (hz) => {
    const clock = new FixedClock(SAND.step, SAND.maxSteps)
    let steps = clock.advance(0)
    for (let frame = 1; frame <= hz; frame++) steps += clock.advance(frame * 1000 / hz)
    expect(steps).toBe(120)
  })
  test('bounds catchup and resets hidden-tab debt', () => {
    const clock = new FixedClock(SAND.step, SAND.maxSteps)
    clock.advance(0)
    expect(clock.advance(10000)).toBe(4)
    expect(clock.droppedSeconds).toBeGreaterThan(9)
    clock.reset()
    expect(clock.advance(20000)).toBe(0)
  })
})

describe('Finger sampling', () => {
  test('preserves a stroke even when released before a simulation tick', () => {
    const queue = new StrokeQueue()
    queue.begin({ x: 0, y: 0 }, 0.5)
    queue.move({ x: 0.1, y: 0 }, 0.5)
    queue.end()
    let length = 0
    for (let index = 0; index < 30; index++) {
      const stroke = queue.next()
      if (stroke.active) length += Math.hypot(stroke.to.x - stroke.from.x, stroke.to.y - stroke.from.y)
    }
    expect(length).toBeCloseTo(0.1)
    expect(queue.next().active).toBe(false)
  })
  test('preserves real gesture speed through spatial subdivision', () => {
    const velocityFor = (durationMs: number) => {
      const queue = new StrokeQueue()
      queue.begin({ x: 0, y: 0 }, 0.7, 1000)
      queue.move({ x: 0.1, y: 0 }, 0.7, 1000 + durationMs)
      queue.end()
      return queue.next().velocity.x
    }
    const fast = velocityFor(100)
    const slow = velocityFor(1000)
    expect(fast).toBeCloseTo(1, 5)
    expect(slow).toBeCloseTo(0.1, 5)
    expect(fast / slow).toBeCloseTo(10, 5)
  })
  test('hovering and a stationary press do not emit active contact', () => {
    const queue = new StrokeQueue()
    queue.move({ x: 0.04, y: -0.03 }, 0.7, 1000)
    expect(queue.next().active).toBe(false)
    queue.begin({ x: 0.04, y: -0.03 }, 0.7, 1010)
    expect(queue.next().active).toBe(false)
    queue.end()
    queue.move({ x: 0.05, y: -0.03 }, 0.7, 1020)
    expect(queue.next().active).toBe(false)
  })
  test('never bridges separate gestures', () => {
    const queue = new StrokeQueue()
    queue.begin({ x: -0.1, y: 0 }, 0.6); queue.move({ x: -0.095, y: 0 }, 0.6); queue.end()
    queue.begin({ x: 0.1, y: 0 }, 0.6); queue.move({ x: 0.105, y: 0 }, 0.6); queue.end()
    expect(queue.next().from.x).toBe(-0.1)
    expect(queue.next().from.x).toBe(0.1)
  })
  test('cancellation removes queued input', () => {
    const queue = new StrokeQueue()
    queue.begin({ x: 0, y: 0 }, 0.6)
    queue.cancel()
    expect(queue.next().active).toBe(false)
  })
  test('travelled distance is independent of input event density', () => {
    const travelled = (samples: number) => {
      const queue = new StrokeQueue()
      queue.begin({ x: -0.1, y: 0 }, 0.75, 1000)
      for (let index = 1; index <= samples; index++) {
        queue.move({ x: -0.1 + 0.2 * index / samples, y: 0 }, 0.75, 1000 + 400 * index / samples)
      }
      queue.end()
      let distance = 0
      for (;;) {
        const batch = queue.nextBatch()
        if (!batch.length) break
        for (const stroke of batch) distance += Math.hypot(stroke.to.x - stroke.from.x, stroke.to.y - stroke.from.y)
      }
      return distance
    }
    expect(travelled(4)).toBeCloseTo(0.2, 6)
    expect(travelled(240)).toBeCloseTo(0.2, 6)
  })
  test('batches independent simultaneous pointers without bridging them', () => {
    const queue = new StrokeQueue()
    queue.begin({ x: -0.12, y: -0.03 }, 0.75, 1000, 11)
    queue.begin({ x: 0.12, y: 0.03 }, 0.75, 1000, 22)
    queue.move({ x: -0.08, y: -0.03 }, 0.75, 1040, 11)
    queue.move({ x: 0.08, y: 0.03 }, 0.75, 1040, 22)
    const batch = queue.nextBatch()
    expect(batch.length).toBeGreaterThanOrEqual(2)
    expect(batch.some((stroke) => stroke.from.x < 0 && stroke.to.x < 0)).toBe(true)
    expect(batch.some((stroke) => stroke.from.x > 0 && stroke.to.x > 0)).toBe(true)
  })
})

test('camera projection and bed picking agree at center and preserve orientation', () => {
  const camera = new SandCamera()
  camera.aspect = 1.6
  const center = camera.screenToBed(800, 500, 1600, 1000)
  expect(center.x).toBeCloseTo(0)
  expect(center.y).toBeCloseTo(0)
  expect(camera.screenToBed(400, 500, 1600, 1000).x).toBeLessThan(0)
  expect(camera.screenToBed(800, 100, 1600, 1000).y).toBeLessThan(0)
})
