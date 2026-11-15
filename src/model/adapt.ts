/**
 * Black Box records → estimator arcs (contracts README § attempt.ts; 1G spec revision 3: §2,
 * §3.3, §3.5).
 *
 * - Measurements are taken in record order (the array index is the sequence number); a bearing
 *   (azimuth and elevation) and a range of the same target from the same source at the same
 *   time form one optical fix. Each fix carries the recorded attitude at its time, which the
 *   camera misalignment needs (§2.1).
 * - Thrust segments come from executed `burn` / `cutoff` commands and from hands-on `fly`
 *   commands × nominal ratings in the ShipDefinition, with the full recorded star-tracker
 *   attitude, never from truth. A hands-on throttle is a main-engine burn; a hands-on
 *   translation is an RCS segment (demand × the nominal force on that body axis). A `limited`
 *   burn gets an uncertain level (its own parameter with a wide prior).
 * - Accelerometer samples (three body axes) are used only while thrust is commanded, averaged
 *   into bins.
 * - Arcs break at recorded contacts (discontinuities); data gaps do not break arcs.
 * - With `settings.planar` the out-of-plane rows are left out (spec Appendix A.3).
 */

import type {
  AttemptRecord,
  AttitudeTarget,
  EquipmentSpec,
  ExecutedCommand,
  JsonValue,
  Measurement,
  Plan,
  ShipDefinition,
} from '../contracts/index.ts';
import * as quat from '../lib/quat.ts';
import type { Quat } from '../lib/quat.ts';
import type { Vec3 } from '../lib/vec3.ts';
import {
  MIN_ARC_FIXES,
  lineOfSight,
  rangeFixTimes,
  type Arc,
  type EstMeasurement,
  type Fix,
  type Sigma,
  type ThrustSegment,
} from './dynamics.ts';
import type { ModelSettings } from './settings.ts';

/** The thruster id of RCS translation: a group, not an equipment id (contracts README). */
export const RCS_GROUP = 'rcs';

export interface ThrusterInfo {
  readonly id: string;
  readonly thrust: number;
  readonly isp: number;
  /**
   * Rotation from the thruster's own frame (push along +x) to the body frame: the smallest
   * rotation that takes body +x onto the mount's force direction. Absent for a thruster that
   * pushes along body +x (the main engine).
   */
  readonly mount?: Quat;
}

export function thrusterInfo(ship: ShipDefinition, id: string): ThrusterInfo | null {
  const e: EquipmentSpec | undefined = ship.equipment.find((q) => q.id === id);
  if (!e) return null;
  const thrust = e.params.thrust;
  if (thrust === undefined) return null;
  const dir = e.mount?.direction;
  const len = dir ? Math.hypot(dir.x, dir.y, dir.z) : 0;
  const along = !dir || len === 0 || (dir.y === 0 && dir.z === 0 && dir.x > 0);
  return {
    id,
    thrust,
    isp: e.params.isp ?? 0,
    ...(along
      ? {}
      : {
          mount: quat.shortestArc(
            { x: 1, y: 0, z: 0 },
            { x: dir.x / len, y: dir.y / len, z: dir.z / len },
          ),
        }),
  };
}

/** The engine hands-on throttle drives: the first `main-engine` in the ship definition. */
export function mainEngineOf(ship: ShipDefinition): string | undefined {
  return ship.equipment.find((e) => e.kind === 'main-engine')?.id;
}

/** Nominal RCS translation: the force a full deflection gives on each body axis, and the Isp. */
export interface RcsInfo {
  /** Newtons for a full negative and a full positive demand, per body axis (both ≥ 0). */
  readonly force: {
    readonly x: readonly [number, number];
    readonly y: readonly [number, number];
    readonly z: readonly [number, number];
  };
  readonly isp: number;
}

const child = (v: JsonValue | undefined, key: string): JsonValue | undefined =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as { readonly [k: string]: JsonValue })[key]
    : undefined;

/**
 * Nominal hands-on translation from the design (§3.3: demand × nominal force on that axis).
 * From the baseline's `propulsion.rcs.translationForcePerBank` when the definition carries it
 * (`ShipDefinition.systems`); else the sum of the rated thrust of the `rcs-thruster` equipment
 * pushing along each axis. Null for a ship without RCS.
 */
export function rcsInfo(ship: ShipDefinition): RcsInfo | null {
  const pods = ship.equipment.filter((e) => e.kind === 'rcs-thruster');
  const rcs = child(child(ship.systems, 'propulsion'), 'rcs');
  const per = child(rcs, 'translationForcePerBank');
  const ispOf = child(rcs, 'Isp');
  const isp = typeof ispOf === 'number' ? ispOf : (pods[0]?.params.isp ?? 0);
  const axis = (k: string): [number, number] | null => {
    const v = child(per, k);
    return Array.isArray(v) && typeof v[0] === 'number' && typeof v[1] === 'number'
      ? [Math.abs(v[0]), Math.abs(v[1])]
      : null;
  };
  const fx = axis('x');
  const fy = axis('y');
  const fz = axis('z');
  if (fx && fy && fz) return { force: { x: fx, y: fy, z: fz }, isp };
  if (pods.length === 0) return null;
  const sum = { x: [0, 0], y: [0, 0], z: [0, 0] };
  for (const e of pods) {
    const d = e.mount?.direction;
    const thrust = e.params.thrust ?? 0;
    if (!d) continue;
    for (const k of ['x', 'y', 'z'] as const) {
      if (d[k] > 0) sum[k][1]! += thrust * d[k];
      else if (d[k] < 0) sum[k][0]! -= thrust * d[k];
    }
  }
  return {
    force: {
      x: [sum.x[0]!, sum.x[1]!],
      y: [sum.y[0]!, sum.y[1]!],
      z: [sum.z[0]!, sum.z[1]!],
    },
    isp,
  };
}

/** Nominal RCS force (N, body frame) for a translation demand (−1..1 per axis). */
export function rcsForce(info: RcsInfo, translate: Vec3): Vec3 {
  const axis = (demand: number, f: readonly [number, number]) =>
    demand >= 0 ? demand * f[1] : demand * f[0];
  return {
    x: axis(translate.x, info.force.x),
    y: axis(translate.y, info.force.y),
    z: axis(translate.z, info.force.z),
  };
}

/** Dry mass from the nominal design (structure plus equipment). */
export function dryMass(ship: ShipDefinition): number {
  return ship.structureMass + ship.equipment.reduce((s, e) => s + e.mass, 0);
}

/** One burn as executed: [t0, t1) at a throttle. */
export interface Burn {
  readonly index: number;
  /** Equipment id of the thruster, or `RCS_GROUP` for hands-on RCS translation. */
  readonly thruster: string;
  readonly t0: number;
  readonly t1: number;
  readonly throttle: number;
  readonly limited: boolean;
  readonly attitude?: AttitudeTarget;
  /** RCS translation demand (−1..1 per body axis), for a burn of `RCS_GROUP`. */
  readonly translate?: Vec3;
}

/** How hands-on flying (`fly` commands) becomes burns. */
export interface HandsOnThrust {
  /** The engine the hands-on throttle drives (`mainEngineOf`), if the ship has one. */
  readonly engine?: string;
  /** Whether hands-on translation is modelled (the ship has RCS). */
  readonly rcs?: boolean;
  /** Where a hands-on burn that is still open stops: the end of the record. Finite. */
  readonly until: number;
}

/** Hands-on thrust for a ship, or undefined when it has neither a main engine nor RCS. */
export function handsOnThrust(ship: ShipDefinition, until: number): HandsOnThrust | undefined {
  const engine = mainEngineOf(ship);
  const rcs = rcsInfo(ship) !== null;
  if (engine === undefined && !rcs) return undefined;
  return { ...(engine !== undefined ? { engine } : {}), rcs, until };
}

/** Latest recorded time of an attempt (its end, if it has ended). */
export function recordEnd(rec: AttemptRecord): number {
  if (rec.outcome.kind !== 'in-progress') return rec.outcome.t;
  let t = 0;
  for (const list of [rec.measurements, rec.executed, rec.events])
    for (const q of list) if (q.t > t) t = q.t;
  return t;
}

/**
 * Burns from executed commands (rejected commands never reached the ship).
 *
 * Hands-on flying (DECISIONS A8, A11; spec §3.3): with `handsOn` given, an executed `fly` is in
 * force until the next executed `fly`. Its throttle, when above zero, is a burn of the main
 * engine at that throttle, also ended by a `cutoff` of that engine or of 'all'; its translation
 * demand, when not zero, is a burn of the RCS group, also ended by a `cutoff` of 'all'. Both stop
 * at the end of the record at the latest. Directions come from the recorded attitude, as for any
 * burn. Without `handsOn`, `fly` commands are ignored.
 */
export function burnsFromExecuted(
  executed: readonly ExecutedCommand[],
  tEnd = Infinity,
  handsOn?: HandsOnThrust,
): Burn[] {
  const order = executed
    .map((c, i) => [c, i] as const)
    .sort((a, b) => a[0].t - b[0].t || a[1] - b[1]);
  const active = new Map<
    string,
    {
      t0: number;
      tEnd: number;
      throttle: number;
      limited: boolean;
      attitude?: AttitudeTarget;
      translate?: Vec3;
    }
  >();
  const out: Omit<Burn, 'index'>[] = [];
  const close = (thr: string, t: number) => {
    const b = active.get(thr);
    if (!b) return;
    const t1 = Math.min(b.tEnd, t);
    if (t1 > b.t0)
      out.push({
        thruster: thr,
        t0: b.t0,
        t1,
        throttle: b.throttle,
        limited: b.limited,
        ...(b.attitude ? { attitude: b.attitude } : {}),
        ...(b.translate ? { translate: b.translate } : {}),
      });
    active.delete(thr);
  };
  for (const [c] of order) {
    if (c.status === 'rejected') continue;
    const cmd = c.command;
    if (cmd.kind === 'burn') {
      close(cmd.thruster, c.t);
      if (cmd.duration > 0 && cmd.throttle > 0)
        active.set(cmd.thruster, {
          t0: c.t,
          tEnd: c.t + cmd.duration,
          throttle: cmd.throttle,
          limited: c.status === 'limited',
          ...(cmd.attitude ? { attitude: cmd.attitude } : {}),
        });
    } else if (cmd.kind === 'cutoff') {
      if (cmd.thruster === 'all') for (const thr of [...active.keys()]) close(thr, c.t);
      else close(cmd.thruster, c.t);
    } else if (cmd.kind === 'fly' && handsOn) {
      if (handsOn.engine !== undefined) {
        close(handsOn.engine, c.t);
        if (cmd.input.throttle > 0)
          active.set(handsOn.engine, {
            t0: c.t,
            tEnd: handsOn.until,
            throttle: cmd.input.throttle,
            limited: c.status === 'limited',
          });
      }
      if (handsOn.rcs) {
        close(RCS_GROUP, c.t);
        const tr = cmd.input.translate;
        if (tr.x !== 0 || tr.y !== 0 || tr.z !== 0)
          active.set(RCS_GROUP, {
            t0: c.t,
            tEnd: handsOn.until,
            throttle: 1,
            limited: c.status === 'limited',
            translate: { x: tr.x, y: tr.y, z: tr.z },
          });
      }
    }
  }
  for (const thr of [...active.keys()]) close(thr, tEnd);
  return out
    .sort((a, b) => a.t0 - b.t0 || a.thruster.localeCompare(b.thruster))
    .map((b, index) => ({ ...b, index }));
}

/**
 * Attitude knowledge from star-tracker records (§2.3): each fix is the rotation vector of the
 * body-to-inertial rotation. Between two records the attitude is interpolated along the
 * shortest turn (the ship turns smoothly between fixes); before the first record it is the
 * first, after the last the last. Two records at the same time are a step: the later one holds
 * from that time on.
 */
export class AttitudeLog {
  private readonly t: number[] = [];
  private readonly v: Quat[] = [];
  constructor(measurements: readonly Measurement[]) {
    for (const m of measurements)
      if (m.kind === 'attitude' && m.value.length > 2) {
        this.t.push(m.t);
        this.v.push(quat.fromRotationVector({ x: m.value[0]!, y: m.value[1]!, z: m.value[2]! }));
      }
  }
  get size(): number {
    return this.t.length;
  }
  /** Index of the latest record at or before t, or −1. */
  private before(t: number): number {
    if (this.t.length === 0 || this.t[0]! > t) return -1;
    let lo = 0;
    let hi = this.t.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.t[mid]! <= t) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
  /** Attitude at t, or undefined when nothing was recorded. */
  at(t: number): Quat | undefined {
    if (this.t.length === 0) return undefined;
    const i = this.before(t);
    if (i < 0) return this.v[0];
    if (i + 1 >= this.t.length || this.t[i] === t) return this.v[i];
    const span = this.t[i + 1]! - this.t[i]!;
    return quat.slerp(this.v[i]!, this.v[i + 1]!, (t - this.t[i]!) / span);
  }
  /** Sample times strictly inside (a, b). */
  timesIn(a: number, b: number): number[] {
    return this.t.filter((t) => t > a && t < b);
  }
}

/** Believed ship mass over time: telemetry tank gauges when recorded, else nominal flow. */
export class MassLog {
  private readonly dry: number;
  private readonly initial: number;
  private readonly samples: { t: number; mass: number }[] = [];
  constructor(ship: ShipDefinition, measurements: readonly Measurement[], initial: number) {
    this.initial = initial;
    this.dry = dryMass(ship);
    const tanks = new Set(ship.tanks.map((k) => k.id));
    const latest = new Map<string, number>();
    for (const m of measurements) {
      if (m.kind !== 'telemetry' || !m.channel) continue;
      const [id, q] = m.channel.split('.');
      if (q !== 'propellant' || !id || !tanks.has(id)) continue;
      latest.set(id, m.value[0]!);
      if (latest.size === tanks.size) {
        let s = this.dry;
        for (const v of latest.values()) s += v;
        this.samples.push({ t: m.t, mass: s });
      }
    }
  }
  /** Mass at t before accounting for burns after the latest gauge reading. */
  gaugeAt(t: number): { t: number; mass: number } {
    let best = { t: -Infinity, mass: this.initial };
    for (const s of this.samples) if (s.t <= t) best = s;
    return best;
  }
}

/** A stretch of an attempt that is not fitted, and why (the report carries the reason). */
export interface SkippedArc {
  readonly arc: string;
  readonly reason: string;
}

export interface ArcBuild {
  readonly arcs: Arc[];
  readonly burns: Burn[];
  /** Arc-local parameter names of limited burns (wide prior). */
  readonly limitedLevels: string[];
  /** Burns that had no attitude record (direction assumed). */
  readonly unknownAttitude: number[];
  /** Stretches with measurements that are left out of the fits (too few fixes, or unusable). */
  readonly skipped: SkippedArc[];
}

export interface AdaptContext {
  readonly ship: ShipDefinition;
  readonly settings: ModelSettings;
  /** Mass at arrival, kg (default: dry plus full tanks). */
  readonly arrivalMass?: number;
  /** Modelled bodies (fixes on other targets are ignored). */
  readonly bodies: readonly string[];
  readonly primary: string;
}

export function arrivalMassOf(ctx: Pick<AdaptContext, 'ship' | 'arrivalMass'>): number {
  return ctx.arrivalMass ?? dryMass(ctx.ship) + ctx.ship.tanks.reduce((s, k) => s + k.capacity, 0);
}

/** Nominal force (N) and propellant flow (kg/s) of a burn, or null for an unknown thruster. */
function burnForce(
  b: Burn,
  ctx: Pick<AdaptContext, 'ship' | 'settings'>,
): { info: ThrusterInfo | null; rcs: Vec3 | null; force: number; flow: number } | null {
  if (b.thruster === RCS_GROUP && b.translate) {
    const info = rcsInfo(ctx.ship);
    if (!info) return null;
    const f = rcsForce(info, b.translate);
    const force = Math.hypot(f.x, f.y, f.z);
    return {
      info: null,
      rcs: f,
      force,
      flow: info.isp > 0 ? force / (info.isp * ctx.settings.g0) : 0,
    };
  }
  const info = thrusterInfo(ctx.ship, b.thruster);
  if (!info) return null;
  const force = info.thrust * b.throttle;
  return { info, rcs: null, force, flow: info.isp > 0 ? force / (info.isp * ctx.settings.g0) : 0 };
}

/**
 * Thrust segments for burns, split for attitude and mass changes (§3.3). A piece takes the
 * recorded attitude at its middle, so a turn under thrust leaves at most the curvature of the
 * turn within one piece. A burn with no attitude record at all takes its commanded inertial
 * attitude if it has one, else the identity, and is listed in `unknownAttitude`.
 */
export function segmentsFor(
  burns: readonly Burn[],
  ctx: AdaptContext,
  att: AttitudeLog,
  mass: MassLog,
  levelName?: (b: Burn) => string,
): { segments: ThrustSegment[]; unknownAttitude: number[] } {
  const s = ctx.settings;
  const segments: ThrustSegment[] = [];
  const unknown: number[] = [];
  const consumedBefore = (t: number, since: number) => {
    // propellant used by earlier burns between the gauge reading and t (nominal flow)
    let used = 0;
    for (const b of burns) {
      const f = burnForce(b, ctx);
      if (!f || f.flow <= 0) continue;
      const a = Math.max(b.t0, since);
      const e = Math.min(b.t1, t);
      if (e > a) used += f.flow * (e - a);
    }
    return used;
  };
  for (const b of burns) {
    const f = burnForce(b, ctx);
    if (!f) continue;
    // A burn is cut into segments, so it must end: callers stop an open one at the end of its
    // record (fits) or of the forecast.
    if (!Number.isFinite(b.t1)) throw new Error(`burn ${b.index} of ${b.thruster} has no end`);
    const cuts = new Set<number>([b.t0, b.t1]);
    for (let t = b.t0 + s.maxSegment; t < b.t1 - 1e-6; t += s.maxSegment) cuts.add(t);
    let last = att.at(b.t0);
    if (att.size === 0 || last === undefined) unknown.push(b.index);
    for (const t of att.timesIn(b.t0, b.t1)) {
      const a = att.at(t)!;
      if (last === undefined || quat.angleBetween(a, last) > s.attitudeSplit) {
        cuts.add(t);
        last = a;
      }
    }
    const fallback = b.attitude?.reference === 'inertial' ? b.attitude.attitude : quat.IDENTITY;
    const times = [...cuts].sort((x, y) => x - y);
    for (let k = 0; k + 1 < times.length; k++) {
      const t0 = times[k]!;
      const t1 = times[k + 1]!;
      if (t1 - t0 < 1e-6) continue;
      const mid = 0.5 * (t0 + t1);
      const g = mass.gaugeAt(mid);
      const m = Math.max(1, g.mass - consumedBefore(mid, g.t === -Infinity ? -Infinity : g.t));
      const q = att.at(mid) ?? fallback;
      const level = b.limited && levelName ? { scale: levelName(b) } : {};
      if (f.rcs)
        segments.push({
          t0,
          t1,
          u: 0,
          q,
          rcs: [f.rcs.x / m, f.rcs.y / m, f.rcs.z / m],
          thruster: RCS_GROUP,
          ...level,
        });
      else
        segments.push({
          t0,
          t1,
          u: f.force / m,
          q,
          ...(f.info?.mount ? { mount: f.info.mount } : {}),
          thruster: b.thruster,
          ...level,
        });
    }
  }
  return { segments, unknownAttitude: unknown };
}

/**
 * Estimator measurements from a record, in record order. Bearings pair with a range of the same
 * target, source and time; every fix takes the recorded attitude at its time. With
 * `settings.planar` the elevation, the accelerometer's z and a relative position's z give no
 * row (spec Appendix A.3).
 */
export function estMeasurements(
  measurements: readonly Measurement[],
  bodies: ReadonlySet<string>,
  burns: readonly Burn[],
  settings: ModelSettings,
  att?: AttitudeLog,
): EstMeasurement[] {
  const planar = settings.planar === 1;
  const out3 = (s: number | undefined): Sigma => (planar ? null : (s ?? null));
  const ranges = new Map<string, Measurement[]>();
  const key = (m: Measurement) => `${m.t}|${m.source}|${m.target ?? ''}`;
  for (const m of measurements)
    if (m.kind === 'range' && m.target && bodies.has(m.target)) {
      const k = key(m);
      const list = ranges.get(k);
      if (list) list.push(m);
      else ranges.set(k, [m]);
    }
  const used = new Set<Measurement>();
  const out: EstMeasurement[] = [];
  const accelBins = new Map<string, { t: number[]; f: number[][]; s2: number[][] }>();
  // Burn boundaries: an accelerometer sample this close to any of them is skipped, and a bin
  // never spans one, so a binned sample always sees one set of thrust levels.
  const edges = burns.flatMap((b) => [b.t0, b.t1]);
  for (const m of measurements) {
    if (m.kind === 'bearing' && m.target && bodies.has(m.target)) {
      const q = att?.at(m.t);
      const fix = { kind: 'opnav' as const, t: m.t, target: m.target, ...(q ? { q } : {}) };
      const az = m.value[0]!;
      // The planar reduction lifts a bearing to elevation 0 (A.3).
      const el = planar ? 0 : (m.value[1] ?? 0);
      const r = ranges.get(key(m))?.find((x) => !used.has(x));
      if (r) {
        used.add(r);
        out.push({
          ...fix,
          z: [az, el, r.value[0]!],
          sigma: [m.sigma[0]!, out3(m.sigma[1]), r.sigma[0]!],
        });
      } else out.push({ ...fix, z: [az, el], sigma: [m.sigma[0]!, out3(m.sigma[1])] });
    } else if (m.kind === 'relative-position' && m.target && bodies.has(m.target)) {
      out.push({
        kind: 'relpos',
        t: m.t,
        target: m.target,
        z: [m.value[0]!, m.value[1]!, m.value[2] ?? 0],
        sigma: [m.sigma[0]!, m.sigma[1]!, out3(m.sigma[2])],
      });
    } else if (m.kind === 'accel') {
      const active = burns.filter((q) => m.t >= q.t0 && m.t < q.t1);
      if (active.length === 0) continue;
      if (edges.some((e) => m.t > e - settings.accelEdge && m.t < e + settings.accelEdge)) continue;
      const start = Math.max(...active.map((q) => q.t0));
      const bin = Math.floor((m.t - start) / settings.accelBin);
      const k = `${active.map((q) => q.index).join(',')}|${bin}`;
      let acc = accelBins.get(k);
      if (!acc) {
        acc = { t: [], f: [], s2: [] };
        accelBins.set(k, acc);
      }
      acc.t.push(m.t);
      acc.f.push([m.value[0]!, m.value[1]!, m.value[2] ?? 0]);
      acc.s2.push([m.sigma[0]! ** 2, m.sigma[1]! ** 2, (m.sigma[2] ?? m.sigma[0]!) ** 2]);
    }
  }
  for (const m of measurements)
    if (m.kind === 'range' && m.target && bodies.has(m.target) && !used.has(m))
      out.push({ kind: 'range', t: m.t, target: m.target, z: [m.value[0]!], sigma: [m.sigma[0]!] });
  for (const acc of accelBins.values()) {
    const n = acc.t.length;
    const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / n;
    // Bin time: the sample nearest the mean time, so it lies inside the burn.
    const tm = mean(acc.t);
    const t = acc.t.reduce(
      (best, x) => (Math.abs(x - tm) < Math.abs(best - tm) ? x : best),
      acc.t[0]!,
    );
    const sigma = (c: number) =>
      Math.sqrt(mean(acc.s2.map((v) => v[c]!)) / n + settings.accelBiasSigma ** 2);
    const f = (c: number) => mean(acc.f.map((v) => v[c]!));
    out.push({
      kind: 'accel',
      t,
      z: [f(0), f(1), f(2)],
      sigma: [sigma(0), sigma(1), planar ? null : sigma(2)],
    });
  }
  // Stable sort: equal times keep record order. Sorted again after averaging, because a normal
  // point sits at the mean time of its fixes and an arc's epoch is its first measurement (§3.5).
  return byTime(normalPoints(byTime(out), burns, settings.normalPointInterval, att));
}

function byTime(meas: readonly EstMeasurement[]): EstMeasurement[] {
  return meas
    .map((m, i) => [m, i] as const)
    .sort((a, b) => a[0].t - b[0].t || a[1] - b[1])
    .map((p) => p[0]);
}

/** East and north unit vectors at a direction given by its azimuth and elevation (§2.1). */
function tangentBasis(az: number, el: number): { e: number[]; n: number[] } {
  const se = Math.sin(el);
  return {
    e: [-Math.sin(az), Math.cos(az), 0],
    n: [-se * Math.cos(az), -se * Math.sin(az), Math.cos(el)],
  };
}

/**
 * Mean of measured directions on the sphere: each is mapped into the tangent plane at the first
 * (the angle between them along the great circle), the mean is taken there and mapped back. For
 * directions in the x–y plane this is the mean of the wrapped azimuth differences.
 */
function meanDirection(fixes: readonly Fix[]): { az: number; el: number } {
  const az0 = fixes[0]!.z[0]!;
  const el0 = fixes[0]!.z[1]!;
  const m0 = lineOfSight(fixes[0]!);
  const { e, n } = tangentBasis(az0, el0);
  let ve = 0;
  let vn = 0;
  for (const f of fixes) {
    const m = lineOfSight(f);
    const sE = e[0]! * m[0] + e[1]! * m[1] + e[2]! * m[2];
    const sN = n[0]! * m[0] + n[1]! * m[1] + n[2]! * m[2];
    const c = m0[0] * m[0] + m0[1] * m[1] + m0[2] * m[2];
    const sn = Math.hypot(sE, sN);
    const k = sn > 1e-300 ? Math.atan2(sn, c) / sn : 1;
    ve += k * sE;
    vn += k * sN;
  }
  ve /= fixes.length;
  vn /= fixes.length;
  const a = Math.hypot(ve, vn);
  if (a === 0) return { az: az0, el: el0 };
  const ca = Math.cos(a);
  const sa = Math.sin(a) / a;
  const d = [0, 1, 2].map((i) => ca * m0[i]! + sa * (ve * e[i]! + vn * n[i]!));
  return { az: Math.atan2(d[1]!, d[0]!), el: Math.asin(Math.max(-1, Math.min(1, d[2]!))) };
}

/**
 * Normal points (standard orbit-determination practice): optical fixes of one target and kind
 * (with or without range) within the same `interval`-second bin and the same flight phase are
 * averaged into one fix at their mean time, σ/√n. Keeps fit cost and the window rule (§5.1,
 * counted in fixes) independent of camera cadence. A bin holding one fix is left unchanged.
 * `att` gives the averaged fix the recorded attitude at its mean time.
 */
export function normalPoints(
  meas: readonly EstMeasurement[],
  burns: readonly Burn[],
  interval: number,
  att?: AttitudeLog,
): EstMeasurement[] {
  if (!(interval > 0)) return [...meas];
  // Flight phase: the set of burns firing, or coasting after n burns have ended. Coasting fixes
  // on either side of a burn are not averaged together (the velocity changed between them, and
  // their mean time can fall on a fix taken during the burn).
  const phase = (t: number) => {
    let ended = 0;
    const firing: number[] = [];
    for (const b of burns) {
      if (t >= b.t0 && t < b.t1) firing.push(b.index);
      else if (b.t1 <= t) ended++;
    }
    return firing.length > 0 ? firing.join(',') : `${-1 - ended}`;
  };
  const groups = new Map<string, Fix[]>();
  const order: (EstMeasurement | string)[] = [];
  for (const m of meas) {
    if (m.kind !== 'opnav') {
      order.push(m);
      continue;
    }
    const used = m.sigma.map((s) => (s === null ? 0 : 1)).join('');
    const key = `${m.target}|${used}|${Math.floor(m.t / interval)}|${phase(m.t)}`;
    const g = groups.get(key);
    if (g) g.push(m);
    else {
      groups.set(key, [m]);
      order.push(key);
    }
  }
  return order.map((o): EstMeasurement => {
    if (typeof o !== 'string') return o;
    const g = groups.get(o)!;
    if (g.length === 1) return g[0]!;
    const n = g.length;
    const t = g.reduce((s, m) => s + m.t, 0) / n;
    const { az, el } = meanDirection(g);
    const rss = (v: (m: Fix) => number) => Math.sqrt(g.reduce((s, m) => s + v(m) ** 2, 0)) / n;
    const first = g[0]!;
    // The azimuth sigma is reported as σ_arc / cos(el): average the arcs, then convert back.
    const cosEl = Math.max(Math.cos(el), 1e-12);
    const sAz =
      first.sigma[0] === null ? null : rss((m) => m.sigma[0]! * Math.cos(m.z[1]!)) / cosEl;
    const sEl = first.sigma[1] === null ? null : rss((m) => m.sigma[1]!);
    const q = att?.at(t) ?? first.q;
    const fix = { kind: 'opnav' as const, t, target: first.target, ...(q ? { q } : {}) };
    if (first.z.length < 3) return { ...fix, z: [az, el], sigma: [sAz, sEl] };
    const r = g.reduce((s, m) => s + m.z[2]!, 0) / n;
    const sr = first.sigma[2] === null ? null : rss((m) => m.sigma[2]!);
    return { ...fix, z: [az, el, r], sigma: [sAz, sEl, sr] };
  });
}

/** Arcs of one attempt (§3.5). */
export function arcsFromRecord(rec: AttemptRecord, ctx: AdaptContext): ArcBuild {
  // A thrust segment never extends past the end of its record (§3.3: thrust is what was
  // recorded): a burn still running when the attempt ended, or at the last thing recorded so
  // far, stops there. A held burn is commanded for far longer than it runs, and a reload closes
  // its attempt as recalled at that same time, so the live arcs equal the rebuilt ones.
  const tEnd = recordEnd(rec);
  const burns = burnsFromExecuted(rec.executed, tEnd, handsOnThrust(ctx.ship, tEnd));
  const att = new AttitudeLog(rec.measurements);
  const mass = new MassLog(ctx.ship, rec.measurements, arrivalMassOf(ctx));
  const breaks = rec.events
    .filter((e) => e.kind === 'contact')
    .map((e) => e.t)
    .sort((a, b) => a - b);
  const bounds = [-Infinity, ...breaks, Infinity];
  const arcs: Arc[] = [];
  const limitedLevels: string[] = [];
  const skipped: SkippedArc[] = [];
  const bodySet = new Set(ctx.bodies);
  const all = estMeasurements(rec.measurements, bodySet, burns, ctx.settings, att);
  let unknownAttitude: number[] = [];
  for (let k = 0; k + 1 < bounds.length; k++) {
    const lo = bounds[k]!;
    const hi = bounds[k + 1]!;
    const id = k === 0 ? rec.id : `${rec.id}~${k}`;
    const meas = all.filter((m) => m.t >= lo && m.t < hi);
    // An arc that cannot determine its state is left out, with the reason (§3.5).
    const nRange = rangeFixTimes(meas, ctx.primary).length;
    if (nRange < MIN_ARC_FIXES) {
      if (meas.length > 0)
        skipped.push({
          arc: id,
          reason: `${nRange} range ${nRange === 1 ? 'fix' : 'fixes'} on the primary, ${MIN_ARC_FIXES} at different times are needed to fit a path`,
        });
      continue;
    }
    const arcBurns = burns.filter((b) => b.t1 > lo && b.t0 < hi);
    const segs = segmentsFor(arcBurns, ctx, att, mass, (b) => `${id}.burn${b.index}.level`);
    unknownAttitude = [...unknownAttitude, ...segs.unknownAttitude];
    for (const b of arcBurns) if (b.limited) limitedLevels.push(`${id}.burn${b.index}.level`);
    arcs.push({ id, epoch: meas[0]!.t, commands: segs.segments, meas });
  }
  return { arcs, burns, limitedLevels, unknownAttitude, skipped };
}

/** Commands of a plan at absolute times (plan epoch + item time). */
export function planCommands(
  plan: Plan,
): { t: number; command: Plan['items'][number]['command'] }[] {
  return plan.items.map((i) => ({ t: plan.epoch + i.at, command: i.command }));
}
