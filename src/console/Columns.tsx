/**
 * A console page's panels in columns: in order, down one column and on to the next, the columns
 * balanced, as a CSS multi-column flow lays them out. A multi-column flow re-balances every
 * column whenever anything inside it changes, and the console changes five times a second: on
 * SYSTEMS that was most of a modest laptop's layout time (S15). Here the balance is worked out
 * only when a panel's size, or the page's width, actually changes (a ResizeObserver reports both
 * without forcing a layout); in between, the columns are plain flex boxes.
 *
 * The panels keep their order in the document, so keyboard order is reading order down the
 * columns (S9).
 */
import { Children, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { hud, space } from '../theme/index.ts';

/** The last column count, so a page opened next starts with it rather than one column. */
let lastCount = 3;

const columnsFor = (width: number, items: number): number =>
  Math.max(1, Math.min(items, Math.floor((width + space.gap) / (hud.panelMin + space.gap))));

/**
 * Where each column starts, for `count` columns over panels of these heights, in order: the
 * contiguous split with the shortest tallest column (gaps counted). Few panels, so exact.
 */
export function balance(heights: readonly number[], count: number, gap = space.gap): number[] {
  const n = heights.length;
  const k = Math.max(1, Math.min(count, n));
  const prefix = [0];
  for (const h of heights) prefix.push(prefix.at(-1)! + h);
  const span = (i: number, j: number): number => prefix[j]! - prefix[i]! + gap * (j - i - 1);
  // best[c][j]: the shortest tallest column for the first j panels in c columns.
  const best: number[][] = Array.from({ length: k + 1 }, () => Array<number>(n + 1).fill(Infinity));
  const cut: number[][] = Array.from({ length: k + 1 }, () => Array<number>(n + 1).fill(0));
  best[0]![0] = 0;
  for (let c = 1; c <= k; c++)
    for (let j = c; j <= n; j++)
      for (let i = c - 1; i < j; i++) {
        const tallest = Math.max(best[c - 1]![i]!, span(i, j));
        if (tallest < best[c]![j]!) {
          best[c]![j] = tallest;
          cut[c]![j] = i;
        }
      }
  const starts: number[] = [];
  for (let c = k, j = n; c > 0; c--) {
    const i = cut[c]![j]!;
    starts.unshift(i);
    j = i;
  }
  return starts;
}

const even = (n: number, count: number): number[] => {
  const k = Math.max(1, Math.min(count, n));
  return Array.from({ length: k }, (_, c) => Math.round((c * n) / k));
};

const same = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

export function Columns({ children }: { readonly children: ReactNode }) {
  const items = Children.toArray(children);
  const box = useRef<HTMLDivElement>(null);
  const heights = useRef<number[]>([]);
  const width = useRef(0);
  const [starts, setStarts] = useState<number[]>(() => even(items.length, lastCount));
  const n = items.length;

  useLayoutEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver((entries) => {
      for (const e of entries) {
        const target = e.target as HTMLElement;
        const size = e.borderBoxSize[0];
        if (target === el) width.current = e.contentRect.width;
        else if (size) heights.current[Number(target.dataset.slot)] = size.blockSize;
      }
      if (heights.current.length < n || heights.current.slice(0, n).some((h) => h === undefined))
        return;
      const count = columnsFor(width.current, n);
      lastCount = count;
      const next = balance(heights.current.slice(0, n), count);
      setStarts((now) => (same(now, next) ? now : next));
    });
    watch.observe(el);
    for (const slot of el.querySelectorAll('[data-slot]')) watch.observe(slot);
    return () => watch.disconnect();
  }, [n, starts]);

  const ends = [...starts.slice(1), n];
  return (
    <div className="cs-grid" ref={box}>
      {starts.map((start, c) => (
        <div className="cs-col" key={c}>
          {items.slice(start, ends[c]).map((item, i) => (
            <div className="cs-slot" data-slot={start + i} key={start + i}>
              {item}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
