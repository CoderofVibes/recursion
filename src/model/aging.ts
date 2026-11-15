/**
 * Aging of ship calibrations (1G spec §3.7; DECISIONS A5 item 4).
 *
 * Each ship calibration (engine scale and its two misalignment angles, the RCS translation
 * scale, accelerometer scale, the three components of the camera misalignment) is a random walk
 * on the ship's own clock. Its variance grows with ship time, with use, and at each
 * drop in the equipment's reported condition. The world (body masses, the law, profiles) and
 * adopted rules do not age. Rates are [ASSUMED] play values (settings.ts).
 */

import type { AttemptRecord, ParameterId, TransitRecord } from '../contracts/index.ts';
import { RCS_GROUP } from './adapt.ts';
import type { ThrustSegment } from './dynamics.ts';
import type { ModelSettings } from './settings.ts';

export const DAY = 86400;

export type AgingClassId =
  'engineScale' | 'engineMisalignment' | 'rcsScale' | 'accelScale' | 'cameraBias';

export interface AgingClass {
  /** σ added per √(day of ship time). */
  readonly perRootDay: number;
  /** σ added per √(use / useRef). */
  readonly perRootUse: number;
  readonly useRef: number;
  /** σ added per unit of reported condition lost. */
  readonly perCondition: number;
}

export function agingClass(s: ModelSettings, id: AgingClassId): AgingClass {
  switch (id) {
    case 'engineScale':
      return {
        perRootDay: s.agingEngineScaleDay,
        perRootUse: s.agingEngineScaleUse,
        useRef: s.agingEngineUseRef,
        perCondition: s.agingEngineScaleCondition,
      };
    case 'engineMisalignment':
      return {
        perRootDay: s.agingMisalignmentDay,
        perRootUse: s.agingMisalignmentUse,
        useRef: s.agingEngineUseRef,
        perCondition: s.agingMisalignmentCondition,
      };
    case 'rcsScale':
      return {
        perRootDay: s.agingRcsScaleDay,
        perRootUse: s.agingRcsScaleUse,
        useRef: s.agingRcsUseRef,
        perCondition: s.agingRcsScaleCondition,
      };
    case 'accelScale':
      return {
        perRootDay: s.agingAccelScaleDay,
        perRootUse: 0,
        useRef: 1,
        perCondition: s.agingAccelScaleCondition,
      };
    case 'cameraBias':
      return {
        perRootDay: s.agingCameraBiasDay,
        perRootUse: s.agingCameraBiasCycle,
        useRef: 1,
        perCondition: s.agingCameraBiasCondition,
      };
  }
}

/** Variance added over `dt` seconds of ship time, `use` (class unit) and condition drops. */
export function accruedVariance(
  cls: AgingClass,
  dt: number,
  use: number,
  drops: readonly number[],
): number {
  let v = cls.perRootDay ** 2 * (Math.max(dt, 0) / DAY);
  if (cls.useRef > 0) v += cls.perRootUse ** 2 * (Math.max(use, 0) / cls.useRef);
  for (const d of drops) v += (cls.perCondition * d) ** 2;
  return v;
}

/**
 * Which ship calibration a parameter is, and the equipment whose use and damage age it. The
 * pitch misalignment ages with the rates of the yaw one (the same thrust line, the other axis)
 * and each camera component with the planar camera bias's (spec §3.7). For the RCS scale the
 * equipment is the group `rcs`: every RCS pod's damage counts.
 */
export function agingOf(
  id: ParameterId,
  cameraId: string,
): { cls: AgingClassId; equipment: string } | null {
  if (id === `thruster.${RCS_GROUP}.scale`) return { cls: 'rcsScale', equipment: RCS_GROUP };
  let m = /^thruster\.(.+)\.scale$/.exec(id);
  if (m) return { cls: 'engineScale', equipment: m[1]! };
  m = /^thruster\.(.+)\.misalignment(-pitch)?$/.exec(id);
  if (m) return { cls: 'engineMisalignment', equipment: m[1]! };
  m = /^sensor\.(.+)\.scale$/.exec(id);
  if (m) return { cls: 'accelScale', equipment: m[1]! };
  m = /^sensor\.(.+)\.bias(-x|-y)?$/.exec(id);
  if (m && m[1] === cameraId) return { cls: 'cameraBias', equipment: m[1] };
  return null;
}

/** Does a record about `equipment` concern the equipment (or group) a calibration ages with? */
function concerns(group: string, equipment: string): boolean {
  return group === RCS_GROUP
    ? equipment === RCS_GROUP || equipment.startsWith(`${RCS_GROUP}-`)
    : equipment === group;
}

/**
 * Commanded Δv (m/s) of one thruster's segments over [t0, t1): Σ u · overlap for an engine,
 * Σ |a_rcs| · overlap for the RCS group.
 */
export function commandedDv(
  segments: readonly ThrustSegment[],
  thruster: string | null,
  t0: number,
  t1: number,
): number {
  let dv = 0;
  for (const c of segments) {
    if (thruster !== null && c.thruster !== thruster) continue;
    const a =
      thruster === RCS_GROUP ? Math.hypot(c.rcs?.[0] ?? 0, c.rcs?.[1] ?? 0, c.rcs?.[2] ?? 0) : c.u;
    dv += a * Math.max(0, Math.min(c.t1, t1) - Math.max(c.t0, t0));
  }
  return dv;
}

/** Camera power-on transitions recorded in an attempt over (t0, t1]. */
export function powerCycles(rec: AttemptRecord, camera: string, t0: number, t1: number): number {
  let on = true;
  let n = 0;
  for (const c of [...rec.executed].sort((a, b) => a.t - b.t)) {
    if (c.status === 'rejected') continue;
    const cmd = c.command;
    let next: boolean | null = null;
    if (cmd.kind === 'mode' && cmd.equipment === camera) next = cmd.mode !== 'off';
    if (cmd.kind === 'power' && cmd.equipment === camera) next = cmd.allocation > 0;
    if (next === null) continue;
    if (next && !on && c.t > t0 && c.t <= t1) n++;
    on = next;
  }
  return n;
}

/** Drops in reported condition of `equipment` over (t0, t1] (condition-changed events). */
export function conditionDrops(
  rec: AttemptRecord,
  equipment: string,
  t0: number,
  t1: number,
): number[] {
  let last: number;
  const drops: number[] = [];
  // For a group (the RCS pods) each member's condition is followed on its own.
  const lastOf = new Map<string, number>();
  for (const e of rec.events) {
    if (e.kind !== 'condition-changed' || !concerns(equipment, e.equipment)) continue;
    last = lastOf.get(e.equipment) ?? 1;
    if (e.condition < last && e.t > t0 && e.t <= t1) drops.push(last - e.condition);
    lastOf.set(e.equipment, e.condition);
  }
  return drops;
}

export interface AgingHistory {
  readonly shipTime: number;
  readonly deltaV: number;
  readonly powerCycles: number;
  readonly drops: readonly number[];
}

/** What aged a parameter over (t0, t1] of an attempt. */
export function historyIn(
  rec: AttemptRecord,
  segments: readonly ThrustSegment[],
  cls: AgingClassId,
  equipment: string,
  t0: number,
  t1: number,
): AgingHistory {
  const engine = cls === 'engineScale' || cls === 'engineMisalignment' || cls === 'rcsScale';
  return {
    shipTime: Math.max(0, t1 - t0),
    deltaV: engine ? commandedDv(segments, equipment, t0, t1) : 0,
    powerCycles: cls === 'cameraBias' ? powerCycles(rec, equipment, t0, t1) : 0,
    drops: conditionDrops(rec, equipment, t0, t1),
  };
}

export function historyVariance(cls: AgingClass, id: AgingClassId, h: AgingHistory): number {
  const use = id === 'cameraBias' ? h.powerCycles : id === 'accelScale' ? 0 : h.deltaV;
  return accruedVariance(cls, h.shipTime, use, h.drops);
}

/** Reported condition of `equipment` at the end of an attempt (1 if never reported). */
export function conditionAtEnd(rec: AttemptRecord | undefined, equipment: string): number {
  let c = 1;
  for (const e of rec?.events ?? [])
    if (e.kind === 'condition-changed' && e.equipment === equipment) c = e.condition;
  return c;
}

/**
 * A transit between encounters as an aging history (spec §3.7 item 3, §11.5). Drops count from
 * `startCondition`, the condition when the carrying attempt ended (default 1, which errs wide).
 */
export function transitHistory(
  t: TransitRecord,
  equipment: string,
  startCondition = 1,
): AgingHistory {
  const drops: number[] = [];
  const lastOf = new Map<string, number>();
  for (const e of t.conditionChanges) {
    if (!concerns(equipment, e.equipment)) continue;
    const last = lastOf.get(e.equipment) ?? startCondition;
    if (e.condition < last) drops.push(last - e.condition);
    lastOf.set(e.equipment, e.condition);
  }
  // A transit records the main engine's commanded Δv, not the jets': no RCS use is known.
  const deltaV = equipment === RCS_GROUP ? 0 : t.deltaV;
  return { shipTime: t.shipTime, deltaV, powerCycles: t.powerCycles, drops };
}

export function addHistories(a: AgingHistory, b: AgingHistory): AgingHistory {
  return {
    shipTime: a.shipTime + b.shipTime,
    deltaV: a.deltaV + b.deltaV,
    powerCycles: a.powerCycles + b.powerCycles,
    drops: [...a.drops, ...b.drops],
  };
}
