# S18 — Pass the load gate with a slower turning manoeuvre

**Recommendation [ASSUMED]: PASS A15's gate for a bounded prototype using an 8 kN working-rated, 275 kg kit.** Replace S1's fast 144 kN swing with the slower exchange below. This is permission-to-build evidence for the integrator, not a decision entry, a qualified spacecraft design, or a demonstrated Cathedral-to-Stillwater route. Nothing under `src/` is changed.

**[DEMONSTRATED: `tools/studies/s18/reference.py`]** On the final 2G ship, three target layouts give **17.19–17.23 m/s of useful velocity-vector change** with **3.49 kN peak tension**, **0.00592–0.00623 rad/s peak ship rate**, and **4.13–4.34 kg RCS** in the integrated interval. The existing hands-on rate is 0.008 rad/s and the star-tracker ceiling is 0.01 rad/s. A separate four-second diagnostic pull reaches at most **4.242 kN**, below the same working limit.

The main benefit is **turning an already moving ship**, not increasing its speed. Inertial speed increases only **0.048–0.112 m/s** in these vectors. Depending on release phase, the target can gain spin energy; do not show a universal “spin stolen” bonus. Both bodies translate and rotate freely under reciprocal forces. A useful direction change is valuable if the actual connecting route needs it; a speed-only exit objective would make this design pointless.

## Read, reproduce, and interpret

- [Mechanics and hardware](mechanics.md): final ship tensors, the added buffer, capture screen, electrical/thermal budgets, failure and recoil.
- [Run configurations and measurement](configurations.md): exact fixed-mass layouts, tensors, appearance, measurable torque experiment and numerical differences.
- [Integration request](integration.md): modules/contracts/model/screens, scope, acceptance and remaining owner decisions.
- [Reference guide](../../../tools/studies/s18/README.md), [generator](../../../tools/studies/s18/reference.py), [vectors](../../../tools/studies/s18/vectors.json).
- [Integrator handoff](../../handoffs/s18.md).

From `.worktrees/s18`, using installed Python and numpy:

```powershell
python tools/studies/s18/reference.py
python tools/studies/s18/reference.py --check
git diff --check
```

The generator writes JSON beside itself only after its assertions pass. `--check` regenerates in memory and compares exact bytes. No installation, network, game imports, timestamps or machine paths enter the vectors. All mechanical dimensions, ratings, sensor design errors and operational envelopes in S18 are **[ASSUMED]**. A **[DEMONSTRATED]** number verifies the stated mathematical model, not the physical qualification of those assumptions.

## The candidate that passes

**[ASSUMED]** Keep S2's one cassette, compatible rail, 500 m available rope, 8 kN working rating, 3 kW motor, 4 kW brake and independent ship-side release/cutters. Add a 20 kg damped buffer, captive recoil catcher and small launcher trim stage. Use **30 m deployed** in the accepted swing. The 500 m inventory is a maximum available length, not a required swing radius. Other deployed lengths are not certified by this gate.

| Input | Candidate value [ASSUMED] |
| --- | --- |
| Ship | Final 2G `radiators` configuration, full tanks; one-player decision retained without changing the numerical baseline inventory |
| Bare target | 2,000,000 kg; fixed 3,000 m arm reach; hub/arms plus eight fixed-mass internal ballast modules |
| Target spin | 0.004 rad/s about its body z principal axis; 1,570.80 s period, 12 m/s rail speed |
| Target attitude | Entire scenario tilted 0.6 rad about world x; full quaternion/tensor dynamics |
| Target rail | Body datum `(3000, 0, 0)` m |
| Ship fairlead | Structural datum `(-0.35, 0, 3.2)` m, S2's dorsal mount |
| Loaded initial state | 30 m line; outward normal mismatch 0.1 m/s; line initially 0.06 rad behind target radial; approximately co-rotating endpoint velocities |
| Ship command | Main off, body rate `(0, -0.004, 0)` rad/s: pitch only, roll held; real finite RCS couples |
| Release | Player-specified execution at 400 s; compare both trajectories at 420 s |
| Desired direction | `R_x(0.6) (-1,-1,0)/sqrt(2)`, chosen before integration |
| Gravity | P4 at each CoM, GM = 10¹⁰ m³/s², shared r₀ = 10⁶ m; initial target distance 3×10⁶ m from a fixed source |

**[FICTIONAL: P4]** Only gravity uses the project's changed law. Tether mechanics, force sensing and finite control authority are ordinary mechanical assumptions. No prescribed rotor, invisible motor, velocity assignment at release, or propellant refill is used.

**[DEMONSTRATED: reference, `cases`]** Each change is relative to a simultaneously integrated gravity-only coast from the identical ship state. Useful component, vector magnitude and speed gain are different quantities:

| Layout | Vector Δv (m/s) | Useful component (m/s) | Speed gain (m/s) | Peak load (N) | Peak ship rate (rad/s) | RCS (kg) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Compact | 17.22682 | 17.22620 | 0.11199 | 3485.42 | 0.006227 | 4.3405 |
| Spread | 17.18645 | 17.18535 | 0.04847 | 3490.00 | 0.005959 | 4.1344 |
| Cross | 17.19514 | 17.19409 | 0.05841 | 3490.59 | 0.005919 | 4.1752 |

**[DEMONSTRATED]** Maximum buffer travel is 0.1712 m against a proposed 0.4 m working stroke. Damper peak power is below 271 W and total heat about 290 J, including metered buffer return after release. Nominal ship-specific acceleration peaks at 0.114 m/s² (0.0116 g). Maximum delivered RCS torque norm is 275 N m, with no allocator saturation. The fully main-depleted compact case also stays inside the envelope: 2.891 kN, 0.00535 rad/s, 757 N m and 3.775 kg RCS. It needs a larger fairlead angle, 9.51°, so S2's 2° alignment target is **not** a universal prerequisite. The 35° physical cone remains unchanged.

**[DEMONSTRATED]** Releasing at 200 s yields only 8.692 m/s useful component at the common 420 s comparison. An abort can preserve the spacecraft while forfeiting much of the manoeuvre. It does not automatically reach a safe route: clearance and downstream corrections still depend on the actual geometry.

## Kit penalty and the real usefulness test

**[DEMONSTRATED: `budgets`]** Added mass is 275 kg, not hidden inside the hull residual. Installed wet mass becomes **30,649 kg**. With the baseline 6,000 kg main load and 320 s Isp, ideal full-tank main Δv falls **690.608 → 683.684 m/s**, a **6.924 m/s** installation penalty. Successful cassette release leaves 235 kg fixed kit aboard and abandons 40 kg head/rope/carrier inventory.

**[ASSUMED]** Budget another 0.5 kg RCS for establishing/stopping the reference's initial/final pitch rate; the reference starts already turning and does not claim those transitions were free. Nominal integrated RCS plus this allowance is below 4.85 kg. Its main-Isp mass equivalent is about 0.50 m/s, distinct from actual RCS translation capability. Subtracting the full installation penalty and this control allowance leaves roughly **9.8 m/s of local directional benefit before approach and correction costs**. This is a conservative planning comparison, not a same-destination propellant-saving calculation.

**[ASSUMED]** S3's proposed **10 m/s net route-saving target is not yet met by evidence**. Require paired direct/tether flights from the same Cathedral departure to the same Stillwater arrival, including rendezvous, braking and the surviving ship. Do not fund the kit by crediting the 17 m/s vector change as saved fuel automatically. The initial ~12 m/s tangential motion must already exist or be purchased by approach propulsion; the tether does not manufacture it at latch.

## What the gate does and does not establish

**[DEMONSTRATED]** The full tensor ship, finite target, a compliant series buffer, actual RCS jet geometry, P4, release continuity, work/heat and external momentum ledgers are mutually compatible in the reference. Halving h = 0.1 to 0.05 s changes compact departure position by 0.0000144 m, velocity by 0.00000378 m/s and peak tension by 0.058 N. Across the three nominal cases the worst ledger residuals are 0.247 J, 2.3×10⁻⁹ N s and 0.0058 kg m²/s.

**[ASSUMED]** This remains a low-frequency rigid-body load study. It uses endpoint-lumped cable mass, continuous-duty RCS instead of minimum impulse bits, fixed mass during the small RCS expenditure, no swept collision solver, and no detailed launcher/jaw contact. The launch screen, recoil bounds and structural requirements in [mechanics](mechanics.md) are separate from the integrated swing. The target's rigidity is an authored structural assumption, not a certification of a 6 km truss. Every one of these boundaries is an explicit next-build acceptance item.

**[ESTABLISHED: NASA primary sources]** NASA's [MXER dynamics report](https://ntrs.nasa.gov/citations/20060051891) motivates finite-body elasticity and accurate catcher motion. The [capture-mechanism study](https://ntrs.nasa.gov/citations/20070001536) treats capture, carrying and release as distinct design problems, including model and ground-prototype work. The [Tethers in Space Handbook](https://ntrs.nasa.gov/citations/19980018321) provides flight-experience context. These sources were checked for S18; none supplies the selected game kit's ratings or validates this route. Earlier source details remain in [S1](../s1/sources.md) and [S2](../s2/precedents.md).

The best next version retains all three layouts, the acquired torque experiment, active payout/braking, damage, and full ship/line clearance. A smaller first prototype can validate the compact layout and one surveyed clear rail while implementing the same interfaces for the other two. It loses variation and some investigation breadth; it must not replace A15's final variable-inertia requirement or discard the brake, damage, finite reservoir or observation boundary.
