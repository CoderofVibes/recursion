/**
 * The flight alerts: what the instruments warn about, most serious first in the alert stack.
 * One list, read by the flight view's alert stack and by the frame loop, which drops the warp
 * to 1× when a new one appears (DECISIONS A12).
 *
 * Alerts come from belief only: the session's own (power gauges, radiation monitor), the issued
 * forecast's closest approaches, the miss from that forecast, the gauged reserve, the model's
 * own faults (P11).
 */
import type { Sighting } from '../game/belief/controls.ts';
import type { AlertItem, AlertLevel } from '../theme/components/index.ts';
import { stores } from './data.ts';
import type { Desk } from './desk.ts';
import { clock, dist, duration, fixed, name, whole } from './format.ts';
import { rateText } from './radiation.ts';

/** Off the forecast: the ship is this many sigma from where the forecast put it now. */
const MISS_SIGMAS = 3;

/**
 * The session's own alerts (`status().alerts`): the power gauges' (A18 (5)) and the radiation
 * monitor's (A24). The session drops warp itself when one is new; the screens show them like
 * any other. Read by shape, so a kind the session adds later still shows, by its id.
 */
export function raisedAlerts(alerts: readonly object[], t: number): AlertItem[] {
  return alerts.map((alert) => {
    const a = alert as Readonly<Record<string, unknown>>;
    const kind = String(a.id);
    const id = `game-${kind}`;
    const level: AlertLevel =
      a.level === 'warning' ? 'warning' : a.level === 'advisory' ? 'advisory' : 'caution';
    const num = (key: string): number | undefined => {
      const v = a[key];
      return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
    };
    const left = num('timeToEmpty');
    switch (kind) {
      case 'power-low':
        return {
          id,
          level,
          text: 'Power low',
          ...(left !== undefined ? { detail: `${duration(left)} without generation` } : {}),
        };
      case 'power-reserve':
        return {
          id,
          level,
          text: 'On battery reserve',
          ...(left !== undefined ? { detail: `${duration(left)} left` } : {}),
        };
      case 'critical-service': {
        const functions = Array.isArray(a.functions) ? a.functions.map(String).map(name) : [];
        const deadline = num('deadline');
        const parts = [
          ...(functions.length ? [functions.join(', ')] : []),
          ...(deadline !== undefined ? [`lost in ${clock(deadline - t)}`] : []),
        ];
        return {
          id,
          level,
          text: 'Critical power short',
          ...(parts.length ? { detail: parts.join(' · ') } : {}),
        };
      }
      case 'radiation-high': {
        const rate = num('rate');
        const threshold = num('threshold');
        const reading =
          rate === undefined ? '' : `${a.saturated === true ? '≥ ' : ''}${rateText(rate)} U`;
        const limit = threshold === undefined ? '' : `above ${rateText(threshold)} U`;
        const detail = [reading, limit].filter(Boolean).join(' · ');
        return { id, level, text: 'Radiation high', ...(detail ? { detail } : {}) };
      }
      default: {
        const words = name(kind);
        return { id, level, text: words.charAt(0).toUpperCase() + words.slice(1) };
      }
    }
  });
}

/**
 * What the eye has seen that the session calls out (`status().sightings`, A19): a well's
 * precursor, until what it announces is due. The session drops warp on a new one.
 */
export function sightingAlerts(sightings: readonly Sighting[], t: number): AlertItem[] {
  // A field of wells announces hundreds at once: those of one kind due together are one line
  // with a count, not a stack of the same line.
  const groups = new Map<string, Sighting[]>();
  for (const s of sightings) {
    const key = `${s.kind}|${s.until ?? ''}`;
    const group = groups.get(key);
    if (group) group.push(s);
    else groups.set(key, [s]);
  }
  return [...groups.values()].map((group): AlertItem => {
    const s = group[0]!;
    const n = group.length;
    const due = s.until === undefined ? '' : `due in ${clock(s.until - t)}`;
    const words = name(s.kind);
    return {
      // One sighting keeps its own id; a group's id changes when it grows, so it counts as new.
      id: n === 1 ? `sighting-${s.field}` : `sighting-${s.kind}-${s.until ?? 'open'}-${n}`,
      level: 'caution',
      text:
        s.kind === 'precursor'
          ? n === 1
            ? 'Precursor in the window'
            : `${n} precursors in the window`
          : n === 1
            ? `Seen: ${words}`
            : `Seen: ${n} × ${words}`,
      ...(due ? { detail: due } : {}),
    };
  });
}

/** The session's own alerts and sightings, as the alert stack shows them. */
export function sessionAlerts(status: {
  readonly alerts: readonly object[];
  readonly sightings?: readonly Sighting[];
  readonly t: number;
}): AlertItem[] {
  return [
    ...raisedAlerts(status.alerts, status.t),
    ...sightingAlerts(status.sightings ?? [], status.t),
  ];
}

/**
 * What the session raised between two of its statuses (an alert, or a sighting): the reason
 * when the session dropped warp itself. Only one new at this level counts (as `freshAlerts`).
 */
export function newlyRaised(
  before: Parameters<typeof sessionAlerts>[0],
  after: Parameters<typeof sessionAlerts>[0],
): AlertItem | undefined {
  const key = (a: AlertItem): string => `${a.id}:${a.level}`;
  const seen = new Set(sessionAlerts(before).map(key));
  return sessionAlerts(after).find((a) => a.level !== 'advisory' && !seen.has(key(a)));
}

export function flightAlerts(desk: Desk): AlertItem[] {
  const { game } = desk;
  const status = game.status();
  const snapshot = desk.snapshot();
  const items: AlertItem[] = sessionAlerts(status);
  const failure = desk.modelError();
  if (failure) items.push({ id: 'model', level: 'caution', text: 'Model fault', detail: failure });
  for (const a of desk.flightAlerts) {
    if (a.level === 'advisory' && !a.body) continue;
    items.push({
      // One alert per object, so a reissued forecast does not raise the same pass again.
      id: `cpa-${a.id}`,
      level: a.level,
      text: `${a.name} closest ${dist(a.distance)} ±${dist(a.sigma)}`,
      detail: `T−${clock(a.t - status.t)}`,
    });
  }
  const miss = desk.flightMiss;
  if (miss && miss.sigmas > MISS_SIGMAS)
    items.push({
      id: 'miss',
      level: 'caution',
      text: 'Off the forecast',
      detail: `${dist(miss.metres)} · ${fixed(miss.sigmas, 1)}σ`,
    });
  const main = stores(snapshot.world.ship, game.ship, desk.design.reserve).find(
    (s) => s.id === 'main-propellant',
  );
  if (main && main.value < desk.design.reserve)
    items.push({
      id: 'reserve',
      level: 'caution',
      text: 'Reserve broken',
      detail: `${whole(main.value)} kg`,
    });
  const end = snapshot.forecasts.at(-1)?.samples.at(-1);
  if (end && end.t < status.t)
    items.push({
      id: 'ended',
      level: 'advisory',
      text: 'Past the forecast horizon',
      detail: `ended T+${clock(end.t)}`,
    });
  return items;
}

/**
 * Which alerts are new since the last look. An alert is new when it was not showing before at
 * this level, so one that worsens from caution to warning is new again. Advisories never count:
 * they carry information, not danger, and a passing horizon must not stop a long coast.
 * [ASSUMED: the owner said "a new alert"; advisories are left out so warp stays usable.]
 */
export function freshAlerts(
  previous: ReadonlySet<string>,
  current: readonly AlertItem[],
): { readonly fresh: readonly AlertItem[]; readonly active: ReadonlySet<string> } {
  const serious = current.filter((a) => a.level !== 'advisory');
  const key = (a: AlertItem): string => `${a.id}:${a.level}`;
  return {
    fresh: serious.filter((a) => !previous.has(key(a))),
    active: new Set(serious.map(key)),
  };
}
