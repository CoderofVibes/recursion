# Encounter authoring template

Use alongside the owner-approved [expedition](expedition.md), [creative brief](../CREATIVE_BRIEF.md), [decisions](../DECISIONS.md), 1B physics and 1C ship baseline. This is a design specification, not a replacement for integrator-owned contracts. Fill every field; use “not applicable” with a reason. Mark unverified choices **[ASSUMED]**, deliberate departures **[FICTIONAL]**, sourced engineering **[ESTABLISHED: bibliography ID]**, and actual results **[DEMONSTRATED: test/playtest reference]**. Bibliography IDs come from [References/BIBLIOGRAPHY.md](../../References/BIBLIOGRAPHY.md).

## 1. Compact catalogue entry

| Field | Author fills in |
|---|---|
| ID / display name | Stable author ID; display name and when the player can know it. |
| Kind / branch | Flight and operation / observation and interpretation / controlled experiment / combined; shared, power/thermal, sensing/navigation or home. |
| Question | One falsifiable uncertainty or consequential operating problem. |
| Engineering decision | What configuration, power, pointing, processing, burn or recording choice changes the outcome? |
| Success teaches | Supported conclusion plus a successful, survivable way to obtain it. |
| Failure teaches | Distinguish residual/error, abort, recoverable damage and loss; identify what evidence each actually retains. |
| Model evidence | Measured quantities, acquisition conditions, uncertainties and comparison records; never truth-only fields. |
| Proceed | Current capability and player-authored procedure that permit the chosen exit; equivalent evidence elsewhere counts. |
| Optional / expiry | Bypass route; unanswered question that makes this useful; condition that ends its value; changes that justify revisiting. |
| Systems / cost | D/E/S/W/L/X; light reuse, medium or heavy new system. Name shared work and first owner; request any seventh system from integrator. |

## 2. Place and travel

- **Graph:** entry/exit/spur IDs, direction, physical corridors and alternate/return route. State which connections are author knowledge and what observations add them to the chart.
- **Scene:** body/obstacle geometry, frames, field extents and initial states; units and 1B parameter references, not improvised constants. Apply the same attraction to all relevant bodies. Respect planar control and whole-ship geometry.
- **Arrival envelope:** supported pose/velocity/attitude, configuration, condition and resource ranges, including arrivals from either branch order. Do not substitute an ideal fresh ship for the actual arrival state.
- **Timeline:** deterministic phase and time origin, local commitment point, safe preparation/standoff region, escape/abort trajectories, possible future windows. No hidden timer reset on discovery.
- **Transit continuity:** state carried across scene boundaries; fixed-step resource use and sensing during transfers/time acceleration. No repair, refill, reset or arbitrary resource tax.
- **Glimmer:** observable signal, range/coverage requirements, rival interpretations and destination. Never expose an unsensed lead because a visit counter advanced.

## 3. Experiment, forecast and operation

- **Rival explanations:** hypotheses and observations that distinguish them. For example, separate distance-law error from mass/calibration/second-body error; separate a local thrust rule from coasting motion.
- **Controlled comparison:** what the player varies, what stays comparable, how the trial can succeed without death, and which limits trigger a safe abort. Describe usable evidence even when the result contradicts the hypothesis.
- **Acquisition:** sensor hardware, processing mode, power/pointing/condition dependencies, sampling/recording budget and data gaps. Gravity evidence uses tracking. A processing mode may not conjure hardware or leak hidden field geometry.
- **P5 adoption and fit:** numerical parameters the model may fit automatically; any rule family the player must enable; independent held-out trajectory/view; adequacy/uncertainty criteria. No numeric password, automatic rule invention or truth-backed “correct” badge.
- **P6 forecast:** the player's plan inputs, measured/assumed world, uncertainty/extrapolation limits and frozen issued forecast. Name unsupported geometry explicitly; do not use the truth renderer as the believed map.
- **Operating sequence:** meaningful commands, load competition, cooling/propulsion/control consequences and whole-ship clearance. Reference 1C equipment/rating assumptions. List the procedure's validity envelope, not a single ideal command script as the sole solution.
- **Readiness:** observable evidence of sufficient tracking, control, clearance and resource margin for this approach and its abort. Warnings explain shortages; physical feasibility determines outcomes. No visited-node, death-count or saved-procedure-file requirement.

## 4. Consequences and recurrence

- **Outcomes:** successful observation, successful transit, inconclusive result, abort, missed window, degraded continuation and loss. Describe telemetry that distinguishes them; avoid omniscient explanations.
- **Damage:** field exposure → affected components → persistent condition/resource consequences. Lattice contact is cumulative per-component exposure; no universal hit count or random survival roll.
- **P8 persistence:** reset all physical state only on loss/Recall; keep acquired records up to loss, adopted extensions, procedures and charted leads. Rebuild belief from retained evidence. Preserve original forecasts and measurement gaps.
- **P9 replay:** saved commands and tested start state, resource/condition/configuration bounds, model version, observation coverage and environment phase. Exact replay only under matching conditions; otherwise disclose mismatches for player adaptation. Never silently replan or retime.
- **Repeat experience:** which measurements still need refreshing; which answered experiment becomes skippable; what physical execution remains; how changed equipment/arrival can reopen the question.
- **Presentation:** instrument controls/readings, sensed 3D content, Black Box comparisons and restrained feedback. For X, declare visible connections, transfer frame/velocity convention, partial-crossing behavior and unchanged surviving ship state; Earth visibility follows sensing.

## 5. Implementation and verification record

Name content owner, shared dependencies, unresolved 1B/1C values, contracts requested from the integrator and build phase. Do not write outside assigned paths. Separate proposed acceptance criteria from executed results.

Before calling a route playable, attach a reproducible harness command/report with start state, content/version, seed and command sequence. Report outcome, minimum full-ship clearance, tracking quality, propellant/charge reserves, thermal limits and component damage. Include:

1. A survivable success and an informative abort or recoverable failure; no required death.
2. Representative arrival/resource/condition states, both branch orders where relevant, and a complete connecting route so individually feasible encounters do not exhaust the ship in sequence.
3. Timing/geometry/processing sensitivity; for the lattice, a specified seeded blind-traversal sweep and its observed rate, not a claim of impossibility.
4. A held-out prediction check; unseen truth stays absent; old issued forecasts remain unchanged after refitting.
5. Same start/commands reproduce results; loss/Recall retains only acquired information; matching procedure replay reproduces its result and mismatches are surfaced.
6. Optional offshoot skipped after its question is resolved; equivalent evidence elsewhere works; early exit contact and a zero-loss completion remain possible.
7. For X, full-ship transfer/closure edge cases, future windows, observable views and exact surviving-state carry-through; Earth is never hidden solely for a reveal.

Finish with actual test/playtest references and remaining limitations. A paper calculation, authored route, or this completed template is not proof of playability.
