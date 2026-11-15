# Phase 3 — Systems depth, signature encounters and expedition frame

**Status:** refreshed launch text. The integrator applies this file at the Phase 2 gate and may split its sections into individual prompts without changing their ownership. Launch a section only after its listed inputs and path transfers have landed. An open S11 question blocks the dependent behavior, not unrelated work; a study recommendation is not an owner answer.

Read first: `docs/CREATIVE_BRIEF.md`, all of `docs/DECISIONS.md`, `docs/build-plan/README.md` § Conventions, `src/contracts/README.md`, the final Phase 2 handoffs, `docs/design/expedition.md`, the relevant `docs/design/regions/` pages, `docs/handoffs/s1.md`–`s12.md` where present (S4 is `S4.md`), and `docs/studies/s11/queue.md`. S7 was withdrawn; S8's completed handoff is an input when it lands, not evidence already available. Follow the S14 lane check in `docs/studies/s14/lane-check.md`.

For every section:

- Work in `.worktrees/<lowercase ID>` on the named branch; commit there. The owner launches threads and the integrator merges. Write only the listed paths and `docs/handoffs/<ID>.md`, using the handoff template. Colocated tests and documentation belong to the same owner as their module; a single-file grant does not grant its siblings.
- Treat A8–A13 as direction: full 3D translation, sensing and quaternion attitude, yaw/pitch with roll held, charted-only MAP, existing control room and four views. Use P4 with one shared `r0 = 1,000 km`. Preserve P2 determinism, P7 nongravitational accelerometry and P11 truth/belief separation. UI uses `src/theme/` tokens and primitives.
- A12: every accessible view, fit, comparison, configuration edit and forecast request leaves an active encounter running at least at 1×. New cautions/warnings drop warp to 1×; advisories do not. Hidden-page hold allows no observation or edits. Open transit runs continuously and supports safe preparation for as long as the player needs. The Gravity range's initial ENTER hold is its existing exception, not the expedition's transit implementation.
- Preserve A4/A5/P6/P10: fit numbers from acquired evidence, let the player propose/test/adopt rules, retain independent held-out attempts and original issued forecasts, and disclose unsupported geometry. The model forecasts a player plan; it neither recommends nor executes a solution. Shared-law radial support transfers; local geometry and body masses still need measurement.
- Extend the merged baseline. Do not redo 2G's conversion, references, attitude controller or ship-step optimization, 2C's recorder/model/IndexedDB implementation, 2F's Gravity range/core loop, or 2D's delivered screens and pending Phase 2 fixes. Until the integrator records release of a path, its Phase 2 owner keeps it. Requests to retained owners are dependencies, not permission to edit their files.
- Leave `npm run check` and `npm run build` passing. Report references, seeded commands, margins and limits separately from human playtest findings. Label non-obvious claims per Convention 4. New systems from S1–S6 require recorded owner choices; optional gas, tides and tether are not assigned by these prompts (S11 Q11–Q21).

**Shared interfaces before dependent implementation:** the integrator owns contracts after 2G releases them. Retained model owner 2C owns all of `src/model/` and `src/blackbox/`; retained game owner 2F owns core-loop/environment/composition glue outside the new 3D folders. Request and agree field observations/support, swept component exposure and event chronology with those owners. Missing interfaces block end-to-end acceptance; do not bypass them with truth-backed UI or a second recorder/solver. The COMMIT clock hold and remaining 3D integration are Phase 2 dependencies to reconcile under A12, not new assignments to 3D or 3F.

---

## 3A — Power, thermal and equipment condition

**Thread:** GPT/Codex · **Branch:** `p3/3a-power-thermal`

**Owns:** `src/ship/power/`, `src/ship/thermal/`, `src/ship/condition/`, `src/ship/config/`, `src/ship/massprops/`, `src/ship/propulsion/`.

**Inputs:** final 2B/2G ship and baseline; 1C engineering couplings; Phase 2 playtest; S5 component-effects/interface specification; 3C's agreed exposure products. Start only after 2G releases these paths.

**Goal:** extend the operating depth needed by the power branch, lattice damage and sustainable transit.

- Build the remaining thermal network depth: pumped transport, exchangers, deployment/pointing effects, heaters, freeze/overheat consequences and persistent component faults. Reuse existing finite storage, radiative rejection and power/heat ledgers.
- Extend existing battery/protection/shedding/cross-tie behavior only where the branch needs additional operation. Protection reset is deliberate and distinct from repair; redundancy uses real surviving hardware. Expose missing commands through the integrator and 2F, not another string convention.
- Add cumulative component condition and radiation consequences under the chosen Q07 exposure policy. Apply susceptibility once; preserve off-state accumulation, trips versus permanent damage, severe-exposure chronology and resulting loss of power/control. No random survival roll or universal hit counter. Emit `condition-changed` with the model's equipment IDs and reported condition so A5 aging consumes actual evidence.
- Use the final 3D ship's same intermediate deployment geometry for clearance, inertia, power and cooling. Preserve jammed/asymmetric states. Request ship-root wiring, baseline/data changes and any simulation angular-momentum correction through their retained owners; do not rewrite them here.
- Demonstrate a healthy illuminated low-load transit configuration with balanced generation/consumption and stable heat, without obligatory attitude propellant use or a life-support consumable clock (A12; P14 owner items 1–2). Do not fake it with resource exemptions. Report a concrete shortfall to the integrator if the actual equipment cannot sustain preparation.
- Publish component failure signals and the physical consequences needed by 2F's loss policy; do not declare every empty tank an automatic loss or take over core-loop loss handling.

**Checks:** electrical/thermal/mass ledgers; deliberate reset and damaged redundancy; exposure partitioning and severe events within a tick; condition-to-calibration aging; partial deployment; deterministic save/resume and sustainable transit. Coupled checks wait for the game integration seam.

**Open dependencies:** Q07 for exposure aggregation; Q01/Q02 with 3B if field response affects ship force/torque. No tether kit is authorized by Q11–Q19 being listed. **Scope basis:** 2B already built baseline buses/thermal storage; 2G already built deadbands, slew limits and geometry/mass memoization. The new depth follows A5/A12, S4 and S5, not the obsolete 2F optimization request.

## 3B — Inverse Wells

**Thread:** Claude · **Branch:** `p3/3b-wells`

**Owns:** `src/sim/fields/wells.ts`, `src/sim/fields/wells.test.ts`, `src/content/inverse-wells/`, `src/view3d/fields/wells/`, `src/console/encounters/inverse-wells/`.

**Inputs:** brief §7; final 3D simulation/ship; S5 wells and model/interface study with independent vectors; S4 P03 Well Garden and R02 Hinge pages; the current estimator spec; recorded answers to S11 Q01/Q02/Q04/Q05. Field/encounter UI subtrees must be released by 2D before edits.

**Goal:** deliver P03 and its reusable 3D well response, with an honest evidence path through the retained model owner.

- Reverse only the radial component of delivered propulsion inside the selected influence; preserve both tangential directions, ordinary gravity and existing coast velocity. Ordinary propulsion returns outside. Q04 selects the profile and dimensions; Q05 selects overlap policy. If overlaps are approved, require order-independent composition and independent overlap vectors before authoring them. A default separated fixture is not an answer to Q05.
- Block sensor/fit semantics on Q01 and additional attitude-torque behavior on Q02. Test the selected semantics together with 3C and 2C; P7 alone does not decide this fictional sensor response. Account for field-added/removed mechanical work while charging ordinary propellant costs; it does not replenish fuel, charge or heat by default (S5).
- Supply observations and radial/two-tangent/coast/outside experiment cases to 2C for the region-response extension. The initially ordinary model forecasts the player's burn incorrectly; it never recommends the burn. Local geometry must be measured even with a carried rule. Q03 determines whether distinct completed experiments can support same-run adoption; otherwise use distinct existing attempts and permit manual learning without a death requirement.
- Author P03's ordinary forward exit and optional P03 ↔ N03 cross-transfer arrivals with the actual surviving ship. Long narrow funnels are belief-side instrument conventions, not optically visible truth. Leave R02 content to 4A and C05 combination content to 4C.
- Provide nondestructive investigation, a measured abort and finite exterior alternatives. Recheck roll-held control, fresh geometry, worn actuators and timing at boundaries; knowledge helps without making execution automatic.

**Checks:** independent selected-law vectors and convergence; coast/tangent invariance; off-axis force/torque/sensor agreement; fuel/work ledgers; held-out model recovery and frozen forecasts; acquired-only surfaces; both branch-order arrivals, full-ship clearance, informed and stale-data flights through 3E.

**Scope basis:** A11/A13 and S5 replace planar assumptions. Keep the existing `wells.ts` filename; S5's proposed `inverse-well.ts` is not a second implementation. Remove the old model-file grant: 2C's actual extension/dynamics files are shared, so model integration is a separately agreed dependency, not concurrent ownership.

## 3C — Chain Link Fence

**Thread:** Claude · **Branch:** `p3/3c-lattice`

**Owns:** `src/sim/fields/lattice.ts`, `src/sim/fields/lattice.test.ts`, `src/ship/sensors/`, `src/content/chain-link/`, `src/view3d/fields/lattice/`, `src/console/encounters/chain-link/`.

**Inputs:** brief §6; final 2G geometry/sensors; 1C radiation classes; S5 lattice/interface study and vectors; S4 N03 Unseen Cathedral and R03 Missing Room pages; Q06/Q07 answers and agreed contracts. Start after the relevant 2G/2D paths are released.

**Goal:** deliver N03's finite 3D lattice and powered observations on existing hardware.

- Build finite tilted layers/strands with clear opening centers and steep exposure near strands. Sweep each actual component through translation, rotation and intermediate deployment. Q07 chooses the component aggregation; an alternative must still protect exposed appendage tips. Send raw exposure integrals/threshold intervals to 3A through the agreed game seam; 3A owns susceptibility and damage.
- Keep chronological power/trip/thrust consequences within a tick. An average intensity must not erase a brief severe contact or permit a disabled actuator to keep firing. Coordinate integration with 2F and simulation hooks with the integrator; neither shared file becomes a second 3C-owned file.
- The unexplained processing channel exists before loss and uses installed sensors and actual power/recording/heat. Q06 selects observation reconstruction or explicitly noisy patches. Either carries uncertainty, coverage, acquisition interval and lineage; absent/low-power/occluded data means unresolved space, never a safe hole or exact truth mesh. 2C owns belief reconstruction/forecast integration; 3C owns sensor acquisition and its local display plugins.
- Preserve the final 3D camera/IMU/star-tracker implementation. Add reported-sigma versus true-condition behavior only where still missing after 2G: reported sigma uses believed condition, draws use true condition, and unreported damage can appear as residuals. A typed camera scene, if still missing, is a contracts/game request, not a repeat conversion task.
- Author N03's direct and cross-transfer entrances, forward exit and real finite-field exterior route; leave R03 to 4B. Show whole-ship uncertainty and the first threatened component using sensed evidence. An attentive player can investigate without dying; repeated passages still require acquisition, configuration and control.

**Checks:** S5 independent clearance/exposure cases including COM-clear/radiator-contact; intermediate/jammed appendages; low-power and stale/occluded observations; trip/damage ordering; no-truth-leak tests; nondestructive investigation and abort; informed versus blind seeded traversal rates with actual electrical outcomes and bypass costs, through 3E. A geometry fixture alone does not establish rare blind survival.

**Open dependencies:** Q06/Q07, plus Q01 when sharing well-response measurements and Q03 for any new rule-validation lifecycle. **Scope basis:** A11/A13, S4/S5; sensor ownership is retained from the original split, while whole-volume exposure replaces a flat footprint.

## 3D — Expedition structure and recurrence

**Thread:** Claude · **Branch:** `p3/3d-expedition`

**Owns:** `src/game/expedition/`, `src/game/recurrence/`, `src/game/procedures/`, `src/game/save/`.

**Inputs:** merged 2F/2G loop and `EncounterSetup`; 2C archive/store/carried-calibration API; A9–A13 and P8/P9; S4 expedition/regions; Q03 and Q08–Q10 status. Agree run/frame contracts before dependent code. Core session, environment, game-belief bridges and `src/app/game.ts` remain 2F's.

**Goal:** add the multi-region run frame around the existing loop and archive.

- Implement A13's forward graph: C01 → C02 → C03; power P01 → P02 → P03 → P04 or sensing N01 → N02 → N03; then C04 → C05 → C06 → H01 → H02. Preserve optional P03 ↔ N03 cross-transfer and forward-rejoining investigations, with no required revisit, death, branch-visit flag or compulsory detour. Optional A01–A03 remain unavailable unless separately approved and supplied. Use stable IDs and existing `gravity-range`, `inverse-wells`, `chain-link`, `homeward`, `earth-arrival` folder mappings. Q09 controls displayed names.
- Separate route, volume and display-label data so either Q08 volume allocation works. Shared places have one body identity and continuous physical state; entering a pocket does not clone its host or reset phase. Coordinate new content through providers from 3B/3C and Phase 4; no duplicate encounter implementations or fabricated complete-run claim while providers are absent.
- Keep a continuous run epoch and frame transforms, per-volume persistent state and A10 seeded geometry/noise. Record seed/content version in truth-side saves and the sensed arrival in each `AttemptStart.briefing`. Branch choice must not change another stream's draws. Rules, massive-body masses/sizes and topology stay fixed; archival coordinates never become the new run's obstacle map.
- Extend recurrence from 2F's single-encounter reset to whole-run loss/Recall at C01. Reset all physical inventory/worlds only then. Retain acquired records up to loss, original forecasts, tests/adoptions/revocations, charted leads and procedures through 2C's archive. Between regions carry actual motion, fuel, charge, heat, condition and configuration without repair/refill.
- Record actual transit time/use/condition changes in `AttemptStart.transit`; compose priors using `carriedCalibration(state, transit, { carrying })` and adopted values/sigmas. Coordinate the 2C update-3 per-attempt carried-prior caveat with 2C; do not assume every branch history has the same arrival calibration or transit.
- If Q03 approves independent completed experiments within a live encounter, implement only game-side lifecycle coordination after 2C's record contract lands: unique sample ownership, no scored samples used in fitting, no physical/time reset. Otherwise keep existing distinct-attempt validation. Manual learning remains possible either way.
- Extend procedure matching/adaptation and versioned whole-run save/resume using 2C's existing procedure archive and IndexedDB store. No parallel localStorage/procedure database or new Black Box. Save physical and evidence state consistently; restored runs retain epochs, RNG, pending commands and event cursors. Exact matching replays; changed conditions require player edits.
- Supply charted lead/coverage data and explicit safe-transit/encounter boundaries to the existing screens. A12 preparation must be a demonstrated sustainable coast with 3A, not the range's held arrival copied to every region. Consume the physical C02 exit from 2F; report the A6 belt/bypass discrepancy to that owner, never solve it with a visit token.

**Checks:** both single-branch routes and both cross-transfer orders with delivered providers; loss/Recall from a later region; new-seed versus same-seed replay; continuous shared-volume/pair phase; actual carried resources/priors; archival alignment; save/resume mid-transit; procedure mismatch; Q03 independence if adopted. Full-route claims await Phase 4 content.

**Scope basis:** A9–A13/S4 replace 1F branch-return loops. Existing recorder, IndexedDB and core loop remain their owners' implementations; 3D adds expedition coordination only.

## 3E — Playability harness

**Thread:** GPT/Codex · **Branch:** `p3/3e-harness`

**Owns:** `tools/harness/`.

**Inputs:** final 3D sim/ship/model/game APIs; content authors' supported envelopes; S4–S6 acceptance cases; S8's independent results when available. Ask the integrator to add the single `npm run` entry in `package.json`.

**Goal:** test real flights and evidence/resource margins, distinguishing numerical reference checks from human understanding.

- Build one deterministic runner using production APIs, not a replacement simulator. Record source/content version, seed, controls, input knowledge and acquisition schedule. Separate fast truth-side feasibility probes from real-recorder/model learning runs; do not call an omniscient script player evidence.
- Report whole-ship swept clearance, first failed margin, per-component exposure/condition, main/RCS propellant, charge/generation/load, heat, control authority, observation coverage/freshness, forecast horizon and outcome. Keep commands and machine-readable results beside Markdown reports under this folder.
- Check informed routes, worn arrivals, roll-held reachability, informative aborts and rejected seeds. Compare blind lattice traversals using actual dose and damage; search ballistic/exterior/burn-through bypasses of finite W/L fields. Accept physically valid outcomes and report when C05's intended two-lesson gate is not established. No invisible wall or knowledge flag may fix a failed geometry test.
- Run A5/A9 cakewalk checks with all retained rules, calibration and saved procedures but no new measurements, then compare fresh-data flights. Report margin and uncertainty honestly; comfortable carried-only success is a content/balance finding requiring review of the intended new unknown, not permission to erase knowledge. Send proposed aging/hedge/horizon tuning to 2C/integrator; do not edit model settings or reference assumptions.
- Chain actual ship states through both branch routes and both cross-transfer orders, including preparation and optional investigations when present. Build the runner now; complete arrival-to-Earth expert runs only when Phase 4 providers exist. P14 needs measured remaining main/RCS, power/thermal/control margin, not an invented reserve percentage or resource tax.
- Add A12 checks for every accessible screen/operation through integration fixtures and sustainable open transit; an active COMMIT hold remains a Phase 2 blocker to report. Consume S8's admitted C02 seeds and vectors when merged; do not redo its independent slingshot study or claim absent results passed.
- As 4D lands, add full moving-opening/partial-crossing and surviving-state Earth cases supplied by S6 and approved Q22–Q28 choices. Optional tether/gas/tidal tests require separately approved implementations, not new systems hidden in the harness.

**Checks:** exact replay through save/resume and warp batching; complete reproducible reports; both successful and negative control runs; independence from truth in any player-facing forecast; reference/convergence results at stated resolution. Human comprehension and final difficulty remain owner playtests.

**Scope basis:** A5/A9–A13, S4/S5/S6/S8 turn the old generic sweeps into 3D route, continuity and evidence checks. `tools/harness/` remains the only writable implementation lane.

## 3F — Console and view, version 2

**Thread:** Claude · **Branch:** `p3/3f-console-v2`

**Owns:** `src/console/` except `encounters/`; `src/view3d/` except `fields/`.

**Inputs:** final 2D handoff and owner playtest; merged 3A/3D state contracts; 3B/3C plugins; S4/S5; the current theme and visual direction. **Start only after 2D explicitly relinquishes these two subtrees.** 2D retains `src/theme/`, `prototypes/`, visual-direction assets/docs and `src/app/` except `game.ts`. Request app mounting and theme changes there.

**Goal:** extend the existing control room for new systems and the expedition.

- Reuse delivered MISSION/PLAN/MODEL/BLACK BOX/SYSTEMS, SHIP/MAP/FLIGHT, calibration freshness, validated spans, debrief/compare and loss/Recall behavior. Leave S9's pending navigation/focus/draft/warp/readiness repairs, 2G fit-coverage messages and 2D's pending covariance rendering with their Phase 2 owner. Do not recreate or relabel them as v2 work.
- Wire new thermal/condition/protection histories, configuration consequences and field coverage into existing instruments. Compose 3B/3C-owned encounter panels and field renderers through their APIs; do not edit those subtrees. New views show measured uncertainty and the whole moving ship, including trailing/partly deployed components.
- Extend MAP from the delivered range chart to 3D's sensed multi-region leads, physical connectors and volume zoom. Keep proposed names configurable (Q09) and volume allocation independent (Q08). Distinguish live geometry from explicitly aligned archived attempts and missing coverage from clear space.
- Extend Black Box comparisons to new field/equipment evidence, recorded first loss of margin and run/transit provenance. Use 2C's reports; never expose truth as a diagnosis or change frozen forecasts. Q03 provenance is shown only after its agreed lifecycle exists.
- Preserve A8 composition, Night Watch, yaw/pitch with roll held and A12 live operation in every view. Safe transit permits deliberate preparation through the running game, not a modal pause.

**Checks:** browser operation of new controls, keyboard/focus and readable uncertainty for each new panel; no hard-coded styling or truth imports; frame-consistent current/archive overlays; active flight through view/fit/configuration changes; whole-ship field presentation from acquired data. Existing Phase 2 screen checks remain regression inputs.

**Scope basis:** 2D already delivered most of the old v2 list (handoff update 4); A8/S4/S5 require incremental field/expedition wiring. The explicit transfer prevents two screen owners.

**Gate:** integrator merges the ready sections and required retained-owner changes; checks/build pass; the owner plays P03 and N03, including live-time investigation, an informative abort and carried-knowledge repeat flight. Record unresolved Q dependencies and missing integrated evidence; do not claim a full expedition before Phase 4.
