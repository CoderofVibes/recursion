# S20 — local browser observations

## Method and boundaries

[ESTABLISHED: study protocol] Review the unmodified production build at the frozen source in [README](README.md), served only on loopback. Use a separate origin from the performance runner, so it starts without retained evidence. Operate visible buttons, fields and keys; no injected game commands, edited storage, developer game handle or synthetic records. Capture the app viewport, with no browser/account chrome. Retain screenshot timestamps and the visible ship/attempt/model identifiers.

S9 was an informed analyst inspection, not an unaided novice or a timed five-minute completion study. This replay follows that method. A default-warp check and the later analyst-directed evidence collection are separate. The latter uses known maneuvers to test the feature and prepare recording instructions; it is not evidence that a new player discovers them.

The performance matrix ran before this animated browser. Other host test processes were discovered during that matrix; the follow-up and confound are documented in [performance](performance.md). UI observation wall times include tool operation and analyst reading; they are not laptop benchmark values. The standard regression suite later overlapped the directed UI collection; neither run is an isolated timing benchmark.

## Evidence interpretation

- A forecast miss must be inside that forecast's covered interval. A collision after its horizon cannot be called a contradicted prediction.
- Two finished attempts make TEST available; they do not guarantee acceptance. A live attempt is not a held-out record.
- TEST, ADOPT and a new committed forecast are separate player actions. A longer line after adoption does not prove later flight agreement.
- Camera framing and keyboard-focus findings use visible state or explicit DOM/accessibility observation. Source-only conclusions remain labelled as such in [request status](request-status.md).
- Screenshots are original procedural game output. Cropping or generating replacement traces would not establish behavior; no such replacement is used here.

## First arrival and approximately five minutes

[DEMONSTRATED: ordinary UI] A fresh loopback origin started at attempt 1, model v0 and ship T+0. The default 1280×720 viewport was used, with no viewport override. The first local preview was unreachable while sandboxed; the approved loopback preview resolved that harness issue. This is not counted as an application load failure. No live site was opened.

| Evidence | Observed result |
| --- | --- |
| [01 arrival](screenshots/01-local-arrival.jpg) | Room, command station and pointer/walking hint; no visible 1–4 shortcut instructions or next experiment. |
| [02 MISSION](screenshots/02-mission-setup.jpg), [03 PLAN](screenshots/03-setup-empty-plan.jpg) | “DEPART 50 M/S” omits the distance and reference-frame conditions. RECORD DESIGN AND SET UP records a design but leaves zero planned burns. |
| [04 preview](screenshots/04-default-preview.jpg) | Default prograde 5 m/s burn is In 400 s. Preview covers T+0 to 10 h, model v0, 100% extrapolating; it is not a scheduled plan. |
| [05 empty model](screenshots/05-model-empty-gate.jpg), [06 return to PLAN](screenshots/06-lost-plan-retained-preview.jpg) | MODEL explains two finished attempts are required. Returning to PLAN erases the burn row but retains its draft forecast. |
| [07 FLIGHT](screenshots/07-flight-one-times.jpg) | Recreated burn was committed; ENTER starts at 1×. FLIGHT shows R/F and nose-up/down controls, but only projected heading in its numeric orientation display. |
| [08 recorder](screenshots/08-recorder-preview-mismatch.jpg) | After recording 0.2 Hz and waiting, requested preview says 17 W; live readout is 0.20 fixes/s and 15 W. This is a visible mismatch, not evidence of saving power. |
| [09 hidden focus](screenshots/09-hidden-console-focus.jpg) | Escape then Tab leaves focus on the hidden console's 1× button. Read-only DOM inspection returned `BUTTON`, `1×`, ancestor `aria-hidden=true`. The screenshot alone cannot prove DOM focus. |
| [10 boundary](screenshots/10-five-minute-boundary.jpg) | About 300 wall seconds after arrival, ship time is about one minute, no rules exist and TEST/ADOPT remain disabled. The 400 s burn has not fired. Tool latency, reading and deliberate diagnostic detours are included; this is not a measured novice success rate. |
| [11 Recall](screenshots/11-recalled-debrief.jpg) | Attempt 1 ended at T+1m23 with 347 records, no propellant spent, forecast labelled “held · worst 2.8σ”; attempt 2 resets to arrival and the record survives. No automatic next experiment is supplied. |

[DEMONSTRATED: keyboard/AX] On the focused FLIGHT CHART UP button, Space left the mode unchanged; Return switched it to CHART UP and relabelled the button HEADING UP. This supports the source-described key-routing conflict. R11–R14's remaining keyboard/plot shortcomings are source-backed; this session is not a complete screen-reader certification.

[ESTABLISHED: source and timing] At 1× a burn scheduled 400 ship seconds after commitment cannot execute within the following 300 wall seconds. That arithmetic survives regardless of this replay's diagnostic detours. The later directed maneuver recipe is a different experiment.

## Directed evidence collection

[DEMONSTRATED: ordinary UI] A second, fresh loopback origin isolated this capture from the default-entry records. Default Alpha TRACK and 0.05 Hz were retained. The operator entered, used 60× briefly, returned to 1×, and committed a 9.85 m/s retrograde burn **In 600 s at T+00:04:33**. This differs from the automated test's exact T+300 s commitment and 16 h requested forecast.

| Evidence | Observed result / limitation |
| --- | --- |
| [12 issued deep forecast](screenshots/12-deep-forecast-issued.jpg) | Model v1, ends T+05:38:33, 93% extrapolating. A 48 h requested look-ahead is not guaranteed coverage. |
| [13 covered comparison](screenshots/13-covered-forecast-comparison.jpg) | At T+02:28:22, current miss 4,616 m and rounded 1.0σ. This is a measurable difference within the displayed uncertainty; it does not establish >3σ disproof. The 1× click had not visibly settled before capture: the still retains selected 2000×. Recording instructions therefore require checking the visible warp before taking footage. |
| [14 expired coverage](screenshots/14-past-horizon.jpg) | T+11:37:40, explicitly past the T+05:38:33 horizon. The intended approximately 30,000 s collection endpoint was overshot during documentation. This run is not a faithful reproduction of the automated test's bounded arc. |
| [15 deep debrief](screenshots/15-deep-debrief.jpg) | 35,176 records, closest recorded Alpha surface clearance 251.8 km / centre range 501.8 km, 92.5 kg main propellant and 0.8 kg RCS used. “Held · worst 3.1σ” does not supply the time of that maximum or delimit the whole debrief's comparison interval. |
| [16 second commit waiting](screenshots/16-second-commit-wait.jpg), [17 report pending](screenshots/17-model-report-pending.jpg) | After Recall, a 5 m/s retrograde burn In 600 s was committed at T+00:04:32. COMMITTING held ship time; MODEL showed v2, 543 measurements, nine local fits and report pending, with only one completed attempt. No TEST/ADOPT success was observed. |
| [18 MAP](screenshots/18-map-current-scope.jpg), [19 SHIP](screenshots/19-ship-current-view.jpg) | UI remained responsive during the hold. MAP showed 329 catalogued contacts, one recalled attempt and model v3 with zero adopted rules. SHIP exposed the current vehicle/configuration view. These are screen observations, not a certification of arbitrary-axis control or departure. |
| [20 bounded endpoint](screenshots/20-bounded-capture-still-pending.jpg) | Second commitment still pending at T+00:04:32. It remained pending for **at least 186 wall seconds between retained screenshots 16 and 20**, not an exact request-to-completion latency. The run was ended without a successful independent TEST, ADOPT or post-adoption flight. |

[ESTABLISHED: source; ASSUMED causal inference] `session.ts` deliberately stops advance during commitment. `model-bridge.ts` serializes ingestion, refresh, refit, final-record rebuild and forecast jobs. Large-record fitting or accumulated queued work can therefore delay commitment. The active job was not inspected through a private game handle; this study does not identify a deadlock, a singular-matrix recurrence, or a specific latency cause. Ordinary menu navigation stayed usable. See the ranked owner request and A18's already approved commit-continuity work.

The second forecast wait overlapped the end of the standard test suite. The timing is a populated-state observation, with host contention and an overlong first arc as explicit confounds. Do not generalize it to every player or use the fresh-coast benchmark's idle worker as proof that this populated path is fast.

[DEMONSTRATED: capture provenance] [ui-observations.json](../../../tools/studies/s20/ui-observations.json) retains UTC screenshot timestamps, segment-relative wall times and the 186 s lower-bound calculation. The first segment is the approximately five-minute inspection; the second is the directed attempt, with its stated deviation. Images can differ slightly from a neighboring AX read because the simulation continues between observations. Screenshot pixels govern quoted screenshot values. The local capture tab and preview server were closed after this bounded observation. No final video, completed scientific-demo sequence, public deployment test or human-learning claim is delivered.
