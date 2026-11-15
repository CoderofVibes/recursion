# Power balance and an actionable loss

## Keep the hardware; make its limits consequential

[ASSUMED: recommendation] Retain the present fuel cells, batteries, array area/efficiency and fixed crew-service loads. The encounter does not need an arbitrary larger life-support load or smaller hidden tank. Retain one distant sun at **600 W/m²**, azimuth 200°, elevation 12°. The player's usable solar output must come from measurements, deployment, pointing and actual body shadows. Unknown irradiance remains unknown to the model; truth-side illumination must still generate real energy.

[ESTABLISHED: NASA S01] Solar generation, energy storage and distribution are ordinary spacecraft power mechanisms ([NASA power reference](https://www.nasa.gov/smallsat-institute/sst-soa/power-subsystems/)). The ratings below are the project's assumed hardware, not NASA-qualified values. Radiation faults can be recoverable or destructive in real electronics ([NASA R04](https://ntrs.nasa.gov/citations/20210024100)); the cloud's selective harm and deterministic lattice units are fictional.

| Existing baseline value | Energy or capability |
| --- | --- |
| H₂ 6 kg, O₂ 48 kg; product-water capacity 54 kg | 6 × 142 MJ/kg × 0.5 = **426 MJ = 118.333 kWh** net electrical output; 54 kg water retained |
| Two 6 kW fuel-cell stacks | 12 kW total nameplate; shared reactants, separate buses; ramp 1,000 W/s per stack |
| Two batteries, 36 MJ each, initially 28.8 MJ each | 20 kWh capacity, **16 kWh initially stored**, **15.2 kWh deliverable** at 95% discharge efficiency |
| Battery power/efficiency | 4 kW discharge / 2 kW charge per pack; 95% each way; 7.2 MJ protected reserve per pack for essential loads |
| Two 40 m² arrays, 22% efficiency | **5,280 W per wing** normal to 600 W/m²; 12 kW ceiling per wing is not reached |
| Full 30° / 45° pointing error | 4,572.6 / **3,733.5 W per wing**, before condition or shadow derating |
| Solar deployment | 30 s, 100 W per motor; retain deployed radiators (`allDeployed`) |
| Essential converter | 95%; one rated dual-fed essential bus, not doubled capacity; main tie normally open |

[DEMONSTRATED: `baseline_loads`, `vectors.json.power_fixture`] At arrival modes, encounter recorder rate 0.05 Hz still draws the minimum 15 W. End-use essential-bus loads sum to **2,625 W**:

- Air 1,800 W; active internal/external pumps 120+180 W; active flight CPU 120 W.
- Standby air/pumps/CPU 80+5+5+20 W; two IMUs 30 W; two star trackers 40 W.
- Heat-exchanger controls 20 W; ready main engine 30 W; four ready RCS pods 60 W.
- Black Box minimum 15 W; console 100 W.

The essential source feed is 2,625/0.95 = **2,763.158 W**. Each PDU adds 30 W; the payload side carries camera tracking 120 W, idle science 40 W and communications listening 20 W. Total source demand is **3,003.158 W**. With essentials on A, bus A needs **2,793.158 W**, B **210 W**. The reference permits the isolated essential feed to switch sides; it does not pool batteries through a nonexistent tie. All individual loads and buses are exported in the vectors.

The static fuel-only endurance is **39.403 h**. 2G observed approximately 41 h under its actual evolving ship/modes; these are different experiments, not a contradiction or a claimed reproduction of that full-system time.

## Concrete operating schedules

[ASSUMED] These schedules are authoring envelopes a player can enact, not an automatic model planner. Keep the camera tracking, science processor idle, comms listening and recorder at 0.05 Hz; higher allocations must be budgeted separately. Select attitude hold deliberately when pointing for solar; A18's rate-null release does not choose it for the player. Turns, camera looks and translations must fit the off-sun windows; the camera's own steering does not rotate the array normal.

| Schedule | Pointing during charging coasts | Conservatively count zero generation | Extra essential load charged throughout |
| --- | --- | --- | --- |
| Planned informed | Within 30° of measured sun | 0–2 h and 20–26 h, including deployment, main burn, lift, turns and concentrated observations | 150 W |
| Manual informed | Within 45° of measured sun | Same windows plus 40–48 h for additional manual operation | 300 W |
| Ignored power | Stowed, or deployed edge-on/back to sun | Entire flight | No extra load; gives neglect the more favorable budget |

The nominal thread takes **67.433 h**. Planned operation receives at least 59.433 h of illuminated pointing; manual operation 51.433 h, before explicitly sampled eclipses. These are generous operating reserves rather than a requirement to maintain a perfect attitude for days. Only the reference fixture's nominal orientation has zero body-shadow time. The four sun-relative orientations in the seed check include up to 46 minutes of eclipse; none exhausts power.

[DEMONSTRATED: `power.json`] The reference separately dispatches both buses, fuel, charge and discharge; includes converter losses, charge/discharge efficiency and curtailment; assumes healthy batteries at 295 K. It conservatively retains its scheduled loads instead of reproducing production's full per-equipment optional-load shedding. Its late shortage comparator subtracts a 450 W optional-service envelope before testing a 5% critical deficit. Consequently its death timestamp is a **defined reduced-fixture target**, not an exact prediction of the evolving production ship. Port the fixture as such; separately validate the actual loss policy on the real ship.

| At exit, unless already lost | Stowed / edge-on | Planned | Manual |
| --- | ---: | ---: | ---: |
| Requested source energy, kWh | 133.666 through loss | 213.162 | 223.809 |
| Fuel-cell output, kWh | 118.333 | 25.290 | 53.105 |
| Useful solar output including charging, kWh | 0 | 192.082 | 174.915 |
| Available solar before curtailment, kWh | 0 | 543.531 | 384.055 |
| Battery delivered, kWh | 15.200 | 0 | 0 |
| Charge input, kWh | 0 | 4.211 | 4.211 |
| Remaining H₂ / O₂, kg | 0 / 0 | 4.718 / 37.741 | 3.307 / 26.459 |
| Remaining stored battery energy, kWh | 0 | 20 | 20 |
| Further dark endurance at this schedule | 0 | **35.445 h** | **25.378 h** |

The loss row includes 0.132 kWh requested but unmet before the 120 s loss timer completes; that energy was **not delivered**. Source demand already includes converter loss: do not add it a second time. The electrical ledger is `solar_used + fuel + battery_out = requested_load + charge_input − unmet`. Battery storage separately obeys `ΔE = 0.95 charge_input − battery_out/0.95`. Checked residuals are below 0.01 J. Fuel energy converts reactants to retained water, with equal fuel-cell waste heat at the assumed 50% efficiency; thermal consequences belong to the coupled production check.

[DEMONSTRATED: calculated margins] The manual essential source plus PDU needs **3,108.947 W**, against **3,733.524 W** from its wing at 45°: **624.576 W** steady margin on the heavily loaded isolated side. A second bright wing does not conceal a deficient first side. Pointing, condition, deployment and shadow must all be checked. One failed wing/bus, arbitrarily high science load, depleted incoming tanks or out-of-temperature batteries are not covered by this healthy-ship certificate.

Arrays stowed or edge-on lose fuel at **141,870 s (39.408 h)** and reach the fixture's final loss at **160,230 s (44.508 h)**. Correctly pointed arrays do **not** run out during the encounter; after the last off-sun window each bus is sustainable under the declared load, so no finite exhaustion time exists under indefinitely unchanged healthy illumination. Give the finite contingency reserve above instead of inventing a depletion time. A further dark interval of that length exhausts the residual energy budget, subject to dispatch and protection details.

There is also a stronger conservative check independent of optional shedding: even granting all 118.333+15.2 kWh to just the indispensable **2,235 W** active air/cooling/CPU/one-IMU chain, ignoring every other demand, the 95% converter limits a fully dark run to **56.792 h including 120 s grace**. Every adapted catalogue route exits after 65.133 h. Thus turning optional equipment off cannot make these fully dark routes complete. This bound is not a universal claim about every possible faster multi-burn departure.

## Warning and loss rule for 2F

[ASSUMED: proposed A18 implementation] Judge **unserved critical electrical function**, not an empty hydrogen gauge or a low battery alone. Empty fuel cells with healthy solar generation must not kill the ship. Identify the active air train, cooling path and flight-control chain after healthy spare substitution and protection; if required delivery stays below 95% for **120 continuous ship seconds**, record `power-loss` and follow the existing loss/recurrence sequence. Recovery resets the continuity timer; reload does not. This is a game loss policy for sustained loss of essential service, **not a physiological claim that the crew dies in two minutes**. It adds no oxygen/food clock (P14). Chronological radiation destruction of both PDUs can trigger the same service failure earlier.

[ASSUMED] Give three distinct indications:

1. Persistent measured `generation − load`, bus-specific supply, battery charge, reactants and estimated dark endurance. Do not display truth sun direction or a secret cloud forecast.
2. A **caution** when measured no-generation endurance crosses **4 h**, or when a supported forecast first shows inadequate energy before exit. At the nominal neglected-load fixture the threshold is 145,680 s, **4.042 h before loss**. Mark uncertainty and use an advisory when the route horizon is insufficient to calculate arrival reserves. A fuel-source exhaustion event is separately visible.
3. A **warning** when critical delivery first fails, naming the failed function and showing the 120 s continuity countdown. Log shedding, current supply and prior commands so Black Box explains the cause. A new caution/warning drops warp to 1×; no repeated alert should trap the player at 1× after acknowledgement.

An intact bus and battery leave time to deploy and turn after the endurance caution: 30 s deployment plus the existing approximately 420 s half-turn fits comfortably inside four hours. A power-dead ship cannot conjure actuator power during the final countdown. Recovery tests must start from the caution, not assume dead motors can deploy panels.

## Ownership of values

| Ship baseline / 3A | Encounter content / 2F | Game-wide policy / integrator + 2F |
| --- | --- | --- |
| Keep existing array area, efficiency and normal; fuel/reactant ratings; battery capacity, efficiencies and limits; loads; converter losses; deployment times; protection and radiation profiles | 600 W/m² and fixed sun direction; cloud geometry/intensity; 830 km authoring targets; accepted arrivals/layouts; sensor/recorder starting modes; schedules and route certificates | Power-loss reason; active-function substitution; continuous brownout timer; telemetry-based warnings and persistence; A12 warp drop; content/save version |

No encounter-specific hidden discount to life support, no per-encounter fuel refill, no battery reset, and no automatic solar-pointing assistance are proposed. Long preparation in open transit remains sustainable with the measured sun and a healthy illuminated configuration; it is not a new universal countdown. The finite-thrust and manual allowances support feasibility; the actual hands-on/plan command tapes, attitude fuel and long-run thermal state remain required integration checks.
