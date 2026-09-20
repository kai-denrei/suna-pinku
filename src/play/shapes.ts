import { dinosaurShapes } from './dinosaurs'
export { dinosaurShapes } from './dinosaurs'
import type { Point, Stroke } from '../config'

export const cuteShapes = [
  { id: 'heart', name: 'Heart', icon: '♡', path: 'M 0 0.82 C -1 0.16 -1 -0.55 -0.5 -0.65 C -0.22 -0.75 0 -0.48 0 -0.3 C 0 -0.48 0.22 -0.75 0.5 -0.65 C 1 -0.55 1 0.16 0 0.82 Z' },
  { id: 'star', name: 'Star', icon: '☆', path: 'M 0 -0.9 L 0.24 -0.29 L 0.9 -0.28 L 0.38 0.14 L 0.56 0.8 L 0 0.42 L -0.56 0.8 L -0.38 0.14 L -0.9 -0.28 L -0.24 -0.29 Z' },
  { id: 'unicorn', name: 'Unicorn', icon: '🦄', path: 'M -0.65 0.8 C -0.8 0.1 -0.6 -0.3 -0.22 -0.48 L -0.32 -0.88 L 0.02 -0.62 L 0.48 -1 L 0.25 -0.4 L 0.78 0 L 0.65 0.26 L 0.26 0.16 C 0.12 0.4 0.22 0.58 0.4 0.8 Z' },
  { id: 'bunny', name: 'Bunny', icon: '🐰', path: 'M -0.5 -0.1 C -1 -1.35 -0.12 -1.35 -0.16 -0.3 C 0.08 -1.38 0.88 -1.25 0.48 -0.08 C 1 0.45 0.56 0.9 0 0.9 C -0.75 0.9 -1 0.3 -0.5 -0.1 Z' },
  { id: 'flower', name: 'Flower', icon: '✿', path: 'M 0 -0.4 C -0.6 -1.3 -1.05 -0.3 -0.42 -0.05 C -1.4 0.1 -0.8 1.08 -0.24 0.45 C -0.12 1.4 0.9 0.9 0.4 0.3 C 1.4 0.5 1.15 -0.65 0.4 -0.38 C 0.9 -1.3 -0.2 -1.4 0 -0.4 Z' },
  { id: 'bow', name: 'Bow', icon: '🎀', path: 'M -0.1 0 C -1.3 -1.1 -1.1 1 -0.1 0 L -0.4 0.85 L 0 0.6 L 0.4 0.85 L 0.1 0 C 1.3 1 1.1 -1.1 0.1 0 Z' },
  { id: 'cat', name: 'Cat', icon: '🐱', path: 'M -0.73 -0.1 L -0.82 -0.94 L -0.28 -0.53 Q 0 -0.66 0.28 -0.53 L 0.82 -0.94 L 0.73 -0.1 C 1.1 0.94 -1.1 0.94 -0.73 -0.1 Z' },
  { id: 'dog', name: 'Dog', icon: '🐶', path: 'M -0.43 -0.54 C -1.1 -1.03 -1.2 0.65 -0.63 0.44 L -0.5 0.03 C -0.58 0.95 0.58 0.95 0.5 0.03 L 0.63 0.44 C 1.2 0.65 1.1 -1.03 0.43 -0.54 Q 0 -0.85 -0.43 -0.54 Z' },
] as const
export const shapes = [...cuteShapes, ...dinosaurShapes] as const
export type Shape = typeof shapes[number]

// SVG paths are sampled once, outside the animation loop. Contacts use the same
// conservative displacement as fingers; stamps are editable sand, not decals.
export function sampleShape(shape: { path: string }): Point[] {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', shape.path)
  const length = path.getTotalLength()
  const count = Math.ceil(length / 0.10)
  return Array.from({ length: count + 1 }, (_, i) => {
    const point = path.getPointAtLength(length * i / count)
    return { x: point.x, y: point.y }
  })
}

export function stampStrokes(points: readonly Point[], center: Point, size: number): Stroke[] {
  return points.slice(1).map((point, index) => {
    const from = { x: center.x + points[index].x * size, y: center.y + points[index].y * size }
    const to = { x: center.x + point.x * size, y: center.y + point.y * size }
    return { from, to, radius: 0.0035, pressure: 0.95, velocity: { x: 0, y: 0 }, active: true }
  })
}
