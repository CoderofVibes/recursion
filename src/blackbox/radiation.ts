/**
 * The radiation monitor in the record, and the loss review (DECISIONS A24, A16; ledger R37).
 *
 * A24: the ship carries a real radiation monitor. It measures the dose rate where it sits, with
 * noise, a response time and a saturation limit, and the Black Box records it; it does not
 * measure each component's dose (that stays truth-side, P11). After the lattice's sudden first
 * contact the record then honestly shows a spike before the failures.
 *
 * The monitor's reading is 3C's `radiation.dose-rate.v1` channel (R37, R58), decoded with 3C's
 * own belief-safe decoder: its rate, σ, host and saturation flag. The older forms are still read:
 * the contracts' `lattice-intensity` measurement ([I] in lattice units: the dose rate in U, at
 * the equipment that carries the monitor) and a `telemetry` reading on the channel `dose-rate`.
 * `readDoseRate` is the one place that decides what a reading is.
 *
 * `lossReview` puts what the loss review leads with in one place: the monitor's readings before
 * the loss, the spike's onset and peak and how long before the first failure it came, the first
 * failures in order (`failureOrder`), each piece of equipment's recorded history
 * (`equipmentTimeline`), and the lattice data retained (`latticeRetention`). All from the record.
 */

import type { AttemptOutcome, AttemptRecord, Measurement } from '../contracts/index.ts';
import { decodeRadiationReading } from '../ship/sensors/radiation-observations.ts';
import { RADIATION_MONITOR } from '../ship/sensors/radiation-spec.ts';
import { equipmentTimeline, failureOrder, type EquipmentTimeline } from './condition.ts';
import { latticeRetention, type LatticeRetention } from './lattice.ts';

export interface DoseRateReading {
  readonly t: number;
  /** Dose rate where the monitor sits, U (lattice units per second of dose). */
  readonly rate: number;
  readonly sigma: number;
  readonly source: string;
  /** At or above the monitor's saturation limit: the true rate may be higher. */
  readonly saturated: boolean;
}

export const DOSE_RATE_CHANNEL = 'dose-rate';

/** A radiation-monitor reading, or undefined for any other measurement. */
export function readDoseRate(m: Measurement, saturation = Infinity): DoseRateReading | undefined {
  const r = decodeRadiationReading(m);
  if (r) return { t: r.t, rate: r.rate, sigma: r.sigma, source: r.source, saturated: r.saturated };
  const reading =
    m.kind === 'lattice-intensity' || (m.kind === 'telemetry' && m.channel === DOSE_RATE_CHANNEL);
  const rate = m.value[0];
  if (!reading || rate === undefined || !Number.isFinite(rate) || !Number.isFinite(m.t)) return;
  return {
    t: m.t,
    rate,
    sigma: m.sigma[0] ?? 0,
    source: m.source,
    saturated: rate >= saturation,
  };
}

/** The record's monitor readings up to `now`, in time order. */
export function doseRateReadings(
  rec: Pick<AttemptRecord, 'measurements'>,
  now = Infinity,
  saturation = Infinity,
): DoseRateReading[] {
  const out: DoseRateReading[] = [];
  for (const m of rec.measurements) {
    if (m.t > now) continue;
    const r = readDoseRate(m, saturation);
    if (r) out.push(r);
  }
  return out.sort((a, b) => a.t - b.t);
}

export interface RadiationReview {
  /** Equipment ids the readings came from. */
  readonly monitors: readonly string[];
  /** Readings in the review window, up to the loss. */
  readonly readings: readonly DoseRateReading[];
  readonly peak?: DoseRateReading;
  /**
   * Where the spike started: the first reading at or above `threshold` (the hazard threshold
   * that raises the caution, A24), or, without one, the first reading more than `riseSigmas` of
   * its own σ above the median of the readings before it in the window.
   */
  readonly onset?: {
    readonly t: number;
    readonly rate: number;
    readonly rule: 'threshold' | 'rise';
  };
  /** Seconds from the onset to the first failure or fault (positive: the spike came first). */
  readonly leadBeforeFirstFailure?: number;
  /** The last reading before the loss and how old it was then. */
  readonly last?: DoseRateReading & { readonly age: number };
  /** Why something is absent, in plain words. */
  readonly note?: string;
}

export interface LossReview {
  readonly attemptId: string;
  readonly outcome: AttemptOutcome;
  /** The loss (or end of the attempt, or the last thing recorded). */
  readonly at: number;
  readonly radiation: RadiationReview;
  readonly failures: ReturnType<typeof failureOrder>;
  readonly equipment: readonly EquipmentTimeline[];
  readonly lattice: readonly LatticeRetention[];
}

export interface LossReviewOptions {
  /**
   * The monitor's hazard threshold, U. Absent: 3C's monitor's own (`RADIATION_MONITOR`) when its
   * channel is in the record; otherwise the onset is found as a rise.
   */
  readonly threshold?: number;
  /** The monitor's saturation limit, U. */
  readonly saturation?: number;
  /** Seconds before the loss the review looks at (default 600). */
  readonly window?: number;
  /** A reading this many of its own σ above the earlier median is a rise (default 5). */
  readonly riseSigmas?: number;
  /** The ship's equipment ids, to mark any the record names that the ship does not have. */
  readonly knownEquipment?: readonly string[];
}

function lastRecorded(rec: AttemptRecord): number {
  const last = <T extends { readonly t: number }>(a: readonly T[]) =>
    a.length > 0 ? Math.max(...a.map((x) => x.t)) : -Infinity;
  return Math.max(last(rec.measurements), last(rec.events), last(rec.executed), 0);
}

function median(v: readonly number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2]! : 0.5 * (s[n / 2 - 1]! + s[n / 2]!);
}

/** What a loss review leads with, from the record alone. */
export function lossReview(rec: AttemptRecord, opts: LossReviewOptions = {}): LossReview {
  const at = rec.outcome.kind === 'in-progress' ? lastRecorded(rec) : rec.outcome.t;
  const window = opts.window ?? 600;
  const riseSigmas = opts.riseSigmas ?? 5;
  const all = doseRateReadings(rec, at, opts.saturation ?? Infinity);
  const readings = all.filter((r) => r.t >= at - window);
  const failures = failureOrder(rec, at);
  const monitors = [...new Set(all.map((r) => r.source))].sort();
  const fromMonitor = rec.measurements.some((m) => decodeRadiationReading(m) !== undefined);
  const threshold = opts.threshold ?? (fromMonitor ? RADIATION_MONITOR.hazardThreshold : undefined);
  let radiation: RadiationReview;
  if (all.length === 0)
    radiation = { monitors, readings, note: 'No radiation monitor reading in the record.' };
  else {
    const peak = readings.reduce<DoseRateReading | undefined>(
      (a, r) => (!a || r.rate > a.rate ? r : a),
      undefined,
    );
    let onset: RadiationReview['onset'];
    if (threshold !== undefined) {
      const hit = readings.find((r) => r.rate >= threshold);
      if (hit) onset = { t: hit.t, rate: hit.rate, rule: 'threshold' };
    } else
      for (let i = 1; i < readings.length; i++) {
        const before = readings.slice(0, i).map((r) => r.rate);
        const base = median(before);
        const r = readings[i]!;
        if (r.rate - base > riseSigmas * Math.max(r.sigma, 1e-12)) {
          onset = { t: r.t, rate: r.rate, rule: 'rise' };
          break;
        }
      }
    const lastReading = all[all.length - 1]!;
    const firstFailure = failures[0];
    radiation = {
      monitors,
      readings,
      ...(peak ? { peak } : {}),
      ...(onset ? { onset } : {}),
      ...(onset && firstFailure ? { leadBeforeFirstFailure: firstFailure.t - onset.t } : {}),
      last: { ...lastReading, age: at - lastReading.t },
      ...(!onset
        ? {
            note:
              threshold !== undefined
                ? 'No reading reached the hazard threshold.'
                : 'No reading rose clearly above those before it.',
          }
        : {}),
    };
  }
  return {
    attemptId: rec.id,
    outcome: rec.outcome,
    at,
    radiation,
    failures,
    equipment: equipmentTimeline(rec, at, opts.knownEquipment),
    lattice: latticeRetention(rec, at),
  };
}
