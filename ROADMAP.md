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

Proposed URL form: `/#Your%20message` (under the deployed site's base path).
Read a decoded fragment as plain text, cap length, and wrap it for portrait and
landscape. No backend is needed; shared text is readable by anyone with the link.
Possible behaviors: fade like the opening title, stay until Fresh Sand
(recommended for greetings), or stamp real mutable grooves that fingers can erase.
The last option requires solver integration rather than just the existing relief
mask. A composer/share button can encode Unicode and spaces automatically. This
is a roadmap option; fragment messages are not implemented yet.
