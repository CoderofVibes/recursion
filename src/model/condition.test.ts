/**
 * 3A's `condition-changed` events in the model (R27): the ship's own equipment ids, reported
 * condition only. The events come from 3A's real `stepCondition` on the baseline ship.
 */

import { describe, expect, it } from 'vitest';
import { buildFixtures } from '../contracts/fixtures/index.ts';
import type { AttemptRecord, ShipEvent, TransitRecord } from '../contracts/index.ts';
import { stepCondition } from '../ship/condition/index.ts';
import { loadShipDefinition } from '../ship/definition.ts';
import { createShipSystemsState } from '../ship/state.ts';
import { RCS_GROUP } from './adapt.ts';
import {
  conditionDrops,
  conditionsAtEnd,
  groupMembers,
  historyIn,
  transitHistory,
} from './aging.ts';

const ship = loadShipDefinition();
const PODS = ['rcs-aft-left', 'rcs-aft-right', 'rcs-forward-left', 'rcs-forward-right'];

/** Radiation on the camera, an IMU, one RCS pod and the main engine, through 3A's own code. */
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

const record = (extra: ShipEvent[] = []): AttemptRecord => ({
  ...buildFixtures().attempts[0],
  events: [...events(), ...extra].sort((a, b) => a.t - b.t),
});

describe('condition-changed events, with the ship’s own ids (R27)', () => {
  it('the RCS group is the ship’s four pods, not everything named rcs-', () => {
    expect([...groupMembers(ship, RCS_GROUP)!].sort()).toEqual(PODS);
    expect([...groupMembers(ship, 'camera')!]).toEqual(['camera']);
    // A ship that does not say: matched by name, as before.
    expect(groupMembers(undefined, RCS_GROUP)).toBeUndefined();
  });

  it('a pod’s drop ages the RCS scale; the RCS tanks’ do not', () => {
    // 3A's code gives the tanks no condition today; a tank event is added to show the rule.
    const rec = record([
      { kind: 'condition-changed', t: 12, equipment: 'rcs-tanks', condition: 0.5 },
    ]);
    const pods = groupMembers(ship, RCS_GROUP);
    expect(conditionDrops(rec, RCS_GROUP, 0, 20, pods)).toEqual([1 - 0.8333333333333334]);
    // Matched by name, the tank was wrongly counted as thruster damage.
    expect(conditionDrops(rec, RCS_GROUP, 0, 20)).toHaveLength(2);
  });

  it('each calibration ages with its own equipment’s reported drops', () => {
    const rec = record();
    expect(conditionDrops(rec, 'camera', 0, 20)).toEqual([1]);
    expect(conditionDrops(rec, 'main-engine', 0, 20)).toEqual([1 - 0.9166666666666666]);
    expect(conditionDrops(rec, 'main-engine', 0, 10)).toEqual([]);
    // Faults, trips, recoveries and doses are not condition: an upset alone ages nothing.
    expect(conditionDrops(rec, 'imu-a', 0, 20)).toEqual([]);
    const h = historyIn(rec, [], 'cameraBias', 'camera', 0, 20);
    expect(h.drops).toEqual([1]);
  });

  it('a transit counts each pod’s drops from that pod’s own condition at the end', () => {
    const rec = record();
    const pods = groupMembers(ship, RCS_GROUP);
    const start = conditionsAtEnd(rec, RCS_GROUP, pods);
    expect(start.get('rcs-forward-left')).toBeCloseTo(0.8333333333, 9);
    expect(start.get('rcs-aft-left')).toBe(1);
    const transit: TransitRecord = {
      from: rec.id,
      shipTime: 86400,
      deltaV: 0,
      powerCycles: 0,
      conditionChanges: [
        { kind: 'condition-changed', t: 100, equipment: 'rcs-forward-left', condition: 0.75 },
      ],
    };
    const h = transitHistory(transit, RCS_GROUP, start, pods);
    // 0.8333 → 0.75, not 1 → 0.75.
    expect(h.drops).toHaveLength(1);
    expect(h.drops[0]).toBeCloseTo(0.8333333333 - 0.75, 9);
  });
});
