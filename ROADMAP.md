# Roadmap ideas

These are future extensions; shipped features are noted below.

- **Sparkly goodness:** playful glitter and shimmering sand accents. Explore intensity controls, reduced-motion behavior, and an iPhone GPU budget before choosing an effect.
- **More treasures:** polished stones, more gem cuts, and rolling/collision physics. The first Kira kira collection has shipped: rose quartz, heart gem, star charm, and pearl with animated highlights and weighted, sand-displacing landings.
- **Japanese stamp wheel:** a second radial selector for the requested characters and words: **愛、猫、犬、柔術、姫、亀、海、鯨**. Preserve the exact forms, including multi-character 柔術, and check their readability as sand impressions.

The shipped shape wheel currently includes Heart, Star, Unicorn, Bunny, Flower, Bow, Cat, and Dog. Future additions should keep the resting sandbox clear and accessible from the persistent sand cog.

## Possible iPhone interactions

Ideas only; Shake and Motion controls are currently removed. Fresh Sand provides the water-wash reset.

- **Shake to reset:** use motion permission and the accelerometer with a deliberate reset gesture. Consider an opt-in mode or a stronger repeated shake to avoid accidental erasure.
- **Tilt the tray:** map orientation to a continuous gravity direction so sand gathers downhill. Include a neutral-position calibration, filtering, and portrait/landscape handling.
- **Sound-reactive sand:** optional microphone input, analyzed locally for loudness or frequency bands, could make grains tremble to voice, claps, or music. No audio recording or uploading is needed. Suspend it in the background and avoid feedback from the sandbox's own sounds.
- **Share a creation:** export a sand snapshot to the iPhone share sheet.
- **Keep the screen awake:** an optional wake lock during foreground play.

Custom iPhone haptic patterns are a native-app/wrapper option; Safari's PWA does not expose the standard Vibration API for this.

## Shareable messages

Shipped: `/#Your%20message` renders a plain-text greeting in the sand, stays until
Fresh Sand, and supports up to 120 characters with Unicode-aware wrapping.
Future additions: an in-app composer/share button, optional fading greetings, and
real mutable text grooves that fingers can erase. The current greeting uses the
same shaded relief as the opening title.
