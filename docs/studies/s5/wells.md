# Inverse wells in a volume

S5 proposal, based on the creative brief §7, decisions A11/P2/P4/P7/P11 and
1B's [derivation §8](../../physics/derivation.md#8-inverse-wells-bounded-local-thrust-fiction).
No new rule in this document is an owner decision. Numerical results below are
reference calculations, not a demonstration that the Well Garden is playable.

## Recommendation

[ASSUMED] Keep the first Well Garden's spherical influence regions separate. Use
1B's quintic transition between a 40 km inner radius and a 50 km outer radius,
with a 1 km excluded core. Put their centres at different heights and depths;
there is no flight plane. A later authored overlap can use the bounded blend
below, but needs its own explanation and held-out evidence. Hinge is a pocket of
this same field, not a second physics implementation.

[FICTIONAL] Transform the delivered **net propulsion force**, evaluated at the
ship's centre of mass. The extra force acts at the centre of mass and adds no
torque. Nominal actuator moments, ordinary gravity, and existing velocity remain
unchanged. Recommend that an accelerometer senses the resulting specific force.
This resolves an outstanding estimator-spec question in favour of its current
truth-side contract; it still requires owner/integrator acceptance.

## The three-dimensional law

[ASSUMED] All positions, velocities and forces below use the encounter's inertial
frame and SI units. Let the well centre be `c(t)`, ship centre of mass `x`,
`r = |x-c|`, `e = (x-c)/r`, and `P = e eᵀ`. `I-P` projects onto the **whole
two-dimensional tangent plane**. A single `perpendicular(e)` vector is insufficient
in 3D. First rotate actual delivered body-frame actuator forces into the inertial
frame and sum them to `F`; commanded thrust is not a substitute for delivered
thrust after power, condition, fuel or protection limits.

[FICTIONAL] The single-well acceleration is

```text
a_propulsion = T F / m
T = I - 2 w P = (I-P) + (1-2w) P
a_total = a_gravity + a_propulsion + other separately declared forces
```

[FICTIONAL] For `w=1`, the radial propulsion component reverses, and both tangent
components retain gain `+1`. At `w=0`, `T=I`. At `w=1/2`, radial gain is zero.
For example, a pure radial burn at 45 km consumes propellant while producing no
radial acceleration; a simultaneous tangential component still works. Nothing
reflects velocity at a boundary. Engine-off motion is the same trajectory with or
without the well, including all normal gravity. A well does not automatically
add its own gravitational source; any massive core needs separate content data.

[FICTIONAL] The eigenvalues of `T` are `(1,1,1-2w)`. Hence `|T F| <= |F|` for
`0 <= w <= 1`; no direction gains more acceleration than the delivered propulsion
would have produced. The well may remove or supply mechanical energy because it
changes the force's direction, even though this magnitude bound holds.

[ASSUMED] Use the same shared gravity reference radius `r0=1,000,000 m` as every
other region. For a source with `mu=GM`, gravity is
`-(mu/r0²)(r0/r)^2.5 e`. Apply the well only after this gravity contribution has
been computed; never transform gravity, total acceleration, or previous velocity.

### Smooth boundary and excluded centre

[ASSUMED] Define `DeltaR = Rout-Rin > 0`, with `0 < Rcore < Rin < Rout`, and

```text
s = (r-Rin)/DeltaR
q(s) = 6s^5 - 15s^4 + 10s^3
w = 1                    for r <= Rin
w = 1 - q(s)             for Rin < r < Rout
w = 0                    for r >= Rout
```

[ASSUMED] This profile is `C2` at both joins. Content must validate positive,
finite radii, distinct field IDs and finite centres. Keep the core a real excluded
volume, tested against the swept **whole ship**; initial states touching it are
invalid, and first contact terminates/handles the collision before evaluating the
field at its centre. The response function rejects `r <= Rcore`. This is a domain
restriction, not gravitational softening. Do not pick a previous-frame radial
direction at `r=0`, normalize a zero vector, or silently clamp it to one axis.

[ASSUMED] The core has no new automatic failure mechanism: use the existing
physical obstacle/contact semantics for an authored solid core. A luminous funnel
is a display convention inferred from measurements, not a conical force region
or an optically visible wormhole. If content instead wants a traversable empty
centre, it needs a different bounded core profile and separate owner review.

### Neighbouring and overlapping wells

[ASSUMED] For the first content, require
`|c_i-c_j| >= Rout_i+Rout_j+gap`, with a positive authored gap. Validate this over
the encounter duration if centres move. In that gap the ordinary response returns.
Do not implement accidental overlaps by serially invoking arbitrary field hooks.
Two full reflections in different directions compose into a rotation; adding
their corrections can amplify force. Neither is the single-well fiction.

[ASSUMED] If deliberate overlaps are accepted, gather **all well influences first**
and construct one matrix:

```text
W = sum_i w_i
s_union = 1 - product_i(1-w_i)
B = (s_union/W) sum_i(w_i e_i e_iᵀ)     if W > 0; otherwise B=0
T = I - 2 B
```

[FICTIONAL] `B` is positive semidefinite and every eigenvalue lies in `[0,s_union]`,
because it is `s_union` times a convex combination of unit projectors. Therefore
all eigenvalues of `T` lie in `[-1,1]`. The blend reduces exactly to the single-well
law, approaches the identity continuously as all influences vanish, has no gain
exploit, and has no mathematical order dependence. Sort by field ID before sums
to fix floating-point replay order. Compute the union incrementally as
`s_union += (1-s_union)*w_i` to avoid cancellation near zero; if `W=0`, return the
identity without dividing.

[FICTIONAL] An overlap has no unique radial direction. It cannot promise to reverse
each well's radial component while preserving each well's tangent plane. Two
fully active orthogonal radials give `T=diag(0,0,1)`: propulsion along either
radial is cancelled, and the third direction remains ordinary. Opposite collinear
radials have the same projector and still produce one reflection. Keep this
additional loss of authority out of the introductory Garden. The norm bound is
not a promise that overlaps are navigable.

## Hinge's measurable loss of authority

[DEMONSTRATED: `tools/studies/s5/wells_reference.py`, `hinge`] Radial gain is
`k(r)=1-2w=2q(s)-1`. For the proposed 40–50 km annulus:

| Quantity | Reference value |
| --- | ---: |
| Exactly zero radial response | 45,000 m |
| Inner edge of `|k| <= 0.1` | 44,732.825194 m |
| Outer edge of `|k| <= 0.1` | 45,267.174806 m |
| Width of that band | 534.349613 m |
| Transit duration at constant radial speed 100 m/s | 5.343496 s |
| Main propellant at 24 kN, 320 s over that duration | 40.866372 kg |

[ASSUMED] The speed-held calculation is a scale illustration, not a commanded
hover or a guaranteed transit duration. The whole annulus takes about 100 s at
that speed, but the almost-dead band lasts only about five seconds. A near-radial
main-engine correction there has at most roughly 0.079 m/s² at 30.4 t; at the
midpoint it has none. The ship can coast through with momentum, or spend longer
near the shell on a shallow traverse. Hinge should teach timing with prearranged
short burns, tracks and replay, not require a player to read a new panel in five
seconds. A12 still prohibits pausing inside the encounter.

[ASSUMED] Near the midpoint `dk/dr = 3.75/DeltaR = 0.000375 m^-1`.
A 100 m uncertainty in boundary position therefore contributes about `0.0375`
uncertainty in radial gain to first order. A forecast should show that ambiguity,
not round a thick uncertain shell to an exact crossing time. A very thin annulus
could be crossed too quickly to demonstrate this without high-rate retained data;
its mere existence would not prove a useful gameplay effect.

## Attitude, sensing and propulsion accounting

[FICTIONAL] Compute nominal torque from the real actuator forces at their real
mounts, plus any pure actuator torque. Then apply the extra inertial force
`DeltaF=(T-I)F` at the centre of mass. This preserves ordinary attitude authority
and introduces no field torque. Opposed RCS jets can have zero net translation
and nonzero nominal torque; the well correction is then zero. This is deliberately
a centre-of-mass propulsion-response fiction, **not** a claim that each nozzle
force reverses at its own application point. That alternative would change
torque, need field samples at every nozzle, and create a second lesson.

[ESTABLISHED: S12, S13] Nominal chemical thrust consumes mass according to
`mdot_i=-|F_i|/(Isp_i*g0)`, with `g0=9.80665 m/s²`. Sum each firing engine's mass
flow; do not calculate it from the norm of the net force. Opposed jets still use
propellant. The field never refunds propellant, electrical input or heat when
its translational effect cancels a burn. Ordinary ship systems calculate these
costs from delivered operation.

[FICTIONAL] For one engine of constant exhaust speed `ve`, the thrust-induced
velocity increment obeys `|integral a_propulsion dt| <= integral |F|/m dt
= ve*ln(mi/mf)`. For several engines, use `integral sum_i |F_i|/m dt` as the
upper bound instead of a single effective `Isp`. This is a bound on propulsion's
integrated contribution, not on total speed or on energy exchanged with gravity.

[ASSUMED] Let `R_BI` be the rotation from body to inertial coordinates. The
recommended measured specific force at the centre of mass is
`R_BI^T (T F/m)` in body axes, passed through normal sensor bias/noise/latency.
Gravity is absent (P7). Ordinary sensor-lever-arm acceleration terms, if modeled,
are handled as such. The field does not get a secret command channel into belief.
The current `EnvironmentEffects.specificForce` contract already specifies force
after field-modified thrust; estimator-spec §13 item 3's suggested gravity-like
invisibility would instead require another fictional sensing rule. Recommend
removing that suggestion after owner approval. A clear accelerometer signal is
allowed; the player must still identify its relation to direction and position,
separate it from engine failure, and validate a transferable response rule.

## Mechanical energy: record the field's extra work

[FICTIONAL] In the declared inertial frame, log

```text
P_nominal = v dot F
P_field = v dot (T F - F)
W_field(t) = integral P_field dt
```

[FICTIONAL] `P_field` can be positive or negative. Changing inertial frame changes
work and kinetic energy consistently; do not treat `W_field` as an invariant
resource balance or a battery credit. Neither a conservative potential nor an
exhaust reaction is claimed for the fictional coupling. The full powered system
is not symplectic or energy-conserving. Do not silently turn lost mechanical work
into ship heat; doing so adds a new unapproved coupling.

[ASSUMED] A useful test ledger with static gravity sources is

```text
Phi(x) = sum_j -K_j/((p-1)*r_j^(p-1)),  K_j=mu_j*r0^(p-2), p=2.5
E_ship = m*(0.5*|v|² + Phi)
dE_ship/dt = P_nominal + P_field + mdot*(0.5*|v|² + Phi)
```

[ASSUMED] The last term is the mechanical energy carried with removed mass; it
is necessary even when the rocket equation is implemented correctly. This ledger
does not include the exhaust's full energy. For moving gravity sources also add
`m*partial(Phi)/partial(t)`, or use the project's full-system/Jacobi checks as
appropriate. Never diagnose a moving-source energy exchange as well-work error.

## Fixed ticks and boundary events

[ASSUMED] Keep P2's fixed outer tick and command ordering. Warp runs more ticks;
it never enlarges the physical step. With the recommended smooth annulus there
is no impulsive state change at `Rin`, the zero-response shell or `Rout`.
Re-evaluate `T` at the integrator's stage positions, with stage mass and attitude,
and integrate the work ledger with those same stages. Only a hard boundary needs
a force switch at a localized event.

[ASSUMED] Internal dyadic substeps are allowed under one deterministic documented
rule. Resolve both the profile scale and changes in radial direction. A useful
resolution guard is `h*|v_relative| <= DeltaR/16` and
`h*|v_tangent|/r <= 0.01`; these are guards, not error tolerances. For moving wells
use motion relative to their centres. Also obey collision, lattice, actuator,
deployment and fuel-exhaustion substep requirements. Confirm accuracy by halving
the step; the study's tight reference comparison passes at `h=1/16 s` for its
midpoint propagator. It does not establish the required game step for every
scene or for 2G's independent method.

[ASSUMED] Emit localized boundary times as `(tick, fractionalTick, fieldId,
surfaceId, direction)`, sorted canonically. Use signed distance to each sphere
and an **entire swept path**, not only endpoint `inside` booleans. A straight
segment has a quadratic sphere-intersection equation; constant-acceleration dense
motion has a quartic, and cubic Hermite motion gives up to degree six. Isolate
all roots or use conservative subdivision that can prove an interval root-free.
An outside-to-outside step may contain both entry and exit. A tangency is a
touch, not an inside/outside switch. A root exactly at a tick endpoint is emitted
once; carry its last surface/side or use half-open time intervals. At `Rout`,
`w=0`, and at `Rin`, `w=1`; force itself is unambiguous.

[ASSUMED] If a hard profile is retained as a diagnostic, integrate on the current
side until its **first** swept boundary event, localize it to a stated tolerance,
split the remaining tick there, switch by crossing direction, and repeat. Do not
locate the event on a trajectory that already used the wrong force for the rest
of the tick. Use a stable ID order for simultaneous events and a finite iteration
cap that fails validation rather than silently discarding crossings. Exact
on-shell starts need directional side ownership. This policy is deterministic;
it does not retain a fixed-step symplectic guarantee.

## Reference evidence and implementation acceptance

[DEMONSTRATED: `tools/studies/s5/wells_reference.py`, `build_vectors()`] The
generator asserts full 3D radial reflection and both tangential directions,
identity outside, zero radial response at the midpoint, rejected core states,
norm-bounded overlaps with all six permutations of three fields, mass consumption,
energy accounting, coasting equivalence and convergent powered crossing times.
The hard-boundary diagnostic crosses a 50 km sphere from `(-60,10,0) km` to
`(60,10,0) km` in one second; both endpoints are outside but the two times are
`0.091751710 s` and `0.908248290 s`.

[ASSUMED] The powered fixture uses one 24 kN, 320 s engine with initial mass
30,400 kg, `x=(-39000,0,0) m`, `v=(-150,0,0) m/s`, constant inertial thrust
`(-24000,0,0) N`, and duration 100 s. A static source at `(0,-2000000,1000000) m`
with `GM=1e10 m³/s²` supplies real 3D P4 acceleration during the test.

[DEMONSTRATED: `burn.reference`] RK4 at `1/32 s`, checked against `1/64 s`, gives:

| Output | Reference |
| --- | ---: |
| Inner / zero-response / outer outbound event | 6.787994270 / 44.690892195 / 82.575870336 s |
| Final position | `(-52646.757950279, -5.928546912, 2.964273456)` m |
| Final velocity | `(-158.946508004, -0.118697736, 0.059348868)` m/s |
| Final mass | 29635.212840268 kg |
| Nominal propulsion work | +327522190.806712 J |
| Field extra work | -287999999.948349 J |
| Removed-mass mechanical energy term | -5634736.228815 J |
| Energy-ledger residual | about `9.3e-6 J` |

[DEMONSTRATED: `burn.midpoint_convergence`] An independent explicit midpoint
integration has the following final position error against RK4:

| Fixed substep (s) | Position error (m) | Velocity error (m/s) |
| ---: | ---: | ---: |
| 1 | 0.418291443 | 0.002058693 |
| 0.5 | 0.105059258 | 0.000523686 |
| 0.25 | 0.026327743 | 0.000132085 |
| 0.125 | 0.006589703 | 0.000033165 |
| 0.0625 | 0.001648402 | 0.000008309 |

[DEMONSTRATED: `burn.midpoint_convergence`] Position error falls approximately
fourfold per halving. At `1/16 s` the largest event-time error is `1.04e-5 s` and
the energy-ledger residual is `-1.273 J`. At `1/32 s` versus `1/64 s`, RK4 final
positions differ by approximately `2.2e-10 m`; this is a self-convergence check,
not proof of machine-independent absolute accuracy.

[DEMONSTRATED: `coast`] The 600 s off-axis coast starts at
`(-60000,8000,6000) m` with `v=(200,0,0) m/s`, passes through the field and out
the other side, and gives exactly equal serialized results with the field on
and off at the same integration step. Six inner/mid/outer crossing events are
recorded. Fuel and field work do not change. Ordinary P4 gravity still changes
velocity; equal results do not claim an exact analytic gravity solution.

[ASSUMED] A production implementation should additionally pass these tests:

1. Apply any 3D rigid rotation to field, ship and force and recover the rotated
   result; test out-of-plane thrust as well as inclined trajectories.
2. Compare these reference samples within `0.01 m`, `1e-5 m/s`, `1e-6 kg`,
   `1e-4 s` in event times, and `2 J` energy-ledger residual at a declared step.
   Check second-order convergence independently; passing at a small step does
   not certify gameplay resolution or performance.
3. Outside-to-outside sweep, exact-shell start/end, tangency, repeated shallow
   crossings, simultaneous well events and earliest core collision must neither
   tunnel nor duplicate events. The reference's monotone smooth fixture locator
   is **not** a general production swept-event solver.
4. Opposing thrusters still consume both fuel flows, preserve nominal torque,
   and yield zero net well force when their net propulsion is zero. Stage mass,
   fuel exhaustion and command cutoffs must not change with warp.
5. Inject a well only into truth: the ordinary forecast should fail on powered
   radial motion but still describe engine-off and tangential controls within
   their other uncertainties. Fitting/adopting a response rule must use retained
   measurements and a held-out pass, never truth matrix/centre/radii.
6. Replay after save/restore, reordered field registration and changed display
   frame rate must produce the same state and boundary event order. No random
   response switches and no field-owned hidden state are needed.

[ASSUMED] The best version preserves the smooth loss-of-authority band, measured
boundary uncertainty and controlled comparisons in all three directions. A smaller
version can keep separate spheres, static centres and the same smooth law while
omitting overlaps and moving centres. Replacing the annulus with a hard edge
removes Hinge's distinctive experiment and demands a more exact event solver;
it is not the recommended shortcut.
