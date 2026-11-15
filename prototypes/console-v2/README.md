# prototypes/console-v2 — a recorded flight for the console's layout mockups

Owner: 3F (the UI lane). Dev only; nothing here ships.

`flight.json` is real game state, recorded from the dev build on 2026-11-15 playing Twin Deeps on
the real ship, model and Black Box:

- a 16 m/s retrograde dive forecast on model v0, before anything is measured (it ends at
  T+04:43, 370 km ±45 km from Alpha and still closing: "beyond the data");
- two flown dives (9.85 and 5 m/s), with their measured trails, issued forecasts and where each
  left its forecast;
- the model's strength-against-distance report before the law (slope −0.50) and after it (flat);
- the distance law fitted on attempts 1–2 and held out on attempt 3 (T/ν 0.96 against 1.11,
  exponent 2.5001), adopted as model v6;
- the same 16 m/s plan forecast with the law (it reaches 125 km ±13 km at T+05:49);
- the ship's definition and its telemetry in flight.

The mockups read it at `/src/theme/lab/console-v2.html` (`npm run dev`).

## Recording it again

`capture/` holds what recorded it. It drives the dev build (port 5183) in headless Chrome with
NIGHT's driver (`docs/handoffs/night/judge-run/`), real keys and clicks only, and reads the
state through the dev build's `window.__recursion`:

1. `capture.sh`, then `capture2.sh`: the forecast on model v0, the dives, TEST, ADOPT, the
   forecast with the law (`a-`, `b-`, `c-`, `d-*.json`).
2. `capture3.sh`: the model's report after two dives, before the law (`e-report-before.json`).
3. `node pack.mjs prototypes/console-v2/flight.json`: packs the dumps into one file.

The scripts write their dumps beside themselves (set `S` to write elsewhere); the dumps are not
committed, only the packed `flight.json`. Wait for ENTER to be enabled after
COMMIT (`capture2.sh` does): the commit's forecast can take more than a few seconds when the
machine is busy, and ENTER is disabled until it arrives.
