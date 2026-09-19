import { PlayController } from './play/controller'
import { SandSound } from './audio/sound'
import { SAND, idleStroke } from './config'
import { InputController } from './input/controller'
import type { BootMonitor } from './platform/boot'
import { createGpu } from './platform/gpu'
import { WaveResetEffect } from './reset/effect'
import { waveResetViewport } from './reset/viewport'
import { useMobileGrainFiltering, useSingleFrameResetPacing } from './platform/mobile'
import { drawingBuffer } from './platform/viewport'
import { SandRenderer } from './render/renderer'
import { FixedClock } from './simulation/clock'
import { SandSolver } from './simulation/solver'
import type { InterfaceElements } from './ui/interface'

export async function startSandboard(ui: InterfaceElements, monitor: BootMonitor) {
  const gpu = await createGpu(ui.canvas, monitor)
  const solver = new SandSolver(gpu.device)
  const renderer = new SandRenderer(gpu.device, solver, gpu.format, useMobileGrainFiltering())
  const sound = new SandSound()
  const soundReady = sound.prepare()
  const clock = new FixedClock(SAND.step, SAND.maxSteps)
  const listeners = new AbortController()
  let input: InputController | undefined
  let play: PlayController | undefined
  let animation = 0
  let stopped = false
  let framesInFlight = 0
  let resizePending = true
  let resetPending = false
  let waveResetInteractive = false
  let waveResetNeedsTransientClear = false
  const singleFrameResetPacing = useSingleFrameResetPacing()
  const resetFrameBudget = singleFrameResetPacing ? 1 : 2
  const waveReset = new WaveResetEffect()
  const setToolbarInteractive = (interactive: boolean) => {
    ui.reset.disabled = !interactive
    ui.radius.disabled = !interactive
    input?.setInteractive(interactive)
    play?.setInteractive(interactive)
    if (!interactive) solver.cancelShake()
  }

  const stop = () => {
    if (stopped) return
    stopped = true
    cancelAnimationFrame(animation)
    listeners.abort()
    input?.dispose()
    play?.dispose()
    sound.dispose()
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
    const cog = ui.cog.getBoundingClientRect()
    renderer.markings.layout(renderer.camera, window.innerWidth, window.innerHeight, cog.x + cog.width / 2, cog.y + cog.height / 2)
  }
  try {
    monitor.stage('Initializing sand transport')
    await solver.initialize()
    monitor.stage('Compiling granular lighting')
    await renderer.initialize()
    monitor.stage('Rendering the first surface')
    resize()
    const encoder = gpu.device.createCommandEncoder()
    solver.encode(encoder, [[], []])
    renderer.encode(encoder, gpu.context.getCurrentTexture().createView(), idleStroke(), performance.now())
    gpu.device.queue.submit([encoder.finish()])
    await gpu.device.queue.onSubmittedWorkDone()
    monitor.assertHealthy()
    await soundReady
    renderer.markings.start(performance.now(), window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    play = new PlayController(ui, renderer.camera, solver, () => {
      input?.setInteractive(false); input?.setInteractive(true); sound.cancelAll()
    })
    input = new InputController(ui, renderer.camera, sound, () => { resetPending = true })
    setToolbarInteractive(true)
    const frame = (now: number) => {
      if (stopped) return
      animation = requestAnimationFrame(frame)
      sound.update(now)
      const frameBudget = waveResetInteractive ? resetFrameBudget : 1
      if (document.hidden) { clock.reset(); return }
      // GPU backpressure must not erase elapsed simulation time. On iOS WebKit
      // queue completion can arrive a display interval late; resetting here
      // starves the fixed-step solver while pointer samples continue to queue.
      if (framesInFlight >= frameBudget) return
      try {
        resize()
        if (resetPending && !waveResetInteractive) {
          resetPending = false
          renderer.markings.dismiss()
          waveResetInteractive = true
          sound.cancelAll()
          waveReset.start(now, sound.playResetWave(), waveResetViewport(renderer.camera))
          waveResetNeedsTransientClear = true
          clock.reset()
          setToolbarInteractive(false)
        }
        const encoder = gpu.device.createCommandEncoder()
        const activeInput = input!
        const waveState = waveReset.update(now)
        if (waveResetInteractive) {
          clock.reset()
          if (waveResetNeedsTransientClear) {
            solver.clearTransientState(encoder)
            waveResetNeedsTransientClear = false
          }
          if (waveState.erase) solver.encodeWaveReset(encoder, waveState)
          if (waveState.justFinished) {
            waveResetInteractive = false
            clock.reset(now)
            // The final dry frame is submitted below before browser input can
            // dispatch again. Re-enable immediately at the audio endpoint;
            // the one-frame GPU gate still prevents simulation overtaking it.
            setToolbarInteractive(true)
          }
        }
        const count = waveResetInteractive ? 0 : clock.advance(now)
        if (count > 0) solver.encode(encoder, Array.from({ length: count }, () => play!.nextBatch(activeInput.strokes.nextBatch())))
        renderer.palette = play!.palette
        renderer.encode(encoder, gpu.context.getCurrentTexture().createView(), activeInput.strokes.cursor, now, activeInput.showPointer, waveState)
        gpu.device.queue.submit([encoder.finish()])
        framesInFlight++
        void gpu.device.queue.onSubmittedWorkDone().then(() => {
          framesInFlight = Math.max(0, framesInFlight - 1)
        }).catch((error: unknown) => monitor.fail(error))
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
