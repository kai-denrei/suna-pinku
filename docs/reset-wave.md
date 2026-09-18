# Reset wash

Clicking **Start again** now triggers a timed shoreline pass instead of an instantaneous clear. The effect is coordinated in three layers:

1. `WaveResetEffect` maps the loaded `wave.mp3` duration to an incoming swash and an outgoing retreat.
2. `SandPostProcess` composites a transient water/foam overlay in screen space by intersecting each fullscreen pixel against the sand plane and evaluating one shared shoreline function.
3. `SandSolver.encodeWaveReset()` reinitializes only the newly wetted band on the bed state, so grooves are erased incrementally as the water front advances instead of all at once.

The shoreline logic is shared between rendering and erasure through `src/reset/wgsl.ts`, which keeps the visible front and the simulation clear mask aligned. The front intentionally travels with a slight diagonal tilt so the wash reads as a shallow-angle swash rather than a perfectly perpendicular wipe.
