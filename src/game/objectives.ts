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
 */
export function evaluateObjectives(
  rules: readonly ObjectiveRule[],
  progress: ObjectiveProgress,
  world: TruthWorld,
): { progress: ObjectiveProgress; events: ShipEvent[] } {
  if (progress.completed) return { progress, events: [] };
  const events: ShipEvent[] = [];
  const bands: Record<ObjectiveId, BandProgress> = { ...progress.bands };
  let completed: ObjectiveId | undefined;

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
  return { progress: completed ? { bands, completed } : { bands }, events };
}
