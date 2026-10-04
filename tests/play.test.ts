import { expect, test } from 'vitest'
import { SandCamera } from '../src/render/camera'
import { shakeStrength } from '../src/play/motion'
import { screenAlignedStamp, stampStrokes } from '../src/play/shapes'

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

test('stamp preview and contacts stay upright through portrait/landscape/portrait changes', () => {
  const camera = new SandCamera()
  const outline = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }]
  for (const [width, height] of [[390, 844], [844, 390], [390, 844]]) {
    camera.aspect = width / height
    for (const [x, y] of [[0.2, 0.25], [0.8, 0.75]]) {
      const origin = { x: width * x, y: height * y }
      const center = camera.screenToBed(origin.x, origin.y, width, height)
      const points = screenAlignedStamp(outline, center, 0.032, camera, width, height)
      const contacts = stampStrokes(points, { x: 0, y: 0 }, 1)
      const projected = points.map(point => camera.bedToScreen(point, width, height))
      expect(projected[0].x).toBeCloseTo(origin.x)
      expect(projected[0].y).toBeLessThan(origin.y)
      expect(projected[1].y).toBeCloseTo(origin.y)
      expect(projected[1].x).toBeGreaterThan(origin.x)
      expect(projected[2].x).toBeCloseTo(origin.x)
      expect(projected[2].y).toBeGreaterThan(origin.y)
      expect(projected[3].y).toBeCloseTo(origin.y)
      expect(projected[3].x).toBeLessThan(origin.x)
      expect(origin.y - projected[0].y).toBeCloseTo(projected[1].x - origin.x)
      expect(contacts[0].from).toEqual(points[0])
      expect(contacts[0].to).toEqual(points[1])
    }
  }
})
