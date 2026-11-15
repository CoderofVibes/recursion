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
import type { Forecast } from '../contracts/index.ts';
import { TimeControls, enter, nextMarker, wallTime } from './controls.tsx';

function game(phase: Phase, warp = 60) {
  const calls: string[] = [];
  const g = {
    briefing,
    status: () => ({
      phase,
      t: phase === 'prepare' ? 0 : 1234,
      paused: phase !== 'operate',
      warp,
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

describe('time to the next event (S9 R3)', () => {
  const forecast = (planId: string, epoch: number, at: number[], approach?: number, end = 9000) =>
    ({
      inputs: {
        plan: {
          id: planId,
          epoch,
          items: at.map((a, i) => ({
            id: `i${i}`,
            at: a,
            command: { kind: i === 0 ? 'attitude' : 'burn' },
          })),
        },
      },
      closestApproaches: approach === undefined ? [] : [{ id: 'beta', t: approach }],
      samples: [{ t: epoch }, { t: end }],
    }) as unknown as Forecast;

  it('reads 400 ship seconds as 6:40 at 1× and 0.2 s nominal at 2000×', () => {
    expect(wallTime(400, 1)).toBe('6:40');
    expect(wallTime(400, 2000)).toBe('0.2 s');
    expect(wallTime(4 * 3600 + 5, 1)).toBe('4:00:05');
    expect(wallTime(42, 1)).toBe('42 s');
  });

  it('takes the plan still scheduled first, then the forecast, and never guesses', () => {
    const issued = forecast('plan-1', 1000, [600, 1080]);
    // The turn ahead of the burn is the next thing the plan does.
    expect(nextMarker({ t: 1200, planId: 'plan-1' }, [issued])).toEqual({
      label: 'next turn',
      t: 1600,
    });
    expect(nextMarker({ t: 1700, planId: 'plan-1' }, [issued])).toEqual({
      label: 'next burn',
      t: 2080,
    });
    // No plan scheduled: the issued forecast's next closest approach, else its end.
    const coast = forecast('plan-2', 0, [], 5000);
    expect(nextMarker({ t: 100 }, [coast])).toEqual({ label: 'closest beta', t: 5000 });
    expect(nextMarker({ t: 6000 }, [coast])).toEqual({ label: 'forecast ends', t: 9000 });
    // Past the forecast's end, and with nothing issued, nothing is shown.
    expect(nextMarker({ t: 9500 }, [coast])).toBeNull();
    expect(nextMarker({ t: 0 }, [])).toBeNull();
  });

  it('estimates at the 1× entry rate before ENTER, and keeps why warp dropped', () => {
    const coast = forecast('plan-2', 0, [], 400);
    const before = renderToStaticMarkup(
      <TimeControls game={game('prepare').g} forecasts={[coast]} />,
    );
    expect(before).toContain('closest beta in 6:40 ship');
    expect(before).not.toContain('nominal');
    const inside = renderToStaticMarkup(
      <TimeControls game={game('operate').g} forecasts={[forecast('p', 1000, [], 1634)]} />,
    );
    // 400 ship seconds at the selected 60×.
    expect(inside).toContain('6.7 s at 60× nominal');
    const dropped = renderToStaticMarkup(
      <TimeControls game={game('operate', 1).g} reason="off the forecast" />,
    );
    expect(dropped).toContain('warp to 1× · off the forecast');
    // Once the player raises warp again the reason is gone.
    expect(
      renderToStaticMarkup(<TimeControls game={game('operate').g} reason="off the forecast" />),
    ).not.toContain('off the forecast');
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
