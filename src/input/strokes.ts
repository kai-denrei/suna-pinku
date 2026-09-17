import { SAND, idleStroke, type Point, type Stroke } from '../config'

type TimedPoint = Point & { time: number }
type Sample = TimedPoint & { pressure: number; start: boolean }

const minimumSampleSeconds = 0.0001

export class StrokeQueue {
  private samples: Sample[] = []
  private anchor: TimedPoint | undefined
  private held = false
  private currentPressure = 0.7
  private latestTime: number | undefined
  position: Point = { x: 0, y: 0 }
  radius: number = SAND.radius

  begin(point: Point, pressure: number, time?: number) {
    this.held = true
    this.push(point, pressure, true, time)
  }
  move(point: Point, pressure: number, time?: number) {
    this.position = point
    if (this.held) this.push(point, pressure, false, time)
  }
  end() { this.held = false }
  cancel() { this.held = false; this.samples.length = 0; this.anchor = undefined; this.latestTime = undefined }

  private timestamp(time?: number) {
    const fallback = (this.latestTime ?? -SAND.step * 1000) + SAND.step * 1000
    const candidate = time !== undefined && Number.isFinite(time) ? time : fallback
    const result = this.latestTime === undefined ? candidate : Math.max(this.latestTime, candidate)
    this.latestTime = result
    return result
  }

  private push(point: Point, pressure: number, start: boolean, time?: number) {
    if (!Number.isFinite(point.x + point.y + pressure)) return
    const limit = SAND.extent / 2 - 0.03
    const bounded = { x: Math.max(-limit, Math.min(limit, point.x)), y: Math.max(-limit, Math.min(limit, point.y)) }
    this.position = bounded
    this.currentPressure = Math.max(0.1, Math.min(1, pressure))
    this.samples.push({ ...bounded, pressure: this.currentPressure, start, time: this.timestamp(time) })
    if (this.samples.length > 256) {
      this.samples.splice(0, this.samples.length - 128)
      this.samples[0].start = true
    }
  }

  next(): Stroke {
    while (this.samples.length) {
      const sample = this.samples[0]
      if (sample.start || !this.anchor) {
        this.anchor = { x: sample.x, y: sample.y, time: sample.time }
        this.samples.shift()
        continue
      }
      const from = this.anchor
      const delta = { x: sample.x - from.x, y: sample.y - from.y }
      const distance = Math.hypot(delta.x, delta.y)
      if (distance <= 1e-9) {
        this.anchor = { x: sample.x, y: sample.y, time: sample.time }
        this.samples.shift()
        continue
      }
      const fraction = Math.min(1, this.radius * 0.65 / distance)
      const to = { x: from.x + delta.x * fraction, y: from.y + delta.y * fraction }
      const toTime = from.time + (sample.time - from.time) * fraction
      const duration = Math.max(minimumSampleSeconds, (toTime - from.time) / 1000)
      const velocity = { x: (to.x - from.x) / duration, y: (to.y - from.y) / duration }
      if (fraction === 1) this.samples.shift()
      this.anchor = { ...to, time: toTime }
      return { from, to, velocity, radius: this.radius, pressure: sample.pressure, active: true }
    }
    return { ...idleStroke(), from: this.position, to: this.position, radius: this.radius, pressure: this.currentPressure }
  }

  get cursor(): Stroke { return { ...idleStroke(), from: this.position, to: this.position, radius: this.radius } }
}
