export type InterfaceElements = ReturnType<typeof createInterface>

export function createInterface(root: HTMLDivElement) {
  root.innerHTML = `
    <canvas class="surface" aria-label="Interactive sand bed. Drag to draw. Arrow keys move a virtual finger; hold Space to draw. Brackets change finger size. R resets." tabindex="0"></canvas>
    <header class="masthead">
      <h1 class="brand" aria-label="Sandboard">
        <span aria-hidden="true">s</span><span aria-hidden="true">a</span><span aria-hidden="true">n</span><span aria-hidden="true">d</span><span aria-hidden="true">b</span><span aria-hidden="true">o</span><span aria-hidden="true">a</span><span aria-hidden="true">r</span><span aria-hidden="true">d</span>
      </h1>
    </header>
    <nav class="toolbar" aria-label="Sand tools">
      <label>Finger <input id="radius" type="range" min="6" max="22" step="1" value="12" aria-label="Finger radius in millimeters" /></label>
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
    radius: element<HTMLInputElement>('#radius'), reset: element<HTMLButtonElement>('#reset'),
  }
}
