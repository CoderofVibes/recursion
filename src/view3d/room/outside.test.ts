/**
 * The window: a phenomenon the eye can see (A19's funnels) is drawn by its section's window view
 * from the window channel, and goes when the eye can no longer see it.
 */
import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { viewSnapshot } from '../../contracts/fixtures/index.ts';
import type { ViewSnapshot } from '../../contracts/index.ts';
import { windowFields } from '../adapter.ts';
import { registerWindowView } from '../windowViews.ts';
import { buildOutside } from './outside.ts';

describe('phenomena in the window', () => {
  it('creates, feeds and retires a window view from the channel', () => {
    const updates: unknown[] = [];
    let created = 0;
    let disposed = 0;
    let radius = 0;
    registerWindowView('test-glow', ({ displayRadius }) => {
      created++;
      radius = displayRadius;
      return {
        update: (visual) => void updates.push(visual),
        dispose: () => void disposed++,
      };
    });
    const withWindow = (fields?: unknown[]): ViewSnapshot =>
      ({
        ...viewSnapshot,
        window: { sunlit: true, objects: [], ...(fields ? { fields } : {}) },
      }) as unknown as ViewSnapshot;
    const outside = buildOutside(new Scene());
    outside.update(withWindow([{ id: 'w1', kind: 'test-glow', visual: { glow: 1 } }]));
    outside.update(withWindow([{ id: 'w1', kind: 'test-glow', visual: { glow: 2 } }]));
    expect(created).toBe(1);
    expect(updates).toEqual([{ glow: 1 }, { glow: 2 }]);
    expect(radius).toBeGreaterThan(0);
    // No longer seen: retired.
    outside.update(withWindow([]));
    expect(disposed).toBe(1);
    // A kind with no view, or a malformed entry, is passed over.
    outside.update(withWindow([{ id: 'w2', kind: 'unknown' }, { kind: 'test-glow' }]));
    expect(created).toBe(1);
    outside.dispose();
  });

  it('reads the channel only where it carries a list', () => {
    expect(windowFields(undefined)).toEqual([]);
    expect(windowFields({ fields: 'no' })).toEqual([]);
    expect(windowFields({ fields: [{ id: 'a', kind: 'k', visual: 1 }, { id: 3 }] })).toEqual([
      { id: 'a', kind: 'k', visual: 1 },
    ]);
  });
});
