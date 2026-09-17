# Audio

The beach ambience uses `public/scene_assets/beach.mp3` as a quiet looping bed at a low fixed volume. Playback is attempted immediately and retried on the first user interaction because browsers may block audible autoplay; after audio is unlocked it remains looped for the life of the scene.

The sand-contact sound is procedural and runs in one `AudioWorklet`, preserving the synthesis and finishing chain from `refs/procedural_sand_drawing_sfx.html`. Gesture analysis is performed from the same coalesced Pointer Event stream used for drawing, so duration, speed, turns, and pen pressure affect the sound without coupling audio behavior to GPU frame rate or simulation backlog. A single strongest-gesture mix is used for multi-touch to keep the real-time audio workload bounded.
