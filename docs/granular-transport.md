# Granular transport and contact

The bed uses paired transfers on eight links per cell. Cardinal weights are 2/3 and diagonal weights are 1/6: the resulting nine-point stencil has the same second-order diffusion scale as the former cardinal stencil, with isotropic fourth-order truncation error in the linear regime. Repose thresholds use the actual link length, including the diagonal sqrt(2) factor. This reduces grid-aligned flow bias; it is not a fully rotation-invariant granular continuum model.

All eight outgoing amounts share one available-height limiter. Integration gathers the opposite link from each valid neighbor, including at edges and corners. Never clamp the integrated height to hide a conservation failure. Particle launch reserves must subtract the sum of all eight transfers, and launch direction and bed velocity must include diagonal displacement.

The flux buffer costs 8 MiB at 512 squared (4 MiB more than cardinal-only transport). Dispatch count, state buffers, render workload, and fixed-step budget are unchanged. Neighbor work increases from four to eight; hardware tests check correctness, not a universal frame-time guarantee.

Loose grains collide against the same two triangles used by the surface mesh. Contact height and normal come from four neighboring heights, not a nearest-cell staircase. Restitution acts only on incoming normal velocity; Coulomb-style tangential friction dissipates energy. The existing short flight lifetime and fixed-point deposition keep this bounded. This remains a heightfield/ballistic hybrid, not particle-particle contact dynamics or an MPM solver.

GPU regressions cover diagonal spread, symmetric diagonal neighbors, edge/corner conservation, bed floor bounds, signed-slope impacts, impact energy loss, redeposition, persistent grooves, and offscreen rendering. Browser visual review remains manual.
