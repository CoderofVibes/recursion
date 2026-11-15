# S9 — live browser observations

Observed 2026-11-14 Pacific at <https://coderofvibes.github.io/recursion/> using the in-app desktop browser and normal UI controls. No developer handle, injected commands, seeded archive, edited application source or private game-state access was used. This was an informed analyst following known maneuver examples, not an unaided novice. The source baseline is documented separately; the public page did not expose its deployment commit.

The first observed page showed attempt 1, model v0 and no retained completed attempt. No existing records were erased. Screenshots capture the app viewport; its size changed when the in-app browser was presented in the app panel. This is not a responsive-layout matrix or a keyboard-only playtest. Pointer-lock walking was not tested; the existing `3` shortcut opened CONSOLE. The browser needed to be visibly presented for the simulation's animation-frame clock to advance reliably; initial nonadvancement was a browser-visibility limitation, not evidence of a broken ENTER button. No `npm run dev` server was needed.

## What happened

All rows below are [DEMONSTRATED: S9 browser UI observations], except where explicitly identified as interpretation.

| Observation | Reproduction / visible result | Evidence |
| --- | --- | --- |
| Arrival | Loaded the public link. Hint: click to look, WASD to walk, aim at the console. Four labelled station pads; no visible numbered shortcuts. | [01 arrival](screenshots/01-live-arrival.jpg) |
| Preparation | Pressed 3. MISSION showed CALIBRATE/WIDE, reserve 5,400 kg, clearance 50 km, camera TRACK/Alpha, recorder 0.05 Hz. T=0; two ENTER controls. | [02 mission](screenshots/02-live-mission.jpg) |
| Recording is not maneuver planning | Clicked RECORD DESIGN AND SET UP, then PLAN. Burns 0; no plan scheduled. + BURN produced prograde 5 m/s, in 400 s, about 6.3 s duration. | [03 default plan](screenshots/03-live-plan-default.jpg) |
| Deliberate first loss probe | Edited In 300 s, RETROGRADE, DURATION 41 s, throttle 100%. PREVIEW showed v0, horizon T+03:36:00, Alpha closest 258.7±44.4 km at that horizon. COMMIT issued the forecast and scheduled 3 commands. | UI snapshots during run; [04 flight](screenshots/04-live-flight-forecast.jpg) captures the later flight state. |
| ENTER / view switching | ENTER began 1× after the frame loop ran. Selected 2000× explicitly. `4` alone did not leave CONSOLE; Escape then 4 did. | Source agrees with `RoomView.ts:541–546`. |
| Limited old forecast | Around T+02:54 the flight miss was about 13–14 km / 0.7σ. At T+03:44:31, the forecast had expired and the HUD said PAST THE FORECAST HORIZON. | [04 flight](screenshots/04-live-flight-forecast.jpg); later AX snapshot. |
| Return and retention | Later observation found the room at attempt 2/T=0. Opened CONSOLE; BLACK BOX had the lost attempt and 13,007 retained records. The intermediate shake/black timing was not stopwatch-measured; the six-second sequence comes from source. | [05 returned door](screenshots/05-live-return-at-door.jpg), [06 loss debrief](screenshots/06-live-loss-debrief.jpg) |
| Outcome versus prediction | Debrief: lost/collision at T+04:04:08; main propellant used 305.7 kg; 13,007 records / 3.0 MB. “Contact with an object the ship could not identify”; forecast v0 “held · worst 2.4σ”. Minimum recorded clearance 16.7 km and ranged Alpha to 266.7 km. These are sampled/recorded values, not the unobserved exact collision geometry. | [06 loss debrief](screenshots/06-live-loss-debrief.jpg) |
| One attempt cannot test | MODEL v3, one attempt/243 fit measurements, Alpha strength slope −0.26. Hold out/TEST/ADOPT disabled with the explanation that two finished attempts are needed. | [07 one-attempt model](screenshots/07-live-one-attempt-model.jpg) |
| Second observation | Planned RETROGRADE 12.5 s at T+300 s, committed before leaving PLAN. Forecast v3 ended T+06:42:00 and predicted Alpha closest 257.7±27.2 km at T+06:28:00. ENTER, manual 2000×, Escape→4. | UI snapshots. |
| Contradiction and warp stop | Around T+04:19:45: miss 70.7 km / 3.0σ, warp had returned to 1×; hidden console footer read “warp to 1× · off the forecast.” Later T+04:28:43 showed 79.3 km / 3.1σ and visible OFF THE FORECAST. Manually resumed 2000×; alert reappearance required another explicit restoration. | [08 second-attempt miss](screenshots/08-live-second-attempt-miss.jpg), AX snapshots. The screenshot is near the threshold; the later 3.1σ result is from the text snapshot. |
| Extended collection / Recall | The second collection continued while the written audit was prepared. It exceeded 28 ship hours before Recall; this was **not** the prior 2D eight-hour protocol. Recall returned to attempt 3 at arrival with both records retained. | Visible T+28:29:01 before opening the recall control; next observed state attempt 3/T=0. Exact recall timestamp not separately recorded. |
| Held-out test | MODEL defaulted to holding out attempt 2/recalled; attempt 1/lost was the other completed record. TEST became enabled and was activated. The interface showed TESTING with ADOPT disabled while the result remained pending. | [09 held-out test](screenshots/09-live-held-out-test.jpg). Final observation status is recorded below. |

## What this establishes, and what it does not

[DEMONSTRATED: screenshots 06–08 and UI snapshots] The first lost flight retained data and a changed model, but did not exceed its forecast's uncertainty inside the compared interval. The later second attempt did visibly exceed 3σ. These are different evidential claims. [ASSUMED] The first debrief should say “within envelope through the covered interval; no forecast after horizon” rather than an unqualified “held”. Do not manufacture an earlier discrepancy to make the story cleaner.

[DEMONSTRATED: UI sequence] The core recurrence and independent-attempt gate are visible through ordinary controls. A second live attempt alone does not unlock TEST; finishing it does. The screen never asks the player to type 2.5.

**No five-minute performance claim:** the analyst already knew view keys and burn examples; took screenshots, read source and wrote documents between actions; explicitly selected/resumed 2000×; and let the second run overcollect. Deterministic background probes also used CPU for part of this session. Wall time here is not a hardware benchmark, cold-player completion time or shortest-route measurement.

**Final observation:** the page still showed TESTING and disabled ADOPT; the model panel showed v9, two attempts and 1,553 processed measurements. No test result had appeared. I saved screenshot 09 and closed the temporary audit tab. This is an unresolved test in this bounded browser inspection, not a recorded rejection, a pass or proof that it could never finish. The unusually long second arc and unidentified deployed revision make it unsuitable as a normal five-minute acceptance trial.

**No new successful adoption claim:** this browser probe's two records differ materially from 2D's previously passing pair. Its recorded test state must not be cited as a pass. The complete post-adoption path in the walkthrough is supported by the existing 2D handoff/source and is a verification target for the new UI work; it is not silently substituted for this session's result.

Source inspection supplements the screenshots where an intermediate animation or focus order was not exercised. The full static keyboard audit does not claim that a screen reader or pointer-lock walk was run. Later 3D geometry, new seed variation, rock ranging, Beta slingshot and the integrated model fix need their own validation.
