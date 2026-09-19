import { expect, test } from 'vitest'
import { introDepth } from '../src/render/markings'

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
