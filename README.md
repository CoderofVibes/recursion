# Recursion

**[Play Recursion in your browser](https://coderofvibes.github.io/recursion/)** · NASA Space Apps 2026, *Space Mission Design Game*

A ship returning from Mars is caught in recurrence in an unfamiliar universe, where gravity doesn't follow the law its navigation was built on. Recursion is a spacecraft engineering game about getting home by evidence. You state what an attempt is for, set the ship's power and recording, plan a burn against a forecast and its uncertainty, fly it, and read the Black Box when the ship restarts. The records survive each restart. From them you test a new law of gravity on data it has never seen, adopt it if it holds, and the next forecast reaches further.

It answers the challenge as a return mission redesigned in flight: objectives and margins set before the engineering choices, a real ship with limited propellant, power, heat and recorder storage, a simulation that shows what each choice cost, and a report after every attempt that says why it held or failed.

## How to play

Works in a current desktop browser with a keyboard and mouse. No install, no sign-in.

- **The opening** plays once per browser (about 20 seconds). Add `?opening=replay` to the address to see it again, with Skip.
- **The room.** Click to look, walk with **WASD**, or press **1** MAP, **2** SHIP, **3** CONSOLE, **4** FLIGHT (the same four are buttons at the bottom). **Esc** steps back.
- **The console's six stages**, left to right: **EXPLORATION** (the region, the objective, the attempt's design), **SYSTEMS** (power, heat, the recorder), **PLAN** (a burn and its forecast), **FLIGHT**, **BLACK BOX** (predicted against flown, the debrief), **MODEL** (what the ship has learned, and the test of a new law).
- **The region picker** is at the top of EXPLORATION: Twin Deeps, the Well Garden and the Unseen Cathedral. Each starts with a fresh ship and keeps its own records. Or open one directly: `?encounter=gravity-range`, `?encounter=inverse-wells`, `?encounter=chain-link`.
- **Time.** Nothing is dangerous before you ENTER a region, and the clock waits. The ENTER button is beside the clock; once you're in, the warp steps (1× to 2000×) take its place. Inside there is no pause, and a new caution drops warp to 1×.

### Twin Deeps: the complete loop (about 10 minutes)

1. Press **3**. In EXPLORATION, choose **RECORD DESIGN AND SET UP**.
2. In PLAN: **+ BURN**, **RETROGRADE**, about **10 m/s**, then **COMMIT**. When the forecast arrives, choose **ENTER GRAVITY RANGE** beside the clock.
3. Set warp to **2000×** and coast for a few hours of ship time (about 8 is plenty). Watch the solid track leave the dotted forecast. If warp drops, read the reason and raise it again.
4. In BLACK BOX, choose **RECALL**. The ship restarts at arrival; the record stays.
5. Do it again with about **5 m/s**, and RECALL.
6. In MODEL, choose **TEST**. The distance law is fitted on one attempt and checked against the other. When it passes, choose **ADOPT**.
7. Plan another retrograde burn (try 16 m/s) and PREVIEW. The forecast now uses the law the ship earned, and holds much closer to the bodies.

Keep each dive to a few hours: a clean, short record makes the fairest test.

### The Well Garden: one steered burn

Coasting falls into a throat at about T+0:29, and the debrief says why. To cross: in PLAN choose **+ BURN**, then **STEER** (it points at CROSS-TRANSFER), **12.5 m/s** at **600 s**, **COMMIT**, **ENTER**, and warp, raising it again each time a caution drops it. The attempt completes after a few hours of ship time: about T+7:08 on a first attempt (about T+4:28 after a coasting loss).

### The Unseen Cathedral: see the lattice before it kills you

An invisible lattice destroys a coasting ship at about T+4:10 to T+4:30, and the loss review lists what failed first. To see it: **ENTER**, press **4** for FLIGHT, and set the Black Box channel to **Thread · 1,000 W**. Stay at 1×. Choosing Thread turns the camera to look ahead. After a minute or two (about T+1:45) the strands the model can support from the recorded data appear on FLIGHT.

## What we verified

- **Against NASA GMAT.** The game's own propagator matches seven reference trajectories from NASA GMAT R2026a (four planar, three inclined; orbits, flybys and two burns) within **2.2 cm** and **1.8×10⁻⁵ m/s** at every 10-second sample, and converges toward GMAT at second order. This checks the Newtonian gravity, units, thrust and mass handling the fictional world is built on. It does not validate the fictional law. [Method and results](docs/verification/gmat.md) · [The test](src/sim/gmat.test.ts)
- **The fictional law and the model** have their own tests: the simulator against independent reference vectors, and the ship's estimator, which never reads the simulator's truth, only what the instruments recorded.
- **The whole suite**: `npm run check` runs the type check, lint and about 1,550 tests.
- **Flashing and motion**: the loss sequence is authored to at most three flashes in any second, tested from 24 to 144 frames a second; with reduced motion set in the system, nothing shakes or flickers and the opening is a still sky.

## Honest limits

- **The three regions are previews chosen from a picker.** The route between them and the passage home are designed and not built.
- **Twin Deeps** is the complete loop (plan, fly, lose or recall, learn). Leaving the region was not reached in one blind try.
- **The Well Garden's coasting forecast is overconfident**: the model doesn't yet learn the wells' pull, so it states far less uncertainty there than it should.
- **The Cathedral** shows the lattice from recorded data; flying through it on that picture isn't demonstrated.
- **Speed on a modest laptop.** Our release check (a 4× slowed CPU) fails in the 3D views: 13 of 27 view-and-region cells pass. The game is built for a desktop or a recent laptop. `?perf` shows a frame-time readout; `?quality=full` holds full render resolution.
- **The demo video** is edited gameplay; some shots are staged for the camera and are labelled so.

## Credits and licence

The owner led the creative direction and made the decisions. **Claude** (Anthropic) and **OpenAI Codex** assisted with research, code, tests, procedural visuals and documentation. **NASA GMAT** supplied the verification data, generated by us from the official R2026a release. **ElevenLabs** generated all the audio (AI-generated sound effects). MidJourney was used for reference images only; none ships or is in this repository. NASA and JPL publications informed the engineering design. The in-game predictive model is a statistical estimator, not an AI tool. [NASA source register](docs/studies/s10/nasa-evidence.md)

Original project material is Apache-2.0. Third-party code, data and media retain their own terms. [Licence](LICENSE) · [Notice](NOTICE) · [Browser dependency credits and licences](public/THIRD-PARTY-NOTICES.txt)

## Run locally

With Node.js 22.12 or later, run `npm ci` and `npm run dev`. Run `npm run build` to produce `dist/`.
