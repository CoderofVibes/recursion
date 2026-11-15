# Borrowed Spin — interaction contract for 2D

`[ASSUMED]` Behavior specification only; no screen implementation or new visual tokens. The encounter is [encounter.md](encounter.md), the belief/forecast data are [model-addendum.md](model-addendum.md). A8/A11 composition, A12 time and P6/P10/P11 semantics win over older prototypes. All color, typography, line style, sizing, materials, sound/motion timing and warning primitives belong to 2D's `src/theme/`.

## Stable instruments while the world moves

FLIGHT remains a hologram above the table with the optical window behind it. Put the ship back in the view, leaving room for the oncoming structure. Use one coherent inertial/heading reference and display any target-relative frame change explicitly. A camera orbit changes the view, never the ship, sensor pointing, acquired data or simulation speed. Keep normal hands-on yaw/pitch, translation and throttle; do not invent a roll requirement.

Keep these functions immediately reachable through aim, load and release; final layout is 2D's:

| Function | Shows / accepts | Evidence boundary |
|---|---|---|
| Target and geometry | Selected tracked pad; center/pad velocity arrows; spin-axis estimate; full current ship outline; line endpoint(s) and observed arm geometry | Selection does not reveal hidden pads. Axis/geometry carry uncertainty and last-observed age |
| Capture-relative inset | Two orthogonal projections or an end-on view with depth/range-rate, transverse relative velocity and capture-device footprint | No center-to-center speed substitution; a single screen overlap is insufficient |
| Load strip | Tension and rated/estimated limit, payout and rate, brake heat, latch/line-state indication, current attitude rate/control saturation | Commanded mode, measured state and inferred state are separate; missing telemetry is missing |
| Trajectory | Measured solid trail, selected frozen issued forecast with its uncertainty and endpoint, optional unissued preview clearly distinguished | No future truth. Never redraw an old issued path under a new fit |
| Manual actions | Arm, fire, payout/reel command and brake setting, release, separate guarded cut, existing flight controls | Names and allowed states reconcile to S2; every command/status recorded |
| Departure context | Player-selected sensed Stillwater direction/corridor and this plan's predicted outgoing state | No best-release tick, optimal arrow, ranked target, auto-alignment or solver-chosen path |
| Operating margin | Propellant/charge, relevant control authority, cooling/brake trend and sensor/recorder availability | Current telemetry and estimates; no unexplained safety score |

The dotted forecast tracks the center of mass. Short body-axis and thrust ticks remain distinct from velocity and tether direction. The full-ship clearance outline is separate from the positional uncertainty envelope; both are needed. When the line is slack, do not draw a taut segment that implies known cable shape. Show endpoint/length evidence and a conservative unresolved cable volume if supported by S1/S2; otherwise stop line-clearance certification.

Two measured features of the spinning structure visibly continue around their axis after latch. If the observed rotation change is below its noise, the axis/rate estimate stays uncertain; do not amplify the change theatrically and label it measured.

## Per-phase operation

| Phase | FLIGHT: see and do | CONSOLE: see and do | Forecast / evidence behavior |
|---|---|---|---|
| Transit preparation | Preview known charted structure from a distance, inspect ship configuration; normal flight remains available | Review archived load/phase plots, hardware ratings, saved-procedure mismatches; set recorder, power, deployment and brake; author any timed actions explicitly | Old geometry is an archive overlay, not today's target map. Full preparation time with simulation running in safe transit |
| Survey | Point camera; watch several identifiable features and a growing measured track; use camera orbit and a changed ship viewpoint separately | Feature track quality/age, range source, phase/rate uncertainty, sensor draw and recording rate; choose records for a calibration check | Spin axis starts broad, may be ambiguous; inertia stays prior-dominated until loaded evidence exists |
| Approach | Select a measured pad; fly translation/yaw/pitch to match its 3D motion; inspect off-plane clearance; arm when desired | Compact current capture geometry, approach input values, hardware state; edits take effect in real time | Free trajectory always honest; capture-conditioned continuation only for an explicitly attempted capture and only as a conditional branch |
| Fire / capture | Fire explicitly; see launch/device motion only to the degree sensed; observe pad-relative separation and latch feedback | Command receipt/status, current sample age, latch telemetry and tension trend | An acknowledged fire is not an acknowledged capture. Miss branch remains possible. No snap-to-pad animation |
| Load onset | Watch line evidence, rising load, ship curvature and body rotation; command payout/brake and attitude manually | Show commanded brake vs actual payout/tension, accumulated brake heat and power/authority interactions | Event marker at observed latch/load; large residuals stay visible. A new forecast may begin from new measurements; original stays frozen |
| Swing | Track clearance above/below and behind; inspect selected future release consequence; keep release/cut directly accessible | Real-time load/temperature/rotation plots; change power or recorder without stopping world; compare only the player-selected plan | With no release requested, forecast remains tethered. Do not display a preferred release window or move release time to make the exit work |
| Release | Release now, or execute the player's previously set time; see command feedback, then measured separation; fly free | Show execution time and separation evidence, current line state, outgoing velocity and predicted Stillwater miss | New free-flight estimate starts only when release is observed/supported. A command can fail or be late; retain that distinction |
| Rejoin / investigate | Fly corrections toward charted Stillwater; inspect remaining cable and appendage clearance | Compare actual departure against frozen issued prediction; current resource ledger; save procedure with validity bounds | Replay can freeze historical data. Live ship continues unless the encounter has ended; no replay scrub affects physics |

## P6: preview is never execution

Provide two explicitly separate actions: **preview/issue this forecast** and **execute these commands**. A release-now preview asks what would happen if released at the stated epoch; it does not release. A player may manually enter a release time or scrub a prospective time and see that one consequence. Do not search all times, snap to a successful time, shade a computed best interval, optimize brake settings or select a pad automatically.

The neutral-controls forecast must use the measured line mode. It may set commanded propulsion to zero while retaining current brake/payout commands, but it cannot silently remove tether force. A manually entered brake schedule is a commanded schedule, not ideal force control; actuator lag, saturation and uncertainty remain in the forecast.

Show capture/miss or attached/released alternatives separately when supported. Do not average disconnected futures into a plausible-looking middle arc. Branch visibility never implies probability unless the model actually calculates and validates one. If the worker cannot support an event, stop the trajectory at that event with a horizon indicator; do not interpolate through it.

## No pause and no surprise mode changes

Inside this encounter, switching FLIGHT/CONSOLE/SHIP/MAP, opening a plot, selecting a pad, issuing a forecast or reviewing a comparison never freezes time or makes it slower than 1×. Use A12's existing default: an alert drops warp to 1×; it does not stop motion. The hidden-page hold is only the approved whole-app exception with no observation or editing while hidden, never an accessible tactical pause.

The CONSOLE remains its normal full-screen view. A persistent live time/load/state strip and accessible release/cut controls preserve urgent operation without forcing a trip through the room. Keep values and action positions stable; do not move release because a phase changed. Release/cut need command acknowledgement and hardware feedback. Arm the cutter using a distinct guarded control during preparation; once available, emergency use must not require a confirmation modal, a multi-second hold or a hidden submenu. Unarmed cut remains reachable through a clear deliberate arm-then-act sequence. The game does not automatically arm or cut based on forecast clearance.

On focus/view transitions, clear stuck momentary flight inputs using the normal flight-input policy and record any resulting neutral command; do not change latched brake/payout modes, release the line or hide a retained throttle. Expose the actual current command state. The implementation must resolve its existing throttle/focus behavior in one place rather than add a special S3 autopilot.

Immediate UI acknowledgement means receipt only. Physical execution follows deterministic command timestamps and S1's event stepping. If commands are still quantized to 1 s, disclose/use that delay in the forecast and procedure bounds. Do not claim subsecond release precision merely because the button animates at display rate. Request sub-tick command scheduling only if S1's timing sweeps show the 1 s envelope cannot support hands-on play; preserve fixed deterministic stepping and record scheduled versus executed times.

## Legibility without explanatory prose

Short familiar instrument labels, units, state icons and accessible equivalents are allowed. A first failure must be readable from synchronized motion and traces, without a narrated cause, tutorial paragraph or truth-only diagnosis. Use motion/shape/position as well as theme color. In live flight prioritize immediate action; detailed causal inspection belongs in Black Box or a safe transit.

| Failure | Immediately visible chain | Black Box comparison the player can inspect | What must remain uncertain |
|---|---|---|---|
| Too fast / missed capture | Relative-velocity arrow stays long; pad passes the capture footprint; latch indication stays open; tension stays zero | Approach velocity and two-view miss geometry beside command and observed pad track | A camera gap cannot establish exactly where the device missed |
| Fast load take-up | Line becomes loaded, payout slows, tension trace rises sharply; ship rate changes; limit/protection or break indication follows if sensed | Same time cursor on relative speed, payout, tension, specific force and event markers | A peak between samples is an interval/uncertainty, not an invented precise value |
| Brake saturation / heat | Commanded setting persists while measured payout changes; thermal/load trend reaches its equipment limit | Brake command, measured payout and temperature show the first departure before the later trajectory error | A failed load cell prevents declaring an exact overload cause |
| Out-of-plane arm/appendage strike | Main projection looked clear; alternate view shows the measured arm or ship envelope intersecting; attitude/contact feedback follows | Full ship configuration and measured approach geometry at first margin loss | Unknown obstacles stay unknown; do not reveal a hidden arm after death |
| Slack-line snag | Excess line/slack uncertainty, then unexpected tension and attitude-rate excursion | Payout, endpoint motion, optical cable evidence if present, tension and rate aligned | Without a measured contact, label line state uncertain; do not draw a solved wrap around a hidden object |
| Release too early/late | Load falls at separation; velocity continues along the observed tangent, missing the chosen departure corridor | Command vs actual separation time, frozen forecast and measured outgoing track | A forecast endpoint before release cannot be shown as a promised successful departure |
| Lost tracking | Feature fixes stop; age increases, covariance spreads and forecast stops; optical scene may still move | Pointing, power, occlusion indications and acquisition gaps align with loss of predictive support | Do not replace the missing data with a beautifully accurate outline |
| Stale saved procedure | Original expected pad/phase overlay and today's measured pad disagree before execution | Separate run/frame labels, explicit alignment chosen by player, original timed commands | Never quietly rephase the original recording to make it appear correct |

On loss, honor A9's black/shake/restart. Persist the measured event chain through the last acquired sample. After restart Black Box can offer the last attempt's timeline and the first **recorded** significant divergence, not an omniscient cause-of-death answer. A recoverable miss or successful short trial offers exactly the same comparison tools; evidence never requires death.

`[ASSUMED acceptance target]` A cold test with eight first-time players uses no explanatory prose: at least six can distinguish a miss, overload-like load event and mistimed release from the recorded evidence, identify a relevant control/measurement to change, and retain control without discovering pause. They need not name stiffness or inertia. Add an intentionally unobserved event: correct comprehension includes recognizing that the cause is unresolved. This is a proposed test, **not a playtest result**.

## UI acceptance cases for 2D

Use fixture snapshots through belief contracts only: unsensed structure; bearing-only feature; resolved rotation with unobservable inertia; capture/miss branching; taut line with engine off; slack with unknown shape; load/thermal protection; failed release indication; delayed successful release; stale camera/load cell; worker unavailable; forecast horizon; saved procedure mismatch; loss. Exercise each in FLIGHT and CONSOLE while time advances.

A screenshot test alone cannot verify no-pause behavior. Drive view switches, plot scrubbing and preview requests during a headless or live 1× swing and assert continuing time/position/resource change and unchanged command sequence except explicitly requested inputs. Test control acknowledgement against executed-command timestamps and observed mechanism state. Check unrecorded data remain absent after reload and old forecasts remain byte-identical.

`[ESTABLISHED: DD01]` NASA crew-interface guidance supports timely command feedback, consistent controls and awareness of system state. Those principles motivate this proposal; NASA has not validated these game controls ([Crew Interfaces](https://www.nasa.gov/reference/10-0-crew-interfaces-vol-2/)).
