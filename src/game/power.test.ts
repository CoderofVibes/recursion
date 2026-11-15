/**
 * Running out of power (A18 (5)): the gauges' caution comes first and drops warp to 1× (A12),
 * then a warning when life support goes unpowered, then the loss. Judged on the real ship
 * systems; the values are placeholders until study S21.
 */

import { describe, expect, it } from 'vitest';
import type { ShipSystemsState } from '../contracts/truth/index.ts';
import { createGravityRange, LAW } from '../content/gravity-range/index.ts';
import { createBlackBox } from './belief/blackbox.ts';
import { powerAlerts, powerBudget } from './belief/power.ts';
import { createStandInModel } from './belief/standin-model.ts';
import type { EncounterSetup } from './encounter.ts';
import { evaluatePower, initialPowerProgress, lifeSupportStarved } from './power.ts';
import { createGameSession } from './session.ts';

const range = createGravityRange();
const ship = range.definition.ship;

/** The Gravity range with little stored energy: fuel-cell reactants and batteries nearly gone. */
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
    play: { ...range.play, power: { cautionLead: 7200, lossGrace: 1800, checkEvery: 60 } },
  };
}

describe('power watch', () => {
  it('life support counts as powered only while a running unit draws what its mode needs', () => {
    // After one tick: the arrival state has drawn no power yet.
    const first = createGameSession(range, {
      model: createStandInModel({ referenceRadius: LAW.referenceRadius }),
      blackBox: createBlackBox(),
      now: () => 'now',
    });
    first.stepTicks(1);
    const s = first.truth().sim.world.ship.systems;
    expect(lifeSupportStarved(s, ship)).toBe(false);
    const eclss = s.equipment['eclss-a']!;
    const dark = { ...s, equipment: { ...s.equipment, 'eclss-a': { ...eclss, powerDraw: 300 } } };
    expect(lifeSupportStarved(dark, ship)).toBe(true);
    // Starved time accumulates and resets when power comes back; the loss comes at the grace.
    let p = initialPowerProgress;
    p = evaluatePower(p, dark, ship, 1000, 1800).progress;
    expect(p.starved).toBe(1000);
    expect(evaluatePower(p, s, ship, 1, 1800).progress.starved).toBe(0);
    expect(evaluatePower(p, dark, ship, 800, 1800).lost).toBe(true);
  });

  it('the gauges read stored energy and drain from telemetry and the spec sheet', () => {
    const session = createGameSession(range, {
      model: createStandInModel({ referenceRadius: LAW.referenceRadius }),
      blackBox: createBlackBox(),
      now: () => 'now',
    });
    session.stepTicks(120);
    const believed = session.snapshot().world.ship;
    const { stored, drain } = powerBudget(believed, ship);
    // Two 28.8 MJ batteries and 6 kg of hydrogen at 142 MJ/kg and 50%: about 484 MJ; the
    // ship draws about 3 kW with its arrays stowed, so about 45 hours.
    expect(stored / 1e6).toBeGreaterThan(470);
    expect(stored / 1e6).toBeLessThan(490);
    expect(drain).toBeGreaterThan(2_900);
    expect(drain).toBeLessThan(3_100);
    expect(stored / drain / 3600).toBeGreaterThan(43);
    expect(powerAlerts(believed, ship, 6 * 3600)).toEqual([]);
  });

  it(
    'caution first (warp drops to 1×), then the life-support warning, then the loss',
    { timeout: 120_000 },
    () => {
      // 0.3 kg of hydrogen and 5 MJ per battery: about two hours of fuel cells, then under an
      // hour of batteries. A two-hour caution lead.
      const setup = lowPower(0.3, 5e6);
      let ms = 0;
      const blackBox = createBlackBox();
      const session = createGameSession(setup, {
        model: createStandInModel({ referenceRadius: LAW.referenceRadius }),
        blackBox,
        now: () => 'now',
        clock: () => ms,
      });
      session.setPaused(false);
      session.setWarp(1000);
      const seen: string[] = [];
      let cautionAt: number | undefined;
      let warpAfterCaution: number | undefined;
      while (session.status().outcome.kind === 'in-progress' && session.status().t < 6 * 3600) {
        session.advance(0.05);
        ms += 5;
        const status = session.status();
        for (const a of status.alerts)
          if (!seen.includes(`${a.id}:${a.level}`)) {
            seen.push(`${a.id}:${a.level}`);
            if (a.id === 'power-low') {
              cautionAt = status.t;
              warpAfterCaution = status.warp;
            }
          }
        // The player puts the warp back up after each caution.
        if (status.warp === 1) session.setWarp(1000);
      }
      expect(seen).toEqual(['power-low:caution', 'power-reserve:warning']);
      expect(warpAfterCaution).toBe(1);
      const outcome = session.status().outcome;
      expect(outcome).toMatchObject({ kind: 'lost', cause: 'power' });
      if (outcome.kind !== 'lost') throw new Error('not lost');
      // The caution came well before the end: over two hours' warning, as set.
      expect(outcome.t - cautionAt!).toBeGreaterThan(7200);
      const record = blackBox.attempt('attempt-0001')!;
      expect(record.outcome).toEqual(outcome);
      expect(record.events.at(-1)).toEqual({ kind: 'ship-lost', t: outcome.t, cause: 'power' });
      // The ship shed loads, which Black Box kept, before life support went dark.
      expect(record.events.some((e) => e.kind === 'load-shed')).toBe(true);
    },
  );
});
