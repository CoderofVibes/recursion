# S17 — Entry, failures and the clue

All proposed geometry and timing choices are [ASSUMED]; the radiation-like field
and deterministic damage rules are [FICTIONAL]. Numerical results below are
[DEMONSTRATED: `tools/studies/s17/generate.py`, `vectors.json`]. They are not results
from the production game.

## Entry geometry

Retain S5's finite clipped straight strands, nearest-strand contribution within a
sheet, additive contributions from different sheets, pitch 80 m, influence radius
4 m and peak 20 U. A junction contributes once. Each sheet is a finite 400 m
square; there is no invisible wall outside it. Distance includes finite endpoints.

The entry sheet is at x=0. Its reference opening is centred at (0,40,40), with
strands at world y,z=0,80 and their 80 m translates, clipped to [-160,240] in the
other in-plane coordinate. This is S5's grid shifted by half a pitch, **not a
different law**. The nominal straight rock gap points along +x near y=z=0.
Rocks are ordinary visible obstacles and must leave the reference probe routes
clear; the present study supplies no rock trajectories or collision claims.

The short-contact clock starts with the ship's structural datum at x=-24 m,
heading +x, velocity (2,0,0) m/s. This is a final approach window, not the region's
arrival spawn. Put the approach/preparation volume at least 500 m upstream and
validate the actual approach speed and retreat path. A prepared player can brake,
survey and align before commitment. At 2 m/s, backwards RCS alone needs roughly
76 s and 76 m to stop a healthy 30.4 t ship; 24 m is already too late for that
abort. Do not require a fatal pass to enable scanning.

The body origin is the structural datum, not COM. The reference carries the
rounded full-tank offset (-0.3329,0.0021,-0.1047) m; production must use current
mass properties and `x_COM + Q*(point_body - COM_body)`. Local gravity is omitted
from these prescribed-path vectors; the content builder must fly the route under
the real P4 sum, with shared r0=1,000 km, rather than changing that law.

## Damage rule and scope

```text
I_layer(p) = 20 * max(0, 1 - d(p,strands)^2 / 4^2)^4
I_component(t) = max over occupied component of sum of layer intensities
D_component(t) = susceptibility * integral I_component(t) dt
```

Use all baseline assembly IDs. Compact assemblies use the baseline's explicitly
declared mount-point approximation. Radiators and arrays use their entire current
prism, not their mounts or vertices. A radiator's conservative assembly-wide
profile includes its distributed vulnerable wiring/control/loop. It does not mean
bare metal is an electronic device; splitting those vulnerabilities into smaller
volumes is preferable if 3A has the inventory. Never average an exposed tip over
the whole ship. The fixture sheets cannot expose a component to two sheets at
once; intersecting-sheet `max(sum)` still requires S5's general implementation.

Baseline profiles are copied, not refitted to obtain the desired deaths:

| Profile | Susceptibility | Degrade / fail (weighted U s) | Upset / latch spacing (weighted U s) | Raw burnout threshold |
|---|---:|---:|---:|---:|
| Standard | 1 | 20 / 80 | 6 / 20 | >10 U continuously for 0.1 s |
| Hardened | 0.5 | 40 / 160 | 12 / 40 | >20 U continuously for 0.1 s |
| Power switch | 0.8 | 30 / 120 | none / 25 | >8 U continuously for 0.1 s |
| Passive | 0 | never at these exposures | none | irrelevant |

**One proposed override:** change `console.radiationProfile` from `standard` to
`hardened`. With the unchanged baseline it burns out at 9.302 s, only 1.500 s
after the camera, and hides the rest of the sequence. The comparison vector
`unchanged-console-baseline` preserves that result. The hardened console instead
records an upset at 10.409 s. Treat its last frame as stale during recovery; do
not keep issuing fresh readings from a failed or rebooting display. There are
2.607 s of live display after camera loss, then up to 0.936 s of stale display
before terminal feed loss. Exact upset presentation/recovery remains 3A/2D work.

Power-off suppresses energized burnout/upsets/latches, but exposure still
accumulates. In the reference's all-off central pass, a radiator reaches its
permanent 80 U s threshold. A reset never repairs that. High-intensity dwell is
contiguous, with strict `>` thresholds; isolated sheets peaking at exactly 20 U
do not burn out hardened devices. Overlapping sheets could exceed that threshold.

Latch events isolate the local branch; later powered events must be suppressed.
All candidate events are processed in chronological order; tied permanent failures
precede trips, then upsets, then equipment ID for stable serialization. Dose
continues after a device fails, until ship loss or the end of the fixture.

The reference assumes energized contactors in idle batteries, a powered standby
device, healthy source capacity up to PDU loss, open bus tie, and OR-isolated
essential feeds. It models availability through the two PDUs, **not** dispatch,
conversion losses, source ramps, fault heat or reset recovery. Recheck chronology
in the real power solver with depleted/damaged arrival states.

## First-pass results

All times are seconds after the datum passes x=-24 m. Default configuration is
`radiators`, with arrays stowed. Loss means the proposed terminal condition
**both PDUs irreversibly failed, hence no recoverable essential electrical feed**.
A single tripped breaker, a dead camera, a cooling fault, a temporary shortage or
a stopped recorder must not independently end an attempt. No invented acute crew
dose or instant overtemperature is used.

| Straight approach (datum y,z) | Speed m/s | First permanent failure | Electrical loss | First failure → loss |
|---|---:|---:|---:|---:|
| Rock gap (0,0) | 2 | 7.802 | 11.346 | 3.543 |
| Nearby gap (1,1) | 2 | 7.978 | 11.246 | 3.268 |
| Climb over rock (20,2) | 2 | 7.809 | 11.217 | 3.409 |
| Wing clip (10,40) | 2 | 14.876, right radiator | none in 24 s | continues damaged |
| Measured centre (40,40) | 2 | none | none | zero exposure |
| Rock gap, slow | 1.4 | 11.103 | 16.165 | 5.062 |
| Rock gap, fast | 2.6 | 6.025 | 8.751 | 2.726 |

These deliberately chosen probes demonstrate contrasting outcomes, **not a
measured probability that a human dies**. Author the apparently natural entry
corridor across a first strand and qualify a neighbourhood of arrivals. Never
move strands in response to the player's steering. A10 seed variation must retain
the readable entry pattern without making every possible approach fatal.

Nominal failure order:

| Time s | Mechanism/capability |
|---:|---|
| 7.802 | Camera burnout: current optical tracking stops |
| 8.302 | Communications electronics burnout |
| 8.478 | Both star trackers burn out: attitude uncertainty must grow |
| 8.802 | Both forward RCS pods burn out: control authority changes |
| 10.409 | Hardened console upset; last display becomes stale during recovery |
| 10.478 | Both internal pumps burn out; cooling degrades, not instant thermal death |
| 10.842 | Science processor burns out; no new reconstruction |
| 10.846 | Both battery switching assemblies burn out; healthy fuel cells still supply |
| 11.234 | ECLSS units register upsets |
| 11.302 | Interface heat-exchanger electronics burn out |
| 11.346 | Both PDUs burn out; essential feed is irrecoverable, loss begins |

The healthy Black Box and flight CPUs are still physically intact at loss.
Their power disappears; they do not acquire post-loss data. A8's approximately
six-second shake/black/return presentation follows the physical loss, without
extending acquisition or pausing to let the player solve the encounter.

Weighted component exposure at each path's own stopping time (U s):

| Assembly | Rock gap | Nearby gap | Climb | Wing clip |
|---|---:|---:|---:|---:|
| Camera | 32.507937 | 24.314209 | 32.143819 | 0 |
| Star tracker A | 24.314209 | 8.907690 | 0 | 0 |
| Forward-left RCS | 32.507630 | 24.313467 | 8.907690 | 0 |
| Science processor | 12.268217 | 5.518098 | 0.198924 | 0 |
| Battery A | 7.835057 | 8.051224 | 8.238359 | 0 |
| PDU A | 2.750249 | 2.599654 | 2.560092 | 0 |
| Black Box | 11.450223 | 7.940235 | 0.007228 | 0 |
| Flight CPU A | 10.689388 | 5.421066 | 0.273799 | 0 |
| Right radiator | 13.192994 | 8.834376 | 3.179398 | 82.507937 |

Low cumulative PDU exposure does not imply survival: powered burnout occurs
before its cumulative threshold. Conversely, 8.907690 U s on tracker A in the
nearby gap causes an upset, not burnout. All other components, raw dose, actual
events and states are included in JSON. The wing-only fixture shows why a COM
path can be clear while a deployed part is permanently damaged.

For an isolated point at offset b crossing a strand at perpendicular speed v:

```text
D_raw = (256/315) * I0*w/abs(v) * max(0, 1-b*b/(w*w))^(9/2)
```

The box integral adds its finite x-span plateau. A radiator crossing a strand
along its full 5 m chord at 2 m/s accumulates 32.507936508 + 20*2.5 =
82.507936508 U s. This independent integral is checked against midpoint
quadrature. Slowing a *contacting* path increases dose; a truly clear centre has
zero dose at either speed. A point skim at b=3.2 m gives only 0.327605 U s at
2 m/s (S5), too small for immediate permanent damage on fresh standard hardware.

## The record after loss

[ASSUMED] Retain ordinary instrument timestamps, validity/gaps, equipment
heartbeats, measured branch power, commands, configuration and the original
forecast. Do not copy the truth-side event/dose table into Black Box. A silent
device can be reported as unresponsive; “burnout” is a diagnosis only if a
recorded fault indication supports it. Final feed collapse may leave only a
last-good sample and a loss boundary, not a perfect last telemetry packet.

At a proposed 1 Hz minimum diagnostic packet rate, this fixture has camera data
through t=7 s, tracker data through t=8 s and recorder/IMU data through t=11 s.
At the existing Gravity range's 0.05 Hz, it may have no useful sample during this
whole window. Request a player-visible 1 Hz arrival preset for this sensing branch,
or an explicitly powered minimum housekeeping stream. Do not silently resurrect
unrecorded measurements after death. Commands/fault metadata retain their reserved
channel; an empty/full/off recorder must show the evidence that is missing.

The clues are deliberately limited:

1. Camera and trackers disappear while the IMU reports no impact impulse; there
   is no recorded collision. This favours an electrical/environmental event over
   a rock strike, without proving a particular cause.
2. Front equipment fails before equipment farther aft, across more than one
   electrical branch. The spacing and timestamps suggest a localized region
   swept by the ship rather than a single shared load overload.
3. [FICTIONAL, ASSUMED] Add a small **uninterpreted camera-channel diagnostic tile**
   to the ordinary recorded packet when the camera and idle science processor
   are running: at most 1 KiB per 1 Hz packet, within the existing 4 KiB packet.
   Tiles can show repeated straight fragments against nonmatching rock imagery.
   Extraction is a cheap diagnostic; the 350–1,000 W function performs association
   and 3D reconstruction. This is a proposed acquisition addition, not existing
   raw-frame support or a demonstrated output of this reference.

That third clue points at structure; the first two alone do **not** establish a
grid. The loss record suggests investigating the unexplained processing function,
not the solution or new-run coordinates. Switching it on at standoff supplies
the actual reconstruction evidence. Ordinary success or a nonfatal probe can
teach the same thing. No achievement, death count or compulsory Missing Room visit
unlocks the function.
