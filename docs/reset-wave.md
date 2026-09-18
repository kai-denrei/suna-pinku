# Reset wash

Clicking **Start again** triggers a timed shoreline pass instead of an instantaneous clear. The effect is coordinated in three layers:

1. `WaveResetEffect` maps the loaded `wave.mp3` duration to an incoming swash and an outgoing retreat.
2. `SandPostProcess` renders the transient water/foam optics over the established sand image while preserving the same shoreline contract used by the simulation.
3. `SandSolver.encodeWaveReset()` reinitializes only the newly wetted band on the bed state, so grooves are erased incrementally as the water front advances instead of all at once.

The shoreline logic is shared between rendering and erasure through `src/reset/wgsl.ts`, which keeps the visible front and the simulation clear mask aligned. The front intentionally travels with a slight diagonal tilt so the wash reads as a shallow-angle swash rather than a perfectly perpendicular wipe.

The erase frontier is deliberately separate from the sampled visual retreat state. It advances monotonically from just outside the near edge to beyond the far edge during the incoming phase and stores both the previous and current shoreline times. This is required for correctness when GPU submissions skip animation frames: crossing the crest in one jump still resets the entire unsampled incoming swath. The first visible strip is reset on the first frame even though water is already on-screen, and there is no crest-time or end-of-effect full-board reset fallback.

The reset compute dispatch is conservatively row-bounded from the previous/current fronts plus the maximum possible shoreline offset. It still evaluates the exact shared shoreline function for every candidate cell, but it no longer launches workgroups over rows that cannot possibly change on that frame.

## Water appearance

The water surface is driven by a deterministic packet comb: several shore-aligned gravity packets and shorter capillary packets are envelope-modulated by deterministic low-frequency fields, domain-warped, and harmonically sharpened before their heights, slopes, and horizontal choppy displacement are summed. The expensive procedural field is evaluated once per frame on a fixed 512×512 world-space grid matching the sand simulation, rather than being regenerated independently for every output pixel and every optical query.

A second fixed-resolution pass derives the caustic concentration field from the same sampled surface. For each bed point it approximately inverts the sun-to-bed mapping, refracts the sun through the live surface, projects neighboring surface samples onto the bed, and uses the flat-area / refracted-area ratio as light concentration. The fullscreen optical pass then samples this caustic field while performing camera refraction, so the transport solve is not repeated millions of times at display resolution.

The final fullscreen composite still solves the camera ray against the moving surface iteratively and applies Snell refraction back onto the sand image. Reflection uses exact unpolarized air/water dielectric Fresnel over an HDR analytic daylight sky with cloud and circumsolar radiance. Direct sun is handled by the low-roughness GGX/glitter response. Beer-Lambert extinction, shallow-water in-scatter, visible-spectrum dispersion, foam, and caustic radiance are evaluated in linear light.

During the incoming erase, the expensive bed horizon-light field is intentionally held at its last valid state. The only cells whose geometry changes are already behind the water front, so dry visible sand keeps correct lighting while avoiding a full horizon/AO solve on every erase frame. The lighting field is recomputed once when retreat begins, before cleared sand is exposed again. Airborne particles are cleared at reset start, so their shadow and loose-grain draw passes are also skipped for the duration of the wash.

The main frame loop keeps the normal one-frame-in-flight policy while drawing, but permits at most two submitted frames during the reset wash. Input is disabled for the wash, so this adds no interaction-latency penalty and prevents a slightly-over-budget GPU frame from forcing the effect into an every-other-RAF cadence. The queue remains bounded, so slow hardware cannot accumulate an unbounded command backlog.
