# S20 — Redlined S12 drafts

Proposed current-release copy against S12, at source baseline `19a9ada`. **Bold** inserts or replaces; ~~strikeout~~ removes. Unmarked sentences are retained. Original S12 IDs stay beside each sentence and are audited individually in the [72-row ledger](claim-ledger.md). S12 files are untouched.

These are editorial proposals for owner/5C review, not submitted fields. Text-field caps, frozen public links, final media provenance and the actual deployment remain release tasks. The historical four-case and 2G-branch qualifications are replaced only to the scope supported below.

## Evidence qualifications for using the copy

- [ESTABLISHED: `MissionPage.tsx:41`, `src/ship/sensors/index.ts`, recorder baseline] D09 needs qualification: 0.05→0.2 Hz increases acquisition but both request 15 W. MISSION predicts about 17 W at 0.2 Hz and 35 W at 1 Hz, versus an actual 15 W request. A 10 Hz choice requests 35 W but acquisition is capped at one packet per 1 s tick. For CAP02 distinguish the setup estimate from current telemetry and retained counts; do not sell that mismatch as a valid demonstrated engineering trade-off.
- [ESTABLISHED: 2G handoff; source inventory] The 3D conversion is merged, including dynamics and estimator; D03 may now say three-dimensional flight. The Gravity range remains the only playable encounter. A17's Earth reveal is future direction.
- [DEMONSTRATED: S20 GMAT verifier and 35 integrity tests] The committed collection contains **21,939** samples across seven cases. S20 has not rerun the GMAT executable. The 2.2 cm / 1.8 × 10⁻⁵ m/s planar maxima remain the recorded measurements from D4/2G; they are not newly measured S20 maxima.
- [DEMONSTRATED: fresh `npm run check`] The seven-case simulator regression passed, so its merge/rerun gate is lifted. The full check still failed: 784/786 main-suite tests passed; the controller hit a 5 s timeout and the real-model loop expected model version 1 but received 2 before adoption. The separate performance test was skipped in that command. After closing the animated UI, unchanged sequential reruns passed the controller (11 tests, 8.79 s), complete model loop (1 test, 155.29 s) and separate performance suite (1 test, 0.760 s). All 787 existing tests therefore have passing results across runs; the original full check is still recorded as failed. The isolated model loop supplies fresh headless held-out/adoption/new-flight proof, not a successful V05/V06 browser montage. See the ledger and [regression results](../../../tools/studies/s20/regression-results.json) for exact commands, concurrency and source diagnosis.
- [ESTABLISHED: A14, LICENSE, NOTICE, package.json and public release texts] The no-licence sentence is obsolete. S13's remaining copyright-placeholder request is also obsolete at this baseline; the holder line is already filled. Do not copy personal account names into the AI disclosure.

## Project summary

> **S01** Recursion is a spacecraft engineering roguelike about learning how to operate a ship in an unfamiliar universe.
> **S02** In the current Gravity range, you configure the ship, plan a maneuver, and compare its recorded motion with the forecast you committed.
> **S03** Black Box keeps evidence across attempts; you can test a different gravity rule against a separate attempt before adopting it.
> **S04** The larger journey home remains in development.

## Alternative opening: engineering

> **O01** Recursion puts you at a spacecraft's control station, making a plan and checking what the ship actually did.

## Alternative opening: recurrence

> **O02** In Recursion, the ship can be lost while the evidence from its flight survives in Black Box.

## Alternative opening: science

> **O03** Recursion begins with a familiar gravity model in a fictional universe where attraction follows a different distance law.

## Detailed description

> **D01** A spacecraft returning from Mars enters an unfamiliar universe and becomes caught in recurrence.
> **D02** That is Recursion's premise: find a way home by understanding and operating the equipment already aboard.
> **D03** ~~The current playable slice is the Gravity range, presented through a walkable control room, console and flight hologram.~~ **The current playable slice is the Gravity range, with three-dimensional flight operated through a walkable control room, console and flight hologram.**
>
> **D04** Before entering, you can record an observation goal, a propellant reserve and a clearance margin, then set the camera, recorder and ship configuration.
> **D05** You choose a burn's direction, size and timing, preview its consequences, and commit a forecast that stays on record.
> **D06** The flight display puts the issued forecast beside the measured trail and shows the ship's resource margins.
> **D07** Black Box's debrief compares the recorded plan with observations, outcome and resource use.
>
> **D08** The simulation couples propulsion, finite propellant, electrical supply, heat, sensing and recording.
> **D09** ~~Changing the recording rate changes its power demand and the amount of data collected.~~ **Recording choices affect retained data, storage and electrical demand, with acquisition limited by the simulation cadence.**
> **D10** After a loss or voluntary Recall, the ship restarts while Black Box retains the records used to rebuild the model.
>
> **D11** In this fictional world, gravitational attraction falls with distance to the power 2.5.
> **D12** The initial model uses the familiar inverse-square rule and fits numerical parameters from acquired measurements.
> **D13** To change the rule, you select an extension, test it against a finished attempt excluded from the fit, and explicitly adopt it if the test permits.
> **D14** The model forecasts the consequences of your plan; it does not choose the maneuver for you.
> **D15** The learning aim is to distinguish a measurement from an assumption, compare prediction with observation, and check an explanation against separate evidence.
> **D16** Demonstrations so far include automated tests and scripted browser operation, rather than measured learning outcomes from new players.
>
> **D17** This addresses Space Mission Design Game through operational mission design: set a requirement, configure a fixed spacecraft, simulate a plan and evaluate the result.
> **D18** It currently demonstrates that cycle within one encounter, while the full return expedition remains unfinished.
> **D19** Launch vehicle selection, procurement budgets, multiplayer and an Earth-return completion are outside this demonstrated slice.
>
> **D20** Development combined the owner's creative direction with Claude and OpenAI Codex assistance on research, implementation, tests and documentation.
> **D21** ~~NASA GMAT R2026a supplied four planar Newtonian reference cases that the game's simulator matches within 2.2 cm at test steps of 6.25–25 ms.~~ **NASA GMAT R2026a supplied seven Newtonian reference cases, including three inclined cases; the simulator's recorded maximum position differences are within 2.2 cm at test steps of 6.25–25 ms.**
> **D22** Those checks cover ordinary gravity and idealized propulsion, not the fictional law, the separate live forecasting model or a complete mission.

## NASA resources: seven-case replacement

> **N01** We used NASA's General Mission Analysis Tool, GMAT R2026a, to generate reference trajectories for testing Recursion's simulation of ordinary gravity and propulsion.
> **N02** ~~The four planar point-mass Earth cases are a circular orbit, an eccentric orbit, a hyperbolic flyby, and a 120-second prograde engine burn with propellant depletion followed by a coast.~~ **The seven point-mass Earth cases include four planar trajectories—a circular orbit, an eccentric orbit, a hyperbolic flyby and a finite burn with propellant depletion—and three inclined trajectories: an eccentric orbit, a burn along a fixed inertial direction and a retrograde hyperbolic flyby.**
> **N03** ~~The committed reference files contain 13,616 samples in SI units at 10-second intervals, with script and output hashes recording their provenance.~~ **The seven committed reference files contain 21,939 samples in SI units at 10-second intervals, with script and output hashes recording their provenance.**
> **N04** ~~The game's own simulator matches the four references within 2.2 cm and 1.8 × 10⁻⁵ m/s at test steps of 6.25–25 ms.~~ **The simulator's recorded maximum differences across those references are within 2.2 cm and 1.8 × 10⁻⁵ m/s at test steps of 6.25–25 ms.**
> **N05** These small test steps differ from the one-second play step used for the game's larger, slower encounters.
> **N06** GMAT runs outside the game as a verification tool; its outputs are simulated reference data, not telemetry from a real mission.
> **N07** This comparison does not validate the fictional inverse-2.5 law, the separate live forecasting model, or the playability of a route.
>
> **N08** NASA engineering references also informed the power, thermal, propulsion and sensing design, while the ship's numerical ratings remain game assumptions.
> **N09** The source register distinguishes those engineering inputs from research for encounters that have not been implemented.

## Optional inclined-case detail (merge gate resolved; do not duplicate N02)

> **N10** Three additional GMAT cases check the simulator outside the equatorial plane: an inclined eccentric orbit, a finite burn in a fixed inertial direction, and a retrograde hyperbolic flyby.
> **N11** ~~The 2G branch records maximum position differences of 13 mm, 13 mm and 14 mm respectively, using steps of 25 ms, 12.5 ms and 25 ms.~~ **The recorded maximum position differences for the three inclined cases are 13 mm, 13 mm and 14 mm respectively, using steps of 25 ms, 12.5 ms and 25 ms.**

## AI-use disclosure

> **A01** The owner supplied Recursion's premise, core engineering loop, recurrence and Black Box concept, fictional gravity, signature encounter ideas and visual direction, and made the consequential creative decisions.
> **A02** Claude and OpenAI Codex assisted with research, design proposals, mathematical derivations, code, tests, procedural visuals and documentation.
> **A03** ~~Codex work included physics references, the ship baseline and ship systems, GMAT script preparation, encounter studies and submission preparation, including this draft package.~~ **Codex work included physics references, the ship baseline and ship systems, GMAT script preparation, encounter studies, submission preparation, release documentation and post-merge rechecks.**
> **A04** ~~Claude work included integration, the simulation, predictive-model specification and implementation, Black Box, control-room and interface code, and operating GMAT to produce and check reference trajectories.~~ **Claude work included integration, the simulation, predictive-model specification and implementation, Black Box, control-room and interface code, the end-to-end 3D conversion, and operating GMAT to produce and check reference trajectories.**
> **A05** The GMAT trajectory samples were computed by GMAT, using scripts and conversion tools developed with AI assistance.
> **A06** Repository records identify Claude Opus 5.5 and Claude Fable 5.2 in different stages; exact Codex model versions are not consistently recorded.
> **A07** These labels describe recorded provenance rather than independently verified provider model identifiers.
> **A08** The in-game predictor is a local numerical estimator, separate from the generative AI tools used during development.
> **A09** The recorded visuals are procedural graphics and browser captures; the repository does not establish use of a dedicated image, voice, music or video generation service.
> **A10** The owner supplied visual reference pictures whose source permissions are not recorded, and those pictures are excluded from the repository.

## Credits

> **C01** Creative direction and decisions: the owner.
> **C02** Development assistance: Claude and OpenAI Codex, with tasks described in the AI-use disclosure.
> **C03** NASA GMAT R2026a generated the Newtonian reference trajectories; NASA and JPL engineering publications informed the documented spacecraft and measurement design.
> **C04** ~~The browser application uses React 19.3.1, React DOM 19.3.1, scheduler 0.28.0 and Three.js 0.187.0, each recorded under MIT terms in the dependency audit.~~ **The browser application uses React 19.3.1, React DOM 19.3.1, scheduler 0.28.0 and Three.js 0.187.0 under MIT terms; the distributed notices also cover bundled Vite and Rolldown helpers and retained algorithm attribution.**
> **C05** Vite, TypeScript, ESLint and Vitest support development; Python and NumPy support research and reference calculations.
> **C06** The ship and room use procedural geometry and textures, and the font stack selects fonts installed on the player's device.
> **C07** The asset and source registers also credit consulted hardware arrangements and proposal research separately from assets imported into the game.

## Notice summary

> **T01** ~~The four audited browser-runtime packages use MIT licences, while development tools and bundled components retain several different upstream licences.~~ **The browser distribution includes upstream notices for its runtime packages and bundled helpers; development tools and separately distributed components retain their own upstream terms.**
> **T02** ~~S10's notice archive preserves the available upstream legal texts and identifies missing evidence; it is an audit record, not proof that notices are present in the deployed game.~~ **The repository supplies LICENSE, NOTICE and THIRD-PARTY-NOTICES.txt for the browser distribution; the frozen deployment and its notice links still require release verification.**
> **T03** The prototype pages load a separate Three.js 0.170.0 CDN dependency whose exact licence evidence still needs reconciliation.
> **T04** ~~No original-content licence has yet been selected and published in this study's repository snapshot.~~ **Recursion's original code, documentation and project-made reference data are published under Apache-2.0; third-party code, data and media retain their own terms and notices.**

The NASA resource URLs and source/use links already listed in S12 remain attachment candidates, not newly verified deployment links. Convert repository-relative links to immutable public URLs for the release. Keep N05–N07 and D22 even when shortening. The optional N10/N11 detail expands the inclined subset; it must not be appended as if three more cases existed beyond the seven in N02.

## Demo captions and readiness redlines

| ID / instruction | Redline |
|---|---|
| V07 | ~~NASA GMAT: four planar Newtonian cases, within 2.2 cm at 6.25–25 ms test steps.~~ **NASA GMAT: seven Newtonian cases, including three inclined cases; recorded position differences within 2.2 cm at 6.25–25 ms test steps.** |
| V05 and V06 gate | ~~needs 2G's 3D merge~~ **3D merge complete; still requires fresh successful held-out TEST/ADOPT and a newly issued forecast checked against new observations at matching ship times.** |
| V10 fallback | ~~This recorded test has not yet produced an adoption result.~~ **The next forecast is still pending; the independent test has not been reached.** |
| V01–V04, V08–V09, V11 | Retain the words with the original current-slice, provenance and evidence boundaries. V02 must distinguish the wrong MISSION estimate from actual draw; V03's captured 1.0-sigma miss is a comparison, not a >3-sigma disproof. Capture readiness is in S20's demo instructions. |
| CAP08 optional | ~~needs 2G's 3D merge~~ **3D hand control and departure have headless implementation evidence; a real, complete UI-operated ring/departure capture is still required.** |

[ASSUMED] Keep S12's six-shot timing (3 + 5 + 5 + 5 + 6 + 6 = 30 s) or seven slides. A 30 s cut must visibly compress attempts and ship time. There is no basis for a 30 s or five-minute novice learning claim. An evidence-only slide version is the smaller supported deliverable if successful adoption/new-flight capture is missing; it loses the observed improvement payoff.

The actual S20 endpoint is screenshot 20 in [browser observations](browser-observations.md): second COMMIT pending at T+00:04:32, for at least 186 wall seconds between screenshots 16 and 20. Only one observation was finished; TEST was never clicked, ADOPT was not reached, and there is no post-adoption observed flight. The held-out test should not be described as pending when the pending operation is a forecast. The first arc overshot its intended collection time and overlapped host test load, so this is a bounded observation, not proof of deadlock or a universal latency.

## Changes for the owners

[ASSUMED] 5C/integrator: integrate the changed copy in approximately 40–90 prose lines; no contracts or model implementation changes. 2D: capture the actual held-out attempt ID, completed test result, separate adoption action, new model/forecast version and matching-time flight observation before lifting the demo gate. 5A: recheck the actual frozen bundle and deployed notices/links. The owner chooses final wording and demo format. Current A18 requirements are implementation requests in the baseline, not copy that may be advertised as completed.
