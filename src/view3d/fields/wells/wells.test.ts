import { Group } from 'three';
import { describe, expect, it } from 'vitest';
import type { BelievedField, JsonValue } from '../../../contracts/index.ts';
import { viewSnapshot } from '../../../contracts/fixtures/index.ts';
import { fieldViewFor } from '../../fieldViews.ts';
import { LineSet } from '../../gfx.ts';
import { makeWellView, registerWellView } from './index.ts';
import { readWellVisual, wellDisplayState, WELL_VIEW_KIND, type WellVisual } from './evidence.ts';

export const acquiredWell: WellVisual = {
  schema: 'well-observation-v1',
  provenance: {
    attemptId: 'attempt-2',
    frameId: 'garden',
    measurementIds: ['position-1', 'burn-1'],
    from: 40,
    to: 60,
    current: true,
  },
  support: 'supported',
  validUntil: 120,
  rule: 'candidate',
  geometry: {
    center: { x: 100, y: 200, z: 300 },
    centerSigma: 15,
    innerRadius: { value: 39_000, sigma: 400 },
    outerRadius: { value: 52_000, sigma: 600 },
  },
  responses: [
    {
      experiment: 'radial-A',
      axis: 'radial',
      role: 'training',
      response: { value: -0.92, sigma: 0.04 },
      measurementIds: ['burn-1'],
    },
  ],
};

export const wellField = (visual: unknown = acquiredWell): BelievedField => ({
  id: 'measured-well',
  kind: WELL_VIEW_KIND,
  detected: true,
  visual: visual as JsonValue,
});

describe('acquired well display boundary', () => {
  it('requires acquired lineage and a versioned payload; truth-shaped parameters cannot draw a well', () => {
    expect(
      readWellVisual(
        wellField({
          center: acquiredWell.geometry.center,
          innerRadius: 40_000,
          outerRadius: 50_000,
        }),
      ),
    ).toBeUndefined();
    expect(
      readWellVisual(
        wellField({
          ...acquiredWell,
          provenance: { ...acquiredWell.provenance, measurementIds: [] },
        }),
      ),
    ).toBeUndefined();
    expect(readWellVisual({ ...wellField(), detected: false })).toBeUndefined();
    expect(readWellVisual(wellField())).toEqual(acquiredWell);
  });

  it('rejects malformed geometry and nonfinite uncertainties', () => {
    for (const patch of [
      { centerSigma: -1 },
      { centerSigma: NaN },
      { center: { x: 0, y: 0 } },
      { innerRadius: { value: 60_000, sigma: 10 } },
    ])
      expect(
        readWellVisual(
          wellField({ ...acquiredWell, geometry: { ...acquiredWell.geometry, ...patch } }),
        ),
      ).toBeUndefined();
  });

  it('refuses to label the same sample training and held-out', () => {
    expect(
      readWellVisual(
        wellField({
          ...acquiredWell,
          responses: [
            ...acquiredWell.responses,
            { ...acquiredWell.responses[0], role: 'held-out' },
          ],
        }),
      ),
    ).toBeUndefined();
  });

  it('separates unsupported, stale and archived geometry from current acquired support', () => {
    expect(wellDisplayState(acquiredWell, 59)).toBe('unknown');
    expect(wellDisplayState(acquiredWell, 120)).toBe('current');
    expect(wellDisplayState(acquiredWell, 121)).toBe('stale');
    expect(wellDisplayState({ ...acquiredWell, support: 'unresolved' }, 80)).toBe('unresolved');
    expect(
      wellDisplayState(
        { ...acquiredWell, provenance: { ...acquiredWell.provenance, current: false } },
        80,
      ),
    ).toBe('archived');
  });

  it('registers itself and hides unsupported or archived geometry while stale bounds remain marked', async () => {
    await registerWellView();
    expect(fieldViewFor(WELL_VIEW_KIND)).toBe(makeWellView);
    const group = new Group();
    const lines = new LineSet();
    const view = makeWellView({ group, lines });
    const update = (visual: unknown, t = 100) =>
      view.update({
        field: wellField(visual),
        snapshot: { ...viewSnapshot, t },
        scale: 1,
        radius: 1,
        inside: () => true,
        dt: 0.1,
        time: 0,
      });
    update(acquiredWell);
    expect(group.children.map((c) => c.visible)).toEqual([true, true]);
    expect(group.children[0]!.position.toArray()).toEqual([100, 300, -200]);
    update(acquiredWell, 121);
    expect(group.children.map((c) => c.visible)).toEqual([true, false]);
    update({ ...acquiredWell, support: 'unresolved' });
    expect(group.children.every((c) => !c.visible)).toBe(true);
    update({ ...acquiredWell, provenance: { ...acquiredWell.provenance, current: false } });
    expect(group.children.every((c) => !c.visible)).toBe(true);
    update({ params: { center: [0, 0, 0], radius: 50_000 } });
    expect(group.children.every((c) => !c.visible)).toBe(true);
    view.dispose();
    lines.dispose();
    expect(group.children).toHaveLength(0);
  });
});
