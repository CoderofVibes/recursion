/**
 * The radiation monitor in the game loop (A24, R37): the truth step supplies the monitor's point
 * input from every source of intensity there is (the Gravity range's clouds, the Cathedral's
 * lattice), the ship records its readings, and the session raises 3C's caution from the record
 * alone, at once: warp drops to 1× and the frame's remaining ticks are not run (A12).
 */

import { describe, expect, it } from 'vitest';
import type { TruthWorld } from '../contracts/truth/index.ts';
import { binaryAxes } from '../content/gravity-range/clouds.ts';
import { createGravityRange, LAW } from '../content/gravity-range/index.ts';
import type { Vec3 } from '../lib/vec3.ts';
import { RADIATION_MONITOR } from '../ship/sensors/radiation-spec.ts';
import { createBlackBox } from './belief/blackbox.ts';
import { createStandInModel } from './belief/standin-model.ts';
import { encounterEntry } from './encounters.ts';
import { createGameSession, type GameSession } from './session.ts';
import { createTruthStepper } from './truth-step.ts';

const DEG = Math.PI / 180;

/** A point at range r from Beta, azimuth a (degrees) in the binary frame, in its plane. */
function inClouds(world: TruthWorld, r: number, a: number): Vec3 {
  const f = binaryAxes(world);
  const c = Math.cos(a * DEG);
  const s = Math.sin(a * DEG);
  return {
    x: f.origin.x + r * (c * f.x.x + s * f.y.x),
    y: f.origin.y + r * (c * f.x.y + s * f.y.y),
    z: f.origin.z + r * (c * f.x.z + s * f.y.z),
  };
}

const CHANNEL = RADIATION_MONITOR.channel;

/** Play at the highest warp as the app's loop does, one second of wall time per frame. */
function frames(s: GameSession, n: number, stop: () => boolean): number[] {
  const ran: number[] = [];
  s.setPaused(false);
  s.setWarp(s.status().warpSteps.at(-1)!);
  for (let i = 0; i < n && s.status().outcome.kind === 'in-progress' && !stop(); i++)
    ran.push(s.advance(1));
  return ran;
}

describe('the radiation monitor in the game loop', () => {
  const setup = createGravityRange();
  const w0 = setup.definition.world;

  it('reads zero in clear space and the clouds where they are, at its own point', () => {
    const clear = createTruthStepper(setup);
    const first = clear.step(clear.initial);
    // Clear space is an explicit zero, not a missing reading: the monitor settles and records.
    let state = first.state;
    let readings = 0;
    for (let i = 0; i < 5; i++) {
      const r = clear.step(state);
      state = r.state;
      readings += r.measurements.filter((m) => m.channel === CHANNEL).length;
    }
    expect(readings).toBeGreaterThan(0);
    const placed = createTruthStepper({
      ...setup,
      definition: {
        ...setup.definition,
        world: {
          ...w0,
          ship: {
            ...w0.ship,
            kinematics: { ...w0.ship.kinematics, position: inClouds(w0, 1_500_000, -60) },
          },
        },
      },
    });
    let inside = placed.initial;
    const values: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = placed.step(inside);
      inside = r.state;
      for (const m of r.measurements) if (m.channel === CHANNEL) values.push(m.value[0]!);
    }
    // Settled on the clouds' 0.05 U peak, within its noise (2% of the reading).
    expect(values.at(-1)!).toBeGreaterThan(0.045);
    expect(values.at(-1)!).toBeLessThan(0.055);
  });

  it('a new caution at warp drops to 1× and ends the frame’s run of ticks (the clouds)', () => {
    const beta = w0.bodies[1]!;
    const placed = {
      ...setup,
      definition: {
        ...setup.definition,
        world: {
          ...w0,
          ship: {
            ...w0.ship,
            kinematics: {
              ...w0.ship.kinematics,
              position: inClouds(w0, 1_500_000, -60),
              velocity: beta.velocity,
            },
          },
        },
      },
    };
    const s = createGameSession(placed, {
      model: createStandInModel({ referenceRadius: LAW.referenceRadius }),
      blackBox: createBlackBox(),
      now: () => 'now',
      // Frames never run out of time: only the caution can end one early.
      clock: () => 0,
    });
    const ran = frames(s, 1, () => false);
    // At 2000× one frame would run 2,000 ticks; the caution ends it on the tick it is recorded.
    expect(ran).toEqual([2]);
    expect(s.status().warp).toBe(1);
    expect(s.status().alerts.map((a) => a.id)).toContain('radiation-high');
  });

  it(
    'in the Cathedral the first word at warp is the radiation caution, well before any loss',
    { timeout: 120_000 },
    () => {
      const s = createGameSession(encounterEntry('chain-link').create(0), {
        model: createStandInModel({ referenceRadius: 1e6 }),
        blackBox: createBlackBox(),
        now: () => 'now',
        clock: () => 0,
      });
      let first: { id: string; t: number; warp: number } | undefined;
      // Coast in at full warp, raising it again after every drop, until the ship is lost.
      for (let i = 0; i < 2_000 && s.status().outcome.kind === 'in-progress'; i++) {
        frames(s, 1, () => false);
        const alert = s.status().alerts[0];
        if (alert && !first) first = { id: alert.id, t: s.status().t, warp: s.status().warp };
      }
      const outcome = s.status().outcome;
      expect(outcome.kind).toBe('lost');
      if (outcome.kind !== 'lost') throw new Error('not lost');
      // The first word is the monitor's caution, at 1×, before the critical units fail: before
      // R37 it was "Critical power short", a second before the loss. The lattice is sudden (A16)
      // and invisible: the monitor detects its first contact, it cannot forecast it, and the
      // forward camera has already burned out by then (RADIATION.md: local detection, not
      // advance warning).
      expect(first).toMatchObject({ id: 'radiation-high', warp: 1 });
      expect(outcome.t - first!.t).toBeGreaterThan(1);
    },
  );
});
