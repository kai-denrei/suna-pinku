import { INTRO_TITLE } from '../render/markings'
import { jewelPresets } from '../play/jewels'
import { shapes } from '../play/shapes'
export type InterfaceElements = ReturnType<typeof createInterface>

export function createInterface(root: HTMLDivElement) {
  root.innerHTML = `
    <canvas class="surface" aria-label="Pink sand garden. Drag to draw. Arrow keys move a virtual finger; hold Space to draw. R resets." tabindex="0"></canvas>
    <h1 class="sr-only" id="intro-title">${INTRO_TITLE}</h1>
    <button id="sand-cog" aria-label="Open sand tools" aria-haspopup="dialog" aria-controls="tool-dialog" aria-expanded="false" title="Sand tools"></button>
    <dialog id="tool-dialog" class="toybox" aria-labelledby="tools-title">
      <header class="tools-heading"><h2 id="tools-title">Little rituals</h2><button id="close-tools" aria-label="Close sand tools">×</button></header>
      <div class="drawer" id="drawer">

        <div class="shapes" role="group" aria-label="Shape wheel">${shapes.map((shape, index) => {
          const angle = (index * 45 - 90) * Math.PI / 180
          return `<button type="button" data-shape="${shape.id}" aria-pressed="false" style="--x:${Math.cos(angle) * 37}%;--y:${Math.sin(angle) * 37}%"><svg viewBox="-1.5 -1.5 3 3" aria-hidden="true"><path d="${shape.path}" /></svg><span>${shape.name}</span></button>`
        }).join('')}<button id="close-shapes" class="wheel-center" aria-label="Hide shape wheel"><span aria-hidden="true">♡</span><span>make a mark</span></button></div>
        <label class="size-label">Stamp size <input id="stamp-size" type="range" min="18" max="55" value="32" aria-label="Stamp size"></label>
        <p>Pick a shape, then tap the sand. Drag to place it just right.</p>
      </div>
      <div class="drawer" id="jewel-drawer" hidden>
        <div class="shapes jewels" role="group" aria-label="Kira kira wheel">${jewelPresets.map((jewel, index) => {
          const angle = (index * 90 - 90) * Math.PI / 180
          return `<button type="button" data-jewel="${jewel.id}" aria-pressed="false" style="--x:${Math.cos(angle) * 37}%;--y:${Math.sin(angle) * 37}%"><svg viewBox="-1.5 -1.5 3 3" aria-hidden="true"><path d="${jewel.path}" /></svg><span>${jewel.name}</span></button>`
        }).join('')}<button id="close-jewels" class="wheel-center" aria-label="Hide Kira kira wheel"><span aria-hidden="true">✧</span><span>kira kira</span></button></div>
        <button id="clear-jewels">Clear gems</button><p id="jewel-count">0 / 24 treasures</p>
        <p>Tap to drop a treasure. In Draw, drag it to move it.</p>
      </div>
      <nav class="toolbar" aria-label="Play tools">
        <button id="draw" class="selected" aria-pressed="true"><span aria-hidden="true">〰</span>Draw</button>
        <button id="shapes" aria-expanded="true" aria-controls="drawer"><span aria-hidden="true">♡</span>Shapes</button>
        <button id="jewels" aria-expanded="false" aria-controls="jewel-drawer"><span aria-hidden="true">✦</span>Kira kira</button>
        <button id="shake"><span aria-hidden="true">✧</span>Shake</button>
        <button id="reset"><span aria-hidden="true">↻</span>Fresh sand</button>
      </nav>
      <div class="settings">
        <label class="brush-label">Brush <input id="radius" type="range" min="6" max="22" value="12" aria-label="Brush size"></label>
        <div class="swatches" aria-label="Sand color"><button data-palette="0" class="swatch sakura" aria-label="Sakura pink" aria-pressed="true"></button><button data-palette="1" class="swatch candy" aria-label="Candy pink" aria-pressed="false"></button><button data-palette="2" class="swatch lilac" aria-label="Lilac pink" aria-pressed="false"></button></div>
        <button id="motion" aria-pressed="false">Motion off</button>
      </div>
      <div class="extra-tools"><button id="install" type="button">♡ Keep me</button><button id="fullscreen" type="button" aria-label="Enter immersive view" aria-pressed="false">⛶ Full screen</button></div>
      <p class="hint" id="hint" role="status">Choose a shape, or draw something fleeting.</p>
    </dialog>
    <svg class="stamp-preview" viewBox="-1.5 -1.5 3 3" aria-hidden="true" hidden><path /></svg>
    <dialog id="install-dialog"><button id="close-install" class="dialog-close" aria-label="Close install instructions">×</button><div class="dialog-heart" aria-hidden="true">♡</div><h2>Your pocket of pink</h2><p>On iPhone, open this page in Safari, tap Share, then <strong>Add to Home Screen</strong> and open it as a web app.</p><p>On other devices, use your browser’s Install app option. Once cached, your sandbox works offline.</p><p class="offline-status" role="status"></p></dialog>
    <section class="overlay" aria-live="polite">
      <div class="boot-panel"><div class="dialog-heart" aria-hidden="true">♡</div><h2>A pocket of pink.</h2><p class="status">Fluffing up your sand…</p><div class="boot-line"></div><pre class="diagnostics" hidden></pre><button id="reload" hidden>Try again</button></div>
    </section>`
  const element = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!
  element<HTMLButtonElement>('#reload').onclick = () => window.location.reload()
  return {
    root, canvas: element<HTMLCanvasElement>('canvas'), overlay: element<HTMLElement>('.overlay'),
    title: element<HTMLElement>('.boot-panel h2'), status: element<HTMLElement>('.status'),
    diagnostics: element<HTMLElement>('.diagnostics'), reload: element<HTMLButtonElement>('#reload'),
    radius: element<HTMLInputElement>('#radius'), reset: element<HTMLButtonElement>('#reset'),
    tools: element<HTMLDialogElement>('#tool-dialog'), cog: element<HTMLButtonElement>('#sand-cog'),
    hint: element<HTMLElement>('#hint'), drawer: element<HTMLElement>('#drawer'),
    draw: element<HTMLButtonElement>('#draw'), shapes: element<HTMLButtonElement>('#shapes'),
    jewels: element<HTMLButtonElement>('#jewels'), jewelDrawer: element<HTMLElement>('#jewel-drawer'),
    shake: element<HTMLButtonElement>('#shake'), motion: element<HTMLButtonElement>('#motion'),
    fullscreen: element<HTMLButtonElement>('#fullscreen'), stampSize: element<HTMLInputElement>('#stamp-size'),
  }
}
