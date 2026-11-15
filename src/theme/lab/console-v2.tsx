/**
 * Console v2 layouts (dev only, 3F): three ways to arrange the console so a judge can see where
 * the engineering is done, for the owner to choose between (phase-3-extras.md § 3F, item 1).
 * Every number and path is real: recorded from the dev build playing Twin Deeps on the real
 * ship, model and Black Box (`prototypes/console-v2/flight.json`; its `note` says how, and the
 * scripts that recorded it are beside it). The only things that
 * are mocked are the two moments to look at (before anything is learned, and after the law is
 * adopted) and the power arithmetic behind the handles, which uses the ship's own ratings.
 *
 * Run `npm run dev` and open /src/theme/lab/console-v2.html. The address's hash picks the view:
 * #a/predict/after, #b/after, #c/after (and `step=3`, `follow`).
 */
import { StrictMode, useEffect, useMemo, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { LevelBar, Panel, Readout, ReadoutGrid, Trend } from '../components/index.ts';
import { applyTheme } from '../index.ts';
import { clock, dist, duration, fixed, whole } from '../../console/format.ts';
import { BudgetBoard } from '../../console/instruments/BudgetBoard.tsx';
import type { BudgetLoad } from '../../console/instruments/BudgetBoard.tsx';
import {
  CHART_UP,
  at,
  onPlane,
  pathOf,
  sigmaAlong,
  sigmaEllipse,
  stepsOf,
} from '../../console/instruments/chartMath.ts';
import type {
  P2,
  P3,
  PathPoint,
  SigmaBySource,
  Step,
  Sym3,
} from '../../console/instruments/chartMath.ts';
import { DragBar } from '../../console/instruments/DragBar.tsx';
import { LoopRail } from '../../console/instruments/LoopRail.tsx';
import type { Stage } from '../../console/instruments/LoopRail.tsx';
import { StepBar } from '../../console/instruments/StepBar.tsx';
import type { TimeSpan } from '../../console/instruments/StepBar.tsx';
import { TrajectoryChart } from '../../console/instruments/TrajectoryChart.tsx';
import type {
  ChartBand,
  ChartBody,
  ChartMark,
} from '../../console/instruments/TrajectoryChart.tsx';
import { UncertaintyPanel } from '../../console/instruments/UncertaintyPanel.tsx';
import { StrengthPlot } from '../../console/StrengthPlot.tsx';
import '../../console/console.css';
import '../../console/instruments/instruments.css';
import './console-v2.css';

applyTheme(document.documentElement);

// ---- The recorded data -------------------------------------------------------------------------

interface FSample {
  t: number;
  p: number[];
  v: number[];
  cov: number[];
  x: number;
  val: number;
}
interface FData {
  issuedAt: number;
  modelVersion: number;
  name?: string;
  burns: { t: number; duration: number; throttle: number; reference: string }[];
  samples: FSample[];
  tracks: { id: string; samples: { t: number; p: number[] }[] }[];
  closest: { id: string; t: number; distance: number; sigma: number }[];
  sigma: SigmaBySource[];
}
interface StrengthPoint {
  attempt: number;
  distance: number;
  rMin: number;
  rMax: number;
  scale: number;
  sigma: number;
  converged: boolean;
  probe: string | null;
}
interface Strength {
  body: string;
  slope: number | null;
  points: StrengthPoint[];
}
interface Flight {
  index: number;
  endedAt: number;
  trail: { t: number; p: number[] }[];
  forecast: FData;
  divergence: {
    firstBeyond3Sigma: number | null;
    maxSigmas: number;
    points: { t: number; deviation: number; sigmas: number }[];
  };
  debrief: {
    constraints: { label: string; planned: string; measured: string; met: boolean | null }[];
    cost: { label: string; value: string }[];
    changed: string[];
    limiting: { label: string; detail: string } | null;
  };
}
interface Equipment {
  id: string;
  name: string;
  kind: string;
  ratedPower: number;
  bus?: string;
  modes: string[];
  power: Record<string, number>;
}
interface Data {
  note: string;
  briefing: { id: string; name: string };
  bodies: { id: string; name: string; radius: number; p: number[] }[];
  asteroids: { id: string; p: number[]; radius: number }[];
  arrival: {
    ship: { p: number[] };
    departure: {
      speed: number;
      minSpeed: number;
      distance: number;
      beyond: number;
      gaugedDeltaV: number;
      maxDeltaV: number;
      outward: number;
    };
    design: { reserve: number; clearance: number };
  };
  ship: {
    equipment: Equipment[];
    thermalNodes: { id: string; name: string; max: number }[];
    tanks: { id: string; name: string; capacity: number }[];
    configurations: { id: string; name: string }[];
    recorder: { capacity: number; bytesPerSample: number };
    mass: number;
  };
  live: {
    configuration: string;
    equipment: Record<string, { mode: string; draw: number; readings: Record<string, number> }>;
    telemetry: Record<string, number>;
    series: Record<string, number[]>;
  };
  forecasts: { before: FData; after: FData };
  flights: Flight[];
  model: {
    version: number;
    residuals: { coast: { rms: number; n: number } };
    parameters: {
      id: string;
      label: string;
      value: number;
      sigma: number;
      unit?: string;
      support: number;
    }[];
    strength: Strength[];
    before: {
      version: number;
      residuals: { coast: { rms: number; n: number } };
      strength: Strength[];
    };
    test: {
      training: number[];
      heldOut: number;
      TperNu: number;
      threshold: number;
      pass: boolean;
      rmsBefore: number;
      rmsAfter: number;
      fitted: Record<string, { value: number; sigma: number }>;
    };
  };
}

type Moment = 'before' | 'after';
/** What the chart holds in view: the plan's path, the whole region, or the ship as it goes. */
type Framing = 'plan' | 'region' | 'follow';
const P = (p: readonly number[]): P3 => [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0];
const T = (t: number): string => `T+${clock(t)}`;

// ---- A forecast as the instruments read it -------------------------------------------------------

interface ForecastView {
  readonly data: FData;
  readonly path: PathPoint[];
  readonly steps: Step[];
  readonly spans: TimeSpan[];
  readonly endsAt: number;
  bodiesAt(t: number): ChartBody[];
  /** The ship at `t`: where, heading, its ellipse, and how far it is from each body. */
  shipAt(t: number): {
    x: number;
    y: number;
    heading: number;
    ellipse: { a: number; b: number; angle: number };
    speed: number;
    ranges: { id: string; name: string; clearance: number; sigma: number | null }[];
    sigma: SigmaBySource;
    extrapolating: boolean;
  };
}

function forecastView(data: Data, f: FData): ForecastView {
  const path = pathOf(
    CHART_UP,
    f.samples.map((s) => ({
      t: s.t,
      position: P(s.p),
      cov: s.cov as unknown as Sym3,
      extrapolating: s.x === 1,
      validated: s.val === 1,
    })),
  );
  const endsAt = f.samples.at(-1)?.t ?? f.issuedAt;
  const tracks = new Map(
    f.tracks.map((tr) => [
      tr.id,
      tr.samples.map((s) => {
        const [x, y] = onPlane(CHART_UP, P(s.p));
        return { t: s.t, x, y, p: P(s.p) };
      }),
    ]),
  );
  const bodyAt = (id: string, t: number): { x: number; y: number; p: P3 } => {
    const track = tracks.get(id);
    const found = track ? at(track, t) : undefined;
    const fallback = data.bodies.find((b) => b.id === id);
    if (!track || !found) {
      const p = P(fallback?.p ?? [0, 0, 0]);
      const [x, y] = onPlane(CHART_UP, p);
      return { x, y, p };
    }
    return { x: found.x, y: found.y, p: track[found.index]!.p };
  };
  const name = (id: string): string => data.bodies.find((b) => b.id === id)?.name ?? id;
  const beyond = f.samples.find((s) => s.x === 1)?.t;
  const steps = stepsOf({
    issuedAt: f.issuedAt,
    endsAt,
    endsEarly: true,
    ...(beyond !== undefined ? { beyondAt: beyond } : {}),
    burns: f.burns.map((b) => ({
      t: b.t,
      duration: b.duration,
      label: `${b.reference} · ${fixed(b.duration, 1)} s at ${Math.round(b.throttle * 100)}%`,
    })),
    // A "closest approach" at the forecast's last sample is only where it stops, not a pass.
    closest: f.closest
      .filter((c) => c.t < endsAt - 1)
      .map((c) => ({
        id: c.id,
        name: name(c.id),
        t: c.t,
        text: `${dist(c.distance)} ±${dist(c.sigma)} from the surface`,
      })),
  });
  // Runs of samples the model stands behind, and runs where it is beyond its data.
  const spans: TimeSpan[] = [];
  let start = 0;
  for (let i = 1; i <= f.samples.length; i++) {
    const a = f.samples[start]!;
    const b = f.samples[i];
    if (b && b.x === a.x && b.val === a.val) continue;
    const last = f.samples[Math.min(i, f.samples.length - 1)]!;
    spans.push({
      from: a.t,
      to: last.t,
      kind: a.x ? (a.val ? 'validated' : 'extrapolating') : 'supported',
    });
    start = i;
  }
  return {
    data: f,
    path,
    steps,
    spans,
    endsAt,
    bodiesAt: (t) =>
      data.bodies.map((b) => {
        const here = bodyAt(b.id, t);
        const track = tracks.get(b.id);
        return {
          id: b.id,
          name: b.name,
          x: here.x,
          y: here.y,
          radius: b.radius,
          ...(track ? { track: track.map((s): P2 => [s.x, s.y]) } : {}),
        };
      }),
    shipAt: (t) => {
      const found = at(path, t)!;
      const s = f.samples[found.index]!;
      const [vx, vy] = onPlane(CHART_UP, P(s.v));
      const cov = s.cov as unknown as Sym3;
      return {
        x: found.x,
        y: found.y,
        heading: Math.atan2(vy, vx),
        ellipse: sigmaEllipse(CHART_UP, cov),
        speed: Math.hypot(s.v[0] ?? 0, s.v[1] ?? 0, s.v[2] ?? 0),
        ranges: data.bodies.map((b) => {
          const body = bodyAt(b.id, t);
          const d: P3 = [body.p[0] - s.p[0]!, body.p[1] - s.p[1]!, body.p[2] - s.p[2]!];
          const pass = f.closest.find((c) => c.id === b.id && Math.abs(c.t - t) < 90);
          return {
            id: b.id,
            name: b.name,
            clearance: Math.hypot(d[0], d[1], d[2]) - b.radius,
            sigma: b.id === data.bodies[0]!.id ? sigmaAlong(cov, d) : (pass?.sigma ?? null),
          };
        }),
        sigma: f.sigma[found.index] ?? f.sigma.at(-1)!,
        extrapolating: s.x === 1,
      };
    },
  };
}

/** Distances from a body where the model has measured its pull: one band over its fits. */
function measuredBands(strength: readonly Strength[]): ChartBand[] {
  return strength.flatMap((s) => {
    const good = s.points.filter((p) => p.converged);
    if (good.length === 0) return [];
    return [
      {
        body: s.body,
        rMin: Math.min(...good.map((p) => p.rMin)),
        rMax: Math.max(...good.map((p) => p.rMax)),
        kind: 'measured' as const,
      },
    ];
  });
}

// ---- The mock's state: which moment, which step, what the ship is set to --------------------------

interface Settings {
  camera: number;
  recorder: number;
  processor: number;
  comms: number;
  spareAir: number;
  reserve: number;
}

interface Mock {
  readonly data: Data;
  readonly moment: Moment;
  readonly view: ForecastView;
  readonly bands: ChartBand[];
  readonly t: number;
  readonly setT: (t: number) => void;
  readonly framing: Framing;
  readonly setFraming: (framing: Framing) => void;
  readonly settings: Settings;
  readonly set: (patch: Partial<Settings>) => void;
}

/** Electrical loads as the board groups them, from the ship's ratings and the mock's settings. */
function powerOf(mock: Mock): {
  loads: BudgetLoad[];
  total: number;
  fixes: number;
  fixLimit: string;
  enduranceHours: number;
} {
  const { data, settings, set } = mock;
  const draw = (id: string): number => data.live.equipment[id]?.draw ?? 0;
  const sum = (ids: readonly string[]): number => ids.reduce((n, id) => n + draw(id), 0);
  const stops = (id: string): { at: number; label: string }[] => {
    const e = data.ship.equipment.find((q) => q.id === id);
    return (e?.modes ?? [])
      .filter((m) => e!.power[m] !== undefined && m !== 'heater')
      .map((m) => ({ at: e!.power[m]!, label: m }));
  };
  const fixes =
    settings.camera <= 0 ? 0 : Math.min(recorderRate(settings.recorder), settings.camera / 120);
  const fixLimit =
    settings.camera <= 0
      ? 'the camera is off'
      : recorderRate(settings.recorder) <= settings.camera / 120
        ? 'limited by the recorder’s rate'
        : 'limited by the camera’s power';
  const loads: BudgetLoad[] = [
    {
      id: 'life',
      label: 'life support',
      value: draw('eclss-a') + draw('crew'),
    },
    {
      id: 'spare-air',
      label: 'spare air train',
      value: settings.spareAir,
      control: {
        min: 0,
        max: 1800,
        step: 20,
        onChange: (v) => set({ spareAir: v }),
        stops: [
          { at: 80, label: 'standby' },
          { at: 1800, label: 'active' },
        ],
        effect:
          settings.spareAir > 100
            ? 'both air trains running: no single point of failure'
            : 'one train running, the spare on standby',
      },
    },
    {
      id: 'thermal',
      label: 'cooling loops',
      value: sum([
        'internal-pump-a',
        'internal-pump-b',
        'external-pump-a',
        'external-pump-b',
        'interface-hx',
      ]),
    },
    {
      id: 'avionics',
      label: 'flight computers',
      value: sum([
        'flight-cpu-a',
        'flight-cpu-b',
        'imu-a',
        'imu-b',
        'star-tracker-a',
        'star-tracker-b',
        'console',
        'pdu-a',
        'pdu-b',
      ]),
    },
    {
      id: 'propulsion',
      label: 'engines ready',
      value: sum([
        'main-engine',
        'rcs-forward-left',
        'rcs-forward-right',
        'rcs-aft-left',
        'rcs-aft-right',
      ]),
      tone: 'thrust',
    },
    {
      id: 'camera',
      label: 'camera',
      value: settings.camera,
      control: {
        min: 0,
        max: 200,
        step: 10,
        onChange: (v) => set({ camera: v }),
        stops: stops('camera'),
        effect: `${fixed(fixes, 2)} fixes a second · ${fixLimit}`,
      },
    },
    {
      id: 'recorder',
      label: 'black box',
      value: settings.recorder,
      tone: 'blackbox',
      control: {
        min: 0,
        max: 100,
        step: 5,
        onChange: (v) => set({ recorder: v }),
        stops: stops('black-box'),
        effect: `${fixed(recorderRate(settings.recorder), 2)} samples a second · store full in ${duration(
          data.ship.recorder.capacity /
            Math.max(1e-9, recorderRate(settings.recorder) * data.ship.recorder.bytesPerSample),
        )}`,
      },
    },
    {
      id: 'processor',
      label: 'science processor',
      value: settings.processor,
      control: {
        min: 0,
        max: 1000,
        step: 10,
        onChange: (v) => set({ processor: v }),
        stops: stops('science-processor'),
        effect:
          settings.processor >= 1000
            ? 'Black Box channel 03 at full power'
            : settings.processor >= 350
              ? 'science processing on'
              : 'idle',
      },
    },
    {
      id: 'comms',
      label: 'comms',
      value: settings.comms,
      control: {
        min: 0,
        max: 250,
        step: 10,
        onChange: (v) => set({ comms: v }),
        stops: stops('comms'),
        effect: settings.comms > 100 ? 'transmitting' : 'listening',
      },
    },
  ];
  const total = loads.reduce((n, l) => n + l.value, 0);
  // Hydrogen burned per joule, measured over the recorded flight (fuel cells following the load).
  const hydrogen = data.live.series['tank:fuel-cell-hydrogen'] ?? [];
  const burned = (hydrogen[0] ?? 6) - (data.live.telemetry['fuel-cell-hydrogen.propellant'] ?? 6);
  const recordedLoad =
    (data.live.telemetry['main-a.load'] ?? 0) + (data.live.telemetry['main-b.load'] ?? 0);
  const kgPerJoule = burned / Math.max(1, recordedLoad * 31907);
  const tank = data.ship.tanks.find((t) => t.id === 'fuel-cell-hydrogen')?.capacity ?? 6;
  return {
    loads,
    total,
    fixes,
    fixLimit,
    enduranceHours: tank / Math.max(1e-12, kgPerJoule * total) / 3600,
  };
}

/** The recorder's sample rate at a power setting (its three operating points; at most 1 a second kept). */
function recorderRate(watts: number): number {
  if (watts <= 0) return 0;
  if (watts <= 15) return 0.05;
  if (watts <= 35) return 0.05 + ((watts - 15) / 20) * 0.95;
  return 1;
}

// ---- Blocks the layouts share ---------------------------------------------------------------------

function Chart({
  mock,
  height = 400,
}: {
  readonly mock: Mock;
  readonly height?: number;
}): ReactElement {
  const { view, t, framing, bands } = mock;
  const ship = view.shipAt(t);
  // The plan's framing: its path, and the body it passes (with room for its measured band).
  const near = view
    .bodiesAt(t)
    .reduce((a, b) =>
      Math.hypot(b.x - ship.x, b.y - ship.y) < Math.hypot(a.x - ship.x, a.y - ship.y) ? b : a,
    );
  const fit: P2[] = [
    ...view.path.map((p): P2 => [p.x, p.y]),
    [near.x - near.radius * 1.4, near.y - near.radius * 1.4],
    [near.x + near.radius * 1.4, near.y + near.radius * 1.4],
  ];
  const nearest = Math.min(...ship.ranges.map((r) => r.clearance));
  const marks: ChartMark[] = view.steps
    .filter(
      (s) => s.kind === 'burn' || s.kind === 'closest' || s.kind === 'ends' || s.kind === 'beyond',
    )
    .map((s) => {
      const here = at(view.path, s.t)!;
      return {
        x: here.x,
        y: here.y,
        kind:
          s.kind === 'burn'
            ? 'burn'
            : s.kind === 'closest'
              ? 'closest'
              : s.kind === 'ends'
                ? 'ends'
                : 'left',
        label:
          s.kind === 'burn'
            ? s.label
            : s.kind === 'ends'
              ? 'forecast ends'
              : s.kind === 'beyond'
                ? 'beyond the data'
                : s.label,
      } satisfies ChartMark;
    });
  return (
    <TrajectoryChart
      label={`${mock.data.briefing.name}: the forecast of the plan, chart up`}
      bodies={view.bodiesAt(t)}
      bands={bands}
      forecast={view.path}
      marks={marks}
      cursor={{ x: ship.x, y: ship.y, heading: ship.heading, ellipse: ship.ellipse }}
      {...(framing === 'follow'
        ? { follow: Math.min(2_600_000, Math.max(220_000, nearest * 1.1 + 120_000)) }
        : framing === 'plan'
          ? { fit }
          : {})}
      onPick={mock.setT}
      width={640}
      height={height}
    />
  );
}

function ChartTools({ mock }: { readonly mock: Mock }): ReactElement {
  return (
    <div className="v2-tools">
      <div className="v2-seg" role="group" aria-label="Chart framing">
        {(
          [
            ['plan', 'The plan'],
            ['follow', 'Follow the ship'],
            ['region', 'Whole region'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className="rx-chip"
            data-on={mock.framing === id ? '' : undefined}
            aria-pressed={mock.framing === id}
            onClick={() => mock.setFraming(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="cs-legend v2-legend">
        <span data-key="forecast">forecast</span>
        <span data-key="envelope">2σ envelope</span>
        <span data-key="beyond">beyond the data</span>
        <span data-key="measured">pull measured here</span>
      </p>
    </div>
  );
}

function AtThisStep({ mock }: { readonly mock: Mock }): ReactElement {
  const { view, t, data } = mock;
  const ship = view.shipAt(t);
  const step = view.steps.filter((s) => s.t <= t + 1e-6).at(-1);
  return (
    <Panel
      title="At this step"
      tone="forecast"
      aside={T(t)}
      {...(step ? { statusLine: step.label.toLowerCase() } : {})}
    >
      {ship.ranges.map((r) => (
        <LevelBar
          key={r.id}
          label={`${r.name} clearance`}
          value={r.clearance}
          max={r.id === 'alpha' ? 1_000_000 : 5_000_000}
          text={r.sigma === null ? dist(r.clearance) : `${dist(r.clearance)} ±${dist(r.sigma)}`}
          tone="forecast"
          status={
            r.clearance - 2 * (r.sigma ?? 0) < data.arrival.design.clearance ? 'caution' : 'nominal'
          }
          {...(r.id === 'alpha'
            ? {
                marks: [
                  {
                    at: data.arrival.design.clearance,
                    kind: 'warning' as const,
                    label: 'planned clearance',
                  },
                ],
              }
            : {})}
        />
      ))}
      <ReadoutGrid columns={2}>
        <Readout label="Speed" value={fixed(ship.speed, 1)} unit="m/s" tone="forecast" />
        <Readout
          label="Model"
          value={ship.extrapolating ? 'beyond its data' : 'on its data'}
          size="body"
          tone="forecast"
          status={ship.extrapolating ? 'caution' : 'nominal'}
        />
      </ReadoutGrid>
      <UncertaintyPanel series={view.data.sigma} t={t} format={dist} />
    </Panel>
  );
}

function PlanCard({ mock }: { readonly mock: Mock }): ReactElement {
  const burn = mock.view.data.burns[0];
  return (
    <Panel
      title="Plan"
      aside={`${mock.view.data.burns.length} burn`}
      statusLine="draft · previewed as shown · not scheduled"
    >
      {burn ? (
        <div className="cs-item">
          <div className="cs-item__head">
            <span>BURN 1</span>
            <span className="cs-item__value">{fixed(burn.duration, 1)} s · main engine</span>
          </div>
          <DragBar
            label="At"
            value={burn.t}
            min={0}
            max={3600}
            step={60}
            text={T(burn.t)}
            tone="thrust"
            stacked
            onChange={() => undefined}
          />
          <div className="v2-seg" role="group" aria-label="Direction">
            {['prograde', 'retrograde', 'toward', 'away', 'axis'].map((d) => (
              <span key={d} className="rx-chip" data-on={d === burn.reference ? '' : undefined}>
                {d}
              </span>
            ))}
          </div>
          <DragBar
            label="Speed change"
            value={16}
            min={0}
            max={60}
            step={0.5}
            text="16.0 m/s"
            tone="thrust"
            stacked
            onChange={() => undefined}
            effect="92 kg of 600 kg to spend"
          />
          <DragBar
            label="Throttle"
            value={100}
            min={5}
            max={100}
            step={5}
            text="100%"
            tone="thrust"
            stacked
            onChange={() => undefined}
          />
          <p className="cs-note">180° turn needs 7.0 min: ready by the burn</p>
        </div>
      ) : null}
      <div className="cs-actions">
        <button type="button" className="cs-button">
          + BURN
        </button>
        <button type="button" className="cs-button">
          + POINTING
        </button>
      </div>
      <div className="cs-actions">
        <button type="button" className="cs-button" data-tone="forecast">
          PREVIEW
        </button>
        <button type="button" className="cs-button" data-tone="forecast" data-primary="">
          COMMIT
        </button>
        <button type="button" className="cs-button" data-status="caution">
          CUTOFF
        </button>
      </div>
    </Panel>
  );
}

function Verdict({ mock }: { readonly mock: Mock }): ReactElement {
  const { view, data } = mock;
  const end = view.shipAt(view.endsAt);
  const alpha = end.ranges[0]!;
  const reaches = mock.moment === 'after';
  return (
    <Panel
      title="What the forecast says"
      tone="forecast"
      aside={`model v${view.data.modelVersion}`}
      status={reaches ? 'nominal' : 'caution'}
      statusLine={reaches ? 'the forecast reaches the pass' : '▲ the forecast ends before the pass'}
    >
      <LevelBar
        label="Looks ahead"
        value={view.endsAt}
        max={6 * 3600}
        text={duration(view.endsAt)}
        tone="forecast"
      />
      <LevelBar
        label={`${alpha.name} at its end`}
        value={alpha.clearance}
        max={800_000}
        text={`${dist(alpha.clearance)} ±${dist(alpha.sigma ?? 0)}`}
        tone="forecast"
        marks={[{ at: data.arrival.design.clearance, kind: 'warning', label: 'planned clearance' }]}
      />
      <p className="cs-note">
        {reaches
          ? 'the law has been tested at these distances, so the envelope stays narrow down to the pass'
          : 'nothing has been measured this close: past here the model cannot say where the ship goes'}
      </p>
    </Panel>
  );
}

function PowerBoard({
  mock,
  compact = false,
  faders = false,
}: {
  readonly mock: Mock;
  readonly compact?: boolean;
  readonly faders?: boolean;
}): ReactElement {
  const power = powerOf(mock);
  const [selected, setSelected] = useState('camera');
  const cells = Math.min(power.total, 12_000);
  return (
    <BudgetBoard
      label="Electrical power"
      unit="W"
      sources={[
        { id: 'fuel-cell-a', label: 'fuel cell A', value: cells * 0.93, capacity: 6000 },
        { id: 'fuel-cell-b', label: 'fuel cell B', value: cells * 0.07, capacity: 6000 },
      ]}
      loads={
        compact
          ? power.loads.map((l) =>
              ['camera', 'recorder'].includes(l.id)
                ? l
                : { id: l.id, label: l.label, value: l.value, ...(l.tone ? { tone: l.tone } : {}) },
            )
          : power.loads
      }
      selected={selected}
      onSelect={setSelected}
      shortfall="short: batteries bridge it"
      faders={faders}
    />
  );
}

function MissionEffect({ mock }: { readonly mock: Mock }): ReactElement {
  const { data, settings, set, view } = mock;
  const power = powerOf(mock);
  const spendable = Math.max(0, 6000 - settings.reserve);
  const deltaV = 320 * 9.80665 * Math.log(data.ship.mass / (data.ship.mass - spendable));
  const planned = 16;
  const flightHours = view.endsAt / 3600;
  return (
    <Panel title="What it buys the mission" tone="forecast" aside="this plan">
      <LevelBar
        label="Endurance"
        value={power.enduranceHours}
        max={60}
        text={`${fixed(power.enduranceHours, 1)} h of hydrogen`}
        tone="forecast"
        status={power.enduranceHours < flightHours * 2 ? 'caution' : 'nominal'}
        marks={[{ at: flightHours, kind: 'target', label: 'the plan’s length' }]}
      />
      <LevelBar
        label="Fixes"
        value={power.fixes}
        max={1}
        text={`${fixed(power.fixes, 2)} per s`}
        tone="forecast"
        status={power.fixes < 0.1 ? 'caution' : 'nominal'}
      />
      <p className="cs-note">{power.fixLimit}: more fixes narrow “tracking now” in the forecast</p>
      <DragBar
        label="Reserve"
        value={settings.reserve}
        min={0}
        max={6000}
        step={50}
        text={`${whole(settings.reserve)} kg`}
        tone="measured"
        onChange={(v) => set({ reserve: v })}
        effect={`${whole(spendable)} kg to spend buys ${fixed(deltaV, 1)} m/s · the plan asks ${planned} m/s`}
        marks={[{ at: 6000 - 92, kind: 'target', label: 'after the planned burn' }]}
      />
      {data.ship.thermalNodes.map((n) => {
        const temp = data.live.telemetry[`${n.id}.temperature`] ?? 0;
        // Each watt drawn ends as heat: the margin follows the load (the ship's own nodes, as recorded).
        const rise = ((power.total - 3003) / 3003) * 6;
        return (
          <LevelBar
            key={n.id}
            label={`heat · ${n.name}`}
            value={temp + rise - 250}
            max={n.max - 250 + 10}
            text={`${fixed(n.max - temp - rise, 0)} K to limit`}
            status={n.max - temp - rise < 15 ? 'caution' : 'nominal'}
            marks={[{ at: n.max - 250, kind: 'warning' }]}
          />
        );
      })}
    </Panel>
  );
}

function ComparePanel({
  mock,
  flight,
}: {
  readonly mock: Mock;
  readonly flight: Flight;
}): ReactElement {
  const left = flight.divergence.firstBeyond3Sigma;
  const sigmas = flight.divergence.points.map((p) => p.sigmas);
  const worst = flight.divergence.points.reduce((a, b) => (b.sigmas > a.sigmas ? b : a));
  void mock;
  return (
    <>
      <Panel
        title="Predicted against flown"
        tone="blackbox"
        aside={`attempt ${flight.index}`}
        status={left !== null ? 'caution' : 'nominal'}
        statusLine={
          left !== null ? `▲ left the forecast at ${T(left)}` : 'within the forecast throughout'
        }
      >
        <div className="v2-verdict" data-status={left !== null ? 'caution' : 'nominal'}>
          <span className="v2-verdict__big">{fixed(worst.sigmas, 1)}σ</span>
          <span className="v2-verdict__small">
            off by {dist(worst.deviation)} at {T(worst.t)} · forecast from model v
            {flight.forecast.modelVersion}
          </span>
        </div>
        <Trend
          title="Off the forecast"
          unit="σ"
          value={fixed(sigmas.at(-1) ?? 0, 1)}
          data={sigmas}
          tone="blackbox"
          min={0}
          limits={[{ at: 3, kind: 'caution' }]}
        />
        <p className="cs-note">
          a miss that grows as the ship gets closer points at the law, not the engine
        </p>
      </Panel>
      <Panel title="Planned against measured" aside="judged from the record">
        {flight.debrief.constraints.map((c) => (
          <div
            className="v2-check"
            key={c.label}
            data-met={c.met === null ? 'unknown' : String(c.met)}
          >
            <span className="v2-check__pip" />
            <span className="v2-check__label">{c.label}</span>
            <span className="v2-check__planned">{c.planned}</span>
            <span className="v2-check__measured">{c.measured}</span>
          </div>
        ))}
        <ReadoutGrid columns={3}>
          {flight.debrief.cost.slice(0, 3).map((c) => (
            <Readout key={c.label} label={c.label} value={c.value} size="body" />
          ))}
        </ReadoutGrid>
      </Panel>
    </>
  );
}

function CompareChart({
  mock,
  flight,
}: {
  readonly mock: Mock;
  readonly flight: Flight;
}): ReactElement {
  const view = useMemo(() => forecastView(mock.data, flight.forecast), [mock.data, flight]);
  const trail = flight.trail.map((p): P2 => onPlane(CHART_UP, P(p.p)));
  const left = flight.divergence.firstBeyond3Sigma;
  const timed = flight.trail.map((p) => {
    const [x, y] = onPlane(CHART_UP, P(p.p));
    return { t: p.t, x, y };
  });
  const leftAt = left !== null ? at(timed, left) : undefined;
  const end = at(view.path, view.endsAt)!;
  return (
    <TrajectoryChart
      label={`Attempt ${flight.index}: the measured trail against the issued forecast`}
      bodies={view.bodiesAt(left ?? flight.endedAt)}
      bands={mock.moment === 'after' ? mock.bands : []}
      forecast={view.path}
      trail={trail}
      marks={
        leftAt
          ? [
              {
                x: leftAt.x,
                y: leftAt.y,
                kind: 'left' as const,
                label: `left the forecast ${T(left!)}`,
              },
            ]
          : [{ x: end.x, y: end.y, kind: 'ends' as const, label: 'forecast ends' }]
      }
      fit={[...trail, ...view.path.map((p): P2 => [p.x, p.y])]}
      width={640}
      height={430}
    />
  );
}

function StrengthPanel({
  strength,
  rms,
  title,
  after,
}: {
  readonly strength: Strength;
  readonly rms: number;
  readonly title: string;
  readonly after: boolean;
}): ReactElement {
  return (
    <Panel
      title={title}
      aside="alpha · measured ÷ the law"
      tone={after ? 'forecast' : 'measured'}
      status={after ? 'nominal' : 'caution'}
      statusLine={
        after
          ? 'flat at ×1: the law explains every distance flown'
          : `▲ slope ${fixed(strength.slope ?? 0, 2)}: the pull grows faster than the law as the ship gets closer`
      }
    >
      <div className="v2-plot">
        <StrengthPlot
          label={`Alpha: measured strength against distance, ${title}`}
          points={strength.points
            .filter((p) => p.converged)
            .map((p) => ({
              distance: p.distance,
              scale: p.scale,
              sigma: p.sigma,
              probe: p.probe !== null,
              current: p.attempt === 1,
            }))}
        />
      </div>
      <ReadoutGrid columns={2}>
        <Readout label="Fits" value={`${strength.points.length} over 2 dives`} size="body" />
        <Readout
          label="Miss while coasting"
          value={dist(rms)}
          status={rms > 1000 ? 'caution' : 'nominal'}
          {...(after ? { tone: 'forecast' as const } : {})}
        />
      </ReadoutGrid>
    </Panel>
  );
}

function RulePanel({ mock }: { readonly mock: Mock }): ReactElement {
  const { data, moment } = mock;
  const test = data.model.test;
  const exponent = Object.values(test.fitted)[0]!;
  const tested = moment === 'after';
  return (
    <Panel
      title="Rule · distance law"
      tone="forecast"
      aside={tested ? 'adopted' : 'not tested'}
      {...(tested ? { status: 'nominal' as const } : {})}
      statusLine={
        tested
          ? `in force: forecasts use model v${data.model.version}`
          : 'a test needs two finished attempts: one to fit the rule, one held out to check it'
      }
    >
      <ol className="v2-test">
        <li data-done={tested ? '' : undefined}>
          <span className="v2-test__n">1</span>
          <span className="v2-test__what">fit the rule</span>
          <span className="v2-test__on">
            {tested ? `attempts ${test.training.join(', ')}` : 'no attempt yet'}
          </span>
        </li>
        <li data-done={tested ? '' : undefined}>
          <span className="v2-test__n">2</span>
          <span className="v2-test__what">hold one out</span>
          <span className="v2-test__on">
            {tested ? `attempt ${test.heldOut}` : 'no attempt yet'}
          </span>
        </li>
        <li data-done={tested ? '' : undefined} data-pass={tested ? '' : undefined}>
          <span className="v2-test__n">3</span>
          <span className="v2-test__what">{tested ? 'passes' : 'test'}</span>
          <span className="v2-test__on">
            {tested ? `${fixed(test.TperNu, 2)} against ${fixed(test.threshold, 2)}` : 'not run'}
          </span>
        </li>
      </ol>
      {tested ? (
        <div className="v2-rule">
          <div>
            <LevelBar
              label="Miss before"
              value={test.rmsBefore}
              max={test.rmsBefore}
              text={dist(test.rmsBefore)}
              status="caution"
            />
            <LevelBar
              label="With the rule"
              value={test.rmsAfter}
              max={test.rmsBefore}
              text={dist(test.rmsAfter)}
              tone="forecast"
            />
          </div>
          <ReadoutGrid columns={2}>
            <Readout
              label="Exponent"
              value={fixed(exponent.value, 4)}
              sigma={`±${exponent.sigma.toExponential(1)}`}
              tone="forecast"
              size="readout"
            />
            <Readout label="The old law" value="2.0000" size="readout" />
          </ReadoutGrid>
        </div>
      ) : (
        <p className="cs-note">
          the pull falls with distance by a fitted power: fit it on one dive, check it on the other
        </p>
      )}
      <div className="cs-actions">
        <button type="button" className="cs-button" data-tone="forecast" disabled={!tested}>
          TEST
        </button>
        <button
          type="button"
          className="cs-button"
          data-tone="forecast"
          data-primary=""
          disabled={!tested}
        >
          {tested ? 'REVOKE' : 'ADOPT'}
        </button>
        <button type="button" className="cs-button" data-tone="forecast">
          PARAMETERS ▸
        </button>
      </div>
    </Panel>
  );
}

function LearnPanels({ mock }: { readonly mock: Mock }): ReactElement {
  const { data, moment } = mock;
  if (moment === 'before')
    return (
      <>
        <Panel
          title="The pull, as measured"
          aside="alpha · measured ÷ the law"
          statusLine="nothing measured yet"
        >
          <div className="v2-empty">
            <p>No coasting fixes yet: nothing measured, nothing drawn.</p>
            <p className="cs-note">
              fly a dive: each stretch of coasting gives one point here, at the distance it was
              measured
            </p>
          </div>
        </Panel>
        <RulePanel mock={mock} />
      </>
    );
  return (
    <>
      <StrengthPanel
        strength={data.model.before.strength[0]!}
        rms={data.model.before.residuals.coast.rms}
        title="As measured · the old law"
        after={false}
      />
      <StrengthPanel
        strength={data.model.strength[0]!}
        rms={data.model.residuals.coast.rms}
        title="With the distance law"
        after
      />
      <RulePanel mock={mock} />
    </>
  );
}

function ObjectivePanel({ mock }: { readonly mock: Mock }): ReactElement {
  const d = mock.data.arrival.departure;
  return (
    <Panel
      title="Objective"
      aside="depart 50 m/s"
      statusLine="leave Twin Deeps by a slingshot past Beta"
    >
      <LevelBar
        label="Speed"
        value={d.speed}
        max={160}
        text={`${fixed(d.speed, 0)} m/s · moving inward`}
        status="caution"
        marks={[{ at: d.minSpeed, kind: 'target', label: 'needs 50 m/s outward' }]}
      />
      <LevelBar
        label="Distance out"
        value={d.distance}
        max={d.beyond * 1.1}
        text={`${dist(d.distance)} of ${dist(d.beyond)}`}
        marks={[{ at: d.beyond, kind: 'target', label: 'the gate' }]}
      />
      <LevelBar
        label="Spent on leaving"
        value={d.gaugedDeltaV}
        max={d.maxDeltaV * 1.25}
        text={`${fixed(d.gaugedDeltaV, 1)} of ${fixed(d.maxDeltaV, 0)} m/s`}
        marks={[{ at: d.maxDeltaV, kind: 'warning', label: 'the cap' }]}
      />
      <p className="cs-note">
        burns spent learning are free; only the leaving burn counts against the cap
      </p>
    </Panel>
  );
}

function RegionChart({
  mock,
  height = 430,
}: {
  readonly mock: Mock;
  readonly height?: number;
}): ReactElement {
  const { data, view } = mock;
  const [x, y] = onPlane(CHART_UP, P(data.arrival.ship.p));
  return (
    <TrajectoryChart
      label={`${data.briefing.name}: what the ship has charted`}
      bodies={view.bodiesAt(0)}
      bands={mock.bands}
      rocks={data.asteroids.map((a): P2 => onPlane(CHART_UP, P(a.p)))}
      {...(mock.moment === 'after'
        ? { previousTrail: data.flights[0]!.trail.map((p): P2 => onPlane(CHART_UP, P(p.p))) }
        : {})}
      marks={[{ x, y, kind: 'now', label: 'ship · arrival' }]}
      width={640}
      height={height}
    />
  );
}

// ---- Layout A: the loop -----------------------------------------------------------------------------

type StageId = 'explore' | 'design' | 'predict' | 'fly' | 'compare' | 'learn';

function stagesOf(mock: Mock): Stage[] {
  const power = powerOf(mock);
  const end = mock.view.shipAt(mock.view.endsAt).ranges[0]!;
  const after = mock.moment === 'after';
  return [
    { id: 'explore', label: 'Explore', status: 'Twin Deeps · depart 50 m/s', state: 'done' },
    {
      id: 'design',
      label: 'Design',
      status: `${whole(power.total)} W · ${fixed(power.enduranceHours, 0)} h endurance`,
      state: 'done',
    },
    {
      id: 'predict',
      label: 'Predict',
      status: after
        ? `Alpha ${dist(end.clearance)} ±${dist(end.sigma ?? 0)}`
        : `ends ${T(mock.view.endsAt)} · beyond the data`,
      state: after ? 'done' : 'attention',
      tone: 'forecast',
    },
    {
      id: 'fly',
      label: 'Fly',
      status: after ? 'attempt 4 · at arrival' : 'attempt 1 · at arrival',
      state: 'todo',
    },
    {
      id: 'compare',
      label: 'Compare',
      status: after ? 'attempt 1 · off by 3.2σ' : 'nothing flown yet',
      state: after ? 'attention' : 'todo',
      tone: 'blackbox',
    },
    {
      id: 'learn',
      label: 'Learn',
      status: after ? 'law adopted · model v6' : 'nothing measured yet',
      state: after ? 'done' : 'todo',
    },
  ];
}

function LayoutA({
  mock,
  stage,
  setStage,
}: {
  readonly mock: Mock;
  readonly stage: StageId;
  readonly setStage: (s: StageId) => void;
}): ReactElement {
  const flight = mock.data.flights[0]!;
  return (
    <Frame
      mock={mock}
      head={
        <LoopRail stages={stagesOf(mock)} current={stage} onGo={(id) => setStage(id as StageId)} />
      }
    >
      {stage === 'explore' ? (
        <div className="v2-grid" data-cols="chart-side">
          <div className="v2-hero">
            <RegionChart mock={mock} />
          </div>
          <div className="v2-side">
            <ObjectivePanel mock={mock} />
            <Panel title="Regions" aside="preview">
              <div className="v2-seg">
                <span className="rx-chip" data-on="">
                  Twin Deeps
                </span>
                <span className="rx-chip">Well Garden ▸</span>
                <span className="rx-chip">Unseen Cathedral ▸</span>
              </div>
              <p className="cs-note">
                the route between them isn’t built yet; each starts with a fresh ship
              </p>
            </Panel>
            <Panel
              title="What Black Box holds"
              tone="blackbox"
              aside={mock.moment === 'after' ? '3 attempts' : 'nothing yet'}
            >
              <ReadoutGrid columns={3}>
                <Readout label="Attempts" value={mock.moment === 'after' ? 3 : 0} tone="blackbox" />
                <Readout label="Rules" value={mock.moment === 'after' ? 1 : 0} tone="forecast" />
                <Readout
                  label="Pull measured"
                  value={mock.moment === 'after' ? '507–1,002 km' : 'nowhere'}
                  size="body"
                />
              </ReadoutGrid>
            </Panel>
          </div>
        </div>
      ) : null}
      {stage === 'design' ? (
        <div className="v2-grid" data-cols="wide-side">
          <Panel
            title="Power"
            aside="supply against demand"
            statusLine="pull a handle: every watt asked for burns hydrogen and ends as heat"
          >
            <PowerBoard mock={mock} faders />
          </Panel>
          <div className="v2-side">
            <MissionEffect mock={mock} />
            <Panel title="Configuration" aside={mock.data.live.configuration}>
              <div className="v2-seg">
                {mock.data.ship.configurations.map((c) => (
                  <span
                    key={c.id}
                    className="rx-chip"
                    data-on={c.id === mock.data.live.configuration ? '' : undefined}
                  >
                    {c.name.replace(/([a-z])([A-Z])/g, '$1 $2')}
                  </span>
                ))}
              </div>
              <div className="cs-actions">
                <button type="button" className="cs-button" data-tone="blackbox" data-primary="">
                  RECORD DESIGN AND SET UP
                </button>
              </div>
            </Panel>
          </div>
        </div>
      ) : null}
      {stage === 'predict' ? (
        <div className="v2-grid" data-cols="side-chart-side">
          <div className="v2-side">
            <PlanCard mock={mock} />
            <Verdict mock={mock} />
          </div>
          <div className="v2-hero">
            <ChartTools mock={mock} />
            <Chart mock={mock} height={372} />
            <StepBar
              steps={mock.view.steps}
              t={mock.t}
              onTime={mock.setT}
              spans={mock.view.spans}
              format={T}
            />
          </div>
          <div className="v2-side">
            <AtThisStep mock={mock} />
          </div>
        </div>
      ) : null}
      {stage === 'fly' ? (
        <div className="v2-grid" data-cols="chart-side">
          <div className="v2-hero v2-fly">
            <p>FLIGHT is the hologram above the console.</p>
            <p className="cs-note">
              this stage opens it (key 4): the forecast drawn dotted ahead of the ship, the trail
              solid behind it
            </p>
            <div className="cs-actions">
              <button type="button" className="cs-button" data-primary="">
                ENTER {mock.data.briefing.name}
              </button>
              <button type="button" className="cs-button">
                OPEN FLIGHT ▸
              </button>
            </div>
          </div>
          <div className="v2-side">
            <Verdict mock={mock} />
          </div>
        </div>
      ) : null}
      {stage === 'compare' && mock.moment === 'before' ? (
        <div className="v2-empty v2-fly">
          <p>Nothing flown yet.</p>
          <p className="cs-note">
            after a flight, its measured trail is drawn here against the forecast issued for it
          </p>
        </div>
      ) : null}
      {stage === 'compare' && mock.moment === 'after' ? (
        <div className="v2-grid" data-cols="chart-side">
          <div className="v2-hero">
            <div className="v2-tools">
              <div className="v2-seg">
                <span className="rx-chip" data-on="">
                  Attempt 1
                </span>
                <span className="rx-chip">Attempt 3</span>
                <span className="rx-chip">1 against 3</span>
              </div>
              <p className="cs-legend v2-legend">
                <span data-key="trail">flown</span>
                <span data-key="forecast">forecast as issued</span>
                <span data-key="envelope">2σ envelope</span>
              </p>
            </div>
            <CompareChart mock={mock} flight={flight} />
          </div>
          <div className="v2-side">
            <ComparePanel mock={mock} flight={flight} />
          </div>
        </div>
      ) : null}
      {stage === 'learn' ? (
        <div className="v2-grid" data-cols={mock.moment === 'after' ? 'learn' : 'half'}>
          <LearnPanels mock={mock} />
        </div>
      ) : null}
    </Frame>
  );
}

// ---- Layout B: one chart, everything else in drawers ------------------------------------------------

function LayoutB({ mock }: { readonly mock: Mock }): ReactElement {
  const [open, setOpen] = useState<'plan' | 'ship' | 'model' | 'records'>('plan');
  const flight = mock.data.flights[0]!;
  const drawer = (
    id: typeof open,
    title: string,
    summary: string,
    body: ReactNode,
  ): ReactElement => (
    <section className="v2-drawer" data-open={open === id ? '' : undefined}>
      <button
        type="button"
        className="v2-drawer__head"
        aria-expanded={open === id}
        onClick={() => setOpen(id)}
      >
        <span>{title}</span>
        <span className="v2-drawer__sum">{summary}</span>
      </button>
      {open === id ? <div className="v2-drawer__body">{body}</div> : null}
    </section>
  );
  const power = powerOf(mock);
  return (
    <Frame
      mock={mock}
      head={<div className="v2-title">CHART TABLE · everything is read against one picture</div>}
    >
      <div className="v2-grid" data-cols="chart-rail">
        <div className="v2-hero">
          <ChartTools mock={mock} />
          <TrajectoryChart
            label="The region: forecast, envelope and the last flight"
            bodies={mock.view.bodiesAt(mock.t)}
            bands={mock.bands}
            forecast={mock.view.path}
            {...(mock.moment === 'after'
              ? { previousTrail: flight.trail.map((p): P2 => onPlane(CHART_UP, P(p.p))) }
              : {})}
            cursor={(() => {
              const s = mock.view.shipAt(mock.t);
              return { x: s.x, y: s.y, heading: s.heading, ellipse: s.ellipse, label: T(mock.t) };
            })()}
            {...(mock.framing === 'follow' ? { follow: 700_000 } : {})}
            onPick={mock.setT}
            width={640}
            height={380}
          />
          <StepBar
            steps={mock.view.steps}
            t={mock.t}
            onTime={mock.setT}
            spans={mock.view.spans}
            format={T}
          />
        </div>
        <div className="v2-rail">
          {drawer(
            'plan',
            'Plan',
            `1 burn · 16 m/s · ${T(mock.view.endsAt)}`,
            <>
              <PlanCard mock={mock} />
              <AtThisStep mock={mock} />
            </>,
          )}
          {drawer(
            'ship',
            'Ship',
            `${whole(power.total)} W · ${fixed(power.enduranceHours, 0)} h`,
            <>
              <PowerBoard mock={mock} compact />
              <MissionEffect mock={mock} />
            </>,
          )}
          {drawer(
            'model',
            'Model',
            mock.moment === 'after' ? 'law adopted · v6' : 'v0 · nothing measured',
            <LearnPanels mock={mock} />,
          )}
          {drawer(
            'records',
            'Records',
            mock.moment === 'after' ? 'attempt 1 · 3.2σ off' : 'none',
            <ComparePanel mock={mock} flight={flight} />,
          )}
        </div>
      </div>
    </Frame>
  );
}

// ---- Layout C: the ship is the console ----------------------------------------------------------------

function LayoutC({ mock }: { readonly mock: Mock }): ReactElement {
  const power = powerOf(mock);
  const [system, setSystem] = useState('camera');
  const chosen = power.loads.find((l) => l.id === system) ?? power.loads[0]!;
  const series = mock.data.live.series;
  return (
    <Frame
      mock={mock}
      head={
        <div className="v2-title">
          SHIP DESK · the spacecraft in the middle, the mission read as consequences
        </div>
      }
    >
      <div className="v2-grid" data-cols="ship">
        <div className="v2-side">
          <Panel title="Power" aside="supply against demand">
            <BudgetBoard
              label="Electrical power"
              unit="W"
              sources={[
                {
                  id: 'fuel-cell-a',
                  label: 'fuel cell A',
                  value: Math.min(power.total, 12000) * 0.93,
                  capacity: 6000,
                },
                {
                  id: 'fuel-cell-b',
                  label: 'fuel cell B',
                  value: Math.min(power.total, 12000) * 0.07,
                  capacity: 6000,
                },
              ]}
              loads={power.loads.map((l) => ({
                id: l.id,
                label: l.label,
                value: l.value,
                ...(l.tone ? { tone: l.tone } : {}),
              }))}
              selected={system}
              onSelect={setSystem}
              shortfall="short: batteries bridge it"
            />
          </Panel>
          <Panel title="Stores and heat">
            <LevelBar
              label="Main propellant"
              value={5907}
              max={6000}
              text="5,907 / 6,000 kg"
              marks={[{ at: mock.settings.reserve, kind: 'target', label: 'reserve' }]}
            />
            <LevelBar label="Hydrogen" value={4.65} max={6} text="4.65 / 6 kg" />
            {mock.data.ship.thermalNodes.slice(0, 3).map((n) => {
              const temp = mock.data.live.telemetry[`${n.id}.temperature`] ?? 0;
              return (
                <LevelBar
                  key={n.id}
                  label={`heat · ${n.name}`}
                  value={temp - 250}
                  max={n.max - 240}
                  text={`${fixed(n.max - temp, 0)} K to limit`}
                  marks={[{ at: n.max - 250, kind: 'warning' }]}
                />
              );
            })}
          </Panel>
        </div>
        <div className="v2-side">
          <Panel
            title={chosen.label}
            aside="selected · takes the zoom"
            tone={chosen.tone === 'blackbox' ? 'blackbox' : 'measured'}
          >
            <ReadoutGrid columns={3}>
              <Readout label="Draw" value={whole(chosen.value)} unit="W" size="readout" />
              <Readout label="Condition" value="100%" size="readout" />
              <Readout
                label="Bus"
                value={
                  system === 'camera' || system === 'processor' || system === 'comms'
                    ? 'payload'
                    : 'essential'
                }
                size="body"
              />
            </ReadoutGrid>
            {chosen.control ? (
              <>
                <DragBar
                  label="Allocate"
                  value={chosen.value}
                  min={chosen.control.min}
                  max={chosen.control.max}
                  step={chosen.control.step}
                  text={`${whole(chosen.value)} W`}
                  onChange={chosen.control.onChange}
                  {...(chosen.control.effect ? { effect: chosen.control.effect } : {})}
                />
                <div className="v2-seg">
                  {(chosen.control.stops ?? []).map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      className="rx-chip"
                      data-on={Math.abs(chosen.value - s.at) < 1e-6 ? '' : undefined}
                      onClick={() => chosen.control!.onChange(s.at)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="cs-note">not adjustable in flight: it draws what it needs</p>
            )}
            <Trend
              title="Payload bus · this attempt"
              unit="W"
              value={whole(series['payload.load']?.at(-1) ?? 0)}
              data={series['payload.load'] ?? []}
            />
            <Trend
              title="Service bay"
              unit="K"
              value={fixed(series['service.temperature']?.at(-1) ?? 0, 1)}
              data={series['service.temperature'] ?? []}
            />
          </Panel>
          <MissionEffect mock={mock} />
        </div>
        <div className="v2-side">
          <Panel
            title="The plan’s forecast"
            tone="forecast"
            aside={`model v${mock.view.data.modelVersion}`}
          >
            <div className="v2-mini">
              <Chart mock={mock} height={300} />
            </div>
            <StepBar
              steps={mock.view.steps}
              t={mock.t}
              onTime={mock.setT}
              spans={mock.view.spans}
              format={T}
            />
          </Panel>
          <Verdict mock={mock} />
        </div>
      </div>
    </Frame>
  );
}

// ---- The console's frame, as in the game ------------------------------------------------------------

function Frame({
  mock,
  head,
  children,
}: {
  readonly mock: Mock;
  readonly head: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className="cs-screen v2-screen" data-on="">
      <div className="cs-frame">
        {head}
        <div className="cs-page v2-page">{children}</div>
        <footer className="cs-foot">
          <span className="v2-clock">T+00:00:00</span>
          <button type="button" className="cs-button" data-primary="">
            ENTER {mock.data.briefing.name}
          </button>
          <span className="v2-attempt">
            ● ATTEMPT {mock.moment === 'after' ? 4 : 1} <i>prepare</i>
          </span>
          <span className="cs-foot__note">
            {mock.moment === 'after'
              ? 'draft forecast: 350 samples'
              : 'draft forecast: 284 samples'}
          </span>
          <span className="cs-foot__back">ESC ▸ STEP BACK</span>
        </footer>
      </div>
    </div>
  );
}

// ---- The page ----------------------------------------------------------------------------------------

type LayoutId = 'a' | 'b' | 'c';

function parseHash(): {
  layout: LayoutId;
  stage: StageId;
  moment: Moment;
  step: number | null;
  framing: Framing;
} {
  const parts = window.location.hash.replace(/^#/, '').split('/');
  const layout = (['a', 'b', 'c'] as const).find((l) => parts.includes(l)) ?? 'a';
  const stage =
    (['explore', 'design', 'predict', 'fly', 'compare', 'learn'] as const).find((s) =>
      parts.includes(s),
    ) ?? 'predict';
  const moment: Moment = parts.includes('before') ? 'before' : 'after';
  const stepPart = parts.find((p) => p.startsWith('step='));
  const framing: Framing = parts.includes('follow')
    ? 'follow'
    : parts.includes('region')
      ? 'region'
      : 'plan';
  return { layout, stage, moment, step: stepPart ? Number(stepPart.slice(5)) : null, framing };
}

function App({ data }: { readonly data: Data }): ReactElement {
  const [initial] = useState(parseHash);
  const [layout, setLayout] = useState<LayoutId>(initial.layout);
  const [stage, setStage] = useState<StageId>(initial.stage);
  const [moment, setMoment] = useState<Moment>(initial.moment);
  const [framing, setFraming] = useState<Framing>(initial.framing);
  const [settings, setSettings] = useState<Settings>({
    camera: 120,
    recorder: 15,
    processor: 40,
    comms: 20,
    spareAir: 80,
    reserve: data.arrival.design.reserve,
  });
  const view = useMemo(() => forecastView(data, data.forecasts[moment]), [data, moment]);
  // Each moment starts at the step the address named, or at its forecast's end, until the
  // player picks a time in it.
  const [picked, setPicked] = useState<{ moment: Moment; t: number } | null>(null);
  const startAt =
    (initial.step !== null ? view.steps[initial.step] : view.steps.at(-1))?.t ?? view.endsAt;
  const t = picked && picked.moment === moment ? picked.t : startAt;
  const setT = (time: number): void => setPicked({ moment, t: time });
  const bands = useMemo(
    () => (moment === 'after' ? measuredBands(data.model.strength) : []),
    [data, moment],
  );
  const mock: Mock = {
    data,
    moment,
    view,
    bands,
    t: Math.min(view.endsAt, Math.max(view.data.issuedAt, t)),
    setT,
    framing,
    setFraming,
    settings,
    set: (patch) => setSettings((s) => ({ ...s, ...patch })),
  };
  const chip = (on: boolean, label: string, go: () => void): ReactElement => (
    <button
      type="button"
      className="rx-chip"
      data-on={on ? '' : undefined}
      aria-pressed={on}
      onClick={go}
    >
      {label}
    </button>
  );
  return (
    <div className="v2-root">
      <header className="v2-bar">
        <strong>CONSOLE V2 · LAYOUTS</strong>
        <div className="v2-seg" role="group" aria-label="Layout">
          {chip(layout === 'a', 'A · the loop', () => setLayout('a'))}
          {chip(layout === 'b', 'B · chart table', () => setLayout('b'))}
          {chip(layout === 'c', 'C · ship desk', () => setLayout('c'))}
        </div>
        <div className="v2-seg" role="group" aria-label="Moment of the game">
          {chip(moment === 'before', 'attempt 1 · nothing measured', () => setMoment('before'))}
          {chip(moment === 'after', 'attempt 4 · law adopted', () => setMoment('after'))}
        </div>
        <span className="v2-bar__note">
          recorded from the real game · Twin Deeps · the bar above is not part of the design
        </span>
      </header>
      <div className="v2-stage">
        {layout === 'a' ? <LayoutA mock={mock} stage={stage} setStage={setStage} /> : null}
        {layout === 'b' ? <LayoutB mock={mock} /> : null}
        {layout === 'c' ? <LayoutC mock={mock} /> : null}
      </div>
    </div>
  );
}

function Loader(): ReactElement {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState('');
  useEffect(() => {
    fetch('/prototypes/console-v2/flight.json')
      .then((r) => r.json() as Promise<Data>)
      .then(setData, (reason: unknown) => setFailed(String(reason)));
  }, []);
  if (failed) return <p className="cs-note">no data: {failed}</p>;
  return data ? <App data={data} /> : <p className="cs-note">loading the recorded flight</p>;
}

// One root, kept across hot reloads of this module (as the UI lab does).
const container = document.getElementById('root');
if (!container) throw new Error('missing #root element');
const host = window as unknown as { rxConsoleV2Root?: Root };
host.rxConsoleV2Root ??= createRoot(container);
host.rxConsoleV2Root.render(
  <StrictMode>
    <Loader />
  </StrictMode>,
);
