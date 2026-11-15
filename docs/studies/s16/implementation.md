# S16 — work for 3B and integration

## Scope and estimated work

[ASSUMED] Estimates are approximate new/changed production lines, excluding tests,
using S5's existing specification and 2G's 3D types. They are not delivery promises.

| Owner / paths | Requested implementation | Approximate lines |
| --- | --- | ---: |
| 3B: `src/sim/fields/` | One isolated smooth radial-thrust transform, validation, core/boundary event plumbing. Apply after delivered forces are summed; add no torque. No overlap composition in this content. | 120–220 |
| 3B: `src/content/inverse-wells/` | Three centres/profile, finite catalogue, truth-side arrival certificate, physical outgoing disc, immutable seed manifest. No automatic pilot. | 200–350 |
| Integrator/game: `src/contracts/`, `src/game/`, expedition transitions | Carried-state arrival mapping and admission, whole-hull sweeps, preservation of original forecasts, source/seed versioning. Every effect stays in the correct frame. | 120–240 |
| 2C: `src/model/{dynamics,extensions,forecast}.ts`, Black Box | Implement S5's response family using fitted belief centres/radii; powered accel and track predictions; training/held-out separation; unknown boundary covariance and model horizons. | 250–500 |
| 2D/3F with 3B's encounter subfolders: `src/console/encounters/`, `src/view3d/fields/` | Measured trail against frozen forecast; residual and acquisition gaps; uncertain inferred funnels/shells; force direction versus velocity; propellant/clearance margin. Use theme primitives. | 160–300 |
| 3A/3E: ship integration and `tools/harness/` | Full attitude/gimbal/power/thermal scenarios, finite seeded inherited states, cold-player and learned-player tests. | 250–500 test/harness lines |

[ASSUMED] Expected content data are static well IDs, centres, fixed radii and
profile version; a garden-to-encounter rotation and origin; seed/version; actual
arrival state; certificate inputs; outgoing transit geometry. Reference JSON uses
arrays in SI; map to `Vec3` objects and scalar-first body-to-inertial quaternions
at the production seam. Rotate force, velocity and centres together. Evaluate the
exit in garden coordinates using the inverse rigid transform. Do not treat garden
z as “up” for physics or require free roll.

[ASSUMED] Request field-scoped belief support and observed-geometry uncertainty
from the integrator, following S5's `model-and-interface.md`. A body gravity
`ValidatedSpan` alone cannot represent local response support. Fields and measured
signals need stable run associations, observation intervals and fit provenance.
The attempt records the seed/briefing, but player-side model code never receives
the truth catalogue, certificate, selected flight controls or exact new centres.

[ASSUMED] P6 remains intact: saved maneuvers are examples to adapt manually.
The model predicts player commands, never picks +z versus −z from the offline
catalogue. A learned response family can transfer across wells; new centres and
boundary support still require fresh observations. Keep a coast control, a radial
powered comparison and both tangent components distinguishable from a global
engine-scale change. Use separate completed experiments for held-out testing
under A15 Q03; no mandatory death or artificial well-visited flag.

## Port acceptance

[ASSUMED] Import only the expected vectors into truth-side tests; keep this Python
reference independent of the TypeScript implementation. Required assertions:

1. `vectors.json.projection`: mixed 3D force has reversed radial component,
   unchanged full tangent plane and zero added torque. Outside is identity; at
   45 km radial authority vanishes without fuel refund. Nominal opposed jets still
   burn their individual flows and can produce torque despite zero net force.
2. `edge_band`: independent variable-mass 24 kN outward burn from
   `(-39000,0,0) m`, velocity `(-150,0,0) m/s`, mass 30,374 kg, for 100 s. This is
   deliberately **source-free**, unlike S5's gravity-coupled fixture. Outbound
   inner/zero/outer events occur at about 6.788099/44.695708/82.585089 s. Compare
   samples at 0.01 m, 1e-5 m/s, 1e-6 kg, 0.001 s tolerances with an appropriately
   small substep. Explicit midpoint at 1/16 s meets position and velocity bounds;
   do not demand those tolerances of an unverified 1 s production step.
3. Both `informed_crossings`: run exact finite forces and cutoffs. Verify outbound
   exit, fuel flow, influence list and whole-ship clearance; an endpoint-only core
   test does not suffice. Use route comparisons of 0.1 m, 0.001 m/s and 1e-6 kg.
   The reference independently checks RK4 at 1 and 1/8 s for these burns.
4. `unavoidability`: reproduce the bound numerically and assert its preconditions:
   fixed non-overlap spheres, no unbounded gravity/other acceleration, baseline
   mass floor and total-force upper bound. The 128 proposal cases and catalogue
   counts must reproduce. A few simulated evasive commands are not a replacement
   for the all-control inequality.
5. `rejected_seed`: seed 16000 fails its reachable-ball certificate. It must not
   become accepted just because two convenient routes survive. Reject the explicit
   initial whole-ship-contact fixture before evaluating a core-centre radial vector.
6. `old_belief`: preserve the ordinary-response forecast as originally issued and
   record the actual command stream. At equal epochs test the divergence, first
   contact and recovery. Do not compare different times, replace a forecast after
   fitting, or compare against a truth-fed “measured” track.
7. Through the actual sensor/model/screens, demonstrate the 1 km/5-sigma warning
   proxy (or explicitly revise it to the measured covariance), with enough time
   and control authority to recover. Test both sensor gaps and field-rule omission.
   A sign reversal in the accelerometer is evidence, not a free centre/radius fit.
8. Through real ship systems, test the 25 seeded candidates, both route families,
   finite turns, gimbal offsets, warmup, fuel exhaustion, loaded solar/radiator
   configurations, inherited damage and actual delivered thrust. Count all main
   and RCS costs including preparation, diagnosis and holding. No resets on transfer.
9. Reorder wells, vary display rate/warp, save and reload inside the band, and replay
   commands/noise streams. Same seed and commands produce the same result. Rotate
   the full mechanics problem and recover the rotated result; separately test
   fixed-sun optical visibility.
10. Keep the **finite exterior bypass** as a regression counterexample. Do not
    quietly “fix” it by deleting exterior motion, adding a deadline or changing
    forces. If a future physical boundary makes it invalid, document and test the
    new boundary rather than claiming the present sphere layout achieved it.

## Reference limits

[DEMONSTRATED: generator] Powered integration uses independent RK4, checked by
halving and against explicit midpoint for the boundary fixture. Engine-off motion
and its sphere sweeps are exact in this source-free problem. Powered clearance
uses a straight chord with `a_max*h²/8` subtracted, a conservative deviation bound;
the tested burns stay far outside cores. The old-belief contact occurs during an
exact coast and is localized by the earliest segment/sphere root. The shell event
times on powered segments are chord approximations verified at the small reference
step, **not** a general production collision/event solver. Tangencies, powered
core contact, moving objects and arbitrary turning hulls need the production tests.

[ASSUMED] The 20 m enclosing sphere is conservative for 2G's baseline configurations;
it does not integrate appendage motion or prove clearance for future hardware.
No electrical/thermal/attitude state, camera images, noisy fit, renderer or human
response is simulated. The catalogue's source-free geometry alone cannot justify
a release claim of fairness. This boundary is intentional: S16 owns studies and
reference tools, while 3B and the other production lanes build and independently
verify the encounter.

## Questions for the owner, through the integrator

1. **May “unavoidable” mean from a physically committed arrival, while an upstream
   exterior detour remains possible?** Recommend yes for the first prototype.
   It preserves open-space flight and has an all-control proof. If the requirement
   is specifically a fuel wall from any earlier preparation point, this layout
   fails it; request a separately authored physical containment/transfer study
   before release. Do not silently approve this interpretation in DECISIONS.
2. **Use the 25-entry catalogue for initial seeded content?** Recommend yes, then
   broaden only after full-session admission. This gives measurable variation and
   exact replay; it gives less variety than arbitrary independently drawn wells.
3. **Use 1,000 kg main / 30 kg RCS as the preliminary Garden arrival reserve?**
   Recommend these as harness targets, pending the whole-expedition ledger. They
   cover the demonstrated correction and recovery with room left, but may need
   tuning for the real attitude/sensor/thermal cost and previously accumulated wear.

No change to `docs/DECISIONS.md`, the creative brief, design region pages, `data/`
or any `src/` file is part of this study.
