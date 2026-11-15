# S1 integration and play proposal

This is an implementation request, not an approved feature or a change to another thread's files. Numerical results and the reference algorithm are in [tether.md](tether.md); material and mission sources are in [sources.md](sources.md). All effort estimates and proposed behavior below are [ASSUMED].

## Recommendation and boundaries

[ASSUMED] Build Borrowed Spin as an optional, forward-rejoining momentum-exchange route after the 2G conversion. Preserve finite mass, recoil, off-center torque, unilateral tension, paid reel work, structural overload and free-flight release from the first playable version. The useful maneuver is a change in departure velocity in the desired direction, compared with an untethered flight from the same initial state. A large speed change directed away from Stillwater is a failed maneuver, not a reward.

[ESTABLISHED: repository `docs/DECISIONS.md` A9–A13 and `docs/handoffs/region-proposal/README.md`] The ship keeps its actual reserves and damage; a loss restarts the expedition. The encounter runs in real time without pause. Borrowed Spin is proposed as an optional route from Unseen Cathedral to Stillwater. A paper trajectory does not demonstrate a playable or balanced transfer.

[ESTABLISHED: source inspection, `src/sim/simulation.ts`, `src/ship/massprops/massprops.ts`, `src/model/dynamics.ts`, `src/contracts/README.md` at study base `baf65e0`] Contracts already describe 3D state, but the simulation, mass properties and forecast implementation at this study's starting revision still contain `LIFT(2G)` planar behavior. The final TypeScript work must use the completed 2G implementation. The study's declared 3D inertia construction is a reference assumption; it must not overwrite the eventual 2G tensor or claim that the earlier scalar baseline fully specifies one.

## Why this needs a coupled-body subsystem

[ESTABLISHED: repository `src/contracts/truth/world.ts` and `src/contracts/truth/fields.ts`] `Asteroid` has no physical mass or angular state. `MassiveBody` has a gravity parameter and a spherical collision radius, but no rigid-body attitude or inertia. `EnvironmentField.acceleration(position,t)` cannot receive the tether endpoint velocities, mutate a structure's angular momentum, or apply a reciprocal reaction. Encoding the maneuver as a prescribed acceleration field would therefore leave the required coupling outside the current interface.

[ASSUMED] Add a rigid structure and tether state to truth, with one coupled mechanics solve for the ship and structure. Reuse the P4 acceleration calculation for each center of mass. A structure is not an immovable pivot: every tether force and capture impulse must have an equal and opposite reaction and the appropriate moment arm on both bodies. If gravity backreaction on a distant source is neglected as in the existing test-particle approximation, report external impulse/work instead of claiming that the two moving bodies are an isolated system.

| Proposed destination | Required work | Implementation estimate |
| --- | --- | ---: |
| `src/contracts/truth/world.ts`, new `truth/tether.ts`, `truth/events.ts`, simulation state/snapshot types | Finite rigid structure; current pose and angular momentum or velocity; attachment identity; tether modes and event state; serializable ledgers; substep settings | 180–300 lines |
| `src/sim/tether/`, `src/sim/simulation.ts`, `src/sim/snapshot.ts` | Off-center coupled forces, unilateral constitutive law, fixed substeps, event splitting/order, snapshots, invariants, guide case | 600–1,000 lines |
| `src/ship/tether/`, `src/ship/commands.ts`, power/thermal/condition coupling | Winch and capture hardware, command limits, instantaneous overload response, electrical and brake heat ledgers, load telemetry | 250–450 lines |
| Shared `commands.ts`, `measurements.ts`, `belief.ts`, `forecast.ts`, `view.ts`; `src/game/truth-step.ts`, environment and belief adapters | Commands, sensed events, structure tracks, attachment estimates, same-tick load feedback, frozen forecast inputs | 300–500 lines |
| `src/model/tether/`, `adapt.ts`, `dynamics.ts`, `forecast.ts` | Belief-only structure and line propagation, fit support/uncertainty, mixed-event forecast results, contaminated-arc gating | 450–800 lines |
| `src/console/encounters/borrowed-spin/`, `src/view3d/`, encounter content and data | Controls, instrument display, tracked geometry, clearance and release comparison, authored arrival variants | 450–800 lines |
| Tests under the corresponding owner directories | Reference comparison, invariants, replay, event, sensor, resource and encounter cases | 1,000–1,800 lines |

[ASSUMED] These estimates total approximately 2,230–3,850 implementation lines plus tests for a bounded two-body/one-line version with authored guide paths. They exclude a general rope/contact solver, detailed structural finite-element analysis, new art assets and a complete S3 encounter authoring pass. A segmented rope with self-contact, multiple wraps and capstan friction is a separate substantial increment; do not hide it in the field-plugin estimate.

## Contracts and step ownership

[ASSUMED] Request the following explicit contracts, with SI units and the project's existing body-to-inertial quaternion convention:

- A nominal rigid-structure specification with mass, center-of-mass datum, full inertia, hull, named attachment/guide positions, and nominal limits. True current state and deviations remain in `truth/`; surveyed dimensions, measured pose and estimated inertia remain on the belief side.
- A tether specification with unstrained length range, mass or declared massless approximation, force law, effective stiffness and damping, load ratings, winch rate/power/force limits and release latency. Actual condition and instantaneous break state belong to truth. Spec-sheet limits and measured condition are belief-safe.
- A serializable tether state with endpoint body/port IDs, attachment mode, rest length, commanded length rate, slack/taut status, optional authored guide path, dissipated/work counters and a stable event sequence. Save every hidden state needed to continue a step exactly; no solver cache may be required after load.
- Commands to arm/capture, reel at a signed requested rate, brake/hold, and release/cut. Record requested and achieved execution, including limited or rejected commands. A latched capture needs a measured contact confirmation, not an automatic successful latch merely because the user pressed the button.
- Truth events for capture, tautening, overload, break, release and contact with their resolved substep times. Separately emit only sensed `ShipEvent`s and measurements; do not forward hidden material strength, unsensed collision identity or true remaining margin into Black Box.
- A mechanics output carrying integrated specific impulse, maximum and sampled tether tension, maximum local assembly acceleration/torque, event time and work/heat. A 1 s average alone is insufficient to catch a short overload.

[ESTABLISHED: source inspection, `src/game/truth-step.ts` and `src/contracts/README.md` § One simulation tick] The current sequence steps ship systems first for the whole tick, then integrates mechanics; accelerometers receive the previous tick's specific force. A newly broken cable can therefore affect power, hardware and recording within the same tick only if that sequence gains an explicit mechanics-feedback phase or a defined coupled substep phase.

[ASSUMED] Keep the public clock at 1 s. Within an attached tick, use the fixed mechanical substeps and event policy specified in `tether.md`. Charge slower resource states once from integrated work/heat, while evaluating mechanical break thresholds and local peak loads at their mechanical times. Do not call the entire ship-system step at every microstep and accidentally multiply controller actions, sensor samples, thermal integration, recorder demand or RNG draws. Sensor samples have their own scheduled acquisition times; event records retain mechanical times even if a display receives them at the next frame.

[ASSUMED] Before a frame is published, feed the event/peak ledger through structural condition and capture/release state. An overload must stop the tension force during the remaining fraction of that tick, not only lower a health bar next tick. The event order, tie-breaking and last partial substep are versioned behavior shared with the Python reference. Never resolve an event by teleporting the ship to a prescribed orbit or assigning a departure velocity.

[ASSUMED] Winch work and controls require particular care. Reel-in changes the mechanical energy budget; pay-out needs a rated brake or regeneration path. Use the work expression and signs derived in `tether.md`, with actual achieved length rate. A clamped motor cannot silently deliver the requested rate. Release removes the force without adding a scripted velocity kick. If the model discards remaining elastic energy at a cut, account for its destination explicitly as unresolved cable recoil/dissipation, with the approximation stated.

## Model and observability

[ESTABLISHED: repository `src/contracts/README.md`, `src/model/adapt.ts`, `src/model/dynamics.ts`, `src/model/forecast.ts`] P11 blocks model imports of truth and `src/sim/`. At the study base, the estimator's accelerometer treatment is tied to commanded propulsion, and the model fits engine-related specific force. A tether is an additional non-gravitational force that acts even with every engine off. P7 therefore requires it in measured specific force, with gravity still inferred from tracking.

[ASSUMED] Start with observed structure feature tracks, measured ship pose/rate, nominal ship mass properties from gauged tanks, reel encoder history and a load-cell channel only if S2 provides that hardware. Track at least enough distinguishable features to constrain structure attitude and spin; a single center-of-mass track gives translation, not a full rotation solution. Feature occlusion, ambiguous geometry and old observations must broaden uncertainty. Free rotation alone does not identify absolute mass or inertia. A measured tether torque and observed angular response can constrain the relevant inertia combination; unexcited axes keep priors.

[ASSUMED] Gate tether-attached intervals out of ordinary coast/gravity and engine-scale calibration until a tether-aware observation model is selected. Unknown attachment or an unsensed break makes an interval uncertain; it must not be treated as clean ballistic data. Retain the original samples for later refitting. Otherwise a gravity fit can explain tether pull with false GM, or a simultaneous engine burn can absorb the line force into thruster scale. Attach/detach event uncertainty belongs in that gating decision.

[ASSUMED] The belief propagator accepts only estimated endpoint states, mass/inertia, geometry, material parameters and the player's chosen control/release schedule. It does not import the truth tether solver. A pure mathematical helper in a neutral `src/lib/` path is possible only after the integrator explicitly approves its interface; independent TypeScript/reference verification is still needed. Nominal mechanical laws are existing engineering knowledge, not a newly discovered fictional law. Learning estimates structure properties, condition and the local gravity environment; S3 should decide how this appears in the existing extension workflow.

[ASSUMED] Forecast inputs must freeze the estimated structure state and covariance, tether parameter assumptions and support, hardware configuration, remaining resource estimates and issued control schedule. Different plausible cases can cross different events: some attach, some miss, some snap. A single Gaussian ellipsoid through these cases is misleading. Show conditional trajectories and clear unavailable/uncertain outcomes, or end the forecast at the first unsupported capture/contact event. A later measurement must not rewrite an issued forecast.

[ASSUMED] Report both the change relative to an untethered coast and its projection toward the player's intended departure corridor. Do not auto-select capture geometry, winch history or release phase. A release comparison for player-selected times is forecasting under P6, while silently choosing the best time is planning.

## What the screens need from 2D

[ASSUMED] FLIGHT should show the tracked structure, estimated spin axis and sweep volume, measured/estimated attachment-point velocity, ship attitude and whole-hull clearance. Draw a tether route only to the extent supported by sensing and its current modeled topology. A slack endpoint distance does not reveal an actual rope curve. Mark occluded or unobserved cable sections as uncertain.

[ASSUMED] Put capture relative velocity, measured tension with history, reel length/rate, current angular rate, mount load estimate and release-trajectory comparison near the controls. Separate nominal hardware limit from estimated current condition and measured load. A blank or stale tension reading is not zero tension. Display force direction and turn tendency so the player can distinguish a dangerous lever arm from merely high translational acceleration.

[ASSUMED] SHIP should expose the load path, mount location relative to the measured center of mass, actual appendage state, winch/brake heat and available RCS authority. CONSOLE/Black Box should compare capture, first tautening, peak load and release across attempts, retaining measurements, dropouts, commands and the originally issued forecast. MAP should retain surveyed landmarks without substituting a previous run's pose for the current structure.

[ESTABLISHED: repository `docs/build-plan/README.md` Convention 11] 2D owns all visual implementation and must use `src/theme/` tokens/primitives. S1 supplies physical quantities and uncertainty semantics, not new visual colors or a parallel UI system.

## Controls, skill and the tenth run

| Player control | Physical consequence | Persistent skill demand |
| --- | --- | --- |
| Approach and capture timing | Relative velocity at the two actual attachment points determines capture load; CoM closing speed is not enough | Match a rotating point in 3D while keeping the hull clear and reserving correction propellant |
| Reel-in, pay-out and brake | Change tension, geometry, mechanical work and brake heat within hardware limits | Trade a useful turn against overload, slack/contact risk and power/thermal capacity |
| Attitude/RCS mode | Change line direction through the mount, rotational response, sensor pointing and appendage clearance | Keep the load near a supportable direction without asking finite RCS to cancel an arbitrarily large tether torque |
| Release/cut time | End the interaction at the current actual state; late/early release changes departure direction | Refresh phase from observation, anticipate latency and judge trajectory, rather than replaying a memorized timestamp |
| Configuration and sensing allocation | Change inertia, envelope, cooling and measurement quality | Prepare the surviving ship and choose which observations can be afforded during commitment |

[ASSUMED] All rows propose controls, not a demonstrated difficulty result. Attitude hold must consume available actuators and saturate; it cannot directly overwrite attitude or erase tether torque. The approved yaw/pitch plus roll-held interface should remain until the owner changes it; choose a gimballed/suitable mounting arrangement or make roll-hold saturation visible, rather than silently adding unrestricted roll control.

[ASSUMED] Keep structure mass, geometry, inertia, law and material ratings fixed across runs. Vary initial spin-axis orientation/phase, approach geometry and which already-defined attachment is usable, within authored bounds. The earlier region proposal mentions varying inertia; the conservative S1 recommendation avoids hidden parameter changes and follows A10's fixed-world intention. If the owner wants physically different structures across runs, ask separately and expose that distinction in observations.

[ASSUMED] Familiar runs remain dangerous because the current arrival vector, remaining RCS, moved center of mass, hot brake, damaged appendage and stale spin estimate change the maneuver. These are consequences of the run, not surprise failure rolls or deliberately erased knowledge. A saved procedure may carry useful constraints and a command sequence, but its timing must be checked against the current observed phase. No capture-success gate should guarantee the later release corridor.

[ASSUMED] The tenth-run acceptance test is behavioral: with retained rule/model knowledge and the saved successful procedure, a competent player can adapt and conserve resources, while blindly replaying the old timestamp can miss the departure corridor or exceed a real margin. It is acceptable for a well-measured, well-executed maneuver to become reliable; A9 does not authorize manufacturing unavoidable death.

## Minimum and ambitious versions

[ASSUMED] The minimum credible version is one finite rigid structure, one ship, one line, a small number of known attachment points, a compliant winch law, off-center reactions, explicit overload/release events and authored collision exclusions. An authored guide path can represent a line already routed around a specified structure feature, as in the reference's slack-wrap case. It does not predict where a freely floating slack cable goes or discover arbitrary entanglement. Mark that support boundary in content validation and in the forecast.

[ASSUMED] The ambitious version adds finite-mass cable nodes, moving guide/contact points on arbitrary structure geometry, line/ship/appendage swept contact, multiple wraps, optional friction and cable damage. Coupled contact impulses must conserve momentum and account for frictional heat; a capstan is not a force multiplier without reaction torque. It also adds uncertain feature tracking, load-path condition, phase-sensitive forecasts and a complete S3 arrival/departure corridor.

[ASSUMED] The smaller version loses arbitrary draping, entanglement discovery, cable recoil/whip and the possibility of improvising a new wrap. It can retain the central play experience of loading, riding and releasing a physical momentum exchange. It cannot truthfully advertise general rope physics. Conversely, merely constraining the ship to an animated circle would lose the question S1 was asked to answer.

## Acceptance tests requested from the implementers

[ASSUMED] These are proposed checks. Python evidence is listed in `tether.md`; no TypeScript tether implementation or playtest is claimed here.

1. Reproduce every S1 JSON vector at the documented mechanical step and tolerances, including the clean release, over-speed break, authored slack/guide path and wrong-phase release. Compare world-space translation, quaternion equivalence, angular momentum, peak tension, event time and work/heat ledgers.
2. Verify equal/opposite endpoint forces and full orbital-plus-spin angular momentum for arbitrary 3D rotations and off-center mounts. Include asymmetric principal inertia and a non-principal spin, not only a rotation about one axis.
3. With gravity, damping, winch and contact disabled, verify total momentum, angular momentum and mechanical-energy drift. With each term enabled individually, include its external impulse/torque/work or dissipated energy and verify the corrected ledger. Do not use raw two-body momentum conservation under an external gravity field.
4. Verify capture and release at a tick edge, within a tick and at a tied event time, exactly once. Assert no teleport, no release velocity impulse, no force after break, no compressive force when slack and no unaccounted energy creation from capture, guide routing or snapping.
5. Halve the fixed mechanical step and show convergence of peak tension, event times and outgoing state. Show that a 1 s unsplit stiff integration is insufficient where the reference establishes that, and preserve the chosen substep setting through saves.
6. Replay identical command streams and seeded observations through single steps, bulk runs, JSON save/restore, frame-rate changes and warp changes. Require identical same-runtime state and event ordering. Record numeric tolerances separately for Python/TypeScript and cross-platform comparisons.
7. Force winch power shortage, brake heating, overloaded mount, disabled load cell, RCS saturation and depleted RCS. Check actual achieved motion/work, temperature and condition feedback, missing observations and rejection/limitation records. Releasing cannot repair hardware or refill resources.
8. Assert accelerometers sense tether-specific force with engines off. Confirm unsensed gravity never appears as an accelerometer channel. Ensure tether-attached arcs cannot silently change gravity calibration or engine scale without the matching observation model.
9. Withhold structure features or load telemetry and check that belief uncertainty grows or the forecast stops. Mutate hidden truth inertia while holding the recorded evidence fixed: the issued belief forecast must remain unchanged. Add P11 lint/boundary tests for all new imports.
10. Run a withheld geometry set with full retained knowledge, current ship condition and saved procedures. Measure useful departure change, reserve costs, load margin and failures due to wrong phase or deficient observations. Test a valid bypass as well as the tether route. This is the check that could establish playability and A9 pressure.

## Decisions for the owner, through the integrator

| One decision | Recommendation | What it resolves |
| --- | --- | --- |
| Should Borrowed Spin proceed as an optional encounter after 2G? | Yes, conditional on the S1 physical reference and S2 hardware having acceptable margins, followed by S3/3E play tests | Funds a real coupled-body subsystem without making it a mandatory expedition gate |
| Should the first version allow arbitrary cable entanglement? | No; implement one line and explicit authored guides first, reserving general segmented contact for the ambitious version | Makes the slack-wrap support boundary honest and bounds the first build |
| Should structure inertia change secretly between runs? | No; keep physical properties fixed and vary observed initial geometry/phase | Preserves learned physics while requiring fresh timing |
| Should a structural cable break automatically count as loss of the whole ship? | No; apply mount damage, released motion and collision consequences physically; permit survival when those permit it | Makes safe abort and learned failure possible without a universal failure counter |

[ASSUMED] S2 should recommend capture hardware, rated strength, sensors and material/environment derating; S3 should recommend encounter geometry and forecast interaction. The integrator owns the final shared contracts, data and decision entries. S1 requests these changes without implementing them outside its ownership.
