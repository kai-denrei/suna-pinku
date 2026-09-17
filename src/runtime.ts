import { SAND, idleStroke } from './config'
import { InputController } from './input/controller'
import type { BootMonitor } from './platform/boot'
import { createGpu } from './platform/gpu'
import { drawingBuffer } from './platform/viewport'
import { SandRenderer } from './render/renderer'
import { FixedClock } from './simulation/clock'
import { SandSolver } from './simulation/solver'
import type { InterfaceElements } from './ui/interface'

export async function startSandboard(ui: InterfaceElements, monitor: BootMonitor) {
  const gpu = await createGpu(ui.canvas, monitor)
  const solver = new SandSolver(gpu.device)
  const renderer = new SandRenderer(gpu.device, solver, gpu.format)
  const clock = new FixedClock(SAND.step, SAND.maxSteps)
  const listeners = new AbortController()
  let input: InputController | undefined
  let animation = 0
  let stopped = false
  let inFlight = false
  let resizePending = true
  let resetPending = false
  let targetLight = renderer.lightAngle
  const stop = () => {
    if (stopped) return
    stopped = true
    cancelAnimationFrame(animation)
    listeners.abort()
    input?.dispose()
    renderer.dispose(); solver.dispose(); gpu.dispose()
  }
  monitor.setStop(stop)
  const resize = () => {
    if (!resizePending) return
    const size = drawingBuffer(window.innerWidth, window.innerHeight, window.devicePixelRatio)
    if (!size) return
    resizePending = false
    ui.canvas.width = size.width; ui.canvas.height = size.height
    renderer.resize(size.width, size.height)
  }
  try {
    monitor.stage('Initializing sand transport')
    await solver.initialize()
    monitor.stage('Compiling granular lighting')
    await renderer.initialize()
    monitor.stage('Rendering the first surface')
    resize()
    const encoder = gpu.device.createCommandEncoder()
    solver.encode(encoder, [idleStroke(), idleStroke()])
    renderer.encode(encoder, gpu.context.getCurrentTexture().createView(), idleStroke())
    gpu.device.queue.submit([encoder.finish()])
    await gpu.device.queue.onSubmittedWorkDone()
    monitor.assertHealthy()
    input = new InputController(ui, renderer.camera, () => { resetPending = true }, () => { targetLight += Math.PI / 3 })
    const frame = (now: number) => {
      if (stopped) return
      animation = requestAnimationFrame(frame)
      if (document.hidden || inFlight) { clock.reset(); return }
      try {
        resize()
        if (resetPending) { solver.reset(); clock.reset(); resetPending = false }
        const count = clock.advance(now)
        const encoder = gpu.device.createCommandEncoder()
        const activeInput = input!
        solver.encode(encoder, Array.from({ length: count }, () => activeInput.strokes.next()))
        renderer.lightAngle += (targetLight - renderer.lightAngle) * 0.09
        renderer.encode(encoder, gpu.context.getCurrentTexture().createView(), activeInput.strokes.cursor, activeInput.showPointer)
        gpu.device.queue.submit([encoder.finish()])
        inFlight = true
        void gpu.device.queue.onSubmittedWorkDone().then(() => { inFlight = false }).catch((error: unknown) => monitor.fail(error))
      } catch (error) { monitor.fail(error) }
    }
    window.addEventListener('resize', () => { resizePending = true }, { signal: listeners.signal })
    window.visualViewport?.addEventListener('resize', () => { resizePending = true }, { signal: listeners.signal })
    document.addEventListener('visibilitychange', () => clock.reset(), { signal: listeners.signal })
    window.addEventListener('pagehide', stop, { once: true, signal: listeners.signal })
    import.meta.hot?.dispose(stop)
    animation = requestAnimationFrame(frame)
  } catch (error) { stop(); throw error }
}
