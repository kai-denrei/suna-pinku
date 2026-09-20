# Roadmap ideas

These are future ideas only. They are not implemented or included in the current release scope.

- **Sparkly goodness:** playful glitter and shimmering sand accents. Explore intensity controls, reduced-motion behavior, and an iPhone GPU budget before choosing an effect.
- **Shiny rocks and gems:** cute polished stones and sparkling gems to place in the sandbox. Decide whether they remain decorative objects or physically displace the sand.
- **Japanese stamp wheel:** a second radial selector for the requested characters and words: **愛、猫、犬、柔術、姫、亀、海、鯨**. Preserve the exact forms, including multi-character 柔術, and check their readability as sand impressions.

The shipped shape wheel currently includes Heart, Star, Unicorn, Bunny, Flower, Bow, Cat, and Dog. Future additions should keep the resting sandbox clear and accessible from the persistent sand cog.

## Possible iPhone interactions

Ideas only; no new sensor behavior ships with the shape-idle update.

- **Shake to reset:** reuse motion permission and the accelerometer, but distinguish a deliberate reset gesture from the existing playful sand shake. Consider an opt-in mode or a stronger repeated shake to avoid accidental erasure.
- **Tilt the tray:** map orientation to a continuous gravity direction so sand gathers downhill. Include a neutral-position calibration, filtering, and portrait/landscape handling.
- **Sound-reactive sand:** optional microphone input, analyzed locally for loudness or frequency bands, could make grains tremble to voice, claps, or music. No audio recording or uploading is needed. Suspend it in the background and avoid feedback from the sandbox's own sounds.
- **Share a creation:** export a sand snapshot to the iPhone share sheet.
- **Keep the screen awake:** an optional wake lock during foreground play.

Custom iPhone haptic patterns are a native-app/wrapper option; Safari's PWA does not expose the standard Vibration API for this.
