/**
 * 3B's Inverse Wells in the truth tick (3B requests 2 and 3, R30): wells that appear on their
 * schedule, with the ship's actual state at each due epoch, a precursor the eye sees and that
 * drops warp to 1×, and the crush of an active throat as a `structural` loss.
 */

import { describe, expect, it } from 'vitest';
import { LAW } from '../content/inverse-wells/index.ts';
import type { FieldInstanceSpec } from '../contracts/truth/index.ts';
import type { Vec3 } from '../lib/vec3.ts';
import { createBlackBox } from './belief/blackbox.ts';
import { createStandInModel } from './belief/standin-model.ts';
import type { EncounterSetup } from './encounter.ts';
import { adaptSetup } from './adapters.ts';
import { encounterEntry } from './encounters.ts';
import { NO_WORK, type PullWork } from './funnels.ts';
import { createGameSession } from './session.ts';
import { createTruthStepper, type GameTruthState } from './truth-step.ts';

const garden = (): EncounterSetup => adaptSetup(encounterEntry('inverse-wells').create(0));

interface FunnelParams {
  readonly mouth: Vec3;
  readonly axis: Vec3;
  readonly length: number;
  readonly throatRadius: number;
  readonly activation: { readonly phase: string; readonly activeSince?: number };
}
const params = (spec: FieldInstanceSpec) => spec.params as unknown as FunnelParams;
const phases = (specs: readonly FieldInstanceSpec[]) => {
  const out: Record<string, number> = {};
  for (const s of specs)
    out[params(s).activation.phase] = (out[params(s).activation.phase] ?? 0) + 1;
  return out;
};

describe('Inverse Wells in the truth tick', () => {
  it(
    'the wells appear on their schedule: precursors at 300 s, births at 1,200 s, fields switched on',
    { timeout: 120_000 },
    () => {
      const setup = garden();
      expect(setup.dynamics).toBeDefined();
      const stepper = createTruthStepper(setup);
      let state: GameTruthState = stepper.initial;
      const before = phases(state.sim.world.fields);
      expect(before.pending).toBeGreaterThan(100);
      const seen: { kind: string; t: number }[] = [];
      for (let i = 0; i < 1_201 && !state.lost; i++) {
        const r = stepper.step(state);
        for (const e of r.dynamics ?? []) seen.push({ kind: e.kind, t: e.t });
        state = r.state;
      }
      expect(state.lost).toBeUndefined();
      // Every precursor comes 900 s before its birth, and is seen; the first births at 1,200 s.
      const precursors = seen.filter((e) => e.kind === 'precursor');
      expect(precursors.length).toBeGreaterThan(100);
      expect(Math.min(...precursors.map((e) => e.t))).toBe(300);
      const births = seen.filter((e) => e.kind === 'birth' || e.kind === 'birth-veto');
      expect(births.length).toBeGreaterThan(50);
      expect(new Set(births.map((e) => e.t))).toEqual(new Set([1_200]));
      // The world's fields now say so, and a save keeps the lifecycle.
      const after = phases(state.sim.world.fields);
      expect(after.active).toBe(births.filter((e) => e.kind === 'birth').length);
      expect(after.pending).toBe(before.pending! - births.length);
      const restored = JSON.parse(JSON.stringify(state)) as GameTruthState;
      expect(restored.dynamics).toEqual(state.dynamics);
      expect(stepper.step(restored)).toEqual(stepper.step(state));
    },
  );

  it(
    'a new precursor drops warp to 1× and is called out; time keeps running',
    { timeout: 120_000 },
    () => {
      const setup = garden();
      let ms = 0;
      const s = createGameSession(setup, {
        model: createStandInModel({ referenceRadius: LAW.referenceRadius }),
        blackBox: createBlackBox(),
        now: () => 'now',
        clock: () => (ms += 1),
      });
      s.setPaused(false);
      s.setWarp(60);
      while (s.status().t < 299) s.advance(0.05);
      expect(s.status().warp).toBe(60);
      while (s.status().t < 310) s.advance(0.05);
      const status = s.status();
      expect(status.warp).toBe(1);
      expect(status.paused).toBe(false);
      expect(status.sightings.length).toBeGreaterThan(100);
      expect(status.sightings[0]).toMatchObject({ kind: 'precursor', seenAt: 300, until: 1_200 });
    },
  );

  it(
    'the lifecycle and the work ledger survive a save mid-flight: the restored state flies on the same',
    { timeout: 120_000 },
    () => {
      const stepper = createTruthStepper(garden());
      let state: GameTruthState = stepper.initial;
      expect(state.ledger).toEqual(NO_WORK);
      for (let i = 0; i < 1_210 && !state.lost; i++) state = stepper.step(state).state;
      expect(state.lost).toBeUndefined();
      // The entrance funnel has been pulling the coasting ship: its pull did positive work, and
      // with nothing commanded the thrust did none.
      const work = state.ledger as unknown as PullWork;
      expect(work.pullJ).toBeGreaterThan(0);
      expect(work.nominalJ).toBe(0);
      // Saved as JSON (what a save of the truth holds) and restored, it flies on to the bit.
      let saved = JSON.parse(JSON.stringify(state)) as GameTruthState;
      let live = state;
      for (let i = 0; i < 200 && !live.lost; i++) {
        const a = stepper.step(live);
        const b = stepper.step(saved);
        expect(b).toEqual(a);
        live = a.state;
        saved = b.state;
      }
    },
  );

  it(
    'an attempt, a RECALL mid-lifecycle and a reload each meet the field from its start',
    { timeout: 300_000 },
    () => {
      const entry = encounterEntry('inverse-wells');
      const blackBox = createBlackBox();
      const session = (box: ReturnType<typeof createBlackBox>) =>
        createGameSession((run) => entry.create(run), {
          model: createStandInModel({ referenceRadius: LAW.referenceRadius }),
          blackBox: box,
          now: () => 'now',
        });
      /** Fly from arrival to `until` s (or the loss); the precursors and births seen on the way. */
      const fly = (s: ReturnType<typeof session>, until: number) => {
        const seen: { kind: string; t: number }[] = [];
        expect(s.status().t).toBe(0);
        // Each attempt starts from the arrival's field: nothing born, the lifecycle at its start.
        const start = s.truth();
        expect(phases(start.sim.world.fields).active ?? 0).toBe(0);
        expect(start.ledger).toEqual(NO_WORK);
        while (s.status().outcome.kind === 'in-progress' && s.status().t < until) {
          s.stepTicks(1);
          for (const e of s.lastTick()!.dynamics ?? []) seen.push({ kind: e.kind, t: e.t });
        }
        return seen;
      };
      const s = session(blackBox);
      // 1. An attempt through the first births (or to its loss).
      const first = fly(s, 1_260);
      expect(first.some((e) => e.kind === 'precursor' && e.t === 300)).toBe(true);
      // 2. RECALL with precursors announced and their births still to come.
      s.recall();
      const second = fly(s, 600);
      expect(second.some((e) => e.kind === 'precursor' && e.t === 300)).toBe(true);
      s.recall();
      // 3. A reload: a new session from the saved archive goes on with the next run.
      const reloaded = session(createBlackBox({ archive: blackBox.archive() }));
      expect(reloaded.status().attemptIndex).toBe(4);
      const third = fly(reloaded, 1_260);
      expect(third.some((e) => e.kind === 'precursor' && e.t === 300)).toBe(true);
      if (reloaded.status().outcome.kind === 'in-progress')
        expect(third.some((e) => e.kind === 'birth' && e.t === 1_200)).toBe(true);
    },
  );

  it('flying into an active throat crushes the ship: lost, structural, at first contact', () => {
    const setup = garden();
    const w = setup.definition.world;
    // An established well, active from the start (not the entrance one, whose throat is also
    // the optical reference body).
    const reference = new Set(w.bodies.map((b) => b.id.replace(/-core$/, '')));
    const spec = w.fields.find(
      (f) => params(f).activation.phase === 'initial' && !reference.has(f.id),
    )!;
    const p = params(spec);
    const n = Math.hypot(p.axis.x, p.axis.y, p.axis.z);
    const throat = {
      x: p.mouth.x + (p.axis.x / n) * p.length,
      y: p.mouth.y + (p.axis.y / n) * p.length,
      z: p.mouth.z + (p.axis.z / n) * p.length,
    };
    // 1,200 m out along the axis, beyond the narrow end (the throat is a 1 km sphere), closing
    // at 20 m/s.
    const out = { x: p.axis.x / n, y: p.axis.y / n, z: p.axis.z / n };
    const start = {
      x: throat.x + out.x * 1_200,
      y: throat.y + out.y * 1_200,
      z: throat.z + out.z * 1_200,
    };
    const placed: EncounterSetup = {
      ...setup,
      definition: {
        ...setup.definition,
        world: {
          ...w,
          ship: {
            ...w.ship,
            kinematics: {
              ...w.ship.kinematics,
              position: start,
              velocity: { x: -out.x * 20, y: -out.y * 20, z: -out.z * 20 },
            },
          },
        },
      },
    };
    const stepper = createTruthStepper(placed);
    let state = stepper.initial;
    let lostAt: number | undefined;
    for (let i = 0; i < 60 && !state.lost; i++) {
      const r = stepper.step(state);
      const lost = r.events.find((e) => e.kind === 'ship-lost');
      if (lost && lost.kind === 'ship-lost') lostAt = lost.t;
      state = r.state;
    }
    expect(state.lost).toBe('structural');
    // When the hull's near side reaches the throat's sphere: about (1,200 − 1,000 − reach) m
    // at 20 m/s and a little more under the pull, part way through a tick.
    expect(lostAt).toBeGreaterThan(5);
    expect(lostAt!).toBeLessThan(10.5);
    expect(Number.isInteger(lostAt)).toBe(false);
    // Not by loosening collisions: the loss speed is the game's own.
    expect(setup.play.lossSpeed).toBe(3);
  });
});
