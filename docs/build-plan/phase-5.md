# Phase 5 — Finish and submit (provisional)

**Status: provisional.** Finalized at the Phase 4 gate.

Every prompt assumes the thread first reads `docs/CREATIVE_BRIEF.md`, `docs/DECISIONS.md` and `docs/build-plan/README.md` § Conventions, and finishes with `docs/handoffs/<id>.md`.

---

## 5A — Balance, pacing and release
**Thread:** Claude, main session (integrator), with the owner playtesting · **Branch:** `main`
**Goal:** tune from playtests and harness reports. First contact with the homeward passage around 12–15 meaningful encounters; familiar passages get easier with understanding and never by secretly changed rules; no required deaths. Final build, deploy to static hosting, smoke test the deployed version, tag the release.

## 5B — First-run experience, accessibility and performance
**Thread:** Claude · **Branch:** `p5/5b-first-run` (worktree)
**Owns:** `src/app/onboarding/`, settings, accessibility and performance fixes agreed with the integrator.
**Goal:** a first-time player learns the controls through instruments and safe early situations, not prose. Keyboard operability, readable contrast, colour-blind-safe semantics for forecast vs measured vs uncertain, reduced-motion option, 60 fps on a mid-range laptop.

## 5C-0 — Submission requirements research (runs now, ahead of Phase 5)
**Thread:** GPT/Codex · **Branch:** `p5/5c-submission` (worktree `.worktrees/5c`) · **Owns:** `docs/submission/`
**Why now:** submission is Sunday afternoon. Knowing exactly what is required and how judges score lets the build aim at it while there is still time to change course.

Read first: `docs/CREATIVE_BRIEF.md`, `docs/DECISIONS.md`, `docs/build-plan/README.md` § Conventions, `References/EVENT_LINKS.md`, `References/BIBLIOGRAPHY.md`, `docs/verification/gmat.md` § Submission paragraph.

Research from primary sources only (the event portal, the Space Mission Design Game challenge page, participant guides, terms, and the organizer discussions in `EVENT_LINKS.md`). Record the date you checked each page. Summarize in your own words; quote at most a short phrase where exact wording matters.
1. **Deadline:** the global submission deadline and its time zone, and whether local events differ. If the local event matters and is unknown, list it as a question for the owner.
2. **Deliverables:** every required and optional item (project page fields, video or demo length and format, links, images, repository), with limits.
3. **Judging:** criteria, award categories, and Global Award eligibility. Check specifically whether NASA GMAT (DECISIONS A1) appears on this challenge's resource list or otherwise qualifies, and name the entry. List any other listed NASA resource the project could use cheaply and honestly.
4. **Rules:** AI use and disclosure, third-party assets and licensing, team information. Note anything the build must change to comply.
5. **Challenge fit:** list each objective or consideration the challenge text names, and map it to where Recursion addresses it (decision, build-plan section or delivered module), or mark it a gap.

Write:
- `docs/submission/requirements.md`: checklist with sources and check dates.
- `docs/submission/challenge-fit.md`: objective → our feature → status, **gaps first**.
- `docs/submission/nasa-resources.md`: resources actually used (by bibliography ID and how), and qualifying candidates still open.
- `docs/handoffs/5C-0.md` from the template. Under Requests, put anything the build must add or change to qualify or score well, most important first.

Do not register, submit, create accounts or enter personal details anywhere; do not edit files outside `docs/submission/` and your handoff. Label claims per Conventions ([ESTABLISHED: URL], [ASSUMED]).

## 5C — Submission package
**Thread:** GPT/Codex · **Branch:** `p5/5c-submission`
**Owns:** `docs/submission/`, root `README.md` sections the integrator assigns.
**Goal:** the Space Apps submission: project summary, how it answers the Space Mission Design Game challenge (trade-offs, repeated simulation, post-mission analysis, data as a resource), NASA resources used (GMAT verification from 1D; bibliography sources actually used, by ID), what is established vs assumed vs fictional, a demo video script and shot list, screenshots list, team and AI-use disclosure per the event's current rules (check `References/EVENT_LINKS.md`).

## 5D — Cold playtest
**Thread:** Claude, fresh, with the built-in browser · **Read-only**
**Goal:** play the deployed build as a first-time player with no project docs beyond how to open it. Report where you got stuck, what you misread, which instruments you ignored, and whether you could tell forecast from outcome. Findings go in `docs/handoffs/5D.md`; the integrator decides fixes.
