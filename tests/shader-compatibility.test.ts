import { expect, test } from 'vitest'
import { surfaceShader } from '../src/render/shaders'
import { lightingShader } from '../src/render/lighting'
import { particleShader, simulationShader } from '../src/simulation/shaders'

const shaders = [
  ['surface', surfaceShader],
  ['lighting', lightingShader],
  ['transport', simulationShader],
  ['particles', particleShader],
] as const

test.each(shaders)('%s WGSL avoids multi-component swizzle assignment', (_name, shader) => {
  expect(shader).not.toMatch(/\.[xyzwrgba]{2,4}\s*(?:[+*/%&|^-]?=(?!=)|\+\+|--)/)
})

test.each(shaders)('%s WGSL avoids reserved local identifier active', (_name, shader) => {
  expect(shader).not.toMatch(/\blet\s+active\b/)
})

