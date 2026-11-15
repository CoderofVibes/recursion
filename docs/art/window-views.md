# Window views: a build brief

**For:** whoever builds the room's window: 2D, which owns `src/view3d/` and `src/theme/`, or a dedicated window thread if the owner launches one. 3B, 3C, 4D and OP supply their own layers.
**From:** the art thread, 2026-11-14, from the owner's first MidJourney round.
**The owner's ask:** the window in the control room should not be plain. Use the references to build many different views.

The looks are defined in [art-bible.md](art-bible.md); this brief says how many views come from them and how to build them honestly. The images themselves stay out of the repository (A23). Ask the owner to show them, by the job IDs in [selections.md](selections.md).

## Today

[`src/view3d/room/outside.ts`](../../src/view3d/room/outside.ts) draws 6,000 point stars scattered evenly over the sphere, plain lit spheres for bodies, and lit rocks, all from `ViewSnapshot.window`. It's correct, and it's the same view everywhere: the same even star field with spheres in front.

## Where variety comes from, honestly

The window is the eye's view (P11, A8): it may show only what light shows. Variety therefore comes from four honest sources, not from painting a different backdrop per region.

1. **One rich sky, many faces.** This universe gets one fixed celestial sphere (the *sky atlas*) with real structure: a vast galaxy seen edge-on from outside, with its blazing core and torn dust lane, plus star clouds, far galaxies and a starless dark cloud. Distant things don't move between encounters, so the sky must be the same everywhere, but it's anything but uniform, so **where the ship points decides what the player sees**. Each region's arrival heading faces a different part of it, and every turn of the ship shows another. A sky that is the same everywhere is also honest navigation: a player can learn its landmarks.
2. **The local scene, from data.** Bodies, rocks, the sun's direction, shadows and eclipses all come from the window channel. The art bible makes them beautiful: near-black bodies with hair-thin crescents, rocks as sparks.
3. **The fictional phenomena, from their systems.** Funnels (3B), radiation clouds (3C) and openings (4D) each come from their own simulation product, drawn in the bible's style.
4. **Light that changes.** The eye adapts: with the sun in view the sky near it dims, and when the sun goes behind a body the stars come up (P04's eclipse becomes a show). Rocks flare at opposition. Shadows sweep across the belt. Precursors brighten. Openings turn.

## The sky atlas: landmarks

Internal names only. Nothing is ever labelled on screen (Night Watch §8).

| Landmark | What it is | Rough look |
|---|---|---|
| **Galaxy** | A vast spiral seen edge-on from outside its disc, 90–110° long (owner's pick, S01b `57c10c4c` #2) | A long lens of light: the sky's signature wrongness, since at home we only ever see our galaxy from inside |
| **Bulge** | The Galaxy's core | Blazing near-white oval about 30° by 15°, torn by the lane, dense with dim garnet knots |
| **Scar** | The Galaxy's dust lane, away from the core | A torn black river with lit edges and trailing filaments |
| **Tips** | The Galaxy's two thin ends | Fine needles of light fading into black |
| **Blue Cloud** | A cold blue-white star cloud beside the bulge | Dense patch of blue-white stars about 8° across |
| **Pair** | Two interacting galaxies | Small, faint, joined by a thin tidal tail; 1–2° in all |
| **Ember** | One bright deep-red star | The brightest star in the sky, unmistakably red |
| **Hollow** | A starless dark cloud | A soft-edged patch of near-black about 15° across, few stars in front of it |
| **Ember Wheel** (owner approved 2026-11-15) | A second, tilted spiral on the opposite side of the sky (X03b `027eec67` #0) | About 30–40° across, its rim lined with bright star-forming points like embers |
| **Needle** (owner approved) | A galaxy stretched into a long needle, a blazing star at its tip (`a4516a95` #3) | A few degrees long; place it near a Tip of the Galaxy so the two needles echo |
| **Hollow** (owner approved) | A thin tilted galaxy with an empty dark oval (`a4516a95` #0) | A few degrees across, in the dark sky between the two great galaxies |
| **Eye** (owner approved) | A spiral wrapped round a black hollow (`2050f52c` #0) | A few degrees across, the recursion motif: put it where the Unfamiliar Sky's arrival can just catch it, low and easy to miss |
| **Deep pole** | The sky farthest from the Galaxy's disc | Very sparse stars, many faint galaxies (S03 style), the darkest sky |

## The views, region by region

"Faces" is the part of the atlas the art thread proposes for the nominal arrival heading. The builder computes each region's real nominal heading against the atlas. If two neighbouring regions face the same patch, rotate the atlas **once**, before any region is tuned; it is then fixed for good. Per-run seeds turn arrivals ±15–20° (A10), which only shifts the framing.

| Region | The window shows (from data) | Faces | Why | References |
|---|---|---|---|---|
| C01 Unfamiliar Sky | A dark limb below, fragments above and aside, one "star" that's really a nearby rock | **Galaxy**, whole | The first view after the black hole: the wrongness right ahead | S01, B03 |
| Transit legs | The richest sky in the game; see *Transit views* below | A different landmark per leg | Where the player spends the most time looking out (A12) | `06ba5626` #2 base sky, plus the landmarks |
| C02 Twin Deeps | Alpha upper left, Beta lower right, the belt a thin ring of sparks, the radiation crescent | **Deep pole** | Dark sky makes the crescents and sparks the whole picture | B01 (hero), B02, L01, X06, X07 |
| C03 Lantern Field | A rim brightening high to port, lit rocks like lanterns, a repeated silhouette astern | **Ember Wheel** | Lit rocks like lanterns in front of a galaxy rimmed with embers: the lanterns rhyme with the sky | L07, X08 |
| N01 Shadow Observatory | An unlit overhang above, black fragments below | **Bulge** | Black bodies are seen only by the stars they hide, so put them in front of the densest stars | X02 |
| N02 Far Aperture | One body edge above, another receding below, a flicker between | **Blue Cloud** | A dense patch for the flicker to slip across | X09 |
| N03 Unseen Cathedral | An ordinary, calm rock field (A16: no hint of the lattice) | **Pair** | The most peaceful view in the game, which is the trap | X10 |
| R03 Missing Room | A recess's dark walls framing rocks and empty gaps | **Hollow** | Emptiness inside emptiness | X11 |
| N04 Petal Gallery | Small openings through a volume, each showing one remote landmark at a different angle | Any; the petals carry the view | The repeated landmark is the puzzle | L06, X01 |
| A03 Borrowed Spin | A rotating abandoned structure spanning the window | **Scar** | Girders silhouetted against a lit band | X03 |
| P01 Listening Shelf | A broad face overhead, fragments below, glints beyond the shoulder | **Scar** overhead | The face's edge meets the dark lane | X05 |
| P02 Sunward | A large lit limb rising, silhouettes above and below, the sun in view | Toward the sun | The bright scene: sky dimmed by the sun | B07, S04 |
| R01 Red Wall | A warm rust-red face on one side, cold dark above and below | Away from the **Bulge** | Warm against the coldest sky | X04 |
| P03 Well Garden | The funnel field through 3D, dark landmarks at depth | **Hollow** or **Deep pole** | Violet threads need the darkest sky | W01–W07 |
| R02 Hinge | A knife-thin ridge above, isolated rocks | A **Tip** | The ridge's crest pointing along the Galaxy's needle | X12 |
| P04 Back of the World | A dark body blocking one side, a sliver of limb, the sun going behind it | **Bulge**, rising as the sun sets | The eclipse: the stars and the Bulge come up as the eye adapts | B06, X13 |
| A01 Countercurrent | A dark moon below (a streamer only if gas is approved) | **Ember** | A single red point above the dark moon | B05, G02 |
| C04 Stillwater | A massive limb to one side, a few still rocks, a far glimmer | **Ember Wheel**, low | Stillness: a massive limb, a few still rocks, and the second galaxy hanging calm beyond them | X16 |
| R04 Crooked Ship | Rocks around a roomy central volume | **Blue Cloud** | Open and clear, a place to drill | — |
| C05 Braided Crossing | Debris streams crossing at angles, separate funnels beyond | **Scar** | Braids against the torn lane | X14 |
| C06 Turning Rim | A hairline that opens into a tilted oval; home's warm Milky Way inside, Earth possibly a blue point | **Deep pole** | The inside must outshine the outside | L02, L03, X15 |
| H01 Passage | The opening filling the forward view, strange stars around its rim | **Deep pole** | Same | L05 |
| Opening and ending | Earth in the distance under our real sky (OP's `HOME_SHOT`) | Our sky | The bookends | E01–E04, S06 |

## Transit views: the quiet sky between encounters

**Owner direction (2026-11-15):** the quiet sky between encounters should have plenty of cool, weird views, using the references we already have.

Transit is where the player spends the most time looking out (A12: time runs, nothing is dangerous, they prepare as long as they like). So it gets the richest sky, built honestly from three things.

### 1. No dead direction

The sky atlas is laid out so that **wherever the ship points, something is in the window**. Treat the sphere as about a dozen 60° cones. Every cone holds at least one landmark (the Galaxy's disc, Bulge, Scar or a Tip; the Ember Wheel; the Needle, Hollow or Eye; the Blue Cloud, Pair or Ember) or a stretch of band light. The space between landmarks is the quiet base sky (S02b `06ba5626` #2), never empty black. During transit the player can turn the ship freely and look around: each turn is a new view.

### 2. Each leg points at something

The regions' 3D positions are authored (A13). Since the distant sky is free to arrange, **place the landmarks to suit the legs**: the default heading of each transit leg (nose along the course) frames its own landmark, so no two legs look alike. Proposed, along A13's route:

| Leg | Ahead (the landmark the course faces) | Also in the window (from data) | References |
|---|---|---|---|
| C01 → C02 | The whole edge-on **Galaxy** | Twin Deeps growing from two points into two crescents | `02429124` #0, `ca1c5c59` #2 |
| C02 → C03 | The **Ember Wheel** rising | Aft: Twin Deeps shrinking, the radiation crescent a faint violet curve | `8911eeaa` #1 (aft view, chosen), `f80f640f` #2, `836473b2` #1 |
| C03 → N01 | The **Bulge** | N01's unlit overhang growing as a starless patch that slowly eats into the Galaxy: an eclipse of a galaxy by a body you can't see | `8bbe8eef` #2 |
| N01 → N02 | The **Blue Cloud** | Far Aperture's dark edges, a point of light winking between them | `5713ccd3` #2 |
| N02 → N03 | The **Needle** beside a **Tip** | Two needles of light pointing the same way | `a4516a95` #3 |
| C03 → P01 | The **Scar** | The Listening Shelf's pale slab growing, its glints flickering | `99085f82` #2 |
| P01 → P02 | The far sun | A brilliant limb rising; the sky dimming as the eye adapts | layer 2 |
| P02 → P03 | The **Hollow** | The Well Garden from afar: a faint violet frost of crossed threads, each ending in a spark, slowly resolving into funnels | `bce5f206` #1, `130bc062` #0 |
| P03 → P04 | **Deep pole** | Aft: the Garden receding into violet frost; ahead, a black disc eating stars | `8bbe8eef` #2 |
| P03 ↔ N03 (cross-transfer) | The **Pair** | The Garden's frost on one side, a calm rock field on the other | — |
| P04 or N03 → C04 | The **Ember Wheel**, low | Stillwater's limb with its hairline rim | `6a12a7aa` #0 |
| C04 → C05 | The **Hollow** again, from a new angle | Braided debris ahead, funnels glinting beyond | `4bef5e21` #0 |
| C05 → C06 | **Deep pole**, darkest sky | If geometry allows (4D, C06), the first faint hairline far ahead | `c3c1278a` #0 |
| C06 → H01 | The opening itself | Home's warm sky inside the oval | `9dcfe97b` #0 |

The **Eye** stays at C01's arrival (low and easy to miss), so it's the first strange thing the player sees and the one they find again only by looking for it.

### 3. Things that change while you coast

All honest, all from data or the eye:

- **Arriving and leaving.** The next region grows from a point to a disc ahead; the last one shrinks behind. Every body is drawn at its true angular size, so the approach itself is the show.
- **Occultations.** As the ship moves, a near body slides across a landmark and hides it: a dark disc crossing the Ember Wheel, an overhang eating the Bulge. The parallax is real.
- **Eye adaptation.** When the sun drops behind a body the stars and the galaxies come up over a few seconds (layer 2).
- **Distant phenomena.** The Well Garden's precursors brighten far off, and a funnel being born is visible across the field (S22: the window sees phase without the camera).

Because the sky never moves between legs, a player who has learned it can navigate by it: the Ember Wheel ahead means Lantern Field is behind them.

## Build plan, layer by layer

Each layer stands alone and can merge alone. Tokens go in `src/theme/` (Convention 11), in `outsideStyle`.

1. **Sky atlas (2D).** Generate the sky once at load from a **fixed seed** (never the run seed: the sky is not geometry, like Earth in H02). Bake the diffuse light (the Galaxy's disc, bulge, dust lane, knots, star clouds, galaxies) into a cube map in one fragment-shader pass; 512 px per face is enough for soft light (about 0.18° per pixel). Keep resolved stars as point sprites, raised from 6,000 to roughly 15,000–20,000, with density following the bands (about 8× at a band's centre) and the bible's colour mix. Cost: one pass at load, then one textured sphere and one points draw per frame.
2. **Sun and eye adaptation (2D).** A small hard warm disc with a tight halo and no flare. A soft dimming of stars and sky within about 10° of a visible sun, and a slow global adaptation (several seconds) that dims the sky while the sun is in view and lets it come back when the sun is hidden. Driven by `WindowView.sun.visible`; no new data needed.
3. **Bodies (2D).** Extend `bodyMaterial`: very low albedo, terminator-only relief (procedural crater and regolith noise that shows only under raking light), a hair-thin warm crescent following the real phase. Unlit bodies stay black discs that hide the stars.
4. **Rocks as sparks (2D).** Extend `rockMaterial` with an opposition brightening term, and give lit rocks a minimum on-screen size of one bright pixel so distant lit rocks read as sparks instead of vanishing. Unlit rocks stay invisible.
5. **Funnels (3B, mounted by 2D; R13/R31).** `makeOpticalFunnelView` styled per the bible: ring and meridian lines, taper, end-on concentric rings, dotted precursors, LOD to single threads at distance.
6. **Radiation clouds (3C).** Waits for the owner's pick from L01/G04.
7. **Openings (4D).** The rim and far side per the bible, when S6's ray mapping lands.

## Checks

- **Hologram contrast.** A theme test in the style of `theme.test.ts`: the sky's brightest pixel (the Bulge) stays below a set fraction of the hologram's line brightness, and the sky's mean hue keeps ΔE76 > 20 from `forecast`, `thrust`, `velocity`, `blackbox`, `caution` and `warning`.
- **No dead direction.** A test samples the atlas in about a dozen 60° cones and asserts each holds a landmark or band light above a set brightness.
- **Determinism.** The atlas is identical on every run and every machine (fixed seed, no `Math.random`).
- **Modest laptop (A18 item 7).** Cold load still within 2.5 s with the bake included; frame p95 unchanged within noise.
- **Honesty.** Nothing drawn that the window channel or a phenomenon's own product doesn't supply, apart from the fixed distant sky. No lattice in N03.
- **Non-spherical bodies (open question for the integrator).** The chosen looks for the Red Wall, Listening Shelf, Hinge, Shadow Observatory's overhang and the Borrowed Spin structure are slabs, ridges, overhangs and wheels. The physics treats massive bodies as point masses with **spherical** collision radii (P4, P16). If the window draws a slab while the collision shape is a sphere, the player will strike invisible space or pass through visible rock, which breaks the window's promise that it shows what is there. Either those bodies get collision shapes that match their look, or the visible rock is shaped to fill its sphere. This is a physics and content decision, not an art one.
- **Proof.** A headless-Chrome screenshot of each region's nominal arrival (C01, C02 and the Well Garden first, since they're playable now), for the owner to judge against the bible.

## Ready to paste (for the owner to relay)

> Build the window views from `docs/art/window-views.md` and the looks in `docs/art/art-bible.md`. Start with layers 1–4 (sky atlas, sun and eye adaptation, bodies, rocks as sparks) in `src/view3d/room/outside.ts` and `src/theme/`. Then mount 3B's funnels per R31 in the same style. Keep everything the window shows coming from `ViewSnapshot.window`, apart from the fixed sky atlas. Add the contrast and determinism checks, measure the modest profile, and send headless screenshots of C01, C02 and the Well Garden arrivals. Ask the owner to show you the MidJourney references, listed by scene in `docs/art/reference-library.md`; they are not in the repository.
