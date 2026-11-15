/** TRUTH. R50's unaided-eye producer. Only projected light leaves this file (P11).
 * Geometry/lifecycle stay here; the renderer receives neither the catalogue nor distances.
 * Assumed photometry: resolved violet filaments, a faint 900 s precursor and a 120 s birth.
 * Tessellation is chosen BEFORE projection/occlusion, with a fixed total work budget.
 */
import type { WindowField, WindowFunnel } from '../contracts/view.ts';
import type { FieldInstanceSpec, TruthWorld } from '../contracts/truth/index.ts';
import type { InverseWellsSetup } from '../content/inverse-wells/index.ts';
import { S22_PRECURSOR_SECONDS } from '../content/inverse-wells/lifecycle.ts';
import { projectFunnelOptics } from '../content/inverse-wells/optics.ts';
import { rotate } from '../lib/quat.ts';
import * as v3 from '../lib/vec3.ts';
import { readFunnelParameters, type FunnelParameters } from '../sim/fields/wells.ts';
import { visibleWellIntervals } from '../ship/sensors/wells-visibility.ts';

const HALF_ANGLE = (88 * Math.PI) / 180;
const MAX_SITES = 128;
const MAX_SEGMENTS = 2048;
const FULL = [[0, 1]] as const;
const DETAIL = [0, 0.15, 0.3, 0.45, 0.6, 0.73, 0.84, 0.93, 1];
const MEDIUM = [0, 0.35, 0.65, 0.85, 1];
const installed = new WeakMap<InverseWellsSetup, (world: TruthWorld) => readonly WindowField[]>();

export function createFunnelWindow(
  setup: InverseWellsSetup,
): (world: TruthWorld) => readonly WindowField[] {
  const existing = installed.get(setup);
  if (existing) return existing;
  const otherLight = setup.window;
  const births = new Map(setup.funnelLifecycle?.sites.map((s) => [s.id, s.nominalBirth]));
  const parsed = new WeakMap<FieldInstanceSpec, FunnelParameters>();
  let previous: TruthWorld | undefined;
  let result: readonly WindowField[] = [];
  const window = (world: TruthWorld): readonly WindowField[] => {
    // Snapshots of the same committed truth state share the optical calculation.
    if (world === previous) return result;
    const eye = world.ship.kinematics.position;
    const forward = rotate(world.ship.kinematics.attitude, v3.UNIT_X);
    const candidates = [];
    for (const spec of world.fields) {
      let p = parsed.get(spec);
      if (!p) {
        p = readFunnelParameters(spec);
        parsed.set(spec, p);
      }
      let phase: WindowFunnel['phase'] = 'active',
        brightness = 1;
      const activation = p.activation;
      if (activation.phase === 'cancelled') continue;
      if (activation.phase === 'pending') {
        const birth = births.get(spec.id);
        if (birth == null || world.t >= birth || world.t < birth - S22_PRECURSOR_SECONDS) continue;
        phase = 'precursor';
        brightness = 0.08 + 0.22 * (1 - (birth - world.t) / S22_PRECURSOR_SECONDS);
      } else if (activation.phase === 'active') {
        const age = world.t - activation.activeSince;
        if (age < 0) continue;
        if (age < p.rampDuration) {
          phase = 'ramping';
          brightness = 0.3 + (0.7 * age) / p.rampDuration;
        }
      }
      const center = v3.addScaled(p.mouth, p.axis, p.length * 0.5);
      const delta = v3.sub(center, eye),
        distance = v3.length(delta);
      const bound = Math.hypot(p.length * 0.5, p.mouthRadius);
      const extent = distance <= bound ? Math.PI : Math.asin(bound / distance);
      const direction = v3.scale(delta, 1 / Math.max(distance, 1));
      const offAxis = Math.acos(Math.max(-1, Math.min(1, v3.dot(direction, forward))));
      if (extent < 0.0003 || offAxis > HALF_ANGLE + extent) continue;
      candidates.push({ spec, phase, brightness, extent, direction, distance, bound, offAxis });
    }
    candidates.sort((a, b) => b.extent - a.extent);
    candidates.length = Math.min(candidates.length, MAX_SITES);
    const opaque = [...world.bodies, ...world.asteroids].map((o) => {
      const delta = v3.sub(o.position, eye),
        distance = v3.length(delta);
      return {
        center: o.position,
        radius: o.radius,
        distance,
        direction: v3.scale(delta, 1 / Math.max(distance, 1)),
        extent: Math.asin(Math.min(1, o.radius / Math.max(distance, 1))),
      };
    });
    const fields: WindowField[] = [...(otherLight?.(world) ?? [])];
    let remaining = MAX_SEGMENTS;
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i]!;
      // Reserve four true arcs per remaining distant site: a thread and the throat rim.
      const available = remaining - (candidates.length - i - 1) * 4;
      const detailed = i < 3 && c.extent > 0.08 && available >= 272;
      const medium = !detailed && c.extent > 0.018 && available >= 72;
      const stations = detailed ? DETAIL : medium ? MEDIUM : [0, 1];
      const azimuthSegments = detailed ? 16 : medium ? 8 : 3;
      const occluders = opaque.filter(
        (o) =>
          o.distance - o.radius < c.distance + c.bound &&
          v3.dot(o.direction, c.direction) >= Math.cos(Math.min(Math.PI, o.extent + c.extent)),
      );
      const wholeCone = c.offAxis + c.extent < HALF_ANGLE;
      const visual = projectFunnelOptics(c.spec, {
        eye,
        observedAt: world.t,
        brightness: c.brightness,
        phase: c.phase,
        stations,
        azimuthSegments,
        visibleParts: (segment) => {
          // Far LOD retains physical support, never substitutes a guessed position/axis.
          if (!detailed && !medium && !(segment.fromFraction === 1 || segment.index === 1))
            return [];
          return wholeCone && occluders.length === 0
            ? FULL
            : visibleWellIntervals(segment.from, segment.to, eye, forward, HALF_ANGLE, occluders);
        },
      });
      // Clipping may split an arc. Keep the total channel budget hard even then.
      if (visual && visual.segments.length <= remaining) {
        fields.push({ kind: 'funnel', id: c.spec.id, ...visual });
        remaining -= visual.segments.length;
      }
    }
    previous = world;
    result = fields;
    return result;
  };
  // adaptSetup runs inside the truth stepper, while session.windowView retains the provider
  // setup. Install the optical hook on that same setup too; no session/renderer edits needed.
  Object.assign(setup, { window });
  installed.set(setup, window);
  return window;
}
