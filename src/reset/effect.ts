import { SAND } from '../config'

const defaultWaveSeconds = 4.754
const enterFraction = 0.44

export const WAVE_RESET = {
  coverageMargin: 0.10,
  shorelineTilt: -0.055,
  shorelineAmplitude: 0.010,
  shorelineFrequencyA: 19.0,
  shorelineFrequencyB: 8.5,
  shorelineSpeedA: 1.35,
  shorelineSpeedB: -0.82,
  shorelineBlend: 0.46,
  shorelineFeather: 0.018,
  foamWidth: 0.042,
  foamTrail: 0.060,
  waterDepth: 0.14,
  waterOpacity: 0.66,
  waterTintStrength: 0.62,
  washGloss: 0.28,
  rippleScale: 24,
  rippleDrift: 0.38,
} as const

export type WaveResetState = {
  active: boolean
  incoming: boolean
  justStarted: boolean
  justFinished: boolean
  erase: boolean
  time: number
  previousBaseFront: number
  currentBaseFront: number
  progress: number
}

const halfExtent = SAND.extent * 0.5
const travelSpan = SAND.extent + WAVE_RESET.coverageMargin * 2
const startFront = halfExtent + WAVE_RESET.coverageMargin
const endFront = -halfExtent - WAVE_RESET.coverageMargin

function smooth(value: number) {
  const t = Math.max(0, Math.min(1, value))
  return t * t * (3 - 2 * t)
}

function frontForCoverage(coverage: number) {
  return startFront - coverage * travelSpan
}

export function idleWaveResetState(): WaveResetState {
  return {
    active: false,
    incoming: false,
    justStarted: false,
    justFinished: false,
    erase: false,
    time: 0,
    previousBaseFront: startFront,
    currentBaseFront: startFront,
    progress: 0,
  }
}

export class WaveResetEffect {
  private active = false
  private startedAt = 0
  private durationSeconds = defaultWaveSeconds
  private previousBaseFront = startFront

  start(now: number, durationSeconds?: number) {
    this.active = true
    this.startedAt = now
    this.durationSeconds = Number.isFinite(durationSeconds) && durationSeconds && durationSeconds > 0 ? durationSeconds : defaultWaveSeconds
    this.previousBaseFront = startFront
  }

  update(now: number) {
    if (!this.active) return idleWaveResetState()
    const elapsedSeconds = Math.max(0, (now - this.startedAt) / 1000)
    const enterSeconds = Math.max(this.durationSeconds * enterFraction, 0.001)
    const retreatSeconds = Math.max(this.durationSeconds - enterSeconds, 0.001)
    const previous = this.previousBaseFront
    let incoming = true
    let progress: number
    let current: number
    if (elapsedSeconds < enterSeconds) {
      progress = smooth(elapsedSeconds / enterSeconds)
      current = frontForCoverage(progress)
    } else if (elapsedSeconds < this.durationSeconds) {
      incoming = false
      progress = smooth((elapsedSeconds - enterSeconds) / retreatSeconds)
      current = frontForCoverage(1 - progress)
    } else {
      this.active = false
      this.previousBaseFront = startFront
      return {
        ...idleWaveResetState(),
        justFinished: true,
      }
    }
    const state: WaveResetState = {
      active: true,
      incoming,
      justStarted: previous === startFront && elapsedSeconds === 0,
      justFinished: false,
      erase: incoming && current < previous - 1e-5,
      time: elapsedSeconds,
      previousBaseFront: previous,
      currentBaseFront: current,
      progress,
    }
    this.previousBaseFront = current
    return state
  }
}

export { endFront, startFront }
