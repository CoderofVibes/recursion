# S1 source notes: tether materials and momentum exchange

Read with [the derivation](tether.md). Retrieved 2026-11-14 Pacific. These are engineering comparisons, not a procurement specification or a spaceflight qualification. The source IDs below are local to S1; the integrator may add them to the project bibliography.

## Materials

**[ESTABLISHED: S1-M1]** TOYOBO's ZYLON technical information (2005), §1, reports the following **fiber** properties. HM is the high-modulus grade; AS is as-spun. §§4, 6 and 9.2 describe creep, light degradation and knot/loop losses. The tested HM knot and loop strengths are respectively 26% and 34% of ordinary tensile strength; exposed fibers need protection from visible light as well as ultraviolet. These are not finished-rope allowables. [TOYOBO technical information, printed pp. 2, 4, 11, 15](https://www.toyobo-global.com/seihin/kc/pbo/zylon-p/bussei-p/technical.pdf).

| Fiber | Tensile strength | Axial modulus | Density | Break elongation |
|---|---:|---:|---:|---:|
| ZYLON AS | 5.8 GPa | 180 GPa | 1,540 kg/m³ | 3.5% |
| ZYLON HM | 5.8 GPa | 270 GPa | 1,560 kg/m³ | 2.5% |

**[ESTABLISHED: S1-M2]** A useful real **rope**, rather than fiber, comparison is Marlow D12 MAX 78: its manufacturer guide lists 15 mm at 26.4 tonne-force break load and 13.4 kg/100 m, and 17 mm at 32.9 tonne-force and 18.4 kg/100 m. It is a pre-stretched, coated, 12-strand Dyneema SK78 construction. [Marlow, Definitive Rope Guide, issue 8, D12 MAX table](https://marlowropes.com/wp-content/uploads/2022/02/Leisure-Marine-Definitive-Rope-Guide-Issue-8.pdf). The values were available in the publisher's indexed table; direct PDF opening exceeded the browser parser's size limit. No PDF copy was saved.

**[ESTABLISHED: S1-M3]** Avient identifies load, time, temperature and fiber grade as creep variables. Its indicative comparison at 200 kN sustained tension, 20°C and 1,000 kN rope break strength uses a 650 g/m core; SK78 is listed at 0.9%/year and a 15-year creep lifetime, while DM20 performs better. These specific conditions cannot be extrapolated into a vacuum lifetime or an abandoned structure's remaining strength. [Avient CIS YA104, issued 2024-04-02](https://assets.ctfassets.net/q6qgec8ud5tq/2GdmBkj3dwBbrFJRH3Sj1z/2ad326470020741cf8000f07771cb92a/CIS_YA104_-_Creep_Resistance_of_Dyneema%C3%82_fiber.pdf).

**[ESTABLISHED: S1-M4]** A second rope manufacturer describes SK78 as resistant to UV, but lists a maximum working temperature of 60–65°C despite a melting range of 144–152°C. A melting point is therefore a poor operational limit. [Dynamica SK78 technical information](https://dynamica-ropes.com/products/sk78/).

### A transparent sizing exercise at 200 kN

**[ASSUMED]** Use 200 kN as an illustrative system failure/fuse threshold, not a manufacturer's working-load rating. Aim for at least twice that load in the retained rope after the chosen degradation/termination factor. A real design needs measured finished-assembly allowables, termination qualification and separate fatigue, abrasion, bending, thermal and exposure histories. S2 owns hardware selection.

For fiber area A, density rho and deployed length L:

```text
F_retained = eta_strength * sigma_fiber * A
mass = rho * A * L
k_axial = E_fiber * A / L             (straight aligned fibers only)
d_equivalent = sqrt(4*A/pi)           (solid-fiber area, NOT rope diameter)
```

**[ASSUMED: arithmetic sizing, not qualification]** With ZYLON HM and eta_strength = 0.25, retaining 400 kN requires A = 275.86 mm²: 18.74 mm solid-fiber-equivalent diameter, 430.34 kg/km and ideal k_axial = 74.48 kN/m at 1 km. The 200 kN stress is 0.725 GPa and ideal extension is 2.685 m/km. Sheath, voids, splice, catcher, spool and deployment hardware increase diameter and mass. Choosing a conservative factor does not demonstrate that an actual termination attains it.

**[ASSUMED: arithmetic sizing, not qualification]** Two parallel 17 mm D12 MAX 78 ropes total 368 kg/km and 645.28 kN catalog break load (using 1 tonne-force = 9,806.65 N). A stipulated 0.65 retained-strength factor leaves 419.43 kN, or 2.10 times a 200 kN fuse. Equal load sharing and independent qualified terminations are required for that arithmetic; a single damaged leg can transfer its load to the other. Two lines are a mass/strength comparison, not an endorsed redundant architecture. Even two 15 mm lines retain only 336.56 kN with the same factor.

**[ASSUMED]** Carry line mass in the engineering budget even when a first reference model treats the line as massless: 1 km of the examples above is about 1.2–1.4% of a 30.4 t ship, and 2 km doubles that fraction. For a long line, mass and distributed modes are no longer negligible. A deliberately soft capture model represents a mechanical energy absorber or controlled payout in series with the rope; it must not quietly substitute a low modulus for these strong fibers. Dissipated capture energy belongs in a brake/thermal ledger. A worn rope cannot be assigned its new-rope catalog load.

## NASA and NASA-sponsored comparison

**[ESTABLISHED: S1-N1]** NASA/CR-2006-214432, *Dynamics Simulation Model for Space Tethers* (Levin, Pearson and Oldson), studies an approximately 100 km rotating MXER tether in elliptical Earth orbit, intended to catch LEO payloads and release them toward GEO or escape. Its high-fidelity prediction target is meters at the catcher over an orbit. This supports modeling elasticity, disturbances and the actual moving attachment point; it does not establish that a game can use that accuracy without tracking. [NASA NTRS record and report](https://ntrs.nasa.gov/citations/20060051891).

**[ESTABLISHED: S1-N2]** Khazanov et al., *Journal of Geophysical Research* (2006), describe a nominal MXER payload velocity increase near 2.4 km/s, followed by electrodynamic restoration of the tether facility's orbit using current interacting with Earth's magnetic field. This is a proposed system, not an operational performance record. [Paper, DOI 10.1029/2005JA011205](https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2005JA011205).

**[ESTABLISHED: S1-N3]** NASA-sponsored NIAC HASTOL Phase I (Boeing/Tethers Unlimited, 2000), appendix 3, compares rotovator concepts. One tapered Spectra 2000 example supports a 15 t payload at 3.42 km/s tip speed on a 600 km tether; its static strength margin is increased near the capture end for transients. This is a numerical architecture study. [NIAC final report, appendix 3, Figure 2 and Figure 3](https://www.niac.usra.edu/files/studies/final_report/355Bogar.pdf).

| Comparison | NASA or NASA-sponsored concepts | Borrowed Spin interpretation |
|---|---|---|
| Speed scale | [ESTABLISHED: S1-N2, S1-N3] Kilometers per second in the cited concepts | [ASSUMED] Tens to hundreds of m/s can matter against a roughly 690 m/s main-engine budget. Do not promise kilometer-per-second boosts from a kilometer-scale rigid wreck. |
| Length and flexibility | [ESTABLISHED: S1-N1, S1-N3] Approximately 100–600 km; distributed tether dynamics matter | [ASSUMED] Kilometer-scale contact and a finite spinning structure permit a smaller first model, with its neglected line mass and bending explicitly bounded. |
| Catch | [ESTABLISHED: S1-N1] Catcher position must be predicted accurately | [ASSUMED] A small relative speed at the latch is compatible with a large useful departure speed; capture mismatch and final delta-v are different quantities. |
| Reservoir | [ESTABLISHED: S1-N2] Launch changes the facility's orbit; reboost restores it | [ASSUMED] A derelict has finite translational and rotational energy. Simulate its recoil and spin change, and do not replenish it invisibly. |
| Gravity/environment | [ESTABLISHED: S1-N2] Earth's field and plasma support electrodynamic reboost | [FICTIONAL] P4 replaces the attraction law. No magnetic field/plasma or reboost equipment has been established for this derelict, so reboost is absent. |

**[ASSUMED]** The useful transferable result is the momentum-exchange mechanism and its capture difficulty. The NASA studies neither qualify the proposed ship's hardpoint nor validate a rigid abandoned structure, the game's P4 law, encounter timing or playability.
