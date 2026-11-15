# S21 — the Gravity range's belt and power

**Recommendation:** keep the 320-rock Beta belt and bank its trailing outer edge with a visible, explicitly fictional radiation crescent. Aim informed passages near **830 km**, not the old 980 km example. Keep the ship's existing power hardware and the encounter's **600 W/m²** sunlight; implement loss of critical electrical service, expose remaining endurance, and require deliberate array deployment and pointing.

These are recommendations for the integrator and owner, not edits to approved decisions or the application. Source snapshot: `0b5cc25` on `st/s21-belt-power`. All work is in this study's owned paths.

| Result | Reference evidence |
| --- | --- |
| Informed thread | 830.440 km Beta pass, 63.799 m/s exit at 67.433 h; **13.799 m/s speed margin**, **6.385 km** full-envelope rock clearance, zero cloud exposure |
| Execution neighborhood | Nine combinations of ±30 s main-burn timing and ±0.025 m/s delivered impulse all clear by at least **1.307 km**, leave at 62.074–64.974 m/s and avoid the clouds |
| Manual error envelope | At the separate 150° rock phase, all nine ±60 s / ±0.05 m/s cases clear by at least **3.282 km** and exit at 59.679–65.712 m/s |
| Finite thrust | 71.479 s quarter-throttle main burn and 40.312 s translation reproduce the route: 63.800 m/s exit, 6.392 km rock clearance |
| Wide bypass | Of 743 enumerated controls, 38 meet the speed gate with Beta periapsis ≥1,100 km. **All 38 exceed irreversible PDU exposure**. The fastest of 223 exits staying ≥2,600 km from Beta reaches **38.861 m/s**, missing the gate by 11.139 m/s |
| Blind rock passages | Four collisions in 12 fixed-layout phases at 830 km; same-rock 20 km approach cues precede contact by **14–26 minutes**. Blind survival remains possible |
| Ignoring power | Arrays stowed: fuel cells empty at **39.408 h**, critical-service loss at **44.508 h** in the reduced electrical fixture, about 22.9 h before the informed exit |
| Warning | Four-hour endurance caution at **40.467 h**; 4.042 h before the reference loss. A new caution drops warp to 1× (A12) |
| Informed power | Planned schedule: **35.445 h** additional dark endurance at exit; manual schedule with more off-sun operation: **25.378 h** |
| Seed support | Seven adapted S8 offsets, **62/63** nearby controls passing the extra clearance margin, complete field at one fixed layout, plus 28 fixed-sun power cases |

Every number in this table is **[DEMONSTRATED: `python tools/studies/s21/reference.py --check`]**, under the stated reference assumptions. The gravity law and cloud are **[FICTIONAL]**. Hardware ratings, cloud dimensions, control schedules and acceptance margins are **[ASSUMED]**. This is numerical authoring evidence, not a human playtest or a run of the production controller, thermal solver, estimator or UI.

The finite search does **not** prove that every conceivable delayed, multi-burn or arbitrarily inclined bypass is impossible. The crescent is finite and has real edges. Ship the validated catalogue first, retain S8's rejection rules, and extend the adversarial search with the production harness before admitting more geometries. Do not substitute a hidden belt-visited or learned-law flag for a physical failure.

## Read and reproduce

- [Belt and cloud specification](belt.md): alternatives, density, performance evidence, pass tables, exposure, blind failures and seed constraints.
- [Power balance](power.md): budgets, schedules, warning/loss rules, baseline versus encounter ownership.
- [Implementation and acceptance](integration.md): exact touch points, model/screens, tests and owner questions.
- [Reference runner](../../../tools/studies/s21/README.md) and [four required vectors](../../../tools/studies/s21/vectors.json).
- [Handoff](../../handoffs/s21.md).

From this worktree, with installed Python and NumPy only:

```text
python tools/studies/s21/reference.py
python tools/studies/s21/reference.py --check
```

The first command writes deterministic JSON beside the script. The second recomputes every result and compares serialization, then checks the acceptance conditions. It takes several minutes. No dependency installation, application mutation or live service is involved.

The best implementation couples the existing ship, measured cloud/rock forecasts, chronological component damage and real input replay through 2F/3A/3C/3E, then runs the A18 modest-laptop check. The smaller first version can use one smooth analytic crescent and the finite catalogue, retaining all damage and observation rules. It loses visual/cloud-layout variety and broad seed coverage; it must retain power loss, full-hull checks, warnings and the same release tests.
