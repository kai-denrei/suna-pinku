import type { SandCamera } from '../render/camera'
import type { WetnessField } from './wetness'

export class WaterBrush {
  private pointer: number | undefined
  private interval: ReturnType<typeof setInterval> | undefined
  private x = 0
  private y = 0
  private readonly canvas: HTMLCanvasElement
  constructor(canvas: HTMLCanvasElement, camera: SandCamera, field: WetnessField, enabled: () => boolean, cancelDrawing: () => void, signal: AbortSignal) {
    this.canvas = canvas
    const drop = () => {
      if (!enabled() || document.hidden) { this.cancel(); return }
      const rect = canvas.getBoundingClientRect()
      field.drop(camera.screenToBed(this.x - rect.left, this.y - rect.top, rect.width, rect.height), performance.now())
    }
    canvas.addEventListener('pointerdown', event => {
      if (!enabled()) return
      event.stopImmediatePropagation(); event.preventDefault()
      if (this.pointer !== undefined || (event.pointerType === 'mouse' && event.button !== 0)) return
      cancelDrawing()
      this.pointer = event.pointerId; this.x = event.clientX; this.y = event.clientY
      canvas.setPointerCapture(event.pointerId)
      drop()
      this.interval = setInterval(drop, 160)
    }, { signal, capture: true })
    canvas.addEventListener('pointermove', event => {
      if (!enabled()) return
      event.stopImmediatePropagation()
      if (this.pointer === event.pointerId) { this.x = event.clientX; this.y = event.clientY }
    }, { signal, capture: true })
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) canvas.addEventListener(type, event => {
      if (!enabled() && this.pointer === undefined) return
      event.stopImmediatePropagation()
      if (this.pointer === event.pointerId) this.cancel()
    }, { signal, capture: true })
    window.addEventListener('blur', () => this.cancel(), { signal })
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.cancel() }, { signal })
    signal.addEventListener('abort', () => this.cancel(), { once: true })
  }
  cancel() {
    clearInterval(this.interval); this.interval = undefined
    const pointer = this.pointer; this.pointer = undefined
    if (pointer !== undefined && this.canvas.hasPointerCapture(pointer)) this.canvas.releasePointerCapture(pointer)
  }
}
