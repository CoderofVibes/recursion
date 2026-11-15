/**
 * Truth-side S22 throat diagnostics. Reuses the retained simulation's occupied
 * prism geometry; this module neither stops flight nor mutates field activation.
 * General curved/rotating/deploying first contact and terminal event ordering
 * remain the integrator's responsibility. Rebuild this immutable adapter at births.
 */
import type { MassProperties } from '../../contracts/ship.ts';
import { hullReach } from '../../contracts/ship.ts';
import type { FieldInstanceSpec } from '../../contracts/truth/fields.ts';
import type { Quat } from '../../lib/quat.ts';
import * as quat from '../../lib/quat.ts';
import type { Vec3 } from '../../lib/vec3.ts';
import * as v3 from '../../lib/vec3.ts';
import { createPrismResult, packPrism, pointHull, segmentHull } from '../../sim/geometry.ts';
import {
  createFunnelCrushIndex,
  readFunnelParameters,
  type FunnelActivation,
} from '../../sim/fields/wells.ts';

export interface HullPose {
  readonly position: Vec3;
  readonly attitude: Quat;
}

export type OccupiedHull = Pick<MassProperties, 'centerOfMass' | 'hull'>;

export interface FunnelHullContact {
  readonly field: string;
  readonly cause: 'structural';
  /** Query epoch for contactsAt; earliest active contact epoch for the linear sweep. */
  readonly t: number;
  /**
   * Point query: signed prism distance minus throat radius. Sweep: minimum
   * nonnegative centre-to-hull distance minus radius over the active interval.
   * A sweep entering the hull therefore clamps this diagnostic at -throatRadius.
   */
  readonly clearance: number;
}

export interface FunnelHullHazards {
  readonly size: number;
  /** Exact instantaneous occupied-hull/sphere overlap, including surface contact. */
  contactsAt(pose: HullPose, hull: OccupiedHull, t: number): readonly FunnelHullContact[];
  /**
   * One unchanged hull, COM datum and attitude, translating linearly between COM
   * endpoints. No ending attitude/hull is accepted: this is not a rotating hull,
   * deployment, curved orbit or accelerated-trajectory certificate.
   */
  linearFixedHullSweep(
    pose: HullPose,
    hull: OccupiedHull,
    endCOM: Vec3,
    t0: number,
    t1: number,
  ): readonly FunnelHullContact[];
}

function checkedHull(pose: HullPose, hull: OccupiedHull) {
  const norm = quat.norm(pose.attitude);
  if (
    !v3.isFinite3(pose.position) ||
    !quat.isFiniteQuat(pose.attitude) ||
    Math.abs(norm - 1) > 1e-10 ||
    !v3.isFinite3(hull.centerOfMass)
  )
    throw new Error('funnel hull query requires finite pose/COM and unit attitude');
  const packed = hull.hull
    .filter((part) => part.outline.length > 0)
    .map((part) => {
      if (
        !Number.isFinite(part.zMin) ||
        !Number.isFinite(part.zMax) ||
        part.zMin > part.zMax ||
        part.outline.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))
      )
        throw new Error('funnel hull prism must be finite with ordered caps');
      return packPrism(part.outline, part.zMin, part.zMax);
    });
  // Same empty-hull convention as sim.prepare: a point at the centre of mass.
  if (packed.length === 0)
    packed.push(packPrism([hull.centerOfMass], hull.centerOfMass.z, hull.centerOfMass.z));
  const radius = hullReach(hull.hull, hull.centerOfMass);
  if (!Number.isFinite(radius)) throw new Error('funnel hull reach overflow');
  return { packed, radius, attitude: quat.normalize(pose.attitude) };
}

function active(activation: FunnelActivation, t: number): boolean {
  return (
    activation.phase === 'initial' || (activation.phase === 'active' && t >= activation.activeSince)
  );
}

/** Accepts funnel specs only. Parsed geometry/activation and the index are detached from input. */
export function createFunnelHullHazards(specs: readonly FieldInstanceSpec[]): FunnelHullHazards {
  const throats = new Map(
    specs.map((spec) => {
      const p = readFunnelParameters(spec);
      return [
        spec.id,
        {
          center: v3.addScaled(p.mouth, p.axis, p.length),
          radius: p.throatRadius,
          activation: p.activation,
        },
      ] as const;
    }),
  );
  const index = createFunnelCrushIndex(specs);
  const order = (a: FunnelHullContact, b: FunnelHullContact) =>
    a.t - b.t || (a.field < b.field ? -1 : a.field > b.field ? 1 : 0);
  const inDatum = (center: Vec3, com: Vec3, attitude: Quat, datumCOM: Vec3) =>
    v3.add(datumCOM, quat.rotateInverse(attitude, v3.sub(center, com)));

  const contactsAt = (
    pose: HullPose,
    hull: OccupiedHull,
    t: number,
  ): readonly FunnelHullContact[] => {
    if (!Number.isFinite(t)) throw new Error('funnel hull time must be finite');
    const { packed, radius, attitude } = checkedHull(pose, hull);
    const scratch = createPrismResult();
    const contacts: FunnelHullContact[] = [];
    for (const id of index.candidatesAlongSegment(pose.position, pose.position, radius)) {
      const throat = throats.get(id)!;
      if (!active(throat.activation, t)) continue;
      const p = inDatum(throat.center, pose.position, attitude, hull.centerOfMass);
      const clearance = pointHull(p.x, p.y, p.z, packed, scratch).distance - throat.radius;
      if (clearance <= 0) contacts.push({ field: id, cause: 'structural', t, clearance });
    }
    return contacts.sort(order);
  };
  return {
    size: index.size,
    contactsAt,
    linearFixedHullSweep(pose, hull, endCOM, t0, t1) {
      if (!v3.isFinite3(endCOM) || !Number.isFinite(t0) || !Number.isFinite(t1) || t1 < t0)
        throw new Error('funnel hull sweep needs finite endpoints and ordered times');
      if (t0 === t1) {
        if (!v3.equals(pose.position, endCOM))
          throw new Error('zero-duration funnel hull sweep cannot translate');
        return contactsAt(pose, hull, t0);
      }
      const { packed, radius, attitude } = checkedHull(pose, hull);
      const scratch = createPrismResult();
      const contacts: FunnelHullContact[] = [];
      for (const id of index.candidatesAlongSegment(pose.position, endCOM, radius)) {
        const throat = throats.get(id)!;
        if (!active(throat.activation, t1)) continue;
        const begins =
          throat.activation.phase === 'active' ? Math.max(t0, throat.activation.activeSince) : t0;
        const startCOM = v3.lerp(pose.position, endCOM, (begins - t0) / (t1 - t0));
        const a = inDatum(throat.center, startCOM, attitude, hull.centerOfMass);
        const b = inDatum(throat.center, endCOM, attitude, hull.centerOfMass);
        const result = segmentHull(a.x, a.y, a.z, b.x, b.y, b.z, packed, throat.radius, scratch);
        if (result.hit >= 0)
          contacts.push({
            field: id,
            cause: 'structural',
            t: begins + result.hit * (t1 - begins),
            clearance: result.distance - throat.radius,
          });
      }
      return contacts.sort(order);
    },
  };
}
