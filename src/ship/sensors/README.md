# Sensor acquisition

`index.ts` retains the existing 3D camera, IMU and star-head measurements. A component's
`values.reportedCondition`, when supplied by the condition owner, controls declared sigma
and condition telemetry; its actual `condition` controls availability and random draws.
Without that reported value, the prior diagnosed-condition behavior is unchanged.

## Lattice channel

`lattice.ts` is truth-side acquisition. `lattice-observations.ts` contains only the recorded
DTO and its codec, and imports neither truth nor field implementations.

At new encounter creation, call `initializeLatticeSensorStreams(state, seed)`. It creates
one independent stream and never replaces a saved stream. The environment supplies a
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
  a completed product is not a new raw camera exposure at delivery time. The unknown processing channel's pre-loss diagnostic tiles and
  persistence of optional raw imagery remain Black Box integration work.
- 3A supplies a separately reported condition after diagnosis; hidden condition damage
  may then appear as residuals. Acquisition neither applies radiation damage nor
  suppresses its physical consequences.
- The game owner supplies the truth scene only at its actual simulation time. It must
  connect the authored encounter environment and exposure chronology to the live loop.

[DEMONSTRATED: `lattice.test.ts`] Production ship power/thermal/recording, the authored
environment and simulation produce angular observations after the 30 s cold camera
warmup. Tests also cover unpowered/failed hardware, occlusion, range, exact save replay,
partial frames through the actual `AttemptRecorder` and archive replay, blackout,
raw headroom, stale records, shared basis error and unreported condition. A repeated
192-fragment image proves the serialization cap does not starve later image support.
The original 3D and planar sensor tests remain unchanged. These checks do not establish
triangulation, a certified opening, electrical survival or human first-contact difficulty.
