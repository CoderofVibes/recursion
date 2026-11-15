# Sensor acquisition

A24's physical radiation monitor, channel, caution policy and exact owner seams
are documented in [RADIATION.md](RADIATION.md).

`index.ts` retains the existing 3D camera, IMU and star-head measurements. A component's
`values.reportedCondition`, when supplied by the condition owner, controls declared sigma
and condition telemetry; its actual `condition` controls availability and random draws.
Without that reported value, the prior diagnosed-condition behavior is unchanged.

## Lattice channel

`lattice.ts` is truth-side acquisition. `lattice-observations.ts` contains only the recorded
codec and re-exports its DTO from the additive `src/contracts/lattice-acquisition.ts`.
The diagnostic codec re-exports its shared DTO likewise. These data contracts import
neither truth nor field implementations; no existing contract or emitted packet changed.
The optional `LatticeRecordedProduct` adapter adds known run/attempt/navigation-frame
scope and immutable original measurement-index/sample lineage for 2C. It is not itself
a sensor packet. Build it only when the enclosing scope is actually known; never assign
old unscoped records to the current run or renumber indexes after filtering the archive.

At new encounter creation, call `initializeLatticeSensorStreams(state, seed)`. It creates
independent processed-channel and raw-diagnostic streams and never replaces saved streams. The environment supplies a
`fieldSignals[fieldId]` scene with `kind: lattice-scene-v1` and finite `segments: [{a,b}]`.
Only acquisition reads that scene. Opaque scene targets, the real camera mount, attitude,
field of view, range, smear, warmup, settling, electrical delivery and temperature bound
what reaches the camera. The truth scene is never copied into a measurement.

[FICTIONAL: A16, S5, S17] The existing camera has a structured angular channel. Acquired
fragments are anonymous gnomonic endpoint slopes in its optical frame, accompanied by
its measured body-frame basis. A separately sampled common rotation perturbs the whole
basis; `basisSigma` is its isotropic angular sigma, with `basisCorrelation` explicitly
`frame-common-rotation`. Every ray in the frame shares this error. The encoded basis
never provides the exact true body projection of an inertial aim or target bearing.
They contain no world coordinates, true attitude, range, strand/layer IDs or field seed.
The acquisition interval is `[t,t]`: the supplied environment is one instant, so a long
tick cannot manufacture earlier observations. `exposure` is the instrument setting used
for smear/quality, not a claim that intermediate scene history was integrated.

[ASSUMED: S17 `black-box.md`] At 350–1,000 W, processing targets 0.2–2 Hz, capped by
camera delivered watts / 120 and recorder rate. A 200 W camera caps acquisition at 5/3 Hz.
Full-power slope sigma starts at 0.0005; low power and believed condition widen its
reported value, while actual condition determines the draws. The 1,200 m detection
range and 12 m fragment subdivision are explicit acquisition settings, not a measured
clearance capability. A bounded raster cycles through image support instead of always
selecting the earliest strands in a truth array.

Frames travel in the existing `field-signal` contract on `lattice.angular-fragments.v2`.
Version 1 is rejected: it did not distinguish product availability and ray acquisition
and did not declare the shared measured-basis uncertainty.
Use `decodeLatticeFrame` rather than interpreting array offsets in another module.
The maximum serialized frame is 16 KiB. Fragments are reduced and coverage marked
truncated when that limit is reached. The full immutable frame is published only after
all its bytes fit into actually scheduled recorder packets; no synthetic recorder
ticks are created. `Measurement.t` is the completion time of this **processed product**,
so the ordinary recorder accepts it in the real stream without going back in time.
The decoded DTO calls this `availableAt`; its separate `acquisition` interval remains
the original camera instant. A consumer must use navigation at acquisition for ray
placement and must not treat the product as available before completion. Timestamp
replacement has a reserved byte allowance. The raster cursor advances by the count
actually retained after serialization limits, so repeatedly clipped frames cannot
permanently skip the same image region.

The packet budget reserves ordinary sensor data first: 64 bytes of packet metadata,
an 8-byte changed-channel header plus Float64 values/nonzero sigmas, or a 2-byte
repeat reference. This is a lossless **onboard transport accounting format**; it is not
a claim about the size of expanded JSON stored by the browser's Black Box archive.
Its repeat dictionary is saved in sensor memory. An incomplete frame occupies one
volatile pending slot; frames arriving while it is busy are dropped and counted.
Processor power loss discards an unfinished frame, because the unrecorded tail is not
evidence. Recorder power loss cannot publish one. Optional high-recorder/detail-camera
raw diagnostics charge the baseline additional 1 MB/s and stop before entering the
metadata reservation. Processed frames have no additional 200 kB/s storage tariff.

## First-pass raw diagnostic (A16, after S17)

`lattice-diagnostic.ts` records a coarse, uninterpreted **8×8 camera image**, even while
the science processor stays in its ordinary 40 W idle mode. A healthy processor must
actually receive at least 40 W; the camera and recorder must also be healthy, powered,
warm, thermally valid and untripped. No star fix or IMU solution is required to retain
an uninterpreted image. It is not a reconstructed field or a calibrated clearance map.

`lattice-diagnostic-observations.ts` decodes `field-signal` channel
`lattice.raw-tile.v1`: version/sequence, acquisition `[t,t]`, `availableAt`, FOV/exposure,
actual camera/processor watts, native acquisition rate, elapsed time since the previous
retained tile, and 64 noisy quantized counts. Counts are 0–15; `null` pixels (encoded
as -1) are unknown/occluded. Coverage is always unresolved. The tile has no camera
basis, pose, world points, layer/strand IDs, range or geometry. Archive identity comes
from its enclosing attempt; its sequence is attempt-local. The raw channel count sigma
includes quantization and believed camera condition; actual condition controls draws.

Every **complete serialized measurement** is checked against 1,024 bytes and the real
remaining packet capacity. It occupies an existing 4,096-byte diagnostic packet before
optional processed frames. The diagnostic scheduler can request a packet independently
of a low ordinary sample-rate setting, but it never changes that setting or the recorder
power curve: requested/actual delivery must already support the packet. The baseline
minimum 15 W recorder supports 1 Hz; 14 W produces no packet. A 120 W camera produces
at most one fresh tile per second; 60 W survey mode supports only 0.5 Hz, leaving honest
gaps. Missing bytes or unavailable hardware produce missing tiles, never duplicated
stale data. Metadata records actual elapsed time, and `ext.latticeDiagnostic.missedSlots`
counts acquisition slots lost to packet capacity. If normal and diagnostic schedules
coincide, one packet is charged. The physical packet cursor prevents exceeding delivered
recorder throughput. The existing 8 GB store and optional 1 MB/s raw-capture cost remain.

3A's agreed `radiationRestartUntil` and `thermalInhibited` values inhibit fresh output
from cameras, IMUs, star heads, processors and recorders even when electrical draw stays
positive. Acquisition uses the merged `src/ship/condition/index.ts` owner's
`functionAvailable(e,t)` directly. Power/thermal housekeeping may still be recorded
by the working recorder. A powered reboot does not reset the camera's electrical warmup.

3A's dispatched `powerDraw` includes radiation leakage, which produces heat rather than
instrument work. `functionalPower` removes that multiplier for camera/processor quality,
cadence and availability, IMU/star-head minimum delivery, and recorder throughput. Recorded
electrical watts remain the full measured draw; leakage never buys better observations.

Every angular-only coverage state is **unresolved**. Blank, occluded, low-power,
truncated or stale observations never certify an empty opening. `latticeFrameFreshness`
labels age without deleting retained observations. Frame and fragment IDs are local
to an attempt; the recorder/model must add attempt/run lineage, and must never align
old-run geometry into a new run merely because sequence numbers match.

## Retained-owner integration

- 2C consumes only completed measured frames, associates anonymous fragments across
  views, triangulates using recorded navigation/attitude and correlated uncertainty,
  and requires independent detection coverage before claiming a clear corridor.
  Replay preserves product completion order and the embedded acquisition lineage;
  a completed product is not a new raw camera exposure at delivery time. The ordinary
  recorder already retains diagnostic tile measurements and their acquisition lineage;
  2C/2D must expose these stored images as unexplained channel evidence after loss.
  Persistence of optional full raw imagery remains Black Box integration work.
- 3A supplies a separately reported condition after diagnosis; hidden condition damage
  may then appear as residuals. Acquisition neither applies radiation damage nor
  suppresses its physical consequences.
- The game owner supplies the truth scene only at its actual simulation time. It must
  connect the authored encounter environment and exposure chronology to the live loop.
  Call the environment/sensor pipeline at real acquisition deadlines: at least 1 s
  diagnostic scheduling and finer slices for high-rate processing/recording and damage
  events. A single 20 s environment snapshot produces one tile, not twenty imagined
  views. Each omitted interval remains a gap. The available power curve is unchanged;
  any generic arrival whose actual recorder delivery cannot support 1 Hz needs its
  owning game/ship integration to provision that minimum while sensing.

[DEMONSTRATED: `lattice.test.ts`] Production ship power/thermal/recording, the authored
environment and simulation produce angular observations after the 30 s cold camera
warmup. Tests also cover unpowered/failed hardware, occlusion, range, exact save replay,
partial frames through the actual `AttemptRecorder` and archive replay, blackout,
raw headroom, stale records, shared basis error and unreported condition. A repeated
192-fragment image proves the serialization cap does not starve later image support.
The original 3D and planar sensor tests remain unchanged. These checks do not establish
triangulation, a certified opening, electrical survival or human first-contact difficulty.

[DEMONSTRATED: `lattice-diagnostic.test.ts`] Idle processing with a selected 0.05 Hz
science rate retains fresh 1 Hz tiles through the actual recorder within packet limits.
The production ship/environment warms cold optics, retains the authored field's image,
and never enables reconstruction. Tests retain prior tiles after camera failure,
reject camera/processor/recorder reboot output, preserve housekeeping, enforce power,
occlusion, storage and 1 KiB bounds, and replay the actual archived measurements exactly.
Actual 3A upset/recovery and thermal-protection outputs also exercise the adapter;
retained images survive the outage, with no fabricated readings during recovery.

[DEMONSTRATED: `lattice-power.test.ts`, `lattice.test.ts`] Real power dispatch with
radiation leakage cannot cross camera/processor/recorder thresholds, raise cadence or
improve angular uncertainty. An actual processor upset discards an unfinished frame;
a recorder-only upset pauses retention while powered processing memory preserves the
original acquisition. Recovery and archive replay keep acquisition and availability distinct.
