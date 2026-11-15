# S11 — Owner decision queue

Recommendation only; no answers are adopted here. Prepared 2026-11-14 (Pacific), against `55d91c3` on `st/s11-decision-queue`. The [creative brief](../../CREATIVE_BRIEF.md) outranks the [decisions log](../../DECISIONS.md); only the owner, through the integrator, changes direction.

**Start with Q01.** There are 28 open entries: 26 consolidate the studies' 32 numbered owner questions, and Q03/Q09 make two additional unresolved choices explicit. The coverage table at the end maps every original question. Eight already-decided entries are recorded separately and must not be presented as new votes.

All recommendations, scope estimates and proposed acceptance gates below are **[ASSUMED]**. **[ESTABLISHED: repository sources linked below]** identifies recorded direction or source contents, not proof of physics. Numerical demonstrations are **reported from the cited studies**, not rerun by S11 and not evidence of a playable route. Wells, lattice and the proposed opening seam remain **[FICTIONAL]**; the shared gravity premise is P4, with one `r₀ = 1,000 km`.

## How to use the queue

Present one question at a time, recording the answer against its Q ID. Follow the order below: next-build interfaces and approved-route content, optional additions, then paired openings/Earth. [2G](../../build-plan/phase-2/2G-3d-flight.md), [Phase 3](../../build-plan/phase-3.md) and [Phase 4](../../build-plan/phase-4.md) supply the build-thread names. Phase 3/4 assignments are provisional; the integrator must assign new tether/gas/tidal/X implementation work explicitly. “2D” below means the screen lane, with 3F joining at Phase 3. No study recommendation expands 2G's conversion into building all these systems.

Groups allow a single **explicit** answer to resolve several entries; agreement to a group's purpose alone does not accept all its defaults:

| Group | One answer and its effect |
| --- | --- |
| W — well mechanics | “Accept the S5 well package” explicitly means Q01=yes, Q02=no added torque, Q04=smooth annulus, Q05=no first-content overlaps. Otherwise ask each separately. |
| L — lattice representation | “Accept the S5 lattice package” explicitly accepts Q06=observation reconstruction and Q07=conservative component exposure. The two choices can also be answered separately. |
| R — route presentation | Q08–Q10 are independent. A13 already settles the graph; neither approval of names nor pacing implies approval of a volume allocation. |
| B — Borrowed Spin | Q11=defer parks Q12–Q19; it does not settle their eventual design. Q11=prototype opens those choices and the load-feasibility gate. S1/S3/S4's repeated “build it?” questions are all answered by Q11. |
| X — paired openings | Q22=yes answers S4/S6's shared-system question together, but leaves Q23–Q28 independent. Q22=defer parks those implementation choices and explicitly leaves the terminal route unfinished; it is not permission to replace Passage with a teleport. |
| E — evidence lifecycle | Q03 supplies one common record policy for S4's local experiments and S6's nonlethal held-out observations. It does not decide what physical evidence validates material transfer (Q25). |

## Next build: 2G seams, Phase 3 and A13 route content

### Q01 — Should accelerometers measure the well-modified push?

- **Raised by:** [S5 question 3](../s5/README.md#work-and-decisions-to-carry-to-the-integrator), [S5 handoff](../../handoffs/s5.md), against [estimator spec §13 item 3](../../model/estimator-spec.md#13-limits-and-open-questions).
- **Recommend:** yes. S5 treats the well as modified nongravitational force; the older estimator recommendation hides the correction from the accelerometer like gravity, leaving tracking to reveal it. Both are fictional choices, with different discovery behavior.
- **Answers / unblocks:** yes aligns `EnvironmentEffects.specificForce` and the fit equations; no requires an explicit propulsion-coupled body-force fiction acting on the sensor proof mass too, and revised sensor and estimator equations. **2G steps 3–4 / model owner / 3B** must use the same rule; **2D** shows the resulting command-versus-force evidence. Test radial, tangential and coast cases before field fitting.
- **Already decided / group:** P7 excludes gravity readings; it does not settle this fictional force. A4/P5 still require rule adoption from held-out evidence. **W** can settle this with Q02/Q04/Q05.

### Q02 — Should a well add attitude torque beyond the ordinary actuator torque?

- **Raised by:** [S5 question 4](../s5/README.md#work-and-decisions-to-carry-to-the-integrator), [well force definition](../s5/wells.md#recommendation).
- **Recommend:** no; apply the correction at the center of mass and retain nominal nozzle moments. This is S5's explicit fiction, not a consequence of radial reversal alone.
- **Answers / unblocks:** no gives **2G step 3 / 3B / model owner** a common force/torque interface. Yes requires a per-nozzle or distributed-force law, new attitude references and revised **2D** cues; yaw/pitch and roll-hold saturation must remain physical. Verify off-axis burns and unchanged coast attitude behavior.
- **Already decided / group:** A11 requires full 3D attitude; A8 holds player roll. Neither chooses field torque. **W** can settle this with Q01/Q04/Q05.

### Q03 — May separate completed observation attempts occur inside one continuously running encounter?

- **Raised by:** [S4 conflicts](../S4/README.md#conflicts-and-their-disposition), [S6 evidence lifecycle](../s6/README.md#consequential-choices-for-the-integrator), both [S4](../../handoffs/S4.md) and [S6](../../handoffs/s6.md) handoffs. This is a shared interface choice beyond their numbered lists.
- **Recommend:** yes, through an explicit independent experiment/attempt lifecycle: complete one acquisition, begin a distinct test with unique sample ownership, preserve the live world and clock, and forbid fitting on scored observations. Merely relabeling halves of one record is insufficient.
- **Answers / unblocks:** yes lets the integrator assign **resumed 2C / 3D** nonlethal train/test records, with **2G steps 4–5** reviewing interface compatibility at handoff; it does not add lifecycle implementation to 2G's conversion. **3B, 4B, 4D** can then use it. No retains the current attempt boundary and requires genuinely distinct later attempts or another approved independence scheme; do not claim same-run validated adoption. Manual learning can still succeed without adoption. **2D** needs completed/test record provenance.
- **Already decided / group:** A4 requires a distinct held-out attempt; the brief permits learning without death. **E** resolves the common S4/S6 boundary request; Q25 remains separate.

### Q04 — Should wells use the smooth spherical transition proposed by S5?

- **Raised by:** [S5 question 1 and reference numbers](../s5/README.md), [Hinge treatment in S4](../S4/README.md).
- **Recommend:** yes: initial inner/outer radii 40/50 km and a 1 km excluded core, subject to content tuning. **[DEMONSTRATED: S5 reference, reported]** the near-zero radial-response band is 534.350 m wide, about 5.3435 s at constant 100 m/s; it is a maneuver-timing problem, not time to learn a new screen.
- **Answers / unblocks:** yes supplies **3B / model owner / 4A** with the profile, event boundaries and Hinge lesson. A hard edge or other profile changes boundary timing and requires new vectors and Hinge content. **2D** displays measured influence uncertainty, never a hidden exact boundary.
- **Already decided / group:** brief §7 fixes radial propulsion reversal, unchanged tangential response and ordinary response outside; A11 fixes 3D. Profile/dimensions remain open. **W** can settle this with Q01/Q02/Q05.

### Q05 — Should the first authored wells overlap?

- **Raised by:** [S5 question 2](../s5/README.md#work-and-decisions-to-carry-to-the-integrator), [S4 field dependencies](../S4/README.md#dependency-order-and-alternatives).
- **Recommend:** no; separated influence volumes first, with S5's bounded blend reserved for a later scope choice.
- **Answers / unblocks:** no simplifies **3B / 4A / 4C** geometry and **3E** seed admission. Yes needs an explicit order-independent composition, independent overlap tests, distinguishable evidence and **model/2D** support; sequentially applying reversals is not the specified blend.
- **Already decided / group:** A13 requires wells at Braided Crossing, not intersecting wells. Stable laws under A10 remain mandatory. **W** can settle this with Q01/Q02/Q04.

### Q06 — Should lattice geometry be reconstructed from observations rather than supplied as noisy local patches?

- **Raised by:** [S5 question 5](../s5/README.md#work-and-decisions-to-carry-to-the-integrator), [S4 model and screens](../S4/README.md#model-and-screens).
- **Recommend:** observation/triangulation using existing camera, IMU, star tracker and powered processing. Direct noisy patches are S5's smaller alternative: stronger sensing fiction with less parallax/association investigation.
- **Answers / unblocks:** reconstruction gives **3C / model owner / 2D** acquisition intervals, covariance, lineage and coverage products, and supports **4B**'s Missing Room lesson. Patches reduce reconstruction work but still need uncertainty and unresolved coverage; low power cannot turn missing evidence into a safe hole. **3E** tests stale/occluded data and fresh-data gains.
- **Already decided / group:** brief §6 requires existing hardware and power-dependent reconstruction; P11 forbids truth-mesh revelation in either implementation. **L** can settle this with Q07.

### Q07 — Should exposure use the highest intensity across each component, with vulnerable parts split where necessary?

- **Raised by:** [S5 question 6](../s5/README.md#work-and-decisions-to-carry-to-the-integrator), [lattice specification](../s5/lattice.md).
- **Recommend:** yes, retaining the conservative baseline component rule and explicit vulnerable subcomponents. **[DEMONSTRATED: S5 reference, reported]** a displaced fixture has center-of-mass clearance +12 m while its radiator clearance is −2.5 m.
- **Answers / unblocks:** yes gives **3A/3C** exposure integrals and chronological trip/damage inputs from swept geometry; **2D** identifies the first threatened part. An area/volume-weighted alternative needs susceptibility weighting and new damage vectors; neither may dilute an exposed tip into the entire ship. **3E** must test intermediate deployment and fast crossings.
- **Already decided / group:** brief §6 and P13 already require whole-ship exposure, fictional dose units, cumulative component effects and no universal hit counter. **L** can settle this with Q06.

### Q08 — Should the original encounter questions share S4's twelve core volumes and hosted pockets?

- **Raised by:** [S4 question 1](../S4/README.md#questions-for-the-owner-one-decision-each), [S4 handoff](../../handoffs/S4.md).
- **Recommend:** yes, preserving all twenty original catalogue questions and stable IDs; optional gas/tether add two volumes, while the proposed tidal pocket shares its host. This allocates places, not new approved systems.
- **Answers / unblocks:** yes lets **3D / 4A–4C / 2D** author shared volume identity, continuous epochs, chart zoom and transitions. More separate volumes increases scene/transfer work; a different pocket allocation needs updated arrivals and continuity tests. Neither choice permits resets at pocket entry. Test both cross-transfer orders with actual surviving state.
- **Already decided / group:** A13 fixes topology and forward progress; A10 fixes the expedition structure across runs. **R:** independent of names Q09 and pacing Q10.

### Q09 — Should the proposed place names become the displayed region names?

- **Raised by:** [A13's explicit reservation](../../DECISIONS.md#approved), [S4's region catalogue](../../design/regions/) and [region proposal](../../handoffs/region-proposal/regions.md); additional to the numbered S4 questions.
- **Recommend:** adopt S4's names, retaining original catalogue IDs and existing code-folder mappings (for example Twin Deeps → `gravity-range`). Optional names do not approve their systems.
- **Answers / unblocks:** yes settles **3D / 2D / 4A–4D** chart and content labels; rename or defer keeps IDs stable while the integrator records replacements. No mass source-folder rename or topology change is needed, and this is not a physics blocker.
- **Already decided / group:** A13 uses names to identify the route but explicitly calls the names proposals. **R:** neither Q08 nor Q10 approves them implicitly.

### Q10 — Should first contact follow S4's shorter informed routes and longer exploratory routes?

- **Raised by:** [S4 question 2 and pacing](../S4/README.md), [S4 handoff](../../handoffs/S4.md).
- **Recommend:** yes: target 12–14 entries through Turning Rim on exploratory examples, allowing 9–10 on short informed routes. **[ASSUMED: S4 estimates]** exploratory contact takes 46–73 active minutes power-first or 52–84 sensing-first; practiced sensing-only takes 12.5–20.5. These are workload sums, not observed play times.
- **Answers / unblocks:** accept sets **4A–4D / 3E / later 5A** playtest targets. Reject means retuning meaningful workload/travel or proposing an explicit A13 revision to the owner; it does not license compulsory detours or visited-count gates. **2D** must support quick informed preparation without hiding real costs.
- **Already decided / group:** brief §9's 12–15 is a pacing intention, not a gate; A13's graph and optionality stand. **R:** independent of Q08/Q09.

## Optional systems: Borrowed Spin, gas and tides

### Q11 — Should Borrowed Spin receive a bounded prototype after the 3D conversion?

- **Raised by:** [S1 question 1](../../handoffs/s1.md#open-questions-and-uncertainty), [S2 conditional inclusion](../s2/README.md#questions-for-the-owner), [S3 question 1](../../handoffs/s3.md#open-questions-and-uncertainty), [S4 question 4](../S4/README.md#questions-for-the-owner-one-decision-each).
- **Recommend:** yes, conditional on reconciling the actual kit, loads and route benefit; retain direct Unseen Cathedral → Stillwater. **[DEMONSTRATED: S1 reference, reported]** +43.52 m/s along its chosen departure direction occurs at 143.97 kN peak; S2's working rating is only **[ASSUMED] 8 kN**. This is not a demonstrated compatible maneuver.
- **Answers / unblocks:** prototype assigns a **new tether implementation owner**, with **ship/model/2D/content/3E** support and Q12–Q19 review. Defer keeps the core route build moving and omits the maneuver; it loses a distinctive momentum-exchange investigation. Do not treat a successful catch or paper velocity change as net fuel savings.
- **Already decided / group:** A13 marks Borrowed Spin optional/unapproved. **B:** this single answer merges the repeated inclusion questions; defer parks Q12–Q19, yes approves none of their defaults.

### Q12 — Should the starting ship carry S2's proposed tether retrofit?

- **Raised by:** [S2 question 1 and hardware arithmetic](../s2/README.md), [S1 integration](../s1/integration.md).
- **Recommend:** conditionally yes, only after the load-feasibility gate: S2 proposes 255 kg, 500 m line, 3 kW winch and 4 kW friction-power brake with finite heat storage. **[DEMONSTRATED: S2 reference, reported]** ideal main-only delta-v falls 690.61 → 684.18 m/s with the kit.
- **Answers / unblocks:** accept lets the **ship owner / integrator / 3A** revise baseline mass, 3D mount/inertia, power/heat and inventory, and **2D** expose the hardware. Reject requires a separately specified pre-encounter installation/acquisition or defers the tether; no hardware may appear at encounter entry. Recompute with final 2G mass properties, not the studies' provisional tensors.
- **Already decided / group:** P14 approves approximately 30.4 t and one crew member, not this retrofit; no-refill state carry remains. **B:** parked if Q11 is deferred; distinct from approving a prototype.

### Q13 — Should one successful release consume the run's only tether cassette?

- **Raised by:** [S2 question 2](../s2/README.md#questions-for-the-owner), [hardware design](../s2/hardware.md).
- **Recommend:** yes: one cassette, recoverable misses, 40 kg of head/line/carrier departing on successful ship-side release **[ASSUMED: S2]**.
- **Answers / unblocks:** yes defines **ship/content/3D** inventory and recurrence plus **2D** remaining-use display. Reusable capture or multiple swings requires actual recovery/spare/reloading hardware, mass, time and energy; it cannot be an inventory reset. Verify released mass, momentum and downstream reserves.
- **Already decided / group:** A9/P8 reset physical inventory only on recurrence; P14 forbids between-encounter propellant refills. Neither sets cassette count. **B:** parked by Q11=defer; requires Q12's hardware plan.

### Q14 — Should capture require a compatible structural rail?

- **Raised by:** [S2 question 3](../s2/README.md#questions-for-the-owner), [S3 capture dependencies](../s3/README.md#s1s2-reconciliation).
- **Recommend:** yes, with observable geometry and load-path suitability.
- **Answers / unblocks:** yes bounds **tether/ship/content** capture mechanics and **model/2D** target evidence. Arbitrary-surface harpoons or nets add penetration/material or multi-contact wrapping physics, sensing and failure tests. A visible rail alone must not guarantee a safe latch or release.
- **Already decided / group:** P6 leaves capture execution with the player; P11 forbids hidden suitability as an omniscient cue. Hardware choice remains open. **B:** parked by Q11=defer; supplies Q15/Q16 geometry.

### Q15 — Should the first tether implementation exclude arbitrary wrapping and entanglement?

- **Raised by:** [S1 question 2](../../handoffs/s1.md#open-questions-and-uncertainty), [S2 question 4](../s2/README.md#questions-for-the-owner).
- **Recommend:** yes: validate a clear span first, allowing only explicitly modeled authored guides. S1 recommends that bounded first version; S2 asks for full flexible contact eventually, before content depends on it. They agree on sequencing, not on a claim that a massless span is the complete S2 kit.
- **Answers / unblocks:** bounded scope gives the **tether owner / model / content / 3E** a testable first milestone with reciprocal forces and declared limits. Full contact now requires finite-mass cable, wrapping, recoil/whip and swept collision; **2D** may show only supported sensed line geometry. The smaller version loses emergent wraps and cannot silently pass through unsupported contact.
- **Already decided / group:** P2/P11 require deterministic mechanics and honest forecasts, not a specific cable discretization. **B:** parked by Q11=defer; Q14 remains a separate capture choice.

### Q16 — Should the first tether maneuver include active payout and brake controls?

- **Raised by:** [S3 question 4](../../handoffs/s3.md#open-questions-and-uncertainty), [S2 load/control limits](../s2/README.md#what-the-numbers-support), [S1 controls](../s1/integration.md#controls-skill-and-the-tenth-run).
- **Recommend:** yes if the reconciled mechanism is controllable; retain S3's fixed-length/passive-damping fallback only if independently proven. S2 warns that removing essential braking is not an equivalent simplification. **[DEMONSTRATED: S2 reference, reported]** its locked 50 m line at 0.5 m/s reaches 12.37 kN, above the 8 kN working rating.
- **Answers / unblocks:** active control adds **ship/3A/model/2D** command limits, work, brake heat and live controls. Passive-only reduces operator/control work but needs redesigned loads and geometry, not reuse of an unsafe locked-line case. **3E** must prove both capture and useful departure within current roll-held authority.
- **Already decided / group:** A12 forbids pause; P6 forbids automatic release planning. **B:** parked by Q11=defer; conditioned on Q12/Q14/Q15, not resolved by them.

### Q17 — Should structure inertia vary between runs through fixed-mass internal configurations?

- **Raised by:** [S1 question 3](../../handoffs/s1.md#open-questions-and-uncertainty), [S3 question 3](../../handoffs/s3.md#open-questions-and-uncertainty), [S4 intrinsic-value conflict](../S4/README.md#conflicts-and-their-disposition).
- **Recommend:** keep inertia fixed initially, as S1/S4 recommend. S3 instead recommends explicitly approved, observable fixed-mass configurations; it accepts fixed inertia until approval. This is a real disagreement, not resolved merely by saying “randomize geometry.”
- **Answers / unblocks:** fixed values let **content / 3D / model / 3E** vary phase, orientation and approach only. Variable configurations require defined physical layouts, estimable response and calibration provenance; passive principal-axis pose tracks alone cannot identify absolute inertia **[DEMONSTRATED: S3 reference, reported]**. **2D** must expose uncertainty rather than hidden true inertia.
- **Already decided / group:** A10 fixes laws, massive-body masses/sizes and expedition structure; it does not explicitly approve this internal-configuration variation. **B:** parked by Q11=defer; never reroll mass or material law silently.

### Q18 — Should cable failure always destroy the ship?

- **Raised by:** [S1 question 4](../../handoffs/s1.md#open-questions-and-uncertainty), [S2 failures](../s2/hardware.md), [S3 abort requirement](../s3/encounter.md).
- **Recommend:** no; apply actual mount damage, line/release consequences and subsequent collisions, permitting a physically valid abort. This does not assume unresolved recoil is harmless.
- **Answers / unblocks:** consequence-based failure needs **tether/ship/game/3E** damage and detached-hardware tests, with **2D/Black Box** recording the first loss of margin. Automatic loss is a stronger authored failure rule requiring explicit approval and clear scope; S1's current unresolved cable-energy reservoir cannot justify it physically.
- **Already decided / group:** A9 decides what happens after ship loss, not whether every cable break constitutes loss. **B:** parked by Q11=defer; independent of X rim policy Q27.

### Q19 — Should tether mechanics be known equipment behavior with fitted parameters?

- **Raised by:** [S3 question 2](../../handoffs/s3.md#open-questions-and-uncertainty), [S2 modeling recommendation](../s2/README.md#questions-for-the-owner), [S1 model treatment](../s1/integration.md#model-and-observability).
- **Recommend:** yes. Ordinary installed mechanics is known; target inertia, spin, condition and line parameters require acquired evidence. The studies agree; this is not another fictional rule unlock.
- **Answers / unblocks:** known mechanics gives **2C after 2G / tether model / 2D** parameter fits and forecasts of player commands. An adopted-rule treatment requires a justified candidate/held-out lifecycle and extra discovery content. In either case, engine-off tether load is nongravitational specific force: exclude unsupported loaded arcs from gravity/engine fits and stop or branch unsupported forecasts.
- **Already decided / group:** A4/P5 distinguish fitted numbers from new rules; P6/P7/P11 already constrain planning, sensing and truth access. Classifying this new equipment is the remaining choice. **B:** parked by Q11=defer; Q03 applies if a new rule gate is chosen.

### Q20 — Should Countercurrent's gas loading and heating be built now?

- **Raised by:** [S4 question 5](../S4/README.md#questions-for-the-owner-one-decision-each), [original addition ranking](../../handoffs/region-proposal/README.md#review-requested-from-claude).
- **Recommend:** defer until core-route reserves are measured, then prototype only if net braking benefit survives diversion, RCS and thermal costs. The original proposal ranked Countercurrent first; S4's later recommendation prioritizes core-route evidence. Neither ranking is approved.
- **Answers / unblocks:** defer keeps **3A/3E/4C** on existing systems. Build assigns a **new gas owner** for density/flow, distributed drag/torque/heat, **model/2D** estimates and a paired route-cost test. No supplied S4 result demonstrates a useful gas-braking gain; small effects should not be exaggerated.
- **Already decided / group:** A13 explicitly leaves this addition open. Independent of **B/X** and Q21; one optional-system approval does not approve another.

### Q21 — Should Tidal Orchard proceed beyond a magnitude check?

- **Raised by:** [S4 question 6](../S4/README.md#questions-for-the-owner-one-decision-each), [region proposal](../../handoffs/region-proposal/regions.md#tidal-orchard).
- **Recommend:** fund the bounded magnitude/control check first; commit playable content only if distributed P4 gravity produces observable attitude effects on the actual ship, including roll hold. No study establishes that result for this encounter.
- **Answers / unblocks:** magnitude-first assigns a **physics/ship owner** a reference and **3E** an observability test before **content/model/2D** work. Full build now accepts uncertainty and adds distributed forces/torques plus sensing/fit support; defer omits the pocket. If the effect is too small or canceled by normal control, defer rather than multiply it artificially.
- **Already decided / group:** P4/A10 preserve the law and body constants; A8 holds roll. This is additional coupling, not permission to change them. Independent of Q20 and **B/X**.

## Endgame: paired openings and Earth

### Q22 — Should Petal Gallery and Passage use one shared paired-opening system?

- **Raised by:** [S4 question 3](../S4/README.md#questions-for-the-owner-one-decision-each), [S6 question 1](../s6/play-and-build.md#owner-decisions-one-at-a-time).
- **Recommend:** yes: one finite moving seam, tiny observation petals and a full-ship Passage. **[ASSUMED: S6]** 0.75 m petal radius and 6 m Passage radius are tuning candidates; the 12 m mechanics fixture is too generous to establish alignment difficulty. A single ship can straddle both domains.
- **Answers / unblocks:** shared X assigns an **X owner**, enabling **4B/4D**, with **ship/game/model/2D** interfaces and **3E** tests. Separate systems duplicate view/transfer logic and need consistency proof; defer explicitly blocks completion of the homeward route. Resolve feasibility early even though owner choices are grouped here at the end.
- **Already decided / group:** P15 leaves shared X open; A13/brief require the route's finite moving Passage, full surviving state and Earth payoff. **X:** yes merges S4/S6's question; no answer silently resolves Q23–Q28.

### Q23 — Should crossing windows end through changing alignment rather than literal closure?

- **Raised by:** [S6 question 2](../s6/play-and-build.md#owner-decisions-one-at-a-time), [S4's X boundary requirements](../S4/README.md#acceptance-required-before-implementation-claims).
- **Recommend:** persistent disks with recurring alignment/occlusion windows. Older literal-closure language adds occupied-aperture physics that is not provided by an animation.
- **Answers / unblocks:** geometric windows give **X/game/4D/model/2D** continuous mouth motion and observable future opportunities. Shrinking or disappearance needs an explicit moving-rim, squeezing/cutting and occupied-topology policy, new references and save/replay tests. In either case, missed opportunities must not reset phase when revisited or viewed.
- **Already decided / group:** brief §9 specifies a finite moving opening, not literal closure; A12 keeps encounter time live. **X:** parked if Q22 is deferred; Q27 handles contact consequences separately.

### Q24 — Should gravity pass through an empty opening from the far side?

- **Raised by:** [S6 question 3](../s6/play-and-build.md#owner-decisions-one-at-a-time), [S6 mechanics](../s6/mechanics.md).
- **Recommend:** no additional transmitted field; each occupied portion of the ship feels its local environment. Light passes through. This screening rule is additional **[FICTIONAL]** behavior, not a deduction from A3.
- **Answers / unblocks:** no bounds **X/ship/model** force and observation interfaces. Yes needs a defined transmitted gravity law, reciprocal accounting, independent vectors and **4B/4D/2D** evidence of the extra field; do not silently add an image mass. Both require coherent partial-crossing forces.
- **Already decided / group:** A3's distant sun is light-only for its stated approximation; P4 alone does not define gravity across a seam. **X:** parked by Q22=defer; independent of the local Earth law Q26.

### Q25 — Should observed material crossings be required to validate material-transfer forecasts?

- **Raised by:** [S6 question 4](../s6/play-and-build.md#owner-decisions-one-at-a-time), related [S4 record-lifecycle conflict](../S4/README.md#conflicts-and-their-disposition).
- **Recommend:** yes: tracked fragment transits, with separate optical and material support. Repeated views establish an optical correspondence, not velocity/force transfer for a ship.
- **Answers / unblocks:** yes gives **4B/4D** witness content and **model/Black Box/2D** distinct evidence/support displays. Optical-only inference is a stronger assumed material rule; label it as such and keep unsupported crossing forecasts uncertain. Q03 supplies independent completed tests; scored samples cannot also determine nuisance phase.
- **Already decided / group:** A2/A4/P11 require acquired evidence and held-out rule validation; early Earth visibility remains allowed. **X:** parked by Q22=defer. **E:** Q03 settles record boundaries, not this evidence requirement.

### Q26 — Should the far side of the homeward opening use Newtonian Earth gravity?

- **Raised by:** [S6 question 6](../s6/play-and-build.md#owner-decisions-one-at-a-time), [S4 Earth follow-up](../../handoffs/S4.md#open-questions-and-uncertainty).
- **Recommend:** yes, as an explicit Earth-domain choice. While straddling, apply each domain's law to the material actually there; disclose unsupported far-side assumptions until tracking supports them.
- **Answers / unblocks:** Newtonian Earth gives **X/ship/game/model/4D** domain-tagged dynamics and tests; continuing P4 changes Earth approach trajectories and the meaning of return. Either needs far-side observations, split forecast uncertainty and **2D** domain-aware displays, without precise ephemerides appearing from nowhere.
- **Already decided / group:** P4 governs the unfamiliar universe; A1's Newtonian GMAT checks validate a starting forecaster, not an approved Earth-transition rule. **X:** parked by Q22=defer; independent of empty-mouth gravity Q24 and payoff scope Q28.

### Q27 — Should confirmed load-bearing rim contact cause structural loss in the first version?

- **Raised by:** [S6 question 7](../s6/play-and-build.md#owner-decisions-one-at-a-time), [S6 contact limits](../../handoffs/s6.md#open-questions-and-uncertainty).
- **Recommend:** the conservative first policy: loaded impact or zero-speed squeezing causes loss; unloaded tangency is distinct and harmless. Recoverable glances are the richer alternative, with real component/contact mechanics.
- **Answers / unblocks:** conservative loss gives **X/ship/game/4D/3E** a defined contact outcome and **2D** failure evidence. Recovery requires damage, impulse/stress and surviving-control tests. **[DEMONSTRATED: S6 reference, reported]** its radiator clips at 13.5 s, after CoM crossing at 12 s; that reference stops at contact and does not demonstrate damage or survival.
- **Already decided / group:** A9/P8 define recurrence after loss; brief §9 requires whole-ship passage, not a center-point teleport. Neither fixes impact survivability. **X:** parked by Q22=defer; does not impose automatic tether-break death in Q18.

### Q28 — Should Earth end with a forgiving controlled approach and contact rather than compulsory landing?

- **Raised by:** [S4 question 7](../S4/README.md#questions-for-the-owner-one-decision-each), [S6 question 5](../s6/play-and-build.md#owner-decisions-one-at-a-time).
- **Recommend:** yes: recognizable Earth, measured approach and communications/contact with the real surviving ship, without an unannounced final obstacle course. The exact terminal success envelope remains content tuning.
- **Answers / unblocks:** approach/contact bounds **4D / 2D / 3E / 5A** content, observations and reserve tests. Landing or a larger Earth mission adds atmosphere/descent/other systems and must be separately scoped; a simpler visual arrival gives less final operation but still cannot repair/refill the ship. Expose far-side reserve needs during reconnaissance.
- **Already decided / group:** brief §9 and A13 establish Earth as payoff and preserve valid early sightings and surviving state; P15 leaves its operational scope open. **X:** Q22=defer parks implementation, not the owner direction. This one answer merges S4/S6's payoff question.

## Already decided — retain, do not re-ask

Each row is a resolved decision or in-use contract, with the action it already authorizes. Proposed P entries remain revisable through the integrator; they are not silently promoted to owner-approved A entries.

| Entry | Already decided, with authority | Studies affected and build consequence |
| --- | --- | --- |
| D01 — world and controls | **Already decided: A8/A11**, full 3D physics, yaw/pitch hands-on, roll held; P4/P2 retain shared gravity and deterministic replay. | [S4 roll audit](../S4/README.md#roll-audit), [S1](../s1/integration.md), [S5](../s5/README.md), [S6](../s6/README.md). **2G 3–5 / 2D / all content** test reachable attitudes; do not reintroduce planar limits or require free roll. |
| D02 — route and combined gate | **Already decided: A13**, both forward branches, optional cross-transfer, forward-rejoining detours and wells plus lattice at Braided Crossing. No required within-run revisits or visited flags. | [S4](../../handoffs/S4.md), [S5](../../handoffs/s5.md). **3D / 3B/3C / 4C / 3E** build physical geometry and test both branches; Q08–Q10 choose content treatment, not another vote on topology. |
| D03 — Twin Deeps exit and constants | **Already decided: A6/A10**, physical Beta slingshot through its belt; masses/sizes do not reroll. **In-use P16** supplies fixed scale values; S4 recommends fixed 4,000 km separation, not a new A10 prohibition on all orbital variation. | [S4 conflicts](../S4/README.md#conflicts-and-their-disposition). **2G step 5 / 2F / 3E** require a physical assist/belt witness on both onward routes. Generic speed/distance or Tidal Orchard detour cannot substitute; tuning is a versioned content change. |
| D04 — recurrence and reserves | **Already decided: A9/A10/A13 and in-use P8**, whole-run loss/Recall with retained records and new run geometry; **P14 owner items 1–2**, one crew member and one propellant load, no life-support consumable clock. | [S1](../../handoffs/s1.md), [S2](../../handoffs/s2.md), [S3](../../handoffs/s3.md), [S4](../../handoffs/S4.md), [S6](../../handoffs/s6.md). **2G step 5 / 3D / ship owner** carry damage/resources across regions; stale four-crew and same-encounter reset language is not new direction. |
| D05 — live encounters and safe transit | **Already decided: A12**, no encounter pause; safe indefinite preparation in open transit. Time runs; only inaccessible hidden-page hold is the default exception. | [S3 interaction](../s3/interaction.md), [S4 conflicts](../S4/README.md#conflicts-and-their-disposition), [S6](../../handoffs/s6.md). **2G ship/control / 3A / 3D / 2D** must demonstrate sustainable healthy coast without obligatory RCS drain; P04's endurance challenge is an entered encounter, not ordinary transit. |
| D06 — learning and model limits | **Already decided: A2/A4/A5; in-use P6/P7/P10/P11**, acquired data, player-adopted rules, held-out testing, no planner, no gravity accelerometer, frozen forecasts and truth/belief separation. Shared-law validated spans transfer per A5; body mass/local geometry still need measurement. | [S1–S3 model requests](../s3/model-addendum.md), [S4](../S4/README.md#model-and-screens), [S5](../s5/model-and-interface.md), [S6](../s6/play-and-build.md). **2G step 4 / 2C / 2D / 3E** preserve evidence and uncertainty; Q01/Q03/Q19/Q25 resolve new semantics, not whether honesty is optional. |
| D07 — signature-field essentials | **Already decided: brief §§6–7, A11/A13 and P13**, propulsion-only radial reversal with ordinary coast/tangent response; existing-hardware lattice reconstruction; whole-ship exposure, cumulative electrical effects, no universal hit counter. | [S5](../s5/README.md), [S4](../S4/README.md). **3A/3B/3C / model / 2D** build those essentials; Q01/Q02/Q04–Q07 select the remaining implementations. |
| D08 — homeward direction | **Already decided: brief §9 and A13**, finite moving Passage, surviving ship carried through, Earth payoff and no suppression of physically valid earlier Earth views. **P15** explicitly leaves shared X/Earth details open. | [S4](../../handoffs/S4.md), [S6](../../handoffs/s6.md). **4B/4D / X / model / 2D** honor these constraints; Q22–Q28 do not reopen whether the ship returns home. |

## Conflicts and what resolves them

These are reconciliation work, not additional duplicate questions. A proposal is not a contradiction merely because it fills an unspecified detail.

| Conflict | Settling fact or remaining question; next action |
| --- | --- |
| Well accelerometer: S5 says transformed force; old estimator §13.3 recommends an invisible correction | **Q01**, then change sensor and fit semantics together. Current [truth ship contract](../../../src/contracts/truth/ship.ts) defines nongravitational `specificForce`; it is an implementation baseline, not owner approval of new fiction. |
| “No free-energy exploits” in Phase 3 could be read as forbidding well field work | [S5 well ledger](../s5/wells.md) accounts for added/removed mechanical work under the fictional response. **D07/Q02/Q04** preserve ordinary propellant cost; no field-work credit becomes fuel, charge or heat automatically. Integrator clarifies the prompt, rather than silently changing the law. |
| S1 successful swing versus S2 hardware limits | S1 uses 200 m, 143.97 kN peak and a 200 kN failure limit; S2 proposes 500 m, 6 kN nominal/8 kN working. **Q11/Q12/Q16 require an engineering feasibility gate**, not a vote declaring the numbers compatible: redesign trajectory/load or hardware, recompute capture/heat/control/route benefit. |
| S1 massless span and unresolved recoil versus S2 material mass and release hardware | **Q15** bounds the first model; [S1](../s1/tether.md) omits cable/hardware mass while [S2](../s2/README.md) budgets real inventory. Preserve a consistent material/energy/momentum ledger before adopting either fixture as a production test. A guide-path reference is not arbitrary wrapping. |
| S3 fixed/passive first slice versus S2 essential braking | **Q16** chooses the control scope after a compliant-load check. S2's 12.37 kN locked-line example fails its working limit; S3's fallback is conditional, not validated. |
| S1 integer-tick commands versus S3's possible sub-tick capture/release requirement | Mechanical substeps alone do not increase command timing resolution. The assigned tether/game/model owners must agree truth/model/replay command quantization and event ordering, then check actual S2 latency and sensor cadence. Widen feasible windows or explicitly implement timestamped sub-tick commands; this is an engineering seam under **Q11/Q16**, not another owner vote. |
| S1/S4 fixed inertia versus S3 variable internal configurations | **Q17**; A10 does not authorize hidden mass or law rerolls. Fixed inertia is the recommended initial resolution; variable configurations need explicit approval and observability. |
| S3 says S1/S2 have no committed outputs | [S3 dependency snapshot](../s3/README.md#s1s2-reconciliation) describes 16:21/16:26 PST on its old base. S1/S2 artifacts exist in this snapshot. Integrator asks S3/tether implementers to reconcile their actual values; stale placeholders cannot certify feasibility. |
| Study ship tensors, planar kit positions and four-crew bookkeeping versus completed 3D ship | **D01/D04** win. Recompute accepted hardware/clearance from final **2G step 3** geometry, inertia and one-crew baseline; neither S1 nor S2's scaffold overrides it. S2 also reports a 0.0198 rad/s fixed-point example against inherited 0.01 rad/s control/tracking limits: verify actual authority instead of increasing it silently. |
| Old proposal varies Twin Deeps mass ratio/separation; generic depart objective bypasses Beta | **D03** fixes mass/size and physical A6 exit. S4 fixes separation for its candidate; any later orbital-scale tuning requires admissibility checks. Do not interpret S4's choice as already approved universality. |
| Old planar/branch-loop/Recall review text versus A8–A13 | **D01–D05** settle it. Refresh [Phase 3/4 prompts](../../build-plan/README.md) and encounter template; “send back out” cannot impose a required within-run revisit. P15's old Recall-review remark is overtaken by A13's explicit whole-run Recall. |
| Braided Crossing's two-lesson requirement versus finite-field exterior bypass | **D02** gives the intent, not permission for invisible walls. **3E** searches ballistic, exterior and burn-through routes with real reserves; accept physically valid outcomes and revise proposed geometry if the intended gate fails. S5's finite bypass and S4's intended unaffordable combined bypass must be reconciled by cost evidence. |
| Brief's 12–15-contact intention versus A13 short paths | **Q10** reconciles 9/10-entry short and 12/14-entry exploratory routes; no encounter-count lock. S4's minute estimates do not establish flight feasibility. |
| A12 safe preparation versus fuel-cell reactants, attitude hold and calibration aging | **D05**, not a new countdown choice. **2G/3A/3E** prove illuminated low-load steady power/thermal behavior and no required propellant consumption. Report a concrete hardware shortfall if impossible; belief aging alone must not become an automatic death clock. |
| Sunward slabs / Red Wall external heating versus supported illumination | A3 supplies the common sun and massive-body shadows; [S4](../S4/README.md#conflicts-and-their-disposition) recommends body-limb illumination and internal load/thermal inertia first. Mesh occlusion or radiating-wall heating needs separately assigned physics/model scope before **4A/4C** content depends on it; illustration is not implementation. |
| Nonlethal local adoption versus distinct AttemptIds | **Q03** resolves the lifecycle shared by S4/S6. Keep independent tests and unique samples; splitting an archive cannot manufacture independent evidence. |
| Continuous worlds versus local-zero clocks, repeated-transit comments and archived coordinates | **D02/D04/D06** require **3D/2C** run/volume identity, a continuous epoch, actual `TransitRecord`, original briefing and explicit archive alignment. Turning Rim/Passage share one pair epoch; do not reset mouth phase or swap old geometry into live truth. |
| S4's “unobserved objects absent from render” versus S6's visible far sky | Distinguish physical-window light from measured holographic knowledge under **D06/D08**. **Game** produces a view-dependent optical image; **2D/model** receive no remote truth scene graph. A visible Earth may precede a recorded or validated Earth track. |
| Older literal closure/wide Petals versus S6 persistent tiny petals | **Q22/Q23**, not settled by A13. Keep optical/material evidence separate (**Q25**) and full-ship transit; a camera-facing interval is not a usable hull-crossing window. |
| P4 everywhere in earlier wording versus Newtonian Earth recommendation | **Q26** explicitly chooses the far domain; **Q24** separately defines empty-seam gravity. Neither A1 nor A3 settles these. |
| Original Countercurrent-first ranking versus S4 core-first order | **Q20/Q21/Q11** keep optional systems independent. A13 labels build order and additions proposals; the owner can prioritize after the stated feasibility checks. |
| S4's illustrative new-system budgets versus specialist studies | Use [S1 integration](../s1/integration.md), [S2 integration](../s2/sensing-and-integration.md), [S3 implementation](../s3/implementation.md), [S5 interfaces](../s5/model-and-interface.md), [S6 scope](../s6/play-and-build.md) to scope assigned work. Their overlapping contracts/model/screens estimates must not be summed as a promised total. |

## Build consequences and evidence required

All work below is a request to its owning thread, not an S11 code change. Use the exact module/contract lists in the linked study plans. Rough line counts are **[ASSUMED]**, not deadlines or additive estimates.

| Work package | Touches / approximate scope | Gate before calling it built |
| --- | --- | --- |
| 2G seams and run frame | Q01–Q03 plus D01/D03–D06: ship specific force/torque, model equations, `AttemptStart`/record identity, `TransitRecord`, `src/game/expedition/`, recurrence/save and `data/ship-baseline.json`. [S4](../S4/README.md#what-building-it-takes) estimates run/frame 1,500–2,500 production + 800–1,400 test lines, outside the existing 2G conversion. Coordinate interfaces during 2G; implement new field/run-lifecycle work only under assigned follow-up scope. | Keep 2G's independent vectors/GMAT, physical Beta exit and conversion checks. Assigned follow-ups prove same-run record independence without resets/duplicate data, continuous expedition state and sustainable preparation; these are not extra 2G completion gates. Interfaces can be designed before optional systems are approved. |
| Wells and lattice | Q01/Q02/Q04–Q07: `src/sim/fields/`, `src/model/` response/coverage, shared field/measurement/forecast contracts, ship sensors/condition, encounter content and 2D field/console views. [S5](../s5/model-and-interface.md): 3,650–6,500 changed/new lines including tests. | Independent field vectors; body-frame sensed force and torque agreement; whole-hull deployment sweeps; chronological exposure/trips/damage; acquired-only geometry; informed and blind runs, finite bypass and carried-knowledge challenge. |
| Route content | Q08–Q10: chart/region data, shared volumes, arrivals, A13 transfers; current/archive screens. [S4](../S4/README.md#what-building-it-takes): reuse content 2,000–4,000 production + 1,000–2,000 tests, excluding W/L/X. | Both branch orders/cross-transfers, continuous ship/resources and old-versus-current observations. Full-route main/RCS/energy/thermal ledgers replace provisional 10% reserve and stage allocations; no artificial resource taxes. |
| Borrowed Spin | Q11–Q19: coupled `src/sim/tether/`, ship kit/baseline/thermal/inventory, commands/load observations, belief-only event forecasts, Black Box and live 2D controls. S1 2,230–3,850 production; S2 2,350–4,100; S3 3,650–6,350, each with additional tests and overlapping integration work. | First reconcile loads/mass/control; then conservation, deterministic substep events, sensed loaded arcs, independent model support, actual full-ship/line clearance and direct-versus-tether route cost. S3's 10 m/s useful-saving target is proposed, not achieved. |
| Gas / tides | Q20/Q21: new distributed load/heat or gravity-torque coupling, observations, model support, content and 2D evidence. [S4](../S4/README.md#what-building-it-takes): gas 700–1,400 + 500–900 tests; tides 400–800 + 400–700 tests. | Magnitude/observability and net resource benefit at actual scale before playable content. Assign an owner explicitly; no silent expansion of 4C's reuse-only scope. |
| X / Earth | Q22–Q28: domain/mouth/frame and optical-image contracts, finite ship mass primitives, partial-crossing mechanics, game observation bridge, split forecasts, save/replay and 4B/4D/2D content/views. [S6](../s6/play-and-build.md#build-scope-and-interfaces-requested): 3,150–5,700 production + 1,200–2,000 test/harness lines, plus assets. | Independent moving-frame/all-near/all-far checks; rotating/deploying swept hull, trailing-part contact, local forces counted once, partial save/replay, P11 optical boundary, held-out material evidence, usable flight windows and surviving-state Earth reserves. Reference fixtures alone do not pass these gates. |

The ambitious version retains the twenty original questions, coherent W/L/X and all three optional additions. The smaller recommendation preserves the approved route and full-ship homeward problem, uses bounded field/tether geometry, and defers unproved gas/tidal/tether content. What it loses is optional mechanics, emergent rope contact and some scene differentiation; it must not silently drop an A13 branch or substitute center-of-mass teleportation. Scope remains the owner's decision.

## Source-question coverage

**[ESTABLISHED: the six linked question lists]** The lists contain 32 numbered owner questions. This mapping covers each once; duplicated prompts point to the same Q ID. Supporting questions in prose are handled in the cited entries, decided register or conflict register.

| Original list | Original question → consolidated entry |
| --- | --- |
| [S1 handoff](../../handoffs/s1.md#open-questions-and-uncertainty) / [integration](../s1/integration.md) | 1 proceed → Q11; 2 entanglement → Q15; 3 inertia → Q17; 4 break fatality → Q18 |
| [S2 README](../s2/README.md#questions-for-the-owner) / [handoff](../../handoffs/s2.md) | 1 starting kit → Q12 (conditional inclusion also Q11); 2 cassette → Q13; 3 rails → Q14; 4 simulation depth → Q15 |
| [S3 handoff](../../handoffs/s3.md#open-questions-and-uncertainty) / [README](../s3/README.md) | 1 include → Q11; 2 known mechanics → Q19; 3 inertia → Q17; 4 active control → Q16 |
| [S4 README](../S4/README.md#questions-for-the-owner-one-decision-each) / [handoff](../../handoffs/S4.md) | 1 volumes → Q08; 2 pacing → Q10; 3 shared X → Q22; 4 tether → Q11; 5 gas → Q20; 6 tides → Q21; 7 Earth → Q28 |
| [S5 README](../s5/README.md#work-and-decisions-to-carry-to-the-integrator) / [handoff](../../handoffs/s5.md) | 1 annulus → Q04; 2 overlaps → Q05; 3 accelerometer → Q01; 4 torque → Q02; 5 reconstruction → Q06; 6 exposure → Q07 |
| [S6 decisions](../s6/play-and-build.md#owner-decisions-one-at-a-time) / [README](../s6/README.md) / [handoff](../../handoffs/s6.md) | 1 shared X → Q22; 2 window end → Q23; 3 gravity shortcut → Q24; 4 evidence → Q25; 5 Earth payoff → Q28; 6 Earth law → Q26; 7 rim recovery → Q27 |
| Additional explicit choices | S4/S6 independent record lifecycle → Q03; A13/S4 proposed display names → Q09 |

S1 has no `docs/studies/s1/README.md` in the input snapshot; its [tether study](../s1/tether.md), [integration plan](../s1/integration.md) and handoff are the entry points. No missing README was fabricated. S11 changes neither these studies nor `docs/DECISIONS.md`.
