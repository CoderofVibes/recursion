/**
 * A24's radiation monitor on the screens: its reading is read by shape and shown with its age,
 * noise and range; the session's own alerts (power, radiation) join the alert stack, and the one
 * that just came up names why warp dropped.
 */
import { describe, expect, it } from 'vitest';
import type { Sighting } from '../game/belief/controls.ts';
import { newlyRaised, raisedAlerts } from './alerts.ts';
import { doseRate, doseRateView } from './radiation.ts';

const reading = {
  source: 'flight-cpu-a',
  t: 100,
  rate: 0.0123,
  sigma: 0.0005,
  saturated: false,
  saturationRate: 25,
  validUntil: 102,
  threshold: 0.02,
};

describe("the radiation monitor's reading", () => {
  it('takes a well-formed reading and nothing else', () => {
    expect(doseRate({ radiation: reading })).toEqual(reading);
    const { threshold: _, ...bare } = reading;
    expect(doseRate({ radiation: bare })).toEqual(bare);
    for (const bad of [
      undefined,
      null,
      {},
      { radiation: 'high' },
      { radiation: { ...reading, rate: -1 } },
      { radiation: { ...reading, t: '100' } },
      { radiation: { ...reading, saturated: 1 } },
      { radiation: { ...reading, validUntil: 99 } },
      { radiation: { ...reading, sigma: Number.NaN } },
    ])
      expect(doseRate(bad)).toBeUndefined();
  });

  it('shows the rate with its noise, over range as a lower limit, and old as old', () => {
    expect(doseRateView(reading, 101, false)).toEqual({
      value: '0.0123 ± 0.0005',
      status: 'nominal',
      note: 'read 1 s ago',
    });
    // The session's caution, not the number, decides: it clears only on a fresh low reading.
    expect(doseRateView(reading, 101, true).status).toBe('caution');
    expect(doseRateView({ ...reading, saturated: true, rate: 25 }, 101, false)).toMatchObject({
      value: '≥ 25.00',
      status: 'caution',
    });
    expect(doseRateView(reading, 105, false)).toMatchObject({
      status: 'stale',
      note: 'no new reading: last read 5 s ago by flight cpu a',
    });
    expect(doseRateView(undefined, 101, false)).toMatchObject({ value: '—', status: 'stale' });
  });
});

describe("the session's own alerts", () => {
  it('names power and radiation alerts, and any other by its id', () => {
    const items = raisedAlerts(
      [
        { id: 'power-low', level: 'caution', timeToEmpty: 3 * 3600 },
        {
          id: 'critical-service',
          level: 'warning',
          functions: ['air-train'],
          deadline: 160,
        },
        { id: 'radiation-high', level: 'caution', rate: 25, saturated: true, threshold: 0.02 },
        { id: 'hull-breach', level: 'warning' },
      ],
      100,
    );
    expect(items).toEqual([
      {
        id: 'game-power-low',
        level: 'caution',
        text: 'Power low',
        detail: '3.0 h without generation',
      },
      {
        id: 'game-critical-service',
        level: 'warning',
        text: 'Critical power short',
        detail: 'air train · lost in 00:01:00',
      },
      {
        id: 'game-radiation-high',
        level: 'caution',
        text: 'Radiation high',
        detail: '≥ 25.00 U · above 0.0200 U',
      },
      { id: 'game-hull-breach', level: 'warning', text: 'Hull breach' },
    ]);
  });

  it('finds the one that came up, so a warp drop can say why', () => {
    const at = (alerts: object[], sightings: Sighting[] = []) => ({ alerts, sightings, t: 300 });
    const high = { id: 'radiation-high', level: 'caution', rate: 0.03, threshold: 0.02 };
    expect(newlyRaised(at([]), at([high]))?.text).toBe('Radiation high');
    expect(newlyRaised(at([high]), at([high]))).toBeUndefined();
    const low = { id: 'power-low', level: 'caution' };
    const worse = { id: 'power-low', level: 'warning' };
    expect(newlyRaised(at([low]), at([worse]))?.level).toBe('warning');
    // A well's precursor in the window (A19) is one too, with when what it announces is due.
    const precursor: Sighting = { kind: 'precursor', field: 'popup', seenAt: 300, until: 1200 };
    expect(newlyRaised(at([]), at([], [precursor]))).toEqual({
      id: 'sighting-popup',
      level: 'caution',
      text: 'Precursor in the window',
      detail: 'due in 00:15:00',
    });
    expect(newlyRaised(at([], [precursor]), at([], [precursor]))).toBeUndefined();
  });
});
