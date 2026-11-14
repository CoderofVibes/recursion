# Predictive model: estimator specification

Section 1G · Branch `p1/1g-model-spec` · For section 2C (implementation) and the integrator. **Revision 2** (2026-11-14, after DECISIONS A4 and A5).

Everything here is **proposed** until 2C's implementation reproduces the vectors in `tests/vectors/estimator/`. Claims are labelled per the build-plan conventions:

- `[ESTABLISHED: ID]` from the bibliography (`References/BIBLIOGRAPHY.md`).
- `[ASSUMED]` a choice made for this build. Scale, sensor, prior, window, hedge and threshold values live in `tools/estimator-ref/assumptions.json`; solver constants are stated in §4.4–4.5.
- `[FICTIONAL]` a deliberate departure from real physics.
- `[DEMONSTRATED: vector / check]` shown by the reference generator. `vector / check` names a file in `tests/vectors/estimator/` and a check id inside it.

Scale (r₀, body masses) and sensor noise are parameters: edit `assumptions.json`, run `python tools/estimator-ref/generate.py`, and every vector regenerates. Sensor noise stays at 1G's values until balancing.

**What revision 2 changes** (for anyone who built from revision 1):

| Where | Change | Why |
|---|---|---|
| §3.7 (new), §3.6 | Ship calibration parameters age with ship time, use and damage; each arc gets a deviation from the arrival value | A5 item 4 |
| §7.4 | A rule's earned hedge carries a validated range and applies only inside it | A5 item 5 |
| §8.2, §8.3, §8.6 | The hedge has two parts (earned inside validated spans, default elsewhere); engine uncertainty in a forecast includes aging | both |
| §9.7 (new), §10, §11.1, §11.5 (new) | Calibration freshness diagnostic; what carries between encounters | A4, A5 |
| §3.5, §11.3, §13 | P8 answered (the encounter world resets); measurement order follows the contracts; open questions updated | integrator |
| Vectors | `carried-rule-forecast` and `parameter-aging` added; `extension-validation` gains the validated range. Nothing in the other six vectors changed | — |

Nothing in Tier L (§5), the solver (§4.4), the held-out test (§7.2), the present state (§8.1) or the horizon (§8.4) changed.

---

## 0. What to build, in one page

The model works like orbit-determination software: it fits numbers to tracking data and never sees truth (P11). It has two tiers and a forecast.

| Piece | Question it answers | Method | Cost |
|---|---|---|---|
| **Tier L** (local) | Where am I, and how strong is gravity right here? | Short-arc least-squares fits in windows of equal swept angle; a calibration profile of gravity scale against distance | ~0.05 ms per window iteration |
| **Tier G** (global) | What are the numbers in the rules? Does a proposed rule hold? | Batch weighted least squares over all retained arcs, with priors; held-out validation | ~2 ms per 12 h arc iteration |
| **Forecast** | What will my plan do, and how sure is that? | Present state from Tier L; adopted law × calibration profile; linearized covariance with a hedge outside sampled distances | ~2–30 ms |

Five behaviours follow from this design and are demonstrated by the vectors:

1. **Confident where data exists.** Inside distances the ship has sampled, the forecast uses gravity as measured there. With a Newtonian law in an inverse-2.5 world it is still within 1σ of truth for 8 h, and 31× closer than the uncalibrated law at 6 h. `[DEMONSTRATED: forecast-envelope / honest-coast, calibration-pays]`
2. **Honest elsewhere.** Outside sampled distances the envelope widens with a hedge, and the forecast simply ends at a horizon when it can no longer say anything useful. `[DEMONSTRATED: forecast-envelope / hedge-needed, horizon-ends-dive]`
3. **The model never invents a rule (P5).** The calibration profile is a table of numbers indexed by sampled distance. It cannot extrapolate. A rule (an extension) is enabled by the player, fitted from all retained data, and must pass a held-out attempt. `[DEMONSTRATED: extension-validation]`
4. **Wrong structure is visible, and its cause is distinguishable.** Wrong distance law, missing body and engine mis-calibration each leave a different signature (§9.6).
5. **Carried knowledge helps without making the next encounter easy (A5).** A validated rule tightens the envelope only at distances it was tested at; a new body's strength must still be measured; ship calibrations loosen with time, use and damage and must be re-earned. `[DEMONSTRATED: carried-rule-forecast, parameter-aging]`

The owner approved this design, including the automatic per-distance calibration, as DECISIONS A4.

---

## 1. Scope and ground rules

- The estimator receives measurements, executed commands and configuration. It never receives truth types (P11). `truth` blocks in the vectors are for checking only.
- **The model sees only what Black Box recorded** (P8, P12). A measurement that was not recorded does not exist for the model. This is what makes "rebuild from records equals live state" exact (§11). `[ASSUMED]`
- Planar (P1): positions and velocities are 2-vectors, attitude is one angle. SI units, radians, seconds.
- Deterministic (P2): no randomness anywhere in the estimator. Inputs are sorted (§11.3).
- The model forecasts; it does not plan (P6). Things the ship has not sensed are absent from the forecast.

---

## 2. Measurement models

The estimator needs each measurement's value `z`, its 1σ `sigma`, its time and its source. The noise formulas below are for 2B (which generates measurements) and for reading the vectors; 2C consumes `sigma` as reported.

### 2.1 Optical tracking fix

The navigation camera images a known body. Star-field attitude turns the body's image position into an inertial bearing; the body's apparent size gives range. This is how real optical navigation works: body position against background stars `[ESTABLISHED: DD03, DD06]`, line-of-sight bearing and horizon-based range with sub-pixel limb fitting `[ESTABLISHED: DD05]`, range and bearing from Earth and Moon images processed onboard `[ESTABLISHED: DD07]`.

```
d      = r_body - r_ship                         [m]    (planar vector)
z_b    = atan2(d_y, d_x) + b_cam + noise         [rad]  bearing, wrapped to [-pi, pi)
z_rho  = |d| + noise                             [m]    range, only when the body is resolved
```

`b_cam` is the camera-to-star-tracker misalignment, a constant bias (§3.6).

Noise as a function of processing power `p` (0..1), range, and equipment condition `c` (1 = nominal):

```
sigma_c   = c_fine / sqrt(p)        if p >= p_fine,  else c_coarse          [px]
m_cond    = 1 + k_dmg (1 - c)
sigma_b   = sqrt( (sigma_c IFOV m_cond)^2 + sigma_att^2 )                    [rad]
alpha     = 2 asin(R_body / rho)                    apparent angular diameter [rad]
N_limb    = max(1, f_limb pi min(alpha, FOV) / IFOV)                         limb points
sigma_a   = sigma_c IFOV m_cond / sqrt(N_limb)                               [rad]
sigma_rho = rho sqrt( eps_floor^2 + (sigma_a / alpha)^2 )                    [m]
range is produced only if alpha >= N_res IFOV
```

| Symbol | Value | Label |
|---|---|---|
| IFOV, FOV | 1.38e-4 rad, 0.338 rad | `[ESTABLISHED: DD05]` test camera (25 mm lens, 3.45 µm pixels, 2448 px); that the ship's camera resembles it is `[ASSUMED]` |
| c_fine, c_coarse, p_fine | 0.1 px, 1 px, 0.3 | `[ASSUMED]`; sub-pixel against coarse limb processing after `[ESTABLISHED: DD05]` |
| eps_floor | 2e-3 | `[ASSUMED]` play value. The DD05 prototype's field residual was about 1% of range |
| f_limb, N_res, k_dmg | 0.5, 10 px, 3 | `[ASSUMED]` |
| sigma_att | 3.88e-5 rad (8 arcsec) while the star tracker is valid | `[ESTABLISHED: S04]` |

At r₀ = 1e6 m from body A (radius 250 km) and full power this gives σ_b = 4.1e-5 rad (41 m cross-range) and σ_ρ = 2.0 km. Bearings are 50× more precise than ranges; the dynamics, not the range measurement, fix the orbit's scale.

**Pointing** `[ASSUMED; not exercised by the vectors]`: a fix exists only if the target is inside the field of view (off-boresight angle β ≤ FOV/2), not occulted, and the body rate is below the star tracker's limit. 2B may add an off-boresight term `(k_off (2β/FOV)² IFOV)²` and a smear term `(ω t_exp)²/12` to σ_b².

**Cadence** `[ASSUMED]`: one fix every `Δt_min / p` seconds. Only recorded fixes reach the model.

### 2.2 Accelerometers

Accelerometers sense non-gravitational acceleration only (P7). In the body frame, during a commanded burn:

```
z_f = k_A k_E u [cos(dE), sin(dE)] + noise        [m/s^2]   (u, k_E, dE: see 3.3)
sigma_f = VRW / sqrt(dt_sample)
```

VRW = 0.02 (m/s)/√h = 3.33e-4 (m/s)/√s and bias stability 3 µg `[ESTABLISHED: S04]`. With 60 s samples σ_f = 4.3e-5 m/s². `k_A` is the accelerometer scale factor (§3.6).

Accelerometer samples are used **only while thrust is commanded**. While coasting the commanded thrust is zero by record, so the accelerometer adds nothing about gravity and its bias would only add error `[ASSUMED]`. The 3 µg bias is negligible against any burn (≥ 5e-3 m/s²) and is not estimated.

### 2.3 Attitude

Star-tracker attitude is not estimated by this model; it enters in two places: the recorded attitude θ of each thrust segment (§3.3), and σ_att inside σ_b (§2.1).

```
sigma_att = sigma_st                                             star tracker valid
sigma_att = sqrt( sigma_st^2 + ARW^2 dt + (b_g dt)^2 )           dt since the last valid star fix
```

Gyro ARW = 0.02°/√h = 5.82e-6 rad/√s, bias stability 0.15°/h = 7.27e-7 rad/s `[ESTABLISHED: S04]`. Ten minutes without the star tracker makes bearings 12× worse; an hour, 68×. The star tracker loses its solution above a body rate limit (0.3–3°/s `[ESTABLISHED: S04]`; 1°/s `[ASSUMED]`).

### 2.4 Reported sigma and true noise

Each sensor reports σ from its **believed** condition. If equipment is damaged and the sensor does not know it, true noise exceeds reported σ. The model detects this from Tier L: short windows absorb structural error, so their χ²/ν measures noise against reported σ. The noise scale `s²` (§5.3) inflates every covariance. `[ASSUMED]`

### 2.5 Outliers

`[ASSUMED; not exercised by the vectors]` A measurement whose whitened residual against the current Tier L window fit exceeds 5 is flagged as an outlier, kept in Black Box, and excluded from all fits. Flags are recomputed whenever the window is refitted, so the result does not depend on processing order.

---

## 3. The believed world

### 3.1 Gravity law

```
a_j(d) = (mu_j / r0^2) (r0 / |d|)^n  d / |d|          d = r_j - r        [m/s^2]
```

`mu_j` [m³/s²] is the Newtonian-equivalent GM of body j at the shared reference length `r0` [m] (P4; one fixed r₀ for every body, as 1B requests). `n` is the distance-law exponent. With n = 2 this is Newtonian gravity for any r₀. For n ≠ 2 the coupling is `K_j = mu_j r0^(n-2)` in m^(n+1)/s² `[FICTIONAL]`.

The model starts with n = 2 fixed and `mu_j` from an arrival calibration prior. It does not know the true exponent.

### 3.2 Bodies

Massive bodies attract each other and the ship under the same law. The ship (and any tracked asteroid) is a massless test particle. With one modeled body the body is fixed. With two or more, the bodies move; a model that tracks the ship relative to a primary must include the secondary's pull on the primary (as 1B notes). `[DEMONSTRATED: missing-body-signature / body-chi2]`

### 3.3 Thrust

```
a_T(t) = k_E u(t) [cos(theta(t) + dE), sin(theta(t) + dE)]
```

`u(t)` is the commanded thrust acceleration (commanded force over believed mass), `theta(t)` the recorded star-tracker attitude of the body +x axis, both piecewise constant over recorded command segments. `k_E` is the engine scale factor (it also absorbs mass error) and `dE` the thrust misalignment angle. Commands are always recorded, so thrust is exactly zero outside segments.

### 3.4 Frame and gauge

All measurements are relative (ship to body), so absolute position and velocity are unobservable. Fix them by convention: **in each arc, the first modeled body (the primary, "A") is at the origin and at rest at the arc epoch.** This is an inertial frame. A accelerates afterwards if other bodies are modeled.

### 3.5 Arcs

An arc is one stretch of one attempt over which the dynamics are continuous. Its epoch is the time of its first retained measurement; state parameters are defined at the epoch and propagated forward. Arcs break at attempt boundaries and at any event the ship records as a discontinuity (collision, docking). Data gaps do not break arcs.

Each arc carries its own ship state, and its own state for every modeled moving body other than the primary. Recurrence resets the whole encounter world, bodies and asteroids included (P8). The estimator does not rely on that: per-arc body states stay correct, and sharing one body state across the arcs of an encounter is a permitted refinement `[ASSUMED; not vector-tested]`. What the reset does justify is §3.7: every attempt starts with the same physical ship.

### 3.6 Parameters

Names are the contract with the vectors. `{att}` is an arc (attempt) id; `{win}` a Tier L window id.

| Name | Meaning | Scope | Prior (vectors) | Scale |
|---|---|---|---|---|
| `{att}.ship.x, .y, .vx, .vy` | ship state at the arc epoch | arc | none | 1e3 m, 1 m/s |
| `{att}.{body}.x, ...` | moving body's state at the arc epoch (not the primary) | arc | none | 1e3 m, 0.1 m/s |
| `mu.{body}` | GM at r₀ | global | A: 1.02e10 ± 3e8 (arrival calibration); extension body: 0 ± 1e11 | 1e-3 μ |
| `law.n` | exponent (extension only) | global | 2 ± 1 | 1e-3 |
| `engine.kE`, `engine.dE` | engine scale, misalignment | global | 1 ± 0.05, 0 ± 0.01 rad | 1e-3 |
| `accel.kA` | accelerometer scale | global | 1 ± 1e-3 | 1e-4 |
| `camera.bias` | bearing bias | global | 0 ± 1e-4 rad | 1e-5 |
| `{att}.emp{k}.R, .T` | empirical acceleration, window k (§6.4) | arc | 0 ± 1e-2 m/s² | 1e-6 |
| `{win}.g` | local gravity scale (§5.2) | window | 1 ± 0.5 | 1e-3 |
| `{att}.engine.dkE`, `.ddE`, `{att}.accel.dkA`, `{att}.camera.dbias` | deviation of a ship parameter in this arc from its arrival value (§3.7) | arc | 0 ± aging accrued in the arc | as the parameter |

All priors are `[ASSUMED]`. "Scale" is the finite-difference step and conditioning unit; results do not depend on it.

Some parameters are not observable from some data. With a single body and no burns the whole picture can rotate, so `camera.bias` stays at its prior `[DEMONSTRATED: newton-recovers-gm, posterior σ = 1.0e-4]`. Priors hold such directions; the confounding indicator (§9.3) reports them.

### 3.7 Aging of ship calibration parameters (A5)

**What ages.** The ship's own calibrations: `engine.kE`, `engine.dE`, `accel.kA`, `camera.bias`. **What does not:** anything about the world (body GMs, the law, calibration profiles) and adopted rules. The world does not wear; the ship does.

**The clock is the ship's.** Aging runs along the physical history of the hardware: ship time since arrival, what the hardware did, and what happened to it. Recurrence returns the ship to its arrival condition (P8), so every attempt of an encounter starts with the same hardware and nothing ages between attempts. Knowledge of the arrival condition therefore accumulates across attempts, as brief §3 asks ("familiar passages become easier").

**Process noise.** Each parameter of class k is a random walk. Between two instants a and b on one physical history its variance grows by

```
Q_k(a -> b) = s_time,k^2 * (ship time elapsed) / 1 day
            + s_use,k^2  * (use accrued) / U_ref,k
            + sum over drops in the equipment's reported condition c in (a, b] of (s_cond,k * drop)^2
```

| Class | s_time (per √day) | s_use | s_cond (per unit of condition lost) | Use is measured as | Why the rates are plausible |
|---|---|---|---|---|---|
| `engine.kE` | 0.2% | 0.5% per √(100 m/s) | 10% | commanded Δv, `sum u * dt` over thrust segments | Thrust follows feed pressure, mixture and the state of injectors and nozzles, all of which change as propellant is used and deposits form. Voyager's thrusters lost efficiency as a fuel tube clogged with age `[ESTABLISHED: S15, DD09]`. Burns are verified from tracking afterwards because execution differs from command `[ESTABLISHED: DD03]`. The whole propellant budget (several hundred m/s) loosens the scale by about 1% |
| `engine.dE` | 0.2 mrad | 1 mrad per √(100 m/s) | 20 mrad | commanded Δv | The thrust line has to pass through the center of mass, which moves as propellant drains, when a tank is isolated or an appendage moves; a jammed gimbal leaves a fixed offset (1C ship baseline; `[ESTABLISHED: S14, S24]` for the geometry). One centimeter of sideways shift on a 5 m arm is 2 mrad |
| `accel.kA` | 50 ppm | none | 1% | — | Inertial sensors drift slowly (`[ESTABLISHED: S04]` gives bias stability; the scale-factor rate is assumed). Accumulated radiation dose shifts analog electronics `[ESTABLISHED: R04, R05, via 1C]` |
| `camera.bias` | 5 µrad | 10 µrad per √(power cycle) | 200 µrad | camera power-on transitions in the executed commands | The camera-to-star-tracker alignment moves with the thermal state of the mount. Orion recalibrated its navigation camera on star fields before every pass and warmed it for an hour first `[ESTABLISHED: DD07]`. A structural hit shifts it |

All rates are `[ASSUMED]` play values (`assumptions.json`, `aging.classes`). "Condition" is the believed `EquipmentStatus.condition` (0 failed, 1 nominal); only drops count.

Worked example `[DEMONSTRATED: parameter-aging / aged-engine-scale, aging-within-attempt]`: an engine scale known to 0.2% is known to 1.8% after 12 ship days, 250 m/s of burns and one damage event (condition −0.15). Inside one attempt, 4 h 20 min and a 24 m/s burn loosen it only to 0.33%.

**How aging enters the estimator.** Three places, one formula.

1. **Tier G, inside an encounter.** Each ship parameter has one *arrival value* for the encounter (global) and, for each arc, a *deviation*: the value used in arc a is `p_arr + d_a`, with prior `d_a ~ N(0, Q_k(arrival -> last retained measurement of the arc))`. A healthy, lightly used attempt has a tight deviation and so informs the arrival value; a worn or damaged attempt gets a loose one and is fitted from its own data without spoiling the others. Report `p_arr + d_a` per arc with σ from the joint covariance. If the equipment's condition drops inside an arc, start a new deviation at the event `[ASSUMED; the vectors have one deviation per arc]`.
2. **Forecast.** Planned burns use the current arc's value and covariance, plus `Q_k(last retained measurement of the arc -> forecast time)` (§8.2). Wear and damage since the last look widen the envelope until new data are taken.
3. **A new encounter.** The prior for the new arrival value is the value of the arc that carried the ship onward, with variance `sigma^2 + Q_k(that arc's last measurement -> the new arrival)`.

`[DEMONSTRATED: parameter-aging]`

| Case | Result |
|---|---|
| Carried engine scale 0.970 ± 0.002, true value now 0.945. Old σ kept (no aging), quick look at one burn | 0.9671 ± 0.0019: **11.6σ from truth**. Stale confidence overrules the new data |
| Same data, aged σ (1.8%) | 0.9434 ± 0.0057: 0.3σ from truth |
| Aged σ, full coast-burn-coast calibration | 0.94487 ± 0.00036: re-earned |
| Two attempts in one encounter, engine damaged in the second. One value for both | χ²/ν = 4.9, estimate 0.954 (between the two truths) |
| Same, with per-arc deviations | χ²/ν = 0.90; 0.96945 ± 0.00035 (truth 0.970) and 0.93936 ± 0.00035 (truth 0.940) |

---

## 4. Tier G: the global fit

### 4.1 Cost

```
J(x) = sum_i ((z_i - h_i(x)) / sigma_i)^2                       data (chi2)
     + sum_k ((x_k - m_k) / s_k)^2                              independent priors
     + sum_B (x_B - m_B)^T Lambda_B (x_B - m_B)                 block priors (used by 7.2)
```

Per-arc deviations of ship parameters (§3.7) are ordinary arc-local parameters with independent priors; a model block may give a parameter as the sum of two (`{"sum": [...]}` in the vectors). Bearing residuals are wrapped to [−π, π). This is batch weighted least squares with a priori information, the "batch filter" of deep-space orbit determination: compute what each data point should be on the modeled trajectory, form residuals, adjust the model to minimize them `[ESTABLISHED: DD03]`.

### 4.2 Prediction

For each arc, propagate all modeled bodies and the ship from the arc epoch with the believed law (§3.1–3.3) and evaluate §2 at each measurement time. Measurements whose target is not a modeled body are skipped. The reference uses fixed-step RK4 with dt = 60 s and all times on the step grid; 2C should use the same integrator as its forecast service, with a step from 1B. Any propagator accurate to about 1 m over the arc reproduces the vectors.

The reference propagator agrees with 1B's independent Dormand–Prince vectors to 1.5e-6 m and 2e-10 m/s over 20 000 s for exponents 2 and 2.5, fixed source and mutual binary. `[DEMONSTRATED: tools/estimator-ref/crosscheck_1b.py against p1/1b-physics tests/vectors/physics.json]`

### 4.3 Partial derivatives

The reference uses central finite differences (step 1e-3 × scale). 2C may do the same, or integrate the variational equations, which is faster. With ship state `y = (r, v)` and sensitivity `S = dy/dq` for any parameter q:

```
dS/dt = [ 0  I ] S + [   0   ]
        [ G  0 ]     [ da/dq ]

per body j, with d = r_j - r, k = (mu_j / r0^2) (r0/|d|)^n / |d|     (so a_j = k d):
  G     += -k I + (n + 1) k d d^T / |d|^2        gravity gradient da/dr
  da/dmu_j = a_j / mu_j
  da/dn    = a_j ln(r0 / |d|)
  da/dg    = a_j                                 local scale (5.2): the pull before scaling
thrust:
  da/dkE   = a_T / kE
  da/ddE   = kE u [-sin(theta + dE), cos(theta + dE)]

measurement partials (d = r_body - r_ship):
  db/dr_ship   = (d_y, -d_x) / |d|^2      db/db_cam = 1
  drho/dr_ship = -d / |d|
```

Moving bodies add their own states and the body–body terms in the same way. `tools/estimator-ref/bench.mjs` implements these equations for one body.

### 4.4 Solver

Levenberg–Marquardt on scaled parameters (ξ_k = x_k / scale_k):

```
H = J^T J + prior information          g = J^T r + prior gradient       (J, r whitened by sigma)
solve (H + lambda diag(H)) delta = g ;  lambda starts at 1e-3
accept if the cost does not increase: lambda /= 10 (floor 1e-12); else lambda *= 10 and retry (up to 12 times)
converged when  max_k |delta_k| / sqrt((H^-1)_kk) < 1e-3,
          or    the cost decrease < 1e-9 max(cost, 1) and that step ratio < 0.1,
          or    no damping value gives a decrease
stop after 60 iterations and report notConverged
```

`[ASSUMED]` constants. The solver is deterministic.

A structurally wrong model over long arcs can hit the iteration cap or sit in a poor local minimum. That is expected, is reported (`converged`, χ²/ν), and harms nothing: the forecast takes its present state from Tier L, not from Tier G arcs (§8.1). The vectors mark such fits `compare: qualitative`.

### 4.5 Initialization

- **Ship state of an arc:** least-squares quadratic `p(τ) = p0 + v0 τ + ½ a τ²` through the first ≤ 10 range-and-bearing fixes on the primary, positions `p_i = -rho_i (cos b_i, sin b_i)`, evaluated at the epoch.
- **Tracked body state:** ship quadratic plus the measured offset, linear fit over the first ≤ 8 fixes.
- **Globals:** prior means; `law.n` starts at 2.
- **Arc growing:** solve with the first 25% of each arc's time span, then 50%, then all, each stage starting from the last. This keeps long arcs inside the linear regime.

### 4.6 Outputs

```
P        = (J^T J + prior information)^-1  at the solution          covariance
sigma_k  = sqrt(P_kk) ;  rho_kl = P_kl / (sigma_k sigma_l)
chi2     = data term of J ;  p_eff = trace(J^T J  P) ;  nu = m - p_eff ;  chi2/nu
```

`p_eff` counts parameters the data determine; prior-held parameters contribute about zero. Also returned: whitened residuals with (arc, time, kind, target, component, powered) tags for §9.1.

### 4.7 Complexity and timing

Per iteration: propagation with q sensitivity columns costs O(steps × q), the normal equations O(m q²), the solve O(q³) with q ≤ ~15 per arc (arc-local parameters reduce by Schur complement if needed; dense solves are fine at this size).

`[DEMONSTRATED: tools/estimator-ref/bench.mjs, Node v24 on the owner's machine; arithmetic only, no UI or worker messaging]`

| Operation | Time |
|---|---|
| Tier L window fit, one iteration (5 parameters, 40 fixes) | 0.05 ms |
| Tier L, 30 windows × 4 iterations | 6 ms |
| Tier G, one 12 h arc iteration, 10 parameters, 10 s steps | 2.1 ms |
| Tier G rebuild, 10 arcs × 6 iterations, 10 s steps (1 s steps) | 0.13 s (1.3 s) |
| Forecast with 24 sensitivity columns, 2000 steps (8 h at 1 s steps) | 1.9 ms (28 ms) |

Tier L and the forecast are real-time. Tier G belongs in a Web Worker and runs on demand (§11.2).

### 4.8 Why batch least squares and not a Kalman filter

- **Order-independent.** The result is a function of the data set, so a rebuild from Black Box records equals the live result by construction (P8). A filter's state depends on processing order and tuning.
- **Honest under wrong structure.** A filter with parameter process noise quietly tracks a drifting "mass" and hides the misfit. The batch fit leaves it in the residuals, and Tier L shows the drift explicitly against distance.
- **Held-out validation is natural:** refit a subset, test on the rest (§7.2).
- **Cheap enough** (§4.7). Real-time needs are met by Tier L.
- It is what flight navigation does `[ESTABLISHED: DD03]`.

---

## 5. Tier L: local fits and the calibration profile

Tier L exists because of one fact: **a short arc can always be fitted, even when the law is wrong.** `[DEMONSTRATED: inv25-exponent-coverage / all-windows-converge]`

### 5.1 Windows

Per arc, take the range-and-bearing fixes on the reference body (the primary; in general the body with the strongest believed pull), sorted by time:

```
cur = [], sweep = 0
for each fix m:
    if cur is not empty and powered(m.t) != powered(cur[0].t):   close cur (forced); cur = [], sweep = 0
    if cur is not empty:  sweep += wrap(m.bearing - cur.last.bearing)
    append m to cur
    if len(cur) >= N_min and ( |sweep| >= dtheta  or  max(ln rho) - min(ln rho) over cur >= dlnr ):
        close cur; cur = [], sweep = 0
tail (cur not empty at the end):
    if len(cur) < N_min and the previous window exists, was not force-closed, and has the same powered flag: merge into it
    else if len(cur) >= N_keep: close it as a window
    else: drop it
```

`powered(t)` is true inside a thrust segment with u ≠ 0. `dtheta = 0.7 rad` (40°), `dlnr = 0.15`, `N_min = 12`, `N_keep = 6` `[ASSUMED]`. The rule is scale-free: it does not depend on 1B's scale. A window is a list of fixes; its epoch `t0` is its first fix, `r_geo = exp(mean ln rho)`, and `r_min`, `r_max` are its extreme ranges. Windows are ids `{att}.w{k}` in time order.

### 5.2 Local fit

For each **coasting** window, fit 5 parameters with the §4.4 solver (no arc growing; initial state from the §4.5 quadratic over the window's first fixes):

- window state at `t0` (4 parameters, no prior);
- `g`, a scale on the reference body's pull on the ship under the **reference law** (prior 1 ± 0.5).

The reference law is the adopted structure with its global parameters frozen at the current Tier G values (before any Tier G result exists: the arrival priors). Output per window: `g`, `sigma_g`, χ²/ν. `mu_ref × g` is the local GM.

Powered windows are fitted the same way with gravity frozen at the profile and two thrust-response factors free (§9.5). `[ASSUMED; not in the reference]`

### 5.3 Noise scale

```
s2 = max(1, median over coasting windows of chi2/nu)
```

Every covariance the forecast uses is multiplied by `s2` (§2.4). In the vectors s² = 1.02–1.06.

### 5.4 Calibration profile

The profile is a smooth curve `g(u)`, `u = ln(r / r0)`, through the window scales of **all retained arcs**, per reference body:

```
nodes   u_b = b * delta,  b = floor(ln(r_min / r0) / delta) ... ceil(ln(r_max / r0) / delta)   (at least 2 nodes)
          r_min, r_max = extreme fix ranges over all coasting windows: the covered range
A_kb    = hat-function weight of window k (at u_k = ln(r_geo,k / r0)) on node b   (two non-zero weights per row)
minimize  sum_k ((A c - g)_k / sigma_g,k)^2
        + sum_b ((c_{b-1} - 2 c_b + c_{b+1}) / sigma_curv)^2          smoothness
        + sum_b ((c_b - 1) / sigma_ridge)^2                           negligible ridge
C       = (A^T W A + D^T D / sigma_curv^2 + I / sigma_ridge^2)^-1
infl    = max(1, chi2_p / nu_p),   nu_p = max(1, K - trace(A^T W A  C))
node covariance = C * infl
g(u)    = linear interpolation of c between nodes, with u clipped to [ln r_min, ln r_max]
```

`delta = 0.1`, `sigma_curv = 0.01`, `sigma_ridge = 10` `[ASSUMED]`. It is a small linear solve (a Whittaker smoother on a log-distance grid).

Three properties matter:

- **It is numbers, not a rule.** Outside the covered range `g` is held at its edge value. It cannot extrapolate; only a rule can (§7).
- **`infl` is a diagnostic.** If distance alone explains the local scales, infl ≈ 1 (1.3 under a wrong distance law). If the same distance gives different pulls from different directions, infl ≫ 1 (12 with a missing body). `[DEMONSTRATED: inv25-exponent-coverage / profile-distance-explains; missing-body-signature / profile-distance-fails]`
- **The calibrated law fits.** Newtonian law × profile fits three arcs spanning 0.5–2 r₀ of an inverse-2.5 world at χ²/ν = 0.99. `[DEMONSTRATED: inv25-exponent-coverage / calibrated-law-fits]`

The profile is recomputed whenever a window closes or the reference law changes. It is derived data: a pure function of the records and the reference law.

### 5.5 What a wrong structure looks like in Tier L

If the true exponent is `n_t`, the model's is `n_m`, and they agree at r₀:

```
local GM(r) = mu_ref g(r) = mu_0 (r0 / r)^(n_t - n_m)          slope  d ln GM / d ln r = -(n_t - n_m)
```

For a Newtonian model in the inverse-2.5 world the fitted mass drifts as (r₀/r)^0.5, as P4/P5 predict.

- Two circular arcs at 0.6 r₀ and 1.5 r₀, each fitted alone by a Newtonian GM: χ²/ν = 0.93 and 0.91 (a circular orbit under any central law is fitted exactly by some GM), GM ratio 1.5835 ± 0.0010 against √(1.5/0.6) = 1.5811. One GM for both: χ²/ν = 682. `[DEMONSTRATED: inv25-newton-two-distances]`
- 22 windows over 0.5–2 r₀: every local GM within 3σ + 1% of μ₀(r₀/r)^0.5; weighted slope −0.497. The data alone say "the exponent is about 2.5" while the model still says 2. `[DEMONSTRATED: inv25-exponent-coverage / gm-vs-distance-trend, gm-slope]`

Window σ_g is 0.16–0.65% with 13–76 fixes at the §2.1 noise, and 2.4–2.7% for tail windows that swept less than half the usual angle. It scales as 1/√(fixes) and with σ_b.

---

## 6. Model extensions (P5)

### 6.1 Lifecycle

An extension is a named change of structure from a fixed library. The player enables it; the model fits it; Black Box tests it.

```
candidate -> fitted (Tier G on training attempts) -> validated on a held-out attempt -> adopted | rejected
```

Every step is recorded in Black Box with its numbers. Adopted extensions persist across recurrence (P8). Adoption creates a new model version (§11.1). The player can revoke an adopted extension.

### 6.2 Distance-law exponent

- **Adds** `law.n` (prior 2 ± 1), shared by all bodies.
- **Fitted** by Tier G from all retained data together with every `mu_j`.
- **Validated** by §7.2 on an attempt at distances outside the training data.
- **Recovers** n = 2.50001 ± 0.00016 from one arc over 0.9–1.1 r₀ and 2.499996 ± 0.000025 from three arcs over 0.5–2 r₀: wider coverage narrows σ(n) by 6×. `[DEMONSTRATED: inv25-exponent-coverage / exponent-narrow, exponent-wide, coverage-narrows]`
- **Wrong use fails:** with a missing body as the true cause it fits a confident, wrong n = 1.919 ± 0.00007, lowers the training cost by 1.4 million, and still fails held-out with T/ν = 1898 against a threshold of 1.17 (§7.3).
- **Harmless when unneeded:** in a Newtonian world it returns n = 2.00016 ± 0.00015 and is not adoptable (cost drop 1.1 < ln m = 6.2). `[DEMONSTRATED: newton-recovers-gm / superfluous-not-adoptable]`

`mu` and `n` are nearly uncorrelated when the data straddle r₀ (ρ = 0.003 in the vectors), because P4's form pivots at r₀. Far from r₀ they correlate; report ρ.

### 6.3 Unmodeled body

- **Seen mode** (the body is tracked but its gravity was left out): adds `mu.{body}` (prior 0 ± 1e11) and the body's state per arc, constrained by its own fixes. Body–body dynamics switch on. Recovers μ_B = 2.50002e9 ± 1.7e6 (truth 2.5e9) from one 16 h arc and restores χ²/ν = 1.01. `[DEMONSTRATED: missing-body-signature / body-gm-recovered, body-chi2]`
- **Unseen mode** (a dark mass): adds position and velocity per arc plus `mu`, with no fixes on the body. At leading order only μ/d³ and the axis are observable (tidal field), with a two-fold side ambiguity. Initialize from the empirical tangential pattern (§9.4): try both sides at distances {2, 4, 8} × the ship's range and keep the lowest cost. `[ASSUMED; specified, not vector-tested]`
- **Validated** by a held-out attempt with the body in a different direction.

### 6.4 Empirical unmodeled acceleration

- **Adds**, per arc and per window (§5.1 boundaries: window k covers [t0_k, t0_{k+1}), the first starting at the arc epoch), a constant radial and tangential acceleration `aR, aT` relative to a frame body: `r_hat` from the body to the ship, `t_hat = (-r_hat_y, r_hat_x)`. Prior 0 ± 1e-2 m/s².
- **Fitted** as a chained arc fit on the **calibrated law** (reference law × profile, globals frozen), so it measures only what distance calibration cannot explain.
- **It is a diagnostic, never a rule.** Its parameters are local to a window; they predict nothing about another attempt. It is excluded from §7 and never enters a forecast.
- **Overfitting** is why: with free accelerations any trajectory fits.

### 6.5 Region-dependent thrust response (Inverse Wells)

`[FICTIONAL]` rule from brief §7; formulation per 1B (radial reflection of thrust acceleration with a blended boundary). `[ASSUMED; specified, not vector-tested]`

- **Adds**, for a region the player marks around a visible well (centre `c_w`, radius `R_w` from the sensor view), response factors `k_r, k_t` (prior 1 ± 2, wide because truth is −1) applied to thrust inside it:

```
rho_hat = (r - c_w) / |r - c_w| ;  tau_hat = perpendicular
a_T' = a_T + w(|r - c_w|) [ (k_r - 1)(a_T . rho_hat) rho_hat + (k_t - 1)(a_T . tau_hat) tau_hat ]
```

  `w` is the boundary blend from 1B (1 well inside, 0 outside).
- **Fitted** by Tier G from powered arcs inside the region, with gravity taken from the calibrated law so that gravity and thrust are not confounded (§9.3).
- **Validated** on a held-out pass through the same or another well. A correct rule predicts a burn it has never seen.
- **Wrong extension fails:** "the engine changed" (a global `k_E`) cannot fit radial burns (response −1) and tangential burns (response +1) together.
- The per-burn response diagnostic (§9.5) is the evidence that prompts the player.

Whether accelerometers feel the reversed push is undecided (§13 item 3).

---

## 7. Validation and adoption

### 7.1 Evidence on the training data

```
delta_J = J(base) - J(extended)   on the same training attempts
evidence if delta_J >= (number of added global parameters) * ln(m)
```

`[ASSUMED]` (a BIC-style penalty; m = number of scalar measurements). Evidence alone is **not** enough: the wrong exponent in §6.2 has delta_J = 1.4e6.

### 7.2 Held-out consistency test

The player picks a held-out attempt that was not used for fitting.

1. Fit the candidate on the training attempts: global estimate `x_G` with covariance `P_G`.
2. Fit the held-out attempt's arc-local parameters **and** the globals, with the training posterior as a block prior on the globals (`m_B = x_G`, `Lambda_B = P_G^-1`) and no other prior on them.
3. `T = chi2(held-out data) + prior penalty`, `nu = m_heldout - (number of arc-local parameters)`.
4. **Pass** if `T / nu <= 1 + k sqrt(2 / nu)`, k = 3 `[ASSUMED]`.

If the rule is right, the held-out data agree with the training posterior and T ≈ ν. If it is wrong, either the data misfit or the globals must move far from where training put them; both raise T.

### 7.3 How a wrong extension visibly fails

`[DEMONSTRATED: extension-validation]`, two cases, same test:

| Truth | Structure | Training χ²/ν | Held-out T/ν (threshold) | Verdict |
|---|---|---|---|---|
| inverse-2.5 law | Newtonian | 17 512 | 200 352 (1.21) | fail |
| inverse-2.5 law | + exponent | 1.03 | 0.97 (1.21) | pass, adopted; trained on 0.9–1.4 r₀, tested at 0.6–0.85 r₀ |
| Newtonian binary | A only | 5 126 | 3 585 (1.17) | fail |
| Newtonian binary | A only + exponent (wrong) | 4 069 | 1 898 (1.17) | fail, not adopted |
| Newtonian binary | + body B (right) | 1.01 | 1.04 (1.15) | pass, adopted |

A correct rule passes somewhere it never trained. A wrong one fails by orders of magnitude, and the diagnostics say why (§9.6).

### 7.4 Earned hedge and validated range

The forecast hedges outside sampled distances with `sigma_h` (§8.2). A validated rule earns a smaller hedge, from how well it extrapolated in its own held-out test:

```
run Tier L on the held-out attempt under the trained law
for held-out windows outside the training covered range:
    delta = rms(g - 1) ;  ell = mean |ln(r_geo / nearest training edge)|
sigma_e = clamp( sqrt(sigma_n^2 + (delta / ell)^2),  0.01,  sigma_h0 )
if no held-out window lies outside the training range: nothing is earned
```

`[ASSUMED]`. The validated exponent earns σ_e = 0.019 against the default 0.3 (8 windows outside, δ = 0.0036, ℓ = 0.19). `[DEMONSTRATED: extension-validation / hedge-earned]`

**The earned value applies only inside the rule's validated range (A5).** The test that earned it covered certain distances and no others:

```
for each body j in the passing test:
    span_j = [smallest, largest] ship-to-body distance over the fixes of its training and held-out attempts
the rule records {body, span, sigma_e, test} for each
```

In the example the span is 0.6–1.4 r₀ on body A. `[DEMONSTRATED: extension-validation / validated-range]` Outside every span the default σ_h0 stays, however well the rule did inside. A further passing test that reaches new distances adds its span; where a rule has several tests, spans are merged and the largest σ_e among them is used `[ASSUMED]`.

**Which bodies a span applies to** `[ASSUMED]` (`validatedRange.transfer = "shared-law"`):

- A rule whose parameters are shared by every body (the exponent) applies its spans to **every** body, in this encounter and later ones. A4 says adopted rules apply everywhere; the span says how far that confidence reaches: a distance of 0.6–1.4 r₀ from an attracting body.
- A rule about one body or one region (an unmodeled body's GM, a well's thrust response) applies its spans to that body or region only.

The stricter reading, "the same body only", is one setting away, but it makes the earned hedge do nothing at all: inside an encounter the held-out data are retained, so every validated distance is also a sampled one where the calibration profile already applies and the hedge is zero; and a new body would have no span. With the shared-law reading the earned hedge acts in exactly one situation: a distance the rule has been tested at, around a body not yet sampled there. That is the help A5 allows. What it does not give: the new body's strength (measured by Tier L, §5), or confidence at untested distances.

This rewards testing a rule over a wide range: holding out an attempt that goes somewhere new both earns a smaller σ_e and widens the span.

### 7.5 Overfitting guards

1. Extensions come from a fixed library; each adds few global parameters with a prior.
2. Evidence threshold (§7.1) and held-out test (§7.2) are both required.
3. Window-local parameters (§6.4) never count as evidence for a rule.
4. Identifiability `[ASSUMED]`: refuse to fit if a new parameter's posterior σ exceeds half its prior σ, or |ρ| > 0.98 with an existing parameter. Report "not enough evidence yet" and what would help (§10).
5. Issued forecasts are immutable, so a rule is always judged against what was predicted at the time.

### 7.6 If the owner chooses "the model also learns rules by itself"

The same library, fits and tests run without the player's hand:

- After each Tier G run, fit every library extension as a candidate in the background.
- Score each by leave-one-attempt-out §7.2: each retained attempt in turn is the held-out one.
- Adopt automatically when §7.1 holds and every fold passes; announce it in Black Box with the evidence ("distance-law exponent 2.50 ± 0.01 adopted; tested on attempts 3 and 5").
- Cost: (candidates × attempts) Tier G runs, in the worker.

Only who presses the button changes, so building P5 as proposed builds almost all of this. The risk is to the brief, not the code: discovery becomes something that happens to the player. A middle setting is to have the model **suggest** ("the exponent extension would pass on your data") and leave adoption to the player.

---

## 8. Forecast

### 8.1 Present state

The present state comes from recent data, not from Tier G's long arcs. Take the fixes of the most recent `N_a = 2` windows of the current arc `[ASSUMED]` and fit 6 parameters (the reference exercises coasting windows only; if one of them is powered, thrust uses the current engine parameters and the two response factors of §9.5 join the fit `[ASSUMED]`):

- state at the first of those fixes (no prior);
- `g0` (1 ± 0.5) and `g1` (0 ± 0.2), a local scale and slope multiplying the **calibrated law**: `g0 + g1 (ln r - u0)`, `u0` = mean ln ρ of those fixes.

Propagate to the last fix `t_now` with the fitted values: `x_now`, and `P_now = S P S^T` with `S = dx(t_now)/d(parameters)`.

Both local terms matter. In development, a constant scale on the uncalibrated law fitted the data to the noise yet hid a velocity bias of about 0.5 m/s behind the 2 km range noise, and the forecast was 5.9σ off after one hour (see the handoff). With the calibrated law and the slope term the same forecast is within 1σ. `[DEMONSTRATED: forecast-envelope / honest-coast]`

Before the current arc has `N_min` fixes, the present state is the arrival state and covariance from configuration. `[ASSUMED]`

### 8.2 Forecast law and uncertainty sources

```
a(r, t) = sum_j a_j(r; adopted law) * g_j(ln |d_j|) * exp(-eta_e,j Le_j - eta_d,j Ld_j)   +   a_T(plan; kE, dE)   [+ adopted region terms]

L_j(r)  = ln(r / r_max,j)  if r > r_max,j ;   ln(r / r_min,j)  if r < r_min,j ;   0 inside the covered range
Le_j(r) = the part of that stretch of ln r, from the nearest covered edge to r, that lies inside validated spans (§7.4), signed like L_j
Ld_j(r) = L_j(r) - Le_j(r)
```

`g_j` is the calibration profile (1 for a body without one). The forecast mean uses `eta = 0`. With no adopted rule, or no span that applies to body j, `Le_j = 0` and all of `L_j` is default. Independent uncertainty sources:

| Source | Variable | Distribution |
|---|---|---|
| present state | `x_now` | covariance `s2 P_now` |
| calibration | profile node values `c` | node covariance `C infl` (§5.4) |
| unsampled but validated distances | earned hedge exponent `eta_e,j` per body | 0 ± `sigma_e` (§7.4) |
| unsampled, untested distances | default hedge exponent `eta_d,j` per body | 0 ± `sigma_h0` |
| engine, for planned burns | `kE`, `dE` | current arc's value and covariance, plus aging since its last measurement (§3.7) |
| bodies without a profile | `mu_j` | Tier G posterior |

The hedge says: outside the distances my data cover, the law may bend away like an exponent change of ±σ. `sigma_h0 = 0.3` `[ASSUMED]`. It applies equally in every direction and to every body, and does not move the mean, so it carries no hidden knowledge of the true law (brief §3). The covered range of a body without a profile is the range of ship–body distances over all retained fixes; before any fix, it is the single distance of the present state.

### 8.3 Envelope

With `S_q(t) = d r_rel(t) / dq` from the variational equations (§4.3) or central differences:

```
P_pos(t) = s2 S_x P_now S_x^T  +  S_c (C infl) S_c^T
         + sum_j ( sigma_e^2 S_eta_e,j S_eta_e,j^T  +  sigma_h0^2 S_eta_d,j S_eta_d,j^T )
         + S_E Sigma_E S_E^T  [+ sigma_mu_j^2 S_mu_j S_mu_j^T]
```

The envelope at time t is the ellipse of `P_pos(t)` (draw 2σ; P10). The profile needs one column per node: its full covariance is required. A single "scale the whole profile" mode was 3σ off inside sampled distances. `[DEMONSTRATED during development; see handoff]`

`[DEMONSTRATED: forecast-envelope]` Inverse-2.5 truth, Newtonian law, no extension; data over 0.75–1.3 r₀:

| Plan | Hours ahead | Range (r₀) | Error (km) | Envelope 1σ (km) | Error in σ | Uncalibrated error (km) |
|---|---|---|---|---|---|---|
| coast | 1 / 4 / 8 | 1.09 / 0.95 / 0.80 | 0.26 / 1.1 / 7.9 | 0.62 / 3.2 / 11.8 | 0.88 / 0.68 / 0.71 | 3.6 / 60 / 114 |
| dive | 3 | 0.86 | 0.87 | 2.1 | 0.47 | 30 |
| dive | 4 (below coverage) | 0.66 | 2.2 | 3.9 | 0.79 | 43 |
| dive | 5 (deepest) | 0.42 | 52 | 25 (hedge 24.6) | 2.1 | 69 |
| dive | 6–8 | — | 570–1530 | beyond horizon | — | — |

"Error in σ" is the Mahalanobis distance of truth from the forecast. Without the hedge the 5 h dive point would be 28σ off. `[DEMONSTRATED: forecast-envelope / hedge-needed]`

`[DEMONSTRATED: carried-rule-forecast]` A later encounter: a new body (μ = 6e9), 24 h of tracking over 1.04–1.15 r₀, then a dive. The exponent rule is carried with σ_e = 0.0185 and a validated span of 0.6–1.4 r₀. Three forecasts from the same data:

| Hours ahead | Range (r₀) | Where | Carried rule (spec): error, envelope, earned / default hedge (km) | No rule carried: error, envelope (km) | Earned hedge everywhere (superseded): envelope (km) |
|---|---|---|---|---|---|
| 1.5 | 1.05 | sampled | 0.2, 0.4, 0 / 0 | 0.2, 0.4 | 0.4 |
| 5.0 | 0.83 | validated, not sampled | 3.1, 2.5, 0.5 / 0 | 15, 7.3 | 2.5 |
| 6.5 | 0.63 | validated, not sampled | 7.6, 6.3, 2.8 / 0 | 73, 35 | 6.3 |
| 7.5 | 0.47 | below the validated span | 14.5, 14.1, 9.1 / 3.0 | ended after the 7 h point (0.63 r₀) | 14.0 |
| 8.0 | 0.39 | below | 20, 28, 16.5 / 18.8 (last inside horizon) | — | 22.8 |
| 8.5 | 0.34 | below | envelope 82 (default hedge 76): horizon passed | — | 38 |

Read across: with nothing carried the forecast ends at 0.63 r₀; the carried rule takes it through the validated span with a hedge 12× smaller and an error about 10× smaller at 6.5 h; below the span the default hedge takes over and ends the forecast at 8.5 h, where applying the earned hedge everywhere would have left the envelope half as wide. Truth stays within 1.4σ throughout. In this encounter the largest single term inside the span is not the hedge but the calibration of the new body (8 windows): the unknown that carried knowledge does not cover.

### 8.4 Horizon

```
the forecast ends at the first sample where  sigma_major(t) > f_h * (distance to the nearest body),   f_h = 0.1  [ASSUMED]
```

Past that point the linearization is unreliable and the envelope is too wide to act on. The dotted line stops; the model does not guess. In the dive it ends after the 5 h point. `[DEMONSTRATED: forecast-envelope / horizon-ends-dive]`

### 8.5 Sigma-point option

`[ASSUMED; not in the reference]` If close passes need forecasts beyond the linear horizon, replace §8.3 by propagating 2q + 1 sigma points (each uncertain variable at ±√q σ) and using their sample covariance. It is deterministic and costs about the same as the sensitivity columns. Keep the horizon rule.

### 8.6 Issued forecasts

An issued forecast stores everything it used and produced: model version, reference law values, profile nodes and covariance, `x_now`, `P_now`, `s2`, both hedge sigmas and the validated spans they were applied with, the engine values and their aged covariance, the plan, and the sampled means and covariances up to the horizon. It is never recomputed (brief §3, P10). A new forecast is a new record.

---

## 9. Player-facing diagnostics

All are computed by 2C; layout belongs to 2D.

### 9.1 Residual time series

Whitened residuals `(z - h)/sigma` against time, per kind (bearing, range, accelerometer), **split into coasting and powered** by whether thrust was commanded at the measurement time. Per-class RMS should be ≈ 1. Coasting RMS ≫ 1 means the gravity model is wrong; coasting ≈ 1 with powered ≫ 1 means the propulsion model is wrong (brief §5). Use Tier G residuals when its fit is fair; when χ²/ν is huge the series is still shown but §9.2 carries the information.

### 9.2 Local GM against distance and direction

Plot each coasting window's local GM (`mu_ref g ± mu_ref sigma_g`) at its `r_geo` with a bar from `r_min` to `r_max`; draw the adopted law through it (a flat line for Newtonian). Offer the same points against the ship's direction from the body. Report the weighted slope `d ln GM / d ln r` and the profile inflation `infl`. Where there are no windows there are no points: missing data are shown as missing.

### 9.3 Confounding indicator

From a Tier G (or powered-window) covariance, for every (gravity parameter, propulsion parameter) pair report ρ and each parameter's posterior/prior σ ratio.

```
confounded if |rho| > 0.9  [ASSUMED]
```

`[DEMONSTRATED: burn-only-confounded]` A ship held on a slow circle by outward thrust, tracked only while thrusting:

| Data | ρ(mu.A, kE) | σ(mu.A) / prior | σ(kE) / prior |
|---|---|---|---|
| burn only, no accelerometer record | **0.993** | 0.64 | 0.77 |
| + 2 h of coasting fixes | 0.67 | 0.035 | 0.045 |
| + accelerometer records | 0.27 | 0.078 | 0.025 |

Only g − k_E u is observable while hovering. Coasting data pin gravity; accelerometer records pin the engine. The indicator should say which is missing.

### 9.4 Empirical radial and tangential acceleration

The §6.4 fit, shown per window as `aR ± sigma` and `aT ± sigma`. A central-force error of any kind leaves no tangential term once distance is calibrated; an unmodeled mass does.

- Wrong distance law: largest tangential term 2.0σ. `[DEMONSTRATED: inv25-exponent-coverage / wrong-law-leaves-no-tangential]`
- Missing body: a tangential term at 14.9σ and 0.5% of g(r₀); every term above 3σ has the sign of the true tidal field. `[DEMONSTRATED: missing-body-signature / missing-body-tangential, tangential-tracks-tidal]`

### 9.5 Per-burn response

`[ASSUMED; not in the reference]` For each powered window, with gravity frozen at the calibrated law, fit the window state and two factors: achieved over commanded acceleration along and across the commanded direction. This is ordinary maneuver verification from tracking `[ESTABLISHED: DD03]`. Nominal is (k_E, tan dE). Inside an Inverse Well a radial burn reads about −1.

### 9.6 Reading the evidence

| Cause | Coasting residuals | Powered residuals | Local GM vs distance | Profile `infl` | Empirical tangential | What fixes it |
|---|---|---|---|---|---|---|
| Wrong mass estimate | large until refit | — | flat, offset from the prior | ≈ 1 | none | nothing to do: Tier G refits `mu` (GM within 0.014% of truth, σ = 0.04%, from a prior 2% off `[DEMONSTRATED: newton-recovers-gm / gm-recovered]`) |
| Wrong distance law | large | large | slope ≠ 0, same from every direction | ≈ 1 | none | exponent extension |
| Overlooked body | large | large | scatter at the same distance | ≫ 1 | significant, tidal pattern | body extension |
| Engine mis-calibration | ≈ 1 | large | clean | ≈ 1 | none | Tier G refits `kE`, `dE`; needs coast data or accelerometer records |
| Region thrust response | ≈ 1 | large only inside the region | clean | ≈ 1 | none | region extension; §9.5 shows it |
| Sensor worse than it reports | uniformly > 1 | uniformly > 1 | noisy, no trend | ≈ 1 | none | `s2` widens the envelope; repair or re-power |

### 9.7 Calibration freshness

`[ASSUMED]` For each ship parameter show the value in use, its σ, and how that σ divides between "as last measured" and "aged since" (§3.7), with the drivers in plain units: time since last measured, Δv burned since, condition lost since. A calibration that is mostly aged is an invitation to re-measure (a coast, a short burn, a coast). For each adopted rule show its validated spans against the distances the plan visits (§7.4).

---

## 10. How player decisions feed the model

| Decision | Mechanism | Effect on the model |
|---|---|---|
| **Route** (which distances are flown) | covered range and windows per distance (§5.4) | calibration and tight envelopes exist only where flown; σ(n) falls 6× with wide coverage (§6.2); the hedge applies elsewhere |
| **Holding out an attempt that goes somewhere new** | §7.4 | a validated rule earns a small hedge, and only over the distances the test covered; a wider test earns a wider span |
| **Re-calibrating after wear, damage or a long gap** | §3.7 | a coast, a short burn and a coast re-earn the engine scale (1.8% back to 0.04% in the vector); skipping it leaves every planned burn with an aged, wide envelope |
| **Sensor power** | σ_c and cadence (§2.1) | window σ_g ∝ σ_b / √fixes; below `p_fine` centroiding is 10× coarser |
| **Pointing** | fixes exist only for bodies in view | a body never fixed with range has no profile; an untracked body can only be modeled in unseen mode |
| **Tracking an asteroid** `[ASSUMED; specified only]` | an asteroid's arc is a test particle at *its* distances | its windows add coverage the ship never flew: a free probe, paid for in pointing and power |
| **Coast or burn** | coast windows calibrate gravity; powered windows calibrate thrust (§5.2, §9.5) | burn-only data confound engine and gravity (§9.3); a coast before a burn separates them |
| **Recording accelerometers** | §2.2 | pins `kE` to the accelerometer scale prior |
| **Star tracker on or off** | σ_att (§2.3) | bearings degrade 12× in ten minutes without it |
| **Equipment damage** | m_cond, reported σ against true noise (§2.4), outliers (§2.5) | wider σ; if unreported, `s2` rises and every envelope widens |
| **Black Box recording rate** (P12) | only recorded data exist | fewer fixes per window, longer windows, coarser profile; an unrecorded burn is a calibration lost |

---

## 11. Persistence and versioning

### 11.1 Model state and versions

```
ModelState {
  version            integer, +1 whenever the structure or the Tier G values change
  parent             previous version
  structure          law form, modeled bodies, extensions with status (candidate | adopted | rejected | revoked);
                     each adopted rule also keeps its validated spans {body, rMin, rMax, sigma_e, test} (7.4)
  dataManifest       sorted ids of the records the fit used (or their hash)
  global             names, values, covariance, priors; for ship parameters the arrival value, and per arc the
                     deviation with the aging accrual that set its prior (3.7)
  fit                chi2, nu, pEff, iterations, converged
  settings           every constant marked [ASSUMED] in this document that the build uses
}
```

Tier L results (windows, profile, noise scale, present state) are **derived**: a pure function of the records and the reference law in the model state. They are cached, not versioned.

### 11.2 When things run

- **A fix is recorded:** update the open window. When a window closes: its local fit, the profile, the present state. All in well under a millisecond.
- **Live forecast preview:** recomputed in the worker at a few Hz while planning; **issued** only on the player's action, then frozen (§8.6).
- **Tier G:** at recurrence (full rebuild), when the player fits or validates an extension, and in flight at most every 60 s of wall time `[ASSUMED]`. A Tier G result becomes the new reference law only if it converged or lowered the cost against the previous reference.

### 11.3 Rebuild from Black Box (P8)

1. Load every attempt record. Use measurements in Black Box order: (attempt, array index), as `src/contracts/README.md` defines; never re-sort by value.
2. Build arcs (§3.5) and apply adopted extensions.
3. Tier G from the §4.5 initialization.
4. Tier L under the new reference law.
5. Store as the next version.

Because every step is a deterministic function of the sorted records, the rebuilt state equals the state the live model would reach by running the same Tier G at the end of the attempt. 2C's test "rebuild-from-records equals live state" should compare against exactly that.

### 11.4 What never changes

Issued forecasts (§8.6), recorded measurements (including flagged outliers), and the history of extension tests.

### 11.5 What carries to a later encounter (A4, A5)

| Carried | How | Limit |
|---|---|---|
| Adopted rules | structure and fitted values (the exponent) apply everywhere | the tighter envelope only inside the validated spans (§7.4) |
| Ship calibration | value of the arc that carried the ship onward becomes the prior | σ aged by ship time, use and damage since (§3.7); must be re-earned |
| Old records | stay as evidence and as held-out attempts for new rules | they are about other bodies; they calibrate nothing here |
| **Not carried:** body GMs and calibration profiles | — | each belongs to its body; a new body starts from its arrival prior and no profile |

A new encounter therefore starts with the right law (if one was adopted), an aged ship, an unmeasured body and an empty profile: the forecast is usable at once inside the rule's validated span, wide elsewhere, and improves only with fresh tracking.

---

## 12. Notes for 2C

Suggested shape (the contracts in `src/contracts/` are the integrator's and win over this):

```
model/propagate    believed dynamics + variational equations (no import from src/sim, P11)
model/solve        LM with priors (4.4), covariance and outputs (4.6)
model/tierG        arcs, initialization (4.5), extensions (6), held-out test (7.2)
model/tierL        windows (5.1), local fits (5.2), noise scale (5.3), profile (5.4)
model/forecast     present state (8.1), law and sources (8.2), envelope (8.3), horizon (8.4)
model/diagnostics  9.1 - 9.5
```

Order of work that matches the vectors: `newton-recovers-gm` (solver) → `inv25-newton-two-distances` → `burn-only-confounded` (thrust, accelerometer, correlation) → `inv25-exponent-coverage` (extension, Tier L, profile, empirical) → `missing-body-signature` (moving bodies) → `extension-validation` → `forecast-envelope`.

Revision 2 adds two vectors after those: `parameter-aging` (case 1 is arithmetic; case 3 needs summed parameters in Tier G) and `carried-rule-forecast` (the two-part hedge; build it with the forecast). A forecast built to revision 1 is the special case of no validated span and no aging.

The reference is small enough to read alongside this document: `tools/estimator-ref/estref/core.py` (dynamics, measurements), `fit.py` (Tier G), `local.py` (Tier L, forecast), `aging.py` (§3.7).

---

## 13. Limits and open questions

1. **Settled (A4).** The owner approved the per-distance calibration with rules left to the player; §7.6's middle option (the model suggests, the player decides) is held in reserve. The hedge σ_h = 0.3 and horizon fraction 0.1 remain play values to tune.
2. **Settled (P8).** The encounter world resets with the ship. Sharing body states across the arcs of an encounter is now permitted (§3.5) but not built.
3. **Owner / 3B / 1B.** Do accelerometers feel the Inverse Well's reversed push? If yes, accelerometer against command shows the reversal at once. If no (recommended: the well acts on motion, like gravity), only tracking shows it, and discovery needs a comparison.
4. **Scale and sensors.** The scale is 1B's (merged; the reference propagator reproduces `tests/vectors/physics.json`). Sensor noise stays at 1G's values; the owner left 1C's values for balancing. Either can be changed in `assumptions.json` and regenerated.
5. **Specified but not vector-tested:** unseen-body mode (§6.3), region thrust response (§6.5), powered-window fits and per-burn response (§5.2, §9.5), asteroid probes (§10), outlier flags (§2.5), sigma points (§8.5), pointing terms (§2.1).
6. **Gross misfit.** Tier G on a badly wrong structure may stop unconverged (§4.4). By design nothing downstream depends on it, but its χ²/ν is then only a lower bound on how bad the fit is.
7. **Two comparable bodies.** The profile is one curve per body against distance. Where two bodies pull comparably it is not well defined. `[ASSUMED]` Exclude from the profile any window in which a second body's believed pull exceeds 20% of the reference body's.
8. **Range scale.** Horizon-based range depends on the believed body radius. A wrong radius scales every range and correlates with GM (GM ∝ scale³ for a Newtonian fit). An optional per-body range-scale parameter with a prior would expose it; not included.
9. **Linearization.** Envelopes are linear up to the horizon; the 5 h dive point sits at 2.1σ partly from nonlinearity.
10. **Planar only** (P1). The mathematics generalizes; the window rule (swept angle) needs a 3D definition.
11. **Extended bodies.** The law is a point-source law; 1B notes the shell theorem does not hold for n ≠ 2. Close to a large body the model's point-mass structure is itself wrong, and would show as a distance trend.
12. **Owner / integrator (A5).** Which bodies a validated span applies to. This revision reads it as "every body, for a rule shared by all bodies" (§7.4), because the same-body reading leaves the earned hedge with no effect anywhere. If the owner wants a carried rule to give no tighter envelope around a new body at all, set `validatedRange.transfer` to `same-body`; the default hedge then applies everywhere outside sampled distances, in every encounter.
13. **Aging rates** (§3.7) are play values with physical reasons, not measured ones. They set how often the player must re-calibrate; the 3E harness run with carried knowledge and no new measurements is the place to tune them.
14. **Few windows.** The profile's inflation factor is a ratio estimated from the windows themselves; with fewer than about six it is noisy (2.7 from four windows in a development run). It errs wide, not narrow.

---

## Appendix A. Vector files

`tests/vectors/estimator/index.json` lists the vectors. Each file:

```
{ schema, id, title, description, assumptionsHash, units, frame, propagation, tolerance, notes,
  cases: [ {
     id,
     attempts: [ { id, epoch, duration, commands: [{t0, t1, u, theta}], measurements: [{t, kind, target?, z, sigma}] } ],
     truth: { structure, values, checkpoints, integrationCheck_m },        // checking only; never pass to the estimator
     fits: [ { id, description, compare, attempts, model, parameters, expected, noiseFree, ... } ],
     tierL?: { reference, windowRule, windows, noiseScale, profile },      // expected Tier L results
     anchor?, forecasts?, plans?, forecastInputs?, carried?                // forecast vectors
     table?, carried?, history?, agedSigma?                                // parameter-aging
  } ],
  checks: [ { id, claim, value, pass, label } ] }
```

- `measurements`: `kind: "opnav"` has `z = [bearing]` or `[bearing, range]`; `kind: "accel"` has `z = [fx, fy]` in the body frame.
- `fits[].model` is the structure: a number is a fixed value, `{"param": name}` an estimated parameter (`{att}` expands to the arc id), `{"sum": [a, b]}` the sum of two. `parameters` gives initial values and priors.
- `attempts[].events` (parameter-aging): `{t, kind: "damage", equipment, conditionDrop}`.
- `fits[].expected`: `estimate`, `sigma`, `correlation`, `chi2`, `m`, `pEff`, `nu`, `chi2PerDof`, `residualSummary`. `noiseFree` is the same fit on noise-free data.
- `compare: "numeric"`: match within the file's `tolerance`. `compare: "qualitative"`: only the listed checks and any `heldOut.pass`.
- `checks`: the physical claims, each evaluated by the generator. A vector is only written if all pass.

| Vector | Shows | Claims |
|---|---|---|
| `newton-recovers-gm` | Newtonian truth and model: GM recovered; an unneeded extension is harmless and not adopted | 5 |
| `inv25-newton-two-distances` | Inverse-2.5 truth, Newtonian model: GM at two distances differs by √(r₂/r₁) | 6 |
| `inv25-exponent-coverage` | Exponent extension recovers 2.5, tighter with coverage; Tier L under the wrong law | 11 |
| `missing-body-signature` | Missing body: non-central signature; body extension | 6 |
| `burn-only-confounded` | Engine and gravity confounded without coast data or accelerometer records | 7 |
| `extension-validation` | Held-out test: right rules pass, base and wrong rules fail; earned hedge and its validated range | 11 |
| `forecast-envelope` | Calibrated forecast, honest envelope, hedge and horizon | 9 |
| `carried-rule-forecast` | A carried rule in a later encounter: earned hedge inside its validated range, default beyond | 9 |
| `parameter-aging` | Ship calibrations age; stale confidence misleads; re-earning; per-arc deviations | 10 |

All 74 claims hold, and all nine files regenerate identically. `[DEMONSTRATED: python tools/estimator-ref/generate.py --check]`
