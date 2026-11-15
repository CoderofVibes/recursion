# S2 — Precedents and capture choice

This is a study, not an adopted hardware decision. Sources were checked on 2026-11-14 Pacific. Source IDs below are local to S2; the integrator can add them to `References/BIBLIOGRAPHY.md`. No source demonstrates the complete proposed maneuver: a crewed ship firing a recoverable grapple at an abandoned rotating structure, taking useful momentum, and releasing safely. Flight evidence for deployment is different from evidence for capture.

## Flight experience

### TSS-1: the deployer can be the limiting hardware

[ESTABLISHED: S2-TSS1] In 1992, TSS-1's investigation recorded deployment stopping at 256 m and successful retrieval. The returned hardware showed a bolt interfering with the level-wind mechanism; slack tether and the upper tether control mechanism were also investigated. A working long tether did not imply a working integrated payout path. [NASA investigation report](https://ntrs.nasa.gov/citations/19930016042).

[ASSUMED] S2 implication: model reel motion separately from commanded motion. A jam produces rising motor current or tension and little encoder movement; it is not a random broken-line event. Check the complete deployed path, clearances and accumulated line on retrieval. Do not implement an unlimited winch that pulls through a snag.

### TSS-1R: electrical damage can become structural failure

[ESTABLISHED: S2-TSS1R] During the 1996 reflight, the tether broke at about 19.7 km. NASA's investigation attributed the failure to electrical arcing that burned away tether material, followed by tensile failure. Its recommendations include clean deployment paths, integrity testing and integrated subsystem testing. This was not evidence that a nominal mechanical tension limit alone predicts tether survival. [NASA lesson 566](https://llis.nasa.gov/lesson/566).

[ASSUMED] S2 implication: choose a nonconducting mechanical line with no intentional high-voltage path. Do not import TSS-1R's electrodynamic arc failure unchanged into that design. Instead model plausible material/termination damage, abrasion and excessive temperature; local weakening can make an otherwise ordinary load fail. TSS-1R is also a reason to keep electrical faults and mechanical strength coupled where the actual architecture permits that coupling.

### YES2: an encoder can be wrong while the line keeps moving

[ESTABLISHED: S2-YES2] YES2 flew in 2007. The mission team's analysis reports 31.7 km deployed instead of the 30 km target after an electrical problem, with release near the planned position and time but an inferred landing point roughly 1,250 km upstream. The 2008 report identifies intermittent power failure in the receiver interface for the optical loop-detector signals. The capsule had not been recovered at publication. These are reconstructed flight results, not verified delivery to the intended landing site. [Mission-team report and abstract](https://repository.tudelft.nl/record/uuid:bf7d8c38-d5c7-4378-a6bf-2e3129740dd8), [report PDF, Figure 3](https://repository.tudelft.nl/file/File_5aa0643b-2213-4c06-9e0c-f0e3da5756fa).

[ASSUMED] S2 implication: preserve raw payout pulses and quality flags, compare them with load-cell and camera evidence, and propagate disagreement into the forecast. Three identical channels sharing an interface or supply are not three independent witnesses. Release timing alone cannot rescue a wrong release-state estimate. A false low payout rate must not silently become the simulator's actual line length.

### SEDS-1 and SEDS-2: braking and survival are separate problems

[ESTABLISHED: S2-SEDS] Both missions deployed 20 km tethers. SEDS-1 used open-loop control; its end-of-deployment rate of about 7 m/s produced a large tension rise and rebounds. SEDS-2 used closed-loop braking to approach a small final angle near the local vertical. The hardware included turn counting, a tension sensor, a temperature sensor, friction braking and a cutter. The handbook reports later SEDS-2 severing, with a micrometeoroid/debris impact suspected rather than confirmed. [NASA-hosted tether handbook, §1.2, printed pp. 15–18](https://spdf.gsfc.nasa.gov/pub/data/tss/tss_docs/TIS_chap1.pdf).

[ESTABLISHED: S2-SEDS-LIFE] A dedicated NASA lifetime analysis places the SEDS-2 cut between revolutions 74 and 75 on 15 March 1994 and describes the cause as probable micrometeoroid or untracked debris. Public summaries disagree on the number of elapsed days, so this study does not use an exact lifetime as a design requirement. [NASA lifetime analysis](https://ntrs.nasa.gov/api/citations/19960003157/downloads/19960003157.pdf).

[ASSUMED] S2 implication: treat reaching the spool end while paying out quickly as a physical shock, not an ordinary stop. Include remaining line and braking energy in the operator's evidence. Keep short-term capture/load qualification separate from long-term exposed-line survival. Do not derive a game damage probability from these few flights.

## Development studies, not flight proof

### NASA MXER: a capture window includes velocity and compliance

[ESTABLISHED: S2-MXER] The MXER work proposed a rotating tether for momentum transfer followed by electrodynamic reboost. Its capture study explicitly accommodates position and velocity mismatch; it tested a one-tenth-scale prototype in a dynamically similar environment and paired it with a dynamics model. The later contractor report describes the Quadtrap and validated elastic-tether modeling as research deliverables. [Capture mechanism study](https://ntrs.nasa.gov/api/citations/20070001536/downloads/20070001536.pdf), [NASA/CR-2007-215076](https://ntrs.nasa.gov/citations/20080002099).

[ASSUMED] S2 implication: validate capture over a 3D position/velocity uncertainty volume and a finite contact interval. A ray intersection is not a successful load-bearing latch. Use compliance or controlled payout to limit the capture transient, and verify release under load independently. Do not claim MXER flew operational catch-and-release, adopt its proposed performance as a qualified rating, or provide electrodynamic reboost in an environment with no established plasma/magnetic-field model. Borrowed Spin's source of energy remains the structure's actual motion.

### ESA e.Deorbit: catching is only the start

[ESTABLISHED: S2-EDEORBIT-PLAN] ESA's 2015 implementation plan evaluated rigid robotic-arm/clamp options and flexible net/harpoon options for the Envisat case. Those studies concerned recognizable satellite structure, including a launch adapter ring or hold-down hardware. [Implementation plan, §2.3](https://blogs.esa.int/cleanspace/files/2016/02/e.deorbit-Implementation-Plan-Issue_1_2015.pdf).

[ESTABLISHED: S2-EDEORBIT-LESSONS] ESA's retrospective contrasts net/harpoon capture from up to 50 m with arm operations within 2–3 m. It identifies time-critical stabilization after flexible capture to avoid wrapping the tether around the two vehicles; arm capture requires closely synchronized motion. These are study lessons, not a flight record of e.Deorbit capturing Envisat. [ESA study-team retrospective](https://blogs.esa.int/cleanspace/2018/12/18/from-active-debris-removal-to-in-orbit-servicing-the-new-trajectory-of-e-deorbit-part-two/).

[ASSUMED] S2 implication: author an identifiable structural member with measured pose and an uncertain strength estimate. Avoid implying any silhouette is a safe attachment. Evaluate line wrapping and appendage contact after latch, particularly during relative rotation. An easy latch must not automatically detumble the structure or establish its strength.

## Grapple, harpoon or net

The following is S2's design judgment, not a vendor comparison or qualified mass estimate. `[ASSUMED]` applies to all tradeoff entries. None of these sources establishes operational asteroid-grapple heritage.

| Option | Where it fits | What it adds or risks | S2 assessment |
| --- | --- | --- | --- |
| Tethered mechanical grapple with a closing latch | A visible exposed ring, beam or rail; a short, low-relative-speed throw | Needs compatible geometry and a real structural load path. Contact, closure and retention are separate events. A hook on a thin panel can tear free. | Smallest defensible option if the abandoned structure has suitable observable members. Restrict the usable target geometry openly. A launched grapple is a proposed adaptation, not the robotic arm flown in a servicing mission. |
| Penetrating harpoon | A surface whose thickness, material and backing are characterized | Needs projectile energy, retention after penetration and a replaceable penetrator. Can ricochet, punch through, fragment the surface or lodge in a weak skin. Unknown tanks or layered surfaces make penetration assumptions especially poor. | Reject for the minimum build: it needs a target-material and penetration model to make success honest. |
| Wrapping net | A compact object within a characterized net envelope | Broad interception area, but distributed contact, closing, rebound and entanglement need modeling. On a large broken structure it may catch the wrong feature; the load path and release are less controlled. | Valuable ambitious alternative for a small free fragment, not the smallest hardware for a chosen attachment on a spanning structure. |

[ASSUMED] The recommended grapple depends on a concrete content decision: the encounter supplies observable, physically compatible members that can plausibly carry the selected working load. Their existence is authored content; actual target strength remains uncertain until justified by observations or a cautious proof load. This restriction buys a lighter and more inspectable mechanism without granting universal capture.

## Source register

| Local ID | Source and evidence scope |
| --- | --- |
| S2-TSS1 | NASA-TM-108704, *Tethered Satellite System Contingency Investigation Board*, 1992; [NTRS 19930016042](https://ntrs.nasa.gov/citations/19930016042). Flight anomaly investigation. |
| S2-TSS1R | NASA Lessons Learned 566, *Tethered Satellite System 1 Reflight (TSS-1R) Failure*; [lesson](https://llis.nasa.gov/lesson/566). The page's reference to TSS-1 in 1994 conflicts with the 1992 investigation; use the investigation for TSS-1's date. |
| S2-YES2 | Kruijff, van der Heide, Ockels and Gill, *Summary of Data Analysis of the YES2 Tethered SpaceMail Experiment*, SPEXP 2008; [TU Delft record](https://repository.tudelft.nl/record/uuid:bf7d8c38-d5c7-4378-a6bf-2e3129740dd8). Primary flight-team reconstruction. |
| S2-SEDS | *Tethers in Space Handbook*, §1.2; [NASA GSFC copy](https://spdf.gsfc.nasa.gov/pub/data/tss/tss_docs/TIS_chap1.pdf). Flight hardware, sensing and dynamics. |
| S2-SEDS-LIFE | Evans, *Comparison of Predicted and Actual Orbital Lifetimes for the SEDS-2 Mission*; [NTRS 19960003157](https://ntrs.nasa.gov/api/citations/19960003157/downloads/19960003157.pdf). Post-severing orbital reconstruction and uncertain cut cause. |
| S2-MXER | Canfield and Sorensen, *Design Rules and Analysis of a Capture Mechanism for Rendezvous between a Space Tether and Payload*; [NTRS 20070001536](https://ntrs.nasa.gov/api/citations/20070001536/downloads/20070001536.pdf). Canfield, *Developing Capture Mechanisms and High-Fidelity Dynamic Models for the MXER Tether System*, 2007; [NTRS 20080002099](https://ntrs.nasa.gov/citations/20080002099). Models and ground prototypes. |
| S2-EDEORBIT-PLAN | ESA, *e.Deorbit Implementation Plan*, issue 1.0, 18 December 2015, §2.3; [plan](https://blogs.esa.int/cleanspace/files/2016/02/e.deorbit-Implementation-Plan-Issue_1_2015.pdf). Competing Phase A concepts. |
| S2-EDEORBIT-LESSONS | ESA Clean Space, *From active debris removal to in-orbit servicing: the new trajectory of e.Deorbit, part two*, 18 December 2018; [retrospective](https://blogs.esa.int/cleanspace/2018/12/18/from-active-debris-removal-to-in-orbit-servicing-the-new-trajectory-of-e-deorbit-part-two/). Study-team lessons and limitations. |
