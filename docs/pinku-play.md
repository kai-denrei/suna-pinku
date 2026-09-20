# Pink sandbox interactions

The fork keeps Sandboard's WebGPU heightfield and mass-carrying airborne grains. Pink colors are material albedos, including airborne grains, with three palette variants selected by a render uniform. The default studio environment replaces the coconut shadow with a neutral 1×1 texture so no palm asset or shadow passes are required. The reset wash uses rose-tinted sky and water scattering.

Shapes are sand **imprints**, not rigid bodies or image overlays. Each SVG outline is sampled once at startup and converted to small pressure contacts at release. Preview geometry uses the renderer camera projection. Contacts share the existing eight-contact substep budget with fingers, with a bounded pending queue. Reset and page hiding discard pending stamps. Shapes can be carved through or disturbed by shaking; they have no separate persistent object state.

Shake adds a decaying, oscillating potential gradient to conservative neighbor transfers and temporarily lowers the repose threshold. The existing outgoing mass limiter and neighbor gather still own every transfer. Motion permission is requested only by the Motion button; samples are thresholded and rate limited, with gravity filtered when acceleration-only samples are unavailable. Hidden pages and resets cancel shake impulses. The manual Shake button works without sensors.

Immersive view always hides the controls and retains an exit button. It requests browser fullscreen when available, but the layout remains usable if the request is denied. On iPhone the primary app experience is a Home Screen standalone PWA; it still respects OS safe areas.

The production build emits a versioned service worker containing the exact build assets and runtime audio. Installation succeeds only after all required assets are cached. Updates wait for the prior app session to close. Precached same-origin assets ignore response Vary headers when matching, so crossorigin script/style requests still match the install-time cache entries served by Vite. Development deliberately does not register a worker, avoiding stale cached development modules. Palette choice is the only persisted sandbox state; sand drawings are not saved across reloads. iPhone GPU performance, motion behavior, and Home Screen installation require physical-device review over HTTPS.

## Sand cog, radial wheel, and opening inscription

The resting scene contains only a small cog relief at the bottom right. An invisible 64px native button over the cog supplies touch, keyboard focus, and dialog semantics. Its visible relief is shaded by the sand material itself; it does not depend on simulation state, so drawing, shake, and reset cannot permanently remove it. Resize maps its screen-space hit target back to bed coordinates, including safe-area offsets.

All tools, palettes, motion, installation, and fullscreen controls live in the cog's native modal dialog. Eight shape buttons form a radial selector, including Cat and Dog outlines. Selecting a shape or Draw closes the dialog immediately; Shake and Fresh sand also close it so the result is visible. Escape, backdrop click, and the close button dismiss the modal; arrow keys move focus around the wheel. The dialog scrolls on short screens and uses two columns in phone landscape.

“Cuteness Impermanence” is rasterized once into a lettering mask using the bundled Caveat handwritten font (SIL Open Font License). Font loading completes before the mask is drawn, and the font is precached for offline launches. The surface shader treats its mask as shallow relief, perturbing sand normals, depth, and local shading rather than compositing flat text over the canvas. It holds for four seconds after boot, then its depth erodes to zero over 3.5 seconds. Reset dismisses it immediately and never restarts it; resizing and opening menus also do not restart it. Reduced-motion mode holds it for six seconds, then removes it without animated erosion. The title appears again on a fresh page launch. These visual inscriptions do not add or remove simulated sand mass.

Publishing uses a configurable Vite base path. Audio, manifest icons, and the worker stay inside that path, and offline cache names include it so multiple projects on one GitHub Pages origin do not delete each other's caches. The `main` branch workflow runs non-GPU checks, builds using the Pages-provided base path, and publishes a Pages artifact. Hardware GPU checks remain local because the hosted runner does not provide the target device.

Shape selection returns to Draw after three seconds without use. Selection and completed stamps start a fresh deadline; hovering does not extend it. A held placement suspends the deadline until release or cancellation, so a long drag is never converted into a drawing stroke midway. Returning from a hidden page checks the deadline before accepting the next pointer, covering browser timer throttling. Reset returns to Draw and disposal clears pending timers.

## Kira kira and rotation

The second radial wheel holds four reusable treasures: rose quartz, heart gem,
star charm, and pearl. Tap or drag to place; Draw mode also lets a finger pick up
and move an existing treasure. Placement tools return to Draw after three idle
seconds. Clear gems preserves drawings; Fresh sand clears both.

Treasures are decorative surface-supported meshes, not rigid-body particles.
They sample the GPU sand height and have soft contact shadows, faceted lighting,
and slow sparkle pulses. Reduced motion freezes the pulses. A 24-object cap,
shared instanced meshes, and revision-based buffer uploads bound rendering work.
They do not yet collide, roll under gravity, or displace sand.

Viewport changes preserve the solver state and cancel active strokes/placements.
Gems outside the new viewport move just inside it to remain reachable. Orientation
is derived from committed viewport dimensions; portrait stacks the tools and
short landscape screens use two columns. Resize events, including orientation
and visual viewport changes, are coalesced while preserving the pixel budget.
