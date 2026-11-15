/**
 * The camera's believed pose at each lattice frame's acquisition, from recorded data only
 * (S17: "recorded attitude/navigation estimates and their covariance locate rays").
 *
 * - Attitude: the star tracker's recorded attitude at that time (`AttitudeLog`), σ from the
 *   record (or the arrival estimate's when nothing is recorded yet).
 * - Position: the ship's believed path. Inside an arc the model has solved (Tier G, or the arc's
 *   own fit in flight), that solution carried to the time, with the covariance of the arc's
 *   ship state (× s²). Otherwise the arrival estimate carried forward under the law in force
 *   with the executed thrust, with the arrival covariance and the engine scale's σ carried
 *   with it. The arrival covariance is a floor: a pose is never more certain than the survey
 *   that started it (conservative).
 * - Camera origin: that position plus the camera's mount, turned by the attitude, relative to
 *   the structure's centre of mass (an approximation good to the shift of the centre of mass
 *   with propellant, centimetres to decimetres, which is common to every ray of a pass).
 *
 * A frame at a time the model holds no estimate for gets no pose: it is kept as missing.
 */

import type { AttemptRecord, Cov3, Vec3 } from '../../contracts/index.ts';
import * as quat from '../../lib/quat.ts';
import {
  AttitudeLog,
  MassLog,
  arrivalMassOf,
  burnsFromExecuted,
  handsOnThrust,
  recordEnd,
  segmentsFor,
} from '../adapt.ts';
import { compileArc, simulate, STATE_KEYS, type Structure } from '../dynamics.ts';
import {
  arrivalState,
  briefingBodiesAt,
  contextFor,
  lawInForce,
  scaleId,
  type ModelContext,
  type ModelSnapshot,
} from '../engine.ts';
import type { CameraPose } from './reconstruct.ts';

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });

/** Σ J C Jᵀ for position columns J (3 numbers each) with a (block-)diagonal-free covariance C. */
function quadCov(cols: readonly (readonly number[])[], C: (a: number, b: number) => number): Cov3 {
  const m = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let a = 0; a < cols.length; a++)
    for (let b = 0; b < cols.length; b++) {
      const c = C(a, b);
      if (c === 0) continue;
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) m[3 * i + j]! += cols[a]![i]! * c * cols[b]![j]!;
    }
  return [m[0]!, 0.5 * (m[1]! + m[3]!), 0.5 * (m[2]! + m[6]!), m[4]!, 0.5 * (m[5]! + m[7]!), m[8]!];
}
const maxCov = (a: Cov3, b: Cov3): Cov3 => (a[0] + a[3] + a[5] >= b[0] + b[3] + b[5] ? a : b);

/**
 * Believed camera poses at `times` for attempt `rec`, with the camera `source` (equipment id).
 * Null where no estimate exists.
 */
export function believedPoses(
  snap: ModelSnapshot,
  model: ModelContext,
  rec: AttemptRecord,
  times: readonly number[],
  source = 'camera',
): (CameraPose | null)[] {
  const d = snap.derived;
  const spec = d.spec;
  const s = spec.settings;
  const ctx = contextFor(model, rec);
  const att = new AttitudeLog(rec.measurements);
  let attSigma = ctx.arrival.attitudeSigma;
  for (const m of rec.measurements)
    if (m.kind === 'attitude' && m.sigma.length > 2) attSigma = Math.max(...m.sigma.slice(0, 3));
  const cam = ctx.ship.equipment.find((e) => e.id === source);
  const mount = sub(cam?.mount?.position ?? cam?.position ?? ZERO, ctx.ship.structureCenterOfMass);
  const arrival = arrivalState(ctx, spec);
  const arrivalPosCov: Cov3 = [
    arrival.covariance.data[0]!,
    arrival.covariance.data[1]!,
    arrival.covariance.data[2]!,
    arrival.covariance.data[7]!,
    arrival.covariance.data[8]!,
    arrival.covariance.data[14]!,
  ];
  const primary = ctx.bodies.find((b) => b.id === spec.primary);
  // The primary's believed position in the briefing frame (one body, or bodies held fixed: it
  // moves uniformly; several moving bodies: about their barycentre, as the forecast places it).
  const muOf = (id: string) => Math.max(d.values[`body.${id}.mu`] ?? 0, 0);
  const others = spec.bodies.slice(1);
  let M = 0;
  let bp = ZERO;
  let bv = ZERO;
  for (const id of spec.bodies) {
    const b = ctx.bodies.find((q) => q.id === id);
    if (!b) continue;
    M += muOf(id);
    bp = add(bp, scale(b.position, muOf(id)));
    bv = add(bv, scale(b.velocity, muOf(id)));
  }
  const primaryAt = (t: number, rel: readonly Vec3[]): Vec3 => {
    if (!spec.dynamic || M <= 0 || others.length === 0)
      return add(primary?.position ?? ZERO, scale(primary?.velocity ?? ZERO, t));
    let w = ZERO;
    others.forEach((id, k) => (w = add(w, scale(rel[k]!, muOf(id)))));
    return sub(add(scale(bp, 1 / M), scale(bv, t / M)), scale(w, 1 / M));
  };
  const out: (CameraPose | null)[] = times.map(() => null);
  const arcs = [...(d.problem.builds.get(rec.id)?.arcs ?? [])].sort((a, b) => a.epoch - b.epoch);
  /** Run a compiled arc at sorted times; positions of the ship and of each other body, relative to the primary. */
  const runAt = (ca: ReturnType<typeof compileArc>, x: ArrayLike<number>, ts: number[]) => {
    const tr = simulate(ca, x, ts, s.dt);
    const sh = 3 * ca.nb;
    return tr.pos.map((P, k) => ({
      ship: { x: P[sh]! - P[0]!, y: P[sh + 1]! - P[1]!, z: P[sh + 2]! - P[2]! },
      shipV: {
        x: tr.vel[k]![sh]! - tr.vel[k]![0]!,
        y: tr.vel[k]![sh + 1]! - tr.vel[k]![1]!,
        z: tr.vel[k]![sh + 2]! - tr.vel[k]![2]!,
      },
      bodies: others.map((id) => {
        const j = 3 * (ca.bodyIndex.get(id) ?? 0);
        return { x: P[j]! - P[0]!, y: P[j + 1]! - P[1]!, z: P[j + 2]! - P[2]! };
      }),
    }));
  };
  const arrivalVelCov: Cov3 = [
    arrival.covariance.data[21]!,
    arrival.covariance.data[22]!,
    arrival.covariance.data[23]!,
    arrival.covariance.data[28]!,
    arrival.covariance.data[29]!,
    arrival.covariance.data[35]!,
  ];
  const place = (
    i: number,
    t: number,
    ship: Vec3,
    bodies: readonly Vec3[],
    cov: Cov3,
    velCov: Cov3,
  ) => {
    const q = att.at(t) ?? ctx.arrival.attitude;
    out[i] = {
      origin: add(add(primaryAt(t, bodies), ship), quat.rotate(q, mount)),
      attitude: q,
      attitudeSigma: attSigma,
      originCov: maxCov(cov, arrivalPosCov),
      velocityCov: maxCov(velCov, arrivalVelCov),
    };
  };
  /** Position and velocity columns of a central difference. */
  const diff = (plus: ReturnType<typeof runAt>, minus: ReturnType<typeof runAt>, h: number) =>
    plus.map((p, k) => {
      const m = minus[k]!;
      return {
        p: [
          (p.ship.x - m.ship.x) / (2 * h),
          (p.ship.y - m.ship.y) / (2 * h),
          (p.ship.z - m.ship.z) / (2 * h),
        ],
        v: [
          (p.shipV.x - m.shipV.x) / (2 * h),
          (p.shipV.y - m.shipV.y) / (2 * h),
          (p.shipV.z - m.shipV.z) / (2 * h),
        ],
      };
    });
  const pending: number[] = [];
  // Inside a solved arc: its solution.
  const byArc = new Map<string, number[]>();
  times.forEach((t, i) => {
    let arc: (typeof arcs)[number] | undefined;
    for (const a of arcs) if (a.epoch <= t) arc = a;
    if (!arc || !d.solutions.has(arc.id)) pending.push(i);
    else byArc.set(arc.id, [...(byArc.get(arc.id) ?? []), i]);
  });
  for (const [arcId, idxs] of byArc) {
    const sol = d.solutions.get(arcId)!;
    const order = [...idxs].sort((a, b) => times[a]! - times[b]!);
    const ts = order.map((i) => times[i]!);
    const ca = compileArc(sol.structure, sol.arc, sol.idx);
    const base = runAt(ca, sol.x, ts);
    const rel = new Set(sol.rel);
    const ship = STATE_KEYS.map((k) => sol.idx.get(`${arcId}.ship.${k}`)).filter(
      (i): i is number => i !== undefined && rel.has(i),
    );
    const cols: number[][][] = ts.map(() => []);
    const colsV: number[][][] = ts.map(() => []);
    if (sol.P && ship.length > 0) {
      const xp = Float64Array.from(sol.x);
      for (const i of ship) {
        const h = s.fdStep * sol.scale[i]!;
        xp[i] = sol.x[i]! + h;
        const plus = runAt(ca, xp, ts);
        xp[i] = sol.x[i]! - h;
        const minus = runAt(ca, xp, ts);
        xp[i] = sol.x[i]!;
        diff(plus, minus, h).forEach((c, k) => {
          cols[k]!.push(c.p);
          colsV[k]!.push(c.v);
        });
      }
    }
    const P = sol.P;
    order.forEach((i, k) => {
      const C = (a: number, b: number) => d.noiseScale * P!.data[ship[a]! * P!.cols + ship[b]!]!;
      const known = P !== null && ship.length > 0;
      place(
        i,
        times[i]!,
        base[k]!.ship,
        base[k]!.bodies,
        known ? quadCov(cols[k]!, C) : arrivalPosCov,
        known ? quadCov(colsV[k]!, C) : arrivalVelCov,
      );
    });
  }
  // Elsewhere: the arrival estimate carried forward with the executed thrust.
  const early = pending.filter((i) => times[i]! >= arrival.t);
  if (early.length > 0) {
    const law = lawInForce(model, spec, d.values);
    const rel0 = briefingBodiesAt(ctx, spec, arrival.t, law);
    const mass = new MassLog(ctx.ship, rec.measurements, arrivalMassOf(ctx));
    const burns = burnsFromExecuted(
      rec.executed,
      rec.outcome.kind === 'in-progress' ? Infinity : rec.outcome.t,
      handsOnThrust(ctx.ship, recordEnd(rec)),
    );
    const segs = segmentsFor(
      burns,
      { ship: ctx.ship, settings: s, bodies: spec.bodies, primary: spec.primary },
      att,
      mass,
    ).segments;
    const names = [...STATE_KEYS.map((k) => `dr.ship.${k}`), 'dr.kE'];
    const engine = segs.find((g) => g.thruster && g.u !== 0)?.thruster;
    const kEPrior = engine ? model.priors.find((p) => p.id === scaleId(engine)) : undefined;
    const st: Structure = {
      r0: s.r0,
      n: law.n,
      bodies: spec.bodies.map((id, j) => ({
        id,
        mu: law.mu(id),
        state: j === 0 ? 'gauge' : rel0[j - 1]!,
      })),
      ship: STATE_KEYS.map((k) => `dr.ship.${k}`) as unknown as Structure['ship'],
      dynamicBodies: spec.dynamic,
      engine: { kE: 'dr.kE', dE: 0, dP: 0 },
      kA: 1,
      camBias: [0, 0, 0],
    };
    const ca = compileArc(
      st,
      { id: 'dead-reckoning', epoch: arrival.t, commands: segs },
      new Map(names.map((nm, i) => [nm, i])),
    );
    const x0 = Float64Array.from([...arrival.state, kEPrior?.value ?? 1]);
    const order = [...early].sort((a, b) => times[a]! - times[b]!);
    const ts = order.map((i) => times[i]!);
    const base = runAt(ca, x0, ts);
    const sig = [
      ...[0, 1, 2, 3, 4, 5].map((c) => Math.sqrt(arrival.covariance.data[c * 6 + c]!)),
      kEPrior?.sigma ?? s.priorThrustScaleSigma,
    ];
    const cols: number[][][] = ts.map(() => []);
    const colsV: number[][][] = ts.map(() => []);
    const xp = Float64Array.from(x0);
    sig.forEach((sg, i) => {
      const h = Math.max(1e-3 * sg, 1e-9);
      xp[i] = x0[i]! + h;
      const plus = runAt(ca, xp, ts);
      xp[i] = x0[i]! - h;
      const minus = runAt(ca, xp, ts);
      xp[i] = x0[i]!;
      diff(plus, minus, h).forEach((c, k) => {
        cols[k]!.push(c.p);
        colsV[k]!.push(c.v);
      });
    });
    // The arrival covariance's position-velocity correlation is not recorded: diagonal.
    const C = (a: number, b: number) => (a === b ? sig[a]! * sig[a]! : 0);
    order.forEach((i, k) =>
      place(
        i,
        times[i]!,
        base[k]!.ship,
        base[k]!.bodies,
        quadCov(cols[k]!, C),
        quadCov(colsV[k]!, C),
      ),
    );
  }
  return out;
}
