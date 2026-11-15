# Predictive model: estimator specification

Section 1G, revised by 2G · Branch `p2/2g-3d-flight` · For the model implementation (`src/model/`) and the integrator. **Revision 3** (2026-11-14, DECISIONS A11: flight is three-dimensional). Revision 2 (A4, A5) is the planar special case and stays testable: see "Planar reduction" in §1.

Everything here is **proposed** until the implementation reproduces the vectors. Claims are labelled per the build-plan conventions:

- `[ESTABLISHED: ID]` from the bibliography (`References/BIBLIOGRAPHY.md`).
- `[ASSUMED]` a choice made for this build. Scale, sensor, prior, window, hedge and threshold values live in `tools/estimator-ref/assumptions.json`, and the 3D additions in `assumptions-3d.json` beside it; solver constants are stated in §4.4–4.5.
- `[FICTIONAL]` a deliberate departure from real physics.
- `[DEMONSTRATED: vector / check]` shown by the reference generator. `vector / check` names a file and a check id inside it. The planar vectors are in `tests/vectors/estimator/` (nine files, unchanged since revision 2); the 3D vectors are in `tests/vectors/estimator-3d/` (eight files). The two sets share no vector id.

Scale (r₀, body masses) and sensor noise are parameters: edit the assumptions, run `python tools/estimator-ref/generate.py` (planar set) or `generate.py --3d` (3D set), and every vector regenerates. Sensor noise stays at 1G's values until balancing.

**What revision 3 changes** (for anyone who built from revision 2):

| Where | Change | Why |
|---|---|---|
| §1 | Positions and velocities are 3-vectors, attitude is a unit quaternion; a stated planar reduction under which revision 2 and its nine vectors apply unchanged | A11 |
| §2.1 | An optical fix is azimuth, elevation and range. The estimator forms the bearing residual in the tangent plane at the measured direction, so the poles need no special case. The camera bias becomes a three-component rotation fixed in the body frame and needs the recorded attitude at each fix | A11 |
| §2.2, §2.3 | Three-axis accelerometer (it also senses RCS); attitude from the rotation-vector fix, and how attitude error enters the bearing sigma and the thrust direction | A11 |
| §3.3 | Thrust is body +x turned by the recorded quaternion, with two misalignment angles. Hands-on throttle steps and RCS translation are thrust segments. How a forecast resolves a planned burn's attitude with roll held | A11, A8 |
| §3.4–3.7 | Six state parameters per arc and per moving body; new parameter names; aging classes for the new ship parameters | A11 |
| §4.1, §4.3, §4.5, §4.7 | Residual vector, partial derivatives and initialization in 3D; timings measured again for six-state arcs | A11 |
| §5.1, §5.2, §5.4 | The swept angle is a vector; the local fit has seven parameters; "direction" is a unit vector. The profile is still indexed by distance alone | A11 |
| §6.3–6.5 | A body state has a z; the empirical acceleration gains an orbit-normal component; the Inverse Wells response is a radial reversal about a point | A11 |
| §7 | Unchanged in form. Why radial spans carry over, with a held-out test and a carried rule in planes never trained in | A11, A5 |
| §8 | Six-state present state, which now also carries the camera misalignment; the envelope is a 3×3 covariance per sample (an ellipsoid); the horizon rule in 3D; object tracks and closest approaches | A11 |
| §9, §10 | Residuals along the track, out of the plane and in range; local strength against direction on the sphere; confounding among gravity, engine scale and the two angles; per-burn response with three factors | A11 |
| Appendix A | The 3D vector format (A.2) and the planar reduction (A.3) | A11 |
| Vectors | Eight new vectors in `tests/vectors/estimator-3d/`. The nine planar files are byte for byte those of revision 2 | — |

Nothing changed in: the form of the law (§3.1), the solver (§4.4), the outputs (§4.6), the noise scale (§5.3), the mathematics of the profile (§5.4), validation and the earned hedge (§7), the hedge and the horizon rule (§8.2–8.4), the aging arithmetic (§3.7) and persistence (§11). Distances the model tracks (covered range, validated spans, profile nodes) are radial scalars exactly as before.

**What revision 2 changed** (for anyone who built from revision 1):

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
| **Tier L** (local) | Where am I, and how strong is gravity right here? | Short-arc least-squares fits in windows of equal swept angle; a calibration profile of gravity scale against distance | ~0.06 ms per window iteration |
| **Tier G** (global) | What are the numbers in the rules? Does a proposed rule hold? | Batch weighted least squares over all retained arcs, with priors; held-out validation | ~5 ms per 12 h arc iteration |
| **Forecast** | What will my plan do, and how sure is that? | Present state from Tier L; adopted law × calibration profile; linearized covariance (an ellipsoid per sample) with a hedge outside sampled distances | ~4–50 ms |

Costs are for the 3D estimator (§4.7). Five behaviours follow from this design and are demonstrated by the vectors, in the plane and in 3D:

1. **Confident where data exists.** Inside distances the ship has sampled, the forecast uses gravity as measured there. With a Newtonian law in an inverse-2.5 world it is still within 1σ of truth for 8 h, and 31× closer than the uncalibrated law at 6 h. `[DEMONSTRATED: forecast-envelope / honest-coast, calibration-pays]`
2. **Honest elsewhere.** Outside sampled distances the envelope widens with a hedge, and the forecast simply ends at a horizon when it can no longer say anything useful. `[DEMONSTRATED: forecast-envelope / hedge-needed, horizon-ends-dive]`
3. **The model never invents a rule (P5).** The calibration profile is a table of numbers indexed by sampled distance. It cannot extrapolate. A rule (an extension) is enabled by the player, fitted from all retained data, and must pass a held-out attempt. `[DEMONSTRATED: extension-validation]`
4. **Wrong structure is visible, and its cause is distinguishable.** Wrong distance law, missing body and engine mis-calibration each leave a different signature (§9.6).
5. **Carried knowledge helps without making the next encounter easy (A5).** A validated rule tightens the envelope only at distances it was tested at; a new body's strength must still be measured; ship calibrations loosen with time, use and damage and must be re-earned. `[DEMONSTRATED: carried-rule-forecast, parameter-aging]`

The owner approved this design, including the automatic per-distance calibration, as DECISIONS A4.

In 3D the same five hold, and three things are new (A11):

6. **Distance is still the only index.** One profile against distance explains windows taken in three orbit planes (inflation 1.0); a rule passes a held-out arc in a plane it never trained in; a carried rule's span applies to a dive in a plane that was never sampled. `[DEMONSTRATED: inv25-exponent-planes / profile-distance-explains, exponent-passes-heldout-other-plane; carried-rule-other-plane / earned-inside-validated]`
7. **The envelope is an ellipsoid, and its shape says why.** Coasting, it is long in the orbit plane and thin across it. After a plane-change burn with an aged engine it is longest out of the plane. `[DEMONSTRATED: forecast-envelope-3d / coasting-envelope-is-flat, out-of-plane-largest]`
8. **Nothing depends on the frame.** A planar scenario turned bodily, attitude included, gives the planar results turned, to 3×10⁻⁷ σ, even with a fix on the pole (54 µrad from +z, where its azimuth means nothing). `[DEMONSTRATED: rotation-invariance]`

---

## 1. Scope and ground rules

- The estimator receives measurements, executed commands and configuration. It never receives truth types (P11). `truth` blocks in the vectors are for checking only.
- **The model sees only what Black Box recorded** (P8, P12). A measurement that was not recorded does not exist for the model. This is what makes "rebuild from records equals live state" exact (§11). `[ASSUMED]`
- **Three-dimensional (A11).** Positions and velocities are 3-vectors in one right-handed inertial frame per encounter. The body frame is +x forward (the direction the main engine pushes the ship), +y left, +z up. Attitude is a unit quaternion `q = (w, x, y, z)`, **body to inertial**, scalar first, Hamilton product; `C(q)` is its rotation matrix (`v_inertial = C v_body`); `q` and `−q` are the same attitude. Angular velocity is in the body frame. SI units, radians, seconds.
- Deterministic (P2): no randomness anywhere in the estimator. Inputs are sorted (§11.3).
- The model forecasts; it does not plan (P6). Things the ship has not sensed are absent from the forecast.

**Planar reduction.** Planar data embed exactly: z = 0, attitude a rotation about +z, elevation 0. Every formula in this document then reduces to revision 2's. To run a planar case, hold the out-of-plane unknowns at zero (z and vz of the ship and of every body, the pitch misalignment `engine.dP`, the camera components about body x and y, the orbit-normal empirical term) and leave out the out-of-plane rows (elevation, the accelerometer's z). Estimates, sigmas, χ², m, p_eff and ν are then those of revision 2, so the nine planar vectors apply unchanged (Appendix A.3). The 3D reference, which shares no dynamics or measurement code with the planar one, reproduces all 19 numeric planar fits this way to 1×10⁻⁵ σ, and the planar forecast vector's windows, profile, present state and forecast to 8×10⁻⁷ σ. `[DEMONSTRATED: python tools/estimator-ref/bridge_planar.py]`

---

## 2. Measurement models

The estimator needs each measurement's value `z`, its 1σ `sigma`, its time and its source. The noise formulas below are for 2B (which generates measurements) and for reading the vectors; 2C consumes `sigma` as reported.

### 2.1 Optical tracking fix

The navigation camera images a known body. Star-field attitude turns the body's image position into an inertial bearing; the body's apparent size gives range. This is how real optical navigation works: body position against background stars `[ESTABLISHED: DD03, DD06]`, line-of-sight bearing and horizon-based range with sub-pixel limb fitting `[ESTABLISHED: DD05]`, range and bearing from Earth and Moon images processed onboard `[ESTABLISHED: DD07]`.

```
d      = r_body - r_ship                         [m]    3-vector, inertial
p      = d / |d|                                        unit line of sight, ship to target
p_c    = Rot(C(q_fix) b_cam) p                          what the camera reports (camera misalignment, below)
az     = atan2(p_c,y, p_c,x)   in (-pi, pi]      [rad]  azimuth
el     = asin(p_c,z)           in [-pi/2, pi/2]  [rad]  elevation above the inertial x-y plane
z      = [az, el] + noise,   sigma = [sigma_b / cos(el), sigma_b]        bearing
z_rho  = |d| + noise,        sigma = sigma_rho   [m]    range, only when the body is resolved
```

The pointing error is **isotropic**: two independent errors of size σ_b across the line of sight. In angles that is σ_el = σ_b and σ_az = σ_b / cos(el), because a step of azimuth moves the line of sight by only cos(el) of itself. The sensor reports the two sigmas per component as the contracts require. (At ±90° elevation the azimuth is meaningless and σ_az is enormous; the estimator below only ever uses the product σ_az cos(el), which is σ_b again.)

**Camera misalignment.** `b_cam = (b_x, b_y, b_z)` is the camera-to-star-tracker misalignment: a small rotation vector, constant in the **body frame** (§3.6). The camera's picture of the sky is turned by it, so the reported line of sight is the true one turned by the rotation vector `C(q_fix) b_cam`, where `q_fix` is the recorded attitude at the fix. `Rot(w)` is the rotation by angle |w| about w. In the plane, where every attitude is a rotation about +z, only `b_z` acts and it adds to the bearing: the planar `camera.bias` is `b_z` (parameter `camera.bias.z`).

- Because of `q_fix`, **each fix must carry the attitude recorded at its time**. With no attitude the reference takes the identity.
- What is observable depends on how the ship turns. With a constant attitude the misalignment turns the whole picture rigidly, which nothing in the dynamics of a coast opposes: all three components stay at their prior `[DEMONSTRATED: inclined-newton-recovers-gm / camera-held-by-prior, posterior/prior σ = 1.000]`. After the ship re-points, the same body-fixed error turns the picture differently before and after, and the two components across the turn axis become observable; the component along the turn axis still turns everything alike and stays at its prior `[DEMONSTRATED: thrust-3d-confounded / camera-observable-after-turn: principal σ 0.10, 0.13 and 1.00 of the prior, the undetermined direction within 0.01° of the turn axis]`.
- A recorded burn ties the picture to the star tracker's frame through the thrust direction, so the misalignment and the two thrust angles (§3.3) trade against each other.
- The component along the line of sight (a roll of the camera about its boresight) never moves a centred target. It is observable only through the other fixes.

**What the estimator does with a fix.** It works in the tangent plane at the *measured* direction. With the measured angles (az, el):

```
m    = [cos el cos az,  cos el sin az,  sin el]          measured direction
e_E  = [-sin az,  cos az,  0]                            east  (the direction azimuth moves it)
e_N  = [-sin el cos az,  -sin el sin az,  cos el]        north (the direction elevation moves it)
s    = (e_E . p_c,  e_N . p_c),   c = m . p_c            predicted direction seen from the measured one
theta = atan2(|s|, c)                                    angle between measured and predicted
r_b  = -(theta / |s|) s                                  bearing residual, a 2-vector [rad]  (-> -s as |s| -> 0)
whitened rows:  r_b,E / (sigma_az cos el),   r_b,N / sigma_el,   (rho_measured - |d|) / sigma_rho
```

`[ASSUMED]` This is "measured minus predicted" along the great circle between the two directions. Three properties make it the definition rather than a refinement:

- **It reduces exactly.** For planar data `e_N = z`, the north row is zero and the east row is `wrap(az_measured − az_predicted) / σ`, revision 2's residual.
- **It does not depend on the frame.** With isotropic σ_b the two rows' sum of squares is θ²/σ_b², whatever the axes. A scenario turned bodily gives the same χ² to 3×10⁻¹³ and the same estimates to 3×10⁻⁷ σ. `[DEMONSTRATED: rotation-invariance / tier-g-rotated-equals-flat]`
- **Nothing happens at the poles.** `e_E` and `e_N` are an orthonormal pair for any two angles, and σ_az cos(el) is σ_b again. A fix 54 µrad from the +z pole, whose azimuth is arbitrary and whose σ_az is about 0.8 rad, is fitted like any other. `[DEMONSTRATED: rotation-invariance / tier-g-pole-equals-flat]`

Differencing the angles directly, `(wrap(Δaz)/σ_az, Δel/σ_el)`, agrees with this to first order and differs by a fraction θ tan(el) of the residual: harmless below about 80° of elevation, wrong by a sigma or more for a fix within a few σ_b of a pole, where the predicted and measured azimuths can differ by any amount. An implementation that differences angles must at least switch to the form above near the poles.

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

At r₀ = 1e6 m from body A (radius 250 km) and full power this gives σ_b = 4.1e-5 rad (41 m across the line of sight, in both directions) and σ_ρ = 2.0 km. Bearings are 50× more precise than ranges; the dynamics, not the range measurement, fix the orbit's scale. None of these formulas changed in revision 3: σ_b is one number, used for both tangent directions.

**Pointing** `[ASSUMED; not exercised by the vectors]`: a fix exists only if the target is inside the field of view, a cone (off-boresight angle β ≤ FOV/2, β the angle between the camera's boresight and the line of sight), not occulted, and the body rate is below the star tracker's limit. 2B may add an off-boresight term `(k_off (2β/FOV)² IFOV)²` and a smear term `(|ω| t_exp)²/12` to σ_b².

**Cadence** `[ASSUMED]`: one fix every `Δt_min / p` seconds. Only recorded fixes reach the model.

### 2.2 Accelerometers

Accelerometers sense non-gravitational acceleration only (P7), on three body axes. While anything fires:

```
z_f = k_A ( k_E u t_b(dE, dP) + k_R a_rcs ) + noise        [m/s^2]  body frame (u, k_E, t_b, k_R, a_rcs: see 3.3)
t_b = [cos dP cos dE,  cos dP sin dE,  sin dP]
sigma_f = VRW / sqrt(dt_sample)                             per axis
```

VRW = 0.02 (m/s)/√h = 3.33e-4 (m/s)/√s and bias stability 3 µg `[ESTABLISHED: S04]`. With 60 s samples σ_f = 4.3e-5 m/s². `k_A` is the accelerometer scale factor (§3.6), one number for the triad `[ASSUMED]`. With `dP = 0` and no RCS the z row is zero and the first two are revision 2's.

The attitude does not enter: the accelerometer measures the push in the body frame. That is why it separates what tracking cannot: the magnitude gives `k_A k_E`, the direction gives both misalignment angles, whatever the ship's roll. `[DEMONSTRATED: thrust-3d-confounded / accelerometer-pins-both-angles, accelerometer-pins-plane-change]`

Accelerometer samples are used **only while thrust is commanded** (main engine or RCS). While coasting the commanded thrust is zero by record, so the accelerometer adds nothing about gravity and its bias would only add error `[ASSUMED]`. The 3 µg bias is negligible against any burn (≥ 5e-3 m/s²) and is not estimated; neither is a misalignment of the triad against the body axes, which would add to the two thrust angles one for one `[ASSUMED]`.

### 2.3 Attitude

Star-tracker attitude is not estimated by this model. A star-tracker fix is the rotation vector φ (axis × angle, angle in [0, π]) of the body-to-inertial rotation, with a sigma about each body axis; the quaternion is

```
q = ( cos(|phi|/2),  sin(|phi|/2) phi / |phi| )            (identity for |phi| = 0)
```

A planar attitude ψ is φ = [0, 0, ψ]. Between star fixes the gyro rate ω (body frame) carries it forward: `q <- q (x) q(omega dt)`, with `q(.)` the quaternion of a rotation vector as above. The recorded attitude enters in three places:

1. the attitude `q` of each thrust segment (§3.3);
2. the attitude `q_fix` at each optical fix, for the camera misalignment (§2.1);
3. σ_att inside σ_b (§2.1).

```
sigma_att = sigma_st                                             star tracker valid
sigma_att = sqrt( sigma_st^2 + ARW^2 dt + (b_g dt)^2 )           dt since the last valid star fix
```

Gyro ARW = 0.02°/√h = 5.82e-6 rad/√s, bias stability 0.15°/h = 7.27e-7 rad/s `[ESTABLISHED: S04]`. Ten minutes without the star tracker makes bearings 12× worse; an hour, 68×. The star tracker loses its solution above a body rate limit (0.3–3°/s `[ESTABLISHED: S04]`; 1°/s `[ASSUMED]`), now the size of the body rate vector.

**How attitude error enters the bearing sigma.** An attitude error is a small rotation ε with sigma σ_i about body axis i. It moves the reported line of sight by ε × p: the part of ε along the line of sight does nothing, the two parts across it move it one for one. With equal sigmas (σ_att about every axis, which the reference assumes `[ASSUMED]`) the bearing gains σ_att² in both tangent directions and σ_b keeps revision 2's formula. With unequal sigmas (a star tracker knows roll about its own boresight several times worse) the variance along a tangent direction e is `sum_i sigma_i² ((C a_i × p) . e)²`, a_i the body axes, and the sensor should report the two component sigmas from that `[ASSUMED; not exercised]`.

**How it enters the thrust direction.** The same error tilts a recorded burn like a misalignment. At 8 arcsec it is 250 times smaller than the misalignment prior and is ignored. While the star tracker is lost, add σ_att² to the variance of both misalignment angles for that segment `[ASSUMED; not exercised]`.

### 2.4 Reported sigma and true noise

Each sensor reports σ from its **believed** condition. If equipment is damaged and the sensor does not know it, true noise exceeds reported σ. The model detects this from Tier L: short windows absorb structural error, so their χ²/ν measures noise against reported σ. The noise scale `s²` (§5.3) inflates every covariance. `[ASSUMED]`

### 2.5 Outliers

`[ASSUMED; not exercised by the vectors]` A measurement whose whitened residual against the current Tier L window fit exceeds 5 is flagged as an outlier, kept in Black Box, and excluded from all fits. For a bearing the test is on the length of its whitened 2-vector, which does not depend on the frame; a flagged fix loses all its rows. Flags are recomputed whenever the window is refitted, so the result does not depend on processing order.

---

## 3. The believed world

### 3.1 Gravity law

```
a_j(d) = (mu_j / r0^2) (r0 / |d|)^n  d / |d|          d = r_j - r        [m/s^2]
```

Unchanged in revision 3: the pull is along the line between centres and `|d|` is the 3D distance (A11). `mu_j` [m³/s²] is the Newtonian-equivalent GM of body j at the shared reference length `r0` [m] (P4; one fixed r₀ for every body, as 1B requests). `n` is the distance-law exponent. With n = 2 this is Newtonian gravity for any r₀. For n ≠ 2 the coupling is `K_j = mu_j r0^(n-2)` in m^(n+1)/s² `[FICTIONAL]`.

The model starts with n = 2 fixed and `mu_j` from an arrival calibration prior. It does not know the true exponent.

### 3.2 Bodies

Massive bodies attract each other and the ship under the same law. The ship (and any tracked asteroid) is a massless test particle. With one modeled body the body is fixed. With two or more, the bodies move; a model that tracks the ship relative to a primary must include the secondary's pull on the primary (as 1B notes). `[DEMONSTRATED: missing-body-signature / body-chi2]`

### 3.3 Thrust

```
a_T(t) = k_E u(t) C(q(t)) t_b(dE, dP)  +  k_R C(q(t)) a_rcs(t)                 [m/s^2] inertial
t_b    = [cos dP cos dE,  cos dP sin dE,  sin dP]                               thrust direction, body frame
```

`u(t)` is the commanded main-engine acceleration (commanded force over believed mass), `q(t)` the recorded star-tracker attitude, `a_rcs(t)` the commanded RCS translation acceleration in the body frame; all are piecewise constant over recorded segments. `k_E` is the engine scale factor (it also absorbs mass error). Commands are always recorded, so thrust is exactly zero outside segments.

**Two misalignment angles.** The thrust direction is body +x turned by `dP` about body −y (toward +z) and then by `dE` about body +z (toward +y): azimuth `dE` and elevation `dP` in the body frame. `dE` is revision 2's angle; for a planar attitude ψ and `dP = 0` the direction is `[cos(ψ + dE), sin(ψ + dE), 0]`. Parameter ids: `engine.dE` is the contracts' `thruster.<id>.misalignment`, `engine.dP` is `thruster.<id>.misalignment-pitch`.

An out-of-plane burn needs both. Holding `dP` at zero on a 24 m/s burn with a true 3 mrad pitch error leaves χ²/ν at 0.98 and puts `dE` 3.9σ from truth: the missing angle does not show in the residuals, it biases the other one. `[DEMONSTRATED: thrust-3d-confounded / one-angle-engine-biased]`

**Segments from executed commands** `[ASSUMED]`:

- `burn` and `cutoff` give main-engine segments, as before.
- `fly` (hands-on flying, A8) carries a main-engine throttle in force until the next `fly`. Each stretch of constant throttle is a segment with `u = throttle × nominal thrust / believed mass`: **hands-on thrust is treated exactly like a burn.**
- The attitude of a segment is the recorded attitude. When the player turns while thrusting, split the segment at the attitude records (each piece takes the fix nearest its middle); the direction error left is at most half the turn between two records.
- **RCS translation is modelled, not left to the residuals.** The `fly` translation demand (−1..1 per body axis) times the nominal jet acceleration on that axis is `a_rcs`; one scale `k_R` (`rcs.kR`, prior 1 ± 0.1) multiplies it. It needs no machinery beyond a segment, and it is the only honest option: 1.63 m/s of RCS left out of the model raises χ²/ν only to 1.63 while dragging gravity 9.6σ and both misalignment angles 10σ from truth, because the fit explains the unmodelled push with whatever it has. Modelled, the same data fit at χ²/ν = 1.06 and give `k_R` to 0.3%. `[DEMONSTRATED: thrust-3d-confounded / hands-on-fits, rcs-scale-learned, rcs-cannot-be-left-out]`
- RCS firings that only turn the ship (couples) give no net push and are ignored. Jet imbalance during turns is not modelled; it is bounded by the imbalance fraction times the Δv of the turn and would show in the powered residuals (§9.1) `[ASSUMED; not exercised]`.
- A segment with any thrust, main or RCS, is "powered" for Tier L windows (§5.1) and for the residual split (§9.1).

**Roll held, and a planned burn's attitude.** The player steers yaw and pitch; nothing commands roll. A pointing target is reached by the smallest rotation from the attitude at that moment:

```
pointAlong(q, d) = shortestArc(C(q) x_body, d / |d|)  (x)  q
```

(`quat.pointAlong` in `src/lib`, which the game layer also uses; for planar inputs it is exactly a yaw). A forecast resolves its plan in time order, carrying one running attitude `q_run`:

1. `q_run` starts as the latest recorded attitude.
2. At each plan item that sets an attitude, in order: an `inertial` target replaces `q_run`; a `direction` target gives `pointAlong(q_run, direction)`; `prograde` and `retrograde` use ± the velocity of **the forecast's own mean path** at that time; `toward` and `away` use the mean relative position of the object at that time.
3. A burn uses its own target if it has one, otherwise `q_run`. The resolved attitude is then fixed for the segment and for every sensitivity column.

So a planned burn has a definite full attitude, roll included, given the attitude before it `[ASSUMED]`. The reference builds every burn this way, and the vectors give each planned burn as its resolved `q` together with an `attitudeResolution` record (`qBefore`, `direction`, `q`) against which an implementation can check its `pointAlong`. Roll matters because the misalignment is fixed in the body: `dE` tilts the thrust toward body +y and `dP` toward body +z, and where those two axes point in space is set by the roll. With both angles zero and equally uncertain, roll changes nothing. As soon as either estimate is non-zero the mean path shifts by `Δv (dE y_b + dP z_b)`, and as soon as their sigmas differ the envelope's engine term is wider along one of those axes than the other. Two plans that point the engine the same way after different earlier turns therefore forecast slightly different paths, and both are right.

The direction of a velocity-referenced burn also inherits the uncertainty of the velocity it was resolved from, an angle of about σ_v / |v|. It is second order next to the misalignment; where it is not (σ_v / |v| above the misalignment sigma), add its square to both misalignment variances for that burn `[ASSUMED; not exercised]`.

### 3.4 Frame and gauge

All measurements are relative (ship to body), so absolute position and velocity are unobservable: six numbers in 3D. Fix them by convention: **in each arc, the first modeled body (the primary, "A") is at the origin and at rest at the arc epoch.** This is an inertial frame. A accelerates afterwards if other bodies are modeled.

Orientation is not a gauge freedom: the axes are the star tracker's. But the picture is tied to them only through the camera misalignment (§2.1), so three rotations of the whole picture are known only as well as that misalignment is, 100 m at r₀ for the 10⁻⁴ rad prior. Tier G holds them with the prior; the forecast carries them in the present state (§8.1).

### 3.5 Arcs

An arc is one stretch of one attempt over which the dynamics are continuous. Its epoch is the time of its first retained measurement; state parameters are defined at the epoch and propagated forward. Arcs break at attempt boundaries and at any event the ship records as a discontinuity (collision, docking). Data gaps do not break arcs.

Each arc carries its own ship state, and its own state for every modeled moving body other than the primary. Recurrence resets the whole encounter world, bodies and asteroids included (P8). The estimator does not rely on that: per-arc body states stay correct, and sharing one body state across the arcs of an encounter is a permitted refinement `[ASSUMED; not vector-tested]`. What the reset does justify is §3.7: every attempt starts with the same physical ship.

### 3.6 Parameters

Names are the contract with the vectors. `{att}` is an arc (attempt) id; `{win}` a Tier L window id.

| Name | Meaning | Scope | Prior (vectors) | Scale |
|---|---|---|---|---|
| `{att}.ship.x, .y, .z, .vx, .vy, .vz` | ship state at the arc epoch: **six numbers** | arc | none | 1e3 m, 1 m/s |
| `{att}.{body}.x, .y, .z, .vx, .vy, .vz` | moving body's state at the arc epoch (not the primary): six numbers | arc | none | 1e3 m, 0.1 m/s |
| `mu.{body}` | GM at r₀ | global | A: 1.02e10 ± 3e8 (arrival calibration); extension body: 0 ± 1e11 | 1e-3 μ |
| `law.n` | exponent (extension only) | global | 2 ± 1 | 1e-3 |
| `engine.kE` | engine scale | global | 1 ± 0.05 | 1e-3 |
| `engine.dE`, `engine.dP` | thrust misalignment about body +z and about body −y (§3.3) | global | 0 ± 0.01 rad each | 1e-3 |
| `rcs.kR` | RCS translation scale (§3.3) | global | 1 ± 0.1 | 1e-3 |
| `accel.kA` | accelerometer scale | global | 1 ± 1e-3 | 1e-4 |
| `camera.bias.x, .y, .z` | camera misalignment, a rotation vector in the body frame (§2.1). **`camera.bias.z` is the planar `camera.bias`** | global | 0 ± 1e-4 rad each | 1e-5 |
| `{att}.emp{k}.R, .T, .N` | empirical acceleration, window k: radial, tangential, orbit-normal (§6.4) | arc | 0 ± 1e-2 m/s² | 1e-6 |
| `{win}.g` | local gravity scale (§5.2) | window | 1 ± 0.5 | 1e-3 |
| `{att}.engine.dkE`, `.ddE`, `.ddP`, `{att}.rcs.dkR`, `{att}.accel.dkA`, `{att}.camera.dbias.x, .y, .z` | deviation of a ship parameter in this arc from its arrival value (§3.7) | arc | 0 ± aging accrued in the arc | as the parameter |

All priors are `[ASSUMED]`. "Scale" is the finite-difference step and conditioning unit; results do not depend on it. The order x, y, z, vx, vy, vz is the order of every 6-vector and 6×6 block in the vectors. The planar vectors keep revision 2's names; in them `camera.bias` means `camera.bias.z`.

Names against the contracts' parameter ids (`src/contracts/README.md`): `mu.{body}` ↔ `body.<id>.mu`; `law.n` ↔ `law.gravity.exponent`; `engine.kE`, `.dE`, `.dP` ↔ `thruster.<id>.scale`, `.misalignment`, `.misalignment-pitch`; `accel.kA` ↔ `sensor.<imu>.scale`; `camera.bias.x, .y, .z` ↔ `sensor.<camera>.bias-x`, `.bias-y`, `.bias-z` (the planar `sensor.<camera>.bias` is `.bias-z`); `rcs.kR` has no contract id yet and would be `thruster.<rcs>.scale`.

Some parameters are not observable from some data. With a single body, a constant attitude and no burns the whole picture can turn, so the camera misalignment stays at its prior: one component in the plane `[DEMONSTRATED: newton-recovers-gm, posterior σ = 1.0e-4]`, all three in 3D `[DEMONSTRATED: inclined-newton-recovers-gm / camera-held-by-prior]`. Priors hold such directions; the confounding indicator (§9.3) reports them. What the six state numbers and GM look like on an inclined orbit:

| Fit `[DEMONSTRATED: inclined-newton-recovers-gm]` | Result |
|---|---|
| GM from a prior 2% off, 12 h arc inclined 50° | within 0.43σ of truth; σ = 1.3% of the prior's |
| Six-state at the epoch against truth | Mahalanobis distance 2.2 (3σ for six numbers is 4.48) |
| Orbit normal | 16 µrad from truth, σ = 100 µrad: the camera prior, nothing else, limits it |
| z at the epoch | σ = 82 m with no prior |
| Unneeded exponent | 2 within 0.04σ; cost drop 0.0015, not adoptable |

### 3.7 Aging of ship calibration parameters (A5)

**What ages.** The ship's own calibrations: `engine.kE`, `engine.dE`, `engine.dP`, `rcs.kR`, `accel.kA` and the three components of `camera.bias`. **What does not:** anything about the world (body GMs, the law, calibration profiles) and adopted rules. The world does not wear; the ship does.

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

Revision 3 adds classes for the new ship parameters (`assumptions-3d.json`, `aging.classes`) `[ASSUMED; the arithmetic is the planar one and is not exercised again]`: `engine.dP` ages with the rates of `engine.dE` (the same thrust line, the other axis); each component of `camera.bias` with the rates of the planar `camera.bias`; `rcs.kR` at 0.5% per √day, 2% per √(10 m/s of commanded RCS Δv) and 20% per unit of condition lost (small jets pulse, and a stuck or weak jet changes the set). The forecast-envelope-3d vector uses the aged engine of the worked example below for a plane-change burn (§8.3).

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

Per-arc deviations of ship parameters (§3.7) are ordinary arc-local parameters with independent priors; a model block may give a parameter as the sum of two (`{"sum": [...]}` in the vectors). The data term is written for scalar rows; a fix contributes the two whitened bearing rows and the range row of §2.1 (in the planar reduction one bearing row, the wrapped azimuth difference), an accelerometer sample three rows. This is batch weighted least squares with a priori information, the "batch filter" of deep-space orbit determination: compute what each data point should be on the modeled trajectory, form residuals, adjust the model to minimize them `[ESTABLISHED: DD03]`.

### 4.2 Prediction

For each arc, propagate all modeled bodies and the ship from the arc epoch with the believed law (§3.1–3.3) and evaluate §2 at each measurement time. Measurements whose target is not a modeled body are skipped. The reference uses fixed-step RK4 with dt = 60 s and all times on the step grid; 2C should use the same integrator as its forecast service, with a step from 1B. Any propagator accurate to about 1 m over the arc reproduces the vectors.

The planar reference propagator agrees with 1B's independent Dormand–Prince vectors to 1.5e-6 m and 2e-10 m/s over 20 000 s for exponents 2 and 2.5, fixed source and mutual binary. `[DEMONSTRATED: tools/estimator-ref/crosscheck_1b.py against tests/vectors/physics.json]`

The 3D reference propagator is a separate implementation and is checked three ways `[DEMONSTRATED: tools/estimator-ref/crosscheck_3d.py]`:

| Check | Cases | Worst error |
|---|---|---|
| The planar physics vectors with z = 0 | 4 | 1.5e-6 m, 2.0e-10 m/s (the planar reference's own figures) |
| The same cases turned into a plane inclined 55° (node 20°, in-plane turn 0.3 rad), against 1B's values turned by the same rotation | 4 | 1.3e-6 m, 1.6e-10 m/s |
| The independent 3D physics vectors, `tests/vectors/physics-3d.json` (2G physics, Dormand–Prince): inclined orbits, a ship crossing the binary plane, an inclined binary, nodal precession over 2 000 000 s | 8 | 1.1e-4 m, 1.3e-8 m/s (over 2 000 000 s; 6.0e-5 m over 20 000 s) |

All within the physics vectors' own tolerances (0.1 m and 1e-5 m/s; 5 m and 5e-4 m/s for the long cases), at a 10 s step.

### 4.3 Partial derivatives

The reference uses central finite differences of the whitened residuals (step 1e-3 × scale). An implementation may do the same, or integrate the variational equations, which is faster. With ship state `y = (r, v)`, six numbers, and sensitivity `S = dy/dq` for any parameter q:

```
dS/dt = [ 0  I ] S + [   0   ]                 0, I, G are 3x3
        [ G  0 ]     [ da/dq ]

per body j, with d = r_j - r, k = (mu_j / r0^2) (r0/|d|)^n / |d|     (so a_j = k d):
  G     += -k I + (n + 1) k d d^T / |d|^2        gravity gradient da/dr, symmetric 3x3
  da/dmu_j = a_j / mu_j
  da/dn    = a_j ln(r0 / |d|)
  da/dg    = a_j                                 local scale (5.2): the pull before scaling
thrust (C = C(q) of the segment):
  da/dkE   = u C t_b
  da/ddE   = kE u C [-cos dP sin dE,   cos dP cos dE,   0     ]
  da/ddP   = kE u C [-sin dP cos dE,  -sin dP sin dE,   cos dP]
  da/dkR   = C a_rcs

measurement partials (d = r_body - r_ship, p = d/|d|, E = [e_E e_N] the 3x2 tangent basis at the measured direction):
  h_b = E^T p_c                                  predicted direction in the tangent plane; the residual is -h_b (theta/|s|)
  dh_b/dr_ship = -E^T (I - p p^T) / |d|          dh_b/dr_body = +E^T (I - p p^T) / |d|
  dh_b/db_cam  = -E^T [p]x C(q_fix)              (column k is E^T ((C e_k) x p))
  drho/dr_ship = -p^T                            drho/dr_body = +p^T
accelerometer (body frame, no attitude):
  df/dkA = kE u t_b + kR a_rcs    df/dkE = kA u t_b    df/dkR = kA a_rcs
  df/ddE = kA kE u [-cos dP sin dE, cos dP cos dE, 0]    df/ddP = kA kE u [-sin dP cos dE, -sin dP sin dE, cos dP]
```

The bearing partials are to first order in the residual: they drop the factor θ/sin θ and its derivative, an error of order θ² (10⁻⁹ for a converged fit), which leaves the solution unchanged and only slows convergence when the fit is grossly wrong. Whiten the two bearing rows by σ_az cos(el) and σ_el. For planar data they reduce to revision 2's: `db/dr_ship = (d_y, −d_x)/|d|²`, `db/db_cam = 1`, `da/ddE = kE u [−sin(ψ + dE), cos(ψ + dE)]`.

Moving bodies add their own six-state and the body–body terms in the same way. `tools/estimator-ref/bench.mjs` implements the dynamics equations for one body, planar and 3D.

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

- **Ship state of an arc:** least-squares quadratic `p(τ) = p0 + v0 τ + ½ a τ²` (each coefficient a 3-vector) through the first ≤ 10 fixes with range on the primary, positions `p_i = -rho_i m_i` with `m_i` the measured unit direction of §2.1 (in the plane `-rho_i (cos b_i, sin b_i)`), evaluated at the epoch.
- **Tracked body state:** ship quadratic plus the measured offset `rho_i m_i`, linear fit over the first ≤ 8 fixes.
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

Per iteration: propagation with q sensitivity columns costs O(steps × q), the normal equations O(m q²), the solve O(q³) with q ≤ ~20 per arc (arc-local parameters reduce by Schur complement if needed; dense solves are fine at this size).

What 3D adds, counted: the state and every sensitivity column grow from 4 to 6 numbers (×1.5), the gravity gradient from 3 to 6 distinct terms, each fix gives 3 rows instead of 2 (×1.5), and each fit has more columns: 7 instead of 5 for a window (two more state numbers), about 16 instead of 10 for an arc (two state numbers, `dP`, `kR`, two camera components), about 32 instead of 24 for a forecast (two state numbers, one more hedge column since revision 2, `dP`, and the rest profile nodes). Propagation should therefore cost about 1.5 × (columns ratio): 2.1× for a window, 2.4× for an arc, 2× for a forecast.

`[DEMONSTRATED: tools/estimator-ref/bench.mjs, Node v24.22 on the owner's machine; arithmetic only, no UI or worker messaging]` Measured again for revision 3, planar and 3D in the same run. Figures move by about 20% from run to run, and double when other jobs load the machine.

| Operation | Planar (revision 2 sizes) | 3D (revision 3 sizes) |
|---|---|---|
| Tier L window fit, one iteration (5 / 7 parameters, 40 fixes) | 0.05 ms | 0.06 ms |
| Tier L, 30 windows × 4 iterations | 6 ms | 8 ms |
| Present-state fit, one iteration (11 parameters, 80 fixes) | — | 0.18 ms |
| Tier G, one 12 h arc iteration, 10 / 16 parameters, 10 s steps | 2.3 ms | 5.1 ms |
| Tier G rebuild, 10 arcs × 6 iterations, 10 s steps (1 s steps) | 0.14 s (1.1 s) | 0.30 s (2.5 s) |
| Forecast with 24 / 32 sensitivity columns, 2000 steps (8 h at 1 s steps) | 1.7 ms (22 ms) | 4.4 ms (52 ms) |

The measured ratios are 1.3× (window; its cost is dominated by the normal equations, which are small), 2.2× (arc), 2.6× and 2.4× (forecast): in line with the count. The budget holds: Tier L and the forecast stay real-time (a live preview at a few Hz has 4–50 ms per forecast against a 250 ms period), and Tier G stays a worker job of a fraction of a second at the 10 s step and a few seconds at 1 s (§11.2). The reference itself (numpy, finite differences) generates the eight 3D vectors in about 2.5 minutes, 4.5 when the machine is busy.

### 4.8 Why batch least squares and not a Kalman filter

- **Order-independent.** The result is a function of the data set, so a rebuild from Black Box records equals the live result by construction (P8). A filter's state depends on processing order and tuning.
- **Honest under wrong structure.** A filter with parameter process noise quietly tracks a drifting "mass" and hides the misfit. The batch fit leaves it in the residuals, and Tier L shows the drift explicitly against distance.
- **Held-out validation is natural:** refit a subset, test on the rest (§7.2).
- **Cheap enough** (§4.7). Real-time needs are met by Tier L.
- It is what flight navigation does `[ESTABLISHED: DD03]`.

---

## 5. Tier L: local fits and the calibration profile

Tier L exists because of one fact: **a short arc can always be fitted, even when the law is wrong.** `[DEMONSTRATED: inv25-exponent-coverage / all-windows-converge; in 3D, with a six-state per window, inv25-exponent-planes / all-windows-converge]`

### 5.1 Windows

Per arc, take the fixes with range on the reference body (the primary; in general the body with the strongest believed pull), sorted by time. **The sweep is a vector**: the sum of the rotation vectors of the line of sight between consecutive fixes.

```
step(a, b) = angle(a, b) * (a x b) / |a x b|          a, b measured unit directions (2.1); zero if a x b = 0
             angle(a, b) = atan2(|a x b|, a . b)

cur = [], sweep = (0, 0, 0)
for each fix m:
    if cur is not empty and powered(m.t) != powered(cur[0].t):   close cur (forced); cur = [], sweep = 0
    if cur is not empty:  sweep += step(direction of cur.last, direction of m)
    append m to cur
    if len(cur) >= N_min and ( |sweep| >= dtheta  or  max(ln rho) - min(ln rho) over cur >= dlnr ):
        close cur; cur = [], sweep = 0
tail (cur not empty at the end):
    if len(cur) < N_min and the previous window exists, was not force-closed, and has the same powered flag: merge into it
                                                         (sweeps add; the step between the two is not counted)
    else if len(cur) >= N_keep: close it as a window
    else: drop it
```

`powered(t)` is true inside a segment in which the main engine or the RCS fires (§3.3). `dtheta = 0.7 rad` (40°), `dlnr = 0.15`, `N_min = 12`, `N_keep = 6` `[ASSUMED]`. The rule is scale-free and frame-free: it does not depend on 1B's scale or on the axes. A window is a list of fixes; its epoch `t0` is its first fix, `r_geo = exp(mean ln rho)`, and `r_min`, `r_max` are its extreme ranges. Windows are ids `{att}.w{k}` in time order.

Why a vector. Around one body the line of sight turns about the orbit normal, so the steps add along one axis and |sweep| is the angle swept, as in the plane; for planar data `step = wrap(Δbearing) z` and the rule is revision 2's exactly, sign reversals included. A window also records two unit vectors for the diagnostics (§9.2): `planeNormal = sweep / |sweep|`, which is its arc's orbit normal to 0.2 mrad `[DEMONSTRATED: inv25-exponent-planes / window-normals]`, and `direction`, the normalised mean of the ship's direction from the body over its fixes. The same data turned bodily give the same windows `[DEMONSTRATED: rotation-invariance / windows-rotated-equal-flat]`, and planar data lifted to 3D give the planar windows `[DEMONSTRATED: rotation-invariance / windows-flat-equal-planar]`. No coasting window spans a firing, main engine or RCS `[DEMONSTRATED: thrust-3d-confounded / windows-split-at-any-thrust]`.

### 5.2 Local fit

For each **coasting** window, fit 7 parameters with the §4.4 solver (no arc growing; initial state from the §4.5 quadratic over the window's first fixes):

- window state at `t0` (6 parameters, no prior; 4 in the planar reduction, where the fit has revision 2's 5 parameters);
- `g`, a scale on the reference body's pull on the ship under the **reference law** (prior 1 ± 0.5).

The reference law is the adopted structure with its global parameters frozen at the current Tier G values (before any Tier G result exists: the arrival priors). Output per window: `g`, `sigma_g`, χ²/ν. `mu_ref × g` is the local GM.

Powered windows are fitted the same way with gravity frozen at the profile and three thrust-response factors free (§9.5). `[ASSUMED; not in the reference]`

### 5.3 Noise scale

```
s2 = max(1, median over coasting windows of chi2/nu)
```

Every covariance the forecast uses is multiplied by `s2` (§2.4). In the planar vectors s² = 1.02–1.06; in the 3D vectors 1.00–1.07 (1.22 with a body missing). χ²/ν of a window now counts the elevation rows too, so the same data give slightly different noise scales in the planar reduction and in 3D (1.064 and 1.070 in rotation-invariance).

### 5.4 Calibration profile

The profile is a smooth curve `g(u)`, `u = ln(r / r0)`, through the window scales of **all retained arcs**, per reference body. **Distance is its only index in 3D as in the plane** (A11): `r` is the scalar distance from the body, and nothing below changed in revision 3.

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
- **What "direction" means in 3D.** The ship's direction from the body is a point on the sphere, the window's `direction`, and a window also has an orbit plane (`planeNormal`). The profile ignores both on purpose, and `infl` asks one question of all of them at once: do windows at the same distance agree, whatever their direction and plane? Under a wrong distance law they do: 22 windows from three planes more than 60° apart, seen from all round the body, give infl = 1.00. `[DEMONSTRATED: inv25-exponent-planes / profile-distance-explains]` With a missing body they do not, but how strongly depends on where the body is. Its tide changes the radial pull by a factor (3 cos²γ − 1), γ the angle between the ship's direction and the body's; a body in the orbit plane swings that through its whole range once per half revolution (infl = 12 in the planar vector), a body 35° off the plane through two thirds of it (infl = 4.7) `[DEMONSTRATED: offplane-body-signature / profile-distance-fails]`, and a body on the orbit normal not at all: its radial tide is the same from every direction in the plane, so it would look like a slightly different distance law and `infl` would stay near 1. What grows as the body leaves the plane is the orbit-normal empirical term (§9.4). `infl` is therefore a sufficient sign of a direction effect, not a necessary one.
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
- The signature does not depend on the plane. Circular arcs at 0.6 r₀ and 1.5 r₀ in planes 78° apart: χ²/ν = 1.04 and 0.93 alone, GM ratio 1.5811 against 1.5811, and 452 with one GM for both. `[DEMONSTRATED: inv25-two-planes]` Windows from three planes: every local GM within 3σ + 1% of μ₀(r₀/r)^0.5, slope −0.497. `[DEMONSTRATED: inv25-exponent-planes / gm-vs-distance-trend, gm-slope]`

Window σ_g is 0.16–0.65% with 13–76 fixes at the §2.1 noise, and 2.4–2.7% for tail windows that swept less than half the usual angle. It scales as 1/√(fixes) and with σ_b. The six-state windows of the 3D vector give the same: 0.18–1.6% with 13–73 fixes.

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

**In 3D the extension is unchanged in form**: one number, shared by all bodies, multiplying nothing but the distance. Arcs in different orbit planes are simply more data: 2.500003 ± 0.000155 from one arc over 0.9–1.1 r₀ and 2.499982 ± 0.000025 from three arcs in three planes over 0.5–1.9 r₀, 6× tighter. `[DEMONSTRATED: inv25-exponent-planes / exponent-narrow, exponent-wide, coverage-narrows]`

### 6.3 Unmodeled body

- **Seen mode** (the body is tracked but its gravity was left out): adds `mu.{body}` (prior 0 ± 1e11) and the body's state per arc, constrained by its own fixes. Body–body dynamics switch on. Recovers μ_B = 2.50002e9 ± 1.7e6 (truth 2.5e9) from one 16 h arc and restores χ²/ν = 1.01. `[DEMONSTRATED: missing-body-signature / body-gm-recovered, body-chi2]`
  In 3D the body's state has six numbers and its fixes give its z directly. With the body 35° off the ship's orbit plane (its own orbit plane tilted 25°, the ship's 70°): μ_B within 0.2σ, χ²/ν = 1.04, position within 1.3σ (three numbers), z = 1,088.95 km against 1,089.03 km with σ = 0.4 km. `[DEMONSTRATED: offplane-body-signature / body-gm-recovered, body-chi2, body-position-recovered]`
- **Unseen mode** (a dark mass): adds position and velocity per arc (six numbers) plus `mu`, with no fixes on the body. At leading order only the tide is observable: μ/d³ and an axis (two angles), with a two-fold side ambiguity; distance and mass separate only through the next order, (ship range / d) smaller. Initialize from the empirical tangential and orbit-normal pattern (§9.4): try both sides at distances {2, 4, 8} × the ship's range and keep the lowest cost. `[ASSUMED; the search is specified, not vector-tested]`
  **Where the position is identifiable, honestly.** Locally it is. From a start 5% too far along the true direction and 20% low in mass, solved on the whole 16 h arc at once, the fit converges at χ²/ν = 1.04 with the position within 1.4σ and z known to 16 km of 1,089 km, from the ship's motion alone. But mass and distance are nearly one number, ρ(μ, d) = 0.99: the position is known to 74 km along the line to the body and 12 km across it, and μ_B only to 5% (against 0.06% in seen mode). `[DEMONSTRATED: offplane-body-signature / unseen-locally-identifiable, unseen-mass-distance-degenerate]`
  Globally it is not solved. From a start 20% too far and 0.2 rad off, the plain solver creeps along the μ/d³ valley and has not converged after 60 iterations (χ²/ν = 2.2, distance 4.9 r₀ for a true 4.0); from the mirror side it does no better; and with arc growing (§4.5) the body runs off to infinity in the first quarter of the arc, where nothing determines it. `[DEMONSTRATED during development; recorded in offplane-body-signature under farStart, not a claim]` Unseen mode therefore needs the search above, no arc growing, and probably a parameterization by tide strength, direction and 1/d before it can be offered to the player.
- **Validated** by a held-out attempt with the body in a different direction.

### 6.4 Empirical unmodeled acceleration

- **Adds**, per arc and per window (§5.1 boundaries: window k covers [t0_k, t0_{k+1}), the first starting at the arc epoch), a constant radial, tangential and orbit-normal acceleration `aR, aT, aN` relative to a frame body. With `r` and `v` the ship's position and velocity relative to that body at the instant of evaluation:

```
r_hat = r / |r|          n_hat = (r x v) / |r x v|          t_hat = n_hat x r_hat          a_emp = aR r_hat + aT t_hat + aN n_hat
```

  Prior 0 ± 1e-2 m/s² each. `t_hat` lies in the orbit plane, perpendicular to the radius, on the side the ship is moving toward. For planar counter-clockwise motion `n_hat = z` and `t_hat = (-r_hat_y, r_hat_x)`, revision 2's definition; for clockwise planar motion revision 2's `t_hat` has the opposite sign, since it was fixed to the frame and not to the motion. The frame is undefined for purely radial motion (`r x v = 0`); leave T and N out of such a window `[ASSUMED; not exercised]`.
- **Fitted** as a chained arc fit on the **calibrated law** (reference law × profile, globals frozen), so it measures only what distance calibration cannot explain.
- **It is a diagnostic, never a rule.** Its parameters are local to a window; they predict nothing about another attempt. It is excluded from §7 and never enters a forecast.
- **Overfitting** is why: with free accelerations any trajectory fits.

### 6.5 Region-dependent thrust response (Inverse Wells)

`[FICTIONAL]` rule from brief §7; formulation per 1B (radial reflection of thrust acceleration with a blended boundary). `[ASSUMED; specified, not vector-tested]`

- **Adds**, for a region the player marks around a visible well (centre `c_w`, radius `R_w` from the sensor view), response factors `k_r, k_t` (prior 1 ± 2, wide because truth is −1) applied to thrust inside it:

```
rho_hat = (r - c_w) / |r - c_w|                                  3D, from the well's centre to the ship
a_r     = (a_T . rho_hat) rho_hat ,   a_t = a_T - a_r            thrust along and across the radius
a_T'    = a_T + w(|r - c_w|) [ (k_r - 1) a_r + (k_t - 1) a_t ]
```

  `w` is the boundary blend from 1B (1 well inside, 0 outside). In 3D the well is a point with a sphere of influence, and the reversal is **radial about that point**: the part of the thrust along the line from the centre is scaled by `k_r` (truth −1), everything across it, a plane, by one factor `k_t` (truth +1). There is no second transverse factor because the rule has no preferred direction except the radius. In the plane `a_t` is revision 2's `(a_T . tau_hat) tau_hat`.
- **Fitted** by Tier G from powered arcs inside the region, with gravity taken from the calibrated law so that gravity and thrust are not confounded (§9.3).
- **Validated** on a held-out pass through the same or another well. A correct rule predicts a burn it has never seen.
- **Wrong extension fails:** "the engine changed" (a global `k_E`) cannot fit radial burns (response −1) and burns across the radius, in or out of the orbit plane (response +1), together.
- The per-burn response diagnostic (§9.5) is the evidence that prompts the player.

Whether accelerometers feel the reversed push is undecided (§13 item 3).

---

## 7. Validation and adoption

**Unchanged in form in revision 3.** Evidence, the held-out test, the earned hedge and the validated range use only costs, covariances and scalar distances, and none of them mentions a direction. That is also why radial spans carry over to 3D: the law being tested is a function of distance alone (§3.1), so a test that covered a span of distances tested the law there in every direction, and A11 keeps the tracked distances radial. Two things are shown in 3D:

| `[DEMONSTRATED: inv25-exponent-planes]`, truth inverse-2.5 | Training χ²/ν | Held-out T/ν (threshold) | Verdict |
|---|---|---|---|
| Newtonian; trained on arcs over 0.9–1.9 r₀ in planes inclined 20° and 110° | 16 088 | 553 053 (1.16) | fail |
| + exponent; held out an arc over 0.5–1.0 r₀ in a plane inclined 65° | 1.01 | 0.95 (1.16) | pass, adopted; σ_e = 0.026; validated range 0.50–1.90 r₀ |

The rule passes at distances and in a plane it never trained in (`exponent-passes-heldout-other-plane`), and the range it records is two numbers, the union of what three planes covered (`validated-range-radial`). A later dive in yet another plane uses that range as it stands (§8.3, `carried-rule-other-plane`).

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
    span_j = [smallest, largest] ship-to-body distance over the fixes of its training attempts
             and of the held-out attempt's coasting windows
the rule records {body, span, sigma_e, test} for each
```

(Revision 2 said "the fixes of its training and held-out attempts"; the reference has always taken the held-out side from the Tier L windows, which leave out a dropped tail of fewer than N_keep fixes. The text now says what the vectors do.)

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

The present state comes from recent data, not from Tier G's long arcs. Take the fixes of the most recent `N_a = 2` windows of the current arc `[ASSUMED]` and fit 11 parameters (the reference exercises coasting windows only; if one of them is powered, thrust uses the current engine parameters and the three response factors of §9.5 join the fit `[ASSUMED]`):

- state at the first of those fixes (six numbers, no prior);
- `g0` (1 ± 0.5) and `g1` (0 ± 0.2), a local scale and slope multiplying the **calibrated law**: `g0 + g1 (ln r - u0)`, `u0` = mean ln ρ of those fixes;
- **new in revision 3:** the camera misalignment, three numbers held by a prior at their current values with their current covariance (Tier G's posterior plus aging, or the arrival prior).

Propagate to the last fix `t_now` with the fitted values: `x_now` (six numbers), and `P_now = S P S^T` (6×6) with `S = dx(t_now)/d(parameters)`.

Why the camera joins. The misalignment turns the whole picture (§3.4). With it held fixed, the covariance says the orbit plane is known to the fix noise, 13 m at r₀ in the vector below, while the truth it is compared with sits 7 to 23 m away because the picture is turned by about 20 µrad; the forecast was 2.7σ off across the plane at one checkpoint. With the three numbers in the fit, their prior becomes part of `P_now`, position and velocity turn together through the forecast, and the out-of-plane 1σ is 110 m, the 10⁻⁴ rad prior times the distance. `[DEMONSTRATED: forecast-envelope-3d / picture-orientation-in-envelope; the failure was seen during development]` In the plane the same error exists (20 m) but hides inside a 600 m envelope, which is why revision 2 did not need it. The planar reduction holds the camera fixed here, as revision 2 did; `rotation-invariance` does the same so that it can be compared with the planar vector.

Both local terms matter. In development, a constant scale on the uncalibrated law fitted the data to the noise yet hid a velocity bias of about 0.5 m/s behind the 2 km range noise, and the forecast was 5.9σ off after one hour (see the handoff). With the calibrated law and the slope term the same forecast is within 1σ. `[DEMONSTRATED: forecast-envelope / honest-coast]`

Before the current arc has `N_min` fixes, the present state is the arrival state and covariance from configuration (position and velocity each with a 3×3 covariance). `[ASSUMED]`

### 8.2 Forecast law and uncertainty sources

```
a(r, t) = sum_j a_j(r; adopted law) * g_j(ln |d_j|) * exp(-eta_e,j Le_j - eta_d,j Ld_j)   +   a_T(plan; kE, dE, dP, kR)   [+ adopted region terms]

L_j(r)  = ln(r / r_max,j)  if r > r_max,j ;   ln(r / r_min,j)  if r < r_min,j ;   0 inside the covered range
Le_j(r) = the part of that stretch of ln r, from the nearest covered edge to r, that lies inside validated spans (§7.4), signed like L_j
Ld_j(r) = L_j(r) - Le_j(r)
```

`g_j` is the calibration profile (1 for a body without one). The forecast mean uses `eta = 0`. With no adopted rule, or no span that applies to body j, `Le_j = 0` and all of `L_j` is default. Independent uncertainty sources:

| Source | Variable | Distribution |
|---|---|---|
| present state | `x_now` (six numbers) | covariance `s2 P_now` (6×6; it contains the camera misalignment's share, §8.1) |
| calibration | profile node values `c` | node covariance `C infl` (§5.4) |
| unsampled but validated distances | earned hedge exponent `eta_e,j` per body | 0 ± `sigma_e` (§7.4) |
| unsampled, untested distances | default hedge exponent `eta_d,j` per body | 0 ± `sigma_h0` |
| engine, for planned burns | `kE`, `dE`, `dP` (and `kR` for planned RCS use) | current arc's value and covariance, plus aging since its last measurement (§3.7) |
| bodies without a profile | `mu_j` | Tier G posterior |

The hedge says: outside the distances my data cover, the law may bend away like an exponent change of ±σ. `sigma_h0 = 0.3` `[ASSUMED]`. It applies equally in every direction and to every body, and does not move the mean, so it carries no hidden knowledge of the true law (brief §3). `L_j`, `Le_j` and `Ld_j` are functions of the scalar distance `|d_j|` only, in 3D as in the plane: a path that leaves the sampled plane but stays inside the sampled distances gets no hedge, and one that leaves the sampled distances gets the same hedge wherever it goes. The covered range of a body without a profile is the range of ship–body distances over all retained fixes; before any fix, it is the single distance of the present state.

### 8.3 Envelope

With `S_q(t) = d r_rel(t) / dq` from the variational equations (§4.3) or central differences:

```
P_pos(t) = s2 S_x P_now S_x^T  +  S_c (C infl) S_c^T
         + sum_j ( sigma_e^2 S_eta_e,j S_eta_e,j^T  +  sigma_h0^2 S_eta_d,j S_eta_d,j^T )
         + S_E Sigma_E S_E^T  [+ sigma_mu_j^2 S_mu_j S_mu_j^T]
```

`S_q(t)` has three rows, so every term and `P_pos(t)` are symmetric 3×3 matrices. A sample stores the six distinct numbers in the contracts' `Cov3` order:

```
positionCov = [xx, xy, xz, yy, yz, zz]          (inertial axes, m^2)
```

The envelope at time t is the **ellipsoid** of `P_pos(t)` (draw 2σ; P10): its semi-axes are the square roots of the eigenvalues along the eigenvectors (`covEllipsoid` in the contracts). The two parts of the hedge enter exactly as before, each as a rank-one term `sigma² S S^T` along the direction in which a change of the law's steepness moves the ship, which lies in the plane of the motion; the earned part multiplies `S_eta_e`, the stretch of unsampled distance inside validated spans, and the default part `S_eta_d`, the rest. A planar covariance embeds as `[xx, xy, 0, yy, 0, 0]`. The profile needs one column per node: its full covariance is required. A single "scale the whole profile" mode was 3σ off inside sampled distances. `[DEMONSTRATED during development; see handoff]`

`[DEMONSTRATED: forecast-envelope]` Inverse-2.5 truth, Newtonian law, no extension; data over 0.75–1.3 r₀:

| Plan | Hours ahead | Range (r₀) | Error (km) | Envelope 1σ (km) | Error in σ | Uncalibrated error (km) |
|---|---|---|---|---|---|---|
| coast | 1 / 4 / 8 | 1.09 / 0.95 / 0.80 | 0.26 / 1.1 / 7.9 | 0.62 / 3.2 / 11.8 | 0.88 / 0.68 / 0.71 | 3.6 / 60 / 114 |
| dive | 3 | 0.86 | 0.87 | 2.1 | 0.47 | 30 |
| dive | 4 (below coverage) | 0.66 | 2.2 | 3.9 | 0.79 | 43 |
| dive | 5 (deepest) | 0.42 | 52 | 25 (hedge 24.6) | 2.1 | 69 |
| dive | 6–8 | — | 570–1530 | beyond horizon | — | — |

"Error in σ" is the Mahalanobis distance of truth from the forecast. Without the hedge the 5 h dive point would be 28σ off. `[DEMONSTRATED: forecast-envelope / hedge-needed]`

`[DEMONSTRATED: forecast-envelope-3d]` The same situation in 3D. Earlier attempts over 0.75–1.0 r₀ and 1.0–1.3 r₀ in planes inclined 15° and 80°; the current arc in a third plane, inclined 40°, has sampled only 1.13–1.2 r₀ itself. Engine sigmas as above with the pitch angle at 1 mrad; camera prior 10⁻⁴ rad per component. "Out" and "in" are the 1σ sizes across the orbit plane of the present state and the largest inside it; "error in σ" is now for three numbers (3σ is 3.76).

| Plan | Hours ahead | Range (r₀) | Error (km) | Envelope 1σ (km) | Out / in (km) | Long axis to orbit normal | Error in σ | Uncalibrated error (km) |
|---|---|---|---|---|---|---|---|---|
| coast | 1 / 4 / 8 | 1.09 / 0.95 / 0.80 | 0.12 / 1.0 / 6.0 | 0.60 / 3.2 / 11.5 | 0.11 / 0.60, 0.10 / 3.2, 0.08 / 11.5 | 90° | 0.71 / 0.89 / 1.36 | 4 / 61 / 116 |
| dive | 4 (below coverage) | 0.66 | 0.74 | 3.8 (hedge 0.3) | 0.18 / 3.8 | 90° | 0.98 | 45 |
| dive | 5 (deepest) | 0.42 | 50 | 26 (hedge 25.7) | 0.09 / 26 | 90° | 2.2 | 70 |
| dive | 6–8 | — | 575–1535 | beyond horizon | — | — | — | — |
| plane change, aged engine | 1 / 2 / 4 / 8 | 1.09 / 1.06 / 0.98 / 0.89 | 0.12 / 0.38 / 1.1 / 4.9 | 1.16 / 2.2 / 3.9 / 15.4 | 1.16 / 0.64, 2.2 / 1.3, 3.6 / 3.5, 3.1 / 15.1 | 0.3° / 1.3° / 42° / 78° | 0.39 / 0.39 / 0.49 / 1.32 | 4 / 16 / 63 / 167 |

Read down: the coast runs through distances its own arc never sampled, on a profile measured in two other planes, with no hedge and truth inside 1.7σ at all eight checkpoints (`profile-from-other-planes`); the calibrated forecast is 82× closer than the bare law at 6 h (`calibration-pays`). The dive behaves as in the plane: the hedge is the largest term at the deepest checkpoint, without it that point would be 29σ off, and the forecast ends there (`hedge-widens-outside`, `hedge-needed`, `horizon-ends-dive`). The ellipsoid's shape is new information. Coasting, it is a flat disc in the orbit plane, five times thinner across it, where only the unknown orientation of the picture acts (`coasting-envelope-is-flat`). The third plan burns 120 s along the orbit normal with an engine whose calibration has aged as in §3.7 (scale ±1.8%, each angle ±3.6 mrad): for the first two hours the envelope is longest out of the plane, within 2° of the orbit normal, and the engine is its largest source (`out-of-plane-largest`); as the in-plane terms grow, the long axis turns back into the plane.

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

`[DEMONSTRATED: carried-rule-other-plane]` The same encounter in 3D, with a dive that also changes plane. The 24 h of tracking lie in one plane, inclined 30°. The burn (120 s, 32 m/s: 13.8 m/s retrograde combined with a 25° plane change) puts the dive in a plane 24° from it, where neither this encounter nor the rule's own test ever took a fix. Spans are distances, so they apply:

| Hours ahead | Range (r₀) | Where | Carried rule (spec): error, envelope, earned / default hedge (km) | No rule carried: error, envelope (km) | Earned hedge everywhere (superseded): envelope (km) |
|---|---|---|---|---|---|
| 1.5 | 1.05 | sampled | 0.3, 0.5, 0 / 0 | 0.3, 0.5 | 0.5 |
| 5.0 | 0.82 | validated, not sampled, another plane | 1.3, 2.7, 0.5 / 0 | 13.9, 7.9 | 2.7 |
| 6.5 | 0.62 | validated, not sampled, another plane | 1.3, 6.6, 3.0 / 0 | 71, 37 | 6.6 |
| 7.5 | 0.45 | below the validated span | 1.1, 15.0, 9.9 / 4.2 | ended after the 7 h point (0.63 r₀) | 14.7 |
| 8.0 | 0.38 | below | 1.9, 33, 18.1 / 24.2 (last inside horizon) | — | 24.5 |
| 8.5 | 0.33 | below | envelope 100 (default hedge 94): horizon passed | — | 42 |

The picture is the planar one: ten checkpoints lie outside the sampled distances and inside the span, all in the new plane; there the default hedge contributes nothing and the envelope equals the earned-everywhere one (`earned-inside-validated`); the hedge is 12× smaller and the error 54× smaller than with no rule at 6.5 h (`carried-rule-helps`); below 0.6 r₀ the default hedge takes over and ends the forecast (`default-hedge-ends-it`, `not-easy`). Truth stays within 1.5σ.

### 8.4 Horizon

```
the forecast ends at the first sample where  sigma_major(t) > f_h * (distance to the nearest body),   f_h = 0.1  [ASSUMED]
```

Past that point the linearization is unreliable and the envelope is too wide to act on. The dotted line stops; the model does not guess. In the dive it ends after the 5 h point. `[DEMONSTRATED: forecast-envelope / horizon-ends-dive]`

**In 3D the rule is the same sentence.** `sigma_major(t)` is the longest semi-axis of the 1σ ellipsoid, the square root of the largest eigenvalue of the 3×3 `P_pos(t)`, and the distance is the 3D distance from the forecast mean to the nearest modeled body's centre. For a planar covariance embedded in 3D the largest eigenvalue is the planar ellipse's, so the rule ends a planar forecast at exactly the planar sample. `[DEMONSTRATED: bridge_planar.py (the planar forecast in planar reduction ends at the planar checkpoints); rotation-invariance / forecast-flat-equals-planar; forecast-envelope-3d / horizon-ends-dive]` The longest axis is used whatever its direction: an envelope that is too wide across the orbit plane ends the forecast just as one that is too wide along the track does.

### 8.5 Sigma-point option

`[ASSUMED; not in the reference]` If close passes need forecasts beyond the linear horizon, replace §8.3 by propagating 2q + 1 sigma points (each uncertain variable at ±√q σ) and using their 3×3 sample covariance. It is deterministic and costs about the same as the sensitivity columns. Keep the horizon rule.

### 8.6 Issued forecasts

An issued forecast stores everything it used and produced: model version, reference law values, profile nodes and covariance, `x_now`, `P_now`, `s2`, both hedge sigmas and the validated spans they were applied with, the engine values and their aged covariance, the camera misalignment values and covariance used in the present state, the plan with the attitude each burn was resolved to (§3.3), and the sampled means and 3×3 covariances up to the horizon. It is never recomputed (brief §3, P10). A new forecast is a new record.

### 8.7 Object tracks and closest approaches

`[ASSUMED; specified, not in the reference]` The contracts' forecast carries predicted tracks of other objects and closest approaches. In 3D:

- **Track.** A tracked body or asteroid has its own present state (six numbers and a 6×6 covariance, from its own fixes in the same Tier L windows, or from Tier G when it is a modeled body). It is propagated under the same forecast law as the ship, as a test particle if it is an asteroid, and sampled at the ship's sample times with a 3×3 `positionCov`. An object never fixed is absent (P6).
- **Relative position.** `d(t) = r_object(t) - r_ship(t)`. Its covariance is not the sum of the two envelopes: both paths respond to the same law, so the shared sources (profile nodes, the two hedge exponents, `mu`) partly cancel. Propagate the sensitivities of `d` itself: `P_d = S_d,ship (s2 P_now) S_d,ship^T + S_d,obj P_obj S_d,obj^T + sum over shared sources of S_d Sigma S_d^T + engine terms`, with `S_d = S_object - S_ship` for each shared source.
- **Closest approach.** Along the samples inside the horizon, find the minimum of `|d(t)|` (refine between samples with a parabola through the three samples around the minimum). Report the time, the clearance `|d| - R_object - (hull reach)` and its sigma `sqrt(d_hat^T P_d d_hat)` with `d_hat = d / |d|`: the uncertainty of the miss distance along the line between the two centres, which is the only direction that matters for a hit. In the plane this is revision 2's implicit 2D geometry with the same formula.
- A closest approach that falls past the horizon is not reported. This is A6's rule: until the model has evidence at the flyby's distances, the forecast ends before closest approach.

---

## 9. Player-facing diagnostics

All are computed by 2C; layout belongs to 2D.

### 9.1 Residual time series

Whitened residuals against time, **split into coasting and powered** by whether thrust (main engine or RCS) was commanded at the measurement time, and by direction. A fix has three residuals in three perpendicular directions:

```
range    along the line of sight                                     (rho_measured - rho) / sigma_rho
along    across the line of sight, in the direction it is moving     the bearing 2-vector r_b (2.1) projected on a
normal   across the line of sight and across its motion              and on n = p x a, each divided by sigma_b
         a = unit( d' - (d' . p) p ),  d' = v_body - v_ship           (d' is the rate of change of d)
```

For a ship circling a body, `along` is in the orbit plane along the track, `normal` is out of the orbit plane, and `range` is the in-plane direction across the track. With unequal component sigmas, divide each projection by the sigma in its own direction, `sqrt((sigma_E a.e_E)² + (sigma_N a.e_N)²)`. Accelerometer residuals are a fourth class. In the planar reduction a fix has no elevation row and its one bearing row is `along`, revision 2's "bearing". The vectors' `residualSummary` keys are `coast.along`, `coast.normal`, `coast.range`, `powered.along`, `powered.normal`, `powered.range`, `powered.accel`. Per-class RMS should be ≈ 1.

The split by direction carries information the planar game did not have: a body missing off the orbit plane leaves `normal` residuals (RMS 41, with a mean of 34: the ship is pulled steadily out of its plane) beside `along` ones (RMS 104), and hardly touches `range` (2.8). `[DEMONSTRATED: offplane-body-signature / out-of-plane-residuals]` Coasting RMS ≫ 1 means the gravity model is wrong; coasting ≈ 1 with powered ≫ 1 means the propulsion model is wrong (brief §5). Use Tier G residuals when its fit is fair; when χ²/ν is huge the series is still shown but §9.2 carries the information.

### 9.2 Local GM against distance and direction

Plot each coasting window's local GM (`mu_ref g ± mu_ref sigma_g`) at its `r_geo` with a bar from `r_min` to `r_max`; draw the adopted law through it (a flat line for Newtonian). Report the weighted slope `d ln GM / d ln r` and the profile inflation `infl`. Where there are no windows there are no points: missing data are shown as missing.

Offer the same points against direction. In 3D a window has two directions (§5.1): `direction`, where the ship was as seen from the body (a point on a sphere around the body), and `planeNormal`, the plane it was moving in. Show each window's departure from the profile, `(g - g_profile(r_geo)) / sigma_g`, at its `direction` on that sphere `[ASSUMED; the reference records both vectors per window and does not plot]`. A wrong distance law leaves the sphere blank: the departures are noise whatever the direction or plane (§5.4). A missing body paints its tide on it: pulls stronger than the profile toward and away from the body, weaker in the belt between, following (3 cos²γ − 1). The player reads the body's axis off the sphere, up to the side ambiguity of §6.3.

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

**In 3D** the pairs are (gravity parameter) × (`kE`, `dE`, `dP`, `kR`), and one more number is reported: the **multiple correlation of the engine scale with the two misalignment angles**,

```
R(kE | dE, dP) = sqrt( c^T S^-1 c / P_kE,kE ),   c = cov(kE, [dE, dP]),  S = cov([dE, dP])
```

It is needed because roll only mixes the two angles: a confound between the scale and "the tilt across the thrust" can sit on `dE`, on `dP` or on both, and no single pair correlation finds it. `[DEMONSTRATED: thrust-3d-confounded]` The same hover, now with the thrust tilted 20° toward the orbit normal so that it turns the orbit plane by 9° in two hours:

| Data | ρ(mu.A, kE) | R(kE \| dE, dP) | σ(mu.A) / prior | σ(kE) / prior | σ(dE), σ(dP) / prior |
|---|---|---|---|---|---|
| burn only, no accelerometer record | **0.985** | **0.998** | 0.43 | 0.43 | 0.68, 0.48 |
| + 2 h of coasting fixes | 0.66 | 0.90 | 0.034 | 0.039 | 0.098, 0.100 |
| + three-axis accelerometer records | 0.27 | 0.60 | 0.076 | 0.022 | 0.060, 0.071 |

Out of the plane gravity does not push, so the out-of-plane part of the thrust does measure the engine, but only as `kE (sin α + δ cos α)`, δ the unknown tilt across the thrust: the scale is known exactly as well as that tilt is. Burn-only data in 3D are therefore confounded three ways, among gravity, engine scale and misalignment (`burn-only-confounded`, `burn-only-three-way`). Coasting data break the first link (the scale stays tied to the angles, R = 0.90, but all three are now learned), and accelerometer records, which measure the thrust direction in the body frame, break both (`burn-plus-coast-breaks-confound`, `burn-plus-accel-breaks-confound`, `accelerometer-pins-both-angles`).

A second 3D case, a 20 minute burn along the orbit normal between two 2 h coasts (a 13° plane change): tracking alone recovers the scale to 0.02% but leaves one tilt direction poorly known, σ = 1.3 and 2.1 mrad with ρ(dE, dP) = 0.95, because two-hour arcs determine the velocity along the radius only to about 0.02 m/s; accelerometer records bring both angles to 0.4 mrad (`tracking-alone-weak-on-angles`, `accelerometer-pins-plane-change`). The indicator should report the angle pair's correlation and both posterior/prior ratios, and say "record the accelerometer, or coast longer".

### 9.4 Empirical radial, tangential and orbit-normal acceleration

The §6.4 fit, shown per window as `aR ± sigma`, `aT ± sigma` and `aN ± sigma`. A central-force error of any kind leaves no tangential and no orbit-normal term once distance is calibrated; an unmodeled mass does.

- Wrong distance law: largest tangential term 2.0σ. `[DEMONSTRATED: inv25-exponent-coverage / wrong-law-leaves-no-tangential]`
- Missing body: a tangential term at 14.9σ and 0.5% of g(r₀); every term above 3σ has the sign of the true tidal field. `[DEMONSTRATED: missing-body-signature / missing-body-tangential, tangential-tracks-tidal]`
- In 3D, wrong distance law, windows in three planes: largest tangential term 3.2σ, largest orbit-normal term 1.7σ (threshold 4σ; 22 windows). `[DEMONSTRATED: inv25-exponent-planes / wrong-law-leaves-nothing-non-central]`
- In 3D, missing body 35° off the orbit plane: an orbit-normal term at 58σ and 0.58% of g(r₀), a tangential term at 9.3σ and 0.42%. Six orbit-normal and four tangential terms exceed 3σ and every one has the sign of the body's true tidal acceleration in that direction; the orbit-normal terms match it to a few percent (5.8e-5 against 5.7e-5 m/s², −2.2e-5 against −2.2e-5). `[DEMONSTRATED: offplane-body-signature / missing-body-normal, missing-body-tangential, normal-tracks-tidal, tangential-tracks-tidal]` The orbit-normal term is the cleanest of the three: gravity toward the primary has no component there, so nothing else competes with it. Its sign changes round the orbit (toward the body's side of the plane while the ship is on the body's side of the primary, away from it on the far side), and that pattern gives the side of the plane the body is on.

### 9.5 Per-burn response

`[ASSUMED; not in the reference]` For each powered window, with gravity frozen at the calibrated law, fit the window state (six numbers) and three factors: achieved over commanded acceleration along the commanded thrust direction (body +x turned by the recorded attitude) and across it toward body +y and toward body +z:

```
a_T = u C(q) [ f_x, f_y, f_z ]          nominal: f_x = kE cos dP cos dE,  f_y = kE cos dP sin dE,  f_z = kE sin dP
```

so for small angles the response reads (k_E, k_E dE, k_E dP): the second factor is the yaw misalignment, the third the pitch misalignment, the new one. This is ordinary maneuver verification from tracking `[ESTABLISHED: DD03]`. Inside an Inverse Well a burn along the radius from the well's centre reads about −1 in f_x and a burn across it about +1 (§6.5); because the well's rule is radial and not tied to the body axes, show the response also resolved along and across that radius when a well is in view. A powered window shorter than about two hours on each side determines the across factors poorly (§9.3); show their sigmas.

### 9.6 Reading the evidence

| Cause | Coasting residuals | Powered residuals | Local GM vs distance | Profile `infl` | Empirical tangential and orbit-normal | What fixes it |
|---|---|---|---|---|---|---|
| Wrong mass estimate | large until refit | — | flat, offset from the prior | ≈ 1 | none | nothing to do: Tier G refits `mu` (GM within 0.014% of truth, σ = 0.04%, from a prior 2% off `[DEMONSTRATED: newton-recovers-gm / gm-recovered]`) |
| Wrong distance law | large, in the orbit plane (`along`, `range`) | large | slope ≠ 0, same from every direction and in every plane | ≈ 1 | none | exponent extension |
| Overlooked body | large; `normal` too if the body is off the orbit plane | large | scatter at the same distance, patterned on the sphere | ≫ 1 (less as the body leaves the plane) | significant, tidal pattern; the orbit-normal term gives the side | body extension |
| Engine mis-calibration | ≈ 1 | large | clean | ≈ 1 | none | Tier G refits `kE`, `dE`, `dP`; needs coast data or accelerometer records |
| Unmodelled jets (RCS left out) | ≈ 1 before, large after | modest (χ²/ν 1.6) | — | — | — | model them (§3.3); otherwise gravity and the angles absorb them and go wrong |
| Region thrust response | ≈ 1 | large only inside the region | clean | ≈ 1 | none | region extension; §9.5 shows it |
| Sensor worse than it reports | uniformly > 1 | uniformly > 1 | noisy, no trend | ≈ 1 | none | `s2` widens the envelope; repair or re-power |

### 9.7 Calibration freshness

`[ASSUMED]` For each ship parameter show the value in use, its σ, and how that σ divides between "as last measured" and "aged since" (§3.7), with the drivers in plain units: time since last measured, Δv burned since, condition lost since. A calibration that is mostly aged is an invitation to re-measure (a coast, a short burn, a coast). For each adopted rule show its validated spans against the distances the plan visits (§7.4). The 3D parameters join the list: the pitch misalignment, the RCS scale and the three camera components; for the camera also say which direction the data have never constrained (the turn axis of §2.1), since re-pointing the ship about a different axis is what measures it.

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
| **Recording accelerometers** | §2.2 | pins `kE` to the accelerometer scale prior, and both misalignment angles whatever the roll |
| **Which plane to fly** (3D) | the profile and the spans are distances (§5.4, §7.4) | a new plane at distances already flown adds nothing to the calibration and costs no envelope; what it adds is a second look at direction: a body off the old plane shows in the orbit-normal term (§9.4) |
| **Burning out of the plane** (3D) | engine uncertainty acts along the thrust (§8.3) | a plane change with a stale engine calibration is forecast with an envelope that is longest out of the plane; re-calibrating first shrinks it |
| **Turning the ship** (3D) | the camera misalignment is fixed in the body (§2.1) | a re-pointing between fixes makes two of its three components measurable; holding one attitude forever leaves the picture's orientation at the prior |
| **Hands-on flying and RCS** (3D) | every firing is a thrust segment and closes the Tier L window (§3.3, §5.1) | trims are forecast honestly once `kR` is known, but constant jetting leaves no coasting window to calibrate gravity with; coasting is how the model learns |
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

Revision 3 changes nothing in this structure. The parameter list gains the 3D names (§3.6). A validated span is still `{body, rMin, rMax, sigma_e, test}`: no direction or plane is stored, because none applies (§7). The data manifest must cover the attitude records as well as the fixes, since the camera term and every thrust segment use them.

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
| Ship calibration (engine scale, both misalignment angles, RCS scale, accelerometer scale, camera misalignment) | value of the arc that carried the ship onward becomes the prior | σ aged by ship time, use and damage since (§3.7); must be re-earned |
| Old records | stay as evidence and as held-out attempts for new rules | they are about other bodies; they calibrate nothing here |
| **Not carried:** body GMs and calibration profiles | — | each belongs to its body; a new body starts from its arrival prior and no profile |

A new encounter therefore starts with the right law (if one was adopted), an aged ship, an unmeasured body and an empty profile: the forecast is usable at once inside the rule's validated span, wide elsewhere, and improves only with fresh tracking.

---

## 12. Notes for the implementation (2C; the 3D conversion, 2G)

Suggested shape (the contracts in `src/contracts/` are the integrator's and win over this):

```
model/propagate    believed dynamics + variational equations in 3D (no import from src/sim, P11)
model/solve        LM with priors (4.4), covariance and outputs (4.6)
model/tierG        arcs, initialization (4.5), extensions (6), held-out test (7.2)
model/tierL        windows (5.1), local fits (5.2), noise scale (5.3), profile (5.4)
model/forecast     present state (8.1), law and sources (8.2), envelope (8.3), horizon (8.4)
model/diagnostics  9.1 - 9.5
```

Order of work that matches the vectors: `newton-recovers-gm` (solver) → `inv25-newton-two-distances` → `burn-only-confounded` (thrust, accelerometer, correlation) → `inv25-exponent-coverage` (extension, Tier L, profile, empirical) → `missing-body-signature` (moving bodies) → `extension-validation` → `forecast-envelope`.

Revision 2 adds two vectors after those: `parameter-aging` (case 1 is arithmetic; case 3 needs summed parameters in Tier G) and `carried-rule-forecast` (the two-part hedge; build it with the forecast). A forecast built to revision 1 is the special case of no validated span and no aging.

**Revision 3 (3D).** Convert in this order; each step has a vector that isolates it:

1. Run the nine planar vectors through the 3D code in planar reduction (Appendix A.3). Nothing new is tested, but it proves the lift changed nothing. The 3D reference does this in `bridge_planar.py`.
2. `rotation-invariance`: the bearing residual in the tangent plane, the six-state, the vector sweep, the 3×3 envelope. Compare your rotated results with your own flat results turned by the stated rotation, and your flat results with the planar vector. The pole case fails if angles are differenced directly.
3. `inclined-newton-recovers-gm`, then `inv25-two-planes`: Tier G in 3D with the three-component camera misalignment.
4. `thrust-3d-confounded`: quaternion attitudes, both misalignment angles, the three-axis accelerometer, RCS segments, the attitude at each fix.
5. `inv25-exponent-planes`: Tier L and the profile across planes, the three-component empirical fit, the held-out test.
6. `offplane-body-signature`: a moving body with a six-state; the unseen-mode fit is optional and must be run without arc growing.
7. `forecast-envelope-3d`, then `carried-rule-other-plane`: the present state with the camera term, the ellipsoid, the horizon.

Conventions an implementer needs that are easy to get wrong:

- Order everywhere: x, y, z, vx, vy, vz. A 3×3 covariance is `[xx, xy, xz, yy, yz, zz]`: yy is the fourth number.
- Quaternions are `[w, x, y, z]`, body to inertial. The thrust direction in space is `C(q) t_b`, not `C(q)^T t_b`.
- `engine.dP` is positive toward body +z, which is a rotation about body **−y**.
- The bearing residual is measured minus predicted, in the east/north basis of the **measured** direction; its east row is whitened by `sigma_az cos(el)`, not by `sigma_az`.
- `camera.bias.*` is in the body frame and turns the reported direction by `Rot(C(q_fix) b)`, the exact rotation, positive in the right-handed sense (in the plane it adds to the bearing).
- The empirical tangential direction follows the motion (`n x r`), so it flips with the sense of the orbit; the planar vectors are all counter-clockwise.
- m, p_eff and ν count scalar rows: three per fix with range in 3D, two in the planar reduction.

The references are small enough to read alongside this document. Planar: `tools/estimator-ref/estref/core.py` (dynamics, measurements), `fit.py` (Tier G), `local.py` (Tier L, forecast), `aging.py` (§3.7). 3D: `tools/estimator-ref/estref3/core.py` (dynamics, the tangent-plane residual), `fit.py` (the 3D residuals under the planar solver), `local.py` (vector sweep, present state, forecast), `quat.py`, `bridge.py` (planar reduction).

---

## 13. Limits and open questions

1. **Settled (A4).** The owner approved the per-distance calibration with rules left to the player; §7.6's middle option (the model suggests, the player decides) is held in reserve. The hedge σ_h = 0.3 and horizon fraction 0.1 remain play values to tune.
2. **Settled (P8).** The encounter world resets with the ship. Sharing body states across the arcs of an encounter is now permitted (§3.5) but not built.
3. **Owner / 3B / 1B.** Do accelerometers feel the Inverse Well's reversed push? If yes, accelerometer against command shows the reversal at once. If no (recommended: the well acts on motion, like gravity), only tracking shows it, and discovery needs a comparison.
4. **Scale and sensors.** The scale is 1B's (merged; the reference propagator reproduces `tests/vectors/physics.json`). Sensor noise stays at 1G's values; the owner left 1C's values for balancing. Either can be changed in `assumptions.json` and regenerated.
5. **Specified but not vector-tested:** the unseen-body search (§6.3; its local identifiability is now tested, its global search is not), region thrust response (§6.5), powered-window fits and per-burn response (§5.2, §9.5), asteroid probes (§10), object tracks and closest approaches (§8.7), outlier flags (§2.5), sigma points (§8.5), pointing terms and unequal attitude sigmas (§2.1, §2.3), a segment split by a turn under thrust and jet imbalance in turns (§3.3), the aging of the new 3D parameters in a fit (§3.7).
6. **Gross misfit.** Tier G on a badly wrong structure may stop unconverged (§4.4). By design nothing downstream depends on it, but its χ²/ν is then only a lower bound on how bad the fit is.
7. **Two comparable bodies.** The profile is one curve per body against distance. Where two bodies pull comparably it is not well defined. `[ASSUMED]` Exclude from the profile any window in which a second body's believed pull exceeds 20% of the reference body's.
8. **Range scale.** Horizon-based range depends on the believed body radius. A wrong radius scales every range and correlates with GM (GM ∝ scale³ for a Newtonian fit). An optional per-body range-scale parameter with a prior would expose it; not included.
9. **Linearization.** Envelopes are linear up to the horizon; the 5 h dive point sits at 2.1σ partly from nonlinearity.
10. **Settled (A11).** The model is three-dimensional in revision 3; the window rule's swept angle is a vector (§5.1). The planar game is the planar reduction (§1).
11. **Extended bodies.** The law is a point-source law; 1B notes the shell theorem does not hold for n ≠ 2. Close to a large body the model's point-mass structure is itself wrong, and would show as a distance trend.
12. **Owner / integrator (A5).** Which bodies a validated span applies to. This revision reads it as "every body, for a rule shared by all bodies" (§7.4), because the same-body reading leaves the earned hedge with no effect anywhere. If the owner wants a carried rule to give no tighter envelope around a new body at all, set `validatedRange.transfer` to `same-body`; the default hedge then applies everywhere outside sampled distances, in every encounter.
13. **Aging rates** (§3.7) are play values with physical reasons, not measured ones. They set how often the player must re-calibrate; the 3E harness run with carried knowledge and no new measurements is the place to tune them.
14. **Few windows.** The profile's inflation factor is a ratio estimated from the windows themselves; with fewer than about six it is noisy (2.7 from four windows in a development run). It errs wide, not narrow.
15. **A body on the orbit normal.** `infl` and the tangential term both fade as an overlooked body leaves the ship's orbit plane (§5.4); straight above the plane its radial tide looks like a small change of the distance law and only the orbit-normal term, second order there, betrays it. A second orbit plane resolves it. Not vector-tested beyond 35° off the plane.
16. **Unseen bodies.** Locally identifiable, with mass and distance nearly degenerate; the global search is not solved and a plain fit from a poor start does not converge (§6.3).
17. **Short arcs around a burn.** Two hours of coasting on each side leave one misalignment direction at 1–2 mrad; unmodelled pitch error then biases the other angle with no sign in the residuals (§3.3, §9.3). Accelerometer records are the remedy.
18. **What the camera can never tell.** The misalignment component along the axis the ship has turned about stays at its prior, and with it one rotation of the whole picture (§2.1, §3.4). The forecast carries it as 10⁻⁴ rad × distance.
19. **The default hedge under a badly wrong law.** With nothing carried and a Newtonian law in the inverse-2.5 world, the contrast forecast in `carried-rule-forecast` is 4.7σ from truth at its last checkpoint inside the horizon (5.0σ in `carried-rule-other-plane`). No claim covers it, because it is a contrast, but it is the forecast a player has before learning the law. The linear envelope with σ_h = 0.3 does not span an exponent error of 0.5 at 40% below the sampled distances; a shorter horizon fraction or a larger σ_h would. Both are play values (item 1).

---

## Appendix A. Vector files

Two sets. The planar set is revision 2's and has not changed by a byte; the 3D set is new in revision 3. An implementation is tested against both: the planar set through the planar reduction (A.3), the 3D set directly.

### A.1 The planar set

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

### A.2 The 3D set

`tests/vectors/estimator-3d/index.json` lists the vectors (schema `recursion.estimator-vector-3d/1`). The layout is A.1's with these differences:

```
attempts[].commands:      [{ t0, t1, u, q: [w, x, y, z], rcs?: [ax, ay, az] }]
attempts[].measurements:  [{ t, kind, target?, z, sigma, q?: [w, x, y, z] }]
```

- **Commands.** `u` is the commanded main-engine acceleration along body +x (m/s²); `q` the recorded attitude over the segment, body to inertial; `rcs` the commanded RCS translation acceleration in the body frame (absent = none). A hands-on throttle step is a segment like any other.
- **Measurements.** `kind: "opnav"` has `z = [azimuth, elevation]` or `[azimuth, elevation, range]` and `sigma` of the same length, with `sigma[0] = sigma_b / cos(elevation)` as reported by the sensor (§2.1). `kind: "accel"` has `z = [fx, fy, fz]` in the body frame. `q` on a fix is the recorded attitude at the fix; absent means the identity. It matters only when the camera misalignment is not held at zero.
- **Model blocks.** `ship` and each body's `state` are six refs in the order x, y, z, vx, vy, vz. `engine` is `{kE, dE, dP}`; `rcsScale`, `accelScale`; `cameraBias` is three refs `[x, y, z]` (body frame). `empirical.params` are `{att}.emp{k}.R`, `.T`, `.N`.
- **Truth.** `checkpoints[].shipRelA` has three numbers and `shipState` six; `truth.plane(s)` gives each orbit plane as inclination, node and unit normal. `integrationCheck_m` is, as in A.1, the largest position difference between the 60 s reference step and a 15 s step.
- **Residual summary.** Keys `coast.along`, `coast.normal`, `coast.range`, `powered.*`, `powered.accel` (§9.1).
- **Tier L windows** add `direction` and `planeNormal`, unit vectors (§5.1).
- **Forecast points.** `mean` has three numbers; `covTotal` is `[xx, xy, xz, yy, yz, zz]`; `sigmaMajor` per source as before, with `hedgeEarned` and `hedgeDefault`; `majorAxis`, `sigmaOutOfPlane`, `sigmaInPlaneMajor` and `majorAxisToNormalDeg` are measured against `forecastInputs.orbitNormalNow`. `anchor.state` has six numbers and `anchor.covariance` is 6×6. `forecastInputs.cameraSigma` is the prior the present-state fit puts on the camera misalignment (§8.1); `null` holds it fixed.
- **Plans.** Each planned burn is a command with its resolved `q`; `attitudeResolution` records `qBefore`, the target `direction` and the resulting `q` under the roll-held rule (§3.3). `engineSigma` is `{kE, dE, dP}` and may differ between plans.
- **Fit extras.** `dataSubset` says which measurements a fit uses when not all; `solver.arcGrowing: false` asks for the whole arc at once (the unseen-body fit); `attemptsFrom` names another case in the same file whose attempts a case reuses.
- **Rotation.** In `rotation-invariance` each case has `rotation: {quaternion, matrix}`, the rotation that took the flat scenario to it, and the flat cases carry `planarReference`, the planar file and values they are compared with.
- Each file records two hashes, `assumptionsHash` (of `assumptions.json`, the same value as in the planar files) and `assumptions3dHash` (of `assumptions-3d.json`).

| Vector | Shows | Claims |
|---|---|---|
| `inclined-newton-recovers-gm` | Newtonian truth and model on an orbit inclined 50°: GM and the full six-state recovered; orbit normal; camera misalignment held by its prior; unneeded extension not adopted | 9 |
| `inv25-two-planes` | Inverse-2.5 truth, Newtonian model, circular arcs at two distances in planes 78° apart: GM ratio √(r₂/r₁); one GM cannot fit both | 7 |
| `inv25-exponent-planes` | Exponent recovered from arcs in three planes, tighter with coverage; Tier L across planes (slope −0.5, inflation 1.0, vector sweep); nothing non-central remains; held-out test and validated range across planes | 17 |
| `offplane-body-signature` | Missing body 35° off the ship's orbit plane: tangential and orbit-normal signature following its tide, out-of-plane residuals, inflation; seen mode recovers its GM and position with z; unseen mode locally identifiable, mass and distance degenerate | 13 |
| `thrust-3d-confounded` | Tilted hover: gravity, engine scale and misalignment confounded three ways; coast data and three-axis accelerometer records break it. Out-of-plane burn: both angles, the one-angle model's bias, camera observable after a turn. Hands-on throttle steps and RCS as segments; RCS cannot be left out | 21 |
| `forecast-envelope-3d` | Ellipsoid envelope: confident where sampled (on a profile from other planes), hedge and horizon on a dive, longest out of plane after a plane change with an aged engine; the picture's orientation in the envelope | 15 |
| `carried-rule-other-plane` | A carried rule's span applied to a dive in a plane never sampled: earned hedge inside it, default beyond | 10 |
| `rotation-invariance` | Two planar scenarios lifted, turned bodily (also onto the pole) and fitted in 3D: rotated = flat turned; flat = planar in the plane. Tier G, Tier L, present state, forecast | 12 |

All 104 claims hold, and all eight files regenerate identically, in about 2.5 minutes on the owner's machine (4.5 while it is busy with other jobs). `[DEMONSTRATED: python tools/estimator-ref/generate.py --3d --check]`

Tolerances are as in the planar set, plus for a forecast point `covTotal` entries within 5% of `sigmaMajor.total²`. For `rotation-invariance` an implementation should also show the two equalities with its own numbers: rotated against its own flat results turned by `rotation` (estimates within 10⁻³ σ, sigmas within 10⁻³, χ² within 10⁻⁶; the reference achieves 3×10⁻⁷, 10⁻⁷ and 2×10⁻¹⁰) and flat against the planar file in the plane (10⁻³ σ, 10⁻³, in-plane χ² within 10⁻⁴; the reference achieves 7×10⁻⁵, 10⁻⁵ and 8×10⁻⁹).

### A.3 Planar reduction: running the planar set through a 3D estimator

Lift each planar case and hold the third dimension out:

| Planar | 3D input |
|---|---|
| state refs `[x, y, vx, vy]` (ship or body) | `[x, y, 0, vx, vy, 0]`: z and vz are the fixed number 0, not parameters |
| command `theta` | `q = (cos(theta/2), 0, 0, sin(theta/2))` |
| `opnav` `z = [b]` or `[b, rho]` | azimuth b, elevation 0; **no elevation row** (the reference marks an unused component with `sigma: null`) |
| `accel` `z = [fx, fy]` | `[fx, fy, 0]`; **no f_z row** |
| `engine: {kE, dE}` | `dP = 0` fixed, `kR = 1` fixed |
| `cameraBias: ref` | `[0, 0, ref]`: `camera.bias` is the z component |
| `empirical` R, T | N fixed at 0 |
| fixes carry no attitude | identity |

Everything else (priors, initial values, the solver, arc growing, windows, profile, forecast inputs) is taken as written. Then every expected value of the planar file applies unchanged: estimates, sigmas, correlations, χ², m, p_eff, ν, the windows and profile, and the forecast, whose 3×3 covariance is the planar one embedded as `[xx, xy, 0, yy, 0, 0]`. A planar forecast is also the case `cameraSigma = null` of §8.1.

`[DEMONSTRATED: python tools/estimator-ref/bridge_planar.py]` The 3D reference run this way reproduces all 19 fits marked `compare: numeric` in the nine planar files: worst differences 1×10⁻⁵ σ in an estimate, 1×10⁻⁶ in a sigma, 9×10⁻⁸ in a correlation and 8×10⁻⁹ in χ². The same script runs the planar vector `forecast-envelope` through the 3D Tier L, present-state fit and forecast in this reduction: the 15 windows are the planar ones with local scales within 8×10⁻⁷ σ, the profile nodes within 2×10⁻⁷ σ, the noise scale equal to 10⁻¹², the present state within 2×10⁻⁷ σ, every forecast mean inside the horizon within 1.3×10⁻⁷ of its major sigma and every covariance term within 1.1×10⁻⁷; the out-of-plane components of the state, its covariance and every forecast covariance are exactly zero, and the horizon ends at the same checkpoints. (Fits marked `qualitative` and held-out tests are not re-run by the script.)
