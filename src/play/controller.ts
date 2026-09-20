import { ToolsMenu } from '../ui/tools-menu'
import { SAND, type Stroke } from '../config'
import type { SandCamera } from '../render/camera'
import type { SandSolver } from '../simulation/solver'
import type { InterfaceElements } from '../ui/interface'
import { JewelCollection, jewelPresets, type Jewel, type JewelPreset } from './jewels'
import { WaterBrush } from './water-brush'
import type { WetnessField } from './wetness'
import { shapes, sampleShape, stampStrokes, type Shape } from './shapes'

export class PlayController {
  private readonly abort = new AbortController()
  private waterMode = false
  private readonly waterBrush: WaterBrush
  private readonly ui: InterfaceElements
  private readonly jewels: JewelCollection
  private selected: Shape | JewelPreset | undefined
  private dragging: Jewel | undefined
  cancelPlacement: () => void = () => {}
  private pending: Stroke[] = []
  private activePointer: number | undefined
  private interactive = true
  private disposed = false
  private shapeIdleTimer: ReturnType<typeof setTimeout> | undefined
  private shapeIdleDeadline = Infinity
  private returnToDraw: () => void = () => {}
  private readonly samples = new Map([...shapes, ...jewelPresets].map(shape => [shape.id, sampleShape(shape)]))
  palette = 1

  constructor(ui: InterfaceElements, camera: SandCamera, solver: SandSolver, jewels: JewelCollection, wetness: WetnessField, cancelDrawing: () => void) {
    this.ui = ui
    this.jewels = jewels
    const { signal } = this.abort
    this.waterBrush = new WaterBrush(ui.canvas, camera, wetness, () => this.waterMode && this.interactive, cancelDrawing, signal)
    const preview = ui.root.querySelector<SVGSVGElement>('.stamp-preview')!
    const menu = new ToolsMenu(ui, () => {
      cancelDrawing()
      this.cancelPlacement()
      const wasPlacing = this.activePointer !== undefined
      this.activePointer = undefined
      preview.setAttribute('hidden', '')
      if (wasPlacing) this.armShapeTimeout()
      this.expireIdleShape()
    }, signal)
    const hint = (message: string) => { ui.hint.textContent = message }
    const closeDrawer = () => { ui.drawer.hidden = true; ui.shapes.setAttribute('aria-expanded', 'false') }
    const select = (shape?: Shape | JewelPreset) => {
      this.clearShapeTimeout()
      this.waterMode = false
      this.waterBrush.cancel()
      ui.water.classList.remove('selected')
      ui.water.setAttribute('aria-pressed', 'false')
      if (this.interactive) cancelDrawing()
      this.cancelPlacement()
      this.selected = shape
      this.activePointer = undefined
      preview.setAttribute('hidden', '')
      ui.draw.classList.toggle('selected', !shape)
      ui.draw.setAttribute('aria-pressed', String(!shape))
      ui.shapes.classList.toggle('selected', !!shape && !('kind' in shape))
      ui.jewels.classList.toggle('selected', !!shape && 'kind' in shape)
      ui.root.querySelectorAll<HTMLButtonElement>('[data-jewel]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.jewel === shape?.id)))
      ui.root.querySelectorAll<HTMLButtonElement>('[data-shape]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.shape === shape?.id)))
      hint(shape ? `${shape.name} ♡ tap or drag to place` : 'Draw something fleeting.')
      this.armShapeTimeout()
    }
    this.returnToDraw = () => select()
    ui.water.addEventListener('click', () => {
      select()
      this.waterMode = true
      ui.water.classList.add('selected')
      ui.water.setAttribute('aria-pressed', 'true')
      ui.draw.classList.remove('selected')
      ui.draw.setAttribute('aria-pressed', 'false')
      hint('Tap for a droplet. Hold or drag to sprinkle the sand.')
      menu.close()
    }, { signal })
    ui.reset.addEventListener('click', () => menu.close(), { signal })
    const updateCount = () => { ui.root.querySelector('#jewel-count')!.textContent = `${jewels.items.length} / 24 treasures` }
    ui.jewels.addEventListener('click', () => { closeDrawer(); ui.jewelDrawer.hidden = !ui.jewelDrawer.hidden; ui.jewels.setAttribute('aria-expanded', String(!ui.jewelDrawer.hidden)); updateCount() }, { signal })
    ui.root.querySelector('#close-jewels')!.addEventListener('click', () => { ui.jewelDrawer.hidden = true; ui.jewels.setAttribute('aria-expanded', 'false') }, { signal })
    ui.root.querySelector('#clear-jewels')!.addEventListener('click', () => { jewels.clear(); updateCount(); hint('A little room for new treasures.') }, { signal })
    ui.root.querySelectorAll<HTMLButtonElement>('[data-jewel]').forEach(button => button.addEventListener('click', () => { select(jewelPresets.find(jewel => jewel.id === button.dataset.jewel)); menu.close() }, { signal }))
    ui.draw.addEventListener('click', () => { select(); closeDrawer(); menu.close() }, { signal })
    ui.shapes.addEventListener('click', () => {
      ui.jewelDrawer.hidden = true
      ui.jewels.setAttribute('aria-expanded', 'false')
      ui.drawer.hidden = !ui.drawer.hidden
      ui.shapes.setAttribute('aria-expanded', String(!ui.drawer.hidden))
    }, { signal })
    ui.root.querySelectorAll('[data-close-shapes]').forEach(button => button.addEventListener('click', closeDrawer, { signal }))
    ui.root.querySelectorAll<HTMLButtonElement>('[data-shape-set]').forEach(button => button.addEventListener('click', () => {
      ui.root.querySelectorAll<HTMLButtonElement>('[data-shape-set]').forEach(tab => {
        const active = tab === button
        tab.setAttribute('aria-pressed', String(active))
        ui.root.querySelector<HTMLElement>(`#${tab.dataset.shapeSet}-wheel`)!.hidden = !active
      })
    }, { signal }))
    ui.root.querySelectorAll<HTMLButtonElement>('[data-shape]').forEach(button => {
      button.addEventListener('click', () => {
        select(shapes.find(shape => shape.id === button.dataset.shape))
        menu.close()
      }, { signal })
    })
    const setPalette = (palette: number) => {
      this.palette = palette
      ui.root.querySelectorAll<HTMLButtonElement>('[data-palette]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.palette) === palette)))
    }
    try { const saved = Number(localStorage.getItem('pinku-palette')); setPalette(saved === 3 ? 3 : 1) } catch { /* Storage is optional. */ }
    ui.root.querySelectorAll<HTMLButtonElement>('[data-palette]').forEach(button => button.addEventListener('click', () => {
      setPalette(Number(button.dataset.palette))
      try { localStorage.setItem('pinku-palette', String(this.palette)) } catch { /* Storage is optional. */ }
    }, { signal }))
    const cancel = () => {
      this.waterBrush.cancel()
      if (this.dragging) jewels.release(this.dragging)
      this.dragging = undefined
      const pointer = this.activePointer
      const wasPlacing = this.activePointer !== undefined
      this.activePointer = undefined
      preview.setAttribute('hidden', '')
      if (pointer !== undefined && ui.canvas.hasPointerCapture(pointer)) ui.canvas.releasePointerCapture(pointer)
      if (wasPlacing) this.armShapeTimeout()
    }
    this.cancelPlacement = cancel
    window.addEventListener('focus', () => this.expireIdleShape(), { signal })
    window.addEventListener('blur', cancel, { signal })
    window.addEventListener('resize', cancel, { signal })
    document.addEventListener('visibilitychange', () => { if (document.hidden) { cancel(); this.pending = []; solver.cancelShake() } else this.expireIdleShape() }, { signal })
    ui.canvas.addEventListener('keydown', event => { if (event.key === 'Escape') { select(); closeDrawer(); menu.close() } }, { signal })
    const locate = (event: PointerEvent) => {
      const rect = ui.canvas.getBoundingClientRect()
      return camera.screenToBed(event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height)
    }
    const showPreview = (event: PointerEvent) => {
      if (!this.selected) return
      preview.removeAttribute('hidden')
      preview.style.left = `${event.clientX}px`; preview.style.top = `${event.clientY}px`
      // Project the shape through the same camera mapping as its sand contacts.
      const center = locate(event)
      const rect = ui.canvas.getBoundingClientRect()
      const size = 'kind' in this.selected ? Number(ui.jewelSize.value) / 1000 : Number(ui.stampSize.value) / 1000
      const project = (point: { x: number; y: number }) => {
        const world = [center.x + point.x * size - camera.eye[0], SAND.depth - camera.eye[1], center.y + point.y * size - camera.eye[2]]
        const dot = (axis: readonly number[]) => world.reduce((sum, value, i) => sum + value * axis[i], 0)
        const depth = dot(camera.forward)
        return [(dot(camera.right) / (depth * camera.tanHalfFov * camera.aspect) + 1) * rect.width / 2 + rect.left - event.clientX,
          (1 - dot(camera.up) / (depth * camera.tanHalfFov)) * rect.height / 2 + rect.top - event.clientY]
      }
      const points = this.samples.get(this.selected.id)!.map(project)
      preview.setAttribute('viewBox', '-100 -100 200 200')
      preview.style.width = '200px'; preview.style.height = '200px'
      const path = preview.querySelector('path')!
      path.setAttribute('d', points.map((point, i) => `${i ? 'L' : 'M'} ${point[0]} ${point[1]}`).join(' ') + ' Z')
      path.style.strokeWidth = '2'
    }
    ui.canvas.addEventListener('pointerdown', event => {
      this.expireIdleShape()
      if (this.activePointer !== undefined) { event.stopImmediatePropagation(); event.preventDefault(); return }
      if (event.pointerType === 'mouse' && event.button !== 0) return
      if (!this.selected && this.interactive) {
        const rect = ui.canvas.getBoundingClientRect()
        const hit = jewels.hit(camera, { x: event.clientX - rect.left, y: event.clientY - rect.top }, rect.width, rect.height)
        if (hit) cancelDrawing()
        this.dragging = hit
        if (hit) jewels.lift(hit)
      }
      if (!this.selected && !this.dragging) return
      event.stopImmediatePropagation(); event.preventDefault()
      if (!this.interactive || this.activePointer !== undefined || (event.pointerType === 'mouse' && event.button !== 0)) return
      this.clearShapeTimeout()
      this.activePointer = event.pointerId
      ui.canvas.setPointerCapture(event.pointerId)
      showPreview(event)
    }, { signal, capture: true })
    ui.canvas.addEventListener('pointermove', event => {
      if (!this.selected && !this.dragging) return
      event.stopImmediatePropagation()
      if (this.dragging && this.activePointer === event.pointerId) jewels.move(this.dragging, locate(event))
      if (this.interactive && (this.activePointer === event.pointerId || (this.activePointer === undefined && event.pointerType === 'mouse'))) showPreview(event)
    }, { signal, capture: true })
    ui.canvas.addEventListener('pointerup', event => {
      if (!this.selected && !this.dragging) return
      event.stopImmediatePropagation()
      if (this.activePointer !== event.pointerId) return
      if (this.interactive && this.selected) {
        if ('kind' in this.selected) {
          const jewel = jewels.add(this.selected, locate(event), Number(ui.jewelSize.value) / 1000)
          hint(jewel ? `${this.selected.name} catches the light ✧` : '24 treasures already! Clear gems to make room.')
          updateCount()
        } else {
          // Bound queued work so rapid stamping cannot create a seconds-long backlog.
          if (this.pending.length < 240) this.pending.push(...stampStrokes(this.samples.get(this.selected.id)!, locate(event), Number(ui.stampSize.value) / 1000))
          hint(`${this.selected.name.toLowerCase()} pressed into sand ♡`)
        }
      }
      if (ui.canvas.hasPointerCapture(event.pointerId)) ui.canvas.releasePointerCapture(event.pointerId)
      cancel()
    }, { signal, capture: true })
    ui.canvas.addEventListener('pointercancel', cancel, { signal })
    ui.canvas.addEventListener('lostpointercapture', cancel, { signal })
    ui.canvas.addEventListener('pointerleave', () => { if (this.activePointer === undefined) preview.setAttribute('hidden', '') }, { signal })

  }
  private clearShapeTimeout() {
    clearTimeout(this.shapeIdleTimer)
    this.shapeIdleTimer = undefined
    this.shapeIdleDeadline = Infinity
  }
  private armShapeTimeout() {
    this.clearShapeTimeout()
    if (!this.selected || this.activePointer !== undefined || this.disposed) return
    this.shapeIdleDeadline = Date.now() + 3000
    this.shapeIdleTimer = setTimeout(() => this.expireIdleShape(), 3000)
  }
  private expireIdleShape() {
    if (this.selected && this.activePointer === undefined && Date.now() >= this.shapeIdleDeadline) this.returnToDraw()
  }
  nextBatch(strokes: readonly Stroke[]) {
    const batch = [...strokes, ...this.pending.splice(0, Math.max(0, SAND.maxContacts - strokes.length))]
    return [...batch, ...this.jewels.contacts(Math.min(4, SAND.maxContacts - batch.length))]
  }
  setInteractive(value: boolean) {
    this.interactive = value
    this.ui.root.querySelectorAll<HTMLButtonElement | HTMLInputElement>('.toolbar button, .settings button, .settings input, .drawer button, .drawer input').forEach(control => { control.disabled = !value })
    if (!value) {
      this.clearShapeTimeout()
      if (this.selected || this.waterMode) this.returnToDraw()
      this.cancelPlacement()
      this.pending = []; this.activePointer = undefined
      this.ui.root.querySelector<SVGSVGElement>('.stamp-preview')!.setAttribute('hidden', '')
    }
  }
  dispose() { this.disposed = true; this.clearShapeTimeout(); this.abort.abort(); this.waterBrush.cancel(); this.pending = [] }
}
