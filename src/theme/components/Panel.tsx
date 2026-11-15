import type { ReactElement, ReactNode } from 'react';
import type { Status, Tone } from './scale.ts';

export interface PanelProps {
  readonly title: string;
  /** Small text at the right of the header: a unit, a count, a bus name. */
  readonly aside?: string;
  /** One line under the header saying how the thing is doing. */
  readonly statusLine?: string;
  readonly status?: Status;
  readonly tone?: Tone;
  readonly children?: ReactNode;
}

/** The frame every console module sits in: fitted hardware with a small header. */
export function Panel({
  title,
  aside,
  statusLine,
  status = 'nominal',
  tone = 'measured',
  children,
}: PanelProps): ReactElement {
  return (
    <section className="rx-panel" data-status={status} data-tone={tone} aria-label={title}>
      <header className="rx-panel__head">
        <span className="rx-panel__title">{title}</span>
        {aside !== undefined && <span className="rx-panel__aside">{aside}</span>}
      </header>
      {statusLine !== undefined && <p className="rx-panel__status">{statusLine}</p>}
      {children}
    </section>
  );
}
