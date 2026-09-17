import { expect, test } from 'vitest'
import { surfaceShader } from '../src/render/shaders'
import { particleShader, simulationShader } from '../src/simulation/shaders'

test.each([
  ['surface', surfaceShader],
  ['transport', simulationShader],
  ['particles', particleShader],
])('%s WGSL avoids multi-component swizzle assignment', (_name, shader) => {
  expect(shader).not.toMatch(/\.[xyzwrgba]{2,4}\s*(?:[+*/%&|^-]?=(?!=)|\+\+|--)/)
})
