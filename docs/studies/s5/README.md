# S5 — Inverse wells and the lattice in 3D

Study proposal for owner/integrator review. Branch `st/s5-wells-lattice`, based on
`baf65e0`; prepared November 14, 2026, Pacific time. No decision, shared contract,
ship rating or game implementation has been changed.

## Recommendation

[ASSUMED] Build the first Well Garden from separated spherical wells with 1B's
smooth 40–50 km annulus and a 1 km excluded solid core. Transform delivered net
propulsion with `T=I−2w eeᵀ`, preserving the complete tangent plane, gravity and
coasting. Put the correction at the centre of mass, retain nominal actuator
torques, and let the existing accelerometer measure the transformed thrust.
The sensor choice resolves an explicit conflict between the current contract and
the estimator specification's open question; it needs owner acceptance.

[ASSUMED] Build the lattice from finite, staggered, tilted sheets of clipped
strands with compact steep exposure. Integrate exposure on moving components,
preserve electrical protection versus permanent damage, and certify the swept
whole ship including deployed and deploying appendages. Use the existing
camera/IMU/star tracker and powered processing mode to reconstruct uncertain
geometry from observations. Unknown space must never become a certified hole
because processing power fell.

[FICTIONAL] Both fields are deliberate additions to physics. Neither is supported
as a real natural phenomenon by the engineering sources. Ordinary propulsion,
tracking, electrical, thermal and geometry constraints remain in force. No hit
counter, random survival roll, truth-mesh reveal or automatic route planner is
proposed.

## Buildable specification

| File | Contents |
| --- | --- |
| [wells.md](wells.md) | 3D response, annulus, Hinge, core, bounded overlap option, events, force/torque and variable-mass work ledger |
| [lattice.md](lattice.md) | Finite sheets, compact exposure, components/electrical effects, whole-ship sweep, reference dimensions and content gates |
| [model-and-interface.md](model-and-interface.md) | Evidence, player-adopted rule, reconstruction/coverage, proposed field and measurement seams, code ownership, screens and tests |
| [Reference usage](../../../tools/studies/s5/README.md) | One-command deterministic generator and its verification limits |
| [Reference vectors](../../../tools/studies/s5/vectors.json) | Inputs, expected outputs, event times, numerical error and convergence for both fields |
| [Handoff](../../handoffs/s5.md) | Verification results and exact requests outside S5 ownership |

## Numbers behind the proposal

[DEMONSTRATED: `tools/studies/s5/generate.py`, `vectors.json`] These are numerical
reference results, not measurements from the TypeScript game or a playtest:

| Question | Result |
| --- | --- |
| Does the annulus make a meaningful Hinge band? | `abs(radial gain)≤0.1` over 534.350 m; crossing at constant radial 100 m/s takes 5.3435 s, consuming 40.866 kg at 24 kN/320 s |
| Does a burn cross smoothly with fuel and work accounted? | The 100 s powered fixture crosses inner/zero/outer shells at 6.787994, 44.690892 and 82.575870 s; midpoint error at 1/16 s is 1.65 mm and 8.31 µm/s against RK4, with a 1.27 J ledger residual |
| Does coasting change? | The 600 s P4 gravity coast is identical with the well enabled and disabled at the same step; field work and fuel use remain zero |
| Does a deployed ship fit? | Centered lab passage has 21.5 m radiator clearance and exactly zero exposure |
| Can a COM-clear passage still fail clearance? | At y=24 m, COM margin is +12 m but deployed radiator margin is −2.5 m; raw radiator exposure is 18.450020 U s |
| Are repeated glances a hit counter? | A point glance gives 8.907690 U s; three passes accumulate 26.723070 U s and trigger component-specific events, with later powered effects suppressed after a trip |
| Can endpoint checks miss a hazard? | Both a fast outside-to-outside tube crossing and a rotating appendage with clear end poses are detected by the swept bound |

[ASSUMED] The lab scales need encounter tuning. A Hinge band that lasts five
seconds rewards prepared burns and replay; it is not time to learn a new screen.
The lattice's outermost skims can be too small to matter individually. The
eight-sheet example is correlated geometry only, not evidence of low blind
survival or a feasible full route. These limits are intentional and stated in
the detailed specifications.

## Evidence and learning

[ESTABLISHED: DECISIONS A4–A5, P5–P7, P11] A well's changed response is a rule:
the player enables a candidate, the model fits its response factors and local
geometry from measured powered arcs, and a held-out test precedes adoption.
An engine-scale fit alone cannot explain opposite radial/tangential responses. A11 requires a
3D radial projector and a two-dimensional tangent projector in spec §6.5.

[ASSUMED] Lattice reconstruction carries estimated finite geometry, joint pose
uncertainty, observation lineage, coverage and detection limits into belief.
Learning the processing interpretation persists; an old run's strand coordinates
do not become a new run's map. A forecast uses only reconstructed geometry and
the player's proposed commands, and stores the geometry version it used.
Missing Room must distinguish unobserved, unresolved and supported clearance.

## Work and decisions to carry to the integrator

[ASSUMED] The full proposal is roughly **3,650–6,500 lines of new/changed
TypeScript including tests**, excluding 2G's existing conversion and generated
content. This is a rough implementation estimate, not a schedule. The detailed
ownership table is in model-and-interface.md. The largest work is swept geometry
and system-event chronology, evidence-based reconstruction, model support and
uncertainty. The point field formulae alone do not deliver those capabilities.

[ASSUMED] Owner questions are independent decisions; present one at a time:

1. **Use the smooth spherical annulus?** Recommend yes, retaining Hinge's real
   near-zero response band and the reference dimensions as initial tuning values.
2. **Permit intersecting wells in first content?** Recommend no. Keep the explicit
   norm-bounded overlap blend as a later option requiring its own validation.
3. **Should accelerometers sense the well-modified push?** Recommend yes, matching
   the current contract. Revise estimator-spec §13.3 after approval.
4. **Should well correction add attitude torque?** Recommend no: apply it at COM
   and preserve nominal actuator moments. Per-nozzle reversal is a different fiction.
5. **Use observation/triangulation reconstruction or direct noisy patches?**
   Recommend observation/triangulation from the existing-hardware processing mode.
   Direct noisy patches are a smaller, stronger sensing fiction that loses the
   parallax/association investigation; they must still retain uncertain coverage.
6. **Keep the baseline conservative appendage exposure rule?** Recommend yes:
   maximum local intensity over each component, with vulnerable subcomponents
   separated where necessary. Do not average an exposed tip into the whole ship.

[ASSUMED] A smaller scope keeps static separated wells, static finite sheets and
simple explicit component envelopes, while retaining the smooth annulus,
deterministic sweeps, per-component exposure and honest observations. It loses
overlap lessons and some geometric fidelity. Hard well edges, point-only ship
clearance or an omniscient reconstruction are not equivalent shortcuts.

## Outstanding implementation validation

[ASSUMED] This study does not demonstrate a fitted well estimator, sensor
reconstruction, full bus/thermal failure response, a production event solver,
deployment sweep of the actual 2G hull, browser performance or a playable route.
The owning code threads must pass the explicit tests in all three documents,
then fly Well Garden, Hinge, Unseen Cathedral, Missing Room and Braided Crossing
with current controls and carried ship state. Test a cautious successful
experiment, an informed passage, the finite exterior bypass, and uninformed
traversals against the actual component-dose simulation. No paper probability
substitutes for those checks.
