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
