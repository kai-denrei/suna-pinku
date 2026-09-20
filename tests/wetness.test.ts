import { expect, test } from 'vitest'
import { WetnessField, WETNESS_SIZE } from '../src/play/wetness'
import { standaloneSurfaceHeight } from '../src/platform/surface-viewport'

test('water accumulates locally, saturates, and resets without unbounded history', () => {
  const field = new WetnessField()
  const center = (WETNESS_SIZE / 2) * WETNESS_SIZE + WETNESS_SIZE / 2
  field.drop({ x: 0, y: 0 }, 100)
  const first = field.pixels[center]
  expect(first).toBeGreaterThan(0)
  expect(field.pixels[0]).toBe(0)
  for (let i = 0; i < 30; i++) field.drop({ x: 0, y: 0 }, 200 + i)
  expect(field.pixels[center]).toBe(255)
  expect(field.splashes.length).toBe(32)
  expect([...field.pixels].filter(value => value > 0).length).toBeLessThan(200)
  const revision = field.revision
  field.drop({ x: NaN, y: 0 }, 100)
  expect(field.revision).toBe(revision)
  field.clear()
  expect(field.pixels.every(value => value === 0)).toBe(true)
})

test('iPhone standalone fills the screen in both orientations without stretching split views', () => {
  expect(standaloneSurfaceHeight(393, 791, 393, 852)).toBe(852)
  expect(standaloneSurfaceHeight(852, 350, 393, 852)).toBe(393)
  expect(standaloneSurfaceHeight(852, 393, 852, 393)).toBe(393)
  expect(standaloneSurfaceHeight(320, 700, 768, 1024)).toBe(700)
  expect(standaloneSurfaceHeight(0, 0, 393, 852)).toBe(0)
})
