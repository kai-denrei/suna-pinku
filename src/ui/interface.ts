export type InterfaceElements = ReturnType<typeof createInterface>

export function createInterface(root: HTMLDivElement) {
  root.innerHTML = `
    <canvas class="surface" aria-label="Interactive sand bed. Drag to draw. Arrow keys move a virtual finger; hold Space to draw. Brackets change finger size. R resets and L turns the light." tabindex="0"></canvas>
    <header class="masthead"><h1>sandboard</h1><p>A study in sand</p></header>
    <span class="quiet-note">Nothing to make. Just a trace.</span>
    <p class="hint">Drag slowly. Let the grains settle.</p>
    <nav class="toolbar" aria-label="Sand tools">
      <label>Finger <input id="radius" type="range" min="6" max="22" step="1" value="12" aria-label="Finger radius in millimeters" /></label>
      <span class="divider" aria-hidden="true"></span>
      <button id="light" type="button" title="Change the direction of the light (L)">Turn light</button>
      <span class="divider" aria-hidden="true"></span>
      <button id="reset" type="button" title="Return to untouched sand (R)">Start again</button>
    </nav>
    <section class="overlay" aria-live="polite">
      <div class="boot-panel"><h2>One quiet moment.</h2><p class="status">Preparing the sand bed…</p><div class="boot-line"></div><pre class="diagnostics" hidden></pre><button id="reload" hidden>Try again</button></div>
    </section>`
  const element = <ElementType extends HTMLElement>(selector: string) => root.querySelector<ElementType>(selector)!
  element<HTMLButtonElement>('#reload').onclick = () => window.location.reload()
  return {
    canvas: element<HTMLCanvasElement>('canvas'), overlay: element<HTMLElement>('.overlay'),
    title: element<HTMLElement>('.boot-panel h2'), status: element<HTMLElement>('.status'),
    diagnostics: element<HTMLElement>('.diagnostics'), reload: element<HTMLButtonElement>('#reload'),
    radius: element<HTMLInputElement>('#radius'), light: element<HTMLButtonElement>('#light'),
    reset: element<HTMLButtonElement>('#reset'), hint: element<HTMLElement>('.hint'),
  }
}
