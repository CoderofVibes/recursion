# S5 — Finite lattice sheets in a volume

This is a proposal for 3C, 3A, 2G and 2D, not a decision or a game implementation. Read [the study index](README.md), [model and interface](model-and-interface.md), and [the reference generator](../../../tools/studies/s5/generate.py). All proposed dimensions and tolerances below are [ASSUMED]; the field and its observability are [FICTIONAL]. Reference results are labelled separately from proposed acceptance tests.

## Recommendation and geometry

[ESTABLISHED: creative brief §6; DECISIONS A11, A13] The danger is a spatial radiation-like lattice with genuinely clear opening centres. Exposure accumulates on individual components; the entire ship must fit. Unseen Cathedral introduces it; Missing Room investigates unresolved space; Braided Crossing combines it with wells. There is no required death or visited-region flag to unlock reconstruction.

[ASSUMED] Use **finite, oriented sheets containing clipped line segments**, with independent offsets and tilts. Each layer stores a centre `c`, an orthonormal right-handed basis `(n,u,v)`, a finite rectangular or polygonal patch, pitch in each in-plane direction, phase, and an explicit list of clipped segments. Straight orthogonal grids are the first implementation; rotate the in-plane basis to make diamond openings. A bent strand can later be a polyline with a declared approximation error, not a new damage law. Different layers may physically cross.

[ASSUMED] Each segment is `s_j(q)=a_j+q(b_j−a_j)`, `0≤q≤1`. Compute distance in 3D using the clamped projection onto that **finite** segment, including its endpoints. The nearest distance for layer `l` is `d_l(x)=min_j distance(x,s_lj)`. A strand's compact influence is a tube around its segment, including spherical caps. The sheet extends by the tube radius beyond its clipped segment endpoints; this is its declared finite support. No modulo operation creates an invisible infinite fence. No unmodelled perimeter wall closes the bypass.

[ASSUMED] Reference dimensions, deliberately independent of final encounter scale:

| Quantity | Reference value | Purpose |
| --- | --- | --- |
| In-plane pitch | 80 m | 72 m point-clear gap between 4 m influence tubes |
| Patch half extents | 200 m × 200 m | Finite 400 m sheet; clipped segments include boundary coordinates ±200 m |
| Tube influence radius `w` | 4 m | Wide enough for explicit clearance and temporal convergence tests |
| Peak intensity `I0` | 20 fictional U | Severe energized contact can disable standard electronics |
| Example stack | 8 sheets, 300 m between centres | JSON contains phases of 9/11 m and normal tilts of −12°, 0°, +12° |
| Fixture crossing speed | 2 m/s | A controlled lab pass, not expedition travel speed |

[ASSUMED] The eight-sheet data are a geometry construction example, **not a demonstrated flyable corridor**. Their small repeated offsets preserve overlapping central openings and do not demonstrate blind-traversal difficulty. Final content needs broader phases and tilts, no common straight opening through the intended passage, and a dynamically feasible curved/sequenced route using current yaw/pitch/held-roll controls, current propellant, turn authority, deployment time, sensing and cooling. A local open cell in every sheet does not prove the cells connect. Avoid making manual roll necessary: A11 currently holds roll. A lateral dogleg and heading changes can align the available hull orientation with different openings.

## Compact, steep exposure

[FICTIONAL] Use 1B's compact quartic intensity, in existing contract units: intensity `U`, exposure `U s` (`LatticeIntensity`, `LatticeExposure`), **not Gy, Sv or an asserted NASA radiation environment**:

```text
I_l(x) = I0_l * [max(0, 1 − d_l(x)^2 / w_l^2)]^4
I(x)   = sum_l I_l(x)
```

[ASSUMED] This chooses `g_l=1` in 1B §9 because finite segment tubes already have compact support; an additional layer envelope is unnecessary. Within a layer the nearest strand gives one contribution, including at a junction. Separate layers add, even where they intersect. Canonical layer/strand IDs fix reduction order. Intensity is continuous at the tube edge and finite at a junction. There is no contact impulse or velocity reflection from radiation strands; solid rocks remain ordinary collision geometry.

[DEMONSTRATED: `lattice_reference.py/build_vectors`, `analytic_crossings`] For a point at closest offset `b` crossing perpendicular to one straight strand at constant speed `v`, away from segment ends and other strands:

```text
I(t) = I0 * [max(0, 1 − (b² + v² t²)/w²)]^4
D(b) = (256/315) * I0*w/|v| * [max(0,1−b²/w²)]^(9/2)
```

The integral follows by `u=vt/[w sqrt(1−b²/w²)]`, integrating `(1−u²)^4` over `[-1,1]`. The code compares this independent antiderivative with midpoint integration. `v` is the speed perpendicular to the strand, not necessarily the ship speed or sheet-normal speed. Parallel travel with constant separation requires direct time integration; the `1/v` formula does not apply at `v=0` or beyond finite ends.

| Point pass (`w=4 m`, `I0=20 U`, `v=2 m/s`) | Closest offset | Peak intensity | Integrated exposure |
| --- | --- | --- | --- |
| Central contact | 0 m | 20 U | 32.507936508 U s |
| Glance | 2 m | 6.328125 U | 8.907689867 U s |
| Outer glance | 3.2 m | 0.3359232 U | 0.327605102 U s |
| Clear tube boundary | 4 m | 0 | 0 |

[DEMONSTRATED: `analytic_crossings`] These are numerical reference results, not probabilities or “damage per hit.” Doubling speed halves these point exposures. [ASSUMED] Slowing to improve navigation increases exposure if the route touches a tube; choose a clear path, not a universal “slow is safe” instruction. At `b=0.9w` the exposure is below 0.02 U s at this speed, far below the standard 20 U s degradation start; a single such outer skim is too small to cause permanent degradation in this model. Accumulation and pre-existing damage still count.

## Components and electrical consequences

[ESTABLISHED: R04, R05] Real space radiation can cause cumulative degradation, recoverable upsets and catastrophic electrical failures. These are distinct mechanisms with device-dependent susceptibility, not a universal hit count. See [NASA NESC guidance](https://ntrs.nasa.gov/citations/20210024100) and [JPL's radiation-effects discussion](https://parts.jpl.nasa.gov/asic/Appendix.3.html). These sources support the engineering categories, not the lattice geometry, numeric thresholds, or deterministic bucket rules.

[FICTIONAL] Retain the selective component damage fiction in `data/ship-baseline.json/radiation`: no acute crew dosimetry is inferred. [ASSUMED] For a compact assembly, use its moving mount point only as a declared small-geometry approximation; for an appendage, use the maximum intensity over its occupied solid `S_c(t)`:

```text
I_c(t) = sup_{x in S_c(t)} I(x)
dD_c/dt = susceptibility_c * I_c(t)
```

[ASSUMED] This deliberately follows 1C's conservative `geometryPolicy`, rather than averaging away a local exposed tip. The maximum can move across the component with time; `integral(max I)` is the chosen conservative damage measure, not `max(integral I)`. Split independently vulnerable electronics or loops into subcomponents if that approximation overstates damage to a large assembly. Passive radiating metal need not have electronics susceptibility: map vulnerable actuator, pump, controller and wiring volumes explicitly to existing equipment/condition channels. The radiator fixture below measures **raw exposure**, without assuming its entire panel is a standard electronic component.

[ASSUMED] Across multiple layers, the sum of individual layer maxima is an upper bound on the maximum of their sum; it may be attained at different points. Do not silently make that bound the actual dose. Use it to enclose the answer, refine space/time near ambiguous thresholds, and document any deliberately conservative damage approximation as content policy. Every component has its own `D_c`; no whole-ship average or common health bar substitutes for it.

[ASSUMED: existing 1C proposal at study base `baf65e0`] Reuse the baseline standard profile: susceptibility 1, degradation start 20 U s, permanent failure 80 U s, upset spacing 6 U s, protected latch spacing 20 U s, energized burnout when raw local intensity stays above 10 U for 0.1 s. Hardened susceptibility is 0.5 and its thresholds differ. Passive susceptibility is zero. These are proposed game numbers, not hardware qualification.

[ASSUMED] 3A's deterministic condition engine must:

1. Integrate exposure while equipment is off as well as on. Powering down can prevent powered upsets/latches and burnout; it does not erase or shield exposure.
2. Advance exposure bucket cursors while off; turning back on never emits a backlog of old upsets. Buckets depend on integrated local exposure, not how often a collider entered a strand.
3. Localize dose-threshold and contiguous high-intensity dwell crossings within a step. A dip below the intensity threshold resets the contiguous dwell; an averaged intensity cannot preserve that fact.
4. At a latch, feed the actual fault to branch protection, heat and available power. Recompute later powered effects after isolation. At ties use the baseline order: failure, trip, upset. Keep the failed/tripped distinction.
5. Preserve permanent exposure/degradation/failure on reset. A deliberate reset after fault clearance only restores recoverable service. Record the first lost capability, then its downstream effects on sensors, cooling or control.

[DEMONSTRATED: `glancing_electrical`] Three isolated identical point glances give 26.723069602 U s. They produce emitted upsets at 6, 12 and 18 U s, and a protected latch at 20 U s; the 24 U s bucket advances while tripped and emits nothing. The component remains below its permanent failure threshold. A later valid reset leaves its operating draw multiplier at 1.028012790 (baseline leakage curve). The same raw path gives 13.361534801 U s to a susceptibility-0.5 component and zero to passive material. The example assumes instantaneous protective isolation at the latch, a continuously powered component beforehand, and separated passes; it is a condition-rule oracle, **not an implemented bus/thermal simulation**.

[DEMONSTRATED: `glancing_electrical.central_powered_crossing`] A central point pass has 1.595511628 s above 10 U. It meets the 0.1 s burnout criterion if still energized for that interval. An earlier trip or power-off changes the outcome; no event list may keep pretending it stayed powered. Off-state exposure can still accumulate to eventual permanent failure.

## Whole-ship sweep and numerical contract

[ASSUMED] Work in the encounter inertial frame. A material point with body datum coordinate `b(t)` is `x_COM(t)+Q(t)[b(t)−c_COM_body(t)]`. This subtraction matters during propellant depletion and deployment. Use **current moving hull pieces and appendages**, not the largest or smallest stored configuration, and account for the full transition path. A thin wing can intersect a strand between its vertices while all vertices are clear; corners alone cannot certify clearance.

[ASSUMED] Define geometric clearance from the influence tubes, independently of damage susceptibility:

```text
C(t) = min_{all occupied ship pieces S, layers l} distance(S(t), strands_l) − w_l
C_swept = min_{t in [t0,t1]} C(t)
```

`C_swept>0` certifies zero field exposure for this declared geometry. `C_swept<0` means some geometry enters a tube; it does not itself mean electrical failure. Exactly zero is tangency with zero intensity but zero navigation margin. Clearance to solid debris is a separate collision query. Certify each body/appendage and its earliest loss of margin.

[ASSUMED] Production uses 2G's union of convex prisms, segment-to-solid distance, and a BVH or spatial index over finite strand tubes. A bounding sphere is a fast conservative rejection, not the final answer for narrow openings. Reference capsules supply independently checkable distances and conservative shape examples; converting final prisms to capsules would change playable clearance and needs an explicit shape approximation budget.

[ASSUMED] Deterministic temporal enclosure: if every material point in an interval moves at speed ≤`V`, signed distance to a static strand set is Lipschitz with constant `V`. At midpoint `tm`, all interval clearances lie above `C(tm)−V*h/2`; the sampled value itself upper-bounds the minimum. Include COM speed, `|omega|*reach`, deployment speed and CoM-shift rate in `V`; add strand endpoint/field motion if later supported. A bound based on endpoints alone is invalid for a rotating or accelerating object. Split the interval into dyadic children in canonical order until clear, exposed or within declared error. Curved trajectories need a valid velocity bound, not chord interpolation without a curvature allowance.

[ASSUMED] For dose, enclose intensity over geometry and time as well. One layer's distance-profile Lipschitz constant is `8 I0/(w sqrt(7)) * (6/7)^3`; multiple layer constants add. This supplies conservative quadrature bounds; nearer a threshold refine rather than choosing a favourable side. As a starting resolution heuristic, require material displacement per substep ≤`w_min/8` and ≥4 samples over a 0.1 s burnout dwell; then verify the exposure and threshold-time error. Neither heuristic alone is a proof. At 20 m/s, `w=4 m`, a 1 s tick needs at least 64 dyadic substeps for both heuristics. Warp changes the number of fixed ticks, never geometric or dose resolution.

[ASSUMED] The field step must report unresolved numerical queries if its refinement limit is exceeded, never classify them as clear. Authoring must keep all supported configurations and velocities within its budget; the game must not rely on a player-facing pause to recover from inadequate resolution (A12). This study supplies no browser performance claim.

## Reference cases and acceptance

[DEMONSTRATED: `lattice_reference.py/build_vectors`] The reference hull is a capsule from body `(-6,0,0)` to `(6,0,0)`, radius 2 m. The deployed radiator capsule runs `(0,3,0)` to `(0,14,0)`, radius 0.5 m; stowed comparison ends at `(0,5,0)`. CoM travels from `x=-16` to `x=16` in 16 s, nose +x, through the sheet at `x=0`. These are analytical fixture envelopes, not a replacement for the ship baseline.

| Fixture | Centre-only margin | Hull margin | Radiator margin | Raw radiator exposure |
| --- | --- | --- | --- | --- |
| Centre at y=z=0, deployed | 36 m | 34 m | 21.5 m | exactly 0 |
| Centre at y=24 m, deployed | 12 m | 10 m | −2.5 m | 18.450020194 U s at dt=1/32 s |
| Same centre, stowed comparison | 12 m | 10 m | 6.5 m | exactly 0 |

[DEMONSTRATED: `passes`] Successive raw radiator exposure values at steps 1/8, 1/16, 1/32 s are 18.450017306, 18.450020074 and 18.450020194 U s. The capsule measures the maximum over its finite solid, so its exposed pass differs from the point glance. Translation sweeps enclose the true minimum within 0.02 m; the output records both bounds.

[DEMONSTRATED: `rotating_appendage`, `fast_crossing`] A 34 m boom undergoing a stress-test yaw has both end poses clear but intersects midway; a 20 m/s point crosses a full tube in one 1 s tick with both endpoints outside. The swept tests catch both. The 1 s/1.2 rad boom motion is a numerical stress fixture, not a claim about available attitude authority. Full field distances are invariant under a rigid 3D rotation/translation; junctions are not doubled; a point past a finite edge gets zero exposure. Segment checks include crossing, degenerate, parallel and near-parallel cases. Floating-point geometry still needs production-scale conditioning tests.

[ASSUMED] Additional code-thread acceptance, beyond the supplied reference:

- Rotating **and deploying** actual hull prisms, including a strand through a face interior, have conservative swept clearances; halve spatial/time tolerances and compare first exposure times.
- Mixed simultaneous layers integrate the maximum of summed intensity with an explicit bound; overlapping layers add, duplicate strand tessellation within a layer does not.
- Dose error ≤`max(1e−5 U s, 1e−4 * reference dose)` and first protection/dwell event error ≤0.001 s on qualification fixtures. Pass the reference capsule exposure within 1e−4 U s. All refinement tolerances/version choices are recorded.
- The real condition, bus and thermal pipeline processes threshold events chronologically, prevents post-trip powered faults, and saves/restores exposure, dwell and bucket cursors exactly.
- Seeded, bounded content variation retains feasible whole-ship paths with the supported controls. Deterministic blind trajectories must integrate the same component doses and condition logic as informed trajectories.

## Encounter scale, uncertainty and smaller version

[ASSUMED] Cathedral should contain multiple staggered sheets, outer observation pockets and a real exterior bypass whose travel/propellant/power costs are measured. At the reference spacing, the first-to-last centre is 2.1 km; 2 m/s takes 1,050 s before turns. A sustained 1,000 W processor load alone uses 1.05 MJ (0.292 kWh), excluding camera, IMU, recorder and hotel loads. This is a scheduling example, not a final encounter duration. A route must account for folding's cooling cost and for hardware that will enter the tube after the nose has passed.

[ASSUMED] With unknown independent uniform phases, an ideal square sheet and a circular projected ship envelope of radius `a`, the interior zero-contact aim fraction is `q=[max(0,1−2(w+a)/pitch)]²`; N independent phases give `q^N`. This is a conditional geometric estimate, **not a survival roll or a survival probability**. Tilt, finite edge bypasses, correlated phases, attitude, swept depth and cumulative component damage invalidate using it as an actual encounter statistic. Do not claim “extraordinarily unlikely” from the old planar formula. The content gate must measure uninformed traversal outcomes for the actual authored volume and show a feasible informed procedure. This remains outstanding.

[ASSUMED] The best version includes localized component geometry, finite layered topology, bounded sweep integration, calibrated reconstruction with coverage gaps, held-out clearance forecasts and retained raw observations. A smaller first version can use static sheets and capsule envelopes for an isolated lab, with compact electronics points and explicit conservative appendage geometry. It loses detailed ship clearance and some valid routes. It must still retain finite edges, moving appendages, per-component integrated effects, uncertainty and the distinction between clear and unobserved. A centre-point collider, an always-visible truth mesh, or fixed damage per crossing would lose the requested encounter.
