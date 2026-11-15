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

1. Walk to the console (WASD; click to look) and aim at a pad, or press `1` MAP, `2` SHIP, `3` CONSOLE, `4` FLIGHT (the same four are buttons at the bottom of the room). `Esc` steps back. In MAP, SHIP and FLIGHT, `-` `=` zoom, `,` `.` turn, `[` `]` tilt and `/` resets the view.
2. **CONSOLE › MISSION:** choose what the attempt is for and its margins, then RECORD DESIGN AND SET UP. Prepare as long as you like: the encounter clock waits at arrival. ENTER starts it.
3. **FLIGHT:** hold `W` for the main engine, `Q` / `E` to yaw, `↑` / `↓` to pitch, `A` `D` `R` `F` `S` to translate. When the hands come off, a coasting forecast is issued: dotted, frozen. Or plan a timed burn in **CONSOLE › PLAN** and COMMIT. Choose a warp and watch the solid trail against the dotted forecast.
4. **CONSOLE › BLACK BOX:** RECALL ends the attempt. Its debrief is there when you walk back in. Fly a different dive, then choose A and B in Compare, and SET FLIGHT OVERLAY.
5. **CONSOLE › MODEL:** strength against distance shows the pull departing from the model's law. Hold out an attempt, TEST the distance law, ADOPT it if it holds. The next forecast reaches further.

Time (A12): before entering, nothing is dangerous and the clock waits. Inside the encounter there is no pause: every adjustment happens in real time, and the warp steps compress long coasts, never slower than 1×. Hiding the page holds the game; a new caution or warning drops warp to 1×, and the reason stays beside the time controls until you raise warp again.

Keyboard (S9): the scene canvas, the console's page tabs and every control are reachable with Tab; focus follows the view; a focused control keeps Space, Enter and the arrows, every other key still reaches the scene; Escape in a field leaves the field first.

## Hands-on flying

`hands.ts` turns the flight keys into `HandsOnInput` and sends it through `GameControls.fly` (2G): `W` main engine (`Shift` for a quarter throttle), `S` retro, `A` / `D` lateral, `R` / `F` vertical, `Q` / `E` yaw, `↑` / `↓` pitch, `X` cut. The game flies the input until the next one and issues the coasting forecast when the controls are released.

## Development handle

In the dev build only, `window.__recursion` holds `{ game, desk, view, step }`, and `?view=flight` or `?view=console&page=model` opens straight into a view. `step(frames, seconds)` runs frames by hand when the page is in the background and the browser holds its animation frames.
