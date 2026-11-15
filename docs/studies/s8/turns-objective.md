# S8: independent turn angles and the departure gate

All results below are [DEMONSTRATED: `tools/studies/s8/scattering.py` or
`tools/studies/s8/objective.py`] for the [FICTIONAL: P4] inverse-2.5 law.
The numerical inputs are 2G's committed content and handoff at
`2986c3551a6a5bf1fd79262e48e39024ad937769`. Neither the game propagator nor
2G's scratch algorithms were used. `core.py` supplies S8's separately written
fourth-order Runge–Kutta integration of particles in the analytic circular binary.

## Every entry in the turn table

This is the isolated-Beta problem used by 2G's table, not a claim that a binary
flyby has an unambiguous speed at infinity. Both laws use the same stated
periapsis and asymptotic speed; their impact parameters therefore differ.
The angle is **unwrapped**: a 219.573° turn must not become 140.427° through
an `acos` of velocity directions. It is unchanged by rotating the entire pass
into another plane.

For exponent p, set `K = GM_Beta * r0^(p-2)`,
`A = 2*K / ((p-1)*rp^(p-1))`, `vp² = vinf² + A` and `u = rp/r`.
Energy and angular momentum give

`turn = 2 ∫[0,1] vp / sqrt(vinf² + A*u^(p-1) - vp²*u²) du - π`.

The substitution `u=1-s²` removes the periapsis endpoint singularity; the
reference uses 512-point Gauss–Legendre quadrature. The Newtonian column is
also checked against `2 asin[1/(1+rp*vinf²/GM_Beta)]`.

Each parentheses pair is **S8 minus the printed 2G value**. Units are degrees
for the two turns and m/s for periapsis speed.

| rp (km) | vinf (m/s) | True turn (difference) | Newton turn (difference) | vp (difference) |
|---:|---:|---:|---:|---:|
| 300 | 40 | 219.572550 (−0.427450) | 114.053799 (+0.053799) | 147.939246 (−0.060754) |
| 300 | 60 | 161.554869 (−0.445131) | 88.585389 (−0.414611) | 154.551029 (−0.448971) |
| 400 | 40 | 189.035499 (+0.035499) | 105.533391 (−0.466609) | 121.557217 (−0.442783) |
| 500 | 40 | 164.790470 (−0.209530) | 98.501891 (−0.498109) | 105.014715 (+0.014715) |
| 571 | 29 | 196.885750 (−0.114250) | 114.041294 (+0.041294) | 92.555195 (−0.444805) |
| 700 | 28 | 179.921180 (−0.078820) | 110.168537 (+0.168537) | 80.470894 (−0.529106) |
| 830 | 28 | 161.396830 (+0.396830) | 105.021855 (+0.021855) | 72.056944 (+0.056944) |
| 980 | 28 | 143.513177 (−0.486823) | 99.799569 (−0.200431) | 64.960704 (−0.039296) |
| 1,120 | 28 | 129.478036 (+0.478036) | 95.473968 (+0.473968) | 59.968622 (−0.031378) |
| 1,250 | 28 | 118.283584 (+0.283584) | 91.843563 (−0.156437) | 56.295108 (+0.295108) |
| 1,650 | 28 | 91.942453 (−0.057547) | 82.448010 (+0.448010) | 48.546114 (−0.453886) |
| 840 | 14.5 | 251.746707 (−0.253293) | 138.139912 (+0.139912) | 67.379300 (+0.379300) |

All 24 printed angles agree with nearest-degree rounding. Eleven of twelve
printed speeds agree with nearest-m/s rounding. The 700 km speed would round
to **80**, whereas 2G printed 81; the difference is 0.529106 m/s (0.6575% of
S8's value), too small to alter the encounter conclusion. Maximum 256-versus-512
quadrature change is `5.37e-9°`; maximum Newtonian quadrature-versus-closed-form
error is `5.85e-10°`. These are numerical checks of the integral, not a model
uncertainty budget.

## What `depart` prevents

The specified gate is barycentric distance at least 9,000 km, barycentric speed
at least 50 m/s, and cumulative propulsive Δv at most 16 m/s. `index.ts` imports
the three numbers from `briefing.ts`; S8 read that declaration only. The
application's objective implementation was not inspected or tested here.

**Unpowered drifting from the authored arrival is ruled out analytically.**
Use the conventional rotating-frame Jacobi constant
`C = −2*(E − omega*Lz)`, where E is total specific inertial energy including both
potentials. S8's `core.jacobi` returns `E − omega*Lz`, so the factor −2 matters.
The closed zero-velocity lobe around Alpha prevents an unpowered ship from
reaching Beta or the exterior, regardless of the duration of a coast.

| Quantity | C (m²/s²) |
|---|---:|
| Authored arrival | 5,826.649268 |
| Same arrival, immediate outward radial 16 m/s impulse | 5,570.649268 |
| L1 neck between the bodies | 5,468.317194 |
| L2 exterior neck beyond Beta | 4,723.006105 |
| L3 exterior neck beyond Alpha | 4,001.605615 |

Both arrival values exceed the two neck values bounding Alpha's lobe. In three
dimensions, moving above the binary plane reduces the gravitational part of
the rotating pseudo-potential at fixed x,y; it does not open an escape passage
over a closed planar lobe. This proof assumes the fixed-radius circular
arrival, massless rocks, no thrust after the stated impulse, no contact impulse,
and the exact circular binary. It does not prove arbitrary inherited arrivals
are safe.

For *every* bearing of a circular 1,000 km Alpha arrival, a deliberately loose
bound gives `C >= 5514.149268 > C_L1`. It follows by independently minimizing
the centrifugal term and Beta potential over that circle, while the rotating
speed is always `100 − omega*1e6 = 90.117882 m/s`. Thus the unpowered drift
exclusion is not a lucky property of the nominal arrival bearing.

Differentiating that exact circle's C with respect to the cosine of the
arrival bearing places its minimum where the Beta distance equals 4,000 km,
at `cos(bearing)=r0/(2*D)=0.125`. The exact minimum is 5,769.392288 m²/s².
Consequently an immediate outward radial 16 m/s impulse also leaves a closed
Alpha lobe for every bearing: its minimum C is 5,513.392288, still above L1.

**The finite direct-burn search also fails the gate.** S8 tested one impulse
at each `t = 0,600,...,62400 s`, magnitude 14 or 16 m/s, in each of two directions:
prograde relative to Alpha or outward radial from Alpha. The real binary moves
throughout; no body was deleted or frozen. Each trajectory ends at first
outward crossing of 9,000 km, body contact, or 150 h. This gives 420 burns plus
one unpowered control. Rocks are omitted from this objective isolation test.

[ASSUMED] For this comparison, a **plain exit** stays at least 2,000 km from
Beta's centre, outside 2G's 680–1,650 km qualifying-assist range. This is a
declared comparison filter, not a proof that Beta did literally zero work.

| Burn family | Exits / 105 | Qualifying / 105 | Plain exits | Fastest plain exit |
|---|---:|---:|---:|---:|
| Prograde, 14 m/s | 53 | 3 | 46 | 32.678534 m/s |
| Prograde, 16 m/s | 69 | 3 | 63 | 38.875678 m/s |
| Radial, 14 m/s | 0 | 0 | 0 | none by 150 h |
| Radial, 16 m/s | 0 | 0 | 0 | none by 150 h |

The best plain 14 m/s burn is at 43,200 s and crosses the gate at
298,453.073 s (82.9036 h). The best plain 16 m/s burn is at 46,200 s and crosses
at 255,692.484 s (71.0257 h). Both stay at least 3,009.573 km from Beta.
Halving the 60 s integration step changes their interpolated exit speeds by
`4.79e-8` and `1.67e-7 m/s` respectively. There are no hidden body penetrations:
body contacts use a relative swept segment plus the conservative 20 m ship
envelope and terminate the affected test.

The representative 14 m/s slingshot exits at **66.309197 m/s**. Its gain is
**33.630663 m/s over the strongest equal-14-m/s plain exit in this grid**, or
**27.433519 m/s over the stronger 16-m/s plain exit**. These are barycentric
speeds at the same 9,000 km gate, rather than periapsis speeds or speeds at
different times/radii. The representative exit uses a refined crossing epoch,
and the controls interpolate the crossing; the reported
five-decimal comparison is reference bookkeeping, not five-decimal encounter
accuracy. The useful design claim is a **roughly 27–34 m/s advantage**.

This supports 2G's printed upper direct-exit speed of 39 m/s: S8's strongest
16 m/s control differs by −0.124322 m/s. It does not independently reproduce
2G's entire 13–39 m/s, 71–143 h range: their exact burn epochs, termination
conditions and sample membership were not recorded. S8's grid and every result
are retained in `objective.json`.

## Limits and requested objective changes

**The three-number predicate does not prove an assist occurred.** An inherited
arrival at `[9000001,0,0] m` with `[51,0,0] m/s` and zero spent Δv meets all three
conditions without visiting Beta. This is an algebraic counterexample outside
the authored arrival family, not a proposed admissible seed. The specified
predicate also contains no outward-velocity test. S8's exit summaries add that
test explicitly; the game owner must verify the intended crossing semantics.

The search above does not exhaust arbitrarily delayed or multiple impulses,
all possible thrust directions, inherited C01 states, finite-thrust control,
or elastic debris impacts. Therefore S8 **does not certify a universal
non-bypass theorem for the bare predicate**. The no-drift proof and restricted
straight-burn controls are stronger and more precisely bounded claims.

[ASSUMED: recommendation] Keep the useful speed/distance target, but require a
physical flyby witness and an outward crossing. Record an inbound and outbound
Beta-relative sphere crossing and a periapsis outside the full collision
envelope, together with the unpowered deflection/energy-exchange interval.
If the owner retains mandatory belt traversal, record an actual crossing of
the belt's volume separately; a 1,650 km assist can miss the ring. Accept an
evidence-supported physical maneuver without requiring an adopted-rule flag.
The 16 m/s encounter-wide cap must also be reconciled with optional learning
dives; see the study's seed/low-orbit result before making it a hard expedition
progression gate.

[ASSUMED: implementation estimate] 2G/2F would add roughly 80–150 lines in
the game objective evaluator plus a small serializable assist-witness state;
the encounter definition would supply its geometric limits. 2C needs no
truth access and no planner. 2D should display only sensed approach/exit
evidence and remaining maneuver margin. Tests should include the unpowered
and radial controls here, the inherited-arrival counterexample, inbound
versus outbound boundary crossing, a valid informed assist, a wide belt miss,
and save/reload midway through witness accumulation. Those application tests
remain integration work, not claims made by this point-particle study.

A candidate physical witness quantity is `∫ v_Beta · a_Beta dt`: this is Beta's
contribution to the change of total specific inertial energy through the time
dependence of its potential. The representative trajectory accumulates
**2,615.115 m²/s²** over its sampled interval inside a 2,000 km Beta sphere
(61,800–149,190 s at 30 s sampling). The best plain controls never enter that
sphere. This demonstrates a measurable energy exchange for this reference;
S8 proposes **no universal work threshold** before the accepted seed family
and inherited ship states have been checked.

Owner decision: **must a successful departure physically cross the belt, or
is a wider Beta assist acceptable?** Recommendation: preserve A6's current
belt requirement unless the owner explicitly relaxes it, and implement the
physical witness rather than relying on the speed threshold to imply it.
