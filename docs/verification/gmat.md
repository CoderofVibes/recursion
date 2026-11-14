# Newtonian reference trajectories in NASA GMAT

## Execution status

**Complete. All four cases have been run in GMAT R2026a, converted to SI CSVs,
verified, rerun with byte-identical output, and audited with a tighter propagator.**

| Item | Recorded value |
|---|---|
| GMAT release | **R2026a** (official NASA distribution, SourceForge project `gmat`, folder `GMAT-R2026a`, dated 2026-04-03) |
| Package | `gmat-win-R2026a.zip`, 403,517,137 bytes, MD5 `e6248b1a776c952c3dda0bedda7f1f19` (matches the MD5 SourceForge publishes), SHA-256 `f7b00bdeb51e75f5f0a93380a97109f0505e75396f69a43cd5583c21f5fed9fc` |
| Build | `GmatConsole.exe` build date **Mar 26 2026 15:02:55** (from `--version` and every run log); `GmatConsole.exe` SHA-256 `36c880ad6c3f5e69b2e7e90c9d9cec4086eced9c1073fc5b289966d54db15f5f` |
| Installed | 2026-11-14 with the owner's approval: portable zip unpacked to `%LOCALAPPDATA%\Programs\GMAT\R2026a` (no installer, no admin rights, no registry changes) |
| Runner | `GmatConsole.exe --startup_file <copy> --logfile <log> --run <script>`, driven by `tools/gmat/reference.py run` |
| Host | Windows 11 Home 10.0.26200, Python 3.14.2 for the helper |

The release name comes from the package's own `README.txt` ("Version R2026a"); the
console prints only the build date. The GUI's Help/About was not opened.

## Model and provenance

[ASSUMED] All four cases model an isolated point-mass Earth, with Cartesian state
in **EarthMJ2000Eq**: Earth-centered, inertial mean equator/equinox J2000 axes.
The simulation plane is its XY plane, positive angular momentum along +Z, with
`Z = VZ = 0`. Initial epoch is **21545 A1ModJulian** in every script. Time zero is
the spacecraft's initial epoch. No rotating Earth-fixed frame, Earth translation,
timezone conversion, or screen-coordinate sign flip is involved. The dynamics do not
depend on the epoch (no ephemeris-dependent force), so the absolute epoch is a label.

[ESTABLISHED: GM02] The scripts explicitly set
`Earth.Mu = 398600.4415` km³/s², matching NASA GMAT's published default, hence
**mu = 398600441500000 m³/s²**. This is Earth, not a custom body. GMAT echoes the
configured value in every report row (`398600.44150000002` at 17 digits).
[NASA GMAT defaults](https://github.com/nasa/GMAT/blob/main/src/gmatutil/util/GmatDefaults.hpp).

[ESTABLISHED: GM01] `PointMasses = {Earth}` uses
Earth's configured GM. `PrimaryBodies = {}` removes harmonic gravity; no other
point masses are present. Drag is `None`; SRP and relativity are `Off`. There are
no tides, harmonics, third bodies, atmospheric forces, or other perturbations.
C4 adds only the finite burn. [NASA ForceModel documentation](https://github.com/nasa/GMAT/blob/main/doc/help/src/Resource_ForceModel.xml).
[DEMONSTRATED: GMAT R2026a runs] Every reported Z and VZ is exactly 0, and C1–C3
agree with closed-form two-body solutions to millimetres (results below).

[ASSUMED] High-accuracy integration uses **RungeKutta89**, `Accuracy = 1e-12`,
`ErrorControl = RSSStep`, initial step 1 s, minimum step 0 s, maximum step 10 s,
100 maximum step attempts, and `StopIfAccuracyIsViolated = true`.
`Propagate` stop tolerance is `1e-6` s (see the timing section for why it cannot
usefully be tighter). Accuracy is GMAT's local error-control setting, **not a global
position error in meters**; the measured global error is reported below.
[NASA Propagator documentation](https://github.com/nasa/GMAT/blob/main/doc/help/src/Resource_Propagator.xml).

GM01–GM04 are in `References/BIBLIOGRAPHY.md` (added by the integrator on
2026-11-14). Existing bibliography S12/S13 supplies the propulsion
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

[ESTABLISHED: GM03] C4 uses a ChemicalThruster in
`Local` / Earth / `VNB` with direction `(1,0,0)`: its first axis tracks the
instantaneous velocity, including any radial velocity. It is not a frozen initial
direction or the transverse axis of an LVLH frame. `C1=1000`, `K1=320`, all other
C/K coefficients zero, duty cycle and thrust scale 1, and `DecrementMass=true`
give constant thrust/Isp with fuel depletion. [NASA finite-burn example](https://github.com/nasa/GMAT/blob/main/application/samples/Ex_FiniteBurn.script).

[ESTABLISHED: S12, S13] With standard gravity explicitly set to 9.80665 m/s²,
`dm/dt = -F/(Isp*g0)` during thrust. Thus the chosen burn consumes
38.2393579866723 kg, leaves **961.7606420133277 kg**, and has ideal accumulated
thrust delta-v **122.354581889281 m/s** from `Isp*g0*ln(m0/mf)`.
Mass stays constant after cutoff. [NASA specific impulse](https://www.grc.nasa.gov/www/BGH/specimp.html),
[NASA rocket equation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/ideal-rocket-equation/).

[DEMONSTRATED: `c4-finite_burn.csv`] GMAT's C4 burn ends with mass
**961.760641851321 kg** (1.62e-7 kg below ideal, see timing below), speed
7595.187 m/s (a gain of 121.720 m/s, less than the ideal 122.355 m/s because the
orbit climbs 614 m during the burn, and that climb costs about 0.63 m/s of speed),
radius 7137.249 km, and outward radial velocity 15.4 m/s. The coast
orbit has a = 7380.266 km, e = 0.03299, period 6309.85 s, so the 6000 s coast ends
short of one post-burn revolution, at (6998.260, -1439.679) km.

## Run and regenerate

Python 3.10+ standard library suffices; no pip packages. From the repository root
(PowerShell shown; Git Bash works with `$VAR` syntax):

```powershell
$gmatBin = "$env:LOCALAPPDATA\Programs\GMAT\R2026a\bin"   # wherever GMAT is unpacked
$runs = "$env:LOCALAPPDATA\Programs\GMAT\recursion-1d-runs"   # outside the repository
$gmatVersion = 'GMAT R2026a, Windows gmat-win-R2026a.zip, GmatConsole build date Mar 26 2026 15:02:55'

python tools/gmat/reference.py scripts --check
python -m unittest discover -s tools/gmat -p 'test_*.py' -v
python tools/gmat/reference.py run --gmat-bin $gmatBin --out-dir "$runs\baseline-1"
python tools/gmat/reference.py convert --raw-dir "$runs\baseline-1" --gmat-version $gmatVersion
python tools/gmat/reference.py verify
```

What `run` does, per case: refuses a non-empty output directory (so an old report
cannot stand in for a failed run); copies GMAT's `gmat_startup_file.txt` there with
only `OUTPUT_PATH` changed; runs the committed script with `GmatConsole.exe` from the
GMAT `bin` directory; saves `<case>.gmat.log` and `<case>.stdout.txt`; fails if GMAT
exits nonzero, if the log lacks "Successfully interpreted the script" or "Mission
run completed.", or if any log line mentions error, warning, exception, failure,
abort or violation; and writes `manifest.json` with the GMAT build date, executable
hash, script hashes and raw-report hashes. `convert` cross-checks the raw files
against that manifest and copies the build date and executable hash into each CSV
header. The raw reports, logs and manifests are run evidence kept outside the
repository; they are not committed.

Every log contains three notices that are expected and harmless here:
`*** Library "..\plugins\libPythonInterface_py312" did not open.` (and the same for
`libMatlabInterface` and `libFminconOptimizer`). Those optional plugins need Python
3.12, MATLAB or fmincon; these scripts use none of them. GMAT also loads its default
DE405 and SPICE kernels at mission start; the point-mass model never queries them.

To reproduce and audit:

```powershell
python tools/gmat/reference.py run --gmat-bin $gmatBin --out-dir "$runs\baseline-2"
Get-FileHash "$runs\baseline-1\*.raw.csv", "$runs\baseline-2\*.raw.csv" -Algorithm SHA256
python tools/gmat/reference.py run --gmat-bin $gmatBin --out-dir "$runs\tight-1" --variant tight
python tools/gmat/reference.py compare --baseline-dir "$runs\baseline-1" --tight-dir "$runs\tight-1"
python tools/gmat/reference.py feasibility --step 1
```

The `tight` variant is generated into the run directory (never into `tools/gmat`)
with only `Accuracy = 1e-13`, `MaxStep = 5`, the raw file name and an audit comment
changed; `convert` refuses its directory. GMAT can also be run by hand: open each
script in the GMAT GUI or `GmatConsole <script>`; reports then land in GMAT's own
`output` folder, and `convert --raw-dir` can point there (without a manifest).

The scripts are generated: to change one, edit `reference.py`, run
`python tools/gmat/reference.py scripts`, rerun the Python checks, rerun GMAT and
reconvert all affected vectors. `convert` and `verify` refuse scripts that differ
from the generator or from the hash recorded at conversion.

## Results (GMAT R2026a, 2026-11-14)

[DEMONSTRATED: `reference.py run`, `convert`, `verify`, `compare`] All four scripts
parsed and ran with no errors or warnings (0.11–0.74 s each). Errors are maxima over
every 10 s sample, against solutions computed independently of GMAT:
closed-form Kepler for C1–C3; for C4, a converged fixed-step RK4 (0.05 s; 8e-9 m
change when the step is quartered) of the stated burn model for 0–120 s, and
Kepler f-and-g propagation from GMAT's own 120 s state for the coast.

| Case | Rows | Independent check: position / velocity | Mass error | Reported-time drift | Tight vs baseline: position / velocity |
|---|---:|---|---|---|---|
| C1 | 1801 | Kepler 5.30 mm / 5.55e-6 m/s | 0 | 2.48e-4 s | 4.88 mm / 5.11e-6 m/s |
| C2 | 7201 | Kepler 1.34 mm / 1.11e-6 m/s | 0 | 9.89e-4 s | 1.66 mm / 1.38e-6 m/s |
| C3 | 4001 | Kepler 2.16 mm / 1.43e-6 m/s | 0 | 5.49e-4 s | 0.33 mm / 2.17e-7 m/s |
| C4 | 613 | burn RK4 3.86 mm / 4.01e-6 m/s; coast Kepler 1.35 mm / 1.39e-6 m/s | 1.62e-7 kg | 8.44e-5 s | 9.10 mm / 9.13e-6 m/s (mass 2.1e-7 kg) |

The tight run is within the guide's targets (≤0.1 m, ≤1e-4 m/s) by at least 11×,
and itself agrees with the independent solutions to 0.3–2.5 mm.
[DEMONSTRATED: repeat run] A second baseline run produced byte-identical raw
reports, and reconverting it reproduced the committed CSVs byte for byte:

| Case | Raw report SHA-256 (both runs) | Committed CSV SHA-256 |
|---|---|---|
| C1 | `313aa008c696c959bc3cd84f142081240b00ef0756068d8a6b4663425bdcbc8f` | `34c2b263492cebf9e91f36b54a92fb2bb36b1f5eda68cc413bcf5078b2f440c5` |
| C2 | `d11763ffb38c7a822dbe6d2528393e1cbbf3176fe16abd3abc879a5d70d511e7` | `4c6fcdbe826c2fa84160804f22c4e55ff66fb6f13da63083937bcf7d7dec8d1d` |
| C3 | `0a945f6750d6e97c2b8e18cdc93da9ff4aa0ca1c33136e15c86c1e6c3bfbfd00` | `15557b395bb8286b7fbdec13578ef4d9aa6d8e575a98c80a2bdd56b805bc1948` |
| C4 | `ef8a950610d3d968277d2932dacfa22b482a19c999accbc98c4920c34f3c0d87` | `eb127d8c65c24aed0ec20c4abae4d831508e11cd6f1160a8f09cd73b04760b6b` |

Bitwise identity is expected only for the same build on the same platform.

## GMAT behaviours found and how they are handled

1. **Report delimiter.** `Delimiter = Comma` is accepted without complaint but taken
   literally: R2026a separated fields with the letter `C`. The generator now writes
   `Delimiter = ','` (the form GMAT's own samples use).
2. **Reported elapsed time is quantized epoch arithmetic.** GMAT keeps the spacecraft
   epoch as a double A1 Modified Julian date. Near 21545 that resolves 2^-38 day =
   **3.143e-7 s**, and every reported `ElapsedSecs` was an exact multiple of it. Each
   10 s propagation advanced the epoch by 31815 such units (+0.437 unit, +1.37e-7 s,
   too much), and by one more unit on the first two stops, so the reported time
   drifts steadily: 2.48e-4 s by C1's end, 9.89e-4 s by C2's.
   The **propagation itself lasts 10 s per stop**: C1 matches Kepler to 5.3 mm at
   the exact grid time `10*n` but misses by **1.85 m** at the reported time.
   The along-track timing offset is set in the first one or two stops
   (+7.1e-7 s C1, +5.0e-8 s C2, +1.8e-7 s C3, +5.1e-7 s C4 burn start) and then stays
   constant to within ~3e-9 s. Handling: the converter writes `t_s = 10*n` (sample index,
   never interpolated); it accepts a reported time only within
   `1e-5 s + n * 3.143e-7 s` of the grid (which still rejects a missing, duplicated or
   cumulative-duration sample) and records the drift in the header's `checks`; all
   physics checks use grid time. The first-stop offset explains C4's 1.62e-7 kg extra
   propellant (5.1e-7 s at 0.3187 kg/s) and most of the millimetre residuals.
3. **Stop tolerance floor.** GMAT measures the achieved stop with the same epoch.
   With `StopTolerance = 1e-9` or `1e-12` every one of C1's 1800 stops logged
   `**** WARNING **** ... the achieved stop is outside of the stopping tolerance ...
   for time based stops; the difference from the desired value is 1.373701e-07`
   (4.516914e-07 on the first two) and accuracy did not improve. `1e-6` s is the
   tightest decade that runs clean, so it is kept; `run` treats any such warning as
   a failure.
4. **Elapsed-time stopping conditions are durations**, as expected: each
   `Sat.ElapsedSecs = 10` advanced another 10 s, confirmed by the 1801/7201/4001/613
   row counts and the Kepler match. [NASA stop-condition implementation](https://github.com/nasa/GMAT/blob/main/src/base/stopcond/StopCondition.cpp).

## Output contract and checks

[ESTABLISHED: GM01] Scripts disable automatic
`ReportFile` output (`WriteReport=false`) and issue explicit `Report` commands
at t=0 and after each 10 s propagation; R2026a honours explicit `Report` commands
with `WriteReport=false`. [NASA ReportFile documentation](https://github.com/nasa/GMAT/blob/main/doc/help/src/Resource_ReportFile.xml).

Raw reports contain nine comma-separated numeric columns without a header:

```text
elapsed_s,x_km,y_km,z_km,vx_km_s,vy_km_s,vz_km_s,mass_kg,configured_mu_km3_s2
```

`configured_mu_km3_s2` repeats the pinned setup constant; it is **not a measured
runtime GM**. `elapsed_s` is GMAT's epoch-derived value described above.

[ASSUMED] Conversion multiplies x/y and vx/vy by 1000, and GM by 10^9; seconds and
kg need no conversion. It checks: exact row count; finite values; configured GM;
out-of-plane limits of 1e-6 m in z and 1e-9 m/s in vz; the reported-time bound above;
initial state within 1e-6 m and 1e-9 m/s; mass within 1e-7 kg of the mass law at
grid time (C4 adds mass flow × 1e-5 s, 3.29e-6 kg in total); C4 energy gain during
the burn and coast conservation of energy (0.1 J/kg) and angular momentum (1e-9
relative); and **0.05 m / 5e-5 m/s** against the independent solutions above
(observed ≤5.3 mm / 5.6e-6 m/s). Tests confirm the C4 audit rejects an inertially
fixed thrust axis, a 1 % thrust error and a coast mistimed by 0.01 s.

The committed format is one `# ` JSON header (case, GMAT version string, run build
date and executable hash, frame, epoch, GM, initial state, burn parameters,
interval, time-column convention, propagator settings, script/raw SHA-256 hashes
and the `checks` above), followed by:

```text
t_s,x_m,y_m,vx_mps,vy_mps,mass_kg
```

## Comparison tolerance for phase 2A

[DEMONSTRATED: `reference.py feasibility`] A plain double-precision fixed-step RK4
of the stated model (Python, **not the game**) reproduces every sample of all four
vectors within **5.7 mm, 5.6e-6 m/s and 1.62e-7 kg** at steps of 1, 0.5 and 0.1 s,
and at 1/60 s for C1, C3 and C4 (C2 not run at 1/60 s). The residual is the
reference's own sub-microsecond stop timing, not RK4 truncation, which is already
negligible at 1 s for these orbits. Substituting the WGS-84 GM (3.986004418e14
m³/s²) for GMAT's moves the 1 s results by **0.197 m (C1), 3.36 m (C2), 0.110 m
(C3) and 0.081 m (C4)**.

[ASSUMED] Recommended acceptance for a double-precision, fixed-step **RK4 with a
step that divides 10 s and is ≤1 s**, across **all** samples of each full run:

```text
max hypot(x_game-x_ref, y_game-y_ref)     <= 0.05 m
max hypot(vx_game-vx_ref, vy_game-vy_ref) <= 5e-5 m/s
max abs(mass_game-mass_ref)               <= 1e-6 kg
```

This leaves ~9× headroom over the measured RK4 agreement and ~5× over the GMAT
baseline-vs-tight spread, yet fails the WGS-84 GM mix-up in every case. The earlier
provisional bound (1 m / 0.001 m/s / 1e-5 kg) would let that mistake through in
C1, C3 and C4 and should be used, if at all, only as a coarse gate for integrators
whose own convergence has been measured. These bounds are a proposed regression
requirement for 2A; **no game comparison has been run**.

Use exactly the stated GM, state, thrust direction, mass law and cutoff. Integrate
mass and velocity-dependent thrust at the integrator's stages. Stop thrust exactly at
120 s, before the next coast step; do not smear the burn switch over a step. Index
samples by integer step count to avoid floating-time drift, and compare full vector
errors, not radius/speed alone, final state alone, or energy alone. Position error
from interpolation between coarse samples must not be mistaken for propagation error.
Verlet, symplectic Euler or larger fixed steps need their own convergence
measurement; halve the step and check the result moves toward the GMAT vector. A
persistent offset warrants checking configuration or units, not widening tolerance.

## Limitations

- One GMAT build on one platform (R2026a, Windows). Other builds may differ by
  millimetres; bitwise identity across builds is not expected.
- Reference accuracy is about 1 cm, set by GMAT's stop timing and epoch resolution
  rather than its integrator. That is ample for the game, but do not quote these
  vectors as better than ~1 cm / 1e-5 m/s.
- C4's powered arc has no closed form. It is checked against an independent
  integration of the same stated model, which confirms GMAT applied that model
  (thrust along instantaneous velocity, 1000 N, constant mass flow, 120 s), not that
  the model is physically complete (no throttle transients, no attitude dynamics).
- Planar, point-mass Earth only. Nothing here exercises perturbations, 3D motion or
  the game's fictional inverse-2.5 gravity law.

## Submission paragraph

**Ready to paste (GMAT runs and the game comparison are both complete):**

> We used NASA's General Mission Analysis Tool (GMAT R2026a) to generate independent
> reference trajectories for Recursion's starting Newtonian flight model. Four
> reproducible planar cases cover a circular orbit, an eccentric orbit, a hyperbolic
> flyby, and a two-minute prograde engine burn with propellant depletion followed by a
> coast. GMAT propagated each case with a high-accuracy point-mass Earth model, and we
> exported the results in SI units every 10 seconds. Repeat runs were bit-for-bit
> identical, and the trajectories agree with independent orbit solutions to within
> about a centimetre. The game's own fixed-step integrator matches all four GMAT
> references to within 2.2 cm, run at 6–25 millisecond steps because these low Earth
> orbits turn about ten times faster than the game's encounters. The comparison covers
> ordinary gravity and rocket dynamics, not the game's fictional inverse-2.5 gravity law.

Measured by 2A in `src/sim/gmat.test.ts` (DECISIONS D4, P17). Keep the step sizes in
any shortened version of the claim.
