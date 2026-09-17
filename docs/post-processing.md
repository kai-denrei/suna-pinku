# Post-processing

The scene render target is `rgba16float` and stores linear HDR radiance from both the sand surface and loose grains. Surface/material shaders do not tone-map or apply sRGB conversion.

Visual parity with the deployed renderer is intentional. Before the existing bloom/filmic composite, one full-screen encode pass applies the exact legacy tone curve and sRGB transform into an 8-bit texture using the same format the scene used previously. The original selective bloom, filtering, thresholds, weights, filmic grade, and final canvas output then run unchanged on that texture. This preserves the established color tone and display-space bloom behavior while keeping an unclipped linear HDR scene available internally.

The HDR scene clear value is the inverse of the legacy display transform for the previous clear color, so uncovered pixels retain the same visible color after the encode pass.

Do not retune exposure, bloom, contrast, saturation, or material colors as part of this pipeline migration. Any future move of bloom or grading into HDR space is a separate appearance change and must be evaluated independently against the deployed look.
