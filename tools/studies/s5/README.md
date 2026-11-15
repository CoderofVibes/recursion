# S5 reference

From the S5 worktree root, using the installed Python 3.14 and numpy:

```powershell
python -B tools/studies/s5/generate.py
python -B tools/studies/s5/generate.py --check
```

The first command runs all numerical assertions and writes `vectors.json` beside
the scripts. The second repeats the calculations and verifies identical bytes
without writing. Do not use `-O`, which disables assertions. No installation,
network access, game imports, clock input or random seed is needed.

`wells_reference.py` compares explicit midpoint and RK4, checks well projection,
overlap composition, annulus, fuel/work ledgers, coast equivalence and shell times.
`lattice_reference.py` compares geometric and integrated exposure calculations with
analytic results, finite-segment and swept-volume bounds, component damage events
and an independent rigid frame change. Source comments mark fixture-specific
algorithms; these modules are not production collision or sensor implementations.

JSON uses SI geometry/time/mass/energy, with `U` and `U s` explicitly fictional.
Every fixture supplies input values as well as expected output. Use tolerances in
the study for a TypeScript implementation, rather than byte equality with Python.
The byte check is a same-runtime replay check; numpy/BLAS or platform differences
can change last-bit floating-point results. The scripts contain no game RNG and
do not test noisy reconstruction or the complete condition/power/thermal loop.

See [the study](../../../docs/studies/s5/README.md) for assumptions, build requests,
remaining tests and owner questions. Neither numerical convergence nor the
eight-sheet geometry example proves route playability.
