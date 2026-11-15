/**
 * Stepping through the prediction beside the MAP's region view: the panel offers the walk only
 * when there is a forecast, names the steps, and frames each one.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  archive,
  attempts,
  briefing,
  shipDefinition,
  viewSnapshot,
} from '../contracts/fixtures/index.ts';
import type { ViewSnapshot } from '../contracts/index.ts';
import type { GameControls } from '../game/belief/controls.ts';
import { Desk } from './desk.ts';
import {
  HOLO_INTO_BODY,
  HOLO_MARGIN,
  RehearsalPanel,
  followRange,
  wholeRange,
} from './Rehearsal.tsx';
import { BODY_IN_VOLUME } from '../view3d/flight/FlightHolo.ts';

function game(snapshot: ViewSnapshot = viewSnapshot): GameControls {
  const current = attempts.at(-1)!;
  return {
    briefing,
    ship: shipDefinition,
    blackBox: { archive: () => archive },
    status: () => ({
      phase: 'prepare',
      attemptId: current.id,
      attemptIndex: current.index,
      t: snapshot.t,
      alerts: [],
    }),
    snapshot: () => snapshot,
    setCompare: () => undefined,
  } as unknown as GameControls;
}

describe('framing a step', () => {
  it('brings the nearest body up large when the view follows the ship', () => {
    const radii = new Map([
      ['alpha', 250_000],
      ['beta', 160_000],
    ]);
    const ranges = [
      { id: 'alpha', name: 'Alpha', clearance: 125_000, sigma: 12_000 },
      { id: 'beta', name: 'Beta', clearance: 3_400_000, sigma: null },
    ];
    // Alpha is nearest: the view reaches its surface, 125 km off, and half its radius into
    // it, with a margin; so the body is large and only its near side shows.
    const range = followRange({ ranges }, radii);
    expect(range).toBeCloseTo((125_000 + 0.5 * 250_000) * 1.15, 6);
    // Its surface is in view; its centre and far side are not.
    expect(range).toBeGreaterThan(125_000);
    expect(range).toBeLessThan(125_000 + 250_000);
    // A ship inside a body (a bad forecast) still gets a view, never a negative one.
    expect(
      followRange(
        { ranges: [{ id: 'alpha', name: 'Alpha', clearance: -5_000, sigma: null }] },
        radii,
      ),
    ).toBeCloseTo(0.5 * 250_000 * 1.15, 6);
    // Nothing to frame against is no range at all.
    expect(followRange({ ranges: [] }, radii)).toBe(0);
  });

  it('in the hologram reaches just far enough for the body to be drawn, not a mark on the rim', () => {
    const radii = new Map([['alpha', 250_000]]);
    const ranges = [{ id: 'alpha', name: 'Alpha', clearance: 125_000, sigma: 12_000 }];
    const range = followRange({ ranges }, radii, HOLO_INTO_BODY, HOLO_MARGIN);
    expect(range).toBeCloseTo((125_000 + 1.35 * 250_000) * 1.05, 6);
    // The hologram's own rule for drawing a body: its centre, and a part of its radius beyond,
    // inside the rim. The body here passes it, with little to spare, so it is as large as the
    // volume allows: its radius is more than half the range, and its far side is past the rim.
    const centre = 125_000 + 250_000;
    expect(centre + BODY_IN_VOLUME * 250_000).toBeLessThan(range);
    expect(250_000 / range).toBeGreaterThan(0.5);
    expect(centre + 250_000).toBeGreaterThan(range);
    // The flat chart's own, tighter view would leave it a mark on the rim there.
    expect(centre + BODY_IN_VOLUME * 250_000).toBeGreaterThan(followRange({ ranges }, radii));
  });

  it('holds the whole forecast from where the ship is now when the view stays', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 300_000, y: 400_000 },
      { x: 100_000, y: 0 },
    ];
    expect(wholeRange(path)).toBeCloseTo(500_000 * 1.15, 6);
    expect(wholeRange([])).toBe(0);
  });
});

describe('the predictive model beside the region view', () => {
  it('offers nothing to step through without a forecast, and the way to the plan', () => {
    const desk = new Desk(game({ ...viewSnapshot, forecasts: [] }));
    const html = renderToStaticMarkup(<RehearsalPanel desk={desk} onPlan={() => undefined} />);
    expect(html).toContain('nothing to step through yet');
    expect(html).toContain('OPEN PLAN');
    expect(html).not.toContain('STEP THROUGH THE FORECAST');
  });

  it('offers the walk for the forecast last issued, and says when it ends', () => {
    const desk = new Desk(game());
    const html = renderToStaticMarkup(<RehearsalPanel desk={desk} />);
    expect(html).toContain('STEP THROUGH THE FORECAST');
    expect(html).toContain('issued · model v');
    expect(html).toMatch(/the forecast (ends|runs to) T\+/);
    // Not stepping yet: the region is shown as it is now.
    expect(html).not.toContain('aria-label="Forecast time"');
  });

  it('walks the steps once started: where the ship is then, how close, how sure', () => {
    const desk = new Desk(game());
    const issued = viewSnapshot.forecasts.at(-1)!;
    desk.rehearsal = { t: issued.samples.at(-1)!.t, follow: true };
    const html = renderToStaticMarkup(<RehearsalPanel desk={desk} />);
    expect(html).toContain('aria-label="Step through the forecast"');
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).toContain('FORECAST ENDS');
    // A clearance for every believed body, each with what the forecast is sure of.
    for (const body of viewSnapshot.world.bodies) expect(html).toContain(`${body.name} clearance`);
    expect(html).toContain('Follow the ship');
    expect(html).toContain('STOP STEPPING');
    expect(html).not.toContain('NaN');
  });

  it('says where the model stands at the step shown', () => {
    const desk = new Desk(game());
    const issued = viewSnapshot.forecasts.at(-1)!;
    const beyond = issued.samples.find((s) => s.extrapolating && s.validated !== true);
    const on = issued.samples.find((s) => !s.extrapolating);
    if (beyond) {
      desk.rehearsal = { t: beyond.t, follow: true };
      expect(renderToStaticMarkup(<RehearsalPanel desk={desk} />)).toContain(
        'here the model is beyond its data',
      );
    }
    if (on) {
      desk.rehearsal = { t: on.t, follow: true };
      expect(renderToStaticMarkup(<RehearsalPanel desk={desk} />)).toContain(
        'here the model stands on its data',
      );
    }
    expect(beyond ?? on).toBeDefined();
  });

  it('forgets the stepping when a new attempt begins', () => {
    const desk = new Desk(game());
    desk.setRehearsal({ t: 10, follow: true });
    desk.newAttempt();
    expect(desk.rehearsal).toBeUndefined();
  });
});
