/**
 * The console's instruments: the chart's mathematics, the forecast's steps, what the uncertainty
 * is made of, and each instrument's markup. Their stylesheet is held to the theme's tokens by
 * `../console.test.ts`, with the other overlay stylesheets.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BudgetBoard } from './BudgetBoard.tsx';
import {
  CHART_UP,
  at,
  boundsAbout,
  boundsOf,
  envelopeRuns,
  limiting,
  onPlane,
  pathOf,
  scaleLength,
  shares,
  sigmaAcross,
  sigmaAlong,
  sigmaEllipse,
  stepAt,
  stepsOf,
} from './chartMath.ts';
import type { PathPoint, SigmaBySource, Sym3 } from './chartMath.ts';
import { DragBar, dragKey, dragSnap } from './DragBar.tsx';
import { LoopRail } from './LoopRail.tsx';
import { StepBar } from './StepBar.tsx';
import { TrajectoryChart } from './TrajectoryChart.tsx';
import { UncertaintyPanel } from './UncertaintyPanel.tsx';

/** σ = 30 m along x, 40 m along y, 50 m along z, uncorrelated. */
const COV: Sym3 = [900, 0, 0, 1600, 0, 2500];

describe('chart mathematics', () => {
  it('sees a point chart-up: x right, y up, z dropped', () => {
    expect(onPlane(CHART_UP, [3, 4, 5])).toEqual([3, 4]);
  });

  it('measures the envelope across the path, not along it', () => {
    // Heading along x: the width across is the y sigma; heading along y, the x sigma.
    expect(sigmaAcross(CHART_UP, COV, [1, 0])).toBeCloseTo(40, 9);
    expect(sigmaAcross(CHART_UP, COV, [0, 5])).toBeCloseTo(30, 9);
    // Along any direction in space.
    expect(sigmaAlong(COV, [0, 0, 2])).toBeCloseTo(50, 9);
    expect(sigmaAlong(COV, [0, 0, 0])).toBe(0);
  });

  it('gives the one-sigma ellipse in the plane, major axis first', () => {
    const e = sigmaEllipse(CHART_UP, COV);
    expect(e.a).toBeCloseTo(40, 9);
    expect(e.b).toBeCloseTo(30, 9);
    // The major axis lies along y.
    expect(Math.abs(Math.sin(e.angle))).toBeCloseTo(1, 9);
  });

  it('turns samples into a path with its half-width at each one', () => {
    const path = pathOf(CHART_UP, [
      { t: 0, position: [0, 0, 0], cov: COV },
      { t: 10, position: [100, 0, 7], cov: COV, extrapolating: true },
      { t: 20, position: [200, 0, 0], cov: COV, extrapolating: true, validated: true },
    ]);
    expect(path.map((p) => [p.x, p.y])).toEqual([
      [0, 0],
      [100, 0],
      [200, 0],
    ]);
    expect(path.every((p) => Math.abs(p.sigma - 40) < 1e-9)).toBe(true);
    expect(path.map((p) => [p.extrapolating, p.validated])).toEqual([
      [false, false],
      [true, false],
      [true, true],
    ]);
  });

  it('finds where a timed path is, between samples and clamped at its ends', () => {
    const path = [
      { t: 0, x: 0, y: 0 },
      { t: 10, x: 100, y: 50 },
      { t: 20, x: 200, y: 50 },
    ];
    expect(at(path, 5)).toMatchObject({ x: 50, y: 25 });
    expect(at(path, 15)).toMatchObject({ x: 150, y: 50 });
    expect(at(path, -3)).toMatchObject({ x: 0, y: 0, index: 0 });
    expect(at(path, 99)).toMatchObject({ x: 200, y: 50, index: 2 });
    expect(at([], 1)).toBeUndefined();
  });

  it('outlines the envelope in runs that meet, by what the model stands on', () => {
    const point = (t: number, extrapolating: boolean, validated = false): PathPoint => ({
      t,
      x: t,
      y: 0,
      sigma: 10,
      extrapolating,
      validated,
    });
    const samples = [
      point(0, false),
      point(1, false),
      point(2, true),
      point(3, true),
      point(4, true, true),
      point(5, true, true),
    ];
    const runs = envelopeRuns(samples, 2);
    expect(runs.map((r) => r.kind)).toEqual(['supported', 'extrapolating', 'validated']);
    // A lone last sample of another kind has no area of its own: it ends the run before it.
    expect(envelopeRuns(samples.slice(0, 5), 2).map((r) => r.kind)).toEqual([
      'supported',
      'extrapolating',
    ]);
    // Two sigmas either side of a path along x.
    expect(runs[0]!.outline[0]).toEqual([0, 20]);
    expect(runs[0]!.outline.at(-1)).toEqual([0, -20]);
    // Each run ends on the sample the next begins with: no gap between them.
    const lastOfFirst = Math.max(...runs[0]!.outline.map(([x]) => x));
    const firstOfSecond = Math.min(...runs[1]!.outline.map(([x]) => x));
    expect(lastOfFirst).toBe(firstOfSecond);
  });

  it('frames points with a margin, or a box about the ship', () => {
    const b = boundsOf(
      [
        [0, 0],
        [100, 50],
      ],
      0.1,
    );
    expect(b).toEqual({ x0: -10, y0: -10, x1: 110, y1: 60 });
    expect(boundsAbout(5, 5, 20)).toEqual({ x0: -15, y0: -15, x1: 25, y1: 25 });
    // Nothing to frame is still a box.
    expect(boundsOf([])).toEqual({ x0: -1, y0: -1, x1: 1, y1: 1 });
  });

  it('picks a round scale bar', () => {
    expect(scaleLength(5_000_000)).toBe(1_000_000);
    expect(scaleLength(1_300_000)).toBe(200_000);
    expect(scaleLength(30_000)).toBe(5000);
  });
});

describe('steps of a forecast', () => {
  const steps = stepsOf({
    issuedAt: 100,
    endsAt: 5000,
    endsEarly: true,
    beyondAt: 3000,
    burns: [{ t: 700, duration: 20, label: 'retrograde · 20 s' }],
    pointings: [{ t: 400, label: 'camera at alpha' }],
    closest: [
      { id: 'beta', name: 'Beta', t: 4000, text: '3,411 km ±32 km' },
      { id: 'alpha', name: 'Alpha', t: 9000, text: 'after the forecast ends' },
    ],
  });

  it('are in time order, from now to where the forecast ends', () => {
    expect(steps.map((s) => s.label)).toEqual([
      'NOW',
      'POINT',
      'BURN 1',
      'COAST 1',
      'BEYOND THE DATA',
      'BETA CLOSEST',
      'FORECAST ENDS',
    ]);
    expect(steps.map((s) => s.t)).toEqual([100, 400, 700, 720, 3000, 4000, 5000]);
  });

  it('say nothing past the end of the forecast', () => {
    expect(steps.some((s) => s.object === 'alpha')).toBe(false);
    expect(steps.at(-1)).toMatchObject({ kind: 'ends', t: 5000 });
    expect(steps.at(-1)!.detail).toContain('beyond the data');
  });

  it('leave out "beyond the data" when the model is beyond it from the start', () => {
    const all = stepsOf({ issuedAt: 0, endsAt: 10, beyondAt: 0, burns: [], closest: [] });
    expect(all.map((s) => s.kind)).toEqual(['now', 'ends']);
  });

  it('find the step in force at a time', () => {
    expect(stepAt(steps, 100)).toBe(0);
    expect(stepAt(steps, 710)).toBe(2);
    expect(stepAt(steps, 4999)).toBe(5);
    expect(stepAt(steps, 5000)).toBe(6);
  });
});

describe('what the uncertainty is made of', () => {
  const sample: SigmaBySource = {
    t: 0,
    state: 30,
    profile: 0,
    hedge: 40,
    engine: 0,
    mass: 0,
    bodies: 0,
    total: 50,
  };

  it('splits by share of variance, which sums to one', () => {
    const parts = shares(sample);
    expect(parts.reduce((n, p) => n + p.share, 0)).toBeCloseTo(1, 12);
    expect(parts.find((p) => p.id === 'tracking')!.share).toBeCloseTo(0.36, 12);
    expect(parts.find((p) => p.id === 'beyond')!.share).toBeCloseTo(0.64, 12);
  });

  it('names what limits the forecast', () => {
    expect(limiting(sample)).toBe('beyond');
    expect(limiting({ ...sample, state: 90 })).toBe('tracking');
    // Engine and mass count together as the ship.
    expect(limiting({ ...sample, engine: 60, mass: 60 })).toBe('ship');
  });

  it('draws nothing as certain when there is no forecast', () => {
    const html = renderToStaticMarkup(<UncertaintyPanel series={[]} t={0} format={String} />);
    expect(html).toContain('no forecast');
  });

  it('names the limiting source and what would shrink it', () => {
    const html = renderToStaticMarkup(
      <UncertaintyPanel series={[sample, { ...sample, t: 10 }]} t={5} format={(m) => `${m} m`} />,
    );
    expect(html).toContain('±50 m');
    expect(html).toContain('limited by beyond the data');
    expect(html).toContain('adopt a rule that passes its test');
  });
});

describe('DragBar', () => {
  it('steps by the keyboard and stops at its limits', () => {
    expect(dragKey('ArrowRight', 100, 0, 200, 10)).toBe(110);
    expect(dragKey('ArrowUp', 100, 0, 200, 10)).toBe(110);
    expect(dragKey('ArrowLeft', 100, 0, 200, 10)).toBe(90);
    expect(dragKey('PageUp', 100, 0, 200, 10)).toBe(200);
    expect(dragKey('PageDown', 30, 0, 200, 10)).toBe(0);
    expect(dragKey('Home', 100, 0, 200, 10)).toBe(0);
    expect(dragKey('End', 100, 0, 200, 10)).toBe(200);
    expect(dragKey('ArrowRight', 200, 0, 200, 10)).toBe(200);
    // Any other key is left for the rest of the console (the flight keys among them).
    expect(dragKey('w', 100, 0, 200, 10)).toBeUndefined();
    expect(dragSnap(104, 0, 200, 10)).toBe(100);
    expect(dragSnap(-5, 0, 200, 10)).toBe(0);
  });

  it('is a slider the keyboard can reach, with its value in words', () => {
    const html = renderToStaticMarkup(
      <DragBar
        label="Camera"
        value={120}
        min={0}
        max={200}
        step={10}
        text="120 W"
        onChange={() => {}}
        effect="0.05 fixes a second"
      />,
    );
    expect(html).toContain('role="slider"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-valuenow="120"');
    expect(html).toContain('aria-valuetext="120 W"');
    expect(html).toContain('aria-orientation="horizontal"');
    expect(html).toContain('0.05 fixes a second');
  });

  it('only shows a level when it cannot be set', () => {
    const html = renderToStaticMarkup(
      <DragBar label="Hydrogen" value={4} min={0} max={6} step={1} text="4 kg" />,
    );
    expect(html).not.toContain('role="slider"');
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Hydrogen: 4 kg"');
  });

  it('stands up as a fader, with its named settings lit where it sits', () => {
    const html = renderToStaticMarkup(
      <DragBar
        label="Camera"
        value={120}
        min={0}
        max={200}
        step={10}
        text="120 W"
        vertical
        onChange={() => {}}
        stops={[
          { at: 0, label: 'off' },
          { at: 60, label: 'survey' },
          { at: 120, label: 'track' },
          { at: 200, label: 'detail' },
        ]}
      />,
    );
    expect(html).toContain('aria-orientation="vertical"');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-pressed="true"[^>]*>track</);
    // Highest setting at the top of the fader.
    expect(html.indexOf('>detail<')).toBeLessThan(html.indexOf('>off<'));
  });
});

describe('BudgetBoard', () => {
  const loads = [
    { id: 'life', label: 'life support', value: 1800 },
    {
      id: 'camera',
      label: 'camera',
      value: 120,
      control: { min: 0, max: 200, step: 10, onChange: () => {} },
    },
  ];

  it('states what is asked, what is available and the headroom', () => {
    const html = renderToStaticMarkup(
      <BudgetBoard
        label="Electrical power"
        unit="W"
        sources={[{ id: 'cell', label: 'fuel cell', value: 1920, capacity: 3000 }]}
        loads={loads}
      />,
    );
    expect(html).toContain('1,920 <small>W asked</small>');
    expect(html).toContain('3,000 <small>W available</small>');
    expect(html).toContain('1,080 <small>W headroom</small>');
    expect(html).not.toContain('ci-budget__over');
    // Only the load the player can set gets a handle.
    expect(html.match(/role="slider"/g)).toHaveLength(1);
  });

  it('marks a shortfall as a warning, never as headroom', () => {
    const html = renderToStaticMarkup(
      <BudgetBoard
        label="Electrical power"
        unit="W"
        sources={[{ id: 'cell', label: 'fuel cell', value: 1500 }]}
        loads={loads}
        shortfall="short: batteries bridge it"
      />,
    );
    expect(html).toContain('data-status="warning"');
    expect(html).toContain('▲ 420');
    expect(html).toContain('short: batteries bridge it');
    expect(html).toContain('ci-budget__over');
  });

  it('keeps the loads readable when supply far exceeds them, and says how much more there is', () => {
    const html = renderToStaticMarkup(
      <BudgetBoard
        label="Electrical power"
        unit="W"
        sources={[
          { id: 'a', label: 'fuel cell A', value: 1800, capacity: 6000 },
          { id: 'b', label: 'fuel cell B', value: 120, capacity: 6000 },
        ]}
        loads={loads}
      />,
    );
    expect(html).toContain('▸ 12,000');
    // The second source lies wholly beyond the scale's edge: it is not drawn as a sliver.
    expect(html).not.toContain('fuel cell B ·');
  });
});

describe('StepBar and LoopRail', () => {
  const steps = stepsOf({
    issuedAt: 0,
    endsAt: 100,
    burns: [{ t: 10, duration: 5, label: 'prograde' }],
    closest: [],
  });

  it('marks the step in force and offers the next', () => {
    const html = renderToStaticMarkup(
      <StepBar steps={steps} t={10} onTime={() => {}} format={(t) => `T+${t}`} />,
    );
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="step"[^>]*>.*?BURN 1/);
    expect(html).toContain('aria-label="Forecast time"');
    expect(html).toContain('aria-valuetext="T+10"');
  });

  it('has nowhere to step back to at the start, or on to at the end', () => {
    const start = renderToStaticMarkup(
      <StepBar steps={steps} t={0} onTime={() => {}} format={String} />,
    );
    expect(start).toMatch(/disabled=""[^>]*>◂ STEP/);
    const end = renderToStaticMarkup(
      <StepBar steps={steps} t={100} onTime={() => {}} format={String} />,
    );
    expect(end).toMatch(/disabled=""[^>]*>STEP ▸/);
  });

  it('shows the loop in order with the stage in hand marked', () => {
    const html = renderToStaticMarkup(
      <LoopRail
        stages={[
          { id: 'explore', label: 'Explore', status: 'Twin Deeps', state: 'done' },
          { id: 'predict', label: 'Predict', status: 'ends early', state: 'attention' },
        ]}
        current="predict"
        onGo={() => {}}
      />,
    );
    expect(html.indexOf('Explore')).toBeLessThan(html.indexOf('Predict'));
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).toMatch(/data-state="attention"[^>]*aria-current="step"/);
  });
});

describe('TrajectoryChart', () => {
  const forecast: PathPoint[] = [0, 1, 2, 3].map((i) => ({
    t: i * 10,
    x: i * 1000,
    y: 0,
    sigma: 50,
    extrapolating: i >= 2,
    validated: false,
  }));

  it('draws the forecast dotted with its envelope, hatched where the model has no data', () => {
    const html = renderToStaticMarkup(
      <TrajectoryChart
        label="Test region"
        bodies={[{ id: 'alpha', name: 'Alpha', x: 1500, y: 800, radius: 200 }]}
        forecast={forecast}
        trail={[
          [0, 0],
          [900, 30],
        ]}
      />,
    );
    expect(html).toContain('aria-label="Test region"');
    expect(html).toContain('ci-chart__forecast');
    expect(html).toContain('ci-chart__trail');
    expect(html).toContain('data-kind="supported"');
    expect(html).toContain('data-kind="extrapolating"');
    expect(html.match(/ci-chart__envelope-hatch/g)).toHaveLength(1);
    expect(html).toContain('>Alpha<');
  });

  it('draws no forecast, envelope or trail it was not given', () => {
    const html = renderToStaticMarkup(
      <TrajectoryChart
        label="Empty region"
        bodies={[{ id: 'alpha', name: 'Alpha', x: 0, y: 0, radius: 200 }]}
      />,
    );
    expect(html).not.toContain('ci-chart__forecast');
    expect(html).not.toContain('ci-chart__envelope');
    expect(html).not.toContain('ci-chart__trail');
  });
});
