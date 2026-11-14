# Newtonian reference trajectories in NASA GMAT

## Execution status

**Prepared; blocked on a local GMAT installation. No GMAT CSVs have been generated.**
Installed GMAT version: **not available / unverified**. On 2026-11-14, inspection
found no GMAT executable on PATH, in the Windows uninstall registry, among running
processes, or in the searched program, development, build, download, document and
per-user program directories. An installation at another path remains possible.
No software was downloaded or installed. The owner must install GMAT or identify
an existing installation before this package can meet the 1D completion gate.

[DEMONSTRATED: `python -m unittest discover -s tools/gmat -p 'test_*.py' -v`]
Ten Python integrity tests pass with synthetic data in memory and temporary
directories. They test conversion, provenance, missing/truncated input, time grid,
GM, planarity, finite numbers, initial state, units and mass checks. They **do not**
parse scripts with GMAT, execute GMAT, or establish agreement with the game.
No `package.json` exists on this branch, so `npm test` and `npm run build` are
unavailable. No game files were changed.

## Model and provenance

[ASSUMED] All four cases model an isolated point-mass Earth, with Cartesian state
in **EarthMJ2000Eq**: Earth-centered, inertial mean equator/equinox J2000 axes.
The simulation plane is its XY plane, positive angular momentum along +Z, with
`Z = VZ = 0`. Initial epoch is **21545 A1ModJulian** in every script. Time zero is
the spacecraft's initial epoch; exported seconds are elapsed A1 time, not UTC.
No rotating Earth-fixed frame, Earth translation, timezone conversion, or
screen-coordinate sign flip is involved.

[ESTABLISHED: GM02, proposed bibliography ID] The scripts explicitly set
`Earth.Mu = 398600.4415` km³/s², matching NASA GMAT's published default, hence
**mu = 398600441500000 m³/s²**. This is Earth, not a custom body.
[NASA GMAT defaults](https://github.com/nasa/GMAT/blob/main/src/gmatutil/util/GmatDefaults.hpp).

[ESTABLISHED: GM01, proposed bibliography ID] `PointMasses = {Earth}` uses
Earth's configured GM. `PrimaryBodies = {}` removes harmonic gravity; no other
point masses are present. Drag is `None`; SRP and relativity are `Off`. There are
no tides, harmonics, third bodies, atmospheric forces, or other perturbations.
C4 adds only the finite burn. [NASA ForceModel documentation](https://github.com/nasa/GMAT/blob/main/doc/help/src/Resource_ForceModel.xml).

[ASSUMED] High-accuracy integration uses **RungeKutta89**, `Accuracy = 1e-12`,
`ErrorControl = RSSStep`, initial step 1 s, minimum step 0 s, maximum step 10 s,
100 maximum step attempts, and `StopIfAccuracyIsViolated = true`.
`Propagate` stop tolerance is `1e-6` s. Accuracy is GMAT's local error-control
setting, **not a claimed global position error in meters**. Internal adaptive
steps may be shorter than the output interval. [NASA Propagator documentation](https://github.com/nasa/GMAT/blob/main/doc/help/src/Resource_Propagator.xml).

GM01–GM03 are **requested additions**, not existing entries in
`References/BIBLIOGRAPHY.md`. Direct primary-source links are supplied here until
the integrator adds them. Existing bibliography S12/S13 supplies the propulsion
relations. This package addresses A1 and the Newtonian starting model only;
the fictional inverse-2.5 law and encounter playability are outside its scope.

## Cases

[ASSUMED] Use a **10 s output interval for every case**, including initial and
final samples. C1's radius and C2's eccentricity are chosen to give exact integer
periods and avoid a shortened final output interval. Values below are rounded for
reading; the scripts and `reference.py` contain full precision.

| Case | Initial x, y (m) | Initial vx, vy (m/s) | Duration / samples |
|---|---|---|---|
| C1 circular | 7136635.453908898, 0 | 0, 7473.467171116226 | 18000 s / 1801 |
| C2 eccentric | 7136635.453908898, 0 | 0, 9462.571523903584 | 72000 s / 7201 |
| C3 hyperbolic | -74816563.4707655, -106394356.25313717 | 3866.388452394767, 4371.107228773835 | 40000 s / 4001 |
| C4 finite burn | same as C1 | same as C1 | 6120 s / 613 |

[ASSUMED] Initial mass is **1000 kg** in every case. C1–C3 use dry mass 1000 kg
with no fuel tank and no thrust. C4 uses dry mass **800 kg** plus **200 kg** fuel.

- **C1:** `r = (mu*(6000/(2*pi))^2)^(1/3)`, `vy = sqrt(mu/r)`. Period 6000 s;
  duration is three periods. Radius is about 7136.635 km, about 758.499 km above
  GMAT's 6378.1363 km equatorial reference radius [GM02].
- **C2:** period 24000 s, semimajor axis 17983194.467612 m,
  eccentricity **0.603149737008**, periapsis equal to C1's radius, apoapsis
  28829753.481315 m. Starts at periapsis and covers three periods.
- **C3:** eccentricity 1.5, negative semimajor axis with magnitude
  14273270.907818 m, same periapsis radius as C1. Starts 20000 s before periapsis
  and ends 20000 s after. Both endpoints are about 130066433.840921 m from Earth,
  about 18.22 periapsis radii. With `a = abs(SMA)` and `n = sqrt(mu/a^3)`, solve
  `e*sinh(H)-H = n*t_peri`; use `x=a*(e-cosh(H))`,
  `y=a*sqrt(e^2-1)*sinh(H)` and their time derivatives. Periapsis is an output
  sample at elapsed 20000 s. The initial radial motion is inward; final is outward.
- **C4:** thrust **1000 N**, specific impulse **320 s**, continuously prograde
  from **t=0 to t=120 s**, then coast **6000 s**. Here "one period" explicitly
  means the **original C1 period**, not the changed post-burn orbital period.
  These are illustrative chemical-propulsion test values, not approved game hardware.

[ESTABLISHED: GM03, proposed bibliography ID] C4 uses a ChemicalThruster in
`Local` / Earth / `VNB` with direction `(1,0,0)`: its first axis tracks the
instantaneous velocity, including any radial velocity. It is not a frozen initial
direction or the transverse axis of an LVLH frame. `C1=1000`, `K1=320`, all other
C/K coefficients zero, duty cycle and thrust scale 1, and `DecrementMass=true`
give constant thrust/Isp with fuel depletion. [NASA finite-burn example](https://github.com/nasa/GMAT/blob/main/application/samples/Ex_FiniteBurn.script).

[ESTABLISHED: S12, S13] With standard gravity explicitly set to 9.80665 m/s²,
`dm/dt = -F/(Isp*g0)` during thrust. Thus the chosen burn consumes
38.2393579866723 kg, leaves **961.7606420133277 kg**, and has ideal accumulated
thrust delta-v **122.354581889281 m/s** from `Isp*g0*ln(m0/mf)`.
Mass stays constant after cutoff. That delta-v is not the difference in orbital
speed magnitudes during a gravity-affected burn. [NASA specific impulse](https://www.grc.nasa.gov/www/BGH/specimp.html),
[NASA rocket equation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/ideal-rocket-equation/).

## Run and regenerate

These are preparation instructions; **none of the GMAT execution steps has yet
been verified on this machine**. Use an owner-installed GMAT desktop release and
record the exact release/build from Help/About and its log. Do not label a run
with an assumed version. Python 3.10+ standard library suffices for the helper;
Python 3.14 was available for the local integrity tests. No pip packages are needed.

From the repository root in PowerShell:

```powershell
python tools/gmat/reference.py scripts --check
python -m unittest discover -s tools/gmat -p 'test_*.py' -v
```

1. In GMAT, open and run each of these scripts through the script interface:
   `tools/gmat/c1-circular.script`, `c2-eccentric.script`,
   `c3-hyperbolic.script`, and `c4-finite_burn.script`. They are independent
   missions; do not append them into one mission or reuse a modified spacecraft.
2. Inspect the message window/log for parse errors, failed accuracy, failed stop
   conditions, or incomplete mission execution. Resolve any such issue before
   accepting output. Scripts remain **unvalidated GMAT inputs** until this succeeds.
3. Each script writes `<case>.raw.csv` to GMAT's configured **OUTPUT_PATH**.
   The path is relative to GMAT's output configuration, not this repository's cwd.
   Use fresh output or remove only these four old reports before rerunning, so an
   old file cannot stand in for a failed run. Preserve the raw reports and GMAT log
   locally as run evidence. Neither belongs in the committed SI vector directory.
4. Convert each case, or all four at once, using the actual output path and version:

```powershell
# Replace both values with the actual installation/output and recorded release/build.
$rawDir = 'C:\path\to\GMAT\output'
$gmatVersion = 'actual-release-and-build-from-About'
python tools/gmat/reference.py convert --raw-dir "$rawDir" --gmat-version "$gmatVersion" --case C1
python tools/gmat/reference.py convert --raw-dir "$rawDir" --gmat-version "$gmatVersion" --case C2
python tools/gmat/reference.py convert --raw-dir "$rawDir" --gmat-version "$gmatVersion" --case C3
python tools/gmat/reference.py convert --raw-dir "$rawDir" --gmat-version "$gmatVersion" --case C4
# Equivalent batch form:
python tools/gmat/reference.py convert --raw-dir "$rawDir" --gmat-version "$gmatVersion"
python tools/gmat/reference.py verify
```

5. Repeat the GMAT runs and conversion; compare CSV hashes with
   `Get-FileHash tests/vectors/gmat/*.csv -Algorithm SHA256`. Identical inputs on
   the same build should regenerate identical files; investigate differences.
   Cross-version bitwise identity is not assumed. Update this status, the vector
   README and the handoff with actual version, logs/check results and any changes;
   only then commit the generated vectors.

The helper resolves repository paths from its own location. `scripts` without
`--check` rewrites the four scripts from the declared cases. If GMAT reveals a
script compatibility issue, fix `reference.py`, regenerate the scripts, rerun
the Python checks, and regenerate all affected vectors. The converter refuses
scripts that differ from the generator. No unattended CLI launcher is supplied:
GMAT CLI flags/build behavior still need checking against the installed version.

## Output contract and checks

[ESTABLISHED: GM01, proposed bibliography ID] Scripts disable automatic
`ReportFile` output (`WriteReport=false`) and issue explicit `Report` commands
at t=0 and after each 10 s propagation. Each `ElapsedSecs=10` stopping condition
advances another 10 s; an increasing cumulative RHS would be wrong. The reported
elapsed parameter is initialized by the t=0 report. [NASA ReportFile documentation](https://github.com/nasa/GMAT/blob/main/doc/help/src/Resource_ReportFile.xml),
[NASA stop-condition implementation](https://github.com/nasa/GMAT/blob/main/src/base/stopcond/StopCondition.cpp).

Raw reports contain nine numeric columns without a header:

```text
elapsed_s,x_km,y_km,z_km,vx_km_s,vy_km_s,vz_km_s,mass_kg,configured_mu_km3_s2
```

`configured_mu_km3_s2` repeats the pinned setup constant; it is **not a measured
runtime GM**. The script hash and Kepler checks support the configuration audit.

[ASSUMED] Conversion multiplies x/y and vx/vy by 1000, and GM by 10^9;
seconds and kg need no conversion. It checks exact row count, finite values,
configured GM, the initial state, and out-of-plane limits of 1e-6 m in z and
1e-9 m/s in vz. It requires measured elapsed times within 1e-5 s of the integer
10 s grid, then normalizes only that bounded timing roundoff. States are never
interpolated; the maximum time adjustment is recorded. If the installed build
cannot meet this, investigate its epoch/stop handling instead of silently
relaxing the check. At periapsis the largest possible adjustment corresponds
to less than about 0.12 m of travel for these cases.

The committed format is one `# ` JSON header with version, frame, epoch, GM,
initial state, burn parameters, interval, script/raw SHA-256 hashes and validation
metrics, followed by:

```text
t_s,x_m,y_m,vx_mps,vy_mps,mass_kg
```

[ASSUMED] Converter sanity limits are 0.25 m / 0.0005 m/s versus the analytic
Kepler solution at every C1–C3 sample, and 1e-7 kg for the coast-only mass law.
C4 allows 1e-7 kg plus mass flow times the 1e-5 s timing allowance (about
3.29e-6 kg total), including rounding across cutoff. C4 must
start at C1, lose the stated mass, gain orbital energy during the burn and
conserve coast energy within 0.1 J/kg and angular momentum within 1e-9 relative.
These checks catch gross mistakes but do **not** independently prove C4's full
powered trajectory. Inspect thrust configuration and perform the tighter rerun
below. Synthetic analytic fixtures are used only by Python integrity tests and
are never committed as GMAT reference vectors.

## Comparison tolerance for phase 2A

[ASSUMED] A provisional acceptance target for a double-precision, fixed-step
**RK4 integrator with step <=1 s** is, across **all** 10 s samples of each full run:

```text
max hypot(x_game-x_ref, y_game-y_ref) <= 1 m
max hypot(vx_game-vx_ref, vy_game-vy_ref) <= 0.001 m/s
max abs(mass_game-mass_ref) <= 1e-5 kg
```

These bounds are a proposed regression requirement, **not measured agreement**.
Use exactly the stated GM, state, epoch convention, thrust direction, mass law
and cutoff. Integrate mass and velocity-dependent thrust at the integrator's
stages. Stop thrust exactly at 120 s, before the next coast step; do not smear
the burn switch over a step. Samples include cutoff only once.

Use a game step that divides 10 s and 120 s (for example 1, 0.5, 0.1 or 1/60 s),
and index samples by integer step count to avoid floating-time drift. Compare
full vector errors, not radius/speed alone, final state alone, or energy alone.
Position error from interpolation between coarse samples must not be mistaken
for propagation error. Verlet, symplectic Euler or larger fixed steps need their
own convergence measurement; the RK4 target is not a universal accuracy claim.

Before adopting the vectors, rerun a **local copy** of each script with
`Accuracy=1e-13` and `MaxStep=5` into separate raw reports. Compare the baseline
and tighter raw states at matching times; seek <=0.1 m and <=0.0001 m/s maximum
differences. Do not feed altered scripts to the baseline provenance converter.
Halve the game step and check convergence against the GMAT result; a persistent
offset warrants checking configuration or units, not simply widening tolerance.
The tighter GMAT run may encounter roundoff limits; retain the actual outcome.
Both the convergence audit and game comparison are **pending execution**.

## Submission paragraph

**Accurate now, ready to paste:**

> We prepared four reproducible NASA GMAT cases to check Recursion's starting
> Newtonian flight model: circular and eccentric orbits, a hyperbolic flyby, and
> a finite prograde burn with propellant depletion. The scripts isolate planar
> point-mass gravity and define a common SI export format. GMAT execution and
> comparison with the game remain pending; this preparation does not validate
> the game's fictional gravity law.

**Use only after successful GMAT execution and vector regeneration:**

> We used NASA's General Mission Analysis Tool (GMAT) to generate independent
> reference trajectories for Recursion's starting Newtonian flight model. Four
> reproducible planar cases cover circular and eccentric orbits, a hyperbolic
> flyby, and a finite prograde burn with propellant depletion. High-accuracy
> point-mass propagation is exported in SI units for comparison with the game's
> fixed-step integrator. This reference work covers ordinary gravity and rocket
> dynamics, not the game's fictional inverse-2.5 gravity law.

Do not claim that the game passed these comparisons until phase 2A actually does.
