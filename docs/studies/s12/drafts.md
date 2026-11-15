# S12 — Submission field drafts

Owner-editable copy for the evidence snapshot in [README](README.md). Copy the rendered blockquotes only; the hidden sentence IDs connect to the [claim ledger](claim-ledger.md). Keep the scope and verification qualifications when shortening. Counts are in [validation.json](../../../tools/studies/s12/validation.json); **all text-field caps are unknown** in `docs/submission/requirements.md`, so none is claimed to fit a verified portal cap. Demo limits are separate.

## Project summary

<!-- field: summary -->
> <!-- S01 --> Recursion is a spacecraft engineering roguelike about learning how to operate a ship in an unfamiliar universe.
> <!-- S02 --> In the current Gravity range, you configure the ship, plan a maneuver, and compare its recorded motion with the forecast you committed.
> <!-- S03 --> Black Box keeps evidence across attempts; you can test a different gravity rule against a separate attempt before adopting it.
> <!-- S04 --> The larger journey home remains in development.
<!-- /field -->

## Three alternative opening sentences

Choose one to replace S01; retain S02–S04 so the current scope stays visible. Each option is exactly one sentence.

### Engineering under uncertainty

<!-- field: opening-engineering -->
> <!-- O01 --> Recursion puts you at a spacecraft's control station, making a plan and checking what the ship actually did.
<!-- /field -->

### Evidence that survives

<!-- field: opening-recurrence -->
> <!-- O02 --> In Recursion, the ship can be lost while the evidence from its flight survives in Black Box.
<!-- /field -->

### An unfamiliar law

<!-- field: opening-science -->
> <!-- O03 --> Recursion begins with a familiar gravity model in a fictional universe where attraction follows a different distance law.
<!-- /field -->

## Detailed description

<!-- field: description -->
> <!-- D01 --> A spacecraft returning from Mars enters an unfamiliar universe and becomes caught in recurrence.
> <!-- D02 --> That is Recursion's premise: find a way home by understanding and operating the equipment already aboard.
> <!-- D03 --> The current playable slice is the Gravity range, presented through a walkable control room, console and flight hologram.

> <!-- D04 --> Before entering, you can record an observation goal, a propellant reserve and a clearance margin, then set the camera, recorder and ship configuration.
> <!-- D05 --> You choose a burn's direction, size and timing, preview its consequences, and commit a forecast that stays on record.
> <!-- D06 --> The flight display puts the issued forecast beside the measured trail and shows the ship's resource margins.
> <!-- D07 --> Black Box's debrief compares the recorded plan with observations, outcome and resource use.

> <!-- D08 --> The simulation couples propulsion, finite propellant, electrical supply, heat, sensing and recording.
> <!-- D09 --> Changing the recording rate changes its power demand and the amount of data collected.
> <!-- D10 --> After a loss or voluntary Recall, the ship restarts while Black Box retains the records used to rebuild the model.

> <!-- D11 --> In this fictional world, gravitational attraction falls with distance to the power 2.5.
> <!-- D12 --> The initial model uses the familiar inverse-square rule and fits numerical parameters from acquired measurements.
> <!-- D13 --> To change the rule, you select an extension, test it against a finished attempt excluded from the fit, and explicitly adopt it if the test permits.
> <!-- D14 --> The model forecasts the consequences of your plan; it does not choose the maneuver for you.
> <!-- D15 --> The learning aim is to distinguish a measurement from an assumption, compare prediction with observation, and check an explanation against separate evidence.
> <!-- D16 --> Demonstrations so far include automated tests and scripted browser operation, rather than measured learning outcomes from new players.

> <!-- D17 --> This addresses Space Mission Design Game through operational mission design: set a requirement, configure a fixed spacecraft, simulate a plan and evaluate the result.
> <!-- D18 --> It currently demonstrates that cycle within one encounter, while the full return expedition remains unfinished.
> <!-- D19 --> Launch vehicle selection, procurement budgets, multiplayer and an Earth-return completion are outside this demonstrated slice.

> <!-- D20 --> Development combined the owner's creative direction with Claude and OpenAI Codex assistance on research, implementation, tests and documentation.
> <!-- D21 --> NASA GMAT R2026a supplied four planar Newtonian reference cases that the game's simulator matches within 2.2 cm at test steps of 6.25–25 ms.
> <!-- D22 --> Those checks cover ordinary gravity and idealized propulsion, not the fictional law, the separate live forecasting model or a complete mission.
<!-- /field -->

## NASA resources used — current four-case copy

<!-- field: nasa -->
> <!-- N01 --> We used NASA's General Mission Analysis Tool, GMAT R2026a, to generate reference trajectories for testing Recursion's simulation of ordinary gravity and propulsion.
> <!-- N02 --> The four planar point-mass Earth cases are a circular orbit, an eccentric orbit, a hyperbolic flyby, and a 120-second prograde engine burn with propellant depletion followed by a coast.
> <!-- N03 --> The committed reference files contain 13,616 samples in SI units at 10-second intervals, with script and output hashes recording their provenance.
> <!-- N04 --> The game's own simulator matches the four references within 2.2 cm and 1.8 × 10⁻⁵ m/s at test steps of 6.25–25 ms.
> <!-- N05 --> These small test steps differ from the one-second play step used for the game's larger, slower encounters.
> <!-- N06 --> GMAT runs outside the game as a verification tool; its outputs are simulated reference data, not telemetry from a real mission.
> <!-- N07 --> This comparison does not validate the fictional inverse-2.5 law, the separate live forecasting model, or the playability of a route.

> <!-- N08 --> NASA engineering references also informed the power, thermal, propulsion and sensing design, while the ship's numerical ratings remain game assumptions.
> <!-- N09 --> The source register distinguishes those engineering inputs from research for encounters that have not been implemented.
<!-- /field -->

Resource links to attach in the same field (include their lengths when the editor is available): [GMAT catalogue GSC-19468-1](https://software.nasa.gov/software/GSC-19468-1), [R2026a distribution](https://sourceforge.net/projects/gmat/files/GMAT/GMAT-R2026a/), [method and results](../../verification/gmat.md), [scripts](../../../tools/gmat/), [vectors](../../../tests/vectors/gmat/), [game comparison](../../../src/sim/gmat.test.ts), [NASA source/use register](../s10/nasa-evidence.md), [bibliography](../../../References/BIBLIOGRAPHY.md). Replace repository-relative evidence links with the frozen public source URLs at finalization. The catalogue currently says R2025a; that label must not replace the version actually run.

### C5–C7 — conditional addition, landing with 2G's merge

**HOLD from current submission copy.** The branch handoff records these completed comparisons, but S12 has not rerun that branch and it is not merged at this study's baseline. Use only after the release contains and passes them. Preserve N01–N07's Newtonian-only boundary; replace their four-case quantities coherently if rewriting for seven cases. Do not simply relabel the 13,616-sample dataset as seven cases.

<!-- field: nasa-after-2g -->
> <!-- N10 --> Three additional GMAT cases check the simulator outside the equatorial plane: an inclined eccentric orbit, a finite burn in a fixed inertial direction, and a retrograde hyperbolic flyby.
> <!-- N11 --> The 2G branch records maximum position differences of 13 mm, 13 mm and 14 mm respectively, using steps of 25 ms, 12.5 ms and 25 ms.
<!-- /field -->

## AI-use disclosure

<!-- field: ai -->
> <!-- A01 --> The owner supplied Recursion's premise, core engineering loop, recurrence and Black Box concept, fictional gravity, signature encounter ideas and visual direction, and made the consequential creative decisions.
> <!-- A02 --> Claude and OpenAI Codex assisted with research, design proposals, mathematical derivations, code, tests, procedural visuals and documentation.
> <!-- A03 --> Codex work included physics references, the ship baseline and ship systems, GMAT script preparation, encounter studies and submission preparation, including this draft package.
> <!-- A04 --> Claude work included integration, the simulation, predictive-model specification and implementation, Black Box, control-room and interface code, and operating GMAT to produce and check reference trajectories.
> <!-- A05 --> The GMAT trajectory samples were computed by GMAT, using scripts and conversion tools developed with AI assistance.
> <!-- A06 --> Repository records identify Claude Opus 5.5 and Claude Fable 5.2 in different stages; exact Codex model versions are not consistently recorded.
> <!-- A07 --> These labels describe recorded provenance rather than independently verified provider model identifiers.
> <!-- A08 --> The in-game predictor is a local numerical estimator, separate from the generative AI tools used during development.
> <!-- A09 --> The recorded visuals are procedural graphics and browser captures; the repository does not establish use of a dedicated image, voice, music or video generation service.
> <!-- A10 --> The owner supplied visual reference pictures whose source permissions are not recorded, and those pictures are excluded from the repository.
<!-- /field -->

Finalization note: this is descriptive disclosure, not a claim that release metadata or media labels are complete. S10's task table is the provenance authority; S9–S12 handoffs extend its older boundary. Add exact tools for any subsequent captures, audio or assets and 2G's delivered tasks after merge. Use **the owner**, never personal names, email addresses or git identities, in the disclosure and metadata prepared from it.

## Credits

<!-- field: credits -->
> <!-- C01 --> Creative direction and decisions: the owner.
> <!-- C02 --> Development assistance: Claude and OpenAI Codex, with tasks described in the AI-use disclosure.
> <!-- C03 --> NASA GMAT R2026a generated the Newtonian reference trajectories; NASA and JPL engineering publications informed the documented spacecraft and measurement design.
> <!-- C04 --> The browser application uses React 19.3.1, React DOM 19.3.1, scheduler 0.28.0 and Three.js 0.187.0, each recorded under MIT terms in the dependency audit.
> <!-- C05 --> Vite, TypeScript, ESLint and Vitest support development; Python and NumPy support research and reference calculations.
> <!-- C06 --> The ship and room use procedural geometry and textures, and the font stack selects fonts installed on the player's device.
> <!-- C07 --> The asset and source registers also credit consulted hardware arrangements and proposal research separately from assets imported into the game.
<!-- /field -->

Attach [source bibliography](../../../References/BIBLIOGRAPHY.md), [NASA use register](../s10/nasa-evidence.md), [asset/reference register](../s10/assets.md), [external tools](../s10/external-toolchain.md) and [dependency register](../s10/dependencies.md) at frozen public URLs. These retain the detailed ESA, university, manufacturer and other research citations; citing them does not imply importing their images or implementing study proposals.

## Third-party notice summary

<!-- field: notices -->
> <!-- T01 --> The four audited browser-runtime packages use MIT licences, while development tools and bundled components retain several different upstream licences.
> <!-- T02 --> S10's notice archive preserves the available upstream legal texts and identifies missing evidence; it is an audit record, not proof that notices are present in the deployed game.
> <!-- T03 --> The prototype pages load a separate Three.js 0.170.0 CDN dependency whose exact licence evidence still needs reconciliation.
> <!-- T04 --> No original-content licence has yet been selected and published in this study's repository snapshot.
<!-- /field -->

This short field does **not** replace upstream notices. Integrator/5A must distribute the applicable full texts from [S10's archive](../s10/third-party-notices.txt) and close its gaps for the actual release. Preserve upstream rights-holder text in legal notices; the no-personal-identities rule for the AI disclosure is not permission to redact required upstream attribution. Replace T03/T04 only when the corresponding release work is evidenced.
