# Component condition and chronology (3A)

The baseline is the numerical authority. Lattice units and deterministic buckets
are **[FICTIONAL]**; degradation, reboot, protection and permanent destruction are
different mechanisms. Engineering source categories are R04/R05; the numerical
rules are not flight qualification. Thermal mechanisms use S02/S09/S10/S11.

## Field-to-condition boundary

Agreed with 3C on 2026-11-14. Its `sweepLatticeExposure` returns raw bounded
component dose, chronological slices and strict above-threshold intervals. For
the baseline, supply raw burnout thresholds **8, 10, 20 U**. Those are already raw;
do not divide by susceptibility. Weighted dose thresholds and bucket spacing come
from `radiationProfiles(definition)`; susceptibility is multiplied only here.

1. Cap an interval at the next certified high-intensity edge, source depletion,
   protection trip, mode change, acquisition deadline or other topology change.
   Unknown threshold intervals require geometric refinement. Passing an unresolved
   interval as `aboveBurnout: false` would manufacture safety.
2. Freshly dispatch power at its start and obtain `energizedEquipment`. Rebooting
   devices still draw power; functional recovery and electrical isolation differ.
   Source and idle battery contactors can remain energized on a supplied feeder.
3. Supply a prefix sampler to `nextConditionBoundary`. For every requested prefix,
   re-query actual swept intermediate poses/deployments and its integrated raw
   dose. Refine dose bounds if they straddle the next weighted threshold. Never
   substitute `dose / duration` for peak or contiguous intensity.
4. Advance the existing ship/simulation to that boundary, consuming actual power,
   heat, propellant and impulse. `stepCondition` applies the ending effects.
5. Re-dispatch and re-sweep the remaining time from the changed ship. A failed PDU
   cannot energize later camera burnout, thrust or measurements.

`integrateConditionedInterval` is a callback scheduler for steps 1–5. It does not
provide a second solver, field sampler, recorder or game loop. `onSegment` is the
owner's opportunity to integrate the segment before the ending failure. The
returned final dispatch rates are **not** whole-tick averages. Consumers must
weight segment rates for ledgers and retain their chronology for service/loss.

`nextConditionBoundary` localizes a discrete event to 0.25 ms by default, using
nonlinear prefix integrals. `stepCondition` is deliberately an event-bounded
operation, not permission to deliver an arbitrarily large powered dose at once.
Continuous degradation is evaluated at segment boundaries; bound the ordinary
integration step for convergence. Exact ties process failure, trip, upset, then
equipment ID. Exposure continues while off, tripped, rebooting or failed.

## Saved state and physical effects

| Field | Meaning |
| --- | --- |
| `state.exposure[id]` | Susceptibility-weighted cumulative dose, never cleared by reset |
| `values.radiationDwell` | Contiguous energized time above the raw burnout threshold |
| `radiationUpsetBucket`, `radiationLatchBucket` | Cursors advanced even while off; no queued backlog |
| `radiationRestartUntil` | Temporary reboot end time; functional inhibition, not repair or isolation |
| `radiationRemaining` | Remaining radiation condition multiplier |
| `radiationLeakage` | Extra operating draw fraction, delivered electrically and dissipated as heat |
| `condition` | Permanent condition; zero disables hardware |
| `tripped`, `trippedAt` | Latched protection, deliberately reset through existing commands |

**[ASSUMED]** Above degradation start, condition decreases linearly to failure.
The ratio of successive radiation multipliers preserves unrelated pre-existing
damage. Leakage follows the baseline's separate 0–25% curve. Battery capacity loss
dissipates rejected stored charge as local heat (`capacityLossHeat`, W), once;
`charge + discharged energy + conversion loss + capacity-loss heat` closes the
stored-energy ledger. It does not appear as generated bus energy.

`functionAvailable(e,t)` gates valid sensing/control during reboot or cold
inhibition. The sensor owner must use this before emitting fresh measurements;
stale observations retain their original timestamp. Standard `condition-changed`
events use the actual equipment IDs, so existing A5 aging consumes observed drops.
No truth import or alternate aging implementation is added to the model.

## Thermal network and faults

Existing finite nodes, transport limits, passive conductances, shared geometry,
sun incidence and heat ledger remain authoritative. One surviving active pump
can operate a loop; the two pumps share a loop, so `loop-leak` defeats both.
Exchanger loss removes active cabin/external exchange while retaining declared
passive conduction. Radiators can still radiate stored external-node heat; a
stalled pump cannot transport cabin/service heat actively into that node.
The existing healthy bypass regulation remains passive during reduced control
power; actual pump service determines forced flow. Its 20 W control draw is not
a new all-or-nothing valve interlock. Explicit reboot, cold inhibition, regulator
faults or destruction remove that capability. This preserves the speed-pass
worn-ship tape while giving the new component faults causal consequences.

- `regulator-open`: failed signed forced transport; cold external fluid can freeze
  the local water side. Set on the interface exchanger for its path, or the active
  external pump/controller for the service loop.
- `regulator-closed`: only passive transport on that controlled path.
- `loop-leak`: fault on either pump disables the shared loop's active transport.
- `branch-isolated`: disconnect that radiator branch from the external node.
- `louver-jam`: preserve the last opening. Loss of functional control also holds it.
- `deployment-jam`: preserve the exact intermediate deployment used by inertia,
  clearance, generation and cooling; the other appendage can continue.
- `freeze-rupture`: baseline 60 s cold dwell irreversibly destroys the exchanger.
  Warming, replacing a pump, changing mode or resetting cannot repair it.

These are hardware fault identifiers, **not command strings**. Typed operation,
repair and isolation controls must be agreed through the integrator/root owner.
The existing `antifreeze` mode operates its 220 W heater below 278 K, retaining it
to 283 K, then returning to its 20 W control draw. Cold inhibition exempts commanded
heaters. Overtemperature trips at the equipment limit; persistent residual heat
above limit +10 K for 30 s destroys it. Passive crew/tanks are not electrical
failures. Thermal integration uses <=1 s substeps; thermal threshold timing is
bounded by those steps, while radiation timing has the separate 0.25 ms contract.

The radiator pointing effect remains attitude-relative illumination of the same
deployed geometry; no independent invisible pointing geometry is introduced.

## Loss and transit interfaces

`power/service.ts` reports active air, internal/external cooling, flight computer
and IMU delivery, counting only selected surviving hardware at >=95% required
draw. It also reports irreversible destruction of both PDUs and separate cooling
path integrity. Trips and a dead camera/radiator alone are not terminal signals.

The game owner retains A16/A18 loss handling: irreversible dual-PDU loss; otherwise
120 continuous seconds without critical electrical service, and the sensed
14,400 s endurance caution. Its existing `unservedFunctions` needs reboot/cold
availability and leakage-adjusted required draw when this branch is integrated.
No local timer, warning state, hidden power forecast or resource exemption is added.

The 72 h production ship coast test uses fully deployed arrays/radiators, 600
W/m², fixed initial attitude with free coast, fuel cells off and quiet payloads.
It retains all life-support loads, finite batteries and real heaters/heat transport.
It does not certify an arbitrary encounter's illumination or long-flight schedule.

## Verification and limits

`condition.test.ts` covers off-state accumulation, partition/dwell, reset, JSON
resume and actual model aging. `s17.test.ts` independently integrates S17's compact
camera/PDU polynomial exposures through real power/thermal dispatch and matches
their reference burnout times within 1 ms. It does not certify S17's full 42-part
geometry, appendage sweep, first-contact UI or twenty-fence flight.

Root wiring, typed shared exposure contracts, unresolved-bound refinement and
loss chronology remain integration dependencies in `docs/handoffs/3A.md`.
