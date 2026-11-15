# S16 reference

From the S16 worktree root, with the installed Python 3.14 and NumPy:

```powershell
python -B tools/studies/s16/generate.py
python -B tools/studies/s16/generate.py --check
```

The first command runs all assertions and writes `vectors.json` and `seeds.json`
beside the scripts. The second reruns the computation and verifies identical bytes
without writing. Do not use `-O`; it disables assertions and is rejected. No install,
network call, production physics import or machine-specific output path is needed.
The generator reads the committed baseline and checks the ratings it uses.

- `reference.py`: smooth field projection, finite variable-mass RK4/midpoint,
  exact straight coasts and sphere roots, conservative powered swept clearance,
  reachable-ball proof, and a port of the game's named seeded RNG.
- `generate.py`: independent fixtures, two crossing directions, timing/duration
  neighborhoods, wrong forecast/contact/recovery, 128-seed admission, synthetic
  initial-contact rejection, rotational and mass checks, convergence, and a finite
  upstream bypass counterexample.
- `vectors.json`: explicit inputs, commands, samples, events, expected outputs
  and tolerances for 3B. No route is offered as a player-side automatic planner.
- `seeds.json`: every raw proposal, first rejection reason, failing control where
  applicable, accepted metrics, exact denominators and rigid transforms.

All quantities are SI. Array vectors map to the game's `Vec3`; forces are already
delivered inertial forces, not attitude or throttle commands. Port the fixtures
with the documented tolerances, not Python byte equality. `--check` is a same-runtime
determinism check; platform/library last-bit variation may require regenerating a
reference only after numerical review. No volatile timestamps or local account
paths are written.

The source-free coast shortcuts are exact here. They are not safe shortcuts for
a game encounter containing massive bodies. The event locator is a fixture tool,
not a general moving-hull collision solver. See the [study](../../../docs/studies/s16/README.md)
for the committed-arrival limitation and the outstanding integration checks.
