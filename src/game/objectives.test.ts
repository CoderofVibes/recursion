/**
 * Objectives are decided on truth: an orbit band must be held for a full turn.
 */

import { describe, expect, it } from 'vitest';
import type { TruthWorld } from '../contracts/truth/index.ts';
import { createGravityRange } from '../content/gravity-range/index.ts';
import type { ObjectiveRule } from './encounter.ts';
import { evaluateObjectives, initialObjectiveProgress } from './objectives.ts';

const base = createGravityRange().definition.world;
const alpha = base.bodies[0]!;

/** The ship at distance r and angle (deg) from Alpha, holding `main` kg of propellant. */
function at(r: number, degrees: number, t: number, main = 6000): TruthWorld {
  const a = (degrees * Math.PI) / 180;
  return {
    ...base,
    t,
    ship: {
      kinematics: {
        ...base.ship.kinematics,
        position: { x: alpha.position.x + r * Math.cos(a), y: alpha.position.y + r * Math.sin(a) },
      },
      systems: {
        ...base.ship.systems,
        tanks: { ...base.ship.systems.tanks, 'main-propellant': main },
      },
    },
  };
}

const rules: ObjectiveRule[] = [
  {
    kind: 'orbit-band',
    objective: 'low-orbit',
    body: 'alpha',
    inner: 450e3,
    outer: 550e3,
    revolutions: 1,
  },
  { kind: 'reserve', objective: 'reserve', tank: 'main-propellant', minimum: 5600 },
];

/** Fly a list of [r, degrees] points, one per tick; returns the events and final progress. */
function fly(points: readonly (readonly [number, number])[], main = 6000) {
  let progress = initialObjectiveProgress;
  const events = [];
  let t = 0;
  for (const [r, degrees] of points) {
    const judged = evaluateObjectives(rules, progress, at(r, degrees, (t += 10), main));
    progress = judged.progress;
    events.push(...judged.events);
  }
  return { progress, events };
}

const turn = (r: number, from: number, to: number, step = 10): [number, number][] => {
  const points: [number, number][] = [];
  for (let d = from; step > 0 ? d <= to : d >= to; d += step) points.push([r, d]);
  return points;
};

describe('orbit-band objective', () => {
  it('is reached on the first tick past one full turn in the band, with the reserve judged then', () => {
    // Points every 10° from 0° to 370°, 10 s apart: the 370° point (t = 380) is the first past a turn.
    const { progress, events } = fly(turn(500e3, 0, 370));
    expect(progress.completed).toBe('low-orbit');
    expect(events).toEqual([
      { kind: 'objective', t: 380, objective: 'low-orbit', status: 'reached' },
      { kind: 'objective', t: 380, objective: 'reserve', status: 'reached' },
    ]);
  });

  it('counts a clockwise turn too', () => {
    expect(fly(turn(500e3, 0, -370, -10)).progress.completed).toBe('low-orbit');
  });

  it('is not reached by most of a turn', () => {
    const { progress, events } = fly(turn(500e3, 0, 350));
    expect(progress.completed).toBeUndefined();
    expect(events).toEqual([]);
    expect(progress.bands['low-orbit']!.swept).toBeCloseTo((350 * Math.PI) / 180, 9);
  });

  it('starts again when the ship leaves the band', () => {
    const { progress } = fly([...turn(500e3, 0, 300), [600e3, 310], ...turn(500e3, 320, 600)]);
    expect(progress.completed).toBeUndefined();
    expect(
      fly([...turn(500e3, 0, 300), [600e3, 310], ...turn(500e3, 320, 690)]).progress.completed,
    ).toBe('low-orbit');
  });

  it('reports a spent reserve as missed', () => {
    const { events } = fly(turn(500e3, 0, 370), 5599);
    expect(events.at(-1)).toEqual({
      kind: 'objective',
      t: 380,
      objective: 'reserve',
      status: 'missed',
    });
  });

  it('stays decided once reached', () => {
    const { progress } = fly(turn(500e3, 0, 370));
    const again = evaluateObjectives(rules, progress, at(900e3, 0, 999));
    expect(again.events).toEqual([]);
    expect(again.progress).toBe(progress);
  });
});
