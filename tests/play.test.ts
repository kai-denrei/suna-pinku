import { expect, test } from 'vitest'
import { shakeStrength } from '../src/play/motion'
import { stampStrokes } from '../src/play/shapes'

test('motion ignores gravity-sized noise and bounds violent or invalid samples', () => {
  expect(shakeStrength(0, 0, 9.81)).toBe(0)
  expect(shakeStrength(20, 0, 0)).toBeGreaterThan(0)
  expect(shakeStrength(1000, 0, 0)).toBe(1)
  expect(shakeStrength(NaN, 0, 0)).toBe(0)
})

test('stamp placement keeps consecutive segments joined and applies world scale and position', () => {
  const strokes = stampStrokes([{ x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }], { x: 0.1, y: -0.2 }, 0.03)
  expect(strokes).toHaveLength(2)
  expect(strokes[0].from.x).toBeCloseTo(0.07)
  expect(strokes[0].to.y).toBeCloseTo(-0.17)
  expect(strokes[0].to).toEqual(strokes[1].from)
  expect(strokes.every(stroke => stroke.active && stroke.pressure > 0)).toBe(true)
})
