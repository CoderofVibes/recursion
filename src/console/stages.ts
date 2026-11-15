/**
 * The console's spine: the loop itself, a stage at a time, each with one line saying where it
 * stands (A26: a judge reads it left to right and knows what has been done and what comes
 * next). Explore, set the ship up, plan and predict, fly, compare what happened with what was
 * forecast, learn from it. Five are the console's own pages; FLIGHT is the hologram's view.
 *
 * `stagesOf` is pure: plain facts in, the six stages out. `deskStages` gathers the facts from
 * the game as the ship believes it (P11).
 */
import type { AttemptRecord } from '../contracts/index.ts';
import { forecastDivergence } from '../blackbox/index.ts';
import type { Desk, DraftState, PageId } from './desk.ts';
import { clock, dist, fixed, whole } from './format.ts';
import type { Stage } from './instruments/LoopRail.tsx';
import { powerBudget } from './power.ts';

/** A stage of the loop: a console page, or the FLIGHT view. */
export type StageId = Exclude<PageId, 'credits'> | 'flight';

export const STAGE_LABEL: Readonly<Record<StageId, string>> = {
  exploration: 'EXPLORATION',
  systems: 'SYSTEMS',
  plan: 'PLAN',
  flight: 'FLIGHT',
  blackbox: 'BLACK BOX',
  model: 'MODEL',
};

/** The loop's order. */
export const STAGE_ORDER: readonly StageId[] = [
  'exploration',
  'systems',
  'plan',
  'flight',
  'blackbox',
  'model',
];

export interface StageFacts {
  readonly region: string;
  /** The objective in a few words. */
  readonly objective: string;
  /** Demand as set, W, and the reactants' endurance at it, s. */
  readonly power: { readonly demand: number; readonly endurance?: number };
  /** An alert from the ship's own gauges stands (power, critical service, radiation). */
  readonly shipAlert?: string;
  /** The forecast in force has run out while the flight goes on: nothing is predicted now. */
  readonly forecastEnded?: boolean;
  readonly draft: DraftState;
  /** The forecast on show: the draft's preview, or the one last issued. */
  readonly forecast?: {
    readonly draft: boolean;
    readonly endsAt: number;
    readonly endsBeyondData: boolean;
    /** The nearest pass it predicts, if it names one. */
    readonly pass?: { readonly name: string; readonly distance: number; readonly sigma: number };
  };
  readonly attempt: {
    readonly index: number;
    readonly phase: 'prepare' | 'operate' | 'ended';
    readonly t: number;
    readonly warp: number;
    readonly outcome: string;
  };
  /** The last attempt with something to compare: where it left its forecast, and by how much. */
  readonly compared?: {
    readonly index: number;
    readonly leftAt: number | null;
    readonly worstSigmas: number;
    readonly lost: boolean;
  };
  readonly model: {
    readonly version: number;
    readonly adopted: number;
    /** Attempts the model holds data from. */
    readonly attempts: number;
    /** The steepest slope of measured pull against the law in force, when the model reports one. */
    readonly slope?: number;
  };
}

/** A slope this far from flat says the law in force does not explain the distances flown. */
const SLOPE_TELLS = 0.1;

export function stagesOf(f: StageFacts): Stage[] {
  const flown = f.attempt.phase !== 'prepare';
  const forecast = f.forecast;
  const plan: Pick<Stage, 'status' | 'state'> = f.forecastEnded
    ? { status: 'the forecast has ended · plan what comes next', state: 'attention' }
    : forecast
      ? forecast.endsBeyondData
        ? {
            status: `ends T+${clock(forecast.endsAt)} · beyond the data`,
            state: 'attention',
          }
        : {
            status: forecast.pass
              ? `${forecast.pass.name} ${dist(forecast.pass.distance)} ±${dist(forecast.pass.sigma)}`
              : `${forecast.draft ? 'draft' : 'issued'} · to T+${clock(forecast.endsAt)}`,
            state: f.draft === 'committed' || !forecast.draft ? 'done' : 'now',
          }
      : f.draft === 'empty'
        ? { status: 'nothing planned · the ship coasts', state: 'todo' }
        : { status: 'draft · not previewed', state: 'now' };
  const flight: Pick<Stage, 'status' | 'state'> =
    f.attempt.phase === 'prepare'
      ? { status: `attempt ${f.attempt.index} · at arrival`, state: 'todo' }
      : f.attempt.phase === 'ended'
        ? { status: `attempt ${f.attempt.index} · ${f.attempt.outcome}`, state: 'done' }
        : {
            status: `T+${clock(f.attempt.t)} · ${f.attempt.warp}×`,
            state: 'now',
          };
  const c = f.compared;
  const compare: Pick<Stage, 'status' | 'state'> = !c
    ? { status: 'nothing flown yet', state: 'todo' }
    : c.lost
      ? { status: `attempt ${c.index} · lost`, state: 'attention' }
      : c.leftAt !== null
        ? { status: `attempt ${c.index} · off by ${fixed(c.worstSigmas, 1)}σ`, state: 'attention' }
        : { status: `attempt ${c.index} · within its forecast`, state: 'done' };
  const m = f.model;
  const model: Pick<Stage, 'status' | 'state'> =
    m.adopted > 0
      ? {
          status: `${m.adopted === 1 ? 'law' : `${m.adopted} rules`} adopted · model v${m.version}`,
          state: 'done',
        }
      : m.slope !== undefined && Math.abs(m.slope) > SLOPE_TELLS
        ? { status: `slope ${fixed(m.slope, 2)} · the law does not fit`, state: 'attention' }
        : m.attempts > 0
          ? {
              status: `model v${m.version} · ${m.attempts} attempt${m.attempts === 1 ? '' : 's'}`,
              state: 'done',
            }
          : { status: 'nothing measured yet', state: 'todo' };
  return [
    {
      id: 'exploration',
      label: STAGE_LABEL.exploration,
      status: `${f.region} · ${f.objective}`,
      state: flown ? 'done' : 'now',
    },
    {
      id: 'systems',
      label: STAGE_LABEL.systems,
      status:
        f.shipAlert ??
        `${whole(f.power.demand)} W` +
          (f.power.endurance !== undefined
            ? ` · ${fixed(f.power.endurance / 3600, 0)} h endurance`
            : ''),
      state: f.shipAlert ? 'attention' : 'done',
    },
    { id: 'plan', label: STAGE_LABEL.plan, tone: 'forecast', ...plan },
    { id: 'flight', label: STAGE_LABEL.flight, ...flight },
    { id: 'blackbox', label: STAGE_LABEL.blackbox, tone: 'blackbox', ...compare },
    { id: 'model', label: STAGE_LABEL.model, tone: 'forecast', ...model },
  ];
}

/** Where a finished or running attempt left its forecasts: kept per record as it stood. */
const verdicts = new Map<string, { key: string; leftAt: number | null; worstSigmas: number }>();

/** Where an attempt's flight left its forecasts, and the worst it was off by, from its record. */
export function attemptVerdict(record: AttemptRecord): {
  leftAt: number | null;
  worstSigmas: number;
} {
  const key = `${record.measurements.length}|${record.forecasts.length}|${record.outcome.kind}`;
  const kept = verdicts.get(record.id);
  if (kept && kept.key === key) return kept;
  let leftAt: number | null = null;
  let worstSigmas = 0;
  for (const f of record.forecasts) {
    const d = forecastDivergence(f, record);
    if (d.firstBeyond3Sigma !== null && (leftAt === null || d.firstBeyond3Sigma < leftAt))
      leftAt = d.firstBeyond3Sigma;
    worstSigmas = Math.max(worstSigmas, d.maxSigmas ?? 0);
  }
  const verdict = { key, leftAt, worstSigmas };
  verdicts.set(record.id, verdict);
  return verdict;
}

/**
 * The attempt in hand, once it is worth reading: entered, with a forecast to be judged against.
 * Before that the last attempt flown is the one to read.
 */
export function attemptInHand(
  attempts: readonly AttemptRecord[],
  status: { readonly phase: string; readonly attemptId: string },
): AttemptRecord | undefined {
  const current = attempts.find((a) => a.id === status.attemptId);
  return status.phase !== 'prepare' && current && current.forecasts.length ? current : undefined;
}

/** The stages as the game stands, for the console's rail. */
export function deskStages(desk: Desk): Stage[] {
  const { game } = desk;
  const status = game.status();
  const snapshot = desk.snapshot();
  const model = game.model.state();
  const budget = powerBudget(
    snapshot.world.ship,
    game.ship,
    desk.pendingSettings(),
    desk.recorderRate(),
  );
  const shown = desk.preview ?? snapshot.forecasts.at(-1);
  const last = shown?.samples.at(-1);
  const name = (id: string): string => snapshot.world.bodies.find((b) => b.id === id)?.name ?? id;
  // The nearest pass the forecast names before its end (its last sample is where it stops).
  const pass = shown?.closestApproaches
    .filter((c) => last !== undefined && c.t < last.t - 1e-6)
    .reduce<(typeof shown.closestApproaches)[number] | undefined>(
      (best, c) => (!best || c.distance < best.distance ? c : best),
      undefined,
    );
  const end = shown?.closestApproaches.find((c) => last !== undefined && c.t >= last.t - 1e-6);
  const near = pass ?? end;
  // The attempt to compare: the one in hand once it has flown, else the last finished.
  const archive = desk.archive();
  const finished = archive.attempts.filter((a) => a.outcome.kind !== 'in-progress');
  const record = attemptInHand(archive.attempts, status) ?? finished.at(-1);
  const alerts = status.alerts as readonly { readonly id?: string }[];
  const forecastEnded = alerts.some((a) => a.id === 'forecast-ended');
  const alert = alerts.find((a) => a.id !== undefined && a.id !== 'forecast-ended');
  const slopes = (desk.report?.strength ?? [])
    .map((s) => s.slope)
    .filter((s): s is number => s !== null);
  return stagesOf({
    region: game.briefing.name,
    objective: snapshot.objectives[0]?.label.toLowerCase() ?? 'no objective',
    power: {
      demand: budget.demand,
      ...(budget.endurance !== undefined ? { endurance: budget.endurance } : {}),
    },
    ...(alert?.id ? { shipAlert: `▲ ${alert.id.replace(/-/g, ' ')}` } : {}),
    ...(forecastEnded && status.phase === 'operate' && desk.preview === undefined
      ? { forecastEnded: true }
      : {}),
    draft: desk.draftState(),
    ...(shown && last
      ? {
          forecast: {
            draft: desk.preview !== undefined,
            endsAt: last.t,
            endsBeyondData: last.extrapolating && last.validated !== true,
            ...(near
              ? { pass: { name: name(near.id), distance: near.distance, sigma: near.sigma } }
              : {}),
          },
        }
      : {}),
    attempt: {
      index: status.attemptIndex,
      phase: status.phase,
      t: status.t,
      warp: status.warp,
      outcome: status.outcome.kind,
    },
    ...(record
      ? {
          compared: {
            index: record.index,
            ...attemptVerdict(record),
            lost: record.outcome.kind === 'lost',
          },
        }
      : {}),
    model: {
      version: model.version,
      adopted: model.extensions.filter((e) => e.status === 'adopted').length,
      attempts: model.basedOn.attempts.length,
      ...(slopes.length
        ? { slope: slopes.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a)) }
        : {}),
    },
  });
}
