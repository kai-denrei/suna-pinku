type V = [number, number, number]
export function jewelMeshes(): Float32Array[] {
  const meshes: number[][] = [[], [], [], []]
  const triangle = (mesh: number[], a: V, b: V, c: V, smooth = false) => {
    const u = b.map((v, i) => v - a[i]), v = c.map((value, i) => value - a[i])
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    const length = Math.hypot(...n) || 1
    for (const p of [a, b, c]) mesh.push(...p, ...(smooth ? [p[0] / 0.82, (p[1] - 0.82) / 0.82, p[2] / 0.82] : n.map(value => value / length)))
  }
  const ring = (angle: number, r: number, y: number): V => [Math.cos(angle) * r, y, Math.sin(angle) * r]
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4, b = (i + 1) * Math.PI / 4
    const ga = ring(a, 1, 0.27), gb = ring(b, 1, 0.27), ta = ring(a, 0.47, 0.96), tb = ring(b, 0.47, 0.96)
    triangle(meshes[0], [0, 0, 0], ga, gb)
    triangle(meshes[0], ga, ta, tb); triangle(meshes[0], ga, tb, gb)
    triangle(meshes[0], [0, 0.96, 0], tb, ta)
  }
  for (const kind of [1, 2]) {
    const count = kind === 1 ? 40 : 10
    const point = (i: number): V => {
      const a = i / count * Math.PI * 2
      if (kind === 1) return [Math.pow(Math.sin(a), 3) * 0.92, 0.16, -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 18]
      const r = i % 2 === 0 ? 1 : 0.45
      return [Math.sin(a) * r, 0.16, -Math.cos(a) * r]
    }
    for (let i = 0; i < count; i++) {
      const a = point(i), b = point((i + 1) % count)
      triangle(meshes[kind], [0, 0.53, 0], b, a)
      triangle(meshes[kind], a, b, [a[0], 0, a[2]])
      triangle(meshes[kind], b, [b[0], 0, b[2]], [a[0], 0, a[2]])
    }
  }
  const sphere = (lat: number, lon: number): V => [Math.sin(lat) * Math.cos(lon) * 0.82, 0.82 + Math.cos(lat) * 0.82, Math.sin(lat) * Math.sin(lon) * 0.82]
  for (let y = 0; y < 12; y++) for (let x = 0; x < 24; x++) {
    const a = sphere(y * Math.PI / 12, x * Math.PI / 12), b = sphere(y * Math.PI / 12, (x + 1) * Math.PI / 12)
    const c = sphere((y + 1) * Math.PI / 12, x * Math.PI / 12), d = sphere((y + 1) * Math.PI / 12, (x + 1) * Math.PI / 12)
    triangle(meshes[3], a, b, c, true); triangle(meshes[3], b, d, c, true)
  }
  return meshes.map(mesh => new Float32Array(mesh))
}
