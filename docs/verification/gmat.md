# Newtonian reference trajectories in NASA GMAT

## Execution status

**Complete. All four cases have been run in GMAT R2026a, converted to SI CSVs,
verified, rerun with byte-identical output, and audited with a tighter propagator.**

**Extended by thread 2G (2026-11-14), after flight became three-dimensional
(DECISIONS A11): three inclined cases, C5–C7, were run in the same GMAT build with
the same runner, converted, verified, rerun byte for byte and audited the same way.**
They are described in [Inclined cases C5–C7](#inclined-cases-c5c7-thread-2g) below;
everything above that section is 1D's record of the planar cases and still holds.
2G's run also re-executed C1–C4 and reproduced 1D's raw reports and vectors byte for
byte, so the four planar vectors are unchanged.

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

**The game has been compared with all seven cases** (below). Two sections further down,
[Comparison tolerance for phase 2A](#comparison-tolerance-for-phase-2a-historical) and
[Comparison tolerance for the game's 3D simulation](#comparison-tolerance-for-the-games-3d-simulation-historical),
were written before any comparison existed and are kept as the record of how the
bounds were chosen; where they recommend an RK4 integrator or say that no game
comparison has been run, they are historical.

## The game comparison (final method and results)

[DEMONSTRATED: `src/sim/gmat.test.ts`; DECISIONS D4 and P17 for C1–C4, thread 2G
checkpoint 2 (commit `034ce57`) for C5–C7]

**Method.** The game's own propagator (`src/sim`, the fixed-step kick–drift–kick
velocity Verlet it flies with), not RK4, starting from each vector's first row in the
vector's own axes, compared at **every** 10 s sample of each full run against P17's
bounds: **0.05 m, 5×10⁻⁵ m/s and 1×10⁻⁶ kg**, as norms over all components. The error
falls about 4× per halving of the step with no floor or offset (shown for C1 and C4,
and for C5 and C6), so the law, units, thrust and mass handling agree with GMAT. For
the burns the test harness acts as a perfect attitude controller: C4's thrust follows
the instantaneous velocity, C6's stays along the header's inertial direction with the
ship at a fixed attitude; the mass is taken at the middle of each step.

| Case | Step | Worst position | Worst velocity |
|---|---|---|---|
| C1 circular, 3 periods | 0.0125 s | 13 mm | 1.4×10⁻⁵ m/s |
| C2 eccentric e ≈ 0.6, 3 periods | 0.00625 s | 22 mm | 1.8×10⁻⁵ m/s |
| C3 hyperbolic flyby | 0.025 s | 14 mm | 2.4×10⁻⁶ m/s |
| C4 120 s prograde burn and coast | 0.025 s | 5.7 mm | 5.5×10⁻⁶ m/s |
| C5 inclined eccentric, 3 periods | 0.025 s | 13 mm | 1.2×10⁻⁵ m/s |
| C6 200 s burn along a fixed inertial direction, and coast | 0.0125 s | 13 mm (mass within 4.3×10⁻⁷ kg) | 1.3×10⁻⁵ m/s |
| C7 inclined retrograde hyperbolic flyby | 0.025 s | 14 mm | 2.6×10⁻⁶ m/s |

**Step sizes.** These low Earth orbits turn about ten times faster than the game's
encounters and the bounds are relative 7×10⁻⁹, hence steps of 6.25–25 ms; at the
game's 1 s play step they would miss by metres. Accuracy at the play step is shown
separately, at the game's own scale, by the physics vectors (`tests/vectors/`).
Quote the steps with any claim made from this table.

**C6 converges to about 10 mm, not to zero.** That is the GMAT reference's own burn
stop-time residual (10.2 mm in the RK4 check below), not a floor in the game's
integrator.

**Newtonian only.** Point-mass Earth, no perturbations. Nothing here tests the game's
fictional inverse-2.5 law, more than one attracting body, the game's length and time
scales, attitude dynamics, or a thrust direction that follows the velocity out of the
plane.

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

Since 2G these commands cover all seven cases. `--case planar` (C1–C4),
`--case inclined` (C5–C7) or a single case restricts `run`, `convert`, `verify`,
`compare` and `feasibility`. `scripts` and `convert` leave a file alone when it
already holds exactly the bytes they would write.

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

## Comparison tolerance for phase 2A (historical)

*Historical: 1D's proposal, written before the game was compared. It recommends a
fixed-step RK4 and says no game comparison has been run; the game was in fact compared
with its own Verlet integrator at the steps in
[The game comparison](#the-game-comparison-final-method-and-results), against these
same bounds (P17). The reasoning for the bounds below still stands.*

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

## Inclined cases C5–C7 (thread 2G)

The owner decided on 2026-11-14 that flight is three-dimensional (DECISIONS A11).
C1–C4 lie in one plane, so they cannot catch a mistake in the third axis: a z term
missing from the distance, a wrong sign in a cross product, a thrust component that
is dropped. C5–C7 are the same kind of reference on orbits out of the equatorial
plane, produced and checked exactly as 1D produced C1–C4.

**What these cases are for, and what is not claimed.** They keep A1 true in three
dimensions once the game's 3D simulation reproduces every sample of C5–C7 within
P17's bounds. That comparison belongs to a different 2G worker and **has not been
run**. This section shows only that the references are real GMAT output and that
GMAT's output agrees with independent solutions; it does not claim the game matches.

### Model

[ASSUMED] Identical to the planar cases in every setting: point-mass Earth with
`Earth.Mu = 398600.4415` km³/s² (**mu = 398600441500000 m³/s²**), no harmonics,
drag, SRP, relativity or third bodies; Cartesian state in **EarthMJ2000Eq**; epoch
21545 A1ModJulian; RungeKutta89, `Accuracy = 1e-12`, `RSSStep`, maximum step 10 s,
stop tolerance 1e-6 s; explicit `Report` every 10 s; initial mass 1000 kg; the same
nine raw columns. Two things differ: the state has all six Cartesian components, and
C6's engine points along a fixed inertial direction instead of along the velocity.

[ASSUMED] Each initial state is an in-plane closed-form state placed on its orbit
plane by the classical rotation `Rz(RAAN)·Rx(INC)·Rz(AOP)`. With
`P = (cosΩ cosω − sinΩ sinω cos i, sinΩ cosω + cosΩ sinω cos i, sinω sin i)` and
`Q = (−cosΩ sinω − sinΩ cosω cos i, −sinΩ sinω + cosΩ cosω cos i, cosω sin i)`,
an in-plane `(x, y, vx, vy)` becomes `r = x·P + y·Q`, `v = vx·P + vy·Q`; the orbit
normal is `W = P × Q = (sinΩ sin i, −cosΩ sin i, cos i)`. The scripts carry the
resulting Cartesian numbers at 17 digits. GMAT is never given elements, so its own
element conversion is not in the path of the vectors.
[DEMONSTRATED: `elements-audit-1`] Asked for its own Keplerian elements of those
states, GMAT returns the stated values to 1e-13 (below).

### Cases

Values are rounded for reading; the scripts, the CSV headers and `reference.py` hold
full precision. Angles are in degrees.

| Case | Orbit | INC / RAAN / AOP | Initial x, y, z (m) | Initial vx, vy, vz (m/s) | Duration / samples |
|---|---|---|---|---|---|
| C5 inclined eccentric | period 12000 s, a = 11328702.627049 m, e = 0.35 | 55 / 40 / 30 | −6053790.905196, 1494376.633113, 7192240.052274 | −5128.984313353, −4698.032315264, −431.377792038 | 36000 s / 3601 |
| C6 inclined burn | circle of C1's radius 7136635.453909 m before the burn | 45 / 100 / argument of latitude 40 at t=0 | −4143791.224894, 4820654.714260, 3243739.818846 | −3152.510682070, −5433.831951101, 4048.191977214 | 7200 s / 721 |
| C7 inclined hyperbolic | e = 1.5, periapsis radius 7136635.453909 m (C3's shape) | 120 / 250 / 70 | 24686975.943042, −88148678.537003, −92399355.533804 | −1456.911600255, 3494.129374442, 4441.171756863 | 40000 s / 4001 |

- **C5:** `a = (mu*(12000/(2*pi))^2)^(1/3)`. Periapsis radius 7363656.707582 m
  (985.520 km above GMAT's 6378.1363 km equatorial radius), apoapsis radius
  15293748.546516 m, speed between 4115.936 and 8548.482 m/s. Time zero is
  **1500 s after periapsis** (mean anomaly 45°, true anomaly 82.7228°), so the run
  starts with a radial velocity and its periapsis passages (10500, 22500 and 34500 s)
  are samples. Three periods. |z| reaches 10467 km and |vz| 6759 m/s, so every
  Cartesian component carries a large part of the motion.
- **C6:** C1's circular orbit tilted to 45° with its node at 100°, starting 40° past
  the ascending node. Burn **0–200 s**, then a **7000 s** coast (1.063 revolutions of
  the post-burn orbit). Thrust law below.
- **C7:** C3's hyperbola, **retrograde** (INC > 90°, so the angular momentum has a
  negative z component). Starts 20000 s before periapsis and ends 20000 s after, both
  130066.434 km from Earth; periapsis is the sample at 20000 s (speed 11816.589 m/s).
  It is the out-of-plane version of the flyby the game is built around.

### C6 thrust law

[ASSUMED] Stated so that a simulation can reproduce it without GMAT:

- **Frame:** EarthMJ2000Eq, the inertial frame GMAT propagates in and the vectors are
  written in. Not VNB, not LVLH, not the spacecraft body.
- **Direction:** the constant unit vector **û = (3, −2, 6)/7** =
  (0.42857142857142855, −0.2857142857142857, 0.8571428571428571). It does not depend
  on position, velocity, attitude or time. (3² + 2² + 6² = 7², so it is unit length.)
- **Force:** `F = 2000 N · û` for `0 ≤ t < 200 s`, zero from exactly 200 s on.
- **Mass:** `m(t) = 1000 − ṁ·min(t, 200)` kg with `ṁ = 2000/(300·9.80665)` =
  0.6798108086519522 kg/s (Isp 300 s, g0 9.80665 m/s²). The burn uses
  135.96216173039 kg of the 200 kg of fuel (dry mass 800 kg) and leaves
  **864.0378382696096 kg**. Ideal thrust delta-v `Isp·g0·ln(m0/mf)` =
  **429.939374259975 m/s**, all of it along û.
- **Acceleration:** `a = −mu·r/|r|³ + (2000/m(t))·û` during the burn.

These are illustrative chemical-propulsion test values, not approved game hardware,
and differ from C4's on purpose (thrust, Isp and duration) so that a harness with
C4's numbers written into it fails C6.

[ESTABLISHED: GM01; R2026a `docs/help/html/Thruster.html`] In GMAT this is a
ChemicalThruster with `CoordinateSystem = EarthMJ2000Eq` and `ThrustDirection1..3`
set to the three components: the user guide says `CoordinateSystem` "determines what
coordinate system the orientation parameters ... refer to" and lists `EarthMJ2000Eq`
beside `Local`. `C1=2000`, `K1=300`, every other C/K coefficient zero, duty cycle and
thrust scale 1, `DecrementMass=true`, `GravitationalAccel=9.80665`. `BeginFiniteBurn`
precedes the first propagation and `EndFiniteBurn` follows the twentieth.

How it differs from C4: C4's thruster is `Local`/`VNB` with direction (1,0,0), so
its thrust turns with the velocity. C6's does not turn at all. For orientation only,
in GMAT's VNB axes (V along the velocity, N along r × v, B = V × N) û has components
(0.491, 0.869, −0.052) at t=0, (0.515, 0.857, 0.000) at 100 s and (0.533, 0.844,
0.054) at 200 s: 84–87 % of the thrust is along the orbit normal and 49–53 % is
prograde, a plane change combined with an orbit raise. Those numbers describe the
burn; they are not the law. Holding them fixed in a velocity-following frame is a
different burn, and the checks reject it.

[DEMONSTRATED: `c6-inclined_burn.csv`] GMAT's burn ends with mass
864.037838435455 kg (1.66e-7 kg above ideal, see timing below) and speed
7692.232 m/s, a gain of 218.764 m/s: about half the 429.939 m/s, because most of the
thrust is across the velocity. The orbit plane has turned **2.7795°**. The coast orbit
has a = 7592.442 km, e = 0.060034, INC 46.9592°, RAAN 102.7424°, AOP 44.2032°, period
6583.90 s, periapsis radius 7136.634 km and apoapsis radius 8048.250 km. The run ends
at (−5034.197, 672.695, 5099.170) km.

### Run and regenerate (2G)

With `$gmatBin` and `$gmatVersion` as above:

```powershell
$runs = "$env:LOCALAPPDATA\Programs\GMAT\recursion-2g-runs"   # outside the repository

python tools/gmat/reference.py scripts --check
python -m unittest discover -s tools/gmat -p 'test_*.py' -v
python tools/gmat/reference.py run --gmat-bin $gmatBin --out-dir "$runs\baseline-1"
python tools/gmat/reference.py convert --raw-dir "$runs\baseline-1" --gmat-version $gmatVersion --case inclined
python tools/gmat/reference.py verify
python tools/gmat/reference.py run --gmat-bin $gmatBin --out-dir "$runs\baseline-2"
python tools/gmat/reference.py run --gmat-bin $gmatBin --out-dir "$runs\tight-1" --variant tight --case inclined
python tools/gmat/reference.py compare --baseline-dir "$runs\baseline-1" --tight-dir "$runs\tight-1" --case inclined
python tools/gmat/reference.py feasibility --step 1 --case inclined
```

`run` is unchanged from 1D: per case, from GMAT's `bin` directory,
`GmatConsole.exe --startup_file <run dir>\gmat_startup_file.txt --logfile <run dir>\<case>.gmat.log --run tools\gmat\<case>.script`,
with the same log scan and hash manifest. `baseline-1` and `baseline-2` ran all seven
cases; only C5–C7 were converted, so the four planar CSVs were not rewritten.

Run evidence, in `%LOCALAPPDATA%\Programs\GMAT\recursion-2g-runs\` (not committed):
`baseline-1` and `baseline-2` (raw reports, logs, manifests), `tight-1` (audit
variant of C5–C7), `elements-audit-1` (GMAT's Keplerian readout, with the helper that
made it), `probe-c6` (the first trial of the C6 script, before its descriptive comment
line was added; its report is byte-identical to `baseline-1`'s), and the helper
scripts and output behind the timing, RK4-step and GM-sensitivity numbers quoted here.

### Results (GMAT R2026a, 2026-11-14, 15:03 PST)

[DEMONSTRATED: `reference.py run`, `convert`, `verify`, `compare`] All three scripts
parsed and ran with no errors or warnings (0.19–0.62 s each). Errors are maxima over
every 10 s sample, as three-component norms, against solutions computed
independently of GMAT.

| Case | Rows | Independent check: position / velocity | Mass error | Reported-time drift | Tight vs baseline: position / velocity |
|---|---:|---|---|---|---|
| C5 | 3601 | Kepler 3.65 mm / 3.14e-6 m/s | 0 | 4.94e-4 s | 0.68 mm / 5.83e-7 m/s |
| C6 | 721 | burn RK4 4.76 mm / 5.18e-6 m/s; coast Kepler 5.28 mm / 5.37e-6 m/s | 4.31e-7 kg | 9.83e-5 s | 8.96 mm / 9.09e-6 m/s (mass 4.07e-7 kg) |
| C7 | 4001 | Kepler 2.43 mm / 1.61e-6 m/s | 0 | 5.49e-4 s | 1.92 mm / 1.27e-6 m/s |

The tight runs are within the guide's targets (≤0.1 m, ≤1e-4 m/s, ≤1e-6 kg) by at
least 2.4× (C6's mass; 11× in position), and themselves agree with the independent
solutions to 0.3–4.4 mm.

The independent solutions and what else was checked:

- **Kepler in 3D (C5, C7).** Kepler's equation solved in the orbit plane (elliptic for
  C5, hyperbolic for C7) and placed on the stated plane with P and Q, at the exact grid
  time `10*n`.
- **Conserved quantities** over every coasting sample (all of C5 and C7; C6 from its
  cutoff sample on). Specific energy moves by at most **5.9e-7 J/kg**; the
  angular-momentum vector by at most **7.8e-14** of its length; the orbit normal by at
  most **2.4e-14 rad**. The converter's limits are 0.1 J/kg, 1e-9 and 1e-9 rad. GMAT's
  point-mass orbit plane does not turn.
- **Burn arc (C6).** A fixed-step RK4 (0.05 s; 7e-8 m change when the step is
  quartered) of the thrust law above for 0–200 s, then Kepler f-and-g propagation of
  GMAT's own 200 s state, in three dimensions, for the coast.
- **Mass flow (C6).** Every sample is within 4.31e-7 kg of `m(t)` above.
- **Rocket equation (C6).** The velocity the engine added, taken from GMAT's own
  samples as `v(200) − v(0)` minus the integral of point-mass gravity along the sampled
  path (Boole's rule; truncation 3e-10 m/s), is **429.93937357 m/s** against the ideal
  429.93937426 m/s, and differs from `429.939374·û` as a vector by **2.0e-6 m/s**. So
  GMAT applied 2000 N along û: the magnitude agrees to 1.6e-9 of itself and the
  direction to 5e-9 rad, at the level the stop timing allows.
- **GMAT's own elements** [DEMONSTRATED: `elements-audit-1`]. Copies of the three
  scripts with one extra report (the trajectory report stayed byte-identical) give, at
  t=0: C5 SMA 11328.702627049 km, ECC 0.35, INC 55, RAAN 40, AOP 30, TA 82.7228; C6
  SMA 7136.635453909 km, ECC 3e-16, INC 45, RAAN 100, argument of latitude 40; C7 SMA
  −14273.270907818 km, ECC 1.5, INC 120, RAAN 250, AOP 70. All agree with the stated
  values to 1e-13, and C5's and C7's have moved by less than 3e-12 at the end of the
  run. At C6's cutoff
  GMAT reports SMA 7592.442198760 km, ECC 0.060034452635, INC 46.959245471, RAAN
  102.742377844, AOP 44.203166419, matching this repository's own element routine to
  12 digits.

[DEMONSTRATED: repeat run] `baseline-2` produced byte-identical raw reports for all
seven cases, and reconverting it reproduced all seven committed CSVs byte for byte.
C1–C4's raw reports are also byte-identical to 1D's.

| Case | Raw report SHA-256 (both runs) | Committed CSV SHA-256 |
|---|---|---|
| C5 | `f6c81415f53abe439a98b1001f12b3d60f8b45889b87e8ddda08d3e9bae4e696` | `0a2297fa8adafdcfdc0a76fdcb4f52a909f4957ddd000a4a6f68441fb5350aff` |
| C6 | `d4f4821f018729441b0411e85fa7af9d656fc266ab1ecb26cc8000a38326a37e` | `c0e3cdef8fda6c5d279a7cefb36093a9ce3e1803341358a91d3775dc2881e987` |
| C7 | `614747a2a75ccdeb32cda897d8136c8e35305234ad85c408d163b15a7f960c0b` | `9f2d852b7c306742f4f5ec12282df235bcc0750e349e53af5daeead7563225c8` |

### GMAT behaviour found: stop timing under thrust

The timing behaviours 1D recorded (items 2–4 above) hold here: reported elapsed time
drifts by epoch round-off while each propagation lasts 10 s, so the converter grids by
sample index. The along-track offset of C5 is −4.3e-7 s and of C7 +2.1e-7 s, constant
to 3e-10 s over the run, which accounts for their millimetre residuals.

5. **While the engine is on, the stop time wanders inside the stop tolerance.** C4's
   offset was set on its first stop and stayed. C6's first five stops ended 3.0e-7,
   2.2e-7, 6.3e-7, 4.4e-7 and 2.4e-7 s early (measured from the mass), and every later
   stop of the burn kept the 2.4e-7 s. The first three coast stops moved the timing
   again, after which the coast stays 6.9e-7 s ahead of a Kepler orbit from GMAT's own
   cutoff state. All of these are inside the 1e-6 s tolerance, and no warning is
   logged. Consequences for C6: the mass is up to **4.31e-7 kg** above the law (at
   30 s; 1.66e-7 kg from 50 s on); the burn is 2.4e-7 s short, 5.6e-7 m/s of delta-v;
   and the vector sits 1.9 mm from the ideal solution of the stated model at cutoff
   and **10.2 mm** at worst (at 6340 s). The tight variant happened to stop within
   4e-8 s during its burn and agrees with the independent solution to 0.5 mm, so the
   8.96 mm between baseline and tight is this effect and not integration error. It is
   the same epoch-resolution limit as items 2 and 3, about 1 cm, as stated for the set.

### Output contract and checks (inclined cases)

Raw reports have the same nine columns as the planar cases. Conversion multiplies all
six state columns by 1000 and writes

```text
t_s,x_m,y_m,z_m,vx_mps,vy_mps,vz_mps,mass_kg
```

under the same one-line JSON header. The header adds `orbit` (the stated elements)
and, for C6, `burn.direction_unit_EarthMJ2000Eq`; `burn.direction` says in words that
the direction is inertially fixed. C1–C4 keep their six-column layout unchanged,
since their z and vz are exactly zero and other tests read them as they are.

[ASSUMED] The converter checks, for C5–C7: exact row count; finite values; configured
GM; the reported-time bound; initial state within 1e-6 m and 1e-9 m/s; mass within
1e-7 kg of the law (C6 adds mass flow × 1e-5 s, 6.9e-6 kg in total); the conserved
quantities and limits above; for C6, that the burn turned the orbit plane and added
orbital energy, and that the thrust delta-v agrees with the rocket equation along û
within 5e-5 m/s; and **0.05 m / 5e-5 m/s** against the independent solutions
(observed ≤5.3 mm / 5.4e-6 m/s). The out-of-plane limit that guards C1–C4 does not
apply. Tests (synthetic data only) confirm the audit rejects: an orbit whose node
drifts by 1e-9 rad per sample, as oblateness left on would cause; the right answer
with z dropped; an orbit 0.01 s late; C6 with its direction held in a
velocity-following frame, mirrored in y, or 1 % too strong; C4's prograde law flown
in C6; a coast mistimed by 0.01 s; and that the generator still emits 1D's four
scripts byte for byte.

### Comparison tolerance for the game's 3D simulation (historical)

*Historical: written before the game's 3D simulation was compared. The bounds below
are the ones the comparison used; the comparison itself has since been run, and its
results are in [The game comparison](#the-game-comparison-final-method-and-results).*

[DEMONSTRATED: `reference.py feasibility`] A plain double-precision fixed-step RK4 of
the stated model in three dimensions (Python, **not the game**) reproduces every
sample of C5–C7 at steps of 1, 0.5, 0.1 and 1/60 s within:

| Case | Position | Velocity | Mass | With WGS-84 GM instead (1 s) |
|---|---|---|---|---|
| C5 | 3.66 mm | 3.15e-6 m/s | 0 | 0.595 m |
| C6 | 10.20 mm | 1.03e-5 m/s | 4.31e-7 kg | 0.073 m |
| C7 | 2.44 mm | 1.62e-6 m/s | 0 | 0.110 m |

The residual is again the reference's stop timing, not RK4 truncation: it does not
change with the step.

[ASSUMED] **P17's bounds are kept unchanged for C5–C7**, with the norms taken over
all three components, at **every** sample of each full run:

```text
max |r_game − r_ref|       <= 0.05 m
max |v_game − v_ref|       <= 5e-5 m/s
max abs(mass_game-mass_ref) <= 1e-6 kg
```

The check does not call for different bounds. They leave 13.7× (C5), 4.9× (C6) and
20× (C7) headroom in position over the measured RK4 agreement, 4.8× or more in
velocity and 2.3× in mass, and they still fail the WGS-84 GM mix-up in every case. C6
has the least room. Widening its bound was considered and rejected: at 0.1 m the
WGS-84 mistake would pass C6, and the mass difference does not depend on the
integrator at all (a harness using the stated mass law sees exactly 4.31e-7 kg). These
bounds are a regression requirement for the game's 3D simulation; **no game
comparison has been run**.

Notes for that comparison, beyond 1D's above:

- Parse the header, then the eight SI columns. Start from the first row and use the
  vectors' own axes. Do not rotate a case into a convenient plane: the point is that
  x, y and z all carry the motion.
- C6: apply a force that is constant in the inertial frame, `2000 N · û`, with û read
  from `burn.direction_unit_EarthMJ2000Eq`. A ship whose engine is fixed in its body
  must hold one attitude with zero angular velocity for the whole burn. Use the mass
  law above, stop thrust exactly at 200 s, and read thrust, Isp and stop time from the
  header rather than reusing C4's.
- Compare three-component norms at every sample, including the 200 s cutoff. Radius,
  speed, energy or inclination alone would hide an error in one axis.
- C5's periapsis (8.55 km/s at 7364 km) is its fastest part. The step a Verlet
  integrator needs there has not been measured here; show convergence as P17 asks.

### What the inclined cases show, and what they do not

They show that GMAT R2026a's point-mass propagation, out of the equatorial plane,
agrees to millimetres with closed-form Kepler orbits oriented by classical elements
(prograde and retrograde, bound and unbound); that the orbit plane, energy and
angular-momentum vector stay fixed while coasting; and that GMAT applied the stated
inertially fixed thrust, mass flow and cutoff in C6, which turned the plane 2.78° and
raised the orbit.

They do not show:

- that the game matches them: the vectors are GMAT's; the game's agreement is shown by
  its own test ([The game comparison](#the-game-comparison-final-method-and-results)).
- anything about a thrust direction that follows the velocity out of the plane: C4
  follows the velocity but is planar, and C6 is three-dimensional but inertially
  fixed. No case combines the two.
- attitude dynamics. C6's direction is commanded; nothing slews, and no torque or
  three-axis attitude behaviour is exercised.
- perturbations, more than one attracting body, the game's own length and time scales,
  or the fictional inverse-2.5 gravity law.
- more than about 1 cm and 1e-5 m/s of accuracy, on one GMAT build and platform.

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
- Point-mass Earth only. C1–C4 are planar; C5–C7 add 3D motion, with their own
  limits listed in their section. Nothing here exercises perturbations or the game's
  fictional inverse-2.5 gravity law.

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

**Inclined cases (2G), ready to follow the paragraph above** (measured in
`src/sim/gmat.test.ts`, thread 2G checkpoint 2):

> Three further GMAT cases out of the equatorial plane (an inclined eccentric orbit,
> a retrograde hyperbolic flyby, and a 200-second engine burn in a fixed inertial
> direction that turns the orbit plane by 2.8°) check the same model in three
> dimensions; the game's integrator matches them to within 1.4 cm at 12.5–25
> millisecond steps.

Keep the step sizes, and the limit to ordinary (Newtonian) gravity, in any shortened
version.
