/**
 * BELIEF side (no truth imports). Coverage sensed in earlier attempts of an encounter
 * (`ViewSnapshot.coverageEarlier`, 2D's R6), rebuilt from Black Box records alone.
 *
 * Each earlier attempt is flown again on paper: a fresh navigator takes the attempt's recorded
 * commands, measurements and events in the order Black Box kept them, so where the ship
 * believed it was comes from its own fixes and the briefed bodies' believed motion, and the
 * camera's axis from the recorded `point` commands (its target, its direction, or its
 * boresight on the believed attitude), with the half-angle and reach from the design. The
 * looks are thinned the way the view's `CoverageHistory` thins its own: a new look begins when
 * a sensor has turned by more than half its half-angle, its cone has changed by a tenth, or the
 * ship has moved more than a fiftieth of its reach; otherwise the last look is renewed.
 *
 * Nothing here is remembered from the flight itself, so a restored save gives the same looks.
 */

import type {
  AttemptId,
  AttemptRecord,
  BelievedAsteroid,
  CoverageLook,
  EncounterBriefing,
  ExecutedCommand,
  Measurement,
  ShipDefinition,
  ShipEvent,
} from '../../contracts/index.ts';
import type { AttemptStartInfo, HandsOnThrust, HandsOnTurn, RecordBatch } from './ports.ts';
import { createStandInModel } from './standin-model.ts';
import { applyCommanded, initialCommandedState, sensorCones, type CommandedState } from './view.ts';

/** [ASSUMED] Ship time between the positions sampled along an earlier attempt, s. */
export const COVERAGE_SAMPLE_INTERVAL = 60;
/**
 * [ASSUMED] The most earlier looks a snapshot carries. Beyond it the oldest attempts' looks go
 * first: a 40 h attempt makes about 120 of them.
 */
export const COVERAGE_EARLIER_MAX = 2_000;
/** The view's thinning rule (src/view3d/flight/coverageHistory.ts). */
const TURN = 0.5;
const CHANGE = 0.1;
const MOVE = 0.02;

export interface CoverageReplayOptions {
  readonly ship: ShipDefinition;
  /** The encounter's briefing, for attempts that did not record their own. */
  readonly briefing: EncounterBriefing;
  readonly referenceRadius: number;
  readonly arrivalMass?: number;
  /** The same design answers the live navigator has, so the replay follows what it followed. */
  readonly handsOnThrust?: HandsOnThrust;
  readonly handsOnTurn?: HandsOnTurn;
}

/** The attempt's records as the batches they were recorded in: one per instant, in order. */
function batches(record: AttemptRecord): RecordBatch[] {
  const at = new Map<
    number,
    { executed: ExecutedCommand[]; measurements: Measurement[]; events: ShipEvent[] }
  >();
  const slot = (t: number) => {
    let entry = at.get(t);
    if (!entry) {
      entry = { executed: [], measurements: [], events: [] };
      at.set(t, entry);
    }
    return entry;
  };
  for (const e of record.executed) slot(e.t).executed.push(e);
  for (const m of record.measurements) slot(m.t).measurements.push(m);
  for (const e of record.events) slot(e.t).events.push(e);
  return [...at.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, entry]) => ({ attemptId: record.id, t, ...entry }));
}

/** Last time anything was recorded in an attempt, or when it ended. */
function endOf(record: AttemptRecord): number {
  const last = (items: readonly { readonly t: number }[]): number => items.at(-1)?.t ?? 0;
  const ended = record.outcome.kind === 'in-progress' ? 0 : record.outcome.t;
  return Math.max(ended, last(record.measurements), last(record.executed), last(record.events));
}

const angle = (a: CoverageLook['axis'], b: CoverageLook['axis']): number =>
  Math.atan2(
    Math.hypot(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x),
    a.x * b.x + a.y * b.y + a.z * b.z,
  );

/** Whether a sensor's cone now is close enough to its last look to renew that look. */
function same(last: CoverageLook, now: Omit<CoverageLook, 'from' | 'to'>): boolean {
  return (
    angle(last.axis, now.axis) <= TURN * now.halfAngle &&
    Math.abs(last.halfAngle - now.halfAngle) <= CHANGE * now.halfAngle &&
    Math.abs(last.range - now.range) <= CHANGE * now.range &&
    Math.hypot(
      last.origin.x - now.origin.x,
      last.origin.y - now.origin.y,
      last.origin.z - now.origin.z,
    ) <=
      MOVE * now.range
  );
}

/** Where the ship's sensors looked in one recorded attempt, oldest first. */
export function attemptCoverage(
  record: AttemptRecord,
  options: CoverageReplayOptions,
): CoverageLook[] {
  const briefing = record.start.briefing ?? options.briefing;
  // Only the rocks the camera was pointed at matter here; leaving the rest out keeps it quick.
  const targets = new Set<string>();
  for (const e of record.executed)
    if (e.command.kind === 'point' && e.command.target) targets.add(e.command.target);
  const knownAsteroids: BelievedAsteroid[] = briefing.knownAsteroids.filter((a) =>
    targets.has(a.id),
  );
  const navigator = createStandInModel({ referenceRadius: options.referenceRadius });
  const start: AttemptStartInfo = {
    attemptId: record.id,
    index: record.index,
    briefing: { ...briefing, knownAsteroids, arrivalEstimate: record.start.estimate },
    ship: options.ship,
    startedAt: record.startedAt,
    ...(options.arrivalMass !== undefined ? { arrivalMass: options.arrivalMass } : {}),
    ...(options.handsOnThrust ? { handsOnThrust: options.handsOnThrust } : {}),
    ...(options.handsOnTurn ? { handsOnTurn: options.handsOnTurn } : {}),
  };
  navigator.beginAttempt(start, record);

  const looks: CoverageLook[] = [];
  const latest = new Map<string, CoverageLook>();
  let commanded: CommandedState = initialCommandedState;
  const look = (t: number): void => {
    const world = navigator.believedWorld(t);
    for (const cone of sensorCones(options.ship, commanded, world)) {
      const now = {
        attemptId: record.id,
        sensor: cone.sensor,
        origin: world.ship.position,
        axis: cone.axis,
        halfAngle: cone.halfAngle,
        range: cone.range,
      };
      const last = latest.get(cone.sensor);
      if (last && same(last, now)) {
        const renewed = { ...last, to: t };
        looks[looks.indexOf(last)] = renewed;
        latest.set(cone.sensor, renewed);
      } else {
        const fresh = { ...now, from: t, to: t };
        looks.push(fresh);
        latest.set(cone.sensor, fresh);
      }
    }
  };

  const end = endOf(record);
  let next = record.start.estimate.t;
  for (const batch of batches(record)) {
    // Sample on the way to this batch, then take it in.
    while (next < batch.t) {
      look(next);
      next += COVERAGE_SAMPLE_INTERVAL;
    }
    navigator.ingest(batch);
    for (const done of batch.executed)
      if (done.status !== 'rejected') commanded = applyCommanded(commanded, done.t, done.command);
  }
  while (next <= end) {
    look(next);
    next += COVERAGE_SAMPLE_INTERVAL;
  }
  return looks;
}

/**
 * Coverage from every attempt of the encounter except `current`, oldest first and capped at
 * `max` looks (the oldest go first). `cache` keeps each attempt's looks between calls: a
 * finished record never changes.
 */
export function earlierCoverage(
  records: readonly AttemptRecord[],
  current: AttemptId,
  options: CoverageReplayOptions,
  cache: Map<AttemptId, readonly CoverageLook[]> = new Map(),
  max = COVERAGE_EARLIER_MAX,
): CoverageLook[] {
  const all: CoverageLook[] = [];
  const earlier = records
    .filter((r) => r.id !== current && r.encounterId === options.briefing.id)
    .sort((a, b) => a.index - b.index);
  for (const record of earlier) {
    let looks = cache.get(record.id);
    if (!looks) {
      looks = attemptCoverage(record, options);
      cache.set(record.id, looks);
    }
    all.push(...looks);
  }
  return all.length > max ? all.slice(all.length - max) : all;
}
