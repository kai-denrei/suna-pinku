import { SAND, type Point, type Stroke } from '../config'
import type { SandCamera } from '../render/camera'

export const jewelPresets = [
  { id: 'rose-quartz', name: 'Rose quartz', kind: 0, color: [1, 0.26, 0.51], path: 'M 0 -1 L 0.8 -0.35 L 0.65 0.45 L 0 1 L -0.65 0.45 L -0.8 -0.35 Z' },
  { id: 'heart-gem', name: 'Heart gem', kind: 1, color: [0.86, 0.12, 0.36], path: 'M 0 0.82 C -1 0.16 -1 -0.55 -0.5 -0.65 C -0.22 -0.75 0 -0.48 0 -0.3 C 0 -0.48 0.22 -0.75 0.5 -0.65 C 1 -0.55 1 0.16 0 0.82 Z' },
  { id: 'star-charm', name: 'Star charm', kind: 2, color: [1, 0.66, 0.18], path: 'M 0 -0.9 L 0.24 -0.29 L 0.9 -0.28 L 0.38 0.14 L 0.56 0.8 L 0 0.42 L -0.56 0.8 L -0.38 0.14 L -0.9 -0.28 L -0.24 -0.29 Z' },
  { id: 'pearl', name: 'Pearl', kind: 3, color: [1, 0.82, 0.91], path: 'M -0.85 0 A .85 .85 0 1 0 .85 0 A .85 .85 0 1 0 -.85 0 Z' },
] as const
export type JewelPreset = typeof jewelPresets[number]
export type Jewel = { id: number; preset: JewelPreset; position: Point; size: number; rotation: number; droppedAt: number; held: boolean }
export const MAX_JEWELS = 24

const footprints = [
  [{ x: 0, y: 0, radius: 0.87 }],
  [{ x: -0.34, y: -0.15, radius: 0.65 }, { x: 0.34, y: -0.15, radius: 0.65 }, { x: 0, y: 0.35, radius: 0.48 }],
  [{ x: 0, y: 0, radius: 0.58 }, ...Array.from({ length: 5 }, (_, i) => ({ x: Math.sin(i * Math.PI * 0.4) * 0.50, y: -Math.cos(i * Math.PI * 0.4) * 0.50, radius: 0.40 }))],
  [{ x: 0, y: 0, radius: 0.64 }],
]
const weights = [0.30, 0.24, 0.18, 0.34]

export class JewelCollection {
  readonly items: Jewel[] = []
  revision = 0
  private sequence = 0
  private contactCursor = 0
  private contactRevision = -1
  private contactCache: { jewel: Jewel; stroke: Stroke }[] = []
  add(preset: JewelPreset, position: Point, size: number): Jewel | undefined {
    if (this.items.length >= MAX_JEWELS) return
    const jewel = { id: ++this.sequence, preset, position: { ...position }, size: Math.min(0.028, Math.max(0.009, size)), rotation: (this.sequence % 7 - 3) * 0.09, droppedAt: performance.now() / 1000, held: false }
    this.move(jewel, position)
    this.items.push(jewel)
    return jewel
  }
  move(jewel: Jewel, position: Point) {
    const limit = SAND.extent / 2 - jewel.size * 1.5
    jewel.position = { x: Math.max(-limit, Math.min(limit, position.x)), y: Math.max(-limit, Math.min(limit, position.y)) }
    this.revision++
  }
  lift(jewel: Jewel) { jewel.held = true; this.revision++ }
  release(jewel: Jewel) { jewel.held = false; jewel.droppedAt = performance.now() / 1000; this.revision++ }
  contacts(limit: number, now = performance.now() / 1000): Stroke[] {
    if (limit <= 0) return []
    if (this.contactRevision !== this.revision) {
      this.contactRevision = this.revision
      this.contactCache = this.items.flatMap(jewel => {
        const c = Math.cos(jewel.rotation), s = Math.sin(jewel.rotation)
        return footprints[jewel.preset.kind].map(point => {
          const position = { x: jewel.position.x + (point.x * c - point.y * s) * jewel.size, y: jewel.position.y + (point.x * s + point.y * c) * jewel.size }
          return { jewel, stroke: { from: position, to: position, velocity: { x: 0, y: 0 }, radius: jewel.size * point.radius, pressure: weights[jewel.preset.kind], active: true } }
        })
      })
    }
    const batch: Stroke[] = []
    // Rotate a fixed contact budget through cached footprints; never allocate or
    // upload all 24 objects' contact geometry on each simulation step.
    for (let visited = 0; visited < this.contactCache.length && batch.length < limit; visited++) {
      const entry = this.contactCache[this.contactCursor % this.contactCache.length]
      this.contactCursor = (this.contactCursor + 1) % this.contactCache.length
      const age = now - entry.jewel.droppedAt - 0.224
      if (entry.jewel.held || age < 0) continue
      batch.push({ ...entry.stroke, pressure: entry.stroke.pressure + 0.16 * Math.exp(-age * 14) })
    }
    return batch
  }

  clear() { this.items.length = 0; this.revision++ }
  hit(camera: SandCamera, point: Point, width: number, height: number) {
    for (const jewel of [...this.items].reverse()) {
      const center = camera.bedToScreen(jewel.position, width, height, SAND.depth + jewel.size * 0.45)
      const edge = camera.bedToScreen({ x: jewel.position.x + jewel.size, y: jewel.position.y }, width, height)
      const radius = Math.max(20, Math.abs(edge.x - center.x) * 1.2)
      if (Math.hypot(center.x - point.x, center.y - point.y) <= radius) return jewel
    }
  }
  fitViewport(camera: SandCamera, width: number, height: number) {
    for (const jewel of this.items) {
      const point = camera.bedToScreen(jewel.position, width, height)
      const x = Math.max(36, Math.min(width - 36, point.x))
      const y = Math.max(36, Math.min(height - 90, point.y))
      if (x !== point.x || y !== point.y) this.move(jewel, camera.screenToBed(x, y, width, height))
    }
  }
}
