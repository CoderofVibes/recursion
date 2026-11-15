/**
 * The loop's pages, in what they work out before they draw: a burn across the ship's motion,
 * the flight charted against its forecast and the verdict on it, the trend of the measured pull
 * against the law, and which mode a power fader has reached. Plain inputs, exact outputs.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ForecastDivergence } from '../blackbox/index.ts';
import { attempts, viewSnapshot } from '../contracts/fixtures/index.ts';
import type { AttemptRecord, EquipmentSpec, Forecast, Measurement } from '../contracts/index.ts';
import { goStage } from './ConsoleScreen.tsx';
import type { Desk } from './desk.ts';
import { VerdictView, flightChart, leadForecast } from './pages/BlackBoxPage.tsx';
import { slopeText } from './pages/ModelPage.tsx';
import { acrossMotion } from './pages/PlanPage.tsx';
import { modeFor } from './pages/SystemsPage.tsx';
import { trackBreaks } from './regionChart.ts';
import { StrengthPlot, strengthTrend } from './StrengthPlot.tsx';

const dot = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z?: number }) =>
  a.x * b.x + a.y * b.y + a.z * (b.z ?? 0);
const norm = (a: { x: number; y: number; z: number }) => Math.hypot(a.x, a.y, a.z);

describe('a burn across the ship’s motion', () => {
  it('is to the left of the motion in the plane of the chart, and right is its opposite', () => {
    // Moving along +x, left is +y (the chart is seen from above, +z toward the eye).
    const left = acrossMotion({ x: 120, y: 0, z: 0 }, 'left')!;
    expect(left.x).toBeCloseTo(0, 12);
    expect(left.y).toBeCloseTo(1, 12);
    expect(left.z).toBeCloseTo(0, 12);
    const right = acrossMotion({ x: 120, y: 0, z: 0 }, 'right')!;
    expect(right.y).toBeCloseTo(-1, 12);
    // Moving along +y, left is −x.
    expect(acrossMotion({ x: 0, y: 50 }, 'left')!.x).toBeCloseTo(-1, 12);
  });

  it('is up out of the plane for a ship moving in it, and down is its opposite', () => {
    const up = acrossMotion({ x: 30, y: 40, z: 0 }, 'up')!;
    expect(up.x).toBeCloseTo(0, 12);
    expect(up.y).toBeCloseTo(0, 12);
    expect(up.z).toBeCloseTo(1, 12);
    expect(acrossMotion({ x: 30, y: 40, z: 0 }, 'down')!.z).toBeCloseTo(-1, 12);
  });

  it('is a unit direction square to the motion, whichever way the ship is going', () => {
    const velocities = [
      { x: 92, y: -13, z: 4 },
      { x: -5, y: 71, z: -22 },
      { x: 0.3, y: 0.1, z: 140 },
    ];
    for (const v of velocities)
      for (const side of ['left', 'right', 'up', 'down'] as const) {
        const d = acrossMotion(v, side)!;
        expect(norm(d)).toBeCloseTo(1, 9);
        expect(dot(d, v) / Math.hypot(v.x, v.y, v.z)).toBeCloseTo(0, 9);
      }
    // Left, up and the motion make a right-handed set: up is the motion crossed with left.
    const v = velocities[0]!;
    const l = acrossMotion(v, 'left')!;
    const u = acrossMotion(v, 'up')!;
    const speed = Math.hypot(v.x, v.y, v.z);
    expect(u.x).toBeCloseTo((v.y * l.z - v.z * l.y) / speed, 9);
    expect(u.y).toBeCloseTo((v.z * l.x - v.x * l.z) / speed, 9);
    expect(u.z).toBeCloseTo((v.x * l.y - v.y * l.x) / speed, 9);
  });

  it('still has a left for a ship moving straight up, and none for a ship not moving', () => {
    const left = acrossMotion({ x: 0, y: 0, z: 80 }, 'left')!;
    expect(norm(left)).toBeCloseTo(1, 12);
    expect(left.z).toBeCloseTo(0, 12);
    expect(acrossMotion({ x: 0, y: 0, z: 0 }, 'left')).toBeUndefined();
  });
});

/** A fix on a body: a bearing and a range at the same moment from the same sensor. */
const fix = (t: number, azimuth: number, range: number): Measurement[] =>
  [
    { t, kind: 'bearing', source: 'camera', target: 'alpha', value: [azimuth, 0] },
    { t, kind: 'range', source: 'camera', target: 'alpha', value: [range] },
  ] as unknown as Measurement[];

const bodies = [
  { id: 'alpha', radius: 40_000, name: 'Alpha' },
  { id: 'beta', radius: 30_000, name: 'Beta' },
];

/** A flight that passes Alpha: fixes every 10 s, with none between t = 40 and t = 100. */
const times = [0, 10, 20, 30, 40, 100, 110, 120];
const flown: AttemptRecord = {
  ...attempts[0]!,
  forecasts: [],
  measurements: times.flatMap((t) => fix(t, Math.PI, 500_000 - t * 1000)),
};
/** A forecast of that flight, with Alpha's own track in it, 1,000 km along +x. */
const base = attempts[0]!.forecasts[0]!;
const issued: Forecast = {
  ...base,
  objects: [
    {
      id: 'alpha',
      samples: base.samples.map((s) => ({
        t: s.t,
        position: { x: 1_000_000, y: 0, z: 0 },
        positionCov: [0, 0, 0, 0, 0, 0],
      })),
    },
  ],
} as unknown as Forecast;

describe('a flight charted against its forecast', () => {
  it('finds the stretches with no fix, so the flown line is not joined across them', () => {
    expect(trackBreaks(times.map((t) => ({ t })))).toEqual([5]);
    // Evenly spaced fixes have no break; too few to know a usual spacing have none either.
    expect(trackBreaks([0, 10, 20, 30].map((t) => ({ t })))).toEqual([]);
    expect(trackBreaks([{ t: 0 }, { t: 500 }])).toEqual([]);
  });

  it('draws the flight as measured, about the body it ranged, with the body at the centre', () => {
    const chart = flightChart(flown, undefined, undefined, null, bodies)!;
    expect(chart.about.id).toBe('alpha');
    expect(chart.bodies[0]).toEqual({ id: 'alpha', name: 'Alpha', x: 0, y: 0, radius: 40_000 });
    // A bearing of π to a body 500 km off puts the ship 500 km along +x from it.
    expect(chart.trail).toHaveLength(times.length);
    expect(chart.trail[0]![0]).toBeCloseTo(500_000, 3);
    expect(chart.trail[0]![1]).toBeCloseTo(0, 3);
    expect(chart.breaks).toEqual([5]);
    expect(chart.flownTo).toBe(120);
    expect(chart.marks.map((m) => m.kind)).toEqual(['now']);
    expect(chart.reading).toBeUndefined();
    expect(chart.previous).toBeUndefined();
  });

  it('sees the forecast from the same body, and marks where the flight left it', () => {
    const chart = flightChart(flown, undefined, issued, 100, bodies)!;
    // The forecast is drawn less the body's own forecast position.
    const first = issued.samples[0]!;
    expect(chart.reading!.path[0]!.x).toBeCloseTo(first.position.x - 1_000_000, 3);
    expect(chart.reading!.path[0]!.y).toBeCloseTo(first.position.y, 3);
    // Where it left: the first fix at or after that moment (t = 100: 400 km out).
    const left = chart.marks.find((m) => m.kind === 'left')!;
    expect(left.x).toBeCloseTo(400_000, 3);
    expect(left.label).toBe('left the forecast');
    expect(chart.marks.some((m) => m.kind === 'ends')).toBe(true);
    // Everything drawn is inside the fit, with the body whole.
    const xs = chart.fit.map((p) => p[0]);
    expect(Math.min(...xs)).toBeLessThanOrEqual(-40_000);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(500_000);
  });

  it('draws the attempt before against the same body, with its own gaps', () => {
    const chart = flightChart(flown, flown, undefined, null, bodies)!;
    expect(chart.previous).toHaveLength(times.length);
    expect(chart.previousBreaks).toEqual([5]);
  });

  it('draws nothing for an attempt that ranged nothing, or a body it does not know', () => {
    const blind: AttemptRecord = { ...flown, measurements: [] };
    expect(flightChart(blind, undefined, undefined, null, bodies)).toBeUndefined();
    expect(flightChart(flown, undefined, undefined, null, [bodies[1]!])).toBeUndefined();
  });

  it('charts the fixture attempts, each with the one before it', () => {
    const known = viewSnapshot.world.bodies.map((b) => ({
      id: b.id,
      radius: b.radius,
      name: b.name,
    }));
    const second = flightChart(attempts[1]!, attempts[0], undefined, null, known)!;
    expect(second.trail.length).toBeGreaterThan(1);
    expect(second.previous!.length).toBeGreaterThan(1);
  });
});

const divergence = (patch: Partial<ForecastDivergence>): ForecastDivergence => ({
  forecast: 'f',
  issuedAt: 0,
  horizon: 1000,
  modelVersion: 0,
  points: [],
  firstBeyond3Sigma: null,
  maxSigmas: null,
  gaps: [],
  unmeasured: false,
  ...patch,
});
const point = (t: number, sigmas: number) =>
  ({ t, sigmas }) as unknown as ForecastDivergence['points'][number];

describe('the forecast a flight is read against', () => {
  const f = (id: string): Forecast => ({ ...base, id }) as Forecast;

  it('is the one the flight left first', () => {
    const [a, b, c] = [f('a'), f('b'), f('c')];
    const lead = leadForecast([
      { f: a, d: divergence({ points: [point(1, 1), point(2, 1), point(3, 1)] }) },
      { f: b, d: divergence({ firstBeyond3Sigma: 500, points: [point(500, 4)] }) },
      { f: c, d: divergence({ firstBeyond3Sigma: 200 }) },
    ]);
    expect(lead).toBe(c);
  });

  it('is the one most of the flight was compared with, when none was left', () => {
    const [a, b] = [f('a'), f('b')];
    expect(
      leadForecast([
        { f: a, d: divergence({ points: [point(1, 1)] }) },
        { f: b, d: divergence({ points: [point(1, 1), point(2, 1)] }) },
      ]),
    ).toBe(b);
    expect(leadForecast([])).toBeUndefined();
  });
});

describe('the verdict on a forecast', () => {
  it('says the flight held, through when, and the worst it was off by', () => {
    const html = renderToStaticMarkup(
      <VerdictView
        forecast={base}
        divergence={divergence({ points: [point(60, 1.2), point(3600, 2.8)], maxSigmas: 2.8 })}
      />,
    );
    expect(html).toContain('HELD');
    expect(html).toContain('inside the forecast through');
    expect(html).toContain('T+01:00:00');
    expect(html).toContain('2.8σ');
    expect(html).not.toContain('LEFT IT');
  });

  it('says the flight left it, and when, as a caution', () => {
    const html = renderToStaticMarkup(
      <VerdictView
        forecast={base}
        divergence={divergence({
          points: [point(60, 1.2), point(7200, 3.4)],
          maxSigmas: 3.4,
          firstBeyond3Sigma: 7200,
          gaps: [[100, 400]],
        })}
      />,
    );
    expect(html).toContain('LEFT IT');
    expect(html).toContain('left the forecast at');
    expect(html).toContain('T+02:00:00');
    expect(html).toContain('3.4σ');
    expect(html).toContain('1 stretch with no fix');
    expect(html).toMatch(/data-status="caution"/);
  });

  it('claims nothing where nothing was forecast, or nothing was measured', () => {
    const none = renderToStaticMarkup(<VerdictView forecast={undefined} divergence={undefined} />);
    expect(none).toContain('no forecast was issued');
    const unmeasured = renderToStaticMarkup(
      <VerdictView forecast={base} divergence={divergence({ unmeasured: true })} />,
    );
    expect(unmeasured).toContain('neither confirmed nor refuted');
    for (const html of [none, unmeasured]) {
      expect(html).not.toContain('HELD');
      expect(html).not.toContain('LEFT IT');
    }
  });
});

describe('the measured pull against the law', () => {
  const points = [
    { distance: 500_000, scale: 1.4, sigma: 0.01 },
    { distance: 1_000_000, scale: 1.0, sigma: 0.01 },
  ];

  it('puts the trend through the points’ centre with the slope the model reports', () => {
    const trend = strengthTrend(points, -0.5)!;
    // In logs the centre is the weighted mean; with equal relative weights here the trend
    // passes midway between the two points in log distance.
    const mid = Math.sqrt(500_000 * 1_000_000);
    const w = points.map((p) => 1 / (p.sigma / p.scale) ** 2);
    const lnD = (w[0]! * Math.log(500_000) + w[1]! * Math.log(1_000_000)) / (w[0]! + w[1]!);
    const lnS = (w[0]! * Math.log(1.4) + w[1]! * Math.log(1.0)) / (w[0]! + w[1]!);
    expect(trend(Math.exp(lnD))).toBeCloseTo(Math.exp(lnS), 12);
    // A slope of −0.5: twice the distance, 1/√2 the strength.
    expect(trend(2 * mid) / trend(mid)).toBeCloseTo(2 ** -0.5, 12);
    // A flat slope is a constant; nothing measured has no trend.
    const flat = strengthTrend(points, 0)!;
    expect(flat(1)).toBeCloseTo(flat(1e9), 12);
    expect(strengthTrend([], -0.5)).toBeUndefined();
  });

  it('draws the trend only when the model reports a slope, beside the law at ×1', () => {
    const dots = points.map((p) => ({ ...p, probe: false, current: false }));
    const withSlope = renderToStaticMarkup(
      <StrengthPlot label="Alpha" points={dots} slope={-0.5} />,
    );
    expect(withSlope).toContain('cs-plot__trend');
    expect(withSlope).toContain('cs-plot__law');
    const without = renderToStaticMarkup(<StrengthPlot label="Alpha" points={dots} />);
    expect(without).not.toContain('cs-plot__trend');
    // The distance labels are set inward at the plot's ends, so neither is cut off.
    const anchors = [...withSlope.matchAll(/y="148" text-anchor="([a-z]+)">[^<]* km</g)].map(
      (m) => m[1],
    );
    expect(anchors).toEqual(['start', 'middle', 'end']);
  });

  it('says in words what a slope means, and does not call a flat one a finding', () => {
    expect(slopeText(null)).toBe('too few fits to tell a slope');
    expect(slopeText(0.02)).toContain('the law holds across these distances');
    expect(slopeText(-0.5)).toContain('stronger close in than the law says');
    expect(slopeText(0.5)).toContain('weaker close in than the law says');
  });
});

describe('a power fader', () => {
  const camera = {
    id: 'camera',
    kind: 'optical-tracker',
    modes: ['off', 'survey', 'track', 'detail', 'reset'],
    defaultMode: 'track',
    params: {
      'mode.survey.power': 60,
      'mode.track.power': 120,
      'mode.detail.power': 200,
    },
  } as unknown as EquipmentSpec;

  it('reaches the least powerful mode that can draw what is asked', () => {
    expect(modeFor(camera, 0)).toBe('off');
    expect(modeFor(camera, 1)).toBe('survey');
    expect(modeFor(camera, 60)).toBe('survey');
    expect(modeFor(camera, 61)).toBe('track');
    expect(modeFor(camera, 120)).toBe('track');
    expect(modeFor(camera, 121)).toBe('detail');
    // More than any mode asks is the most powerful it has; a reset is never a setting.
    expect(modeFor(camera, 5000)).toBe('detail');
  });
});

describe('the rail’s stages', () => {
  it('go to their pages, and FLIGHT goes to the hologram', () => {
    const pages: string[] = [];
    const desk = { setPage: (id: string) => void pages.push(id) } as unknown as Desk;
    let flights = 0;
    for (const id of ['exploration', 'systems', 'plan', 'flight', 'blackbox', 'model'])
      goStage(desk, id, () => flights++);
    expect(pages).toEqual(['exploration', 'systems', 'plan', 'blackbox', 'model']);
    expect(flights).toBe(1);
    // With nowhere to go for FLIGHT (the screen alone), the stage does nothing, not a page.
    goStage(desk, 'flight');
    expect(pages).toHaveLength(5);
  });
});
