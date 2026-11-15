# S1 — Borrowed Spin: a finite reservoir, a physical catch

Study for owner/integrator review, 2026-11-14 Pacific, based on `baf65e0`. No decision or application code is changed. [Integration and play](integration.md) specifies the implementation request; [sources](sources.md) gives manufacturer and NASA references. Source IDs prefixed `S1-` are defined there. All dimensions, ratings and initial conditions proposed here are **[ASSUMED]**, including values that the reference demonstrates arithmetically.

## Recommendation

**[DEMONSTRATED: `python tools/studies/s1/reference.py`]** A finite rotating structure can change this ship's velocity by **76.35 m/s** relative to its untethered coast, with a **143.97 kN** peak line load, and visibly lose spin energy in return. In the example, **43.52 m/s** of that change points along a preselected departure direction; the increase in inertial speed is only **8.82 m/s**. These are different quantities. Delaying release changes the useful component to **−23.50 m/s**, despite another successful capture. The mechanism is large enough to merit an optional encounter.

**[ASSUMED]** Proceed with two freely reacting 3D rigid bodies, a massless compliant line, a real finite structural limit, and a deliberately bounded first contact model. The recommended first build supports a straight span and explicitly authored guide paths. The ambitious version adds finite-mass cable and swept contact. A tether is substantial new mechanics, hardware and sensing work, not a small gravity-field extension. S2 must establish a mount, catcher and energy absorber; S3 must establish an actual arrival/departure corridor. No playable route, human tolerance, qualified structure or automatic fuel saving is demonstrated here.

## 1. Bodies, frames and proposed scale

**[ESTABLISHED: repository baseline and contracts]** At this study's base, the baseline contains planar equipment positions and scalar yaw inertias while the contracts already describe 3D. The full 2G implementation is still pending. Use the unchanged baseline mass inventory, not a newly invented lighter ship. A11 requires a full 3D calculation; a scalar yaw moment cannot determine a unique 3D tensor.

**[ASSUMED]** The reference stows all four appendages before capture. It recomputes mass and CoM from every equipment assembly, propellant tank and reactant inventory. For each supplied intrinsic yaw moment `Iz`, use the declared finite-thickness approximation `diag(0.6 Iz, 0.6 Iz, Iz)` and apply the full parallel-axis theorem. This preserves the supplied yaw moment and yields positive physically admissible moments, but is not the final ship engineering tensor. Positions acquire z = 0; the entire ship is then oriented in 3D, and its initial spin is not along a principal axis. Replace this approximation with the approved 2G tensor before production acceptance.

**[DEMONSTRATED: reference `baseline()`]** Stowed wet mass is **30,374 kg**; CoM from structural datum is **(−0.33285046, 0.00207414, 0) m**. The body-frame inertia about CoM, in kg m², is:

```text
[123802.269       300.030421       0       ]
[   300.030421 219967.282          0       ]
[     0             0        305048.751   ]
```

**[ESTABLISHED: DECISIONS P14 owner review]** The player is the sole crew member. The older JSON still carries a 320 kg aggregate `crew` assembly and four-person life-support assumptions. The reference retains that mass to reproduce the approved approximate vehicle mass, and evaluates acceleration at its location. It does not reinstate four people or apply 320 kg as one person's mass. Updating the baseline belongs to its owner.

| Item | Proposed value and meaning |
| --- | --- |
| Structure | 2,000,000 kg, nominal 1,000 m radius thin ring or equivalent braced framework; 2 km span |
| Structure principal inertia | (10¹², 10¹², 2×10¹²) kg m², the thin-ring values |
| Spin | 0.04 rad/s about local z; 157.080 s period; 40 m/s tip speed; 1.6 GJ initial spin energy |
| Main structure attachment | (1,000, 0, 0) m from its CoM |
| Ship attachment | (−4, 0, 0) m from structural datum, i.e. (−3.66715, −0.002074, 0) m from CoM |
| Line | 200 m unstrained deployed length, effective k = 20,000 N/m, c = 15,000 N s/m; damping engages over 0.5 m extension |
| Failure limit | 200,000 N actual tension; a proposed mechanical fuse/mount limit, not a raw-fiber strength |
| Nearby body | Fixed P4 point source, GM = 10¹⁰ m³/s², r₀ = 10⁶ m, structure initially at (10⁶, 0, 0) m |
| 3D attitude | Both initial frames tilted 0.6 rad about inertial x; ship initial body rate (0.003, 0.002, 0.025) rad/s |
| Initial translation | Structure moves 100 m/s along its spin axis, perpendicular to its radius from the gravity source; ship adds local (2, 30, 0.5) m/s |
| Simulation | 1 s public ticks, 64 fixed mechanical substeps per tick, simultaneous RK4 stages for both bodies |

**[ASSUMED]** The structure is rigid for this study. Its own elastic modes and bracing strength need S2/content design; a ring-shaped mass distribution does not certify a 2 km derelict. This geometry is a possible reservoir, not a required visual design. At 200 m, the material comparisons in [sources](sources.md) imply about **74–86 kg of bare line**, 0.24–0.28% of ship mass; the 420 m wrapped example implies 155–181 kg. The reference neglects this line mass and all new hardware mass. A production budget must include them, rerun the mass properties and bound line modes. There is no massless real spool.

## 2. Coupled mechanics and the tether's life

### Endpoints and rigid bodies

**[ESTABLISHED: S14; S1-N1, rigid-body mechanics]** Let body i have CoM xᵢ, velocity vᵢ, body-to-world rotation Rᵢ, constant body inertia Iᵢ and body-frame attachment aᵢ measured from CoM. Set rᵢ = Rᵢaᵢ and pᵢ = xᵢ+rᵢ. The endpoint velocity is uᵢ = vᵢ+ωᵢ×rᵢ. With n = (pₛ−pᴅ)/d and d = |pₛ−pᴅ|:

```text
F_ship = −T n                   F_structure = +T n
tau_i = r_i × F_i
dx_i/dt = v_i                   m_i dv_i/dt = F_i + F_gravity,i
dL_i/dt = tau_i                 omega_i = R_i I_i^−1 R_i^T L_i
dq_i/dt = 0.5 (0,omega_i) ⊗ q_i        [world omega, quaternion wxyz]
```

**[ASSUMED]** Integrate world angular momentum L, not three independent Euler-angle rates. Quaternion normalization removes roundoff drift; it is not an attitude controller. All forces in one stage use that same stage's state of both bodies. The actual body's rotation evolves under the line torque; the reference applies no RCS, thrust, attitude lock or energy replenishment.

### Slack, compliance, damping and reeling

**[ASSUMED]** For unstrained length ℓ(t), define signed gap g = d−ℓ, extension e = max(g,0), and ė = n·(uₛ−uᴅ)−ℓ̇ while extended. The effective unilateral spring/damper is:

```text
f(e) = 1 − exp(−e / 0.5 m)
T = 0                                      when g <= 0
T = max(0, k e + c f(e) e_dot)              when g > 0
U_line = 0.5 k e²
Q_dot = (T − k e) e_dot >= 0
W_reel_dot = −T ell_dot
```

**[ASSUMED]** The engagement factor removes a dashpot's finite force jump at the instant a slack line touches its unstretched length. It is a proposed absorber behavior, not a material law of Dyneema or Zylon. Clamping prevents compression. When shortening rapidly enough to clamp T to zero while e > 0, the disappearing spring energy is included in Q; it does not vanish from the ledger. Once geometrically slack, both force and stored energy are zero. The line can go slack again, so never replace it with a permanent bilateral rod constraint.

**[ASSUMED]** Constant k models a compliant capture/absorber assembly in series with a much stiffer rope. At 200 kN static load it needs 10 m equivalent spring stroke; propose at least 15 m available stroke pending measured transients and a separate stroke-stop/failure test. The clean release still contains **192 kJ**, equivalent to 4.39 m spring extension. A literal fiber rope has k = EA/ℓ and mass transport through the spool; changing ℓ then changes both stiffness and inventory. Those effects are absent here. The reel demonstration changes length only 2 m, within this local approximation. The effective spring must never be presented as fabricated fiber stretch.

**[ESTABLISHED: mechanics; DEMONSTRATED: `check_reference.py` differential energy tests]** With this constant-k law, endpoint power is −T ḋ. Adding U̇ gives `d(K+U_line)/dt = −Q_dot − T ell_dot`. Reel-in (ℓ̇ < 0) supplies positive mechanical work; pay-out absorbs it. Electrical input must additionally include motor efficiency, and braking/regeneration must place absorbed work in heat or storage. There is no free winch energy. A 0.1 m/s reel under 100 kN transfers 10 kW; compare with real bus and brake limits, not only spool speed.

### Capture, snap and release

**[ASSUMED]** A successful latch changes connectivity; a compliant line then produces finite forces. The vectors start at an already successful, zero-impulse latch of a **previously deployed massless terminal**. They do not teleport a tether into existence or simulate a flying hook, contact funnel, harpoon, latch impact or line deployment. The ship and structure need not have matched CoM velocities; hook-to-port velocity must be feasible for S2's catcher. In the clean vector the line starts just unextended with 2 m/s outward radial mismatch. The initial transverse endpoint mismatch is about 10 m/s and evolves continuously into stretch/torque. In the fast vector the radial mismatch is 12 m/s.

**[ESTABLISHED: rigid-body impulse mechanics]** For a separate ideal impulse along n, the inverse effective mass is:

```text
1/m_eff = 1/m_s + 1/m_d
          + (r_s × n) · I_world,s^−1 (r_s × n)
          + (r_d × n) · I_world,d^−1 (r_d × n)
```

**[ASSUMED]** If a hardware model instead closes that relative velocity instantaneously, its equal/opposite impulse must change both translational and angular momenta. An inelastic catch loses `0.5 m_eff v_normal²` as heat/deformation; an elastic line can retain part of it. Do not apply an impulse projection and then dissipate the same capture energy again through a fictitious spring preload. The reference uses compliance only. Near the aligned starting mount, m_eff ≈ 29.92 t: radial capture energy alone is about 59.8 kJ at 2 m/s and 2.15 MJ at 12 m/s. Gravity and continued rotation act during the subsequent loading, so these are scale checks, not peak-load predictions.

**[ASSUMED]** The first crossing T = 200 kN irreversibly snaps the link; release also removes the link. Position, velocity, attitude and angular momentum remain continuous at either event. Remaining spring energy moves to an explicit **discarded-cable recoil/fracture reservoir**. This is a conservative accounting device for omitted cable degrees of freedom; it is not a claim that all that energy safely turns into heat. There is no scripted recoil impulse. Real line whip, struck hardware and spring return into a still-connected mount require finite-mass cable and S2's actual release mechanism. Damage follows loads/contact, not an unconditional whole-ship death at every snap.

### The slack-wrap vector has a declared topology

**[ASSUMED]** For `slack_wrap`, a frictionless guide at structure-body (950,100,40) m lies before the terminal at (1000,0,0) m. The unstrained line is 420 m. Its path is `|ship endpoint − guide| + |guide − terminal|`; the second leg is fixed at 118.74 m. The initial path is shorter than 420 m, so the line begins slack. This is a line **already routed around a specified feature**, not a straight chord relabeled a wrap.

**[ESTABLISHED: mechanics; DEMONSTRATED: `check_reference.py` guide virtual-work tests]** Equal tension on the two sides of a massless frictionless guide gives a guide reaction and a terminal reaction. The fixed tail's force and moment cancel within the same rigid body, leaving the same net force/torque as tension applied at the guide toward the ship. This is exactly what the reference integrates. The guide changes the effective moment arm and length, without creating momentum or energy.

**[DEMONSTRATED: reference]** Slack is taken up at 2.80598 s and the wrapped line breaks at about 2.94759 s. The case closes its energy/momentum ledgers and demonstrates a dangerous take-up from a prescribed wrapped route. **[ASSUMED]** A freely floating slack cable's shape is underdetermined by endpoints; arbitrary wrap formation, guide acquisition, friction, sliding contact, clearance and self-contact remain unimplemented. Do not dynamically insert a guide by changing path length without resolving contact impulse and energy. General entanglement needs segmented cable; an unsupported contact should stop/branch a forecast rather than invent a curve.

## 3. Exchange near a P4 body

**[FICTIONAL: P4, derivation §§2–3]** For source GM = μ, shared r₀ = 10⁶ m, displacement r and K = μ√r₀:

```text
a(r) = −K r / |r|^3.5
Phi(r) = −K / (1.5 |r|^1.5)
```

**[ASSUMED]** Apply this at both moving bodies' CoMs. The source is fixed and external; it is not included in the two-body momentum ledger. Ship/structure mutual gravity is negligible at this scale and omitted. With G = 6.67430×10⁻¹¹, the structure's P4 attraction at 1.2 km is only about 2.7×10⁻⁹ m/s². The strong visible exchange is line force, not a gravitational assist from a 2,000 t wreck.

**[ESTABLISHED: conservation mechanics; FICTIONAL: this potential]** About a fixed inertial origin o:

```text
P = sum m_i v_i
H = sum [(x_i−o) × m_i v_i + L_i]
E = sum [0.5 m_i |v_i|² + 0.5 omega_i·L_i + m_i Phi(x_i)] + U_line
dP/dt = sum F_gravity,i
dH/dt = sum (x_i−o) × F_gravity,i
E + Q + E_discarded − W_reel = constant
```

**[ESTABLISHED: mechanics]** Internal forces cancel in P. Their total orbital torque is `(x_d−x_s)×Tn`; the spin torques add `(r_d−r_s)×Tn`, so the total is `(p_d−p_s)×Tn = 0`. A force off CoM therefore transfers both orbital and spin angular momentum without creating either. The total mechanical energy can decrease through the absorber while the ship gains energy; the structure pays for that gain. A prescribed unchanging rotor would hide an unlimited motor.

**[ASSUMED]** The reference integrates the external gravitational impulse and its moment, and tests P−P₀−Jg and H−H₀−Hg. It includes the static potential in E, so no separate gravity-work subtraction is needed. For an explicitly moving source, include `sum m partial(Phi)/partial(t)` as external work, or integrate all source reactions using the shared reciprocal P4 pair potential. Total momentum/energy of the enlarged closed system then replaces the external ledgers. Do not demand constant ship-only or two-body momentum in a gravity field.

**[ASSUMED]** Each extended body sees only its centroid gravity in this bounded reference, following the game's point-source convention. At 1,000 km, a = 0.01 m/s² and the radial gradient magnitude is 2.5a/r = 2.5×10⁻⁸ s⁻². A 2 km structure spans up to about 5×10⁻⁵ m/s² of differential gravity, small against line-driven m/s² accelerations over these 160 s. A gravity-gradient torque scale is at most order `(p+1) a |Imax−Imin|/r ≈ 35,000 N m`, also small here but not identically zero. Long captures, much closer passes or a flexible structure require distributed P4 forces/potential and matched tidal torques. This approximation is not evidence that tides never matter.

## 4. Numbers, budgets and physical limits

**[DEMONSTRATED: reference, 64 substeps]** Each Δv below compares the tethered ship against a simultaneously propagated ship starting at exactly the same state with only the same P4 gravity. The comparison times are 100 s (clean/wrap), 15 s (fast) and 160 s (wrong phase); release occurs earlier. The authored desired direction is −local x, chosen before running the vectors.

| Case | Terminal event | Δv magnitude vs coast (m/s) | Desired component (m/s) | Inertial speed gain (m/s) | Peak T (kN) | Peak CoM specific acceleration (m/s²) |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Clean | Release at 50 s | 76.346 | +43.521 | +8.823 | 143.973 | 4.740 |
| Too fast | Break at 0.135715 s | 0.632 | +0.632 | −0.068 | 200.000 | 6.585 |
| Slack wrap | Break at 2.947595 s | 0.675 | +0.611 | +0.157 | 200.000 | 6.585 |
| Wrong phase | Release at 140 s | 23.590 | −23.502 | +2.602 | 143.973 | 4.740 |

**[DEMONSTRATED: baseline arithmetic in reference]** At 320 s main Isp and 6,000 kg fuel, the baseline ideal main budget is **690.61 m/s**; at 220 s RCS Isp and 300 kg propellant, its ideal all-translation RCS budget is **21.415 m/s**. Thus 76.35 m/s is about 11.1% of the main budget and 3.57 times the entire RCS translation budget. A 43.52 m/s useful component is about 6.3% of main. At this initial mass, equivalent isolated main impulses would consume approximately 730 kg and 418 kg respectively. These comparisons do **not** subtract rendezvous, attitude, collision avoidance or exit-correction cost and do not prove net propellant savings.

**[DEMONSTRATED: reference]** Clean release removes **30.453 MJ** from structure spin, about **1.90%** of its initial 1.6 GJ; its angular-momentum change has norm about **0.766×10⁹ kg m²/s**, around 0.96% of initial spin angular momentum. The absorber dissipates **206.3 kJ** and release exports **192.5 kJ** of residual spring energy. Both bodies recoil. Measuring a percent-level spin change needs sufficiently good structure tracking; the model does not receive the true inertia or energy ledger as telemetry.

**[ASSUMED]** A useful upper bound is energy, not a promised exit speed: if all 1.6 GJ became ship translation from rest, `sqrt(2 E_spin/m_ship) ≈ 325 m/s`. Momentum, geometry, structural loads, capture loss and the continuing spin of the structure make that unattainable in this example. A familiar `2 × tip speed` moving-mirror intuition is only a rough local analogy; it is not a universal cap or an instruction to add 80 m/s at release. The integration determines the actual outcome.

### Crew and assemblies

**[ESTABLISHED: rigid-body kinematics]** At a body-fixed assembly location r from ship CoM, the rigid support acceleration relative to centroid free fall is:

```text
a_support(r) = F_tether/m_ship + alpha × r + omega × (omega × r)
alpha = I_world^−1 [tau − omega × L]
F_support,assembly ≈ m_assembly a_support(r)
```

**[ASSUMED]** The reference reports the maximum norm separately for every baseline assembly in `peak_assembly_loads`, in `[m/s², N]`. These are point/centroid inertial loads, not stress, panel bending modes, mount certification or medical tolerance. A real deployed radiator's root moment requires its distributed mass and flexibility; a whole panel can fail even when its center acceleration seems mild. The reference is stowed, with no collision solver. Centrifugal loads remain after release if the ship keeps spinning.

**[DEMONSTRATED: reference]** CoM acceleration reaches **0.483 g₀** clean and **0.671 g₀** at the 200 kN limit. Peak local support loads below include rotational terms over each entire simulated arc, including post-release rotation. The 320 kg baseline crew assembly force is bookkeeping; acceleration at its location applies to the single player without asserting their body mass.

| Assembly | Clean acceleration (m/s²) | Clean force (kN) | Fast-break acceleration (m/s²) | Wrapped-break acceleration (m/s²) | Wrapped-break force (kN) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Crew location / 320 kg baseline assembly | 4.814 | 1.541 | 6.586 | 5.872 | 1.879 |
| Stowed solar-left, 300 kg | 4.945 | 1.483 | 6.535 | 3.668 | 1.101 |
| Stowed radiator-left, 250 kg | 4.909 | 1.227 | 6.533 | 6.211 | 1.553 |
| Main engine, 600 kg | 4.756 | 2.854 | 6.583 | 12.414 | 7.448 |

**[ASSUMED]** The wrapped case illustrates why CoM acceleration alone is inadequate: the aft engine reaches 1.266 g₀. Safety ratings remain an S2 decision backed by hardware evidence, not a universal g-limit invented by this study.

**[ASSUMED; baseline ratings]** At this off-center mount, even the geometric worst-case torque bound `3.667 m × 144 kN ≈ 528 kN m` dwarfs the old baseline's ±1.6/4.0 kN m zero-net-force yaw authority. That is a bound, not the demonstrated maximum torque. Finite RCS cannot hold arbitrary attitude against a taut line. Align the load path, permit measured rotation, and use a suitable bridle/gimbal if hardware supports it. Do not spend the nominal 300 kg RCS reserve in the forecast while silently granting infinite attitude torque in truth.

### Real materials and NASA comparisons

**[ESTABLISHED: S1-M1–M4; ASSUMED: assembly sizing]** The source note separates bare-fiber strength from finished-rope rating. ZYLON HM fiber is reported at 5.8 GPa, 270 GPa modulus and 1,560 kg/m³. A stipulated 25% retained-strength factor and 2× margin over the 200 kN fuse require 275.86 mm² fiber area and 430.34 kg/km. At 200 m its ideal axial stiffness is **372 kN/m**, much stiffer than this study's effective 20 kN/m. The series energy absorber is therefore essential to the proposed force law.

**[ESTABLISHED: S1-M2; ASSUMED: derating]** Two manufacturer-rated 17 mm Dyneema SK78 ropes weigh 368 kg/km and sum to 645.28 kN nominal break load. A chosen 0.65 retained-strength factor leaves 419.43 kN, just over twice the proposed fuse. Equal sharing, terminations, thermal history, bending and abrasion must actually justify that factor. Neither catalog data nor a chosen derating certifies an abandoned line. Zylon light/knot weakness and Dyneema creep/temperature behavior matter. S2 selects architecture and margins.

**[ESTABLISHED: S1-N1–N3]** NASA MXER modeling studies roughly 100 km rotating tethers, with a nominal payload Δv near 2.4 km/s in the cited design; the NASA-sponsored HASTOL rotovator example uses 600 km and a 15 t payload at 3.42 km/s tip speed. Those are proposed architectures, not flight-proven performance. Their long distributed cables, precise rendezvous and subsequent reboost differ from a short ship line connected to a finite rigid wreck. The transferable idea is the reciprocal momentum exchange. P4 and this derelict do not supply Earth's electrodynamic reboost, plasma or a hidden motor.

## 5. Deterministic integration and evidence

**[ASSUMED]** Keep the game's public dt = 1 s and use **64 fixed substeps (h = 1/64 s)** for the complete coupled pair while attached or eligible for capture. The reference uses RK4 for translation, quaternions, angular momenta, counterfactual coast and all ledgers with the same stage times. It is neither symplectic nor a universal integrator for arbitrarily stiff rope. The nominal aligned spring frequency is about 0.818 rad/s; oblique attachments increase inverse effective mass and can raise that frequency. The engagement length also introduces a short capture timescale. Retune substeps when k, geometry, mass, absorber law or contact topology changes.

**[ASSUMED]** A production alternative is an implicit compliant constraint solve or a symplectic rigid-body split with unilateral impulses. That can be efficient for much stiffer lines, but must retain extension energy, damping, break timing, lever-arm reactions and paid reeling. It needs an independent comparison to this reference. A projection that simply corrects endpoint positions or resets angular velocity is not an acceptable solver. No performance benchmark for browser forecasts is claimed; reserve a bounded horizon and measure it after 2G.

**[DEMONSTRATED: reference]** Public commands are integer-tick scheduled and non-integer command times are rejected, not silently rounded. Capture at t = 0 connects a declared initial state. A release at an integer boundary is applied before the next force stage, and the remaining tick is free flight. A slack-to-taut geometric crossing is located by 32 deterministic bisections of the ballistic segment. Break is located by 32 bisections of the coupled microstep, then the rest of that microstep is re-integrated with no line force. The last physical state is continuous; the elastic reservoir is transferred exactly once. Slow resources and sensor sampling must not be multiplied by the number of mechanical substeps.

**[ASSUMED]** Version the event ordering: a previously broken line cannot release again; scheduled release at a tick boundary precedes the following interval's forces. Integer reel start/end boundaries use that interval's achieved rate on both RK boundary stages. Warp changes how many full ticks execute, never h. Log tick, substep, event fraction, topology and command sequence. If finer manual release timing is later introduced, split exactly at its scheduled timestamp and add those vectors; the present reference does not accept arbitrary float command times.

**[ASSUMED]** Break bracketing checks the end of a resolved microstep and assumes the first relevant threshold crossing is not an unseen interior excursion. This is tested by refinement for these fixtures, not proven for arbitrary contact shocks. Production must bound stage/swept extrema or split further deterministically for unsupported fast changes. Taut/unloaded diagnostic events other than geometric take-up are sampled at h; do not claim their displayed first-positive timestamp is a precisely located force onset.

**[DEMONSTRATED: reference validation]** The generated JSON contains coarse/refined outgoing-state errors, event times, peak tension, maximum absolute invariant residuals and auxiliary runs. For the four required 64-substep cases, maximum corrected energy residual is below **0.02 J**, linear momentum residual below **10⁻⁶ N s**, and angular momentum residual below **1 kg m²/s** over 15–160 s. The latter is of order 10⁻¹¹ of the structure's 8×10¹⁰ kg m²/s spin, and includes large-coordinate floating-point cancellation. Energy is checked against its ledger rather than mislabeled conserved while damping operates. The slack/break cases are nonsmooth; do not demand an exact fourth-order convergence ratio at events.

| Case | Max energy-ledger error at h = 1/64 (J) | Max linear / angular momentum residual (N s / kg m²/s) | Ship endpoint difference, h = 1/64 vs 1/128 (m / m/s) | Terminal-event time difference (s) |
| --- | ---: | --- | --- | ---: |
| Clean | 0.000367 | 9.43×10⁻⁷ / 0.803 | 1.51×10⁻⁸ / 1.31×10⁻¹⁰ | 0 |
| Fast | 0.0123 | 2.29×10⁻⁷ / 0.456 | 1.93×10⁻⁵ / 1.28×10⁻⁶ | 6.83×10⁻⁸ |
| Wrap | 0.0176 | 7.33×10⁻⁷ / 0.487 | 1.34×10⁻⁴ / 1.38×10⁻⁶ | 9.92×10⁻⁸ |
| Wrong phase | 0.000512 | 9.08×10⁻⁷ / 0.803 | 2.18×10⁻⁸ / 9.44×10⁻¹⁰ | 0 |

**[DEMONSTRATED: reference validation]** The 32-to-64-substep endpoint differences fall by about 16× on the two breaking cases when comparing 64 to 128; smooth cases reach the coordinate roundoff floor. Peak-tension differences are below 0.055 N for 32 vs 64 and 0.000025 N for 64 vs 128. Sampling a peak can conceal its exact extremum, so these are measured comparisons, not certified analytic maxima.

**[DEMONSTRATED: reference auxiliary vectors]** An isolated, undamped 45 s run closes energy to 0.636 J, momentum to 2.88×10⁻⁷ N s and angular momentum to 6.402 kg m²/s (8.0×10⁻¹¹ of initial structure spin); after its 40 s release the exported spring energy remains in the ledger. The 0.1 m/s reel-in over 10–30 s delivers 96.248 kJ of mechanical work and closes its energy ledger to 0.000438 J. Running the clean case at an unsplit **1 s** instead gives **19.48 kJ** maximum energy error and 417.3 kg m²/s angular-momentum error. This demonstrates the need for the finer scheme at the proposed stiffness, without claiming that every possible 1 s integrator fails.

**[DEMONSTRATED: `check_reference.py`]** Separate analytical checks cover reciprocal forces and orbital-plus-spin momentum, force/torque as finite-difference virtual work, arbitrary global rotations with asymmetric inertia, loading/unloading/slack/reel differential energy and explicit guide/terminal reactions. They are not just replays of a planar fixture. Auxiliary vectors additionally exercise isolated undamped dynamics, reel work and exact same-runtime repeat of a hybrid break case. Runtime and floating-point-library identity matter; bitwise Python/TypeScript or cross-platform equivalence is not asserted.

**[ASSUMED]** Acceptance for an independent TypeScript implementation: same initial data and 64 substeps, endpoint position within 0.05 m, velocity within 0.001 m/s, peak tension within 100 N, break time within 10⁻⁴ s, quaternion angular error within 10⁻⁵ rad and relative angular-momentum error within 10⁻⁷. These are proposed tolerances; the Python refinement tests directly assert the first four, while independent 3D differential tests cover orientation conventions. Also require no extra energy source, exact same-runtime save/replay, no unsensed truth in the model, and convergent collision/event behavior. Passing these reference checks does not establish a playable encounter.

## 6. What building and playing it would take

**[ASSUMED]** [Integration and play](integration.md) is part of this deliverable: it names the modules, contracts and data to change, estimates 2,230–3,850 implementation lines plus 1,000–1,800 test lines for bounded contact, and specifies the model/screens and acceptance tests. The truth solver needs a finite structure with spin; the existing stateless acceleration-field API cannot supply reciprocal forces. The model needs measured feature tracks and load/reel history, honest uncertain branches at capture/contact and fresh inertia/phase estimates. Tether arcs must be excluded from ordinary coast/engine calibration until modeled. Accelerometers sense the line's nongravitational load even with engines off (P7), never the true gravity directly (P11).

**[ASSUMED]** The player controls approach/capture, reel/brake schedule, attitude/configuration and release. Fresh observed geometry, surviving RCS, changed CoM, brake heat and load-path condition make execution consequential. The four reference outcomes demonstrate physical sensitivity, not tenth-run difficulty. A9's test is a retained-knowledge player who can adapt successfully while blind replay of old release timing can still fail. Keep masses/material laws fixed between runs; change observed orientation, phase and approach within authored bounds, without hidden retuning. No pause within the encounter; a safe bypass remains possible.

**[ASSUMED]** Owner questions, one decision each, with recommendations: approve the optional encounter conditionally on S2/S3 margins; begin with authored guide topology rather than arbitrary entanglement; keep structure inertia fixed between runs; and let a snapped line's actual trajectory/damage determine survival. The detailed questions and tradeoffs are in [integration](integration.md#decisions-for-the-owner-through-the-integrator), and the batched requests are in [the handoff](../../handoffs/s1.md). The owner, through the integrator, decides them.
