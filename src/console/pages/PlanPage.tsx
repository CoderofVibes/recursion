/**
 * PLAN: timed burns and sensor pointing (P6: the player plans, the model forecasts). A burn's
 * direction is relative to the body axis, the believed velocity or a chosen body; its size is a
 * speed change or a duration, at a throttle. PREVIEW draws a draft forecast; COMMIT issues the
 * forecast, frozen, and schedules the plan. Also saved procedures (P9) and voluntary Recall (P8).
 *
 * The rows being edited live on the desk (S9 R4), so they survive page and view changes; any
 * edit makes a preview of the old inputs stale. A new attempt sets the draft aside and offers it
 * back, unscheduled.
 */
import { useEffect, useRef } from 'react';
import type { AttitudeTarget, ForecastSigmaBySource, Procedure } from '../../contracts/index.ts';
import { matchProcedure, saveProcedure } from '../../blackbox/index.ts';
import type { PlanDraft } from '../../game/belief/controls.ts';
import {
  burnDuration,
  burnSteps,
  DEFAULT_BURN_AT,
  turnReadiness,
} from '../../game/belief/maneuver.ts';
import type { PlanStep, TurnReadiness } from '../../game/belief/maneuver.ts';
import { LevelBar, ModeChips, Panel, Readout, ReadoutGrid } from '../../theme/components/index.ts';
import { holdFromNose } from '../../view3d/adapter.ts';
import { Columns } from '../Columns.tsx';
import { Actions, Button, Caption, Line, NumberField, SelectField } from '../controls.tsx';
import { burnDirection, visited } from '../data.ts';
import type { BurnDirection, BurnRow, Desk, DraftState, PlanEdit, PointRow } from '../desk.ts';
import { clock, dist, duration, fixed, name } from '../format.ts';

const DIRECTIONS: readonly { value: BurnDirection; label: string }[] = [
  { value: 'prograde', label: 'PROGRADE' },
  { value: 'retrograde', label: 'RETROGRADE' },
  { value: 'toward', label: 'TOWARD' },
  { value: 'away', label: 'AWAY FROM' },
  { value: 'axis', label: 'BODY AXIS' },
];

/** The sources of a forecast's uncertainty, in the words the console uses for them. */
const SOURCES: readonly (readonly [keyof Omit<ForecastSigmaBySource, 't' | 'total'>, string])[] = [
  ['state', 'tracking now'],
  ['profile', 'measured pull'],
  ['hedge', 'beyond the data'],
  ['bodies', 'other bodies'],
  ['engine', 'engine'],
  ['mass', 'mass'],
];

const DRAFT_LINE: Readonly<Record<DraftState, string>> = {
  empty: 'nothing planned: committing now issues a coasting forecast',
  edited: 'draft · not previewed · not scheduled',
  previewed: 'draft · previewed as shown · not scheduled',
  committed: 'committed as shown',
};

/** A burn's turn: how long it needs, and whether the plan leaves it that long. */
export function TurnLine({ readiness }: { readonly readiness: TurnReadiness | undefined }) {
  if (!readiness) return null;
  const turn = `${fixed((readiness.angle * 180) / Math.PI, 0)}° turn needs ${duration(readiness.needed)}`;
  return readiness.ready ? (
    <Line label="turn">{turn}: ready by the burn</Line>
  ) : (
    <Line label="turn" status="caution">
      {turn}; the burn is in {duration(readiness.lead)}: not ready, it fires before the nose is
      round
    </Line>
  );
}

export function PlanPage({ desk }: { readonly desk: Desk }) {
  const { game } = desk;
  const { burns, points } = desk.planEdit;
  const status = game.status();
  const snapshot = desk.snapshot();
  const ship = snapshot.world.ship;
  const bodies = snapshot.world.bodies;
  const primary = bodies[0]?.id ?? '';
  const ended = status.phase === 'ended';
  const procedures = desk.archive().procedures;
  const draftState = desk.draftState();

  // Keyboard: a new row takes focus at its first field; a removed row hands it to the nearest
  // surviving row, or to its add button (S9 R12).
  const root = useRef<HTMLDivElement>(null);
  const focusNext = useRef<string | null>(null);
  useEffect(() => {
    const selector = focusNext.current;
    if (!selector) return;
    focusNext.current = null;
    root.current?.querySelector<HTMLElement>(selector)?.focus();
  });
  const firstField = (key: number): string =>
    `[data-row="${key}"] :is(input, select):not(:disabled)`;
  const edit = (change: (e: PlanEdit) => PlanEdit): void => desk.editPlan(change);

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
  /**
   * Whether the ship will have turned to the burn by its time (2F's `turnReadiness`): from the
   * believed attitude now, at the design's slew limit. The game never delays a burn, so one
   * planned sooner fires before the nose is round; the row says so.
   */
  const readinessOf = (b: BurnRow) => {
    const direction = burnDirection(attitudeOf(b), ship, snapshot.world);
    return direction ? turnReadiness(game.ship, ship.attitude, direction, b.at) : undefined;
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

  const addBurn = (): void => {
    const key = desk.newRowKey();
    focusNext.current = firstField(key);
    edit((e) => ({
      ...e,
      burns: [
        ...e.burns,
        {
          key,
          // 2F's default (S20, R17): the full turn allowance and two minutes more, so a burn as
          // offered never fires before a half turn has settled; later rows follow 20 min apart.
          at: DEFAULT_BURN_AT + e.burns.length * 1200,
          direction: 'prograde',
          target: primary,
          offset: 0,
          sizing: 'deltaV',
          amount: 5,
          throttle: 1,
        },
      ],
    }));
  };
  const patchBurn = (key: number, patch: Partial<BurnRow>): void =>
    edit((e) => ({ ...e, burns: e.burns.map((b) => (b.key === key ? { ...b, ...patch } : b)) }));
  const removeBurn = (key: number): void => {
    const i = burns.findIndex((b) => b.key === key);
    const near = burns[i + 1] ?? burns[i - 1];
    focusNext.current = near ? firstField(near.key) : '[data-mark="add-burn"]';
    edit((e) => ({ ...e, burns: e.burns.filter((b) => b.key !== key) }));
  };
  const addPoint = (): void => {
    const key = desk.newRowKey();
    focusNext.current = firstField(key);
    edit((e) => ({ ...e, points: [...e.points, { key, at: 0, target: primary }] }));
  };
  const patchPoint = (key: number, patch: Partial<PointRow>): void =>
    edit((e) => ({ ...e, points: e.points.map((p) => (p.key === key ? { ...p, ...patch } : p)) }));
  const removePoint = (key: number): void => {
    const i = points.findIndex((p) => p.key === key);
    const near = points[i + 1] ?? points[i - 1];
    focusNext.current = near ? firstField(near.key) : '[data-mark="add-point"]';
    edit((e) => ({ ...e, points: e.points.filter((p) => p.key !== key) }));
  };

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
  const detail = shown?.detail;
  const endSigma = detail?.sigmaMajor.at(-1);
  const bodyName = (id: string): string => bodies.find((b) => b.id === id)?.name ?? id;

  const save = (): void => {
    // Read only when asked: reading the record in progress copies all of it.
    const record = game.blackBox.attempt(status.attemptId);
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
      // Black Box keeps it with the records, across attempts and reloads (P9).
      game.blackBox.saveProcedure(procedure);
      desk.archive(true);
      desk.say(`procedure saved: ${procedure.items.length} commands`);
    } catch (reason) {
      desk.say(`not saved · ${reason instanceof Error ? reason.message : String(reason)}`);
    }
  };
  const replay = (p: Procedure): void => {
    // A procedure replays as a plan from now; it matches exactly only from the same conditions.
    desk.commitPlan(
      {
        name: p.name,
        items: p.items
          .filter((i) => i.command.kind !== 'mark')
          .map((i) => ({ at: i.at, command: i.command })),
      },
      false,
    );
  };
  const forget = (id: string): void => {
    game.blackBox.removeProcedure(id);
    desk.archive(true);
    desk.say('procedure forgotten');
  };

  return (
    <div ref={root}>
      <Columns>
        <Panel
          title="Burns"
          aside={`${burns.length} planned`}
          tone="measured"
          statusLine={DRAFT_LINE[draftState]}
          status={draftState === 'committed' ? 'nominal' : undefined}
        >
          {desk.setAside ? (
            <div className="cs-item">
              <Line label="set aside" status="caution">
                attempt {desk.setAside.attempt}&apos;s draft: {desk.setAside.edit.burns.length}{' '}
                burns, {desk.setAside.edit.points.length} pointings, timed from that attempt&apos;s
                commit
              </Line>
              <Actions>
                <Button disabled={ended} onClick={() => desk.restoreSetAside()}>
                  RESTORE AS DRAFT
                </Button>
              </Actions>
            </div>
          ) : null}
          {burns.map((b, i) => (
            <div
              className="cs-item"
              key={b.key}
              data-row={b.key}
              role="group"
              aria-label={`Burn ${i + 1}`}
            >
              <div className="cs-item__head">
                <span>BURN {i + 1}</span>
                <span className="cs-item__value">{fixed(durationOf(b), 1)} s · main engine</span>
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
                  onChange={(v) => patchBurn(b.key, { direction: v as BurnDirection })}
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
                  onChange={(v) => patchBurn(b.key, { sizing: v as BurnRow['sizing'] })}
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
                {/* Removing comes after editing, in the order the keyboard meets them. */}
                <button
                  type="button"
                  className="cs-item__close"
                  aria-label={`Remove burn ${i + 1}`}
                  onClick={() => removeBurn(b.key)}
                >
                  ×
                </button>
              </div>
              <TurnLine readiness={readinessOf(b)} />
            </div>
          ))}
          <Actions>
            <Button onClick={addBurn} disabled={ended} mark="add-burn">
              + BURN
            </Button>
            {burns.length + points.length > 0 ? (
              <Button
                onClick={() => {
                  focusNext.current = '[data-mark="add-burn"]';
                  edit(() => ({ burns: [], points: [] }));
                }}
              >
                CLEAR DRAFT
              </Button>
            ) : null}
          </Actions>
        </Panel>

        <Panel title="Sensor pointing" aside={`${points.length} planned`}>
          {points.map((p, i) => (
            <div
              className="cs-item"
              key={p.key}
              data-row={p.key}
              role="group"
              aria-label={`Pointing ${i + 1}`}
            >
              <div className="cs-fields">
                <NumberField
                  label="In"
                  unit="s"
                  min={0}
                  step={60}
                  value={p.at}
                  onChange={(v) => patchPoint(p.key, { at: v })}
                />
                <SelectField
                  label="Camera at"
                  value={p.target}
                  options={targets}
                  onChange={(v) => patchPoint(p.key, { target: v })}
                />
                <button
                  type="button"
                  className="cs-item__close"
                  aria-label={`Remove pointing ${i + 1}`}
                  onClick={() => removePoint(p.key)}
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
            <Button onClick={addPoint} disabled={ended} mark="add-point">
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
              ? 'committing: the forecast is on its way'
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
              {detail && endSigma ? (
                // What the envelope is made of (ForecastDraft.detail): why it is as wide as it is.
                <>
                  <Caption>envelope at its end · 1σ, longest axis</Caption>
                  <Line label="total" tone="forecast">
                    {dist(endSigma.total)}
                  </Line>
                  {SOURCES.map(([key, label]) => {
                    const value = endSigma[key];
                    // A source the forecast does not report (a stand-in has no bodies' share)
                    // is left out, not drawn as zero.
                    return value === undefined ? null : (
                      <LevelBar
                        key={key}
                        label={label}
                        value={value}
                        max={Math.max(endSigma.total, 1)}
                        text={dist(value)}
                        tone="forecast"
                      />
                    );
                  })}
                  <Line
                    label="present state"
                    tone="forecast"
                    status={detail.stale ? 'caution' : undefined}
                  >
                    {detail.presentSource}
                    {detail.presentBody ? ` against ${bodyName(detail.presentBody)}` : ''} · T+
                    {clock(detail.presentTime)}
                    {detail.presentAge !== undefined
                      ? ` · ${duration(detail.presentAge)} before issue`
                      : ''}
                  </Line>
                  {detail.stale ? (
                    <p className="cs-note">
                      ▲ nothing tracked lately: carried from an older present state; point the
                      camera at a body to refresh it
                    </p>
                  ) : null}
                  {detail.asteroids.length ? (
                    <Line label="rocks" tone="forecast">
                      {detail.asteroids.filter((a) => a.forecast).length} forecast
                      {detail.asteroids.some((a) => !a.forecast)
                        ? ` · ${detail.asteroids.filter((a) => !a.forecast).length} with too short a track`
                        : ''}
                    </Line>
                  ) : null}
                </>
              ) : null}
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
              <div className="cs-item" key={p.id} role="group" aria-label={p.name}>
                <div className="cs-item__head">
                  <span>{p.name}</span>
                  <span className="cs-item__value">{p.items.length} commands</span>
                </div>
                <Line label="conditions" status={match.matches ? 'nominal' : 'caution'}>
                  {match.matches ? 'match: replays exactly' : `differ: ${off.join(', ')}`}
                </Line>
                <Actions>
                  <Button tone="blackbox" disabled={ended} onClick={() => replay(p)}>
                    REPLAY FROM NOW
                  </Button>
                  <Button onClick={() => forget(p.id)}>FORGET</Button>
                </Actions>
              </div>
            );
          })}
          <Actions>
            <Button tone="blackbox" onClick={save}>
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
          <p className="cs-note">
            starts a new attempt at arrival; Black Box and the model keep their records
          </p>
        </Panel>
      </Columns>
    </div>
  );
}
