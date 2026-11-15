# S19 reference

Run from the worktree root with installed Python 3.14 and numpy:

```powershell
python tools/studies/s19/tidal_check.py
python tools/studies/s19/tidal_check.py --check
```

No game imports or package installation. The default rewrites only `results.json` and `vectors.json` in this directory. `--check` recomputes and checks exact JSON text without rewriting. Last-bit float differences on another numerical platform may require regeneration/review; the physical acceptance tolerances below are portable. JSON uses SI unless a key explicitly ends in `deg` or `arcsec`. Quaternions are `(w,x,y,z)`, body to inertial; angular velocity and torque are body-frame vectors. Source hashes identify the baseline and inspected software. No RNG is used.

## Files

- `tidal_check.py`: independent parallel-axis sum, general exponent force/Jacobian/torque, real control demand law with ideal delivery, 3D RK4 reference and observation-design covariance.
- `results.json`: 8 actual mass-property cases; 176 single-source cases with three directions each; 24 two-body outer envelopes; observation/visibility thresholds; verification results; 63 compact response summaries.
- `vectors.json`: those 63 responses with full final state and samples every 20 s through 300 s. Configuration, loading, mode and initial scenario are explicit. Initial position/quaternion/rate are the first trace sample. Flyby initial velocity follows the documented `v_inf` (default 40 m/s), radius and orbit normal (default +z); binary-exit velocity is 66 m/s radially outward. Exact construction is in `simulate`.
- [Study](../../../docs/studies/s19/README.md): interpretation, decision recommendation and implementation requests. (From this folder the repository root is three levels up.)

## What each vector means

`free` integrates orbit plus full tensor/quaternion dynamics, no actuation. Near cases are isolated-source flybys starting at periapsis; the outer case uses both moving P16 bodies. They are numerical fixtures, not integrated encounter routes. All dynamic cases use full arrival tanks and fixed deployment. All four deployment states, plus an explicitly depleted 24,054 kg load, occur in the static sweep. The spent load is not a powered-hold case.

`hold` uses the current `control.ts` demand at 1 s ticks, then ideal continuous torque for that interval. The per-axis saturation bounds do not model the allocator's coupled feasible set, though none of the reported demands is near authority. No pulse-bit, propellant, power or misalignment model is included. Use these vectors for demand/scale comparisons only; do **not** require real quantized jets to match their angles exactly.

`roll_constrained` is a diagnostic mathematical reaction enforcing zero body x rate, with yaw/pitch free. It is not a selectable game control mode and not an exact implementation of the pointing-target convention. It shows how much signal survives physically suppressing roll.

`exit_envelope` adds separate source maxima using the minimum possible source distances at a barycentric radius. Its alpha/angle bounds assume an initially stationary ship and a small-angle disturbance; times to 3σ assume that maximum signal is constant. These are optimistic detectability bounds, not promised observations on a rotating/moving/noisy ship. The gyro and endpoint values are separate comparisons; curvature fitting treats both initial attitude and rate as unknown.

## Checks and consumer acceptance

The generator asserts tensor reconstruction, baseline arrival inertia, acceleration-Jacobian consistency, Newtonian reduction, radius/mass scaling, sign from a potential gradient, isotropic/aligned zero torque, and agreement with direct force sums on a six-mass second-moment equivalent. Increasing the surrogate's size and halving it twice makes the leading-term error fall fourfold. That symmetric surrogate is a quadrupole check; it does not certify the real ship's higher moments.

It also checks the observation covariance against an explicit design inverse, energy conservation of a rotating body in a **static** tidal field, full 3D free-case fourth-order convergence, the 1 s free result against 0.25 s, no outer-case control demand, and surviving yaw under a roll constraint.

For an independent consumer of static vectors, use `1e-9 N·m` absolute or `1e-7` relative torque tolerance, and `1e-6 kg·m²` tensor tolerance. For the isolated/free trajectories at the same initial state, a useful first gate is `1e-7 rad` attitude geodesic error, `1e-9 rad/s` body-rate error, `0.01 m` position and `1e-5 m/s` velocity after 300 s, with convergence shown when halving the step. These are **[ASSUMED]** integration targets; the game has not consumed these fixtures yet. Comparing the sign-independent quaternion angle avoids interpreting `q` and `-q` as different rotations.

No exact total orbital-plus-rotational conservation claim applies to monopole COM translation with a leading tidal torque: quadrupole force feedback is omitted. No sensors are secretly given the torque. A future model must obtain evidence from its acquired attitude/rate, configuration estimates, body tracks and calibrated impulse housekeeping.
