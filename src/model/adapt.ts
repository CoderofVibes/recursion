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
  EquipmentSpec,
  ExecutedCommand,
  Measurement,
  Plan,
  ShipDefinition,
} from '../contracts/index.ts';
import type { Arc, EstMeasurement, ThrustSegment } from './dynamics.ts';
import type { ModelSettings } from './settings.ts';

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
    bodyAngle: dir ? Math.atan2(dir.y, dir.x) : 0,
  };
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

/** Burns from executed commands (rejected commands never reached the ship). */
export function burnsFromExecuted(executed: readonly ExecutedCommand[], tEnd = Infinity): Burn[] {
  const order = executed.map((c, i) => [c, i] as const).sort((a, b) => a[0].t - b[0].t || a[1] - b[1]);
  const active = new Map<string, { t0: number; tEnd: number; throttle: number; limited: boolean; attitude?: AttitudeTarget }>();
  const out: Omit<Burn, 'index'>[] = [];
  const close = (thr: string, t: number) => {
    const b = active.get(thr);
    if (!b) return;
    const t1 = Math.min(b.tEnd, t);
    if (t1 > b.t0) out.push({ thruster: thr, t0: b.t0, t1, throttle: b.throttle, limited: b.limited, ...(b.attitude ? { attitude: b.attitude } : {}) });
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
    }
  }
  for (const thr of [...active.keys()]) close(thr, tEnd);
  return out.sort((a, b) => a.t0 - b.t0 || a.thruster.localeCompare(b.thruster)).map((b, index) => ({ ...b, index }));
}

/** Attitude knowledge from star-tracker records: latest value at or before t. */
export class AttitudeLog {
  private readonly t: number[] = [];
  private readonly v: number[] = [];
  constructor(measurements: readonly Measurement[]) {
    for (const m of measurements)
      if (m.kind === 'attitude' && m.value.length > 0) {
        this.t.push(m.t);
        this.v.push(m.value[0]!);
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

export interface ArcBuild {
  readonly arcs: Arc[];
  readonly burns: Burn[];
  /** Arc-local parameter names of limited burns (wide prior). */
  readonly limitedLevels: string[];
  /** Burns that had no attitude record (direction assumed). */
  readonly unknownAttitude: number[];
  /** Arcs skipped for want of ≥ 3 range fixes on the primary. */
  readonly skipped: string[];
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
      const fallback = b.attitude?.reference === 'inertial' ? b.attitude.angle : 0;
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
      const r = ranges.get(key(m))?.find((q) => !used.has(q));
      if (r) {
        used.add(r);
        out.push({ kind: 'opnav', t: m.t, target: m.target, z: [m.value[0]!, r.value[0]!], sigma: [m.sigma[0]!, r.sigma[0]!] });
      } else out.push({ kind: 'opnav', t: m.t, target: m.target, z: [m.value[0]!], sigma: [m.sigma[0]!] });
    } else if (m.kind === 'relative-position' && m.target && bodies.has(m.target)) {
      out.push({ kind: 'relpos', t: m.t, target: m.target, z: [m.value[0]!, m.value[1]!], sigma: [m.sigma[0]!, m.sigma[1]!] });
    } else if (m.kind === 'accel') {
      const b = burns.find((q) => m.t >= q.t0 + settings.accelEdge && m.t < q.t1 - settings.accelEdge);
      if (!b) continue;
      const bin = Math.floor((m.t - b.t0) / settings.accelBin);
      const k = `${b.index}|${bin}`;
      let acc = accelBins.get(k);
      if (!acc) {
        acc = { t: [], fx: [], fy: [], s2: [] };
        accelBins.set(k, acc);
      }
      acc.t.push(m.t);
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
    const t = acc.t.reduce((best, x) => (Math.abs(x - tm) < Math.abs(best - tm) ? x : best), acc.t[0]!);
    const sigma = Math.sqrt(mean(acc.s2) / n + settings.accelBiasSigma ** 2);
    out.push({ kind: 'accel', t, z: [mean(acc.fx), mean(acc.fy)], sigma: [sigma, sigma] });
  }
  // Stable sort: equal times keep record order.
  const sorted = out.map((m, i) => [m, i] as const).sort((a, b) => a[0].t - b[0].t || a[1] - b[1]).map((p) => p[0]);
  return normalPoints(sorted, burns, settings.normalPointInterval);
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
  const phase = (t: number) => burns.find((b) => t >= b.t0 && t < b.t1)?.index ?? -1;
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
    if (g[0]!.z.length === 1) return { kind: 'opnav', t, target: g[0]!.target, z: [b], sigma: [sb] };
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
  // A burn still running when the attempt ended stops there; in progress, it runs to its end.
  const tEnd = rec.outcome.kind === 'in-progress' ? Infinity : rec.outcome.t;
  const burns = burnsFromExecuted(rec.executed, tEnd);
  const att = new AttitudeLog(rec.measurements);
  const mass = new MassLog(ctx.ship, rec.measurements, arrivalMassOf(ctx));
  const breaks = rec.events.filter((e) => e.kind === 'contact').map((e) => e.t).sort((a, b) => a - b);
  const bounds = [-Infinity, ...breaks, Infinity];
  const arcs: Arc[] = [];
  const limitedLevels: string[] = [];
  const skipped: string[] = [];
  const bodySet = new Set(ctx.bodies);
  const all = estMeasurements(rec.measurements, bodySet, burns, ctx.settings);
  let unknownAttitude: number[] = [];
  for (let k = 0; k + 1 < bounds.length; k++) {
    const lo = bounds[k]!;
    const hi = bounds[k + 1]!;
    const id = k === 0 ? rec.id : `${rec.id}~${k}`;
    const meas = all.filter((m) => m.t >= lo && m.t < hi);
    const nRange = meas.filter((m) => m.kind === 'opnav' && m.target === ctx.primary && m.z.length === 2).length;
    if (nRange < 3) {
      if (meas.length > 0) skipped.push(id);
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
export function planCommands(plan: Plan): { t: number; command: Plan['items'][number]['command'] }[] {
  return plan.items.map((i) => ({ t: plan.epoch + i.at, command: i.command }));
}
