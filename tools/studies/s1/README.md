# S1 reference

From the `st/s1-tether-physics` worktree root:

```powershell
python tools/studies/s1/reference.py
```

Python 3.14 and numpy only; no installation or network access. The command runs the four required outcomes at 32, 64 and 128 substeps per 1 s tick, independent differential/virtual-work checks, two auxiliary conservation/reel cases, an exact repeat, and a coarse 1 s comparison. It asserts acceptance conditions before writing `vectors.json` beside the script. Four independent processes reduce elapsed time without changing any trajectory's arithmetic order. Expect a few minutes depending on CPU contention.

For just the independent analytical checks:

```powershell
python tools/studies/s1/check_reference.py
```

`reference.py --quick` explores the four cases at 32 substeps; it does **not** regenerate golden JSON or run the full acceptance suite. No random stream is used. Repeated runs in the same Python/numpy runtime reproduce the same numerical states; cross-platform or TypeScript bitwise equivalence is not asserted.

`vectors.json` records the baseline hash/CoM, all case parameters, body masses/tensors/attachment offsets, full initial and final states, release/break states, events, 5 s samples (plus 1 s), loads, work/heat and invariant residuals. `validation` contains refinement differences and full auxiliary results. All physical quantities are SI. `peak_assembly_loads` maps equipment ID to `[peak support acceleration m/s², peak support force N]`; these are rigid-body centroid loads, not stress or qualification.

State array slices use Python's half-open convention:

| Slice | Value |
| --- | --- |
| 0:13, 13:26 | Ship and structure, each `[position xyz, velocity xyz, attitude wxyz, angular momentum xyz]` |
| 26, 27 | Accumulated dissipated energy Q, signed mechanical reel work W |
| 28:31, 31:34 | External gravitational impulse, moment of that impulse about fixed `(1e6,0,0)` |
| 34:40 | Same-start gravity-only comparison ship, position and velocity |
| 40:43 | Integrated tether impulse on ship |

Quaternion maps body to inertial; angular momentum is **world-frame**, unlike the project's body-frame angular-velocity contract. Convert with `omega_body = I_body^-1 R^T L_world`. Use quaternion equivalence when comparing attitudes (`q` and `−q` are identical). Source coordinates and the fixed diagnostic origin are in the same inertial frame.

The elastic energy removed at break/release is outside the state array in the case event/metric records. The reference is a generator, not a resumable game-state API: a save must also retain attached/broken mode, removed energy, guide topology, event cursor, parameters and pending commands. Exact same-runtime replay is tested from the initial state; save/restore and a TypeScript port remain implementation acceptance tests.

Important boundaries: capture begins with a deployed massless terminal already latched; `slack_wrap` starts with a prescribed frictionless guide route; line shape/contact/whip, hardware mass, qualified structural limits, moving gravity sources and distributed gravity-gradient torque are absent. Commands are integer-tick scheduled, while mechanical take-up and break are localized within substeps. Break detection assumes no missed interior threshold spike at the resolved step. See [the study](../../../docs/studies/s1/tether.md) for equations, measured accuracy, sources, proposed integration and play limits.
