/**
 * The loss review on the debrief (A24, A16; 2C's update 7): what the record shows of a loss, in
 * the order it happened. First what failed, in order; then the radiation monitor's readings
 * before the loss, where the spike began and how long before the first failure, its peak (a
 * lower limit when the monitor was over range), and the last reading the ship had. All of it
 * from the Black Box record alone (`lossReview`); what is absent is said, never guessed.
 *
 * The monitor measures the dose rate where it sits. It never shows a component's dose (P11).
 */
import type { LossReview } from '../blackbox/index.ts';
import { Trend } from '../theme/components/index.ts';
import { Caption, Line } from './controls.tsx';
import { clock, duration, name } from './format.ts';
import { rateText } from './radiation.ts';

/** How many failures the strip shows before it counts the rest. */
const FAILURES_SHOWN = 6;

export function LossReviewView({
  review,
  threshold,
}: {
  readonly review: LossReview;
  /** The monitor's hazard threshold, U, when the ship gives one: drawn on the trend. */
  readonly threshold?: number;
}) {
  const { failures, radiation, at } = review;
  const { peak, onset, last, leadBeforeFirstFailure: lead } = radiation;
  const more = failures.length - FAILURES_SHOWN;
  return (
    <>
      <Caption>what failed first</Caption>
      {failures.length ? (
        <ol className="cs-failures" aria-label="Failures in order">
          {failures.slice(0, FAILURES_SHOWN).map((f) => (
            <li key={`${f.equipment}-${f.t}`}>
              <span className="cs-failures__t">T+{clock(f.t)}</span>
              <span className="cs-failures__what">{name(f.equipment)}</span>
              <span className="cs-failures__how">{f.how}</span>
            </li>
          ))}
          {more > 0 ? <li className="cs-failures__more">+{more} more</li> : null}
        </ol>
      ) : (
        <p className="cs-note">no failure or fault was recorded before T+{clock(at)}</p>
      )}

      <Caption>radiation monitor · before the loss</Caption>
      {radiation.readings.length ? (
        <Trend
          title={`Dose rate${radiation.monitors.length ? ` · ${radiation.monitors.map(name).join(', ')}` : ''}`}
          unit="U"
          value={peak ? `${peak.saturated ? '≥ ' : ''}${rateText(peak.rate)} peak` : '—'}
          data={radiation.readings.map((r) => r.rate)}
          tone="blackbox"
          min={0}
          {...(peak?.saturated || onset ? { status: 'caution' as const } : {})}
          {...(threshold !== undefined ? { limits: [{ at: threshold, kind: 'caution' }] } : {})}
        />
      ) : null}
      {onset ? (
        <Line label="spike began" status="caution" tone="blackbox">
          T+{clock(onset.t)} · {rateText(onset.rate)} U
          {lead !== undefined
            ? lead >= 0
              ? ` · ${duration(lead)} before the first failure`
              : ` · ${duration(-lead)} after the first failure`
            : ''}
        </Line>
      ) : null}
      {peak?.saturated ? (
        <Line label="peak" status="caution" tone="blackbox">
          over range: the rate was at least {rateText(peak.rate)} U
        </Line>
      ) : null}
      {last ? (
        <Line label="last reading" tone="blackbox">
          {rateText(last.rate)} U · {duration(last.age)} before the{' '}
          {review.outcome.kind === 'lost' ? 'loss' : 'end'}
        </Line>
      ) : null}
      {radiation.note ? <p className="cs-note">{radiation.note}</p> : null}
    </>
  );
}
