import { describe, expect, test } from 'vitest'
import { JewelCollection, jewelPresets, MAX_JEWELS, JEWEL_FALL_SECONDS, JEWEL_SETTLE_SECONDS } from '../src/play/jewels'
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
    const meshes = jewelMeshes()
    expect(meshes).toHaveLength(jewelPresets.length)
    for (const mesh of meshes) {
      expect(mesh.length).toBeGreaterThan(0)
      expect(mesh.length % 18).toBe(0)
      expect([...mesh].every(Number.isFinite)).toBe(true)
      for (let i = 0; i < mesh.length; i += 6) expect(Math.hypot(mesh[i+3], mesh[i+4], mesh[i+5])).toBeCloseTo(1)
    }
  })
})

test('gem weight begins after landing, suspends while held, and shares a bounded contact budget', () => {
  const jewels = new JewelCollection()
  const gem = jewels.add(jewelPresets[0], { x: 0, y: 0 }, 0.016)!
  expect(jewels.contacts(4, gem.droppedAt)).toHaveLength(0)
  const landed = jewels.contacts(4, gem.droppedAt + JEWEL_FALL_SECONDS + 0.05)
  expect(landed).toHaveLength(1)
  expect(landed[0].pressure).toBeGreaterThan(0)
  jewels.lift(gem)
  expect(jewels.contacts(4, gem.droppedAt + 2)).toHaveLength(0)
  jewels.release(gem)
  for (let i = 0; i < 20; i++) jewels.add(jewelPresets[i % jewelPresets.length], { x: i * 0.01, y: 0 }, 0.016)
  expect(jewels.contacts(4, performance.now() / 1000 + JEWEL_FALL_SECONDS + 0.05)).toHaveLength(4)
  expect(jewels.contacts(0)).toHaveLength(0)
})

test.each(jewelPresets)('$name has a renderable mesh and leaves a finite sand contact after landing', preset => {
  const jewels = new JewelCollection()
  const gem = jewels.add(preset, { x: 0, y: 0 })!
  expect(jewelMeshes()[preset.kind].length).toBeGreaterThan(0)
  const contacts = jewels.contacts(8, gem.droppedAt + JEWEL_FALL_SECONDS + 0.05)
  expect(contacts.length).toBeGreaterThan(0)
  for (const contact of contacts) {
    expect(contact.pressure).toBeGreaterThan(0)
    expect(contact.radius).toBeGreaterThan(0)
    expect(Number.isFinite(contact.from.x + contact.from.y)).toBe(true)
  }
})

test.each(jewelPresets)('$name settles after one landing and restarts only on release', preset => {
  const jewels = new JewelCollection()
  const gem = jewels.add(preset, { x: 0, y: 0 })!
  const landing = gem.droppedAt + JEWEL_FALL_SECONDS
  expect(jewels.contacts(8, landing - 0.01)).toHaveLength(0)
  const impact = jewels.contacts(8, landing + 0.01)
  const fading = jewels.contacts(8, landing + JEWEL_SETTLE_SECONDS * 0.8)
  expect(impact.length).toBeGreaterThan(0)
  expect(fading.length).toBe(impact.length)
  expect(Math.max(...fading.map(contact => contact.pressure))).toBeLessThan(Math.min(...impact.map(contact => contact.pressure)))
  expect(jewels.contacts(8, landing + JEWEL_SETTLE_SECONDS + 0.01)).toHaveLength(0)
  // Rebuilding the contact cache for another treasure must not wake this one.
  const other = jewels.add(preset, { x: 0.1, y: 0 })!
  other.droppedAt = gem.droppedAt + 5
  expect(jewels.contacts(8, other.droppedAt + JEWEL_FALL_SECONDS + 0.05).every(contact => contact.from.x > 0.05)).toBe(true)
  jewels.lift(gem)
  expect(jewels.contacts(8, landing + 0.05)).toHaveLength(0)
  jewels.release(gem)
  expect(jewels.contacts(8, gem.droppedAt)).toHaveLength(0)
  expect(jewels.contacts(8, gem.droppedAt + JEWEL_FALL_SECONDS + 0.05).length).toBeGreaterThan(0)
  expect(jewels.contacts(8, gem.droppedAt + 60)).toHaveLength(0)
})
