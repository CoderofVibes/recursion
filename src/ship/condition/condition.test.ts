import { describe, expect, it } from 'vitest';
import { loadShipDefinition } from '../definition.ts';
import { createShipSystemsState } from '../state.ts';
import { applyCommands } from '../commands.ts';
import { functionAvailable, nextConditionBoundary, stepCondition } from './index.ts';
import { buildFixtures } from '../../contracts/fixtures/index.ts';
import { conditionDrops } from '../../model/aging.ts';

const definition = loadShipDefinition();
const initial = () => createShipSystemsState(definition);

describe('causal cumulative component condition', () => {
  it.each([0, 0.85, undefined])(
    'records reported radiation condition (%s), preserving physical damage',
    (reportedCondition) => {
      const state = initial();
      const engine = state.equipment['main-engine']!;
      const values =
        reportedCondition === undefined ? engine.values : { ...engine.values, reportedCondition };
      const result = stepCondition(
        { ...state, equipment: { ...state.equipment, 'main-engine': { ...engine, values } } },
        definition,
        { 'main-engine': { rawDose: 35, aboveBurnout: false } },
        {},
        35,
      );
      expect(result.state.equipment['main-engine']!.condition).toBe(0.75);
      expect(result.events).toEqual([
        {
          kind: 'condition-changed',
          t: 35,
          equipment: 'main-engine',
          condition: reportedCondition ?? 0.75,
        },
      ]);
      const record = { ...buildFixtures().attempts[0], events: result.events };
      expect(conditionDrops(record, 'main-engine', 0, 35)).toEqual([
        1 - (reportedCondition ?? 0.75),
      ]);
    },
  );

  it('keeps different unobserved component doses out of recorded events (P11/A24)', () => {
    const results = [1, 5].map((rawDose) =>
      stepCondition(initial(), definition, { camera: { rawDose, aboveBurnout: false } }, {}, 5),
    );
    expect(results.map((result) => result.state.exposure.camera)).toEqual([1, 5]);
    expect(results.map((result) => result.events)).toEqual([[], []]);
  });

  it('preserves exact save/resume state and feeds real equipment IDs into model aging', () => {
    let state = initial();
    for (let i = 0; i < 5; i++)
      state = {
        ...stepCondition(
          state,
          definition,
          { 'main-engine': { rawDose: 4, aboveBurnout: false } },
          {},
          0.5,
        ).state,
        t: state.t + 0.5,
      };
    const saved = JSON.parse(JSON.stringify(state)) as typeof state;
    const run = (input: typeof state) =>
      stepCondition(
        input,
        definition,
        { 'main-engine': { rawDose: 15, aboveBurnout: false } },
        {},
        1,
      );
    const result = run(saved);
    expect(result).toEqual(run(state));
    const record = { ...buildFixtures().attempts[0], events: result.events };
    expect(conditionDrops(record, 'main-engine', 0, 10)).toEqual([0.25]);
    expect(conditionDrops(record, 'camera', 0, 10)).toEqual([]);
  });
  it('applies susceptibility once, including off hardware; passive material is unchanged', () => {
    const state = initial();
    const result = stepCondition(
      state,
      definition,
      {
        'pdu-a': { rawDose: 150, aboveBurnout: false },
        'imu-a': { rawDose: 150, aboveBurnout: false },
        crew: { rawDose: 150, aboveBurnout: false },
      },
      {},
      150,
    );
    expect(result.state.exposure['pdu-a']).toBe(120);
    expect(result.state.exposure['imu-a']).toBe(75);
    expect(result.state.exposure.crew).toBeUndefined();
    expect(result.state.equipment['pdu-a']!.condition).toBe(0);
    expect(result.events.some((e) => e.kind === 'exposure')).toBe(false);
    expect(result.events.some((e) => e.kind === 'breaker-trip')).toBe(false);
    expect(state.exposure).toEqual({});
  });

  it('locates a severe dwell within 0.25 ms with a nonlinear prefix dose, no average intensity', () => {
    const state = initial();
    const sample = (t: number) => ({ camera: { rawDose: 11 * t + t * t, aboveBurnout: true } });
    const boundary = nextConditionBoundary(state, definition, sample, { camera: true }, 1);
    expect(boundary).toBeGreaterThanOrEqual(0.1);
    expect(boundary - 0.1).toBeLessThanOrEqual(0.00025);
    const failed = stepCondition(state, definition, sample(boundary), { camera: true }, boundary);
    expect(failed.state.equipment.camera!.condition).toBe(0);
    expect(failed.events).toContainEqual({
      kind: 'condition-changed',
      t: boundary,
      equipment: 'camera',
      condition: 0,
    });
  });

  it('persists contiguous dwell across JSON and resets it at a dip or power interruption', () => {
    const first = stepCondition(
      initial(),
      definition,
      { camera: { rawDose: 1, aboveBurnout: true } },
      { camera: true },
      0.05,
    ).state;
    const resume = JSON.parse(JSON.stringify(first)) as typeof first;
    const burn = stepCondition(
      resume,
      definition,
      { camera: { rawDose: 1, aboveBurnout: true } },
      { camera: true },
      0.05,
    );
    expect(burn.state.equipment.camera!.condition).toBe(0);
    for (const powered of [true, false]) {
      const gap = stepCondition(
        resume,
        definition,
        { camera: { rawDose: 0.01, aboveBurnout: !powered } },
        { camera: powered },
        0.01,
      ).state;
      const after = stepCondition(
        gap,
        definition,
        { camera: { rawDose: 1, aboveBurnout: true } },
        { camera: true },
        0.05,
      );
      expect(after.state.equipment.camera!.condition).toBe(1);
    }
  });

  it('advances off-state buckets without replaying upsets, then resets protection without repair', () => {
    let state = stepCondition(
      initial(),
      definition,
      { camera: { rawDose: 19, aboveBurnout: false } },
      {},
      19,
    ).state;
    const before = state.equipment.camera!;
    expect(before.values.radiationUpsetBucket).toBe(3);
    const trip = stepCondition(
      state,
      definition,
      { camera: { rawDose: 1, aboveBurnout: false } },
      { camera: true },
      1,
    );
    expect(trip.events.filter((e) => e.kind === 'equipment-fault').map((e) => e.fault)).toEqual([
      'overcurrent',
    ]);
    state = stepCondition(
      trip.state,
      definition,
      { camera: { rawDose: 6.723069602, aboveBurnout: false } },
      {},
      7,
    ).state;
    expect(state.equipment.camera!.values.radiationLeakage! + 1).toBeCloseTo(1.02801279, 8);
    const reset = applyCommands({ ...state, t: 100 }, definition, [
      { kind: 'mode', equipment: 'camera', mode: 'reset' },
    ]);
    expect(reset.state.equipment.camera!.tripped).toBe(false);
    expect(reset.state.equipment.camera!.condition).toBe(state.equipment.camera!.condition);
    expect(reset.state.exposure).toEqual(state.exposure);
    expect(reset.state.equipment.camera!.values.radiationUpsetBucket).toBe(4);
  });

  it('keeps temporary reboot separate from permanent damage and electrical isolation', () => {
    const upset = stepCondition(
      initial(),
      definition,
      { camera: { rawDose: 6, aboveBurnout: false } },
      { camera: true },
      1,
    );
    const e = upset.state.equipment.camera!;
    expect(e.condition).toBe(1);
    expect(e.tripped).toBe(false);
    expect(functionAvailable(e, 1)).toBe(false);
    const recovered = stepCondition({ ...upset.state, t: 1 }, definition, {}, { camera: true }, 5);
    expect(functionAvailable(recovered.state.equipment.camera, 6)).toBe(true);
    expect(recovered.events).toContainEqual({
      kind: 'equipment-recovered',
      t: 6,
      equipment: 'camera',
    });
  });
});
