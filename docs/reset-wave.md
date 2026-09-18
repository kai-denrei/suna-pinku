# Reset wash

Clicking **Start again** now triggers a timed shoreline pass instead of an instantaneous clear. The effect is coordinated in three layers:

1. `WaveResetEffect` maps the loaded `wave.mp3` duration to an incoming swash and an outgoing retreat.
2. `SandPostProcess` composites a transient water/foam overlay in screen space by intersecting each fullscreen pixel against the sand plane and evaluating one shared shoreline function.
3. `SandSolver.encodeWaveReset()` reinitializes only the newly wetted band on the bed state, so grooves are erased incrementally as the water front advances instead of all at once.

The shoreline logic is shared between rendering and erasure through `src/reset/wgsl.ts`, which keeps the visible front and the simulation clear mask aligned. The front intentionally travels with a slight diagonal tilt so the wash reads as a shallow-angle swash rather than a perfectly perpendicular wipe.

The erase frontier is deliberately separate from the sampled visual retreat state. It advances monotonically from just outside the near edge to beyond the far edge during the incoming phase and stores both the previous and current shoreline times. This is required for correctness when GPU submissions skip animation frames: crossing the crest in one jump still resets the entire unsampled incoming swath. The first visible strip is reset on the first frame even though water is already on-screen, and there is no crest-time or end-of-effect full-board reset fallback.
