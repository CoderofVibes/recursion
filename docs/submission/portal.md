# The portal text, ready to paste

For the owner. One section per field of the project form (Team page › Project tab › Edit), in the form's order. Copy the text inside each box. Where a field might have a tight character limit there is a short version under the full one; the portal's limits aren't known, so each count is given (characters, spaces included).

Written 2026-11-15 from S12's drafts, brought up to today's game on `main`. Every claim was checked against the repository; the few things that need a last look are under [Before you paste](#before-you-paste) at the end.

| Field | Full | Short |
|---|---:|---:|
| High-level summary | 1,146 | 463 |
| Project details | 5,897 | 1,511 |
| NASA data (with its six links) | 2,266 | 522 |
| References and resources | 2,308 | none |
| AI use | 1,988 | 577 |

If a field rejects the full text for length, paste the short version. If the details field takes more than the short version but less than the full one, cut whole headed sections from the full text in this order: TOOLS, BENEFITS, INTENDED IMPACT. Keep HONEST LIMITS.

## 1. Project title

```text
Recursion
```

## 2. High-level summary

The owner's notes ask for three answers: what we developed, how it addresses the challenge, why it's important.

```text
Recursion is a spacecraft engineering game that runs in a web browser. A crewed ship returning from Mars is caught in an unfamiliar universe where gravity follows a different law, and every loss returns the pilot to the start of the attempt. Only the flight recorder, the Black Box, keeps what was measured.

It answers the Space Mission Design Game challenge as mission design in operation. The player sets an objective and margins, configures the ship's power, heat, instruments and recorder, plans a burn against a forecast, flies it in a physics simulation, and reads a report that compares what was predicted with what happened. Then the player revises the plan, or tests a new law of gravity against data the model has not seen and adopts it if it holds.

It matters because that loop is how engineering is done: tell a measurement from an assumption, check a prediction against the flight, and change the model only on evidence. The simulator is checked against reference trajectories from NASA's General Mission Analysis Tool (GMAT), and the game says plainly which parts are real physics, which are assumed ratings and which are fiction.
```

Short version:

```text
Recursion is a browser game about engineering a spacecraft home through an unfamiliar universe. The player sets an objective, configures power, heat, instruments and the flight recorder, plans a burn against a forecast, flies it, and compares the prediction with what happened. Each loss restarts the attempt; the Black Box keeps the data, and the player can test a new law of gravity against it. The simulator is checked against NASA GMAT reference trajectories.
```

## 3. Project demo link

```text
VIDEO LINK (the owner pastes it after upload)
```

The video is 30 seconds or less and must open with no sign-in (check it from a private window). The organizer asks that AI-generated audio is acknowledged in metadata as well as in text, so paste this as the video's description on the host:

```text
Recursion, a spacecraft engineering game made for NASA Space Apps 2026 (Space Mission Design Game). Play it: https://coderofvibes.github.io/recursion/

Gameplay footage, edited; some shots are staged for the video. Every picture is drawn by the game's own code. Built with AI assistance (Claude, OpenAI Codex). All audio is AI-generated with ElevenLabs. Physics checked against NASA GMAT.
```

## 4. Final project link

```text
https://coderofvibes.github.io/recursion/
```

If the form takes a second link, or in the details field:

```text
Source code and instructions: https://github.com/CoderofVibes/recursion
```

## 5. Project details

The owner's notes ask for: what it does and how it works; its benefits; its intended impact; the tools used; how it was creative; the factors considered.

```text
WHAT IT DOES AND HOW IT WORKS

Recursion opens in a browser with nothing to install and no account. After a short opening the player stands in the ship's control room, with a window, a map, a hologram of the ship and a console. The console is the game's loop in six stages:

1. EXPLORATION: the region as the ship knows it, the objective, and the attempt's design (an evidence goal, a propellant reserve, a clearance margin).
2. SYSTEMS: electrical supply against demand on one board, with the loads the player sets: camera, science processor, Black Box recording rate, communications.
3. PLAN: a burn's direction, size and timing, with the forecast it leads to and what that forecast's uncertainty is made of.
4. FLIGHT: the flight itself, by a committed plan or by hand, with time warp up to 2000x. A new caution drops warp to 1x.
5. BLACK BOX: the flight as recorded, drawn over the forecast issued for it, with where and when they parted.
6. MODEL: the ship's model of the physics. The player can test a different rule against an attempt held out of the fit, and adopt it if the test passes.

Three regions can be chosen from a picker:
- Twin Deeps. Two massive bodies, where gravity falls with distance to the power 2.5 (fiction). The ship's model starts with Newton's inverse square, so its forecasts miss. Two short dives, each ended with RECALL, give the model enough data: TEST, then ADOPT, and the next forecast reaches further and is tighter. In our recorded run on the release build the fitted exponent was 2.5001 and the held-out misfit fell from 1,436 m to 26 m.
- The Well Garden. Funnel-shaped gravity wells. A coasting ship is drawn into a throat in about half an hour of ship time; one steered burn of about 12.5 m/s crosses the region.
- The Unseen Cathedral. A lattice of radiation the window cannot show. A coasting ship loses power in about four minutes. A Black Box function records the lattice at a cost of 350 or 1,000 W, and the model rebuilds its strands from that record and draws them on FLIGHT after a minute or two.

Under the screens are two separate programs. The simulation is the truth: fixed-step, deterministic, with gravity, thrust and finite propellant, electrical power, heat, radiation damage, sensors and the recorder. The model is the ship's belief: a statistical estimator that sees only what the instruments recorded, fits its parameters, and issues each forecast with an uncertainty. The code forbids the model from reading the truth. The model never chooses a manoeuvre; the player does.

BENEFITS

A player sees a prediction, its uncertainty and the outcome side by side, and learns why an attempt failed from the ship's own record. Losing is cheap and useful: the ship restarts and the data stays. The game is free, open source (Apache-2.0) and runs from a link.

INTENDED IMPACT

For students and curious players: practice at the working method of engineering, which is to plan, predict, measure and revise, and to treat a model as something to be tested. We have not yet measured learning with new players; the evidence so far is automated tests and scripted play of the release build.

TOOLS

TypeScript, React and Three.js, built with Vite and tested with Vitest (more than 1,500 automated tests). The model runs in a Web Worker; records are saved in the browser. NASA GMAT R2026a produced the reference trajectories. Python and NumPy were used for reference calculations. The site is hosted on GitHub Pages. Claude and OpenAI Codex assisted with the code, tests, studies and documentation under the owner's creative direction; all audio was generated with ElevenLabs (see the AI use field).

HOW IT WAS CREATIVE

The game never tells the player the answer. The universe's law is wrong for the ship's model, and the player finds that out from their own flights and proves it on separate data. Recurrence turns failure into the experiment: the ship is lost, the evidence is not. One hazard cannot be seen at all and has to be reconstructed from what the recorder caught. Every picture is drawn by the game's own code; no image or model is imported.

FACTORS CONSIDERED

Energy and power: every instrument, the science processor, the recorder and the radio is a load in watts and a source of heat. SYSTEMS shows supply against demand and how long the reactants last at the current setting. A faster recording rate draws more power (15 to 100 W in the ship's baseline) and fills the store sooner; mapping the lattice costs up to 1,000 W. Power lost to radiation damage ends an attempt.

Accessibility: with the browser's reduced-motion setting the opening is a still sky with a plain fade, and a loss neither shakes nor flickers. No sequence flashes more than three times in any second (tested). Every control can be reached and used from the keyboard. Sound can be switched off. The game uses the device's own fonts and needs no install or sign-in.

Cost: there is no money in the game. The costs are the ones a flight has: propellant, electrical energy, recorder storage and time. The player sets a propellant reserve and decides what data is worth its watts.

HONEST LIMITS

The three regions are previews chosen from a picker; the route between them and the return to Earth are not built. Twin Deeps is the complete loop of plan, fly, lose, learn; its exit was not reached in one blind try. We have not shown a crossing of the Unseen Cathedral. The Well Garden's coasting forecast does not model the wells' pull and is overconfident. On a simulated modest laptop the frame-time target is met in 13 of 27 region and view combinations; the 3D views miss it, and a real modest laptop has not been tried. Launch vehicles, budgets in money and multiplayer are outside the game. The ship's ratings are assumed; the gravity law, the wells, the lattice and recurrence are fiction. The demo video is edited gameplay with some staged shots, and says so.
```

Short version:

```text
Recursion runs in a browser. The player works a six-stage console: EXPLORATION (the region, the objective, the attempt's margins), SYSTEMS (power, heat and data settings), PLAN (a burn and its forecast), FLIGHT, BLACK BOX (predicted against flown) and MODEL (test a new rule on held-out data, adopt it if it passes). A deterministic simulation is the truth; a separate statistical model, which sees only what the ship recorded, issues every forecast with its uncertainty.

Three preview regions: Twin Deeps, where gravity follows a fictional 2.5-power law the player discovers from two short dives; the Well Garden, crossed with one steered burn; the Unseen Cathedral, whose invisible lattice the model rebuilds from recorded data.

Benefits and impact: practice at planning, predicting, measuring and revising. Losing restarts the ship and keeps the data. Free and open source. Learning with new players has not been measured.

Tools: TypeScript, React, Three.js, Vite, Vitest; NASA GMAT for reference trajectories; Claude and OpenAI Codex for development assistance; ElevenLabs for audio.

Factors: power and heat are budgets the player sets, and recording costs watts and storage; reduced motion is honoured, flashes stay at three a second or fewer, and every control works from the keyboard; the costs are propellant, energy, storage and time.

Limits: the route between regions and the return to Earth are not built; the modest-laptop speed target is met in 13 of 27 cases; the video has some staged shots.
```

## 6. NASA data

A global award needs NASA data or resources to be used. GMAT is in this challenge's resource list.

```text
We used NASA's General Mission Analysis Tool (GMAT R2026a, NASA Software Catalog GSC-19468-1) to produce reference trajectories, and we test the game's simulator against them on every run of the test suite.

Seven cases, each a point-mass Earth propagated by GMAT at high accuracy and exported in SI units every 10 seconds (21,939 samples in all):
- four in one plane: a circular orbit, an eccentric orbit, a hyperbolic flyby, and a 120-second prograde burn with propellant depletion followed by a coast;
- three out of the equatorial plane: an inclined eccentric orbit, a retrograde hyperbolic flyby, and a 200-second burn in a fixed inertial direction that turns the orbit plane by 2.8 degrees.

Repeat GMAT runs were identical byte for byte, and GMAT's output agrees with independent orbit solutions to about a centimetre.

The game's own integrator, the one it flies with, is started from each case's first state and compared at every sample. The test requires agreement within 5 cm, 5e-5 m/s and 1e-6 kg. The recorded worst case is 2.2 cm and 1.8e-5 m/s, at test steps of 6.25 to 25 milliseconds. The error falls about four times for each halving of the step, with no offset, so the law, the units, the thrust and the mass handling agree with GMAT.

What this does not cover: GMAT runs outside the game, and its outputs are simulated reference data, not telemetry from a mission. The comparison checks ordinary Newtonian gravity and rocket dynamics at small test steps. It does not check the game's fictional 2.5-power law, the ship's separate forecasting model, the one-second play step, or whether any route can be flown.

NASA and JPL engineering publications also informed the ship's power, thermal, propulsion and sensing design. The ship's numerical ratings are our assumptions.

GMAT: https://software.nasa.gov/software/GSC-19468-1
R2026a distribution: https://sourceforge.net/projects/gmat/files/GMAT/GMAT-R2026a/
Method and results: https://github.com/CoderofVibes/recursion/blob/main/docs/verification/gmat.md
Reference data: https://github.com/CoderofVibes/recursion/tree/main/tests/vectors/gmat
The test: https://github.com/CoderofVibes/recursion/blob/main/src/sim/gmat.test.ts
Scripts: https://github.com/CoderofVibes/recursion/tree/main/tools/gmat
```

Short version:

```text
We used NASA's General Mission Analysis Tool (GMAT R2026a) to generate seven reference trajectories (orbits, flybys and engine burns around a point-mass Earth, in and out of the equatorial plane). The game's own simulator matches all 21,939 samples within 2.2 cm at test steps of 6.25 to 25 ms. This checks ordinary gravity and rocket dynamics; it does not check the game's fictional gravity law or its forecasting model. Method, data and test: https://github.com/CoderofVibes/recursion/blob/main/docs/verification/gmat.md
```

## 7. Space Agency Partner resources and other references

No Space Agency Partner data or resources were used. If the form has a separate partner field, leave it empty or write "None used". Everything else:

```text
NASA
- General Mission Analysis Tool (GMAT) R2026a, used to generate reference trajectories: https://software.nasa.gov/software/GSC-19468-1 and https://sourceforge.net/projects/gmat/files/GMAT/GMAT-R2026a/
- GMAT documentation, default constants and the finite-burn sample script, used to set up the cases: https://github.com/nasa/GMAT
- NASA Glenn Research Center, specific impulse and the ideal rocket equation, for the propulsion relations: https://www.grc.nasa.gov/www/BGH/specimp.html and https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/ideal-rocket-equation/
- NASA and JPL engineering publications on spacecraft power, thermal control, propulsion, navigation sensing and data handling, which informed the ship's design. Full list with what each informed: https://github.com/CoderofVibes/recursion/blob/main/References/BIBLIOGRAPHY.md and https://github.com/CoderofVibes/recursion/blob/main/docs/studies/s10/nasa-evidence.md

Other references
- NIST physical constants, and the other non-NASA sources in the bibliography above.

Code in the game (all MIT licence)
- React 19.3.1, React DOM 19.3.1 and scheduler 0.28.0: https://react.dev
- Three.js 0.187.0: https://threejs.org
- Their notices ship with the game: https://coderofvibes.github.io/recursion/THIRD-PARTY-NOTICES.txt

Development tools (not in the game)
- TypeScript, Vite, Vitest, ESLint and Prettier, on Node.js
- Python and NumPy, for reference calculations
- Google Chrome, driven by script, to check the release build
- GitHub Pages and GitHub Actions, for hosting

Generative AI tools (described in the AI use field)
- Claude (Anthropic) and OpenAI Codex: development assistance
- ElevenLabs Sound Effects: all audio. Prompts: https://github.com/CoderofVibes/recursion/blob/main/docs/audio/cues.md
- MidJourney: reference images for the owner only; none is in the game, the video or the repository

Assets
- No third-party images, 3D models, textures, music or fonts are in the game. The ship, the room and every view are drawn by the game's own code, and text uses fonts already on the player's device.
- The video was recorded from the game with Windows Game Bar and trimmed in Clipchamp.

Licence
- Recursion's original code and documentation: Apache License 2.0. https://github.com/CoderofVibes/recursion/blob/main/LICENSE
```

## 8. AI use

The owner's notes: AI use is acceptable; say clearly where and how; a visible mark on AI-generated images and video; acknowledge AI-generated audio, code and data in text and metadata.

```text
We used generative AI tools to build Recursion, under the owner's creative direction. The owner supplied the premise, the engineering loop, recurrence and the Black Box, the fictional gravity, the encounter ideas and the visual direction, played the builds, and made the creative and scope decisions.

Code, tests, studies and documentation: Claude (Anthropic) and OpenAI Codex wrote and reviewed them, working as separate threads on separate parts. Where one wrote the mathematics, the other implemented and tested it, so each checked the other. This includes the simulation, the ship's systems, the predictive model, the console and 3D views, the test suite, the design studies and this submission text.

Data: the NASA GMAT reference trajectories were computed by GMAT itself. The scripts that ran GMAT and converted its output were written with AI assistance. No trajectory number was generated by a language model.

Audio: every sound in the game and in the video is AI-generated. The owner generated each one with ElevenLabs Sound Effects from text prompts, which are in the repository. This is acknowledged in the game's CREDITS page, in the README, on the video and in the video's description.

Images and video: none is AI-generated. Every picture in the game and the video is drawn by the game's own code. The owner used MidJourney to make reference images for the look of the window views; none of them is in the game, the video or the repository.

The video: it carries a small label in the corner throughout ("Gameplay, edited · built with AI assistance · audio: ElevenLabs, AI-generated"), and its final card repeats the labels in full: edited gameplay with some shots staged for the video, built with AI assistance, audio by ElevenLabs.

Not an AI tool: the "model" inside the game is a statistical estimator that we wrote. It fits physical parameters to the ship's recorded measurements and runs in the player's browser. It is not a language model and calls no AI service.
```

Short version:

```text
Built with AI assistance under the owner's creative direction. Claude (Anthropic) and OpenAI Codex wrote and tested the code, studies and documentation. All audio in the game and the video is AI-generated with ElevenLabs, acknowledged in the game's credits, the README and the video. No image or video is AI-generated: every picture is drawn by the game's code; MidJourney was used only for the owner's reference images, and none ships. The video is labelled throughout and on its final card. The in-game predictive model is a statistical estimator we wrote, not an AI service.
```

## Also

- **Certificate:** choose **Letter** paper size when you download it.
- **Challenge:** Space Mission Design Game. Check it is the one selected on the team page.
- **Event:** Local Event San Marino, California, taken part in virtually. Submission time **5:00 p.m. Pacific, Sunday November 15** (the portal itself stays open until 11:59 p.m.).
- **Team:** solo. Claude and Codex go in the AI use field, not on the roster.
- **Judging criteria** (impact, creativity, validity, relevance, presentation): the summary and details above speak to each; validity rests on the GMAT comparison and the honest limits.
- **After pasting:** tick the terms, press Submit, and check the project page shows as submitted. Saving alone doesn't submit.

## Before you paste

Things that must be true at the moment of submission, each set by a later step of the final thread:

1. **The site and the repo are today's build.** The repository links above point at `main` on GitHub; they resolve once `main` is pushed. The GMAT links include the three inclined cases only after that push.
2. **The audio line.** "Every sound in the game … acknowledged in the game's CREDITS page, in the README" is true once the credits and README changes are in and the trailer branch, which carries the sound files, is merged and pushed. If the game ships silent, change "in the game and in the video" to "in the video" in fields 5, 7 and 8.
3. **The video's labels and tools.** Field 8 quotes the corner label and the final card as planned; field 7 says Game Bar and Clipchamp. Match them to the video as recorded.
4. **The test count.** "More than 1,500 automated tests" follows 3F's last full check (1,554 passed); the final `npm run check` should confirm it.
5. **The demo link.** Replace the placeholder in field 3 and open it from a private window.
