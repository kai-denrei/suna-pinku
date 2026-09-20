import { describe, expect, test } from 'vitest'
import { JewelCollection, jewelPresets, MAX_JEWELS } from '../src/play/jewels'
import { SandCamera } from '../src/render/camera'
import { jewelMeshes } from '../src/render/jewel-meshes'

describe('treasures', () => {
  test('bounds collection and placement, then makes room after clearing', () => {
    const jewels = new JewelCollection()
    for (let i = 0; i < MAX_JEWELS; i++) jewels.add(jewelPresets[0], { x: 99, y: -99 }, 1)
    expect(jewels.add(jewelPresets[1], { x: 0, y: 0 }, 0.02)).toBeUndefined()
    expect(jewels.items[0].position.x).toBeLessThan(0.4)
    expect(jewels.items[0].position.y).toBeGreaterThan(-0.4)
    jewels.clear()
    expect(jewels.add(jewelPresets[1], { x: 0, y: 0 }, 0.02)).toBeDefined()
  })
  test('rotation keeps treasures reachable and camera mapping reversible', () => {
    const camera = new SandCamera()
    const jewels = new JewelCollection()
    camera.aspect = 390 / 844
    const jewel = jewels.add(jewelPresets[0], camera.screenToBed(200, 750, 390, 844), 0.016)!
    const projected = camera.bedToScreen(jewel.position, 390, 844)
    expect(projected.x).toBeCloseTo(200)
    expect(projected.y).toBeCloseTo(750)
    camera.aspect = 844 / 390
    jewels.fitViewport(camera, 844, 390)
    const rotated = camera.bedToScreen(jewel.position, 844, 390)
    expect(rotated.y).toBeGreaterThanOrEqual(35.99)
    expect(rotated.y).toBeLessThanOrEqual(300.01)
    const center = camera.bedToScreen(jewel.position, 844, 390, 0.032 + jewel.size * 0.45)
    expect(jewels.hit(camera, center, 844, 390)).toBe(jewel)
  })
  test('all mesh vertices have finite unit normals', () => {
    for (const mesh of jewelMeshes()) {
      expect(mesh.length % 18).toBe(0)
      expect([...mesh].every(Number.isFinite)).toBe(true)
      for (let i = 0; i < mesh.length; i += 6) expect(Math.hypot(mesh[i+3], mesh[i+4], mesh[i+5])).toBeCloseTo(1)
    }
  })
})
