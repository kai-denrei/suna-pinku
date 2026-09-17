import { SAND, idleStroke, type Point, type Stroke } from '../config'

type Sample = Point & { pressure: number; start: boolean }

export class StrokeQueue {
  private samples: Sample[] = []
  private anchor: Point | undefined
  private held = false
  private currentPressure = 0.7
  position: Point = { x: 0, y: 0 }
  radius: number = SAND.radius

  begin(point: Point, pressure: number) {
    this.held = true
    this.push(point, pressure, true)
  }
  move(point: Point, pressure: number) {
    this.position = point
    if (this.held) this.push(point, pressure, false)
  }
  end() { this.held = false }
  cancel() { this.held = false; this.samples.length = 0; this.anchor = undefined }

  private push(point: Point, pressure: number, start: boolean) {
    if (!Number.isFinite(point.x + point.y + pressure)) return
    const limit = SAND.extent / 2 - 0.03
    const bounded = { x: Math.max(-limit, Math.min(limit, point.x)), y: Math.max(-limit, Math.min(limit, point.y)) }
    this.position = bounded
    this.currentPressure = Math.max(0.1, Math.min(1, pressure))
    this.samples.push({ ...bounded, pressure: this.currentPressure, start })
    if (this.samples.length > 256) {
      this.samples.splice(0, this.samples.length - 128)
      this.samples[0].start = true
    }
  }

  next(): Stroke {
    const sample = this.samples[0]
    if (!sample) {
      return { ...idleStroke(), from: this.position, to: this.position, radius: this.radius, pressure: this.currentPressure, active: this.held }
    }
    if (sample.start || !this.anchor) { this.anchor = { x: sample.x, y: sample.y }; sample.start = false }
    const from = this.anchor
    const distance = Math.hypot(sample.x - from.x, sample.y - from.y)
    const fraction = Math.min(1, this.radius * 0.65 / Math.max(distance, 1e-9))
    const to = { x: from.x + (sample.x - from.x) * fraction, y: from.y + (sample.y - from.y) * fraction }
    if (fraction === 1) this.samples.shift()
    this.anchor = to
    return { from, to, radius: this.radius, pressure: sample.pressure, active: true }
  }

  get cursor(): Stroke { return { ...idleStroke(), from: this.position, to: this.position, radius: this.radius } }
}
