import type { ReactElement } from 'react';

/** How much an alert matters: an advisory informs, a caution needs attention, a warning needs action now. */
export type AlertLevel = 'advisory' | 'caution' | 'warning';

/** Each level has its own shape, so colour is never the only cue (DD01, V2 10045 and V2 10114). */
export const ALERT_GLYPH: Readonly<Record<AlertLevel, string>> = {
  advisory: '○',
  caution: '▲',
  warning: '■',
};

const RANK: Readonly<Record<AlertLevel, number>> = { warning: 0, caution: 1, advisory: 2 };

export interface AlertProps {
  readonly level: AlertLevel;
  /** What is wrong, in a few words. Not a sentence of explanation. */
  readonly text: string;
  /** The numbers that go with it, e.g. `'CPA 16 km · T−9 s'`. */
  readonly detail?: string;
}

/**
 * One alert. It fades in once and then holds steady: nothing blinks (visual direction § Motion).
 * A warning interrupts a screen reader; cautions and advisories wait their turn.
 */
export function Alert({ level, text, detail }: AlertProps): ReactElement {
  return (
    <div className="rx-alert" data-level={level} role={level === 'warning' ? 'alert' : 'status'}>
      <span className="rx-glyph" aria-hidden="true">
        {ALERT_GLYPH[level]}
      </span>
      <span className="rx-alert__text">{text}</span>
      {detail !== undefined && <span className="rx-alert__detail">{detail}</span>}
    </div>
  );
}

export interface AlertItem extends AlertProps {
  readonly id: string;
}

/** Most serious first; alerts of the same level keep the order they arrived in (V2 10175). */
export function sortAlerts<T extends { readonly level: AlertLevel }>(alerts: readonly T[]): T[] {
  return alerts
    .map((a, i) => ({ a, i }))
    .sort((x, y) => RANK[x.a.level] - RANK[y.a.level] || x.i - y.i)
    .map((x) => x.a);
}

export interface AlertStackProps {
  readonly alerts: readonly AlertItem[];
  /** How many to show before the rest are counted instead (default 3). */
  readonly max?: number;
  /** What the stack is, for assistive technology. */
  readonly label?: string;
}

/** The alerts in force, most serious first. Renders nothing when all is well: a dark cockpit. */
export function AlertStack({
  alerts,
  max = 3,
  label = 'Alerts',
}: AlertStackProps): ReactElement | null {
  if (alerts.length === 0) return null;
  const sorted = sortAlerts(alerts);
  const shown = sorted.slice(0, max);
  const hidden = sorted.length - shown.length;
  return (
    <div className="rx-alerts" role="group" aria-label={label}>
      {shown.map((a) => (
        <Alert key={a.id} level={a.level} text={a.text} detail={a.detail} />
      ))}
      {hidden > 0 && <span className="rx-alerts__more">+{hidden} more</span>}
    </div>
  );
}
