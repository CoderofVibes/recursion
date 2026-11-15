# S22 — the pull, the trap, and the throat

This specification follows **A19**, superseding the spherical geometry and
engine-off invariance of S5/S16. It is a proposal for the owner, not a change to
DECISIONS. All dimensions and thresholds below are [ASSUMED]; all funnel forces,
light emission and crushing are [FICTIONAL]. Deterministic numerical results are
[DEMONSTRATED: `tools/studies/s22/generate.py`, `vectors.json`].

## Geometry and smooth support

Let `m` be the mouth centre, `n` a unit vector **from mouth to throat**, and
`s = (x-m)·n`, `rho = |(x-m)-s n|`. The throat centre is `c=m+L n`.

| Parameter | Proposed value |
| --- | ---: |
| Mouth-to-throat length `L` | 120 km |
| Mouth radius `Rm` | 20 km |
| Throat radius `Rt` | 1 km |
| Mouth and rear axial smoothing length `b` | 5 km |
| Maximum radial smoothing width | 2 km |
| Study enclosing ship radius | 20 m |

Use a quadratic taper, which spends much of its length narrow rather than looking
like a short cone:

```text
u = clamp(s/L, 0, 1)
R(s) = Rt + (Rm-Rt)(1-u)^2
delta(s) = min(2000 m, R(s)/4)
S(q) = 0 if q<=0; 6q^5-15q^4+10q^3 if 0<q<1; 1 if q>=1
w(x) = S(s/b) S((L+b-s)/b) S((R(s)-rho)/delta(s))
```

Set `w=0` before evaluating other terms if `s<=0` or `s>=L+b`.
The influence is a tapered volume, **not its bounding sphere**. `delta` is a
radial width at fixed `s`, not normal distance to the sloping side. Both cap and
side weights use S5's quintic. Each support boundary meets zero through a C2
smoothstep; the force is continuous on the admissible domain. Inside the band, the `min` in
`delta` can introduce a first-derivative join where `R=8 km`; the clamped
quadratic at `s=L` has a second-derivative join. Do not call the complete funnel
globally C2. Smoothing that internal width join is an optional refinement and
must regenerate vectors; it is not a hard force jump at entry or exit.

The visible contours trace `R(s)` at measured stations; the influence weakens
*inside* that visible surface. Seeing the surface does not establish the
response or exact edge-band width. The luminous surface is permeable: escaping
through its side is the intended operation, not a collision with glass.

## Pull and reversal

Choose **axial reversal**. “Toward the well” means down its length toward the
throat, and “away” means back toward its mouth. The preferred escape plane is
the complete plane perpendicular to `n`:

```text
g(s) = 0.02 + 0.08 clamp(s/L,0,1)^2              [m/s²]
a_pull = w g(s) n                               [s<L]
a_pull = -w g(s) n                              [rear cap, s>L]
T = I - 2w n n^T
a = a_P4 + a_pull + T F_delivered / mass
```

[FICTIONAL] This is a directional field, not Newtonian gravity or a source in
the P4 mass sum. It pulls a freely coasting ship. It acts equally on local
freely falling material and the accelerometer proof mass, so **the pull does
not appear as accelerometer specific force**. In contrast, A15 Q01's propulsion
correction does: `f_IMU = R_body^T T F_delivered / mass`, before the normal
sensor bias/noise/interval treatment. Nominal actuator torques remain; both
additional field contributions act at COM and add no torque (A15 Q02). The
terminal crush is a separate fictional loss surface, not a derived tidal stress.

[FICTIONAL] The small rear cap pulls back toward the throat rather than pushing
an approaching ship away from it. At `s=L`, every point with nonzero weight is
inside the excluded crush sphere: process contact first and do not evaluate
its force. The sign change therefore does not introduce a jump on a surviving
trajectory. The projector `n n^T` is invariant under `n -> -n`, so reversal
needs no sign branch there. “Back toward the mouth” describes the main funnel;
on the rear cap it is again the component away from the throat that reverses.

[ESTABLISHED: DECISIONS P4/A3] Ordinary massive bodies, if later added, retain
`a=(GM/r0²)(r0/r)^2.5` with the shared `r0=1,000,000 m`. This reference has no
massive sources. Sunlight does not add a local gravity term. Its trajectories
cannot be reused unchanged after adding a planet or moving massive landmark.

[FICTIONAL] A full interior `-n` burn produces `+n` acceleration, and a `+n`
burn produces `-n`. **Every transverse burn remains exactly ordinary**, including
off-axis positions and the edge band. Eigenvalues remain `(1,1,1-2w)` and
`|TF|<=|F|`. At `w=1/2`, axial propulsion has zero effect, but the pull still
acts. Coasting velocity never jumps and never reverses at a boundary.

[ASSUMED] Alternatives considered: reversal toward the axis would reverse the
very sideways burn intended to escape. A throat-directed unit vector
`(c-x)/|c-x|` works on the centreline but rotates the escape plane as the ship
moves, so a transverse-to-funnel burn becomes partly reversed. A blended
direction adds a fitted parameter and obscures the first lesson. Axial reversal
is the clearest physical interpretation of A19's long narrow trap; the owner
should explicitly approve that interpretation. It is not the old radial-sphere
model with a new mesh.

[FICTIONAL] The pull is compact and generally nonconservative: its axial strength
also varies transversely through `w`. Do not invent a central potential or claim
ordinary orbital energy is conserved. Log the supplied work as
`integral mass*v·a_pull dt` and the propulsion correction work as
`integral v·(TF-F) dt`. Neither replenishes electrical energy, fuel or thermal
capacity. The reference verifies translation and fuel; it does not implement a
full variable-mass mechanical work ledger. 3B's ledger tests must add the pull
term and retain expelled-mass accounting.

[ESTABLISHED: NASA Glenn,
[specific impulse](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/specific-impulse/),
[ideal rocket equation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/ideal-rocket-equation/)]
For each chemical actuator, `mdot=|F|/(Isp*g0)` and ideal propulsive impulse
is `Isp*g0*ln(mi/mf)`. The fictional response changes motion, not fuel flow.
Opposed jets still consume both flows even with zero net translational force.

## Crush and escape limits

[FICTIONAL] The throat contains an absorbing sphere of radius 1 km at `c`.
First contact of **any occupied ship part** causes A9's ordinary ship-loss
sequence. It is not a probability, dose timer or mysterious damage multiplier.
No crush exists at a dormant site. An active throat must never be evaluated as
a traversable singularity. This bounded sphere deliberately avoids an infinite
force or an integration-dependent death threshold.

[ASSUMED] Study clearance uses the 20 m enclosing hull sphere, hence a COM
contact distance of 1,020 m. Production must use the current hull, including
deployed, deploying or damaged appendages. The last kilometre should look like
a bright, tightly packed throat; motion evidence and approaching tracked
material can teach the danger. Brightness alone never tells the model a crush
law or precise threshold. Do not add unmodelled lethal walls to the whole funnel.

[DEMONSTRATED: `escape_depth_sweep`] From the centreline at axial speed 35 m/s,
an immediate 16 s sideways main burn escapes even at `s=115 km`, 5 km from the
throat centre. At 80 m/s the same start crushes in 50.139 s. At `s=90 km` and
80 m/s it escapes immediately, but a 240 s pointing delay crushes in 321.420 s.
There is no single “safe distance” independent of velocity and attitude.

[DEMONSTRATED: `escape_depths()`] A conservative sufficient certificate for a
centred ship with no transverse motion is also supplied. Let
`a_side=24000/30374`, burn duration `beta=16 s`, and turn delay `tau`. Time after
pointing to reach transverse clearance `Rc=1020 m` is

```text
t_side = beta + (Rc - a_side*beta²/2)/(a_side*beta)
T = tau + t_side
D_required = Rc + v_axial*T + 0.5*0.10*T²
```

If initial distance from throat centre exceeds `D_required`, the ship clears
the entire crush cylinder before the worst-case axial trajectory reaches its
near cap. Mass loss increases lateral acceleration; compact support can only
reduce axial pull, so both choices are conservative. Once lateral clearance
is established, it keeps growing in this single-funnel experiment. At 80 m/s,
the sufficient distances are **8.508 km already pointed**, **32.716 km with a
240 s turn**. Failure of this sufficient bound does not prove failure. It is
not a whole-field guarantee or a certificate for failed thrusters.

## Reference experiment and observation margins

[DEMONSTRATED: `vectors.json`] Initial local state is `(10,0,0) km`, velocity
`(35,0,0) m/s`, mass 30,374 kg. The ship is already within the mouth's full
response region, with 108.98 km to the inflated throat surface.

| Experiment | Result |
| --- | --- |
| Coast without a funnel | Ordinary straight motion; no contact by 1,764.190 s |
| Coast in the funnel | Crush at 1,764.190 s, speed 108.714 m/s, no fuel used |
| Burn outward `-n`, 400–430 s | Crush at 1,468.976 s; 229.436 kg consumed |
| Burn sideways, 600–616 s, either sign | Escape; 122.366 kg; minimum crush clearance >16.425 km |
| Outward error, then turn 240 s after warning and burn sideways for 24 s | Escape; 412.985 kg total; minimum crush clearance >15.627 km |

[DEMONSTRATED: `instinctive_burn`] A frozen forecast that already knows the pull
but wrongly assumes ordinary thrust differs by **1,188.871 m at 440 s**. The
uncorrected ship has **1,028.976 s before crush**. A 24 s transverse recovery
begins at 680 s. At the start of the mistaken burn, the IMU sign discrepancy is
approximately `2*24000/30374 = 1.58 m/s²`; coasting has no corresponding IMU
signal. Thus coast tracks identify the pull, while powered specific-force
comparisons identify reversal. A global engine-scale fit cannot explain both
ordinary transverse and reversed axial response.

[ASSUMED] The 1 km warning threshold is a proposed five-sigma criterion for a
navigation position sigma no greater than 200 m. The reference compares exact
trajectories at 20 s intervals; **it does not demonstrate a noisy navigation
fit, screen warning or human response**. Require camera pointing, parallax,
recorder capacity and the actual forecast horizon to sustain that threshold.
The camera is body-forward: an outward burn can point it away from the throat.
The IMU still supplies the immediate sign error; tracks before/after the turn
must supply the independent trajectory evidence. If the real frozen forecast
ends before comparison, do not extend it using truth. Reject that release
certificate and fix the observation sequence.

[ASSUMED] The baseline 0.008 rad/s slew limit makes a 90-degree turn take at
least 196.35 s; 240 s leaves settling time but is an allowance, not a measured
RCS maneuver. Keep **30 kg RCS** as the Garden allowance, with a provisional
10 kg operating allocation and 20 kg reserve. This study measures main fuel;
it does not certify those RCS, bus or thermal margins.
