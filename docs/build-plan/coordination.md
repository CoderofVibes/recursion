# Coordination ledger

The live state of the build between threads: who is running, who holds which shared file, and every open request or agreement between threads. **The integrator updates it on every relay, merge, launch and gate change, in the same commit as the change.** Threads read it; they don't edit it. They send changes to the integrator through the owner.

**Integrator, after a compaction:** read this file first, then `git log --oneline -15`, then the handoffs of any thread marked running.

**Last updated:** 2026-11-14, main at `5b94ed2` plus this commit.

## Threads

| Thread | Model | Worktree · branch | Status | Gate or next step | Last merged into main |
|---|---|---|---|---|---|
| 2D control room | Opus 5.5 | `.worktrees/2d` · `p2/2d-control-room` | Running: S9's requests, S15's console fixes, 2G's screen data, S8's displays, credits link | — | `c7e8568` (update 4) |
| 2G speed pass | Opus 5.5 | `.worktrees/2g` · `p2/2g-3d-flight` | Running: S15 rank 1, the ship's per-tick work | Its merge opens 3A and lets 2F into `truth-step.ts` | `a537c64` (3D, checkpoints 1–5) |
| 2F game loop | Opus 5.5 | `.worktrees/2f` · `p2/2f-game` | Running: A18 (commit keeps time running, `depart` rule, power death, rate-only release, seed catalogue), S8's vectors | Belt and power values wait on S21 | before 2G |
| 2C model and Black Box | Opus 5.5 | `.worktrees/2c` · `p2/2c-model` | Running: WIP committed, then redone on the 3D model; bodies' track uncertainty; A18 (1) with 2F | — | before 2G |
| 3B Inverse Wells | GPT/Codex | `.worktrees/3b` · `p3/3b-wells` | Running: field mechanics first | Layout from S16; loading via R1 | — |
| 3C Chain Link Fence | Opus 5.5 or Fable (owner's call) | `.worktrees/3c` · `p3/3c-lattice` | **Held by the owner** to save Claude usage | Start when S17 lands | — |
| 3E playability harness | GPT/Codex | `.worktrees/3e` · `p3/3e-harness` | Running | — | — |
| 3A power and thermal | GPT/Codex | not created yet · `p3/3a-power-thermal` | **Gated** | After 2G's speed pass merges; integrator creates the worktree then | — |
| 3D expedition | Opus 5.5 | not created yet · `p3/3d-expedition` | **Gated** | After 2F's and 2C's first checkpoints merge | — |
| 3F console v2 | Claude | — | **Gated** | After 2D hands off | — |
| S16 Well Garden layout | GPT/Codex | `.worktrees/s16` · `st/s16-well-garden` | Running | Feeds 3B | — |
| S17 lattice first contact | GPT/Codex | `.worktrees/s17` · `st/s17-lattice-first-contact` | Running | Feeds 3C; its landing starts 3C | — |
| S18 tether gate | GPT/Codex | `.worktrees/s18` · `st/s18-tether-gate` | Running | Future tether work | — |
| S19 tidal check | GPT/Codex | `.worktrees/s19` · `st/s19-tidal-check` | Running | Decides Tidal Orchard | — |
| S20 3D recheck | GPT/Codex | `.worktrees/s20` · `st/s20-3d-recheck` | Running | Findings go to 2D (R5) and the submission | — |
| S21 belt and power | GPT/Codex | `.worktrees/s21` · `st/s21-belt-power` | Running | Values go to 2F (R6) and 3A | — |

Prompts: Phase 2 in `phase-2/`, Phase 3 in `phase-3.md`, studies in `studies/`. The resume notes for 2D, 2G, 2F and 2C were sent through the owner on 2026-11-14 and are summarised in the Status column.

## Shared files: who holds them now

| Path | Holder | Until |
|---|---|---|
| `src/contracts/` (including `createFieldRegistry`) | Integrator | Always. Threads request changes. |
| `package.json`, Vite/Vitest/TS/ESLint config | Integrator | Always. |
| `docs/DECISIONS.md`, `docs/build-plan/` | Integrator | Always. |
| `src/ship/{config,massprops,power,thermal,propulsion}/` | 2G (speed pass) | 2G's merge, then 3A |
| `src/game/truth-step.ts` | 2G (speed pass) | 2G's merge, then 2F |
| `src/game/` (rest), `src/content/`, `src/app/game.ts` | 2F | 2F's handoff. Encounter subfolders below excepted. |
| `src/model/`, `src/blackbox/` | 2C | 2C's handoff |
| `src/console/`, `src/view3d/`, `src/theme/`, rest of `src/app/` | 2D | 2D's handoff, then 3F (console and view3d) |
| `src/sim/fields/wells*`, `src/content/inverse-wells/`, `src/view3d/fields/wells/`, `src/console/encounters/inverse-wells/` | 3B | 3B's handoff |
| `src/sim/fields/lattice*`, `src/ship/sensors/`, `src/content/chain-link/`, `src/view3d/fields/lattice/`, `src/console/encounters/chain-link/` | 3C | 3C's handoff |
| `tools/harness/` | 3E | 3E's handoff |
| `src/lib/`, rest of `src/sim/`, `data/`, `tests/vectors/`, `tools/gmat/`, `docs/physics/`, `docs/verification/` | Integrator | Until a section is given it |

## Requests and agreements between threads

Status values: **open** (asked, not answered), **agreed** (answered, being built), **done** (merged), **dropped**.

| ID | From → to | What | Status | Notes |
|---|---|---|---|---|
| R1 | 3B → 2F | Loading interface: 3B exports `createInverseWells(seed, options)` returning `EncounterSetup` plus a field registry built with `createFieldRegistry`. 2F wires the registry into `createTruthStepper`, loads it via `?encounter=inverse-wells` with its own save slot, and adds a `reach-region` objective for P03's exits. | **Open:** relayed to 2F, awaiting confirmation | Integrator approved the shape. The registry wiring waits for 2G's merge (`truth-step.ts`). 3C will reuse the same route and objective. |
| R2 | 3E → integrator | `npm run harness` → `node tools/harness/run.mjs` | **Done** `5b94ed2` | |
| R3 | 2F ↔ 2C | A18 (1): the forecast is computed from the moment of commitment while time keeps running | **Agreed** (both prompted) | Model side is 2C's; game side is 2F's |
| R4 | 3B, 3C → 2D | Mount points for encounter UI in `src/console/encounters/` and `src/view3d/fields/` | **Open:** 2D told to expect it | |
| R5 | S20 → 2D | S9 replayed on the 3D build: fixed, still there or new | **Open:** waits on S20 | Integrator forwards |
| R6 | S21 → 2F, 3A | Belt size (A18 (2)) and power values (A18 (5)) | **Open:** waits on S21 | 2F builds the mechanisms first |
| R7 | S16 → 3B | Well Garden layout, seeds and vectors | **Open:** waits on S16 | |
| R8 | S17 → 3C | First-contact numbers: dose, failure order, Black Box function cost, reconstruction | **Open:** waits on S17 | Its landing starts 3C |
| R9 | 3C → 2C | The Black Box function in A16 (records sensors; FLIGHT shows the rebuilt lattice) | **Open:** 3C not started | |
| R10 | 3C ↔ 3A | Component faults from radiation: electrics and instruments (A16) | **Open:** neither started | |
| R11 | 2G → integrator | Release check from A18 (7) on 2G's speed pass: rerun S15's script, modest profile | **Open:** with 2G's merge | |

Add new rows at the bottom with the next ID. Never renumber.

## Owner decisions still open

- **Submission:** the summary's opening and the demo format (S12, `docs/studies/s12/`). Taken at the submission switch.
- **S9:** whether the five-minute target means insight plus a fresh observed forecast (recommended yes); whether to allow a shorter evidence opportunity if the UI fixes miss it (recommended yes). Show the 1–4 view shortcuts: folded into 2D's R1.
- **S10:** keep the four reference pictures out of the release (recommended yes); confirm the live challenge listing and GMAT data eligibility (owner check).

Decided: A15 (S11's queue), A16 (the lattice), A17 (the ending) and A18 (the Gravity range after 3D).

## Merge log, newest first

| Commit | What |
|---|---|
| `5b94ed2` | `npm run harness`; wells and lattice paths split between 3B and 3C |
| `393b5a8` | A18 (3): learning burns free, `depart` requires a real Beta assist |
| `0b5cc25` | A18; study S21 |
| `ad6bec0` | 3B reassigned to GPT/Codex |
| `19a9ada` | Phase 3 applied, path releases, DECISIONS for 2G and S8, studies S16–S20 |
| `e878b7c` | Independent check of 2G's slingshot study; reference vectors |
| `454d9c8` | Speed test runs on its own after the suite |
| `3bd3425`, `a537c64` | S15; 2G (3D end to end) |
| `b82ccd8` | S13 (licence, notices, README), S14 (phases 3–5 refreshed) |
