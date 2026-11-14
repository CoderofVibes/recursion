/**
 * BELIEF side (no truth imports). Recorder policy for housekeeping telemetry.
 *
 * Ship systems (2B) offer about 240 telemetry readings in every recorded packet, most of them
 * unchanged from the packet before. Black Box keeps a reading when its channel has moved by
 * more than a deadband since the last kept value, and at a keepalive interval otherwise, so
 * the latest value of every channel is always known to within the deadband [ASSUMED; baseline
 * recorder policy: "packets select timestamped features, not every raw output byte"].
 * Navigation measurements (bearing, range, accel, attitude, rate...) are never thinned.
 */

import type { Measurement } from '../../contracts/measurements.ts';

export interface TelemetryFilter {
  /** The measurements to record, in their original order. */
  filter(measurements: readonly Measurement[]): readonly Measurement[];
  reset(): void;
}

export function createTelemetryFilter(deadband: number, keepalive: number): TelemetryFilter {
  let last = new Map<string, { value: number; t: number }>();
  return {
    filter(measurements) {
      let kept: Measurement[] | undefined;
      for (let i = 0; i < measurements.length; i++) {
        const m = measurements[i]!;
        let keep = true;
        if (m.kind === 'telemetry' && m.channel !== undefined) {
          const value = m.value[0] ?? 0;
          const before = last.get(m.channel);
          keep =
            before === undefined ||
            m.t - before.t >= keepalive ||
            Math.abs(value - before.value) > deadband * Math.max(Math.abs(before.value), 1e-12);
          if (keep) last.set(m.channel, { value, t: m.t });
        }
        if (keep) kept?.push(m);
        else kept ??= measurements.slice(0, i);
      }
      return kept ?? measurements;
    },
    reset() {
      last = new Map();
    },
  };
}
