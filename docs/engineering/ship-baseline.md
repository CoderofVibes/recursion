# Ship engineering baseline — 1C proposal

**Status: [ASSUMED] proposed hardware, ratings and operating policies for owner approval.** This is an internally checked design model for the game, not a flight-qualified spacecraft, approved expedition balance, or demonstrated playable route. It implements the engineering intent of the [creative brief](../CREATIVE_BRIEF.md) and proposed decisions P1, P7 and P12 without changing either document. Implementation priorities are in [gameplay-couplings.md](gameplay-couplings.md); numerical configuration is in [ship-baseline.json](../../data/ship-baseline.json).

## Reading the labels and numbers

- **[ESTABLISHED: ID]** means the cited source supports that particular fact or mechanism. IDs resolve through [the project bibliography](../../References/BIBLIOGRAPHY.md). They do not certify this ship's invented equipment ratings.
- **[ASSUMED]** covers all chosen ratings, initial conditions, geometry, model simplifications and calculated consequences of those choices. All inventory/table entries inherit this label unless explicitly overridden.
- **[FICTIONAL]** covers the lattice's selective damage, its reconstruction from existing hardware, and Black Box evidence persistence across recurrence.
- **[DEMONSTRATED: `python docs/engineering/validate_baseline.py`]** applies only to the checks that command actually runs: numeric provenance, references, inventory sums, selected resource/energy invariants and exact agreement with the generated appendix. It is not simulation or flight evidence.

The JSON is the numerical authority. A numeric leaf or array inherits the nearest ancestor's `label` and `source`; the root default is `ASSUMED`. `mechanismSources` never promotes a chosen rating to an established fact. `referenceAnchors` deliberately separates source numbers from adopted values. Metadata counts and schema versions follow the same rule. The appendix renders every numeric parameter outside equipment/scenario records, and tables render equipment numbers and calculated scenarios. SI is used throughout, with byte/s and byte explicitly distinguished from bit/s and energy in joules, not watts. Temperatures refer to assemblies/cold plates unless specified otherwise.

## Concept, layout and configuration

**[ASSUMED]** Propose a compact return vehicle for **4 crew**, with **24,000 kg dry operational mass**, **6,320 kg propulsion inventory**, and **54 kg fuel-cell reactants**: **30,374 kg at arrival**. Dry operational mass includes people, fixed stores, pressure structure, shielding, plumbing and dry tank hardware. It is not the stripped manufacturer's dry mass. The large `habitat-structure` residual is an explicit unallocated structural/habitation allowance, not a claim that each bolt has been designed. No inventory is counted twice.

**[ASSUMED]** The body origin is fixed to the structure; **x points forward, y left**. Yaw is counterclockwise. The main engine and optional ion unit are aft; cabin, camera and command station are forward. Heavy main propellant is aft of the origin, paired RCS supplies and electronics straddle the centerline. Radiators extend sideways aft, solar wings sideways forward. Equipment positions, their intrinsic yaw inertia and all envelope vertices are in the appendix. The origin, center of mass, thrust axis and velocity vector are separate quantities.

**[ASSUMED]** Arrival has radiators deployed, solar wings stowed, healthy hardware, normal recording and tracking, and unknown illumination conservatively allocated as zero power. Fuel cells ramp from zero while batteries bridge. Passive thermal louvers and regulated coolant flow hold the initial thermal targets. This supports safe preparation when the game is paused; advancing mission time still consumes real supplies. Stowing for a narrow passage is a temporary thermal commitment, not a new equilibrium or a free cooling reset.

**[ASSUMED]** The four named polygons are conservative envelopes: stowed, radiators deployed, solar deployed and all deployed. They include empty space between appendages to keep clearance conservative. Emitting surface area is a separate quantity, never inferred from polygon area. Asymmetric configurations and intermediate extension use the hull plus each appendage's current polygon, then a convex hull; sweep that geometry continuously during movement. A jam retains the actual extension. Out-of-plane radiator pointing uses the conservative in-plane envelope. Point-mass tank centroids and smoothly extended appendages omit fluid slosh and detailed hinge dynamics. [ESTABLISHED: S21, S24] Structures/mechanisms and mass distribution require separate geometric and inertial descriptions.

## Electrical architecture and energy accounting

**[ASSUMED]** Adopt solar wings with battery storage and two primary hydrogen/oxygen fuel cells as finite backup. The wings have a combined **24,000 W rating**, but actual generation is environment- and pointing-dependent. The two stacks provide at most **12,000 W net** independently of light, consuming dedicated reactants. The two battery packs hold **72,000,000 J** nominal combined, initially **57,600,000 J**; output and charging limits apply per pack as well as per bus. No solar availability is inferred from the unfamiliar gravity law.

| Option | Mechanism and reason | Proposal |
|---|---|---|
| Solar plus batteries | [ESTABLISHED: S01] Illumination, incidence, shadow and array condition determine output; batteries are finite storage. | [ASSUMED] Primary return-cruise architecture. Unknown light is a measured open question, not a guaranteed recharge zone. |
| Primary fuel cells | [ESTABLISHED: S01] Stored reactants produce electrical energy and water. | [ASSUMED] Adopt backup stacks and finite dedicated reactants. Retain product water, including its mass and condensation heat in the effective energy model. |
| Regenerative fuel cells | [ESTABLISHED: S01] Regeneration needs powered electrolysis. | [ASSUMED] Omitted; there is no free conversion of water back into fuel. |
| Radioisotope or fission system | [ESTABLISHED: S01] Nuclear sources are an alternative power class; the assigned references do not size this vehicle's reactor. | [ASSUMED] Not installed. A reactor proposal would need independent ratings, shielding and conversion/rejection heat budgets before adoption. |

**[ESTABLISHED: S17]** Separately switched and protected distribution channels can isolate local faults; the source illustrates high- and low-voltage buses. **[ASSUMED]** Here, independent main A/B buses feed a dual-input essential converter and a payload bus. Essential loads normally draw from A; payload draws from B. A normally open cross-tie transfers power only after deliberate closure and fault isolation. Both PDUs can feed the essential bus, but this does not double converter capacity. Fuel-cell and battery capacity on A cannot power B's isolated ion load without a healthy tie.

**[ASSUMED]** Dispatch solar, then local fuel cells, then batteries; curtail unneeded solar. Charge only from actual surplus. Include converter loss, PDU housekeeping, battery conversion loss and fault current exactly once. The appendix compares ion operation with the tie open and closed to expose otherwise stranded generation. The baseline does not promise uninterrupted high-power payload operation after a bus loss.

**[ASSUMED]** Shed optional ion propulsion first, then science processing, transmitting, camera quality and high-rate recording. Preserve the active air-support chain, its cooling, flight control and minimum recorder mode. The last healthy air train cannot be disabled by ordinary player commands or load shedding; selecting a working spare can replace it. This restriction is a dispatch rule, not immunity: supply failure or depleted resources produce explicit unmet demand and hazards. The initially listed essential equipment IDs refer to functions whose selected spare inherits the same priority.

**[ASSUMED]** Load RPC, source contactor and converter-feeder current ratings are calculated differently, as specified in JSON. Fault current is limited and then isolated on a latched trip. Reset is deliberate after the fault clears. Dose, burned switches, depleted energy and permanent damage persist. **[ESTABLISHED: S06]** Failure analysis must include common dependencies: duplicated pumps on a leaking loop or duplicated processors on a failed feeder are not independent survival paths.

**[ASSUMED]** Fuel-cell chemical input uses an effective **142,000,000 J/kg hydrogen HHV** and **0.5 net efficiency on that same basis**, with liquid product retained. This is a chosen thermochemical approximation, not a sourced flight-stack efficiency. Electrical output plus onboard waste heat equals chemical depletion; auxiliaries are already included in net output. Consumption transfers mass from reactant tanks to the product tank rather than ejecting it. Full product storage stops production. Battery energy equations in JSON separately account for storage change and heat; charging is never treated as immediate dissipation of all input power.

## Thermal design and operating limits

**[ESTABLISHED: S02, S09]** Pumps transport heat through internal water and external coolant circuits, exchangers isolate fluids, and radiators reject heat to their environment. **[ASSUMED]** Use cabin, service, external-loop and local exchanger-water thermal states. Their capacities are effective model values, not an extra inventory mass. The pumps are paired spares sharing pipes and fluids. Isolating a leaking radiator can save the other branch; a common loop loss defeats both pumps.

**[ASSUMED]** Every electrical mode specifies onboard heat. Crew metabolism continues without electricity. The chemical engines' small deposited heat is in addition to valve/controller input; most chemical energy leaves with exhaust. Fuel-cell waste heat enters the service node. Radio output leaves the ship. Ion-drive bus power splits between beam power, the conservatively allocated onboard heat and other exported losses. Solar surfaces exchange heat outside the cabin/service network; generated electrical energy is not also booked as absorbed cabin heat. These are deliberately simplified thermal boundaries.

**[ASSUMED]** The basic balance is `C * dT/dt = deposited heat + incoming transport - outgoing transport - net radiation`. Each transfer is subtracted from its donor and added to its receiver. The external pump gates active radiator transport; a large cold radiator cannot cool disconnected electronics. Cabin/service thermostatic flow and interface bypass regulate internal temperatures; passive conductance remains when a pump stops. The JSON defines conductances, caps and controller targets. Local linear transport time constants follow `tau = C/K`; they are not complete vehicle cooldown times because connected capacities, saturation and control change the response.

**[ESTABLISHED: S02 §7.2.6]** Thermal louvers regulate infrared rejection by changing effective surface emission. **[ESTABLISHED: S11]** Radiator pointing can manage the radiative environment. **[ASSUMED]** Both are represented here: thermostatic louvers vary effective IR emission to maintain the external-loop target; pointing changes incoming light and obstruction/view factors. Rotating a flat radiator in an unobstructed isotropic cold sky does not arbitrarily multiply emitted power by a cosine. Emitting area counts both active faces; projected solar area does not. A stuck-open louver can overcool; a stuck-closed one can overheat. Initial louver opening balances the arrival load at the target temperature rather than assuming maximum rejection.

**[ASSUMED]** At the stated reference cold sky, the deployed surface at its target has rejection capacity above the operating cases; louvers reduce it to the actual load. Stowed rejection is lower than arrival heat and therefore uses thermal buffering only. No fixed encounter cooldown or repair occurs. The validator checks this bracket and local transport capacity; it does not prove every transient stable. External irradiation, hotter sinks, damage, pump loss and deployment motion can remove that margin.

**[ESTABLISHED: S10]** The Columbus case threatened freezing of *water in the interface heat exchanger*, despite ammonia being the external coolant. **[ASSUMED]** The small `hx-water` state is essential for that mechanism: stagnant core water can freeze while the cabin stays warm. The external pump can continue delivering cold ammonia when the internal pump stops. Bypass and a powered antifreeze heater protect the core; failed protection permits a dwell-triggered rupture. The selected freeze temperatures, warning margins and dwell thresholds are game assumptions. Phase 2 may collapse thermal nodes while explicitly deferring local freezing; Phase 3 must preserve the local state before claiming this behavior.

**[ASSUMED]** Equipment temperature limits first inhibit or derate functions; overtemperature trips and sustained excess temperature can create irreversible damage according to `thermalProtection`. Antifreeze and warmup heaters remain usable below normal operating limits while intact and powered; otherwise they could never warm cold equipment. These are cold-plate limits, not combustion temperatures. Cooling may restore an intact component's availability but never erase its damage or radiation history. A crew limit is a simplified hazard bound, not a medical model.

## Propulsion and changing mass properties

**[ASSUMED]** Main propulsion is a pressure-fed storable chemical assembly with **24,000 N thrust**, **320 s Isp**, a **2,400 N s minimum impulse**, a limited gimbal and a measured fixed mounting offset. Its coupled fuel/oxidizer mixture is represented as one usable propellant mass, avoiding an unmodeled mixture-ratio exploit. Electrical input runs valves/control; chemical fuel supplies thrust energy. This is a plausible engineering proposal, not an identified qualified engine or NASA rating.

**[ESTABLISHED: S12, S13]** Use `massFlow = thrust/(Isp*g0)` and `deltaV = Isp*g0*ln(initialMass/finalMass)` for ordinary propulsion checks, with standard gravity in the Isp definition, not the unfamiliar universe's local acceleration. The validator reports the resulting mass flow and ideal main-only velocity change. Burn duration/impulse is truncated at actual remaining propellant; any partial final impulse is logged. Minimum-impulse commands accumulate or are rejected explicitly, not silently rounded into free thrust.

**[ASSUMED]** Each of four RCS pods contains duplicated A/B directions, yielding **8 jets per bank**, **16 installed**. Each jet provides **200 N** at **220 s Isp** with a **10 N s minimum impulse**. The initial active bank is A; B is isolated until heated and selected. Tank draw is balanced by default; isolating one tank moves the center of mass. The current layout has asymmetric yaw authority: axial jets provide clockwise torque, transverse jets counterclockwise. Zero-net-force combinations provide **−1,600 / +4,000 N m**; a pure-translation allocation generally needs mixed pulses to cancel moment. This is an explicit proposal for controllable planar authority, not a six-axis spacecraft layout.

**[ESTABLISHED: S15, DD09]** Voyager demonstrates that branch swaps can require scarce heater power and that spare branches may have different control authority. **[ASSUMED]** Heating and switching restore only available functions. Neither action unclogs a nozzle, refills a tank nor clears component damage. The exact warmup time is compressed for play but still temperature-gated.

**[ASSUMED]** The initial thermal stub shares a service temperature across each pod's banks. An unpowered spare is not automatically cold; the readiness delay includes valve/ignition checkout and only needs heating when below its temperature gate. Independently cold dormant nozzles require local thermal states in Phase 3, with their heater energy removed from the service-node input and deposited locally to prevent double counting.

**[ESTABLISHED: S08]** The NEXT reference operating point couples **0.236 N**, **4,190 s Isp**, and **7,220 W bus input**. **[ASSUMED]** Retain that point as an optional installed long-coast unit, disabled by default. On this ship it provides negligible short-encounter velocity change; do not magnify thrust without a new explicit fictional decision. The assumed onboard heat allocation is a conservative upper bound, not a measured S08 thermal load. Do not combine a lower throttle point's power with the maximum thrust or Isp.

**[ESTABLISHED: S14, S24]** Compute `COM = sum(m*r)/sum(m)` and `Iz = sum(intrinsicIz + m*|r-COM|²)`; thrust torque is `(mount-COM) cross force`. **[ASSUMED]** Consumables use fixed centroids and intrinsic inertia proportional to remaining mass. Retained fuel-cell water moves mass forward without changing total mass. Main depletion shifts the center forward; an isolated RCS supply or one-sided deployment also moves it sideways. Recompute mass properties before applying each actuator output. The gimbal aims through the *current* COM subject to limits; residual moment belongs in attitude dynamics. During internal extension preserve angular momentum when inertia changes, and account for actuator energy. Exhaust angular momentum during burns remains the simulation owner's responsibility.

## Sensing, computation and evidence

**[ESTABLISHED: S04, DD10]** Inertial and optical instruments measure different things. **[ASSUMED, P7]** Accelerometers report specific force from propulsion or other modeled nongravitational forces; free fall alone reads bias/noise, not gravity. Correct the IMU's lever-arm rotational acceleration to COM and include correction uncertainty. Star trackers provide attitude, not position. An Earth star catalogue may fail in this universe; the proposal bootstraps a local relative sky map with an arbitrary inertial yaw origin when stars are visible. No valid star field means no perfect attitude fallback.

**[ESTABLISHED: DD05, DD07]** Optical navigation needs usable target geometry, illumination, exposure, pointing and calibration. **[ASSUMED]** Camera power buys bounded processing/cadence and noise improvements, not visibility or exact distance. Angular noise produces transverse error proportional to range. Range estimates require a declared target-size/shape prior or a sequence with parallax; otherwise observations are bearings only. A longer exposure can lower photon noise but fail the smear gate. Condition bounds, low-light validity, warmup, settling and maximum useful power prevent infinite-quality or divide-by-zero observations.

**[ASSUMED]** Flight CPUs retain control separately from the optional science processor. Redundant computers can agree on a wrong gravity model; agreement is not observational evidence. **[ESTABLISHED: DD10]** Common software/specification errors can defeat nominal software diversity.

**[ASSUMED, P12]** Black Box samples selected timestamped measurements and derived products into fixed-size telemetry records. Equipment `dataRate` is its rated offered stream; the recorder's fixed sample rate is a selected/compressed telemetry product, not a promise to store every camera byte. Optional raw imagery is a separate additive stream, including its processing demand. Reserve metadata capacity for commands, configurations, faults and issued forecasts. At capacity, stop new optional acquisition and expose gaps; do not silently rewrite an issued forecast or erase old evidence. Recorded observations carry validity and uncertainty, never hidden simulation truth.

**[FICTIONAL, P8]** Recurrence preserves all *acquired* records, including data through loss; old attempt archives are outside the current attempt's physical acquisition budget. A full or unpowered recorder acquires no extra optional samples. That distinction preserves P8 without an unlimited-power, unlimited-bandwidth sensor. Exact archive serialization belongs to the integrator/Black Box implementation.

**[ESTABLISHED: S07, S22]** Communication depends on receiver availability, coding, geometry, antenna pointing and link margin. Galileo's recovery used compression/coding and ground infrastructure as well as spacecraft changes. **[ASSUMED]** Transmit mode may consume power with no delivered data in this universe; its rate is only a ceiling. There is no hidden Earth link, free external ranging or automatic archive offload.

## Radiation and the lattice

**[ESTABLISHED: R04, R05]** Cumulative ionizing damage, single-event logical upsets, latch-up and destructive burnout are different effect classes. Dose can change leakage or timing; an upset changes logic without inherently damaging silicon; latch-up can drive abnormal current. Isolation can interrupt current but does not guarantee absence of latent/permanent damage. This is a mechanism mapping, not a silicon qualification model. R05 is historical material; its old mission statistics are not used.

**[FICTIONAL]** Each component accumulates lattice exposure in `lattice-unit s`, explicitly not Gy. Evaluate its occupied geometry as it moves, including deployed appendages, using field-owner spatial integration/sweeping. The proposal's susceptibility profiles separate hardened avionics, ordinary electronics, power switches and passive material. Material-selective electrical harm with no acute crew-dose simulation is itself fictional; real ionizing radiation does not justify crew immunity.

**[FICTIONAL]** The JSON algorithm has distinct persistent exposure, upset bucket, latch bucket, over-intensity dwell, trip, logic-validity and permanent-failure state. Exposure accumulates even when powered off. An upset may invalidate a measurement or demand a restart; it does not consume hit points. A latch interrupts a local branch and books abnormal current as heat until protection trips. High-intensity powered exposure can burn out a switch before protection saves it; excessive cumulative exposure can fail hardware even while off. Integer exposure-threshold crossings are deterministic approximations to single-event outcomes, not a claim that real SEEs happen at cumulative-dose thresholds. Resolve crossings inside the timestep; do not make survival depend on frame rate or use random survival rolls.

**[FICTIONAL]** For illustration, an intact ordinary component receiving intensity **1** for **8 s** accumulates **8 exposure units**: it crosses an upset bucket but stays below degradation onset. Repeated glances can eventually degrade that same component; another component elsewhere has its own history. An energized ordinary component at intensity **25** for **0.1 s** crosses the burnout dwell and fails irreversibly. These are illustrative field inputs, not encounter tuning or a ship-wide two-hit rule. Local protection, position, power state and susceptibility change the outcome.

**[FICTIONAL]** Lattice reconstruction is a processing mode on the existing science processor using existing camera/inertial/attitude hardware. More allocation improves only the declared reconstruction measurements and update cadence, while adding ordinary heat and draw. It creates no physical detector and no shielding. Its reconstructed evidence can reach the model through measurements; the ordinary forecaster never reads the field's truth. Leaving the field, cooling or resetting a breaker does not restore cumulative damage.

## Realistic anchors and deliberate play choices

| Topic | Real reference or limit | Adopted game value / rationale |
|---|---|---|
| Camera preparation | [ESTABLISHED: DD07] Artemis I scheduling included **3,600 s warmup**, **600 s star calibration**, and up to **900 s slew plus settling**. These are mission operations, not universal camera specifications. | [ASSUMED] **20 s / 10 s / 5 s** for this camera, respectively, so configuring an observation fits an interactive session. Preserve thermal readiness and pointing gates. |
| RCS performance | [ESTABLISHED: S03] The cited hydrazine class has **200–235 s Isp**. Real warmup depends on temperatures, hardware and heater availability; the Voyager sources do not give a universal duration. | [ASSUMED] **220 s Isp**, **20 s minimum warmup** plus the temperature gate. Performance remains chemical-propulsion scale; readiness time is a play proposal. |
| Electric propulsion | [ESTABLISHED: S08] The operating-point tuple appears above and in `referenceAnchors`. | [ASSUMED] Same thrust/Isp/bus-power tuple, no boost. Optional/defer if approved encounter timescales cannot use it. |
| Battery sizing | [ESTABLISHED: S01] The cited commercial cell range is **150–270 Wh/kg**, before flight packaging. | [ASSUMED] Packs deliver **50 Wh/kg nominal** including conservative packaging/reserve allowance; there is no claimed flight qualification or implicit cell-to-pack equality. |
| Crew consumables | [ESTABLISHED: DD02] Reference daily rates are in the appendix. | [ASSUMED] Apply them without time acceleration; stored-gas/sorbent mode avoids pretending recycling is unlimited. Product/waste stays aboard. |
| Thermal response | [ESTABLISHED: S02] Capacity, conductance and radiative environment determine response; no source supplies this ship's time constants. | [ASSUMED] Use the explicitly sized capacities and derived `C/K` response; no hidden faster cooling between encounters. Local freeze/overheat dwell rules are proposed game simplifications. |
| Radiation and recurrence | [ESTABLISHED: R04, R05] Real effect classes have device-, particle- and bias-dependent responses; they do not establish a universal safe dose. | [FICTIONAL] Dimensionless lattice intensity, thresholds, selective electronics damage, reconstruction and cross-recurrence persistence have no asserted real numerical equivalent. |

**[ASSUMED]** Other masses, wattages, bus limits, polygons, time constants, sigma values, storage and temperature thresholds are illustrative design estimates. There is no exact “real value” for hardware that has not been selected. Keep them configurable and ask the owner to approve the architecture; validate pacing with later playtests rather than calling paper feasibility demonstrated.

## Source scope and implementation handoff

Local research texts were used where present; no research copies are committed. S06 is a failure-analysis handbook, not a sizing handbook. S09/S11 and S24 provide architecture/abstract-level support, not numerical designs for this craft. S05P's water recovery description is not used as a closed-loop efficiency. DD05's known-body geometry assumption must not be silently applied to every unknown asteroid. S07's local text was empty, so its [publisher abstract](https://ipnpr.jpl.nasa.gov/progress_report/42-116/116k.html) supplied the link-recovery mechanism.

Link-only sources checked directly: [S12 specific impulse](https://www.grc.nasa.gov/www/BGH/specimp.html), [S13 rocket equation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/ideal-rocket-equation/), [S14 torque](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/torque-moment/), [R04 NASA NESC radiation guidance](https://ntrs.nasa.gov/citations/20210024100), and [R05 JPL effects overview](https://parts.jpl.nasa.gov/asic/Appendix.3.html), including its [latch-up design discussion](https://parts.jpl.nasa.gov/asic/Sect.3.4.html). Source IDs remain those in the existing bibliography.

**[ASSUMED]** Phase 2 should implement mass/energy conservation, protected allocation, bounded propulsion, honest sensors and basic thermal nodes before richer damage. Phase 3 adds local exchanger freezing, thermoregulation failures, per-component exposure, directed spare switching and the fictional processing channel. The JSON is a proposal configuration, not an imposed `src/contracts/` schema. State/command contracts and exposure integration must be agreed by the integrator; requests are in [the 1C handoff](../handoffs/1C.md).

## Numerical appendix

<!-- BEGIN BASELINE NUMBERS -->

All numbers in this appendix are **[ASSUMED]** unless a row explicitly says otherwise. Units follow the JSON's `provenance.unitConventions`; byte counts are decimal bytes. Tables are generated from the JSON and checked exactly by `validate_baseline.py`.

### Equipment inventory and modes

Each physical assembly is counted once. `off` has zero commanded electrical draw and data; it does not stop metabolism, erase stored heat, remove mass or cure damage. Crew cannot be commanded off. Positions are the stowed structural coordinates; configuration overrides move appendages. Heat is deposited onboard, not total energy released. Generator/storage mode values are rated endpoints; dispatch formulas determine actual values.

| ID / subsystem | Mass kg; (x,y) m; intrinsic I kg m² | Modes: power / onboard heat / output data rate / generated power (W / W / byte s⁻¹ / W) | Allowed assembly K | Node / bus / initial mode |
|---|---|---|---|---|
| `habitat-structure` / structure | 17438; [0, 0]; 180000 | off: 0/0/0/0 | 250–340 | cabin / none / off |
| `crew` / crew | 320; [3, 0]; 320 | off: 0/0/0/0; occupied: 0/400/0/0 | 283–308 | cabin / none / occupied |
| `cabin-stores` / life-support | 800; [3, 0]; 800 | off: 0/0/0/0 | 273–313 | cabin / none / off |
| `main-tank` / tank | 800; [-2, 0]; 800 | off: 0/0/0/0 | 263–323 | service / none / off |
| `rcs-tanks` / tank | 100; [-1, 0]; 100 | off: 0/0/0/0 | 263–323 | service / none / off |
| `xenon-tank` / tank | 40; [-3, 0]; 40 | off: 0/0/0/0 | 263–323 | service / none / off |
| `reactant-tanks` / tank | 80; [1, 0]; 80 | off: 0/0/0/0 | 263–323 | service / none / off |
| `product-water-tank` / tank | 20; [2, 0]; 20 | off: 0/0/0/0 | 263–323 | service / none / off |
| `solar-left` / generation | 300; [3, 2]; 700 | off: 0/0/0/0; stowed: 0/0/0/0; deployed: 0/0/0/12000; deploying: 100/100/0/0 | 173–373 | external-loop / main-a / stowed |
| `radiator-left` / thermal | 250; [-2, 2]; 500 | off: 0/0/0/0; hold: 0/0/0/0; moving: 80/80/0/0 | 200–350 | external-loop / main-a / hold |
| `solar-right` / generation | 300; [3, -2]; 700 | off: 0/0/0/0; stowed: 0/0/0/0; deployed: 0/0/0/12000; deploying: 100/100/0/0 | 173–373 | external-loop / main-b / stowed |
| `radiator-right` / thermal | 250; [-2, -2]; 500 | off: 0/0/0/0; hold: 0/0/0/0; moving: 80/80/0/0 | 200–350 | external-loop / main-b / hold |
| `fuel-cell-a` / generation | 180; [-1, 1]; 180 | off: 0/0/0/0; following: 0/6000/0/6000 | 278–333 | service / main-a / following |
| `battery-a` / storage | 200; [1, 1]; 200 | off: 0/0/0/0; idle: 0/0/0/0; discharge: 0/210.526316/0/4000; charge: 2000/100/0/0 | 263–318 | service / main-a / idle |
| `pdu-a` / distribution | 70; [0, 1]; 70 | off: 0/0/0/0; active: 30/30/0/0 | 263–333 | service / main-a / active |
| `eclss-a` / life-support | 450; [4, 1]; 450 | off: 0/0/0/0; active: 1800/1800/0/0; standby: 80/80/0/0 | 278–313 | cabin / essential / active |
| `internal-pump-a` / thermal | 30; [2, 1]; 30 | off: 0/0/0/0; active: 120/120/0/0; standby: 5/5/0/0 | 278–323 | cabin / essential / active |
| `external-pump-a` / thermal | 40; [-2, 1]; 40 | off: 0/0/0/0; active: 180/180/0/0; standby: 5/5/0/0 | 200–333 | service / essential / active |
| `flight-cpu-a` / avionics | 25; [2, 0.5]; 25 | off: 0/0/0/0; active: 120/120/4000/0; standby: 20/20/100/0 | 263–323 | cabin / essential / active |
| `imu-a` / sensing | 8; [0, 0.1]; 2 | off: 0/0/0/0; active: 15/15/2400/0 | 273–313 | cabin / essential / active |
| `star-tracker-a` / sensing | 8; [6, 1]; 3 | off: 0/0/0/0; active: 20/20/128/0 | 263–313 | service / essential / active |
| `fuel-cell-b` / generation | 180; [-1, -1]; 180 | off: 0/0/0/0; following: 0/6000/0/6000 | 278–333 | service / main-b / following |
| `battery-b` / storage | 200; [1, -1]; 200 | off: 0/0/0/0; idle: 0/0/0/0; discharge: 0/210.526316/0/4000; charge: 2000/100/0/0 | 263–318 | service / main-b / idle |
| `pdu-b` / distribution | 70; [0, -1]; 70 | off: 0/0/0/0; active: 30/30/0/0 | 263–333 | service / main-b / active |
| `eclss-b` / life-support | 450; [4, -1]; 450 | off: 0/0/0/0; active: 1800/1800/0/0; standby: 80/80/0/0 | 278–313 | cabin / essential / standby |
| `internal-pump-b` / thermal | 30; [2, -1]; 30 | off: 0/0/0/0; active: 120/120/0/0; standby: 5/5/0/0 | 278–323 | cabin / essential / standby |
| `external-pump-b` / thermal | 40; [-2, -1]; 40 | off: 0/0/0/0; active: 180/180/0/0; standby: 5/5/0/0 | 200–333 | service / essential / standby |
| `flight-cpu-b` / avionics | 25; [2, -0.5]; 25 | off: 0/0/0/0; active: 120/120/4000/0; standby: 20/20/100/0 | 263–323 | cabin / essential / standby |
| `imu-b` / sensing | 8; [0, -0.1]; 2 | off: 0/0/0/0; active: 15/15/2400/0 | 273–313 | cabin / essential / active |
| `star-tracker-b` / sensing | 8; [6, -1]; 3 | off: 0/0/0/0; active: 20/20/128/0 | 263–313 | service / essential / active |
| `interface-hx` / thermal | 150; [0, 0]; 150 | off: 0/0/0/0; regulated: 20/20/0/0; antifreeze: 220/220/0/0 | 278–323 | hx-water / essential / regulated |
| `main-engine` / propulsion | 600; [-7, 0.08]; 300 | off: 0/0/0/0; ready: 30/30/0/0; firing: 180/4180/0/0; heater: 100/100/0/0 | 278–343 | service / essential / ready |
| `rcs-forward-left` / propulsion | 60; [5, 2]; 20 | off: 0/0/0/0; ready: 15/15/0/0; heater: 80/80/0/0; fire-one: 40/140/0/0; fire-two: 65/265/0/0 | 278–343 | service / essential / ready |
| `rcs-forward-right` / propulsion | 60; [5, -2]; 20 | off: 0/0/0/0; ready: 15/15/0/0; heater: 80/80/0/0; fire-one: 40/140/0/0; fire-two: 65/265/0/0 | 278–343 | service / essential / ready |
| `rcs-aft-left` / propulsion | 60; [-5, 2]; 20 | off: 0/0/0/0; ready: 15/15/0/0; heater: 80/80/0/0; fire-one: 40/140/0/0; fire-two: 65/265/0/0 | 278–343 | service / essential / ready |
| `rcs-aft-right` / propulsion | 60; [-5, -2]; 20 | off: 0/0/0/0; ready: 15/15/0/0; heater: 80/80/0/0; fire-one: 40/140/0/0; fire-two: 65/265/0/0 | 278–343 | service / essential / ready |
| `ion-drive` / propulsion | 100; [-7, 0]; 50 | off: 0/0/0/0; idle: 0/0/0/0; firing: 7220/2300/0/0 | 273–333 | service / payload / idle |
| `camera` / sensing | 30; [7, 0]; 10 | off: 0/0/0/0; survey: 60/60/100000/0; track: 120/120/500000/0; detail: 200/200/1000000/0 | 273–313 | service / payload / track |
| `science-processor` / processing | 30; [1, 0.5]; 15 | off: 0/0/0/0; idle: 40/40/1000/0; science: 350/350/100000/0; lattice: 1000/1000/200000/0 | 263–323 | service / payload / idle |
| `black-box` / data | 20; [2, 0]; 10 | off: 0/0/0/0; minimum: 15/15/4096/0; normal: 35/35/40960/0; high: 100/100/204800/0 | 263–323 | cabin / essential / normal |
| `comms` / communications | 60; [6, 0]; 30 | off: 0/0/0/0; listen: 20/20/0/0; transmit: 250/170/125000/0 | 263–333 | service / payload / listen |
| `console` / avionics | 50; [4, 0]; 25 | off: 0/0/0/0; active: 100/100/1000/0; dim: 40/40/1000/0 | 273–313 | cabin / essential / active |

### Fault containment and dependencies

All policies are **[ASSUMED]**; listed sources support mechanisms, not ratings. Radiation profile names select the explicitly fictional mapping below.

| Assembly | Redundancy / shared dependency | Failure, protection and source mechanism | Radiation profile |
|---|---|---|---|
| `habitat-structure` | None | Pressure boundary/structure not repaired automatically; mass residual includes docking, plumbing, shielding and contingency hardware. (S21) | passive |
| `crew` | None | Metabolic heat persists with power off; limits are cabin comfort/safety modelling assumptions, not hardware cutoffs. (S05) | passive |
| `cabin-stores` | None | Retain waste mass; finite oxygen/food/water/sorbent subsets, no automatic refill. (DD02) | passive |
| `main-tank` | None | Loss of function; isolate failed branch; deliberate restart only if recoverable. (S03, S01) | passive |
| `rcs-tanks` | None | Loss of function; isolate failed branch; deliberate restart only if recoverable. (S03, S01) | passive |
| `xenon-tank` | None | Loss of function; isolate failed branch; deliberate restart only if recoverable. (S03, S01) | passive |
| `reactant-tanks` | None | Loss of function; isolate failed branch; deliberate restart only if recoverable. (S03, S01) | passive |
| `product-water-tank` | None | Loss of function; isolate failed branch; deliberate restart only if recoverable. (S03, S01) | passive |
| `solar-left` | Other wing; shared illumination | Damaged cells derate; motor failure freezes deployment. Solar thermal balance goes to exterior, not cabin loop; generatedPower is only a rated ceiling. (S01, S21) | standard |
| `radiator-left` | Other branch; shared external fluid | Leak isolates branch; motor jam fixes current geometry; no instant stow after loss of power. (S02, S11) | standard |
| `solar-right` | Other wing; shared illumination | Damaged cells derate; motor failure freezes deployment. Solar thermal balance goes to exterior, not cabin loop; generatedPower is only a rated ceiling. (S01, S21) | standard |
| `radiator-right` | Other branch; shared external fluid | Leak isolates branch; motor jam fixes current geometry; no instant stow after loss of power. (S02, S11) | standard |
| `fuel-cell-a` | Other stack; shared reactants/cooling | Reactant exhaustion/overtemp stops generation; heat and generatedPower scale with actual dispatch. (S01) | standard |
| `battery-a` | Other pack; independent contactor | Temperature/SOC/current clamps; deliberate reset after trip; irreversible capacity loss persists. (S01) | power-switch |
| `pdu-a` | Other isolated PDU | RPC isolates branch; failed source contactor can remove one main bus. Essential converter loss is dynamic heat added here. (S17, S06) | power-switch |
| `eclss-a` | Other air train; common cabin and consumables | Last healthy active air train is not shed. Supply/cooling failure still causes hazard. Spare selection deliberate. (S05, S05P, DD02) | hardened |
| `internal-pump-a` | Spare pump; same water loop | Stall removes forced conductance; selected spare restores flow only if no leak/freeze. (S09, S10) | standard |
| `external-pump-a` | Spare pump; same ammonia loop | Stall halts forced transfer/rejection; shared leak defeats both. (S09) | standard |
| `flight-cpu-a` | Other CPU; common software assumptions | Watchdog/reset can recover logic; no automatic removal of dose or shared-model errors. (S20, DD10) | hardened |
| `imu-a` | Other IMU; independent bias | Invalid samples flagged; no gravity truth readout. (S04, DD10) | hardened |
| `star-tracker-a` | Other head; shared sky/catalog | Lost lock invalidates attitude sample; does not reveal position. (S04) | standard |
| `fuel-cell-b` | Other stack; shared reactants/cooling | Reactant exhaustion/overtemp stops generation; heat and generatedPower scale with actual dispatch. (S01) | standard |
| `battery-b` | Other pack; independent contactor | Temperature/SOC/current clamps; deliberate reset after trip; irreversible capacity loss persists. (S01) | power-switch |
| `pdu-b` | Other isolated PDU | RPC isolates branch; failed source contactor can remove one main bus. Essential converter loss is dynamic heat added here. (S17, S06) | power-switch |
| `eclss-b` | Other air train; common cabin and consumables | Last healthy active air train is not shed. Supply/cooling failure still causes hazard. Spare selection deliberate. (S05, S05P, DD02) | hardened |
| `internal-pump-b` | Spare pump; same water loop | Stall removes forced conductance; selected spare restores flow only if no leak/freeze. (S09, S10) | standard |
| `external-pump-b` | Spare pump; same ammonia loop | Stall halts forced transfer/rejection; shared leak defeats both. (S09) | standard |
| `flight-cpu-b` | Other CPU; common software assumptions | Watchdog/reset can recover logic; no automatic removal of dose or shared-model errors. (S20, DD10) | hardened |
| `imu-b` | Other IMU; independent bias | Invalid samples flagged; no gravity truth readout. (S04, DD10) | hardened |
| `star-tracker-b` | Other head; shared sky/catalog | Lost lock invalidates attitude sample; does not reveal position. (S04) | standard |
| `interface-hx` | Bypass/heater protection, single boundary | Cold soak with stagnant water can freeze/rupture; protect water side even if ammonia liquid. (S10) | standard |
| `main-engine` | No full main-engine spare; RCS limited fallback | Overtemp/valve fault inhibits firing; gimbal jam leaves fixed measured offset. Limits describe assembly/cold plate, not combustion gas. (S03) | standard |
| `rcs-forward-left` | A/B duplicated jets per pod; shared tanks/pod | Cold spare must warm before firing; failed jet remains unavailable; controller trip isolates pod. (S03, S15, DD09) | standard |
| `rcs-forward-right` | A/B duplicated jets per pod; shared tanks/pod | Cold spare must warm before firing; failed jet remains unavailable; controller trip isolates pod. (S03, S15, DD09) | standard |
| `rcs-aft-left` | A/B duplicated jets per pod; shared tanks/pod | Cold spare must warm before firing; failed jet remains unavailable; controller trip isolates pod. (S03, S15, DD09) | standard |
| `rcs-aft-right` | A/B duplicated jets per pod; shared tanks/pod | Cold spare must warm before firing; failed jet remains unavailable; controller trip isolates pod. (S03, S15, DD09) | standard |
| `ion-drive` | No spare; optional | High-voltage trip disables unit; genuine NEXT-scale thrust only. (S08) | standard |
| `camera` | One camera; star heads do not replace range imagery | Smear, darkness, thermal state and occlusion cause invalid observations; power cannot repair optics. (DD05, DD07) | standard |
| `science-processor` | Flight CPU retains essential control | Throttle on heat/power; errors invalidate products. Lattice software itself is fictional. (S20) | standard |
| `black-box` | ECC plus protected metadata partition; one recorder | ECC/scrub and reset restore logic only; saturation stops optional acquisition; missing samples remain missing. (S20) | hardened |
| `comms` | Low-gain fallback included in assembly | No receiver means zero achieved rate; transmit heat excludes 80 W radiated RF. (S07, S22) | standard |
| `console` | Local emergency controls abstracted | Loss prevents normal UI commands; not a ship truth oracle. (S20) | standard |

### Geometry, resources and subsystem parameters

Parameter paths are exact JSON keys; array entries use their `id` when available. Geometric envelopes and rates are design assumptions, not measured hardware. Formula/policy strings in the JSON define how these parameters combine.

#### `version`

| Parameter | Value | Label / source |
|---|---|---|
| `version` | 1 | [ASSUMED] |

#### `constants`

| Parameter | Value | Label / source |
|---|---|---|
| `constants.g0.value` | 9.80665 | [ASSUMED] |
| `constants.sigma.value` | 5.67037442e-08 | [ESTABLISHED: S23] |

#### `ship`

| Parameter | Value | Label / source |
|---|---|---|
| `ship.crew` | 4 | [ASSUMED] |
| `ship.dryMass` | 24000 | [ASSUMED] |
| `ship.initialWetMass` | 30374 | [ASSUMED] |
| `ship.footprints.stowed[0]` | [-8, -2.5] | [ASSUMED] |
| `ship.footprints.stowed[1]` | [8, -2.5] | [ASSUMED] |
| `ship.footprints.stowed[2]` | [8, 2.5] | [ASSUMED] |
| `ship.footprints.stowed[3]` | [-8, 2.5] | [ASSUMED] |
| `ship.footprints.radiators[0]` | [-8, -2.5] | [ASSUMED] |
| `ship.footprints.radiators[1]` | [-4, -10] | [ASSUMED] |
| `ship.footprints.radiators[2]` | [1, -10] | [ASSUMED] |
| `ship.footprints.radiators[3]` | [8, -2.5] | [ASSUMED] |
| `ship.footprints.radiators[4]` | [8, 2.5] | [ASSUMED] |
| `ship.footprints.radiators[5]` | [1, 10] | [ASSUMED] |
| `ship.footprints.radiators[6]` | [-4, 10] | [ASSUMED] |
| `ship.footprints.radiators[7]` | [-8, 2.5] | [ASSUMED] |
| `ship.footprints.solar[0]` | [-8, -2.5] | [ASSUMED] |
| `ship.footprints.solar[1]` | [0, -12] | [ASSUMED] |
| `ship.footprints.solar[2]` | [6, -12] | [ASSUMED] |
| `ship.footprints.solar[3]` | [8, -2.5] | [ASSUMED] |
| `ship.footprints.solar[4]` | [8, 2.5] | [ASSUMED] |
| `ship.footprints.solar[5]` | [6, 12] | [ASSUMED] |
| `ship.footprints.solar[6]` | [0, 12] | [ASSUMED] |
| `ship.footprints.solar[7]` | [-8, 2.5] | [ASSUMED] |
| `ship.footprints.allDeployed[0]` | [-8, -2.5] | [ASSUMED] |
| `ship.footprints.allDeployed[1]` | [-4, -10] | [ASSUMED] |
| `ship.footprints.allDeployed[2]` | [0, -12] | [ASSUMED] |
| `ship.footprints.allDeployed[3]` | [6, -12] | [ASSUMED] |
| `ship.footprints.allDeployed[4]` | [8, -2.5] | [ASSUMED] |
| `ship.footprints.allDeployed[5]` | [8, 2.5] | [ASSUMED] |
| `ship.footprints.allDeployed[6]` | [6, 12] | [ASSUMED] |
| `ship.footprints.allDeployed[7]` | [0, 12] | [ASSUMED] |
| `ship.footprints.allDeployed[8]` | [-4, 10] | [ASSUMED] |
| `ship.footprints.allDeployed[9]` | [-8, 2.5] | [ASSUMED] |

#### `propellant`

| Parameter | Value | Label / source |
|---|---|---|
| `propellant[main-propellant].initialMass` | 6000 | [ASSUMED] |
| `propellant[main-propellant].capacity` | 6000 | [ASSUMED] |
| `propellant[main-propellant].position` | [-2, 0] | [ASSUMED] |
| `propellant[main-propellant].intrinsicInertiaPerKg` | 1 | [ASSUMED] |
| `propellant[main-propellant].Isp` | 320 | [ASSUMED] |
| `propellant[rcs-left].initialMass` | 150 | [ASSUMED] |
| `propellant[rcs-left].capacity` | 150 | [ASSUMED] |
| `propellant[rcs-left].position` | [-1, 1] | [ASSUMED] |
| `propellant[rcs-left].intrinsicInertiaPerKg` | 1 | [ASSUMED] |
| `propellant[rcs-left].Isp` | 220 | [ASSUMED] |
| `propellant[rcs-right].initialMass` | 150 | [ASSUMED] |
| `propellant[rcs-right].capacity` | 150 | [ASSUMED] |
| `propellant[rcs-right].position` | [-1, -1] | [ASSUMED] |
| `propellant[rcs-right].intrinsicInertiaPerKg` | 1 | [ASSUMED] |
| `propellant[rcs-right].Isp` | 220 | [ASSUMED] |
| `propellant[xenon].initialMass` | 20 | [ASSUMED] |
| `propellant[xenon].capacity` | 20 | [ASSUMED] |
| `propellant[xenon].position` | [-3, 0] | [ASSUMED] |
| `propellant[xenon].intrinsicInertiaPerKg` | 1 | [ASSUMED] |
| `propellant[xenon].Isp` | 4190 | [ASSUMED] |

#### `reactants`

| Parameter | Value | Label / source |
|---|---|---|
| `reactants[fuel-cell-hydrogen].initialMass` | 6 | [ASSUMED] |
| `reactants[fuel-cell-hydrogen].capacity` | 6 | [ASSUMED] |
| `reactants[fuel-cell-hydrogen].position` | [1, 0] | [ASSUMED] |
| `reactants[fuel-cell-hydrogen].intrinsicInertiaPerKg` | 1 | [ASSUMED] |
| `reactants[fuel-cell-oxygen].initialMass` | 48 | [ASSUMED] |
| `reactants[fuel-cell-oxygen].capacity` | 48 | [ASSUMED] |
| `reactants[fuel-cell-oxygen].position` | [1, 0] | [ASSUMED] |
| `reactants[fuel-cell-oxygen].intrinsicInertiaPerKg` | 1 | [ASSUMED] |
| `reactants[product-water].initialMass` | 0 | [ASSUMED] |
| `reactants[product-water].capacity` | 54 | [ASSUMED] |
| `reactants[product-water].position` | [2, 0] | [ASSUMED] |
| `reactants[product-water].intrinsicInertiaPerKg` | 1 | [ASSUMED] |

#### `buses`

| Parameter | Value | Label / source |
|---|---|---|
| `buses[main-a].voltage` | 120 | [ASSUMED] |
| `buses[main-a].maxPower` | 16000 | [ASSUMED] |
| `buses[main-b].voltage` | 120 | [ASSUMED] |
| `buses[main-b].maxPower` | 16000 | [ASSUMED] |
| `buses[essential].voltage` | 28 | [ASSUMED] |
| `buses[essential].maxPower` | 5000 | [ASSUMED] |
| `buses[essential].converterEfficiency` | 0.95 | [ASSUMED] |
| `buses[payload].voltage` | 120 | [ASSUMED] |
| `buses[payload].maxPower` | 14000 | [ASSUMED] |

#### `power`

| Parameter | Value | Label / source |
|---|---|---|
| `power.tieMaxPower` | 6000 | [ASSUMED] |
| `power.reserveEnergyPerBattery` | 7200000 | [ASSUMED] |
| `power.rpc.tripCurrentMultiple` | 1.5 | [ASSUMED] |
| `power.rpc.tripDelay` | 0.02 | [ASSUMED] |
| `power.rpc.resetDelay` | 5 | [ASSUMED] |
| `power.rpc.latchFaultCurrentMultiple` | 3 | [ASSUMED] |
| `power.branchHeadroom` | 1.25 | [ASSUMED] |

#### `generation`

| Parameter | Value | Label / source |
|---|---|---|
| `generation.solar.referenceIrradiance` | 1361 | [ASSUMED] |
| `generation.solar.efficiency` | 0.22 | [ASSUMED] |
| `generation.solar.areaPerWing` | 40 | [ASSUMED] |
| `generation.solar.maxPowerPerWing` | 12000 | [ASSUMED] |
| `generation.solar.initialIrradiance` | 0 | [ASSUMED] |
| `generation.fuelCell.maxPowerPerStack` | 6000 | [ASSUMED] |
| `generation.fuelCell.oxygenPerHydrogen` | 8 | [ASSUMED] |
| `generation.fuelCell.waterPerHydrogen` | 9 | [ASSUMED] |
| `generation.fuelCell.rampRateWPerS` | 1000 | [ASSUMED] |
| `generation.fuelCell.initialPowerPerStack` | 0 | [ASSUMED] |
| `generation.fuelCell.netEfficiencyHHV` | 0.5 | [ASSUMED] |
| `generation.fuelCell.hydrogenHHV` | 142000000 | [ASSUMED] |
| `generation.battery.capacityPerPack` | 36000000 | [ASSUMED] |
| `generation.battery.initialEnergyPerPack` | 28800000 | [ASSUMED] |
| `generation.battery.maxDischargePowerPerPack` | 4000 | [ASSUMED] |
| `generation.battery.maxChargePowerPerPack` | 2000 | [ASSUMED] |
| `generation.battery.chargeEfficiency` | 0.95 | [ASSUMED] |
| `generation.battery.dischargeEfficiency` | 0.95 | [ASSUMED] |
| `generation.battery.chargeTempMin` | 278 | [ASSUMED] |
| `generation.battery.chargeTempMax` | 308 | [ASSUMED] |
| `generation.battery.dischargeTempMin` | 263 | [ASSUMED] |
| `generation.battery.dischargeTempMax` | 318 | [ASSUMED] |

#### `thermalNodes`

| Parameter | Value | Label / source |
|---|---|---|
| `thermalNodes[cabin].capacity` | 12000000 | [ASSUMED] |
| `thermalNodes[cabin].initialTemperature` | 295 | [ASSUMED] |
| `thermalNodes[cabin].warnTemperature` | 303 | [ASSUMED] |
| `thermalNodes[cabin].failureTemperature` | 313 | [ASSUMED] |
| `thermalNodes[cabin].controlTargetTemperature` | 295 | [ASSUMED] |
| `thermalNodes[service].capacity` | 4000000 | [ASSUMED] |
| `thermalNodes[service].initialTemperature` | 295 | [ASSUMED] |
| `thermalNodes[service].warnTemperature` | 313 | [ASSUMED] |
| `thermalNodes[service].failureTemperature` | 333 | [ASSUMED] |
| `thermalNodes[service].controlTargetTemperature` | 295 | [ASSUMED] |
| `thermalNodes[external-loop].capacity` | 1200000 | [ASSUMED] |
| `thermalNodes[external-loop].initialTemperature` | 285 | [ASSUMED] |
| `thermalNodes[external-loop].warnTemperature` | 320 | [ASSUMED] |
| `thermalNodes[external-loop].failureTemperature` | 340 | [ASSUMED] |
| `thermalNodes[external-loop].controlTargetTemperature` | 285 | [ASSUMED] |
| `thermalNodes[hx-water].capacity` | 60000 | [ASSUMED] |
| `thermalNodes[hx-water].initialTemperature` | 290 | [ASSUMED] |
| `thermalNodes[hx-water].controlTargetTemperature` | 290 | [ASSUMED] |
| `thermalNodes[hx-water].warnTemperature` | 278 | [ASSUMED] |
| `thermalNodes[hx-water].failureTemperature` | 273.15 | [ASSUMED] |

#### `thermalLoops`

| Parameter | Value | Label / source |
|---|---|---|
| `thermalLoops[internal-water].conductance` | 1500 | [ASSUMED] |
| `thermalLoops[internal-water].maxHeatTransport` | 15000 | [ASSUMED] |
| `thermalLoops[internal-water].freezeTemperature` | 273.15 | [ASSUMED] |
| `thermalLoops[internal-water].bypassThreshold` | 278 | [ASSUMED] |
| `thermalLoops[internal-water].controlGain` | 1000 | [ASSUMED] |
| `thermalLoops[external-ammonia].conductance` | 2500 | [ASSUMED] |
| `thermalLoops[external-ammonia].maxHeatTransport` | 30000 | [ASSUMED] |
| `thermalLoops[external-ammonia].freezeTemperature` | 195.4 | [ASSUMED] |
| `thermalLoops[external-ammonia].controlGain` | 1000 | [ASSUMED] |

#### `radiators`

| Parameter | Value | Label / source |
|---|---|---|
| `radiators.emissivity` | 0.85 | [ASSUMED] |
| `radiators.solarAbsorptivity` | 0.15 | [ASSUMED] |
| `radiators.emittingAreaPerWing` | 50 | [ASSUMED] |
| `radiators.stowedEffectiveAreaPerWing` | 5 | [ASSUMED] |
| `radiators.referenceSinkTemperature` | 3 | [ASSUMED] |
| `radiators.referenceViewFactor` | 1 | [ASSUMED] |
| `radiators.deploymentTime` | 20 | [ASSUMED] |
| `radiators.maxPointingRate` | 0.02 | [ASSUMED] |
| `radiators.initialPointingAngle` | 0 | [ASSUMED] |
| `radiators.passiveConductance` | 10 | [ASSUMED] |
| `radiators.louverMinEmissionFraction` | 0.05 | [ASSUMED] |
| `radiators.louverMaxEmissionFraction` | 1 | [ASSUMED] |
| `radiators.louverTargetTemperature` | 285 | [ASSUMED] |
| `radiators.louverResponseTime` | 10 | [ASSUMED] |

#### `configuration`

| Parameter | Value | Label / source |
|---|---|---|
| `configuration.solarDeploymentTime` | 30 | [ASSUMED] |
| `configuration.appendages[radiator-left].stowedPosition` | [-2, 2] | [ASSUMED] |
| `configuration.appendages[radiator-left].deployedPosition` | [-2, 6] | [ASSUMED] |
| `configuration.appendages[radiator-left].stowedInertia` | 500 | [ASSUMED] |
| `configuration.appendages[radiator-left].deployedInertia` | 2500 | [ASSUMED] |
| `configuration.appendages[radiator-left].stowedPolygon[0]` | [-4, 1.5] | [ASSUMED] |
| `configuration.appendages[radiator-left].stowedPolygon[1]` | [1, 1.5] | [ASSUMED] |
| `configuration.appendages[radiator-left].stowedPolygon[2]` | [1, 2.5] | [ASSUMED] |
| `configuration.appendages[radiator-left].stowedPolygon[3]` | [-4, 2.5] | [ASSUMED] |
| `configuration.appendages[radiator-left].deployedPolygon[0]` | [-4, 2] | [ASSUMED] |
| `configuration.appendages[radiator-left].deployedPolygon[1]` | [1, 2] | [ASSUMED] |
| `configuration.appendages[radiator-left].deployedPolygon[2]` | [1, 10] | [ASSUMED] |
| `configuration.appendages[radiator-left].deployedPolygon[3]` | [-4, 10] | [ASSUMED] |
| `configuration.appendages[radiator-right].stowedPosition` | [-2, -2] | [ASSUMED] |
| `configuration.appendages[radiator-right].deployedPosition` | [-2, -6] | [ASSUMED] |
| `configuration.appendages[radiator-right].stowedInertia` | 500 | [ASSUMED] |
| `configuration.appendages[radiator-right].deployedInertia` | 2500 | [ASSUMED] |
| `configuration.appendages[radiator-right].stowedPolygon[0]` | [-4, -2.5] | [ASSUMED] |
| `configuration.appendages[radiator-right].stowedPolygon[1]` | [1, -2.5] | [ASSUMED] |
| `configuration.appendages[radiator-right].stowedPolygon[2]` | [1, -1.5] | [ASSUMED] |
| `configuration.appendages[radiator-right].stowedPolygon[3]` | [-4, -1.5] | [ASSUMED] |
| `configuration.appendages[radiator-right].deployedPolygon[0]` | [-4, -10] | [ASSUMED] |
| `configuration.appendages[radiator-right].deployedPolygon[1]` | [1, -10] | [ASSUMED] |
| `configuration.appendages[radiator-right].deployedPolygon[2]` | [1, -2] | [ASSUMED] |
| `configuration.appendages[radiator-right].deployedPolygon[3]` | [-4, -2] | [ASSUMED] |
| `configuration.appendages[solar-left].stowedPosition` | [3, 2] | [ASSUMED] |
| `configuration.appendages[solar-left].deployedPosition` | [3, 7] | [ASSUMED] |
| `configuration.appendages[solar-left].stowedInertia` | 700 | [ASSUMED] |
| `configuration.appendages[solar-left].deployedInertia` | 3500 | [ASSUMED] |
| `configuration.appendages[solar-left].stowedPolygon[0]` | [0, 1.5] | [ASSUMED] |
| `configuration.appendages[solar-left].stowedPolygon[1]` | [6, 1.5] | [ASSUMED] |
| `configuration.appendages[solar-left].stowedPolygon[2]` | [6, 2.5] | [ASSUMED] |
| `configuration.appendages[solar-left].stowedPolygon[3]` | [0, 2.5] | [ASSUMED] |
| `configuration.appendages[solar-left].deployedPolygon[0]` | [0, 2] | [ASSUMED] |
| `configuration.appendages[solar-left].deployedPolygon[1]` | [6, 2] | [ASSUMED] |
| `configuration.appendages[solar-left].deployedPolygon[2]` | [6, 12] | [ASSUMED] |
| `configuration.appendages[solar-left].deployedPolygon[3]` | [0, 12] | [ASSUMED] |
| `configuration.appendages[solar-right].stowedPosition` | [3, -2] | [ASSUMED] |
| `configuration.appendages[solar-right].deployedPosition` | [3, -7] | [ASSUMED] |
| `configuration.appendages[solar-right].stowedInertia` | 700 | [ASSUMED] |
| `configuration.appendages[solar-right].deployedInertia` | 3500 | [ASSUMED] |
| `configuration.appendages[solar-right].stowedPolygon[0]` | [0, -2.5] | [ASSUMED] |
| `configuration.appendages[solar-right].stowedPolygon[1]` | [6, -2.5] | [ASSUMED] |
| `configuration.appendages[solar-right].stowedPolygon[2]` | [6, -1.5] | [ASSUMED] |
| `configuration.appendages[solar-right].stowedPolygon[3]` | [0, -1.5] | [ASSUMED] |
| `configuration.appendages[solar-right].deployedPolygon[0]` | [0, -12] | [ASSUMED] |
| `configuration.appendages[solar-right].deployedPolygon[1]` | [6, -12] | [ASSUMED] |
| `configuration.appendages[solar-right].deployedPolygon[2]` | [6, -2] | [ASSUMED] |
| `configuration.appendages[solar-right].deployedPolygon[3]` | [0, -2] | [ASSUMED] |

#### `propulsion`

| Parameter | Value | Label / source |
|---|---|---|
| `propulsion.main.thrust` | 24000 | [ASSUMED] |
| `propulsion.main.Isp` | 320 | [ASSUMED] |
| `propulsion.main.minimumImpulse` | 2400 | [ASSUMED] |
| `propulsion.main.mountMisalignment` | 0.003 | [ASSUMED] |
| `propulsion.main.gimbalLimit` | 0.035 | [ASSUMED] |
| `propulsion.main.gimbalRate` | 0.02 | [ASSUMED] |
| `propulsion.main.chemicalHeatAtFullThrust` | 4000 | [ASSUMED] |
| `propulsion.main.direction` | [1, 0] | [ASSUMED] |
| `propulsion.rcs.thrustPerJet` | 200 | [ASSUMED] |
| `propulsion.rcs.Isp` | 220 | [ASSUMED] |
| `propulsion.rcs.minimumImpulsePerJet` | 10 | [ASSUMED] |
| `propulsion.rcs.mountMisalignment` | 0.002 | [ASSUMED] |
| `propulsion.rcs.warmupTime` | 20 | [ASSUMED] |
| `propulsion.rcs.warmupTemperature` | 285 | [ASSUMED] |
| `propulsion.rcs.maxSimultaneousJetsPerPod` | 2 | [ASSUMED] |
| `propulsion.rcs.chemicalHeatPerFiringJet` | 100 | [ASSUMED] |
| `propulsion.rcs.jets[rcs-forward-left-a-0].direction` | [1, 0] | [ASSUMED] |
| `propulsion.rcs.jets[rcs-forward-left-a-1].direction` | [0, 1] | [ASSUMED] |
| `propulsion.rcs.jets[rcs-forward-left-b-0].direction` | [1, 0] | [ASSUMED] |
| `propulsion.rcs.jets[rcs-forward-left-b-1].direction` | [0, 1] | [ASSUMED] |
| `propulsion.rcs.jets[rcs-forward-right-a-0].direction` | [-1, 0] | [ASSUMED] |
| `propulsion.rcs.jets[rcs-forward-right-a-1].direction` | [0, 1] | [ASSUMED] |
| `propulsion.rcs.jets[rcs-forward-right-b-0].direction` | [-1, 0] | [ASSUMED] |
| `propulsion.rcs.jets[rcs-forward-right-b-1].direction` | [0, 1] | [ASSUMED] |
| `propulsion.rcs.jets[rcs-aft-left-a-0].direction` | [1, 0] | [ASSUMED] |
| `propulsion.rcs.jets[rcs-aft-left-a-1].direction` | [0, -1] | [ASSUMED] |
| `propulsion.rcs.jets[rcs-aft-left-b-0].direction` | [1, 0] | [ASSUMED] |
| `propulsion.rcs.jets[rcs-aft-left-b-1].direction` | [0, -1] | [ASSUMED] |
| `propulsion.rcs.jets[rcs-aft-right-a-0].direction` | [-1, 0] | [ASSUMED] |
| `propulsion.rcs.jets[rcs-aft-right-a-1].direction` | [0, -1] | [ASSUMED] |
| `propulsion.rcs.jets[rcs-aft-right-b-0].direction` | [-1, 0] | [ASSUMED] |
| `propulsion.rcs.jets[rcs-aft-right-b-1].direction` | [0, -1] | [ASSUMED] |
| `propulsion.rcs.zeroNetForceYawTorquePerBank` | [-1600, 4000] | [ASSUMED] |
| `propulsion.ion.thrust` | 0.236 | [ASSUMED] |
| `propulsion.ion.Isp` | 4190 | [ASSUMED] |
| `propulsion.ion.busPower` | 7220 | [ASSUMED] |
| `propulsion.ion.onboardHeatUpperBound` | 2300 | [ASSUMED] |
| `propulsion.ion.minimumOnTime` | 60 | [ASSUMED] |
| `propulsion.ion.direction` | [1, 0] | [ASSUMED] |

#### `sensing`

| Parameter | Value | Label / source |
|---|---|---|
| `sensing.camera.warmupTime` | 20 | [ASSUMED] |
| `sensing.camera.calibrationTime` | 10 | [ASSUMED] |
| `sensing.camera.settleTime` | 5 | [ASSUMED] |
| `sensing.camera.referenceRange` | 10000 | [ASSUMED] |
| `sensing.camera.referenceExposure` | 0.05 | [ASSUMED] |
| `sensing.camera.minExposure` | 0.005 | [ASSUMED] |
| `sensing.camera.maxExposure` | 0.5 | [ASSUMED] |
| `sensing.camera.nominalAngularSigma` | 5e-05 | [ASSUMED] |
| `sensing.camera.angularFloor` | 2e-05 | [ASSUMED] |
| `sensing.camera.referenceTrackingPower` | 120 | [ASSUMED] |
| `sensing.camera.minTrackingPower` | 60 | [ASSUMED] |
| `sensing.camera.maxUsefulPower` | 200 | [ASSUMED] |
| `sensing.camera.maxSmearAngle` | 0.0001 | [ASSUMED] |
| `sensing.camera.rangePriorFraction` | 0.05 | [ASSUMED] |
| `sensing.camera.rangeFloor` | 10 | [ASSUMED] |
| `sensing.starTracker.angularSigma` | 4e-05 | [ASSUMED] |
| `sensing.starTracker.sampleRate` | 2 | [ASSUMED] |
| `sensing.starTracker.maxAngularRate` | 0.01 | [ASSUMED] |
| `sensing.imu.sampleRate` | 50 | [ASSUMED] |
| `sensing.imu.accelerationSigma` | 0.0001 | [ASSUMED] |
| `sensing.imu.accelerationBias` | 5e-05 | [ASSUMED] |
| `sensing.imu.gyroSigma` | 1e-05 | [ASSUMED] |
| `sensing.imu.gyroBias` | 2e-06 | [ASSUMED] |
| `sensing.latticeProcessing.minPower` | 350 | [FICTIONAL] |
| `sensing.latticeProcessing.fullPower` | 1000 | [FICTIONAL] |
| `sensing.latticeProcessing.minUpdateRate` | 0.2 | [FICTIONAL] |
| `sensing.latticeProcessing.fullUpdateRate` | 2 | [FICTIONAL] |

#### `recorder`

| Parameter | Value | Label / source |
|---|---|---|
| `recorder.capacity` | 8000000000 | [ASSUMED] |
| `recorder.bytesPerSample` | 4096 | [ASSUMED] |
| `recorder.minimumSampleRate` | 1 | [ASSUMED] |
| `recorder.normalSampleRate` | 10 | [ASSUMED] |
| `recorder.highSampleRate` | 50 | [ASSUMED] |
| `recorder.rawFrameRateBytes` | 1000000 | [ASSUMED] |
| `recorder.reservedEventCapacity` | 100000000 | [ASSUMED] |
| `recorder.powerMinimum` | 15 | [ASSUMED] |
| `recorder.powerNormal` | 35 | [ASSUMED] |
| `recorder.powerHigh` | 100 | [ASSUMED] |

#### `communications`

| Parameter | Value | Label / source |
|---|---|---|
| `communications.transmitRfPower` | 80 | [ASSUMED] |
| `communications.maxDataRate` | 125000 | [ASSUMED] |
| `communications.beamHalfAngle` | 0.03 | [ASSUMED] |

#### `lifeSupport`

| Parameter | Value | Label / source |
|---|---|---|
| `lifeSupport.oxygenInitial` | 30 | [ASSUMED] |
| `lifeSupport.foodInitial` | 24 | [ASSUMED] |
| `lifeSupport.potableWaterInitial` | 100 | [ASSUMED] |
| `lifeSupport.sorbentCO2Capacity` | 40 | [ASSUMED] |
| `lifeSupport.crewHeat` | 400 | [ASSUMED] |
| `lifeSupport.initialCabinCO2` | 0 | [ASSUMED] |
| `lifeSupport.CO2HazardBudget` | 2 | [ASSUMED] |
| `lifeSupport.oxygenRatePerCrew` | 9.72222222e-06 | [ASSUMED] |
| `lifeSupport.foodRatePerCrew` | 7.17592593e-06 | [ASSUMED] |
| `lifeSupport.waterRatePerCrew` | 4.07407407e-05 | [ASSUMED] |
| `lifeSupport.CO2RatePerCrew` | 1.15740741e-05 | [ASSUMED] |

#### `radiation`

| Parameter | Value | Label / source |
|---|---|---|
| `radiation.profiles.passive.susceptibility` | 0 | [FICTIONAL] |
| `radiation.profiles.passive.degradationStart` | 1000 | [FICTIONAL] |
| `radiation.profiles.passive.failureExposure` | 5000 | [FICTIONAL] |
| `radiation.profiles.passive.upsetInterval` | 0 | [FICTIONAL] |
| `radiation.profiles.passive.latchInterval` | 0 | [FICTIONAL] |
| `radiation.profiles.passive.burnoutIntensity` | 1000 | [FICTIONAL] |
| `radiation.profiles.hardened.susceptibility` | 0.5 | [FICTIONAL] |
| `radiation.profiles.hardened.degradationStart` | 40 | [FICTIONAL] |
| `radiation.profiles.hardened.failureExposure` | 160 | [FICTIONAL] |
| `radiation.profiles.hardened.upsetInterval` | 12 | [FICTIONAL] |
| `radiation.profiles.hardened.latchInterval` | 40 | [FICTIONAL] |
| `radiation.profiles.hardened.burnoutIntensity` | 20 | [FICTIONAL] |
| `radiation.profiles.standard.susceptibility` | 1 | [FICTIONAL] |
| `radiation.profiles.standard.degradationStart` | 20 | [FICTIONAL] |
| `radiation.profiles.standard.failureExposure` | 80 | [FICTIONAL] |
| `radiation.profiles.standard.upsetInterval` | 6 | [FICTIONAL] |
| `radiation.profiles.standard.latchInterval` | 20 | [FICTIONAL] |
| `radiation.profiles.standard.burnoutIntensity` | 10 | [FICTIONAL] |
| `radiation.profiles.power-switch.susceptibility` | 0.8 | [FICTIONAL] |
| `radiation.profiles.power-switch.degradationStart` | 30 | [FICTIONAL] |
| `radiation.profiles.power-switch.failureExposure` | 120 | [FICTIONAL] |
| `radiation.profiles.power-switch.upsetInterval` | 0 | [FICTIONAL] |
| `radiation.profiles.power-switch.latchInterval` | 25 | [FICTIONAL] |
| `radiation.profiles.power-switch.burnoutIntensity` | 8 | [FICTIONAL] |
| `radiation.burnoutDwell` | 0.1 | [FICTIONAL] |
| `radiation.maxLeakageFraction` | 0.25 | [FICTIONAL] |
| `radiation.restartTime` | 5 | [FICTIONAL] |
| `radiation.examples[ordinary-glance].intensity` | 1 | [FICTIONAL] |
| `radiation.examples[ordinary-glance].duration` | 8 | [FICTIONAL] |
| `radiation.examples[ordinary-severe-powered].intensity` | 25 | [FICTIONAL] |
| `radiation.examples[ordinary-severe-powered].duration` | 0.1 | [FICTIONAL] |

#### `referenceAnchors`

| Parameter | Value | Label / source |
|---|---|---|
| `referenceAnchors[next-full].thrust` | 0.236 | [ESTABLISHED: S08] |
| `referenceAnchors[next-full].Isp` | 4190 | [ESTABLISHED: S08] |
| `referenceAnchors[next-full].busPower` | 7220 | [ESTABLISHED: S08] |
| `referenceAnchors[next-full].systemEfficiency` | 0.67 | [ESTABLISHED: S08] |
| `referenceAnchors[next-full].reportedMassFlow` | 5.76e-06 | [ESTABLISHED: S08] |
| `referenceAnchors[rcs-isp-range].IspRange` | [200, 235] | [ESTABLISHED: S03] |
| `referenceAnchors[camera-schedule].warmupTime` | 3600 | [ESTABLISHED: DD07] |
| `referenceAnchors[camera-schedule].calibrationTime` | 600 | [ESTABLISHED: DD07] |
| `referenceAnchors[camera-schedule].slewAndSettleTimeUpperBound` | 900 | [ESTABLISHED: DD07] |
| `referenceAnchors[crew-reference].oxygenKgPerCrewDay` | 0.84 | [ESTABLISHED: DD02] |
| `referenceAnchors[crew-reference].foodKgPerCrewDay` | 0.62 | [ESTABLISHED: DD02] |
| `referenceAnchors[crew-reference].waterKgPerCrewDay` | 3.52 | [ESTABLISHED: DD02] |
| `referenceAnchors[crew-reference].CO2KgPerCrewDay` | 1 | [ESTABLISHED: DD02] |
| `referenceAnchors[cell-specific-energy].cellWhPerKgRange` | [150, 270] | [ESTABLISHED: S01] |

#### `thermalProtection`

| Parameter | Value | Label / source |
|---|---|---|
| `thermalProtection.derateMargin` | 5 | [ASSUMED] |
| `thermalProtection.damageMargin` | 10 | [ASSUMED] |
| `thermalProtection.damageDwell` | 30 | [ASSUMED] |
| `thermalProtection.freezeRuptureDwell` | 60 | [ASSUMED] |

#### `thermalLinks`

| Parameter | Value | Label / source |
|---|---|---|
| `thermalLinks[hx-to-ammonia].conductance` | 2000 | [ASSUMED] |
| `thermalLinks[hx-to-ammonia].passiveConductance` | 10 | [ASSUMED] |
| `thermalLinks[hx-to-ammonia].maxHeatTransport` | 15000 | [ASSUMED] |
| `thermalLinks[hx-to-ammonia].controlGain` | 1000 | [ASSUMED] |
| `thermalLinks[hx-to-ammonia].heaterEnableTemperature` | 278 | [ASSUMED] |
| `thermalLinks[hx-to-ammonia].heaterDisableTemperature` | 283 | [ASSUMED] |

### Calculated mass and power checks

**[ASSUMED]** These are derived from proposed ratings, rounded for display. The validator recomputes them. They establish bookkeeping consistency only.

| Mass case | M kg | COM x,y m | Yaw inertia kg m² |
|---|---|---|---|
| wet-stowed | 30374.000 | -0.332850, 0.002074 | 305048.751 |
| wet-radiators | 30374.000 | -0.332850, 0.002074 | 325048.751 |
| wet-all-deployed | 30374.000 | -0.332850, 0.002074 | 357648.751 |
| main-empty | 24374.000 | 0.077542, 0.002585 | 278267.283 |
| left-RCS-empty | 30224.000 | -0.329539, -0.002879 | 304681.537 |
| left-radiator-only | 30374.000 | -0.332850, 0.034997 | 315011.680 |
| reactants-converted | 30374.000 | -0.331073, 0.002074 | 305246.603 |

| Operating case | Configuration | Main-bus demand W | Heat deposited W | Battery output needed W | Essential load W |
|---|---|---|---|---|---|
| arrival | radiators | 3024.211 | 6448.421 | 0.000 | 2645.000 |
| stowed-transit | stowed | 3024.211 | 6448.421 | 0.000 | 2645.000 |
| survey | allDeployed | 3482.632 | 7365.263 | 0.000 | 2710.000 |
| lattice-burn | radiators | 4343.158 | 13286.316 | 0.000 | 2910.000 |
| ion-survey | allDeployed | 10702.632 | 16885.263 | 0.000 | 2710.000 |
| ion-survey-tie-open | allDeployed | 10702.632 | 15161.053 | 1820.000 | 2710.000 |

Zero solar assumed; stacks follow each isolated bus demand up to their local rating. Only `ion-survey` closes the healthy tie, permitting spare source capacity to transfer; `ion-survey-tie-open` shows the otherwise stranded capacity. Batteries supply any remainder, with conversion losses. No charging, deployment motors or fault current is included in these steady cases. The one active essential converter includes its loss; each PDU's housekeeping is separate. Solar power, if available, replaces fuel-cell generation and its heat. Cases use initial modes except:

- `arrival`: initial modes.
- `stowed-transit`: initial modes.
- `survey`: camera=detail, science-processor=science, black-box=high.
- `lattice-burn`: camera=detail, science-processor=lattice, black-box=high, main-engine=firing, rcs-forward-left=fire-one, rcs-aft-right=fire-one.
- `ion-survey`: camera=detail, science-processor=science, black-box=high, ion-drive=firing.
- `ion-survey-tie-open`: camera=detail, science-processor=science, black-box=high, ion-drive=firing.

<!-- END BASELINE NUMBERS -->
