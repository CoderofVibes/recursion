# S8 — Twin Deeps in 3D: the varied geometry and the slingshot exit

**Thread:** GPT/Codex · **Branch:** `st/s8-twin-deeps` · **Read:** [the study rules](README.md), then DECISIONS A6, A10, A11, A12, A13 and P16, `docs/design/regions/c02-twin-deeps.md` (S4), `docs/physics/derivation.md`, `src/content/gravity-range/` (`world.ts`, `briefing.ts`, `index.ts`), `data/ship-baseline.json`, and `docs/handoffs/2D.md` (R1, R2).

## Question
The Gravity range (Twin Deeps) is the first encounter and the one judges will play. Its bodies, masses and law are fixed (A10). Its geometry changes from run to run. The player leaves by a slingshot at Beta through its orbiting belt (A6). In 3D, which geometries make a fair, beautiful, learnable encounter, and what exactly counts as leaving?

## Deliver
In `docs/studies/s8/`, with a Python reference in `tools/studies/s8/`:
1. **The range in 3D:** Alpha, Beta, the Sun and the belt with today's values, and every quantity A10 lets vary: arrival direction and inclination, Beta's phase, the belt's plane and phase, and anything else. Give ranges for each.
2. **Admissible seeds:** for each varied quantity, the range in which:
   - an informed player (law learned) can reach the low-orbit band and then make the Beta exit, inside the ship's propellant with a stated margin;
   - a player flying on the wrong law (the Newtonian inverse-square guess) gets a forecast that is visibly wrong before it is lethal, so failure teaches (A9, P6);
   - no seed is lethal on arrival or forces a single exact solution.

   Give rejection rules a seed generator can apply, and the fraction of seeds they reject.
3. **The exit:** a physical definition of the `depart` objective (2D's R1): what state, measured where, proves the ship left by the slingshot through the belt rather than drifting out. Give the gain the slingshot provides against a plain burn out, in m/s.
4. **The belt:** rock count, sizes and spacing so that crossing it is a real hazard with a readable safe line. Say which rocks can serve as known-size targets for ranging (R2) and what that ranging could teach about the law.
5. **Reference vectors** for 2G's step 5 tests:
   - an informed run to band and exit;
   - a wrong-law run that fails readably;
   - a rejected seed;
   - a belt crossing with closest approaches.

Thread 2G builds this as its step 5. Say what to build and test; don't edit `src/`.
