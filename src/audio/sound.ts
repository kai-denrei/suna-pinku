import { sandWorkletSource } from './sand-worklet'

type GestureTrack = {
  x: number
  y: number
  time: number
  velocityX: number
  velocityY: number
  filteredSpeed: number
  speed: number
  pressure: number
  turn: number
  audibleUntil: number
}

const ambientVolume = 0.08
const proceduralVolume = 0.34
const minimumSampleMilliseconds = 1
const motionHoldMilliseconds = 55

function normalizedSpeed(pxPerSecond: number) {
  return Math.max(0, Math.min(1, (pxPerSecond - 24) / 1080))
}

function penPressure(event: PointerEvent) {
  return event.pointerType === 'pen' ? event.pressure : 0
}

export class SandSound {
  private readonly ambient = new Audio('/scene_assets/beach.mp3')
  private readonly gestures = new Map<number, GestureTrack>()
  private readonly unlockController = new AbortController()
  private context: AudioContext | undefined
  private sandNode: AudioWorkletNode | undefined
  private proceduralReady: Promise<void> | undefined
  private disposed = false

  constructor() {
    this.ambient.loop = true
    this.ambient.preload = 'auto'
    this.ambient.volume = ambientVolume
    this.ambient.setAttribute('playsinline', '')
    void this.playAmbient()

    const unlock = () => { void this.unlock() }
    const { signal } = this.unlockController
    window.addEventListener('pointerdown', unlock, { signal, passive: true })
    window.addEventListener('keydown', unlock, { signal })
  }

  beginPointer(event: PointerEvent) {
    if (this.disposed) return
    void this.unlock()
    this.gestures.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      time: event.timeStamp,
      velocityX: 0,
      velocityY: 0,
      filteredSpeed: 0,
      speed: 0.025,
      pressure: penPressure(event),
      turn: 0,
      audibleUntil: performance.now() + motionHoldMilliseconds,
    })
    this.sendGestureState()
  }

  movePointer(event: PointerEvent, pointerId = event.pointerId) {
    const track = this.gestures.get(pointerId)
    if (!track) return

    const dt = Math.max(minimumSampleMilliseconds, event.timeStamp - track.time) / 1000
    const dx = event.clientX - track.x
    const dy = event.clientY - track.y
    const distance = Math.hypot(dx, dy)
    const rawSpeed = distance / dt
    const blend = 1 - Math.exp(-dt * 18)
    track.filteredSpeed += (rawSpeed - track.filteredSpeed) * blend

    const velocityX = dx / dt
    const velocityY = dy / dt
    const velocityMagnitude = Math.hypot(velocityX, velocityY)
    const oldMagnitude = Math.hypot(track.velocityX, track.velocityY)
    let turn = 0
    if (velocityMagnitude > 20 && oldMagnitude > 20) {
      const dot = (velocityX * track.velocityX + velocityY * track.velocityY) / (velocityMagnitude * oldMagnitude)
      turn = Math.max(0, Math.min(1, (1 - dot) * 0.72))
    }
    const acceleration = Math.hypot(velocityX - track.velocityX, velocityY - track.velocityY) / Math.max(3000, velocityMagnitude * 8)
    turn = Math.min(1, turn + acceleration * 0.35)

    track.x = event.clientX
    track.y = event.clientY
    track.time = event.timeStamp
    track.velocityX = velocityX
    track.velocityY = velocityY
    track.speed = normalizedSpeed(track.filteredSpeed)
    track.pressure = penPressure(event)
    track.turn = turn
    if (distance > 0) track.audibleUntil = performance.now() + motionHoldMilliseconds
    this.sendGestureState()
  }

  update(now: number) {
    if (this.gestures.size) this.sendGestureState(now)
  }

  endPointer(pointerId: number) {
    if (!this.gestures.delete(pointerId)) return
    this.sendGestureState()
  }

  cancelAll() {
    if (!this.gestures.size) return
    this.gestures.clear()
    this.sendGestureState()
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.unlockController.abort()
    this.cancelAll()
    this.sandNode?.disconnect()
    this.sandNode = undefined
    if (this.context) void this.context.close()
    this.context = undefined
    this.ambient.pause()
    this.ambient.removeAttribute('src')
    this.ambient.load()
  }

  private async unlock() {
    if (this.disposed) return
    const ambient = this.playAmbient()
    const procedural = this.ensureProcedural()
    const resume = this.context?.state === 'suspended' ? this.context.resume().catch(() => undefined) : Promise.resolve()
    await Promise.allSettled([ambient, procedural, resume])
    this.sendGestureState()
  }

  private async playAmbient() {
    if (this.disposed || !this.ambient.paused) return
    await this.ambient.play().catch(() => undefined)
  }

  private ensureProcedural() {
    if (this.proceduralReady) return this.proceduralReady
    this.proceduralReady = this.createProcedural().catch((error: unknown) => {
      console.warn('[Sandboard audio] Procedural drawing sound unavailable.', error)
    })
    return this.proceduralReady
  }

  private async createProcedural() {
    if (this.disposed || this.context) return
    const context = new AudioContext({ latencyHint: 'interactive' })
    this.context = context
    const blob = new Blob([sandWorkletSource], { type: 'text/javascript' })
    const url = URL.createObjectURL(blob)
    try {
      await context.audioWorklet.addModule(url)
    } finally {
      URL.revokeObjectURL(url)
    }
    if (this.disposed) {
      await context.close()
      return
    }

    const sandNode = new AudioWorkletNode(context, 'sand-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    })
    const highpass = new BiquadFilterNode(context, { type: 'highpass', frequency: 90, Q: 0.7 })
    const presence = new BiquadFilterNode(context, { type: 'peaking', frequency: 2200, Q: 0.75, gain: -4.8 })
    const soften = new BiquadFilterNode(context, { type: 'lowpass', frequency: 4800, Q: 0.42 })
    const compressor = new DynamicsCompressorNode(context, {
      threshold: -18,
      knee: 16,
      ratio: 2.2,
      attack: 0.004,
      release: 0.09,
    })
    const master = new GainNode(context, { gain: proceduralVolume })

    sandNode.connect(highpass).connect(presence).connect(soften).connect(compressor).connect(master).connect(context.destination)
    this.sandNode = sandNode
  }

  private sendGestureState(now = performance.now()) {
    if (!this.sandNode) return
    if (!this.gestures.size) {
      this.sandNode.port.postMessage({ type: 'state', gate: 0, speed: 0, pressure: 0, turn: 0 })
      return
    }

    let strongest: GestureTrack | undefined
    let strongestEnergy = -1
    for (const track of this.gestures.values()) {
      if (track.audibleUntil < now) continue
      const energy = track.speed * (0.92 + track.pressure * 0.08)
      if (energy > strongestEnergy) {
        strongest = track
        strongestEnergy = energy
      }
    }
    if (!strongest) {
      this.sandNode.port.postMessage({ type: 'state', gate: 0, speed: 0, pressure: 0, turn: 0 })
      return
    }
    this.sandNode.port.postMessage({
      type: 'state',
      gate: 1,
      speed: strongest.speed,
      pressure: strongest.pressure,
      turn: strongest.turn,
    })
  }
}
