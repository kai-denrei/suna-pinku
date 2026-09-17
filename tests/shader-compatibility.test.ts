import { expect, test } from 'vitest'
import { surfaceShader } from '../src/render/shaders'
import { lightingShader } from '../src/render/lighting'
import { particleShader, simulationShader } from '../src/simulation/shaders'

test.each([
  ['surface', surfaceShader],
  ['lighting', lightingShader],
  ['transport', simulationShader],
  ['particles', particleShader],
])('%s WGSL avoids multi-component swizzle assignment', (_name, shader) => {
  expect(shader).not.toMatch(/\.[xyzwrgba]{2,4}\s*(?:[+*/%&|^-]?=(?!=)|\+\+|--)/)
})
