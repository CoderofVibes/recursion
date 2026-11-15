# S18 reference vectors

Run with installed Python 3.14 and numpy, from the S18 worktree root:

```powershell
python tools/studies/s18/reference.py
python tools/studies/s18/reference.py --check
```

`--check` performs the same calculations and compares byte-identical JSON without writing. Output is `vectors.json` beside the script. `--quick` is a development convenience: it checks algebra and runs the three nominal layouts but neither writes vectors nor performs the complete acceptance checks. Use the full commands for verification. No packages, random draws, network calls or application imports are used.

Inputs are the final `data/ship-baseline.json` and S2's `docs/studies/s2/hardware-fragment.json`; their relative paths and SHA-256 hashes are in the output. All new numerical hardware/content assumptions are research proposals, documented in [the study](../../../docs/studies/s18/README.md). The 1C four-crew text does not override the one-player decision, and no baseline mass is silently removed.

The coupled state is 51 floats; `state_layout` in JSON gives every offset. It carries two complete 3D rigid bodies, buffer travel, damper heat, RCS work/cost, exported cable energy, external gravitational/RCS impulse ledgers, integrated ship tether impulse, a same-start gravity-only coast, and two torque integrals for the measurement-design calculation. Quaternions are **wxyz, body to world**; angular momenta are **world frame**, unlike the game's body-frame angular-rate output.

`cases` contains three 400 s swings, executed disconnection states and 10 s samples through 420 s. `depleted_ship` repeats compact with no main propellant. `early_abort` disconnects at 200 s. `diagnostic_pulls` includes the three tangential 4 s pulls and their conditional phase/torque measurement designs. `weakened_line` and its refinement exercise a physical threshold crossing at 3 kN and the proposed persistent damage transition. `launch_screen` and `capture_payout_auxiliary` are separate analytical screens, not simulated successful rail contact. `failure_bounds` are elastic/wave/containment arithmetic, not resolved whip.

RK4 h = 0.1 s advances both bodies and all ledgers with simultaneous stages. Release executes on its declared boundary before subsequent forces; the weakened-line threshold is located with 32 bisections, then the remaining microstep is propagated disconnected. Nominal rope energy exports once at release; retained buffer energy damps aboard. At emergency failure the proposed catcher dissipates buffer energy into its sacrificial cartridge, recorded separately. Positions, velocities, quaternions and momenta do not jump. The mass-lumped model does not resolve the tiny physical separation/wave impulses; the study bounds them and requires their production treatment.

Checks cover final baseline mass/tensor, fixed-mass realizable target tensors, real jet couples, differential work/impulse identities, 3D frame covariance, unilateral force, serialized-state replay, passive inertia ambiguity, nominal/depleted/early-release load/control/thermal envelopes, refined endpoints and peaks, release continuity, diagnostic identifiability, launch geometry/energy and failure timing/energy. Floats serialize to 12 significant digits with no machine paths or timing metadata. Same-runtime byte equality is claimed; cross-platform Python/TypeScript ports use the tolerances in [integration](../../../docs/studies/s18/integration.md).

The reference deliberately omits general cable contact, a latch solver, pulsed actuators, changing fuel mass during each short arc, target flexure, a real sensor image pipeline and an expedition join. Those are listed as required integration checks. The synthetic uncertainty calculation is an experiment-design estimate, not a playtest or a validated estimator.
