# src/app — app shell

Owner: 2D (control room), except `game.ts`, which belongs to the game loop (2F; 2G during the 3D conversion).

| File | Holds |
|---|---|
| `App.tsx` | Creates the game once and mounts the control room |
| `game.ts` | Composition root: the encounter; the model client (Web Worker) behind the model bridge; Black Box saved to IndexedDB; a saved archive restored on start |
| `ControlRoom.tsx` | The one screen (DECISIONS A8): the room's canvas with the instruments laid over it |
| `loop.ts` | The frame loop: advance the game, take `snapshot()`, fly from the keys, hand the room what to draw; the walk back to the door when an attempt ends |
| `hands.ts` | Flying by hand from the keys, through the commands the game offers today (see below) |
| `control-room.css`, `app.css` | Overlay layout. Tokens only |

Run it with `npm run dev`.

## Playing the Gravity range

1. Walk to the console (WASD; click to look) and aim at a pad, or press `1` MAP, `2` SHIP, `3` CONSOLE, `4` FLIGHT. `Esc` steps back.
2. **CONSOLE › MISSION:** choose what the attempt is for and its margins, then RECORD DESIGN AND SET UP.
3. **FLIGHT:** hold `W` for the main engine, `Q` / `E` to yaw. When the hands come off, a coasting forecast is issued: dotted, frozen. Or plan a timed burn in **CONSOLE › PLAN** and COMMIT. Choose a warp and watch the solid trail against the dotted forecast.
4. **CONSOLE › BLACK BOX:** RECALL ends the attempt. Its debrief is there when you walk back in. Fly a different dive, then choose two attempts to compare, and OVERLAY IN FLIGHT.
5. **CONSOLE › MODEL:** strength against distance shows the pull departing from the model's law. Hold out an attempt, TEST the distance law, ADOPT it if it holds. The next forecast reaches further.

Time runs while you are in the room (owner, A8). HOLD on the console stops it.

## Hands-on flying

`hands.ts` maps the flight keys to the `HandsOnInput` shape 2G's seam uses (translation on three axes, yaw and pitch, throttle). Until `GameControls.fly` is on main it flies with `command`: the main engine as a held burn (`W`; `Shift` for a quarter throttle) and yaw as a commanded rate (`Q`, `E`). Lateral, vertical, retro and pitch are read and shown but not yet sent. When the lift merges, `HandsOn.update` forwards the input to `fly` and the adapter's `PLANAR` functions go.

## Development handle

In the dev build only, `window.__recursion` holds `{ game, desk, view, step }`, and `?view=flight` or `?view=console&page=model` opens straight into a view. `step(frames, seconds)` runs frames by hand when the page is in the background and the browser holds its animation frames.
