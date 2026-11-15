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

[ASSUMED] Three-dimensional flight (DECISIONS A11) has its own file and the same modes behind one extra flag; see [Three-dimensional reference](#three-dimensional-reference-thread-2g-decisions-a11) below. Without `--3d` every command above behaves exactly as before and the planar file is never touched.

```text
python tools/physics/generate_vectors.py --3d
python tools/physics/generate_vectors.py --3d --check
python tools/physics/generate_vectors.py --3d --validate-only
python tools/physics/generate_vectors.py --3d --report
python tools/physics/generate_vectors.py --3d --consumer-probe
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

## Three-dimensional reference (thread 2G, DECISIONS A11)

[ASSUMED] `tests/vectors/physics-3d.json` is the reference for three-dimensional flight. `generate_vectors.py --3d` produces it; the code is in `vectors3d.py`, which reuses the planar file's Dormand-Prince stepper and nothing from the TypeScript simulation. The planar file `tests/vectors/physics.json` is not read or written on this path and stays the planar regression. The mathematics is in `docs/physics/derivation.md` §11.

### Commands

| Command | What it does | Time on the recording host |
|---|---|---:|
| `--3d` | Runs every audit, then writes `tests/vectors/physics-3d.json` | about 1 min |
| `--3d --check` | Runs every audit, regenerates in memory, fails if the file differs byte for byte; never writes | about 1 min |
| `--3d --validate-only` | Audits only | about 1 min |
| `--3d --report` | Prints the node-rate, belt and Jacobi-constant studies quoted in the derivation; never reads or writes JSON | about 2.5 min |
| `--3d --consumer-probe` | Reads the JSON file alone and integrates its cases with simple second-order schemes at the game's step; prints the worst error beside each tolerance | about 0.5 min |

### File layout

[ASSUMED] The top level has `version: 1`, `units: "SI"`, `status`, `generator`, `reference_method` (solver settings), `reference_audit` (the worst differences the audits found, to three figures), `conventions` and 12 `cases`. Each case has `id`, `description`, `kind`, `law`, `initial` and `expect`, as in the planar file. Vectors are `[x, y, z]`. Case IDs are stable; object order carries no meaning.

| Case IDs | `kind` | `initial` | Other fields |
|---|---|---|---|
| `inclined-single-p2`, `inclined-single-p2p5` | `trajectory` | ship `r`, `v`; fixed source at the origin (`source_dynamics: "fixed_origin"`) | `rotation` |
| `binary-crossing-p2`, `binary-crossing-p2p5` | `trajectory` | `bodies` (each `id`, `GM`, `r`, `v`), ship `r`, `v` | `binary_angular_frequency`, `binary_angular_velocity`, `plane_crossings` |
| `binary-inclined-p2`, `binary-inclined-p2p5` | `trajectory` | as above | `binary_angular_frequency`, `binary_angular_velocity`, `rotation` |
| `nodal-precession-p2`, `nodal-precession-p2p5` | `trajectory` | as above | `binary_angular_frequency`, `binary_angular_velocity`, `orbit_about_primary`, `nodal_precession` |
| `spin-axisymmetric`, `spin-triaxial`, `spin-triaxial-tilted-axes`, `spin-constant-torque` | `rigid_body` | `attitude`, `angular_velocity` | `inertia` (`moments`, `axes`), `inertia_tensor_body`, `torque_body`; `law` is `null` |

[ASSUMED] **What each case is for.**

- `inclined-single`: the planar `single-*` start (r = [10⁶, 0] m, v = [0, 90] m/s) rotated by R = Rz(35°)·Rx(50°)·Rz(25°), so no component is zero. Checks that an orbit about one fixed source stays in its plane and is the planar orbit turned in space.
- `binary-crossing`: the planar cases' binary, in the x–y plane, with a ship at r = [−300, 450, 160] km, v = [−70, 50, −90] m/s. It crosses the binary's plane twice within the run (`plane_crossings` gives the reference times, for information) and passes 584 km (p = 2) and 387 km (p = 2.5) from the primary. The only orbit case with genuinely three-dimensional relative motion at close range.
- `binary-inclined`: the planar `binary-*` case, bodies and ship together, rotated by R = Rz(110°)·Rx(40°)·Rz(−35°). The bodies move in z. Catches code that only works with the binary in the x–y plane; the Jacobi constant must use the binary's angular velocity **vector**.
- `nodal-precession`: the binary in the x–y plane and a ship started on the unperturbed circular orbit of radius r₀ about the primary, inclined 30°, node 40°, 25° past the node (`orbit_about_primary`). Run for 2×10⁶ s, about 32 ship orbits, in which the secondary turns the node by about 0.53 rad (p = 2) and 0.30 rad (p = 2.5).
- `spin-axisymmetric`: torque-free body with moments (6×10⁴, 5×10⁵, 5×10⁵) kg m², rates (0.04, 0.012, −0.009) rad/s. Steady precession; the expected values are the closed form (`closed_form` gives the two rates).
- `spin-triaxial`: torque-free body with moments (7×10⁴, 5.5×10⁵, 4.5×10⁵) kg m², tumbling near its unstable intermediate (yaw) axis. Numerical reference; `body_rate_closed_form` says how the initial rates were made.
- `spin-triaxial-tilted-axes`: the same motion described in a body frame turned 0.35 rad from the principal frame, so `inertia.axes` is not the identity and `inertia_tensor_body` is not diagonal. Catches code that ignores `axes`.
- `spin-constant-torque`: from rest, a constant 40 N m body-frame torque about the pitch principal axis. Closed form.

### Conventions

[ASSUMED] These are also in the file's `conventions` object.

- **Frames.** One right-handed inertial frame per case. The body frame is right-handed with +x forward (roll axis), +y left (pitch axis), +z up (yaw axis).
- **Force.** As in the planar file, with |·| the three-dimensional distance. Sources move under their mutual force; the ship is massless.
- **`rotation`.** `node_rad`, `inclination_rad`, `argument_rad` and the `matrix` rows of R = Rz(node)·Rx(inclination)·Rz(argument), the active rotation applied to every position and velocity of the named `planar_case` (lifted with z = 0).
- **Attitude.** A unit quaternion `[w, x, y, z]`, scalar first, Hamilton product, **body to inertial**: v_inertial = q ⊗ v_body ⊗ q*. (a ⊗ b) applies b first. **q and −q are the same attitude.** Compare the rotation, not the sign: flip the sign of your quaternion when its four-component dot product with the expected value is negative, then compare component by component. (The expected values follow the continuous path from the initial attitude and are not sign-normalised.)
- **Angular velocity.** In the **body frame**, rad/s. Kinematics q̇ = ½ q ⊗ (0, ω).
- **Inertia.** `moments` are the principal moments about the centre of mass, kg m². `axes` is the unit quaternion that turns principal-frame vectors into the body frame (identity: the body axes are principal), the contract's `Inertia`. `inertia_tensor_body` is the same tensor written in body axes, J = R(axes)·diag(moments)·R(axes)ᵀ, given for convenience.
- **Torque.** `torque_body` is constant, about the centre of mass, in body axes, N m.
- **`law: null`.** Rigid-body cases have no gravity and no gravity-gradient torque.

### Quantities

[ASSUMED] `position`, `velocity`, `body_position`, `body_velocity`, `binary_specific_energy`, `binary_barycenter` and `binary_barycentric_velocity` mean what they mean in the planar file, with three components. The others:

| Quantity | Interpretation and units [ASSUMED: conditional definitions] |
|---|---|
| `specific_energy` | `|v|^2/2 + Phi` about the fixed source, m^2 s^-2. |
| `specific_angular_momentum` | The vector `r x v` about the fixed source, m^2 s^-1. |
| `orbit_normal` | Unit vector along `r x v` about the fixed source, dimensionless. |
| `binary_specific_angular_momentum` | The vector sum of `w_i r_i x v_i` over the two bodies, weights `GM_i / sum(GM_i)`, m^2 s^-1. |
| `ship_jacobi_constant` | `C = -2*Phi - |v|^2 + 2*omega_vec . (r x v)`, m^2 s^-2, with r, v inertial barycentric and `omega_vec` the case's `binary_angular_velocity`. Equal to `2W - |v_rotating|^2` with W including z. |
| `ship_orbit_normal_about_primary` | With `rho = r_ship - r_primary` and `u = v_ship - v_primary`: the unit vector `n = (rho x u)/|rho x u|`. Osculating. |
| `ship_node_longitude_about_primary` | `atan2(n_x, -n_y)` in (−π, π], rad: the direction of `z_hat x n` in the x–y plane, which is the binary's plane in these cases. |
| `ship_inclination_about_primary` | `acos(n_z)`, rad. |
| `ship_mean_nodal_rate_about_primary` | `(node(at_t) - node(0))/at_t` with the difference wrapped into (−π, π], rad s^-1. Its expected value is the **first-order formula**, not the reference trajectory; see below. |
| `attitude` | The quaternion above, dimensionless. |
| `angular_velocity` | Body-frame rates, rad s^-1. |
| `rotational_energy` | `omega . (J omega)/2`, J. |
| `angular_momentum_inertial` | `R(q) (J omega)`, the angular momentum about the centre of mass in inertial axes, kg m^2 s^-1. |

[ASSUMED] Invariant expectations repeat the analytic initial value at every checkpoint, as in the planar file. In `spin-constant-torque` the energy and angular momentum are not invariants; their expected values are the closed forms I(αt)²/2 and Iαt along the fixed inertial direction of the torque axis.

[ASSUMED] **The node-rate entry.** `nodal-precession-*` has one expectation whose value is not the reference trajectory: `ship_mean_nodal_rate_about_primary` at 2×10⁶ s is the first-order secular formula −(p+1)K₂ cos i / (4ΩD^{p+1}) of the derivation's §11.4, with a tolerance of 10 % of it. That tolerance states the formula's accuracy at a/D = 1/4, not the reference's. The case's `nodal_precession` object records, for the reader, the formula, its (a/D)² refinement, the reference's end-to-end rate (1.050 and 1.016 of the formula for p = 2 and 2.5) and the least-squares rate over samples every 2,000 s (1.060 and 1.072). The node longitude at each checkpoint is a separate expectation taken from the reference trajectory, with a tolerance of 10⁻⁷ rad.

### Reference integrators and audits

[ASSUMED] Orbit cases use the planar file's adaptive Dormand-Prince 5(4) stepper with the same acceptance rule. The rigid-body reference integrates Euler's equations and the quaternion kinematics with that stepper and normalises the quaternion on output only.

| Control | 20,000 s orbit cases | 2×10⁶ s orbit case | Rigid body |
|---|---:|---:|---:|
| Emitted run: relative tolerance | 2e-12 | 2e-14 | 1e-13 |
| Emitted run: absolute tolerances | 1e-7 m, 1e-11 m/s | 1e-9 m, 1e-13 m/s | 1e-14 (quaternion), 1e-17 rad/s |
| Emitted run: maximum step, s | 100 | 50 | 1 |
| Tighter run | rtol 2e-14, atol ÷ 100, step ≤ 50 s | same tolerances, step ≤ 25 s | rtol 1e-14, atol ÷ 10, step ≤ 0.5 s |
| Independent integrator | separately coded pair-loop force, RK4 at 5 s | same, RK4 at 10 s | rotation matrix and inertial angular momentum, RK4 at 0.05 s |
| Limit on any difference | 1e-4 m, 1e-8 m/s | 1e-3 m, 1e-7 m/s | 1e-10 (quaternion), 1e-12 rad/s |

[ASSUMED] The independent orbit integrator shares no force code with the reference: it loops over sources generically and forms |d|^(p+1) from the distance, where the reference is unrolled and works from the squared distance. The independent rigid-body integrator shares no formulation with the reference: its state is the rotation matrix R and the inertial angular momentum L, with Ṙ = R[ω]×, ω = J⁻¹RᵀL and L̇ = Rτ, so it integrates neither a quaternion nor Euler's equations, and it takes any symmetric tensor J (which is how the tilted-axes case is checked).

[ASSUMED] Further checks: the rotated planar single and binary reference trajectories and the rotated analytic Kepler ellipse (p = 2) must equal the three-dimensional runs; a rotated copy of the crossing case must equal the rotated crossing reference; the fixed-source orbit must keep its energy, its angular-momentum vector and its plane; binary bodies must stay on their exact inclined circles; binary energy, angular-momentum vector, barycentre and the ship's Jacobi constant must hold; the crossing ship must cross the plane at least twice; the measured node rate must be within 10 % of the formula and the inclination must stay within 1.5°; the axisymmetric and constant-torque closed forms must equal the numerical rigid-body reference; the triaxial body rates must equal Jacobi elliptic functions (computed by the arithmetic-geometric mean); and a small disturbance about each principal axis must follow the linear cos or cosh law.

[DEMONSTRATED: `python tools/physics/generate_vectors.py --3d --check`] All checks passed on the recording host (Python 3.14.2, Windows). Worst differences:

| Audit | Worst difference |
|---|---:|
| 20,000 s orbit cases against the tighter run | 6.53e-6 m, 1.39e-9 m/s |
| 20,000 s orbit cases against the independent RK4 | 9.63e-6 m, 1.95e-9 m/s |
| 2×10⁶ s case against the tighter run | 6.91e-5 m, 8.03e-9 m/s |
| 2×10⁶ s case against the independent RK4 | 8.40e-5 m, 9.62e-9 m/s |
| Rotation invariance (rotated planar references, rotated crossing case) | 2.63e-6 m, 4.35e-10 m/s |
| Rotated Kepler ellipse, p = 2 | 5.53e-7 m, 4.14e-11 m/s |
| Binary bodies against exact circles | 7.09e-7 m, 1.0e-11 m/s |
| Ship Jacobi constant drift | 8.8e-8 m²/s² (20,000 s), 3.1e-9 m²/s² (2×10⁶ s) |
| Rigid-body closed forms against the numerical reference | 3.24e-13 (quaternion), 2.62e-15 rad/s |
| Rigid-body reference against the tighter run | 3.04e-13, 3.40e-15 rad/s |
| Rigid-body reference against the matrix-and-momentum RK4 | 1.48e-12, 3.0e-14 rad/s |
| Triaxial body rates against Jacobi elliptic functions | 3.49e-15 rad/s |
| Disturbance about roll, pitch, yaw after 100 s against cos, cos, cosh | −0.957588, 0.223417, 26.606279: equal to six figures |

### Consumer tolerances

[ASSUMED] Tolerances are absolute and apply to every component, as in the planar file. Each exceeds the reference's own error above by at least three orders of magnitude.

| Case | Ship position, velocity | Other |
|---|---|---|
| `inclined-single-*` | 0.1 m, 1e-5 m/s | energy 2e-3 m²/s²; angular-momentum vector 1e-3 m²/s; orbit normal 1e-10 |
| `binary-crossing-*` | 1 m, 2e-4 m/s | bodies 0.1 m, 1e-5 m/s; binary energy 2e-3 m²/s²; binary angular momentum 1e-3 m²/s; barycentre 1e-5 m; barycentric velocity 1e-10 m/s; Jacobi constant 2e-2 m²/s² |
| `binary-inclined-*` | 0.1 m, 1e-5 m/s | as above, Jacobi constant 2e-3 m²/s² |
| `nodal-precession-*` | 5 m, 5e-4 m/s | bodies and invariants as `binary-inclined`; orbit normal 1e-7; node longitude and inclination 1e-7 rad; mean node rate within 10 % of the formula |
| `spin-*` | not applicable | attitude 1e-5 per component; rates 1e-7 rad/s; rotational energy 1e-4 J; inertial angular momentum 1e-2 kg m²/s |

[DEMONSTRATED: `python tools/physics/generate_vectors.py --3d --consumer-probe`] The probe is not part of the reference. It reads the JSON file as a consumer would and computes every quantity from its own state. With fixed-step kick-drift-kick velocity Verlet at 1 s it met every orbit tolerance; the wider tolerances of `binary-crossing` and `nodal-precession` were set from these numbers so that a second-order symplectic scheme passes at the game's step:

| Case | Worst ship position, velocity error at 1 s | Share of tolerance |
|---|---|---:|
| `inclined-single-p2`, `-p2p5` | 4.7 mm, 9.1e-7 m/s; 9.0 mm, 2.4e-6 m/s | up to 0.24 |
| `binary-crossing-p2`, `-p2p5` | 0.030 m, 2.7e-6 m/s; 0.32 m, 4.8e-5 m/s | up to 0.32 |
| `binary-inclined-p2`, `-p2p5` | 0.13 mm, 3.6e-9 m/s; 0.10 mm, 2.8e-9 m/s | 0.001 |
| `nodal-precession-p2`, `-p2p5` | 0.63 m, 5.4e-5 m/s; 1.2 m, 1.4e-4 m/s (node longitude 2.7e-9 rad) | up to 0.28 |

[DEMONSTRATED: `python tools/physics/generate_vectors.py --3d --consumer-probe`] **The rigid-body tolerances are an accuracy bar, not a statement about a 1 s step.** They correspond to about 4 arcseconds of attitude after 600 s. The probe's rigid-body scheme (explicit midpoint on the rates, exponential update of the attitude; second order; **not the game's scheme**) gave, as the worst attitude error in radians over the checkpoints:

| Case | 1 s step | 1/8 s | 1/64 s |
|---|---:|---:|---:|
| `spin-axisymmetric` | 4.5e-3 | 6.8e-5 | 1.1e-6 |
| `spin-triaxial`, `spin-triaxial-tilted-axes` | 4.8e-4 | 6.6e-6 | 1.0e-7 |
| `spin-constant-torque` | 3e-14 | 2e-13 | 6e-12 |

[ASSUMED] That probe met every rigid-body tolerance at 1/64 s and not at 1/8 s. A tested attitude integrator should therefore (a) run these cases at whatever step meets the tolerances and show that its error falls at its design order when the step is halved, and (b) separately report, at the game's own step, its error against these checkpoints and its drift in the three invariants (quaternion norm, rotational energy, inertial angular-momentum vector), as the derivation's §11.6 asks. Failing the tolerances at a 1 s step is expected of a second-order scheme and is not by itself a defect.

### Limits

[ASSUMED] The orbit cases contain no thrust, contact, softening or field. The rigid-body cases contain no gravity, no gravity-gradient torque, no changing mass properties and no actuators. `plane_crossings`, `nodal_precession`, `closed_form` and `body_rate_closed_form` are information for the reader, not expectations. The `--report` studies are single-phase runs of six to eight binary periods made with looser solver settings (rtol 1e-10, steps up to 400 s) that are adequate for the three-figure ratios they print; they are not a stability survey. As with the planar file, regeneration is byte-identical on the recording environment; another platform's math library can change final digits, which should be judged against the tolerances.
