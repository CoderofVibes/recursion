# S22 — implementation and reuse map for 3B

[ASSUMED] Build the A19 funnel as a versioned new profile in the existing well
system. Keep spherical fixtures to prove historical behavior, but never load
them under the new content version. This study writes only S22-owned files.
Everything below is a request to the listed owners.

## What carries over, changes, and is new

[ESTABLISHED: S5/S16 and read-only inspection of the current 3B worktree]
3B's last committed checkpoint during inspection was `b8c24c2`; its current
files also contained **in-progress A19 scaffolding**. Names below identify useful
seams, not a claim that those unmerged APIs are frozen or independently verified.

| Existing work | Keep | Replace or extend |
| --- | --- | --- |
| S5 `T=I-2w eeᵀ` | Norm bound, two-dimensional preserved tangent plane, delivered-force input, COM correction, normal fuel use | Use the funnel axis `n`, not spherical `e=(x-c)/r`; taper/caps replace radial shells |
| S5 quintic edge | `6u^5-15u^4+10u^3`, smooth bounded gain and near-zero axial response | Spatial argument and band dimensions; add birth ramp; do not claim old 45 km Hinge shell |
| A15 Q01/Q02 | Reversed propulsion is sensed by IMU; no extra torque | Add a separate gravity-like pull omitted from IMU; update estimator/sensor agreement |
| S5/S16 finite burns | Variable mass, actual delivered inertial thrust, convergence, conservative swept clearance method | Coasts now require integration inside funnels; sphere-root shortcuts are invalid there |
| S16 RNG/catalogue | Named streams, all proposals recorded, first-failure counts, independent numeric references, finite route controls | New states/IDs, orientation, pull/crush/appearance certificates; no reuse of the spherical all-control reachability proof |
| S16 bypass analysis | Stop/slow-coast/restore counterexample and honest resource accounting | Larger spatial extent and corresponding longer times; preserve it as a negative containment test |
| 3B `funnelCoordinates`, `funnelBounds`, spatial index scaffolding | Unit-axis coordinates and conservative bounds | Extend length envelope to `L+5 km`; its generic geometry length currently means mouth-to-throat, so a bare `L` bound would miss the rear cap |
| 3B field registry and encounter provider/loading seam | `inverse-well` registration, `EncounterSetup`, registry alias, save namespace/content version and inherited-state options | Prefer an indexed field group; supply pull via `acceleration`, altered force via `modifyThrust`, per-site IDs, birth state and terminal-contact scheduling |
| 3B experiments and acquisition tests | Outside/coast/axial/two-transverse comparisons, executed telemetry, data ownership, finite sensor intervals | Coast is no longer a field-identity test; add pull-only forecast, axial sign error, cap/side fitting and throat observations |
| 3B `WellFunnelVisual` / contour stations | Acquired geometry, unit axis, uncertainty, lineage, freshness and measured phase | Feed the quadratic taper's measured stations; don't invent dimensions from missing payloads |
| 3B `WindowFunnelVisual` / `well-optical-v1` | Angular contour rays and phase; no range or true physical dimensions | Add actual optical acquisition/light adapter, emissivity, visibility/occlusion and precursor/ramp chronology |
| 3B evidence panel and frozen-forecast conventions | Measured geometry separate from learned response; immutable issued paths; candidate/adopted distinction | Pull, reversal, boundary and crush support are separate; archive birth/no-birth evidence without a truth diagnosis |

## Concrete module and contract requests

[ASSUMED] Rough scope estimates below count implementation and local tests,
excluding generated data and 3B work already reusable. They are not schedules.

| Owner / paths | Required work | Approximate changed/new lines |
| --- | --- | ---: |
| 3B — `src/sim/fields/wells.ts`, `.test.ts` | Versioned funnel parser; quadratic support; pull and reflection sample; indexed group; work diagnostics; independent port vectors and rotation/convergence tests | 350–600 |
| 3B — `src/content/inverse-wells/` | Import S22 vectors separately from runtime data; catalogue/placement; epoch-relative reserved sites; side/axial/coast experiments; real exit disc and current arrival guard | 250–450 |
| Integrator / 2F / 3D — `src/contracts/{truth,index,view,measurements}.ts` as applicable, `src/game/`, `src/sim/` retained paths | Saved birth state and event ownership; earliest whole-hull crush; run epoch; field work/IMU coupling; loader and live-session integration; optical window product | 350–650 |
| 3C / 2C — `src/ship/sensors/`, `src/model/`, `src/blackbox/` | Acquire angular contours, triangulate supported geometry, fit pull/reversal separately, preserve identifiability and held-out sample ownership, forecast player commands using only believed fields | 500–900 |
| 3B / 2D — well view/encounter subtrees, retained room/FLIGHT/window mounting | Visible optical contours and measured fitted geometry; precursor phase and uncertainty; instancing/LOD; residual evidence and acquired-only selections | 250–500 |
| 3E / owners' tests | Coupled seed admission, sensors/finite turns/resources, stale/worn conditions, no-truth-leak replay, modest profile and full-route continuation | 450–800 |
| **Total incremental estimate** | Depending on how much A19 scaffolding is already complete | **2,150–3,900** |

[ASSUMED] Truth-side data must include a stable ID, mouth/axis, fixed profile
version, nominal precursor/on times, and actual lifecycle state
`dormant | precursor | active | cancelled`. Store the index anchor only as an
implementation detail. `activeSince` determines the 120 s ramp. Save pending
event cursors and all actual cancellations. Keep run seed, catalogue ID, frame,
epoch and law version in truth saves; none is a measurement of unseen sites.

[ASSUMED] Shared belief products should include timestamp/interval, sensor and
frame, anonymous contour bearings with covariance, phase/brightness evidence,
quality, coverage and observation IDs. Reconstructed funnel hypotheses carry
mouth/axis/stations and joint uncertainty plus current-run association. Pull
parameters and propulsion-response support carry distinct experiment IDs.
Seeing a phase does not give its scheduled on-time exactly; onset forecasts
come from measured progression and an explicitly assumed or learned pattern.

[ASSUMED] Use the existing field registry, but agree a **game-owned lifecycle
seam** with the integrator: `EnvironmentField` currently samples functions of
position/time and has no general save/restore or occupied-volume birth veto.
Do not mutate a field closure during a speculative RK stage. At each due event,
evaluate the guard once from the committed actual state, persist the result,
and give later force/contact queries an immutable lifecycle snapshot. Split
integration at that time. A rejected trial stage must not consume events or
sensor RNG. Scheduled and cancelled sites must not become physical massive
cores in the encounter body list.

[ASSUMED] A19 requires the ordinary coast forecaster to fail on the pull until
the corresponding structure is enabled/fitted. Existing P4 mass calibration
must not silently absorb an axial compact field into a moving planet mass.
Use separate candidates for directional pull and axial propulsion response,
or one explicitly compound funnel extension with separate evidence gates.
Numbers fit automatically only within a player-selected rule family (A4).
Two transverse burn directions, an axial burn, outside control and coast arcs
separate local response from engine scale, attitude error and gravity.

[ASSUMED] 3B can import `field.json` for the nominal fixture and generate the
other admitted fields with the specified named stream. Do not copy 2,601 sites
into the player briefing. Runtime should include compact admitted records;
tests keep full study vectors separately. An S22 importer must reject an old
spherical schema rather than guessing defaults. The actual N03 cross-transfer
and P04 continuation remain separate flights; no cross-transfer or full-run
completion is certified by these local vectors.

## Tests required before shipping

[ASSUMED] The study executes only the independent mechanics, geometry and kernel
checks described in its tools. Production acceptance still requires:

1. Port all eight vector families with the declared tolerances and step-halving
   behavior. Test inside/outside/caps and half-weight band, both transverse
   directions, full 3D rotations, one/two force queries per stage and zero net
   RCS translation with nonzero nominal torque. Charge each actuator normally.
2. Check pull work, reversal work and expelled-mass terms independently. A coast
   changes velocity but not IMU specific force; a reversed burn changes both
   motion and IMU. Respect sensor acquisition intervals at onset and cutoff.
3. Validate **all reserved** volumes for overlap, nonfinite/unit-axis/radius
   errors and IDs. Birth with the hull inside any part of support must cancel;
   the speed-aware 240 s guard must also cancel an outside fast intercept.
   No dormant throat can kill, and no cancelled site retries invisibly.
4. Whole-hull first contact, including rotating/deploying appendages and a fast
   outside-to-outside step; exact-on-surface and simultaneous event cases;
   engine cutoff/birth/crush chronology. Stop once at earliest loss and retain
   measurements up to that time.
5. Run the admitted crossing neighborhood and wrong-burn recovery through real
   finite attitudes, RCS allocator, sensors, recorder, power, heat and worn
   equipment. Require the measured residual before recoverable crush and the
   declared 1,000 kg main / 30 kg RCS budget without refills. Failed inherited
   states need a physical preparation/abort route, not a new seed.
6. Observe precursors in the 30-degree camera cone with adequate actual signal,
   parallax, processing and recording, including random placement relative to
   fixed lighting/occlusion. Verify a usable warning ≥600 s before birth for the
   intended informed plan. Looking away/power off produces missing evidence,
   not a full exact funnel or an automatically safe gap.
7. Change hidden site geometry while replaying the same acquired measurements:
   model/FLIGHT outputs stay identical. Window output may change only through
   the visible optical product. Disabling the nav camera does not blind the
   unaided window. It does stop new camera-derived map geometry.
8. Train only on training experiments, hold out distinct completed records
   (A15 Q03), preserve issued forecasts and historical geometry, refresh new-run
   geometry, and demonstrate carried-rule/no-new-tracking uncertainty (A5).
9. Save/resume just before precursor, on the birth/veto tick, during ramp and
   near crush; compare all event/state/measurement outputs across warp batching.
   Geometry generation and future birth times must not depend on UI actions.
10. Retain the slow exterior bypass regression, search interior gaps, and report
    true resource/endurance outcomes. Run the S15/A18 frame matrix with visible
    field and acquired model data, then a person flies the first encounter.

## Owner questions — one decision at a time

[ASSUMED] Route these through the integrator in this order; no decision has been
silently applied to DECISIONS:

1. **Can a very slow physical bypass remain valid?** Recommend yes for this
   prototype. If no, commission a separately specified physical transfer/energy
   constraint; this field alone cannot prove the requested global fuel wall.
2. **Does “away” mean along the funnel axis toward its mouth?** Recommend yes:
   axial reflection preserves every sideways escape direction and keeps the
   first lesson legible. The visible geometry now has a real physical axis.
3. **Use 120 km length / 20 km mouth / 1 km throat and 0.02–0.10 m/s² pull?**
   Recommend these as prototype values. They permit recovery with minutes of
   margin but leave late, fast approaches lethal; tune only after play.
4. **Should the new pull be absent from the accelerometer?** Recommend yes:
   treat it as gravity-like free fall, while reversed thrust remains sensed
   under A15 Q01. Ship motion and thrust experiments then reveal separate facts.
5. **Use a 900 s visible precursor, 120 s ramp and permanent per-run occupancy
   veto?** Recommend yes. It is deterministic and learnable, and avoids repeated
   pop-ups chasing the ship. It also intentionally permits a blocked site to
   remain a gap.
6. **Use the 2,601-site field and seven admitted mechanics entries for the next
   prototype?** Recommend yes, subject to the production sensor/turn/resource
   admission gates above. The 225-site crop loses scale and needs fresh tests.

A19 already decides that funnels are visible, pull coasting ships and crush at
their narrow end. These questions refine those instructions; they do not reopen
the old invisible-sphere interpretation.
