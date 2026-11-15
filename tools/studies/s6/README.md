# S6 numerical reference

[ASSUMED] Run from this worktree's root, with installed Python 3.14 and numpy. No installation, game runtime, network access or external ephemeris is required.

```powershell
python tools/studies/s6/reference.py
python tools/studies/s6/reference.py --check
python tools/studies/s6/reference.py --report
```

[ASSUMED] The first command executes every assertion and writes deterministic UTF-8 `vectors.json` beside the script. `--check` reruns all calculations and compares the complete committed bytes without writing. `--report` calculates and prints the report without changing vectors. No timestamp, seed draw or machine path enters the JSON. Same-runtime byte reproducibility is tested; SVD/BLAS results across different numpy builds should be compared numerically, not promised bit-identical. Thirteen significant decimal digits are serialized; tiny values below 5e-14 become zero **only in output**, not in calculations.

| JSON case | What it checks | Important limit |
| --- | --- | --- |
| `clean_crossing` | Whole stowed prism, nose/tail timing, mapped exit attitude/velocity, finite rim slab | Analytic constant-speed stationary case |
| `partial_rim_clip` | Trailing radiator's first contact after nose/CoM entry | Stops at contact; no damage simulation |
| `finite_geometry_controls` | Off-disk bypass and contact between two clear tick endpoints | Analytically isolated root brackets, not general CCD |
| `moving_kinematics` | Forward/inverse state, proper rotation, derivatives, mapped spin, nonzero energy exchange | Point/CoM kinematic ledger, not full distributed energy balance |
| `distributed_force_controls` | Six-DOF all-far rebase and local gravity during partial crossing | Eight material point masses, distinct from collision hull |
| `moving_sightline` | Two-epoch moving pair, source/exit ray, remote target projection and light-time bound | Geometric ray; scene occlusion remains a production acceptance test |
| `rim_measurement_fit` | Metric labelled features recover pose and six-component twist | Noiseless fit; not a monocular estimator or a visibility proof |
| `forecast_across_boundary` | Uniform bar, continuous split gravity, entry/exit, independent analytic/RK4 agreement, local uncertainty | Stationary pair, axial motion, constant test fields; no claim of full model implementation |
| `periodic_motion` | Both moving/rotating mouths repeat at 240 s including derivatives | Geometric face-on interval, not a proven flight window |
| `aperture_tuning` | Compare spacious 12 m and candidate 6 m radii; full swept-box tilt limit | Fixed attitude, normal translation through static disk; no playability claim |

[ASSUMED] Matrices are row-major nested arrays. Quaternions are `[w,x,y,z]`, body to chart. Angular vectors labelled `spin_inertial` are chart-frame, `spin_body` is the contract representation. `far_com_image` during partial transit is a **virtual image** of an unfolded coordinate, not the CoM of the physical far fragment. Domain/phase labels in a production implementation must be explicit. Frame origins in fixtures are illustrative metre-scale offsets, not route distances.

[ASSUMED] The scalar bar integrates a uniformly distributed 16 m rigid length under `a=(1-f)*gA+f*gB`, `f=clamp((x+8)/16,0,1)`. Its exact partial solution is a forced harmonic oscillator; this is independent of the RK4 solver. The force is continuous with derivative changes at first/last entry, so this unsplit RK4 comparison does not claim fourth-order convergence through those events. The final perturbation covariance uses four independent declared belief-input uncertainties, not hidden truth parameters. It is linearized and local, not a calibrated coverage guarantee.

[ASSUMED] An independent TypeScript implementation should compare explicit state, event, ray and fit quantities in these vectors, with tolerances no weaker than those stated in [the study](../../../docs/studies/s6/README.md), then add production save/replay, CCD, photometry, ship systems and P11 checks. Sharing this Python implementation with production is not an independent verification.
