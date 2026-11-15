/**
 * PLAN: the loop's third stage. The player plans (timed burns, where the camera looks); the
 * model forecasts what the plan will do (P6), and the page is built around that forecast.
 *
 * It leads with the chart: the plan's path as the model forecasts it, dotted, with its 2σ
 * envelope, hatched where the model is beyond its data, against the distances where each body's
 * pull has been measured. Under it the forecast's own steps (now, each burn, where the model
 * runs out of data, each pass, where it stops) to walk through; beside it, what the forecast
 * says at the step shown and what its uncertainty is made of. Change the plan and the forecast
 * follows: the draft is forecast again as it is edited, and the forecast of the plan as it was
 * stays on the chart, faint, until the new one arrives.
 *
 * A burn's direction is along or against the believed velocity, toward or away from a body,
 * across the ship's motion, or from the body axis; its size is a speed change or a duration, at
 * a throttle. COMMIT issues the forecast, frozen, and schedules the plan. Also saved procedures
 * (P9) and voluntary Recall (P8), folded below.
 *
 * The rows being edited live on the desk (S9 R4), so they survive page and view changes. A new
 * attempt sets the draft aside and offers it back, unscheduled.
 */
import { useEffect, useMemo, useRef } from 'react';
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
import { Actions, Button, Caption, Line, NumberField, SelectField } from '../controls.tsx';
import { burnDirection, departForecast, spendable } from '../data.ts';
import { OBJECTIVE_TARGET } from '../desk.ts';
import type {
  BurnDirection,
  BurnRow,
  ChartFraming,
  Desk,
  DraftState,
  PlanEdit,
  PointRow,
} from '../desk.ts';
import { forecastClock, readForecast } from '../forecastReading.ts';
import type { ForecastReading } from '../forecastReading.ts';
import { clock, dist, duration, fixed, name } from '../format.ts';
import { at } from '../instruments/chartMath.ts';
import type { P2 } from '../instruments/chartMath.ts';
import { DragBar } from '../instruments/DragBar.tsx';
import { StepBar } from '../instruments/StepBar.tsx';
import { TrajectoryChart } from '../instruments/TrajectoryChart.tsx';
import type { ChartMark } from '../instruments/TrajectoryChart.tsx';
import { UncertaintyPanel } from '../instruments/UncertaintyPanel.tsx';
import {
  chartPath,
  evidenceBands,
  forecastReach,
  objectiveRegions,
  wholeFit,
} from '../regionChart.ts';
import { followRange } from '../Rehearsal.tsx';

const DIRECTIONS: readonly { value: BurnDirection; label: string }[] = [
  { value: 'prograde', label: 'PROGRADE' },
  { value: 'retrograde', label: 'RETROGRADE' },
  { value: 'toward', label: 'TOWARD' },
  { value: 'away', label: 'AWAY' },
  { value: 'steer', label: 'STEER' },
  { value: 'left', label: '◂ LEFT' },
  { value: 'right', label: 'RIGHT ▸' },
  { value: 'up', label: '▴ UP' },
  { value: 'down', label: '▾ DOWN' },
  { value: 'axis', label: 'AXIS' },
];

/** What each direction means, said once under the chips for the one chosen. */
const DIRECTION_NOTE: Readonly<Record<BurnDirection, string>> = {
  prograde: 'along the ship’s motion: faster',
  retrograde: 'against the ship’s motion: slower',
  toward: 'straight at a body or a place to reach',
  away: 'directly away from a body or a place to reach',
  steer:
    'across the ship’s motion as it is now, on the side of a body or a place to reach: turns the path toward it',
  left: 'across the ship’s motion as it is now: to its left, in the plane of the chart',
  right: 'across the ship’s motion as it is now: to its right, in the plane of the chart',
  up: 'across the ship’s motion as it is now: up, out of the plane of the chart',
  down: 'across the ship’s motion as it is now: down, out of the plane of the chart',
  axis: 'body axis: turned from where the nose points now',
};

const FRAMINGS: readonly { value: ChartFraming; label: string }[] = [
  { value: 'plan', label: 'The plan' },
  { value: 'follow', label: 'Follow the ship' },
  { value: 'region', label: 'Whole region' },
];

const DRAFT_LINE: Readonly<Record<DraftState, string>> = {
  empty: 'nothing planned: the ship coasts',
  edited: 'draft · forecasting',
  previewed: 'draft · forecast as shown · not scheduled',
  committed: 'committed as shown',
};

/** Real milliseconds a draft rests after an edit before it is forecast again. */
const SETTLE = 600;

/**
 * Across the ship's motion: the unit direction to the left of the believed velocity in the
 * reference plane (x, y), or up out of it, as the velocity stands now. Undefined when the ship
 * has no velocity to be across.
 */
export function acrossMotion(
  velocity: { readonly x: number; readonly y: number; readonly z?: number },
  side: 'left' | 'right' | 'up' | 'down',
): { x: number; y: number; z: number } | undefined {
  const vz = velocity.z ?? 0;
  const speed = Math.hypot(velocity.x, velocity.y, vz);
  if (!(speed > 0)) return undefined;
  // Left is the plane's up crossed with the motion; where the motion is straight up or down
  // there is no left in the plane, and +y stands in for it.
  let lx = -velocity.y;
  let ly = velocity.x;
  const flat = Math.hypot(lx, ly);
  if (flat < 1e-9 * speed) {
    lx = 0;
    ly = 1;
  } else {
    lx /= flat;
    ly /= flat;
  }
  if (side === 'left') return { x: lx, y: ly, z: 0 };
  if (side === 'right') return { x: -lx, y: -ly, z: 0 };
  // Up is the motion crossed with left: out of the plane, square to both.
  const ux = (velocity.y * 0 - vz * ly) / speed;
  const uy = (vz * lx - velocity.x * 0) / speed;
  const uz = (velocity.x * ly - velocity.y * lx) / speed;
  return side === 'up' ? { x: ux, y: uy, z: uz } : { x: -ux, y: -uy, z: -uz };
}

/** The least angle off the line of motion (as its sine) that counts as a side: about 1°. */
export const STEER_LEAST = 0.02;

/**
 * Steering: the unit direction across the ship's motion on the side of a target, in the plane
 * of the motion and the line to it. A burn along it turns the path toward the target and, to
 * first order, leaves the speed as it is. Undefined when the ship has no motion to be across,
 * or the target is dead ahead or dead astern (there is then no side to steer to).
 */
export function steerToward(
  position: { readonly x: number; readonly y: number; readonly z?: number },
  velocity: { readonly x: number; readonly y: number; readonly z?: number },
  target: { readonly x: number; readonly y: number; readonly z?: number },
): { x: number; y: number; z: number } | undefined {
  const v = { x: velocity.x, y: velocity.y, z: velocity.z ?? 0 };
  const speed = Math.hypot(v.x, v.y, v.z);
  const to = {
    x: target.x - position.x,
    y: target.y - position.y,
    z: (target.z ?? 0) - (position.z ?? 0),
  };
  const range = Math.hypot(to.x, to.y, to.z);
  if (!(speed > 0) || !(range > 0)) return undefined;
  // The line to the target, less its part along the motion.
  const along = (to.x * v.x + to.y * v.y + to.z * v.z) / (speed * speed);
  const across = { x: to.x - along * v.x, y: to.y - along * v.y, z: to.z - along * v.z };
  const n = Math.hypot(across.x, across.y, across.z);
  // Within about a degree of the line of motion there is no side to speak of: what little
  // there is would be the estimate's noise, not a direction.
  if (n < STEER_LEAST * range) return undefined;
  return { x: across.x / n, y: across.y / n, z: across.z / n };
}

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

/** The sources of a forecast's uncertainty, in the words the console uses for them. */
const SOURCES: readonly (readonly [keyof Omit<ForecastSigmaBySource, 't' | 'total'>, string])[] = [
  ['state', 'tracking now'],
  ['profile', 'measured pull'],
  ['hedge', 'beyond the data'],
  ['bodies', 'other bodies'],
  ['engine', 'engine'],
  ['mass', 'mass'],
];

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
  const model = game.model.state();

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
    `[data-row="${key}"] :is(input, select, [role="slider"]):not(:disabled)`;
  const edit = (change: (e: PlanEdit) => PlanEdit): void => desk.editPlan(change);

  // What a burn can be aimed by: the bodies, and the places the objectives say to reach.
  const places = snapshot.objectives.flatMap((o) =>
    o.kind === 'reach-region' && o.region
      ? [{ value: `${OBJECTIVE_TARGET}${o.id}`, label: o.label.toUpperCase(), at: o.region.center }]
      : [],
  );
  /** Where a place to reach is; undefined for a body (the ship points at those itself). */
  const placeOf = (target: string) => places.find((p) => p.value === target)?.at;
  const whereIs = (target: string) =>
    placeOf(target) ?? bodies.find((body) => body.id === target)?.position;
  const steerDirection = (target: string) => {
    const where = whereIs(target);
    return where ? steerToward(ship.position, ship.velocity, where) : undefined;
  };
  const attitudeOf = (b: BurnRow): AttitudeTarget => {
    switch (b.direction) {
      case 'prograde':
      case 'retrograde':
        return { reference: b.direction };
      case 'toward':
      case 'away': {
        // A body is the ship's own to point at; a place to reach is a direction, as believed now.
        const place = placeOf(b.target);
        if (!place) return { reference: b.direction, target: b.target };
        const sign = b.direction === 'toward' ? 1 : -1;
        const to = {
          x: place.x - ship.position.x,
          y: place.y - ship.position.y,
          z: (place.z ?? 0) - (ship.position.z ?? 0),
        };
        const range = Math.hypot(to.x, to.y, to.z);
        return range > 0
          ? {
              reference: 'direction',
              direction: {
                x: (sign * to.x) / range,
                y: (sign * to.y) / range,
                z: (sign * to.z) / range,
              },
            }
          : { reference: 'prograde' };
      }
      case 'steer': {
        // Across the motion on the target's side; with no side to steer to, along the motion.
        const direction = steerDirection(b.target);
        return direction ? { reference: 'direction', direction } : { reference: 'prograde' };
      }
      case 'left':
      case 'right':
      case 'up':
      case 'down': {
        // Across the motion as believed now; with no motion to be across, along it.
        const direction = acrossMotion(ship.velocity, b.direction);
        return direction ? { reference: 'direction', direction } : { reference: 'prograde' };
      }
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

  // The forecast follows the plan: once an edit has rested, the draft is forecast again. With
  // nothing planned and no forecast in force, the coast itself is forecast, so the page never
  // opens on an empty chart. One forecast at a time; an edit made meanwhile asks again after it.
  const edits = desk.planEdits();
  const wanted =
    !ended &&
    !status.committing &&
    !desk.previewBusy &&
    !desk.previewFailed() &&
    desk.preview === undefined &&
    draftState !== 'committed' &&
    (burns.length + points.length > 0 || snapshot.forecasts.length === 0);
  const forecastDraft = useRef(draft);
  useEffect(() => {
    forecastDraft.current = draft;
  });
  useEffect(() => {
    if (!wanted) return;
    const timer = setTimeout(() => desk.previewPlan(forecastDraft.current()), SETTLE);
    return () => clearTimeout(timer);
  }, [wanted, edits, desk]);

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
  const aimOptions = [
    ...bodies.map((b) => ({ value: b.id, label: b.name.toUpperCase() })),
    ...places.map((p) => ({ value: p.value, label: p.label })),
  ];
  /**
   * The target a burn steers by when STEER is chosen: the one it has, if there is a side to
   * steer to; else the first place to reach, or body, that has one (a target dead ahead has
   * none).
   */
  const steerTarget = (current: string): string =>
    steerDirection(current)
      ? current
      : ([...places, ...aimOptions].find((o) => steerDirection(o.value))?.value ?? current);

  // The forecast on show: the draft's, or failing that the one last issued.
  const shown = desk.preview ?? snapshot.forecasts.at(-1);
  const bodyKey = bodies.map((b) => `${b.id}:${b.radius}`).join('|');
  const reading: ForecastReading | undefined = useMemo(
    () => (shown && shown.samples.length > 1 ? readForecast(shown, bodies) : undefined),
    // The believed bodies are rebuilt every frame; their ids and sizes are what matter here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown, bodyKey],
  );
  // The plan as it was before the last edit, faint, until its own forecast arrives; or, beside
  // a draft, the forecast in force.
  const before = desk.preview ? snapshot.forecasts.at(-1) : desk.stalePreview;
  const earlier = useMemo(
    () => (before && before.samples.length > 1 ? readForecast(before, bodies).path : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [before, bodyKey],
  );
  const radii = useMemo(() => new Map(bodies.map((b) => [b.id, b.radius])), [bodyKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const t = reading
    ? Math.min(reading.endsAt, Math.max(reading.issuedAt, desk.chartT ?? reading.endsAt))
    : 0;
  const here = reading?.shipAt(t);
  const marks: ChartMark[] = reading
    ? reading.steps
        .filter((s) => s.kind === 'burn' || s.kind === 'closest' || s.kind === 'ends')
        .map((s) => {
          const p = at(reading.path, s.t)!;
          return {
            x: p.x,
            y: p.y,
            kind: s.kind === 'burn' ? 'burn' : s.kind === 'closest' ? 'closest' : 'ends',
            label: s.kind === 'ends' ? 'forecast ends' : s.label.toLowerCase(),
          } satisfies ChartMark;
        })
    : [];
  const framing = desk.chartFraming;
  // The plan's framing: its path and the body it passes, with room for that body whole.
  const near = here
    ? reading!
        .bodiesAt(t)
        .reduce((a, b) =>
          Math.hypot(b.x - here.x, b.y - here.y) < Math.hypot(a.x - here.x, a.y - here.y) ? b : a,
        )
    : undefined;
  // Where the objective is. The plan's own framing does not stretch to hold it (a place a
  // thousand kilometres off would shrink the plan to a dot): the chart points to it instead.
  const regions = objectiveRegions(snapshot.objectives, bodies, model);
  const fit: P2[] | undefined =
    reading && near
      ? [
          ...reading.path.map((p): P2 => [p.x, p.y]),
          [near.x - near.radius * 1.3, near.y - near.radius * 1.3],
          [near.x + near.radius * 1.3, near.y + near.radius * 1.3],
        ]
      : undefined;
  const whole: P2[] | undefined = reading
    ? wholeFit(
        reading.bodiesAt(t),
        regions,
        reading.path.map((p): P2 => [p.x, p.y]),
        chartPath(snapshot.trail),
      )
    : undefined;
  // The forecast against the objective: how near it comes to a place to reach, and how a
  // departure stands where the forecast ends.
  const reaches = shown
    ? snapshot.objectives.flatMap((o) => {
        const reach = o.kind === 'reach-region' && o.region ? forecastReach(shown, o.region) : null;
        return reach ? [{ id: o.id, label: o.label, ...reach }] : [];
      })
    : [];
  const leaving = shown ? departForecast(shown, snapshot, model) : null;

  const last = shown?.samples.at(-1);
  const extrapolating = shown ? shown.samples.filter((s) => s.extrapolating).length : 0;
  const detail = shown?.detail;
  const endSigma = detail?.sigmaMajor.at(-1);
  const bodyName = (id: string): string => bodies.find((b) => b.id === id)?.name ?? id;
  const budget = spendable(ship, game.ship, desk.design.reserve);
  const planned = burns.reduce((n, b) => n + (b.sizing === 'deltaV' ? b.amount : 0), 0);

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
    <div className="cp-grid" data-cols="side-chart-side" ref={root}>
      <div className="cp-side">
        <Panel
          title="Burns"
          aside={`${burns.length} planned`}
          tone="measured"
          statusLine={
            draftState !== 'committed' && burns.length + points.length === 0
              ? DRAFT_LINE.empty
              : desk.previewBusy
                ? 'draft · forecasting'
                : desk.previewFailed()
                  ? 'draft · no forecast: see the line below'
                  : DRAFT_LINE[draftState]
          }
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
              className="cs-item cp-burn"
              key={b.key}
              data-row={b.key}
              role="group"
              aria-label={`Burn ${i + 1}`}
            >
              <div className="cs-item__head">
                <span>BURN {i + 1}</span>
                <span className="cs-item__value">{fixed(durationOf(b), 1)} s · main engine</span>
              </div>
              <DragBar
                stacked
                label="Fires in"
                value={b.at}
                min={0}
                max={7200}
                step={60}
                text={duration(b.at)}
                typed={{ unit: 's', step: 60 }}
                tone="thrust"
                onChange={(v) => patchBurn(b.key, { at: v })}
              />
              <ModeChips
                label="Direction"
                options={DIRECTIONS}
                value={b.direction}
                onChange={(v) =>
                  patchBurn(b.key, {
                    direction: v as BurnDirection,
                    ...(v === 'steer' ? { target: steerTarget(b.target) } : {}),
                  })
                }
              />
              <p className="cs-note">{DIRECTION_NOTE[b.direction]}</p>
              {b.direction === 'toward' || b.direction === 'away' || b.direction === 'steer' ? (
                <SelectField
                  label={b.direction === 'steer' ? 'Steer toward' : 'Target'}
                  value={b.target}
                  options={aimOptions}
                  onChange={(v) => patchBurn(b.key, { target: v })}
                />
              ) : null}
              {b.direction === 'steer' && !steerDirection(b.target) ? (
                <Line label="steer" status="caution">
                  it is dead ahead or astern: there is no side to steer to, so the burn is along the
                  motion
                </Line>
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
              <ModeChips
                label="Sized by"
                options={[
                  { value: 'deltaV', label: 'SPEED CHANGE' },
                  { value: 'duration', label: 'DURATION' },
                ]}
                value={b.sizing}
                onChange={(v) => patchBurn(b.key, { sizing: v as BurnRow['sizing'] })}
              />
              <DragBar
                stacked
                label={b.sizing === 'deltaV' ? 'Speed change' : 'Burns for'}
                value={b.amount}
                min={0.1}
                max={b.sizing === 'deltaV' ? 60 : 120}
                step={0.5}
                text={
                  b.sizing === 'deltaV' ? `${fixed(b.amount, 1)} m/s` : `${fixed(b.amount, 1)} s`
                }
                typed={{ unit: b.sizing === 'deltaV' ? 'm/s' : 's', step: 0.5 }}
                tone="thrust"
                onChange={(v) => patchBurn(b.key, { amount: v })}
              />
              <DragBar
                stacked
                label="Throttle"
                value={Math.round(b.throttle * 100)}
                min={5}
                max={100}
                step={5}
                text={`${Math.round(b.throttle * 100)}%`}
                typed={{ unit: '%', step: 5 }}
                tone="thrust"
                onChange={(v) =>
                  patchBurn(b.key, { throttle: Math.min(1, Math.max(0.05, v / 100)) })
                }
              />
              <TurnLine readiness={readinessOf(b)} />
              {/* Removing comes after editing, in the order the keyboard meets them. */}
              <Actions>
                <Button onClick={() => removeBurn(b.key)}>REMOVE BURN {i + 1}</Button>
              </Actions>
            </div>
          ))}
          {planned > 0 ? (
            <LevelBar
              label="To spend"
              value={planned}
              max={Math.max(budget.deltaV, planned) * 1.1}
              text={`${fixed(planned, 1)} of ${fixed(budget.deltaV, 1)} m/s`}
              status={planned > budget.deltaV ? 'caution' : 'nominal'}
              marks={[{ at: budget.deltaV, kind: 'warning', label: 'above the reserve' }]}
            />
          ) : null}
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

        <Panel title="Camera" aside={`${points.length} pointings planned`}>
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
          <Actions>
            <Button onClick={addPoint} disabled={ended} mark="add-point">
              + POINTING
            </Button>
          </Actions>
          <Caption>point it now</Caption>
          <Actions>
            {targets.slice(0, 6).map((target) => (
              <Button
                key={target.value}
                disabled={ended}
                onClick={() =>
                  game.command({ kind: 'point', sensor: 'camera', target: target.value })
                }
              >
                {target.label}
              </Button>
            ))}
          </Actions>
          <p className="cs-note">
            tracking a rock measures the pull at distances the ship has not flown
          </p>
        </Panel>

        <details className="cp-fold">
          <summary>procedures · {procedures.length} saved · recall</summary>
          <div className="cp-fold__body">
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
              <Button
                tone="blackbox"
                onClick={() => (ended ? game.restart() : game.recall())}
                title="End this attempt and begin again at arrival. Black Box and the model keep what they have."
              >
                {ended ? 'BEGIN AGAIN' : 'RECALL'}
              </Button>
            </Actions>
            <p className="cs-note">
              recall starts attempt {status.attemptIndex + 1} at arrival; Black Box and the model
              keep their records
            </p>
          </div>
        </details>
      </div>

      <div className="cp-hero">
        <div className="cp-tools">
          <ModeChips
            label="What the chart holds"
            options={FRAMINGS}
            value={framing}
            onChange={(v) => desk.setChartFraming(v as ChartFraming)}
          />
          <p className="cp-legend">
            <span data-key="forecast">forecast</span>
            <span data-key="envelope">2σ</span>
            <span data-key="beyond">beyond the data</span>
            <span data-key="measured">pull measured</span>
            <span data-key="trail">flown</span>
            {regions.length ? <span data-key="objective">objective</span> : null}
          </p>
        </div>
        {reading && here ? (
          <>
            <TrajectoryChart
              label={`${game.briefing.name}: the plan as the model forecasts it`}
              bodies={reading.bodiesAt(t)}
              bands={evidenceBands(model)}
              regions={regions}
              forecast={reading.path}
              {...(earlier ? { earlier } : {})}
              trail={chartPath(snapshot.trail)}
              marks={marks}
              cursor={{ x: here.x, y: here.y, heading: here.heading, ellipse: here.ellipse }}
              {...(framing === 'follow'
                ? { follow: followRange(here, radii) || 1 }
                : framing === 'plan' && fit
                  ? { fit }
                  : whole
                    ? { fit: whole }
                    : {})}
              onPick={(time) => desk.setChartT(time)}
            />
            <StepBar
              steps={reading.steps}
              t={t}
              onTime={(time) => desk.setChartT(time)}
              spans={reading.spans}
              format={forecastClock}
            />
          </>
        ) : (
          <div className="cp-empty">
            <p>{desk.previewBusy ? 'Forecasting the plan' : 'No forecast yet'}</p>
            <p className="cs-note">
              {desk.stalePreview
                ? 'the plan changed: its forecast is on its way'
                : 'add a burn, or commit: the forecast of the plan is drawn here'}
            </p>
          </div>
        )}
        {/* Under the forecast it commits to, and always in view however long the plan is. */}
        <div className="cp-commit">
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
          <Line label="scheduled" status={status.planId ? 'nominal' : undefined}>
            {status.committing
              ? 'committing: the forecast is on its way'
              : status.planId
                ? `${status.planId} · ${status.pending} commands pending`
                : 'no plan scheduled'}
          </Line>
        </div>
      </div>

      <div className="cp-side">
        {reading && here ? (
          <Panel
            title="At this step"
            tone="forecast"
            aside={forecastClock(t)}
            status={here.extrapolating && !here.validated ? 'caution' : 'nominal'}
            statusLine={
              here.extrapolating && !here.validated
                ? '▲ here the model is beyond its data'
                : here.validated
                  ? 'here the model stands on a tested rule'
                  : 'here the model stands on its data'
            }
          >
            {here.ranges.map((r) => (
              <LevelBar
                key={r.id}
                label={`${r.name} clearance`}
                value={Math.max(0, r.clearance)}
                max={Math.max(r.clearance * 1.5, desk.design.clearance * 4, 1)}
                text={
                  r.sigma === null ? dist(r.clearance) : `${dist(r.clearance)} ±${dist(r.sigma)}`
                }
                tone="forecast"
                status={
                  r.clearance - 2 * (r.sigma ?? 0) < desk.design.clearance ? 'caution' : 'nominal'
                }
                marks={[{ at: desk.design.clearance, kind: 'warning', label: 'planned clearance' }]}
              />
            ))}
            <ReadoutGrid columns={2}>
              <Readout label="Speed" value={fixed(here.speed, 1)} unit="m/s" tone="forecast" />
              <Readout
                label="Position"
                value={`±${dist(Math.max(here.ellipse.a, here.ellipse.b))}`}
                tone="forecast"
              />
            </ReadoutGrid>
            {reading.sigma.length ? (
              <UncertaintyPanel series={reading.sigma} t={t} format={dist} />
            ) : null}
          </Panel>
        ) : null}

        <Panel
          title="What the forecast says"
          tone="forecast"
          aside={desk.preview ? 'draft' : shown ? 'issued' : 'none'}
          status={reading?.endsBeyondData ? 'caution' : undefined}
          statusLine={
            reading
              ? reading.endsBeyondData
                ? `▲ it ends ${forecastClock(reading.endsAt)}: beyond the data`
                : `it runs to ${forecastClock(reading.endsAt)}`
              : undefined
          }
        >
          {shown && last ? (
            <>
              <ReadoutGrid columns={3}>
                <Readout
                  label="Looks ahead"
                  value={duration(last.t - shown.issuedAt)}
                  tone="forecast"
                />
                <Readout label="Model" value={`v${shown.modelVersion}`} tone="forecast" />
                <Readout
                  label="Beyond data"
                  value={`${Math.round((extrapolating / Math.max(1, shown.samples.length)) * 100)}%`}
                  tone="forecast"
                  status={extrapolating > 0 ? 'caution' : 'nominal'}
                />
              </ReadoutGrid>
              {shown.closestApproaches.slice(0, 5).map((c) => (
                <Line key={`${c.id}-${c.t}`} label={`${name(c.id)} closest`} tone="forecast">
                  {dist(c.distance)} ±{dist(c.sigma)} · T+{clock(c.t)}
                </Line>
              ))}
              {reaches.length || leaving ? <Caption>against the objective</Caption> : null}
              {reaches.map((r) => (
                <Line
                  key={r.id}
                  label={r.label.toLowerCase()}
                  tone="forecast"
                  status={r.reached ? 'nominal' : 'caution'}
                >
                  {r.reached
                    ? `reached T+${clock(r.t)}`
                    : `comes within ${dist(r.edge)} · T+${clock(r.t)}`}
                </Line>
              ))}
              {leaving ? (
                <>
                  <LevelBar
                    label="Speed out at its end"
                    value={leaving.speed}
                    max={Math.max(leaving.minSpeed * 2.5, leaving.speed * 1.15)}
                    text={
                      `${fixed(leaving.speed, 1)} of ${fixed(leaving.minSpeed, 0)} m/s` +
                      (leaving.outward <= 0 ? ' · inward' : '')
                    }
                    tone="forecast"
                    status={
                      leaving.outward <= 0 || leaving.speed < leaving.minSpeed
                        ? 'caution'
                        : 'nominal'
                    }
                    marks={[{ at: leaving.minSpeed, kind: 'target', label: 'needed' }]}
                  />
                  <LevelBar
                    label="Distance out at its end"
                    value={leaving.distance}
                    max={leaving.beyond * 1.1}
                    text={`${dist(leaving.distance)} of ${dist(leaving.beyond)}`}
                    tone="forecast"
                    marks={[{ at: leaving.beyond, kind: 'target', label: 'the gate' }]}
                  />
                </>
              ) : null}
              {detail ? (
                <details className="cs-details">
                  <summary>what it stands on</summary>
                  {endSigma ? (
                    <>
                      <Caption>envelope at its end · 1σ, longest axis</Caption>
                      {SOURCES.map(([key, label]) => {
                        const value = endSigma[key];
                        // A source the forecast does not report is left out, not drawn as zero.
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
                    </>
                  ) : null}
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
                  {detail.asteroids.length ? (
                    <Line label="rocks" tone="forecast">
                      {detail.asteroids.filter((a) => a.forecast).length} forecast
                      {detail.asteroids.some((a) => !a.forecast)
                        ? ` · ${detail.asteroids.filter((a) => !a.forecast).length} with too short a track`
                        : ''}
                    </Line>
                  ) : null}
                </details>
              ) : null}
              {detail?.stale ? (
                <p className="cs-note">
                  ▲ nothing tracked lately: carried from an older present state; point the camera at
                  a body to refresh it
                </p>
              ) : null}
            </>
          ) : (
            <p className="cs-note">no forecast yet: it follows the plan as you make it</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
