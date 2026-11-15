/**
 * The model bridge's hand-over to the model: order, timing and refits, checked against a
 * recording stand-in for the client. `src/game/model-loop.test.ts` runs the real model.
 */

import { describe, expect, it } from 'vitest';
import type { AttemptRecord, Forecast, Measurement, ModelState } from '../../contracts/index.ts';
import { createGravityRange } from '../../content/gravity-range/index.ts';
import type { ModelClient } from '../../model/index.ts';
import { createBlackBox } from './blackbox.ts';
import { createModelBridge } from './model-bridge.ts';
import type { AttemptStartInfo } from './ports.ts';

const setup = createGravityRange();
const start: AttemptStartInfo = {
  attemptId: 'attempt-0001',
  index: 1,
  briefing: setup.definition.briefing,
  ship: setup.definition.ship,
  arrivalMass: setup.arrivalMass,
  startedAt: 'now',
};
const state = (version: number): ModelState => ({
  version,
  parameters: [],
  covariance: { ids: [], values: [] },
  extensions: [],
  support: { distance: {}, powered: [] },
  residuals: { coast: { rms: 0, n: 0 }, powered: { rms: 0, n: 0 } },
  basedOn: { attempts: [], measurementCount: 0 },
  calibration: [],
});
const fix = (t: number): Measurement => ({
  kind: 'attitude',
  t,
  source: 'star-tracker-a',
  value: [0],
  sigma: [4e-5],
});

/** A client that records what it is asked, in order. */
function recordingClient(fail?: string) {
  const calls: string[] = [];
  let version = 0;
  const note = <T>(name: string, value: T): Promise<T> => {
    calls.push(name);
    return name === fail ? Promise.reject(new Error(`${name} failed`)) : Promise.resolve(value);
  };
  const client = {
    init: (ctx: { arrivalMass?: number }) => note(`init:${ctx.arrivalMass}`, state(version)),
    load: (input: { attempts: readonly AttemptRecord[] }) =>
      note(`load:${input.attempts.length}`, state(++version)),
    beginAttempt: (record: AttemptRecord) => note(`begin:${record.id}`, undefined),
    append: (id: string, delta: { measurements?: readonly Measurement[] }) =>
      note(`append:${id}:${delta.measurements?.length ?? 0}`, undefined),
    refresh: () => note('refresh', state(version)),
    refit: () => note('refit', state(++version)),
    endAttempt: (record: AttemptRecord) => note(`end:${record.id}`, state(++version)),
    forecast: (request: {
      issuedAt: number;
      duration?: number;
      massProperties: { mass: number };
    }) =>
      note(
        `forecast:${request.issuedAt}:${request.duration}:${Math.round(request.massProperties.mass)}`,
        {
          forecast: { id: 'f', samples: [] } as unknown as Forecast,
          detail: { sigmaMajor: [], presentSource: 'arrival' as const, presentTime: 0 },
        },
      ),
    testExtension: () => note('test', { adoptable: true } as never),
    adopt: () => note('adopt', state(++version)),
    revoke: () => note('revoke', state(++version)),
    state: () => note('state', state(version)),
    extensions: () => note('extensions', []),
    adopted: () => note('adopted', []),
    report: () => note('report', {} as never),
    burns: () => note('burns', []),
    empirical: () => note('empirical', null),
    terminate: () => undefined,
  } as unknown as ModelClient;
  return { client, calls };
}

const batch = (t: number) => ({
  attemptId: 'attempt-0001',
  t,
  executed: [],
  measurements: [fix(t)],
  events: [],
});
const plan = { id: 'plan-0001', epoch: 100, items: [] };

describe('model bridge', () => {
  it('initialises from the briefing, then hands records over in order, about once a second', async () => {
    let ms = 0;
    const { client, calls } = recordingClient();
    const bridge = createModelBridge(client, { referenceRadius: 1e6, clock: () => ms });
    const box = createBlackBox();
    bridge.beginAttempt(start, box.beginAttempt(start, 0));
    bridge.ingest(batch(0));
    ms = 400;
    bridge.ingest(batch(20));
    ms = 1200;
    bridge.ingest(batch(40));
    await bridge.settled();
    expect(calls).toEqual([
      'init:30374',
      'begin:attempt-0001',
      'append:attempt-0001:1',
      'refresh',
      'append:attempt-0001:2',
      'refresh',
    ]);
    expect(bridge.lastError()).toBeUndefined();
  });

  it('keeps one timed hand-over out at a time: a slow model never grows a queue, and no record is dropped', async () => {
    let ms = 0;
    const { client, calls } = recordingClient();
    // A model that takes its time over each refresh: it answers only when let go.
    const waiting: (() => void)[] = [];
    const quick = client.refresh.bind(client);
    Object.assign(client, {
      refresh: () => new Promise((done) => waiting.push(() => done(quick()))),
    });
    const bridge = createModelBridge(client, { referenceRadius: 1e6, clock: () => ms });
    const box = createBlackBox();
    bridge.beginAttempt(start, box.beginAttempt(start, 0));
    const flush = async () => {
      for (let i = 0; i < 20; i++) await Promise.resolve();
    };
    bridge.ingest(batch(0));
    await flush();
    expect(calls).toEqual(['init:30374', 'begin:attempt-0001', 'append:attempt-0001:1']);
    expect(waiting).toHaveLength(1);

    // Five more seconds of flight while that refresh is still out: nothing more is queued.
    for (const t of [20, 40, 60, 80, 100]) {
      ms += 1200;
      bridge.ingest(batch(t));
    }
    await flush();
    expect(calls).toHaveLength(3);
    expect(waiting).toHaveLength(1);

    // The model answers. The next hand-over carries everything recorded meanwhile, in one call.
    waiting.shift()!();
    await flush();
    ms += 1200;
    bridge.ingest(batch(120));
    await flush();
    expect(calls.slice(3)).toEqual(['refresh', 'append:attempt-0001:6']);
    expect(waiting).toHaveLength(1);

    // A forecast does not wait its turn behind a pile: the one refresh out, then its own
    // hand-over (a refit, the last being over 5 s old) with what was recorded since.
    ms += 1200;
    bridge.ingest(batch(140));
    const forecast = bridge.forecast({
      id: 'f1',
      attemptId: 'attempt-0001',
      issuedAt: 140,
      plan,
      span: 3600,
    });
    await flush();
    expect(calls).toHaveLength(5);
    waiting.shift()!();
    await forecast;
    expect(waiting).toHaveLength(0);
    expect(calls.slice(5)).toEqual([
      'refresh',
      'append:attempt-0001:1',
      'refit',
      'forecast:140:3600:30374',
    ]);
    // Every measurement recorded reached the model once: 1 + 6 + 1.
    const appended = calls
      .filter((c) => c.startsWith('append:'))
      .reduce((n, c) => n + Number(c.split(':')[2]), 0);
    expect(appended).toBe(8);
  });

  it('refits in flight at most once a minute, and before a forecast when records are new', async () => {
    let ms = 0;
    const { client, calls } = recordingClient();
    const bridge = createModelBridge(client, { referenceRadius: 1e6, clock: () => ms });
    const box = createBlackBox();
    bridge.beginAttempt(start, box.beginAttempt(start, 0));
    bridge.ingest(batch(0));
    await bridge.settled();
    calls.length = 0;

    ms = 61_000;
    bridge.ingest(batch(20));
    await bridge.settled();
    expect(calls).toEqual(['append:attempt-0001:1', 'refit']);
    expect(bridge.state().version).toBe(1);

    // New records, 6 s after the last refit: a forecast takes them in and refits first.
    calls.length = 0;
    ms = 67_000;
    bridge.ingest(batch(40));
    ms = 67_100;
    bridge.ingest(batch(60));
    await bridge.forecast({ id: 'f1', attemptId: 'attempt-0001', issuedAt: 100, plan, span: 3600 });
    expect(calls).toEqual([
      'append:attempt-0001:1',
      'refresh',
      'append:attempt-0001:1',
      'refit',
      'forecast:100:3600:30374',
    ]);

    // Nothing new: the next forecast does not refit again.
    calls.length = 0;
    ms = 90_000;
    await bridge.forecast({ id: 'f2', attemptId: 'attempt-0001', issuedAt: 100, plan, span: 3600 });
    expect(calls).toEqual(['forecast:100:3600:30374']);
  });

  it('gives the final record at the end of an attempt and keeps the rule calls in the queue', async () => {
    const { client, calls } = recordingClient();
    const histories: number[] = [];
    const bridge = createModelBridge(client, {
      referenceRadius: 1e6,
      clock: () => 0,
      onExtensions: (history) => histories.push(history.length),
    });
    const box = createBlackBox();
    bridge.beginAttempt(start, box.beginAttempt(start, 0));
    bridge.ingest(batch(0));
    box.record(batch(0));
    bridge.endAttempt(box.endAttempt('attempt-0001', { kind: 'recalled', t: 10 }, 0));
    const tested = bridge.rules.test('distance-law', ['attempt-0001'], 'attempt-0002');
    const adopted = bridge.rules.adopt('distance-law');
    await Promise.all([tested, adopted]);
    expect(calls).toEqual([
      'init:30374',
      'begin:attempt-0001',
      'append:attempt-0001:1',
      'refresh',
      'end:attempt-0001',
      'test',
      'state',
      'extensions',
      'adopted',
      'adopt',
      'extensions',
      'adopted',
    ]);
    expect(bridge.state().version).toBe(2);
    expect(histories).toEqual([0, 0]);
  });

  it('rebuilds from a restored save before the first attempt', async () => {
    const { client, calls } = recordingClient();
    const box = createBlackBox();
    box.beginAttempt(start, 0);
    const earlier = box.endAttempt('attempt-0001', { kind: 'recalled', t: 5 }, 0);
    const bridge = createModelBridge(client, {
      referenceRadius: 1e6,
      clock: () => 0,
      restored: { attempts: [earlier], extensions: [], adopted: [] },
    });
    const next = { ...start, attemptId: 'attempt-0002', index: 2 };
    bridge.beginAttempt(next, box.beginAttempt(next, 1));
    await bridge.settled();
    expect(calls).toEqual(['init:30374', 'load:1', 'begin:attempt-0002']);
    expect(bridge.state().version).toBe(1);
  });

  it('keeps the loop going when a model call fails, and says so', async () => {
    let ms = 0;
    const { client, calls } = recordingClient('refresh');
    const bridge = createModelBridge(client, { referenceRadius: 1e6, clock: () => ms });
    const box = createBlackBox();
    bridge.beginAttempt(start, box.beginAttempt(start, 0));
    bridge.ingest(batch(0));
    await bridge.settled();
    expect(bridge.lastError()).toBe('refresh failed');
    // The navigator still answers, and later calls still go through.
    expect(bridge.believedWorld(10).t).toBe(10);
    ms = 2000;
    bridge.ingest(batch(20));
    await bridge.forecast({ id: 'f', attemptId: 'attempt-0001', issuedAt: 30, plan, span: 600 });
    expect(calls.at(-1)).toBe('forecast:30:600:30374');
    expect(bridge.lastError()).toBeUndefined();
  });

  it('delivers a draft that carries the forecast detail, whether the model puts it inside or beside', async () => {
    const beside = { sigmaMajor: [], presentSource: 'arrival', presentTime: 0, asteroids: [] };
    const inside = { sigmaMajor: [], presentSource: 'window', presentTime: 25, asteroids: [] };
    const { client } = recordingClient();
    const answer = (draft: object) =>
      Object.assign(client, {
        forecast: () => Promise.resolve({ forecast: draft as unknown as Forecast, detail: beside }),
      });
    const bridge = createModelBridge(client, { referenceRadius: 1e6, clock: () => 0 });
    const box = createBlackBox();
    bridge.beginAttempt(start, box.beginAttempt(start, 0));
    const request = { id: 'f', attemptId: 'attempt-0001', issuedAt: 30, plan, span: 600 };
    // An older client: the detail comes back beside the forecast and is put into the draft.
    answer({ id: 'f', samples: [] });
    expect((await bridge.forecast(request)).detail).toEqual(beside);
    // The model now puts it inside: that one is kept.
    answer({ id: 'f', samples: [], detail: inside });
    expect((await bridge.forecast(request)).detail).toEqual(inside);
  });

  it('passes the burn and empirical reports through, in the queue with everything else', async () => {
    const { client, calls } = recordingClient();
    const bridge = createModelBridge(client, { referenceRadius: 1e6, clock: () => 0 });
    const box = createBlackBox();
    bridge.beginAttempt(start, box.beginAttempt(start, 0));
    const [burns, empirical] = await Promise.all([
      bridge.rules.burns(['attempt-0001']),
      bridge.rules.empirical(),
    ]);
    expect(burns).toEqual([]);
    expect(empirical).toBeNull();
    expect(calls).toEqual(['init:30374', 'begin:attempt-0001', 'burns', 'empirical']);
  });
});
