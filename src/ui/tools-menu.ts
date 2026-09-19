import type { InterfaceElements } from './interface'

export class ToolsMenu {
  private readonly ui: InterfaceElements
  constructor(ui: InterfaceElements, cancelDrawing: () => void, signal: AbortSignal) {
    this.ui = ui
    ui.cog.addEventListener('click', () => {
      cancelDrawing()
      ui.tools.showModal()
      ui.cog.setAttribute('aria-expanded', 'true')
    }, { signal })
    ui.root.querySelector('#close-tools')!.addEventListener('click', () => this.close(), { signal })
    ui.tools.addEventListener('close', () => { ui.cog.setAttribute('aria-expanded', 'false') }, { signal })
    ui.tools.addEventListener('click', event => {
      const rect = ui.tools.getBoundingClientRect()
      if (event.target === ui.tools && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) this.close()
    }, { signal })
    const shapeButtons = [...ui.root.querySelectorAll<HTMLButtonElement>('[data-shape]')]
    shapeButtons.forEach((button, index) => button.addEventListener('keydown', event => {
      const movement: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }
      const direction = movement[event.key]
      if (!direction) return
      event.preventDefault()
      shapeButtons[(index + direction + shapeButtons.length) % shapeButtons.length].focus()
    }, { signal }))
    const setFullscreen = (enabled: boolean) => {
      ui.fullscreen.setAttribute('aria-pressed', String(enabled))
      ui.fullscreen.setAttribute('aria-label', enabled ? 'Exit full screen' : 'Enter full screen')
      ui.fullscreen.textContent = enabled ? '⊙ Exit full screen' : '⛶ Full screen'
    }
    ui.fullscreen.addEventListener('click', () => {
      this.close()
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
      else if (document.documentElement.requestFullscreen) void document.documentElement.requestFullscreen().catch(() => {
        ui.hint.textContent = 'For an edge-to-edge app on iPhone, use Keep me → Add to Home Screen.'
      })
    }, { signal })
    document.addEventListener('fullscreenchange', () => setFullscreen(!!document.fullscreenElement), { signal })
    const installDialog = ui.root.querySelector<HTMLDialogElement>('#install-dialog')!
    ui.root.querySelector('#install')!.addEventListener('click', () => { this.close(); installDialog.showModal() }, { signal })
    ui.root.querySelector('#close-install')!.addEventListener('click', () => installDialog.close(), { signal })
  }
  close() { this.ui.tools.close(); this.ui.cog.setAttribute('aria-expanded', 'false') }
}
