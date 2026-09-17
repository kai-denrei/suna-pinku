import type { SandCamera } from '../render/camera'
import type { InterfaceElements } from '../ui/interface'
import { StrokeQueue } from './strokes'

export class InputController {
  readonly strokes = new StrokeQueue()
  showPointer = false
  private pointerId: number | undefined
  private readonly controller = new AbortController()
  private keyboardDrawing = false

  constructor(ui: InterfaceElements, camera: SandCamera, reset: () => void, turnLight: () => void) {
    const { signal } = this.controller
    const canvas = ui.canvas
    const position = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      return camera.screenToBed(event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height)
    }
    const pressure = (event: PointerEvent) => event.pointerType === 'pen' ? event.pressure : 0.75
    canvas.addEventListener('pointerdown', (event) => {
      if (this.pointerId !== undefined || event.button !== 0) return
      this.pointerId = event.pointerId
      canvas.setPointerCapture(event.pointerId)
      canvas.focus({ preventScroll: true })
      this.strokes.begin(position(event), pressure(event), event.timeStamp)
      this.showPointer = false
      ui.hint.classList.add('hidden')
    }, { signal })
    canvas.addEventListener('pointermove', (event) => {
      if (this.pointerId !== undefined && event.pointerId !== this.pointerId) return
      const samples = event.getCoalescedEvents?.() ?? []
      for (const sample of samples.length ? samples : [event]) this.strokes.move(position(sample), pressure(sample), sample.timeStamp)
    }, { signal })
    canvas.addEventListener('pointerup', (event) => {
      if (event.pointerId !== this.pointerId) return
      this.strokes.move(position(event), pressure(event), event.timeStamp)
      this.strokes.end()
      this.pointerId = undefined
      canvas.releasePointerCapture(event.pointerId)
    }, { signal })
    const cancel = () => { this.pointerId = undefined; this.keyboardDrawing = false; this.strokes.cancel() }
    canvas.addEventListener('pointercancel', cancel, { signal })
    canvas.addEventListener('lostpointercapture', () => { if (this.pointerId !== undefined) cancel() }, { signal })
    window.addEventListener('blur', cancel, { signal })
    document.addEventListener('visibilitychange', () => { if (document.hidden) cancel() }, { signal })
    ui.radius.addEventListener('input', () => { this.strokes.radius = Number(ui.radius.value) / 1000; this.showPointer = true }, { signal })
    ui.reset.addEventListener('click', () => { cancel(); reset() }, { signal })
    ui.light.addEventListener('click', turnLight, { signal })
    canvas.addEventListener('keydown', (event) => {
      if (event.key.toLowerCase() === 'r') { cancel(); reset() }
      if (event.key.toLowerCase() === 'l' && !event.repeat) turnLight()
      if (event.code === 'Space') {
        event.preventDefault()
        if (!this.keyboardDrawing) { this.strokes.begin(this.strokes.position, 0.75, event.timeStamp); this.keyboardDrawing = true }
      }
      const movement: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
      const direction = movement[event.key]
      if (direction) {
        event.preventDefault()
        this.showPointer = true
        this.strokes.move({ x: this.strokes.position.x + direction[0] * 0.003, y: this.strokes.position.y + direction[1] * 0.003 }, 0.75, event.timeStamp)
      }
      if (event.key === '[' || event.key === ']') {
        ui.radius.value = String(Number(ui.radius.value) + (event.key === '[' ? -1 : 1))
        this.strokes.radius = Number(ui.radius.value) / 1000
        this.showPointer = true
      }
    }, { signal })
    canvas.addEventListener('keyup', (event) => {
      if (event.code === 'Space') { this.strokes.end(); this.keyboardDrawing = false }
    }, { signal })
  }
  dispose() { this.controller.abort(); this.strokes.cancel() }
}
