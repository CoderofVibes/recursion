# Independent reproduction

[DEMONSTRATED: `python tools/studies/s8/generate.py --check`] This is a numerical reference, not a playtest or a verification of the current browser build. Its only production inputs are the committed values listed in `tools/studies/s8/inputs.json`. The pinned 2G source is `2986c3551a6a5bf1fd79262e48e39024ad937769`. Neither 2G's simulation implementation nor its unavailable scratch propagator was used.

## Rebuilt world and method

[FICTIONAL: P4; `docs/physics/derivation.md`] Every particle feels both moving sources:

`a(x,t) = -sum_i GM_i * sqrt(1,000,000) * (x-b_i(t)) / |x-b_i(t)|^3.5`.

[ASSUMED: P16 and committed content values] Alpha/Beta GM are `1e10/2.5e9 m³/s²`, collision radii `250/160 km`, separation `4,000 km`, and mass ratio `0.2`. Their circular mutual orbit is evaluated analytically, with angular frequency `sqrt((GM_A+GM_B)*sqrt(r0)/D^3.5)`. At zero phase Alpha is at `(-800000,0,0)` m and Beta at `(3200000,0,0)` m. The ship arrives at `(-1800000,0,0)` m, velocity `(0,-107.905694150421,0)` m/s, circular at 1,000 km relative to Alpha. Asteroids are massless test particles; they never pull on one another. Sun direction has no gravitational effect.

[ASSUMED: reference method] Classical RK4 integrates test particles. The representative route uses 30 s steps with exact impulse epochs, refined extrema and an outward 9,000 km event. The circular pair is an exact solution of the stated force law, not a frozen-body approximation. The reference uses delivered impulses; main-engine finite thrust is checked separately. No propulsion, attitude, sensor, electrical or thermal implementation is copied or imported. The nominal baseline is 30,374 kg, with 6,000 kg main and 300 kg RCS, Isp 320/220 s, and main thrust 24,000 N times its committed 0.975 calibration. Existing owner-approved crew changes are not silently applied to the pinned mass.

[DEMONSTRATED: `verification.py`, `routes.py`] Independent scalar velocity Verlet versus RK4 at 72 h differs by 31.5254 m at 5 s and 7.8818 m at 2.5 s: a fourfold reduction. RK4 60→30 s changes the representative periapsis by 0.00058 m and exit speed by `2.9e-9 m/s`; the periapsis timestamp interpolation changes by 0.0062 s. The coast Jacobi integral varies by `2.14e-9 m²/s²`. Analytic binary acceleration residual is below `2e-19 m/s²`; a coherently rotated trajectory agrees to `3e-9 m`. These checks support the quoted precision without claiming the real game has that precision.

## Representative route

[DEMONSTRATED: `routes.json`] Apply a 14.0 m/s Alpha-relative prograde impulse at exactly 3,960 s (1.1 h). Positive differences below mean S8 minus 2G; speeds at Beta are relative to Beta, exit speeds are barycentric.

| Quantity | 2G | S8 | Difference |
|---|---:|---:|---:|
| Delivered main impulse | 14.0 m/s | 14.0 m/s | 0 |
| Burn epoch | 1.1 h | 1.1 h | 0 |
| Beta centre distance | 980 km | 981.455587 km | +1.455587 km (+0.149%) |
| Beta periapsis epoch | 30.1 h | 30.064989 h | −126.041 s |
| Beta-relative periapsis speed | 65 m/s | 65.120521 m/s | +0.120521 m/s |
| Speed at 9,000 km | 66 m/s | 66.309197 m/s | +0.309197 m/s |
| Exit epoch | 64 h | 63.913540 h | −311.257 s |
| Claimed game envelope | 940–1,020 km, >62 m/s, <68 h | inside all three | 41.456/38.544 km to distance bounds; +4.309 m/s; 4.086 h earlier |

The distance-envelope margins are 41.456 km above its lower bound and 38.544 km below its upper bound; the asymmetric rounded route is intentional.

[DEMONSTRATED: `routes.json.finite_main`] An 18.1320 s constant-direction finite burn, centered at 3,960 s, delivers the same 14 m/s and consumes 135.20445 kg. Pointing is fixed at the start-of-burn prograde direction. It passes at 983.977592 km and exits at 66.294411 m/s: +2.522005 km and −0.014786 m/s relative to the impulse route. This is a finite-force translation check, not a claim that the ship's gimbal, turns and systems reproduce the maneuver. Its 5,864.796 kg main reserve and a separate 1 m/s lift costing 14.0127 kg RCS leave substantial physical propellant; the objective's 16 m/s allowance is the tighter restriction.

## Route population and pass-distance table

[ASSUMED: reconstructed experiment] The handoff gives 689 trials but omits the exact horizon and grid endpoints. S8 uses 13 impulses `10,10.5,…,16 m/s` and 53 epochs `0,1200,…,62400 s`. At **90 h**, this reconstructs all reported outcome counts exactly. The 90 h cutoff is inferred from this match, not a recovered scratch setting.

| Outcome at 90 h | 2G | S8 | Difference |
|---|---:|---:|---:|
| Reached 9,000 km | 120 | 120 | 0 |
| Hit Beta | 154 | 154 | 0 |
| Hit Alpha | 26 | 26 | 0 |
| Not exited or hit by cutoff | 389 | 389 | 0 |
| Departed at ≥50 m/s | 14 | 14 | 0 |
| Qualifying fraction | about 2% | 2.03193% | +0.03193 percentage points |
| Qualifying closest-distance extrema | 680–1,650 km | 782.133–1,659.388 km | lower +102.133 km; upper +9.388 km |

[DEMONSTRATED: `routes.json.route_grid`] By 160 h the same grid has 260 exits, 188 Beta impacts, 72 Alpha impacts and 19 qualifying exits. Three later successful trajectories have closer passages below 680 km. “The rest stay bound” must mean **not departed by the stated cutoff**, not a proof of permanent binding. The sampled extrema are not the continuous feasible envelope. The targeted 680 km row below exits below the threshold, as 2G itself reports.

[DEMONSTRATED: `pass-table.json`] These rows solve for the impulse needed to reach each closest distance while retaining the **same 3,960 s burn epoch**. Targeting residuals are at most 4.2 m. Each listed speed is interpolated at the first outward 9,000 km crossing.

| Beta closest distance | Delivered impulse | 2G exit speed | S8 exit speed | S8 − 2G |
|---|---:|---:|---:|---:|
| 680 km | 13.601848 m/s | 49 | 49.047508 | +0.047508 m/s |
| 830 km | 13.797104 m/s | 64 | 63.775263 | −0.224737 m/s |
| 980 km | 13.998000 m/s | 66 | 66.314095 | +0.314095 m/s |
| 1,120 km | 14.196504 m/s | 64 | 64.390347 | +0.390347 m/s |
| 1,250 km | 14.394668 m/s | 61 | 61.016621 | +0.016621 m/s |
| 1,400 km | 14.645045 m/s | 57–60 | 56.370198 | 0.629802 below lower bound; 3.629802 below upper |
| 1,570 km | 14.964455 m/s | 53 | 50.897705 | −2.102295 m/s |
| 1,660 km | 15.151967 m/s | 51 | 48.081405 | −2.918595 m/s; fails gate |

[DEMONSTRATED: `pass-table.json`] Local pass sensitivity at 14 m/s is 727.571 km per m/s, +27.571 km per m/s above “about 700,” and within the 550–900 game range. The 1,120 and 1,250 km examples confirm that successful wide assists can avoid the dense belt. The 1,660 km failure is specifically for the published 1.1 h family; a different burn epoch can produce a qualifying wider pass, as the population demonstrates. Do not turn a single timing family's bound into a universal encounter limit.

[DEMONSTRATED: `routes.json.same_burn_newton`] A frozen Newtonian ship propagation with the same initial state and identical inertial impulse is 2,787.305 km from truth at the true pass epoch, exceeding the reported “more than 300 km” lower bound by 2,487.305 km. Its closest Beta distance before then is 1,791.095 km, 809.639 km above the actual minimum. **Both calculations are supplied the true binary ephemeris** to isolate the ship's force-law mismatch. This is a deliberately simplified frozen forecast, not the fitted and horizon-limited game model; it does not reproduce the game's specific 300 km measurement.

## Vertical impulse

[FICTIONAL: linearization of P4] Near the binary plane,
`z'' = -[sum_i K_i / rho_i(t)^3.5] z`.
The coefficient is positive and time dependent. A kick therefore excites vertical oscillation; `z = dv_z * elapsed_time` is not a valid long-coast extrapolation. It is not a constant-frequency oscillator for the entire assist.

[DEMONSTRATED: `routes.json.vertical`] Each row retains the 14 m/s main impulse and measures height at that perturbed run's own Beta closest approach.

| Vertical kick | Time | Height at closest | Comparison |
|---|---|---:|---|
| +0.3 m/s | departure burn | −2.406193 km | inside quoted absolute 2–4 km |
| +0.6 m/s | departure burn | −4.813413 km | 0.813413 km above quoted 4 km upper bound |
| +1.0 m/s | 8 h before nominal closest | +22.339261 km | useful ring clearance scale |
| +1.0 m/s | 4 h before nominal closest | +13.255808 km | lower clearance; “a few hours” is insufficient as a universal rule |

The two early kicks first recross the plane near 21.84 h after arrival; their pre-pass maximum heights are 3.832107 and 7.664448 km. They do not keep climbing. Even 20 km height is not a clearance guarantee: the rocks have nonzero radii and the Gaussian vertical distribution has no finite support. Use the actual swept rock/ship clearance in [ring.md](ring.md).

## Limits of reproduction

[ASSUMED] Rounded turn-table rows are independently checked in [turns-objective.md](turns-objective.md), including every signed difference. The 40 original scratch ring seeds, draw order and trimming controller are absent, so [ring.md](ring.md) compares a new deterministic ensemble, with population/count differences and method differences stated. This is not a byte-for-byte reconstruction of `createGravityRange('gravity-range-1')`; production RNG code was deliberately not read. The exported explicit rock states make the reference portable without guessing RNG equivalence.

The reported 1,500-probe stability experiments, 16-probe-per-radius inclination tests, tilted-ring 6,000 trials, exact model horizons, “three to five runs,” and human difficulty are **not independently reproduced here**. Their initial conditions, success definitions or controllers are missing; no substitute precision is invented. S8's ring survival/extent checks concern its explicitly recorded ensemble and time window. Camera acquisition, uncertainty growth, automatic mass fitting, power, thermal endurance, damage and actual hands-on control remain game integration tests.
