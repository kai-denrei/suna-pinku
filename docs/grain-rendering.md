# Grain-scale rendering

The simulation surface remains the existing 512-square heightfield mesh. Close-range grain detail is procedural and deliberately bounded: the fragment shader reuses its existing local grain-cell search to derive a submillimeter rounded grain height, micro-normal, crevice occlusion, mineral tint, and roughness variation. The rounded height is also written to fragment depth, so nearby particles and other depth-tested fragments see grain-scale relief instead of a perfectly smooth heightfield plane. This improves local depth cues without adding a second geometric grain mesh or a full-screen raymarch.

Airborne grains remain instanced quads for bounded vertex cost, but they no longer behave as flat depth cards. Each fragment reconstructs the front hemisphere, shades that solid normal, and writes the projected depth of the spherical surface. Grain radius scales with the mass already carried by the particle.

Environmental illumination is an analytic sky/horizon/ground response shared by bed grains and airborne grains. It adds normal-dependent diffuse fill and a restrained rough specular environment term while retaining the existing cached heightfield direct-light visibility and sky occlusion. No environment texture, temporal accumulation, extra render pass, or resolution reduction is introduced.
