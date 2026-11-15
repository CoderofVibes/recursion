# Phase 4 — Forward expedition content and the homeward passage

**Status:** refreshed launch text. The integrator applies it at the Phase 3 gate. Each section starts when its actual dependencies and path releases have landed; shared opening work can precede the content that consumes it. S11 owner questions remain open until an answer is recorded in `docs/DECISIONS.md`.

Read first: `docs/CREATIVE_BRIEF.md`, all of `docs/DECISIONS.md`, `docs/build-plan/README.md` § Conventions, `src/contracts/README.md`, final Phase 2/3 handoffs, `docs/design/expedition.md`, `docs/design/encounter-template.md`, the assigned region pages, S4–S6 handoffs/studies and `docs/studies/s11/queue.md`. A11 supersedes the template's planar sentence. Use `docs/studies/s14/lane-check.md` for the exact ownership partition.

For every section:

- Work in `.worktrees/<lowercase ID>` on the named branch, commit there, and deliver `docs/handoffs/<ID>.md` from the template. Only listed paths and that handoff are writable; colocated tests/docs share the module owner. The integrator merges and owns contracts/decisions/root configuration after prior lanes release them.
- Reuse the integrated 3D sim, ship, model, core loop, archive and control room. 2C retains model/Black Box; 2F retains core game/composition glue; 3A/3C retain their ship modules; 3D retains expedition/recurrence/procedures/save; 3F retains the generic console/view after 2D's transfer. 2D retains theme/app shell. Requests to these owners are interfaces or separately scoped follow-ups, not writable ownership here. Phase 2 conversion, Gravity range and pending screen repairs stay with Phase 2.
- A8/A11: use full 3D geometry and whole-ship sweeps with yaw/pitch and roll held. All UI uses theme tokens/primitives. Field reconstructions and the chart contain acquired knowledge; the physical window may display game-produced optical light without giving the model a remote truth scene (P11).
- A12: the active encounter continues at ≥1× through all screens, fits and adjustments. New cautions/warnings drop warp to 1×; advisories do not. Only the inaccessible hidden page holds. Open transit runs and supports indefinitely safe preparation in a demonstrated sustainable configuration. Eclipse endurance and close approaches are entered encounters, not ordinary transit. Do not reproduce the Gravity range's initial ENTER hold at region boundaries.
- A9/A10/A13: advance through the authored graph without required revisits; optional detours rejoin ahead. Loss/Recall restarts the expedition with retained evidence and new seeded geometry. Carry the real ship and world epochs through all transfers without repair/refill, copied tutorial arrivals or resets of a shared host. Fix laws, massive-body masses/sizes and route structure; author admissible geometry ranges and rejection reasons, not guaranteed independent random knobs.
- Every encounter has an engineering question, useful success/abort evidence and a new unknown not answered by carried knowledge (A5). Adopted rules do not refresh local geometry. Preserve independent held-out evidence, frozen forecasts, observation gaps and player planning (A4/P6/P10). Procedures disclose mismatches; they never automatically retime. No visit, extension or death counter replaces physical capability.
- Names and volume allocation follow the eventual Q09/Q08 answers; stable catalogue IDs and folder paths below work either way. Q10 remains pacing review, not a count gate or a reason to force optional investigations. Do not import the studies' duration estimates into prompts or objectives.
- Use 3E's production runner for every authored route. Put section-specific plans, fixtures and resulting reports inside the owned content folders; request new runner features from 3E rather than editing `tools/harness/`. Report whole-ship clearance, main/RCS reserves, power/heat/condition, fresh-data versus carried-only outcomes, seed/version and aborts. Leave `npm run check` and `npm run build` passing. A study vector or scripted success is not a human playtest.

**Catalogue allocation:** 3B retains P03 in `inverse-wells`; 3C retains N03 in `chain-link`; 2F retains C02 in `gravity-range` after 2G. The sections below supply the other seventeen original catalogue entries. A01 Countercurrent, A02 Tidal Orchard and A03 Borrowed Spin are separate unapproved work (Q11–Q21); no wildcard content grant includes them.

---

## 4A — Power/thermal branch encounters

**Thread:** Claude · **Branch:** `p4/4a-power-branch`

**Owns:** `src/content/listening-shelf/`, `src/content/sunward/`, `src/content/back-of-the-world/`, `src/content/red-wall/`, `src/content/hinge/`; `src/console/encounters/listening-shelf/`, `src/console/encounters/sunward/`, `src/console/encounters/back-of-the-world/`, `src/console/encounters/red-wall/`, `src/console/encounters/hinge/`.

**Inputs:** 3A operating depth, 3B well API, 3D state/volume providers, 3E runner and S4 P01/P02/P04/R01/R02. Shared field views remain 3B/3C's; release new panel subtrees from 2D before starting.

**Goal:** P01 → P02 → P03 → P04, with optional P02 → R01 → P03 and P03 → R02 → P04; consume P03 from 3B without reauthoring it.

- P01 compares simultaneous protected-bus loads; P02 tests cooling, generation and useful pointing; P04 tests the full chosen eclipse trajectory's operating schedule. Use the existing shared sun/body shadows (A3), real output and surviving hardware. Sunward's gap is ordinary geometry, independent of X.
- R01 tests delayed internal heat response and cooldown; a warm-looking wall is not an implemented external heat source. Mesh/slab shadowing or radiating-wall physics is a separate scope request. R02 compares burns around the selected well boundary: smooth Q04 implies a possible low-authority band; another answer needs corresponding evidence/content. Do not assume S5's recommended annulus or non-overlap policy is approved.
- Accept both ordinary power-branch arrivals and N03 → P03 → P04 cross-transfer survivors, including damaged electrical equipment. Preserve shared-body identity/phase if Q08 hosts pockets together. Experiments can be skipped when relevant evidence exists; physical transit and current tracking remain.
- Use measured resource trends and supported forecasts; if the model lacks resource/attitude projections, identify that dependency instead of drawing exact promises. Successful trials and early aborts both teach. Use yaw/pitch/deployment for lighting and clearance, not compulsory manual roll.

**Checks:** complete power branch with direct and cross-transfer entries; no-trip success and recoverable protection event; hot/degraded arrivals; full-duration eclipse and physical illuminated alternative; heat carried between pockets; chosen-profile Hinge; current-state repeat procedure; safe transit and real control/thermal/fuel margins.

**Open dependencies:** Q04/Q05 for Hinge/geometry, Q03 for any claimed same-run adoption, Q08–Q10 for presentation/allocation. **Scope basis:** A13/S4 replace interchangeable return loops with a forward branch. Exact folders exclude 3B's already assigned signature encounter.

## 4B — Sensing/navigation branch and Petal Gallery

**Thread:** Claude · **Branch:** `p4/4b-sensing-branch`

**Owns:** `src/content/shadow-observatory/`, `src/content/far-aperture/`, `src/content/petal-gallery/`, `src/content/missing-room/`; `src/console/encounters/shadow-observatory/`, `src/console/encounters/far-aperture/`, `src/console/encounters/petal-gallery/`, `src/console/encounters/missing-room/`.

**Inputs:** 3C acquisition/lattice products, 3D continuity, 3E runner, S4 N01/N02/N04/R03 and S6. Petal content additionally needs 4D's approved optical-opening API and 2C's evidence support; N01/N02 need no X. Release panel subtrees from 2D before edits.

**Goal:** N01 → N02 → N03, optional N02 → N04 → N03 and N02 → R03 → N03, consuming N03 from 3C.

- N01 separates processing, pointing, exposure and coverage. N02 uses ordinary 3D parallax/occlusion to distinguish depth/motion; its name does not require an opening. R03 compares low-quality/unresolved lattice data with supported clear space, using Q06's selected sensing treatment and N03's same field instance where Q08 calls for it.
- N04 tests rival interpretations of repeated views. Keep it optional after learning and never a passage-unlock token. Q22 chooses shared versus separate opening systems; use the provider delivered by 4D, not a second solver or renderer. Petal size and optical behavior follow recorded choices, not S6's fixture as an automatic production constant.
- Keep optical correspondence and material-transfer support distinct under Q25. Fit unknowns only from acquired observations; an unused view of the same AttemptId is diagnostic, not automatically an independent A4 test. Q03 chooses the record lifecycle. Neither remote truth IDs nor exact far-side ephemerides enter the model or hologram.
- Preserve physically visible early Earth views through the game optical channel. Carry actual sensing/thermal/control limitations into N03 or the P03 cross-transfer, and provide informative aborts and roll-held viewpoints.

**Checks:** useful versus collinear baselines; equal allocation with different coverage and vice versa; worn sensors and retained gaps; optional forward rejoins; acquired-only render/model output; supported and rejected correspondence with proper evidence independence; physical Petal clipping/occlusion and early Earth visibility after its provider exists.

**Open dependencies:** Q03/Q06/Q08–Q10; N04 waits on Q22–Q25 and relevant 4D interfaces. A deferred X leaves N04 unfinished, without blocking ordinary N01/N02 content. **Scope basis:** A13/S4/S5/S6; 3C keeps N03 and 4D owns opening mechanics/rendering, replacing the old open-ended renderer grant.

## 4C — Light and combined encounters

**Thread:** GPT/Codex · **Branch:** `p4/4c-combined`

**Owns:** `src/content/unfamiliar-sky/`, `src/content/lantern-field/`, `src/content/stillwater/`, `src/content/braided-crossing/`, `src/content/crooked-ship/`.

**Inputs:** 3A systems, 3B/3C fields, 3D run/volume frame, 3E runner and S4 C01/C03/C04/C05/R04. Consume 2F's unchanged C02 provider. Request generic screen wiring from 3F and game mounting from 2F.

**Goal:** supply the remaining shared light content and C05's combined engineering passage using delivered systems.

- C01 is the new expedition arrival/preparation place and optional coast-versus-burn investigation before C02. It uses existing controls, mission design, recorder and learning tools; do not rebuild the range's arrival, ENTER flow, introductory screens or gravity-law lesson. Deliver its physical connector to the existing C02 provider through 3D/2F's agreed arrival interface.
- C03 presents measured glimmer leads to both branches without revealing the author graph. C04 prepares the actual surviving ship for C05. R04 is an optional configuration/turn rehearsal using supported deployment and depletion, not new movable modules or hardware.
- C05 physically combines the same wells and lattice, with staged opportunities to observe a missing lesson. Test wells-only, lattice-only, neither-informed and both-informed arrivals. The one-branch shortfall may motivate Recall and a different branch next run, but a skilled local investigation or valid physical solution may succeed without dying or visiting both branches.
- Search finite exterior, ballistic and burn-through routes with 3E. Preserve physically valid success; if the intended two-lesson challenge is routinely bypassed, report and revise geometry through content review, not invisible boundaries or forced failure. Keep roll-held alternatives and full moving-appendage clearance.
- Use data and small content scripts only. Shared volumes and names follow Q08/Q09; seed rejection must reflect physical/control/evidence feasibility. New gas, distributed gravity, tether, heat-source or opening physics is outside this lane.

**Checks:** C01→C02 and C02→C03 continuity; both branch choices and cross-transfer survivors; sustainable C01/C04 preparation; optional R04 skipped; C05 informative abort/zero-loss/manual-learning routes, fresh versus stale evidence, full resource ledgers and bypass attempts. Q03 limits claims about model adoption, not physical manual success.

**Scope basis:** S4 supplies concrete shared IDs for the old light-reuse wildcard. C01/C03 are new expedition content, separated from 2F's existing Gravity range and 3D's graph machinery. C06 belongs to 4D because it shares the homeward opening's epoch and state.

## 4D — Homeward passage and Earth arrival

**Thread:** Claude · **Branch:** `p4/4d-homeward`

**Owns:** `src/content/turning-rim/`, `src/content/homeward/`, `src/content/earth-arrival/`; `src/console/encounters/turning-rim/`, `src/console/encounters/homeward/`, `src/console/encounters/earth-arrival/`; `src/sim/openings/`, `src/game/openings/`, `src/view3d/fields/openings/`.

**Inputs:** approved answers to Q22–Q28 as relevant, Q03 record policy, S6 mechanics/vectors/build gates, S4 C06/H01/H02, integrated 3D geometry, 3D run/save frame and 3E runner. The integrator must land opening contracts and assign the separately scoped ship/model/core-loop integrations to their retained owners. Release new game/sim/view subtrees before edits.

**Goal:** one accountable implementation lane for opening mechanics and C06 → H01 → H02, with N04 consuming its optical API.

- Q22 determines architecture: if shared X is approved, supply one common finite-opening implementation to N04 and Passage; if separate systems are selected, define their explicit mechanics/API differences and prove consistency of each before use. 4D owns the implementation files in either case. If deferred, terminal-route completion is blocked; do not substitute a CoM teleport or claim the expedition complete.
- Q23 controls alignment windows versus literal closure. Q24 controls transmitted gravity through an empty opening; Q26 separately chooses far-side gravity. Q27 selects rim-contact consequences. Implement only recorded choices; S6's screened gravity, persistent disks, Newtonian Earth and conservative loss are recommendations, not defaults adopted here.
- Build deterministic moving/rotating frame and optical mappings, full-hull swept rim checks and coherent partial crossing with one surviving ship. Each occupied portion receives the agreed local forces once; retain one resource/thermal/electrical state. Request finite mass primitives and portion-wise ship effects from 3A, acquisition from 3C, shared step integration from 2F and belief fits from 2C. Do not import the truth solver into forecasts.
- `src/game/openings/` produces observation/optical products through the agreed P11 boundary. The physical window may show transmitted light; model and hologram receive only acquired geometry, uncertainties and support. Show physically valid early Earth observations. Q25 determines material evidence; optical resemblance alone must not silently certify a ship transfer.
- C06 and H01 use one continuously evolving pair epoch, including when unobserved or between records. C06 reconnaissance exposes entry/exit-side shortfalls; the player can wait or withdraw before commitment when physical margins allow, or Recall and choose differently next run. No mandatory branch-return journey is imposed.
- H01 success requires the entire ship and trailing appendages clear, with actual downstream reserves. Support yaw/pitch and roll held with current deployment/control limits. A face-on camera window is not a demonstrated hull-crossing opportunity. Preserve missed-window, safe-abort and partial-crossing save/replay behavior.
- H02 implements the eventual Q28 payoff scope using the depleted/damaged ship. Controlled approach/contact, a larger landing task or simpler arrival each needs its own recorded scope and honest supporting observations; do not silently choose among them. Neither an Earth texture nor a new arrival state establishes return.

**Checks:** independently reproduce applicable S6 frame/force limits and vectors, then rotating/deploying actual hulls, trailing-part contact, partial retreat, all-near/all-far limits, local-force accounting, observation-only fits, Q23/Q27 edge cases, partial save/replay, moving-window flights and worn survivors from both branch orders. Verify far-side needs are observable before commitment and complete-route reserves through 3E. Reference fixtures alone do not pass the gate.

**Scope basis:** S4/S6 and S11 Q22 expose an unowned prerequisite in the old prompts. The new opening subtrees put mechanics and its shared renderer under 4D while leaving contracts, generic sim/ship/model/game integration and 3D persistence with single retained owners. This allocation does not approve shared X or settle Q23–Q28.

## 4E — Audio and feedback

**Thread:** GPT/Codex · **Branch:** `p4/4e-audio`

**Owns:** `src/audio/`.

**Inputs:** sensed event stream from the integrated game, current UI conventions, A7/A8/A12, S10 provenance requirements and A14. Request app mounting from 2D, mute/settings presentation from its current screen owner and any missing event contracts from the integrator.

**Goal:** restrained synthesized Web Audio cues for sensed equipment state, alerts, contact/exposure, forecast divergence, Black Box and recurrence.

- Keep audio quiet by default with a mute API. Follow actual sensed events and distinguish unsupported forecasts from observed divergence; no cue reveals an unseen strand, correct opening, hidden fault or unobserved loss cause.
- Preserve visual equivalents and reduced-motion/accessibility behavior; sound is never the only safety-critical cue. Audio initialization or settings must not pause an encounter. Respect the hidden-page policy and avoid replaying stale alerts on return.
- Prefer project-made synthesis. Any external audio must have documented provenance and redistributable terms; supply credits/AI metadata facts to 5C/S13 or their successor, without editing their files or relicensing third-party material under A14.

**Checks:** mute and browser audio lifecycle, sensed-event ordering/deduplication, no hidden-truth cues, visual equivalents, loss/Recall and view changes without altering deterministic gameplay. Verify notices for any shipped assets.

**Scope basis:** original audio ownership retained; P11/A12 and S10/A14 add evidence, live-time and distribution constraints.

**Gate:** merged checks/build and reproducible full-route reports pass; the owner plays a complete run through Passage to the selected Earth payoff. Check both branch/cross-transfer histories with actual surviving state, retained-knowledge repeat pressure and safe preparation. An unresolved opening implementation or missing provider remains a stated gate blocker; optional-system scope stays with the owner.
