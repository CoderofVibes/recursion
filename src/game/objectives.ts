/**
 * TRUTH side. Decides objectives from the true world each tick. The result reaches the ship as
 * `ShipEvent` `objective`; nothing else about truth leaves this module.
 */

import type { BodyId, ObjectiveId } from '../contracts/ids.ts';
import type { ShipEvent } from '../contracts/measurements.ts';
import type { TruthWorld } from '../contracts/truth/index.ts';
import type { Vec3 } from '../lib/vec3.ts';
import { accelerationFrom, coupling } from '../sim/index.ts';
import type { ObjectiveRule } from './encounter.ts';
import { innerNeck, jacobiConstant } from './jacobi.ts';

/** Progress of one orbit-band rule. Plain data, part of the game's truth state. */
export interface BandProgress {
  readonly inside: boolean;
  /** Unit vector from the body to the ship at the last tick. */
  readonly direction: Vec3;
  /**
   * Unit normal of the plane the ship is sweeping in, pointing the way that counts as positive.
   * Absent until the ship has moved about the body inside the band.
   */
  readonly normal?: Vec3;
  /**
   * Angle swept about the body since entering the band, rad: the angles between successive
   * directions, added while the ship keeps going round the same way and subtracted when it
   * turns back. Positive for the way round that is counter-clockwise seen from +z.
   */
  readonly swept: number;
}

/** A gravity-assist witness about one body (`depart`'s `assist`). */
export interface AssistProgress {
  /** Inside the sphere at the last tick. */
  readonly inside: boolean;
  /** Energy the body's motion has given the ship during the current visit, m²/s². */
  readonly gain: number;
  /** The most any finished visit gave, m²/s² (absent: no visit finished yet). */
  readonly best?: number;
  /** Closest approach to the body's centre so far, m. */
  readonly closest: number;
}

/** Why a `depart` was judged missed. Truth; for tests, tuning and the debrief. */
export type DepartMiss = 'speed' | 'inward' | 'budget' | 'assist';

export interface ObjectiveProgress {
  readonly bands: Readonly<Record<ObjectiveId, BandProgress>>;
  /** Set once: the objective that completed the attempt. */
  readonly completed?: ObjectiveId;
  /** Δv spent so far, m/s: net thrust over mass, integrated each tick. Absent: none yet. */
  readonly deltaV?: number;
  /**
   * The part of `deltaV` spent outside learning: while the ship could leave the primary's lobe
   * (Jacobi constant at or below the neck's). Absent: none yet.
   */
  readonly counted?: number;
  /** Objectives already judged as missed (each is judged once). */
  readonly missed?: readonly ObjectiveId[];
  /** Why each missed `depart` was missed. */
  readonly why?: Readonly<Record<ObjectiveId, DepartMiss>>;
  /** Assist witnesses, by body. */
  readonly assists?: Readonly<Record<BodyId, AssistProgress>>;
  /** At the last tick: time, Jacobi constant, distance from the barycentre. */
  readonly last?: { readonly t: number; readonly jacobi?: number; readonly distance: number };
  /** The Jacobi constant at the neck between the first two bodies (constant; cached). */
  readonly neck?: number;
}

/** Where the ship stands against a `depart` rule. Truth; for tests and tuning. */
export interface DepartStatus {
  /** Distance from the massive bodies' barycentre, m. */
  readonly distance: number;
  /** Speed relative to that barycentre, m/s. */
  readonly speed: number;
}

/** The ship's distance from, and speed relative to, the massive bodies' barycentre. */
export function departStatus(world: TruthWorld): DepartStatus & { readonly outward: boolean } {
  let gm = 0;
  let px = 0;
  let py = 0;
  let pz = 0;
  let vx = 0;
  let vy = 0;
  let vz = 0;
  for (const b of world.bodies) {
    gm += b.gm;
    px += b.gm * b.position.x;
    py += b.gm * b.position.y;
    pz += b.gm * b.position.z;
    // A fixed body does not move, whatever velocity it was given (as the simulation has it).
    if (b.fixed) continue;
    vx += b.gm * b.velocity.x;
    vy += b.gm * b.velocity.y;
    vz += b.gm * b.velocity.z;
  }
  const k = world.ship.kinematics;
  const c = gm === 0 ? 1 : gm;
  const r = { x: k.position.x - px / c, y: k.position.y - py / c, z: k.position.z - pz / c };
  const v = { x: k.velocity.x - vx / c, y: k.velocity.y - vy / c, z: k.velocity.z - vz / c };
  return {
    distance: Math.hypot(r.x, r.y, r.z),
    speed: Math.hypot(v.x, v.y, v.z),
    outward: r.x * v.x + r.y * v.y + r.z * v.z > 0,
  };
}

/** One tick of an assist witness about `body`: inside the sphere, add what its motion gave. */
function witness(
  before: AssistProgress | undefined,
  world: TruthWorld,
  body: BodyId,
  within: number,
  dt: number,
): AssistProgress {
  const b = world.bodies.find((q) => q.id === body);
  const p = world.ship.kinematics.position;
  if (!b) return before ?? { inside: false, gain: 0, closest: Infinity };
  const d = Math.hypot(p.x - b.position.x, p.y - b.position.y, p.z - b.position.z);
  const inside = d <= within;
  const closest = Math.min(before?.closest ?? Infinity, d);
  if (!inside) {
    // Leaving the sphere finishes a visit.
    const finished = before?.inside ? before.gain : undefined;
    const best =
      finished === undefined ? before?.best : Math.max(before?.best ?? -Infinity, finished);
    return { inside, gain: 0, closest, ...(best === undefined ? {} : { best }) };
  }
  // dE/dt from this body's motion: its pull on the ship dotted with its own velocity.
  const a = accelerationFrom(coupling(b.gm, world.law), world.law.exponent, b.position, p);
  const vb = b.fixed ? { x: 0, y: 0, z: 0 } : b.velocity;
  const gain = (before?.inside ? before.gain : 0) + (a.x * vb.x + a.y * vb.y + a.z * vb.z) * dt;
  return { inside, gain, closest, ...(before?.best === undefined ? {} : { best: before.best }) };
}

/** Where a `reach-region` rule's centre is now, and how fast it moves. */
function regionCentre(
  rule: Extract<ObjectiveRule, { kind: 'reach-region' }>,
  world: TruthWorld,
): { position: Vec3; velocity: Vec3 } | undefined {
  const c = rule.center;
  if (!('body' in c)) return { position: c, velocity: { x: 0, y: 0, z: 0 } };
  const b = world.bodies.find((q) => q.id === c.body);
  if (!b) return undefined;
  const o = c.offset ?? { x: 0, y: 0, z: 0 };
  return {
    position: { x: b.position.x + o.x, y: b.position.y + o.y, z: b.position.z + o.z },
    velocity: b.fixed ? { x: 0, y: 0, z: 0 } : b.velocity,
  };
}

export const initialObjectiveProgress: ObjectiveProgress = { bands: {} };

/** A sweep must pass its full turns by this much, rad: far above rounding, far below a tick. */
const FULL_TURN_MARGIN = 1e-9;

/**
 * One more tick of an orbit-band rule: the ship is at `offset` from the body, `inside` the
 * band or not. The sweep is counted in three dimensions: each tick adds the angle between the
 * last direction and this one, signed by whether the turn goes the same way round as the sweep
 * so far (the cross product of the two directions against the running normal). The normal
 * follows the plane as it precesses, so an inclined or wobbling orbit counts in full.
 */
function sweep(before: BandProgress | undefined, offset: Vec3, inside: boolean): BandProgress {
  const r = Math.hypot(offset.x, offset.y, offset.z);
  const direction =
    r > 0 ? { x: offset.x / r, y: offset.y / r, z: offset.z / r } : { x: 1, y: 0, z: 0 };
  // Leaving the band, or entering it, starts the count again.
  if (!inside || !before?.inside) return { inside, direction, swept: 0 };
  const a = before.direction;
  const cx = a.y * direction.z - a.z * direction.y;
  const cy = a.z * direction.x - a.x * direction.z;
  const cz = a.x * direction.y - a.y * direction.x;
  const sine = Math.hypot(cx, cy, cz);
  if (sine === 0) return { ...before, direction };
  const angle = Math.atan2(sine, a.x * direction.x + a.y * direction.y + a.z * direction.z);
  /** The axis of this tick's turn, or its opposite. (+ 0: the state never holds a negative zero.) */
  const axis = (sign: 1 | -1): Vec3 => ({
    x: (sign * cx) / sine + 0,
    y: (sign * cy) / sine + 0,
    z: (sign * cz) / sine + 0,
  });
  // Which way round is positive is set by the first movement: counter-clockwise seen from +z
  // (then from +y, then from +x, for a sweep that is edge-on to the axis before).
  const n = before.normal;
  const forward = n
    ? cx * n.x + cy * n.y + cz * n.z >= 0
    : cz !== 0
      ? cz > 0
      : cy !== 0
        ? cy > 0
        : cx > 0;
  return {
    inside,
    direction,
    normal: axis(forward ? 1 : -1),
    swept: before.swept + (forward ? angle : -angle),
  };
}

/**
 * Advance objective progress to the world's current state. Returns the new progress and the
 * `objective` events the ship notices this tick (reached / missed), stamped with `world.t`.
 * `spent` is the Δv the ship spent during the tick that led to this state, m/s.
 */
export function evaluateObjectives(
  rules: readonly ObjectiveRule[],
  progress: ObjectiveProgress,
  world: TruthWorld,
  spent = 0,
): { progress: ObjectiveProgress; events: ShipEvent[] } {
  if (progress.completed) return { progress, events: [] };
  const events: ShipEvent[] = [];
  const bands: Record<ObjectiveId, BandProgress> = { ...progress.bands };
  let completed: ObjectiveId | undefined;
  const deltaV = (progress.deltaV ?? 0) + spent;
  let missed = progress.missed;
  let why = progress.why;
  const miss = (objective: ObjectiveId, reason?: DepartMiss): void => {
    missed = [...(missed ?? []), objective];
    if (reason) why = { ...why, [objective]: reason };
    events.push({ kind: 'objective', t: world.t, objective, status: 'missed' });
  };
  const departs = rules.filter(
    (r): r is Extract<ObjectiveRule, { kind: 'depart' }> => r.kind === 'depart',
  );
  const status = departs.length > 0 ? departStatus(world) : undefined;
  const dt = progress.last ? world.t - progress.last.t : 0;

  // Learning is free (A18 (3)): thrust counts only while the ship could leave the primary's
  // lobe, at the start or the end of the tick.
  const learning = departs.some((r) => r.learningFree);
  const neck = learning ? (progress.neck ?? innerNeck(world)) : undefined;
  const jacobi = learning ? jacobiConstant(world) : undefined;
  const bound = (c: number | undefined): boolean =>
    neck !== undefined && c !== undefined && c > neck;
  const free = learning && bound(jacobi) && (progress.last ? bound(progress.last.jacobi) : true);
  const counted = (progress.counted ?? 0) + (free ? 0 : spent);

  // Assist witnesses, every tick, for every body a `depart` names.
  let assists = progress.assists;
  for (const rule of departs)
    if (rule.assist)
      assists = {
        ...assists,
        [rule.assist.body]: witness(
          assists?.[rule.assist.body],
          world,
          rule.assist.body,
          rule.assist.within,
          dt,
        ),
      };

  for (const rule of departs) {
    if (completed || missed?.includes(rule.objective) || !status) continue;
    // Judged on the way out: when the ship crosses `beyond`, or at once if it starts past it.
    if (status.distance <= rule.beyond) continue;
    if (progress.last && progress.last.distance > rule.beyond) continue;
    const spentHere = rule.learningFree ? counted : deltaV;
    const witnessed = rule.assist
      ? (assists?.[rule.assist.body]?.best ?? -Infinity) >= rule.assist.minGain
      : true;
    const reason: DepartMiss | undefined = !status.outward
      ? 'inward'
      : status.speed < rule.minSpeed
        ? 'speed'
        : rule.maxDeltaV !== undefined && spentHere > rule.maxDeltaV
          ? 'budget'
          : !witnessed
            ? 'assist'
            : undefined;
    if (reason) miss(rule.objective, reason);
    else {
      completed = rule.objective;
      events.push({ kind: 'objective', t: world.t, objective: rule.objective, status: 'reached' });
    }
  }

  for (const rule of rules) {
    if (rule.kind !== 'reach-region' || completed || missed?.includes(rule.objective)) continue;
    if (rule.window && world.t > rule.window.to) {
      miss(rule.objective);
      continue;
    }
    if (rule.window && world.t < rule.window.from) continue;
    const centre = regionCentre(rule, world);
    if (!centre) continue;
    const k = world.ship.kinematics;
    const d = Math.hypot(
      k.position.x - centre.position.x,
      k.position.y - centre.position.y,
      k.position.z - centre.position.z,
    );
    if (d > rule.radius) continue;
    const speed = Math.hypot(
      k.velocity.x - centre.velocity.x,
      k.velocity.y - centre.velocity.y,
      k.velocity.z - centre.velocity.z,
    );
    if (rule.maxSpeed !== undefined && speed > rule.maxSpeed) continue;
    completed = rule.objective;
    events.push({ kind: 'objective', t: world.t, objective: rule.objective, status: 'reached' });
  }

  for (const rule of rules) {
    if (rule.kind !== 'orbit-band') continue;
    const body = world.bodies.find((b) => b.id === rule.body);
    if (!body) continue;
    const offset = {
      x: world.ship.kinematics.position.x - body.position.x,
      y: world.ship.kinematics.position.y - body.position.y,
      z: world.ship.kinematics.position.z - body.position.z,
    };
    const r = Math.hypot(offset.x, offset.y, offset.z);
    const band = sweep(bands[rule.objective], offset, r >= rule.inner && r <= rule.outer);
    bands[rule.objective] = band;
    // Past the full turns, by more than rounding: a sweep that ends exactly on a full turn is
    // decided on the next tick, however the angles happened to round.
    if (!completed && Math.abs(band.swept) > 2 * Math.PI * rule.revolutions + FULL_TURN_MARGIN) {
      completed = rule.objective;
      events.push({ kind: 'objective', t: world.t, objective: rule.objective, status: 'reached' });
    }
  }

  if (completed) {
    for (const rule of rules) {
      if (rule.kind !== 'reserve') continue;
      const held = world.ship.systems.tanks[rule.tank] ?? 0;
      events.push({
        kind: 'objective',
        t: world.t,
        objective: rule.objective,
        status: held >= rule.minimum ? 'reached' : 'missed',
      });
    }
  }
  return {
    progress: {
      bands,
      ...(completed ? { completed } : {}),
      ...(deltaV > 0 ? { deltaV } : {}),
      ...(learning && counted > 0 ? { counted } : {}),
      ...(missed ? { missed } : {}),
      ...(why ? { why } : {}),
      ...(assists ? { assists } : {}),
      ...(neck !== undefined ? { neck } : {}),
      ...(status
        ? {
            last: {
              t: world.t,
              distance: status.distance,
              ...(jacobi !== undefined ? { jacobi } : {}),
            },
          }
        : {}),
    },
    events,
  };
}
