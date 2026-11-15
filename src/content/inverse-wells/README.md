# P03 — Well Garden

`createInverseWells(seed, options)` now defaults to the owner-selected S22 funnel
prototype. It returns `EncounterSetup` with `fields`, plus `fieldRegistry` for
direct tests, exit descriptors, content version/status and the initial saved
`funnelLifecycle`. Runtime content is truth-side; screens receive acquired products.

## Loading

The owner and 2F confirmed the route. `INVERSE_WELLS_ENTRY` is registered in
`src/game/encounters.ts` under the explicit one-entry path grant. Load
`?encounter=inverse-wells`; save format 3 isolates it from the historical sphere
prototype. `create(run)` uses nominal S22 entry 22000 for run 0 and an independent
catalogue selection/noise seed later. Gravity remains the fallback encounter.

2F's `37aae5c` passes `setup.fields` to `createSimulation`; the registered encounter
is tested through 100 real truth ticks and pre-birth replay. Field injection alone
does not apply saved birth decisions or structural throat loss. These shared game/sim
integrations and the window mount are listed in `docs/handoffs/3B.md`; no second
game loop, recorder or rule-fitting system is supplied here.

## Physics and content

[FICTIONAL: A19/S22] Funnels pull coasting ships toward their throat. Axial
propulsion reverses, both transverse components remain ordinary, and the throat
is terminal. Pull is absent from IMU specific force; reversed delivered thrust
is sensed. Actuator torque and fuel/power/heat costs remain ordinary.

[ESTABLISHED: A19 after S22, owner-selected prototype] Fixed 120 km length, 20 km mouth, 1 km throat,
quadratic taper, 5 km caps, 0.02–0.10 m/s² pull and a 120 s birth ramp.
The owner confirmed the 900 s precursor and prefers harder rather than easier
tuning. This port preserves the study's values; it has not softened its physics.

`s22Layout(id)` selects one of seven admitted mechanics entries;
`seededS22Layout(seed)` selects through an independent named RNG stream.
`s22LocalWells(id)` reproduces the study's geometry stream exactly: 2,601 reserved
sites, random 3D axes, 650 scheduled births, guaranteed separated bounds. Placement
rotates geometry and arrival together; the external sun remains fixed.

The body list contains only one established throat as the legitimate zero-GM
navigation reference. Thousands of other throats stay in the hazard index; dormant
sites never become physical bodies. The initial briefing is an explicitly assumed
noisy optical survey of that one reference, not a catalogue or an adopted field rule.

`createFunnelHullHazards` supplies indexed actual occupied-prism contact tests and
straight COM sweeps for unchanged hull/attitude, clipped to active birth intervals.
The game/sim owner must localize general curved, rotating or deploying hull contact
and stop at the earliest loss; the helper does not install that shared event policy.

`import-s22.mjs` copies only committed, schema-checked study data. The runtime
catalogue is separate from the full independent test vectors:

```
node src/content/inverse-wells/import-s22.mjs 48309d4
```

Historical `MECHANICS_PREVIEW`, `s16Layout()` and S5/S16 tests remain explicit
controls. Their sphere geometry, coast invariance and arrival certificates are
superseded for the playable content.

## Lifecycle and continuing arrivals

`createFunnelLifecycle`, `nextFunnelLifecycleEvent`, `advanceFunnelLifecycle`,
`restoreFunnelLifecycle` and `funnelLifecycleActivation` provide plain saved state.
The owner of the game loop must split at event epochs, supply the actual committed
ship state and current hull bound once per due birth, and persist activation or
permanent veto. Same-time births share one sample. A restored past event is never
re-evaluated. Rebuild immutable field snapshots after decisions and invalidate
cached simulation forces. Do not run complete state validation/index construction
on every force query.

`options.arrival` carries the actual surviving ship, definition and acquired
briefing in the Garden frame. `options.lifecycle` and `options.runEpoch` preserve
continuous phase; late arrivals require saved decisions at their actual epoch.
No repair, refill, arrival maneuver or free survey is applied. General nonzero
session-epoch handling remains 2F/3D's integration task.

## Exits and evidence

The owner selected a finite destination sphere entirely beyond S22's forward
disc for this prototype, with 1 km between the plane and the sphere. The source disc remains a separate exact numerical
reference. Both nominal reference exits coast into the destination sphere.
The optional exterior N03 sphere is an assumed connector awaiting actual transit
and surviving-ship admission. Shared `reach-region` currently evaluates COM;
whole-ship transfer admission remains an integration requirement.

`funnel-experiments.ts` supplies seven independent controlled starts for actual
ship/sensor comparison: axial-away, two transverse directions, outside, coast,
side-edge and mouth-cap. These are author/harness fixtures, never live teleports.
The legacy experiment module remains separately labeled by its spherical layout.

`projectFunnelOptics` produces angular contour rays from truth geometry using
required caller-provided visible subsegments, brightness and observed phase.
It invents no photometry, occlusion, camera acquisition or fade duration.
The window renderer accepts only that optical product; FLIGHT uses fitted v2
geometry with lineage, uncertainty and freshness. Neither implies rule adoption.

## Verification and limits

```
npm exec -- vitest run src/sim/fields/wells.test.ts src/content/inverse-wells src/view3d/fields/wells src/console/encounters/inverse-wells
npm run check
npm run build
```

[DEMONSTRATED] Local vectors, second-order convergence, force/work ledgers, real
IMU/ship resource comparisons, deterministic lifecycle replay, all nominal geometry
and both full-field production numerical translations are tested. Full-field routes
use delivered forces, not a measured finite-turn/RCS or complete learning loop.
Tests using 0.25 s substeps do not certify the provider's 1 s gameplay tick.
Browser startup remains unverified: the in-app browser timed out connecting to the
local Vite server during this checkpoint.

The slow exterior bypass remains physical: S22's 726.769 kg / 51.519-day numerical
route is not hidden behind a knowledge flag or artificial fuel charge. Actual
endurance, camera/model recovery, complete birth/crush chronology, window visibility,
worn/cross-transfer flights and human playability remain the named owner checks.
