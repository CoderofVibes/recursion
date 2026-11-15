# src/console — the console's screen and the instruments beside the holograms

Owner: 2D (control room), then 3F. Belief side: nothing here may import truth or `src/sim/` (P11, lint-enforced). `encounters/` belongs to the sections that build encounters.

Everything on screen that is not three-dimensional. It reaches the game only through `GameControls` (`src/game/belief/controls.ts`) and is composed from the theme's primitives (`src/theme/components/`).

| File | Holds |
|---|---|
| `ConsoleScreen.tsx` | CONSOLE: the screen that takes over the view (A8), with its pages and the time controls |
| `pages/ExplorationPage.tsx` | EXPLORATION (it was MISSION until A26). Preparation as a visible step: evidence goal, reserve and clearance, sensor, recorder and configuration, approach. Committing records the design in Black Box and sets the ship up |
| `pages/PlanPage.tsx` | Timed burns (prograde, retrograde, toward or away from a body, or from the body axis; by speed change or duration; throttle), sensor pointing, preview and commit with what the envelope is made of, saved procedures (in Black Box), Recall. The rows live on the desk |
| `pages/ModelPage.tsx` | Parameters with uncertainty and share from data, strength against distance (with its data as a table), rules tested against a held-out attempt with adopt and revoke and a plain result, validated spans against the distances the flight visits, calibration freshness, the confounding indicator, what each attempt gives the model, and on request each burn's response and any pull the law does not explain |
| `pages/BlackBoxPage.tsx` | Attempts, the debrief, the two-attempt comparison and its overlay, the recorder as a resource |
| `pages/SystemsPage.tsx` | Buses, stores, heat margin, every assembly with its modes, allocation and readings |
| `pages/CreditsPage.tsx` | The licence, notice and third-party notices under the deployment base, and the README's credits and verification |
| `FlightHud.tsx` | Around FLIGHT: keys, readouts, the margin to act (nearest clearance from the hull, next pass, Δv to spend, the miss from the forecast), margins, alerts, time, the chosen object, framing |
| `ShipPanels.tsx` | Beside SHIP: schematic, levels, trends, readouts and components of the isolated system |
| `MapPlate.tsx`, `chart.ts` | Beside MAP: what the ship holds about the charted region or lead, and the charted objects as a list |
| `Framing.tsx` | Zoom, turn, tilt and reset for a hologram, as buttons with their keys |
| `desk.ts` | The player's working state at the console (design, the plan being edited and its draft forecast, selection, trend history, the model's last report, why warp last dropped), and the frame's snapshot and Black Box's archive, read once for every view |
| `mission.ts` | The mission design as a Black Box annotation, and the debrief computed from an attempt's record |
| `data.ts` | Instrument rows from the believed ship: stores, bus loads, heat margin, recorder, Δv |
| `controls.tsx`, `StrengthPlot.tsx`, `console.css` | Local controls built on theme tokens (listed for the UI lane in `docs/handoffs/2D.md`) |

## Encounter panels

An encounter's own instruments go beside FLIGHT. The interface is `encounterPanels.ts`; each panel lives in `encounters/<encounter-id>/` and belongs to the section that builds that encounter. Its `index.ts` registers the panel for its encounter id. The console loads every `encounters/*/index.ts` eagerly; the registry is hoisted, so registering by a plain static import back is safe while that load is still under way. `index.ts` is not JSX, so build the element with `createElement`:

```ts
// src/console/encounters/chain-link/index.ts
import { createElement } from 'react';
import { registerEncounterPanel } from '../../encounterPanels.ts';

registerEncounterPanel('chain-link', ({ snapshot, command }) =>
  createElement(ChainLinkPanel, {
    state: stateFrom(snapshot),
    onMode: (m: ReconstructionMode) => command(latticeModeCommands(m)),
  }),
);
```

- `snapshot` is the frame's (no second one is built); `game` is `GameControls`.
- `command` sends each command to the ship through `GameControls.command`, as SYSTEMS's controls do: in real time, never a pause (A12). Show delivered values from telemetry, never the request.
- FLIGHT zooms to `rangeMinFor(encounterId)` in true metres (`src/view3d/flight/FlightHolo.ts` `NEAR_RANGE`: the Chain Link 120 m; elsewhere 5 km).

## Rules it keeps

- **The model forecasts; the player plans and flies** (P6). No control here plans a burn.
- **Rules come only from the player** (A4). TEST never adopts; ADOPT is offered only for a rule whose test passed.
- **Missing is shown as missing.** No points where there are no windows; a constraint that could not be judged from the record reads "not recorded", never a guess.
- **The mission design travels in Black Box** as a `mark` command, so the debrief is computed from the record alone and survives recurrence and reloads.
- **Read the game once.** Views take the frame loop's snapshot from `desk.snapshot()` and the archive from `desk.archive()` (read at most every 2 s while an attempt runs: reading the record in progress copies it).
- **Keyboard first-class** (S9): a focused control keeps its own keys; chip groups are one Tab stop with arrows; long pages are a scrollable region; focus goes somewhere after every change of view.
- **Every visual value is a theme token.** `console.test.ts` fails on a literal colour, pixel size or timing in the stylesheets.

## Tests

`console.test.ts`: the design round trip, the debrief (forecasts bounded by their end, a loss outside coverage) and change list on the fixture attempts, instrument rows, the margin to act, formatting, and the stylesheet rule. `desk.test.ts`: the plan being edited. `time.test.tsx`: time controls, the next event and its wall time, new alerts. `pages.test.tsx`: every page on the fixtures, MODEL's test wording, the credits links, the map plate.
