import { SAND, type Point } from '../config'

export const WETNESS_SIZE = 256
export const DROP_RADIUS = 0.019
export const MAX_SPLASHES = 8

// A bounded moisture field: only nearby texels change when a droplet lands.
// Moisture affects material appearance, not sand mass or solver stability.
export class WetnessField {
  readonly pixels = new Uint8Array(WETNESS_SIZE * WETNESS_SIZE)
  readonly splashes = new Float32Array(MAX_SPLASHES * 4)
  revision = 0
  private nextSplash = 0
  constructor() { this.clear() }
  drop(point: Point, now: number) {
    if (![point.x, point.y, now].every(Number.isFinite)) return
    const cx = (point.x / SAND.extent + 0.5) * WETNESS_SIZE
    const cy = (point.y / SAND.extent + 0.5) * WETNESS_SIZE
    const radius = DROP_RADIUS / SAND.extent * WETNESS_SIZE
    const reach = Math.ceil(radius * 1.2)
    for (let y = Math.max(0, Math.floor(cy - reach)); y <= Math.min(WETNESS_SIZE - 1, cy + reach); y++) {
      for (let x = Math.max(0, Math.floor(cx - reach)); x <= Math.min(WETNESS_SIZE - 1, cx + reach); x++) {
        const dx = (x + 0.5 - cx) / radius, dy = (y + 0.5 - cy) / radius
        const edge = 1 + 0.07 * Math.sin(x * 1.3 + y * 0.7) + 0.04 * Math.cos(y * 1.9)
        const falloff = Math.max(0, 1 - Math.hypot(dx, dy) / edge)
        const index = y * WETNESS_SIZE + x
        this.pixels[index] = Math.min(255, this.pixels[index] + Math.round(190 * Math.sqrt(falloff)))
      }
    }
    this.splashes.set([point.x, point.y, now / 1000, DROP_RADIUS], this.nextSplash * 4)
    this.nextSplash = (this.nextSplash + 1) % MAX_SPLASHES
    this.revision++
  }
  clear() {
    this.pixels.fill(0)
    for (let i = 0; i < MAX_SPLASHES; i++) this.splashes.set([0, 0, -1000, 0], i * 4)
    this.revision++
  }
}
