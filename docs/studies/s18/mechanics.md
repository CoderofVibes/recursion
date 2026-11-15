# S18 — Mechanics, revised kit and failure

All hardware selections and approximations below are **[ASSUMED]**. Equations follow classical rigid-body/elastic mechanics; the chosen gravity law alone is **[FICTIONAL: P4]**. Numeric outputs are **[DEMONSTRATED: `tools/studies/s18/reference.py`]** where identified. This supplements, rather than rewrites, S2.

## Final ship, rather than the old planar lift

**[ESTABLISHED: `data/ship-baseline.json`, `src/ship/README.md`, `docs/handoffs/2G.md` § Ship]** Recompute all 42 assemblies and seven resource inventories with actual 3D positions, appendage-specific roll/pitch/yaw moments and the parallel-axis theorem. Do not reuse S1's `0.6 Izz` lift or S2's isotropic baseline. The numerical inventory still has old crew wording; A15/P14's one player is authoritative. S18 changes neither the inventory nor crew records.

**[DEMONSTRATED: `budgets.mass_properties`]** Radiators deployed, full tanks, kit deployed, head at target and 30 m line paid: physical rigid ship **30,632.8 kg**; reference effective ship **30,633.4 kg** after allocating 0.6 kg of rope to this endpoint. Its CoM is `(-0.332995684, 0.002056579, -0.084062494)` m. Tensor about that CoM, kg m²:

```text
[104245.470170     300.021272   10578.493847]
[   300.021272  309042.557186     -20.295937]
[ 10578.493847     -20.295937  325115.741030]
```

**[DEMONSTRATED]** Principal moments are `(103739.534, 309042.995, 325621.239)` kg m². The reference includes all four configurations at 6,000/3,000/0 kg main propellant. With a body-dorsal 3,500 N load, pitch torque increases from 59.5 N m wet to 1,480.6 N m main-empty because the CoM moves. The full empty-tank trajectory remains controlled by allowing the line to depart from body +z; no moving-CoM magic fairlead is added.

## Revision to S2's kit

**[ASSUMED]** Retain its eight assemblies (255 kg), bus isolation, 500 m × 0.04 kg/m nonconducting line, `EA = 10⁶ N`, 40 kN nominal new terminated rope strength, 8 kN working rating, 12 kN frame proof, 16 kN sacrificial link and 24 kN frame-failure assumption. The last three are overload thresholds, not permission to operate above 8 kN.

Add one **20 kg assembly** at `(-0.35,0,2.6)` m, intrinsic tensor `diag(2,2,2)` kg m² for study mass accounting:

| Allocation [ASSUMED] | Function |
| --- | --- |
| 8 kg | Spring/damper slider and guides; 20 kN/m spring, 8 kN s/m damping; 0.4 m working travel |
| 10 kg | Captive recoil sleeve, sacrificial crush cartridge, load-loss latch and links into the existing frame |
| 2 kg | Manually commanded two-axis launcher fine trim, ±5°, with no homing or automatic intercept |

**[ASSUMED]** The added assembly stays inside S2's deployed box (z ≤ 3.5 m); internal slider travel is contained. Arm/trim allowance adds 50 J electrical energy, ultimately heat, to S2's 2,210 J preparation budget. No continuous trim power is needed once mechanically latched. These are packaging requirements to prove in the prototype, not CAD or vendor-qualified masses. Keep S2's 0.2 s normal-release and 0.1 s cut latency; commands select execution times with those delays included.

**[ASSUMED]** Normal operation can command free/slip/hold and powered retrieval. The accepted 400 s swing uses **hold**, not a prescribed constant force or an inexhaustible winch. The compliant cartridge makes this specific 0.1 m/s take-up tolerable. Hold must slip or fail according to real capacity outside this envelope; the reference does not clamp tension at 8 kN. No wrapping is supported, as approved in A15.

## Exact equations used by the reference

For each body, `p_i = x_i + R_i a_i`, `u_i = v_i + omega_i × R_i a_i`, `omega_i = R_i I_i⁻¹ R_iᵀ L_i`. Set `d = |p_ship-p_target|`, `n = (p_ship-p_target)/d`, and buffer displacement `s`. With held material length ℓ = 30 m:

```text
k_rope = EA / ell = 33333.333333 N/m
T = k_rope max(d - ell - s, 0)        (while connected)
s_dot = (T - k_buffer s) / c_buffer
F_ship = -T n; F_target = +T n
L_dot_i = (R_i a_i) × F_i + applied_RCS_torque_i
q_dot_i = 0.5 (0,omega_i) ⊗ q_i       (world omega; wxyz)
U = 0.5 k_rope max(d-ell-s,0)^2 + 0.5 k_buffer s^2
Q_dot = c_buffer s_dot^2
```

The buffer is a spring/dashpot in parallel, **in series with the rope**. Its compliance is real mechanical travel, not a falsely softened fiber modulus. At zero rope load the buffer relaxes through its damper. With no spool motion, endpoint work plus `U_dot + Q_dot` is zero. Released rope strain energy moves once to a separately retained cable-energy ledger; buffer energy remains aboard and returns through the damper for the planned release.

**[ASSUMED]** Buffer moving mass is included in inventory but its small motion is quasistatic in the dynamics. At the 8 kg/20 kN/m internal scale its natural frequency is 50 rad/s, much faster than the ship/line modes; explicit slider/contact dynamics must validate peaks at failure. The 0.1 s reference step resolves the soft ship mode, not those internal impacts or the 6 ms longitudinal wave.

P4 uses `a(x) = -GM sqrt(r0) x / |x|^3.5`, `Phi = -GM sqrt(r0)/(1.5 |x|^1.5)`. Track the external gravity impulse and angular impulse about the initial target origin. Verify:

```text
E_mechanical + Q + E_exported_cable - W_RCS = constant
P_total - integral(F_gravity dt) = constant
H_total - integral(tau_gravity dt) - integral(tau_RCS dt) = constant
```

**[DEMONSTRATED]** Actual commanded control work is only about −77 to −96 J in the nominal interval. It is explicitly external, with RCS fuel cost recorded; it is not counted as heat generated by the tether. Both reaction torques and off-diagonal ship inertia terms are retained.

## Finite control, mass and gravity approximations

**[ESTABLISHED: final ship]** Each pod at `(±5,±2,0)` has 200 N axial and vertical jets, at most two active valves per pod, 220 s Isp. Full-bank authority is ±1,600 roll, ±4,000 pitch and ±3,600 yaw N m.

**[ASSUMED]** The reference uses a conservative subset: balanced vertical couples for roll/pitch and axial couples for yaw (±1,600 N m yaw available in this subset). At each stage, for pod coordinate `(x,y,0)`, `Fz = tau_x y/16 - tau_y x/100`, `Fx = -tau_z y/16`. Scale all demands together if any exceeds 200 N. This delivers zero net force, allows at most two jets per pod and charges `sum |F|/(220 g0)` propellant. The actual allocator never saturates in the tested cases. The existing 0.4/s rate gain and 0.0004 rad/s deadband act on the actual tensor; orientation is integrated, never overwritten.

**[ASSUMED]** Continuous-duty jets omit 10 N s pulse quantization. A pure pitch pair's minimum impulse changes rate by about 0.00032 rad/s; nominal maximum rate leaves 0.00177 rad/s below the hands-on ceiling. This is margin for an implementation check, not proof of the pulsed controller. The <5 kg control expenditure is costed but not subtracted during integration (under 0.02% mass error); production must consume fuel and move CoM/inertia continuously. Empty main fuel is tested as a separate full trajectory, not inferred from the wet result.

**[ASSUMED]** Split the 1.2 kg deployed rope equally between endpoints; target includes the 15 kg head, so total inventory is conserved. The line is not a rigid 30 m ship appendage. This low-frequency lumped representation overstates some distributed inertia and omits wave/whip modes. Cable mass is only 3.9×10⁻⁵ of ship mass; even allocating all of it to the other end changes the gross inertial scale by that fraction. That is a scale argument, not a bound on local impact peaks. Normal cassette separation also needs the S2 1 J eject work and opposite impulse in production; no bonus impulse is added in the swing reference.

**[ASSUMED]** Gravity acts at each CoM. At 3,000 km from the reference source, acceleration is 0.000642 m/s²; gradient across a 6 km target is of order 3.2×10⁻⁶ m/s². A worst-orientation gravity-gradient torque scale is about 724 N m for the largest inertia difference, versus up to millions of N m during the diagnostic pull. The effect can still bias a precise inertia experiment; production should include/bound distributed gravity in the fit, especially for longer observations. No mutual gravitational attraction, target flexibility, arm bending or rail damage is modeled. Require structural rail capacity ≥8 kN and an independently checked finite-stiffness target response before shipping the encounter. The mathematical rods in the layout are **mass-distribution equivalents**, not a proposal to build unsupported slender 3 km beams from the drawing.

## Capture and active payout: separate screens

**[DEMONSTRATED: `launch_screen`]** A one-dimensional launch screen includes S2's 30 J spring, 0.1 N guide drag, 15 kg head and 0.04 kg/m line pickup. Treating all paid material as moving at head speed gives 16.03 s flight to 30 m paid, final relative head speed 1.753 m/s, 3 J guide heat and 2.111 J pickup loss. Back-propagating the chosen rotating-rail geometry gives **34.60 m initial standoff**, initial ship-to-rail velocity about `(-0.662,0.138,0)` m/s in the target frame, and **3.67° launcher trim**, within the proposed ±5°.

**[DEMONSTRATED: screen]** At interception, head/rail relative speed is 1.657 m/s (20.60 J head energy), transverse speed 0.12 m/s. A 0.25 m rail inside a 0.30 m jaw gives a 0.417 s transverse dwell screen, longer than S2's 0.04 s closure. This is a feasible envelope screen, **not a simulated latch**: ship mount rotation, line shape, visibility, finite target contact, launch reaction and recoil must be integrated before certifying capture. It deliberately avoids assuming a 2 m/s head can reach an arbitrarily accelerating point from the old 50 m maximum standoff.

**[DEMONSTRATED: `capture_payout_auxiliary`]** Independently, a 1D 0.5 m/s radial capture with a 1 s ramp to a 3 kN slip brake stops in 5.529 s, requires 1.503 m payout, dissipates 3.771 kJ and peaks at 1.351 kW. The 50 m locked-rope screening peak is still 12.28 kN. This auxiliary shows an affordable use for active payout; it does not certify a 0.5 m/s capture on the rotating target. The accepted integrated swing starts at 0.1 m/s.

## Power, heat and damage that remain with the ship

**[DEMONSTRATED: budget arithmetic]** Monitoring adds 30 W payload plus 35 W essential, or 66.84 W at source with the existing 95% converter. At 6 kN and 0.3 m/s retrieval, S2's motor needs 2,500 W, exports 1,800 W and heats locally by 700 W. At 6 kN and 0.5 m/s payout, brake heating is 3,000 W; over 60 s it adds 180 kJ, or 3 K adiabatically in S2's 60 kJ/K brake/frame node. No regeneration is assumed. A locked hold has no continuous `T Ldot` brake heat.

**[ASSUMED]** Add damper heat to that existing brake/frame node once; the new 20 kg is not a second hidden heat sink. At most ~290 J in the nominal swing raises that node by only 0.0049 K adiabatically. Electronics add about 27 kJ over 400 s; baseline sensor, recorder, RCS valve and chemical heat still apply. A conservative simultaneous-two-valves/four-pods RCS bound is 260 W electrical plus 800 W chemical heat while firing. Actual dispatch and whole-ship thermal integration remain production tests. Do not advertise an otherwise healthy nominal swing as a dramatic brake-overheating problem.

**[DEMONSTRATED: `failure_bounds`]** With rope wave speed `sqrt(EA/linearDensity) = 5000 m/s`, the one-way wave time over 30 m is 0.006 s. These are explicit ceilings/screens, not a resolved snap simulation:

| Tension | Rope strain energy | Buffer energy | Total | `2 T L/c` wave impulse bound | Ship Δv from that impulse |
| --- | ---: | ---: | ---: | ---: | ---: |
| 3.5 kN, nominal swing envelope | 183.75 J | 306.25 J | 490 J | 42 N s | 0.00137 m/s |
| 4.3 kN, diagnostic envelope | 277.35 J | 462.25 J | 739.6 J | 51.6 N s | 0.00168 m/s |
| 8 kN, working ceiling | 960 J | 1600 J | 2560 J | 96 N s | 0.00313 m/s |
| 16 kN, old sacrificial link | 3840 J | 6400 J | 10240 J | 192 N s | 0.00627 m/s |

**[ASSUMED]** The wave bound concerns an otherwise straight elastic line unloading at its far end, not a universal impact or loose-cable impulse. At 3.5 kN all 490 J concentrated in the 8 kg slider corresponds to 11.1 m/s; small ship recoil does not imply harmless local hardware motion. A 4 kJ captive catcher is required for the working envelope, including the diagnostic pull. At 16 kN the 0.8 m extrapolated buffer travel is already beyond its 0.4 m working stroke and energy exceeds containment. **No controlled-survival claim applies at that load.** Long deployed lengths also raise line energy: this catcher's survival claim applies to the 30 m case, not all 500 m.

**[ASSUMED proposed failure mechanism]** While loaded, arm a mechanical abrupt-unload catch. A normal commanded release first selects a metered return path, then opens the fairlead after its latency; the buffer returns through its damper. An uncommanded break or emergency cut under load trips the captive catch and deforms the sacrificial cartridge. Cut actuation also mechanically isolates the damaged drive branch. Broken rope/head remain real detached material; retained coil is unusable as a replacement cassette. The reference gives the resulting state and energy requirements, not a finite-element validation of this mechanism.

The surviving ship has a **crushed return cartridge, jammed deployed mast (z max 3.5 m), isolated tether drive and unusable cassette** for the rest of that run. A normal planned release could later retract the mast to z max 2.8 m; the damaged ship cannot, so clearance remains worse even after leaving Borrowed Spin. Telemetry should report switches, loss of tension and faults, not reveal unseen fracture location. Save/load, mode reset and region transition must retain this state; recurrence alone restores it. A pre-capture bypass or an unloaded disarm need not damage anything. A low-load frayed-rope failure need not bend the whole frame; loss of the rope is itself permanent, while the captive-return damage requires the stated loaded trigger.

The catcher's energy capacity does not prove that the entire freed line stays inside its guard. It contains the local slider/return mechanism; the departing cable still needs swept clearance and contact treatment. Additional radiator, antenna, hull or RCS damage requires that actual debris/contact result. Do not invent a fixed penalty to an unrelated bus or kill the ship just because a line broke. A damaged ship can coast out, but a later real collision or exhausted control reserve can still cause loss.
