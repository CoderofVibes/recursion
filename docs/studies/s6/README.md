# S6 — Paired openings (system X)

[ASSUMED] Recommendation for the owner through the integrator. This study makes **no decisions** and changes no game code. Worktree `.worktrees/s6`, branch `st/s6-paired-openings`; input snapshot `baf65e0`. A9–A13 and the current 3D contracts override the older planar expedition vocabulary. Scope is the shared system behind Petal Gallery, Turning Rim and the Passage, with the surviving ship continuing into Familiar Sky.

## Recommendation

[FICTIONAL] Build one pair of finite disks as an explicit Newtonian seam: a proper rigid map transfers position, mouth-relative velocity, attitude and spin. Preserve one ship while its occupied volume spans two places. Forces act locally on the material present on each side, with transport terms and an explicit fictional momentum/energy reservoir at the moving seam. Light passes through; no additional far-body gravity is transmitted through the empty opening.

[ASSUMED] Make the openings physically persistent and give them repeatable geometric alignment windows. Start with observation-only **for the ship** petals of radius 0.75 m and a ship-sized Passage tuning radius of 6 m. A 240 s motion cycle and an approximately 1 m/s relative approach are starting values. Retain a spacious 12 m radius mechanics fixture for implementation tests. These choices need owner approval and a full ship/route harness; they are not demonstrated game balance.

[ASSUMED] The ambitious version lets the nose see home while the aft radiator remains exposed to the old sky. Fresh rim tracking, deployment, hands-on attitude/translation and exit reserves still matter. A smaller translating-only passage loses the turning geometry; a CoM teleport removes the principal engineering problem and is not a completion of this study's requirements.

## Deliverable map

| Required question | Where it is answered |
| --- | --- |
| Finite moving boundaries; position, velocity, attitude, spin; stationary and rotating pairs | [Mechanics §§1–2](mechanics.md) |
| Partial whole-ship crossing, thrust/local forces and rim collision | [Mechanics §§3–4](mechanics.md) |
| Gravity, sunlight, visible light and sensors | [Mechanics §5](mechanics.md); [measurable evidence and P11](play-and-build.md) |
| Forecasts, rim-point measurement, rules versus fitted numbers | [Mechanics §6](mechanics.md); [model and record lifecycle](play-and-build.md) |
| Tiny petals, repeated opportunities, Recall/loss and familiar-run pressure | [Play progression](play-and-build.md) |
| Clean crossing, partial rim clip, moving sightline, forecast across boundary | [Reference script](../../../tools/studies/s6/reference.py), [vectors](../../../tools/studies/s6/vectors.json), [vector guide](../../../tools/studies/s6/README.md) |
| Implementation paths, contract/data needs, LOC estimate, acceptance tests, owner questions | [Build scope and decisions](play-and-build.md); [handoff](../../handoffs/s6.md) |

## What the numbers establish

[DEMONSTRATED: `python tools/studies/s6/reference.py --check`] The deterministic reference runs **63 assertions** and reproduces its committed JSON bytes. It covers full prism/slab contact geometry, 3D mapped-state derivatives, stationary/moving maps, all-far force/torque rebasing, a far-side off-center nozzle during partial crossing, moving geometric sightlines, metric rim-feature fitting and an axial finite-mass forecast.

| Reference result | Value and meaning |
| --- | --- |
| Spacious clean crossing | 16×5×5 m box, 12 m radius: 8.464466 m minimum radial margin |
| First/last material entry | 4 s / 20 s at constant 1 m/s; trailing rim slab clears at 20.5 s |
| Partial trailing-radiator clip | First contact at 13.5 s; nose entered at 4 s, CoM at 12 s, tail would exit at 20 s |
| Moving map energy exchange | +5,020.536915 J translational kinetic change for the declared 30,400 kg point/CoM fixture; not a whole-ship energy ledger |
| Finite-mass forecast | Continuous local gravity split, first entry 3.923048 s, last material exit 19.336974 s |
| Independent integration comparison | At 1/64 s RK4, endpoint position/velocity max numeric error 2.0644×10⁻⁷ against a piecewise analytic solution; SI components are checked individually by the vector consumer |
| Local forecast uncertainty example | At 30 s, nominal linearized 3σ axial position width 0.866736 m, from the declared four input uncertainties; not a guaranteed safety bound |
| Passage tuning comparison | 6 m radius leaves 2.464466 m straight margin; fixed yaw during normal translation through a static disk reaches its full swept footprint limit at 23.244843° |
| Why not 12 m for alignment tension | Box circumradius 8.746428 m: every centered fixed attitude fits the spacious fixture |

[ASSUMED] The 6 m comparison gives a useful starting scale: the example 1 m phase-related lateral displacement and 0.8 m accumulated drift consume appreciable margin. It does **not** prove that a 40 s optical face-on interval is a flight window. Actual mouth/ship motion, control limits, deployments, uncertainty and both local scenes must determine the usable interval over the entire passage.

## Reproduce and independently implement

```powershell
python tools/studies/s6/reference.py --check
python tools/studies/s6/reference.py --report
```

[ASSUMED] No packages beyond the installed Python/numpy are needed. Regenerate with `python tools/studies/s6/reference.py`; the JSON is written beside the script. The reference guide describes units, field semantics and same-runtime reproducibility limits. A TypeScript implementation should compare kinematic states at 1e-9 m / 1e-10 m/s, rotation matrices/body rates at 1e-11, analytic geometry event times at 1e-8 s, and the refined axial trajectory at 2e-6 m / 2e-6 m/s. Numerical derivative checks have looser documented tolerances in the script. These are fixture tolerances, not universal game accuracy requirements.

[ASSUMED] Not demonstrated: an integrated moving-pair, six-DOF production ship; arbitrary rotating/deploying-hull CCD; realistic clipped mass distribution and stress; damaged contact survival; noisy monocular rim reconstruction; live optical occlusion/photometry; moving-event uncertainty coverage; P11 implementation; partial save/replay; or any playable expedition route. The script's swept-contact case is relative translation with an analytically isolated event bracket. Its general six-DOF checks are instantaneous force identities. Its integrated forecast is a stationary-pair uniform bar. The handoff lists these honestly as implementation gates.

## Consequential choices for the integrator

[ASSUMED] Present owner decisions individually in [play-and-build.md](play-and-build.md): shared X, persistent versus literally closing mouths, no shortcut gravity, separate optical/material validation, Earth payoff, far-side gravity law, and conservative versus recoverable rim impacts. Do not infer approval from this study. The build estimate is 3,150–5,700 production lines plus 1,200–2,000 test/harness lines and assets; that is scope, not a deadline.

[ASSUMED] Two interface issues deserve early resolution: P11 needs a game-produced **optical image** channel that cannot leak the far scene into belief, and A4 needs genuinely independent completed observation attempts for zero-loss rule validation. Neither can be solved by silently passing truth transforms to the model or splitting one attempt into two supposedly independent tests.
