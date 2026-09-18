import type { SandSound } from '../audio/sound'
import type { SandCamera } from '../render/camera'
import type { InterfaceElements } from '../ui/interface'
import { StrokeQueue } from './strokes'

const keyboardPointerId = -1

export class InputController {
  readonly strokes = new StrokeQueue()
  showPointer = false
  private readonly pointers = new Set<number>()
  private readonly pointerStartedAt = new Map<number, number>()
  private readonly suppressedPointers = new Set<number>()
  private readonly controller = new AbortController()
  private readonly canvas: HTMLCanvasElement
  private keyboardDrawing = false
  private interactive = true
  private interactiveSince = -Infinity

  constructor(ui: InterfaceElements, camera: SandCamera, sound: SandSound, reset: () => void) {
    const { signal } = this.controller
    const canvas = ui.canvas
    this.canvas = canvas
    const position = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      return camera.screenToBed(event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height)
    }
    const pressure = (event: PointerEvent) => event.pointerType === 'pen' ? event.pressure : 0.75
    const eventTimelineTime = (event: PointerEvent) => event.timeStamp > performance.timeOrigin ? event.timeStamp - performance.timeOrigin : event.timeStamp
    const isOlderThanCurrentPointer = (event: PointerEvent) => {
      const startedAt = this.pointerStartedAt.get(event.pointerId)
      if (startedAt === undefined) return false
      const eventTime = eventTimelineTime(event)
      return Number.isFinite(eventTime) && eventTime > 0 && eventTime < startedAt
    }
    canvas.addEventListener('pointerdown', (event) => {
      const eventTime = eventTimelineTime(event)
      // A delayed event from an older WebKit pointer generation must never
      // suppress or replace an already accepted contact that reused the ID.
      if (this.pointers.has(event.pointerId)) return
      const staleLockedEvent = Number.isFinite(eventTime) && eventTime > 0 && eventTime < this.interactiveSince
      if (!this.interactive || staleLockedEvent) {
        this.suppressedPointers.add(event.pointerId)
        return
      }
      this.suppressedPointers.delete(event.pointerId)
      if (event.pointerType === 'mouse' && event.button !== 0) return
      const startedAt = Number.isFinite(eventTime) && eventTime > 0 ? eventTime : performance.now()
      this.pointers.add(event.pointerId)
      this.pointerStartedAt.set(event.pointerId, startedAt)
      canvas.setPointerCapture(event.pointerId)
      canvas.focus({ preventScroll: true })
      this.strokes.begin(position(event), pressure(event), startedAt, event.pointerId)
      sound.beginPointer(event)
      this.showPointer = false
    }, { signal })
    canvas.addEventListener('pointermove', (event) => {
      if (!this.interactive || this.suppressedPointers.has(event.pointerId) || isOlderThanCurrentPointer(event)) return
      const samples = event.getCoalescedEvents?.() ?? []
      for (const sample of samples.length ? samples : [event]) {
        if (isOlderThanCurrentPointer(sample)) continue
        this.strokes.move(position(sample), pressure(sample), eventTimelineTime(sample), event.pointerId)
        sound.movePointer(sample, event.pointerId)
      }
    }, { signal })
    canvas.addEventListener('pointerup', (event) => {
      if (this.suppressedPointers.has(event.pointerId) && !this.pointers.has(event.pointerId)) {
        this.suppressedPointers.delete(event.pointerId)
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
        return
      }
      if (isOlderThanCurrentPointer(event)) return
      if (!this.interactive && !this.pointers.has(event.pointerId)) return
      if (!this.pointers.has(event.pointerId)) return
      this.strokes.move(position(event), pressure(event), eventTimelineTime(event), event.pointerId)
      sound.movePointer(event)
      this.strokes.end(event.pointerId)
      sound.endPointer(event.pointerId)
      this.pointers.delete(event.pointerId)
      this.pointerStartedAt.delete(event.pointerId)
      this.suppressedPointers.delete(event.pointerId)
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    }, { signal })
    const cancelPointer = (pointerId: number) => {
      this.suppressedPointers.delete(pointerId)
      this.pointers.delete(pointerId)
      this.pointerStartedAt.delete(pointerId)
      this.strokes.cancel(pointerId)
      sound.endPointer(pointerId)
    }
    const cancelAll = (suppressActive = false) => {
      const activePointers = [...this.pointers]
      if (suppressActive) for (const pointerId of activePointers) this.suppressedPointers.add(pointerId)
      this.pointers.clear()
      this.pointerStartedAt.clear()
      for (const pointerId of activePointers) {
        if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId)
      }
      this.keyboardDrawing = false
      this.strokes.cancel()
      sound.cancelAll()
    }
    canvas.addEventListener('pointercancel', (event) => { if (!isOlderThanCurrentPointer(event)) cancelPointer(event.pointerId) }, { signal })
    canvas.addEventListener('lostpointercapture', (event) => {
      if (this.pointers.has(event.pointerId) && !isOlderThanCurrentPointer(event)) cancelPointer(event.pointerId)
    }, { signal })
    window.addEventListener('blur', () => cancelAll(), { signal })
    document.addEventListener('visibilitychange', () => { if (document.hidden) cancelAll() }, { signal })
    ui.radius.addEventListener('input', () => { this.strokes.radius = Number(ui.radius.value) / 1000; this.showPointer = true }, { signal })
    ui.reset.addEventListener('click', () => { if (!this.interactive) return; cancelAll(true); reset() }, { signal })
    canvas.addEventListener('keydown', (event) => {
      if (event.key.toLowerCase() === 'r') { if (!this.interactive) return; cancelAll(true); reset() }
      if (!this.interactive) return
      if (event.code === 'Space') {
        event.preventDefault()
        if (!this.keyboardDrawing) { this.strokes.begin(this.strokes.position, 0.75, event.timeStamp, keyboardPointerId); this.keyboardDrawing = true }
      }
      const movement: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
      const direction = movement[event.key]
      if (direction) {
        event.preventDefault()
        this.showPointer = true
        this.strokes.move({ x: this.strokes.position.x + direction[0] * 0.003, y: this.strokes.position.y + direction[1] * 0.003 }, 0.75, event.timeStamp, keyboardPointerId)
      }
      if (event.key === '[' || event.key === ']') {
        ui.radius.value = String(Number(ui.radius.value) + (event.key === '[' ? -1 : 1))
        this.strokes.radius = Number(ui.radius.value) / 1000
        this.showPointer = true
      }
    }, { signal })
    canvas.addEventListener('keyup', (event) => {
      if (event.code === 'Space') { this.strokes.end(keyboardPointerId); this.keyboardDrawing = false }
    }, { signal })
  }

  setInteractive(interactive: boolean) {
    if (this.interactive === interactive) return
    this.interactive = interactive
    if (!interactive) {
      const activePointers = [...this.pointers]
      for (const pointerId of activePointers) this.suppressedPointers.add(pointerId)
      this.pointers.clear()
      this.pointerStartedAt.clear()
      for (const pointerId of activePointers) {
        if (this.canvas.hasPointerCapture(pointerId)) this.canvas.releasePointerCapture(pointerId)
      }
      this.keyboardDrawing = false
      this.showPointer = false
      this.strokes.cancel()
      return
    }

    // Start every post-reset interaction from a completely clean queue. Any
    // touch that physically began while locked remains quarantined until its
    // pointerup/cancel, and delayed WebKit events older than this boundary are
    // rejected by their event timestamp.
    this.strokes.cancel()
    this.interactiveSince = performance.now()
  }

  dispose() { this.controller.abort(); this.pointers.clear(); this.pointerStartedAt.clear(); this.suppressedPointers.clear(); this.strokes.cancel() }
}
