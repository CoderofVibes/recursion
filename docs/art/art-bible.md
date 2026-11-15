# Art bible: the view through the window

For the threads that build the window's visuals: 2D (window and sky), 3B (funnels), OP (opening and Earth), 4D (openings), 3C (radiation clouds). It describes the chosen look in words precise enough to build procedurally. The reference images are not in the repository (A23); their job IDs and verdicts are in [selections.md](selections.md). The prompts are in [window-prompts.md](window-prompts.md). The plan for many different views is in [window-views.md](window-views.md).

## General rules

0. **Strange, not fake** (owner, 2026-11-15: "We can make the environment the player sees look really cool and different"). The window should be striking and unlike any sky the player knows. Where the game is free (the distant sky, and the fictional phenomena: funnels, clouds, openings, the abandoned structure), push the strangeness. Where the simulation models something (bodies, rocks, light, shadow, Earth), keep it physically true: the strangeness there comes from the universe's own shapes and lighting, never from breaking them. The rules below keep the two apart.
1. **Real space first, for what's real.** True-colour astrophotography: pinpoint stars, black vacuum, high dynamic range, no lens flare, no diffraction spikes (the window is an eye, not a telescope), no light beams in vacuum. Light shows only where it falls on a surface (P02).
2. **Violet means fiction.** Night Watch's `well`/`lattice` violet (`#9b8cff`, cores toward `#ece6ff`) is for the funnels, the radiation clouds and the openings' rims only. Nothing natural is violet.
3. **The hologram must read on top.** The flight hologram is drawn in front of the window. Keep the sky dim and low in saturation, and keep it clear of the instrument hues: forecast teal, thrust magenta, velocity lime, Black Box orange, caution yellow and warning red. Nebulae stay faint and small.
4. **Warm room, cold outside, warm light.** The room is warm near-black (Night Watch). Space is neutral black. The far sun's light is warm, so lit edges carry a faint warm tone, which ties the outside to the room.
5. **Show only what is true.** Nothing the physics contradicts: no big nearby planet that isn't in the data, no ground, no lattice (A16), no visible effect of a well beyond its shape and light, no gas without an approved optical model, no accretion disc. Bodies appear at their data's angular sizes and lighting.
6. **Wrong in a way you feel.** At home we see our galaxy from inside, as a band across the sky. Here the ship sees a whole galaxy from outside: a vast edge-on disc with a blazing core. Star colours lean to deep red and blue-white. Our real sky appears only at Earth (opening and ending) and through the openings to home, where the familiar band, seen from inside, is the sign of home.
7. **No red that looks like an alert, no pink that looks like thrust.** Natural reds stay dim, deep and desaturated (rust and garnet, never `warning` crimson). Fictional light is white with a violet fringe, never pink or magenta.
8. **Darkness is the canvas.** Most of the window is true black. Beauty comes from a few precise lights: crescents, sparks, threads, a bright core at the edge of the sky. Never fill the frame. **No ground, ever:** MidJourney kept adding planet surfaces and floors, and space has none.

## Per scene

### The sky of this universe (2D) — the owner's pick, S01b `57c10c4c…` #2, with #0's colour level

- **Structure.** One fixed celestial sphere for the whole expedition (see window-views.md for why). Its great landmark is **the Galaxy**: a vast spiral seen almost exactly edge-on from outside its disc, a long lens of light spanning about 90–110° of sky and about 15–25° thick at its middle, tapering to fine points at both ends.
- **Its core.** A blazing **bulge**, an elongated oval about 30° by 15° along the disc, near-white with the faintest warm tint. It's the brightest thing in the sky after the sun, but still well below the hologram's line brightness.
- **Its dust lane.** A dark, torn **dust lane** runs the length of the disc, offset slightly below centre so the bulge bulges above it: dark, fractal, filamentary (several octaves of ridged noise, sharp-edged), opaque enough to hide the light behind it. Ragged dark filaments trail off it at the edges.
- **Its red knots.** Dozens of **emission knots** sit along and inside the lane, clustered most densely where the lane crosses the core. Each is 0.1–1° across. They're deep, dim garnet (low saturation), never bright crimson: they must not look like a warning behind the hologram.
- **Halo.** A faint grey glow of unresolved stars surrounds the disc, fading over 20–30°.
- **Beyond the galaxy.** Mostly black sky with sparse field stars, a few faint distant galaxies, and the other landmarks in window-views.md.
- **The second galaxy, the Ember Wheel** (owner approved 2026-11-15; X03b `027eec67…` #0). On the opposite side of the sky from the Galaxy, a large spiral tilted about 60° from face-on, so it reads as a broad oval about 30–40° across. Its disc is soft near-white with fine warm dust spirals and a small bright core. Its outer rim is lined with bright points of star formation like embers, densest along the near edge. Dimmer overall than the Galaxy's bulge. Two great galaxies in one sky, one edge-on and one tilted, is something no human sky has, and it means the window has a landmark in either direction.
- **Colour.** Galaxy light is neutral white-grey toward warm, never teal or green. Field stars: deep red (about 35 %), blue-white (about 35 %), white (25 %), yellow (5 % at most).
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

### Funnels (3B, 2D) — lines from W03 `c29febbf…` #1, field from W01b `130bc062…` #0 (top half), mouths from `dccfb118…` #3

- **Drawing.** Wireframe light, not a surface: **contour rings** across the funnel plus **meridians** along it (about 12–16), all thin additive lines in `well` violet, with the throat's last few rings and the throat line itself running toward `latticeCore` near-white. Lines are crisp, even and dim; the **throat point** is the one brilliant thing, a small white star at the narrow end. Stars stay visible through a funnel.
- **Taper.** Rings sparse at the mouth (S22's 20 km), crowding steadily toward the 1 km throat along a quadratic taper; the last third of the length is nearly a single bright line. Ring brightness rises toward the throat.
- **End-on.** Seen down its axis, a funnel is concentric rings (never a spiral) closing on a brilliant point, with the meridians as faint spokes.
- **Mouth face-on.** A funnel opening toward the viewer is a web of rings and spokes closing on the bright throat point.
- **Side-on** (W01c `bce5f206…` #1). Wire rings stepping down a long taper to a single brilliant point, like a horn of light drawn in a few strokes.
- **Far away** (same image). A distant funnel is a thin violet thread with a small white spark at its throat end, so the field reads as thousands of sparks on threads pointing every which way.
- **Field.** Funnels at random orientations through a 3D volume: sideways, toward, away, above and below. A few near ones large and detailed; many far ones reduced to single threads of light with a brighter point at the throat. Not parallel, not in a plane, not evenly spaced, and never standing on a floor or surface: MidJourney kept adding one, and there isn't one.
- **Glow.** A narrow bloom on the lines only (Night Watch: glow is for bright lines, never a haze). No solid fill, no swirl, no lightning, no moving matter.
- **Precursor** (W01c `a5aac057…` #0). The same rings and meridians drawn as **rings of fine dots**, brightening steadily over S22's 900 s; the throat point is already faintly there. Birth joins the dots into continuous lines over 120 s. No flashing.

### Openings (4D, 2D) — rim from L03b `9dcfe97b…` #0 and L03 `0384aeb7…` #2; first opening from `9dcfe97b…` #1

- **Shape.** An oval seen obliquely (a long tilted ellipse), moving and turning. A hole in the sky: no tunnel depth, no swirl, no smoke, no frame.
- **Rim.** Luminous white with a violet fringe, made of **fine fibres**: thousands of short hair-thin luminous filaments along the edge, curling outward a little way, like frayed paper or fibre lit from behind. The solid edge is thin relative to the opening (a few percent of its width); the fibres extend a little beyond it and fade. White and violet only, never pink.
- **First opening (C06), in stages.**
  1. **Hairline** (L02b `c3c1278a…` #0): one impossibly thin line of white light across black sky, fine fibres hanging from one edge, a faint violet fringe (not teal).
  2. **Tear** (L02b `2adef2fe…` #1): the line thickens into a bright arc and splits along part of its length into a sliver with fibrous edges and a warm glimpse of home's sky inside.
  3. **Oval** (L03b `9dcfe97b…` #0): the sliver widens into the full tilted ellipse with its fibrous rim all the way round.
- **Far side.** Home's sky, which is our real one: a rich, warm Milky Way with dense star clouds and red-brown dust, visibly denser and warmer than this universe's sky around it, and oriented differently. It shows only along clear sight lines through the opening (C06). Earth, if geometry permits, as a tiny blue point.

### Radiation crescent (3C, 2D) — L01b `836473b2…` #1 (chosen), material from L01 `0a7953fe…` #3; geometry from S21

- **Material.** A **curtain** of violet-white light, like an aurora with no planet: a tall translucent sheet with fine striations running across the sheet, perpendicular to the belt's plane, brightest along its base nearest the belt and fading upward and outward into soft veils. Stars and rocks show through. Never flames, never lightning, never a hard edge, never pink.
- **Geometry (S21, A18).** A crescent, not a ring: it spans about 60° of azimuth on the belt's outer side (−90° to −30° in S21's frame), 1,000–2,600 km from the binary, co-rotating with it, clear of the rocks. Brightest along its inner edge facing the belt, fading outward.
- **Brightness.** Faint enough that the belt's sparks still read through it.

### Shadow Observatory (2D) — X02 `8bbe8eef…` #2, `5713ccd3…` #1 and #2

An unlit body is known only by the stars it hides: a sharp boundary where the star field and the galaxy's light simply stop, with nothing drawn on the body itself. Small fragments crossing the band are moving black holes in the stars. The scene works only where the sky behind is dense, so it faces the galaxy. The current renderer already draws unlit bodies as black discs; this scene needs the sky behind them to be rich enough to show it.

### Twin Deeps belt and shadow (2D) — X06b `cb93a8bc…` #0; edge-on from #2

The belt is a river of sharp warm sparks around a near-black sphere with a hair-thin crescent. Behind the sphere, the ring goes dark where the sphere's shadow crosses it (A3), and the rocks reappear beyond. Seen exactly edge-on, the whole belt collapses into one blazing line through the sphere, which later echoes the Turning Rim's hairline. Sparks stay sharp points (no bokeh: the eye focuses at infinity).

### Borrowed Spin structure (2D) — X03b `027eec67…` #1; alternative silhouette `5b9c5425…` #0

A colossal thin wheel around a dark, blocky hub, so large its scale can't be judged. It has no lights of its own: it's lit only along the sunward edge of its rim, a bright line that slides round the wheel as it turns, so the rotation reads from the light alone. Weathered and broken in places. Behind it, the sky's galaxy. (A03 calls for arms that sweep above and below; a wheel with spokes, or the broken hull arc of `5b9c5425…` #0, both satisfy that. 2D and S1–S3 choose the shape that matches the tether's capture targets.)

### Petal Gallery (4D, 2D) — L06b `88a5797e…` #3; variety from `b3495a44…` #2

A dozen small openings scattered through the volume at different distances and tilts, each with the same white fibrous rim as the Turning Rim (one shared opening system, S6), and inside every one the same remote galaxy, turned to a different angle in each. Near petals larger, far ones tiny. The repetition is the puzzle; nothing labels it.

### Red Wall (2D) — X04c `969f9ba6…` #1 (chosen); surface also from X04b `79f27860…` #3

A sheer face of layered, fractured rock in rust and garnet, lit low and warm so each ledge throws a long black shadow, deep vertical clefts in near-black. It hangs in open space, with cold black sky and sparse stars above and below: no horizon, no atmosphere, no ground beneath it. A small distant edge-on galaxy in the black beside it is a good touch (the Galaxy's far tip).

### Eclipse at the limb (2D) — X13, from L02b `2adef2fe…` #0

When the far sun slips behind a dark body: a black limb traced by a thin bright edge, and one brilliant bead of light where the sun is going. The rest of the sky comes up as the eye adapts (window-views.md, layer 2).

### Earth (OP)

Not pursued. Earth is about five seconds of the game (owner), and OP already draws a procedural Earth at the right size (2.92°, 56 % lit).

### Still to be chosen

Every look in groups 2–7 not named above.
