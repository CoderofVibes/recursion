# Phase 1B physics reference tools

[ASSUMED] These tools specify and check the proposed mathematics in `docs/physics/derivation.md`. They are an offline reference for an independently written implementation, not evidence that an encounter is playable. They use Python's standard library and the installed Node runtime; no packages, downloads, or randomness are required.

## Run from the repository root

```text
python tools/physics/generate_vectors.py
python tools/physics/generate_vectors.py --check
python tools/physics/generate_vectors.py --validate-only
python tools/physics/generate_vectors.py --report
node tools/physics/benchmark.mjs
```

[ASSUMED] The first command validates then regenerates `tests/vectors/physics.json`. `--check` performs the same validation, regenerates in memory, and fails if the existing UTF-8 file differs byte for byte. `--validate-only` skips file comparison/writing. `--report` prints the proposed scale, circular binary periods, and a same-start Newtonian forecast error table without changing files. The last command is an independent velocity-Verlet accuracy and local performance probe; consult its output and the derivation before interpreting timings as a browser budget.

## What the vectors mean

[ASSUMED] The file has `version: 1`, `units: "SI"`, method/convention metadata, and 12 cases. Eight cases check closed forms, with exponents 2 and 2.5 at radii 0.5, 1, 2, and 4 times `r0`. Four cases contain trajectory checkpoints: `single-p2`, `single-p2p5`, `binary-p2`, and `binary-p2p5`. Case IDs are stable; object order carries no mathematical meaning.

[FICTIONAL] The proposed gravity law uses `K = GM * r0^(p-2)` with units m^(p+1) s^-2, then `a = -K*r/|r|^(p+1)` in m s^-2. `GM` retains m^3 s^-2 and the same `r0 = 1e6 m` applies to every source and interacting pair. The exponent-2 cases recover ordinary point-mass Newtonian gravity. There is no softening, thrust, atmosphere, body surface, or collision processing in these mathematical vectors.

[ASSUMED] Every case contains `law`, `initial`, and `expect`. Initial `r` and `v` are the ship's position in m and velocity in m s^-1. For single-body cases the source is fixed at the origin. Binary cases also provide `initial.bodies` with each body's `id`, `GM`, `r`, and `v`. Their two sources mutually accelerate while the ship is a massless test particle. Do not freeze the sources or include the ship in their force sums. The top-level `law.GM` is the primary's parameter; `initial.bodies` is authoritative for the binary's complete source list.

[ASSUMED] All coordinates are planar inertial Cartesian coordinates. Positive signed angular momentum is counterclockwise. The binary frame has its origin at the binary barycenter. `binary_angular_frequency` is in rad s^-1, with radians dimensionless. Trajectory checkpoints occur at 0, 1000, 5000, 10000, and 20000 s. Both single-body cases share `r = [1e6, 0] m`, `v = [0, 90] m s^-1`; the differing laws therefore make directly comparable predictions. Both binary cases share ship `r = [0, 2e6] m`, `v = [45, 0] m s^-1`; their body velocities differ because each binary must orbit consistently under its own law.

[ASSUMED] Each expectation contains `quantity`, `at_t` in seconds, `value`, an absolute `tolerance`, and `unit`. For vector values, compare each component to its corresponding expected component using the same scalar tolerance. `body_position` and `body_velocity` additionally select a source by `body`. Values at `at_t: 0` in closed-form cases are function evaluations, not time integration requests. Near-circular apsidal angles are limits as radial amplitude tends to zero; an exactly circular orbit has no uniquely defined periapsis.

| Quantity | Interpretation and units [ASSUMED: conditional definitions] |
|---|---|
| `speed` | Magnitude of initial circular velocity, m s^-1. |
| `acceleration` | Cartesian gravity vector at initial position, m s^-2; the 4-r0 case checks a non-axis-aligned quadrant. |
| `specific_potential` | Potential with zero at infinity, m^2 s^-2. |
| `specific_energy` | `|v|^2/2 + Phi`, m^2 s^-2, for a fixed single source. |
| `specific_angular_momentum` | Signed `x*vy-y*vx`, m^2 s^-1. |
| `circular_period` | Azimuthal circular orbital period, s. |
| `period_ratio_to_r0` | Circular period divided by the circular period at r0, dimensionless. |
| `escape_speed` / `escape_to_circular_ratio` | Zero-energy local speed, m s^-1 / dimensionless. |
| `epicyclic_frequency` | Small radial oscillation angular frequency, s^-1. |
| `near_circular_radial_period` | Small radial oscillation period, s. |
| `near_circular_apsidal_angle` | Angle from periapsis to adjacent apoapsis, rad. |
| `near_circular_periapsis_to_periapsis_angle` | Unwrapped angle between successive periapses, rad. |
| `near_circular_precession_per_radial_cycle` | The preceding angle minus 2*pi, rad; positive is prograde. |
| `position` / `velocity` | Inertial ship state, m / m s^-1. |
| `body_position` / `body_velocity` | Inertial source state, m / m s^-1. |
| `binary_specific_energy` | Binary kinetic plus mutual potential energy, divided by total binary mass, m^2 s^-2. No ship contribution. |
| `binary_specific_angular_momentum` | Binary signed angular momentum divided by total binary mass, m^2 s^-1. |
| `binary_barycenter` / `binary_barycentric_velocity` | Source mass-weighted mean position / velocity, m / m s^-1; weights are GM_i / sum(GM_i). |
| `ship_jacobi_constant` | `C = -2*Phi - |v|^2 + 2*omega*(x*vy-y*vx)`, m^2 s^-2, in the inertial barycentric representation of the circular binary. |

[ASSUMED] Invariant expectations repeat their analytic initial value at every time. They deliberately do not record the slightly drifted reference integrator values. In the moving binary field, the ship's inertial energy and angular momentum are not separately conserved. Only the circular binary's rotating symmetry gives the stated ship Jacobi constant. The binary energy and angular momentum refer solely to the two massive sources.

## Reference integrator and checks

[ASSUMED] The generator implements the seven-stage Dormand-Prince embedded explicit 5(4) formula directly. It accepts the fifth-order solution, estimates error by its difference from the fourth-order solution, and uses the maximum component ratio `abs(error) / (atol + rtol*max(abs(old), abs(new)))` as a dimensionless acceptance norm. A step is accepted when that ratio is at most 1. The next-step factor is `0.9*error_norm^(-1/5)`, clipped to [0.1, 5]; the zero-error factor is 5. Steps are clipped to land exactly on requested checkpoints. This offline adaptive method is separate from the recommended deterministic fixed-step game integrator.

| Control | Emitted reference [ASSUMED] | Refinement audit [ASSUMED] |
|---|---:|---:|
| Relative local tolerance, dimensionless | 2e-12 | 2e-14 |
| Position absolute local tolerance, m | 1e-7 | 1e-9 |
| Velocity absolute local tolerance, m s^-1 | 1e-11 | 1e-13 |
| Initial step, s | 1 | 1 |
| Maximum step, s | 100 | 50 |

[ASSUMED] Local tolerances do not prove a global error bound. The script also runs an independently coded classical fourth-order Runge-Kutta integration with a fixed 5 s step. Every emitted trajectory component must agree with both the refined Dormand-Prince run and the independent RK4 run within 1e-4 m or 1e-8 m s^-1. Separate checks compare the Newtonian eccentric orbit to its analytic Kepler solution, both laws' circular orbits to exact one-period closure, and binary source positions/velocities to exact uniform circular rotation.

[ASSUMED] Further checks compare the negative finite-difference potential gradient to the force, and verify single-body energy/angular momentum, isolated-binary energy/angular momentum/barycenter/velocity, and the test ship's Jacobi constant. A small radial perturbation of 1e-4 at fixed circular angular momentum is integrated with an unwrapped polar-angle state. A turning point is located by bisection near the next radial period; its angle must approach the analytic near-circular limit within 2e-6 rad. The initial perturbation is finite, so its true angle need not equal the zero-amplitude limit exactly.

[DEMONSTRATED: `python tools/physics/generate_vectors.py --check`] The initial local run passed all checks. The largest baseline/refinement differences were approximately 1.44e-6 m and 2.01e-10 m s^-1. The independent RK4 comparison reached approximately 1.47e-6 m and 2.03e-10 m s^-1. The near-circular p=2.5 turning-point angle was 8.885765882749 rad, versus limit 8.885765876317 rad. These results audit the reference calculation only; Phase 2 must independently test the production simulation.

## Consumer accuracy and limits

[ASSUMED] Trajectory `position`/`body_position` tolerance is 0.1 m, while `velocity`/`body_velocity` tolerance is 1e-5 m s^-1. These deliberately exceed reference calculation error. They are proposed implementation-test thresholds for the specified 20000 s cases, not guarantees about every step size or arbitrary close approaches. A consumer should run with an adequately small fixed step, then demonstrate step-halving convergence. Closed-form checks have much tighter tolerances because no integration error is involved. Invariant checks have separate units and thresholds; do not use the position tolerance as an energy tolerance.

[ASSUMED] The reference uses IEEE-754 Python floats. Repeated generation on the recorded environment must be byte-identical. Different platform math libraries can differ in final rounding digits; investigate such differences numerically using the stated tolerances before accepting a regenerated artifact. This does not assert cross-engine bitwise identity for the future browser simulation. No trajectory here tests a surface crossing, a thrust schedule, well boundaries, radiation dose, uncertain observations, or playability.
