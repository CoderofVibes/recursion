/**
 * The in-thread client (S15 rank 5): the service is imported on first use, calls run in the
 * order they were made even before `init` has resolved, and nothing runs after `terminate`.
 */

import { describe, expect, it } from 'vitest';
import { fixtures } from '../contracts/fixtures/index.ts';
import { createModelClient, contextFromBriefing } from './index.ts';

const ctx = () => contextFromBriefing(fixtures.briefing, fixtures.shipDefinition);

describe('the in-thread client', () => {
  it('runs calls in order, even those made before init has resolved', async () => {
    const c = createModelClient({ worker: false });
    const init = c.init(ctx());
    const load = c.load({ attempts: [] });
    const state = c.state();
    const [a, b, s] = await Promise.all([init, load, state]);
    expect(a.version).toBe(0);
    expect(b.version).toBe(1);
    expect(s.version).toBe(1);
    c.terminate();
  });

  it('refuses a call before init, and every call after terminate', async () => {
    const c = createModelClient({ worker: false });
    await expect(c.state()).rejects.toThrow('init first');
    await c.init(ctx());
    c.terminate();
    await expect(c.state()).rejects.toThrow('terminated');
  });
});

describe('redundant work behind a long call (S20)', () => {
  // A live attempt: the fixtures' first attempt, its measurements handed over in pieces.
  const full = fixtures.attempts[0];
  const pieces = [0, 1, 2, 3].map((k) => full.measurements.filter((_, i) => i % 4 === k));
  const start = { ...full, measurements: [], outcome: { kind: 'in-progress' as const } };

  it('a waiting refresh superseded by a later one: every record still arrives', async () => {
    const c = createModelClient({ worker: false });
    void c.init(ctx());
    void c.load({ attempts: [] });
    void c.beginAttempt(start);
    // Issued while the model is busy: hand-over after hand-over, as the bridge does.
    const refreshes = pieces.map((p) => {
      void c.append(full.id, { measurements: p });
      return c.refresh();
    });
    expect(c.busy().running).toBe('init');
    expect(c.busy().coalesced).toBe(3);
    const states = await Promise.all(refreshes);
    // All four callers get the one rebuild that saw every record.
    for (const s of states) expect(s).toEqual(states[3]);
    const coverage = (await c.report()).coverage.find((q) => q.attempt === full.id)!;
    const direct = createModelClient({ worker: false });
    await direct.init(ctx());
    await direct.load({ attempts: [] });
    await direct.beginAttempt({ ...start, measurements: [...full.measurements] });
    await direct.refresh();
    expect(coverage).toEqual((await direct.report()).coverage.find((q) => q.attempt === full.id));
    expect(c.busy()).toMatchObject({ running: null, queued: 0 });
    c.terminate();
    direct.terminate();
  });

  it('never merges across a forecast, and a refresh never replaces a refit', async () => {
    const c = createModelClient({ worker: false });
    void c.init(ctx());
    void c.load({ attempts: [] });
    void c.beginAttempt(start);
    void c.append(full.id, { measurements: pieces[0]! });
    const r1 = c.refresh();
    const f = c.state(); // anything other than an append ends the run
    void c.append(full.id, { measurements: pieces[1]! });
    const fit = c.refit();
    void c.append(full.id, { measurements: pieces[2]! });
    const r2 = c.refresh();
    expect(c.busy().coalesced).toBe(0);
    await Promise.all([r1, f, fit, r2]);
    c.terminate();
  });

  it('refuses what is still waiting when terminated', async () => {
    const c = createModelClient({ worker: false });
    const running = c.init(ctx());
    const waiting = c.load({ attempts: [] });
    c.terminate();
    await expect(waiting).rejects.toThrow('terminated');
    // The call already running is refused too: nothing completes after terminate.
    await expect(running).rejects.toThrow('terminated');
  });
});
