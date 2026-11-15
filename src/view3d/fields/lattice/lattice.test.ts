import { Group } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { viewSnapshot } from '../../../contracts/fixtures/index.ts';
import { motion } from '../../../theme/index.ts';
import { LineSet } from '../../gfx.ts';
import { coverageState, readLatticeVisual } from './data.ts';
import type { LatticeVisual } from './data.ts';
import { clipSegments, unknownHatch, revealedSegments } from './geometry.ts';
import { makeLatticeView } from './LatticeView.ts';

const box = { center: { x: 0, y: 0, z: 0 }, halfSize: { x: 20, y: 20, z: 20 } };
const evidence = {
  observedFrom: 1,
  observedTo: 4,
  validUntil: 10,
  sampleIds: ['retained:1', 'retained:2'],
};
const fixture: LatticeVisual = {
  schema: 'lattice-observations-v1',
  frameId: 'relative-nav:1',
  attemptId: 'attempt:1',
  updatedAt: 4,
  enabled: true,
  quality: 1,
  requestedVolume: box,
  strands: [
    {
      id: 'observed:1',
      points: [
        { x: -10, y: -10, z: 0 },
        { x: 10, y: 10, z: 0 },
      ],
      sigmaM: 0.5,
      confidence: 0.997,
      ...evidence,
    },
  ],
  coverage: [],
};

describe('lattice evidence display boundary', () => {
  it('clips crossing fragments to the spherical hologram without dropping both-outside segments', () => {
    expect(clipSegments([-20, 0, 0, 20, 0, 0], { x: 0, y: 0, z: 0 }, 10)).toEqual([
      -10, 0, 0, 10, 0, 0,
    ]);
    expect(clipSegments([-20, 11, 0, 20, 11, 0], { x: 0, y: 0, z: 0 }, 10)).toEqual([]);
  });
  it('rejects complete field geometry and malformed unsupported fragments', () => {
    expect(readLatticeVisual({ kind: 'lattice', layers: [box], seed: 5 })).toBeNull();
    expect(
      readLatticeVisual({ ...fixture, strands: [{ ...fixture.strands[0], sampleIds: [] }] })
        ?.strands,
    ).toEqual([]);
    expect(
      readLatticeVisual({
        ...fixture,
        strands: [{ ...fixture.strands[0], points: [{ x: NaN, y: 1, z: 2 }] }],
      })?.strands,
    ).toEqual([]);
    expect(
      readLatticeVisual({ ...fixture, strands: [{ ...fixture.strands[0], sigmaM: -1 }] })?.strands,
    ).toEqual([]);
  });

  it('never uses fitted endpoints to clear the intervening volume', () => {
    const empty = unknownHatch({ ...fixture, strands: [] }, 4);
    expect(unknownHatch(fixture, 4)).toEqual(empty);
    const parsed = readLatticeVisual({
      ...fixture,
      coverage: [{ ...box, ...evidence, id: 'patch:1', status: 'clear-supported' }],
    })!;
    expect(parsed.coverage[0]!.status).toBe('unresolved');
    expect(unknownHatch(parsed, 4)).toEqual(empty);
  });

  it('only fresh calibrated whole-volume coverage removes unknown hatch', () => {
    const parsed = readLatticeVisual({
      ...fixture,
      coverage: [
        {
          ...box,
          ...evidence,
          id: 'patch:1',
          status: 'clear-supported',
          certificate: {
            calibrated: true,
            confidenceSigmas: 3,
            resolutionM: 1,
            undetectedSupportM: 1,
            sampleIds: ['retained:coverage'],
          },
        },
      ],
    })!;
    expect(unknownHatch(parsed, 5)).toEqual([]);
    expect(coverageState(parsed.coverage[0]!, 11)).toBe('unresolved');
    expect(unknownHatch(parsed, 11).length).toBeGreaterThan(0);
    expect(unknownHatch(parsed, 3).length).toBeGreaterThan(0);
    const partial = {
      ...parsed,
      coverage: parsed.coverage.map((p) => ({ ...p, halfSize: { x: 1, y: 1, z: 1 } })),
    };
    expect(unknownHatch(partial, 5)).toEqual(unknownHatch(fixture, 5));
  });

  it('reveals fragment length monotonically without connecting gaps', () => {
    const points = fixture.strands[0]!.points;
    expect(revealedSegments(points, 0)).toEqual([]);
    expect(revealedSegments(points, 0.5)).toEqual([-10, 0, 10, 0, 0, -0]);
    expect(revealedSegments(points, 1)).toEqual([-10, 0, 10, 10, 0, -10]);
    const other = [
      { x: 50, y: 50, z: 20 },
      { x: 70, y: 50, z: 20 },
    ];
    expect([...revealedSegments(points, 1), ...revealedSegments(other, 1)].length).toBe(12);
  });
});

class FakeElement {
  className = '';
  textContent = '';
  style: Record<string, string> = {};
  parentNode = null;
  ownerDocument = { defaultView: { Element: FakeElement } };
  setAttribute(): void {}
}

describe('lattice plugin', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('draws only supplied evidence, ages into uncertainty and disposes its group', () => {
    vi.stubGlobal('document', { createElement: () => new FakeElement() });
    const group = new Group();
    const lines = new LineSet();
    const view = makeLatticeView({ group, lines });
    const frame = (time: number, now = 5) => ({
      field: {
        id: 'field',
        kind: 'lattice',
        detected: true,
        visual: JSON.parse(JSON.stringify(fixture)),
      },
      snapshot: {
        ...viewSnapshot,
        t: now,
        world: {
          ...viewSnapshot.world,
          ship: { ...viewSnapshot.world.ship, position: { x: 0, y: 0, z: 0 } },
        },
      },
      scale: 1,
      radius: 100,
      inside: () => true,
      dt: 0.016,
      time,
    });
    view.update(frame(0));
    view.update(frame(motion.settle / 1000));
    const root = group.getObjectByName('lattice-evidence')!;
    expect(root.visible).toBe(true);
    expect(root.getObjectByName('unresolved-volume')!.visible).toBe(true);
    view.update(frame(2, 11));
    expect(root.getObjectByName('unresolved-volume')!.visible).toBe(true);
    view.update({ ...frame(3), field: { id: 'field', kind: 'lattice', detected: true } });
    expect(root.visible).toBe(false);
    view.dispose();
    lines.dispose();
    expect(group.children).toHaveLength(0);
  });
});
