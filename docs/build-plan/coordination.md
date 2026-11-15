# Coordination ledger

The live state of the build between threads: who is running, who holds which shared file, and every open request or agreement between threads. **The integrator updates it on every relay, merge, launch and gate change, in the same commit as the change.** Threads read it; they don't edit it. They send changes to the integrator through the owner.

**Integrator, after a compaction:** read this file first, then `git log --oneline -15`, then the handoffs of any thread marked running.

**Last updated:** 2026-11-14, A21 (the opening) and A22 (audio); S23, OP and AU written. Unannounced checkpoints sit on 2D, 3B and 3C; merge them when announced.

## Threads

| Thread | Model | Worktree · branch | Status | Gate or next step | Last merged into main |
|---|---|---|---|---|---|
| 2D control room | Opus 5.5 | `.worktrees/2d` · `p2/2d-control-room` | Running: S9's requests, S15's console fixes, 2G's screen data, S8's displays, credits link | — | `c7e8568` (update 4) |
| 2G speed pass | Opus 5.5 | `.worktrees/2g` · `p2/2g-3d-flight` | **Done**, evidence and handoff merged. Next per-tick target: the environment step (rock visibility); a quiet-machine rebaseline is still to run (R11) | — | `bc292a9` |
| 2F game loop | Opus 5.5 | `.worktrees/2f` · `p2/2f-game` | Running. Merged: A18 (1), (3), (4), (5) with placeholder power values, (6); S8's 70 catalogue flights as tests; encounter registry | Next: S21's power values and the cloud crescent (R14); fields into the simulation via `truth-step.ts` (R1), power-loss check next to collision loss | `7036c60` |
| 2C model and Black Box | Opus 5.5 | `.worktrees/2c` · `p2/2c-model` | Round done and merged: bodies' track uncertainty, two moving bodies, forecast as of its issue time (A18 (1)), S8 checks with two fixes, lazy fallback | Next: 3C's reconstruction and Black Box function (R9), S17's requests, S20's (R17); 5% range-noise robustness still open | `4bf5359` |
| 3B Inverse Wells | GPT/Codex | `.worktrees/3b` · `p3/3b-wells` | Running: field mechanics first | Layout from S16; loading via R1 | — |
| 3C Chain Link Fence | GPT/Codex (GPT-6 Astra), reassigned by the owner | `.worktrees/3c` · `p3/3c-lattice` | Running: field and exposure mechanics first | S17's numbers when they land (R8) | — |
| 3E playability harness | GPT/Codex | `.worktrees/3e` · `p3/3e-harness` | **Done**: `npm run harness` (smoke, reference, learning, routes, all); its pending-acceptance list names the gaps | — | `44db2fc` |
| 3A power and thermal | GPT/Codex | `.worktrees/3a` · `p3/3a-power-thermal` | **Gate open**, ready to launch | Builds on 2G's speed pass; S21's power values; S17's causal failures with 3C | — |
| 3D expedition | Opus 5.5 | not created yet · `p3/3d-expedition` | **Gated** | After 2F's and 2C's first checkpoints merge | — |
| 3F console v2 | Claude | — | **Gated** | After 2D hands off | — |
| S16 Well Garden layout | GPT/Codex | `.worktrees/s16` · `st/s16-well-garden` | **Done**: three-well prototype, 25-entry catalogue, garden budget (A15 Q05) | — | `e6eb51d` |
| S23 the opening | GPT/Codex | `.worktrees/s23` · `st/s23-the-opening` | Ready to launch | Feeds OP and AU | — |
| OP the opening | Opus 5.5 | `.worktrees/op` · `p3/op-opening` | Ready to launch | S23's beats when they land; room hooks via R23 | — |
| AU basic audio | GPT/Codex | `.worktrees/au` · `p3/au-audio` | Ready to launch | Cue list first, so the owner can generate in ElevenLabs; mount via R24 | — |
| S22 well field (real funnels) | GPT/Codex | `.worktrees/s22` · `st/s22-big-well-field` | **Done**: funnels 120 km long, 20 km mouth, 1 km throat, pull 0.02–0.10 m/s²; 2,601 sites, 650 appearing; owner questions open | Feeds 3B (R12) | `15171df` |
| S17 lattice first contact | GPT/Codex | `.worktrees/s17` · `st/s17-lattice-first-contact` | **Done**; five owner questions open | Feeds 3C (R8), 3A, 2C | `ba7568e` |
| S18 tether gate | GPT/Codex | `.worktrees/s18` · `st/s18-tether-gate` | **Done**: the load gate passes as a slower turning manoeuvre; four owner questions open | Future tether work | `32a8b67` |
| S19 tidal check | GPT/Codex | `.worktrees/s19` · `st/s19-tidal-check` | **Done**: Tidal Orchard deferred (A15 Q21) | — | merged, see log |
| S20 3D recheck | GPT/Codex | `.worktrees/s20` · `st/s20-3d-recheck` | **Done**: S9 replayed on 3D, S12's ledger refreshed, demo shots, S15 rerun | Findings to 2D (R5), 2F, 2C, the submission | `6267a53` |
| S21 belt and power | GPT/Codex | `.worktrees/s21` · `st/s21-belt-power` | **Done**; two owner questions open | Values go to 2F (R6), 3A; cloud seam R14 | `d9e986c` |

Prompts: Phase 2 in `phase-2/`, Phase 3 in `phase-3.md`, studies in `studies/`. The resume notes for 2D, 2G, 2F and 2C were sent through the owner on 2026-11-14 and are summarised in the Status column.

## Shared files: who holds them now

| Path | Holder | Until |
|---|---|---|
| `src/contracts/` (including `createFieldRegistry`) | Integrator | Always. Threads request changes. **Scoped exception (2026-11-14): 3C may add new, additive acquisition and coverage types (R15), changing no existing type; the integrator reviews them at merge.** |
| `package.json`, Vite/Vitest/TS/ESLint config | Integrator | Always. |
| `docs/DECISIONS.md`, `docs/build-plan/` | Integrator | Always. |
| `src/ship/{config,massprops,power,thermal,propulsion}/` | 3A (from 2G, 2026-11-14) | 3A's handoff |
| `src/game/truth-step.ts` | 2F (from 2G, 2026-11-14) | 2F's handoff. 3B, 3C and S17's subtick acquisition schedule go through 2F |
| `src/game/` (rest), `src/content/`, `src/app/game.ts` | 2F | 2F's handoff. Encounter subfolders excepted, and 3B and 3C may each add their one registration line in `src/game/encounters.ts` (R1). |
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
| R1 | 3B, 3C → 2F | Loading interface: one line per encounter in `src/game/encounters.ts`, loaded via `?encounter=<id>` with its own save slot; the setup takes `run` and returns an `EncounterSetup` with `fields`; exits use `reach-region` | **Confirmed by 2F; 3C has registered `chain-link`. Blocking now: 2F must pass `setup.fields` into `createSimulation`** (main throws "world has fields but no field registry was given" on this route) | Top of 2F's list |
| R2 | 3E → integrator | `npm run harness` → `node tools/harness/run.mjs` | **Done** `5b94ed2` | |
| R3 | 2F ↔ 2C | A18 (1): the forecast is computed from the moment of commitment while time keeps running | **Agreed** (both prompted) | Model side is 2C's; game side is 2F's |
| R4 | 3B, 3C → 2D | Mount points for encounter UI in `src/console/encounters/` and `src/view3d/fields/` | **Open:** 2D told to expect it | |
| R5 | S20 → 2D | S9 replayed on the 3D build | **Landed** `6267a53`; relay to 2D | Most S9 fixes still open; priorities: retained PLAN drafts, routes and warp reasons, focus, comparison intervals, recorder estimates, departure frames; wire `WindowView` and `fitFailure` |
| R6 | S21 → 2F, 3A | Belt size (A18 (2)) and power values (A18 (5)) | **Landed** `d9e986c`; relay once the owner answers S21's two questions | Radiation-cloud crescent, ~830 km pass target, 120 s critical-power rule, 4 h endurance caution |
| R7 | S16 → 3B | Well Garden layout, seeds and vectors | **Done** `e6eb51d`: the three-well prototype for 3B's mechanics | The owner then asked for a big field (R12) |
| R8 | S17 → 3C | First-contact numbers: dose, failure order, Black Box function cost, reconstruction | **Landed** `ba7568e`; relay with the owner's answers to S17's five questions | Also asks 3A (causal failures), 2C (reconstruction and retention), integrator (subtick acquisition schedule in `truth-step.ts`, contracts) |
| R9 | 3C → 2C | The Black Box function in A16 (records sensors; FLIGHT shows the rebuilt lattice) | **Open:** 3C running | |
| R10 | 3C ↔ 3A | Component faults from radiation: electrics and instruments (A16) | **Open:** 3C running; 3A gated | |
| R11 | 2G → integrator | Release check from A18 (7): achieved warp on the modest profile | **Measured; the limit is frames, not the ship.** Each frame runs exactly 8 ticks (the 10 ms budget is checked every 8 ticks, and 8 ticks already exceed it), so achieved warp = 8 ÷ frame interval: 67–264 ship-s per wall-s at best, under S15's pre-3D 270–490. 2G's cut saves about 2.7 ms per frame. See R18 | Rebaseline on a quiet machine; a real-laptop check |

| R12 | S22 → 3B | Wells as real funnels (A19): pull, reversal along the axis, crush at the throat; 2,601 sites through 3D at random axes, 650 that appear (900 s precursor, 120 s ramp, a 240 s guard that cancels unsafe births); a reuse map | **Landed** `15171df`; relay once the owner answers S22's questions | Crossing ~122 kg main; slow bypass still 727 kg over 51.5 days; fast bypass 2,593 kg |

| R13 | 3B → 2D | The funnels in the window view (A19: wells are visible, with striking visuals). 3B draws them in `src/view3d/fields/wells/`; 2D mounts them in the room's window and FLIGHT | **Open:** to relay | Folds into R4 |

| R14 | S21 → 3C, 3A, 2F | The Gravity range's radiation-cloud crescent uses the lattice's exposure units and damage seam (3C, 3A); 2F places it as content | **Open:** after the owner approves S21 Q1 | |
| R15 | 3C → integrator | Typed acquisition and coverage contracts (from `src/ship/sensors/lattice-observations.ts`; 3C's handoff, "A16 update — concrete shared seams"), plus an archive/save schema bump | **Granted to 3C as a scoped exception**: additive types only; 2C (Black Box) and 2F (save) agree the schema bump | Integrator reviews at merge |

| R16 | 3C → integrator | Land 2F's deterministic-clock fix so 3C's full check goes green | **Done** `7b01be8` | |
| R17 | S20 → 2F, 2C | Expose believed departure/progress, keep command and forecast epochs while time runs, reconcile PLAN's 400 s default with the 480 s turn allowance; make the real-model loop test deterministic; investigate the populated-archive commit wait | **Open**: relay | |

| R18 | Owner → 2F, 2D | Faster coasting on slow machines (A20): at high warp with no hands-on flying, a bigger simulation slice per frame (2F) and fewer frames drawn (2D); results identical | **Agreed** (owner, A20); relay to both | 2F exposes the budget; 2D sets it with its frame cadence |

| R19 | 3B → integrator | S22's forward exit is a disc crossing; `reach-region` takes spheres | **Decided by the integrator:** the prototype uses a destination sphere entirely beyond S22's exit plane; an exact disc waits for playtest evidence | |
| R20 | 3C → 2F | In `truth-step.ts`: build the environment at every real acquisition state (`createChainLinkEnvironment(setup).at(state)`), not one frozen scene per second; schedule within the 1 s step to the earliest sensor, recorder, dose, trip or failure event, then integrate the rest; keep acquisition time separate from product availability; swept whole-ship admission for physical exits | **Open**: relay | After the fields wiring (R1) and A20 |

| R21 | 2C → integrator | Forecast contract: `presentBody`, `presentAge`, `stale` and the bodies' share of the envelope | **Done** (this commit): optional fields on `ForecastDetail` and `ForecastSigmaBySource` | 2D can show them |

| R22 | 3C → 2C, 2F | Versioning for the lattice: chain-link save format 2 for the twenty-fence world; old attempts keep their original archive and frame; new channels `lattice.angular-fragments.v2` and `lattice.raw-tile.v1` fit the unchanged `Measurement`/`AttemptRecord` shape. 2C versions its reconstruction caches and says whether the archive store needs a migration; 2F confirms the save side | **Open**: integrator approves the shape; awaiting 2C's and 2F's agreement | 3C changed no IndexedDB or shared save schema |

| R23 | OP → 2D | A small additive hook API in the room (window sky, lighting cues, camera shake, fade, title card) under a scoped exception; no change to existing behaviour | **Open**: OP tells 2D before committing | |
| R24 | AU → 2D | One mount line in `src/app/` for the audio module, plus a mute control | **Open** | |
| R25 | AU → owner | The cue list in `docs/audio/cues.md` with ElevenLabs prompts; the owner generates the files into `public/audio/` | **Open**: waits on AU's first checkpoint | Credit ElevenLabs (A22) |

Add new rows at the bottom with the next ID. Never renumber.

## Owner decisions still open

- **Submission:** the summary's opening and the demo format (S12, `docs/studies/s12/`). Taken at the submission switch.
- **S9:** whether the five-minute target means insight plus a fresh observed forecast (recommended yes); whether to allow a shorter evidence opportunity if the UI fixes miss it (recommended yes). Show the 1–4 view shortcuts: folded into 2D's R1.
- **S10:** keep the four reference pictures out of the release (recommended yes); confirm the live challenge listing and GMAT data eligibility (owner check).

Decided: A15 (S11's queue), A16 (the lattice), A17 (the ending) and A18 (the Gravity range after 3D).

## Merge log, newest first

| Commit | What |
|---|---|
| (this commit) | A21, A22; S23, OP, AU; R23–R25 |
| `bc292a9` | 2G's S15 rank 1 evidence |
| `6b7a512` | A17's last moment; A21 |
| `02cf2bf` | H02 rewritten for A17; R22 |
| `00b3b9f` | Forecast contract fields for 2C (R21) |
| `4bf5359` | 2C on the 3D model |
| `6d11f4d` | A19 (4); ledger R1, R15, R19, R20 |
| `b3e8406` | A20: faster coasting; ledger |
| `15171df` | S22: the funnel field |
| `78f4dd5` | A16: twenty fences; A15 after S18; ledger (R1 confirmed, R11 measured, R18) |
| `7036c60` | 2F checkpoint: power death (placeholders), S8's flights as tests |
| `50654b2` | A16 and A18 after S17 and S21; ledger; 3A's gate open |
| `6267a53`, `32a8b67` | S20; S18 |
| `7b01be8` | 2F checkpoint (A18 (1), (3), (4), (6); encounter registry) |
| `83704bc` | 2G's speed pass |
| `d778682` | Ledger after 3E, S17, S21 |
| `d9e986c`, `ba7568e`, `44db2fc` | S21; S17; 3E (`npm run harness`) |
| `b3ecb2d`, `636c2f4` | A19: wells are real funnels, visible; brief §7 clarified; S22 rewritten |
| `303d268` | S16 merged (`e6eb51d`); owner's S16 answers in A15 Q05; S22 written |
| `108f4fc` | S19 merged; Tidal Orchard deferred (A15 Q21) |
| `ae562fe` | 3C reassigned to GPT/Codex and launched |
| `682957b` | This ledger |
| `5b94ed2` | `npm run harness`; wells and lattice paths split between 3B and 3C |
| `393b5a8` | A18 (3): learning burns free, `depart` requires a real Beta assist |
| `0b5cc25` | A18; study S21 |
| `ad6bec0` | 3B reassigned to GPT/Codex |
| `19a9ada` | Phase 3 applied, path releases, DECISIONS for 2G and S8, studies S16–S20 |
| `e878b7c` | Independent check of 2G's slingshot study; reference vectors |
| `454d9c8` | Speed test runs on its own after the suite |
| `3bd3425`, `a537c64` | S15; 2G (3D end to end) |
| `b82ccd8` | S13 (licence, notices, README), S14 (phases 3–5 refreshed) |
