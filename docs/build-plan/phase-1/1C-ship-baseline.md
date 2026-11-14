# 1C — Ship engineering baseline

**Thread:** GPT/Codex · **Branch:** `p1/1c-ship-baseline` · **Phase:** 1 (parallel)

## Context
Recursion is a browser-based spacecraft engineering roguelike for NASA Space Apps 2026. The player operates a crewed spacecraft returning from Mars, stranded in an unfamiliar universe, from an onboard mission-control station. Engineering must matter everywhere: power, heat, propulsion, mass distribution, sensing, equipment condition, all interacting through shared ship state. Read first:
- `docs/CREATIVE_BRIEF.md`, especially §4 (engineering belongs everywhere), §6 (lattice causes electrical damage), §9 (no automatic repair or refill).
- `docs/DECISIONS.md`, especially P1 (planar flight), P7 (measurement realism), P12 (data as a resource).
- `docs/build-plan/README.md` § Conventions.
- `References/BIBLIOGRAPHY.md` and the texts under `References/local-copies/text/` (local only; use public links if absent). Most relevant: S01 power, S02 thermal, S03 propulsion, S04 GNC, S05/S05P/DD02 life support, S06 GSFC handbook, S08 NEXT ion, S09–S11 ISS thermal, S15/DD09 Voyager thruster swaps, S16 onboard systems, S17 modular power standard, S20 avionics, S21 structures, S22 comms, S24 mass distribution, DD05/DD07 optical navigation, DD10 N-version software, R04/R05 radiation effects on electronics.

## Goal
A coherent, source-grounded equipment baseline for the ship, tuned for play, where every value is labelled and every gameplay coupling has a real mechanism behind it. The brief leaves hardware ratings and inventories unsettled; this is a **proposal** for the owner.

## You own
`docs/engineering/`, `data/ship-baseline.json`.

## Scope
1. **Ship concept:** crew size, total mass, layout in the body frame (planar: x forward, y left), and a footprint polygon for each configuration (e.g. radiators stowed vs deployed).
2. **Equipment inventory.** For each item: id, subsystem, mass, body-frame position, power draw per mode, heat output, operating temperature limits, data rate, redundancy, failure and protection behaviour.
3. **Electrical:** generation (propose options; note that the unfamiliar universe's illumination is unknown, which makes solar output an open question worth flagging), storage, buses, distribution, protection (breakers or remote power controllers), load priorities and shedding. Life support is a load that can't be shed.
4. **Thermal:** heat sources, pumped loops, heat exchangers (note the S10 freezing case), radiators with deployment and pointing (S11), heaters, thermal mass and time constants.
5. **Propulsion:** main engine, RCS, optionally electric propulsion (S08) as a power-hungry coupling; propellant masses, specific impulse, thrust, minimum impulse bit, misalignment, thruster redundancy and swaps (S15/DD09).
6. **Mass properties:** centre-of-mass travel as propellant drains and configuration changes; inertia; consequences for thrust alignment and attitude control.
7. **Sensing and processing:** star trackers, IMU (accelerometers sense thrust only, P7), optical navigation camera (DD05/DD07: accuracy vs power, range, pointing, exposure), processing, Black Box recorder (sample rate vs power vs storage), comms (S07/S22).
8. **Radiation effects (for the lattice, brief §6):** map glancing vs severe exposure onto real effect classes (cumulative dose, single-event upsets, latch-up and its current-limit protection, burnout) per R04/R05, so damage accumulates per component rather than as a hit counter.
9. **Gameplay couplings:** a list of cross-system interactions worth building (e.g. sensor power ↔ tracking quality ↔ forecast confidence; radiator deployment ↔ footprint/clearance ↔ cooling; electric propulsion ↔ power ↔ heat), each with its physical mechanism and source.

## Deliverables
1. `docs/engineering/ship-baseline.md`: rationale, tables, labels (`[ESTABLISHED: ID]`, `[ASSUMED]`, `[FICTIONAL]`). Where a value is tuned for play, give both the realistic value and the game value with a reason.
2. `docs/engineering/gameplay-couplings.md`: the couplings list, ranked by gameplay value and build cost.
3. `data/ship-baseline.json`: the same numbers, machine-readable. Suggested shape:
   ```json
   { "version": 1, "units": "SI",
     "ship": { "dryMass": 0, "crew": 0, "footprints": { "stowed": [[0,0]], "deployed": [[0,0]] } },
     "equipment": [ { "id": "", "subsystem": "", "mass": 0, "position": [0,0],
                      "modes": { "off": { "power": 0, "heat": 0 } },
                      "limits": { "tempMin": 0, "tempMax": 0 },
                      "label": "ASSUMED", "source": "" } ],
     "propellant": [], "buses": [], "thermalLoops": [] }
   ```

## Done when
Every number has a label and, where established, a source ID; the JSON validates against the doc; the couplings list gives Phase 2 and 3 clear targets.

## Out of scope
Code under `src/`. Encounter design. Don't copy long passages from sources; summarize and cite.

## Handoff
Write `docs/handoffs/1C.md` from `docs/handoffs/TEMPLATE.md`.
