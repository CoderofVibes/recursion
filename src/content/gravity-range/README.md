# src/content/gravity-range — the Gravity range (C02)

Owner: 2F. Truth side. `createGravityRange()` returns the `EncounterSetup` the game loop runs.

| File | Holds |
|---|---|
| `world.ts` | The true world at arrival: law, binary, asteroid field, sun, hidden calibration, the 1C ship's arrival state |
| `briefing.ts` | What the ship is told, in the believed frame (Alpha at the origin, at rest at t = 0): arrival estimate, priors, known bodies and asteroids, objectives |
| `index.ts` | Seed, `dt`, arrival procedure, objective rules, `createGravityRange()` |
| `gravity-range.test.ts` | The claims below |

## The world

- [FICTIONAL] Inverse-2.5 law, shared r₀ = 1,000 km (P4).
- [ASSUMED: P16] Alpha GM 1×10¹⁰ m³/s², radius 250 km; Beta GM 2.5×10⁹, radius 160 km; circular mutual orbit, 4,000 km apart (`circularBinary`).
- [ASSUMED] 20 asteroids, radii 0.4–3.5 km, test particles under the same law: 14 in a disc 580–960 km from Alpha, 2 that dip through the low-orbit band, 4 about Beta. Seeded.
- [ASSUMED] One sun (A3): direction 200°, 600 W/m². Brightness is an owner content value (P14 item 3).
- [ASSUMED] Hidden: main engine at 97.5% of rated thrust with a 3 mrad mount error; IMU biases within 1C's 5×10⁻⁵ m/s².
- The real 1C ship (`loadShipDefinition()`), full tanks (P14 item 2), circular about Alpha at r₀ on the side away from Beta, nose along its path. `dt` = 1 s.

## Objective [ASSUMED; the owner decides]

Low orbit: stay between 450 and 550 km from Alpha's centre for one full turn (`orbit-band` rule), with at least 5,600 kg of main propellant left (`reserve`). Proposed to the owner with a moving gap and a rendezvous as alternatives; both of those need the model to track and forecast asteroids.

## What the tests show [DEMONSTRATED: `gravity-range.test.ts`]

| Claim | Result |
|---|---|
| Coasting at r₀ for two revolutions (35 h) | No impact, no asteroid lost to a body, orbit stays within 950–1,060 km, nearest asteroid pass over 5 km |
| 9.85 m/s retrograde at arrival | Low point 485–505 km; a Newtonian world gives 665–690 km and reaches it over 1,500 s earlier |
| The burn a Newtonian plan asks for to reach 500 km (18.35 m/s) | Low point 260–310 km: under the band, within 60 km of Alpha's surface |
| A Newtonian plan for a 300 km low point (32.1 m/s) | Hits Alpha |
| Scout, Recall, fly again through the game loop (stand-in model) | Objective and reserve reached in under 12 h of ship time: about 212 kg main propellant (22 m/s), 21 kg RCS, 1.8 kg hydrogen, under 50,000 recorded measurements |
| The forecast against the navigation solution in that scouting dive | Within 6 km after 1 h, over 10 km after 4 h, and it ends at its horizon more than an hour before the low point |
