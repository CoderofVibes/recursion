# S6 — Observation, play and implementation

[ASSUMED] This is a proposal for integration, not a new decision or a playability result. It accompanies the S6 mechanics and Python reference. The governing direction is [the creative brief](../../CREATIVE_BRIEF.md), [DECISIONS A3–A6, A9–A13 and P2–P13](../../DECISIONS.md), and [the region proposal](../../handoffs/region-proposal/regions.md). A9–A13 supersede the earlier planar expedition, branch-return loops, encounter checkpoints and pause assumptions. All values below are candidate content values unless explicitly attributed to existing ship data.

## Recommended experience

[FICTIONAL] Use the same paired-opening rule at every scale: finite circular disks with moving poses, a proper rigid mapping between the two local frames, mapped light and material crossing, and no gravitational field transmitted through the aperture. Neither discovery nor approach switches that rule on. [ASSUMED] Keep the disks physically open; translation, turning and line-of-sight occlusion create recurring usable windows. This changes the older expedition's literal “moves and closes” proposal and needs the owner's decision. An alignment window ends because the ship can no longer fit and keep pace, not because an invisible deadline bisects it.

[ASSUMED] Start with these deliberately separated scales:

| Quantity | Candidate | Purpose and limit |
| --- | ---: | --- |
| Petal clear radius | 0.75 m | Too small for this ship; near observations and small natural fragments remain possible. |
| Passage clear radius | 6 m | A 12 m diameter visibly changes the meaning of the earlier petals. This is a tuning candidate; the 12 m **radius** numerical fixture is deliberately spacious. |
| Repeating motion period | 240 s | Several usable opportunities during reconnaissance, without a universal countdown. |
| Relative normal crossing speed | 1 m/s | A 16 m axial ship takes about 16 s from first nose entry to final tail clearance at constant aligned relative speed. |
| Nominal stowed axial extent | −8 to +8 m | Existing `data/ship-baseline.json` footprint; do not replace the current 3D hull or its actual CoM with this simple duration estimate. |
| Radiator deployment duration | 20 s | Existing assumed ship baseline. A late fold is comparable to the entire example crossing duration. |

[ASSUMED] The 16 s estimate is only length divided by relative normal speed. A rotating plane, changing attitude, acceleration or a trailing appendage changes both first entry and last exit. The predicted minimum clearance must cover that entire interval and both sides. A successful crossing is the last occupied point clearing, never the CoM reaching the plane. A centered 16×5×5 m box fits through the spacious 12 m radius fixture at every fixed attitude because its circumradius is only 8.746 m; do not call that an alignment challenge. The 6 m candidate leaves 2.464 m straight-crossing margin. For fixed yaw and travel normal to a static disk, its complete swept silhouette reaches that radius near 23.2° yaw. The moving-hull test, not the optical reveal, must establish a real flight window.

### Far Aperture → Petal Gallery

[ASSUMED] Far Aperture first presents a flicker behind two ordinary overlapping silhouettes. A lateral-and-vertical observation baseline resolves that a small visible patch is an opening at a different depth. Do not make a customary “move left” command solve every seed. The optional Gallery then places several tiny pairs at different depths and orientations. A remote asymmetric boulder appears upright through one, sideways through another and partly hidden in a third. Sunlit surface features, occlusion and motion provide the correspondence; the hologram initially keeps separate uncertain tracks.

[ASSUMED] The useful experiment is a player-chosen baseline followed by an unused-viewpoint prediction: does one connected scene explain the observed parallax and sequence of occlusions better than reflected or independent objects? Retain the losing explanations and residuals. An unused viewpoint in the same attempt is a diagnostic; it does not satisfy A4's distinct held-out-attempt adoption requirement.

[ASSUMED] Include a small natural fragment whose entry and emergence can both be tracked from a clear vantage. The petals are observation-only **for the ship**, not a new law forbidding all matter. Optical correspondence alone supports a view mapping; it does not establish how velocity, spin, thrust or gravity behave during material transit. A fragment's distinct surface feature supplies attitude evidence as well as position. Missing its far-side emergence leaves material transport uncertain. This permits useful successful experiments without sacrificing the ship or adding a probe-launch system.

[ASSUMED] After the question is answered, the Gallery has no mandatory revisit or visited flag. A later run may use it for a specific remote observation, or continue from Far Aperture to the Cathedral. Shared laws carry; this run's rim pose, phase and landmark tracks do not become known merely because an archive contains an older run.

### Turning Rim → Passage

[ASSUMED] From standoff, the Passage first appears as a narrow sliver. Its changing orientation reveals a differently oriented sky, then a patch of far-side sunlight traverses the room. The actual view can reveal Earth immediately if the geometry permits. The emotional payoff comes from bringing the surviving ship through and remaining home, not from concealing a valid sighting.

[ASSUMED] Reconnaissance should expose four separate operational questions: where the boundary will be, how the complete current hull fits, what the crossing does to exit motion, and whether the ship can operate afterward. The player chooses when to track rim features, when to fold, which loads to shed, an approach and a missed-window plan. The model evaluates those commands. It does not nominate a burn schedule, automatically retime a saved procedure or turn an uncertainty warning into a locked gate.

[ASSUMED] Keep a broad standoff region outside the rim's swept volume, with a physically useful retreat corridor. Waiting there is allowed. One missed 240 s cycle at an illustrative **net electrical deficit** of 2 kW costs 480 kJ = 0.133 kWh; an illustrative 5 kW net thermal imbalance stores 1.2 MJ. Neither number is a mandatory drain or an assumed current ship condition: use actual generation, loads and heat rejection. Life-support consumables do not create a countdown (P14). Stationkeeping burns, if required by the local field, cost their real propellant.

[ASSUMED] Commitment is a property of present state and authority. For example, at 1 m/s closing speed and an available 0.02 m/s² opposing acceleration, the ideal straight-line stopping distance is 25 m and stopping time is 50 s, before accounting for gravity, rim motion or attitude. This is an illustrative calculation, not a baseline RCS rating or a fixed commit radius. A damaged ship can lose its retreat option earlier. Reversing while partly through remains physically possible when clearance and authority permit; “nose through” does not trigger a scripted lock.

[ASSUMED] During the crossing, the forward window can already show the far sky while an aft radiator still occupies the old side. The flight hologram shows two measured/forecast clipped portions joined by a clear correspondence convention; it must not draw the ship as a long straight object bridging the astronomical separation. The control room, systems, commands and ship identity remain one continuous state. No cinematic completion fires until the full occupied envelope has cleared.

### Familiar Sky, loss and Recall

[ASSUMED] Carry every surviving physical quantity through: fuel, charge, heat, condition, current deployment, active controls, recorder state and ship clock. Establish an observable, forgiving Earth approach using existing tracking and radio capability. Show the exit-state forecast during reconnaissance if its measurements support it. A foreseen reserve error may still be fatal; do not append an unannounced compulsory landing system. The far-side gravity law must be an explicit part of the chosen domain and forecast assumptions, not a renderer-dependent switch.

[ESTABLISHED: DECISIONS A9, A13, P8] Loss at the rim, while straddled or after emergence restarts the **whole expedition**, not Turning Rim. Recall, while available under P8, is also a whole-run voluntary restart. It is not a rescue teleport, passage retry, evidence unlock or undo. Black Box retains only the observations, telemetry, commands, sensed events and immutable forecasts actually recorded through the loss; truth-only collision witnesses do not enter the archive. A new run uses its own seed and geometry (A10). A save restored inside one run must resume the same seam state and cycle phase exactly.

## What is measurable

[ASSUMED] Measurements are generated by the same visible ray paths as the window, then constrained by the camera's field of view, exposure, pointing, power, condition, noise and recording. Seeing a view does not disclose its object's authoritative identity, distance, GM, exit coordinate or pair ID. Human recognition and recorded model evidence remain different things.

| Observation | Supported inference | What it does not establish |
| --- | --- | --- |
| Rim silhouette in one image | Angular outline and a family of plane/scale poses | Unique range, physical radius, normal sign or full rotation |
| Persistent asymmetric rim features over time | Feature bearings, pose changes and spin when geometry supports them | Spin about the normal from a perfectly uniform circle |
| Baselines with known ship displacement, plus a constrained scale | Metric pose, velocity and uncertainty | An exact remote inertial frame from one image |
| Same asymmetric landmark through multiple windows | Candidate correspondences and a composed view transform | Material transport law or a unique physical pair assignment |
| Tracked fragment before entry and after emergence | Tests of position, relative velocity and visible attitude transfer | Unobserved thrust response, full extended-hull safety or arbitrary high-spin crossings |
| Brightness and surface illumination | Incoming light direction and irradiance estimates under calibration | Gravity; A3's sun remains light-only |
| Through-window tracked remote motion | Remote dynamics expressed through a fitted optical mapping | A direct accelerometer measurement of distant gravity |

[ASSUMED] Three non-collinear **metric** rim points determine a rigid plane pose up to the resolved correspondence/convention, but three monocular bearings are not three metric points. Fit the observations jointly, retaining camera/ship-pose uncertainty and shared feature-scale error. Use more than three distributed points for residual checks. Fit motion over a time span; do not estimate angular acceleration by differencing three noisy frames. A smooth periodic motion family may fit phase, period, amplitudes and axis; a short arc can support only local pose and twist. Mark the long-horizon cycle forecast unsupported until its period and phase are distinguishable.

[ASSUMED] Resolve circular symmetry with visible, persistent irregular features on the rim. Their track IDs are observation associations, not hidden content IDs. Lost or ambiguous correspondences produce alternatives or wider covariance. For a distant opening, angular measurements alone can leave radius and distance jointly uncertain; an author-specified radius is never inserted into belief as a measurement. An optical apparent-size range through the pair belongs to the mapped optical path/model and must not be interpreted as ordinary straight-line distance in the near domain.

[ASSUMED] Existing optical hardware can measure these rays. Existing radio may use the same electromagnetic path only if its propagation and acquisition have actually been implemented; do not grant a new radar/lidar, a gravity scanner or a special far-side data channel. A lattice reconstruction requires the existing sensor's defined response; optical visibility of an empty gap is not proof of absent invisible hazards on the far side.

## Rule adoption and forecasts

[ASSUMED] Keep the user decisions separate from automatic fitting:

| Player-proposed model structure | Automatically fitted numbers, with support |
| --- | --- |
| These views are connected by an orientation-preserving paired map | Per-pair correspondences, pose/relative transform and scale uncertainty |
| The pair transports material with the proposed relative-motion and spin mapping | Current mouth translation/rotation, phase and their covariance; tracked-fragment states |
| The chosen environment acts locally on the part of the ship present on each side | Local force/gravity parameters supported by tracking; ship actuator calibration and health |
| A periodic family describes this opening's motion | Its period, phase, axis and amplitudes; no automatic adoption of periodicity from an attractive curve fit |

[ASSUMED] These may be exposed as one shared `paired-openings` extension with separately reported evidence/support domains, rather than four required UI toggles. A passing optical test must not award tight uncertainty to untested material transport. Far gravity exclusion is an explicit fictional model assumption and receives no confidence merely because a camera saw Earth. A missing measurable effect yields an upper bound at the available sensitivity, not proof of exactly zero force.

[ASSUMED] Use distinct recorded attempts for A4 training and held-out scoring. Successful completed encounters count as attempts; death is unnecessary. A future adoption flow can train on completed Petal observations and test against an independent completed reconnaissance record. If the current attempt lifecycle cannot close such an observation record without leaving or recalling, request an explicit observation-attempt lifecycle from the integrator. Do not silently relabel two chunks of one attempt as independent attempts. For a new pair, its nuisance pose/phase must be calibrated from declared data disjoint from the scored held-out samples; freeze that fit before scoring. Otherwise the test has learned its answer from its own exam.

[ASSUMED] Before adoption, the forecast may terminate at the observed boundary with “transfer rule untested.” Candidate previews remain visibly conditional and do not acquire the adopted rule's earned hedge. If the player never validates material transfer, a manual crossing remains legal and uncertain. After adoption, propagate the player's commands with the believed pair motion, full attitude and current hull, local forces on both sides, and the same explicit seam law. Keep body-frame thrust and angular-velocity conventions from `src/contracts/README.md`.

[ASSUMED] A crossing forecast requires more than the current `ForecastSample.positionCov`. Preserve joint uncertainty in position, velocity, attitude, both mouth poses and motion, phase, map association and crossing time. For smooth branches use derivatives or deterministic sigma-point propagation through the boundary event. Include crossing-time sensitivity; mapping a covariance at one arbitrary tick misses the moving-boundary error. When samples disagree on whether/where crossing occurs, retain distinct branches or end the forecast at an ambiguous-boundary horizon. One Gaussian smeared between two far-apart domains is meaningless.

[ASSUMED] Record forecast segments with domain/frame IDs and a transfer event joining them. The same ship's unfolded CoM is a coordinate convenience during straddling; its two occupied fragments do not have an ordinary single Euclidean CoM in either space. Show predicted minimum rim clearance for each appendage and the time interval from first entry to last clearance, with a confidence margin and the responsible uncertain inputs. If exit motion or hazards are unobserved, end the outgoing segment at that uncertainty horizon. Do not manufacture an empty exit or a straight line to Earth.

[ASSUMED] Freeze the issued pair estimate, parameter covariance, association choices, support and command plan in `ForecastInputs`. Later fixes create a new forecast; earlier dotted paths remain exactly as issued (P10). Keep measurements at their acquisition times and retain the original run geometry for archive comparisons. The model forecasts consequences only (P6).

## P11 and the four views

[ASSUMED] A window is an optical observation surface, while MAP/SHIP/FLIGHT holograms are belief displays. Preserve that separation in the data path. The game layer may use truth to produce an optical image/radiance product for the current viewpoint, including clipping, local occlusion, the aperture and far-side occlusion. The display receives image data or a similarly constrained optical product, **not** a far-scene truth object graph, hidden target IDs, depth buffer or omniscient picking API. This requires an explicit view contract; it is not an exception allowing `src/view3d/` to import truth. Sensing can share the game-owned ray calculation but emits its own noisy, recorded measurements.

[ASSUMED] FLIGHT presents the current rim tracks, fit age, relative normal/lateral motion, whole-hull clearance and split forecast as compact instruments. SHIP exposes the actual known deployment and jammed components that determine fit, cooling and authority. CONSOLE provides observations, fit ambiguities, forecast comparison and rule tests. MAP adds only charted endpoints/relationships; an unlocated remote scene remains an unresolved lead. Styling, fonts, geometry conventions and motion tokens belong to 2D's theme lane.

[ASSUMED] A3 light may enter through a pair and illuminate a wall or array even if the model has not identified the sun. It does not add another gravitational source. A passive window must still show physically available light if a tracking camera is unpowered, while the model receives no new recorded fixes from that camera. Arrival on the far side does not retroactively populate previously unknown map objects.

## Why the familiar run still demands skill

[ASSUMED] A10 varies authored initial phase, mouth orientation, arrival offset/velocity and occlusion within verified ranges. Keep the pair rule, radii, motion family and world laws fixed across runs; do not secretly change the frequency to defeat a saved schedule. The cycle advances on simulation time, including time spent in the room, and never restarts when the player looks at it. Normal encounter time cannot be paused (A12); warp changes ticks executed, not the dynamics step or collision tolerance.

[ASSUMED] The repeat-run test should compare an informed player with refreshed tracking against the same archived procedure replayed without current observations. The latter should lose meaningful margin because phase, approach and surviving ship differ. The informed player should recover margin through measured corrections, not through an invisible success bonus. Add deterministic challenge cases for one jammed radiator, stale phase, reduced RCS authority, hot arrival and low remaining fuel separately, then test feasible combinations. Do not use a random impact/death roll.

[ASSUMED] At an example lateral rim speed of 0.5 m/s, a 2 s timing error moves the target 1 m; over a 16 s partial crossing, a constant 0.05 m/s uncorrected lateral relative velocity adds 0.8 m offset. These simple sensitivities explain why fresh observations and hands-on corrections remain valuable. They do not prove a chosen encounter is difficult, and smaller effects below sensing or clearance tolerances should be omitted from the play burden rather than exaggerated.

## Build scope and interfaces requested

[ASSUMED] This is substantial shared X work after 2G, led by the future aperture implementation section with 2C and 2D owning their lanes. The existing `EnvironmentField.acceleration/modifyThrust/intensity/signal` hooks do not represent topology, two simultaneous domains, moving-rim contact or split observation paths. Do not hide the feature inside a CoM-only field callback.

| Owner/path touched (request only) | Concrete change | Rough new/changed production lines |
| --- | --- | ---: |
| Integrator / `src/contracts/` | Mouth/pair IDs; domain/frame tags; measured feature observations; believed pose/motion/covariance; split forecasts and support; optical image product; versioned seam save data | 200–350 |
| X / `src/sim/` and `src/sim/fields/` as assigned | Mouth motion evaluator, crossing state, full-prism clipping/sweep, distributed forces and transport bookkeeping, deterministic collision/event ordering | 800–1,400 |
| Game / `src/game/` | Own both domains during partial crossing; optical ray/visibility bridge; measurement routing; seam event conversion; continuous ship time and resource handoff | 350–650 |
| Ship / `src/ship/` | Local environment per occupied component/force application point, split illumination, measured contact response, current deployment envelope | 200–400 |
| 2C / `src/model/` | Rim feature fit, identifiability diagnostics, pair association, extension lifecycle/support, belief-side crossing dynamics and uncertainty branches | 700–1,200 |
| Black Box / `src/blackbox/`, recurrence/save owner | Store immutable optical/motion evidence, domain-tagged forecasts, seam/phase restoration and whole-run loss semantics | 150–300 |
| 2D / `src/view3d/`, `src/console/`, `src/theme/` | Window optical presentation, clipped ship view, fit/clearance instruments, uncertain endpoints and rule-test evidence | 600–1,100 |
| Content / `src/content/` | Petals, fragment witnesses, moving pair, standoff/exit geometry, A10 seed ranges and validation metadata | 150–300 plus data |

[ASSUMED] Total estimate: **3,150–5,700 production lines**, plus roughly **1,200–2,000 lines of independent tests/harnesses** and scene assets. These are scope estimates, not measured velocity or a deadline. A prototype might share pure, truth-free frame algebra in `src/lib/` after integrator approval, but model fitting and forecasts must never import the truth simulator. Retain independent vector comparisons so shared helper mistakes do not validate themselves.

[ASSUMED] New truth data needs both mouths' smooth motion and derivatives, equal aperture dimensions, rim geometry, linked domains, local gravity/illumination, deterministic phase/seed and allowed overlap restrictions. Belief data needs measured counterparts, covariance and provenance, without truth schedules or automatically resolved pair IDs. Ship mass distribution must accompany collision geometry; a union of empty conservative hull prisms is not a mass-density model. Exact type names remain the integrator's decision.

## Acceptance required before content approval

[ASSUMED] The reference vectors establish bounded mathematics only. The production implementation must independently prove these cases before a route is called playable:

1. **Seam mechanics:** reproduce stationary and moving-pair vectors; invert map position/velocity/attitude/spin; continue a partly crossed ship through thrust and changing mouth motion; verify all-near/all-far limits and transport work accounting. A coordinate rebase alone cannot create a sensed collision or an extra engine impulse.
2. **Full hull and contact:** detect a trailing appendage clipping after the CoM crossed; detect a rotating rim sweeping into a coasting ship between ticks; include deployment in the swept hull; verify near misses and grazing ties under time-step refinement. Use independently specified expected contact times, parts and points.
3. **Observation honesty:** an occluded far object yields no fix; low power loses camera evidence while the passive window remains optically correct; an anonymous repeated image does not get a truth identity; spin of an untextured circular rim stays unobservable; single-view scale/pose ambiguity persists. Changing unseen truth must not change an already issued forecast.
4. **Rule tests:** a mirror or stationary-pair hypothesis fails discriminating held-out observations; the correct fitted rule passes a distinct attempt; an optical-only test does not validate force/velocity transfer; held-out scoring cannot fit its own pair phase from its scored samples.
5. **Forecast honesty:** incoming and outgoing segments use their own frame; phase/velocity uncertainty changes exit covariance and clearance; unresolved crossing branches end or split; recorded forecasts remain byte-identical after new evidence, adoption or recall.
6. **Determinism and recurrence:** same seed/commands replay exactly, including a save during straddling and a contact tied with a seam event; bulk warp and normal stepping agree; loss and Recall at each crossing stage restart the full expedition while retaining the same evidence archive and no repaired state leaks through arrival.
7. **Play:** complete a zero-loss route, miss and wait for another window, abort before commitment, and cross with realistic carried wear/reserves. An expert with fresh measurements should gain clear margin; archived knowledge without new measurements must not pass comfortably across the supported seed range. No numerical reference substitutes for these playtests.

## Owner decisions, one at a time

[ASSUMED] Present these through the integrator in this order; S6 approves none of them.

1. **Use X as one shared paired-opening system?** Recommend yes, from tiny Petal views to whole-ship Passage, with the explicit mechanics and scope in this study.
2. **What ends a crossing window?** Recommend geometric loss of alignment at a persistently open disk. Literal shrinking/closure adds a separate matter-cutting/contact rule and should not be implied by presentation alone.
3. **Can gravity act through the empty opening?** Recommend no transmitted field; local material feels the environment on the side it occupies. This is an additional fictional choice, not a consequence of A3's light-only sun.
4. **What evidence earns confident material-transfer forecasting?** Recommend observed fragment crossings and separately reported optical/material support, with A4's distinct held-out attempts preserved. Adoptable record boundaries may require an integrator-approved observation-attempt lifecycle.
5. **What is the terminal Earth scope?** Recommend a forgiving, observable approach/contact with the surviving ship, no compulsory landing system, and every earlier physically valid Earth sighting allowed.
6. **Which gravity law applies beyond the home pair?** Recommend an explicit Newtonian Earth domain, with local action on each occupied ship portion while straddling; far-side forecasts must disclose that assumption until supported by tracking.
7. **Can a rim impact be survived?** Recommend the conservative first version in [mechanics.md](mechanics.md): confirmed load-bearing contact is structural loss, including impact and zero-speed squeezing; unloaded tangency is harmless. Recoverable glances require a separate damage and contact implementation; do not imply that physics is already built.

[ASSUMED] The best version preserves material partial crossing, moving/rotating mouths, measured exit conditions, clipped lighting and a final stretch where the nose is home but the tail is still exposed. A smaller first implementation can use stationary Petal pairs plus a translating, nonrotating ship-sized pair and modest optical scenes; it loses the rotating-frame learning and Turning Rim's most distinctive reveal. A CoM teleport loses the full-ship engineering question and should not be presented as completing S6. If scope must shrink further, keep Petal observation as a first milestone and explicitly defer the Passage rather than conceal the missing mechanics.
