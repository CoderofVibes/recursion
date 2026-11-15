/**
 * Time in the control room (DECISIONS A12): prepare as long as you like, enter, and from then
 * on no pause, only warp from 1× up; a new alert drops warp to 1×.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { briefing } from '../contracts/fixtures/index.ts';
import type { GameControls, Phase } from '../game/belief/controls.ts';
import type { AlertItem } from '../theme/components/index.ts';
import { freshAlerts } from './alerts.ts';
import { TimeControls, enter } from './controls.tsx';

function game(phase: Phase) {
  const calls: string[] = [];
  const g = {
    briefing,
    status: () => ({
      phase,
      t: phase === 'prepare' ? 0 : 1234,
      paused: phase !== 'operate',
      warp: 60,
      warpSteps: [1, 10, 60, 300, 1000, 2000],
      saturated: false,
      committing: false,
    }),
    setWarp: (w: number) => void calls.push(`warp ${w}`),
    setPaused: (p: boolean) => void calls.push(`paused ${p}`),
  } as unknown as GameControls;
  return { g, calls };
}

describe('time controls', () => {
  it('offers only the way in before the encounter', () => {
    const html = renderToStaticMarkup(<TimeControls game={game('prepare').g} />);
    expect(html).toContain(`ENTER ${briefing.name}`);
    expect(html).not.toContain('HOLD');
    expect(html).not.toContain('2000×');
  });

  it('has no pause inside the encounter, and no step slower than 1×', () => {
    const html = renderToStaticMarkup(<TimeControls game={game('operate').g} />);
    expect(html).not.toContain('HOLD');
    expect(html).not.toContain('ENTER');
    expect(html).toContain('1×');
    expect(html).toContain('2000×');
  });

  it('enters at 1×, and only from the prepare phase', () => {
    const before = game('prepare');
    enter(before.g);
    expect(before.calls).toEqual(['warp 1', 'paused false']);
    const inside = game('operate');
    enter(inside.g);
    expect(inside.calls).toEqual([]);
  });
});

describe('new alerts', () => {
  const alert = (id: string, level: AlertItem['level']): AlertItem => ({ id, level, text: id });

  it('counts a caution or warning the first time it shows', () => {
    const first = freshAlerts(new Set(), [alert('cpa-a-07', 'caution')]);
    expect(first.fresh.map((a) => a.id)).toEqual(['cpa-a-07']);
    const again = freshAlerts(first.active, [alert('cpa-a-07', 'caution')]);
    expect(again.fresh).toEqual([]);
  });

  it('counts it again when it worsens, or when it comes back after clearing', () => {
    const shown = freshAlerts(new Set(), [alert('cpa-a-07', 'caution')]).active;
    expect(freshAlerts(shown, [alert('cpa-a-07', 'warning')]).fresh).toHaveLength(1);
    const cleared = freshAlerts(shown, []).active;
    expect(freshAlerts(cleared, [alert('cpa-a-07', 'caution')]).fresh).toHaveLength(1);
  });

  it('never counts an advisory, so a passing horizon does not stop a long coast', () => {
    expect(freshAlerts(new Set(), [alert('ended', 'advisory')]).fresh).toEqual([]);
  });
});
