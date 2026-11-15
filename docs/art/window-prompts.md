# Window prompts: the MidJourney reference library

Owner: the art-reference thread (ART), branch `art/window-references`. The integrator merges.

These prompts make **reference images only** (DECISIONS A23). No image ships in the game or is committed. The game draws every window view itself, from its own data and procedural rendering. The images show the builders what to aim for. What was chosen and why is in [selections.md](selections.md); the look in words is in [art-bible.md](art-bible.md).

## How to read an entry

- **Use**: *sky target* means the distant sky (stars, galaxies, far nebulae), which the window's procedural sky should match closely. *Look reference* means something the simulation models (a massive body, rocks, a funnel, the opening, Earth): the game draws it from its own data, and the image only sets its look.
- **For**: the thread that builds it. 2D: the room's window and sky. 3B: the funnels. OP: the opening sequence and Earth. 4D: the shared openings (Turning Rim, Passage, Petal Gallery). 3C: the radiation clouds and lattice.
- **Status**: to try, tried, chosen, dropped.
- **Honesty** notes say what the image must not show, and flag anything invented that needs the owner's or a builder's ruling.

## Parameters

Every prompt ends with the common tail:

```
--ar 21:9 --style raw --no text, letters, people, spaceship interior, frame
```

- **Field of view.** The window spans a 150° arc (A8). A 21:9 frame is the default; field panoramas use `--ar 3:1`. Treat a 21:9 image as roughly 100–150° across when judging sizes.
- **Violet is for fiction only** (Night Watch `well` and `lattice`, `#9b8cff`). Prompts for natural things add `purple, violet` to `--no`. Funnels, radiation clouds and openings may use it.
- **Pinpoint stars.** The window is an eye, not a telescope, so natural-sky prompts ask for pinpoint stars and add `diffraction spikes, lens flare` to `--no`.
- **After the hero.** When the owner picks a hero image, add `--sref <hero image URL>` to every later prompt (style weight `--sw 100` by default; drop to 50–70 when the subject fights the style). This keeps the set consistent.

## Try first

Four prompts, one per big look, so a hero for `--sref` can come from any of them:

1. **S01** the unfamiliar sky. It sits behind every scene, so it is the most likely hero.
2. **W01** the Well Garden field. The owner's showpiece.
3. **B01** Twin Deeps. The first real place, and the bodies' look.
4. **L03** the Turning Rim opening. The way home.

Round 1 ran on 2026-11-14; verdicts are in [selections.md](selections.md).

## Round 2: refinements

Each fixes what round 1 got wrong. `<…>` marks the URL of a round-1 image in MidJourney (open the image, copy its link).

### S01b — The unfamiliar sky, corrected
- **Fixes:** no ground, no fisheye, no teal cast; two crossing bands. **Status:** tried (round 2; see selections.md).

```
ultra-wide panoramic view of deep space seen from open space with no ground and no horizon, an unfamiliar star sky with two galactic bands crossing in a shallow X, one bright band with a broad near-white bulge torn by black filamentary dust lanes and tiny deep red knots, one fainter thinner band crossing it, neutral grey starlight, stars mostly deep red and blue-white, pinpoint stars, large areas of true black, restrained and quiet, true colour astrophotography, high dynamic range --ar 21:9 --style raw --sref <S01 f2d993f6 #2> --sw 60 --no text, letters, people, spaceship interior, frame, purple, violet, teal, green tint, ground, horizon, landscape, fisheye, diffraction spikes, lens flare, planets
```

### W01b — The Well Garden in three dimensions
- **Fixes:** funnels at random orientations through a volume, not parallel in a plane; keeps round 1's wireframe line language. **Status:** tried (round 2; see selections.md).

```
ultra-wide panoramic view in deep space, a vast three-dimensional field of long narrow funnels drawn as glowing violet wireframe, thin contour rings sparse at each wide mouth and crowding toward a long needle-thin bright throat, faint lines running along each funnel, every funnel pointing a different direction, some toward the viewer, some away, some above, some below, some sideways, one huge funnel close by, dozens at middle distance, hundreds far away as single threads of light, scattered dark rocks, black vacuum, unfamiliar stars visible through the funnels, cinematic, high dynamic range --ar 3:1 --style raw --sref <W01 8dcf1d92 #2> --sw 80 --no text, letters, people, spaceship interior, frame, parallel lines, ground, horizon, surface, swirl, spiral, solid funnels, lightning, smoke, fire
```

### L03b — The Turning Rim, oblique
- **Fixes:** tilted, as C06 asks; round 1's ragged rim kept; no smoke. **Status:** tried (round 2; see selections.md).

```
ultra-wide panoramic view of deep space, a large oval hole in the sky seen at a steep oblique angle so it appears as a tilted narrow ellipse, its rim a thin ragged luminous white edge with a violet fringe and fine tendrils curling outward like frayed paper lit from behind, through it a rich warm Milky Way with dense star clouds and red-brown dust, outside it a sparse cold unfamiliar star field, black vacuum, no tunnel, quiet and impossible, cinematic, high dynamic range --ar 21:9 --style raw --sref <L03 0384aeb7 #2> --sw 80 --no text, letters, people, spaceship interior, frame, smoke, clouds, fog, vortex, swirl, tunnel, wormhole, sparks
```

### Then (run in round 2)

W03 (a funnel end-on), L01 (the radiation crescent), X02 (Shadow Observatory) and E01 (Earth). Each with `--sref <B01 ca1c5c59 #2>` once the owner confirms it as the hero.

## Round 3: refinements and new places

Round 2 verdicts are in [selections.md](selections.md). Style references are named by job ID and grid position.

### W01c — The Well Garden, floating free
- **Fixes:** MidJourney keeps putting funnels on a floor. **Style refs:** `130bc062` #0 and `c29febbf` #1. **Status:** to try.

```
ultra-wide panoramic view of empty deep space with no ground, no floor and no horizon, hundreds of long narrow funnels floating freely in every direction like scattered needles, each drawn in thin crisp dim violet wireframe rings and lines that taper to a single brilliant white point at the narrow end, one large funnel nearby seen from the side, several pointing straight at the viewer as ring webs around a bright point, many far away as thin threads each ending in a tiny white spark, black vacuum between them, a few dark rocks, unfamiliar stars, cinematic, high dynamic range --ar 3:1 --style raw --no text, letters, people, spaceship interior, frame, ground, floor, surface, horizon, landscape, rain, spiral, swirl, tornado, solid funnels, pink, lightning, smoke, fire
```

### L01b — The radiation crescent, as a crescent
- **Fixes:** a partial arc beside the belt, not a ring wrapped round it. **Style ref:** `0a7953fe` #3. **Status:** to try.

```
ultra-wide panoramic view of deep space, a dark rocky sphere at the centre circled by a thin flat ring of sunlit asteroids, and beyond the ring on one side only a single curved crescent of soft streaming violet veils like a slow aurora, the crescent covering only a short arc of the circle, separated from the rocks by a gap of dark space, translucent with stars showing through, black vacuum elsewhere, quiet and menacing, cinematic, high dynamic range --ar 3:1 --style raw --no text, letters, people, spaceship interior, frame, full ring, flames, fire, lightning, ground, surface, plate, pink, green aurora
```

### L02b — The hairline opens
- **New:** the Turning Rim's first moment, the hairline starting to widen. **Style ref:** `9dcfe97b` #0 (and #1 for the arc). **Status:** to try.

```
ultra-wide panoramic view of deep space, high in the sky a hair-thin arc of white light with a faint violet fringe, along part of it the arc has begun to split open into a very narrow sliver of a different sky, a glimpse of a rich warm galactic band inside the sliver, its edge frayed into fine luminous fibres, the rest of the sky dark and unfamiliar with sparse stars, subtle and unsettling, cinematic, high dynamic range --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, smoke, clouds, snow, vortex, swirl, tunnel, laser, beam, pink
```

### X04b — The Red Wall
- **New place:** R01. **Style ref:** `ca1c5c59` #2 (the proposed hero). **Status:** to try.

```
ultra-wide panoramic view of deep space, a sheer vast face of rust red and garnet rock filling the right third of the view, layered and fractured, lit low and warm by a small distant sun so every ledge casts a long black shadow, above and below it cold black space with sparse unfamiliar stars, far off the faint edge-on lens of a distant galaxy, stark warm against cold, realistic, cinematic, high dynamic range --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, purple, violet, lens flare, lava, fire, glow, atmosphere, ground, bright red
```

---

## 1. The deep sky (sky targets)

### S01 — The unfamiliar sky (hero candidate)
- **Region:** C01 Unfamiliar Sky, and the default sky behind every encounter. **Use:** sky target. **For:** 2D. **Status:** tried (round 1; see selections.md).
- **Intent:** beautiful, and subtly wrong. Our sky has one Milky Way band; this one has two faint bands crossing at a shallow angle, and its star colours lean to deep red and blue-white with few yellows.

```
ultra-wide panoramic view of deep space from a spacecraft window, an unfamiliar star field with no recognisable constellations, two faint milky galactic bands crossing at a shallow angle low across the sky, dense uneven star clouds, stars mostly deep red and cold blue-white with very few yellow stars, pinpoint stars, dark dust lanes along the bands, a few faint distant galaxies, vast black emptiness above, cinematic, high dynamic range, JWST-like detail, true colour astrophotography --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, purple, violet, diffraction spikes, lens flare, planets
```

### S02 — Transit dark
- **Region:** open transit between encounters (A12: time runs, nothing dangerous). **Use:** sky target. **For:** 2D. **Status:** to try.
- **Intent:** the quiet sky the player sees while walking the room and preparing. Mostly black, sparse stars, one tiny distant galaxy. Restful, lonely.

```
ultra-wide panoramic view of nearly empty deep space, sparse faint pinpoint stars scattered unevenly, large regions of pure darkness, one tiny distant spiral galaxy far off to one side, extreme stillness and silence, subtle star colour variation, cinematic, high dynamic range, true colour astrophotography --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, purple, violet, nebula, diffraction spikes, lens flare, planets
```

### S03 — A sky of distant galaxies
- **Region:** transit and the far background of C03 Lantern Field. **Use:** sky target. **For:** 2D. **Status:** to try.

```
ultra-wide panoramic deep field of space, dozens of distant galaxies of many shapes scattered sparsely across black sky, edge-on spirals, faint ellipticals, a small interacting pair, few foreground stars, Hubble and JWST deep field realism, natural colours, high dynamic range, cinematic --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, purple, violet, diffraction spikes, lens flare, planets
```

### S04 — This universe's small far sun
- **Region:** every lit encounter (A3: one distant sun, parallel light). **Use:** sky target for the sun's disc and glare. **For:** 2D. **Status:** to try.
- **Honesty:** the sun's brightness is an open owner decision (A3, P14 item 3). Bright enough to wash out nearby stars, or dim enough to leave them? This prompt keeps it small and hard, with stars still visible away from it. Tell the owner if the result forces the choice.

```
ultra-wide panoramic view of deep space with a single small distant sun, a tiny hard white-gold disc with a tight soft glow, no rays, the star field still visible across the rest of the sky but suppressed near the sun, unfamiliar sparse stars, cold black vacuum, high dynamic range, realistic exposure, cinematic --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, purple, violet, lens flare, sun rays, god rays, planets
```

### S05 — A knife-thin galaxy
- **Region:** alternative default sky (variant of S01). **Use:** sky target. **For:** 2D. **Status:** to try.
- **Intent:** another way to be wrong: the galactic band is razor-thin and unnaturally straight, as if this galaxy is seen exactly edge-on from inside its thinnest layer.

```
ultra-wide panoramic star field from deep space, a single razor-thin bright galactic band crossing the whole sky perfectly straight like a scratch of light, a fine dark dust lane splitting it lengthwise, the rest of the sky sparse and dark, unfamiliar stars, pinpoint stars, true colour astrophotography, high dynamic range, cinematic --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, purple, violet, diffraction spikes, lens flare, planets
```

### S06 — Familiar sky (control image)
- **Region:** H02 Familiar Sky and the opening (A17, A21). **Use:** sky target, and the control the strange skies are judged against. **For:** OP, 2D. **Status:** to try.
- **Intent:** our real sky, recognisably. The Milky Way band and real constellations (Orion and its neighbours) so the ending's sky reads as home.

```
ultra-wide panoramic view of the real night sky from space, the Milky Way band crossing the sky with its familiar dust lanes, the constellation Orion recognisable with red Betelgeuse and blue Rigel, pinpoint stars, true colour astrophotography, no atmosphere, black vacuum, high dynamic range, cinematic --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, purple, violet, diffraction spikes, lens flare, planets, earth
```

---

## 2. Planets, moons and massive bodies (look references)

These bodies pull the ship. The game draws them from their own data; the images set surface, lighting and mood only. Sizes in the prompts follow the data where it exists.

### B01 — Twin Deeps (hero candidate)
- **Region:** C02 Twin Deeps. **Use:** look reference for Alpha, Beta and the belt. **For:** 2D. **Status:** tried (round 1; see selections.md).
- **Data:** Alpha 250 km radius, Beta 160 km, 4,000 km apart (P16). At the ship's working distances each spans roughly 10–18°: a clear disc, not a looming wall. Alpha sits above and forward, Beta below and to starboard. Beta has a prograde rock ring 600–1,000 km out, a few kilometres thick.

```
ultra-wide panoramic view in deep space of two dark rocky worlds orbiting each other, the larger one upper left, the smaller one lower right, both nearly black basalt with only thin sunlit crescents from a small distant sun, a thin flat ring of scattered asteroids circling the smaller world seen at a shallow angle, individual rocks catching sunlight like sparks, unfamiliar star field behind, realistic scale, cinematic, high dynamic range, NASA mission photography realism --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, purple, violet, atmosphere, clouds, lens flare
```

### B02 — Inside Beta's belt
- **Region:** C02, the slingshot pass at about 830 km (A18). **Use:** look reference for belt rocks. **For:** 2D. **Status:** to try.

```
ultra-wide panoramic view from inside a thin asteroid belt, irregular dark rocks of many sizes receding in a flat band toward the horizon, nearest rocks large and sharply lit from one side by a small distant sun, deep shadows, the dark curved limb of a rocky world filling the lower edge, sparse unfamiliar stars, realistic, cinematic, high dynamic range --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, purple, violet, lens flare, dense fog
```

### B03 — Arrival: a limb below (C01)
- **Region:** C01 Unfamiliar Sky. **Use:** look reference. **For:** 2D. **Status:** to try.
- **Data:** "a distant limb below and fragments above/aside make depth ambiguous". One apparent star is really a nearby fragment.

```
ultra-wide panoramic view of space, the vast dark curved limb of a distant rocky world along the bottom of the frame with a hair-thin sunlit edge, small rock fragments floating above and to the sides at ambiguous depths, one fragment so small and bright it looks like a star, unfamiliar sparse stars, eerie stillness, cinematic, high dynamic range, realistic --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, purple, violet, lens flare, atmosphere
```

### B04 — A ringed world, far away
- **Region:** transit sky, or seen from C03 Lantern Field. **Use:** look reference for distant bodies. **For:** 2D. **Status:** to try.
- **Honesty:** only at a great distance (a small disc), so nothing implies a pull the physics doesn't have. No region page has a ringed world yet; if the owner likes it, the integrator decides where it lives.

```
ultra-wide panoramic deep space view, a small distant ringed planet far away in the upper third of the sky, banded in dark ochre and slate, its thin bright rings seen nearly edge-on, half in shadow from a small distant sun, vast unfamiliar star field around it, sense of enormous distance, realistic, cinematic, high dynamic range --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, purple, violet, lens flare
```

### B05 — Dark moon (Countercurrent)
- **Region:** A01 Countercurrent ("a dark moon lies below"). **Use:** look reference. **For:** 2D. **Status:** to try.

```
ultra-wide panoramic view of a small dark irregular moon below, heavily cratered charcoal surface lit low and raking by a small distant sun so every crater rim glints, long black shadows, unfamiliar stars above, cold and silent, realistic, NASA mission photography realism, cinematic, high dynamic range --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, purple, violet, lens flare, atmosphere
```

### B06 — Back of the World
- **Region:** P04 Back of the World. **Use:** look reference. **For:** 2D. **Status:** to try.
- **Data:** a dark body blocks one side; fragments at different heights hide stars; a narrow sunlit limb lies off the velocity vector. The sun is behind the body (A3 shadow).

```
ultra-wide panoramic view of space, an enormous dark world blocking the entire left half of the sky as a black void with no stars, a razor-thin sunlit limb along its far edge, small rock fragments at different heights silhouetted against the star field and hiding stars, the right half full of unfamiliar stars, deep shadow, realistic, cinematic, high dynamic range --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, purple, violet, lens flare, atmosphere, glow
```

### B07 — Sunward
- **Region:** P02 Sunward. **Use:** look reference. **For:** 2D. **Status:** to try.
- **Honesty:** "sunlight is visible on surfaces … never as a beam in empty vacuum."

```
ultra-wide panoramic view of space, the brilliant sunlit limb of a large rocky world rising across the right side, its surface harshly lit by a small distant sun, overlapping dark silhouettes of rock above and below the line of approach, light only where it falls on surfaces, black vacuum everywhere else, realistic, cinematic, high dynamic range --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, purple, violet, lens flare, god rays, light beams, atmosphere
```

---

## 3. The gravity wells (look references for 3B)

**Data (A19, S22):** a funnel is about 120 km long, 20 km across the mouth and 1 km at the throat, with a quadratic taper. About 2,600 sites at random orientations through 3D. Contour rings are sparse at the mouth and crowd together down the taper; meridians run along it; the throat is narrow and luminous. The funnels emit their own light (no sunlight needed). New ones appear after a 900 s precursor: faint, incomplete contour arcs and meridians condense along the future funnel and brighten steadily, then become a continuous form over 120 s. **No flashing.** S22: a few strong nearby silhouettes and many dim distant forms read better than thousands of equally bright ones.

**Honesty:** the window may show shape and position only. It must not suggest what wells do (no visible streams of matter being sucked in unless the simulation advects them, no lightning, no damage beams). Note: the P03 page still says "no visible optical funnels"; A19 and S22 supersede that.

### W01 — The Well Garden (hero candidate)
- **Region:** P03 Well Garden. **Use:** look reference. **For:** 3B, 2D. **Status:** tried (round 1; see selections.md).

```
ultra-wide panoramic view of a vast field of thousands of long narrow luminous funnels drifting in deep space at random orientations, each funnel drawn as fine glowing violet contour rings that tighten along a long tapering throat with faint lines running its length, one enormous nearby funnel mouth spanning a third of the view, distant funnels shrinking to fine threads of light receding into depth in every direction, dark rocks scattered between them, unfamiliar stars behind, a whole field of destruction and beauty, cinematic, high dynamic range, scientific visualisation meets astrophotography --ar 3:1 --style raw --no text, letters, people, spaceship interior, frame, lightning, smoke, fire
```

### W02 — One funnel, close
- **Region:** P03, a near pass. **Use:** look reference for ring spacing and glow. **For:** 3B. **Status:** to try.

```
ultra-wide panoramic view of a single colossal luminous funnel in deep space seen from the side, its wide mouth on the left made of sparse thin glowing violet rings, the rings crowding closer and closer together as it tapers into a long narrow throat on the right, faint straight lines running along its length, the throat a needle of bright white-violet light, the funnel transparent with stars visible through it, black vacuum, elegant and dangerous, cinematic, high dynamic range --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, lightning, smoke, fire, solid surface
```

### W03 — Looking down the throat (end-on)
- **Region:** P03, the view along a funnel's axis. **Use:** look reference. **For:** 3B. **Status:** tried (round 2; see selections.md).
- **Intent:** end-on, a funnel becomes concentric rings around a bright point: an eye or a target. A strange, readable silhouette.

```
ultra-wide panoramic view in deep space, a vast funnel seen straight down its axis, dozens of glowing violet concentric rings spaced wide at the outside and crowding tightly toward a tiny brilliant white point at the centre, like looking down an infinitely deep well of light, faint radial lines, stars visible between the rings, other funnels at angles in the distance, hypnotic, cinematic, high dynamic range --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, lightning, smoke, fire, tunnel walls
```

### W04 — Precursor shimmer
- **Region:** P03, a precursor beside an active well. **Use:** look reference. **For:** 3B. **Status:** to try.

```
ultra-wide panoramic view of deep space, on the left a complete glowing violet funnel of contour rings tapering to a bright throat, on the right a ghostly incomplete funnel just beginning to appear, only faint broken arcs and dotted fragments of rings hanging in the dark along its future shape, barely brighter than the stars, like frost forming in vacuum, unfamiliar stars, quiet and ominous, cinematic, high dynamic range --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, lightning, smoke, fire, sparks, explosion
```

### W05 — A well being born
- **Region:** P03, the 120 s ramp. **Use:** look reference. **For:** 3B. **Status:** to try.

```
ultra-wide panoramic view of deep space, a long narrow funnel of violet light in the moment of forming, its broken contour arcs joining into continuous rings from the mouth toward the throat, the near half solid glowing structure, the far half still faint dotted fragments, the throat igniting into a thin bright line, calm and inevitable, unfamiliar stars, cinematic, high dynamic range --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, lightning, smoke, fire, explosion, shockwave
```

### W06 — Funnels among dark landmarks
- **Region:** P03 arrival: "dark landmarks occupy different depths above, below and beside the course". **Use:** look reference for composition. **For:** 3B, 2D. **Status:** to try.

```
ultra-wide panoramic view of deep space, large dark rocks hanging at different depths above below and beside the viewer, between and beyond them dozens of long narrow funnels of faint violet light at random angles, some pointing toward the viewer, some away, some crossing sideways, nearer funnels bright and detailed, farther ones dim threads, the rocks lit only by a small distant sun and faintly by violet glow on their edges, cinematic, high dynamic range --ar 3:1 --style raw --no text, letters, people, spaceship interior, frame, lightning, smoke, fire
```

### W07 — The garden from afar
- **Region:** the approach to P03 (seen from P02 Sunward or P01). **Use:** look reference. **For:** 2D. **Status:** to try.
- **Intent:** a glimmer. From far away the field is a faint violet haze of crossed threads on the horizon, like frost on glass.

```
ultra-wide panoramic view of deep space, far in the distance near the horizon a faint haze of thousands of tiny crossed violet threads like frost or fine grass, too far to see individual shapes, the rest of the sky dark with unfamiliar sparse stars, a sense of a strange place ahead, cinematic, high dynamic range --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, lightning, smoke, fire, aurora
```

---

## 4. Light displays

### L01 — The radiation crescent at Twin Deeps
- **Region:** C02 Twin Deeps, the cloud crescent on the belt's outer edge (A18 after S21: 1,000–2,600 km from the binary, co-rotating). **Use:** look reference. **For:** 3C, 2D. **Status:** tried (round 2; see selections.md).
- **Honesty:** fictional, so violet is allowed. It is diffuse glow, not lightning, and it should read as dangerous by its placement, not by drama.

```
ultra-wide panoramic view in deep space, a vast faint crescent of glowing violet radiation cloud curving around the outer edge of a thin asteroid belt, soft veils and filaments like a slow aurora with no planet, the belt rocks catching sunlight inside the curve, a dark rocky world at the centre of the belt, unfamiliar stars dimmed behind the glow, quiet and menacing, cinematic, high dynamic range --ar 3:1 --style raw --no text, letters, people, spaceship interior, frame, lightning, fire, green aurora, atmosphere
```

### L02 — The hairline
- **Region:** C06 Turning Rim, first sight ("a hairline high in the window"). **Use:** look reference. **For:** 4D, 2D. **Status:** to try.

```
ultra-wide panoramic view of deep space, high in the sky a single impossibly thin straight line of pale light no wider than a hair, as if the sky itself had a crack, faint stars around it, otherwise empty unfamiliar star field, subtle and unsettling, cinematic, high dynamic range --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, lightning, laser, beam, planets
```

### L03 — The Turning Rim opening (hero candidate)
- **Region:** C06 Turning Rim. **Use:** look reference. **For:** 4D, 2D. **Status:** tried (round 1; see selections.md).
- **Data:** an oblique oval with a differently oriented sky inside it. It moves and turns. The far side shows only along clear sight lines through the opening. Earth may be visible through it whenever geometry allows (C06), never hidden for drama.
- **Honesty:** the rim should be thin. No tunnel, no swirl, no wormhole vortex: it is a hole in the sky with another sky in it.

```
ultra-wide panoramic view of deep space, a large oblique oval opening hanging in the sky with a thin faint violet rim, inside the oval a completely different sky, a denser warmer star field and a bright galactic band tilted at a different angle from the band outside, the edge sharp with no tunnel and no swirl, outside the oval a sparse unfamiliar sky, the two skies meeting at the rim, quiet and impossible, cinematic, high dynamic range --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, vortex, swirl, tunnel, wormhole, portal effects, sparks
```

### L04 — Starlight at the rim
- **Region:** C06, H01 close in. **Use:** look reference, **needs a ruling.** **For:** 4D. **Status:** to try.
- **Honesty:** stars stretched into short arcs near the rim would be lensing. S6 maps rays through the opening and sends no gravity through it (A15 Q24); it says nothing about bending at the rim. Make this only if 4D or the owner wants to consider it; otherwise drop.

```
ultra-wide panoramic view of deep space, close to the edge of a vast oval opening in the sky, stars near the thin rim stretched into short curved arcs as if light bends around the edge, the far sky visible through the opening, unfamiliar stars outside, subtle and precise like gravitational lensing photography, cinematic, high dynamic range --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, vortex, swirl, tunnel, sparks
```

### L05 — The Passage
- **Region:** H01 Passage: "an inclined moving opening fills the forward view; unfamiliar sky remains around its rim". **Use:** look reference. **For:** 4D, 2D. **Status:** to try.

```
ultra-wide panoramic view of deep space, an enormous tilted oval opening filling most of the view, through it a different sky with the familiar Milky Way band and a tiny pale blue point of light, around its thin violet rim a strip of strange unfamiliar stars, the opening slightly turning, tense and hopeful, cinematic, high dynamic range --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, vortex, swirl, tunnel, wormhole, sparks, large earth
```

### L06 — Petal Gallery
- **Region:** N04 Petal Gallery: small openings above, below and behind, each showing one remote landmark at a different orientation, spread through a volume, not a row. **Use:** look reference. **For:** 4D, 2D. **Status:** to try.

```
ultra-wide panoramic view of deep space, dozens of small oval openings scattered at different distances and angles like petals hanging in the dark, each opening showing the same distant spiral galaxy inside it but turned to a different angle in each, thin faint violet rims, the openings near and far at different sizes, unfamiliar stars around them, a puzzle of repeated views, cinematic, high dynamic range --ar 3:1 --style raw --no text, letters, people, spaceship interior, frame, vortex, swirl, tunnel, mirrors, picture frames
```

### L07 — Lantern Field: a rim brightening
- **Region:** C03 Lantern Field: "a rim brightens high to port, a lower lead passes behind rock". **Use:** look reference. **For:** 2D. **Status:** to try.

```
ultra-wide panoramic view of deep space, high on the left the edge of an unseen dark body slowly catching sunlight so a thin arc brightens like dawn, below a scattering of small sunlit rocks glowing softly like distant lanterns in the dark, one pale point of light disappearing behind a rock, unfamiliar stars, calm and inviting, cinematic, high dynamic range --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, purple, violet, lens flare, atmosphere, lanterns, fire
```

---

## 5. Gas and clouds

### G01 — A far nebula
- **Region:** distant sky behind any scene. **Use:** sky target. **For:** 2D. **Status:** to try.
- **Night Watch:** the flight hologram is drawn in front of the window, so the sky must stay dim and low in saturation, especially in teal, magenta and lime (forecast, thrust and velocity hues). The prompt asks for a faint, small nebula.

```
ultra-wide panoramic view of deep space, a faint small emission nebula far away in one corner, dim deep red hydrogen glow with darker dust, desaturated and subtle, the rest of the sky an unfamiliar star field, true colour astrophotography, high dynamic range --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, purple, violet, bright cyan, diffraction spikes, lens flare, planets
```

### G02 — Countercurrent streamer
- **Region:** A01 Countercurrent: "a tenuous streamer extends above and behind" a dark moon. **Use:** look reference, **needs a ruling.** **For:** 2D. **Status:** to try.
- **Honesty:** A01 says visible scattering needs a supported optical assumption; without one the game shows tracked particles and residuals instead. Gas itself is deferred (A15 Q20). This image is for the owner's decision, not for building yet.

```
ultra-wide panoramic view of deep space, a small dark moon below, from behind it a long tenuous streamer of fine dust and gas flowing upward across the sky, barely visible, lit faintly from the side by a small distant sun, individual specks of dust sparkling along it, unfamiliar stars through it, realistic, like comet tail photography, cinematic, high dynamic range --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, purple, violet, lens flare, smoke, fire
```

### G03 — A dust lane lit from behind
- **Region:** distant sky (C03 or C04 background). **Use:** sky target. **For:** 2D. **Status:** to try.

```
ultra-wide panoramic view of deep space, a long dark dust lane silhouetted against a faint glowing distant star cloud, its edges lit from behind in thin bright rims, delicate filaments and pillars, desaturated warm and grey tones, unfamiliar stars, true colour astrophotography, JWST-like detail, high dynamic range --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, purple, violet, diffraction spikes, lens flare, planets
```

### G04 — Inside the radiation cloud's edge
- **Region:** C02, the inner edge of the crescent. **Use:** look reference. **For:** 3C, 2D. **Status:** to try.

```
ultra-wide panoramic view from the edge of a thin glowing violet radiation cloud in deep space, faint veils drifting past at different depths, scattered dark rocks inside the haze lit by a small distant sun, stars dimmed and softened beyond, a sense of invisible danger, quiet, cinematic, high dynamic range --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, lightning, fire, smoke, green aurora
```

### G05 — A small reflection nebula
- **Region:** distant sky. **Use:** sky target. **For:** 2D. **Status:** to try.

```
ultra-wide panoramic view of deep space, a small distant star cluster wrapped in a faint pale blue reflection nebula, wispy and dim, unfamiliar star field around it, lots of dark empty sky, true colour astrophotography, high dynamic range --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, purple, violet, diffraction spikes, lens flare, planets
```

---

## 6. Earth and the black hole (look references for OP)

**Data (OP, S23):** the opening scene sits 250,000 km from Earth at an 83.24° phase angle, so Earth is a **2.92° disc, about 56 % lit** (just past half). In a 150° window that is about 2 % of the width: small, unmistakable, never large. The ending uses the same sky, phase and framing (OP `HOME_SHOT`). Earth's size and look are fixed and never seeded (H02).

**Honesty:** MidJourney will draw Earth far too large in a wide frame. E01 asks for tiny; E02 is a close crop for the surface only. No accretion disc for the black hole: nothing in A21 or OP models one, and a ship near one would be destroyed. OP's anomaly is three stars bending locally just before the cut.

### E01 — Earth in the distance (the opening and the ending)
- **Region:** A21 opening, A17 ending. **Use:** look reference for scale and mood. **For:** OP. **Status:** tried (round 2), then stopped: Earth is about five seconds of the game and OP already draws it (owner).

```
ultra-wide panoramic view of deep space from a spacecraft returning from Mars, far away a tiny Earth, a small blue and white disc just over half lit by the sun, very small in the frame, the familiar Milky Way and real constellations around it, black vacuum, quiet longing, realistic, NASA photography realism, high dynamic range --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, purple, violet, lens flare, large earth, moon close up, atmosphere glow
```

### E02 — Earth's face (surface crop)
- **Region:** the same Earth, cropped. **Use:** look reference for OP's procedural surface (ocean, land, clouds, terminator). **For:** OP. **Status:** dropped (owner: Earth is about five seconds of the game; OP draws it).
- **Note:** a crop, so a squarer frame is fine here.

```
Earth seen from deep space at a phase just over half lit, sharp day-night terminator, deep blue oceans, tan and green continents, swirling white cloud bands, thin blue atmospheric limb on the lit edge, black space, NASA Blue Marble photography realism, high dynamic range --ar 16:9 --style raw --no text, letters, people, spaceship interior, frame, purple, violet, lens flare, city lights, moon
```

### E03 — The pull
- **Region:** A21, the moment before dark. **Use:** look reference. **For:** OP. **Status:** dropped (owner: Earth is about five seconds of the game; OP draws it).

```
ultra-wide panoramic view of deep space, the familiar starry sky with a tiny distant Earth, but near the centre of the view a few stars are subtly bent and smeared into short arcs around an invisible point, a faint distortion like heat haze in vacuum, no visible black hole, no disc, the moment before something terrible, cinematic, high dynamic range, realistic gravitational lensing --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, purple, violet, accretion disk, black sphere, vortex, swirl, lightning, large earth
```

### E04 — Home, framed
- **Region:** A17's last moment: Earth in the distance beneath familiar stars. **Use:** look reference for mood. **For:** OP. **Status:** dropped (owner: Earth is about five seconds of the game; OP draws it).
- **Note:** the ending is the same shot as E01. This prompt only explores the emotional register (warmer, a touch more light).

```
ultra-wide panoramic view of deep space, a tiny blue Earth just over half lit, small and far but unmistakable, beneath the familiar Milky Way and recognisable constellations, a faint warm glint on its oceans, profound calm after a long journey, realistic, high dynamic range, cinematic --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, purple, violet, lens flare, large earth, sunrise, atmosphere glow
```

---

## 7. Extra credit: things only this universe has

### Seeds from the brief

#### X01 — Stars that appear twice (recursion motif)
- **Region:** N04 Petal Gallery or C06 Turning Rim. **Use:** look reference, **needs a ruling.** **For:** 4D. **Status:** to try.
- **Honesty:** a star seen twice is only true where an opening shows the same sky from another place. A whole sky of doubled stars would be invented physics. Tie it to the openings: a few stars seen both outside and inside one small opening.

```
ultra-wide panoramic view of deep space, a small oval opening with a thin violet rim, through it the same distinctive cluster of three bright stars that also hangs outside it in the open sky, so the same pattern appears twice, slightly turned, subtle and uncanny, unfamiliar sparse stars, cinematic, high dynamic range --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, vortex, swirl, mirror, reflection
```

#### X02 — Shadow Observatory: bodies seen only by the stars they hide
- **Region:** N01 Shadow Observatory: "the overhang occupies the upper window while fragments move below and beyond it". **Use:** look reference. **For:** 2D. **Status:** tried (round 2; see selections.md).

```
ultra-wide panoramic view of deep space, the upper half of the sky an enormous starless black shape, an unlit overhang visible only because it hides the stars, its edge traced only by where the star field stops, below it small black fragments drifting across a dense star field, each one a moving hole in the stars, no light on any of them, eerie, cinematic, high dynamic range --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, purple, violet, lens flare, glow, rim light
```

#### X03 — Something ship-like in the distance
- **Region:** **A03 Borrowed Spin**, not R04. **Use:** look reference. **For:** 2D. **Status:** to try.
- **Honesty:** R04 Crooked Ship is about the player's own ship (a lopsided configuration); its page has no foreign vessel, and inventing one would imply a story the game doesn't have. A03 does have one: "a rotating abandoned structure spans the window; arms sweep above/below". This prompt draws that.

```
ultra-wide panoramic view of deep space, a vast abandoned rotating structure spanning the view, long girder arms sweeping slowly above and below a central hub, dark weathered metal lit edge-on by a small distant sun, no lights, no windows glowing, its scale ambiguous, silent and ancient, unfamiliar stars, realistic, cinematic, high dynamic range --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, purple, violet, lens flare, sci-fi spaceship, glowing lights
```

#### X04 — The Red Wall
- **Region:** R01 Red Wall: "a warm-lit face fills one side of the window while cold-looking darkness extends above and below". **Use:** look reference. **For:** 2D. **Status:** to try.
- **Honesty:** the face's colour is a landmark, not glowing heat (R01: no hot-body radiation is modelled). Draw a rust-red surface lit by the far sun, not a wall of emitted light.

```
ultra-wide panoramic view of deep space, a sheer vast cliff face of rust red rock filling the right third of the view, lit warm by a small distant sun, its surface layered and fractured, above and below it cold blue-black darkness and sparse unfamiliar stars, stark contrast of warm and cold, realistic, cinematic, high dynamic range --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, purple, violet, lens flare, lava, fire, glow, atmosphere
```

#### X05 — The Listening Shelf
- **Region:** P01 Listening Shelf: "a broad face hangs above the window while fragments move at distinct depths below"; repeated reflected flashes beyond the shoulder. **Use:** look reference. **For:** 2D. **Status:** to try.
- **Invented, flagged:** shallow bowl-shaped hollows across the face that read like ears. Pure landform, no machinery, so it suggests listening without claiming anything.

```
ultra-wide panoramic view of deep space, a vast broad rock face hanging overhead across the top of the view, its underside covered in rows of shallow smooth bowl-shaped hollows like giant ears, lit faintly by a small distant sun, below it rock fragments drifting at different depths, far beyond its shoulder a tiny repeated glint of reflected light, uncanny attentive stillness, realistic, cinematic, high dynamic range --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, purple, violet, lens flare, satellite dishes, machinery
```

### The thread's own ideas

#### X06 — Beta's shadow across the belt
- **Region:** C02 Twin Deeps. **Use:** look reference. **For:** 2D. **Status:** to try.
- **Why:** true to A3 (bodies cast shadows) and beautiful: rocks wink out one by one as they cross into Beta's shadow and reappear on the far side.

```
ultra-wide panoramic view of deep space, a dark rocky world casting a long shadow across a thin ring of asteroids that orbits it, rocks bright in sunlight on either side and abruptly dark inside the shadow band, the shadow a clean cylinder of darkness cutting the ring, small distant sun, unfamiliar stars, realistic, cinematic, high dynamic range --ar 3:1 --style raw --no text, letters, people, spaceship interior, frame, purple, violet, lens flare, god rays, light beams
```

#### X07 — The belt edge-on: a false hairline
- **Region:** C02 Twin Deeps. **Use:** look reference, and a design idea. **For:** 2D. **Status:** to try.
- **Why:** seen exactly edge-on, Beta's thin belt is a hairline of light across the sky. Much later the Turning Rim also starts as a hairline (L02). A player who has seen both has to ask which one this is: an honest echo.

```
ultra-wide panoramic view of deep space, a thin ring of asteroids around a dark world seen exactly edge-on so it becomes a single fine line of sparkling light cutting across the sky through the world's dark disc, unfamiliar stars, small distant sun, realistic, cinematic, high dynamic range --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, purple, violet, lens flare, laser, beam
```

#### X08 — Lantern Field: the silhouette astern
- **Region:** C03 Lantern Field: "a repeated silhouette lies astern". **Use:** look reference. **For:** 2D. **Status:** to try.

```
ultra-wide panoramic view of deep space, two distant dark rock silhouettes of exactly the same distinctive shape, one near the left edge and one near the right, as if one object were seen twice, scattered small sunlit rocks glowing softly between them, unfamiliar stars, quietly unsettling, realistic, cinematic, high dynamic range --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, purple, violet, lens flare, mirror, reflection
```

#### X09 — Far Aperture: a flicker between two edges
- **Region:** N02 Far Aperture: "one body edge crosses the upper window and another recedes below; a flicker lies between them". **Use:** look reference. **For:** 2D. **Status:** to try.

```
ultra-wide panoramic view of deep space, the dark curved edge of a huge body crossing the top of the view and another smaller dark body receding far below, between them a single small point of light that seems to flicker as it slips in and out of view, depth impossible to judge, unfamiliar stars, realistic, cinematic, high dynamic range --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, purple, violet, lens flare, glow, atmosphere
```

#### X10 — Unseen Cathedral: the calm before
- **Region:** N03 Unseen Cathedral. **Use:** look reference. **For:** 2D. **Status:** to try.
- **Honesty (A16):** the lattice is invisible to the eye. The window shows an ordinary rock field, and nothing may hint at the strands: no glow, no aligned rocks, no shafts. The image should be the most peaceful in the set, which is the trap.

```
ultra-wide panoramic view of deep space, a sparse peaceful field of ordinary dark rocks drifting above and below with wide open gaps between them, softly lit by a small distant sun, plenty of clear dark space, unfamiliar stars, calm and inviting and completely ordinary, realistic, cinematic, high dynamic range --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, purple, violet, lens flare, glow, grid, lines, beams, fog
```

#### X11 — Missing Room: the recess
- **Region:** R03 Missing Room: "a sheltered recess overlooks rocks above and below apparently empty gaps". **Use:** look reference. **For:** 2D. **Status:** to try.

```
ultra-wide panoramic view of deep space from just outside a deep sheltered recess in a vast rock body, dark curved rock walls at the edges of the view, beyond the opening of the recess a field of scattered rocks above and below with large empty gaps between them, unfamiliar stars, quiet and enclosed, realistic, cinematic, high dynamic range --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, purple, violet, lens flare, glow, cave entrance light rays
```

#### X12 — The Hinge
- **Region:** R02 Hinge: "a narrow ridge lies above and beyond the ship while isolated rocks supply lateral and depth references". The well boundary there is invisible. **Use:** look reference. **For:** 2D. **Status:** to try.

```
ultra-wide panoramic view of deep space, a long knife-thin ridge of dark rock high above and beyond, only its sharp crest catching a sliver of light from a small distant sun, a few isolated rocks at different distances below for scale, unfamiliar stars, vast and precise, realistic, cinematic, high dynamic range --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, purple, violet, lens flare, glow, mountains, atmosphere
```

#### X13 — Back of the World: the far sun at the limb
- **Region:** P04 Back of the World, entering or leaving the eclipse chord. **Use:** look reference. **For:** 2D. **Status:** to try.
- **Why:** real eclipse physics. As the small far sun slips behind the dark body, a brilliant bead of light sits on the limb and the stars come up around it.

```
ultra-wide panoramic view of deep space, a vast dark world, a small distant sun just slipping behind its edge so only one brilliant bead of light remains on the black limb with a faint pale corona, stars emerging across the sky as the light fades, realistic eclipse photography, cinematic, high dynamic range --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, purple, violet, lens flare, god rays, atmosphere
```

#### X14 — Braided Crossing
- **Region:** C05 Braided Crossing: "inclined debris crosses above and below; clear centres have no common straight axis; separated wells lie on the approaches". The lattice stays invisible (A16). **Use:** look reference. **For:** 2D, 3B. **Status:** to try.

```
ultra-wide panoramic view of deep space, several long streams of rock debris crossing above and below at different tilted angles like loose braids, gaps between them that never line up, a few separate violet funnels glowing in the distance between the streams, small distant sun lighting the rocks, unfamiliar stars, complex and threatening, realistic, cinematic, high dynamic range --ar 3:1 --style raw --no text, letters, people, spaceship interior, frame, lightning, grid, lattice, fog
```

#### X15 — Earth through the rim
- **Region:** C06 Turning Rim, before the Passage. **Use:** look reference. **For:** 4D, OP. **Status:** to try.
- **Why:** C06 and A13 say Earth is visible whenever geometry allows, never withheld. A first glimpse of a tiny blue point inside the strange oval is the best "glimmer" in the game.

```
ultra-wide panoramic view of deep space, a distant oblique oval opening in the sky with a thin violet rim, inside it a different sky with the familiar Milky Way and one tiny pale blue point of light, outside it a sparse unfamiliar sky, the blue point small and easy to miss, quiet hope, cinematic, high dynamic range --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, vortex, swirl, tunnel, large earth
```

#### X16 — Stillwater
- **Region:** C04 Stillwater: "a massive limb sits to one side; the charted Cathedral lies high behind; another glimmer is below. Nearby sparse landmarks". **Use:** look reference. **For:** 2D. **Status:** to try.

```
ultra-wide panoramic view of deep space, a massive dark world's limb along the left side with a soft sunlit edge, a few sparse distant rocks hanging motionless, below and far away one faint point of light, very few stars, a deep sense of calm and stillness like still water at night, realistic, cinematic, high dynamic range --ar 21:9 --style raw --no text, letters, people, spaceship interior, frame, purple, violet, lens flare, water, reflection, atmosphere
```

## Not proposed

- **A02 Tidal Orchard** is deferred (A15 Q21 after S19), so no prompt.
- **Mars** sits behind the ship on the way home (A21), outside the forward window. Add a prompt only if the owner wants it in the opening.
