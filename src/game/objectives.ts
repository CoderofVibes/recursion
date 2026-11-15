/**
 * TRUTH side. Decides objectives from the true world each tick. The result reaches the ship as
 * `ShipEvent` `objective`; nothing else about truth leaves this module.
 */

import type { ObjectiveId } from '../contracts/ids.ts';
import type { ShipEvent } from '../contracts/measurements.ts';
import type { TruthWorld } from '../contracts/truth/index.ts';
import type { ObjectiveRule } from './encounter.ts';

/** Progress of one orbit-band rule. Plain data, part of the game's truth state. */
export interface BandProgress {
  readonly inside: boolean;
  /** Direction from the body to the ship at the last tick, rad. */
  readonly angle: number;
  /** Signed angle swept about the body since entering the band, rad. */
  readonly swept: number;
}

export interface ObjectiveProgress {
  readonly bands: Readonly<Record<ObjectiveId, BandProgress>>;
  /** Set once: the objective that completed the attempt. */
  readonly completed?: ObjectiveId;
  /** Δv spent so far, m/s: net thrust over mass, integrated each tick. Absent: none yet. */
  readonly deltaV?: number;
  /** `depart` objectives already judged as missed (each is judged once). */
  readonly missed?: readonly ObjectiveId[];
}

/** Where the ship stands against a `depart` rule. Truth; for tests and tuning. */
export interface DepartStatus {
  /** Distance from the massive bodies' barycentre, m. */
  readonly distance: number;
  /** Speed relative to that barycentre, m/s. */
  readonly speed: number;
}

/** The ship's distance from, and speed relative to, the massive bodies' barycentre. */
export function departStatus(world: TruthWorld): DepartStatus {
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
    vx += b.gm * b.velocity.x;
    vy += b.gm * b.velocity.y;
    vz += b.gm * b.velocity.z;
  }
  const k = world.ship.kinematics;
  if (gm === 0)
    return {
      distance: Math.hypot(k.position.x, k.position.y, k.position.z),
      speed: Math.hypot(k.velocity.x, k.velocity.y, k.velocity.z),
    };
  return {
    distance: Math.hypot(k.position.x - px / gm, k.position.y - py / gm, k.position.z - pz / gm),
    speed: Math.hypot(k.velocity.x - vx / gm, k.velocity.y - vy / gm, k.velocity.z - vz / gm),
  };
}

export const initialObjectiveProgress: ObjectiveProgress = { bands: {} };

const wrap = (a: number): number => {
  const twoPi = 2 * Math.PI;
  let w = a % twoPi;
  if (w <= -Math.PI) w += twoPi;
  else if (w > Math.PI) w -= twoPi;
  return w;
};

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

  for (const rule of rules) {
    if (rule.kind !== 'depart' || completed || missed?.includes(rule.objective)) continue;
    const status = departStatus(world);
    if (status.distance <= rule.beyond) continue;
    const reached =
      status.speed >= rule.minSpeed && (rule.maxDeltaV === undefined || deltaV <= rule.maxDeltaV);
    events.push({
      kind: 'objective',
      t: world.t,
      objective: rule.objective,
      status: reached ? 'reached' : 'missed',
    });
    if (reached) completed = rule.objective;
    else missed = [...(missed ?? []), rule.objective];
  }

  for (const rule of rules) {
    if (rule.kind !== 'orbit-band') continue;
    const body = world.bodies.find((b) => b.id === rule.body);
    if (!body) continue;
    // LIFT(2G): the band distance and the swept angle are measured in the x–y plane (z ignored).
    const dx = world.ship.kinematics.position.x - body.position.x;
    const dy = world.ship.kinematics.position.y - body.position.y;
    const r = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const inside = r >= rule.inner && r <= rule.outer;
    const before = bands[rule.objective];
    const swept = inside && before?.inside ? before.swept + wrap(angle - before.angle) : 0;
    bands[rule.objective] = { inside, angle, swept };
    if (!completed && Math.abs(swept) >= 2 * Math.PI * rule.revolutions) {
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
      ...(missed ? { missed } : {}),
    },
    events,
  };
}
