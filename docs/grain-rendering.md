# Grain-scale rendering

The simulation surface remains the existing 512-square heightfield mesh. Close-range grain detail is procedural and deliberately bounded: the fragment shader reuses its existing local grain-cell search to derive a submillimeter rounded grain height, micro-normal, crevice occlusion, mineral tint, and roughness variation. The rounded height is also written to fragment depth, so nearby particles and other depth-tested fragments see grain-scale relief instead of a perfectly smooth heightfield plane. This improves local depth cues without adding a second geometric grain mesh or a full-screen raymarch.

Airborne grains remain instanced quads for bounded vertex cost, but they no longer behave as flat depth cards. Each fragment reconstructs the front hemisphere, shades that solid normal, and writes the projected depth of the spherical surface. Grain radius scales with the mass already carried by the particle.

Environmental illumination is an analytic sky/horizon/ground response shared by bed grains and airborne grains. It adds normal-dependent diffuse fill and a restrained rough specular environment term while retaining the existing cached heightfield direct-light visibility and sky occlusion. No environment texture, temporal accumulation, extra render pass, or resolution reduction is introduced.

## Mobile alias control

The mobile artifact was isolated to the procedural grain material itself, not the simulation grid, lighting cache, or mobile layout. `grainAppearance()` places one randomly jittered grain inside every regular 0.43 mm world-space cell. In a portrait phone view, perspective drives that cell spacing through roughly one rendered pixel across the middle of the bed. Sampling the regular cell lattice at the regular framebuffer lattice creates the visible fan/ring moiré pattern. A standalone reproduction of only the grain function and camera projection produces the same pattern, while the heightfield normal signal does not produce that fan structure.

Desktop keeps the original shader unchanged. Mobile keeps the same world-space grain function as well, but once the projected grain spacing enters the alias-prone range, each framebuffer pixel takes a stable stochastic sample at a different location inside its actual world-space pixel footprint. This breaks the coherent phase relationship between the two lattices and turns the unresolved sub-pixel detail into the grain's own stochastic statistics instead of a large-scale false pattern. It does not introduce a second grain texture, blur the upper bed, or change simulation geometry. Fragment-depth grain relief is independently faded once it is too small to resolve.

## Sun glints and bloom

Reflective mineral chips stay physically tiny and sparse. Candidate chips are world-locked in the existing 4.8 mm cells, with physical radii of roughly 0.06-0.14 mm. Their visible sparkle is not produced by enlarging the mineral itself.

For each candidate, the shader computes the microfacet slope required to reflect the real sun direction into the fixed camera. Rather than testing a handful of explicit facet normals, it evaluates a broad crystal-slope distribution at that required slope and makes one deterministic Bernoulli draw per chip. This is a bounded stochastic-microfacet approximation: the chip represents many unresolved crystal faces, and only a small stable subset produce a solar flash. Changing the surface normal or light geometry changes that probability naturally.

The physical chip remains sub-pixel, but its solar reflection receives a minimum approximately one-pixel optical footprint so its energy cannot disappear between framebuffer samples. The final visible sparkle shape is intentionally completed in post as a soft optical event with a compact core, short streaks, and a smeared glow rather than as a simple white disk. Coconut/direct-light visibility attenuates the glint before it is written to the second MRT attachment (`r16float`). The base sand radiance is unchanged.

