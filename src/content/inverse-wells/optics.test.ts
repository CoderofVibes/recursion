import { describe, expect, it } from 'vitest';
import { funnelSpec, wellSpec } from '../../sim/fields/wells.ts';
import * as v3 from '../../lib/vec3.ts';
import { readWindowFunnelVisual } from '../../view3d/fields/wells/funnel.ts';
import {
  projectFunnelOptics,
  type FunnelOpticalSegment,
  type FunnelOpticsInput,
  type OpticalInterval,
} from './optics.ts';

const mouth = { x: 10, y: 20, z: 30 };
const axis = { x: 0.6, y: 0, z: 0.8 };
const spec = funnelSpec('visible-site', mouth, axis, { phase: 'pending' });
const allVisible = (_segment: FunnelOpticalSegment): readonly OpticalInterval[] => [[0, 1]];
const input: FunnelOpticsInput = {
  eye: { x: -100_000, y: 50_000, z: -300_000 },
  observedAt: 400,
  brightness: 0.4,
  phase: 'precursor',
  stations: [0, 0.5, 1],
  azimuthSegments: 8,
  visibleParts: allVisible,
};

describe('S22 angular-only eye projection', () => {
  it('places caller-selected contour vertices on the quadratic taper at an arbitrary 3D orientation', () => {
    const acquired: FunnelOpticalSegment[] = [];
    const result = projectFunnelOptics(spec, {
      ...input,
      visibleParts(segment) {
        acquired.push(segment);
        return [[0, 1]];
      },
    });
    expect(result).toBeDefined();
    expect(acquired).toHaveLength(40);
    const expectedRadii = new Map([
      [0, 20_000],
      [0.5, 5_750],
      [1, 1_000],
    ]);
    for (const segment of acquired) {
      for (const [point, fraction] of [
        [segment.from, segment.fromFraction],
        [segment.to, segment.toFraction],
      ] as const) {
        const offset = v3.sub(point, mouth);
        const axial = v3.dot(offset, axis);
        expect(axial).toBeCloseTo(fraction * 120_000, 8);
        expect(v3.length(v3.addScaled(offset, axis, -axial))).toBeCloseTo(
          expectedRadii.get(fraction)!,
          8,
        );
      }
    }
    for (const segment of result!.segments) {
      expect(v3.length(segment.from)).toBeCloseTo(1, 14);
      expect(v3.length(segment.to)).toBeCloseTo(1, 14);
    }
    expect(result!.segments[0]!.depth).toBe(1); // Sparse mouth: dim theme coordinate.
    expect(result!.segments.at(-1)!.depth).toBe(0); // Luminous throat.
    expect(readWindowFunnelVisual(result)).toEqual(result);
  });

  it('projects only the callback-approved pieces, including multiple occlusion fragments', () => {
    let source: FunnelOpticalSegment | undefined;
    const result = projectFunnelOptics(spec, {
      ...input,
      visibleParts(segment) {
        if (segment.index !== 1) return [];
        source = segment;
        return [
          [0.25, 0.5],
          [0.75, 1],
        ];
      },
    });
    expect(source!.kind).toBe('meridian');
    expect(result!.segments).toHaveLength(2);
    const from = v3.normalize(v3.sub(v3.lerp(source!.from, source!.to, 0.25), input.eye));
    const to = v3.normalize(v3.sub(v3.lerp(source!.from, source!.to, 0.5), input.eye));
    expect(v3.distance(result!.segments[0]!.from, from)).toBeLessThan(1e-14);
    expect(v3.distance(result!.segments[0]!.to, to)).toBeLessThan(1e-14);
    expect(result!.segments.map((s) => s.depth)).toEqual([0.8125, 0.5625]);
  });

  it('returns no product for occlusion or zero supplied light, without a fully-visible default', () => {
    let clips = 0;
    expect(
      projectFunnelOptics(spec, {
        ...input,
        visibleParts() {
          clips++;
          return [];
        },
      }),
    ).toBeUndefined();
    expect(clips).toBe(40);
    expect(projectFunnelOptics(spec, { ...input, brightness: 0 })).toBeUndefined();
    expect(() =>
      projectFunnelOptics(spec, {
        ...input,
        visibleParts: undefined,
      } as unknown as FunnelOpticsInput),
    ).toThrow(/clipper is required/);
  });

  it('drops a zero-length eye ray or a contour crossing the eye instead of emitting invalid directions', () => {
    let first: FunnelOpticalSegment | undefined;
    projectFunnelOptics(spec, {
      ...input,
      visibleParts(segment) {
        if (segment.index === 0) first = segment;
        return [];
      },
    });
    const selectFirst = (segment: FunnelOpticalSegment): readonly OpticalInterval[] =>
      segment.index === 0 ? [[0, 1]] : [];
    expect(
      projectFunnelOptics(spec, { ...input, eye: first!.from, visibleParts: selectFirst }),
    ).toBeUndefined();
    expect(
      projectFunnelOptics(spec, {
        ...input,
        eye: v3.lerp(first!.from, first!.to, 0.5),
        visibleParts: selectFirst,
      }),
    ).toBeUndefined();
  });

  it('carries only angular light evidence and does not infer phase or brightness from physical lifecycle', () => {
    const result = projectFunnelOptics(spec, input)!;
    expect(Object.keys(result).sort()).toEqual([
      'brightness',
      'observedAt',
      'phase',
      'schema',
      'segments',
      'visible',
    ]);
    expect(Object.keys(result.segments[0]!).sort()).toEqual(['depth', 'from', 'to']);
    expect(result.brightness).toBe(input.brightness);
    expect(result.phase).toBe(input.phase);
    const changedTruth = funnelSpec('different-hidden-id', mouth, axis, {
      phase: 'active',
      activeSince: -1e6,
    });
    expect(projectFunnelOptics(changedTruth, input)).toEqual(result);
    // The API has no nav-camera state: unaided eye light is unchanged when that unrelated input changes.
    expect(
      projectFunnelOptics(spec, { ...input, navCameraPowered: false } as FunnelOpticsInput),
    ).toEqual(result);
    expect(
      projectFunnelOptics(spec, { ...input, navCameraPowered: true } as FunnelOpticsInput),
    ).toEqual(result);
    expect(() => projectFunnelOptics(wellSpec('old-sphere', mouth), input)).toThrow(/profile/);
  });

  it('rejects malformed inputs and invalid, overlapping or out-of-order visible intervals', () => {
    for (const patch of [
      { eye: { x: NaN, y: 0, z: 0 } },
      { observedAt: Infinity },
      { brightness: -1 },
      { brightness: 1.1 },
      { brightness: NaN },
      { phase: 'cancelled' },
      { stations: [] },
      { stations: [0, 0.5, 0.5, 1] },
      { stations: [0.8, 0.2] },
      { stations: [0, Infinity] },
      { stations: [-0.1, 1] },
      { azimuthSegments: 2 },
      { azimuthSegments: 3.5 },
      { azimuthSegments: Infinity },
    ])
      expect(() =>
        projectFunnelOptics(spec, { ...input, ...patch } as unknown as FunnelOpticsInput),
      ).toThrow(/optical/);
    for (const parts of [
      [[-0.1, 0.5]],
      [[0, 1.1]],
      [[0.5, 0.2]],
      [[0, 0]],
      [[0, NaN]],
      [
        [0, 0.6],
        [0.4, 1],
      ],
      [
        [0.7, 0.9],
        [0.1, 0.3],
      ],
      [[0]],
      null,
    ])
      expect(() =>
        projectFunnelOptics(spec, {
          ...input,
          visibleParts: () => parts as unknown as readonly OpticalInterval[],
        }),
      ).toThrow(/optical/);
  });
});
