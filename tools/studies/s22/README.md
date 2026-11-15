# S22 independent reference

Run from the repository/worktree root, using installed Python 3.14 and NumPy
(NumPy is imported by the reused S16 module; no installation is needed):

```powershell
python -B tools/studies/s22/generate.py
python -B tools/studies/s22/generate.py --check
```

The first command runs every assertion and writes `field.json`, `seeds.json` and
`vectors.json` beside the scripts, plus the study's native `funnel.svg` plot.
The second recomputes and compares their
contents without writing. It takes a few minutes on a busy machine; progress
is printed every eight catalogue proposals. `-O` is explicitly rejected because
it disables assertions. No timestamps, account names or absolute paths enter
the outputs. Same-runtime byte determinism is tested; cross-platform last-bit
variation is not a change to the physical tolerance.

For a separate measured JS kernel comparison with installed Node:

```powershell
node tools/studies/s22/benchmark.mjs
```

This checks Python/JS and indexed/full-scan agreement and writes a new
`performance.json`. Timings are inherently variable, excluded from `--check`,
and are **not** a browser/modest-laptop/frame certificate. No packages are
downloaded or imported from production code.

## Files and vector map

| File/key | What it supplies |
| --- | --- |
| `reference.py` | S16 RNG import; tapered support, pull/reflection, indexed lookup, independent variable-mass RK4/midpoint, conservative sweeps, birth guard, seed layout and placement |
| `generate.py` | Reproducible experiments, negative controls, catalogue, finite exterior flights, convergence and JSON serialization |
| `field.json` | All 2,601 nominal reserved sites in local metres; unit axes; nominal on-times; whole-scene placement matrix |
| `seeds.json` | All 32 proposed arrivals, first failures, 40 field controls, warning/recovery evidence and seven admitted IDs |
| `coast_pulled_to_crush` | Engine-off ship pulled to throat; compare `no_funnel_coast` |
| `instinctive_burn` | Outward burn, frozen pull-only/ordinary-thrust forecast, warning and successful delayed recovery |
| `sideways_escapes` | Both signs of the 16 s lateral burn |
| `escape_depth_sweep` | Late-escape successes/failures and sufficient analytical crush-avoidance certificate |
| `popup` | Precursor/force gain samples, safe birth, occupancy/speed veto and saved cancellation record |
| `many_funnel_crossings` | Both complete field routes and birth event tapes; one crosses a newly activated site |
| `bypasses` | Finite slow and faster exterior flights, including an over-budget hypothetical plan |
| `rejected_seed`, `overlap_rejection`, `initial_crush_rejected` | Rejected arrival, invalid support separation, and initial terminal contact |
| `projection`, `edge_convergence`, `kernel_queries` | Sensor force semantics, full 3D rotation, midpoint order and JS port inputs |

All dynamics quantities are SI. `center` is the bounding-ball anchor, **not the
mouth**: `mouth=center-62500*axis`, `throat=mouth+120000*axis`. The length of
nonzero support extends to 125,000 m; a bounds routine using only 120,000 m
can miss the rear cap. The formulas in [physics.md](../../../docs/studies/s22/physics.md)
govern, not an old spherical field's names.

The JSON control force is already the **actual delivered inertial force**.
Production throttle/attitude commands must obtain it through the real actuator
and power/condition limits. This is an author-side feasibility reference, never
a player-facing planner or a source of acquired coordinates.

## Numerical interpretation and limits

- Full routes use RK4 at 2 s; catalogue controls use 4 s. The nominal negative
  route is recomputed at 1 s. Boundary convergence separately compares midpoint
  at 4/2/1/0.5 s against RK4 at 1/16 s. These reference step sizes are not a
  request to change P2's production fixed outer tick.
- Contact margins subtract the global acceleration bound times `h²/8` from
  the endpoint chord's distance to the inflated throat. Positive margin is a
  sufficient swept-clearance certificate for these trajectories. A negative
  coarse bound is **not a measured penetration**.
- Near a possible crush, the reference refines the short interval to 1 ms and
  reports the first inside endpoint. Fixture speeds and a 2 km diameter make
  tunnelling impossible over that small bracket here. This is not a general
  moving-hull event solver or proof for arbitrary faster states; production
  must localize all swept contacts independently.
- Trial RK stages may evaluate a bounded continuation inside the excluded
  throat while bracketing contact; no resulting trajectory beyond first contact
  is accepted. Production collision chronology must terminate at the surface,
  not expose that mathematical continuation as playable interior physics.
- Event times labelled `influence-sampled` are sampled entry indications, with
  up to one reference step of delay. They are not exact contour crossings.
  Birth times are fixed cuts; the guard is evaluated once before integrating
  the post-birth interval. Dormant sites exert no stage-end force before that.
- `endpoint` means integration reached the requested local experiment end;
  `exit` means the outward disc was crossed; `missed-exit` is an unsupported
  crossing outside its radius; `crush` is terminal contact.
- The finite exterior solver uses independent analytic constant-force rocket
  segments and exact straight spatial clearance. It does not turn an impossible
  fuel demand into a physical flight; the 125 m/s case is labelled infeasible.
- No noisy camera/navigation fit, full attitude, RCS allocation, power/heat,
  damaged hull, live renderer, production save/resume or human playtest is
  simulated. The stored cancellation JSON checks representation only; it is
  not the production lifecycle test.

Suggested independent port tolerances are 1 m position, 0.002 m/s velocity,
1e-6 kg mass, 0.02 s crush time, 1e-7 N modified force and 1e-10 m/s² pull.
Do not loosen tolerances to conceal a different support or activation rule.
No S16 coast shortcut or spherical arrival certificate is valid inside these
pulling funnels. See the [study](../../../docs/studies/s22/README.md) for the
unresolved global bypass requirement and all integration requests.
