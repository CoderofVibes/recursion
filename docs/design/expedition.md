# Expedition proposal — 1F

**[ASSUMED] Proposal for owner review; no route or timing is demonstrated.** Follows [the creative brief](../CREATIVE_BRIEF.md) and [P5–P12](../DECISIONS.md); P5 awaits owner approval. Layout, costs, margins and pacing are assumptions. Physics profiles depend on 1B; equipment/ratings/configurations on 1C.

Twenty encounters form one authored expedition: question a forecast, follow competing glimmers, develop complementary operating practices, investigate an exit, then execute a passage home. Encounters are useful questions/operations, not compulsory rooms.

## Graph and travel

Author-facing IDs and names are not automatic discoveries on the player's chart.

```text
Arrival:      C01 ↔ C02 ↔ C03
Power:        C03 ↔ P01 ↔ P02 ↔ P03 ↔ P04 ↔ C04
Sensing:      C03 ↔ N01 ↔ N02 ↔ N03 ↔ C04
Outer route:  C03 ↔ C04
Homeward:     C04 ↔ C05 ↔ C06 ↔ H01 → H02
Spurs:        N02 ↔ N04; P02 ↔ R01; P03 ↔ R02; N02 ↔ R03; C04 ↔ R04
```

Arrows are authored physical transfer corridors; H01→H02 is the terminal commitment. C03–C04 closes both loops: take either branch, return by the broad outer connector, then take the other. Informed players can bypass investigations. All transfer costs need harness validation.

Player-planned transfers advance the same fixed-step simulation, including sensing, resources and hazards during time acceleration. All physical state carries across edges; no healing/refill/environment freeze. Preparation areas offer clearance and low load, not infinite reserves. Test returns/aborts from damaged states too; Recall remains available.

Glimmers: a periodic bright rim leads toward P02's pointing/cooling question; correlated sensor traces toward N02/N03; a repeated silhouette toward N04. Changing sightlines at C04/C05 can reveal C06. Leads require actual coverage/measurements; none is labeled “exit.” Retain earlier valid sightings. Petal's paired openings connect nearby survey pockets within N04, not a compulsory shortcut.

## Six reusable simulation systems

Shared ship state couples these six implementation budgets. The forecast starts with ordinary physics. Forecasting, Black Box and replay consume observations/commands without adding environment physics.

| System | Scope and dependency | Encounters reusing it |
|---|---|---|
| D — Motion and geometry | Planar flight, yaw, thrust, two-body attraction, moving asteroids, whole-ship clearance. [FICTIONAL] Inverse-2.5 attraction applies consistently to relevant bodies; normalized by 1B. | All, including background motion during experiments; Phase 2 core |
| E — Ship operation | Existing coupled electrical, thermal, propulsion, configuration and component-condition modules; sensors/recording draw from the same supply. No new equipment promised. | All; 2B baseline and 3A depth |
| S — Measurement | Tracking, pointing, coverage, processing/recording and observation-driven belief; existing-radio status at Earth, no new communications simulator. Gravity inferred from tracking, never accelerometer gravity readout (P7). | All; 2B/2C/3C |
| W — Wells | [FICTIONAL] Radial **propulsion** response reverses locally; tangential propulsion stays ordinary and boundary exit restores response. No reversal of coasting velocity/gravity. Long, narrow funnel display. | P03, R02, C05; first field implementation 3B |
| L — Lattice | [FICTIONAL] Layered strands with steep proximity exposure and clear centers; per-component cumulative electrical effects, plus reconstruction using existing sensors. No hit counter or random survival roll. | N03, R03, C05; first field implementation 3C |
| X — Aperture connections | [FICTIONAL] Authored paired openings: mapped sightlines and whole-ship transfer at a moving finite boundary. No general spacetime solver. | N04, C06, H01, H02; **new shared work required**, proposed lead 4D |

X maps pose/relative motion between paired local frames, preserving equipment/resources. Kinematics, partial crossing/collision and observable views need integrator/physics review. N04 uses a stationary wide pair; H01 a moving pair. X is the sole addition to planned world/ship systems.

## Encounter catalogue

Kinds: **FO** flight and operation; **OI** observation and interpretation; **CE** controlled experiment; **CO** combined. Rows are [ASSUMED]; fictional effects are labeled above. Costs: **light** content reuse; **medium** bespoke choreography/presentation; **heavy** first implementation of a listed system. D/E/S are shared foundations.

“Proceed” means present-state capability/procedure, never a visited flag or required saved macro. Equivalent demonstrations elsewhere count. Warnings explain uncertainty/reserves without prohibiting physically possible attempts. **U** gives optionality/expiry; investigations are bypassable with equivalent understanding, while traversed hazards remain.

### Arrival and the power/thermal branch

| ID / name / kind / branch | Question → success teaches; failure teaches | Retained model evidence → proceed | U; systems; cost |
|---|---|---|---|
| C01 Arrival Watch · CE · shared | Can tracking distinguish a coast from a small burn? Agreement establishes a baseline; disagreement exposes pointing or calibration error. | Time-tagged fixes, burn/attitude and configuration records → coast/burn comparison with an abort reserve. | Skippable after a usable baseline; D/E/S; light |
| C02 Gravity Range · CO · shared | Is the two-mass asteroid field wrong in mass, distance law or omitted second-body influence? Separate-range prediction supports a law; drifting fits expose ambiguity. | Multi-distance coast/powered ship/asteroid tracks → clearance/reserve-tested route. Optional player-enabled law family fits data; no numeric password. | Experiments expire when supported; transit still requires clearance; D/E/S; medium |
| C03 Glimmer Junction · OI · shared | Which observation deserves scarce pointing, processing and recording time? Separated bearings support leads; aliasing leaves rival explanations. | Bearing histories and coverage gaps → player selects a lead and budgets its transfer. | Survey skippable once charted; refresh stale bearings; D/E/S; light |
| P01 Load Step · CE · power | Which simultaneous loads compromise control? Staggering preserves authority; a safe overload/trip exposes coupling. | Commanded loads, bus/charge/temperature response → sequenced loads and deliberate protection recovery. | Skip when load response is supported for current equipment; D/E/S; light |
| P02 Radiator Turn · CE · power | Can cooling and useful pointing coexist? A controlled attitude/configuration comparison finds a sustainable sequence; heat trend exposes its limit. | Deployment, pointing, load and temperature history → cooling schedule retaining control and sensing. | Skip with applicable evidence; revisit after configuration/condition changes; D/E/S; medium |
| P03 Inverse Wells · FO · power | Why does a powered radial correction worsen approach? Matched radial/tangential/coast comparisons isolate response; boundary mistiming exposes control limits. | Burn/track residuals inside/outside → timed low-load burns with sideways momentum/control reserve; optional player-enabled local-response fit. | Experiments expire after held-out support; passage still needs timing; D/E/S/W; heavy |
| P04 Night Coast · CO · power | Does the load/cooling sequence survive a long transfer? Sustained margins support duration; late depletion or heat rise exposes a short test's limits. | Time histories across a scheduled low-generation segment → reserves for exit and abort. | Skip after a representative duration test; D/E/S; light |

P01 allows recovery without damage; P03 offers a broad observation skirt and bounded burns. P04's low generation must follow 1C-supported equipment and geometry; revise it if unavailable.

### Sensing/navigation branch

| ID / name / kind / branch | Question → success teaches; failure teaches | Retained model evidence → proceed | U; systems; cost |
|---|---|---|---|
| N01 Quiet Baseline · CE · sensing | Does more processing improve these observations? Controlled power/pointing tests establish quality; saturation/dropouts expose poor allocation. | Fix variance, coverage, power/recording history → affordable sensing schedule. | Skip once quality is characterized; D/E/S; light |
| N02 Second Bearing · OI · sensing | Is apparent object motion real or a viewpoint ambiguity? A chosen second baseline separates explanations; inconsistent tracks expose bias. | Separated bearings and tracking residuals → range/motion estimate tested on another view. | Skip once geometry is supported; D/E/S; light |
| N03 Chain Link Fence · FO · sensing | What does the unexplained processing channel reveal? Safe standoff tests reconstruct layered clear centers; degraded images or glancing exposure expose power/footprint mistakes. | Raw channel, allocation, reconstruction quality and component condition → whole-ship corridor with powered sensing. | Investigation expires when mode is understood; flying remains; D/E/S/L; heavy |
| N04 Petal Gallery · OI · sensing | Duplicate objects, repeated views or connected space? A powered, deliberately pointed multi-view survey distinguishes a shared landmark through paired openings; contradictory parallax rejects the wrong account. | Landmark tracks through edges and ordinary views → player-proposed connection fitted/tested on an unused viewpoint. | Optional spur; stop when spatial hypothesis is supported; D/E/S/X; medium, depends on X |

Neither branch requires the other's extension/procedure. Baseline power suffices for sensing; broad-clearance tracking for power [ASSUMED; verify with 1C/harness]. N03 initially resembles a debris passage; the unexplained channel's recorded behavior suggests safe power trials. Its mode uses **existing hardware**, available before damage/death, with power-dependent 3D reconstruction fading from intense strands to clear centers. Glances can accumulate survivable component damage; severe exposure can disable critical equipment. Evaluate the whole ship despite planar control. Enough layers to make blind traversal extraordinarily unlikely remains a harness target.

### Convergence and optional answers

| ID / name / kind / branch | Question → success teaches; failure teaches | Retained model evidence → proceed | U; systems; cost |
|---|---|---|---|
| C04 Crossing Ledger · CO · shared | Do the two operating practices fit the surviving ship? A player-planned transfer maintains tracking and thermal reserve; disagreement identifies the missing margin. | Forecast versus observed short transfer → combined load, sensing and burn procedure. | Reassessment useful on changed arrival; D/E/S; light |
| C05 Thin Transit · CO · shared | Can configuration changes bridge wells and lattice without losing observations or overheating? A staged passage transfers both lessons; mistiming identifies the failing stage. | Time-aligned boundary, clearance, load and heat observations → whole-ship route and abort sequence. | Local route includes transit; repeated investigation unnecessary; D/E/S/W/L; medium |
| C06 Homeward Reach · OI · shared | Can this moving opening be measured and survived? A tracked rehearsal supports a window; predicted shortfalls identify what remains unknown. | Rim motion, views through opening, current resource/footprint forecast → feasible commit and missed-window plan. | Optional reconnaissance for informed players; refresh phase before commitment; D/E/S/X; medium |
| R01 Heat Soak · CE · power | Was the cooling test too short? A bounded sustained-load run supports duration; an early abort reveals a rising trend. | Longer thermal/load history → revised cooling duty cycle. | Optional from P02; expires when duration is resolved; D/E/S; light |
| R02 Boundary Drill · CE · power | Which side of the well boundary contains each burn? Reversible short tests support timing; prediction error reveals uncertain boundary/control authority. | Boundary-bracketing track/burn records → state-conditioned timing. | Optional from P03; expires with adequate boundary evidence; D/E/S/W; light |
| R03 Dark Channel · CE · sensing | Is weak lattice detail absent structure or poor sensing? Low-exposure paired allocations separate them; dropout reveals unsupported clearance. | Channel quality versus allocation/pointing → minimum useful processing schedule. | Optional from N02; expires when sensing uncertainty is resolved; D/E/S/L; light |
| R04 Loaded Turn · CE · shared | Does this configuration still turn and fit? Bounded yaw/deployment trials support control and footprint; overshoot rejects the timing. | Configuration, yaw, thrust and clearance observations → maneuver with measured authority. | Optional from C04; expires for tested configuration/condition; D/E/S; light |

C06 exposes measured shortfalls: cooling duration → R01/P04; boundary timing → R02; coverage → R03/N01; footprint/turn authority → R04; spatial ambiguity → N04. These are suggestions; local experiments count. C05 sequences existing fields without a new interaction law.

### Homeward commitment and arrival

| ID / name / kind / branch | Question → success teaches; failure teaches | Retained model evidence → proceed | U; systems; cost |
|---|---|---|---|
| H01 Homeward Opening · CO · home | Can the ship match a finite moving opening while keeping measurements, control and cooling? Passage validates the combined procedure; a missed/aborted approach exposes timing, clearance or reserve error. | Issued forecast, rim tracks, commands and actual margins → whole ship clears before closure. | Required for this home route; no knowledge token; D/E/S/X; heavy, owns shared X |
| H02 Earth Arrival · FO · home | Can the surviving ship establish a controlled Earth approach and contact? Measured navigation/contact confirms return; a poor approach exposes remaining control/resource limits. | Earth tracking and surviving-state forecast → viable approach/contact with 1C-supported existing equipment. | Terminal payoff; no added upgrade grind; D/E/S/X; light |

## Pacing and repeated passage

[ASSUMED] A first exploratory sortie targets **45–70 active minutes to first contact**, including experiments but excluding pauses. A representative route is C01–C02–C03–P01–P02–P03–P04–C04–C03–N01–N02–N03–C04–C05–C06: **13 distinct meaningful encounters including contact**; N04 and one unresolved-question spur make 14–15. Swap the branch loops for the other valid order. Connector fly-throughs and repeated waypoints do not inflate the count. Early contact and a zero-loss completion remain valid.

[ASSUMED] Expert: **15–25 active minutes to contact**, then **5–10 for assessment/passage** via C01–C02–C03–C04–C05–C06–H01, using retained evidence. Experiments disappear; physical transits remain. Validate both branch orders and full-route resources, not just individual nodes.

P8: loss/Recall resets **all physical state** to arrival, including configuration defaults. Acquired telemetry/measurements, commands, configurations, issued forecasts, adopted extensions, procedures and charted leads persist through the last record before loss. Rebuild belief from records, never unmeasured truth. Recall unlocks nothing. Recording limits affect acquisition, not retention.

P9: C01/C02 become familiar transit/baseline checks; C03/branch surveys optional refreshes; power/well and sensing/lattice passages practiced sequences; C04/C05 surviving-state checks. Skip answered N04/R01–R04; C06/H01 refresh opening phase/margins. H02 ends the run. Successful trials teach equally.

Procedures retain tested pose/velocity/yaw, configuration/condition, charge/heat/propellant, coverage, model version and environment phase. Matching conditions permit exact replay; mismatches require player adaptation/new forecast, never automatic planning/retiming. Original forecasts stay frozen. Deterministic phase advances from arrival; branch order can invalidate timing without changing rules.

## The opening and Earth

[FICTIONAL] X's finite opening moves and closes. [ASSUMED] Windows repeat on an observable deterministic cycle, independent of discovery; missing one needs no death/Recall. Waiting consumes resources. C06 offers standoff/retreat; beyond the measured commitment point, failure may be unrecoverable.

The player chooses configuration, cooling/processing, approach velocity and burns. Forecast the moving **whole-ship swept footprint**, timing uncertainty and exit/abort reserves. P5 fits numbers; new rules need player adoption and independent held-out evidence. P6 never plans the maneuver. Unseen geometry stays unknown. C05 combines field lessons; H01 demands sustained thermal control and navigation.

Carry damage/depleted stores through. [ASSUMED] The far side offers a forgiving Earth approach/contact, without a landing system or guaranteed rescue of a failing ship. Render/record earlier Earth observations whenever physically available. Define the boundary to ordinary Earth dynamics during X/1B integration; no unmarked gravity change.

## Owner decisions and build priority

1. Approve the two branch loops, outer bypass and assumptions about encounter/run length; shorten reuse encounters first if pacing drags.
2. Approve **X as one shared fictional system** for Petal Gallery and homeward passage, including repeated windows. If declined, revise both together before implementation.
3. Resolve P5: player-enabled rules with fitted numbers is the basis here; automatic rule discovery would change the investigations.
4. Choose the Earth payoff: controlled approach/contact as proposed, or a different scope. Earlier valid observations remain permitted.

Preserve C02, P03, N03, N04 and the homeward sequence. Author reuse after D/E/S/W/L work; prototype X before polishing N04. Integrator assigns paths/contracts (see [handoff](../handoffs/1F.md)); no content row authorizes another subsystem.
