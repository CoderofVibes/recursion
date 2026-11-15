/**
 * Stepping through a forecast: its moments as chips (now, each burn, each closest approach,
 * where the forecast ends), a line of time under them that shows how far the model can see
 * (solid where it has data, hatched where it is beyond it), and a scrubber for any moment
 * between. The steps are the player's own plan and the model's forecast of it; nothing here
 * plans (P6).
 */
import type { Step } from './chartMath.ts';
import { stepAt } from './chartMath.ts';

export interface TimeSpan {
  readonly from: number;
  readonly to: number;
  readonly kind: 'supported' | 'validated' | 'extrapolating';
}

export interface StepBarProps {
  readonly steps: readonly Step[];
  /** The moment shown. */
  readonly t: number;
  /** `stepped`: the time is a step's (a chip or a STEP button), not a place on the scrubber. */
  readonly onTime: (t: number, stepped: boolean) => void;
  /** How the model stands along the forecast. */
  readonly spans?: readonly TimeSpan[];
  /** A time as the console writes it (T+hh:mm:ss). */
  readonly format: (t: number) => string;
  readonly label?: string;
}

export function StepBar({
  steps,
  t,
  onTime,
  spans = [],
  format,
  label = 'Step through the forecast',
}: StepBarProps) {
  const from = steps[0]?.t ?? 0;
  const to = steps.at(-1)?.t ?? from + 1;
  const length = Math.max(1e-9, to - from);
  const index = stepAt(steps, t);
  const pct = (time: number): string => `${(((time - from) / length) * 100).toFixed(2)}%`;
  const go = (i: number): void => {
    const step = steps[Math.min(steps.length - 1, Math.max(0, i))];
    if (step) onTime(step.t, true);
  };
  // On a step exactly, NEXT moves on; between steps, it goes to the one ahead.
  const onStep = Math.abs((steps[index]?.t ?? t) - t) < 1e-6;
  return (
    <div className="ci-steps" role="group" aria-label={label}>
      <div className="ci-steps__row">
        <button
          type="button"
          className="cs-button"
          disabled={index === 0 && onStep}
          onClick={() => go(onStep ? index - 1 : index)}
        >
          ◂ STEP
        </button>
        <ol className="ci-steps__list">
          {steps.map((s, i) => (
            <li key={`${s.kind}-${s.t}-${i}`}>
              <button
                type="button"
                className="ci-step"
                data-kind={s.kind}
                data-on={i === index ? '' : undefined}
                aria-current={i === index ? 'step' : undefined}
                title={s.detail}
                onClick={() => go(i)}
              >
                <span className="ci-step__label">{s.label}</span>
                <span className="ci-step__time">{format(s.t)}</span>
              </button>
            </li>
          ))}
        </ol>
        <button
          type="button"
          className="cs-button"
          data-primary=""
          data-tone="forecast"
          disabled={index >= steps.length - 1}
          onClick={() => go(index + 1)}
        >
          STEP ▸
        </button>
      </div>
      <div className="ci-steps__line">
        {spans.map((s, i) => (
          <span
            key={i}
            className="ci-steps__span"
            data-kind={s.kind}
            style={{
              left: pct(s.from),
              width: `${(((s.to - s.from) / length) * 100).toFixed(2)}%`,
            }}
          />
        ))}
        {steps.map((s, i) => (
          <span key={i} className="ci-steps__tick" data-kind={s.kind} style={{ left: pct(s.t) }} />
        ))}
        <input
          className="ci-steps__scrub"
          type="range"
          min={from}
          max={to}
          step={length / 400}
          value={Math.min(to, Math.max(from, t))}
          aria-label="Forecast time"
          aria-valuetext={format(t)}
          onChange={(e) => onTime(Number(e.target.value), false)}
        />
      </div>
      <p className="ci-steps__now">
        <span className="ci-steps__clock">{format(t)}</span>
        <span>{steps[index]?.detail ?? ''}</span>
      </p>
    </div>
  );
}
