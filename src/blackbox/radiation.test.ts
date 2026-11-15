/**
 * The radiation monitor in the loss review (A24, R37). A first lattice contact: background
 * readings, then a rise through the monitor's response time to its saturation limit, and 3A's
 * real `stepCondition` failures some seconds later (the camera, then both PDUs, as in S17's entry
 * case). The record must show the spike before the failures.
 */

import { describe, expect, it } from 'vitest';
import { buildFixtures } from '../contracts/fixtures/index.ts';
import type { AttemptRecord, Measurement, ShipEvent } from '../contracts/index.ts';
import { createRng } from '../lib/rng.ts';
import { stepCondition } from '../ship/condition/index.ts';
import { loadShipDefinition } from '../ship/definition.ts';
import { createShipSystemsState } from '../ship/state.ts';
import { emptyArchive, withAttempt } from './archive.ts';
import { AttemptRecorder } from './recorder.ts';
import { doseRateReadings, lossReview } from './radiation.ts';
import { MemoryBlackBoxStore } from './store.ts';
import { encodeRadiationReading } from '../ship/sensors/radiation-observations.ts';
import { RADIATION_MONITOR } from '../ship/sensors/radiation-spec.ts';

const ship = loadShipDefinition();
const CONTACT = 30;
const SATURATION = 15;

/** The monitor: background, then a rise with a 1.5 s response toward 20 U, saturating at 15. */
function readings(kind: 'lattice-intensity' | 'telemetry' = 'lattice-intensity'): Measurement[] {
  const rng = createRng(37).stream('monitor');
  const out: Measurement[] = [];
  for (let t = 0; t <= 42; t += 0.5) {
    const truth = t < CONTACT ? 0.02 : 20 * (1 - Math.exp(-(t - CONTACT) / 1.5));
    const sigma = 0.01 + 0.02 * truth;
    const rate = Math.min(SATURATION, Math.max(0, truth + rng.normal(0, sigma)));
    out.push({
      kind,
      t,
      source: 'flight-cpu-a',
      ...(kind === 'telemetry' ? { channel: 'dose-rate' } : {}),
      value: [rate],
      sigma: [sigma],
    });
  }
  return out;
}

/** 3A's real condition code: the camera fails 7.8 s after contact, both PDUs 3.5 s later. */
function failures(): ShipEvent[] {
  let state = { ...createShipSystemsState(ship), t: CONTACT };
  const a = stepCondition(
    state,
    ship,
    { camera: { rawDose: 150, aboveBurnout: false } },
    { camera: true },
    7.8,
  );
  state = { ...a.state, t: CONTACT + 7.8 };
  const b = stepCondition(
    state,
    ship,
    {
      'pdu-a': { rawDose: 150, aboveBurnout: false },
      'pdu-b': { rawDose: 150, aboveBurnout: false },
    },
    {},
    3.5,
  );
  return [...a.events, ...b.events];
}

function record(ms: Measurement[] = readings()): AttemptRecord {
  const events = failures().filter((e) => e.kind !== 'exposure'); // doses stay truth-side (R35)
  return {
    ...buildFixtures().attempts[0],
    id: 'first-contact',
    measurements: ms,
    events: [...events, { kind: 'ship-lost', t: CONTACT + 11.3, cause: 'radiation' }],
    outcome: { kind: 'lost', t: CONTACT + 11.3, cause: 'radiation' },
  };
}

describe('the radiation monitor in the loss review (A24)', () => {
  it('shows the spike, and that it came before the failures', () => {
    const r = lossReview(record(), {
      saturation: SATURATION,
      knownEquipment: ship.equipment.map((e) => e.id),
    });
    expect(r.at).toBeCloseTo(41.3, 9);
    expect(r.radiation.monitors).toEqual(['flight-cpu-a']);
    // The first reading after contact already stands far above the background.
    expect(r.radiation.onset).toEqual({ t: 30.5, rate: expect.any(Number), rule: 'rise' });
    expect(r.failures[0]).toEqual({ t: CONTACT + 7.8, equipment: 'camera', how: 'failed' });
    expect(r.radiation.leadBeforeFirstFailure).toBeCloseTo(7.3, 9);
    // The monitor saturated: the true rate may have been higher, and the review says so.
    expect(r.radiation.peak!.saturated).toBe(true);
    expect(r.radiation.peak!.rate).toBe(SATURATION);
    expect(r.radiation.last!.age).toBeCloseTo(41.3 - 41, 9);
    // The failures that ended it: the camera, then both PDUs.
    expect(r.failures.map((f) => f.equipment)).toEqual(['camera', 'pdu-a', 'pdu-b']);
  });

  it('with the monitor’s hazard threshold, the onset is the first reading at or above it', () => {
    const r = lossReview(record(), { threshold: 1 });
    expect(r.radiation.onset).toMatchObject({ t: 30.5, rule: 'threshold' });
    expect(lossReview(record(), { threshold: 30 }).radiation.onset).toBeUndefined();
    expect(lossReview(record(), { threshold: 30 }).radiation.note).toBe(
      'No reading reached the hazard threshold.',
    );
  });

  it('reads a dose-rate telemetry channel the same way', () => {
    const a = lossReview(record(readings('telemetry')));
    const b = lossReview(record());
    expect(a.radiation.onset).toEqual(b.radiation.onset);
  });

  it('reads 3C’s monitor channel, with the monitor’s own threshold (R58)', () => {
    // 3C's channel as the ship records it: background, then first contact through the
    // monitor's response time.
    const monitor: Measurement[] = [];
    for (let t = 0; t <= 42; t += 0.5) {
      const truth =
        t < CONTACT ? 0 : 20 * (1 - Math.exp(-(t - CONTACT) / RADIATION_MONITOR.responseTime));
      const sigma = RADIATION_MONITOR.noiseFloor + RADIATION_MONITOR.relativeNoise * truth;
      const rate = Math.min(RADIATION_MONITOR.saturationRate, truth);
      monitor.push(
        encodeRadiationReading({
          version: 1,
          source: RADIATION_MONITOR.host,
          t,
          rate,
          saturated: rate >= RADIATION_MONITOR.saturationRate,
          responseTime: RADIATION_MONITOR.responseTime,
          saturationRate: RADIATION_MONITOR.saturationRate,
          validUntil: t + RADIATION_MONITOR.validity,
          sigma,
        }),
      );
    }
    const r = lossReview(record(monitor));
    expect(r.radiation.monitors).toEqual([RADIATION_MONITOR.host]);
    expect(r.radiation.note).toBeUndefined();
    // The monitor's published hazard threshold, crossed by the first reading after contact.
    expect(r.radiation.onset).toEqual({ t: 30.5, rate: expect.any(Number), rule: 'threshold' });
    expect(r.radiation.onset!.rate).toBeGreaterThanOrEqual(RADIATION_MONITOR.hazardThreshold);
    expect(r.radiation.leadBeforeFirstFailure).toBeCloseTo(7.3, 9);
    expect(r.radiation.peak!.rate).toBeCloseTo(20 * (1 - Math.exp(-12 / 0.25)), 6);
    expect(r.radiation.readings.every((x) => x.source === RADIATION_MONITOR.host)).toBe(true);
  });

  it('says so when the record has no monitor reading', () => {
    const r = lossReview(record([]));
    expect(r.radiation.note).toBe('No radiation monitor reading in the record.');
    expect(r.radiation.onset).toBeUndefined();
    // The failures are still there to read.
    expect(r.failures).toHaveLength(3);
  });

  it('records the readings and keeps them through the store unchanged', async () => {
    const rec = new AttemptRecorder({
      id: 'first-contact',
      index: 1,
      encounterId: 'cathedral',
      startedAt: '2026-11-15T00:00:00Z',
      start: buildFixtures().attempts[0].start,
    });
    rec.recordMeasurements(readings());
    const final = rec.end({ kind: 'lost', t: 41.3, cause: 'radiation' });
    const store = new MemoryBlackBoxStore();
    await store.putAttempt(final);
    const back = (await store.load()).archive.attempts[0]!;
    expect(doseRateReadings(back)).toEqual(doseRateReadings({ measurements: readings() }));
    expect(withAttempt(emptyArchive(), back).attempts[0]!.measurements).toEqual(final.measurements);
  });
});
