# Reset wash

Clicking **Start again** now triggers a timed shoreline pass instead of an instantaneous clear. The effect is coordinated in three layers:

1. `WaveResetEffect` maps the loaded `wave.mp3` duration to an incoming swash and an outgoing retreat.
2. `SandPostProcess` composites a transient water/foam overlay in screen space by intersecting each fullscreen pixel against the sand plane and evaluating one shared shoreline function.
3. `SandSolver.encodeWaveReset()` reinitializes only the newly wetted band on the bed state, so grooves are erased incrementally as the water front advances instead of all at once.

The shoreline logic is shared between rendering and erasure through `src/reset/wgsl.ts`, which keeps the visible front and the simulation clear mask aligned. The front intentionally travels with a slight diagonal tilt so the wash reads as a shallow-angle swash rather than a perfectly perpendicular wipe.

The erase frontier is deliberately separate from the sampled visual retreat state. It advances monotonically from just outside the near edge to beyond the far edge during the incoming phase and stores both the previous and current shoreline times. This is required for correctness when GPU submissions skip animation frames: crossing the crest in one jump still resets the entire unsampled incoming swath. The first visible strip is reset on the first frame even though water is already on-screen, and there is no crest-time or end-of-effect full-board reset fallback.

## Water appearance

The reset water remains a single fullscreen render pass over the established sand image; the timing, shared shoreline function, audio duration, and erase path are unchanged. The overlay reconstructs the camera ray and solves its intersection with the moving water surface iteratively before applying Snell refraction back onto the sand image. Refraction therefore uses the same resolved gravity/capillary surface as the visible normal and solar response rather than a flat-plane UV offset.

Reflection uses exact unpolarized air/water dielectric Fresnel over a shared HDR analytic daylight sky with cloud and circumsolar radiance. The solar disc is not duplicated in the sky reflection; direct sun is handled by the low-roughness GGX and glitter terms. Beer-Lambert extinction, shallow-water in-scatter, and small visible-spectrum dispersion are evaluated in linear light.

Caustics are generated from light transport, not a texture pattern. For each visible bed point the shader approximately inverts the sun-to-bed mapping, refracts the sun through the same live surface, projects neighboring surface samples to the bed, and uses the flat-area / refracted-area ratio as the light concentration. The wave comb intentionally avoids very fine periodic bands that turn this mapping into bead chains. There is no Voronoi/cellular caustic function, and the shoreline foam no longer uses Voronoi bubble lace. All screen-space source sampling uses explicit LOD so the shader remains valid through the non-uniform water-mask control flow.
