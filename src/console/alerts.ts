/**
 * The flight alerts: what the instruments warn about, most serious first in the alert stack.
 * One list, read by the flight view's alert stack and by the frame loop, which drops the warp
 * to 1× when a new one appears (DECISIONS A12).
 *
 * Alerts come from belief only: the issued forecast's closest approaches, the miss from that
 * forecast, the gauged reserve, the model's own faults (P11).
 */
import type { AlertItem } from '../theme/components/index.ts';
import { stores } from './data.ts';
import type { Desk } from './desk.ts';
import { clock, dist, fixed, whole } from './format.ts';

/** Off the forecast: the ship is this many sigma from where the forecast put it now. */
const MISS_SIGMAS = 3;

export function flightAlerts(desk: Desk): AlertItem[] {
  const { game } = desk;
  const status = game.status();
  const snapshot = desk.snapshot();
  const items: AlertItem[] = [];
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
