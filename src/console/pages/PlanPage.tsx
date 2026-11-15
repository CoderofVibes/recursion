/**
 * PLAN: timed burns and sensor pointing (P6: the player plans, the model forecasts). A burn's
 * direction is relative to the body axis, the believed velocity or a chosen body; its size is a
 * speed change or a duration, at a throttle. PREVIEW draws a draft forecast; COMMIT issues the
 * forecast, frozen, and schedules the plan. Also saved procedures (P9) and voluntary Recall (P8).
 */
import { useState } from 'react';
import type { AttitudeTarget, Procedure } from '../../contracts/index.ts';
import { matchProcedure, saveProcedure } from '../../blackbox/index.ts';
import type { PlanDraft } from '../../game/belief/controls.ts';
import { burnDuration, burnSteps } from '../../game/belief/maneuver.ts';
import type { PlanStep } from '../../game/belief/maneuver.ts';
import { ModeChips, Panel, Readout, ReadoutGrid } from '../../theme/components/index.ts';
import { holdFromNose } from '../../view3d/adapter.ts';
import { Actions, Button, Caption, Line, NumberField, SelectField } from '../controls.tsx';
import { visited } from '../data.ts';
import type { Desk } from '../desk.ts';
import { clock, dist, duration, fixed, name } from '../format.ts';

type Direction = 'prograde' | 'retrograde' | 'toward' | 'away' | 'axis';
type Sizing = 'deltaV' | 'duration';

interface BurnRow {
  readonly key: number;
  readonly at: number;
  readonly direction: Direction;
  /** Body for toward/away. */
  readonly target: string;
  /** For `axis`: degrees to turn the nose to the left of where it points now. */
  readonly offset: number;
  readonly sizing: Sizing;
  readonly amount: number;
  readonly throttle: number;
}

interface PointRow {
  readonly key: number;
  readonly at: number;
  readonly target: string;
}

const DIRECTIONS: readonly { value: Direction; label: string }[] = [
  { value: 'prograde', label: 'PROGRADE' },
  { value: 'retrograde', label: 'RETROGRADE' },
  { value: 'toward', label: 'TOWARD' },
  { value: 'away', label: 'AWAY FROM' },
  { value: 'axis', label: 'BODY AXIS' },
];

let nextKey = 1;

/** Saved procedures live in this browser, beside the Black Box records they came from. */
const PROCEDURES_KEY = 'recursion.procedures';
function loadProcedures(): Procedure[] {
  try {
    return JSON.parse(window.localStorage.getItem(PROCEDURES_KEY) ?? '[]') as Procedure[];
  } catch {
    return [];
  }
}

export function PlanPage({ desk }: { readonly desk: Desk }) {
  const { game } = desk;
  const [burns, setBurns] = useState<BurnRow[]>([]);
  const [points, setPoints] = useState<PointRow[]>([]);
  const [procedures, setProcedures] = useState<Procedure[]>(loadProcedures);
  const status = game.status();
  const snapshot = game.snapshot();
  const ship = snapshot.world.ship;
  const bodies = snapshot.world.bodies;
  const primary = bodies[0]?.id ?? '';
  const ended = status.phase === 'ended';

  const attitudeOf = (b: BurnRow): AttitudeTarget => {
    switch (b.direction) {
      case 'prograde':
      case 'retrograde':
        return { reference: b.direction };
      case 'toward':
      case 'away':
        return { reference: b.direction, target: b.target };
      case 'axis':
        // Relative to where the nose points now, as believed.
        return holdFromNose(ship.attitude, (b.offset * Math.PI) / 180);
    }
  };
  const durationOf = (b: BurnRow): number =>
    b.sizing === 'duration'
      ? b.amount
      : burnDuration(game.ship, ship.massProperties.mass, b.amount, 'main-engine', b.throttle);

  const draft = (): PlanDraft => {
    const items: PlanStep[] = [];
    for (const b of burns)
      items.push(
        ...burnSteps({
          at: Math.max(0, b.at),
          duration: durationOf(b),
          throttle: b.throttle,
          attitude: attitudeOf(b),
        }),
      );
    for (const p of points)
      items.push({
        at: Math.max(0, p.at),
        command: { kind: 'point', sensor: 'camera', target: p.target },
      });
    items.sort((a, b) => a.at - b.at);
    const first = burns[0];
    return {
      name: first
        ? `${first.direction} ${fixed(first.amount, 1)} ${first.sizing === 'deltaV' ? 'm/s' : 's'}`
        : points.length
          ? 'pointing'
          : 'coast',
      items,
    };
  };

  const addBurn = (): void =>
    setBurns((list) => [
      ...list,
      {
        key: nextKey++,
        at: 400 + list.length * 1200,
        direction: 'prograde',
        target: primary,
        offset: 0,
        sizing: 'deltaV',
        amount: 5,
        throttle: 1,
      },
    ]);
  const patchBurn = (key: number, patch: Partial<BurnRow>): void =>
    setBurns((list) => list.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  const addPoint = (): void =>
    setPoints((list) => [...list, { key: nextKey++, at: 0, target: primary }]);

  const targets = [
    ...bodies.map((b) => ({ value: b.id, label: b.name.toUpperCase() })),
    ...snapshot.world.asteroids.map((a) => ({ value: a.id, label: a.id.toUpperCase() })),
  ];
  const bodyOptions = bodies.map((b) => ({ value: b.id, label: b.name.toUpperCase() }));

  // What the draft (or, failing that, the latest issued forecast) says will happen.
  const shown = desk.preview ?? snapshot.forecasts.at(-1);
  const reach = visited(shown, snapshot);
  const last = shown?.samples.at(-1);
  const extrapolating = shown ? shown.samples.filter((s) => s.extrapolating).length : 0;

  const record = game.blackBox.attempt(status.attemptId);
  const save = (): void => {
    if (!record) return;
    const id = `procedure-${Date.now().toString(36)}`;
    try {
      const procedure = saveProcedure({
        id,
        name: `Attempt ${record.index} to T+${clock(status.t)}`,
        record,
        from: 0,
        to: status.t,
        tolerance: { position: 20_000, velocity: 2, attitude: 0.1 },
      });
      const list = [...procedures, procedure];
      setProcedures(list);
      window.localStorage.setItem(PROCEDURES_KEY, JSON.stringify(list));
      desk.say(`procedure saved: ${procedure.items.length} commands`);
    } catch (reason) {
      desk.say(`not saved · ${reason instanceof Error ? reason.message : String(reason)}`);
    }
  };
  const replay = (p: Procedure): void => {
    // A procedure replays as a plan from now; it matches exactly only from the same conditions.
    desk.commitPlan({
      name: p.name,
      items: p.items
        .filter((i) => i.command.kind !== 'mark')
        .map((i) => ({ at: i.at, command: i.command })),
    });
  };
  const forget = (id: string): void => {
    const list = procedures.filter((p) => p.id !== id);
    setProcedures(list);
    window.localStorage.setItem(PROCEDURES_KEY, JSON.stringify(list));
  };

  return (
    <div className="cs-grid">
      <Panel title="Burns" aside={`${burns.length} planned`} tone="measured">
        {burns.map((b, i) => (
          <div className="cs-item" key={b.key}>
            <div className="cs-item__head">
              <span>BURN {i + 1}</span>
              <span className="cs-item__value">{fixed(durationOf(b), 1)} s · main engine</span>
              <button
                type="button"
                className="cs-item__close"
                aria-label="Remove burn"
                onClick={() => setBurns((list) => list.filter((x) => x.key !== b.key))}
              >
                ×
              </button>
            </div>
            <div className="cs-fields">
              <NumberField
                label="In"
                unit="s"
                min={0}
                step={60}
                value={b.at}
                onChange={(v) => patchBurn(b.key, { at: v })}
              />
              <SelectField
                label="Direction"
                value={b.direction}
                options={DIRECTIONS}
                onChange={(v) => patchBurn(b.key, { direction: v as Direction })}
              />
              {b.direction === 'toward' || b.direction === 'away' ? (
                <SelectField
                  label="Body"
                  value={b.target}
                  options={bodyOptions}
                  onChange={(v) => patchBurn(b.key, { target: v })}
                />
              ) : null}
              {b.direction === 'axis' ? (
                <NumberField
                  label="Turn"
                  unit="° left"
                  step={5}
                  value={b.offset}
                  onChange={(v) => patchBurn(b.key, { offset: v })}
                />
              ) : null}
              <SelectField
                label="By"
                value={b.sizing}
                options={[
                  { value: 'deltaV', label: 'SPEED CHANGE' },
                  { value: 'duration', label: 'DURATION' },
                ]}
                onChange={(v) => patchBurn(b.key, { sizing: v as Sizing })}
              />
              <NumberField
                label={b.sizing === 'deltaV' ? 'Δv' : 'For'}
                unit={b.sizing === 'deltaV' ? 'm/s' : 's'}
                min={0.1}
                step={0.5}
                value={b.amount}
                onChange={(v) => patchBurn(b.key, { amount: v })}
              />
              <NumberField
                label="Throttle"
                unit="%"
                min={5}
                max={100}
                step={5}
                value={Math.round(b.throttle * 100)}
                onChange={(v) =>
                  patchBurn(b.key, { throttle: Math.min(1, Math.max(0.05, v / 100)) })
                }
              />
            </div>
          </div>
        ))}
        <Actions>
          <Button onClick={addBurn} disabled={ended}>
            + BURN
          </Button>
        </Actions>
      </Panel>

      <Panel title="Sensor pointing" aside={`${points.length} planned`}>
        {points.map((p) => (
          <div className="cs-item" key={p.key}>
            <div className="cs-fields">
              <NumberField
                label="In"
                unit="s"
                min={0}
                step={60}
                value={p.at}
                onChange={(v) =>
                  setPoints((list) => list.map((x) => (x.key === p.key ? { ...x, at: v } : x)))
                }
              />
              <SelectField
                label="Camera at"
                value={p.target}
                options={targets}
                onChange={(v) =>
                  setPoints((list) => list.map((x) => (x.key === p.key ? { ...x, target: v } : x)))
                }
              />
              <button
                type="button"
                className="cs-item__close"
                aria-label="Remove pointing"
                onClick={() => setPoints((list) => list.filter((x) => x.key !== p.key))}
              >
                ×
              </button>
            </div>
          </div>
        ))}
        <p className="cs-note">
          tracking a rock is how the ship measures the pull at distances it has not flown
        </p>
        <Actions>
          <Button onClick={addPoint} disabled={ended}>
            + POINTING
          </Button>
        </Actions>
        <Caption>now</Caption>
        <Actions>
          {targets.slice(0, 6).map((t) => (
            <Button
              key={t.value}
              disabled={ended}
              onClick={() => game.command({ kind: 'point', sensor: 'camera', target: t.value })}
            >
              {t.label}
            </Button>
          ))}
        </Actions>
      </Panel>

      <Panel
        title="Forecast"
        tone="forecast"
        aside={desk.preview ? 'draft' : shown ? 'issued' : 'none'}
        statusLine={
          status.committing
            ? 'committing: time holds until the forecast arrives'
            : status.planId
              ? `${status.planId} · ${status.pending} commands pending`
              : 'no plan scheduled'
        }
      >
        {shown && last ? (
          <>
            <ReadoutGrid columns={2}>
              <Readout label="Ends" value={`T+${clock(last.t)}`} tone="forecast" />
              <Readout
                label="Looks ahead"
                value={duration(last.t - shown.issuedAt)}
                tone="forecast"
              />
              <Readout label="Model" value={`v${shown.modelVersion}`} tone="forecast" />
              <Readout
                label="Extrapolating"
                value={`${Math.round((extrapolating / Math.max(1, shown.samples.length)) * 100)}%`}
                tone="forecast"
                status={extrapolating > 0 ? 'caution' : 'nominal'}
              />
            </ReadoutGrid>
            {[...reach].map(([id, [lo, hi]]) => (
              <Line key={id} label={`${id} range`} tone="forecast">
                {dist(lo)} – {dist(hi)}
              </Line>
            ))}
            {shown.closestApproaches.slice(0, 5).map((c) => (
              <Line key={`${c.id}-${c.t}`} label={`${name(c.id)} closest`} tone="forecast">
                {dist(c.distance)} ±{dist(c.sigma)} · T+{clock(c.t)}
              </Line>
            ))}
          </>
        ) : (
          <p className="cs-note">no forecast yet: preview a plan, or commit one</p>
        )}
        <Actions>
          <Button onClick={() => desk.previewPlan(draft())} disabled={ended} tone="forecast">
            PREVIEW
          </Button>
          <Button
            primary
            tone="forecast"
            disabled={ended || status.committing}
            onClick={() => desk.commitPlan(draft())}
          >
            COMMIT
          </Button>
          <Button
            onClick={() => game.command({ kind: 'cutoff', thruster: 'all' })}
            disabled={ended}
            status="caution"
          >
            CUTOFF
          </Button>
        </Actions>
      </Panel>

      <Panel title="Procedures" tone="blackbox" aside={`${procedures.length} saved`}>
        {procedures.map((p) => {
          const match = matchProcedure(p, {
            encounterId: game.briefing.id,
            configuration: ship.configuration,
            estimate: ship,
          });
          const off = match.checks.filter((c) => !c.ok).map((c) => c.name);
          return (
            <div className="cs-item" key={p.id}>
              <div className="cs-item__head">
                <span>{p.name}</span>
                <span className="cs-item__value">{p.items.length} commands</span>
                <button
                  type="button"
                  className="cs-item__close"
                  aria-label="Forget procedure"
                  onClick={() => forget(p.id)}
                >
                  ×
                </button>
              </div>
              <Line label="conditions" status={match.matches ? 'nominal' : 'caution'}>
                {match.matches ? 'match: replays exactly' : `differ: ${off.join(', ')}`}
              </Line>
              <Actions>
                <Button tone="blackbox" disabled={ended} onClick={() => replay(p)}>
                  REPLAY FROM NOW
                </Button>
              </Actions>
            </div>
          );
        })}
        <Actions>
          <Button tone="blackbox" onClick={save} disabled={!record}>
            SAVE THIS ATTEMPT SO FAR
          </Button>
        </Actions>
        <Caption>recurrence</Caption>
        <ModeChips label="Attempt" options={[`ATTEMPT ${status.attemptIndex}`]} value="" />
        <Actions>
          <Button
            tone="blackbox"
            onClick={() => (ended ? game.restart() : game.recall())}
            title="End this attempt and begin again at arrival. Black Box and the model keep what they have."
          >
            {ended ? 'BEGIN AGAIN' : 'RECALL'}
          </Button>
        </Actions>
      </Panel>
    </div>
  );
}
