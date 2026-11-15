# src/content/gravity-range — the Gravity range (C02)

Owner: 2F; 2G for the 3D conversion. Truth side. `createGravityRange(seed?, { run?, geometry? })` returns the `EncounterSetup` the game loop runs: the reference geometry by default, or run `run` of a save with its own arrival geometry and sensor noise (A10, A18 (4)).

| File | Holds |
|---|---|
| `world.ts` | The true world at arrival: law, binary, Alpha's asteroid field, Beta's ring, sun, hidden calibration, the 1C ship's arrival state |
| `briefing.ts` | What the ship is told, in the believed frame (Alpha at the origin, at rest at t = 0): arrival estimate, priors, known bodies and asteroids, the objective |
| `geometry.ts` | The catalogue of validated arrival geometries (below) |
| `index.ts` | Seed, `dt`, arrival procedure, objective rule, `createGravityRange()` |
| `gravity-range.test.ts`, `slingshot.test.ts` | The claims below; the slingshot flown by hand through the game loop |
| `geometry.test.ts`, `s8-vectors.test.ts` | The catalogue against S8's rejection rules; S8's reference vectors in this game's simulation |

## The world, in three dimensions (A11)

- [FICTIONAL] Inverse-2.5 law, shared r₀ = 1,000 km (P4).
- [ASSUMED: P16] Alpha GM 1×10¹⁰ m³/s², radius 250 km; Beta GM 2.5×10⁹, radius 160 km; circular mutual orbit, 4,000 km apart (`circularBinary`). Their orbit is the inertial x–y plane.
- The real 1C ship (`loadShipDefinition()`), full tanks (P14 item 2), circular about Alpha at r₀ on the side away from Beta, **in the binary's plane**, nose along its path. `dt` = 1 s. Arriving in the plane keeps the slingshot's numbers; the ship leaves the plane when the player flies it out.
- [ASSUMED] Alpha's field (`a-01`…`a-16`): 14 asteroids in a disc 580–960 km from Alpha and 2 that dip to about 500 km, radii 0.4–3.5 km, orbits tilted up to 6° out of the plane. Where a careful player probes the law.
- [ASSUMED] **Beta's ring** (`b-001`…`b-320`), the belt of A6. See below.
- [ASSUMED] One sun (A3): azimuth 200°, 12° above the plane, 600 W/m². Brightness is an owner content value (P14 item 3).
- [ASSUMED] Hidden: main engine at 97.5% of rated thrust with mount errors of 3 mrad to the side and 2 mrad downward; IMU accelerometer biases on all three axes within 1C's 5×10⁻⁵ m/s². The briefing's prior on the downward angle is 0 ± 0.02 rad, wide enough for the gimbal's 16 mrad trim through the low centre of mass, which the model's nominal thrust line does not include.
- [ASSUMED] One sensor value retuned (`rangeShip()`): camera range noise per fix 0.2% of range (1G spec §2.1) in place of the baseline's 5% (2F handoff, request 1).
- `SAVE_FORMAT` names the save slot; bump it when a change here would make earlier Black Box records describe a different world or ship. It is 5 since the 3D ship's hidden calibration (4: the ring, the 3D simulation and ship; 3: the lift to 3D types).

## Arrival geometries (A10, A18 (4))

Each run of a save arrives at one of S8's seven admitted geometries, flown on S21's adapted routes (S8's burn epoch, 0.2 m/s less, past Beta at about 830 km, then +1 m/s along inertial +z over the ring; S8's 980 km certificates are kept as `s8` for S8's vectors): the same circular 1,000 km orbit about Alpha, at bearing 180° + δ from the line to Beta, δ = −15° to +15° in 5° steps (S8, `docs/studies/s8/seeds.md`; +25° and +30° had no robust route in its search). The first run of a save meets δ = 0, the reference every study used; later runs draw from the catalogue by a hash of the seed and the run. Each run has its own sensor-noise seed and survey error, and its briefing is recorded with the attempt. Not varied yet: the binary's phase (the sun stays put relative to the bodies), the ring's layout and phase (S21 resizes the belt), Alpha's field (its seeded layout, with the 60 km arrival exclusion applied round each geometry's own arrival point).

[DEMONSTRATED: `geometry.test.ts`, S8's rules 1–3: only the arrival changes; nothing within 60 km of any arrival, and two hours' coast from each clears every rock and body by over 10 km; every arrival's Jacobi constant is above 5,769, against 5,468 at the neck, so none can drift out of Alpha's lobe. Rule 4, `s8-vectors.test.ts`: every geometry's S8 route and its nine perturbed controls (70 flights) pass Beta within 200 m of S8's distance and leave at S8's speed to 0.002 m/s, all over 50 m/s. Rule 5 (the ring's phase) waits for S21; rule 6 (a wrong-law warning before contact) is S8's wrong-law vector, for the reference geometry.]

## Objective (owner, A6, A18 (3)): leave on a slingshot past Beta

`depart`: when the ship crosses outward past 9,000 km from the pair's centre of mass, in any direction, it must be moving away at **50 m/s or more**, having spent **no more than 16 m/s** of Δv since it could first leave Alpha's lobe, and having **swung round Beta** on the way: a visit inside 2,000 km of Beta's centre that gave it at least 1,000 m²/s² of energy from Beta's motion. Burns at Alpha while the ship cannot leave its lobe (dives, a low orbit, the first 2 m/s or so of the departure burn) are free, so the player can explore. Judged on truth (`ObjectiveRule` `depart`, `learningFree`, `assist`); the ship learns the result as an `objective` event. [DEMONSTRATED: `src/game/depart.test.ts`: S8's representative pass gains 2,400–2,800 m²/s²; S8's counterexample (already 9,000 km out at 51 m/s, nothing spent) is missed for want of an assist. `s8-vectors.test.ts`: S8's low orbit then slingshot spends 45.2 m/s, counts 3–8 m/s of it and is reached.] The 1,000 m²/s² threshold leaves room for wider passes and is a play value for S21 to confirm.

Why it takes Beta [DEMONSTRATED: `gravity-range.test.ts`; 2G handoff, slingshot study]: 16 m/s alone leaves the binary at under 40 m/s (13–39 m/s over the burn times tried). A pass 680–1,650 km from Beta's centre, behind it as it moves, leaves at 50–66 m/s. The burn that does it is about 14 m/s along the orbit, an hour after arrival; the pass comes 30 h later; the ship is 9,000 km out about 64 h after arrival. The pass distance moves about 700 km for every 1 m/s of burn, so it cannot be aimed by a model that has the law wrong: under Newton the same burn is forecast to go somewhere else entirely.

## The radiation crescent (A18 (2) after S21, R14)

[FICTIONAL] A crescent of radiation clouds banks the belt's outer edge, so a pass wide of the rocks is no safe way round them (`clouds.ts`, S21 `belt.md` as it is). It is attached to Beta and turns with the binary: in the binary's frame (+x from Alpha to Beta, +z the orbit normal) it spans 1,000 to 2,600 km from Beta (full from 1,050 to 2,400), azimuth -90 to -30 degrees (trailing Beta), every elevation, with two polar caps; peak 0.05 lattice units, below every burnout threshold, so its harm is cumulative. The game samples it at every equipment item each tick (`EncounterSetup.environment`), and 3A's condition model applies the damage through the conditioned ship step: upsets, latch trips, failures. The route the content is built round passes Beta at about 830 km, inside it.

[DEMONSTRATED: `s21-vectors.test.ts`: S21's pass table meets the clouds as S21 found (680 and 830 km: none; 980 km: 178 U s raw, the caution at 100,169 s; wider passes 1,210 to 2,384 U s), within 1% and 120 s; `clouds.test.ts`: S21's shape, the frame turning with the binary, and at the peak the radiation caution at 20 s, a latch tripping both cooling pumps at 400 s, the ship lost 120 s later.] The clouds are not yet drawn: `WindowView` has no slot for them (2F handoff, update 3).

## Beta's ring

| | Value | Why |
|---|---|---|
| Rocks | 320, radii 3–12 km | Density is a play value: see the two rows at the bottom |
| Where | Seeded 700–860 km from Beta's centre; Alpha's pull makes every orbit breathe, so the ring fills about 600–1,000 km | Deep passes cross it twice. It cannot be wider: beyond about 900 km a prograde orbit about Beta does not last a run |
| Which way | Prograde: round Beta the way Beta goes round Alpha | The pass that gains speed goes the same way, so rocks close at 14–45 m/s: lethal (the loss speed is 3 m/s), but slow enough to see coming and to dodge by hand. The other way round they would close at over 100 m/s |
| Thickness | In the binary's plane, σ ≈ 5 km | About the size of the rocks. In the plane the ship is in the stream; 20 km above or below it is clear. This is what the third dimension is for here |
| Stays bound | At least 97% of the rocks are still 300–1,500 km from Beta after 80 h; a few fall onto Beta or drift off from the outer edge | [DEMONSTRATED: `gravity-range.test.ts`] |
| A pass in the plane, flown without looking | Lost 5 to 6 times in 10 at 830 km (12 of 24 seeded rings in the real simulation, 23 of 40 in the study), 8 in 10 at 715 km, at most 2 in 10 skirting the ring at 980 km | [DEMONSTRATED: 2G handoff; `gravity-range.test.ts` on 6 seeds] |
| The same pass with a trim | Lifted over the ring by 1 m/s eight hours before the pass (14 kg of the 300 kg RCS load): lost 2 of 24 in the real simulation, 1 of 40 in the study. Threaded in the plane with trims chosen from a correct forecast of the rocks: none lost in 40, 0.1 to 0.8 m/s on average | [DEMONSTRATED: as above] |

The rocks move under the same law as everything else, so a model that has not learned the law mispredicts them as well as the ship (A6). Every ring rock is large enough to be on the arrival survey, 5 km and 0.5 m/s out (1σ); tracking the ones near the crossing is how the player finds out where they will be.

**For the owner to decide.** A wide pass, 1,100–1,650 km from Beta, goes round the outside of the ring and still leaves at 50–64 m/s. It needs the same aim as a deep pass. If every departure should go through the ring, the ring cannot be widened (see "Where"); the way to close the outside route is to ask for more speed than a wide pass gives, at the cost of a narrower target.

## What the tests show [DEMONSTRATED: `gravity-range.test.ts`; `src/game/model-loop.test.ts`, real model]

| Claim | Result |
|---|---|
| Coasting at r₀ for two revolutions (35 h) | No impact, none of Alpha's field lost to a body, orbit stays within 950–1,060 km, nearest asteroid pass over 5 km |
| 9.85 m/s retrograde at arrival | Low point 485–505 km; a Newtonian world gives 665–690 km and reaches it over 1,500 s earlier |
| The burn a Newtonian plan asks for to reach 500 km (18.35 m/s) | Low point 260–310 km: within 60 km of Alpha's surface |
| A Newtonian plan for a 300 km low point (32.1 m/s) | Hits Alpha |
| 14 m/s along the orbit, 1.1 h after arrival (no rocks) | Passes Beta at 940–1,020 km, 30 h after arrival, the way the ring turns; 9,000 km out at over 62 m/s before 68 h |
| The same burn half a turn later, with no Beta to swing past | Never within 2,000 km of Beta; leaves at 20–40 m/s (28.5 m/s, 91 h after arrival) |
| 13.8 against 14.2 m/s | The pass moves 550–900 km per m/s |
| The same burn in a Newtonian world | The pass is more than 300 km away from where it really goes |
| Six seeded rings, pass at 830 km in the plane | At least 3 lost to a rock, at 5–60 m/s |
| The same six, lifted by 1 m/s eight hours out | At most 1 lost; the rest pass over 15 km above the plane and leave at over 50 m/s |
| A scouting dive through the game loop (stand-in model) | The forecast against the navigation solution is within 6 km after 1 h and drifts after; it ends at its horizon more than an hour before the low point |
| Real model, attempt 1 (Newtonian, nothing flown): dive of 9.85 m/s | The forecast leaves the distances it knows, is flagged extrapolating for over 80% of its length and ends more than an hour before the 503 km low point |
| Real model, attempt 2: a shallower dive inside distances already flown | Nothing extrapolated; the ship is within 30 km and 2σ of the forecast 15,000 s in, and within 2σ where the forecast ends (the calibration table, A4). Forecast and truth are compared at the same moment |
| Measured strength of Alpha's pull after two dives | 1.36–1.47 times stronger at 500 km than at 1,000 km against the model's law: a mass-only fix cannot hold at both |
| The player tests the distance law (fitted on the shallow dive, held out on the deep one) and adopts it | Passes; exponent 2.5 to two decimals |
| Attempt 3: a dive deeper than anything flown (to 391 km) | Table only: the forecast ends above 490 km. With the rule: it reaches more than 80 km deeper |
| The slingshot flown by hand (`slingshot.test.ts`) | Turn, burn on the throttle, deploy the arrays facing the sun (the fuel cells alone last about 40 h of the 64 h flight, and running out of power is a loss), level the ship, lift over the ring, leave at over 55 m/s |
