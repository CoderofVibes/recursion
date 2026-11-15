# S17 — The lattice's first contact

Study for owner/integrator review, November 14, 2026 (Pacific). Base `19a9ada`,
branch `st/s17-lattice-first-contact`. This is a proposed encounter specification
and independent numerical reference. It changes no decision, ship data or game code.

## Recommendation

[ASSUMED] Keep S5's finite 80 m grid, 4 m influence radius and peak 20 U. Make the
ordinary-looking entrance cross a strand; arrange eight staggered sheets behind
it. At a 2 m/s approach, the proposed first contact destroys the camera, then
star trackers and forward thruster electronics, then both distribution feeds.
Harden the console so the player can see that sequence. Loss follows physical
electrical failure; no radiation countdown or required first death.

[DEMONSTRATED: `tools/studies/s17/generate.py`] The straight entry fixture loses
its camera at 7.802 s and both PDUs at 11.346 s, measured from 24 m before the
first sheet. That leaves 3.543 s from first failed instrument to electrical loss.
Two nearby blind paths lose power at 11.246 and 11.217 s. An appendage-only
contact instead destroys one radiator and leaves the ship operating. All 42
assemblies have individual raw and susceptibility-weighted exposure vectors.

[ASSUMED] Expose the Black Box function before the encounter. Switching it on
allocates existing camera, IMU, star-tracker and processor resources and records
observations. The reconstruction needs parallax and coverage; it never receives
truth strands. Keep ordinary recording cheap. Make sustained raw diagnostics,
processor draw, a nearly full store and a hot or damaged arriving ship meaningful
constraints rather than pretending a fresh recorder fills in seconds.

[DEMONSTRATED: generator] A 32.4 s recording contains 54 frames at the camera's
actual 5/3 Hz ceiling. Forty-eight training frames and six held-out frames
reconstruct four observed junctions at 120 m with errors below 0.8 m and about
0.51–0.56 m marginal position sigma, including a shared 0.5 m pose uncertainty.
No parallax, missing recordings or an occluded corner cannot certify the opening.
These results assume the fictional detection channel and its coverage calibration.

[DEMONSTRATED: generator] A fixed-attitude, fully deployed path through eight
tilted sheets has a continuous clearance lower bound of 22.027 m at 1.4 m/s,
and therefore zero exposure. Its duration is 25.57 minutes and its ideal
translation cost is **96.58 kg RCS**; budget at least 125 kg for local qualification
[ASSUMED], with later-route reserves additional. A 2 m/s option takes 17.9 minutes
and 137.97 kg before inefficiency and attitude costs. This is a substantial demand
on a 300 kg launch load, not evidence that the complete expedition is balanced.

## Read and port

| File | Purpose |
|---|---|
| [First contact](first-contact.md) | Geometry, per-component exposure, causal failure order, loss timing and retained clues |
| [Black Box and reconstruction](black-box.md) | Hardware, power/cadence/storage/heat, uncertainty, FLIGHT, recurrence and seed policy |
| [Threading and build requests](threading-and-build.md) | Full envelope, feasible reference motion, margins, costs, module ownership, acceptance and owner questions |
| [Reference instructions](../../../tools/studies/s17/README.md) | One-command reproduction, vector schema and port tolerances |
| [Vectors](../../../tools/studies/s17/vectors.json) | Explicit inputs and expected component, event, reconstruction and passage results |
| [Handoff](../../handoffs/s17.md) | Integration requests and verification record |

## Evidence boundary

[FICTIONAL] The lattice, its camera imprint, U and U s, selective electronics
damage and recurrence persistence are inventions. U s is not Gy or Sv. The
thresholds are game ratings, not radiation qualification. Real radiation can
produce cumulative degradation, transient faults and permanent failures; those
categories alone are supported by [NASA NESC 19-01-1 (R04)](https://ntrs.nasa.gov/citations/20210024100)
and [JPL Appendix Three (R05)](https://parts.jpl.nasa.gov/asic/Appendix.3.html).

[ASSUMED] The numerical reference has exact entry-path integrals and a conservative
continuous clearance certificate for a declared envelope. It is **not** the game's
bus solver, thermal solver, gravity propagator, sensor acquisition implementation,
controller or a person's playtest. It does not demonstrate a population survival
rate or an affordable whole-expedition route. Owner choices and builder checks
remain explicit below; studies do not approve their own proposals.
