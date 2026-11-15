/** Trailer-only contour refinement of the captured real field. No objects or poses change. */
import type { FieldInstanceSpec } from '../../../contracts/truth/index.ts';
import type { JsonValue } from '../../../contracts/index.ts';
import { projectFunnelOptics } from '../../../content/inverse-wells/optics.ts';
import { visibleWellIntervals } from '../../../ship/sensors/wells-visibility.ts';
import { rotate } from '../../../lib/quat.ts';
import { optics } from './state.ts';
import capture from './fixture.json';

/**
 * VX selects the sites, phases, brightness and eye. The live producer's 2,048-arc budget leaves
 * most distant wells as four-arc threads. A prepared shot can keep full contour rings using
 * 3B's exact projector, within VX's renderer's 60,000-arc budget. This extra detail is disclosed
 * as trailer staging. The captured sight has no opaque objects in its forward cone.
 */
export function detailedOptics() {
  const geometry = new Map(capture.geometry.map((g) => [g.id, g]));
  const eye = capture.shipKinematics.position;
  const forward = rotate(capture.shipKinematics.attitude, { x: 1, y: 0, z: 0 });
  if (
    capture.snapshot.window.objects.some(
      (o) =>
        Math.acos(
          Math.max(
            -1,
            Math.min(
              1,
              o.direction.x * forward.x + o.direction.y * forward.y + o.direction.z * forward.z,
            ),
          ),
        ) -
          o.angularRadius <
        (88 * Math.PI) / 180,
    )
  )
    throw new Error('Recheck occluders for this capture');
  return optics.map((source) => {
    const spec: FieldInstanceSpec = {
      id: source.id,
      kind: 'inverse-well',
      params: geometry.get(source.id)! as unknown as JsonValue,
    };
    const visual = projectFunnelOptics(spec, {
      eye,
      observedAt: source.observedAt,
      phase: source.phase,
      brightness: source.brightness,
      stations: [0, 0.15, 0.3, 0.45, 0.6, 0.73, 0.84, 0.93, 1],
      azimuthSegments: 16,
      visibleParts: (segment) =>
        visibleWellIntervals(segment.from, segment.to, eye, forward, (88 * Math.PI) / 180, []),
    });
    return { id: source.id, kind: 'inverse-well', visual: visual ?? source };
  });
}
