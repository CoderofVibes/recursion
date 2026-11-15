/** Recorded-data codec and caution policy only; safe on the belief side (P11). */
import type { Measurement } from '../../contracts/measurements.ts';
import type {
  RadiationCaution,
  RadiationCautionState,
  RadiationDoseRateReading,
} from '../../contracts/radiation-monitor.ts';
import { RADIATION_MONITOR } from './radiation-spec.ts';
export type {
  RadiationCaution,
  RadiationCautionState,
  RadiationDoseRateReading,
} from '../../contracts/radiation-monitor.ts';

export function encodeRadiationReading(reading: RadiationDoseRateReading): Measurement {
  return {
    kind: 'field-signal',
    field: RADIATION_MONITOR.inputKey,
    channel: RADIATION_MONITOR.channel,
    source: reading.source,
    t: reading.t,
    value: [
      reading.rate,
      Number(reading.saturated),
      reading.responseTime,
      reading.saturationRate,
      reading.validUntil,
    ],
    sigma: [reading.sigma, 0, 0, 0, 0],
  };
}

export function decodeRadiationReading(m: Measurement): RadiationDoseRateReading | undefined {
  const v = m.value;
  if (
    m.kind !== 'field-signal' ||
    m.channel !== RADIATION_MONITOR.channel ||
    m.source !== RADIATION_MONITOR.host ||
    m.field !== RADIATION_MONITOR.inputKey ||
    m.target !== undefined ||
    !Number.isFinite(m.t) ||
    v.length !== 5 ||
    m.sigma.length !== 5 ||
    !v.every(Number.isFinite) ||
    !m.sigma.every(Number.isFinite) ||
    !(m.sigma[0]! > 0) ||
    m.sigma.slice(1).some((s) => s !== 0) ||
    v[0]! < 0 ||
    v[0]! > v[3]! ||
    ![0, 1].includes(v[1]!) ||
    v[2] !== RADIATION_MONITOR.responseTime ||
    v[3] !== RADIATION_MONITOR.saturationRate ||
    v[4] !== m.t + RADIATION_MONITOR.validity ||
    (v[1] === 1 && v[0] !== v[3])
  )
    return;
  return {
    version: 1,
    source: m.source,
    t: m.t,
    rate: v[0]!,
    saturated: v[1] === 1,
    responseTime: v[2]!,
    saturationRate: v[3]!,
    validUntil: v[4]!,
    sigma: m.sigma[0]!,
  };
}

/** A12 consumer: a fresh high reading raises the caution; only a fresh low reading
 * clears it. Missing, stale or out-of-order data cannot assert an all-clear.
 * The session owner drops warp and ends its tick batch on the new caution. */
export function radiationCaution(
  measurement: Measurement,
  now: number,
  previous: RadiationCautionState = {},
): RadiationCautionState {
  const r = decodeRadiationReading(measurement);
  if (
    !r ||
    !Number.isFinite(now) ||
    now < r.t ||
    now > r.validUntil ||
    (previous.latestReadingAt !== undefined && r.t <= previous.latestReadingAt)
  )
    return previous;
  if (
    r.rate > RADIATION_MONITOR.hazardThreshold ||
    r.saturated ||
    (previous.caution && r.rate >= RADIATION_MONITOR.clearThreshold)
  ) {
    const caution: RadiationCaution = {
      id: 'radiation-high',
      level: 'caution',
      source: r.source,
      reportedAt: r.t,
      validUntil: r.validUntil,
      rate: r.rate,
      saturated: r.saturated,
      threshold: RADIATION_MONITOR.hazardThreshold,
    };
    return { latestReadingAt: r.t, caution };
  }
  return { latestReadingAt: r.t };
}
