export const SAND = {
  resolution: 512, extent: 0.8, depth: 0.032, floor: 0.003,
  repose: 0.625, dynamicRepose: 0.48, rate: 32,
  step: 1 / 120, maxSteps: 4, radius: 0.012, indentation: 0.02,
  particles: 16384,
} as const

export type Point = { x: number; y: number }
export type Stroke = {
  from: Point
  to: Point
  velocity: Point
  radius: number
  pressure: number
  active: boolean
}
export const idleStroke = (): Stroke => ({
  from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, velocity: { x: 0, y: 0 },
  radius: SAND.radius, pressure: 0, active: false,
})
