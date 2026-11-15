# Belt reproduction and crossing vectors

[DEMONSTRATED: `python tools/studies/s8/ring.py --all`] The independently generated belt supports the central claim: lifting before the encounter substantially reduces risk. It does **not** support a universal “one metre per second clears the belt” rule. The 715 km pass loses 11 of 40 lifted ships in this experiment. Use a tracked clearance forecast, choose the lift sign and epoch, and retain correction authority.

## What was reproduced

[ASSUMED] This is a fresh statistical reproduction, not replay of 2G's unavailable scratch experiment. Its seed list, exact initial states, burn values for the three rows and threading controller were not committed. S8 uses NumPy PCG64 seeds 8008–8047, explicitly different from the uninspected game RNG. It reads only the committed physical values and distributions; it imports no game code. Independent statistical draws may change rock sizes; the **separate A10 phase experiment keeps every rock's size and all relative orbital elements fixed**.

[ASSUMED] Each realization has 320 massless rocks. Squared orbital radius is uniform between 700 and 860 km, azimuth uniform, radius log-uniform between 3 and 12 km, independent tangential/radial speed fractions have Gaussian sigma 0.015, and vertical position/speed fractions have Gaussian sigma 0.006. Both massive bodies move analytically under the stated inverse-2.5 law. Rocks and ships use independently written RK4. A rock is absorbed at a massive body's collision envelope; propagating it through the point-source singularity would produce spurious outbound debris. This absorption convention is explicit, not a claim about uninspected game collision code.

[ASSUMED] Ship clearance is swept relative chord distance minus rock radius minus a conservative 20 m enclosing sphere. Every informed certificate requires an additional **1 km** geometric margin. This covers the full reference hull rather than just its centre; it does not represent navigation covariance or damaged appendages. The statistical table covers the 0–42 h belt-crossing window, not later survival or power/thermal operation. The complete witness below carries all rocks through the exit.

[DEMONSTRATED: `ring.json`] Across the 12,800 rocks, **25 (0.1953125%)** contact a massive body by 42 h; **two surviving rocks (0.015625%)** are outside a 2000 km Beta-centred diagnostic sphere then. The time-sampled 5th–95th percentile radial band is **652.225–993.730 km**, consistent with a roughly 600–1000 km main belt, but the 99th percentile reaches **1169.679 km**, 69.679 km beyond the stated 1100 km thin-tail description. The surviving extrema are 177.093–3750.102 km, so that description is not an absolute containment bound. The largest sampled ensemble vertical RMS is **5.129 km**, +0.129 km from the approximate 5 km thickness. The first-arrival minimum ship-to-belt surface gap is **4133.843 km**. These are diagnostics of the committed 700–860 km distribution over 42 h; the handoff's 700–900/980 km, 80/110 h stability experiments and inclination sweeps have different inputs and are not reproduced by this run.

[DEMONSTRATED: `ring.json`] A main impulse at 3960 s is targeted independently to each periapsis. The three impulses are 13.647323985, 13.797104407 and 13.997999970 m/s. Their unlifted speeds at the first outbound 9000 km gate are 54.41495, 63.77161 and 66.31340 m/s: differences **+0.41495, −0.22839, +0.31340 m/s** from 2G's rounded 54, 64 and 66. Periapses are 715000, 830000 and 980000 m to much better than the published kilometre precision.

## Ring-pass table

[DEMONSTRATED: `ring.json`] Parentheses are S8 minus 2G's scratch count; percentages use denominator 40.

| Nominal periapsis | Blind planar losses | Lift +1 m/s, eight hours before periapsis | Difference in blind / lift loss rate |
|---|---:|---:|---:|
| 715 km | 29/40 vs 31/40 (−2) | 11/40 vs 10/40 (+1) | −5 / +2.5 percentage points |
| 830 km | 22/40 vs 23/40 (−1) | 0/40 vs 1/40 (−1) | −2.5 / −2.5 points |
| 980 km | 5/40 vs 8/40 (−3) | 2/40 vs 1/40 (+1) | −7.5 / +2.5 points |

[ASSUMED] These counts are compatible with ordinary finite-sample variation; they cannot establish that the two propagators produce identical populations. Wilson 95% intervals for the S8 blind/lift probabilities are respectively 57.2–83.9% / 16.1–42.8%, 39.8–69.3% / 0–8.8%, and 5.5–26.1% / 1.4–16.5%. Zero losses in forty trials is not zero risk.

[DEMONSTRATED: `ring.json`; 2G handoff] Against 2G's separate 24-run game sample, the 830 km blind result is 55% versus 50%, **+5 points**, and its lift result is 0% versus 8.33%, **−8.33 points**. The 980 km results are 12.5% versus 0%, **+12.5 points**, and 5% versus 4.17%, **+0.83 points**. These compare different seeds and implementations, not numerical integration errors.

## Threading: a disclosed controller matters

[ASSUMED] S8 tests an offline, finite menu: no trim, or one trim eight hours before periapsis, of 0.4, 0.8 or 1.6 m/s along either sign of the instantaneous Beta-relative radial or in-plane transverse direction. Select the least-cost candidate with at least 1 km clearance **and** a qualifying exit within 16 m/s. This is a reproducible authoring feasibility search. It must not be placed in the player's model as an automatic planner (P6), and it is not 2G's undocumented possibly repeated-trim controller.

[DEMONSTRATED: `ring.json`] Some cases have no certificate in that finite menu; they are not proven impossible. Means below are over certified cases only, so the differences from 2G's all-40 means describe different conditional samples.

| Pass | Certified / 40 | Mean trims | Mean trim Δv | Maximum trim Δv | Differences from 2G's means / maximum |
|---|---:|---:|---:|---:|---|
| 715 km | 30 | 0.7667 | 0.5333 m/s | 1.6 m/s | −0.1333 trims; −0.2467 m/s; 0 m/s |
| 830 km | 36 | 0.5833 | 0.3222 m/s | 1.6 m/s | −0.2167 trims; −0.0378 m/s; 0 m/s |
| 980 km | 38 | 0.1053 | 0.0526 m/s | 0.8 m/s | −0.1947 trims; −0.0474 m/s; 0 m/s |

[DEMONSTRATED: `ring.json`] Ignoring the speed gate and 1 km buffer, the menu still has unavoidable collisions in 3, 0 and 2 cases, respectively. Thus S8 **does not reproduce the reported 0/40 threading losses** with its disclosed controller. A better menu or repeated local corrections may resolve them. The 715 km report of three trimmed runs under 50 m/s cannot be tested as an exact count without the original controller and seeds; S8 explicitly checks the speed of every proposed trim rather than assuming all collision-free passes depart.

[DEMONSTRATED: `ring.json`, ideal rocket equation in `core.fuel`] The certified-case mean RCS translation costs are **7.4743, 4.5158 and 0.7376 kg** for the three rows; maxima **22.4197, 22.4186 and 11.2107 kg**. The largest cost differs from the reported rounded 23 kg by **−0.5803 kg**. The blanket “1–5 kg average” does not describe the deep 715 km row, either here or when converting 2G's own 0.78 m/s mean at roughly 14 kg per m/s. These costs exclude attitude holds and turns.

[DEMONSTRATED: `ring.json`] Relative speeds at the closest point of colliding blind trajectories span 14.58–46.82 m/s, rather than the reported impact range 14–36 m/s. The endpoint differences are +0.58 and +10.82 m/s, **but these are closest-point speeds, not first-contact speeds**, and should not be treated as an exact impact-speed disagreement. They fit the broader committed 14–45 m/s encounter description only approximately. An exact first-contact-speed comparison needs the original encounter states and a shared definition of impact epoch.

## A10: fixed layout, varied ring phase

[DEMONSTRATED: `ring-phase.json`] The phase experiment rotates the same seed-8008 layout by 0°, 9°, …, 351° around Beta, coherently rotating position and velocity. It checks three body-only adapted routes at relative arrival offsets −15°, 0°, +15°. Each uses its own burn and periapsis time from `seeds.json`. All massive-body masses, sizes and gravity parameters, and all 320 rock radii, are identical across these 120 cases.

| Relative arrival offset | Blind losses / 40 | +z lift rejected at 1 km margin | Either measured-safe ±z lift rejected |
|---|---:|---:|---:|
| −15° | 3 | 0 | 0 |
| 0° | 5 | 0 | 0 |
| +15° | 5 | 1 | 0 |

[DEMONSTRATED: `ring-phase.json`] The one rejected fixed-sign case is +15° arrival and 243° ring phase. Choosing a sign from a correct tracked forecast changes the candidate rejection fraction from **1/120 = 0.8333%** to **0/120**. These are exact fractions of this finite candidate grid, not population probabilities or a proof for intermediate angles. Phase-only trials are correlated and must not be assigned independent-binomial confidence intervals.

[ASSUMED] This is a belt-only certificate for the direct-assist family. It does not certify a preceding low-orbit visit, continuous arrival-angle ranges, damaged ship authority, all Alpha-field geometries or arbitrary inherited C01 arrival velocities. See [the seed study](seeds.md) for the decisive conflict between low-orbit flight and the present 16 m/s objective budget. Global rotation of the entire gravitational scene preserves these geometrical results, but not sun-relative power or optical visibility.

## Complete crossing witness

[DEMONSTRATED: `ring-witness.json`] The file contains initial Cartesian positions, velocities and radii of **all 336 rocks**, the ship commands, hourly ship states, gate state and closest-approach records. Sixteen Alpha rocks use the committed distributions, with the committed 60 km arrival-exclusion filter. It is directly portable without reproducing NumPy's RNG.

- Main impulse: **13.797104407 m/s at 3960 s**, Alpha-relative prograde.
- Lift: **+1 m/s in z at 80040 s**; measured total Δv **14.797104407 m/s**, leaving **1.202895593 m/s** under the current gate.
- Beta periapsis: **830.440 km at 108840 s**; exit **63.798587 m/s at 242760 s** (gate time sampled to 60 s).
- Closest rock: index 140 in the combined array (Beta rock 124, zero based), **6384.714 m surface clearance**, at **88214.472 s**; centre separation **11179.316 m**, relative speed **31.76004 m/s**. The next closest surface clearance is **21667.550 m**. Full closest-approach positions and velocities are in JSON.
- Ideal main propellant **133.2493 kg**; ideal translational lift propellant **14.0136 kg**. The latter differs from the rounded 14 kg claim by **+0.0136 kg**. Attitude and systems consumption are excluded, explicitly; these are not whole-game fuel measurements.

[ASSUMED] Port tests should compare identical timestamps and use the tolerances in the study runner. `ring-convergence.json` records the same full-field crossing at 120, 60 and 30 s, separating swept-chord and integration sensitivity from the gate's sample-time quantization. Do not expect an arbitrary game seed string to create this ring; port the provided initial states.

[DEMONSTRATED: `ring-convergence.json`] Closest clearance is **6384.714431, 6384.714469, 6384.716063 m** at those three steps: the 120-to-30 s difference is **0.001632 m**. The first sampled gate epoch changes from 242760 to 242730 s, changing the reported speed by 0.001581 m/s; this is an event-sampling difference, not a same-epoch velocity convergence error. No rock is absorbed on this chosen full-field witness.

[DEMONSTRATED: `ring-neighborhood.json`] The same 336-rock layout is also flown with every combination of main-burn timing **3900, 3960, 4020 s** and magnitude **13.747104407, 13.797104407, 13.847104407 m/s**, retaining the identical 80040 s lift. **All nine avoid collision and depart at 59.6794–65.7154 m/s; eight retain the 1 km clearance certificate.** The ninth, 4020 s / 13.847104407 m/s, clears by 965.848 m, missing the study's additional buffer by 34.152 m. The least clearance among the eight certified cases is 1650.516 m. This is evidence for multiple successful controls, not a claim that every point between grid samples is safe. Every case's closest rock and gate state is stored. None requires an exact replay of the nominal burn.

## Recommendation and implementation request

[ASSUMED] Keep the belt, prefer a pass with speed margin such as the 830 km witness, and show tracked three-dimensional clearance through **both** crossings. Do not describe a fixed 20 km altitude or fixed-sign impulse as universally safe. Require the seed generator to retain a family of feasible measured-safe trims, not one exact prerecorded trajectory. Preserve full starting rock states and accepted command neighborhoods in authoring test fixtures.

[ASSUMED] This needs approximately 150–300 lines of content-side seed rejection and fixture plumbing, plus game tests for the full-field vector and the rejected fixed-sign phase. The model needs measured rock trajectories and uncertainty through the pass; it should continue to forecast the player's proposed lift without selecting it. The flight display should distinguish uncertainty from hard full-hull clearance, retain the frozen forecast, and display impending intersections early enough to turn and burn. Exact implementation belongs to 2G/2F and 2D, outside S8 ownership.
