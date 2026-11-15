/**
 * The loop as the console's spine (brief §2: configure, predict, operate, observe, revise,
 * explore): one stage per step, in order, each with one line saying where it stands. A judge
 * reads it left to right and knows what has been done and what comes next.
 */
export type StageState = 'done' | 'now' | 'todo' | 'attention';

export interface Stage {
  readonly id: string;
  readonly label: string;
  /** Where this stage stands, in a few words. */
  readonly status: string;
  readonly state: StageState;
  /** Black Box owns it (its ink is the recorder's orange). */
  readonly tone?: 'blackbox' | 'forecast';
}

export interface LoopRailProps {
  readonly stages: readonly Stage[];
  readonly current: string;
  readonly onGo: (id: string) => void;
  readonly label?: string;
}

export function LoopRail({ stages, current, onGo, label = 'The loop' }: LoopRailProps) {
  return (
    <nav className="ci-rail" aria-label={label}>
      {stages.map((s, i) => (
        <button
          key={s.id}
          type="button"
          className="ci-rail__stage"
          data-state={s.state}
          data-tone={s.tone}
          data-on={s.id === current ? '' : undefined}
          aria-current={s.id === current ? 'step' : undefined}
          onClick={() => onGo(s.id)}
        >
          <span className="ci-rail__n">{i + 1}</span>
          <span className="ci-rail__label">{s.label}</span>
          <span className="ci-rail__status">{s.status}</span>
        </button>
      ))}
    </nav>
  );
}
