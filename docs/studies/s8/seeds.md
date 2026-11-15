# S8 — geometry admission and the low-orbit conflict

**Recommendation:** keep a measured, re-planned assist as the route, start with the finite candidate catalogue below, and do not ship a generator that claims to satisfy both the original low-orbit task and the committed 16 m/s departure gate. The reference demonstrates each component and a continuous low-orbit-then-assist flight, but that flight spends more than the gate permits. Nothing here proves that every conceivable multi-pass trajectory is impossible.

All numerical flight results below are [DEMONSTRATED: `tools/studies/s8/seeds.py`, `seeds.json`]. These are independent impulsive mechanics calculations, **not** a playtest or a demonstration of the game's estimator, attitude controller, resource scheduler, or collision code. Proposed acceptance thresholds are [ASSUMED]. The underlying law is [FICTIONAL: DECISIONS P4].

## Which “low-orbit band”?

The original requirement was **450–550 km from Alpha for a full turn**, with at least 5,600 kg main propellant remaining ([2F handoff](../../handoffs/2F.md)). The current 2G values instead define `depart`: 9,000 km barycentric distance, at least 50 m/s, cumulative expenditure at most 16 m/s. Do not quietly substitute a Beta ring encounter for Alpha low orbit.

A physically continuous example from the authored arrival demonstrates the conflict:

| Event | Time from arrival | Impulse / result |
|---|---:|---:|
| Retrograde dive | 600 s | 9.853770 m/s |
| Circularize near Alpha | 27,220 s | 12.347687 m/s |
| Complete one low-orbit turn | 45,550 s | Range 494.1946–494.9567 km |
| Main consumed by this point | — | 214.130 kg; 5,785.870 kg remain |
| Cumulative impulse already spent | — | 22.201457 m/s: **6.201457 over the departure cap** |
| Then prepare the assist | 50,590 s | 24.000 m/s prograde |
| Beta pass, with optional 1 m/s lift 8 h earlier | about 144,480 s | about 979.202 km |
| Exit, with that lift | about 271,330 s | 64.679 m/s |

The complete example spends 46.201457 m/s main plus 1 m/s RCS for the lift, leaving 5,556.091 kg main before any attitude or systems overhead. It physically reaches the low band and then the exit; **the committed departure rule rejects it**. A wider, cheaper pass uses 45.201457 m/s main total and leaves at 60.225 m/s; its 1,288.686 km Beta pass skirts most of the ring. These are witnesses, not fuel optima. The low-orbit completion itself satisfies the old 5,600 kg reserve; the subsequent exit does not retain that old reserve.

Merely visiting the band is different: the first 9.853770 m/s dive reaches 494.252 km without circularization. This study has not found or certified a same-run band visit plus assist under 16 m/s. Absence of a witness in this finite search is not an impossibility proof. The strict generator described below therefore has **zero certified combined-task seeds**, not a proof that there exist zero possible ones.

Do not fix this by simply raising 16 to 48: a larger budget also admits powered bypasses. The integrator should choose whether low orbit remains an optional investigation, then combine a suitable resource budget with a physical assist witness. Keep all investigation expenditure in the resource ledger.

## Geometry parameterization and tested range

Let `phi` be the binary phase, `theta` the ship's Alpha-centred arrival bearing, and `delta = wrap(theta - phi - 180 degrees)`. Rotate the arrival **position and velocity together**, retaining the 1,000 km circular Alpha-relative speed. The useful degree of freedom is `delta`; a common rotation of the whole gravity problem is a symmetry, not new difficulty.

The author-side search tested thirteen offsets from −30° to +30° in 5° steps. It varied burn time and magnitude near the first opportunity, then tested nine independently perturbed controls around each chosen route: burn time −120/0/+120 s and impulse −0.1/0/+0.1 m/s. Eleven of thirteen offsets had a qualifying robust body-only route. +25° and +30° had none in this declared first-window search, which never burns before 600 s. This is a rejection by that conservative search, **not** a finding that those geometries cannot be flown after waiting longer.

For the smaller recommended candidate catalogue:

| Relative arrival offset | Burn time (s) | Main impulse (m/s) | Beta closest (km) | Exit speed (m/s) |
|---:|---:|---:|---:|---:|
| −15° | 6,360 | 13.6 | 974.746 | 65.638 |
| −10° | 5,640 | 13.8 | 986.395 | 65.966 |
| −5° | 4,680 | 13.8 | 970.059 | 66.008 |
| 0° | 3,960 | 14.0 | 981.456 | 66.306 |
| +5° | 3,000 | 14.0 | 971.577 | 66.359 |
| +10° | 2,280 | 14.2 | 982.216 | 66.614 |
| +15° | 1,320 | 14.2 | 977.766 | 66.664 |

All 63 timing/magnitude variants reach the body-only departure gate. Across those variants the exit speed is 62.482–66.790 m/s and Beta closest distance 830.403–1,123.108 km. Thus the body flyby does not demand one exact control solution. Their asteroid clearance must still be tested; this is not a claim that every perturbed route clears the same ring.

An ideal 14.3 m/s main burn leaves 5,861.905 kg main. A subsequent 1 m/s RCS lift consumes 14.011 kg, leaving 285.989 kg RCS. This reserves 0.7 m/s against the objective cap and most of the propellant loads. [ASSUMED] Reserve a further 30 kg RCS for turns and holding: that gives a planning allowance of 255.989 kg after the lift. That allowance is not a measured controller cost; actual mass, calibration, bank condition, power, cooling and attitude histories must pass the session test.

Binary phase may span 0–360° **if** arrival and belt are rotated coherently and `delta` stays within the certified catalogue. Arbitrarily drawing binary phase independently from a narrow absolute arrival-bearing interval is a different experiment. For independent uniform phase, merely restricting `delta` to a continuous ±15° corridor rejects 330/360 = **91.667%** of proposals before any flight checks. That fraction is geometric, not a measured flight rejection rate. S4's independent ±5% radius offsets and arbitrary ±12° rock inclinations are not admitted by this study.

The mechanical symmetry also permits a coherent 3D rotation of the complete gravity scene. It does **not** certify optical tracking against a sun left fixed in the external frame, nor arbitrary C01 arrival velocities or damaged ships. For those, test the carried state instead of replacing it with the authored circular state.

## Ring phase and immediate safety

The separate [ring study](ring.md) evaluates a fixed layout under global ring phase, which changes rock geometry relative to the flyby while preserving masses, sizes and speed distributions. The evaluated boundary/centre cases are `delta = -15, 0, +15 degrees`, with 40 ring phases 0°, 9°, …, 351°. Do not infer that these samples prove every continuous ring phase safe. Use its measured clearance results and rejection counts for the chosen lift policy; individual rock phases, a whole-ring phase and a new random layout are different distributions.

At arrival the ship is 750 km above Alpha's collision envelope; Beta is at least 3,000 km from the ship for any arrival bearing. Initial Alpha rocks lie at radii no larger than 960 km and have radius at most 3.5 km, giving at least 36.48 km ship-envelope clearance before the authored 60 km filter. Beta rocks cannot reach the ship at arrival. Therefore the authored distributions are not lethal at the initial instant. **Reapply the 60 km-plus-rock-radius exclusion around the actual seeded arrival**, not the old nominal arrival. A safe first instant alone does not certify a safe observation interval. Propagate the full Alpha field as well as the ring during admission.

## Wrong-law run: enough warning to act

The reference's deliberately Newtonian dive asks for a 300 km periapsis and applies 32.063378 m/s retrograde at 600 s. This is an experiment, already over the 16 m/s departure allowance. Its trajectory reaches the conservative ship-envelope contact radius of 250.020 km at 14,967.085 s. A frozen Newtonian point forecast differs from truth by 10.010 km at 9,990 s, with the ship still 740.378 km from Alpha's centre: **4,977 seconds of lead** before contact. Both laws receive the same recorded inertial impulse; the final sample is refined to contact by bisection, with its last-safe/first-contact bracket preserved.

[ASSUMED] “Visible” here means position error larger than `max(10 km, 5 × 0.002 × Alpha range)`. The 0.002 is the committed range-per-fix setting, not a full navigation covariance. The seven arrival geometries all exceed this proxy 4,928–5,019 s before contact. This compares the wrong and correct ship laws against the same tracked circular body ephemeris, deliberately isolating ship-law error. It does not pretend a Newtonian binary would remain circular with the true initial velocities.

A 40 m/s prograde abort at the nominal warning point keeps the ship outside roughly 386 km through 45,000 s in the mechanics reference. The saved uncorrected vector still ends at contact. This shows an opportunity to react; it does not guarantee a novice notices the residual or operates the systems in time.

The actual model may widen and terminate its forecast before this epoch under P10. Its fitted masses and covariance are not this reference's exact initial values. 2C/2D/2F must test the emitted forecast, acquired tracking, immutable overlay and warning presentation through the real session. Do not call the position-error proxy a passed A9/P6 playtest.

## Generator rejection rules and denominators

Implement these as truth-side authoring/admission checks, never as a player-side automatic planner:

1. Reject changed law, masses, body sizes, separation, unsupported incoming radius/velocity/configuration, or an unrecorded seed/briefing. Preserve the actual carried ship state.
2. Reject any initial full-envelope contact or failure of the 60 km arrival exclusion. For the intended observation interval, sweep every body and rock against the deployed hull and a stated navigation margin; an endpoint-only check is insufficient.
3. Require a witness for **every required task**, including cumulative propellant and impulse. If low orbit and `depart` are both mandatory with the current cap, none of this study's candidates has such a witness: the conservative release filter rejects **13/13 tested relative geometries (100%)**. This describes missing certificates, not an impossibility theorem.
4. For the direct-assist-only prototype, require multiple passing controls around the selected route, a speed reserve, enough resource reserve for lift/trim/abort, and full-field clearance. The body-only search rejects **2/13 (15.385%)**; restricting to the seven recommended geometry samples yields **0/7** body-only rejections. These counts exclude the ring, Alpha-field, resource and UI checks.
5. Apply the independently measured ring phase screen. Fixed +z lift and choosing either observed-safe lift direction have different rejection fractions. See `ring.md`; do not multiply unrelated counts as though they came from one common distribution.
6. Require a wrong-law mismatch before the first hazardous commitment, with a recoverable interval. The seven geometry samples pass the declared kinematic warning proxy (**0/7 rejected**), but sensor acquisition and real forecast visibility remain additional checks.

No script here claims a globally uniform percentage of “fair seeds.” The raw proposal distribution, discrete grid, control search, ship state and each filter must be versioned in the generator manifest. Failure of a finite search should mean reject/retry conservatively, not tell the player that a physically valid route does not exist.

## Build and review

[ASSUMED] The generator belongs in content/game truth code, with a versioned seed/arrival certificate (roughly 150–300 lines plus an offline catalogue). The objective needs a physical assist witness if science burns remain allowed (roughly 80–150 lines and explicit boundary tests). The model needs no secret route search: retain P6; consume the real tracked state and actual player commands. The screens need a readable residual/forecast comparison, clearance uncertainty and current resource reserve, using sensed events only.

Port the initial states, commands, samples, wrong-law warning/contact pair, +25° rejected first-window case, and low-orbit gate-rejection example from `seeds.json`. Test whole-hull swept clearance, two burn offsets and magnitudes on each accepted layout, fixed-sun visibility, arrival continuity, damaged-but-controllable states, retained forecasts and deterministic replay in the actual session. These checks close the explicit gaps above.

Owner decision, via integrator: **is low orbit still required before the assist, or an optional investigation?** Recommend optional investigation without making the 16 m/s cumulative cap punish evidence gathering; enforce the physical assist separately. The smaller direct-assist-only catalogue is ready for session testing sooner, but loses a certified continuous low-orbit-learning route under the current objective.
