import type { ReactElement } from 'react';
import { ALERT_GLYPH } from './Alert.tsx';

/**
 * What the recorder is doing. `recording`: the lamp breathes. `idle`: lit, steady. `off`: hollow.
 * `full`: lit, with a caution shape, because new records are being dropped.
 */
export type BlackBoxState = 'recording' | 'idle' | 'off' | 'full';

export interface BlackBoxMarkProps {
  readonly state?: BlackBoxState;
  /** The name beside the lamp. Pass an empty string for the lamp alone. */
  readonly label?: string;
  /** A short fact after the name, e.g. `'ATTEMPT 4'` or `'REC 10 Hz'`. */
  readonly detail?: string;
}

const SPOKEN: Readonly<Record<BlackBoxState, string>> = {
  recording: 'recording',
  idle: 'idle',
  off: 'off',
  full: 'store full',
};

/**
 * Black Box's presence: an international-orange lamp and its name. Put it wherever Black Box is
 * at work, and beside anything it carried across recurrence. The breathing lamp is the one
 * ambient loop in the interface (brief §3, visual direction § Black Box presence).
 */
export function BlackBoxMark({
  state = 'recording',
  label = 'BLACK BOX',
  detail,
}: BlackBoxMarkProps): ReactElement {
  return (
    <span
      className="rx-bbx"
      data-state={state}
      role="img"
      aria-label={`${label || 'Black Box'}, ${SPOKEN[state]}${detail ? `, ${detail}` : ''}`}
    >
      <span className="rx-bbx__lamp" />
      {label !== '' && <span className="rx-bbx__label">{label}</span>}
      {state === 'full' && <span className="rx-bbx__alert">{ALERT_GLYPH.caution}</span>}
      {detail !== undefined && <span className="rx-bbx__detail">{detail}</span>}
    </span>
  );
}
