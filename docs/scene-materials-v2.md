# Scene material pass

Generated with the built-in imagegen tool using `PlayToLaunch_web/docs/brand/paperhood-scene-concept-v1.png` as style reference. Final assets live in `public/art/`:

- `cliff-rock-v1.png`: opaque square, large irregular olive/charcoal folded-paper rock planes with deep creases, no tiny scales, leaves, sky or objects.
- `moss-edge-v1.png`: transparent wide continuous pale yellow-green moss landing lip with ragged hanging paper edges, flat horizontal top, no objects or background.
- `hazards-v1.png`: transparent two-cell atlas; left rust-red crystal cluster with tall central peak and smaller flanking spikes; right thick red ceiling slab with three downward teeth. Lit and shadowed folded-paper faces, no background or text.
- `platform-plants-v1.png`: transparent two-cell atlas; left sparse paper-leaf sprout; right crooked-trunk olive origami tree, side view, no ground or labels.
- `cloud-band-v1.png`: transparent long low band of layered torn sage/teal paper clouds, fibrous polygon lobes and wispy ends, no moon, landscape or text.

The above are the final prompt specifications; each was prefixed with “Use case: stylized-concept. Input image is STYLE REFERENCE only, not whole scene to reproduce. Production game asset.”

## Rendering constraints

Rock uses larger mirrored nine-world-unit tiles; moss source cropping anchors the landing edge at the original platform top. Ceiling teeth terminate at the previous roof underside; ground spikes retain their previous visual envelope. Simulation and hit rules are unchanged (existing forgiving collision remains, not pixel-perfect sprite collision).

Flora placement is deterministic presentation logic, does not consume gameplay RNG, and avoids platform ends, hazards and collectibles. Trees are less frequent and drawn behind gameplay. Collected/hit state does not change flora placement.

Clouds are after the moon but before mountains and castles. Drift uses run distance, so pausing or reduced-motion freezes it with the scenery. All new assets retain code fallbacks. Tests cover atlas bounds, loading failures, layer order, decoration clearances, stable placement, immutable simulation and paused rendering.

Verification: 37 tests passed, TypeScript/Vite production build passed; desktop and 390px mobile inspected. Existing >500 kB JavaScript bundle warning remains; image optimization is not part of this pass.
