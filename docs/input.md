# Pointer and touch input

Pointer geometry is distance-driven, not event-rate-driven. Raw pointer events are condensed into short spatial segments whose count depends on travelled bed distance rather than how frequently a mouse, trackpad, pen, or touch screen reports events. Real DOM timestamps remain attached to those segments, so gesture speed changes the simulated momentum and ejection response without changing the geometric distance covered by the tool.

Each fixed simulation step can consume several short contact segments. This prevents fast gestures from building a long input backlog and avoids dropping old movement simply because the device reported more samples. A held pointer with no movement produces no contact.

Multiple pointer IDs are tracked independently. Touch, pen, and mouse contacts can coexist, and a fixed-size contact batch is shared by the solver each substep. The batch is converted into one per-cell contact field before transport, so multi-touch does not multiply the full granular solve by the number of fingers. Where contacts overlap, the strongest local contact supplies motion while the disturbed shell takes the maximum influence.

The canvas uses Pointer Events and `touch-action: none` so browser panning and pinch gestures do not steal drawing input. Each active pointer is captured independently until release or cancellation. Window blur, page hiding, and explicit reset cancel all active contacts.
