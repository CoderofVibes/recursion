# Art bible: the view through the window

For the threads that build the window's visuals: 2D (window and sky), 3B (funnels), OP (opening and Earth), 4D (openings), 3C (radiation clouds). It describes the chosen look in words precise enough to build procedurally. The reference images are not in the repository (A23); their job IDs and verdicts are in [selections.md](selections.md). The prompts are in [window-prompts.md](window-prompts.md). The plan for many different views is in [window-views.md](window-views.md).

## General rules

1. **Real space first.** True-colour astrophotography: pinpoint stars, black vacuum, high dynamic range, no lens flare, no diffraction spikes (the window is an eye, not a telescope), no light beams in vacuum. Light shows only where it falls on a surface (P02).
2. **Violet means fiction.** Night Watch's `well`/`lattice` violet (`#9b8cff`, cores toward `#ece6ff`) is for the funnels, the radiation clouds and the openings' rims only. Nothing natural is violet.
3. **The hologram must read on top.** The flight hologram is drawn in front of the window. Keep the sky dim and low in saturation, and keep it clear of the instrument hues: forecast teal, thrust magenta, velocity lime, Black Box orange, caution yellow and warning red. Nebulae stay faint and small.
4. **Warm room, cold outside, warm light.** The room is warm near-black (Night Watch). Space is neutral black. The far sun's light is warm, so lit edges carry a faint warm tone, which ties the outside to the room.
5. **Show only what is true.** Nothing the physics contradicts: no big nearby planet that isn't in the data, no ground, no lattice (A16), no visible effect of a well beyond its shape and light, no gas without an approved optical model, no accretion disc. Bodies appear at their data's angular sizes and lighting.
6. **Subtly wrong.** This universe's sky is not ours: two galactic bands cross instead of one, and star colours lean to deep red and blue-white. Our real sky appears only at Earth (opening and ending) and through the openings to home.
7. **Darkness is the canvas.** Most of the window is true black. Beauty comes from a few precise lights: crescents, sparks, threads, a bright bulge at the edge of the sky. Never fill the frame.

## Per scene

### The sky of this universe (2D) — from S01 `f2d993f6…` #2, corrected

- **Structure.** One fixed celestial sphere for the whole expedition (see window-views.md for why). A **primary band**: a soft river of unresolved starlight about 12–18° wide, brightest at a **bulge** (a broad oval glow about 25° across, near-white with the faintest warm tint) and fading to almost nothing on the opposite side of the sky. Torn **dust lanes** run along the band's centre: dark, fractal, filamentary (several octaves of noise, sharp-edged, ridged), opaque enough to hide the band behind them. Scattered along the lanes, a few dozen **tiny red knots** (emission regions) no larger than 0.3°, deep red, low saturation.
- **The wrongness.** A **secondary band** crosses the primary at about 25°, a third as bright, narrower (6–8°), with no bulge and its own thinner lanes. Where they cross, the dust from both overlaps into a dark knot. This is the "X" that no Earth sky has.
- **Colour.** Band light is neutral grey-white, never teal or green (the reference's teal cast is the one thing to remove). Stars: deep red (about 35 %), blue-white (about 35 %), white (25 %), yellow (5 % at most).
- **Stars.** Point sprites, never blurred discs. Brightness follows a steep power law: almost all faint, a handful bright. Density rises sharply inside the bands (about 8× at a band's centre) and is lowest at the poles of the primary band. Faint stars should be one or two pixels wide.
- **Landmarks.** A few distant galaxies (S03 style) at fixed places: small, elliptical smudges, edge-on spirals, one interacting pair; and one cold blue-white star cloud (from S01 `6afb7728…` #3) beside the bulge.
- **Overall brightness.** The band at its brightest stays well below the hologram's line brightness. Large parts of the sky are almost black.

### The far sun (2D) — from B01 `ca1c5c59…` #3

A small, hard, warm-white disc, about 0.15° across, with a tight soft halo (a few disc widths) and **no rays and no flare**. Stars near it are suppressed in a soft radius of about 10°, as an eye adapting would; beyond that the sky is unchanged. Its brightness is still the owner's call (A3, P14 item 3).

### Massive bodies (2D) — from B01 `ca1c5c59…` #2 (hero) and #3

- **Surface.** Near-black basalt: albedo very low. In shadow a body is a black disc that hides the stars (already built). Fine regolith texture and crater relief show **only within a few degrees of the terminator**, where raking light picks them out.
- **Lit edge.** A hair-thin crescent along the sunward limb, warm white (the sun's colour), sharp on the outside, falling off over a short distance inward. No atmosphere halo, no glow beyond the limb. The crescent's width follows the real phase from the sun direction.
- **Pairing.** Twin Deeps: larger body upper left, smaller lower right at their data's sizes (about 10–18° at working distance), the belt a thin ring around the smaller.

### Belt rocks (2D) — from B01 `ca1c5c59…` #2 and #3

Lit rocks read as **sparks**: tiny warm points, brightest where the sun is behind the viewer's line of sight (strong opposition brightening) and where they're nearest. Rocks larger than a few pixels show flat-shaded faces with one hard lit side and black shadow. Unlit rocks are invisible except where they hide a star. Never a continuous dust glow: only rocks the simulation has.

### Funnels (3B, 2D) — line language from W01 `8dcf1d92…` #2, taper from #3, end-on from `ecaada3d…` #2

- **Drawing.** Wireframe light, not a surface: **contour rings** across the funnel plus **meridians** along it (about 12–16), all thin additive lines in `well` violet, with the throat's last few rings and the throat line itself running toward `latticeCore` near-white. Stars stay visible through a funnel.
- **Taper.** Rings sparse at the mouth (S22's 20 km), crowding steadily toward the 1 km throat along a quadratic taper; the last third of the length is nearly a single bright line. Ring brightness rises toward the throat.
- **End-on.** Seen down its axis, a funnel is concentric rings (never a spiral) closing on a brilliant point, with the meridians as faint spokes.
- **Field.** Funnels at random orientations through a 3D volume: sideways, toward, away, above and below. A few near ones large and detailed; many far ones reduced to single threads of light with a brighter point at the throat. Not parallel, not in a plane, not evenly spaced.
- **Glow.** A narrow bloom on the lines only (Night Watch: glow is for bright lines, never a haze). No solid fill, no swirl, no lightning, no moving matter.
- **Precursor.** The same rings and meridians, broken into dotted arcs and fragments, brightening steadily over S22's 900 s; birth joins them into continuous lines over 120 s. No flashing.

### Openings (4D, 2D) — rim and far side from L03 `0384aeb7…` #2, attitude from `5f42fb14…` #0

- **Shape.** An oval seen obliquely (a tilted ellipse), moving and turning. A hole in the sky: no tunnel depth, no swirl, no smoke, no frame.
- **Rim.** Luminous white with a violet edge, **ragged at fine scale**: a torn, irregular line with short tendrils curling outward a little way, like frayed paper lit from behind. The rim is thin relative to the opening (a few percent of its width). Faint violet glow just outside the rim, fading over a short distance.
- **Far side.** Home's sky, which is our real one: a rich, warm Milky Way with dense star clouds and red-brown dust, visibly denser and warmer than this universe's sky around it, and oriented differently. It shows only along clear sight lines through the opening (C06). Earth, if geometry permits, as a tiny blue point.

### Still to be chosen

Radiation crescent (3C), Petal Gallery (4D), Earth (OP), and every look in groups 4–7 not named above.
