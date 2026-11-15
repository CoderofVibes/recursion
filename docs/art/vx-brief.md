# Brief for VX: how to use the window references

From the art thread (ART), 2026-11-15, after round 7. For the VX thread building the window (`p3/vx-visuals`).

## Where things are

The art docs live on `art/window-references`, not yet on main. Read them in the art worktree:

- `C:\Dev\Recursion NASA Hackathon\.worktrees\art\docs\art\art-bible.md`: every look in words, precise enough to draw procedurally. **This is the source of truth**, not the images.
- `window-views.md`: the build plan, the sky atlas landmarks, the views region by region, and **Transit views** (the open sky between encounters).
- `reference-library.md`: every usable image grouped by scene. `selections.md`: why each was chosen.

**The images.** Only round 7's thirteen images are still on disk, in `C:\Users\antho\Downloads\myvision_12_*<jobID>*_<#>.png`. Earlier rounds are gone, and the art bible describes them in words. You may open an image to compare against, but never copy one into the repository or use it as a texture (A23). The game draws every view itself, from its own data.

## Rules that apply everywhere

1. **Show only what's true.** Bodies, rocks, the sun and shadows come from `ViewSnapshot.window` (P11). The lattice is invisible to the eye (A16).
2. **No ground, no horizon, no atmosphere** on anything except Earth. Most references had one; ignore it.
3. **Violet only for fiction:** funnels, the radiation crescent and openings.
4. **The hologram reads on top.** Most of any view stays quiet base sky, with one major landmark per view and two at most.
5. **Airless edges are razor-sharp.** An unlit body is a clean starless shape, never soft dust or haze.

## Your feedback, adopted

Both points are now in `window-views.md`, *Transit views*:

- **Something worth noticing, with room to read.** The Turning Rim's Deep pole is the deliberate dark exception, and the coverage check exempts it.
- **The sky is a compass for heading, not position.** Landmarks only swing across the window when the ship turns. During a coast, change comes from near bodies: their size, and how they slide across and hide the fixed sky.

## What to build next, in order

### 1. Finish the two galaxies you have
- **The Galaxy:** check yours against `82158aac` #2 (on disk), the most restrained version. It's a long thin disc with a torn lane and black sky everywhere else, and the core blazes up from behind a knife-sharp dark sliver. If the halo or disc glow spreads further than that, pull it in. Art bible: *The sky of this universe*.
- **The Ember Wheel's ember ring:** use `c3c02d12` #3 and `8911eeaa` #1 (on disk). The whole outer rim is a ring of separate bright warm points, densest along the near edge, with a few more scattered along the arms. Draw them as point sprites, not a smooth band. Use the sky only and ignore the ground in #3.

### 2. The three sky oddities (owner approved)
The Needle, the Hollow and the Eye, each a few degrees across and dimmer than either galaxy's core. Art bible: *Sky oddities*. The Eye sits low near C01's arrival heading, easy to miss.

**Not yet approved:** a hooded galaxy (`4e65bd6f` #3, on disk), where the dust lane curls round the core like a hood. Don't build it unless the owner says yes.

### 3. Lay out the atlas for the legs, then add the coverage check
Place the landmarks so each transit leg's default heading frames its own landmark. The leg table is in `window-views.md`, *Transit views* §2. The fixed sky is the same every run: seed the atlas with one fixed seed, never the run seed. Then add the two checks in `window-views.md`, *Checks*:
- **No dead direction:** each of about a dozen 60° cones holds a landmark or band light, except the Deep pole.
- **Readability:** no default leg view has more than two major landmarks.

### 4. Transit moments, by leg (all from data)

| Leg | What to aim for | Reference |
|---|---|---|
| C02 → C03, looking aft | Twin Deeps shrinking: two small near-black discs, each a hair-thin warm crescent lit from the same side; the belt a thin line of sparks round the smaller; the radiation crescent a faint violet arc on one side (S21 azimuth) | **`8911eeaa` #1, on disk.** Its worlds crowd together; yours keep the data's spacing. Its violet trails like tails; yours is an arc |
| C03 → N01 | N01's unlit overhang slides across the Galaxy's core as a starless shape with a sharp edge: an eclipse of a galaxy | No image yet (T01b is out). Art bible: *Transit views* |
| P02 → P03 | The Well Garden far ahead as a small faint patch of violet threads tipped with sparks | No image yet (T02b is out). Needs P03's optical data first (see below) |
| P04 | The Bulge comes up as the sun goes behind a body and the eye adapts | `82158aac` #2, on disk |

Everywhere else, arrival and departure come free: bodies drawn at true angular size grow and shrink.

### 5. Encounters
For each region's view, use the art bible section named in the *views, region by region* table in `window-views.md`. Those with strong looks:
- C01 Unfamiliar Sky
- C02 Twin Deeps
- N01 Shadow Observatory
- P01 Listening Shelf
- R01 Red Wall
- C05 Braided Crossing
- N04 Petal Gallery
- C06 Turning Rim (openings, 4D)

For the funnels you've wired:
- **Lines:** the art bible's *Funnels* section.
- **Birth:** rings of loose violet dots at the wide end join into solid rings toward a brilliant throat point (`59418971` #3, described in words).
- **Precursors:** dotted rings.

## Not for VX to decide

- **Well Garden optical data.** Funnels stay absent until P03 supplies its optical data. That's a data gap for whoever owns P03 and the integrator, not an art call.
- **Collision shapes.** The slab, ridge and wheel bodies look non-spherical, but collide as spheres. The integrator decides.
- **The modest-laptop performance gate** (A18 item 7). If a look costs too much, say so, and the art thread will simplify the look rather than loosen the gate.
