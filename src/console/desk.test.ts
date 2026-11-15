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
import type { Command, ForecastDraft } from '../contracts/index.ts';
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

/**
 * Setting the ship up. Before the encounter is entered nothing runs: a command sent then only
 * reaches the ship on ENTER, and the ship reports nothing meanwhile. So a setting made while
 * preparing is part of the design: shown at once as set, sent on ENTER. Inside the encounter a
 * setting is a command, sent at once.
 */
function shipStub(start: 'prepare' | 'operate' = 'prepare') {
  let phase = start;
  const commands: Command[] = [];
  const calls: string[] = [];
  const rejecting: { reject?: (reason: unknown) => void } = {};
  const game = {
    briefing,
    ship: shipDefinition,
    blackBox: { archive: () => archive },
    status: () => ({ attemptIndex: 1, t: 0, phase }),
    snapshot: () => viewSnapshot,
    setCompare: () => undefined,
    command: (c: Command) => void commands.push(c),
    setWarp: (w: number) => {
      calls.push(`warp ${w}`);
      phase = 'operate';
    },
    setPaused: (p: boolean) => void calls.push(`paused ${p}`),
    preview: () =>
      new Promise<ForecastDraft>((_, reject) => {
        rejecting.reject = reject;
      }),
  } as unknown as GameControls;
  return { game, commands, calls, rejecting };
}

describe('setting the ship up before the encounter', () => {
  it('shows a setting as set at once, and sends nothing until ENTER', () => {
    const { game, commands } = shipStub();
    const desk = new Desk(game);
    desk.setUnit('comms', { mode: 'on', allocation: 120 });
    desk.setRecorderRate(1);
    desk.setConfiguration('radiators-deployed');
    // As set, on the desk.
    expect(desk.unitSetting('comms')).toEqual({ mode: 'on', allocation: 120 });
    expect(desk.pendingSettings().comms).toEqual({ mode: 'on', allocation: 120 });
    expect(desk.recorderRate()).toBe(1);
    expect(desk.configuration()).toBe('radiators-deployed');
    // Nothing has gone to the ship, and the design as shown is not yet the recorded one.
    expect(commands).toEqual([]);
    expect(desk.designRecorded()).toBe(false);
  });

  it('keeps the camera mode in its own place in the design, with any allocation beside it', () => {
    const { game } = shipStub();
    const desk = new Desk(game);
    desk.setUnit('opt-nav', { mode: 'standby', allocation: 40 });
    expect(desk.design.setup.cameraMode).toBe('standby');
    expect(desk.design.setup.units?.['opt-nav']).toEqual({ allocation: 40 });
    expect(desk.unitSetting('opt-nav')).toEqual({ mode: 'standby', allocation: 40 });
    // A unit the ship does not have is not a setting.
    desk.setUnit('no-such-unit', { mode: 'on' });
    expect(desk.unitSetting('no-such-unit')).toBeUndefined();
    expect(desk.design.setup.units?.['no-such-unit']).toBeUndefined();
  });

  it('on ENTER records the design as shown, sends every setting, then starts the clock at 1×', () => {
    const { game, commands, calls } = shipStub();
    const desk = new Desk(game);
    desk.setUnit('comms', { mode: 'on', allocation: 120 });
    desk.setRecorderRate(1);
    desk.enter();
    // The design is recorded first, as shown; then the ship is set up as designed.
    expect(commands[0]).toMatchObject({ kind: 'mark' });
    expect((commands[0] as { label: string }).label).toContain('"comms":{"mode":"on"');
    expect(commands).toContainEqual({ kind: 'mode', equipment: 'comms', mode: 'on' });
    expect(commands).toContainEqual({ kind: 'power', equipment: 'comms', allocation: 120 });
    expect(commands).toContainEqual({ kind: 'recorder', sampleRate: 1 });
    expect(desk.designRecorded()).toBe(true);
    expect(calls).toEqual(['warp 1', 'paused false']);
    // Entered: ENTER does nothing more, and the design is not sent twice.
    const sent = commands.length;
    desk.enter();
    expect(commands).toHaveLength(sent);
    expect(calls).toHaveLength(2);
  });

  it('does not record a design twice that was recorded and not changed since', () => {
    const { game, commands } = shipStub();
    const desk = new Desk(game);
    desk.commitDesign();
    const sent = commands.length;
    expect(desk.designRecorded()).toBe(true);
    desk.enter();
    expect(commands).toHaveLength(sent);
    // A change after recording makes the record stale until it is recorded again.
    const again = new Desk(shipStub().game);
    again.commitDesign();
    again.setDesign({ reserve: 1234 });
    expect(again.designRecorded()).toBe(false);
  });

  it('inside the encounter sends a setting at once, as a command', () => {
    const { game, commands } = shipStub('operate');
    const desk = new Desk(game);
    desk.setUnit('comms', { mode: 'on' });
    desk.setUnit('comms', { allocation: 90 });
    desk.setRecorderRate(10);
    desk.setConfiguration('stowed');
    expect(commands).toEqual([
      { kind: 'mode', equipment: 'comms', mode: 'on' },
      { kind: 'power', equipment: 'comms', allocation: 90 },
      { kind: 'recorder', sampleRate: 10 },
      { kind: 'configure', configuration: 'stowed' },
    ]);
    // Nothing waits on the desk: what is shown is the ship's own report.
    expect(desk.pendingSettings()).toEqual({});
    expect(desk.design.setup.units).toBeUndefined();
  });
});

describe('the forecast following the plan', () => {
  it('keeps the forecast of the plan as it was until the new one arrives', async () => {
    const { game, previews } = stub();
    const desk = new Desk(game);
    desk.editPlan((e) => ({ ...e, burns: [burn(1)] }));
    const edits = desk.planEdits();
    desk.previewPlan({ items: [] });
    expect(desk.previewBusy).toBe(true);
    previews[0]!.resolve(draft);
    await settle();
    expect(desk.previewBusy).toBe(false);
    expect(desk.stalePreview).toBeUndefined();
    // An edit: the old forecast is kept, as stale, and the count of edits moves on.
    desk.editPlan((e) => ({ ...e, burns: [burn(1, 9)] }));
    expect(desk.planEdits()).toBe(edits + 1);
    expect(desk.preview).toBeUndefined();
    expect(desk.stalePreview).toBe(draft);
    // The new forecast replaces it.
    const next = { ...draft };
    desk.previewPlan({ items: [] });
    previews[1]!.resolve(next);
    await settle();
    expect(desk.preview).toBe(next);
    expect(desk.stalePreview).toBeUndefined();
  });

  it('does not ask again for a draft that could not be forecast, until it changes', async () => {
    const { game, rejecting } = shipStub();
    const desk = new Desk(game);
    desk.editPlan((e) => ({ ...e, burns: [burn(1)] }));
    expect(desk.previewFailed()).toBe(false);
    desk.previewPlan({ items: [] });
    rejecting.reject?.(new Error('no present state'));
    await settle();
    expect(desk.previewBusy).toBe(false);
    expect(desk.previewFailed()).toBe(true);
    expect(desk.note).toContain('no forecast');
    desk.editPlan((e) => ({ ...e, burns: [burn(1, 7)] }));
    expect(desk.previewFailed()).toBe(false);
  });

  it('forgets the stale forecast once the plan is committed', async () => {
    const { game, previews } = stub();
    const desk = new Desk(game);
    desk.editPlan((e) => ({ ...e, burns: [burn(1)] }));
    desk.previewPlan({ items: [] });
    previews[0]!.resolve(draft);
    await settle();
    desk.editPlan((e) => ({ ...e, burns: [burn(1, 9)] }));
    expect(desk.stalePreview).toBe(draft);
    desk.commitPlan({ items: [] });
    expect(desk.stalePreview).toBeUndefined();
  });

  it('remembers what the chart holds and where its cursor is, and starts the cursor again on an edit', () => {
    const desk = new Desk(stub().game);
    expect(desk.chartFraming).toBe('plan');
    desk.setChartFraming('follow');
    expect(desk.chartFraming).toBe('follow');
    desk.setChartT(1200);
    expect(desk.chartT).toBe(1200);
    desk.editPlan((e) => ({ ...e, burns: [burn(1)] }));
    expect(desk.chartT).toBeUndefined();
    expect(desk.chartFraming).toBe('follow');
  });
});
