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
| 1E | Visual direction, then the UI lane (closed 2026-11-14; the lane passed to 2D) | Claude, live with owner | [phase-1/1E-visual-direction.md](phase-1/1E-visual-direction.md) | — |
| 1F | Expedition and encounter design | GPT/Codex | [phase-1/1F-expedition-design.md](phase-1/1F-expedition-design.md) | — |
| 1G | Predictive model specification | GPT/Codex | [phase-1/1G-predictive-model-spec.md](phase-1/1G-predictive-model-spec.md) | — |
| 2A | Simulation core | Claude | [phase-2/2A-sim-core.md](phase-2/2A-sim-core.md) | 1A, 1B (1D's vectors join later) |
| 2B | Ship systems v1 | GPT/Codex | [phase-2/2B-ship-systems.md](phase-2/2B-ship-systems.md) | 1A, 1C |
| 2C | Predictive model and Black Box (stopped while 2G converts to 3D; resumes after) | Claude | [phase-2/2C-model-and-blackbox.md](phase-2/2C-model-and-blackbox.md) | 1A, 1G |
| 2D | Control room and every screen: the single screen thread, with the UI lane (replaces the earlier 2D console and 2E view prompts) | Claude (Fable), worktree | [phase-2/2D-control-room.md](phase-2/2D-control-room.md) | 1E close-out, 2C, 2F (2G joins as it lands) |
| 2F | Gravity range and game loop (stopped while 2G converts to 3D; resumes after) | Claude (Fable), worktree | [phase-2/2F-gravity-range-integration.md](phase-2/2F-gravity-range-integration.md) | 2A, 2B (2C–2E join as they land) |
| 2G | Three-dimensional flight: contracts, physics, ship, model and the Gravity range in 3D (A11) | Claude (Fable), worktree | [phase-2/2G-3d-flight.md](phase-2/2G-3d-flight.md) | 2C update 3 (merged) |
| S1–S6 | Studies, in parallel with the build: Borrowed Spin (tether physics, hardware, encounter and model), the expedition in 3D, wells and lattice in 3D, paired openings | GPT/Codex, one thread each | [studies/README.md](studies/README.md) | Done (merged 2026-11-14); recommendations only, owner decisions listed in each `docs/handoffs/s<n>.md` |
| 3A–3F | Power/thermal depth, Inverse Wells, Chain Link Fence, expedition and recurrence, playability harness, console v2 | 3 Claude, 2 GPT/Codex, 1 Claude | [phase-3.md](phase-3.md) | Phase 2 gate |
| 4A–4E | Power branch, sensing branch and Petal Gallery, combined encounters, homeward passage, audio | 3 Claude, 2 GPT/Codex | [phase-4.md](phase-4.md) | Phase 3 gate |
| 5A–5D | Balance and release, first-run experience, submission package, cold playtest | 3 Claude, 1 GPT/Codex | [phase-5.md](phase-5.md) | Phase 4 gate |

Why the split: GPT/Codex takes bounded derivations, specifications and well-specified pure modules (physics, ship baseline, GMAT, estimator spec, ship systems, harness, combined content, audio, submission). Claude takes integration, the simulation core, the model and Black Box, everything visual, and the signature encounters. Where one party writes mathematics, the other implements and tests it, so the implementation is an independent check (1B → 2A, 1G → 2C, 1D → 2A).

## Launching a thread

The prompt files must be on the branch the thread starts from, so commit (and push, for cloud threads) before launching.

The owner launches every worker thread personally. The main Tony & Claude session is the integrator and does not spawn threads.

**One folder per thread.** The project root (`C:\Dev\Recursion NASA Hackathon`) belongs to the main session on `main`. Every other local thread, Claude or Codex, works in its own git worktree under `.worktrees/` (ignored by Git), on the branch named in its prompt. Two threads must never share a folder.

Create a thread's worktree from the project root (works in Git Bash or PowerShell), then open that folder in the new Claude session or run Codex inside it:

```bash
git worktree add .worktrees/1b -b p1/1b-physics
git worktree add .worktrees/1c -b p1/1c-ship-baseline
git worktree add .worktrees/1d -b p1/1d-gmat
git worktree add .worktrees/1e -b p1/1e-visual
git worktree add .worktrees/1f -b p1/1f-expedition
git worktree add .worktrees/1g -b p1/1g-model-spec
```

Phase 2 follows the same pattern (`.worktrees/2a` on `p2/2a-sim`, and so on), but only after the integrator says 1A is merged and pushed, so Phase 2 branches start from the shared contracts.

- **Claude threads:** prefer the manual worktree above over the app's automatic one, so the branch name matches the prompt.
- **GPT/Codex, local:** run Codex inside the thread's worktree folder.
- **GPT/Codex, cloud:** point it at the GitHub repo; it creates the branch named in its prompt and needs no local worktree.
- **After a gate merge:** the integrator removes merged worktrees, e.g. `git worktree remove .worktrees/1b`.
- **If git reports a lock file** (`index.lock`), another thread was running git at the same instant; retry.

One-liner for any thread (swap the ID and path):

```text
You are thread 1B on the Recursion project. Read docs/build-plan/phase-1/1B-physics-derivation.md and carry it out, following docs/build-plan/README.md § Conventions.
```

## Conventions

1. **Read first:** `docs/CREATIVE_BRIEF.md` (the owner's direction, authoritative, never edited by threads), `docs/DECISIONS.md`, this file, your prompt.
2. **Ownership:** write only the paths your prompt says you own. Need a change elsewhere? Put it under "Requests" in your handoff. `src/contracts/` and `docs/DECISIONS.md` belong to the integrator (exception: 2G owns `src/contracts/` during the 3D conversion).
3. **Branches:** work on the branch named in your prompt. Commit there. Never push to `main`; the integrator merges at the gate.
4. **Labels:** tag non-obvious claims `[ESTABLISHED: source ID]`, `[ASSUMED]`, `[FICTIONAL]` or `[DEMONSTRATED: test or playtest]`. A paper calculation is not proof that a route is playable.
5. **Determinism:** randomness only from the seeded streams in `src/lib/`. Same start state and commands give the same result.
6. **Truth vs belief:** nothing under `src/model/` imports truth types or `src/sim/` (P11).
7. **Tests:** code sections leave `npm test` and `npm run build` passing on their branch.
8. **Sources:** cite bibliography IDs from `References/BIBLIOGRAPHY.md`. Local copies are gitignored research copies; don't commit them and don't paste long passages.
9. **Software:** don't download or install anything without the owner's OK.
10. **Communication:** one handoff note at the end (`docs/handoffs/<ID>.md` from [the template](../handoffs/TEMPLATE.md)). Contact the owner only for a real blocker or a shared-interface decision. No status chatter, no full-project reviews.
11. **Look and feel:** UI code takes every colour, font, size, line style, material and motion timing from `src/theme/`, and composes instruments from `src/theme/components/`. Only the UI lane (2D from 2026-11-14) edits `src/theme/`; see § UI lane.

## UI lane

The owner dials in the game's look and feel throughout the build. 1E ran the lane until 2026-11-14; since then the 2D control-room thread runs it, so one thread owns both how things look and what is on screen. The split below still holds for every other thread. It never clashes with other threads because ownership splits *how things look* from *what is on screen*:

| | Owns | Examples |
|---|---|---|
| UI lane (1E, now 2D) | `src/theme/`: tokens, instrument primitives, 3D styles, the UI lab page; `prototypes/`; `docs/design/visual-direction.md` | Palette, type, line weights, dash patterns, motion; how a gauge, readout or panel frame looks; how the forecast line and envelope are drawn |
| Control room (2D, then 3F; encounter sections for their own panels) | Layout, panels, behaviour, data wiring, scene composition | Which panels exist and where; what a click does; camera |

- UI code never hard-codes a visual value; it uses `src/theme/` (Convention 11). Changing a token or primitive restyles every panel without touching the console or view folders.
- A thread that needs a primitive the theme lacks builds it locally on tokens and lists it in its handoff; the UI lane may adopt it.
- Layout or behaviour changes the owner wants go to the owning thread (relayed by the owner, or collected by the integrator at a gate), not into `src/theme/`.
- The UI lab (`src/theme/lab/index.html`, dev only) shows primitives on the contract fixtures, so the owner can work before the real panels exist. After 2D merges, the lane runs `git merge main` and tunes against the real console.
- The integrator merges the UI lane's branch at every gate, and on request in between; the lane merges `main` back in after each announced merge.

## File ownership map

| Path | Owner |
|---|---|
| `docs/CREATIVE_BRIEF.md` | Owner only |
| `docs/DECISIONS.md`, `docs/build-plan/`, `src/contracts/`, root config | Integrator (main session; 1A, 5A) |
| `src/app/` (except `game.ts`) | 2D |
| `src/app/game.ts`, `src/game/` (core loop), `src/content/gravity-range/` | 2F; 2G during the 3D conversion |
| `docs/physics/`, `tests/vectors/physics.json`, `tools/physics/` | 1B; 2G for the 3D conversion |
| `docs/engineering/`, `data/ship-baseline.json` | 1C; 2G for the 3D conversion |
| `tools/gmat/`, `tests/vectors/gmat/`, `docs/verification/` | 1D; 2G for the 3D conversion |
| `prototypes/`, `docs/design/visual-direction.md`, `docs/design/img/`, `src/theme/` (tokens, instrument primitives, 3D styles, UI lab) | The owner's UI lane: 1E, then 2D from 2026-11-14 |
| `docs/design/expedition.md`, `docs/design/regions/` | S4 (after 1F) |
| `docs/design/encounter-template.md` | 1F |
| `docs/studies/<id>/`, `tools/studies/<id>/` | That study (S1–S6) |
| `docs/model/`, `tests/vectors/estimator/`, `tools/estimator-ref/` | 1G; 2G for the 3D conversion |
| `src/sim/` (except `fields/`), `src/lib/` | 2A; 2G for the 3D conversion |
| `src/ship/` | 2B, and 2G for the 3D conversion; in Phase 3 split between 3A (power, thermal, condition, config, massprops, propulsion) and 3C (sensors) |
| `src/model/`, `src/blackbox/` | 2C; 2G during the 3D conversion |
| `src/console/` (except `encounters/`) | 2D (control room), then 3F |
| `src/view3d/` (except `fields/`) | 2D (control room), then 3F |
| `src/content/<encounter>/`, `src/sim/fields/<field>.ts`, `src/view3d/fields/<field>/`, `src/console/encounters/<encounter>/` | The section that builds that encounter |
| `src/game/expedition/`, `recurrence/`, `procedures/`, `save/` | 3D |
| `tools/harness/` | 3E |
| `src/audio/` | 4E |
| `docs/submission/` | 5C |
| `docs/handoffs/<ID>.md` | Each section writes its own |

## Order of work

Phases run in order with no clock targets and no deadlines in prompts: build fully and well. The owner's availability sets the pace, gates happen when the owner is ready, and only the owner makes scope calls.

1. Phase 1
2. Phase 2, Gravity range playtest at the gate
3. Phase 3
4. Phase 4
5. Phase 5 and submission
