# S8 — Twin Deeps in 3D

**Recommendation:** retain the Beta assist and thin belt, correct the wide-pass speed table, and replace the departure gate's implied-assist assumption with a physical assist witness. Do not release a seed generator claiming to satisfy **low orbit followed by departure within the existing 16 m/s cumulative cap**: S8 has no such certified seed. A continuous low-orbit-then-assist reference exists, but consumes 46.2015 m/s main plus a proposed 1 m/s lift. This is an objective-budget conflict in the demonstrated route, not an assertion that all conceivable trajectories are impossible.

[DEMONSTRATED: `python tools/studies/s8/generate.py --check`] The independent reference reproduces the central assist mechanics and the 90-hour route counts. It identifies these consequential qualifications:

| Check | Result |
|---|---|
| Representative 14 m/s route | Beta 981.456 km; exit 66.309 m/s at 63.914 h. Close to 2G's 980 km, 66 m/s, 64 h. |
| Isolated turn table | All 24 angles reproduce nearest-degree rounding. One periapsis speed differs by −0.529 m/s. |
| 689-flight population | At an inferred 90 h cutoff: exactly 120 exits, 154 Beta impacts, 26 Alpha impacts, 14 qualifying departures. Permanent binding is not established. |
| Wide-pass table | Fixed 1.1 h burns: 1,400 km → 56.370 m/s; 1,570 km → 50.898; 1,660 km → 48.081. The last fails the 50 m/s gate. |
| Belt, new 40-ring ensemble | Blind losses 29/22/5; +1 m/s lifted losses 11/0/2 at 715/830/980 km. Broadly consistent with the scratch table; fixed lift is not universally safe. |
| Threading | Disclosed one-trim menu certifies 30/36/38 of 40 with 1 km clearance and the speed/budget gate. Original controller absent; 0/40 losses is not independently reproduced. |
| Vertical motion | Early +0.3/+0.6 m/s yields −2.406/−4.813 km at pass; +1 m/s eight hours before yields +22.339 km. Oscillation confirmed. |
| Plain burn comparison | Assist gains 33.631 m/s over equal-14 m/s plain control; 27.434 m/s over best tested 16 m/s plain control. |
| Low orbit | A full turn at 494.19–494.96 km costs 22.2015 m/s before departure; exceeds the cap by 6.2015 m/s. |
| Wrong-law failure | Same inertial dive command: residual proxy visible 4,977 s before Alpha contact. A reference abort is possible; actual display/model readiness needs integration tests. |

Numbers above are reference calculations under the fictional P4 law and explicitly specified assumptions. They are not claims about human difficulty, the current game model's covariance or whole-ship resource endurance.

## Deliverables

- [reproduction.md](reproduction.md): source values, independent equations, convergence, every representative/route/vertical comparison, and limits on unreproduced scratch claims.
- [turns-objective.md](turns-objective.md): all twelve scattering rows with signed differences, no-drift proof, direct-burn controls, gain and objective weaknesses.
- [ring.md](ring.md): statistical reproduction, trimming policy, phase screen, full-field closest approaches and numerical controls.
- [seeds.md](seeds.md): candidate geometries, exact rejection denominators, low-orbit conflict, constructive longer route, warning/contact vector and proposed admission rules.
- [tools/studies/s8](../../../tools/studies/s8/): deterministic Python, input manifest and explicit JSON states. [vectors.json](../../../tools/studies/s8/vectors.json) identifies and specifies the informed run, readable wrong-law failure, rejected seed and ring crossing.

## Reproduce

From the S8 worktree, using the already installed Python and NumPy:

```text
python tools/studies/s8/generate.py
python tools/studies/s8/generate.py --check
```

The first command writes all computed JSON beside the scripts; the second recomputes the full study and fails if any serialized output changes. It does not rewrite results. Full replay takes several minutes because it propagates all particles and all candidate controls. The recorded runtime is Python 3.14.2 / NumPy 2.4.1; cross-platform ports should use the numerical tolerances rather than require identical decimal serialization. No installation, network, TypeScript build, external game process or original scratch script is needed. `inputs.json` is the reviewed frozen extraction, not regenerated from a moving branch.

[ASSUMED: independence boundary] Values come from 2G commit `2986c3551a6a5bf1fd79262e48e39024ad937769`, read with `git show`: its handoff, `world.ts`, `index.ts`, `data/ship-baseline.json`, and the `DEPART` constant exported by `briefing.ts`. Source SHA-256 values are in the input manifest. Production integrator, RNG, planner/model and objective implementation were not read or imported. RK4, scattering quadrature, swept distances and a separate scalar Verlet check were written independently. Explicit generated Cartesian states remove any need to port the independent NumPy RNG to the game.

## What the seed findings authorize—and do not

[DEMONSTRATED: `seeds.json`, `ring-phase.json`] The proposed prototype catalogue uses relative arrival offsets −15°, −10°, −5°, 0°, +5°, +10°, +15°, adapted burn epochs and coherent binary rotation through 360°. All seven pass the body-only nine-control neighborhood. Three boundary/centre geometries combined with forty fixed-layout ring phases pass a measured-safe choice of ±1 m/s lift: 0/120 rejected, versus 1/120 for fixed +z. The broader −30°…+30° grid rejects 2/13 in its finite first-window search. All quoted fractions have explicit, different denominators; they must not be multiplied into a fabricated global acceptance rate.

[DEMONSTRATED: `ring-neighborhood.json`] For the complete 336-rock witness, perturbing the main burn by ±60 s and ±0.05 m/s gives nine physically safe exits at 59.679–65.715 m/s. Eight also exceed the conservative 1 km extra clearance buffer; the ninth clears by 965.848 m. This demonstrates multiple complete-flight controls for that one layout, separately from the body-only catalogue.

[ASSUMED] These are finite mechanical candidates for **direct assist**, not a continuous seed-range proof or a joint certificate for every requirement. Full-field clearance, warning visibility under the actual model, fixed-sun sensing/power and incoming ship condition must be tested together. Requiring the low-orbit task with the current cap conservatively rejects all 13 tested relative geometries for lack of a passing combined witness. A safe initial instant alone never proves a safe observation interval. Reapply the arrival exclusion around the actual seeded ship, preserve current C01 state, and save the accepted geometry and briefing.

## Integration work and owner decisions

[ASSUMED: estimate, not an edit] 2G/2F would add approximately 150–300 lines of truth-side seed/certificate plumbing and 80–150 lines of serializable assist-objective state, plus fixture tests. Touch points are `src/content/gravity-range/world.ts`, `index.ts` and `briefing.ts`, the game objective evaluator and encounter definition, and possibly the objective/witness contract. Port the explicit states as independent expected vectors; do not import the reference search into `src/model/`. 2C must forecast the player's commands from measured data and preserve uncertainty/horizons. 2D should show frozen prediction versus measured trail, tracked full-hull clearance and remaining maneuver margin. The controls remain the player's (P6).

Tests needed outside S8 ownership: complete real-session lift/assist with ship systems, wrong-law observable warning and successful abort, inherited-state and inward-crossing gate counterexamples, science burns followed by assist, wide ring bypass, saved witness replay, accepted seed neighborhoods with all rocks, finite thrust and calibration uncertainty, fixed-sun coverage, and damaged-but-controllable arrival states.

Questions for the owner, each with a recommendation:

1. **Should low orbit remain mandatory before departure?** Recommend optional evidence gathering without the current encounter-wide cap blocking subsequent progress; preserve the physical fuel cost and require an actual assist. Merely raising the scalar cap makes plain-burn bypass easier.
2. **Must the assist traverse the belt?** A6 currently says yes. Recommend preserving it with a physical belt-crossing witness unless the owner expressly accepts wider assists.
3. **Should initial seeded content use a finite validated catalogue or S4's broad continuous ranges?** Recommend the finite catalogue plus a full-session rejection harness first. It loses some geometric variety, but avoids labeling untested offsets, inclinations and inherited velocities as safe.

No application or decision files were changed. The integrator owns the decisions and merge.
