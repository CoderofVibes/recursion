# Phase 4 — Expedition content and the homeward passage (provisional)

**Status: provisional.** At the Phase 3 gate, the integrator updates these with the owner-approved expedition (1F) and real system capabilities, then splits them into `docs/build-plan/phase-4/<id>.md` files.

Every prompt assumes the thread first reads `docs/CREATIVE_BRIEF.md`, `docs/DECISIONS.md`, `docs/build-plan/README.md` § Conventions, `docs/design/expedition.md`, `docs/design/encounter-template.md`, `src/contracts/README.md` and the Phase 3 handoffs, uses the 3E harness to check every route it authors, and finishes with `docs/handoffs/<id>.md`.

---

## 4A — Power/thermal branch encounters
**Thread:** Claude · **Branch:** `p4/4a-power-branch` (worktree)
**Owns:** `src/content/<encounter-id>/` for the power/thermal branch encounters assigned in 1F, plus their `src/console/encounters/<id>/` panels.
**Goal:** the branch that builds power and thermal operating knowledge, playable in either order with 4B. Each encounter poses an engineering question, teaches through success as well as failure, and leaves evidence that matters later. Harness report for each route.

## 4B — Sensing/navigation branch and Petal Gallery
**Thread:** Claude · **Branch:** `p4/4b-sensing-branch` (worktree)
**Owns:** `src/content/<encounter-id>/` for the sensing/navigation branch and Petal Gallery, plus their console panels and any `src/view3d/fields/<id>/` renderers.
**Goal:** the branch that builds sensing and navigation knowledge. Petal Gallery: an apparently repeated object or view, distinguishable explanations, something learned about spatial connections; once answered, never required again. Harness report for each route.

## 4C — Light and combined encounters
**Thread:** GPT/Codex · **Branch:** `p4/4c-combined`
**Owns:** `src/content/<encounter-id>/` for the light-reuse and combined encounters assigned in 1F.
**Goal:** encounters that reuse existing systems in new combinations, including later situations combining earlier lessons. Data and small scripts only, following the encounter template; no new simulation systems without an integrator request. Harness report for each.

## 4D — Homeward passage and Earth arrival
**Thread:** Claude · **Branch:** `p4/4d-homeward` (worktree)
**Owns:** `src/content/homeward/`, `src/content/earth-arrival/`, related console panels and view renderers.
**Goal:** a finite moving opening that demands accumulated knowledge, configuration, measurement, maneuver execution and resource management, with the surviving ship state carried in and no repair or refill. First contact (around encounters 12–15) should expose specific shortcomings and send the player back out with a purpose. Reaching Earth is the emotional payoff, without suppressing any physically valid earlier observation.

## 4E — Audio and feedback
**Thread:** GPT/Codex · **Branch:** `p4/4e-audio`
**Owns:** `src/audio/`
**Goal:** restrained, synthesized (Web Audio) cues driven by the event stream: equipment state, alerts, contact and exposure, forecast divergence, Black Box activity, recurrence. Quiet by default; a mute control; no external audio assets unless licensed and listed.

**Gate:** integrator merges; owner plays a full run to the homeward passage.
