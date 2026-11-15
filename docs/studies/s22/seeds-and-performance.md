# S22 — seed certificates and field cost

## Field construction

[ASSUMED] Author in a local Garden frame. Use nine x ranks `i=0..8` and
17 × 17 transverse sites `j,k=-8..8`, pitch **160 km**. A reserved ball centre is
`(62.5+160i,160j,160k) km` plus independent ±4 km jitter per coordinate.
The entrance site is fixed at `(62.5,0,0) km` with axis `+x`; every other axis
has uniform `z∈[-1,1]` and uniform azimuth, hence uniform direction on the sphere.
The mouth is `centre-62.5 km*n`, throat `mouth+120 km*n`. This centre is an
indexing coordinate, not a force centre or a measured landmark.

[ASSUMED] A separate seeded placement matrix applies a uniform axis and roll to
the **whole formation, arrival, commands and exit disc**. Thus the entrance
funnel is not universally upright either. Matrices are included in the JSON.
Mechanics rotate covariantly; a fixed external sun, occlusion and actual camera
pointing require separate optical admission. The local reference states have
not magically passed those checks by being rotated.

[DEMONSTRATED: geometric bound and `field.json`] All physical support and the
throat fit in a radius `B=hypot(62.5,20)=65.622024 km` ball. For any two grid
sites their centres are at least `160-8*sqrt(3)=146.143594 km` apart. Thus all
reserved balls have **at least 14.899546 km gap**, irrespective of axis or seed.
This guarantees A15 Q05 even for all later births. The nominal field's measured
minimum gap is **20.934149 km**. Its bounding box lies within approximately
`x=[-7.122,1412.122] km`, `y,z=[-1349.622,1349.622] km`, before placement rotation.
The box is not filled solid and must not act as an invisible obstacle.

## Deterministic proposal distribution

[ESTABLISHED: S16 `reference.py`, `src/lib/rng.ts`] Reuse the game-compatible
FNV1a/splitmix32/sfc32 RNG port with 12 warmup draws. The S16 six-word check is
retained. No default Python/NumPy random source or clock enters the catalogue.

[ASSUMED] Namespaces are `s22.geometry.v2`, `s22.arrival.v2` and
`s22.placement.v2`, each prefixed `seed:<integer>\0`. Separate production noise
uses the actual run seed, not the selected catalogue ID. Versioning identifies
the revised A19 physics, not the superseded spherical S22 prompt.

The finite raw proposal set is **22000–22031**, 32 integers. Seed 22000 is the
explicit nominal anchor state `(10,0,0) km`, `(35,0,0) m/s`. The other 31 draw:

| Arrival quantity | Range |
| --- | --- |
| Axial depth in first funnel | Uniform 5–95 km |
| Transverse y,z | Independent uniform −200 to +200 m |
| Axial speed | Uniform 25–80 m/s |
| Transverse velocity | Zero |
| Reference mass / enclosing hull | 30,374 kg / 20 m |

[ASSUMED] This intentionally proposes some difficult arrivals to exercise
rejection. It is a catalogue of **possible continuously delivered states**,
not authorization to overwrite actual ship motion, heat, fuel or damage.
S16's 25 admitted IDs and its spherical reachable-ball certificate do not
transfer to a tapered, pulling funnel. The method and RNG transfer; the
states and certificates must be recomputed.

## Executed rejection order and denominators

[DEMONSTRATED: `seeds.json`, `catalogue()`] Apply these sufficient gates in order,
recording only the first failure:

1. **Preparation:** for 560 s of engine-off motion, require at least 20 km
   longitudinal clearance to the inflated throat's near cap, even assuming the
   maximum 0.10 m/s² axial pull throughout. Thirteen of 32 fail. The surviving
   bound proves the preparation coast cannot crush; it is not a no-bypass proof.
2. **Teach and recover:** run the outward-burn fixture. Require a sampled ≥1 km
   error with ≥600 s to the actual crush and a 240 s-turn-plus-24 s-sideways
   recovery with ≥3 km clearance. Nine of the remaining 19 fail.
3. **Two routes and timing variation:** for each of the ten survivors, fly both
   sideways signs, once at 560 s for 14 s and once at 640 s for 18 s. Require
   the outward `x=1450 km` crossing within the 350 km disc, ≥5 km conservative
   throat clearance, and ≤200 kg main. Three of ten fail. This is a four-control
   sample, not proof for every intermediate timing/duration.

**Seven admitted, 25 rejected: 78.125% rejection.** Forty full-field controls
were executed at this stage; 28 belong to admitted entries. Nominal ±16 s
flights, local depth/recovery controls and convergence tests are additional.

```text
22000 22005 22011 22015 22017 22020 22029
```

| Worst admitted result | Value |
| --- | ---: |
| Full-field crossing throat clearance bound | 6,197.971 m |
| Warning before uncorrected crush | 603.300 s |
| Local recovery throat clearance bound | 5,977.531 m |
| Largest 18 s crossing burn | 137.662 kg main |

[DEMONSTRATED: negative vectors] Seed **22001** fails warning/recovery and is
included with its initial state and evidence. Separate synthetic fixtures
reject initial throat contact, nonunit/nonfinite geometry, and overlapping
reserved bounds. Rejection means “not certified by these tests,” not “every
pilot inevitably dies.”

[ASSUMED] Runtime selects only from the admitted finite catalogue with a stable
named stream, then records ID, law/content version, full placement, run epoch and
birth states. Its selection rejects 0/7 pre-admitted entries; that is not the
raw proposal acceptance rate. Keep the current run's sensor noise independent.
Never reroll after seeing the player's commands or quietly substitute an easier
world for a depleted arriving ship.

## What is not yet a release certificate

[ASSUMED] The actual 3E/game checks must add current hull and attitude sweeps;
continuous arrival from P02/R01 and N03; main/RCS/charge/heat/condition ledgers;
fresh camera geometry and precursor acquisition; real frozen forecast and
warning timing; power loss and stale-data controls; no hidden adoption gate;
save/resume at each precursor/birth/contact event; and physical P04/N03 exits.
There is no measured rejection rate for these unimplemented checks.

[ASSUMED] The seven mechanics entries cannot be multiplied by an assumed sensor
success rate to manufacture a release acceptance percentage. In particular,
inherited axial speed, mass, turn ability and arrival epoch can change the
outcome. Reject unsupported *commitments before entering the hazard* and allow
physical preparation/abort; do not change an ongoing run's seed or reset state.

[ASSUMED] These spacious lateral routes establish recovery, not A5/A9's
carried-knowledge difficulty. The controls are authored in the true Garden frame;
the reference does not prove that a saved body-frame procedure without fresh
tracking fails. If 3E finds a comfortable carried-only passage, report that as
a content limitation and tune measurable geometry/arrival uncertainty with new
certificates. Do not erase knowledge or invent a new hidden force to rescue it.

## Performance

[DEMONSTRATED: `benchmark.mjs`, `performance.json`] An independent scalar JS kernel
matches **202 Python queries**, including interior, exterior and rear-cap cases; maximum
absolute discrepancy is `1.82e-12` in the concatenated acceleration/force outputs.
Indexed and full-scan answers are identical in JS. On installed Node 24.22.1,
nine warmed batches of 5,000 queries gave these medians:

| Operation | Measured time |
| --- | ---: |
| Full scan, mixed queries over 2,601 funnels | 5.812 µs/query |
| Bounding-ball rejection in an all-miss scan | 3.115 ns/funnel |
| Spatial hash, mixed query | 0.313 µs/query |
| Maximum candidates in a nominal point bucket | 8 |

These are local **kernel measurements**, not browser frames, actual 4× CPU
throttling, GPU timings, or a modest-laptop pass. The committed timing file is
a captured measurement and is excluded from deterministic `--check` regeneration.

[ASSUMED] Use a static **140 km-cell spatial hash** or 3B's equivalent spatial
index. Insert each enclosing ball into every cell its AABB touches, including
dormant sites. Query one cell for a point force sample; test the actual tapered
support only for those candidates. Canonical stable IDs preserve ordering.
For collision use the **swept hull AABB**, inflated by a conservative trajectory
curvature bound; never use the COM's endpoint cell alone. Ray/optical culling is
a separate query. Build/update indices on load, not every simulation tick.

[ASSUMED] Outside candidate bounds one funnel needs a few subtractions,
multiply-adds and a branch; no square root. An inside candidate adds an axis
projection, transverse norm, taper and at most four clamped quintics, plus a
dot product and rank-one correction. Pull and thrust should share this sample
when queried at the same stage. The unmodified registry might separately call
`acceleration` and `modifyThrust`; account for duplicate work and avoid dispatching
2,601 individual field objects in every stage. Register a group/coordinator with
internal indexing while keeping stable per-funnel event IDs.

[DEMONSTRATED: arithmetic sensitivity in `performance.json`] Four evaluations
per tick, eight ticks per frame batch, and a **hypothetical 4× CPU multiplier**
give about **0.040 ms** for indexed kernel queries. This is small relative to
S15's 10 ms simulation batch budget, but omits contacts, birth processing,
acquisition, ship systems and views. Do not infer a 33 ms frame guarantee.

[ASSUMED] Births are sorted events in a saved queue; there is no full-site scan
each tick. Use the static index for occupancy/nearby checks and activate/veto
only due IDs. The Python reference rebuilds its small hash at a wave for
simplicity; production should change flags without a rebuild. Spreading work
over display frames may not delay physical birth: the fixed simulation epoch
and event ordering remain authoritative.

[ASSUMED] Rendering is likely more costly than the field equation. Batch contour
rings/meridians by material and level of detail. A distant funnel can be a few
angular arcs; only nearby resolved funnels need full contour stations. Cap
on-screen labels and reuse buffers. Never remove a nearby physical hazard from
simulation because its mesh is culled. Do not fit 2,601 unobserved geometries in
the model; fit acquired tracks only.

[ESTABLISHED: A18(7), S15] Release still needs cold interaction within 2.5 s,
1× per-view frame p95 ≤33 ms, investigation of >100 ms frames, and a real modest
laptop check. Measure active FLIGHT, window-heavy room, MAP and populated
Black Box at the birth wave, with real acquisition and forecasts. Report actual
warp throughput; never enlarge the fixed physics step to make the scene faster.
