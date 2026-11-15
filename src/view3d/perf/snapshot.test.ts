import { expect, it } from 'vitest';
import { fixtures } from '../../contracts/fixtures/index.ts';
import type { RecordBatch } from '../../game/belief/ports.ts';
import { createStandInModel } from '../../game/belief/standin-model.ts';

it('cached snapshots match uncached reads across tank, equipment, configuration and attempt changes', () => {
  const ship = fixtures.shipDefinition;
  const start = {
    attemptId: 'perf',
    index: 1,
    briefing: fixtures.briefing,
    ship,
    arrivalMass: 12345,
    startedAt: '2026-11-15T00:00:00Z',
  };
  const model = createStandInModel({ referenceRadius: 1_000_000 });
  model.beginAttempt(start, fixtures.attempts[0]);
  const at = start.briefing.arrivalEstimate.t;
  const first = model.believedWorld(at).ship;
  const saved = structuredClone(first);
  expect(model.believedWorld(at).ship.massProperties).toBe(first.massProperties);
  expect(model.believedWorld(at).ship.equipment).toBe(first.equipment);
  const e = ship.equipment[0]!;
  const batches: RecordBatch[] = [
    {
      attemptId: 'perf',
      t: at,
      executed: [],
      events: [],
      measurements: [
        {
          kind: 'telemetry',
          t: at,
          source: 'black-box',
          channel: `${ship.tanks[0]!.id}.propellant`,
          value: [42],
          sigma: [0],
        },
      ],
    },
    {
      attemptId: 'perf',
      t: at,
      executed: [],
      events: [],
      measurements: [
        {
          kind: 'telemetry',
          t: at,
          source: 'black-box',
          channel: `${e.id}.condition`,
          value: [0.4],
          sigma: [0],
        },
        {
          kind: 'telemetry',
          t: at,
          source: 'black-box',
          channel: `${e.id}.charge`,
          value: [123],
          sigma: [0],
        },
      ],
    },
    {
      attemptId: 'perf',
      t: at,
      measurements: [],
      executed: [],
      events: [
        { kind: 'configuration-changed', t: at, configuration: ship.configurations.at(-1)!.id },
      ],
    },
    {
      attemptId: 'perf',
      t: at,
      measurements: [],
      events: [],
      executed: [
        {
          t: at,
          source: 'manual',
          status: 'executed',
          command: { kind: 'mode', equipment: e.id, mode: 'off' },
        },
      ],
    },
  ];
  for (let i = 0; i < batches.length; i++) {
    model.ingest(batches[i]!);
    // A fresh instance has no cached read before these records: the same nominal sums.
    const uncached = createStandInModel({ referenceRadius: 1_000_000 });
    uncached.beginAttempt(start, fixtures.attempts[0]);
    for (const batch of batches.slice(0, i + 1)) uncached.ingest(batch);
    expect(model.believedWorld(at)).toEqual(uncached.believedWorld(at));
  }
  expect(first.massProperties).toEqual(saved.massProperties);
  expect(first.equipment).toEqual(saved.equipment);
  model.beginAttempt(
    { ...start, arrivalMass: 56789, attemptId: 'recurrence', index: 2 },
    fixtures.attempts[0],
  );
  const reset = model.believedWorld(at).ship;
  expect(reset.massProperties.mass).toBe(56789);
  expect(reset.equipment[e.id]!.condition).toBe(1);
  expect(reset.equipment[e.id]!.mode).toBe(e.defaultMode);
});
