# A03 — Borrowed Spin

[ASSUMED] Optional S4 region recommendation; **new hardware and physics, not approved or implemented reuse**. S1 studies tether dynamics, S2 hardware/sensing, S3 the detailed encounter/model; the owner/integrator approves decisions. Their results must replace the feasibility placeholders below before authoring a playable route.

## 1. Compact catalogue entry

| Field | Specification |
|---|---|
| ID / display name | A03 / Borrowed Spin; charted after observing the rotating structure and an approach opportunity. |
| Kind / branch | Combined flight/operation; optional sensing-navigation momentum-exchange detour. |
| Question | Can capture, load, attitude and release be planned as one useful maneuver? |
| Engineering decision | Choose approach velocity, supported capture target, tension/attitude schedule and release time while reserving an uncaptured escape. |
| Success teaches | Measured capture and release can trade structure momentum for a useful onward trajectory at acceptable total cost. |
| Failure teaches | Miss, excessive loading, uncontrolled attitude and wrong-phase release produce different observed histories; abort or cut may preserve ship and evidence, while a fatal break/impact restarts the run. |
| Model evidence | Optical structure/attachment tracks, attitude/rates, commanded operation, measured line state/tension only if S2 hardware supplies it, and recorded forecasts. |
| Proceed / objective | Reach the C04 approach after release, or take a feasible abort/bypass. Capturing by itself is not success. |
| Optional / expiry | N03 → C04 bypasses A03. Skip if hardware, reserves or a measured benefit are absent; solved capture does not remove the release task. |
| Systems / cost | D/E/S plus proposed tether system T; heavy new coupled dynamics, ship assemblies and model work. Integrator must approve and assign T; S1–S3 are studies, not implementations. |

## 2. Place and travel

- **Graph:** N03 → A03 → C04, a distinct volume along an optional forward transfer. A rotating light/occlusion pattern supplies a lead; identifying its axis and attachment geometry requires actual tracking. No branch-completion token grants the detour.
- **Scene / arrival in 3D:** a rotating abandoned structure spans the window; arms sweep above/below and the hologram estimates the axis and attachment velocity. Its motion and the ship share P4 with r₀ = 1,000 km. Tether force/capture behavior comes from S1; no prescribed swing path or infinite-mass anchor.
- **Per-run variation:** spin-axis azimuth 0–360°, elevation −30–30°; spin phase 0–360°; approach bearing ±20° and offset ±0.1 nominal approach range. Select among fixed authored attachment sites only if their hardware is compatible. Keep structure mass, dimensions, inertia, material limits and spin magnitude fixed in the recommended first build. S3's suggested inertia variation needs reconciliation with A10 and should not silently randomize intrinsic properties.
- **Arrival envelope:** actual N03 state, including damaged pointing/control and depleted stores. S1/S2/S3 must provide numerical capture speed, load, angular-rate and hardware-temperature envelopes; S4 does not invent them. Validate 0.8–1.2 nominal approach speed as a geometric test set, but never substitute that ratio for a certified capture limit.
- **Timeline:** observe/prepare in open transit; commitment starts when approaching the attachment sweep. The armed, captured and release phases run at ≥1× on every screen. Structure phase follows run epoch. An uncaptured escape remains available before commitment; after capture, cut/release outcomes depend on measured line state and real hardware.
- **Transit continuity / glimmer:** no free tether appears on arrival; approved equipment must be carried from the run start with mass/power/heat costs. Structure rotation changes in response to exchange. Ship state carries into C04; a successful swing supplies no repair or refill.

## 3. Experiment, forecast and operation

- **Rival explanations / controlled comparison:** distinguish mistaken spin estimate, attachment motion, line stiffness/damping and ship-control error. Track several phases before capture and reserve an unused arc to test the predicted attachment motion. Safe observation/aborted approach teaches without a broken tether.
- **Acquisition:** existing optical/attitude channels plus only S2-approved load/payout sensing. Power, pointing and condition limit the observation; a line-state label cannot come from truth. Record gaps during high-load operation honestly.
- **P5 adoption and fit:** recommend ordinary tether mechanics as known model structure, with numbers fitted from supported measurements; S3 decides the detailed proposal. A fictional mechanism would instead need explicit owner approval/player rule treatment. An unsupported capture forecast must stop or widen, not pretend certainty.
- **P6 forecast:** predict the player's approach, capture command, hardware schedule and release timing, including uncertainty before/while/after tethering. The model never chooses the best phase or silently optimizes release. Preserve the issued forecast when measured tension revises the fit.
- **Operating sequence:** survey → validate track → arm approved hardware → match approach → attempt capture → monitor load/control → release → track exit. Validity records hardware, phase, measured motion, condition and reserve envelopes from S1–S3.
- **Readiness / roll:** recommend a forward-compatible capture approach reachable through yaw/pitch and translation with roll held. Off-axis loading may exhaust held-roll control; prove the limit. A single orientation-specific docking/capture device needing manual roll blocks this region until redesigned or the owner changes A11.

## 4. Consequences and recurrence

- **Outcomes / damage:** success, inconclusive survey, miss, pre-capture abort, mistimed release or damaged continuation are distinct. Line break, recoil, mount overload and winch heat use S1/S2 mechanisms; no scripted random snap. If useful net impulse is too small after detour/control costs, omit the route rather than amplify physics secretly.
- **P8 persistence / Black Box:** retain measured structure/line histories, commands, configurations, issued forecasts, gaps, condition changes and tested procedures. Loss/Recall resets the whole expedition, including carried hardware and structure state, to new seeded geometry; retained knowledge survives.
- **P9 replay:** original spin phase, approach, hardware state, ship mass/condition, reserves and model accompany saved commands. Mismatches require adaptation; release is never automatically retimed.
- **Repeat experience / tenth run:** practiced capture still leaves a current exit vector, changed reserves and damaged control to manage. A successful attachment can produce an unusable release.
- **Presentation:** 2D needs measured attachment velocity, uncertainty, line/load state and predicted release outcomes with missing data explicit. X is not involved; no portal shortcut substitutes for momentum exchange.

## 5. Implementation and verification record

[ASSUMED] Defer implementation until S1 conservation/event vectors, S2 viable assemblies and S3 model/control specification agree. Requested owners span `src/sim/`, `src/ship/`, `src/model/`, content, contracts and 2D screens; assignment and code budget belong to the integrator's T decision. Shared contracts need observable line state, commands and hardware configuration without exposing true force/structure state to belief.

**Acceptance, not executed:** S1 conservation/convergence, clean capture, too-fast break, slack/wrap and wrong-phase release; S2 energy/heat/load/condition and sensed-state checks; S3 held-out forecasts and no-planning controls. Demonstrate successful and aborted routes with actual N03 states, roll held, deterministic replay, immutable records and full-run resource margin. Compare net benefit against the direct N03→C04 transfer. No S4 tether feasibility, load rating or playable capture has been demonstrated.
