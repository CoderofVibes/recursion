/**
 * Stepping through the prediction, beside the MAP's region view (the owner, 2026-11-15): the
 * predictive model's forecast of the player's own plan, walked a step at a time. The hologram
 * shows where the forecast puts the ship at each step, with the envelope's section there, and
 * can follow it; this panel names the steps, says how close each body is then and how sure the
 * model is, and what the uncertainty is made of, so the player sees what more data would buy.
 *
 * The model forecasts and the player plans (P6): the steps are the plan's own burns and the
 * passes the forecast predicts, never a suggestion. Where the model is beyond its data the
 * steps stop, and the panel says so (P10).
 */
import { useEffect, useMemo, useRef } from 'react';
import { LevelBar, Panel, Readout, ReadoutGrid } from '../theme/components/index.ts';
import { motion } from '../theme/index.ts';
import { Actions, Button } from './controls.tsx';
import type { Desk } from './desk.ts';
import { forecastClock, readForecast } from './forecastReading.ts';
import type { ShipAt } from './forecastReading.ts';
import { dist, fixed } from './format.ts';
import { BODY_IN_VOLUME } from '../view3d/flight/FlightHolo.ts';
import { StepBar } from './instruments/StepBar.tsx';
import { UncertaintyPanel } from './instruments/UncertaintyPanel.tsx';

/**
 * On a flat chart, how much of the nearest body's radius the view reaches into it when it
 * follows the ship, and the room left around that. The chart cuts a body off at its edge, so
 * half a radius shows its near side large.
 */
export const FOLLOW_INTO_BODY = 0.5;
export const FOLLOW_MARGIN = 1.15;
/**
 * In the hologram a body is drawn only while its centre and a part of its radius beyond are
 * inside the volume (`BODY_IN_VOLUME`); farther out it is only a mark on the rim. So there the
 * view reaches just that far and little more: the body is drawn, as large as it can be.
 */
export const HOLO_INTO_BODY = 1 + BODY_IN_VOLUME;
export const HOLO_MARGIN = 1.05;

/**
 * The range that frames a step when the view follows the ship: out to the nearest body's
 * surface and `into` of its radius beyond, with a margin, so the body is large beside the ship
 * (the owner: the planet should be big on the screen; part of it will do).
 */
export function followRange(
  ship: Pick<ShipAt, 'ranges'>,
  radii: ReadonlyMap<string, number>,
  into = FOLLOW_INTO_BODY,
  margin = FOLLOW_MARGIN,
): number {
  let nearest = Infinity;
  for (const r of ship.ranges)
    nearest = Math.min(nearest, Math.max(r.clearance, 0) + into * (radii.get(r.id) ?? 0));
  return Number.isFinite(nearest) ? Math.max(nearest, 1) * margin : 0;
}

/** The range that holds a whole forecast from where the ship is now. */
export function wholeRange(path: readonly { readonly x: number; readonly y: number }[]): number {
  const first = path[0];
  if (!first) return 0;
  let far = 0;
  for (const p of path) far = Math.max(far, Math.hypot(p.x - first.x, p.y - first.y));
  return far * 1.15;
}

/** How long the view takes to glide from one step to the next, ms (the theme's camera move). */
const GLIDE = motion.camera * 2;

export interface RehearsalPanelProps {
  readonly desk: Desk;
  /** Move at once between steps instead of gliding (reduced motion). */
  readonly still?: boolean;
  /** The region view's range now, metres: where a glide starts from. */
  readonly range?: () => number;
  /** Set the region view's range, metres (the view follows the ship through the steps). */
  readonly onRange?: (metres: number) => void;
  /** Go to where the plan is edited. */
  readonly onPlan?: () => void;
}

export function RehearsalPanel({ desk, still, range, onRange, onPlan }: RehearsalPanelProps) {
  // A glide in hand: stepping again, stopping, or leaving the view ends it where it is.
  const glide = useRef(0);
  useEffect(() => () => cancelAnimationFrame(glide.current), []);
  const snapshot = desk.snapshot();
  const bodies = snapshot.world.bodies;
  // The plan as previewed, or failing that the forecast last issued.
  const forecast = desk.preview ?? snapshot.forecasts.at(-1);
  const draft = desk.preview !== undefined;
  const bodyKey = bodies.map((b) => `${b.id}:${b.radius}`).join('|');
  const reading = useMemo(
    () => (forecast && forecast.samples.length > 1 ? readForecast(forecast, bodies) : undefined),
    // The believed bodies are rebuilt every frame; their ids and sizes are what matter here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [forecast, bodyKey],
  );
  const radii = useMemo(() => new Map(bodies.map((b) => [b.id, b.radius])), [bodyKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!reading)
    return (
      <Panel title="Predictive model" tone="forecast" aside="no forecast">
        <p className="cs-note">
          nothing to step through yet: plan a burn and preview it, or commit a plan
        </p>
        {onPlan ? (
          <Actions>
            <Button tone="forecast" primary onClick={onPlan}>
              OPEN PLAN
            </Button>
          </Actions>
        ) : null}
      </Panel>
    );

  const stepping = desk.rehearsal;
  const follow = stepping?.follow ?? true;
  const t = Math.min(reading.endsAt, Math.max(reading.issuedAt, stepping?.t ?? reading.issuedAt));
  /**
   * Step to a moment. The view glides there: the ship travels the forecast between the two
   * steps and the range eases with it, so the eye follows the plan through the encounter.
   * With reduced motion, or for the scrubber's own small moves, it is there at once.
   */
  const go = (time: number, following = follow, glideThere = false): void => {
    cancelAnimationFrame(glide.current);
    const wanted = following
      ? followRange(reading.shipAt(time), radii, HOLO_INTO_BODY, HOLO_MARGIN)
      : wholeRange(reading.path);
    const from = desk.rehearsal?.t;
    const rangeFrom = range?.();
    if (!glideThere || still || from === undefined || rangeFrom === undefined || !(wanted > 0)) {
      desk.setRehearsal({ t: time, follow: following });
      if (wanted > 0) onRange?.(wanted);
      return;
    }
    const started = performance.now();
    const frame = (now: number): void => {
      const k = Math.min(1, (now - started) / GLIDE);
      // Ease in and out: the ship leaves a step gently and settles on the next.
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      desk.setRehearsal({ t: from + (time - from) * e, follow: following });
      onRange?.(rangeFrom + (wanted - rangeFrom) * e);
      if (k < 1) glide.current = requestAnimationFrame(frame);
    };
    glide.current = requestAnimationFrame(frame);
  };
  const stop = (): void => {
    cancelAnimationFrame(glide.current);
    desk.setRehearsal(undefined);
  };
  const aside = `${draft ? 'draft' : 'issued'} · model v${reading.modelVersion}`;

  if (!stepping)
    return (
      <Panel
        title="Predictive model"
        tone="forecast"
        aside={aside}
        status={reading.endsBeyondData ? 'caution' : 'nominal'}
        statusLine={
          reading.endsBeyondData
            ? `▲ the forecast ends ${forecastClock(reading.endsAt)}: beyond the data`
            : `the forecast runs to ${forecastClock(reading.endsAt)}`
        }
      >
        <p className="cs-note">
          walk the plan as the model forecasts it: each burn, each pass, and where the model stops
        </p>
        <Actions>
          <Button tone="forecast" primary onClick={() => go(reading.issuedAt)}>
            STEP THROUGH THE FORECAST ▸
          </Button>
        </Actions>
      </Panel>
    );

  const ship = reading.shipAt(t);
  const clearance = desk.design.clearance;
  return (
    <Panel
      title="Predictive model"
      tone="forecast"
      aside={aside}
      status={ship.extrapolating && !ship.validated ? 'caution' : 'nominal'}
      statusLine={
        ship.extrapolating && !ship.validated
          ? '▲ here the model is beyond its data'
          : ship.validated
            ? 'here the model stands on a tested rule'
            : 'here the model stands on its data'
      }
    >
      <StepBar
        steps={reading.steps}
        t={t}
        onTime={(time, stepped) => go(time, follow, stepped)}
        spans={reading.spans}
        format={forecastClock}
      />
      <div className="mp-framing" role="group" aria-label="What the view holds">
        <button
          type="button"
          className="rx-chip"
          data-on={follow ? '' : undefined}
          aria-pressed={follow}
          onClick={() => go(t, true, true)}
        >
          Follow the ship
        </button>
        <button
          type="button"
          className="rx-chip"
          data-on={follow ? undefined : ''}
          aria-pressed={!follow}
          onClick={() => go(t, false, true)}
        >
          Stay on the ship now
        </button>
      </div>
      {ship.ranges.map((r) => (
        <LevelBar
          key={r.id}
          label={`${r.name} clearance`}
          value={Math.max(0, r.clearance)}
          max={Math.max(r.clearance * 1.5, clearance * 4, 1)}
          text={r.sigma === null ? dist(r.clearance) : `${dist(r.clearance)} ±${dist(r.sigma)}`}
          tone="forecast"
          status={r.clearance - 2 * (r.sigma ?? 0) < clearance ? 'caution' : 'nominal'}
          marks={[{ at: clearance, kind: 'warning', label: 'planned clearance' }]}
        />
      ))}
      <ReadoutGrid columns={2}>
        <Readout label="Speed" value={fixed(ship.speed, 1)} unit="m/s" tone="forecast" />
        <Readout
          label="Position"
          value={`±${dist(Math.max(ship.ellipse.a, ship.ellipse.b))}`}
          tone="forecast"
        />
      </ReadoutGrid>
      {reading.sigma.length ? (
        <UncertaintyPanel series={reading.sigma} t={t} format={dist} />
      ) : null}
      <Actions>
        <Button onClick={stop}>STOP STEPPING</Button>
        {onPlan ? (
          <Button tone="forecast" onClick={onPlan}>
            OPEN PLAN
          </Button>
        ) : null}
      </Actions>
    </Panel>
  );
}
