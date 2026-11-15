# R36 funnel camera handoff

The channel is implemented and tested in `src/ship/sensors/wells*`. The owner
assigned the live dispatcher and shared packet budget to **3C**; this branch does
not edit `src/ship/sensors/index.ts`. Additive recorded-data types are in
`src/contracts/wells-acquisition.ts`, with type exports from the contract index,
for the integrator's merge review. No new measurement kind or field-registry
contract is introduced.

## 3C: dispatch API

Import from `src/ship/sensors/wells.ts`:

```ts
initializeWellCameraStream(state, runSeed): ShipSystemsState
wellCameraSchedule(state, definition, env, recorderRate): { rate, nextAt, due }
stepWellAcquisition(state, definition, env, dt, packetBudgetBytes, recorderRate)
  : { state: ShipSystemsState, measurements: Measurement[], bytes: number }
```

- Seed `sensors.camera/well-contours` **once**, alongside ordinary sensor streams.
  Initialization preserves an existing stream without drawing or resetting it.
  The Garden provider initializes fresh arrivals. Carried arrivals retain their
  ship identity; 3C should add the stream name to the existing creation hook, and
  2F/3D should migrate older saves once using the original run seed. Never reseed
  at each encounter, sample or restore. A due camera with a missing stream throws.
- Call with the actual scene/hardware snapshot at `env.t`, after delivered power
  and ordinary warmup/pointing readiness have been resolved. `dt` does not create
  past images. The scheduler gives an upper cadence of
  `min(recorderRate, cameraPower / 120 W)` with the baseline camera; 60 W is the
  minimum tracking power. The original camera optics function and definition
  supply condition, exposure, field-of-view and angular-noise behavior.
- Pass **only unspent bytes of a real packet**, after ordinary readings and
  earlier optional channels/diagnostics. Pass zero if no packet or no capacity.
  Deduct returned `bytes` before any further product gets that budget. The helper
  never increments `recorder.bytesUsed` or reserves another packet. Lattice and
  wells must not receive the same spare capacity independently.
- Preserve returned `rng` and `ext` and append returned measurements in order.
  State is pure JSON. It holds one bounded volatile pending image. Incomplete
  frames publish nothing; subsequent packets can complete them. `Measurement.t`
  becomes the time retention completes, while the encoded acquisition remains
  the original instant. A new frame may follow a completed old frame in the same
  packet if there is space. Turning the camera off, losing tracking power or
  losing function drops its pending image. Overflow drops newer images without
  consuming their noise draws. Retained evidence remains in the Black Box.
- This is an additional feature extraction from the existing camera image, not
  a second optical instrument. It adds no fictitious watts, range sensor or
  science-processor hardware prerequisite. Existing power and thermal integration
  remains authoritative. Camera and recorder must function; a camera image may
  exist without a working star tracker, but then its inertial alignment needs
  independent evidence.

The module imports the existing `opticalQuality` function from the sensor index.
No function from that index is called during module initialization; 3C can use a
normal static dispatcher import. The focused tests also verify that acquisition
does not advance ordinary sensor RNG streams or change their readings.

## 2F/2D: current luminous scene

Supply a `WellsSensorScene` as a truth-side `env.fieldSignals` value, at the exact
current `env.t`:

```ts
{
  kind: 'well-camera-scene-v1',
  t, valid: true, truncated: false,
  segments: [{ from, to, phase, adequateSignal }]
}
```

`from`/`to` are inertial physical positions of **static emitted light**, not
inferred geometry. `phase` is observable morphology (`unresolved`, `precursor`,
`ramping`, `active`, `fading`), not permission to copy a force activation flag or
an unobserved timer. `adequateSignal` must reflect the light producer's actual
visibility/illumination decision. For uncertain phase, supply `unresolved`.
Absent/invalid light supplies no frame; dark or unresolvable support in a valid
scene can give an empty image with unresolved coverage.

`funnelOpticalSegments(spec, { stations, azimuthSegments })`, exported from
`src/content/inverse-wells/optics.ts`, supplies the same quadratic contour and
meridian geometry used by the window projector. The camera producer maps only
emitting, sufficiently lit portions into the scene. The channel clips these to
the actual camera cone and opaque body/asteroid spheres from `env.targets`, using
the configured camera aperture, current COM and quaternion attitude. It preserves
visible middle segments even when both endpoints lie outside the FOV, and keeps
disjoint pieces around an occluder. Static throat crush volumes are not opaque
bodies just because they are hazards.

The scene producer still owns emission completeness, photometry, glare and any
occlusion beyond those environment spheres (including ship self-occlusion).
It must clip/reject that light before supplying segments. No 350 km sensitivity,
known-size range prior, brightness law or precursor fade duration is invented.
S22's 350 km/two-view/600 s conditions remain acceptance targets. The fixture at
350 km explicitly supplies adequate emission; it does not demonstrate detection
at that range in the live game.

Bound scene construction/culling before dispatch: at most 65,536 total supplied
segments, 64 retained contours and 16 KiB per pending frame. These are extraction
and buffering limits, not a visibility range. Set `truncated` whenever the scene
producer omitted support for its budget. Extraction rotates through image-space
order across frames; every frame's coverage stays `unresolved`. The channel has
no field catalogue and cannot certify unobserved space as clear.

## 2C: recorded-data API

Import **only** from `src/ship/sensors/wells-observations.ts` and the additive
contract types. The codec depends only on recorded types and vector arithmetic,
not truth, scene production or physics:

```ts
decodeWellCameraFrame(measurement): WellCameraFrame | undefined
encodeWellCameraFrame(frame): Measurement
wellCameraFrameFreshness(frame, now, maxAge): 'fresh' | 'stale'
```

Wire envelope: `kind: 'field-signal'`, `field: 'well-camera'`,
`channel: 'wells.contour-bearings.v1'`, `source: 'camera'`. The versioned numeric
header has 20 values; each contour adds 11 values. The decoder rejects malformed
dimensions, nonfinite values, invalid chronology, non-orthonormal bases,
non-positive/invalid covariance, unknown phases and contradictory generic sigma.
Use the codec rather than depending on offsets.

The product contains uncertain **gnomonic image slopes** at each contour endpoint
and a noisy camera basis in **body coordinates**. The measured body ray is
`normalize(forward + u*right + v*up)`. The record does not contain the true ship
attitude. Align to inertial space using separate, contemporaneous acquired
navigation evidence and its uncertainty.

Propagate both endpoint covariance `[xx, xy, yy]` and the **frame-common rotation**:
`basisSigma` is the standard deviation of each independent rotation-vector axis.
It is one common error across all endpoints; it must not average away as if every
contour supplied a separate pointing fix. Generic `Measurement.sigma` for basis
components is a conservative scalar bound, not nine independent basis errors.
Endpoint generic sigma holds the covariance's diagonal standard deviations.

[ASSUMED] Half the baseline boresight angular variance is assigned to that common
pointing error; the remaining, field-angle-dependent variance goes to independent
endpoint errors. A contour must subtend three camera sigmas to be extracted.
Smear uses the existing exposure limit and a conservative all-points bound
`(|apertureVelocity| / minimumStrokeRange + |bodyRate|) * exposure`; it can discard
otherwise trackable support, but cannot miss an interior high-rate piece merely
because a few sampled endpoints were still. Hidden condition changes actual noise;
reported condition controls the published uncertainty, as in ordinary sensors.

There are no site identities, physical endpoints, lengths, ranges, axes, force
coefficients, birth deadlines or crush/guard results in the product. Frame-local
contour IDs are not persistent correspondences. Preserve the **original**
measurement index and run/attempt/encounter/frame scope in `WellRecordedProduct`
and its lineage; never renumber after filtering or join repeated local IDs across
attempts. Freshness ages from acquisition, not delayed publication. Staleness does
not delete historical evidence.

Geometry requires multiple acquired views and joint uncertainty. Pull and burn
reversal require separate time-aligned motion/IMU/command experiments. This
channel does not fit, adopt a rule, issue a forecast or label a route safe.

## Verification boundary

`npm run check`: 1,182 passing tests, one existing skip, plus the isolated
performance test. `npm run build`: passed, retaining the existing large-bundle
and lattice dynamic-import advisories. The 63 focused camera, clipping, optics
and provider tests pass, including 46 new camera tests.

Focused tests cover authored S22 support, arbitrary attitude/COM/aperture,
power/readiness/settlement/thermal/reboot/condition gates, FOV and partial occlusion,
smear, anonymous output, dense-frame fairness, cadence, finite byte budgets,
delayed publication, power-loss discard, deterministic save/resume and strict
wire decoding. The real ship step demonstrates power and warmup before capture;
an actual `AttemptRecorder` test retains and JSON-round-trips completed frames.
These are channel/recorder contract tests. **Live dispatch and combined lattice +
wells packet arbitration remain 3C's integration**, and the light producer remains
2F/2D's integration. A production admission rerun must follow those integrations.
