import { SAND, type Point } from '../config'

export type Vector3 = [number, number, number]
export function normalize(vector: Vector3): Vector3 {
  const length = Math.hypot(...vector)
  return vector.map((component) => component / length) as Vector3
}
export class SandCamera {
  readonly eye: Vector3 = [0, 0.52, 0.26]
  readonly forward = normalize([0, SAND.depth - this.eye[1], -this.eye[2]])
  readonly right: Vector3 = [1, 0, 0]
  readonly up: Vector3 = [0, -this.forward[2], this.forward[1]]
  readonly distance = Math.hypot(this.eye[1] - SAND.depth, this.eye[2])
  aspect = 1
  get tanHalfFov() { return 0.22 / this.distance / Math.max(1, this.aspect) }
  bedToScreen(point: Point, width: number, height: number, elevation: number = SAND.depth): Point {
    const relative = [point.x - this.eye[0], elevation - this.eye[1], point.y - this.eye[2]]
    const dot = (axis: Vector3) => relative.reduce((sum, value, i) => sum + value * axis[i], 0)
    const depth = dot(this.forward)
    return { x: (dot(this.right) / (depth * this.tanHalfFov * this.aspect) + 1) * width / 2,
      y: (1 - dot(this.up) / (depth * this.tanHalfFov)) * height / 2 }
  }
  screenToBed(clientX: number, clientY: number, width: number, height: number): Point {
    const horizontal = (2 * clientX / width - 1) * this.tanHalfFov * this.aspect
    const vertical = (1 - 2 * clientY / height) * this.tanHalfFov
    const direction = this.forward.map((component, axis) => component + horizontal * this.right[axis] + vertical * this.up[axis])
    const distance = (SAND.depth - this.eye[1]) / direction[1]
    return { x: this.eye[0] + direction[0] * distance, y: this.eye[2] + direction[2] * distance }
  }
}
