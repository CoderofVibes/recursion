/**
 * Black Box records → estimator arcs (contracts README § attempt.ts; 1G spec §2, §3.3, §3.5).
 *
 * - Measurements are taken in record order (the array index is the sequence number); a bearing
 *   and a range of the same target from the same source at the same time form one optical fix.
 * - Thrust segments come from executed `burn` / `cutoff` commands × nominal ratings in the
 *   ShipDefinition, with direction from recorded star-tracker attitude, never from truth.
 *   A `limited` burn gets an uncertain level (its own parameter with a wide prior).
 * - Accelerometer samples are used only while thrust is commanded, averaged into bins.
 * - Arcs break at recorded contacts (discontinuities); data gaps do not break arcs.
 */

import type {
  AttemptRecord,
  AttitudeTarget,
  Cov2,
  Cov3,
  EquipmentSpec,
  ExecutedCommand,
  Measurement,
  Plan,
  ShipDefinition,
} from '../contracts/index.ts';
import * as quat from '../lib/quat.ts';
import {
  MIN_ARC_FIXES,
  rangeFixTimes,
  type Arc,
  type EstMeasurement,
  type ThrustSegment,
} from './dynamics.ts';
import type { ModelSettings } from './settings.ts';

// LIFT(2G): the estimator is planar; a contract Cov3 enters as its x–y block [xx, xy, yy].
export const planarCov = (c: Cov3): Cov2 => [c[0], c[1], c[3]];

export interface ThrusterInfo {
  readonly id: string;
  readonly thrust: number;
  readonly isp: number;
  /** Direction of the force on the ship in the body frame, rad. */
  readonly bodyAngle: number;
}

export function thrusterInfo(ship: ShipDefinition, id: string): ThrusterInfo | null {
  const e: EquipmentSpec | undefined = ship.equipment.find((q) => q.id === id);
  if (!e) return null;
  const thrust = e.params.thrust;
  if (thrust === undefined) return null;
  const dir = e.mount?.direction;
  return {
    id,
    thrust,
    isp: e.params.isp ?? 0,
    // LIFT(2G): thrust direction as an angle in the body x–y plane; the mount's z is ignored.
    bodyAngle: dir ? Math.atan2(dir.y, dir.x) : 0,
  };
}

/** The engine hands-on throttle drives: the first `main-engine` in the ship definition. */
export function mainEngineOf(ship: ShipDefinition): string | undefined {
  return ship.equipment.find((e) => e.kind === 'main-engine')?.id;
}

/** Dry mass from the nominal design (structure plus equipment). */
export function dryMass(ship: ShipDefinition): number {
  return ship.structureMass + ship.equipment.reduce((s, e) => s + e.mass, 0);
}

/** One burn as executed: [t0, t1) at a throttle. */
export interface Burn {
  readonly index: number;
  readonly thruster: string;
  readonly t0: number;
  readonly t1: number;
  readonly throttle: number;
  readonly limited: boolean;
  readonly attitude?: AttitudeTarget;
}

/** How hands-on thrust (`fly` commands) becomes burns. */
export interface HandsOnThrust {
  /** The engine the hands-on throttle drives (`mainEngineOf`). */
  readonly engine: string;
  /** Where a hands-on burn that is still open stops: the end of the record. Finite. */
  readonly until: number;
}

/** Hands-on thrust for a ship, or undefined when it has no main engine. */
export function handsOnThrust(ship: ShipDefinition, until: number): HandsOnThrust | undefined {
  const engine = mainEngineOf(ship);
  return engine === undefined ? undefined : { engine, until };
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
 * Hands-on thrust (DECISIONS A8, A11): with `handsOn` given, an executed `fly` whose throttle is
 * above zero is a burn of the main engine at that throttle, from its time until the next
 * executed `fly`, a `cutoff` of that engine or of 'all', or the end of the record; a `fly` with
 * zero throttle ends it. Its direction comes from the recorded attitude, as for any burn.
 * Without `handsOn`, `fly` commands are ignored.
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
    { t0: number; tEnd: number; throttle: number; limited: boolean; attitude?: AttitudeTarget }
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
      // LIFT(2G): only the throttle of a `fly` is modelled; its RCS translation is not.
      close(handsOn.engine, c.t);
      if (cmd.input.throttle > 0)
        active.set(handsOn.engine, {
          t0: c.t,
          tEnd: handsOn.until,
          throttle: cmd.input.throttle,
          limited: c.status === 'limited',
        });
    }
  }
  for (const thr of [...active.keys()]) close(thr, tEnd);
  return out
    .sort((a, b) => a.t0 - b.t0 || a.thruster.localeCompare(b.thruster))
    .map((b, index) => ({ ...b, index }));
}

/** Attitude knowledge from star-tracker records: latest value (yaw, rad) at or before t. */
export class AttitudeLog {
  private readonly t: number[] = [];
  private readonly v: number[] = [];
  constructor(measurements: readonly Measurement[]) {
    for (const m of measurements)
      if (m.kind === 'attitude' && m.value.length > 2) {
        this.t.push(m.t);
        // LIFT(2G): attitude assumed a rotation about +z, so the rotation vector's z is the yaw.
        this.v.push(m.value[2]!);
      }
  }
  get size(): number {
    return this.t.length;
  }
  /** Latest attitude at or before t; else the first after; else undefined. */
  at(t: number): number | undefined {
    if (this.t.length === 0) return undefined;
    let lo = 0;
    let hi = this.t.length - 1;
    if (this.t[0]! > t) return this.v[0];
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.t[mid]! <= t) lo = mid;
      else hi = mid - 1;
    }
    return this.v[lo];
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

/** Thrust segments for burns, split for attitude and mass changes. */
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
      const info = thrusterInfo(ctx.ship, b.thruster);
      if (!info || info.isp <= 0) continue;
      const a = Math.max(b.t0, since);
      const e = Math.min(b.t1, t);
      if (e > a) used += ((info.thrust * b.throttle) / (info.isp * s.g0)) * (e - a);
    }
    return used;
  };
  for (const b of burns) {
    const info = thrusterInfo(ctx.ship, b.thruster);
    if (!info) continue;
    // A burn is cut into segments, so it must end: callers stop an open one at the end of its
    // record (fits) or of the forecast.
    if (!Number.isFinite(b.t1)) throw new Error(`burn ${b.index} of ${b.thruster} has no end`);
    const force = info.thrust * b.throttle;
    const cuts = new Set<number>([b.t0, b.t1]);
    for (let t = b.t0 + s.maxSegment; t < b.t1 - 1e-6; t += s.maxSegment) cuts.add(t);
    let last = att.at(b.t0);
    if (att.size === 0 || last === undefined) unknown.push(b.index);
    for (const t of att.timesIn(b.t0, b.t1)) {
      const a = att.at(t)!;
      if (last === undefined || Math.abs(a - last) > s.attitudeSplit) {
        cuts.add(t);
        last = a;
      }
    }
    const times = [...cuts].sort((x, y) => x - y);
    for (let k = 0; k + 1 < times.length; k++) {
      const t0 = times[k]!;
      const t1 = times[k + 1]!;
      if (t1 - t0 < 1e-6) continue;
      const mid = 0.5 * (t0 + t1);
      const g = mass.gaugeAt(mid);
      const m = Math.max(1, g.mass - consumedBefore(mid, g.t === -Infinity ? -Infinity : g.t));
      // LIFT(2G): a commanded inertial attitude enters as its yaw (azimuth of the body axis).
      const fallback = b.attitude?.reference === 'inertial' ? quat.yawOf(b.attitude.attitude) : 0;
      const attitude = att.at(t0) ?? fallback;
      segments.push({
        t0,
        t1,
        u: force / m,
        theta: attitude + info.bodyAngle,
        bodyAngle: info.bodyAngle,
        thruster: b.thruster,
        ...(b.limited && levelName ? { scale: levelName(b) } : {}),
      });
    }
  }
  return { segments, unknownAttitude: unknown };
}

/**
 * Estimator measurements from a record, in record order. Bearings pair with a range of the same
 * target, source and time.
 */
export function estMeasurements(
  measurements: readonly Measurement[],
  bodies: ReadonlySet<string>,
  burns: readonly Burn[],
  settings: ModelSettings,
): EstMeasurement[] {
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
  const accelBins = new Map<string, { t: number[]; fx: number[]; fy: number[]; s2: number[] }>();
  for (const m of measurements) {
    if (m.kind === 'bearing' && m.target && bodies.has(m.target)) {
      // LIFT(2G): a bearing enters as its azimuth ([0]); elevation ([1]) is ignored.
      const r = ranges.get(key(m))?.find((q) => !used.has(q));
      if (r) {
        used.add(r);
        out.push({
          kind: 'opnav',
          t: m.t,
          target: m.target,
          z: [m.value[0]!, r.value[0]!],
          sigma: [m.sigma[0]!, r.sigma[0]!],
        });
      } else
        out.push({
          kind: 'opnav',
          t: m.t,
          target: m.target,
          z: [m.value[0]!],
          sigma: [m.sigma[0]!],
        });
    } else if (m.kind === 'relative-position' && m.target && bodies.has(m.target)) {
      // LIFT(2G): relative position enters as x and y; z ([2]) is ignored.
      out.push({
        kind: 'relpos',
        t: m.t,
        target: m.target,
        z: [m.value[0]!, m.value[1]!],
        sigma: [m.sigma[0]!, m.sigma[1]!],
      });
    } else if (m.kind === 'accel') {
      const b = burns.find(
        (q) => m.t >= q.t0 + settings.accelEdge && m.t < q.t1 - settings.accelEdge,
      );
      if (!b) continue;
      const bin = Math.floor((m.t - b.t0) / settings.accelBin);
      const k = `${b.index}|${bin}`;
      let acc = accelBins.get(k);
      if (!acc) {
        acc = { t: [], fx: [], fy: [], s2: [] };
        accelBins.set(k, acc);
      }
      acc.t.push(m.t);
      // LIFT(2G): specific force enters as body x and y; az ([2]) is ignored.
      acc.fx.push(m.value[0]!);
      acc.fy.push(m.value[1]!);
      acc.s2.push(0.5 * (m.sigma[0]! ** 2 + m.sigma[1]! ** 2));
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
    const sigma = Math.sqrt(mean(acc.s2) / n + settings.accelBiasSigma ** 2);
    out.push({ kind: 'accel', t, z: [mean(acc.fx), mean(acc.fy)], sigma: [sigma, sigma] });
  }
  // Stable sort: equal times keep record order. Sorted again after averaging, because a normal
  // point sits at the mean time of its fixes and an arc's epoch is its first measurement (§3.5).
  return byTime(normalPoints(byTime(out), burns, settings.normalPointInterval));
}

function byTime(meas: readonly EstMeasurement[]): EstMeasurement[] {
  return meas
    .map((m, i) => [m, i] as const)
    .sort((a, b) => a[0].t - b[0].t || a[1] - b[1])
    .map((p) => p[0]);
}

/**
 * Normal points (standard orbit-determination practice): optical fixes of one target and kind
 * (with or without range) within the same `interval`-second bin and the same flight phase are
 * averaged into one fix at their mean time, σ/√n. Keeps fit cost and the window rule (§5.1,
 * counted in fixes) independent of camera cadence. A bin holding one fix is left unchanged.
 */
export function normalPoints(
  meas: readonly EstMeasurement[],
  burns: readonly Burn[],
  interval: number,
): EstMeasurement[] {
  if (!(interval > 0)) return [...meas];
  // Flight phase: inside burn k, or coasting after n burns have ended. Coasting fixes on either
  // side of a burn are not averaged together (the velocity changed between them, and their mean
  // time can fall on a fix taken during the burn).
  const phase = (t: number) => {
    let ended = 0;
    for (const b of burns) {
      if (t >= b.t0 && t < b.t1) return b.index;
      if (b.t1 <= t) ended++;
    }
    return -1 - ended;
  };
  const groups = new Map<string, Extract<EstMeasurement, { kind: 'opnav' }>[]>();
  const order: (EstMeasurement | string)[] = [];
  for (const m of meas) {
    if (m.kind !== 'opnav') {
      order.push(m);
      continue;
    }
    const key = `${m.target}|${m.z.length}|${Math.floor(m.t / interval)}|${phase(m.t)}`;
    const g = groups.get(key);
    if (g) g.push(m);
    else {
      groups.set(key, [m]);
      order.push(key);
    }
  }
  return order.map((o) => {
    if (typeof o !== 'string') return o;
    const g = groups.get(o)!;
    if (g.length === 1) return g[0]!;
    const n = g.length;
    const t = g.reduce((s, m) => s + m.t, 0) / n;
    const b0 = g[0]!.z[0]!;
    const b = wrapAngle(b0 + g.reduce((s, m) => s + wrapAngle(m.z[0]! - b0), 0) / n);
    const sb = Math.sqrt(g.reduce((s, m) => s + m.sigma[0]! ** 2, 0)) / n;
    if (g[0]!.z.length === 1)
      return { kind: 'opnav', t, target: g[0]!.target, z: [b], sigma: [sb] };
    const r = g.reduce((s, m) => s + m.z[1]!, 0) / n;
    const sr = Math.sqrt(g.reduce((s, m) => s + m.sigma[1]! ** 2, 0)) / n;
    return { kind: 'opnav', t, target: g[0]!.target, z: [b, r], sigma: [sb, sr] };
  });
}

function wrapAngle(a: number): number {
  const m = (a + Math.PI) % (2 * Math.PI);
  return (m < 0 ? m + 2 * Math.PI : m) - Math.PI;
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
  const all = estMeasurements(rec.measurements, bodySet, burns, ctx.settings);
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
