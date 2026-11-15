/**
 * The desk keeps the plan being edited (S9 R4): across page and view changes, with any edit
 * making a preview of the old inputs stale, and set aside (never replayed) on recurrence.
 */
import { describe, expect, it } from 'vitest';
import {
  archive,
  attempts,
  briefing,
  shipDefinition,
  viewSnapshot,
} from '../contracts/fixtures/index.ts';
import type { ForecastDraft } from '../contracts/index.ts';
import type { GameControls, PlanDraft } from '../game/belief/controls.ts';
import { Desk } from './desk.ts';
import type { BurnRow } from './desk.ts';

function stub() {
  let index = 1;
  const previews: { plan: PlanDraft; resolve: (d: ForecastDraft) => void }[] = [];
  const commits: PlanDraft[] = [];
  const game = {
    briefing,
    ship: shipDefinition,
    blackBox: { archive: () => archive },
    status: () => ({ attemptIndex: index, t: 0, phase: 'prepare' }),
    snapshot: () => viewSnapshot,
    setCompare: () => undefined,
    preview: (plan: PlanDraft) =>
      new Promise<ForecastDraft>((resolve) => previews.push({ plan, resolve })),
    commit: (plan: PlanDraft) => {
      commits.push(plan);
      return new Promise(() => undefined);
    },
  } as unknown as GameControls;
  return { game, previews, commits, next: () => index++ };
}

const burn = (key: number, amount = 5): BurnRow => ({
  key,
  at: 600,
  direction: 'prograde',
  target: 'alpha',
  offset: 0,
  sizing: 'deltaV',
  amount,
  throttle: 1,
});
const draft = attempts.at(-1)!.forecasts[0] as unknown as ForecastDraft;
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('the plan being edited', () => {
  it('is kept on the desk, and any edit makes the preview stale', async () => {
    const { game, previews } = stub();
    const desk = new Desk(game);
    expect(desk.draftState()).toBe('empty');
    desk.editPlan((e) => ({ ...e, burns: [burn(desk.newRowKey())] }));
    expect(desk.draftState()).toBe('edited');
    desk.previewPlan({ items: [] });
    previews[0]!.resolve(draft);
    await settle();
    expect(desk.preview).toBe(draft);
    expect(desk.draftState()).toBe('previewed');
    // Changing an input: the preview no longer describes what is shown.
    desk.editPlan((e) => ({ ...e, burns: e.burns.map((b) => ({ ...b, amount: 6 })) }));
    expect(desk.preview).toBeUndefined();
    expect(desk.draftState()).toBe('edited');
    expect(desk.planEdit.burns[0]!.amount).toBe(6);
  });

  it('drops a preview that arrives after the draft was edited', async () => {
    const { game, previews } = stub();
    const desk = new Desk(game);
    desk.editPlan((e) => ({ ...e, burns: [burn(1)] }));
    desk.previewPlan({ items: [] });
    desk.editPlan((e) => ({ ...e, burns: [burn(1, 9)] }));
    previews[0]!.resolve(draft);
    await settle();
    expect(desk.preview).toBeUndefined();
    expect(desk.note).toContain('changed while forecasting');
  });

  it('commits what is shown, and a procedure does not count as the draft', () => {
    const { game, commits } = stub();
    const desk = new Desk(game);
    desk.editPlan((e) => ({ ...e, burns: [burn(1)] }));
    desk.commitPlan({ name: 'prograde 5.0 m/s', items: [] });
    expect(commits.map((c) => c.name)).toEqual(['prograde 5.0 m/s']);
    expect(desk.preview).toBeUndefined();
  });

  it('is set aside on recurrence with a reason, offered back, and never scheduled by itself', () => {
    const { game, commits, next } = stub();
    const desk = new Desk(game);
    desk.newAttempt(); // the first attempt: nothing to set aside
    expect(desk.setAside).toBeUndefined();
    desk.editPlan((e) => ({ ...e, burns: [burn(1)] }));
    next();
    desk.newAttempt();
    expect(desk.planEdit.burns).toEqual([]);
    expect(desk.setAside?.attempt).toBe(1);
    expect(desk.note).toContain('set aside');
    expect(commits).toEqual([]);
    desk.restoreSetAside();
    expect(desk.planEdit.burns).toHaveLength(1);
    expect(desk.setAside).toBeUndefined();
    expect(desk.draftState()).toBe('edited');
    expect(commits).toEqual([]);
  });
});
