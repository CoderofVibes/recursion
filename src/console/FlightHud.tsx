/**
 * The instruments around the FLIGHT hologram: the flight keys, what the ship is doing, the
 * margins that change as it flies (propellant, power, heat, recorder), alerts, time, and the
 * object the player has chosen. Everything here is belief: the navigation estimate, gauged
 * stores, and the forecast as issued.
 */
import { AlertStack, LevelBar, Panel, Readout, ReadoutGrid } from '../theme/components/index.ts';
import { distance, heading, length } from '../view3d/adapter.ts';
import { flightAlerts } from './alerts.ts';
import { Actions, Button, Line, TimeControls } from './controls.tsx';
import { batteries, busLoads, heat, recorder, stores } from './data.ts';
import type { Desk } from './desk.ts';
import { bytes, clock, degrees, dist, fixed, whole } from './format.ts';

export interface FlightKeys {
  /** Keys held down, lower case. */
  readonly held: ReadonlySet<string>;
  /** Which controls the ship answers to today (the rest wait for 2G's hands-on seam). */
  readonly available: { readonly throttle: boolean; readonly yaw: boolean; readonly pitch: boolean; readonly translate: boolean };
}

export interface FlightHudProps {
  readonly desk: Desk;
  /** Which controls the ship answers to today (the rest wait for 2G's hands-on seam). */
  readonly available: FlightKeys['available'];
  readonly headingUp: boolean;
  readonly range: number;
  readonly onHeadingUp: () => void;
}

const CAPS: readonly {
  readonly key: string;
  readonly cap: string;
  readonly label: string;
  readonly control: keyof FlightKeys['available'];
}[] = [
  { key: 'q', cap: 'Q', label: 'YAW ⟲', control: 'yaw' },
  { key: 'w', cap: 'W', label: 'MAIN', control: 'throttle' },
  { key: 'e', cap: 'E', label: 'YAW ⟳', control: 'yaw' },
  { key: 'r', cap: 'R', label: 'UP', control: 'translate' },
  { key: 'arrowup', cap: '↑', label: 'NOSE UP', control: 'pitch' },
  { key: 'a', cap: 'A', label: 'LEFT', control: 'translate' },
  { key: 's', cap: 'S', label: 'RETRO', control: 'translate' },
  { key: 'd', cap: 'D', label: 'RIGHT', control: 'translate' },
  { key: 'f', cap: 'F', label: 'DOWN', control: 'translate' },
  { key: 'arrowdown', cap: '↓', label: 'NOSE DN', control: 'pitch' },
];

export function FlightHud({ desk, available, headingUp, range, onHeadingUp }: FlightHudProps) {
  const { game } = desk;
  const keys: FlightKeys = { held: desk.keys, available };
  const miss = desk.flightMiss;
  const status = game.status();
  const snapshot = game.snapshot();
  const ship = snapshot.world.ship;
  const primary = snapshot.world.bodies[0];
  const speed = primary ? distance(ship.velocity, primary.velocity) : length(ship.velocity);
  const levels = stores(ship, game.ship, desk.design.reserve);
  const main = levels.find((s) => s.id === 'main-propellant');
  const rcs = levels.filter((s) => s.id.startsWith('rcs-'));
  const rcsNow = rcs.reduce((s, x) => s + x.value, 0);
  const rcsMax = rcs.reduce((s, x) => s + x.max, 0);
  const bus = busLoads(ship, game.ship).sort((a, b) => b.value / b.max - a.value / a.max)[0];
  const node = heat(ship, game.ship).sort((a, b) => b.value / b.max - a.value / a.max)[0];
  const battery = batteries(ship, game.ship);
  const rec = recorder(ship, game.ship);
  const forecast = snapshot.forecasts.at(-1);
  const end = forecast?.samples.at(-1);

  const items = flightAlerts(desk);

  const chosen = desk.selected
    ? (snapshot.world.asteroids.find((a) => a.id === desk.selected) ??
      snapshot.world.bodies.find((b) => b.id === desk.selected))
    : undefined;
  const ended = status.phase === 'ended';

  return (
    <>
      <div className="fh-top">
        <TimeControls game={game} compact />
      </div>

      <div className="fh-alerts">
        <AlertStack alerts={items} max={4} label="Flight alerts" />
      </div>

      <div className="fh-keys" aria-label="Flight controls">
        {CAPS.map((c) => (
          <i
            key={c.key}
            data-on={keys.held.has(c.key) && keys.available[c.control] ? '' : undefined}
            data-off={keys.available[c.control] ? undefined : ''}
          >
            {c.cap}
            <b>{c.label}</b>
          </i>
        ))}
      </div>

      <div className="fh-forecast" data-tone="forecast">
        {status.phase === 'prepare' ? (
          <>AT ARRIVAL · THE CLOCK STARTS WHEN YOU ENTER</>
        ) : forecast && end ? (
          <>
            FORECAST v{forecast.modelVersion} · ISSUED T+{clock(forecast.issuedAt)} · ENDS T+
            {clock(end.t)}
            {miss ? ` · NOW Δ ${dist(miss.metres)} ${fixed(miss.sigmas, 1)}σ` : ''}
          </>
        ) : (
          'NO FORECAST ISSUED'
        )}
      </div>

      <aside className="fh-side">
        <Panel title="Flight" aside={headingUp ? 'heading up' : 'chart up'}>
          <ReadoutGrid columns={2}>
            <Readout label="Speed" value={fixed(speed, 2)} unit="m/s" size="readout" />
            <Readout label="Heading" value={String(Math.round(degrees(heading(ship.attitude)))).padStart(3, '0')} unit="°" size="readout" />
            {snapshot.world.bodies.map((b) => (
              <Readout
                key={b.id}
                label={b.name}
                value={dist(distance(ship.position, b.position) - b.radius)}
                status={b.tracked ? 'nominal' : 'stale'}
              />
            ))}
          </ReadoutGrid>
          <Actions>
            <Button onClick={onHeadingUp}>{headingUp ? 'CHART UP' : 'HEADING UP'}</Button>
            <span className="cs-note">range {dist(range)} · wheel</span>
          </Actions>
        </Panel>

        <Panel title="Margins">
          {main ? (
            <LevelBar
              label="Main propellant"
              value={main.value}
              max={main.max}
              text={`${whole(main.value)} kg`}
              status={main.status}
              marks={[{ at: desk.design.reserve, kind: 'target', label: 'reserve' }]}
            />
          ) : null}
          <LevelBar
            label="RCS"
            value={rcsNow}
            max={rcsMax}
            text={`${fixed(rcsNow, 1)} kg`}
            status={rcsNow < rcsMax * 0.2 ? 'caution' : 'nominal'}
          />
          {bus ? (
            <LevelBar label={`Power · ${bus.label}`} value={bus.value} max={bus.max} text={`${whole(bus.value)} W`} status={bus.status} marks={[{ at: bus.mark ?? bus.max, kind: 'caution' }]} />
          ) : null}
          {battery ? (
            <LevelBar label="Batteries" value={battery.value} max={battery.max} text={battery.text} status={battery.status} />
          ) : null}
          {node ? (
            <LevelBar label={`Heat · ${node.label}`} value={node.value} max={node.max} text={node.text} status={node.status} marks={[{ at: node.mark ?? node.max, kind: 'warning' }]} />
          ) : null}
          <LevelBar
            label="Recorder"
            value={rec.bytes}
            max={rec.capacity}
            text={`${bytes(rec.bytes)} · ${fixed(rec.rate, 2)} Hz`}
            tone="blackbox"
          />
        </Panel>

        {chosen ? (
          <Panel title={chosen.id} aside={chosen.tracked ? 'tracked' : 'seen'} status={chosen.tracked ? 'nominal' : 'stale'}>
            <Line label="range">
              {dist(distance(ship.position, chosen.position) - chosen.radius)}
            </Line>
            <Line label="radius">{dist(chosen.radius)}</Line>
            <Actions>
              <Button
                primary
                disabled={ended}
                onClick={() => game.command({ kind: 'point', sensor: 'camera', target: chosen.id })}
              >
                POINT CAMERA
              </Button>
              <Button onClick={() => desk.select(null)}>CLEAR</Button>
            </Actions>
          </Panel>
        ) : null}
      </aside>
    </>
  );
}
