# 3E harness — reference

Execution: **completed**. Expedition acceptance: **incomplete**.

`npm run harness -- --suite reference`

Source revision: c674f6b69580fa2b9ce83dc47984cf761fbd27dc. Content/source SHA-256: 7e308397d0bb6e5b6093ac0fdf32f5e10316d237b0947cda97dd6c84f27a3d8b. Node: v24.22.1.

[Machine-readable results, controls and source hashes](reference.json). All measurements below are scripted; none is a human playtest.

## Numerical reference

[DEMONSTRATED: this run] Accepted at 2 s: true. Coarse 8/4 s controls and errors are retained; reference-only impulses do not establish finite-burn feasibility or player evidence.

## Pending acceptance

- **2F** — A12 active COMMIT runs at >=1x: Production session advance returns zero during forecast commit; integration fixture measures it.
- **integrator / 2F** — Full-flight whole-ship swept clearance: The harness evaluates production swept hull geometry on available endpoints. Absorbed-object and contact-relocated endpoints remain uncertified because TickResult omits the original per-tick minimum/absorbed data. Inspect each report coverage, not only its minimum.
- **3B / 3C / 3A / 2C / 2F** — Informed/blind/worn/abort W/L flights, actual exposure and damage, finite ballistic/exterior/burn-through bypass search: Integrated providers, supported arrival envelopes, reconstruction and chronological field/ship damage seam absent from this source baseline. Owner semantics A15/A16 are approved; implementation is pending.
- **3D / 3A / Phase 4** — Actual-state chain, sustainable preparation, optional investigations and remaining main/RCS/power/heat/control margin at Earth: Missing production expedition/transit/content providers; no invented reserve percentage.
- **3D / 2F** — Exact in-flight whole-session save/resume: Truth JSON replay is tested; session restoration of queue, epochs, records and model is not exposed.
- **4C** — C05 physically requires both lessons: No integrated C05 geometry or resource envelope; intended gate is not established.
- **4D** — S6 moving aperture, partial crossing, surviving-state Earth: Shared opening implementation absent; A15/A17 choices approved. No optional systems implemented by harness.
- **2D / owner** — Browser screen/hidden-page operation and human comprehension/difficulty: Headless API fixtures cannot certify browser interaction or a human playtest.
