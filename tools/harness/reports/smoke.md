# 3E harness — smoke

Execution: **completed**. Expedition acceptance: **incomplete**.

`npm run harness -- --suite smoke`

Source revision: 199f11e151a7c60f34d91d6d3ba4d6cc05d5a85c. Content/source SHA-256: 7e308397d0bb6e5b6093ac0fdf32f5e10316d237b0947cda97dd6c84f27a3d8b. Node: v24.22.1.

[Machine-readable results, controls and source hashes](smoke.json). All measurements below are scripted; none is a human playtest.

## c02-coast-window

[DEMONSTRATED: this run] in-progress at 600 s; expected survive-window; pass.

Briefing only; production navigator, no fitted model.

First failed margin: null. Main/RCS inventory, charge, power, heat, condition, acquisition and clearance limitations are in the linked JSON.

## c02-powered-negative-control

[DEMONSTRATED: this run] lost at 14914 s; expected lost; pass.

Wrong-law 41 s retrograde dive from 2D handoff; author-selected collision negative control, no truth steering.

First failed margin: {"t":14913.829715281952,"kind":"hull-contact","subject":"alpha","detail":"Relative speed 312.9935481749031 m/s"}. Main/RCS inventory, charge, power, heat, condition, acquisition and clearance limitations are in the linked JSON.

## c02-cutoff-abort-window

[DEMONSTRATED: this run] in-progress at 30300 s; expected survive-window; pass.

Authored cutoff of the negative-control burn after ten seconds, with production acquisition retained. A measured abort window, not a human cue or complete safe-transit certificate.

First failed margin: null. Main/RCS inventory, charge, power, heat, condition, acquisition and clearance limitations are in the linked JSON.

## Integration

- pass: truth-json-resume — GameTruthState, ship RNG, active burn/deployment and every post-checkpoint TickResult; dt=1 s.
- pass: warp-batching — Production session, real Black Box/model; 180 fixed ticks grouped at 1x, 10x and 60x.
- pass: a12-view-room — ROOM read path through GameControls; not a browser navigation test.
- pass: a12-view-map — MAP read path through GameControls; not a browser navigation test.
- pass: a12-view-ship — SHIP read path through GameControls; not a browser navigation test.
- pass: a12-view-flight — FLIGHT read path through GameControls; not a browser navigation test.
- pass: a12-console-mission — Desk.setPage('mission') and its production session read path.
- pass: a12-console-plan — Desk.setPage('plan') and its production session read path.
- pass: a12-console-model — Desk.setPage('model') and its production session read path.
- pass: a12-console-blackbox — Desk.setPage('blackbox') and its production session read path.
- pass: a12-console-systems — Desk.setPage('systems') and its production session read path.
- pass: a12-design-edit — Mission design edit in the production Desk.
- pass: a12-design-apply — Mission configuration commands through Desk.commitDesign.
- pass: a12-configuration — Configuration command while the encounter advances.
- pass: a12-equipment — Power and pointing edits while the encounter advances.
- pass: a12-comparison — Compare independent recorded attempts through Desk and session.
- pass: a12-diagnostics — Real model diagnostics request; tick while its promise is pending.
- pass: a12-fit-handover — Real model accepts acquired data and refreshes via settled().
- pass: a12-rule-test — Rule test with disjoint completed attempts; no adoption claim from short records.
- pass: a12-preview — Real preview request while the encounter advances.
- pass: a12-procedure-save — Production Black Box procedure archive write during flight.
- pass: a12-procedure-remove — Production Black Box procedure archive delete during flight.
- pass: operation-model-health — The operation fixture uses the production estimator and actual recorded measurements.
- blocked: a12-commit — An unresolved real-model forecast is held by a fixture latch; production advance is called while COMMIT is pending.
- pass: forecast-truth-independence — Same briefing, no acquired measurements, same requested coast; hidden truth law/masses differ.
- pass: a12-alert-classification — Production freshAlerts classification only; browser warp response is not executed.
- blocked: full-session-save-resume — Physical and evidence state restored together mid-flight.
- blocked: a12-browser-shell — All screen navigation, hidden-page no-edit enforcement and new-alert warp response.
- blocked: a12-adopt-revoke — Successful rule adoption/revocation during active flight.
- blocked: a12-sustainable-transit — Indefinite safe preparation with actual power/thermal/resource evolution.

## Pending acceptance

- **2F** — A12 active COMMIT runs at >=1x: Production session advance returns zero during forecast commit; integration fixture measures it.
- **integrator / 2F** — Full-flight whole-ship swept clearance: The harness evaluates production swept hull geometry on available endpoints. Absorbed-object and contact-relocated endpoints remain uncertified because TickResult omits the original per-tick minimum/absorbed data. Inspect each report coverage, not only its minimum.
- **3B / 3C / 3A / 2C / 2F** — Informed/blind/worn/abort W/L flights, actual exposure and damage, finite ballistic/exterior/burn-through bypass search: Integrated providers, supported arrival envelopes, reconstruction and chronological field/ship damage seam absent from this source baseline. Owner semantics A15/A16 are approved; implementation is pending.
- **3D / 3A / Phase 4** — Actual-state chain, sustainable preparation, optional investigations and remaining main/RCS/power/heat/control margin at Earth: Missing production expedition/transit/content providers; no invented reserve percentage.
- **3D / 2F** — Exact in-flight whole-session save/resume: Truth JSON replay is tested; session restoration of queue, epochs, records and model is not exposed.
- **4C** — C05 physically requires both lessons: No integrated C05 geometry or resource envelope; intended gate is not established.
- **4D** — S6 moving aperture, partial crossing, surviving-state Earth: Shared opening implementation absent; A15/A17 choices approved. No optional systems implemented by harness.
- **2D / owner** — Browser screen/hidden-page operation and human comprehension/difficulty: Headless API fixtures cannot certify browser interaction or a human playtest.
