/**
 * Objectives are decided on truth: an orbit band must be held for a full turn (in whatever
 * plane), and leaving the encounter must be fast enough on little enough Δv.
 */

import { describe, expect, it } from 'vitest';
import type { TruthWorld } from '../contracts/truth/index.ts';
import { createGravityRange } from '../content/gravity-range/index.ts';
import type { ObjectiveRule } from './encounter.ts';
import { departStatus, evaluateObjectives, initialObjectiveProgress } from './objectives.ts';

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
        position: {
          x: alpha.position.x + r * Math.cos(a),
          y: alpha.position.y + r * Math.sin(a),
          z: 0,
        },
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

describe('orbit-band objective in three dimensions', () => {
  /** The ship at distance r from Alpha, `degrees` round an orbit tilted by `tilt` about +x. */
  const tilted = (r: number, degrees: number, tilt: number, t: number): TruthWorld => {
    const a = (degrees * Math.PI) / 180;
    const w = at(r, 0, t);
    return {
      ...w,
      ship: {
        ...w.ship,
        kinematics: {
          ...w.ship.kinematics,
          position: {
            x: alpha.position.x + r * Math.cos(a),
            y: alpha.position.y + r * Math.sin(a) * Math.cos(tilt),
            z: alpha.position.z + r * Math.sin(a) * Math.sin(tilt),
          },
        },
      },
    };
  };
  /** Sweep the listed angles, one per tick 10 s apart, on an orbit tilted by `tilt`. */
  const sweepAt = (
    tilt: number | ((degrees: number) => number),
    points: readonly number[],
    r = 500e3,
  ) => {
    let progress = initialObjectiveProgress;
    const events = [];
    let t = 0;
    for (const d of points) {
      const angle = typeof tilt === 'number' ? tilt : tilt(d);
      const judged = evaluateObjectives(rules, progress, tilted(r, d, angle, (t += 10)));
      progress = judged.progress;
      events.push(...judged.events);
    }
    return { progress, events };
  };
  const degrees = (from: number, to: number, step = 10): number[] => {
    const out: number[] = [];
    for (let d = from; step > 0 ? d <= to : d >= to; d += step) out.push(d);
    return out;
  };

  it('counts a full turn over the poles (an orbit in the x–z plane)', () => {
    const polar = sweepAt(Math.PI / 2, degrees(0, 370));
    expect(polar.progress.completed).toBe('low-orbit');
    expect(polar.events[0]).toEqual({
      kind: 'objective',
      t: 380,
      objective: 'low-orbit',
      status: 'reached',
    });
    // Most of a turn is not enough, in any plane.
    const short = sweepAt(Math.PI / 2, degrees(0, 350));
    expect(short.progress.completed).toBeUndefined();
    expect(short.progress.bands['low-orbit']!.swept).toBeCloseTo((350 * Math.PI) / 180, 9);
  });

  it('counts an inclined orbit either way round, with the band measured in 3D', () => {
    expect(sweepAt(0.7, degrees(0, 370)).progress.completed).toBe('low-orbit');
    expect(sweepAt(0.7, degrees(0, -370, -10)).progress.completed).toBe('low-orbit');
    // 520 km from Alpha's centre is inside the band whatever the height above the plane; seen
    // in the x–y plane alone, most of these points would be inside 450 km.
    expect(sweepAt(1.2, degrees(0, 370), 520e3).progress.completed).toBe('low-orbit');
  });

  it('undoes what is swept when the ship turns back', () => {
    const back = sweepAt(0.4, [...degrees(0, 200), ...degrees(190, 0, -10)]);
    expect(back.progress.completed).toBeUndefined();
    expect(Math.abs(back.progress.bands['low-orbit']!.swept)).toBeLessThan(1e-9);
  });

  it('follows the plane as it turns: a precessing orbit still counts its full turn', () => {
    // The orbit's tilt grows from 0 to 60° over the turn.
    const precessing = sweepAt((d) => (d / 370) * (Math.PI / 3), degrees(0, 370));
    expect(precessing.progress.completed).toBe('low-orbit');
  });

  it('keeps its progress plain JSON, with no negative zero', () => {
    const { progress } = sweepAt(Math.PI / 2, degrees(0, 90));
    const band = progress.bands['low-orbit']!;
    expect(JSON.parse(JSON.stringify(progress))).toEqual(progress);
    for (const v of [...Object.values(band.direction), ...Object.values(band.normal!)])
      expect(Object.is(v, -0)).toBe(false);
  });
});

describe('depart objective (A6)', () => {
  const depart: ObjectiveRule[] = [
    { kind: 'depart', objective: 'depart', beyond: 9e6, minSpeed: 50, maxDeltaV: 16 },
  ];
  const bodies = base.bodies;
  // The bodies' centre of mass (weighted by gm) and its velocity.
  const gm = bodies.reduce((total, b) => total + b.gm, 0);
  const weighted = (pick: (b: (typeof bodies)[number]) => { x: number; y: number; z: number }) => ({
    x: bodies.reduce((total, b) => total + b.gm * pick(b).x, 0) / gm,
    y: bodies.reduce((total, b) => total + b.gm * pick(b).y, 0) / gm,
    z: bodies.reduce((total, b) => total + b.gm * pick(b).z, 0) / gm,
  });
  const centre = weighted((b) => b.position);
  const drift = weighted((b) => b.velocity);
  /** The ship `distance` from the centre of mass straight up (+z), moving away at `speed`. */
  const out = (distance: number, speed: number, t: number): TruthWorld => ({
    ...base,
    t,
    ship: {
      ...base.ship,
      kinematics: {
        ...base.ship.kinematics,
        position: { x: centre.x, y: centre.y, z: centre.z + distance },
        velocity: { x: drift.x, y: drift.y, z: drift.z + speed },
      },
    },
  });
  /** Judge a list of [distance, speed, Δv spent during the tick], one tick per 100 s. */
  const judge = (steps: readonly (readonly [number, number, number])[]) => {
    let progress = initialObjectiveProgress;
    const events = [];
    let t = 0;
    for (const [distance, speed, spent] of steps) {
      const judged = evaluateObjectives(depart, progress, out(distance, speed, (t += 100)), spent);
      progress = judged.progress;
      events.push(...judged.events);
    }
    return { progress, events };
  };

  it('measures distance and speed from the bodies’ centre of mass, in any direction', () => {
    const status = departStatus(out(9.5e6, 55, 0));
    expect(status.distance).toBeCloseTo(9.5e6, 3);
    expect(status.speed).toBeCloseTo(55, 9);
  });

  it('is reached by leaving fast enough on little enough Δv, and completes the attempt', () => {
    const { progress, events } = judge([
      [8.9e6, 55, 10],
      [9.1e6, 55, 0],
    ]);
    expect(events).toEqual([{ kind: 'objective', t: 200, objective: 'depart', status: 'reached' }]);
    expect(progress.completed).toBe('depart');
    expect(progress.deltaV).toBe(10);
  });

  it('is missed when the ship leaves too slowly, once, and the attempt goes on', () => {
    const { progress, events } = judge([
      [9.1e6, 49, 0],
      [9.2e6, 60, 0],
      [9.4e6, 60, 0],
    ]);
    expect(events).toEqual([
      { kind: 'objective', t: 100, objective: 'depart', status: 'missed', reason: 'speed' },
    ]);
    expect(progress.completed).toBeUndefined();
    expect(progress.missed).toEqual(['depart']);
  });

  it('is missed when more Δv was spent than allowed, however fast the ship leaves', () => {
    const { progress, events } = judge([
      [5e6, 70, 12],
      [8e6, 70, 4.5],
      [9.1e6, 70, 0],
    ]);
    expect(progress.deltaV).toBeCloseTo(16.5, 12);
    expect(events).toEqual([
      { kind: 'objective', t: 300, objective: 'depart', status: 'missed', reason: 'budget' },
    ]);
    expect(progress.completed).toBeUndefined();
  });

  it('is judged once: coming back in and leaving again changes nothing', () => {
    const { progress, events } = judge([
      [9.1e6, 40, 0],
      [8.5e6, 60, 0],
      [9.1e6, 60, 0],
    ]);
    expect(events.map((e) => (e.kind === 'objective' ? e.status : e.kind))).toEqual(['missed']);
    expect(progress.completed).toBeUndefined();
  });

  it('leaves a fixed body’s velocity out of the centre of mass, as the simulation does', () => {
    const fixed = { ...bodies[0]!, fixed: true, velocity: { x: 1e6, y: 0, z: 0 } };
    const world = { ...out(9.5e6, 55, 0), bodies: [fixed, bodies[1]!] };
    const moving = { ...world, bodies: [{ ...fixed, fixed: false }, bodies[1]!] };
    expect(departStatus(world).speed).toBeLessThan(1e5);
    expect(departStatus(moving).speed).toBeGreaterThan(1e5);
  });
});
