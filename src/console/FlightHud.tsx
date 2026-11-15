/**
 * The instruments around the FLIGHT hologram: the flight keys, what the ship is doing, the
 * margins that change as it flies (propellant, power, heat, recorder), alerts, time, and the
 * object the player has chosen. Everything here is belief: the navigation estimate, gauged
 * stores, and the forecast as issued.
 */
import {
  AlertStack,
  LevelBar,
  Panel,
  Readout,
  ReadoutGrid,
  Trend,
} from '../theme/components/index.ts';
import { distance, heading, length, pitch } from '../view3d/adapter.ts';
import { flightAlerts } from './alerts.ts';
import { Actions, Button, Line, SelectField, TimeControls, wallTime } from './controls.tsx';
import { FramingControls } from './Framing.tsx';
import type { Framing } from './Framing.tsx';
import {
  batteries,
  busLoads,
  heat,
  departMet,
  departure,
  nearestClearance,
  recorder,
  spendable,
  stores,
} from './data.ts';
import type { Desk } from './desk.ts';
import { EncounterSlot } from './encounterPanels.ts';
import { bytes, clock, degrees, dist, fixed, name, whole } from './format.ts';

export interface FlightKeys {
  /** Keys held down, lower case. */
  readonly held: ReadonlySet<string>;
  /** Which controls the ship answers to today (the rest wait for 2G's hands-on seam). */
  readonly available: {
    readonly throttle: boolean;
    readonly yaw: boolean;
    readonly pitch: boolean;
    readonly translate: boolean;
  };
}

export interface FlightHudProps {
  readonly desk: Desk;
  /** Which controls the ship answers to today (the rest wait for 2G's hands-on seam). */
  readonly available: FlightKeys['available'];
  readonly headingUp: boolean;
  readonly range: number;
  readonly onHeadingUp: () => void;
  /** Framing the hologram without a pointer. */
  readonly framing?: Framing;
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

export function FlightHud({
  desk,
  available,
  headingUp,
  range,
  onHeadingUp,
  framing,
}: FlightHudProps) {
  const { game } = desk;
  const keys: FlightKeys = { held: desk.keys, available };
  const miss = desk.flightMiss;
  const status = game.status();
  const snapshot = desk.snapshot();
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
  const nearest = nearestClearance(snapshot);
  const depart = departure(game.status(), snapshot, game.model.state());
  const budget = spendable(ship, game.ship, desk.design.reserve);
  let pass: NonNullable<typeof forecast>['closestApproaches'][number] | undefined;
  for (const c of forecast?.closestApproaches ?? [])
    if (c.t > status.t && (!pass || c.t < pass.t)) pass = c;
  const actStatus =
    (miss && miss.sigmas > 3) ||
    (nearest && nearest.clearance < desk.design.clearance) ||
    (pass && pass.distance - 2 * pass.sigma < desk.design.clearance)
      ? 'caution'
      : 'nominal';

  const items = flightAlerts(desk);

  const chosen = desk.selected
    ? (snapshot.world.asteroids.find((a) => a.id === desk.selected) ??
      snapshot.world.bodies.find((b) => b.id === desk.selected))
    : undefined;
  const ended = status.phase === 'ended';

  return (
    <>
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
            {forecast.detail?.stale
              ? ` · ▲ FROM T+${clock(forecast.detail.presentTime)}: NOTHING TRACKED LATELY`
              : ''}
          </>
        ) : (
          'NO FORECAST ISSUED'
        )}
      </div>

      {/* Time, then the panels, in one column: the lines under the warp steps push them down. */}
      <div className="fh-right">
        <div className="fh-top">
          <TimeControls game={game} forecasts={snapshot.forecasts} reason={desk.warpDrop} compact />
        </div>
        <aside className="fh-side">
          <Panel title="Flight" aside={headingUp ? 'heading up' : 'chart up'}>
            <ReadoutGrid columns={2}>
              <Readout
                label={primary ? `Speed · ${primary.name}` : 'Speed'}
                value={fixed(speed, 2)}
                unit="m/s"
                size="readout"
              />
              <Readout
                label="Heading"
                value={String(Math.round(degrees(heading(ship.attitude)))).padStart(3, '0')}
                unit="°"
                size="readout"
              />
              {/* In 3D the nose also points up or down (S20: heading alone told half). */}
              <Readout
                label="Pitch"
                value={fixed((pitch(ship.attitude) * 180) / Math.PI, 1)}
                unit="°"
              />
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
              <span className="cs-note">range {dist(range)} · wheel · U</span>
            </Actions>
            {/* What the hologram shows, by name: only what the ship senses (S9 R13, P11). */}
            <SelectField
              label="Look at"
              value={chosen ? chosen.id : ''}
              options={[
                { value: '', label: '—' },
                ...snapshot.world.bodies.map((b) => ({ value: b.id, label: b.name.toUpperCase() })),
                ...snapshot.world.asteroids.map((a) => ({
                  value: a.id,
                  label: `${a.id.toUpperCase()} · ${a.tracked ? 'tracked' : 'seen'}`,
                })),
              ]}
              onChange={(v) => desk.select(v || null)}
            />
            {framing ? <FramingControls view={framing} orbit={false} /> : null}
          </Panel>

          {/* S8: what the ship measures against what was forecast, how close the hull is to
              anything sensed, and what is left to act with, and how long there is to act. */}
          <Panel
            title="Margin to act"
            status={actStatus}
            statusLine={
              miss && miss.sigmas > 3
                ? `▲ off the forecast: ${dist(miss.metres)}, ${fixed(miss.sigmas, 1)}σ`
                : undefined
            }
          >
            {nearest ? (
              <Line
                label="nearest now"
                status={nearest.clearance < desk.design.clearance ? 'caution' : undefined}
              >
                {nearest.name} · {dist(nearest.clearance)} from the hull ·{' '}
                {nearest.tracked ? 'tracked' : 'seen'}
              </Line>
            ) : null}
            {pass ? (
              <Line
                label="next pass"
                tone="forecast"
                status={
                  pass.distance - 2 * pass.sigma < desk.design.clearance ? 'caution' : undefined
                }
              >
                {name(pass.id)} {dist(pass.distance)} ±{dist(pass.sigma)} · in{' '}
                {wallTime(pass.t - status.t, 1)}
                {status.warp > 1
                  ? ` (${wallTime(pass.t - status.t, status.warp)} at ${status.warp}×)`
                  : ''}
              </Line>
            ) : (
              <Line label="next pass" tone="forecast">
                {forecast ? 'none forecast ahead' : 'no forecast issued'}
              </Line>
            )}
            <Line label="to spend" status={budget.deltaV < 1 ? 'caution' : undefined}>
              {fixed(budget.deltaV, 1)} m/s · {whole(budget.kg)} kg above the reserve
            </Line>
            {depart ? (
              // The objective's frame, as believed: not the speed past Alpha above (S20).
              <Line
                label="depart · c. of mass"
                status={
                  depart.status === 'missed'
                    ? 'caution'
                    : departMet(depart) || depart.status === 'reached'
                      ? 'nominal'
                      : undefined
                }
              >
                {depart.status === 'reached'
                  ? 'reached'
                  : `${fixed(depart.speed, 1)} of ${whole(depart.minSpeed)} m/s${
                      depart.outward !== undefined && depart.outward <= 0 ? ' inward' : ''
                    } · ${dist(depart.distance)} of ${dist(depart.beyond)}${
                      depart.status === 'missed' ? ' · missed' : ''
                    }`}
              </Line>
            ) : null}
            <Trend
              title="Off the forecast"
              unit="km"
              value={miss ? fixed(miss.metres / 1000, 2) : '—'}
              data={desk.history('miss').map((m) => m / 1000)}
              tone="forecast"
            />
          </Panel>

          {/* The encounter's own instruments, from its section (3B, 3C: ledger R4). */}
          <EncounterSlot game={game} snapshot={snapshot} />

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
              <LevelBar
                label={`Power · ${bus.label}`}
                value={bus.value}
                max={bus.max}
                text={`${whole(bus.value)} W`}
                status={bus.status}
                marks={[{ at: bus.mark ?? bus.max, kind: 'caution' }]}
              />
            ) : null}
            {battery ? (
              <LevelBar
                label="Batteries"
                value={battery.value}
                max={battery.max}
                text={battery.text}
                status={battery.status}
              />
            ) : null}
            {node ? (
              <LevelBar
                label={`Heat · ${node.label}`}
                value={node.value}
                max={node.max}
                text={node.text}
                status={node.status}
                marks={[{ at: node.mark ?? node.max, kind: 'warning' }]}
              />
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
            <Panel
              title={chosen.id}
              aside={chosen.tracked ? 'tracked' : 'seen'}
              status={chosen.tracked ? 'nominal' : 'stale'}
            >
              <Line label="range">
                {dist(distance(ship.position, chosen.position) - chosen.radius)}
              </Line>
              <Line label="radius">{dist(chosen.radius)}</Line>
              <Actions>
                <Button
                  primary
                  disabled={ended}
                  onClick={() =>
                    game.command({ kind: 'point', sensor: 'camera', target: chosen.id })
                  }
                >
                  POINT CAMERA
                </Button>
                <Button onClick={() => desk.select(null)}>CLEAR</Button>
              </Actions>
            </Panel>
          ) : null}
        </aside>
      </div>
    </>
  );
}
