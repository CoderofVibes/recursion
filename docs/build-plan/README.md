# Build plan

Five phases. Within a phase, sections run in parallel with separate file ownership. Each phase ends at a **gate**: the integrator (main Claude session) merges the branches, runs the tests, updates `docs/DECISIONS.md` and rewrites the next phase's prompts from what actually happened; the owner plays or approves.

A section may start before its whole previous phase finishes, as soon as the inputs listed in its prompt have landed.

| Phase | Theme | Gate |
|---|---|---|
| 1 | Foundation, research and design (mostly documents) | Owner approves visual direction (1E) and expedition (1F); integrator merges 1A–1G |
| 2 | First playable: the **Gravity range** | Owner plays it (success criterion in 2F) |
| 3 | Systems depth, both branch encounters, expedition frame | Owner plays Inverse Wells and Chain Link Fence |
| 4 | Expedition content and the homeward passage | Owner plays a full run |
| 5 | Balance, polish, release, submission | Submission |

Phases 1 and 2 have one ready-to-launch prompt file per section. Phases 3–5 are provisional single files, finalized at each gate.

## Sections

| ID | Section | Thread | Prompt | Needs |
|---|---|---|---|---|
| 1A | Foundation and contracts | Claude (main/integrator) | [phase-1/1A-foundation.md](phase-1/1A-foundation.md) | — |
| 1B | Physics derivation | GPT/Codex | [phase-1/1B-physics-derivation.md](phase-1/1B-physics-derivation.md) | — |
| 1C | Ship engineering baseline | GPT/Codex | [phase-1/1C-ship-baseline.md](phase-1/1C-ship-baseline.md) | — |
| 1D | GMAT reference trajectories | GPT/Codex (needs GMAT installed) | [phase-1/1D-gmat-reference.md](phase-1/1D-gmat-reference.md) | — |
| 1E | Visual direction | Claude, live with owner | [phase-1/1E-visual-direction.md](phase-1/1E-visual-direction.md) | — |
| 1F | Expedition and encounter design | GPT/Codex | [phase-1/1F-expedition-design.md](phase-1/1F-expedition-design.md) | — |
| 1G | Predictive model specification | GPT/Codex | [phase-1/1G-predictive-model-spec.md](phase-1/1G-predictive-model-spec.md) | — |
| 2A | Simulation core | Claude | [phase-2/2A-sim-core.md](phase-2/2A-sim-core.md) | 1A, 1B, 1D |
| 2B | Ship systems v1 | GPT/Codex | [phase-2/2B-ship-systems.md](phase-2/2B-ship-systems.md) | 1A, 1C |
| 2C | Predictive model and Black Box | Claude | [phase-2/2C-model-and-blackbox.md](phase-2/2C-model-and-blackbox.md) | 1A, 1G |
| 2D | Console UI | Claude | [phase-2/2D-console-ui.md](phase-2/2D-console-ui.md) | 1A, 1E |
| 2E | 3D sensor view | Claude | [phase-2/2E-sensor-view.md](phase-2/2E-sensor-view.md) | 1A, 1E |
| 2F | Gravity range and game loop | Claude (main/integrator) | [phase-2/2F-gravity-range-integration.md](phase-2/2F-gravity-range-integration.md) | all of Phase 2 |
| 3A–3F | Power/thermal depth, Inverse Wells, Chain Link Fence, expedition and recurrence, playability harness, console v2 | 3 Claude, 2 GPT/Codex, 1 Claude | [phase-3.md](phase-3.md) | Phase 2 gate |
| 4A–4E | Power branch, sensing branch and Petal Gallery, combined encounters, homeward passage, audio | 3 Claude, 2 GPT/Codex | [phase-4.md](phase-4.md) | Phase 3 gate |
| 5A–5D | Balance and release, first-run experience, submission package, cold playtest | 3 Claude, 1 GPT/Codex | [phase-5.md](phase-5.md) | Phase 4 gate |

Why the split: GPT/Codex takes bounded derivations, specifications and well-specified pure modules (physics, ship baseline, GMAT, estimator spec, ship systems, harness, combined content, audio, submission). Claude takes integration, the simulation core, the model and Black Box, everything visual, and the signature encounters. Where one party writes mathematics, the other implements and tests it, so the implementation is an independent check (1B → 2A, 1G → 2C, 1D → 2A).

## Launching a thread

The prompt files must be on the branch the thread starts from, so commit (and push, for cloud threads) before launching.

- **Claude threads:** the main session can start them as separate sessions in their own worktrees, or open a new Claude Code session and send the one-liner below.
- **GPT/Codex, local:** create a worktree so it can't collide with other threads, then run Codex there:
  ```bash
  git worktree add "../recursion-1b" -b p1/1b-physics
  ```
- **GPT/Codex, cloud:** point it at the GitHub repo; it should create the branch named in the prompt.

One-liner for any thread (swap the ID and path):

```text
You are thread 1B on the Recursion project. Read docs/build-plan/phase-1/1B-physics-derivation.md and carry it out, following docs/build-plan/README.md § Conventions.
```

## Conventions

1. **Read first:** `docs/CREATIVE_BRIEF.md` (the owner's direction, authoritative, never edited by threads), `docs/DECISIONS.md`, this file, your prompt.
2. **Ownership:** write only the paths your prompt says you own. Need a change elsewhere? Put it under "Requests" in your handoff. `src/contracts/` and `docs/DECISIONS.md` belong to the integrator.
3. **Branches:** work on the branch named in your prompt. Commit there. Never push to `main`; the integrator merges at the gate.
4. **Labels:** tag non-obvious claims `[ESTABLISHED: source ID]`, `[ASSUMED]`, `[FICTIONAL]` or `[DEMONSTRATED: test or playtest]`. A paper calculation is not proof that a route is playable.
5. **Determinism:** randomness only from the seeded streams in `src/lib/`. Same start state and commands give the same result.
6. **Truth vs belief:** nothing under `src/model/` imports truth types or `src/sim/` (P11).
7. **Tests:** code sections leave `npm test` and `npm run build` passing on their branch.
8. **Sources:** cite bibliography IDs from `References/BIBLIOGRAPHY.md`. Local copies are gitignored research copies; don't commit them and don't paste long passages.
9. **Software:** don't download or install anything without the owner's OK.
10. **Communication:** one handoff note at the end (`docs/handoffs/<ID>.md` from [the template](../handoffs/TEMPLATE.md)). Contact the owner only for a real blocker or a shared-interface decision. No status chatter, no full-project reviews.

## File ownership map

| Path | Owner |
|---|---|
| `docs/CREATIVE_BRIEF.md` | Owner only |
| `docs/DECISIONS.md`, `docs/build-plan/`, `src/contracts/`, `src/app/`, `src/game/` (core loop), root config | Integrator (1A, 2F, 5A) |
| `docs/physics/`, `tests/vectors/physics.json`, `tools/physics/` | 1B |
| `docs/engineering/`, `data/ship-baseline.json` | 1C |
| `tools/gmat/`, `tests/vectors/gmat/`, `docs/verification/` | 1D |
| `prototypes/visual/`, `docs/design/visual-direction.md`, `src/theme/` | 1E |
| `docs/design/expedition.md`, `docs/design/encounter-template.md` | 1F |
| `docs/model/`, `tests/vectors/estimator/`, `tools/estimator-ref/` | 1G |
| `src/sim/` (except `fields/`) | 2A |
| `src/ship/` | 2B; in Phase 3 split between 3A (power, thermal, condition, config, massprops, propulsion) and 3C (sensors) |
| `src/model/`, `src/blackbox/` | 2C |
| `src/console/` (except `encounters/`) | 2D, then 3F |
| `src/view3d/` (except `fields/`) | 2E, then 3F |
| `src/content/<encounter>/`, `src/sim/fields/<field>.ts`, `src/view3d/fields/<field>/`, `src/console/encounters/<encounter>/` | The section that builds that encounter |
| `src/game/expedition/`, `recurrence/`, `procedures/`, `save/` | 3D |
| `tools/harness/` | 3E |
| `src/audio/` | 4E |
| `docs/submission/` | 5C |
| `docs/handoffs/<ID>.md` | Each section writes its own |

## Rough timeline (owner's window, Pacific)

| When | Phase |
|---|---|
| Sat ~10:00–13:00 | Phase 1 |
| Sat ~13:00–19:00 | Phase 2, Gravity range playtest at the gate |
| Sat ~19:00–02:00 | Phase 3 |
| Sat night – Sun ~11:00 | Phase 4 |
| Sun ~11:00–17:00 | Phase 5 and submission |
