# S14 — File ownership and Phase 2 exclusion check

**[ASSUMED] Recommendation:** apply the explicit grants in the three replacement prompts, with the path releases below, instead of overlapping phase-wide folder claims. **[ESTABLISHED: build-plan Convention 2]** A request is not write permission. One file has one active writer, even if two changes affect different fields.

This is a plan audit, not evidence that these transfers have happened. The input snapshot is `cdbaa751b988334b4c7efb530ac0cf17208ea932`; 2G's committed handoff was inspected read-only at `6996db120426b15d1475f0dbeca1d62838ad6781`. S14 itself edits only its study folder and `docs/handoffs/s14.md`; the integrator applies the candidate prompts and ownership-map updates.

## Transfer rules

1. **While 2G is converting:** its temporary ownership of contracts, math, sim, ship, model/Black Box, game/content, baseline/references and `src/app/game.ts` remains exclusive. A candidate future grant cannot start a second writer. Its committed references/ship work and unfinished model/game work are both excluded from later assignments.
2. **After the verified 2G handoff:** integrator records each path's release. Model/Black Box return to 2C, core game/range to 2F, simulation core to 2A, ship-root glue to 2B; new 3A/3B/3C/3D scopes are carved out explicitly. Contracts/data/reference ownership returns to the established integrator/reference lanes. No worker uses this study to edit a still-owned file.
3. **Screen handover:** 2D completes its Phase 2 screen work first. Only then may 3F take generic console/view subtrees. Encounter and field subtrees are reserved to their named authors. 2D keeps theme, visual direction, prototype and app shell; 5B receives only the new onboarding subtree after a separate explicit release. An unresolved 2D repair does not become an unannounced 3F assignment.
4. **Later source fixes:** 3A–4E retain their modules across subsequent phases. 5A routes corrections to those owners; if it must edit one itself, record an exact-file handover and stop the former writer first. “Balance,” “performance” or “related panels” is not a wildcard grant.
5. **Release documents:** S13 builds the initial licence/NOTICE/README and new public notices. Its `package.json` licence edit reserves that entire file while active, including against 3E's requested npm-script addition. After S13 merges and explicitly closes out, 5A owns subsequent release maintenance. 5C never edits root README or public/legal files.
6. **Submission:** 5C-0 is complete reference material, not a concurrent worker. 5C is the one `docs/submission/` writer. 5D only writes its named report. Every other section owns only its own handoff; `docs/handoffs/` is never a whole-directory grant.

## Exclusive writable grants in the replacements

Paths ending `/` grant descendants. Brace sets below abbreviate the explicit directory lists in the prompt, not arbitrary expansion or new IDs. Colocated tests/docs follow their directory; the two field-file tests are granted explicitly. Each row also owns `docs/handoffs/<ID>.md`, except the inactive 5C-0 row and 5D whose report is already its only path.

| Owner | Exclusive files/subtrees | Boundary |
| --- | --- | --- |
| **3A** | `src/ship/{power,thermal,condition,config,massprops,propulsion}/` | No sensors, ship-root files, baseline data or sim integration. |
| **3B** | `src/sim/fields/wells.ts`, `src/sim/fields/wells.test.ts`; `src/content/inverse-wells/`; `src/view3d/fields/wells/`; `src/console/encounters/inverse-wells/` | P03 only; no model files, R02 content or shared field registry. |
| **3C** | `src/sim/fields/lattice.ts`, `src/sim/fields/lattice.test.ts`; `src/ship/sensors/`; `src/content/chain-link/`; `src/view3d/fields/lattice/`; `src/console/encounters/chain-link/` | N03 only; no damage implementation, belief reconstruction, R03 content or shared field registry. |
| **3D** | `src/game/{expedition,recurrence,procedures,save}/` | Run coordination only; no core session, game-belief adapters, Black Box store or content folders. |
| **3E** | `tools/harness/` | No root npm script, content-owned plans or model/reference tuning. |
| **3F** | `src/console/` **excluding all** `encounters/`; `src/view3d/` **excluding all** `fields/` | No theme, app shell or plugins. Includes generic panel/plugin mounting in its own folders only. |
| **4A** | `src/content/{listening-shelf,sunward,back-of-the-world,red-wall,hinge}/`; matching `src/console/encounters/` folders | Five named content/panel sets; reuses 3B's P03/W. |
| **4B** | `src/content/{shadow-observatory,far-aperture,petal-gallery,missing-room}/`; matching `src/console/encounters/` folders | Four named sets; reuses 3C's N03/L and 4D's opening renderer/API. |
| **4C** | `src/content/{unfamiliar-sky,lantern-field,stillwater,braided-crossing,crooked-ship}/` | Reuse data/small scripts; no generic UI or new physics. |
| **4D** | `src/content/{turning-rim,homeward,earth-arrival}/`; matching `src/console/encounters/` folders; `src/sim/openings/`, `src/game/openings/`, `src/view3d/fields/openings/` | Shared versus separate architecture waits on Q22; either has one implementation file owner. No generic sim/game/ship/model files. |
| **4E** | `src/audio/` | No shell mounting/settings UI or release-credit files. |
| **5A / integrator** | `docs/DECISIONS.md`, `docs/build-plan/`, `src/contracts/`, `data/ship-baseline.json`, `package-lock.json`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `index.html`, `.github/workflows/deploy.yml`; **after S13 close-out:** `package.json`, `README.md`, `LICENSE`, `NOTICE`, `public/` | Requires 2G release where applicable. Release actions do not grant all worker source. Source and generated distribution are distinct; verify generated `dist/`, do not edit it as source. |
| **5B** | `src/app/onboarding/` | Exact new subtree released from 2D; no broad settings or performance-edit grant. |
| **5C-0** | None — completed input | Historical `docs/handoffs/5C-0.md` is read-only for these prompts. |
| **5C** | `docs/submission/` | No root README, legal/public files or edits to S10/S12 source studies. |
| **5D** | `docs/handoffs/5D.md` | Read-only browser/application; fresh report branch only. |

The original `src/model/extensions/thrust-response.ts` grant is removed. 2C owns the existing shared `dynamics.ts`, `engine.ts`, `extensions.ts`, `forecast.ts` and any new belief modules. Keeping the hypothetical subfile as 3B-owned would not authorize its required shared edits and would create competing model writers. S5's `inverse-well.ts` is an alternative proposed filename; these prompts preserve the original `wells.ts` grant and do not create both.

## Complete original catalogue partition

Names below identify S4 pages, not answers to Q09. Volume allocation Q08 does not change file ownership. Shared host definitions live behind 3D's provider/identity interface; content authors reference them rather than author duplicate bodies.

| Catalogue ID | Proposed name | Content folder | Sole owner |
| --- | --- | --- | --- |
| C01 | Unfamiliar Sky | `src/content/unfamiliar-sky/` | 4C — new expedition place, not a rewrite of range preparation/onboarding |
| C02 | Twin Deeps | `src/content/gravity-range/` | 2G during conversion, then 2F; no new grant |
| C03 | Lantern Field | `src/content/lantern-field/` | 4C |
| C04 | Stillwater | `src/content/stillwater/` | 4C |
| C05 | Braided Crossing | `src/content/braided-crossing/` | 4C |
| C06 | Turning Rim | `src/content/turning-rim/` | 4D |
| P01 | Listening Shelf | `src/content/listening-shelf/` | 4A |
| P02 | Sunward | `src/content/sunward/` | 4A |
| P03 | Well Garden | `src/content/inverse-wells/` | 3B |
| P04 | Back of the World | `src/content/back-of-the-world/` | 4A |
| N01 | Shadow Observatory | `src/content/shadow-observatory/` | 4B |
| N02 | Far Aperture | `src/content/far-aperture/` | 4B |
| N03 | Unseen Cathedral | `src/content/chain-link/` | 3C |
| N04 | Petal Gallery | `src/content/petal-gallery/` | 4B |
| R01 | Red Wall | `src/content/red-wall/` | 4A |
| R02 | Hinge | `src/content/hinge/` | 4A |
| R03 | Missing Room | `src/content/missing-room/` | 4B |
| R04 | Crooked Ship | `src/content/crooked-ship/` | 4C |
| H01 | Passage | `src/content/homeward/` | 4D |
| H02 | Familiar Sky | `src/content/earth-arrival/` | 4D |

**[DEMONSTRATED: S14 document audit]** The table has twenty distinct original IDs and twenty distinct content paths. Nineteen are assigned once across 3B/3C/4A–4D; C02 is retained by Phase 2. A01–A03 are intentionally not assigned: they require Q11–Q21 outcomes and new bounded implementation prompts. This is not a scope decision to cancel them, and no current file grant covers them.

## Phase 2 work excluded from new assignments

| Existing owner / evidence | Already delivered or currently assigned | What the refreshed prompts do instead |
| --- | --- | --- |
| **2G**, pinned handoff checkpoints and “Left to do” | 3D contracts/math, independent physics/GMAT/estimator references, translation/attitude/contact, full ship geometry/inertia, jet allocation/deadbands/slew limits and geometry caching; ring and `depart`; singular-matrix fix. Model/game conversion, window/chart/forecast-detail plumbing, hands-on feedback, ranged rocks, procedure APIs and final integrated tests remain assigned there. | Require the verified merged baseline and explicit release. No later section rebuilds these or takes an uncommitted checkpoint. 3A adds new depth; 3B/3C add fields; 3D adds multi-region coordination. |
| **2C**, handoff updates 1–3; stopped during 2G conversion | Estimation, radial calibration, held-out rule test/adopt/revoke, asteroid tracks, shared-law spans, calibration aging, original attempt briefings, frozen forecasts, Black Box recorder/archive/store/comparison/procedures. | 3D consumes APIs and coordinates whole-run state; no second recorder or database. Well/lattice/opening fits and record-lifecycle changes are separately scoped 2C dependencies, not 3B/3C file ownership or extra 2G conversion work. |
| **2D**, handoff update 4 and S9 requests | Real room and four views, hands-on shell, theme, ship inspection, MISSION/PLAN/MODEL/BLACK BOX/SYSTEMS, debrief/compare, calibration freshness/spans, initial ENTER/hidden-page/alert behavior and current-attempt coverage. S9 focus/navigation/draft/warp/evidence-readiness repairs, pending covariance and final 3D playtest remain with 2D. | 3F waits for release and adds new field/expedition state only. 5B verifies delivered repairs before new onboarding; it does not inherit the repair queue. Theme and app shell stay 2D's. |
| **2F**, handoff and current 2G game scope | Core step/session, truth-to-measurement bridge, environment/illumination, `EncounterSetup`, Gravity range, model/Black Box composition, recurrence v0 and core objective/loss evaluation. | 3D composes new modules through agreed seams; 4C supplies distinct new expedition content. C02, `src/game/session.ts`, `truth-step.ts`, environment/belief glue and `src/app/game.ts` remain retained-owner changes. No recreated loop or fabricated new range objective. |
| **2A / 2B after 2G**, original handoffs | Simulation core/field registry and ship-root step/command/state/definition wiring respectively. | New field/ship modules request minimal integration here. 3B/3C do not both edit a registry; 3A/3C do not both edit `src/ship/index.ts`. New chronological event/mass-distribution work needs explicit follow-up scope. |

## Shared-file collisions closed by the partition

- **Model:** one retained 2C owner; well, lattice and opening builders supply cases and interfaces, not overlapping edits.
- **Core game:** one retained 2F owner outside 3D's four new folders and 4D's opening folder. 3D owns run orchestration; 4D owns opening-specific orchestration; 2F mounts both.
- **Simulation:** 2A retains core/registry outside the exact W/L files and 4D's opening subtree after 2G releases them. No broad `src/sim/fields/` grant to both field authors.
- **Ship:** 3A's six subtrees and 3C's sensors are disjoint. Ship-root glue stays 2B's; data stays the integrator's after 2G. Sensor acquisition, component exposure and belief reconstruction have distinct owners.
- **Screens:** 3F's exclusions apply to every encounter/field plugin, including 4A/4B/4D additions. Generic mounting is 3F's; app mounting/theme are 2D's. 4B has no catch-all field renderer grant.
- **Harness:** 3E alone edits the runner. Each content owner writes its scripts/fixtures/reports under its own content folder; integrator alone adds the npm entry after the S13 package-file lease.
- **Release:** S13→5A is sequential, including `package.json`; 5C owns submission prose, 5D its report. No concurrent root README writer or vague settings/performance writer remains.

**Result:** the refreshed grants are disjoint under the explicit exclusions and sequential transfers. Remaining integration work is visible in [the gaps](conflicts-and-gaps.md), not disguised as permission for multiple writers. Before launching, the integrator must update the authoritative build-plan ownership map to reflect these accepted grants; S14 has not edited it.
