import type { SandSound } from '../audio/sound'
import type { SandCamera } from '../render/camera'
import type { InterfaceElements } from '../ui/interface'
import { StrokeQueue } from './strokes'

const keyboardPointerId = -1

export class InputController {
  readonly strokes = new StrokeQueue()
  showPointer = false
  private readonly pointers = new Set<number>()
  private readonly controller = new AbortController()
  private keyboardDrawing = false

  constructor(ui: InterfaceElements, camera: SandCamera, sound: SandSound, reset: () => void) {
    const { signal } = this.controller
    const canvas = ui.canvas
    const position = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      return camera.screenToBed(event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height)
    }
    const pressure = (event: PointerEvent) => event.pointerType === 'pen' ? event.pressure : 0.75
    canvas.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      if (this.pointers.has(event.pointerId)) return
      this.pointers.add(event.pointerId)
      canvas.setPointerCapture(event.pointerId)
      canvas.focus({ preventScroll: true })
      this.strokes.begin(position(event), pressure(event), event.timeStamp, event.pointerId)
      sound.beginPointer(event)
      this.showPointer = false
    }, { signal })
    canvas.addEventListener('pointermove', (event) => {
      const samples = event.getCoalescedEvents?.() ?? []
      for (const sample of samples.length ? samples : [event]) {
        this.strokes.move(position(sample), pressure(sample), sample.timeStamp, event.pointerId)
        sound.movePointer(sample, event.pointerId)
      }
    }, { signal })
    canvas.addEventListener('pointerup', (event) => {
      if (!this.pointers.has(event.pointerId)) return
      this.strokes.move(position(event), pressure(event), event.timeStamp, event.pointerId)
      sound.movePointer(event)
      this.strokes.end(event.pointerId)
      sound.endPointer(event.pointerId)
      this.pointers.delete(event.pointerId)
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    }, { signal })
    const cancelPointer = (pointerId: number) => {
      this.pointers.delete(pointerId)
      this.strokes.cancel(pointerId)
      sound.endPointer(pointerId)
    }
    const cancelAll = () => {
      this.pointers.clear()
      this.keyboardDrawing = false
      this.strokes.cancel()
      sound.cancelAll()
    }
    canvas.addEventListener('pointercancel', (event) => cancelPointer(event.pointerId), { signal })
    canvas.addEventListener('lostpointercapture', (event) => { if (this.pointers.has(event.pointerId)) cancelPointer(event.pointerId) }, { signal })
    window.addEventListener('blur', cancelAll, { signal })
    document.addEventListener('visibilitychange', () => { if (document.hidden) cancelAll() }, { signal })
    ui.radius.addEventListener('input', () => { this.strokes.radius = Number(ui.radius.value) / 1000; this.showPointer = true }, { signal })
    ui.reset.addEventListener('click', () => { cancelAll(); reset() }, { signal })
    canvas.addEventListener('keydown', (event) => {
      if (event.key.toLowerCase() === 'r') { cancelAll(); reset() }
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
  dispose() { this.controller.abort(); this.strokes.cancel() }
}
