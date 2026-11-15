/**
 * Equipment condition for the loss review (R27): 3A's real `stepCondition` events on the
 * baseline ship, read back per equipment id from the record. Reported values only; doses are
 * not read.
 */

import { describe, expect, it } from 'vitest';
import type { ShipEvent } from '../contracts/index.ts';
import { stepCondition } from '../ship/condition/index.ts';
import { loadShipDefinition } from '../ship/definition.ts';
import { createShipSystemsState } from '../ship/state.ts';
import { equipmentTimeline, failureOrder } from './condition.ts';

const ship = loadShipDefinition();

function events(): ShipEvent[] {
  let state = createShipSystemsState(ship);
  const first = stepCondition(
    state,
    ship,
    {
      camera: { rawDose: 150, aboveBurnout: false },
      'imu-a': { rawDose: 40, aboveBurnout: false },
      'rcs-forward-left': { rawDose: 30, aboveBurnout: false },
    },
    { camera: true, 'imu-a': true },
    10,
  );
  state = { ...first.state, t: state.t + 10 };
  const second = stepCondition(
    state,
    ship,
    { 'main-engine': { rawDose: 25, aboveBurnout: false } },
    {},
    5,
  );
  return [...first.events, ...second.events];
}

describe('equipment condition from the record', () => {
  const rec = { events: events() };

  it('per equipment, in the order the trouble came, with the last reported condition', () => {
    const tl = equipmentTimeline(
      rec,
      Infinity,
      ship.equipment.map((e) => e.id),
    );
    expect(tl.map((q) => q.equipment)).toEqual([
      'camera',
      'imu-a',
      'rcs-forward-left',
      'main-engine',
    ]);
    const camera = tl.find((q) => q.equipment === 'camera')!;
    expect(camera.condition).toBe(0);
    expect(camera.failedAt).toBe(10);
    expect(camera.firstFault).toEqual({ t: 10, fault: 'radiation-dose-failure' });
    const imu = tl.find((q) => q.equipment === 'imu-a')!;
    // Upset, then recovered: its reported condition never changed.
    expect(imu.entries.map((x) => x.kind)).toEqual(['fault', 'recovered']);
    expect(imu.condition).toBe(1);
    expect(tl.every((q) => !q.unknown)).toBe(true);
    // Doses are not part of it.
    expect(tl.flatMap((q) => q.entries).some((x) => (x.kind as string) === 'exposure')).toBe(false);
  });

  it('leads a loss review with the first failures, in order', () => {
    expect(failureOrder(rec)).toEqual([
      { t: 10, equipment: 'camera', how: 'failed' },
      { t: 10, equipment: 'imu-a', how: 'radiation-upset' },
    ]);
  });

  it('as of an earlier time, and with an id the ship does not have', () => {
    expect(equipmentTimeline(rec, 12).map((q) => q.equipment)).not.toContain('main-engine');
    const odd = equipmentTimeline(
      { events: [{ kind: 'condition-changed', t: 1, equipment: 'not-a-part', condition: 0.5 }] },
      Infinity,
      ship.equipment.map((e) => e.id),
    );
    expect(odd[0]!.unknown).toBe(true);
  });
});
