# S16 — a committed arrival in the Well Garden

**Recommendation:** prototype three separated spherical wells, two broad crossing
routes, and a finite catalogue of 25 admitted geometries. Treat the entrance as
an already committed physical arrival. From that state, a reachable-position
bound proves that **every physically admissible control sequence enters the first
well**, even with full tanks and unrealistically generous thrust authority.

**The stronger, upstream fuel-only claim does not hold.** A finite-thrust exterior
route from 100 km upstream avoids every influence for about 727 kg main propellant,
well within the 6,000 kg load. Adding a handful of disjoint spheres does not seal
open 3D space. The owner must accept the committed-arrival interpretation, or ask
for additional physical containment/transfer constraints. Do not ship a claim that
the entire expedition has no exterior bypass on the evidence here.

This is a study and proposed content, not a change to decisions or game code.
The numerical findings are [DEMONSTRATED: `tools/studies/s16/generate.py` and its
JSON]. Geometry, acceptance thresholds and resource allowances are [ASSUMED].
The force law is [FICTIONAL: A15 and S5]. No result is a human playtest or a complete
ship/sensor/model integration test.

## Layout and arrival

[ASSUMED] Garden coordinates are an inertial, right-handed frame, in metres in
JSON; this table uses kilometres. Wells are stationary. The seed rotates the
whole formation into the encounter frame and perturbs the two later centres.
There is no privileged universal flight plane.

| Well | Centre (km) | Core / full reversal / outer influence (km) | Purpose |
| --- | --- | --- | --- |
| W1, entrance | `(0, 0, 0)` | `1 / 40 / 50` | Committed arrival; long safe coast before a core intercept; first coast/radial/tangent comparison. |
| W2, upper reach | `(130, 25, 20)` | `1 / 40 / 50` | Positive-z route crosses another measured influence at a new radial direction, with ordinary space between wells. |
| W3, lower reach | `(260, -25, -20)` | `1 / 40 / 50` | Negative-z route meets a different outgoing influence; alternate Hinge approach and exit preparation. |

[DEMONSTRATED: `vectors.json.layout`, `informed_crossings`] Nominal arrival is
`(-50100, 0, 0) m`, velocity `(35, 0, 0) m/s`. A 20 m enclosing ship sphere has
49,080 m clearance to the first core at arrival. The incoming no-burn trajectory
would hit that core after `(50100-1020)/35 = 1402.286 s`: immediate contact is not
the pressure. Influence is first entered after 2.857 s, without a collision,
velocity jump, dose or extra gravity. The first 560 s provide a coast baseline and
time to point for a maneuver. No pause or compulsory death is needed.

[ASSUMED] The outgoing acceptance surface is an outward crossing of the disc
`x=330000 m`, `y²+z² <= 130000² m²`, with positive x velocity, whole-ship core
clearance and retained reserves. It describes open transit toward P04; it is
not a force wall, invisible obstacle, refill or rule-adoption gate. The scene
must continue outside it. R02 is an optional measured boundary experiment near
W2 or W3, not a fourth field or another simulation. N03 cross-transfer approaches
need their own continuous arrival certificates; this study does not certify an
arbitrary approach from that branch.

[ASSUMED] Local massive-source list is empty. Cores are excluded contact volumes
for the fictional fields; this study adds no attractive mass to them. The P4
normalization remains `r0=1,000,000 m`; an empty gravity sum does not change its
law. Do not add background bodies to this layout and reuse these trajectories
without recomputation. Distant sunlight is separate from gravity (A3).

## What “unavoidable” actually proves

[ESTABLISHED: `data/ship-baseline.json`, `docs/handoffs/2G.md` § Ship] The baseline
contains 24 kN main thrust, forty 200 N jets across both redundant banks, an
optional 0.236 N ion drive, and a 24,000 kg dry-mass floor. Actual pod/bank allocation
cannot fire all forty jets as a useful translation. For an upper bound, allow
all of them, unlimited fuel, instantaneous pointing and dry mass from the start:

```text
a_max = (24000 + 40*200 + 0.236) / 24000 = 1.3333431667 m/s²
|x(T) - (x0 + v0*T)| <= a_max*T²/2
|x(T)| <= |x0 + v0*T| + a_max*T²/2
```

[DEMONSTRATED: `reference.py:certificate`] The inequality follows by integrating
the acceleration norm twice. S5's transform has norm at most one, so entering a
well cannot break the bound. It includes lateral maneuvers in **every direction**,
reverse thrust, waiting, and arbitrary time-dependent controls; it is not a ray
sample or a search that might miss a clever route. With the nominal state, choose
`T=|v0|/a_max=26.249806 s`. The entire reachable ball is within radius
`49640.628388 m`, **359.371612 m inside** the first influence. By continuity every
trajectory has entered by then. The exit is hundreds of kilometres farther away
and cannot be reached before that witness time under the same bound.

[DEMONSTRATED: `seeds.json`] Admission requires this bound to be at least 100 m
inside. The weakest accepted certificate is 112.812 m inside. For these fixed
incoming states the share of avoiding trajectories is exactly zero under the
stated dynamics, irrespective of any probability distribution over controls.
There is no finite-fuel avoiding solution to buy with this engine; adding
propellant cannot fix a thrust-limited commitment. The full load even including
xenon has a conservative finite integrated-propulsion bound in
`vectors.json.full_load_propulsive_integral_upper_bound_m_s`.

**This is a thrust/time obstruction, not a lower bound saying a hypothetical
instantaneous avoiding impulse exceeds the fuel load.** An impulse approximation
could simply stop this 35 m/s arrival. Do not replace finite thrust with impulsive
controls when testing the no-bypass claim.

[DEMONSTRATED: `vectors.json.finite_outside_bypass`] The scope matters. From
`(-100000,0,0) m` with the same incoming speed and mass, the ship can stop, turn,
move slowly around the formation via `y=180 km`, return to `y=0` at the exit,
and restore 35 m/s prograde speed. The reference supplies **finite 24 kN burns**,
480 s turning slots, mass depletion and exact coast sweeps. It avoids every
influence using about 727 kg main, versus 6,000 kg aboard. This is a counterexample
to interpreting the prompt as a global fuel wall from S4's exterior observation
skirt. Its long duration and RCS/power operation are not a certified expedition
procedure, but distance alone cannot establish the requested fuel barrier.

[ASSUMED] Close that scope gap by physically authoring and verifying upstream
delivery to the committed surface, preserving the player's actual state, or by
adding owner-approved containment/transfer requirements with their own proofs.
Never teleport a slowed ship onto this trajectory, hide a thrust restriction,
refill tanks, prohibit an otherwise valid coast, or call a finite route search a
proof. S4's proposed broad exterior skirt and freely chosen approach are not
simultaneously certified by this stronger arrival guarantee.

[DEMONSTRATED: certificate definition] Meeting the influence is not the same as
requiring a fully reversed burn. A prompt braking response can graze the weak
outer band, and a good lateral coast can avoid a dramatic discrepancy. The proof
does not force discovery, damage or an adopted rule. The wrong-belief experiment
below is a separate witness, not a claim about every possible player's behavior.

## Fair crossings and the mistake that teaches

[ASSUMED] Use actual delivered main force, after actuator limits, in
`T F/m`, where `T = I - 2w eeᵀ` and `w` is S5's quintic 40–50 km profile. Gravity,
coasting velocity and nominal actuator torque are unchanged. A15's added well
torque is zero. Both tangent directions retain gain one. At 45 km radial gain is
zero; propellant is still consumed. Sensor prediction must use the modified force.

[DEMONSTRATED: `vectors.json.informed_crossings`] Starting from the nominal state,
point toward either `+z` or `-z` during the coast and burn for 8 s at `t=600 s`.
Cut off at 608 s and coast to the exit. These are finite constant-direction burns;
the well's radial direction is recalculated as the ship moves, so the small
non-tangential correction is included.

| Result | Positive-z route | Negative-z route |
| --- | ---: | ---: |
| Main propellant used | 61.182973 kg | 61.182973 kg |
| Ideal integrated main impulse | 6.327571 m/s | 6.327571 m/s |
| Exit time | 10858.917 s | 10858.917 s |
| Exit transverse coordinate | `z=+64.889 km` | `z=-64.889 km` |
| Minimum whole-ship core clearance | 4.132 km | 4.132 km |
| Influences met | W1, W2 | W1, W3 |

[ASSUMED] Admission resource target: carry at least **1,000 kg main and 30 kg RCS**
into this encounter; allocate 200 kg main for correction/recovery and 10 kg RCS
for turns/holding. A nominal informed flight leaves **738.817 kg main above the
200 kg reserve**, and 20 kg RCS above the assumed operating allowance. From full
tanks, 5,938.817 kg main remain. These are allowances, not refills or measured RCS
costs. The 25,000/27,500/30,374 kg nominal-layout mass sensitivity cases all exit
with more than 4 km core clearance. Arbitrary inherited mass/damage/seed combinations
remain a session admission check.

[ESTABLISHED: NASA Glenn, [specific impulse](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/specific-impulse/)
and [ideal rocket equation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/ideal-rocket-equation/)]
For the reference engine, `mdot=F/(Isp*g0)` and ideal impulse is
`Isp*g0*ln(mi/mf)`. The fictional response changes delivered acceleration, not fuel
flow; these equations do not certify the electrical or thermal schedule.

[DEMONSTRATED: `vectors.json.old_belief`] An ordinary-response pilot instead points
`-x` to brake and burns 30 s at 600 s. The ordinary frozen forecast slows; the
actual ship accelerates toward the core. At the **first sampled warning, 650 s**,
the position discrepancy is **1,664.711 m**. Uncorrected core contact occurs at
**1083.674 s**, leaving **433.674 s**. The threshold is
`max(1000 m, 5*0.002*current core range)`. The 0.002 is the Gravity range's current
per-fix setting in `src/content/gravity-range/index.ts`, not the baseline file's
older 5% size uncertainty and not a full navigation covariance. The 20 s coast
sampling makes this a conservative sampled warning time, not the exact first
threshold crossing.

[DEMONSTRATED: same vector] After that warning, allow 240 s to turn 90 degrees
with the engine off; then burn +z for 16 s at 890 s and coast. The resulting
recovery clears the first core by **1.509 km** and reaches the exit, using
**351.802 kg main total**, including the mistaken burn. From a 1,000 kg incoming
load, 648.198 kg remain. The 240 s turn allowance exceeds `pi/(2*0.008)=196.35 s`
at 2G's slew rate, with settling time left; it is not an integrated quaternion/RCS
test. The two burned trajectories already have kilometres of clearance while
powered, so swept powered chords are not being used to manufacture a close miss.

[ASSUMED] Visibility still requires a real measurement. The camera faces along
body +x: a retrograde burn can point it away from the approaching core. Place
trackable exterior landmarks in that view and verify their lighting, range and
coverage, or use the recorded A15 accelerometer mismatch with a later independent
track. The acceleration residual is about `2*24000/30374 = 1.58 m/s²` in the full
reversal region, compared with the baseline IMU's assumed `1e-4 m/s²` sample noise.
That establishes a large source signal, not a passed display test. Do not feed
true core distance, seed coordinates or the reference trajectory into belief to
make the warning appear. If tracking is insufficient or P10 ends the real forecast
before the mismatch, reject the release certificate and fix observation geometry.

## Seeds, porting and completion limits

See [seeds.md](seeds.md) for the exact distribution, 103/128 rejections, controls,
and what is safe to vary. See [implementation.md](implementation.md) for ownership,
model/screens, tests, code estimates and owner questions. All vector inputs are
beside their expected outputs in [vectors.json](../../../tools/studies/s16/vectors.json).

```powershell
python -B tools/studies/s16/generate.py
python -B tools/studies/s16/generate.py --check
```

[ASSUMED] The best version provides fresh observed centres, immutable wrong and
revised forecasts, a safely recorded radial/tangent/coast comparison, both routes,
Hinge and a continuous inherited-state transfer. A smaller prototype can use the
nominal layout and both routes with S5's exact profile. It loses meaningful seed
variation and expedition continuity evidence. Dropping the arrival certificate
loses the no-bypass claim; dropping tracking verification loses the visible-warning
claim; neither is an acceptable silent simplification.
