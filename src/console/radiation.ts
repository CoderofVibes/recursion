/**
 * The radiation monitor (A24): the dose rate where the monitor sits, as the ship measured it,
 * with its noise, response time and saturation, and its caution. One instrument's reading,
 * never a component's dose (P11).
 *
 * The reading reaches the console as `status().radiation` (requested of 2F and 3C, R37): 3C's
 * `RadiationDoseRateReading` and the hazard threshold. Until that lands it is read by shape, as
 * the window channel is, so a missing or malformed reading shows as no reading, never as zero.
 * Rates are in the game's fictional exposure unit U (a dose in U·s, per second), not grays.
 */
import type { Status } from '../theme/components/index.ts';
import { duration, fixed, name } from './format.ts';

export interface DoseRate {
  /** The equipment the monitor is in. */
  readonly source: string;
  /** When it was read, ship time. */
  readonly t: number;
  readonly rate: number;
  /** One-sigma readout noise (not a bound on lag or a missed peak). */
  readonly sigma: number;
  /** Over range: `rate` is a lower limit, never a peak. */
  readonly saturated: boolean;
  readonly saturationRate: number;
  /** The reading stands until then; after it the monitor has said nothing new. */
  readonly validUntil: number;
  /** Above this the caution is raised. */
  readonly threshold?: number;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The monitor's latest reading from the session's status, if it carries a well-formed one. */
export function doseRate(status: unknown): DoseRate | undefined {
  const raw = (status as { readonly radiation?: unknown } | null | undefined)?.radiation;
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Readonly<Record<string, unknown>>;
  const { source, t, rate, sigma, saturated, saturationRate, validUntil, threshold } = r;
  if (
    typeof source !== 'string' ||
    !finite(t) ||
    !finite(rate) ||
    rate < 0 ||
    !finite(sigma) ||
    sigma < 0 ||
    typeof saturated !== 'boolean' ||
    !finite(saturationRate) ||
    !finite(validUntil) ||
    validUntil < t
  )
    return undefined;
  return {
    source,
    t,
    rate,
    sigma,
    saturated,
    saturationRate,
    validUntil,
    ...(finite(threshold) && threshold > 0 ? { threshold } : {}),
  };
}

/** A dose rate as the panels print it: four decimals below 1 U, two above. */
export const rateText = (rate: number): string => fixed(rate, rate < 1 ? 4 : 2);

export interface DoseRateView {
  readonly value: string;
  readonly status: Status;
  /** What the reading is: its age, or that it is over range, or that there is none. */
  readonly note: string;
}

/**
 * How SYSTEMS shows the reading at ship time `now`. `caution` is whether the session's caution
 * stands: it clears only on a fresh low reading, so the panel follows it rather than judging
 * the number itself.
 */
export function doseRateView(
  reading: DoseRate | undefined,
  now: number,
  caution: boolean,
): DoseRateView {
  if (!reading) return { value: '—', status: caution ? 'caution' : 'stale', note: 'no reading' };
  const age = `read ${duration(now - reading.t)} ago`;
  if (now > reading.validUntil)
    return {
      value: rateText(reading.rate),
      status: caution ? 'caution' : 'stale',
      note: `no new reading: last ${age} by ${name(reading.source)}`,
    };
  if (reading.saturated)
    return {
      value: `≥ ${rateText(reading.saturationRate)}`,
      status: 'caution',
      note: 'over range: the rate is at least this',
    };
  return {
    value: `${rateText(reading.rate)} ± ${rateText(reading.sigma)}`,
    status: caution ? 'caution' : 'nominal',
    note: age,
  };
}
