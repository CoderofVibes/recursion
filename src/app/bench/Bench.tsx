import { useCallback, useEffect, useRef, useState } from 'react';
import type { AttitudeTarget, ForecastDraft, ShipEvent } from '../../contracts/index.ts';
import type { GameControls, PlanDraft } from '../../game/belief/controls.ts';
import { burnDuration, burnSteps } from '../../game/belief/maneuver.ts';
import { Plot } from './Plot.tsx';

/**
 * Integration bench (2F): a bare instrument page that drives the game loop through
 * `GameControls` until the console (2D) and 3D view (2E) merge. Everything shown is belief:
 * the view snapshot, the model state and Black Box records. Not a design; styling is a
 * placeholder and does not use src/theme.
 */

const DIRECTIONS: Readonly<Record<string, AttitudeTarget>> = {
  Retrograde: { reference: 'retrograde' },
  Prograde: { reference: 'prograde' },
  'Toward Alpha': { reference: 'toward', target: 'alpha' },
  'Away from Alpha': { reference: 'away', target: 'alpha' },
};
const SPANS = [600e3, 1.3e6, 2.6e6, 6e6];

const clock = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const describe = (event: ShipEvent): string => {
  switch (event.kind) {
    case 'objective':
      return `${event.objective} ${event.status}`;
    case 'ship-lost':
      return `ship lost · ${event.cause}`;
    case 'contact':
      return `contact${event.with ? ` · ${event.with}` : ''}`;
    case 'command-rejected':
      return `rejected · ${event.command.kind}`;
    default:
      return event.kind;
  }
};

export function Bench({ game }: { readonly game: GameControls }) {
  const [, refresh] = useState(0);
  const [direction, setDirection] = useState('Retrograde');
  const [deltaV, setDeltaV] = useState(9.85);
  const [delay, setDelay] = useState(400);
  const [span, setSpan] = useState(SPANS[1]!);
  const [follow, setFollow] = useState(false);
  const [compare, setCompare] = useState(false);
  const preview = useRef<ForecastDraft | undefined>(undefined);

  // The loop: advance the game every animation frame; refresh the readouts five times a second.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const frame = (now: number): void => {
      game.advance(Math.min(0.1, (now - last) / 1000));
      last = now;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const readouts = setInterval(() => refresh((n) => n + 1), 200);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(readouts);
    };
  }, [game]);

  const frame = useCallback(() => ({ view: game.snapshot(), preview: preview.current }), [game]);

  const status = game.status();
  const view = game.snapshot();
  const ship = view.world.ship;
  const alpha = view.world.bodies[0];
  const range = alpha
    ? Math.hypot(ship.position.x - alpha.position.x, ship.position.y - alpha.position.y)
    : 0;
  const speed = alpha
    ? Math.hypot(ship.velocity.x - alpha.velocity.x, ship.velocity.y - alpha.velocity.y)
    : 0;
  const rcs = (ship.propellant['rcs-left']?.mean ?? 0) + (ship.propellant['rcs-right']?.mean ?? 0);
  const model = game.model.state();
  const archive = game.blackBox.archive();
  const record = game.blackBox.attempt(status.attemptId);
  const events = record ? record.events.slice(-6).reverse() : [];
  const forecast = view.forecasts.at(-1);
  const ended = status.phase === 'ended';

  const plan = (): PlanDraft => ({
    name: `${direction} ${deltaV} m/s`,
    items: burnSteps({
      at: Math.max(0, delay),
      duration: burnDuration(game.ship, ship.massProperties.mass, deltaV),
      attitude: DIRECTIONS[direction] ?? { reference: 'retrograde' },
    }),
  });
  const onPreview = (): void => {
    void game.preview(plan()).then((draft) => {
      preview.current = draft;
    });
  };
  const onCommit = (): void => {
    preview.current = undefined;
    void game.commit(plan());
  };
  const onCompare = (): void => {
    const next = !compare;
    const done = archive.attempts.filter((a) => a.outcome.kind !== 'in-progress');
    setCompare(next && done.length >= 2);
    game.setCompare(next && done.length >= 2 ? [done.at(-2)!.id, done.at(-1)!.id] : undefined);
  };
  const again = (): void => {
    preview.current = undefined;
    setCompare(false);
    game.setCompare();
    if (ended) game.restart();
    else game.recall();
  };

  const rows: [string, string][] = [
    [
      'Attempt',
      `${status.attemptIndex} · ${status.phase}${ended ? ` · ${status.outcome.kind}` : ''}`,
    ],
    ['Time', `T+ ${clock(status.t)}`],
    [
      'Warp',
      `${status.paused ? 'hold' : `${status.warp}×`}${status.saturated ? ' (limited)' : ''}`,
    ],
    ['Alpha range', `${(range / 1000).toFixed(1)} km`],
    ['Speed', `${speed.toFixed(2)} m/s`],
    ['Main prop', `${(ship.propellant['main-propellant']?.mean ?? 0).toFixed(0)} kg`],
    ['RCS prop', `${rcs.toFixed(1)} kg`],
    ['Hydrogen', `${(ship.propellant['fuel-cell-hydrogen']?.mean ?? 0).toFixed(2)} kg`],
    [
      'Model',
      `v${model.version} · ${model.extensions.filter((e) => e.status === 'adopted').length} rules`,
    ],
    ['Forecast', forecast ? `${forecast.id} · ends +${clock(forecast.horizon)}` : 'none issued'],
    ['Plan', status.planId ? `${status.planId} · ${status.pending} pending` : 'none'],
    [
      'Black Box',
      `${archive.attempts.length} attempts · ${record?.measurements.length ?? 0} records`,
    ],
  ];

  return (
    <main className="bench">
      <section className="bench-view">
        <Plot frame={frame} span={span} follow={follow} />
        <div className="bench-legend">
          {view.objectives.map((o) => (
            <span key={o.id}>{o.label}</span>
          ))}
        </div>
      </section>

      <aside className="bench-side">
        <h1>RECURSION · GRAVITY RANGE</h1>
        <dl>
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        <fieldset>
          <legend>Time</legend>
          <button onClick={() => game.setPaused(!status.paused)} disabled={ended}>
            {status.paused ? 'Run' : 'Hold'}
          </button>
          {status.warpSteps.map((step) => (
            <button
              key={step}
              className={step === status.warp ? 'on' : ''}
              onClick={() => game.setWarp(step)}
            >
              {step}×
            </button>
          ))}
        </fieldset>

        <fieldset disabled={ended}>
          <legend>Plan</legend>
          <select value={direction} onChange={(e) => setDirection(e.target.value)}>
            {Object.keys(DIRECTIONS).map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
          <label>
            Δv m/s
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={deltaV}
              onChange={(e) => setDeltaV(Number(e.target.value))}
            />
          </label>
          <label>
            In s
            <input
              type="number"
              min={0}
              step={10}
              value={delay}
              onChange={(e) => setDelay(Number(e.target.value))}
            />
          </label>
          <button onClick={onPreview}>Preview</button>
          <button onClick={onCommit} disabled={status.committing}>
            Commit
          </button>
        </fieldset>

        <fieldset disabled={ended}>
          <legend>Ship</legend>
          <button onClick={() => game.command({ kind: 'cutoff', thruster: 'all' })}>Cutoff</button>
          <button
            onClick={() => game.command({ kind: 'point', sensor: 'camera', target: 'alpha' })}
          >
            Cam Alpha
          </button>
          <button onClick={() => game.command({ kind: 'point', sensor: 'camera', target: 'beta' })}>
            Cam Beta
          </button>
          <button onClick={() => game.command({ kind: 'recorder', sampleRate: 1 })}>
            Rec 1 Hz
          </button>
          <button onClick={() => game.command({ kind: 'recorder', sampleRate: 0.05 })}>
            Rec 0.05 Hz
          </button>
        </fieldset>

        <fieldset>
          <legend>View</legend>
          {SPANS.map((value) => (
            <button
              key={value}
              className={value === span ? 'on' : ''}
              onClick={() => setSpan(value)}
            >
              {value / 1e6} Mm
            </button>
          ))}
          <button className={follow ? 'on' : ''} onClick={() => setFollow(!follow)}>
            Follow
          </button>
          <button className={compare ? 'on' : ''} onClick={onCompare}>
            Compare
          </button>
        </fieldset>

        <fieldset>
          <legend>Recurrence</legend>
          <button onClick={again}>{ended ? 'Begin again' : 'Recall'}</button>
        </fieldset>

        <ul className="bench-events">
          {events.map((event, i) => (
            <li key={`${event.t}-${event.kind}-${i}`}>
              <span>{clock(event.t)}</span> {describe(event)}
            </li>
          ))}
        </ul>
      </aside>
    </main>
  );
}
