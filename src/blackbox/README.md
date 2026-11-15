# src/blackbox — Black Box

Owner: 2C. Belief side (P11): records hold only what the ship sensed or commanded. Black Box keeps every attempt, saved procedures, adopted extensions and every test of a rule across recurrence and into later encounters (P8, A4); the model is rebuilt from these records, so it carries over.

## Recording an attempt (`recorder.ts`)

```ts
import { AttemptRecorder, START_CURSOR, attemptId, nextAttemptIndex } from '../blackbox/index.ts';

const index = nextAttemptIndex(archive);
const recorder = new AttemptRecorder({ id: attemptId(index), index, encounterId, startedAt: new Date().toISOString(),
  start: { estimate: briefing.arrivalEstimate, configuration, modelVersion } });

recorder.recordMeasurements(stepResult.measurements);   // acquisition order; out-of-order throws
recorder.recordExecuted(executedCommands);
recorder.recordEvents(sensedEvents);
recorder.recordPlan(plan);
recorder.recordForecast(forecast);                      // issued forecasts only (frozen)
recorder.noteModelVersion(state.version);

const { delta, cursor } = recorder.since(lastCursor);   // hand-off to model.append()
await store.putAttempt(recorder.snapshot());            // now and then: data survives a closed tab
const final = recorder.end({ kind: 'lost', t, cause: 'collision' }, state.version);  // deep-frozen
```

- The measurement array index is the sequence number the model sorts by (contracts README); the recorder refuses data that goes back in time.
- Data up to the moment of loss is kept. After `end()`, nothing more can be recorded.
- `snapshot()` is a copy: later recording does not change it.

## Archive and storage (`archive.ts`, `store.ts`)

- `emptyArchive`, `withAttempt` (add or replace by id, ordered by index), `nextAttemptIndex`, `attemptsFor(encounterId)`, `withProcedure`, `withoutProcedure`, `withAdoptedExtensions`, `withExtensionTest` (append; tests are never edited, spec §11.4), `withExtensionDecision` (append an adopt or revoke; `adoptedExtensions` follows as its current result), `withLead`, `reissue`.
- `createBlackBoxStore(name?)`: IndexedDB in the browser (`IndexedDbBlackBoxStore`, one database per save slot, stores `attempts`, `procedures`, `meta`), memory elsewhere (`MemoryBlackBoxStore`, JSON-serialising like real storage).
- `load()` returns `{ archive }` with `archive.extensionTests`; every forecast is passed through `issueForecast` again, so it comes back frozen.
- `putMeta({ adoptedExtensions, leads, extensionTests, extensionDecisions })` stores the adopted rules, the chart of leads, every rule test and every adopt and revoke (the model's `ExtensionRecord`, a superset of the contract's `ExtensionTestRecord`: each test's state carries its validated spans).
- Pass `archive.extensionTests` and `archive.extensionDecisions` to the model's `load()`; they carry to later encounters (A4, A5).
- Record each attempt's briefing in `AttemptStart.briefing` (A10): the model takes that attempt's arrival geometry from it.

## Comparing two attempts (`compare.ts`)

```ts
const cmp = compareAttempts(recordA, recordB, await model.report());
```

| Field | Answers |
|---|---|
| `configurationDiffers`, `a.configuration`, `b.configuration` | What did I change (start configuration and recorded changes)? |
| `plans`, `executed` | Command diff: `same`, `changed` (with the differing fields, `t` included), `only-a`, `only-b`; paired by kind and equipment |
| `a.divergence[]`, `b.divergence[]` | Per issued forecast: measured position relative to a tracked body (from the fix's azimuth, elevation and range) against the forecast's, in metres and in σ of the forecast's 3D envelope (its 3×3 covariance, an ellipsoid) ⊕ the fix's noise (range σ along the line of sight, ρ·σ across it in both tangent directions); `firstBeyond3Sigma` = where the outcome left the forecast (RMS over 5 consecutive fixes > 3σ); `gaps` where nothing was measured; `unmeasured` |
| `a.residuals.coast/powered` | Whitened residuals split by whether thrust (main engine or RCS) was commanded, each labelled by direction: `along` the track, `normal` (out of the orbit plane), `range`, `accel` (spec §9.1) |
| `a.strength`, `strengthSummary` | Measured strength against distance per body (§9.2), with slope and profile inflation |
| `confounding`, `a.coverage` | Confounding indicator (§9.3) and what each attempt lacks |
| `a.missing` | Missing data, stated plainly (no model report, no fitted data, no forecast, unmeasured forecasts…) |

`forecastDivergence(forecast, record)` and `diffCommands(a, b)` are usable on their own. Divergence is three-dimensional: a ship that leaves its forecast out of the orbit plane is caught as surely as one that leaves it along the track.

## Procedures (`procedures.ts`, P9)

```ts
const p = saveProcedure({ id, name, record, from, to, state /* believed state at `from`; optional at arrival */,
  tolerance: { position: 5e3, velocity: 2, attitude: 0.05 } });
const match = matchProcedure(p, { encounterId, configuration, estimate });   // { matches, checks[] }
const plan = procedurePlan(p, planId, epoch);                                 // replay as a plan
```

Saved items are the commands that reached the ship between `from` and `to` (not rejected ones, not protection actions). `matchProcedure` says which condition differs (encounter, configuration, position, velocity, attitude); only a full match replays exactly. Position and velocity differences are 3D distances; the attitude difference is the angle of the rotation between the two attitudes.

In the game a procedure is kept with `GameControls.blackBox.saveProcedure(p)` (and forgotten with `removeProcedure(id)`): it goes into the archive's `procedures` and to the store (`putProcedure`, `deleteProcedure`), so it is there in the next attempt and after a reload (`src/game/belief/blackbox.ts`).

## Tests

`blackbox.test.ts`: recorder ordering, freezing and loss; storage round trip with forecasts reissued; model rebuilt from stored records equals the live model fed through the recorder; comparison finding where an outcome left a forecast (and not where it did not), divergence measured in 3D against a flat ellipsoid (3σ out of the plane, 1σ in it), plan and configuration diffs, residual split and missing data; procedure save, match and replay. The IndexedDB store was exercised in Chrome via the dev server (records written, read back, model rebuilt in a Web Worker).
