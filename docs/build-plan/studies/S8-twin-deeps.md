# S8 — Twin Deeps in 3D: an independent check of 2G's slingshot study

**Thread:** GPT/Codex · **Branch:** `st/s8-twin-deeps` · **Read:** [the study rules](README.md), then DECISIONS A6, A10, A11 and P16, `docs/physics/derivation.md`, and `docs/design/regions/c02-twin-deeps.md` (S4). From 2G's branch, read only, with `git show p2/2g-3d-flight:<path>`:
- `docs/handoffs/2G.md`, especially "The 3D slingshot study (DECISIONS A6)" and "The belt";
- `src/content/gravity-range/world.ts` and `index.ts`;
- `data/ship-baseline.json`.

## Question
Thread 2G built the Gravity range in 3D: Beta's ring (the belt), the `depart` objective, and a slingshot study whose route and ring numbers came from a scratch propagator that is not in the repository. The study's own scripts are scratch work. The Gravity range is the encounter judges will play. Do its numbers hold up when someone else computes them, and which run-to-run geometries (A10) keep it fair and learnable?

## Deliver
In `docs/studies/s8/`, with a deterministic Python reference in `tools/studies/s8/`:
1. **Independent reproduction:** rebuild the range from 2G's committed values (bodies, law, ring, ship), without reading 2G's code beyond those values, and recompute:
   - the representative route and turn-angle table;
   - the ring-pass table: flown in the plane without looking, lifted over the ring, threaded with trims;
   - the out-of-plane result: a vertical kick at departure oscillates instead of adding height, so the lift goes a few hours before the pass.

   Report every number that agrees, and every one that doesn't, with the size of the difference.
2. **Admissible seeds:** with masses, sizes and the law fixed (A10), the ranges of arrival direction, Beta's phase and the ring's phase in which:
   - an informed player can reach the low-orbit band and then make the exit, with a stated propellant margin;
   - a player flying the Newtonian guess gets a forecast that is visibly wrong before it is lethal (A9, P6);
   - no seed is lethal on arrival or demands one exact solution.

   Give rejection rules a seed generator can apply, and the fraction of seeds they reject.
3. **The `depart` objective:** check that 2G's rule can't be met by drifting out or burning straight out, and give the slingshot's gain against a plain burn, in m/s.
4. **Reference vectors** 2G or 2F can port as tests: an informed exit, a wrong-law run that fails readably, a rejected seed, and a ring crossing with its closest approaches.

Don't edit `src/` or 2G's branch.
