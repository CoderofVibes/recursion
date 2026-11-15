# S17 — Black Box function, evidence and recurrence

This specification is [ASSUMED] except where marked. The lattice's remotely
observable imprint is [FICTIONAL]. The reference demonstrates the stated fit and
resource arithmetic, not the existence of such a sensor in real spacecraft.

## What is switched on

The Black Box function is software on `science-processor`, using existing
`camera`, `imu-a` and `star-tracker-a` (healthy substitutes where the real ship
supports them), with `black-box` retaining the input data. It is available before
any loss. No new scanner, perfect range sensor, shielding or repair is introduced.
An unexplained channel may precede discovery; after the player identifies its
purpose, call it reconstruction. Do not invent an automatic explanation/adoption
of a new force law. This is a sensor product, consistent with S5 and P5.

The camera acquires an otherwise uninterpreted fictional channel of angular
fragments and junctions. Ordinary intensity at the ship is insufficient to infer
remote 3D structure. The truth-side adapter may generate noisy, anonymous image
features within the actual cone and occlusion mask. It may not send truth layer
IDs, world coordinates, segments, seed, true pose, or a hidden complete mesh to
belief code. Feature IDs below are **observation track associations**, not truth
IDs. Association ambiguity must remain unresolved in production.

Separate three operations:

1. Acquisition: actual healthy camera, pointing, illumination/channel validity,
   warmup and exposure determine what can be seen.
2. Retention: recorder power, cadence and free bytes determine what is recorded.
   Only retained data enter a fit. Processing does not rescue an unrecorded frame.
3. Reconstruction: delivered processor power determines processing throughput.
   Recorded attitude/navigation estimates and their covariance locate rays. New
   geometry comes from those recorded rays and calibrated coverage only.

Power is a ceiling, not a guarantee of delivery. A shed/tripped processor makes
no new products. Old geometry stays visible as measured earlier, with growing
relative-pose uncertainty; it is neither erased nor treated as currently refreshed.

## Rates, power and heat

Retain the baseline processor response:

```text
P < 350 W: no new processed features
P >= 350 W: f = clamp((P - 350)/650, 0, 1)
target update rate = 0.2 + 1.8*f Hz
actual rate <= min(target rate, camera acquisition, recording, healthy service)
```

The existing camera adapter caps cadence at `delivered camera W / 120` Hz.
Consequently 200 W detail mode gives **5/3 Hz**, not 2 Hz. Keep that cap in the
first implementation; do not silently change hardware to meet a processor target.
At 120 W tracking, full processing is capped at 1 Hz. The reference uses 200 W,
warm/calibrated optics and steady pointing. A cold camera needs its existing
20 s warmup, 10 s calibration and 5 s settling as applicable; survey time must
include unready intervals rather than fabricate frames at switch-on.

[DEMONSTRATED: `vectors.json/resources`] These are sensor-chain loads, not total
ship load. Existing camera/IMU/tracker/recorder baseline load is already present
when comparing budgets. Do not count it twice.

| Mode | Processor | Feature rate | Recorder | Total chain | Stored rate |
|---|---:|---:|---:|---:|---:|
| Survey | 350 W | 0.2 Hz | 10 Hz, 35 W | 620 W | 40,960 B/s |
| Thread | 1,000 W | 5/3 Hz | 10 Hz, 35 W | 1,270 W | 40,960 B/s |
| Raw diagnostic | 1,000 W | 5/3 Hz | 50 Hz, 100 W | 1,335 W | 1,204,800 B/s |

Totals include camera 200 W, one IMU 15 W, one tracker 20 W. The processor and
camera add 1,200 W on the payload bus in Thread mode; the remaining 70 W is on
essential, whose 0.95 converter efficiency adds about 3.68 W at the supplying
main bus. All electrical input becomes heat under these equipment modes. The
reference table excludes conversion heat and the rest of the ship.

Relative to camera track 120 W + processor idle 40 W + the same instruments and
normal recorder, Thread mode adds **1,040 W** before conversion. The fuel cells
can support this on a healthy ship; do not describe it as guaranteed overload.
Competing loads, a lost source, a converter failure, depleted reactants/batteries
or optional ion propulsion make the allocation consequential.

Processed features have a proposed maximum payload of 16 KiB per update, including
lineage, coverage and pose references. At 5/3 Hz that is 27,306.7 B/s, leaving
13,653.3 B/s inside the normal 10 × 4,096-byte packets for other channels. The
packets include the feature data: **do not also add the baseline processor's
200,000 B/s internal output to stored bytes**. A larger actual serialization must
reduce accepted features or charge more bytes. Packet fragmentation and overhead
need the 2C/3C contract; never treat a 16 KiB update as one 4 KiB packet.

Normal mode needs actual 10 Hz packet scheduling and timestamped queued inputs.
The current ship step emits at most one packet per tick from one environment
snapshot. A 1 s tick therefore cannot create ten distinct observations. Request a
subtick acquisition schedule with interpolated/propagated poses, shared by the
field exposure coordinator; increasing recorder settings alone does not fix this.
The 0.1 s burnout rule independently requires much finer event localization.

For the 1,074 s fast pass, Thread mode costs 1.364 MJ (0.379 kWh), stores 43.991 MB
and adds 1.310 MJ to the service thermal node. If that node rejects **none** of
this added chain heat, its 4 MJ/K capacity rises only **0.328 K**. For the 1.4 m/s
pass, multiply duration, energy and bytes by 10/7: 1.949 MJ, 62.844 MB and 0.468 K.
These are incremental loads, not a complete thermal transient or a guarantee of
temperature. Full hotel load, chemical source waste heat, sunlight, pump health
and radiator rejection still apply.

The cold healthy ship therefore does not face a credible seconds-long heat
countdown from scanning alone. A service node already at 312.8 K with no cooling
uses the last 0.2 K to the camera's 313 K limit in **655.74 s** at the chain's
1,220 W service-node input, even excluding other heat. This is an adverse
arrival-state arithmetic example; run the real thermal model before using it as
a gameplay deadline. Prefer deployed radiators and an informed clearance margin
over mandatory stowing.

## Storage: honest consequences for P12 / 2D R7

Keep the baseline 8,000,000,000 B capacity and 100,000,000 B metadata reservation.
Usable optional acquisition capacity is 7.9 GB, decimal bytes throughout.

- Normal 10 Hz packets alone fill it in **53.575 hours**. One fast pass uses
  0.56% of it. This does not make storage tight on a fresh ship.
- Full raw diagnostics add 1 MB/s to 50 Hz packets: it fills in **109.285 minutes**.
  A fast pass uses **1.294 GB**; a slow pass uses **1.8485 GB**. A full raw run is
  costly and unnecessary once a channel interpretation is trusted.
- With only 32 MB of optional headroom remaining, raw diagnostics last **26.560 s**;
  normal feature recording lasts **781.25 s**. The short raw run cannot retain
  all 32.4 s of the reference acquisition if it starts in that state.

Thus the function matters now because it needs fresh geometry at several frames
per second, a kilowatt of computation and stored evidence throughout a close
pass. Earlier sparse ordinary tracking can be cheap. No artificial tiny capacity,
mandatory deletion of old evidence, hidden encounter tariff or recurrence unlock
is required. A player should see power delivered, effective update rate, optional
bytes remaining and **remaining duration at the current recording mode**.

On optional capacity exhaustion: stop raw capture first, then reduce/stop optional
feature/high-rate recording according to a recorded policy. Reserved command,
configuration and fault metadata continue while powered and with reserved bytes.
If reserve fills, show a warning and gaps. Never silently overwrite old forecasts
or records. Free capacity cannot be assumed to reset at an encounter boundary.
P8 resets the physical store at recurrence while keeping prior attempt archives.

## A short reconstruction, from data only

[DEMONSTRATED: `vectors.json/reconstruction`] Four anonymous junctions delimit an
observed quadrilateral. Their validation-only truth coordinates are x=0 with
y,z in {0,80}. The belief fitter never receives that truth list. Camera positions
run from (-120,32,40) to (-120,47.9,40) m over 31.8 s, at 0.6 s spacing. The 54
acquisitions occupy 32.4 s of scheduling. All four features are within the actual
30° half-angle cone. The camera's fixed +x attitude does not require a roll input.

The observation payload is gnomonic slope `(y/x,z/x)`, with declared sigma 0.0005
per slope, deliberately noisier than ordinary star/rock tracking. This is an
assumed channel quality, not a change to the baseline camera's nominal 50 µrad
optical error. A portable xorshift32 stream supplies bounded zero-mean noise of
that variance. Each recorded camera origin has a common (0.4,-0.3,0.2) m offset;
the belief payload declares a 0.5 m common pose sigma without revealing that
actual offset. The sample's navigation estimate is an input assumption: no
absolute position beacon is invented. Production must earn comparable relative
pose precision from tracked objects, attitude and IMU history.

Solve a linear ray fit for initialization, then minimize slope residuals with
Gauss–Newton. Covariance is the inverse normal matrix times the stated slope
variance, plus a **shared** pose covariance. The first 48 frames train; the last
six only test. Results:

| Feature | Position error x,y,z (m) | Marginal sigma x,y,z (m) |
|---|---|---|
| f0 | (0.3645,-0.2976,0.2269) | (0.5590,0.5066,0.5070) |
| f1 | (0.3332,-0.3329,0.2241) | (0.5589,0.5073,0.5070) |
| f2 | (0.0209,-0.4341,0.0872) | (0.5583,0.5072,0.5069) |
| f3 | (0.6174,-0.3919,0.2723) | (0.5594,0.5067,0.5070) |

The six-frame prefix in JSON has no held-out support and cannot certify an
opening. A stationary viewpoint has unresolved depth; the fitter returns no
resolved points. Occluding f3 leaves the fourth corner unresolved. Removing all
recordings yields no reconstruction. All are checked. Perfect association of
these four tracks is assumed; repeated real lattice motifs need additional views
and competing associations, not the feature identities of the truth mesh.

Triangulating a few bright points cannot prove that the volume between them is
empty. The reference therefore makes a **separate, explicit sensing assumption**:
the recorded coverage certificate resolves 1 m channel structure over this one
quadrilateral, observes all four edge fragments, and bounds undetected strand
support to 1 m. Without that calibrated certificate, even a good point fit leaves
the opening unresolved (checked). The detection model must be independently
qualified with occlusion, low signal, low power, damaged sensors and repeated
features. `patch_support_eligible` in the reference is eligibility of this measured
patch, not certification of a commanded ship trajectory or unseen next sheets.

An observed segment consists only of observed connected feature support, with
endpoint uncertainty; no grid regularizer extends it into unseen cells. Inflate
by strand support, joint geometry/pose confidence and the whole spacecraft swept
envelope. Use a declared 3-sigma joint confidence set, not unbounded Gaussian
support. Correlated patch motion does not shrink as pixels are averaged. A
nominal point fit and a displayed gap are never sufficient on their own.

## FLIGHT and the loss review

Use the existing Night Watch tokens. These are behavior requests, not new theme
values. Reconstructed strands are strongest at their estimated axes and fade
toward their influence bounds. Their uncertain positions have an uncertainty
band. Newly recorded fragments grow/merge only as evidence supports association.
Do not fade unknown regions into apparently clear background.

Use four distinct states: **unobserved**, **observed but unresolved**, **supported
strand**, **clear-supported within coverage**. The last is conditional on the
declared detection/confidence bounds. A coverage overlay must occupy unknown
volume; a dim low-power reconstruction is never a gap. Missing Room uses exactly
these states and the same field/run frame.

Show the full current ship, its deployed parts, intended sweep, uncertainty and
the first threatened component. Give one concise validity reason when the useful
forecast ends: missing coverage, poor parallax, stale pose, recording stopped or
equipment unavailable. Store the reconstruction/coverage version with the issued
forecast; later data must not repaint the original forecast as if it had known
more. The model forecasts the player's controls; it does not pick cell centres,
execute the reference route, or silently restore a successful power schedule.

Black Box aligns retained signal tiles/features, measured instrument gaps, power
and configuration history with that original forecast. Mark unsupported intervals
and event diagnoses honestly. The apparent global failure is understood through
the first few localized failures, not a narrator announcing the entire lattice.
Every screen continues to run at >=1× during the encounter (A12).

## Carry-over and A10 variation

Keep all acquired records, commands, configurations, issued forecasts, coverage,
fit lineage, player interpretation and saved procedures under P8. Physical heat,
charge, damage, dose/dwell/bucket cursors and onboard capacity reset only when
the **whole expedition** restarts. Archive data may persist after recorder power
loss; measurements never acquired do not. Bump the save/measurement schema for the
new records; cached reconstructions must be rebuildable from them in canonical
acquisition order (estimator spec §11).

Recommend varying lattice geometry **between runs**, fixed within a run apart
from any explicitly simulated motion. Keep pitch, tube profile, damage ratings,
sensor response and layer topology fixed. Use an authored layer-centre pattern
plus later-layer offsets up to ±12 m and normal tilts up to ±12°, with rotated entry
direction/rock layout. Author the apparent first rock corridor with its centreline
within ±1 m of the first strand intersection in the entry frame; change that
corridor and the lattice together at seed construction, never during flight.
The tested (0,0) and (1,1) paths motivate this bound but do not qualify every
arrival in it. These initial ranges narrow S4's wider bounds until the
controls are qualified. Revalidate each generated scene; do not mutate physics
or guarantee a hidden rescue corridor in reaction to damage or success.

Record a public run/encounter/frame identity. Prior-run coordinates remain in an
archive view and **are not current obstacles or current clearance**. New
observations may re-establish associations; knowing the old truth seed is never
a measurement. The saved procedure retains its starting geometry/condition/
reserve tolerances and rejects mismatches; the player adapts it. Changing hidden
geometry while keeping recordings fixed must leave belief/FLIGHT byte-identical.

The carried lesson saves investigation, not all surveying. A proposed first
investigation budget is 32 s low-power comparison +32 s full-power baseline +8 s
validation =72 s, excluding movement/preparation. A prepared return can directly
take the 32.4 s full-power recording: **39.6 s (55%) less diagnostic dwell** under
that schedule. This arithmetic is not a measured human learning time. Geometry
still needs fresh acquisition, and the 25.6-minute traversal still requires
control, reserves and coverage. A lucky correct first investigation is allowed.
