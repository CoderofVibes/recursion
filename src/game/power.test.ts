/**
 * Losing critical electrical service (A18 (5), S21's values): the gauges' endurance caution comes
 * first and drops warp to 1× (A12); a warning names the function short of power and counts down;
 * 120 continuous seconds without it ends the attempt, judged in the truth tick on the real ship
 * systems. S21 `integration.md` acceptance items 1 and 2, where the game can show them.
 */

import { describe, expect, it } from 'vitest';
import type { ShipSystemsState } from '../contracts/truth/index.ts';
import { createGravityRange, LAW } from '../content/gravity-range/index.ts';
import { createBlackBox } from './belief/blackbox.ts';
import { powerAlerts, powerBudget } from './belief/power.ts';
import { createStandInModel } from './belief/standin-model.ts';
import { DEFAULT_PLAY, type EncounterSetup } from './encounter.ts';
import { electricalService } from '../ship/power/service.ts';
import { evaluatePower, initialPowerProgress, unservedFunctions } from './power.ts';
import { createGameSession } from './session.ts';
import { createTruthStepper, type GameTruthState } from './truth-step.ts';

const range = createGravityRange();
const ship = range.definition.ship;

/** The Gravity range with little stored energy: fuel-cell reactants and batteries set. */
function lowPower(hydrogen: number, batteryJ: number): EncounterSetup {
  const w = range.definition.world;
  const s = w.ship.systems;
  const equipment = { ...s.equipment };
  for (const id of ['battery-a', 'battery-b']) {
    const e = equipment[id]!;
    equipment[id] = { ...e, values: { ...e.values, charge: batteryJ } };
  }
  const systems: ShipSystemsState = {
    ...s,
    equipment,
    tanks: { ...s.tanks, 'fuel-cell-hydrogen': hydrogen, 'fuel-cell-oxygen': hydrogen * 8 },
  };
  return {
    ...range,
    definition: { ...range.definition, world: { ...w, ship: { ...w.ship, systems } } },
  };
}

const session = (setup: EncounterSetup, clock?: () => number) =>
  createGameSession(setup, {
    model: createStandInModel({ referenceRadius: LAW.referenceRadius }),
    blackBox: createBlackBox(),
    now: () => 'now',
    ...(clock ? { clock } : {}),
  });

describe('critical electrical service', () => {
  it('S21 values: caution four hours ahead, loss after 120 s', () => {
    expect(DEFAULT_PLAY.power.cautionLead).toBe(4 * 3600);
    expect(DEFAULT_PLAY.power.lossGrace).toBe(120);
    // 3A's critical functions (`electricalService`).
    const first = session(range);
    first.stepTicks(1);
    expect(
      Object.keys(electricalService(first.truth().sim.world.ship.systems, ship).functions),
    ).toEqual(['air', 'internalCooling', 'externalCooling', 'flightComputer', 'inertialSensing']);
  });

  it('a function is served while any working unit of it draws what its mode needs', () => {
    const first = session(range);
    first.stepTicks(1);
    const s = first.truth().sim.world.ship.systems;
    expect(unservedFunctions(s, ship)).toEqual([]);
    const set = (id: string, change: Partial<ShipSystemsState['equipment'][string]>) => ({
      ...s,
      equipment: { ...s.equipment, [id]: { ...s.equipment[id]!, ...change } },
    });
    // The air train drawing 90% of its 1,800 W is short; at 96% it is served.
    expect(unservedFunctions(set('eclss-a', { powerDraw: 1620 }), ship)).toEqual(['air']);
    expect(unservedFunctions(set('eclss-a', { powerDraw: 1730 }), ship)).toEqual([]);
    // A failed or tripped unit serves nothing...
    expect(unservedFunctions(set('flight-cpu-a', { condition: 0 }), ship)).toEqual([
      'flightComputer',
    ]);
    expect(unservedFunctions(set('internal-pump-a', { tripped: true }), ship)).toEqual([
      'internalCooling',
    ]);
    // Rebooting after a radiation upset, or held off by cold, serves nothing either (3A).
    const t = s.t;
    const cpu = s.equipment['flight-cpu-a']!;
    expect(
      unservedFunctions(
        set('flight-cpu-a', { values: { ...cpu.values, radiationRestartUntil: t + 30 } }),
        ship,
      ),
    ).toEqual(['flightComputer']);
    const pump = s.equipment['external-pump-a']!;
    expect(
      unservedFunctions(
        set('external-pump-a', { values: { ...pump.values, thermalInhibited: 1 } }),
        ship,
      ),
    ).toEqual(['externalCooling']);
    // ...but a healthy spare working in its place does (the ship substitutes; S21).
    const failed = set('eclss-a', { condition: 0 });
    const spare = {
      ...failed,
      equipment: {
        ...failed.equipment,
        'eclss-b': { ...failed.equipment['eclss-b']!, mode: 'active', powerDraw: 1800 },
      },
    };
    expect(unservedFunctions(spare, ship)).toEqual([]);
    // Both IMUs run: one failing leaves the function served.
    expect(unservedFunctions(set('imu-a', { condition: 0 }), ship)).toEqual([]);
  });

  it('a short interruption recovers; 120 continuous seconds is a loss', () => {
    const first = session(range);
    first.stepTicks(1);
    const s = first.truth().sim.world.ship.systems;
    const dark = {
      ...s,
      equipment: { ...s.equipment, 'eclss-a': { ...s.equipment['eclss-a']!, powerDraw: 0 } },
    };
    let p = initialPowerProgress;
    for (let i = 0; i < 119; i++) p = evaluatePower(p, dark, ship, 1, 120).progress;
    expect(p).toEqual({ unserved: 119, functions: ['air'] });
    // Power back for one tick: the count starts again.
    p = evaluatePower(p, s, ship, 1, 120).progress;
    expect(p).toBe(initialPowerProgress);
    for (let i = 0; i < 119; i++) expect(evaluatePower(p, dark, ship, 1, 120).lost).toBe(false);
    for (let i = 0; i < 119; i++) p = evaluatePower(p, dark, ship, 1, 120).progress;
    expect(evaluatePower(p, dark, ship, 1, 120).lost).toBe(true);
  });

  it('both PDUs destroyed (A16): lost at once, whatever else still runs', () => {
    const first = session(range);
    first.stepTicks(1);
    const s = first.truth().sim.world.ship.systems;
    const equipment = { ...s.equipment };
    for (const id of ['pdu-a', 'pdu-b']) equipment[id] = { ...equipment[id]!, condition: 0 };
    const judged = evaluatePower(initialPowerProgress, { ...s, equipment }, ship, 1, 120);
    expect(judged).toMatchObject({ lost: true, why: 'distribution' });
    // One of them: not a loss by itself.
    const one = { ...s.equipment, 'pdu-a': { ...s.equipment['pdu-a']!, condition: 0 } };
    expect(evaluatePower(initialPowerProgress, { ...s, equipment: one }, ship, 1, 120).lost).toBe(
      false,
    );
  });

  it('a dark ship is lost exactly once, 120 s in, and a save part way does not reset the count', () => {
    // No reactants and empty batteries, arrays stowed: nothing powers the ship.
    const stepper = createTruthStepper(lowPower(0, 0));
    let state: GameTruthState = stepper.initial;
    const losses: number[] = [];
    for (let i = 0; i < 119; i++) {
      const r = stepper.step(state);
      for (const e of r.events) if (e.kind === 'ship-lost') losses.push(e.t);
      state = r.state;
    }
    expect(state.lost).toBeUndefined();
    expect(state.power?.unserved).toBe(119);
    // Saved and restored at 119 s: one more tick and it is over.
    state = JSON.parse(JSON.stringify(state)) as GameTruthState;
    const r = stepper.step(state);
    for (const e of r.events) if (e.kind === 'ship-lost') losses.push(e.t);
    expect(r.state.lost).toBe('power');
    expect(losses).toEqual([120]);
    expect(() => stepper.step(r.state)).toThrow();
  });

  it('the gauges read stored energy and demand from telemetry and the spec sheet', () => {
    const s = session(range);
    s.stepTicks(120);
    const believed = s.snapshot().world.ship;
    const { stored, demand, drain } = powerBudget(believed, ship);
    // S21: 6 kg of hydrogen at 142 MJ/kg and 50% is 426 MJ; two 28.8 MJ batteries deliver
    // 54.7 MJ at 95%. About 3 kW of demand with the arrays stowed (S21's static 3,003 W), so
    // about 44 hours in the dark.
    expect(stored / 1e6).toBeGreaterThan(475);
    expect(stored / 1e6).toBeLessThan(485);
    expect(demand).toBeGreaterThan(2_900);
    expect(demand).toBeLessThan(3_150);
    expect(drain).toBeCloseTo(demand, 6);
    expect(stored / demand / 3600).toBeGreaterThan(42);
    expect(stored / demand / 3600).toBeLessThan(46);
    expect(powerAlerts(believed, ship, 4 * 3600)).toEqual([]);
  });

  it(
    'dry fuel cells with the arrays deployed on the sun: no loss, no warning',
    { timeout: 60_000 },
    () => {
      // No reactants and 10 MJ per battery: under two hours in the dark.
      const s = session(lowPower(0, 1e7));
      s.command({ kind: 'configure', configuration: 'solar' });
      const sun = s.snapshot().window?.sun;
      if (!sun) throw new Error('no sun');
      s.command({ kind: 'attitude', target: { reference: 'direction', direction: sun.direction } });
      s.stepTicks(3 * 3600);
      expect(s.status().outcome.kind).toBe('in-progress');
      expect(s.truth().power?.unserved ?? 0).toBe(0);
      expect(s.status().alerts.some((a) => a.id === 'critical-service')).toBe(false);
      // The batteries are no lower than they started: the arrays carry the ship.
      const charge = s.truth().sim.world.ship.systems.equipment['battery-a']!.values.charge ?? 0;
      expect(charge).toBeGreaterThanOrEqual(1e7 - 1);
    },
  );

  it(
    'caution first (warp drops to 1×), then the critical warning with its countdown, then the loss',
    { timeout: 120_000 },
    () => {
      // 0.5 kg of hydrogen (35.5 MJ) and 10 MJ per battery: about five hours in the dark.
      const setup = lowPower(0.5, 1e7);
      let ms = 0;
      const blackBox = createBlackBox();
      const s = createGameSession(setup, {
        model: createStandInModel({ referenceRadius: LAW.referenceRadius }),
        blackBox,
        now: () => 'now',
        clock: () => ms,
      });
      s.setPaused(false);
      s.setWarp(1000);
      const seen: string[] = [];
      let cautionAt: number | undefined;
      let warpAfterCaution: number | undefined;
      let warning: { since?: number; deadline?: number; functions?: readonly string[] } | undefined;
      while (s.status().outcome.kind === 'in-progress' && s.status().t < 8 * 3600) {
        s.advance(0.05);
        ms += 5;
        const status = s.status();
        for (const a of status.alerts) {
          if (!seen.includes(`${a.id}:${a.level}`)) {
            seen.push(`${a.id}:${a.level}`);
            if (a.id === 'power-low') {
              cautionAt = status.t;
              warpAfterCaution = status.warp;
            }
          }
          if (a.id === 'critical-service') warning ??= a;
        }
        // The player puts the warp back up after each alert.
        if (status.warp === 1) s.setWarp(1000);
      }
      expect(seen[0]).toBe('power-low:caution');
      expect(seen).toContain('power-reserve:caution');
      expect(seen).toContain('critical-service:warning');
      expect(warpAfterCaution).toBe(1);
      const outcome = s.status().outcome;
      expect(outcome).toMatchObject({ kind: 'lost', cause: 'power' });
      if (outcome.kind !== 'lost') throw new Error('not lost');
      // The caution came four hours or more before the end.
      expect(outcome.t - cautionAt!).toBeGreaterThan(4 * 3600 - 120);
      // The warning named what was short and when the loss would come: it came then.
      expect(warning?.functions?.length).toBeGreaterThan(0);
      expect(warning?.deadline).toBe(warning!.since! + 120);
      expect(outcome.t).toBeGreaterThanOrEqual(warning!.deadline!);
      expect(outcome.t).toBeLessThanOrEqual(warning!.deadline! + 1);
      const record = blackBox.attempt('attempt-0001')!;
      expect(record.outcome).toEqual(outcome);
      expect(record.events.filter((e) => e.kind === 'ship-lost')).toEqual([
        { kind: 'ship-lost', t: outcome.t, cause: 'power' },
      ]);
      // Black Box kept the shortage the ship reported before the loss.
      expect(
        record.events.some((e) => e.kind === 'equipment-fault' && e.fault === 'power-shortfall'),
      ).toBe(true);
    },
  );
});
