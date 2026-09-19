export function shakeStrength(x: number, y: number, z: number) {
  if (![x, y, z].every(Number.isFinite)) return 0
  return Math.min(1, Math.max(0, (Math.hypot(x, y, z) - 12) / 18))
}

type MotionPermission = typeof DeviceMotionEvent & { requestPermission?: () => Promise<string> }
export class PhoneMotion {
  private enabled = false
  private lastShake = -Infinity
  private gravity = [0, 0, 0]
  private primed = false
  private readonly trigger: (strength: number) => void
  constructor(trigger: (strength: number) => void) { this.trigger = trigger }
  private onMotion = (event: DeviceMotionEvent) => {
    if (document.hidden || !this.enabled) { this.primed = false; return }
    const raw = event.accelerationIncludingGravity
    const direct = event.acceleration
    let values: number[]
    if (direct?.x != null && direct.y != null && direct.z != null) values = [direct.x, direct.y, direct.z]
    else {
      if (raw?.x == null || raw.y == null || raw.z == null) return
      const sample = [raw.x, raw.y, raw.z]
      if (!this.primed) { this.gravity = sample; this.primed = true; return }
      values = sample.map((value, index) => {
        this.gravity[index] += (value - this.gravity[index]) * 0.15
        return value - this.gravity[index]
      })
    }
    const strength = shakeStrength(values[0], values[1], values[2])
    const now = performance.now()
    if (strength > 0 && now - this.lastShake > 450) {
      this.lastShake = now
      this.trigger(strength)
    }
  }
  async toggle(): Promise<boolean> {
    if (this.enabled) { this.dispose(); return false }
    if (!window.isSecureContext || typeof DeviceMotionEvent === 'undefined') throw new Error('Motion is unavailable here. Use the Shake button ♡')
    const permission = (DeviceMotionEvent as MotionPermission).requestPermission
    if (permission && await permission.call(DeviceMotionEvent) !== 'granted') throw new Error('Motion wasn’t enabled. The Shake button still works ♡')
    this.enabled = true
    this.primed = false
    window.addEventListener('devicemotion', this.onMotion)
    return true
  }
  dispose() { this.enabled = false; this.primed = false; window.removeEventListener('devicemotion', this.onMotion) }
}
