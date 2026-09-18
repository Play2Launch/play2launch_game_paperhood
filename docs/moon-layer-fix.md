# Moon occlusion

The far panorama contains opaque sky. Draw order is now panorama, stationary moon, transparent mountain cutout, tint, middle castles. The cutout shares the panorama's framing, mirrored tiling and far scroll offset. If the cutout fails to load, omit the moon rather than letting it overlap peaks.

Asset: `public/art/mountains-occlusion-v1.png`.

Created using the imagegen skill and built-in image generation tool, editing `public/art/mountains-far-v1.png`.

Prompt: Use case: background-extraction. Extract all mountains and fog between mountains into a genuinely transparent PNG. Remove sky and clouds above the uppermost skyline only. Preserve mountain positions, silhouettes, textures, colors, full canvas framing and aspect ratio. Keep the lower region opaque. No moon or new objects; no baked checkerboard. This layer occludes a stationary moon behind the mountains.

Regression coverage checks panorama → moon → mountains → castles at multiple scroll distances, exactly one moon, and missing-cutout fallback.
