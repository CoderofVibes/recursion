# src/app — app shell and screen routing

Owner: integrator (1A, 2F, 5A).

| File | Holds |
|---|---|
| `App.tsx` | The shell: creates the game once and hands its belief-side `GameControls` to the screen |
| `game.ts` | Composition root: the encounter, and the model and Black Box plugged into the loop. The one seam where 2C's modules replace the stand-ins |
| `bench/` | **Temporary** integration bench (2F): a 2D plot of the `ViewSnapshot`, readouts, time, plan, ship and recurrence controls. Replaced by the console (2D) and 3D view (2E). Placeholder styling in `app.css`; it does not use `src/theme` and is not a design |

Run it with `npm run dev`. Commit a retrograde burn of about 9.85 m/s, run at 1000×, and watch the solid measured trail leave the dotted forecast as the ship dives.
