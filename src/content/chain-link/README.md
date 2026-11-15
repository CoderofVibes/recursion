# Unseen Cathedral — N03 / Chain Link Fence

This folder is truth-side encounter content, never a source for model or view geometry.
`createChainLink(seed, options)` exports the finite encounter and `fieldRegistry`
using the existing `createFieldRegistry` contract. The agreed app route is
`?encounter=chain-link`; it needs 2F's shared loader, environment and objective hooks.
The provider alone does not make that route playable.

## Delivered interfaces

- `index.ts`: provider, separate sensed arrival survey, direct/cross-transfer
  arrivals, archive/content version, forward/C04 and cross-transfer/P03 destinations.
  `objectiveRules` uses 2F's real `reach-region` evaluator. `reachRegionRules` also
  exposes the requested whole-ship admission policy; today's shared evaluator is
  COM-only at tick endpoints, so its whole-ship extension remains an owner request.
- `layout.ts`: S17's eight finite sheets, clipped endpoints, radius 4 m, 80 m
  pitch and 20 U peak; four seeded rigid placements preserve the reference layout.
  Independent layer randomization awaits qualification. `referenceDatum` and
  `EXTERIOR_PROBE` are truth-side qualification paths, not player waypoints.
- `environment.ts`: `createChainLinkEnvironment(setup).at(simState)` composes the
  existing environment with a truth-only camera-channel scene. The existing
  `stepShipSystems` calls the new sensor adapter automatically when this scene is
  supplied. All ordinary bodies/rocks remain optical occluders.
- `latticePoseFromShip(ship, definition)` maps every assembly to its current body
  geometry and subtracts the actual COM through the field API. Each radiator and
  solar array uses its complete prism, including jammed/intermediate deployment.
  Compact assemblies use S17's explicit baseline mount-point approximation.

## The chronological damage boundary

Call `sweepLatticeExposure(field, {start,end,maxPointSpeed,poseAt}, options)` on
actual motion. `maxPointSpeed` must include translation, angular speed times
reach, COM movement and deployment speed; a chord length is not a bound. The
callback supplies every intermediate component shape. A caller must not replace
this with endpoint interpolation across a jam, thrust change or fault.

Outputs contain per-component geometric clearance enclosures, raw dose estimate,
rigorous dose lower/upper bounds, chronological slices, and threshold intervals.
`dose` is an adaptive Simpson estimate; the separately reported bounds may be
wider. A threshold interval marked unresolved cannot count as continuously above
or below. Refine ambiguous dose/dwell events before applying damage. The stepper
must stop at a localized trip/failure and recalculate later powered effects.
No field code owns susceptibility, equipment faults or power-loss decisions.

The scene never reaches the recorder directly. Sensors emit the versioned
`lattice.angular-fragments.v2` field-signal transport; decode with
`src/ship/sensors/lattice-observations.ts`. Its endpoints are anonymous noisy
gnomonic slopes in the measured camera basis, with correlated basis uncertainty.
The product's `Measurement.t` / `availableAt` is its completion time; reconstruct
using the original embedded `acquisition` interval and that interval's recorded pose.
It contains no true world pose,
layer IDs, complete grid, ranges or truth coordinates. Every packet's coverage
is unresolved: angular observations alone cannot prove an empty 3D opening.
2C owns association, parallax reconstruction, covariance, calibrated coverage,
archive replay and frozen forecasts. Scope frame IDs by the enclosing attempt.

## Measured scope

[DEMONSTRATED: `chain-link.test.ts`] The finite entry field reproduces S17's actual
radiator chord integral, 82.507936508 U s, while the COM is unexposed. The prescribed
centre path has a continuously bounded clearance over 16 m for the full current
deployed geometry in all four catalogue placements. A real production RCS abort
from 500 m upstream reverses the ship before field contact, spending actual fuel,
power and heat. These are separate geometry and early-abort checks, not a full
informed traversal or a damage/survival claim.

[DEMONSTRATED: sensor tests] Cold optics warm up before any field record; installed
camera/processor/recorder power and normal packet capacity gate retained samples.
Outage, low power, occlusion, motion smear and full storage leave missing evidence.

[ASSUMED] The standalone arrival has a 0.5 m / 0.01 m/s optical survey; a carried
arrival instead requires its actual briefing and preserves resources/state without
change. One massless survey rock anchors the navigator; all physical objects use
the game's unchanged inverse-2.5 law. These are local encounter choices, not a
claim that the complete expedition has earned these priors or reserves.

The finite exterior route remains open and longer than 3.3 km. Its sampled point
clearance does not establish whole-ship flight, electrical survival or reserve
cost; 3E must run those with the integrated owners' implementations. The ordinary
rocks do not make invisible walls. Nothing repositions in response to steering.

Reference: S17 commit `7bdcfbf`, S5 `lattice.md`, DECISIONS A16/P11.
