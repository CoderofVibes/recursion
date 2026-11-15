# S9 — timing, evidence gates and action budget

Review baseline: `55d91c30fc715a92af116dcd35c085fcbf6667ca` on `st/s9-first-five-minutes`. All source line numbers below refer to that commit. This supplement combines source inspection, a new deterministic physical run, and explicitly attributed earlier 2D results. It is not a cold human playtest. The surrounding S9 report records browser observations separately.

## What five minutes means here

[ESTABLISHED: `src/console/controls.tsx:169–173`; `src/app/loop.ts:106–112`] ENTER starts at **1×**, and every new attempt resets to 1×. Before ENTER the arrival clock waits indefinitely. At that default, one ship second takes one real second, apart from extra computation delays. A view change is 0.8 real seconds; the loss sequence is 6 real seconds, unaffected by warp (`src/theme/room.ts:105–128`).

[ESTABLISHED: `src/console/pages/PlanPage.tsx:120–134`] A fresh + BURN is **prograde, 5 m/s, in 400 s**. If the judge accepts those defaults and enters, the burn will not even start in the next five minutes. CALIBRATE and WIDE are design annotations, not maneuver generators: `src/console/mission.ts:26–38,77–81,106–117` records intent and equipment setup only. They must not be described as navigation assistance or as something that turns the ship toward useful data.

[DEMONSTRATED: `tools/studies/s9/timing.mjs`, `timing-vectors.json`] On this checkpoint, a deliberately fatal **41 s retrograde burn at T+400 s** hits Alpha at **T+14,751.927 s**, approximately **4 h 5 min 52 s at 1×**, before the six-second loss presentation. This is an example chosen by the analyst, not an inevitable cold-player first loss or a recommended tutorial maneuver. A player who simply coasts is not guaranteed to lose at all; the authored no-burn test keeps the starting orbit clear for 35 ship hours (`src/content/gravity-range/gravity-range.test.ts:116–138`).

The following results come from real game physics, the real ship and recorder, and the stand-in belief navigator. They do **not** prove that the real estimator's held-out test passes. Geometry on this baseline is still the planar checkpoint carried in 3D types, not proof about the later inclined range.

| Analyst's burn, at T+400 s | Physical observation | Ship time / ideal 1× wall time | Ideal wall time at 2000× |
| --- | --- | --- | --- |
| 6.5 s retrograde | Still alive after 8 h; lowest sampled Alpha center range 703.286 km at the endpoint, still not established as periapsis | 28,800 s / 8 h | 14.4 s |
| 12.5 s retrograde | Lowest sampled Alpha center range 501.027 km, sampled at T+27,100 s; alive at 8 h | 28,800 s / 8 h for collection | 14.4 s |
| 16 s retrograde | Lowest sampled Alpha center range 422.259 km, sampled at T+24,600 s; alive at 8 h | 28,800 s / 8 h for collection | 14.4 s |
| 41 s retrograde | Collision; terminal tick 14,752, event time 14,751.927 | 14,752 s / 4 h 5 min 52 s | 7.376 s |

Sampling is every 100 ship seconds, except that the terminal tick is recorded exactly. Ranges are center-to-center; subtract Alpha's 250 km radius for approximate surface clearance, and account for the hull for collision clearance. These numbers are independent isolated attempts with the same fixed seed, not a newly validated learning sequence.

## The evidence gates the player must cross

[ESTABLISHED: `src/console/pages/ModelPage.tsx:54–55,95–110,198–212,255–273`] The console filters out every attempt still in progress. TEST requires **two finished attempts**, trains on all finished attempts other than the selected held-out one, and defaults to holding out the latest finished attempt. A test may still fail for insufficient or unsuitable evidence. Two losses, two Recalls, or one of each satisfy the outcome-count gate; no death count unlocks anything. ADOPT remains disabled until the returned result is adoptable. TEST does not adopt the law.

[ESTABLISHED: `src/content/gravity-range/index.ts:34–45`; `src/console/mission.ts:60–74`] Arrival already points the camera at Alpha and records at 0.05 Hz, so RECORD DESIGN AND SET UP is valuable for an explicit comparison but is not a hidden prerequisite for collecting baseline data. Raising the rate alone does not replace the distance variation or independent attempt needed to distinguish a law error.

[ESTABLISHED: `src/game/model-loop.test.ts:95–127`] Local calibration can make a later forecast agree inside previously sampled distances **before** a new law is adopted. Therefore “the second forecast held” is not sufficient evidence that the player learned a portable law. The intended insight requires identifying the distance-dependent mismatch, passing an independent held-out case, explicitly adopting the extension, and seeing a new issued forecast tested against fresh motion. An old frozen issued forecast must remain wrong when it was wrong.

[DEMONSTRATED: prior 2D browser run, `docs/handoffs/2D.md:82`] The earlier scripted real-estimator route used 6.5 s and 12.5 s retrograde dives, Recalls, a held-out distance-law test (fitted exponent 2.499, T/ν 1.07 against 1.14), adoption, then a 16 s dive whose forecast reached a closest approach of 185 ± 11 km clearance. This is a previously demonstrated script run, not a new S9 result and not a cold player's behavior. The current numerical supplement changes burn epoch and uses a stand-in navigator, so its clearance must not be substituted into that validation claim.

## A countable short route, not a claim of a global minimum

[ASSUMED: interface-path analysis] Count one button activation, view shortcut, select-value change or number-field edit as one **logical action**. Exclude typing individual digits, opening a select, scrolling, reading, waiting and restoring warp after alerts; actual physical interactions will be greater. This is the shortest identified route using the earlier 2D duration-based comparison protocol, avoiding optional MAP, SHIP, procedures and comparison overlays. It is not a proven minimum over all possible hands-on maneuvers or evidence intervals.

| Segment | Actions | Count |
| --- | --- | ---: |
| First collection | `3` CONSOLE → PLAN → + BURN → RETROGRADE → DURATION → enter 6.5 s → COMMIT → ENTER → Esc → `4` FLIGHT → select 2000× | 11 |
| Finish first collection | `3` CONSOLE → RECALL, after enough useful observations | 2 |
| Second collection after recurrence | `3` CONSOLE → PLAN → + BURN → RETROGRADE → DURATION → enter 12.5 s → COMMIT → ENTER → Esc → `4` FLIGHT → select 2000× | 11 |
| Finish second collection | `3` CONSOLE → RECALL | 2 |
| Independent test and explicit decision | `3` CONSOLE → MODEL → TEST → ADOPT if it passes | 4 |
| Check the adopted model on a new flight | PLAN → + BURN → RETROGRADE → DURATION → enter 16 s → COMMIT → ENTER → Esc → `4` FLIGHT → select 2000× | 10 |
| **Total** | Two finished collections, explicit adoption, third observation | **40** |

Add one action per RECORD DESIGN AND SET UP, if the judge records the intended experiment, and one action per manual warp restoration. Add a held-out-selector action if the appropriate held-out case is not the default. The quoted duration protocol's original script scheduled its burns at T+300 s rather than the UI's T+400 s; exact reproduction adds one “In” edit per dive (**43 logical actions**) and must also reconcile the release delay. Do not market the 40-action variant as numerically validated. The extra Esc actions are necessary because the console ignores the 1–4 shortcuts (`src/view3d/room/RoomView.ts:541–546`). A natural first collision removes one RECALL activation, but no S9 result establishes that the resulting retained data necessarily pass the test. A loss beyond the forecast horizon is not itself evidence that the issued forecast was contradicted.

[ESTABLISHED: `src/console/ConsoleScreen.tsx:50–56`; `src/console/pages/PlanPage.tsx:64–65`] Plan rows live in page-local React state and unmount when the console closes or another page opens. **Commit before switching to FLIGHT.** A preview → FLIGHT inspection → PLAN sequence discards the burn editor rows, leaving an empty plan able to commit a coast and replace scheduled commands. Persisting the draft in Desk is a small 2D fix that removes this avoidable loss of work without deciding the maneuver for the player.

## Wall-clock budget and its limits

[ESTABLISHED: `prototypes/shots/capture.mjs:102–106,153–178,208–224`] The earlier 2D harness collects two 28,800 s dives and watches the third through T+15,000 s. That is **72,600 ship seconds = 20 h 10 min at 1×**, or **36.3 s at an unattainably perfect uninterrupted 2000×**. Two full eight-hour collections alone require 16 h at the default. The third 15,000 s observation is before the physical minimum in the independent S9 16 s scenario; a forecast predicting closest approach is different from having watched the ship reach it.

[ESTABLISHED: `src/game/session.ts:356–373`; `src/app/loop.ts:85–100,160–169`; `src/app/hands.ts:54`; `src/game/belief/model-bridge.ts:43–50,81–85`] Requested warp is not achieved warp. Per-frame simulation work is capped, real estimator work is asynchronous, and each new caution/warning drops the selected warp to 1×. A hidden browser page holds the game. A hands-on input also returns to 1×. Any five-minute acceptance test must include these effects and deliberate player responses, not divide ship time by 2000 and call the quotient a measured duration.

[DEMONSTRATED: prior 2D run, `docs/handoffs/2D.md`, “Claims, labelled”] 2D reported 12–19 real seconds for an eight-hour dive at requested 2000× on its test machine, and reported two “off the forecast” warp drops on a deep dive. Those are contextual historical measurements, not a bound for a judge's laptop. This study does not reproduce that real-time performance in its deterministic headless physical harness.

[ASSUMED: proposed acceptance budget] A five-minute result is plausible only after the judge finds warp and knows what evidence to collect: budget roughly 30 s entry/orientation, 45 s first plan, 45 s first collection/debrief, 60 s second plan/collection/return, 45 s inspection/test/adoption, and 60 s new-plan observation — **285 s**, with only 15 s spare. This is a design target, not demonstrated feasibility. The 40–43 logical actions, interpretation burden, lost drafts, repeated warp resets and estimator delays leave little margin. Passing requires an actual fresh-save human trial; do not silently raise warp on entry, conceal uncertainty, prescribe a secretly correct burn or force a death to meet the budget.

## Requests exposed by the timing audit

- [ASSUMED] **2D: make the next operation apparent.** Show a small “plan before ENTER” cue, absolute burn time plus real-time delay at current warp, and a visible reason when warp drops. Keep manual warp selection and the 1× default. Approximately 50–100 UI lines across `PlanPage`, `TimeControls`, `FlightHud`, theme tokens; no new contract. Verify arrival preparation, advancing clock during in-encounter editing, and alert-driven return to 1×.
- [ASSUMED] **2D: retain the player's draft.** Lift burn and pointing rows into `Desk`; show scheduled versus draft state distinctly. Approximately 60–120 lines across `desk.ts` and `PlanPage.tsx`; no model change. Verify preview → view switch → return preserves the draft and cannot accidentally replace it with a coast.
- [ASSUMED] **2D: expose evidence progress without revealing the answer.** Near Black Box's retained record, distinguish “one finished attempt / another independent case needed,” “test available,” “test passed / not adopted,” and “new forecast needed.” Use existing recorded outcomes and extension-test results, not hidden truth. Approximately 80–150 UI lines. Verify empty, one-attempt, two-attempt, failed, passed and adopted states; do not enable TEST merely because a loss occurred.
- [ASSUMED] **2D: compare like with like.** Put the old frozen forecast, observed trail and newly issued model version close enough to read together, and state the observed time interval rather than implying an unflown full path held. Approximately 80–160 UI lines using existing forecast/debrief data. Check the local-calibration-before-adoption case and a forecast whose horizon expires before closest approach.
- [ESTABLISHED: `src/game/session.ts:358,397–419`; `src/console/pages/PlanPage.tsx:333–337`] **Integrator/2F/2G dependency:** COMMIT temporarily prevents `advance()` while forecasting; the page explicitly describes this hold. This existing behavior is a seam against A12, not permission for S9 to add a pause. 2D can report progress and avoid framing repeated commits as a pacing aid; the game owner must preserve epoch/issued-forecast correctness while allowing an in-encounter clock to continue. This is separate from the already known singular-matrix fault documented by 2D, whose fix is on 2G at `ab7801a`, not included in this review baseline.

## Reproduction

```powershell
node tools/studies/s9/timing.mjs
```

[DEMONSTRATED: command above] Uses installed repository dependencies, unchanged source and a fixed seed; writes `tools/studies/s9/timing-vectors.json` beside the script. It pins the reviewed commit, verifies `src/` and `data/` still match it, and records their tree hashes, constants, exact terminal event and sampled physical ranges. Documentation-only commits therefore do not alter the output. It cannot certify human discoverability, later 3D geometry, real estimator adoption, browser throughput or five-minute completion.

[DEMONSTRATED: two consecutive final-script runs] The generated JSON was byte-identical across both runs: SHA-256 `277dd4baa702dc046e0fff79fe8d4b6c2be0db5c211a3880186c8f62d3d68baa`. `node --check tools/studies/s9/timing.mjs` also passed. These are bounded checks of this study's artifact, not a new full-game regression run.
