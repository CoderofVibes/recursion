# Coordination ledger

The live state of the build between threads: who is running, who holds which shared file, and every open request or agreement between threads. **The integrator updates it on every relay, merge, launch and gate change, in the same commit as the change.** Threads read it; they don't edit it. They send changes to the integrator through the owner.

**Integrator, after a compaction or in a new main thread:** read this file first (the "Morning" section, if it's still there), then `git log --oneline -15`, then the handoffs of any thread marked running.

**Last updated:** 2026-11-15 morning, new main thread. Merging the overnight branches in the Morning section's order: **NIGHT, VX and 3C merged**; 3B, ART and S23 to follow.

## Threads

| Thread | Model | Worktree · branch | Status | Gate or next step | Last merged into main |
|---|---|---|---|---|---|
| 2D control room | Opus 5.5 | `.worktrees/2d` · `p2/2d-control-room` | **Paused overnight**; all merged (`0ee3d1c`): region picker (A25), 2F's screen data, funnels in the window, A24 monitor on SYSTEMS, A20 slice | Resumes from main; waiting on: 2F's new fields drawn, the monitor reading, truth-side funnel projection, 3C registering ChainLinkPanel | `0ee3d1c` |
| 2G speed pass | Opus 5.5 | `.worktrees/2g` · `p2/2g-3d-flight` | **Done**, evidence and handoff merged. Next per-tick target: the environment step (rock visibility); a quiet-machine rebaseline is still to run (R11) | — | `bc292a9` |
| 2F game loop | Opus 5.5 | `.worktrees/2f` · `p2/2f-game` | **Paused overnight**; all merged (`0ee3d1c`), including R38's contract fields | Resumes from main with: the monitor's caution (R37, restore the tripwire), sensors within the tick, the wells' save seam | `0ee3d1c` |
| 2C model and Black Box | Opus 5.5 | `.worktrees/2c` · `p2/2c-model` | **Paused overnight**; all merged | Resumes with: R32 once the funnel channel lands, R37's monitor in the Black Box | `0ee3d1c` |
| 3B Inverse Wells | GPT/Codex | `.worktrees/3b` · `p3/3b-wells` | **Overnight done, unmerged** (`a6887f0`, 9 ahead): handed the channel to 3C and took its fix unchanged; harness admission rerun | See Morning; findings and owner requests in its `ADMISSION.md` | `91a666a` |
| 3C Chain Link Fence | GPT/Codex (GPT-6 Astra) | `.worktrees/3c` · `p3/3c-lattice` | **Done, merged** (this commit, from `8a1713b`): owns `src/ship/sensors/wells*`; the funnel channel fixed (R45) and wired into the dispatcher and recorder budget (R36); the radiation monitor's sensor and caution (its half of R37); contracts `radiation-monitor.ts`, `wells-acquisition.ts` (additive, reviewed) | Left for others: live scenes (the wells' window producer, R31), reconstruction (R32, R46), the radiation-triggered warp drop (R37) | (this commit) |
| 3E playability harness | GPT/Codex | `.worktrees/3e` · `p3/3e-harness` | **Done**: `npm run harness` (smoke, reference, learning, routes, all); its pending-acceptance list names the gaps | — | `44db2fc` |
| 3A power and thermal | GPT/Codex | `.worktrees/3a` · `p3/3a-power-thermal` | **Done**: causal radiation and thermal faults, heaters, physical service signals (`electricalService`, `energizedEquipment`); command tape identical; 72 h transit sustainable | Its wiring is 2F's (R26) | `767100b` |
| 3D expedition | Opus 5.5 | not created yet · `p3/3d-expedition` | **Gated** | After 2F's and 2C's first checkpoints merge | — |
| 3F console v2 | Claude | — | **Gated** | After 2D hands off | — |
| S16 Well Garden layout | GPT/Codex | `.worktrees/s16` · `st/s16-well-garden` | **Done**: three-well prototype, 25-entry catalogue, garden budget (A15 Q05) | — | `e6eb51d` |
| S23 the opening | GPT/Codex | `.worktrees/s23` · `st/s23-the-opening` | **Done, unmerged** (`3d93895`, 1 ahead) | OP built from it; merge for the record | — |
| OP the opening | GPT (base) then Opus 5.5 | `.worktrees/op` · `p3/op-opening` | **Merged** (`6ac2397`): the 19.5 s opening, replay and Skip, reduced motion, room hooks (R23), the home window shared with the ending. Not yet in the game: only the dev preview plays it (R41). Its dev server and launch entry are removed | Gate once per browser (A25) | `6ac2397` |
| VX window and sky visuals | GPT/Codex (GPT-6 Astra) | `.worktrees/vx` · `p3/vx-visuals` | **Done, merged** (`01a0947`, from `ac5be1e`): the deep sky (baked cubemap), the opening's Earth and title, cloud and funnel optics wired into the window. Handoff `docs/handoffs/vx.md` | Window side of R31 is complete for `WindowFunnel` entries; the Well Garden's producer is not (R31). S15 gate fails (R49). Theme owner may adopt `sky/style.ts` | `01a0947` |
| NIGHT judge's run | Claude (Fable 5.2) | `.worktrees/night` · `p3/night-hardening` | **Done, merged** (`42b5c36`, from `cb1ace1`); report `docs/handoffs/night.md`; judge-run driver in `docs/handoffs/night/judge-run/` | Its found-not-fixed list feeds R46–R48 | `42b5c36` |
| AU basic audio | GPT/Codex | `.worktrees/au` · `p3/au-audio` | **No work on the branch**: 0 ahead of main, worktree clean at `b5f84ac` | Ask the owner whether AU ran, or where its work is | — |
| ART window references | Owner's choice (Claude or GPT) | `.worktrees/art` · `art/window-references` | **Running, unmerged** (`49cfd09`, 9 ahead; through round 7 prompts). **References only (A23): no image ships or is committed** | Outputs `docs/art/`; merge docs only | — |
| S22 well field (real funnels) | GPT/Codex | `.worktrees/s22` · `st/s22-big-well-field` | **Done**: funnels 120 km long, 20 km mouth, 1 km throat, pull 0.02–0.10 m/s²; 2,601 sites, 650 appearing; owner questions open | Feeds 3B (R12) | `15171df` |
| S17 lattice first contact | GPT/Codex | `.worktrees/s17` · `st/s17-lattice-first-contact` | **Done**; five owner questions open | Feeds 3C (R8), 3A, 2C | `ba7568e` |
| S18 tether gate | GPT/Codex | `.worktrees/s18` · `st/s18-tether-gate` | **Done**: the load gate passes as a slower turning manoeuvre; four owner questions open | Future tether work | `32a8b67` |
| S19 tidal check | GPT/Codex | `.worktrees/s19` · `st/s19-tidal-check` | **Done**: Tidal Orchard deferred (A15 Q21) | — | merged, see log |
| S20 3D recheck | GPT/Codex | `.worktrees/s20` · `st/s20-3d-recheck` | **Done**: S9 replayed on 3D, S12's ledger refreshed, demo shots, S15 rerun | Findings to 2D (R5), 2F, 2C, the submission | `6267a53` |
| S21 belt and power | GPT/Codex | `.worktrees/s21` · `st/s21-belt-power` | **Done**; two owner questions open | Values go to 2F (R6), 3A; cloud seam R14 | `d9e986c` |

Prompts: Phase 2 in `phase-2/`, Phase 3 in `phase-3.md`, studies in `studies/`. The resume notes for 2D, 2G, 2F and 2C were sent through the owner on 2026-11-14 and are summarised in the Status column.

## Overnight (2026-11-15, while the owner sleeps)

Owner's plan, to remove copy-and-paste relays overnight. Claude threads 2D, 2F and 2C commit a checkpoint and **pause**. Every thread below is self-contained, with no relays needed.
- **NIGHT** (Claude Fable, long): holds 2D's, 2F's and 2C's lanes for fixes (see `phase-3-extras.md` §NIGHT). Does the photosensitivity fix, the picker, the opening's mount, then the judge's run.
- **VX** (GPT): visuals, **and** wires them into the window itself tonight. Scoped exception: `src/view3d/room/outside.ts` and the window parts of `RoomView.ts`.
- **3C** (GPT): takes over `src/ship/sensors/wells*` from 3B tonight. It fixes 3B's channel (3A's `functionAvailable` and the shared `functionalPower`; total draw only in telemetry) and wires it into the dispatcher (R36).
- **3B** (GPT): hands its channel to 3C, then continues the harness admission runs in its own lane.
- **AU** (GPT): audio, in its own lane.

In the morning the integrator merges in this order: the paused threads' checkpoints, NIGHT, VX, 3C, 3B, AU. It smoke-tests each, and the owner reviews before anything else resumes.

## Morning (2026-11-15): the overnight results, for the new main thread

Nothing below is merged. **Merge in this order**, each `--no-ff`, with `npm run check`, `npm run build` and a smoke test of the production build after each, updating this ledger in the same commit:

1. **Merged.** **NIGHT** `p3/night-hardening` (`cb1ace1`, 10 commits; 1,254 tests). Report: `docs/handoffs/night.md`, 14 screenshots and the replay driver in `docs/handoffs/night/`.
   - Fixed: R43 (the loss sequence's busiest second went from ~13 flashes to at most 3, on an authored schedule, tested; reduced motion neither shakes nor flickers). R41 and R44 (the opening plays in the game once per browser and wakes into the Gravity range; reduced motion is a still sky and a plain fade). Twin Deeps blockers: the model fell minutes behind after a long attempt, so TEST hung for 9+ minutes (now under 30 s); no off-forecast or close-pass alert fired on CONSOLE, SHIP or MAP, so warp never dropped there (now it does). Cathedral dead ends: FLIGHT opened at 1,500 km in a region a few km across (now per-region scale); the Black Box function was on no screen (now beside FLIGHT, wired to the model's lattice). Smaller: the hologram after a loss, MODEL's sideways scroll, objectives on MISSION, one counted line for 216 precursors, two labels.
   - **Touched 3C's lane:** `src/console/encounters/chain-link/index.ts`, judged a dead-end fix. Keep unless the owner says otherwise.
   - Found, not fixed (ranked; eight more in the report): (1) the Cathedral can't be threaded: on the twenty-fence lattice the model supports 0 of 2,952 fitted features after 201 frames at 1,000 W (2C's fit; NIGHT didn't touch its thresholds); (2) the true law fails its held-out TEST on long or messy attempts though the fitted exponent is right (2.5001), so the judge's README needs the recipe: two dives of a few hours each, Recall after each, then TEST; (3) the wells aren't drawn in the window: FLIGHT says "216 precursors in the window" and the window shows stars.
   - Judge's-run verdict: Twin Deeps is a complete loop (plan, fly, lose, recur, learn; "leave" not reached in one blind try). The Well Garden and the Unseen Cathedral are previews: arrive, meet the hazard, die, read why.
   - Tooling: S15's and S20's runners and `prototypes/shots/capture.mjs` wait for the room on a fresh profile, now behind the 19.5 s opening; the report gives the one-line marker to set first. NIGHT added a `night-preview` entry (port 4311) to the main checkout's ignored `.claude/launch.json`.
2. **Merged.** **VX** `p3/vx-visuals` (`ac5be1e`, 4 commits). One conflict in `RoomView.ts` (the render tail): kept NIGHT's cut to black, then VX's `followEye`. The shared sky, the opening's look, fx helpers, wired into the window (scoped exception: `outside.ts`, the window parts of `RoomView.ts`). Zero console errors in all three regions. Handoff has before-and-after screenshots. **Limits:** live funnels wait for the Well Garden's optical-data producer; **S15's modest-profile release check fails** (evidence in its handoff). Expect conflicts with NIGHT in `src/view3d/` and the opening.
3. **Merged.** **3C** `p3/3c-lattice` (`8a1713b`, 6 commits; 1,296 tests). Took over `src/ship/sensors/wells*`, merged 3B's `4692625` and fixed it (R45): funnel acquisition uses 3A's availability and useful-power helpers, records total draw, shares recorder capacity fairly with lattice data. Remaining for others: live scenes, reconstruction, radiation-triggered warp drop.
4. **3B** `p3/3b-wells` (`a6887f0`, 9 commits; 1,329 tests). Consumed 3C's fix unchanged. 26 harness cases repeat exactly; 11 of 14 nominal flights complete (three miss the ten-hour window); crush and birth-veto controls pass. Admission incomplete; findings and owner requests in its `ADMISSION.md`.
5. **ART** `art/window-references` (`49cfd09`, docs only; check no images are committed) and **S23** `st/s23-the-opening` (`3d93895`).
6. **AU:** nothing to merge (see Threads).

**Then** give the owner a short "here's the game now" and settle today's plan with them, one decision at a time. Open for today:
- **The scope line for the submission:** Twin Deeps is the complete loop; the Well Garden and the Cathedral are previews. Which (if any) gets more work today, and which paused threads (2D, 2F, 2C) resume, on what.
- **The Cathedral can't be threaded** (2C's fit): fix today, or present it honestly as a preview.
- **Wells in the window:** who builds the optical-data producer VX needs (2D or 3B), or leave the Garden as a preview.
- **S15's release check fails after VX:** tune VX's level of detail, or accept with a note.
- **The judge's README:** the picker and the Twin Deeps recipe.
- **AU:** did it run? Without it the game ships silent.
- **Submission:** S12's opening line, demo format and capture, `docs/submission/`, the portal, and when the owner calls the switch (a couple of hours before 5 pm Pacific).
- Still open from before: credits or a debrief after the ending; the loss audio at the reveal; reduced motion (R44, integrator chose a still sky).

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
| R1 | 3B, 3C → 2F | Loading interface; fields into the simulation | **Done** `82f906b`: all three encounters load in the production build | |
| R2 | 3E → integrator | `npm run harness` → `node tools/harness/run.mjs` | **Done** `5b94ed2` | |
| R3 | 2F ↔ 2C | A18 (1): the forecast is computed from the moment of commitment while time keeps running | **Agreed** (both prompted) | Model side is 2C's; game side is 2F's |
| R4 | 3B, 3C → 2D | Mount points for encounter UI in `src/console/encounters/` and `src/view3d/fields/` | **Done** `635245f`: panels register themselves beside FLIGHT; FLIGHT zooms to 120 m in the Chain Link | The panel's data comes from 2F |
| R5 | S20 → 2D | S9 replayed on the 3D build | **Landed** `6267a53`; relay to 2D | Most S9 fixes still open; priorities: retained PLAN drafts, routes and warp reasons, focus, comparison intervals, recorder estimates, departure frames; wire `WindowView` and `fitFailure` |
| R6 | S21 → 2F, 3A | Belt size (A18 (2)) and power values (A18 (5)) | **Landed** `d9e986c`; relay once the owner answers S21's two questions | Radiation-cloud crescent, ~830 km pass target, 120 s critical-power rule, 4 h endurance caution |
| R7 | S16 → 3B | Well Garden layout, seeds and vectors | **Done** `e6eb51d`: the three-well prototype for 3B's mechanics | The owner then asked for a big field (R12) |
| R8 | S17 → 3C | First-contact numbers: dose, failure order, Black Box function cost, reconstruction | **Landed** `ba7568e`; relay with the owner's answers to S17's five questions | Also asks 3A (causal failures), 2C (reconstruction and retention), integrator (subtick acquisition schedule in `truth-step.ts`, contracts) |
| R9 | 3C → 2C | The lattice reconstruction and the Black Box function (A16) | **Done** `e4df230` | |
| R10 | 3C ↔ 3A | Component faults from radiation: electrics and instruments (A16) | **Agreed and published**: 3A's `nextConditionBoundary`, `stepCondition` and `functionAvailable` are on main; 3C's sensor adapter merges with them | Raw thresholds 8/10/20 U (power switch/standard/hardened) |
| R11 | 2G → integrator | Release check from A18 (7): achieved warp on the modest profile | **Measured; the limit is frames, not the ship.** Each frame runs exactly 8 ticks (the 10 ms budget is checked every 8 ticks, and 8 ticks already exceed it), so achieved warp = 8 ÷ frame interval: 67–264 ship-s per wall-s at best, under S15's pre-3D 270–490. 2G's cut saves about 2.7 ms per frame. See R18 | Rebaseline on a quiet machine; a real-laptop check |

| R12 | S22 → 3B | Wells as real funnels (A19): pull, reversal along the axis, crush at the throat; 2,601 sites through 3D at random axes, 650 that appear (900 s precursor, 120 s ramp, a 240 s guard that cancels unsafe births); a reuse map | **Landed** `15171df`; relay once the owner answers S22's questions | Crossing ~122 kg main; slow bypass still 727 kg over 51.5 days; fast bypass 2,593 kg |

| R13 | 3B → 2D | The funnels in the window view (A19: wells are visible, with striking visuals). 3B draws them in `src/view3d/fields/wells/`; 2D mounts them in the room's window and FLIGHT | **Open:** to relay | Folds into R4 |

| R14 | S21 → 3C, 3A, 2F | The radiation-cloud crescent | **Done** `920a9ed`: the clouds harm through 3A's condition model; the arrival targets 830 km. Not yet visible in the window (R38) | |
| R15 | 3C → integrator | Typed acquisition and coverage contracts (from `src/ship/sensors/lattice-observations.ts`; 3C's handoff, "A16 update — concrete shared seams"), plus an archive/save schema bump | **Granted to 3C as a scoped exception**: additive types only; 2C (Black Box) and 2F (save) agree the schema bump | Integrator reviews at merge |

| R16 | 3C → integrator | Land 2F's deterministic-clock fix so 3C's full check goes green | **Done** `7b01be8` | |
| R17 | S20 → 2F, 2C | Expose believed departure/progress, keep command and forecast epochs while time runs, reconcile PLAN's 400 s default with the 480 s turn allowance; make the real-model loop test deterministic; investigate the populated-archive commit wait | **Open**: relay | |

| R18 | Owner → 2F, 2D | Faster coasting (A20) | **Both halves merged**: 2F's budget (10 ms, 14 ms coasting, `setFrameBudget`), 2D's 12 frames/s cadence. With a 40 ms stand-in slice, modest-profile warp went from 84–141× to 212–220×; the combined setting is still to be measured | 2D measures with S15's runner |

| R19 | 3B → integrator | S22's forward exit is a disc crossing; `reach-region` takes spheres | **Decided by the integrator:** the prototype uses a destination sphere entirely beyond S22's exit plane; an exact disc waits for playtest evidence | |
| R20 | 3C → 2F | In `truth-step.ts`: build the environment at every real acquisition state (`createChainLinkEnvironment(setup).at(state)`), not one frozen scene per second; schedule within the 1 s step to the earliest sensor, recorder, dose, trip or failure event, then integrate the rest; keep acquisition time separate from product availability; swept whole-ship admission for physical exits | **Open**: relay | After the fields wiring (R1) and A20 |

| R21 | 2C → integrator | Forecast contract: `presentBody`, `presentAge`, `stale` and the bodies' share of the envelope | **Done** (this commit): optional fields on `ForecastDetail` and `ForecastSigmaBySource` | 2D can show them |

| R22 | 3C → 2C, 2F | Versioning for the lattice: chain-link save format 2 for the twenty-fence world; old attempts keep their original archive and frame; new channels `lattice.angular-fragments.v2` and `lattice.raw-tile.v1` fit the unchanged `Measurement`/`AttemptRecord` shape. 2C versions its reconstruction caches and says whether the archive store needs a migration; 2F confirms the save side | **Open**: integrator approves the shape; awaiting 2C's and 2F's agreement | 3C changed no IndexedDB or shared save schema |

| R23 | OP → 2D | The room hooks (window scenery, scripted shots, alarm lighting) in `RoomView.ts`, `outside.ts` and `shell.ts` | **Merged** `6ac2397`; 2D to accept them. Merging main will conflict with 2D's funnels-in-window work in `outside.ts`: keep both | |
| R24 | AU → 2D | One mount line in `src/app/` for the audio module, plus a mute control | **Open** | |
| R25 | AU → owner | The cue list in `docs/audio/cues.md` with ElevenLabs prompts; the owner generates the files into `public/audio/` | **Open**: waits on AU's first checkpoint | Credit ElevenLabs (A22) |

| R26 | 3A → 2F | 3A's wiring | **Done** `920a9ed` | |
| R27 | 3A → 2C | Consume `condition-changed` events | **Done** `e4df230`; found that 3A emits true, not reported, condition (R34) | |
| R28 | 3A → integrator | Console set to the `hardened` radiation profile (A16) | **Done** (this commit) | Save/field chronology versioning when the encounters land |

| R29 | 2D → 2F | `model-loop` test under load | **Done**: timeout 900 s; the integrator also set a 30 s default per test (`vitest.config.ts`) | |

| R30 | 3B → 2F | Wells in the tick | **Done** `920a9ed`: crush loss at any hull contact with an active throat; the lifecycle advances with the ship's real state; a new precursor drops warp to 1×. Save seam and work ledger still open | |
| R31 | 3B → 2D | Funnels in the window and FLIGHT: `projectFunnelOptics` / `makeOpticalFunnelView` with LOD and culling across ~2,600 sites; exact segment clipping in `FieldViewContext`; release disposed materials from `LineSet` | **Open**: relay | Folds R13. The registration cycle is already fixed by the integrator |
| R32 | 3B → 2C | Acquire contour bearings and phase through the real camera; fit funnel geometry, pull and reversal separately from motion and IMU evidence; no catalogue coordinates as belief | **Open**: relay | After R9 |
| R33 | Integrator | Fixes on merging 3B: its acquisition test imports `ModelService` from `src/model/service.ts` (2C's index exports the type only); the field-view registry moved onto a hoisted function (Vite's eager glob put plugin registration ahead of the const) | **Done** (this commit) | Tell 2D (its `fieldViews.ts`) and 3B |

| R34 | 2C → 3A | `condition-changed` carries the reported condition | **Done** `246248c` | |
| R35 | 2C → integrator | True per-component dose in the Black Box | **Done** `246248c`: 3A removed true-dose `exposure` events; the radiation monitor (A24) supplies the honest reading | |
| R36 | 2C → integrator | The funnel camera channel R32 needs | **3B builds the channel and contract** in `src/ship/sensors/wells*`; **3C wires it into the dispatcher and recorder-packet budget** in `src/ship/sensors/index.ts` (3C's file, where it's already working), using 3B's published API. **Done** (3C, merged with this ledger) | R32 after it. No funnel scene reaches the camera yet: the Well Garden supplies none (R31) |

| R37 | Owner → 3C, 2F, 2C, 2D | The radiation monitor (A24). 3C: the sensor, a point-sampling helper and a decoded radiation caution in `src/ship/sensors/`. **2F:** the environment supplies the monitor's point signal from all active fields, including the Gravity range's clouds; `session.ts` consumes the recorded caution at once, drops warp to 1× and stops that frame's remaining ticks. 2C records it and shows it in the loss review; 2D shows the dose rate and caution | **3C's half done** (merged with this ledger): sensor, point sampling, decoded caution; APIs in `src/ship/sensors/RADIATION.md`. **Open:** 2F (point signal from all fields; the caution drops warp), 2C (loss review), 2D (show it) | In the production build SYSTEMS › RADIATION reads "no reading" in the Cathedral |

| R38 | 2F → integrator | Contract fields for clouds and funnels in the window and the departure | **Done** `0ee3d1c` (2F, scoped exception); 2D to draw the clouds | |
| R39 | Integrator | On merging 2F: its radiation caution was driven by true per-component dose (removed in R35). `clouds.test.ts` now asserts no caution until the monitor's caution (R37) lands; that tripwire then fails and 2F restores the 20 s figure | **Done** (this commit) | |

| R40 | Owner → 2D | The region picker (A25) | **Done** `0ee3d1c`: a Regions panel at the top of MISSION, with the owner's label | NIGHT: item 2 is already done |

| R41 | OP → 2D, OP | Put the opening in the game: 2D mounts `OpeningGate` in the app entry (`src/app/App.tsx`) ahead of the room, waking into the Gravity range. OP changes its gate (`src/app/opening/launch.ts`) from once per save to once per browser (A25) | **Done** (NIGHT, merged with this ledger): once per browser; `?opening=replay` replays with Skip; a region opened by its own address leaves the marker alone | Owner's call if the opening should precede whichever region a browser opens first: one line, `appOpening` in `launch.ts` |
| R42 | OP → AU | Cue times moved with the 19.5 s opening: opening-rumble 6.5 s, alarms 6.6/7.8/8.47, loss-failure 9.35, black-cut 10.65, opening-title 11.95, **new** title-out 15.9, room-wake 17.9 | **Open**: relay | |
| R43 | OP → 2D | **Photosensitivity:** the ordinary loss sequence (A8) flickers faster than 3 times a second. Fix it before the ending (A17) reuses it. Also: Earth and title-size tokens | **Done** (NIGHT): an authored schedule, at most three flashes in any second, tested at 24–144 frames/s; reduced motion neither shakes nor flickers. Earth and title tokens: VX | `motion.flicker` is defined and unused; gate it if anything adopts it |
| R44 | Integrator | Reduced motion in the opening keeps the slow star bending but not the swelling dark. Integrator's call: a fully still sky with the alarm light and a plain fade to black, the safer choice for motion sensitivity. The owner may overrule | **Done** (NIGHT): still sky, steady alarm light, plain fade | The owner may still overrule |

| R45 | 3C → 3B | 3B's funnel channel (`4692625`) imports the removed `sensorFunctionAvailable` and counts leakage heat as camera power | **Overnight: 3C takes `src/ship/sensors/wells*` and fixes it**, then wires it (R36). **Done** (3C, merged with this ledger): 3A's availability and useful-power helpers; total draw in telemetry only; recorder capacity shared fairly with lattice data | 3B consumed it unchanged |

| R46 | NIGHT → 2C (with 3C) | **The Cathedral can't be threaded.** At 1,000 W for 150 s: 201 frames, 19,296 fragments, 18,999 tracks, 2,952 fitted features, **0 supported** ("too few" observations); nearly every fragment starts its own track. 2C's flight test passes on one 160 m fence; the encounter has twenty overlapping fences. Repro: `src/game/lattice-loop.test.ts` with `survey` → `thread` | **Open**: owner decides today (fix, or present as a preview) | NIGHT left 2C's gates and thresholds alone. NIGHT also registered `ChainLinkPanel` in 3C's `src/console/encounters/chain-link/index.ts` (2D's request 13); kept, tell 3C |
| R47 | NIGHT → 2C | The true law fails its held-out TEST on long or messy attempts (39 h held out: T/ν 926,160,514 against 1.05) though the fitted exponent is 2.5001; the page reads as "the law is wrong" | **Open**: owner decides today | Meanwhile the judge's README gives the recipe: two dives of a few hours, RECALL after each, then TEST |
| R48 | NIGHT → integrator | S15's and S20's runners and `prototypes/shots/capture.mjs` wait for the room on a fresh profile, now behind the 19.5 s opening: set `localStorage['recursion:opening-seen'] = '1'` before page scripts, or load `?encounter=…` | **Open** | Needed before any S15 rerun |
| R49 | VX → integrator | **S15's release gate fails after VX** (modest profile, 4× CPU throttle): frame p95 Room 54.7, Flight 109.1, Map 72.8, Ship 97.0 ms against 33 ms; cold room readiness 3.4 / 2.4 s against 2.5 s. Profiles point at program setup and draw submission, and the belief-side snapshot helpers (`standin-model.ts`), not only VX's sky | **Open**: owner decides today (tune level of detail, or accept with a note) | Uncontrolled host; a quiet-machine rerun needs R48 first. Evidence `docs/handoffs/vx/performance.json` |

Add new rows at the bottom with the next ID. Never renumber.

## Owner decisions still open

- **Submission:** the summary's opening and the demo format (S12, `docs/studies/s12/`). Taken at the submission switch.
- **S9:** whether the five-minute target means insight plus a fresh observed forecast (recommended yes); whether to allow a shorter evidence opportunity if the UI fixes miss it (recommended yes). Show the 1–4 view shortcuts: folded into 2D's R1.
- **S10:** keep the four reference pictures out of the release (recommended yes); confirm the live challenge listing and GMAT data eligibility (owner check).

Decided: A15 (S11's queue), A16 (the lattice), A17 (the ending) and A18 (the Gravity range after 3D).

## Merge log, newest first

| Commit | What |
|---|---|
| (this commit) | 3C merged (`8a1713b`): the funnel channel fixed (R45) and wired (R36); the radiation monitor's sensor and caution (R37, 3C's half); two additive contracts reviewed. Check 1,355 tests + speed test, build, harness smoke (3 pass), production smoke of the opening and all three regions, live flights in the Well Garden (designed loss at T+00:29) and the Cathedral (power, heat, Black Box live), no page errors |
| `01a0947` | VX merged (`ac5be1e`): the deep sky, the opening's Earth and title, window optics; `RoomView.ts` conflict resolved keeping both. Check 1,260 tests + speed test, build, harness smoke (3 pass), production smoke of the opening, reduced-motion opening and all three regions with no page errors |
| `42b5c36` | NIGHT merged (`cb1ace1`): R43 photosensitivity, R41/R44 the opening in the game, Twin Deeps' two loop blockers, the Cathedral's dead ends, judge-run driver. Check 1,254 tests + speed test, build, harness smoke (3 pass), production smoke of the opening and all three regions with no page errors |
| `a60b76d` | Ledger: the overnight results recorded for the new main thread (nothing merged) |
| `d95f599` | Ledger: 2D, 2F, 2C paused and merged; overnight plan live |
| `0ee3d1c` | 2D (paused): region picker (A25), 2F's screen data, funnels in the window, A24 monitor, A20 slice; OP's room hooks kept |
| `ec5189f` | 2C (paused): checkpoint |
| `460111f` | 2F (paused): R38 contract fields; checkpoint |
| `ed5e882` | Overnight plan: NIGHT, VX, 3C takes the wells channel (R45) |
| `0c13a9e` | A21 as built; VX written; ledger R41–R44 |
| `6ac2397` | OP: the opening |
| `b877e53` | Tripwire for the radiation caution (R39); 30 s default test time limit; ledger |
| `920a9ed` | 2F: wells, lattice environment, 3A wiring, clouds, A20 budget |
| `cac0ea4` | 3A's fixes merged; ledger R34–R37 |
| `246248c` | 3A: reported condition, no true-dose events |
| `5542b25` | 2C merged; ledger R34–R36 |
| `e4df230` | 2C: lattice reconstruction (R9), condition events (R27) |
| `43e18d9` | 3C follow-up: shared availability, leakage fix, integration tests |
| `1f0dfef` | Integrator fixes on merging 3B (R33); ledger R30–R33 |
| `91a666a`, `82f906b` | 3B (Inverse Wells); 2F (fields wired, power rule, swept exits) |
| `1d000f9` | Chain-link abort test gets a 30 s timeout (load); ledger |
| `635245f`, `acc648d` | 2D (S9, S15 fixes, screens, A20 half); 3C (Chain Link Fence) |
| `46a1783` | Console hardened (R28); ESLint gives docs scripts Node globals; ledger R26–R28 |
| `767100b` | 3A: power, thermal and condition |
| `b5f84ac` | A21, A22; S23, OP, AU; R23–R25 |
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
