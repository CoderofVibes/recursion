import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Panel, Readout, ReadoutGrid } from '../../theme/components/index.ts';
import './readout.css';

export interface PerfContext {
  readonly view: string;
  readonly warp: number;
  readonly shipTime?: number;
  readonly scale: number;
  readonly ready: number | null;
}

interface Reading extends PerfContext {
  readonly samples: number;
  readonly p95: number | null;
  readonly max: number | null;
  readonly over100: number;
  readonly elapsed: number;
  readonly achieved: number | null;
}

function PerfReadout({ read }: { readonly read: () => PerfContext }) {
  const [reading, setReading] = useState<Reading | null>(null);
  useEffect(() => {
    let raf = 0;
    let previous: number | undefined;
    let view = '';
    let sinceView = 0;
    let notified = 0;
    let shipStart: number | undefined;
    let sampleStart = 0;
    let over100 = 0;
    let intervals: number[] = [];
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const state = read();
      const page =
        state.view === 'console'
          ? (document.querySelector('.cs-tab[aria-current="page"]')?.textContent?.trim() ??
            'console')
          : state.view;
      const key = `${page}:${state.warp}`;
      if (document.hidden || key !== view) {
        view = key;
        sinceView = now;
        previous = undefined;
        intervals = [];
        shipStart = undefined;
        over100 = 0;
      }
      // Match S15's view warm-up. Hidden time and transitions are not steady-view frames.
      if (!document.hidden && now - sinceView >= 1200) {
        if (previous !== undefined) {
          const interval = now - previous;
          intervals.push(interval);
          if (interval > 100) over100++;
          if (intervals.length > 3600) intervals.shift();
        } else {
          sampleStart = now;
          shipStart = state.shipTime;
        }
        previous = now;
      }
      if (now - notified < 1000) return;
      notified = now;
      const sorted = [...intervals].sort((a, b) => a - b);
      const elapsed = intervals.length ? (now - sampleStart) / 1000 : 0;
      setReading({
        ...state,
        view: page,
        samples: intervals.length,
        p95: sorted[Math.ceil(sorted.length * 0.95) - 1] ?? null,
        max: sorted.at(-1) ?? null,
        over100,
        elapsed,
        achieved:
          elapsed && shipStart !== undefined && state.shipTime !== undefined
            ? (state.shipTime - shipStart) / elapsed
            : null,
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [read]);
  const ms = (n: number | null | undefined) => (n == null ? '—' : n.toFixed(1));
  return (
    <details className="rx-perf" open>
      <summary>Performance · {reading?.view ?? 'loading'}</summary>
      <Panel title="Local laptop check" aside={`${reading?.samples ?? 0} frames`}>
        <ReadoutGrid>
          <Readout label="First draw" value={ms(reading?.ready)} unit="ms" />
          <Readout label="Frame p95" value={ms(reading?.p95)} unit="ms" />
          <Readout label="Worst frame" value={ms(reading?.max)} unit="ms" />
          <Readout label="Over 100 ms" value={reading?.over100 ?? 0} />
          <Readout label="Requested warp" value={reading?.warp ?? 1} unit="×" />
          <Readout label="Achieved" value={ms(reading?.achieved)} unit="ship s/s" />
        </ReadoutGrid>
        <p>Target: load ≤2500 ms · 1× p95 ≤33 ms.</p>
        <p>
          {reading?.elapsed.toFixed(0) ?? 0} s in view · render scale{' '}
          {Math.round((reading?.scale ?? 1) * 100)}%.
        </p>
        <p>
          Change view or warp to restart. This readout adds some overhead; use S15 for recorded
          evidence.
        </p>
      </Panel>
    </details>
  );
}

/** Optional local diagnostic, explicitly enabled by ?perf. No game/control reference. */
export function mountPerfReadout(read: () => PerfContext): () => void {
  if (!new URLSearchParams(window.location.search).has('perf')) return () => {};
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  root.render(<PerfReadout read={read} />);
  return () => {
    // The scene can be disposed from a parent React effect; leave that commit first.
    queueMicrotask(() => {
      root.unmount();
      host.remove();
    });
  };
}
