# Phase 3 — Systems depth and the two branch encounters (provisional)

**Status: provisional.** At the Phase 2 gate, the integrator updates these prompts with what the playtest showed, adds any contract changes (notably the radiation-exposure input in `envEffects`), and splits them into `docs/build-plan/phase-3/<id>.md` files before launch.

Every prompt below assumes the thread first reads `docs/CREATIVE_BRIEF.md`, `docs/DECISIONS.md`, `docs/build-plan/README.md` § Conventions, `src/contracts/README.md` and the Phase 2 handoffs, and finishes with `docs/handoffs/<id>.md` from the template.

---

## 3A — Power, thermal and equipment condition
**Thread:** GPT/Codex · **Branch:** `p3/3a-power-thermal`
**Owns:** `src/ship/power/`, `src/ship/thermal/`, `src/ship/condition/`, `src/ship/config/`, `src/ship/massprops/`, `src/ship/propulsion/`
**Inputs:** 1C baseline and couplings list, 2B code, Phase 2 playtest notes.
**Goal:** the operating depth behind the power/thermal learning branch.
- Thermal network: nodes, pumped loops, heat exchangers, radiators that deploy and point (deployment changes footprint and centre of mass), heaters, time constants; freezing and overheating limits.
- Power depth: battery thermal limits, protection trips that need deliberate reset, priority and shedding the player configures, bus cross-ties.
- Equipment condition: wear, damage states, redundancy switching. Consume per-component radiation exposure from `envEffects` and map it onto the 1C radiation-effect classes: glancing exposure accumulates; severe exposure can disable critical electrical capability. No random survival rolls, no universal hit counter.
- Tests for each coupling; determinism.

## 3B — Inverse Wells
**Thread:** Claude · **Branch:** `p3/3b-wells` (worktree)
**Owns:** `src/sim/fields/wells.ts`, `src/model/extensions/thrust-response.ts`, `src/content/inverse-wells/`, `src/view3d/fields/wells/`, `src/console/encounters/inverse-wells/`
**Inputs:** brief §7, 1B wells section, 1G extension spec, 1F encounter entry.
**Goal:** the Inverse Wells encounter end to end.
- Field: inside a well's influence the radial component of thrust-produced acceleration reverses; tangential is unchanged; ordinary response returns across the boundary. Profile per 1B; no free-energy exploits.
- The ship's model starts with ordinary thrust response, so its forecast recommends the wrong action. The player's evidence is a residual that appears only during powered flight inside wells; the region-dependent thrust-response extension fits it.
- Long, narrow funnel visualization. Encounter content where sideways motion, timing and control authority matter, and discovering the rule helps a lot without guaranteeing success.

## 3C — Chain Link Fence
**Thread:** Claude · **Branch:** `p3/3c-lattice` (worktree)
**Owns:** `src/sim/fields/lattice.ts`, `src/ship/sensors/`, `src/content/chain-link/`, `src/view3d/fields/lattice/`, `src/console/encounters/chain-link/`
**Inputs:** brief §6, 1B lattice section, 1C radiation effects, 1F encounter entry.
**Goal:** the Chain Link Fence encounter end to end.
- Field: overlapping lattice layers; exposure rises steeply toward strands and is clear at opening centres; exposure computed per component over the whole ship footprint and published in `envEffects` (3A turns it into damage).
- Enough layers that blind traversal almost never succeeds (check with the 3E harness).
- The processing mode Black Box quietly introduced on **existing** sensor hardware: an unexplained channel with a power allocation; recorded behaviour hints at its purpose; when powered enough it reconstructs the lattice in the 3D view, strands intense and fading toward clear centres; quality scales with power, which competes with other loads.
- An attentive player can discover it before dying. Flying through still takes skill.

## 3D — Expedition structure and recurrence
**Thread:** Claude · **Branch:** `p3/3d-expedition` (worktree)
**Owns:** `src/game/expedition/`, `src/game/recurrence/`, `src/game/procedures/`, `src/game/save/`
**Inputs:** 1F expedition design (as approved by the owner), P8, P9.
**Goal:** the frame that turns encounters into an expedition.
- The authored graph, travel between nodes, the chart and glimmer leads (shown only as the ship has sensed them).
- Recurrence contract (P8) in full: triggers, reset, persistence; ship state carried between encounters within a run, with no repair or refill.
- Saved procedures (P9): record, match conditions, replay, adapt.
- Progress gated by demonstrated capability and workable procedures, never visited flags.
- Save/load to IndexedDB; versioned save format.

## 3E — Playability harness
**Thread:** GPT/Codex · **Branch:** `p3/3e-harness`
**Owns:** `tools/harness/`
**Inputs:** `src/sim/`, `src/ship/`, `src/content/` APIs.
**Goal:** "a paper calculation is not proof a route is playable", made testable.
- Headless runner: load an encounter, run a scripted plan, report clearance minima, propellant, power and thermal margins, damage, outcome.
- Sweeps: e.g. success rate of random straight-line lattice traversals; sensitivity of a route to burn-timing error; feasibility of a passage under a given ship state.
- Markdown report output; runnable with one `npm run` script.

## 3F — Console and view, version 2
**Thread:** Claude · **Branch:** `p3/3f-console-v2` (worktree)
**Owns:** `src/console/` (except `encounters/`), `src/view3d/` (except `fields/`)
**Inputs:** Phase 2 playtest notes, `src/theme/` and the latest `docs/handoffs/1E.md` (UI lane), 3A's new state. Take all visual values and primitives from `src/theme/`; do not edit it (README § UI lane).
**Goal:** make the deeper systems operable and Black Box recognizable.
- Power and thermal schematic: component relationships, flows, readings, history; protection resets.
- Configuration panel showing footprint, centre of mass and cooling consequences before commitment.
- Black Box's integrated presence across operation and investigation.
- Fixes from the Phase 2 playtest.

**Gate:** integrator merges; owner plays both branch encounters.
