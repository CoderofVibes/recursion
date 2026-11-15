# S4 — implementation, conflicts and owner choices

Read the [expedition](../../design/expedition.md) and its 23 [region pages](../../design/regions/). This study interprets A6/A8–A13; it does not approve new systems. All costs, ranges, pacing and test thresholds here are **[ASSUMED] estimates**. Code baseline inspected: `baf65e0`; 2G and the other studies continue independently. Their unmerged work is not represented as implemented here.

## Recommendation and numerical basis

Keep the A13 route, eight forward-rejoining detours and two-way cross-transfer. Twelve core authored volumes hold twenty original encounters plus A02's proposed pocket; A01 and A03 would add two volumes. Retain every original ID/question. Make the gate physically require well timing and acquired lattice clearance, with an observation skirt allowing zero-loss discovery. Build W/L and the recurrence frame before combined content; validate X early because the terminal route depends on it. Prototype Borrowed Spin only after S1–S3 establish viable physics, hardware and control.

The [checker and report](../../../tools/studies/S4/) provide node/edge, forward-path, gate and pacing arithmetic checks. Those establish document consistency, not physical feasibility. Run from the S4 worktree:

```powershell
python tools/studies/S4/check_design.py
git diff --check
```

The checker reads the authored Mermaid graph and timing table, compares the graph with the original proposal's edge list, checks catalogue/template coverage and local links, enumerates simple paths, and writes deterministic `report.json` beside the script. It uses the standard library, no random sampling or installed packages. Gate dominance in a graph only proves an authoring property; it cannot prove that a ship cannot fly around finite fields.

The current [P14 baseline](../../DECISIONS.md) is about 690 m/s main-engine ideal delta-v and 20 m/s RCS per run. **[ASSUMED] Initial harness goals:** retain at least 10% of each loaded propellant mass at H02 on the practiced reference route; report the actual remaining delta-v from mass/engine state as well. This is a tuning proposal, not a claim that ten percent is a safe flight reserve. Suggested per-stage diagnostic allocations, **not enforced taxes**, are C01/C02 30%, branches plus transfers 30%, C05 15%, H01/H02 15%, retained 10% of loaded propellant. RCS must be budgeted separately; a main-engine balance cannot rescue an attitude-control shortfall. Do not assign arbitrary fuel debits or refills to make the table balance.

Measured full-run budgets must replace these allocations. Include all physical coast time, deployment, correction, sensing and heat rejection. The active-minute estimates cannot establish fuel, battery or thermal feasibility. 3E must log both wall-clock/warp assumptions and simulation time. A new physics detour must demonstrate **net** benefit after diversion/capture/control costs or justify itself by useful evidence alone.

## Conflicts and their disposition

| Conflict | S4 treatment | Required owner/implementation follow-through |
|---|---|---|
| 1F assumes planar control, fixed geometry, repeated branch loops and a C03–C04 bypass | Supersede with A11/A10/A13; no required revisit or bypass | Integrator updates template's planar sentence and stale Phase 4 “send back out” wording |
| Proposal varies Twin Deeps separation and mass ratio | Keep P16 masses/radii and 4,000 km separation fixed; vary phase/orientation/entry/belt geometry | 2F may tune constants as a versioned content decision, never random masses under A10 |
| A6 slingshot versus a generic distance/speed objective | Both C02 exits require a physical Beta flyby through Beta's belt | 2F/game-side evaluator needs a physical witness; no visit or extension flag |
| A13 signature gate versus proposal's broad detours around finite fields | C05 has no intended affordable W/L-free route in the admitted arrival envelope | 3E must search for ballistic, exterior and burn-through alternatives; accept physically valid outcomes, revise geometry if the gate fails |
| Twelve-to-fifteen first contact versus A13's short routes | Short sensing/power routes have 9/10 entries through C06; exploratory examples have 12/14 | Owner may adjust pacing, not add mandatory investigation flags |
| A9 “danger every run” versus A12 safe preparation | Hazard transits retain risk; preparation pockets remain safe | Test changed geometry and current condition, never inject unseen faults into quiet transit |
| A12 unlimited preparation versus finite reactants, RCS hold consumption and calibration aging | Sustainable illuminated low-load coast is a build acceptance target; active experiments retain costs | 3A/2G prove no necessary propellant drain and steady energy/thermal behavior; aging widens belief, not creates an automatic death clock |
| P04 is called a transfer, but carries endurance pressure | Treat its shadow coast as an explicitly entered encounter | It cannot be the dangerous “between encounters” preparation area |
| Current session code/comments describe paused preparation and same-encounter reset | Whole-run reset/new-run geometry and no encounter pause are design requirements, not current results | 2F/3D/2D update loop/save/UI behavior; existing D10 demonstrates the earlier contract only |
| `TransitRecord` comment says every attempt repeats one transit | Record each actual run's transit, epoch and arrival; do not reuse a previous run's physical history | Integrator/3D reconcile comment/type consumers with A9/A10 |
| Local encounter time starts at zero; shared volumes must not reset | Retain monotonic run epoch plus local offsets and shared volume state | 3D run/encounter identity contract; model receives observed time/frame transforms only |
| Existing run comparison may use archived coordinates | Preserve old briefing and phase; align explicitly for comparison, never substitute an old obstacle map | 2C/2D model and Black Box mismatch presentation |
| Same-run local learning versus model validation requiring distinct AttemptIds | Manual zero-loss learning works without adoption; a second segment under the same AttemptId is not held-out evidence under the current contract | Request sequential experiment/AttemptRecord boundaries within one live encounter: seal acquired records without resetting physics, each sample owned once, new unique ID, continuous run/volume epoch. 2C/3D/integrator must approve this or another independent-evidence representation before claiming same-run validated local adoption |
| “Reuse” in proposal sounds implemented | W/L/X are designed vocabulary; no field implementation exists in baseline `src/sim/fields/` | S5/S6 and assigned builders own implementation and verification |
| Sunward slabs and Red Wall external radiation exceed current A3 shadow support | Use body-limb illumination and internal load/thermal inertia first | Arbitrary mesh occlusion or radiating walls need separate model/physics scope; no new heat source by illustration |
| New gas/tidal/tether intrinsic values vary in proposal | Recommend fixed profiles/structure mass/inertia, varying pose/phase/entry only | Owner may approve other bounded local geometry, but learned laws and massive-body mass/size remain fixed |
| `region-proposal/README.md` references absent `flow.html` | Read available README, regions, prompt and full `flow.fragment.html`; replace current design diagram in expedition | Archived export is absent at baseline, not an S4 deliverable; no fabricated browser validation |

## Roll audit

The contract's `quat.pointAlong` applies the smallest rotation toward a body-axis target; yaw/pitch steering does not give independent roll. These pages do not assume a convenient roll angle after a slew. Full physical attitude/torque remains three-axis. Validate the actual path-dependent attitude, not a freely chosen orientation at every sample.

| Affected regions | Roll dependency in proposal or implementation | Roll-held recommendation / remaining risk |
|---|---|---|
| C01, C02 | Tracking, inclined flyby and control geometry | Yaw/pitch plus supported translations; test 3D authority and belt clearance with real inertia |
| C03 | Roll to reveal a rear glimmer | Slew or use acquired map coverage; no roll input needed |
| P01, N01, N02 | Pointing while holding instruments/arrays | Broad viewing envelope; no mandatory attitude requiring an independent roll DOF |
| P02, R01, P04 | Roll to trade array/radiator incidence; heat-rejection orientation | Select yaw/pitch/deployment schedules; reject seeds lacking a simultaneous control/thermal solution; no invented gimbals |
| P03, R02 | Radial/tangential burns in a 3D well | Use actual body-axis pointing and translation authority; never infer radial response from camera roll |
| N03, R03, C05 | Flatten the spacecraft through tilted lattice holes | A roll-held corridor must fit the full hull or a permitted stowed configuration; optional tighter roll-only corridor deferred |
| N04, C06 | Observe differently oriented rims/views | Camera pointing handles observation; view-frame rotation is not a command to roll the ship |
| C04, R04 | Asymmetric thrust/configuration excites all attitude axes | Record roll-hold compensation demand and saturation; no moving/installing modules unless separately built |
| H01, H02 | Fit a rotated moving opening; preserve outgoing orientation | S6 must admit a full-ship corridor under the reachable attitude, then map pose/rates consistently; no automatic corrective roll at transfer |
| A01 | Projected drag area and uneven load torque | Optional only; yaw/pitch must produce useful braking without exceeding roll compensation; otherwise defer this approach |
| A02 | Gravity-gradient torque may principally excite roll | Show the actual measured rate/control load; if held roll removes perceptible effect, do not amplify physics to save the concept |
| A03 | Capture point orientation, tether attachment torque and release | S1–S3 must prove reachable capture and survivable roll-hold loads for fixed hardware; arbitrary anchor orientation is not automatically admissible |

## What building it takes

Approximate **new or materially changed non-generated TypeScript lines**, including focused tests; no precision or scheduling guarantee. Content estimates are separate from shared systems. Existing model core is reused. Costs overlap with current phase assignments and must not be added blindly to their budgets.

| Package | Modules, contracts and data touched (requests only) | Estimated size |
|---|---|---:|
| Run frame and geometry | `src/game/expedition/`, `recurrence/`, `save/`, `procedures/`; `src/game/session.ts`; per-volume seeded content generators; `AttemptStart`/save run identity, epoch, content version; `TransitRecord`; named streams in existing `src/lib/` API | 1,500–2,500 + 800–1,400 test lines |
| A12 and sustainable transit | `src/app/game.ts`, game controls/session, 2D screen pause/warp plumbing; 3A power/thermal and 2G/3A attitude hold; continuous transit telemetry | 400–800 + 250–500 tests, excluding major RCS redesign |
| Core and optional reuse content | `src/content/<encounter>/` for C01–C06, P01–P04, N01–N04, R01–R04, H01/H02; volume/frame/arrival ranges and route data, original IDs retained | 2,000–4,000 + 1,000–2,000 harness/test lines; W/L/X excluded |
| W shared system | `src/sim/fields/wells.ts`, proposed `src/model/extensions/thrust-response.ts`, field observations and belief geometry, 3B console/view modules | 600–1,200 + 400–800 tests; S5 recommends profiles, owner/integrator approves |
| L shared system | `src/sim/fields/lattice.ts`, `src/ship/sensors/`, per-component exposure/condition, belief reconstruction/sweep quality; 3C console/view modules | 1,000–1,800 + 600–1,000 tests; S5/3A/3C refine |
| X shared system | S6-proposed truth opening pair/frame/partial-crossing contracts, observed rim/correspondence records, model extension, `src/content/homeward/`, `earth-arrival/`; N04 shares views | 1,500–3,000 + 1,000–2,000 tests, **low confidence pending S6** |
| Model integration, excluding W/L/X internals | `src/model/aging.ts`, `forecast.ts`, `service.ts`, `adapt.ts`, Black Box procedures/compare; per-attempt briefing/frame use and shared-body identity | 400–800 + 300–600 tests |
| Screens, excluding shared visual system work | 2D `src/console/`, `src/view3d/`, encounter panels: charted volumes, current/archive distinction, region entry, live comparisons, stale procedure/coverage and gate cue composition | 800–1,400 + 300–600 tests; styles/components only from `src/theme/` |
| A01 gas addition | New field/loading/heating integration, flow observations and belief hypothesis, distributed torque/control tests | 700–1,400 + 500–900 tests; not approved |
| A02 distributed gravity | Extended-body force/torque evaluation consistent with P4, attitude telemetry/model treatment, independent magnitude/reference checks | 400–800 + 400–700 tests; not approved |
| A03 tether addition | S1–S3-defined capture/tether/structure state, hardware/equipment data, force/torque, release, sensors, model/console/3D | 2,000–4,000 + 1,500–3,000 tests; **placeholder budget**, no competing tether design |

The shared contracts are requests to the integrator/2G, not study-owned edits. Catalogue IDs map to existing content folders where appropriate: C02 → `gravity-range`, P03 → `inverse-wells`, N03 → `chain-link`, H01 → `homeward`, H02 → `earth-arrival`. No mass rename is needed. Geometry keys identify shared volumes, while encounter IDs identify questions/records. New physical systems are separate scope, not silently a seventh reusable system bundled into light content.

### Model and screens

The model takes each observed arrival, current telemetry and acquisition history; it never imports truth, simulator fields, world seeds, hidden overlap maps or physical objective witnesses. Preserve A4/P5: fit numbers automatically, let the player propose rule families, evaluate independent held-out observations, and retain uncertainty outside support. Learned rules can transfer without importing another body's mass/track. Keep stable host-body identity across P02/P04 or C02/A02; new-region creation must not manufacture a new body calibration or duplicate the same data.

W needs powered/coast residuals and a sensed influence estimate; L needs coverage/quality observations before it can forecast exposure/clearance; X needs observed rim motion and correspondence hypotheses before connection-aware forecasting. Gas/tidal/tether forecasts must explicitly remain unsupported until the respective observed-state and model mechanisms exist. Parameter names for these systems belong to S5/S6/S1–S3 and the integrator. Thermal/resource forecasts in pages are requested capability, not a claim the current trajectory estimator already implements them.

2D needs a 3D chart zooming between known volumes and pockets, current versus archived geometry, live processing/configuration controls, mismatched procedure preconditions, and measured approach/abort margins. C05 needs synchronized original forecast, measured trail, channel coverage and component-state comparisons. No explanatory gate text, omniscient “missing lesson” badge, generated maneuver plan or hidden pause. The camera/view can rotate freely without changing physical ship roll. Preserve early Earth visibility. X screens must use the eventual S6 partial-crossing semantics; a compelling visual alone is not a transfer implementation.

## Dependency order and alternatives

1. **Finish 2G with 2D/2F:** 3D physics, controls, sensed view, model and Beta belt/assist; test A12 across screens. In parallel, resolve X feasibility with S6 and new-system feasibility with S1–S3.
2. **3D + 3A + 3E:** whole-run identity/save/recurrence, generated geometry, shared-volume continuity, sustainable transit and a connecting-route harness. Existing Gravity range tests are not whole-expedition proof.
3. **3B W and 3C L in parallel with ship depth:** isolated survivable observation, full-ship exposure, real compensation limits and belief-supported forecasts. S5 establishes 3D field semantics first.
4. **Branch content:** P01/P02/P04/R01 and N01/N02, then P03/R02 and N03/R03. Test both directions of the cross-transfer carrying actual state. C01/C03/C04/R04 reuse the same frame.
5. **C05:** combine unchanged W/L after each is independently usable. Test four knowledge states, aborts, full-ship geometry, live screens and physically plausible bypasses.
6. **X implementation and content:** N04 tests observation-only correspondences; C06/H01/H02 share one opening state and full transfer. Test partial crossing, closure, future windows and far-side reserves before presentation polish.
7. **Whole-route balance:** both exploratory orders and practiced single branches, new seeds, current/stale evidence and actual main/RCS/energy/thermal ledgers; owner comprehension playtest.
8. **Optional additions by owner choice:** A03 once S1–S3 are viable; A01 after a drag/heating benefit check; A02 after measurable torque proof. Their order is independent of the core route. Never block A13 on an unapproved addition.

**Ambitious version:** all 23 places, both signatures and X, plus physical momentum exchange, gas braking and measurable tidal attitude behavior. **Smaller recommendation:** all twenty original questions with reusable pockets, all core route connections and X; defer A01–A03. If still smaller, defer optional experiment polish, not one of A13's branches, physical gate requirements or the finite homeward opening. Owner decides scope; this document does not remove content.

## Acceptance required before implementation claims

| Check | Reproducible evidence required from builder/harness |
|---|---|
| Seeded geometry | Same seed/content/start/commands reproduces hashes; at least 32 candidate seeds spanning specified extrema; masses/radii/laws and graph unchanged, branch draw order independent; save/load continues exactly |
| Physical admissibility | Full hull/appendage swept clearance, actual roll-held control, observed tracking, abort feasibility, peak temperatures/loads and damage for each accepted seed. Failed generation rejects a seed combination explicitly, not via mid-flight repair |
| Whole-run continuity | Both cross-transfer orders and two practiced single branches reach H02 carrying identical end/start physical state across boundaries; true resource ledgers, transit aging and frame/epoch transforms checked |
| A6 | Physical Beta assist and belt crossing on C02 exits including A02 route; intentional powered/belt bypass attempt cannot satisfy the authored physical objective merely through departure speed |
| A9/A10 | Loss or Recall in early/late/pocket/partial-X states returns C01 with a new run seed and retained acquired archive; no same-region checkpoint. No record counted twice after reload/replay |
| A12 | Every visible screen advances time/resources at ≥1× inside an encounter; hidden-page hold exposes no mutable controls; alert reduces warp; healthy prep coast has zero required propellant use and stable electrical/thermal state in a long-duration and equilibrium check |
| Tenth-run pressure | Use all prior rules, local calibration and saved procedures; remove fresh measurements and report actual degraded margin. Then restore fresh data and demonstrate survivable execution. No hidden rule changes |
| Branch learning/gate | Four knowledge states and both cross-transfer arrivals; informative safe probe/abort; blind-lattice seeded sweep with stated sample count and observed result, no invented survival probability |
| No truth leaks | Unobserved fields/openings/objects absent from belief/render/forecast; frozen forecasts unchanged after fitting; chart and Black Box retain original acquisition conditions/gaps |
| Optionality | Every detour has a forward rejoin; resolved questions can be skipped; zero-loss learning and early physically valid Earth sighting remain possible |
| X | Moving frames, boundary/partial-crossing/closure cases per S6, no duplicated mass or reset stores, consistent outgoing pose/motion, future windows independent of discovery |
| New additions | Independent momentum/energy/load/magnitude checks before gameplay; if tidal torque or gas benefit is too small at the actual scale, defer rather than exaggerate it |

The 32-seed starting suite is a coverage recommendation, not proof over a continuum. Add adversarial combinations and failures found during play. Detailed region pages specify informative failures and local tests. **Only document/graph/arithmetic/link checks run in S4**; no `npm test`/build is required for documentation and a standalone standard-library checker. No gameplay, render or human learning result is claimed.

## Questions for the owner (one decision each)

1. **Volume allocation:** adopt twelve core volumes with hosted pockets? Recommend yes; it preserves distinct landmarks and all original questions while avoiding twenty compulsory rooms. Smaller scope loses optional scene differentiation first.
2. **Pacing:** accept exploratory 12–14-entry first contact while shorter informed routes have 9–10? Recommend yes; A13 and evidence-based optionality take precedence over a universal count. Treat the minute ranges as playtest targets, not deadlines.
3. **Shared X:** should Petal and the moving homeward passage use one connection system? Recommend yes, conditional on S6's specific moving-frame/partial-crossing design and tests; don't approve an undefined teleport implementation.
4. **Borrowed Spin:** invest in an optional prototype after S1–S3? Recommend yes if capture, load, hardware and model are viable; retain a no-tether N03→C04 route. Study enthusiasm is not hardware approval.
5. **Countercurrent:** add gas loading/heating physics now? Recommend defer until core-route reserves are measured; then prototype only if net braking benefit is appreciable with real control/thermal costs.
6. **Tidal Orchard:** add extended-body gravity now? Recommend magnitude verification first; defer playable content if the ship-scale effect is too small or suppressed by roll hold. No force multiplier.
7. **Earth payoff:** use controlled approach/contact, without landing or an unexpected final obstacle course? Recommend yes, preserving the exact surviving ship and any valid earlier Earth view. Resolve the transition to Earth-side dynamics with S6/integrator.

Roll remains held under A11 and Recall remains whole-run under P8/A13; neither needs reapproval to complete S4. If sustainable prep cannot be achieved with supported hardware, report the concrete shortfall to the owner instead of silently adding a clock or resource exemption.
