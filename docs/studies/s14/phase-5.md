# Phase 5 — Balance, release and submission

**Status:** refreshed launch text. Finalize the launch inputs at the Phase 4 gate against the release candidate and actual owner playtests. This file supplies work and evidence gates; it imports no study duration budgets or event schedule into builder prompts.

Read first: `docs/CREATIVE_BRIEF.md`, all of `docs/DECISIONS.md`, `docs/build-plan/README.md` § Conventions, final Phase 2–4 handoffs, the 3E full-route reports, `docs/handoffs/5C-0.md`, S9/S10/S11/S12 handoffs and studies, and S13/S15 handoffs when delivered. Consult `docs/studies/s14/lane-check.md` and `docs/studies/s14/conflicts-and-gaps.md`. S7 was withdrawn; S8/S13/S15 results must be checked at launch rather than assumed complete.

Every active section writes only its listed paths and `docs/handoffs/<ID>.md` from the template. Worker branches use `.worktrees/<lowercase ID>`; commit there and let the integrator merge. 5A is the main-session exception. 5C-0 and 5C are successive scopes of the same lane, never concurrent writers. Other owners keep their files until an explicit transfer; “polish” and “performance” do not grant repository-wide edits.

Preserve A8–A13: full 3D, yaw/pitch with roll held, actual acquired knowledge, whole-run recurrence, fixed laws/masses/sizes with seeded geometry, forward branches and surviving ship state. A12 applies to every accessible screen and operation: live encounters run at least at 1×, new cautions/warnings drop warp to 1×, advisories do not, and hidden-page hold permits no access. Open transit runs with sustainable safe preparation. Do not turn introductory or accessibility features into a tactical pause or a mandatory death. Preserve frozen forecasts, support limits, independent held-out tests and player-authored plans (A4/A5/P6/P10/P11).

---

## 5A — Balance, pacing and release

**Thread:** Claude, main session (integrator), with the owner playtesting · **Branch:** `main`

**Owns:** integration and release actions; `docs/DECISIONS.md`, `docs/build-plan/`, `src/contracts/`, `data/ship-baseline.json`, `package-lock.json`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `index.html`, `.github/workflows/deploy.yml`; after S13's explicit close-out, `package.json`, `README.md`, `LICENSE`, `NOTICE`, `public/`. Existing contracts/data paths require 2G's completed release first. No blanket ownership of worker source folders. S13's temporary licence-field edit reserves the whole `package.json` file against concurrent edits, including script additions.

**Inputs:** complete integrated Phase 4 route, 3E evidence for both branches/cross-transfer orders, owner playtests, 5B/5D findings, S8 when landed, S10/S12 claims and S13 release front door. S15 provides measured performance findings when delivered.

**Goal:** tune and publish the actual complete expedition with defensible evidence and distribution records.

- Tune from real route ledgers and playtests: expert arrival-to-Earth flights retain main/RCS and operating margin; learned passages remain risky through fresh geometry, execution and worn systems, never erased knowledge or secretly changed rules. Check C05 with both lessons and one-lesson shortfalls without forcing a death/visit token. A physically valid alternate solution remains valid.
- Q10 reconciles the brief's first-contact intention with A13's shorter informed paths. Review meaningful experiments, understandable shortfalls and optionality; no count gate, compulsory detour, mandatory return loop or imported clock target. Q08/Q09 and Q22–Q28 must be recorded as actual owner answers where the shipped behavior depends on them.
- Preserve A12 sustainable preparation and no-pause operation, including asynchronous COMMIT epochs, all views, settings and comparison. Recheck whole-run loss/Recall, original evidence, saved-procedure mismatches, new-run noise and live state across regions. A Phase 2 implementation gap remains with its owner until verified; do not call it a balance fix.
- Send module tuning/fixes to each retained file owner (2C model/Black Box, 2F core/range, 3A/3C ship, 3B/3C fields, 3D frame, 3F screens, 4A–4E content/audio). Record any later exact-file transfer before taking it over. Model settings/reference assumptions and content constants require coordinated evidence; broad main-session authority is not concurrent edit permission.
- A14 has already selected Apache-2.0 for original material. Integrate S13's licence/NOTICE/README/shipped notices, fill the rights-holder placeholder from owner-supplied wording, and verify the final emitted distribution. Retain upstream terms; do not redo licence selection or treat S10/S12's older licence questions as open. Keep excluded reference pictures excluded unless rights are established.
- Run `npm run check` and `npm run build` on the merged release candidate, the applicable physics/estimator/GMAT reference checks and 3E full-route cases. Inspect browser operation, public source/playable/demo links and emitted notices. Distinguish scripted evidence, human observations and still-unproven claims; release metadata must name the tested revision.
- Deploy the tested build to the established static host, smoke-test the deployed revision without login, and tag the verified release. Confirm source/asset/AI provenance and current submission copy agree with what ships. Do not claim a complete return or successful submission while their evidence is missing.

**Scope basis:** A9–A14, S4/S8/S9/S10/S11/S12. S13 owns initial front-door implementation; 5A's later maintenance is sequential. Release tuning has explicit owners instead of an unrestricted polish lane.

## 5B — First-run experience, accessibility and performance

**Thread:** Claude · **Branch:** `p5/5b-first-run`

**Owns:** `src/app/onboarding/` and its colocated tests/docs, after 2D releases this new subtree. No other app, settings, theme, console/view, model or build-config file is granted.

**Inputs:** final 2D/S9 repair status and owner playtest, integrated 3D expedition, S9 keyboard/evidence findings, S15 profiles/patches when available. Existing mission-design/debrief/navigation/draft/focus/warp work remains Phase 2's; verify its delivery before designing a new layer.

**Goal:** a cold player can operate and investigate the final expedition, with accessible controls and measured performance.

- Add only first-run needs still uncovered after Phase 2 close-out. Teach through existing instruments and safely entered experiments: find views/controls, configure sensing, issue a plan, notice a covered forecast discrepancy, retain evidence, test/adopt when eligible and observe a fresh forecast interval. Do not import S9's duration budget, give a model-selected burn, invent a successful TEST, or require a loss.
- Keep prompts/hints optional and tied to observed state. A horizon ending before a collision is not a failed forecast; TESTING is not a passing held-out result. Support Recall and nondestructive learning, and keep the current world running in all accessible screens.
- Verify keyboard reachability, visible focus, inactive-view focus exclusion, native-button key routing, readable contrast, non-color distinctions among measured/forecast/uncertain data and reduced-motion behavior across new and existing flows. Implement local onboarding behavior here; send remaining shell controls/settings/mounting to 2D and generic console/view fixes to 3F, with exact reproduction and affected files.
- Consume S15's measured baseline and rerun relevant production profiles after the integrated 3D build. Report hardware/browser/profile, load behavior, frame distributions, effective warp and saturation; do not claim a universal laptop guarantee. Send rendering/theme patches to their retained owners, model/game/sim costs to their owners and bundling/configuration changes to 5A. Measure proposed gains while preserving P2 and A12; do not pause visible flight to improve a metric.

**Checks:** browser operation from a fresh save and a retained-knowledge save; new onboarding keyboard/reduced-motion behavior; no truth leaks or changes to gameplay; measured relevant before/after profiles; `npm run check` and `npm run build`. Human learning remains a playtest result, separate from scripted UI coverage.

**Scope basis:** S9 repairs are already assigned to 2D, and S15 supplies analysis rather than a new source owner. The vague settings/performance grant is narrowed to prevent overlap while retaining the section's review and exact-file request role.

## 5C-0 — Submission requirements research (completed input)

**Thread:** GPT/Codex · **Branch:** `p5/5c-submission`

**Owns:** none; this subsection is a completed input.

Keep `docs/handoffs/5C-0.md` as the delivered record; 5C continues the submission lane below.

The requirements, challenge-fit and NASA-resource research already exists in `docs/submission/`, supplemented by S10's audit and S12's drafts/claim ledger. Do not relaunch the old research assignment or copy its event schedule into a builder prompt. Remaining live-form, format, resource-eligibility and publication evidence is refreshed by 5C. Preserve established owner participation facts; do not re-ask answered roster/location questions. A14 also supersedes the older licence-choice request.

**Scope basis:** delivered 5C-0, S10 and S12; retain the section ID for traceability, remove its obsolete parallel launch and scheduling rationale.

## 5C — Submission package

**Thread:** GPT/Codex · **Branch:** `p5/5c-submission`

**Owns:** `docs/submission/`.

**Inputs:** delivered 5C-0 checklist, `References/EVENT_LINKS.md`, `References/BIBLIOGRAPHY.md`, S10 evidence/provenance, S12 drafts/demo/claim ledger, A14, S13's merged release documents and 5A's tested release revision. Root README, legal notices and public assets are S13 then 5A's, not 5C's.

**Goal:** finalize editor-ready submission copy and evidence from the released build.

- Adapt S12's summary/openings/description, NASA resources, AI disclosure, credits and demo/slide outline rather than starting new unsourced prose. Record owner editorial choices and source revision. Keep internal claim IDs/evidence scaffolding out of portal text, but retain a release-specific claim map within this folder.
- Refresh live official sources and the registered form's field/format/access requirements, citing check dates and unresolved access gaps. Preserve known solo/virtual/local-event facts from the existing package. Distinguish an organizer listing from unresolved resource or award eligibility; do not claim inaccessible pages verified. This refresh is requirements evidence, not a build schedule.
- Explain actual mission design, engineering trade-offs, repeated simulation, post-attempt analysis and data/processing costs. MISSION and debrief already exist; verify them in the release rather than describe them as future work. A complete expedition, human educational outcome or successful new 3D demo needs its own evidence.
- Credit NASA GMAT as independent Newtonian simulator verification, with the method's stated steps and scope. Promote inclined C5–C7 claims only after their verified integration and release rerun; a branch checkpoint is not the shipped result. GMAT does not validate fictional inverse-2.5 gravity, wells, lattice, recurrence or the live learned estimator. Use matched forecast/outcome epochs and horizon limits, following 2G's D8 correction and S9/S12.
- Apply A14's decided licence wording and S13's actual notices. Keep third-party exceptions, excluded-image permissions and incomplete provenance visible. Credit the owner's direction separately from Claude/Codex contributions; preserve unknown historical model versions rather than inventing them. Apply the current required disclosures/labels to actual generated artifacts through their owning lane.
- Prepare a capture checklist and demo/video or slide script from observed release behavior, with screenshots and public playable/source/demo links. Validate format against the current requirements artifact, without putting a clock target in this prompt. Capture success beats only from a genuine recorded sequence; no fabricated pass, injected evidence or prelearned save presented as a first attempt.
- Verify public links without login and assemble the final package for owner review. Registration, account creation, personal-detail entry, organizer contact and portal submission remain owner actions unless separately authorized. Distinguish prepared, published and actually submitted states in the handoff.

**Checks:** each public claim has a release artifact/test/source or an explicit limit; all links and required fields reviewed; caps/formats checked against the accessible source; current versus conditional evidence reconciled; no stale licence question or unsupported completion claim. No application tests are needed for prose-only edits; consume 5A's release verification.

**Scope basis:** S10/S12 provide the research and drafts; A14/S13 settle licence direction and front-door ownership. 5C owns final submission documents only.

## 5D — Cold playtest

**Thread:** Claude, fresh, with the built-in browser · **Branch:** `p5/5d-cold-playtest` · **Worktree:** `.worktrees/5d`

**Owns:** `docs/handoffs/5D.md` only. Application/source behavior is read-only.

**Inputs:** the public deployed URL and how to open it, supplied by 5A. **Exception to the common reading list:** do not read project/study/design docs, scripts or prior solution walkthroughs before playing; this section is a cold inspection. Do not use developer hooks or seed a learned archive.

**Goal:** report whether the deployed game communicates operation and evidence to a newcomer.

- Begin with a fresh save and use visible controls. Record deployment identity, browser, observations, exact actions, where you stalled, misread or ignored instruments, and whether measured outcome, forecast, uncertainty, coverage and horizon were distinguishable.
- Exercise accessible navigation, live-time planning and safe preparation, retaining failed and successful experiments. If reached naturally, report the physical branch/combined/homeward behavior and surviving-state payoff; do not imply an unvisited part was tested. Later retries with retained knowledge are labeled as such.
- Report evidence of independent test/adopt readiness and a fresh observation after adoption, or the precise point it remained unresolved. No requirement to die, finish within a duration or manufacture success. Separate browser automation from a person's learning/playtest result.
- Record findings and reproduction in the handoff, commit that file and let the integrator route fixes to their single owners. Do not change production settings, erase a user's existing archive or submit external feedback.

**Scope basis:** original cold-playtest role retained; S9's informed inspection is not a cold human trial, and S12 requires honest success/coverage claims. Explicit handoff-only ownership resolves the old “read-only but write a report” ambiguity.

**Gate:** 5A verifies the deployed release, notices and public links; 5C's package matches that release and the owner reviews it. Record any actual portal confirmation only after submission occurs. Keep unresolved scope/evidence explicit rather than substituting a study or scripted run for a completed outcome.
