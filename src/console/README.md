# src/console — the console's screen and the instruments beside the holograms

Owner: 2D (control room), then 3F. Belief side: nothing here may import truth or `src/sim/` (P11, lint-enforced). `encounters/` belongs to the sections that build encounters.

Everything on screen that is not three-dimensional. It reaches the game only through `GameControls` (`src/game/belief/controls.ts`) and is composed from the theme's primitives (`src/theme/components/`).

| File | Holds |
|---|---|
| `ConsoleScreen.tsx` | CONSOLE: the screen that takes over the view (A8), with its pages and the time controls |
| `pages/MissionPage.tsx` | Preparation as a visible step: evidence goal, reserve and clearance, sensor, recorder and configuration, approach. Committing records the design in Black Box and sets the ship up |
| `pages/PlanPage.tsx` | Timed burns (prograde, retrograde, toward or away from a body, or from the body axis; by speed change or duration; throttle), sensor pointing, preview and commit, saved procedures, Recall |
| `pages/ModelPage.tsx` | Parameters with uncertainty and share from data, strength against distance, rules tested against a held-out attempt with adopt and revoke, validated spans against the distances the flight visits, calibration freshness, the confounding indicator, what each attempt lacks |
| `pages/BlackBoxPage.tsx` | Attempts, the debrief, the two-attempt comparison and its overlay, the recorder as a resource |
| `pages/SystemsPage.tsx` | Buses, stores, heat margin, every assembly with its modes, allocation and readings |
| `FlightHud.tsx` | Around FLIGHT: keys, readouts, margins, alerts, time, the chosen object |
| `ShipPanels.tsx` | Beside SHIP: schematic, levels, trends, readouts and components of the isolated system |
| `MapPlate.tsx`, `chart.ts` | Beside MAP: what the ship holds about the charted region |
| `desk.ts` | The player's working state at the console (design, draft forecast, selection, trend history, the model's last report) |
| `mission.ts` | The mission design as a Black Box annotation, and the debrief computed from an attempt's record |
| `data.ts` | Instrument rows from the believed ship: stores, bus loads, heat margin, recorder, Δv |
| `controls.tsx`, `StrengthPlot.tsx`, `console.css` | Local controls built on theme tokens (listed for the UI lane in `docs/handoffs/2D.md`) |

## Rules it keeps

- **The model forecasts; the player plans and flies** (P6). No control here plans a burn.
- **Rules come only from the player** (A4). TEST never adopts; ADOPT is offered only for a rule whose test passed.
- **Missing is shown as missing.** No points where there are no windows; a constraint that could not be judged from the record reads "not recorded", never a guess.
- **The mission design travels in Black Box** as a `mark` command, so the debrief is computed from the record alone and survives recurrence and reloads.
- **Every visual value is a theme token.** `console.test.ts` fails on a literal colour, pixel size or timing in the stylesheets.

## Tests

`console.test.ts`: the design round trip, the debrief and change list on the fixture attempts, instrument rows, formatting, and the stylesheet rule.
