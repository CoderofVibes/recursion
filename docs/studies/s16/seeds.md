# S16 — reproducible admission, with denominators

[ASSUMED] Start with the finite catalogue in `tools/studies/s16/seeds.json`.
Admission is author-side computation, never a planner offered by `src/model/`.
The following are all the raw proposal ranges; only the accepted discrete
instances, with the tested controls and reference ship, have numerical flight
certificates. A10's law, radii, core sizes, equipment ratings and topology stay fixed.

| Quantity | Raw distribution |
| --- | --- |
| Proposal seed | Integers 16000 through 16127, exactly 128 cases |
| RNG | Game-compatible FNV1a/splitmix32/sfc32; `createRng(seed).stream('s16.geometry.v1')` |
| Arrival radius outside W1 | Uniform 50–1,200 m beyond 50 km |
| Arrival transverse y,z | Independently uniform −150 to +150 m |
| Arrival x | Negative square root preserving the chosen radial distance |
| Forward speed | Uniform 30–40 m/s |
| Transverse velocity y,z | Each forward speed times uniform −0.001 to +0.001 |
| W1 | Fixed at garden origin |
| W2 and W3 offsets | Each coordinate independently uniform −7.5 to +7.5 km |
| Formation yaw / pitch | Uniform ±30° / ±20°; rotate centres, arrival, commands and exit frame together |
| Noise | Not simulated here; separate production sensor stream per run |

[DEMONSTRATED: `reference.py:Rng`; direct comparison with `src/lib/rng.ts`]
The first six unsigned outputs for seed 16000 and the named stream are
`3744950808, 718765878, 1072496303, 3010543048, 3621254057, 337399829` in both
implementations. The Python port uses ASCII keys, 32-bit overflow and the same
twelve warmup outputs. No NumPy default random generator, clock or machine path
enters the data. Changing any draw order requires a new stream/version identifier.

## Executed filters

[ASSUMED] Apply these in the stated order. Report the first reason for rejection,
not several overlapping percentages. Rejection means “not certified by this
study”; in particular failure of the sufficient reachable-ball test does not
prove there is an avoiding route.

1. Keep every pair of outer spheres at least 10 km apart. Every one of the 128
   proposals passes; the smallest actual gap is 24.942 km.
2. Require a forced-influence witness at least 100 m deep using the all-control
   acceleration bound in the main study. This rejects **99/128**.
3. For each remaining geometry, fly both +z and −z maneuvers, each with start
   times 560/600/640 s and durations 6/8/10 s: **18 controls per geometry**.
   Every control must exit with at least **2 km** whole-ship core clearance.
   This rejects **4/29**, or **4/128** of raw proposals. The failing control is
   included in each rejected record, rather than hidden behind the reason string.
4. Require the wrong-belief trajectory to hit a core, the sampled residual warning
   to precede contact by at least **360 s**, and the 240 s-turn-plus-16 s-burn
   recovery to exit with at least **500 m** core clearance. All 25 survivors pass.
5. Independently require initial whole-ship separation and a safe first 560 s
   engine-off preparation interval. Every raw proposal has more than **25 km**
   core clearance throughout that interval. A synthetic seed touching the whole
   ship to a core is explicitly rejected before propagation in `vectors.json`.

[DEMONSTRATED: `generate.py:catalogue`] The final count is **25 accepted, 103 rejected
out of 128**, or **80.46875% rejected**. There are 522 executed informed controls:
29 post-bound candidates × 18 controls, including the four subsequently rejected
geometries. The accepted set contains 450 passing control variants. These are
finite-catalogue counts, not estimated universal probabilities or proof that the
interpolated continuous control/seed ranges pass.

| Worst result among the 25 accepted seeds | Value |
| --- | ---: |
| Forced penetration under every admissible control | 112.812 m |
| Informed-route whole-ship core clearance, across all 18 controls | 2,015.745 m |
| Main used by the largest 10 s informed burn | 76.478716 kg |
| Warning lead before uncorrected contact | 377.278 s |
| Recovery whole-ship core clearance | 812.383 m |
| Recovery main use, including wrong burn | 351.802093 kg |

[DEMONSTRATED: `seeds.json`] Accepted candidate seeds:

```text
16002 16003 16007 16017 16019 16022 16026 16031 16034
16038 16047 16048 16064 16065 16073 16080 16094 16096
16098 16099 16102 16103 16115 16116 16118
```

[ASSUMED] For an initial production catalogue, use the run's named geometry stream
to select one accepted record, and retain that record's geometry, rigid transform
and version in the attempt. Selection then rejects 0/25 already-certified catalogue
entries; this does **not** change the raw 103/128 authoring rejection count. Sensor
noise must use the actual run seed and an independent stream, so recurrence never
manufactures a duplicate measurement. A later broader generator must rerun admission
on its own candidates; do not loop until “any non-overlap layout” appears and call
it the same distribution.

## Rejected vector

[DEMONSTRATED: `vectors.json.rejected_seed`] Seed **16000** has a maximum-reachable
radius bound of **50,676.529 m** at **23.754969 s**. The required result is at most
49,900 m, so it fails the no-bypass certificate. It is initially separated and
survives the preparation coast; this rejection is not an initial lethal seed or
a proof of inevitable later death. Its explicit state, centres and rotation are
provided so 3B can port the admission test.

## What must still reject a release seed

[ASSUMED] The study's admitted label is a **mechanics candidate**, not a release
approval. Require the actual arriving ship to pass these additional gates:

- Continuous incoming state from P02/R01 or N03; no replacement of velocity,
  propellant, charge, heat, attitude or condition. Recompute the bound with every
  added acceleration source and actual hull envelope. A different entrance needs
  its own proof and flight witnesses.
- At least 1,000 kg main and 30 kg RCS as a starting allowance, with sufficient
  thrust, gimbal/attitude authority, sensor operation and cooling to execute the
  tested maneuvers. Low reserves make a state unsupported, not permission to refill
  it or change its geometry after arrival. Resolve admission before commitment;
  a mismatching inherited state needs preparation, a physical alternate route or
  a clearly reported inability to continue.
- Whole-ship sweeps for the actual configuration; 20 m is the reference enclosing
  sphere, not a licence to ignore newly installed or broken extended hardware.
- Both routes, a nearby timing/magnitude neighborhood, warning and recovery through
  real ship systems. The three nominal-layout mass tests are not a Cartesian sweep
  over all seed/mass/damage combinations.
- Actual acquired observations and an immutable issued forecast meeting the
  declared residual criterion before recoverable contact. Full-reversal thrust
  should disagree on the accelerometer; a navigation estimate that merely
  integrates ordinary commanded thrust is insufficient independent evidence.
- Fixed external sunlight, camera FOV/pointing, occlusion, recording power and
  thermal endurance. A global rigid rotation preserves mechanics but does not
  rotate the sun or certify sensors. No extra rocks are certified by this study.
- Save/restore and run replay preserve the same geometry and observation streams.
  Archived centres stay associated with their original run; an adopted response
  law transfers, precise seed coordinates do not.

No rejection percentage is claimed for these unexecuted session gates. Best-case
geometry acceptance must never be multiplied by unrelated sensor/resource numbers
to invent an overall fair-seed rate.
