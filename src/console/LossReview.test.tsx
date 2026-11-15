/**
 * The loss review on the debrief (A24, A16): what failed first, and the radiation monitor's
 * spike before it, from the record alone.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { lossReview } from '../blackbox/index.ts';
import { attempts } from '../contracts/fixtures/index.ts';
import type { AttemptRecord, Measurement, ShipEvent } from '../contracts/index.ts';
import { LossReviewView } from './LossReview.tsx';

const CONTACT = 30;
const LOST = 41.3;

/** Background, then a rise toward the monitor's limit at first contact. */
const readings = (): Measurement[] => {
  const out: Measurement[] = [];
  for (let t = 20; t <= 41; t += 0.5) {
    const rate = t < CONTACT ? 0.004 : Math.min(15, 20 * (1 - Math.exp(-(t - CONTACT) / 1.5)));
    out.push({
      kind: 'lattice-intensity',
      t,
      source: 'flight-cpu-a',
      value: [rate],
      sigma: [0.001 + 0.02 * rate],
    });
  }
  return out;
};

const events: ShipEvent[] = [
  { kind: 'condition-changed', t: 37.8, equipment: 'camera', condition: 0 } as ShipEvent,
  { kind: 'equipment-fault', t: 41.3, equipment: 'pdu-a', fault: 'burnout' } as ShipEvent,
  { kind: 'equipment-fault', t: 41.3, equipment: 'pdu-b', fault: 'burnout' } as ShipEvent,
];

const record = (ms: Measurement[] = readings(), ev: ShipEvent[] = events): AttemptRecord => ({
  ...attempts[0]!,
  id: 'first-contact',
  measurements: ms,
  events: ev,
  outcome: { kind: 'lost', t: LOST, cause: 'radiation' } as AttemptRecord['outcome'],
});

describe('the loss review on the debrief', () => {
  it('lists what failed in the order it failed', () => {
    const html = renderToStaticMarkup(
      <LossReviewView review={lossReview(record(), { threshold: 0.02, saturation: 15 })} />,
    );
    expect(html).toContain('aria-label="Failures in order"');
    expect(html.indexOf('>camera<')).toBeGreaterThan(0);
    expect(html.indexOf('>camera<')).toBeLessThan(html.indexOf('>pdu a<'));
    expect(html.indexOf('>pdu a<')).toBeLessThan(html.indexOf('>pdu b<'));
    expect(html).toContain('>burnout<');
  });

  it('shows the spike, how long before the first failure it began, and an over-range peak as a lower limit', () => {
    const review = lossReview(record(), { threshold: 0.02, saturation: 15 });
    const html = renderToStaticMarkup(<LossReviewView review={review} threshold={0.02} />);
    // The first reading at or above the threshold is the one after contact.
    expect(review.radiation.onset?.t).toBe(30.5);
    expect(html).toContain('spike began');
    expect(html).toContain('T+00:00:30');
    expect(html).toContain('7 s before the first failure');
    expect(html).toContain('≥ 15.00 peak');
    expect(html).toContain('over range: the rate was at least 15.00 U');
    expect(html).toContain('before the loss');
    expect(html).not.toContain('NaN');
  });

  it('says so when the record holds no monitor reading, and never draws a rate', () => {
    const html = renderToStaticMarkup(<LossReviewView review={lossReview(record([]))} />);
    expect(html).toContain('No radiation monitor reading in the record.');
    expect(html).not.toContain('Dose rate');
    expect(html).not.toContain('spike began');
    // The failures are still listed: they come from the ship's own reports.
    expect(html).toContain('>camera<');
  });

  it('says so when nothing failed before the loss', () => {
    const html = renderToStaticMarkup(
      <LossReviewView review={lossReview(record(readings(), []))} />,
    );
    expect(html).toContain('no failure or fault was recorded');
  });
});
