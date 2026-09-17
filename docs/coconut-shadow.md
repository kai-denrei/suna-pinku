# Coconut tree shadow

The coconut tree in `public/scene_assets/coconut_tree.glb` is a shadow caster only. Its visible material is never drawn into the scene color buffer.

At startup the GLB is parsed directly for its transformed positions, texture coordinates, indices, and embedded alpha texture. Those meshes are rendered into a small offscreen WebGPU shadow mask from the authored sun direction. Sampling the source texture alpha is important because the palm leaves use cutout/transparent geometry; projecting raw triangles would produce large solid polygons instead of a recognizable coconut-tree silhouette.

The mask is rendered at 30 Hz and reused between updates. A low-amplitude height-weighted bend and twist makes the crown and upper trunk move slowly as if in a light breeze. The main sand pass samples this mask in bed space to attenuate direct sunlight, some sky/specular response, and reflective grain glints. This avoids adding the full tree to the scene or performing a general-purpose shadow-map pass over unrelated geometry.

Shadow placement is authored separately for desktop and mobile in normalized viewport space, then converted to bed coordinates through the existing camera projection. The desktop footprint occupies the upper-right portion of the view and intentionally extends slightly beyond the right edge; mobile uses a wider normalized footprint so the same visual role survives the narrower portrait framing.
The embedded alpha image is uploaded with `copyExternalImageToTexture`; its GPU texture includes both copy-destination and render-attachment usage because browser WebGPU implementations validate both usages for external-image copies.
