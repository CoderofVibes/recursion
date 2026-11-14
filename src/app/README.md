# src/app — app shell and screen routing

Owner: integrator (1A, 2F, 5A).

| File | Holds |
|---|---|
| `App.tsx` | The shell: creates the game once and hands its belief-side `GameControls` to the screen |
| `game.ts` | Composition root: the encounter; 2C's model client (Web Worker) behind the model bridge; 2C's Black Box saved to IndexedDB, one slot per encounter build; a saved archive restored on start and the model rebuilt from it |
| `bench/` | **Temporary** integration bench (2F): a 2D plot of the `ViewSnapshot`, readouts, and time, plan, ship, rule and recurrence controls. Replaced by the console (2D) and 3D view (2E). Placeholder styling in `app.css`; it does not use `src/theme` and is not a design |

Run it with `npm run dev`.

1. Commit the default plan (retrograde, 9.85 m/s), choose 1000×, Run. The solid measured trail leaves the dotted forecast as the ship dives, and the forecast ends early.
2. Recall. Commit a different dive (say 5 m/s) and fly it. `Strength` now shows Alpha pulling about 1.4 times harder at 500 km than at 1,000 km against the model's law.
3. Recall. Under `Rule`, hold out attempt 1 and press Test. If it holds, Adopt.
4. Commit a dive deeper than before and watch the forecast against the trail.

`Erase records` clears the saved Black Box for this encounter and reloads.
