# Radiation monitor (A24 / R37)

The monitor is part of `flight-cpu-a`: its existing 25 kg package, active 120 W /
120 W heat, and standby 20 W / 20 W heat include this function. No equipment,
mass, allocation, heat source or command is added. It works only with the host's
selected mode fully powered (after radiation leakage), valid temperature and
3A functional availability. A failed, tripped, rebooting or cold host cannot report.

Its physical sensing point is the CPU's configured body position, nominally
`(2, 0.5, 1)` m. `sampleRadiationAtMonitor` transforms that point using current COM,
attitude and production configuration geometry, then sums the fields' point
intensities. It never reads `EnvironmentEffects.intensity`, `state.exposure`,
component maxima or component-dose events. A forward camera or deployed part can
therefore be hit before the monitor sees anything. This is local detection, not
advance warning or a clearance certificate for the ship.

## Instrument and recording

[ASSUMED: A24 gameplay instrument; not Curiosity RAD hardware specifications]

| Setting | Value |
|---|---:|
| Unit | U = d(U s)/dt, the existing fictional exposure units |
| First-order response time constant | 0.25 s |
| Startup/recovery settling interval | 0.25 s |
| Maximum retained cadence, active / standby | 10 Hz / 1 Hz |
| Readout upper limit | 25 U |
| Pre-clipping nominal sigma | max(0.0005 U, 2% of response capped at 25 U) |
| Caution / clear threshold | above 0.02 U / below 0.01 U |
| Freshness | 2 s from acquisition |

Response is causal. The previous input drives the exponential response only through
the interval supplied with that actual physics sample; a new snapshot never fills
an earlier gap. Missing input, a gap or host outage restarts settling. Response can
continue while the recorder is unavailable, but missed readings are never queued or
replayed. Explicit zero input decays the response; absent input is not zero.

Noise uses the independent saved `sensors.flight-cpu-a/radiation` stream. Actual
condition affects draws; declared sigma is estimated from the noisy readout and
reported condition, never the hidden response. Readout clips
at zero and 25 U. Over-range readings carry `saturated: true`; 25 U is an instrument
lower limit, not a precise instantaneous environmental rate. Lag and clipping mean
the sigma is not a bound on a missed peak. Its observed-amplitude estimate cannot
reveal the noiseless response or the hidden magnitude of an over-range peak.

Fresh states initialize the independent stream through `sensorStreamNames` without
changing the original ten navigation streams. On an older save, the game owner must
call `initializeRadiationMonitorStream(state, originalKnownSeed)` once; it preserves
an existing stream. Acquisition never invents or reseeds a missing stream.

The codec uses the existing variable-length `field-signal` kind, constant field
`radiation-monitor` and channel `radiation.dose-rate.v1`. This is an instrument
channel identity, not an observed physical field ID. Values are
`[rate, saturated(0|1), responseTime, saturationRate, validUntil]`; sigmas are
`[rateSigma, 0, 0, 0, 0]`. `Measurement.t` is the readout acquisition time. The new
`RadiationDoseRateReading`, `RadiationCaution` and `RadiationCautionState` contracts are additive; no existing
measurement kind, event, attempt or save shape is changed.
The v1 response, scale and validity metadata are checked exactly. Changing those
calibrations requires a new channel version; old records must keep their original meaning.

Each reading consumes 88 bytes of the existing onboard packet format: an 8-byte
channel header and ten Float64 values/sigmas. It is admitted after ordinary
instrument/housekeeping data and before optional imagery, only if it fits a real
charged packet. No sample is drawn or retained without recorder service, available
storage and capacity. A positive selected recorder rate permits a monitor packet
at the recorder's actual physical cadence, capped by the monitor's native cadence;
selected rate zero disables recording. Standby's 1 Hz fits its 100 B/s data budget.
The reading may share a packet with other data; coincident schedules charge once.

## Owner integration

1. **2F environment:** call
   `withRadiationMonitorInput(env, state.world.ship.systems, definition.ship, fields)`
   from `radiation-environment.ts` with all current intensity fields, including an
   explicit empty list in known zero-field space. It writes a truth-only
   `{kind:'radiation-monitor-input-v1', t, rate}` under `fieldSignals['radiation-monitor']`.
   It replaces the previous input; never accumulate old samples. The Gravity
   crescent hook must add its same-time detector-point contribution to the base
   fields, or pass the complete combined list. The owned standalone Chain Link
   environment already supplies this point input.
2. **2F scheduling / A12:** run the sensor pipeline at actual physics/acquisition
   deadlines, with fresh point inputs (at most 0.1 s for 10 Hz). After retaining each
   measurement batch, call `radiationCaution(measurement, now, previousState)` from the
   belief-safe `radiation-observations.ts`, starting with `{}`. Retain the returned
   `RadiationCautionState` including `latestReadingAt` even after `caution` clears.
   Save this policy state, or rebuild it in record order using each record's own
   time before displaying its age at the current time; do not replay old events as
   fresh measurements on resume.
   A transition from no `caution` to a `caution` must immediately
   set warp to 1× and stop the remaining ticks in that rendered frame. The existing
   session loop needs this measured-caution wiring. No truth input belongs
   in this check. The helper retains the caution on missing, stale or out-of-order
   data; only a fresh unsaturated low reading clears it. A retained stale caution
   must be labelled stale by `validUntil`, not painted as a current measurement.
3. **2C / 2D:** decode with `decodeRadiationReading`; preserve original times and
   saturation in archive/loss review and the live dose-rate display. Low local rate
   does not certify any component or spatial gap safe. The record includes no
   component doses; 3A's separate R35 removal of `exposure` events is merged through
   main `6ac2397`.

The sensor code does not own the session's warp or screen alerts. A codec/caution
unit test alone is not a demonstrated app-level warp drop.
