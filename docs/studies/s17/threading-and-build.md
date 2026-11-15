# S17 — Threading, implementation and decisions

## Whole-ship clearance

[ESTABLISHED: `src/ship/README.md`, `data/ship-baseline.json`] The production hull
is a union of the 16 × 5 × 5 m pressure hull and four independently moving wing
prisms. Radiators reach y=±10 m, arrays y=±12 m. Radiator thickness is 0.2 m;
array thickness is 0.1 m. No averaged deployment or centre-only envelope is valid.

[ASSUMED] The current production envelope explicitly omits the antenna, camera,
engine bell beyond x=-8 and RCS nozzles. For this study's **whole-ship** certificate,
add conservative boxes, requested for baseline/geometry review:

| Guard | Body datum bounds, m |
|---|---|
| Camera | x 6.5..7.5, y -0.5..0.5, z -2.7..-1.7 |
| Antenna mast | x 5.75..6.25, y -0.25..0.25, z 2.5..4 |
| Engine bell | x -9.75..-7, y -0.75..0.75, z -0.75..0.75 |
| RCS bounding box | x -5.35..5.35, y -2.35..2.35, z -0.35..0.35 |

These are assumed protective dimensions, not CAD measurements. The RCS guard
includes some empty space but lies inside the pressure-hull transverse envelope.
The aggregate declared ship is 17.75 m long, 24 m wide with all wings out, and
6.7 m high including the camera and mast. Its projected width in a tilted sheet
depends on attitude and longitudinal extent, not just that 24 m scalar.

[DEMONSTRATED: reference geometry] For the untilted first sheet, the point-clear
gap is 80-2*4 = **72 m**. At its centre, the available lateral margin is:

| Configuration | Half-width | Lateral margin to influence |
|---|---:|---:|
| Stowed | 2.5 m | 33.5 m |
| Radiators | 10 m | 26 m |
| All deployed | 12 m | 24 m |

With the upper mast at +4 m, the tighter vertical centre margin is 32 m. These
numbers are for the entire declared extent, not a sphere centred on the datum.
The full path certificate below uses the separate boxes and sheet orientations.
Any later antenna or tether geometry must replace/extend these assumptions.

## Eight-layer informed passage

[ASSUMED] Use eight finite sheets, spaced 300 m along x. Their chosen reference
opening centres (y,z) are:

```text
(40,40), (68,22), (36,60), (68,40),
(40,12), (12,40), (44,68), (20,40) metres
```

Each sheet uses the same grid and profile. The JSON contains every finite segment
and its full basis matrix. Later sheets have normal rotations up to 8° and
in-plane rotations up to 12°; the entry sheet is untilted. This is a concrete
reference layout, **not** a procedural-generation implementation. Avoid the
old S5 example's almost-aligned central openings. The generated-content harness
still must check for cheap straight corridors and measure uninformed outcomes.

[DEMONSTRATED: generator] The reference authoring path holds attitude +x, roll
fixed, with constant axial speed. Between each pair of layer centres, y and z
follow `h(u)=10u^3-15u^4+6u^5`, u from 0 to 1. Each lateral leg starts and ends
with zero lateral velocity and acceleration. The datum starts 24 m before the
first sheet and ends 24 m beyond the last. The **tail** therefore clears too.
This prescribed path is a test input; the game must not give it to the player or
automatically derive it from truth.

The reference computes projected occupied intervals for each box in each sheet
frame. Their distance to an infinite grid is a conservative lower bound on
distance to the finite strands. It then subtracts a whole-material-speed bound
times half the time interval. This covers every time between samples, not merely
poses at the sheets. A positive lower bound proves zero exposure for this
declared path, even where another layer would contribute. It does not certify
nonzero-dose cases using a sum of separate component maxima.

| Reference result | Fast option | Recommended first tuning option |
|---|---:|---:|
| Axial speed | 2 m/s | 1.4 m/s |
| Duration, including end clearances | 1,074 s / 17.90 min | 1,534.286 s / 25.57 min |
| Maximum lateral acceleration, y | 0.008211 m/s² | 0.004023 m/s² |
| Maximum lateral acceleration, z | 0.009751 m/s² | 0.004778 m/s² |
| Whole-path clearance lower bound | 21.718 m | 22.027 m |
| Raw and weighted exposure, every component | 0 U s | 0 U s |
| Ideal total absolute translation Δv, y+z | 9.8 m/s | 6.86 m/s |
| Ideal translation propellant at full arrival mass | 137.970 kg | 96.579 kg |

The 2G full-tank torque-free authorities are about 0.01317 m/s² in y and
0.02469 m/s² in z. Even the faster path stays below 80% of each separate limit.
Simultaneous axis demand, pulse allocation, countertorque, pose errors, gravity
and wear still require the real ship allocator. The fuel calculation integrates
absolute axis Δv and uses the fixed 30,374 kg mass and 220 s Isp; decreasing mass
would lower that ideal figure, while countertorque, survey maneuvers and attitude
hold can raise actual consumption. It is not a complete thruster ledger.

[ASSUMED] Start tuning at 1.4 m/s with at least **125 kg available RCS for this
local passage**, plus the separately measured later-route reserve. That allows
about 29% over the ideal translation result; it is a test budget, not a proven
margin. Arriving below it is an engineering constraint, not an automatic locked
gate. Existing main-engine turns, alternative wider cells or an exterior route
may offer other valid solutions. Never refill at arrival. If the expert whole-run
harness cannot afford the route, reduce authored transverse reversals or increase
sheet spacing and remeasure before changing the single-load rule.

The path assumes geometry already acquired. The one-cell 32.4 s reconstruction
vector does not demonstrate all eight sheets acquired along this flight. 3C/2C
must show the rolling acquisition schedule, necessary lateral baseline, occlusion
handling, actual 1.4 m/s route and fresh estimates together; the 125 kg budget must
include any extra survey maneuvers. That integration is a release gate.

## Precision, uncertainty and failure margins

[ASSUMED] Use a provisional **6 m total geometric inflation** for the reference
path: relative navigation/patch uncertainty at a declared joint 3-sigma bound,
attitude/deployment error, finite detection resolution and latency together. The
single-cell fit's roughly 1.7 m largest 3-sigma marginal extent fits inside this
budget, but a 3D joint confidence set is not three independent marginal limits.
Correlated pose errors, additional layers and worn hardware can exceed it. The
real forecast must calculate the budget, never substitute a permanent 6 m badge.

With that assumed inflation the slow reference route retains **16.027 m** for
additional tracking error; a **10 m maximum Euclidean material-point departure**
leaves at least **6.027 m** to the influence. The faster route leaves 5.718 m under
the same allowances. Rotation and deployment error consume that displacement
budget as well as position error. At the fully deployed full-tank reach of about 13.6 m,
2° of attitude error can move a point about 0.5 m; use actual geometry/reach.

Operationally, aim within 10 m of the player's selected centreline while the
uncertainty budget is no more than 6 m. Zero additional exposure gives the full
remaining dose margin: 80 U s for fresh standard hardware, 160 for fresh hardened
hardware, 120 for power switches. A worn unit keeps only its actual remaining
margin, and a tube contact can still cause powered burnout before that margin is
used. Clearance is therefore more useful than “health remaining” alone.

Configuration transitions must sweep the union of intermediate prisms with their
actual actuator speed, not switch instantly between endpoints. The certified
route is already clear with all wings out; stowing is optional and trades thermal
rejection for clearance. A broken radiator or stalled array stays where it is.
Wider passages do not repair electronics or guarantee adequate thermal reserves.

The finite exterior remains a legitimate alternative. The point-intensity
reference checks zero outside the clipped field. No travel-time, propellant,
rock-clearance or entire-route certificate for a bypass is provided here. 3C/3E
must measure it; an unbounded easy bypass cannot be hidden behind an invisible
wall. Braided Crossing later combines evidence and capabilities rather than a
“visited Cathedral” flag.

## Work packages

[ASSUMED] These are incremental estimates including associated tests, not a
schedule or an addition to every overlapping S5 estimate. No files listed here
were edited by S17.

| Owner | Files / seams requested | Work and approximate changed/new code |
|---|---|---|
| Integrator | `src/contracts/measurements.ts`, `belief.ts`, `forecast.ts`, `view.ts`, `truth/ship.ts`; `data/ship-baseline.json` | Typed acquisition/coverage/lineage, correlated patch uncertainty, frozen field input, interval exposure and loss cause; console profile and external guards. 200–350 lines plus schema/data |
| 3C | `src/sim/fields/lattice.ts`, `src/content/chain-link/`, `src/ship/sensors/`, field/encounter subfolders released by 2D | Finite field, spatial/temporal exposure, subtick camera channel, measured detection bounds, seeded content, encounter tests. 650–1,100 lines |
| 2C | `src/model/` reconstruction/forecast support; `src/blackbox/` recorder/archive/store | Recorded angular features → association, triangulation and uncertainty; coverage states; packet/byte limits; immutable evidence and old-run isolation. 700–1,200 lines |
| 3A | `src/ship/` condition, power, thermal, configuration | Component dose/dwell/buckets, event ordering, real isolation/heat/dispatch, telemetry and nonterminal faults; use shared deployment geometry. 450–800 lines |
| 2F / 3D | `src/game/truth-step.ts`, session/expedition/save integration | Event/subtick coordination, propagate real loss, recorded-only reconstruction inputs, current-run frames and save version. 200–400 lines; coordinate release of speed-pass ownership |
| 2D, later 3F | FLIGHT, SHIP, Black Box and resource controls | Coverage/uncertainty and threatened part, actual processing cadence/capacity, first-failure review, stale display and six-second loss presentation. 350–650 lines |
| 3E | `tools/harness/` | Healthy/worn/low-reserve seeded runs, blind/informed/bypass/previous-map-only comparisons, whole-expedition reserves. 200–350 lines |

Total rough scope: **2,750–4,850 lines**, substantially overlapping S5's lattice
work. Existing field/exposure work in 3C can consume the numbers first; source
ownership stays with those threads. Shared interfaces go through the integrator.

## Acceptance required from builders

These are [ASSUMED] implementation gates, not tests S17 claims to have run.

1. **3C/3A numeric port.** Match all component raw/weighted entry doses, exact
   chronological failures, the baseline-console comparison, surviving wing hit,
   off-state dose and fast outside-to-outside exposure. Dose absolute error
   <=1e-5 U s on these fixtures; event time <=0.001 s. Preserve maximum-over-solid
   semantics and S5's general rotating/deploying/intersecting-sheet tests.
2. **3A coupled faults.** Feed the actual branch solver, accumulate fault heat
   until isolation and suppress post-trip powered effects. Repeated glances,
   powered/unpowered dwell, reset, damage/fuel-carry and saved event cursors must
   replay exactly. Test peak exactly at the threshold and just above it. Never
   treat a temporary bus trip as terminal dual-PDU destruction.
3. **2C/3C sensing.** Port the stored recording with the stated fit tolerance;
   test early/occluded/stationary cases, ambiguity, low power, bad attitude, cold
   camera and uncalibrated detection. Only the recorded footprint can become
   supported. Fit covariance must include correlated pose/calibration terms.
4. **P11/P8.** Holding retained records fixed while changing unseen truth leaves
   reconstruction, forecast and view unchanged. Deleting a recording changes
   live and replay fits identically. Archive/reload reproduces the same derived
   map, original forecasts stay frozen, and a new run cannot use old coordinates
   as live coverage. Preserve canonical `(attempt,index)` ordering.
5. **P12.** Couple actual delivered power, source acquisition, retained bytes,
   cadence, heat and validity. A 1 s tick cannot pretend to have 50 Hz frames.
   Check raw exhaustion at 32 MB, metadata reservation, a full recorder, camera
   failure and reconstruction processing of only what remains recorded.
6. **3E local content.** Fly the declared route with real 2G controls and all
   deployed parts, fresh scanning and held roll, then worn/hot/low-charge arrivals
   from N02 and P03. Sweep body orientation and intermediate deployment; include
   external guard geometry. The current reference is only a kinematic/control-
   authority bound. Demonstrate a cautious first-pass success and an abort.
7. **3E A9/A10 qualification.** Over seeds 0–999 (S4's gate), compare predetermined
   natural blind approaches with informed current-data flight, previous-map-only
   flight, procedure mismatch and an exterior route. Publish actual damage/loss
   counts and all failure reasons. First-time likelihood and “extraordinarily
   unlikely” whole-volume blind traversal remain unproven until this runs; a
   zero-contact geometric fraction is not a survival probability.
8. **2D/3F presentation.** A cold player can notice instrument loss before the
   display becomes stale/black, and locate the first useful clue afterwards.
   No pause, truth reveal, required death or automatic steering. Warn/drop warp
   only on sensed cautions/warnings under A12. Do not artificially delay physics
   to meet the presentation timing; tune authored approach and hardware instead.
9. **Full expedition.** Verify one-load propellant, battery/reactant budget and
   cooling through both branch orders and Braided Crossing. An informed player
   without fresh measurements should still lack supported clearance. Run the
   relevant production tests/build/lint after integration.

## Owner questions, one decision each

These are recommendations for the integrator's decision queue, not requests to
stop this study or amendments to `DECISIONS.md`. A16, A10, A12 and P8 are already
direction and do not need to be re-approved.

1. **Harden the console?** Recommend yes: change its existing profile to hardened.
   Preserve visible stale/recovery behavior on an upset. Unchanged hardware gives
   only 1.5 s of display after the first lost camera; the comparison is quantified.
2. **Treat irreversible loss of both PDUs as terminal loss?** Recommend yes.
   Keep ordinary trips, one-feed loss and survivable appendage damage nonterminal.
   This makes the fast loss arise from failed distribution, not a crew-dose timer.
3. **Record small uninterpreted channel tiles by default when existing sensing is
   active?** Recommend yes, at <=1 KiB within a 1 Hz diagnostic packet. This gives
   a structured clue before the player knows the function, while full geometry
   still requires powered recording and reconstruction. The existing 0.05 Hz
   setting alone cannot guarantee a useful first-contact record.
4. **Accept 1.4 m/s and a provisional 125 kg local RCS budget for the initial
   eight-layer layout?** Recommend this as a prototype starting point, contingent
   on whole-expedition reserves. The study shows ~97 kg ideal translation; if
   that is unaffordable, first relax transverse geometry/spacing and remeasure.
5. **Keep the 8 GB store and make raw recording optional?** Recommend yes.
   A short pass does not fill a fresh store; sustained raw diagnostics and an
   already-full store do. Keep power and fresh data as the immediate tradeoffs.

## Best version and smaller version

[ASSUMED] The best version includes fragment association across viewpoints,
joint pose/shape covariance, calibrated non-detection, measured rolling coverage,
actual component geometry, causal bus failures and coupled thermal/propellant
budgets. It supports a successful cautious first contact and continued damaged
flight as well as the intended sudden blind loss.

A smaller version keeps static separated sheets, the explicit baseline compact
mounts plus appendage solids, and a limited number of tracked angular features
per patch. It loses detailed vulnerability volumes and some association richness,
but can use the same recorded-data fit and conservative coverage. Fixed
configurations during crossing reduce integration scope; real deployment must
still be checked if the player can command it. Do not replace the mode with a
truth mesh toggle, turn unknown space into holes, require a death, or substitute
a universal hit counter. A stronger direct-noisy-patch sensing fiction would
be a separate owner choice, as S5 already notes.
