# src/content/gravity-range — the Gravity range (C02)

Owner: 2F; 2G for the 3D conversion. Truth side. `createGravityRange()` returns the `EncounterSetup` the game loop runs.

| File | Holds |
|---|---|
| `world.ts` | The true world at arrival: law, binary, Alpha's asteroid field, Beta's ring, sun, hidden calibration, the 1C ship's arrival state |
| `briefing.ts` | What the ship is told, in the believed frame (Alpha at the origin, at rest at t = 0): arrival estimate, priors, known bodies and asteroids, the objective |
| `index.ts` | Seed, `dt`, arrival procedure, objective rule, `createGravityRange()` |
| `gravity-range.test.ts` | The claims below |

## The world, in three dimensions (A11)

- [FICTIONAL] Inverse-2.5 law, shared r₀ = 1,000 km (P4).
- [ASSUMED: P16] Alpha GM 1×10¹⁰ m³/s², radius 250 km; Beta GM 2.5×10⁹, radius 160 km; circular mutual orbit, 4,000 km apart (`circularBinary`). Their orbit is the inertial x–y plane.
- The real 1C ship (`loadShipDefinition()`), full tanks (P14 item 2), circular about Alpha at r₀ on the side away from Beta, **in the binary's plane**, nose along its path. `dt` = 1 s. Arriving in the plane keeps the slingshot's numbers; the ship leaves the plane when the player flies it out.
- [ASSUMED] Alpha's field (`a-01`…`a-16`): 14 asteroids in a disc 580–960 km from Alpha and 2 that dip to about 500 km, radii 0.4–3.5 km, orbits tilted up to 6° out of the plane. Where a careful player probes the law.
- [ASSUMED] **Beta's ring** (`b-001`…`b-320`), the belt of A6. See below.
- [ASSUMED] One sun (A3): azimuth 200°, 12° above the plane, 600 W/m². Brightness is an owner content value (P14 item 3).
- [ASSUMED] Hidden: main engine at 97.5% of rated thrust with a 3 mrad mount error; IMU biases within 1C's 5×10⁻⁵ m/s².
- [ASSUMED] One sensor value retuned (`rangeShip()`): camera range noise per fix 0.2% of range (1G spec §2.1) in place of the baseline's 5% (2F handoff, request 1).
- `SAVE_FORMAT` names the save slot; bump it when a change here would make earlier Black Box records describe a different world or ship. It is 4 since the ring, the 3D simulation and the 3D ship (3 was the lift to 3D types).

## Objective (owner, A6): leave on a slingshot past Beta

`depart`: once the ship is 9,000 km from the pair's centre of mass, in any direction, it must be moving at **50 m/s or more** relative to it, having spent **no more than 16 m/s** of Δv (main engine and RCS translation together). Judged on truth (`ObjectiveRule` `depart`); the ship learns the result as an `objective` event.

Why it takes Beta [DEMONSTRATED: `gravity-range.test.ts`; 2G handoff, slingshot study]: 16 m/s alone leaves the binary at under 40 m/s (13–39 m/s over the burn times tried). A pass 680–1,650 km from Beta's centre, behind it as it moves, leaves at 50–66 m/s. The burn that does it is about 14 m/s along the orbit, an hour after arrival; the pass comes 30 h later; the ship is 9,000 km out about 64 h after arrival. The pass distance moves about 700 km for every 1 m/s of burn, so it cannot be aimed by a model that has the law wrong: under Newton the same burn is forecast to go somewhere else entirely.

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
