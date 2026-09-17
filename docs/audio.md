# Audio

The beach ambience uses `public/scene_assets/beach.mp3` as a quiet looping bed. Ambience and procedural contact audio share one Web Audio output path: the media element stays at unity and a Web Audio `GainNode` applies the canonical `0.08` ambience level. This is intentional because iOS WebKit has historically ignored or inconsistently applied `HTMLMediaElement.volume`, which can otherwise make the beach track much louder on iPhone than on desktop. Playback begins at the first browser-permitted audio activation and remains looped for the life of the scene.

On iPhone/iPad-class devices, when the Audio Session API exists, the page requests the `playback` session before creating the shared `AudioContext`. This keeps the procedural Web Audio effect on the same audible playback route as the beach ambience instead of allowing the Ring/Silent state to mute only the procedural part of the mix.

The sand-contact sound is procedural and runs in one `AudioWorklet`, preserving the synthesis and finishing chain from `refs/procedural_sand_drawing_sfx.html`. Gesture analysis is performed from the same coalesced Pointer Event stream used for drawing, so duration, speed, turns, and pen pressure affect the sound without coupling audio behavior to GPU frame rate or simulation backlog. A single strongest-gesture mix is used for multi-touch to keep the real-time audio workload bounded.
