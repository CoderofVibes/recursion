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

## 5C — Submission package
**Thread:** GPT/Codex · **Branch:** `p5/5c-submission`
**Owns:** `docs/submission/`, root `README.md` sections the integrator assigns.
**Goal:** the Space Apps submission: project summary, how it answers the Space Mission Design Game challenge (trade-offs, repeated simulation, post-mission analysis, data as a resource), NASA resources used (GMAT verification from 1D; bibliography sources actually used, by ID), what is established vs assumed vs fictional, a demo video script and shot list, screenshots list, team and AI-use disclosure per the event's current rules (check `References/EVENT_LINKS.md`).

## 5D — Cold playtest
**Thread:** Claude, fresh, with the built-in browser · **Read-only**
**Goal:** play the deployed build as a first-time player with no project docs beyond how to open it. Report where you got stuck, what you misread, which instruments you ignored, and whether you could tell forecast from outcome. Findings go in `docs/handoffs/5D.md`; the integrator decides fixes.
