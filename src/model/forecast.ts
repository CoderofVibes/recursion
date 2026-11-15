/**
 * Forecast service (1G spec revision 3, §8; DECISIONS A11, P6, P10, P11).
 *
 * The forecast propagates the player's plan from the present state (Tier L: six numbers and a
 * 6×6 covariance that carries the camera misalignment) under the adopted law × the calibration
 * profiles, with a linearised envelope (state, profile nodes, hedge outside sampled distances,
 * engine scale and both misalignment angles, the RCS scale, unprofiled masses) as a 3×3 position
 * covariance per sample, and ends at the horizon where the longest axis of the 1σ ellipsoid
 * exceeds a fraction of the distance to the nearest body (§8.4). It uses its own propagation
 * from believed parameters only; it never imports src/sim or truth. The model forecasts; it does
 * not plan.
 *
 * Planned attitudes (§3.3): the plan is resolved in time order with one running attitude, roll
 * held (`quat.pointAlong`, the function the game layer uses when the command executes), so the
 * ship flies the attitude that was forecast. Tracked asteroids get their own track and a closest
 * approach whose σ comes from the covariance of the relative position (§8.7).
 *
 * Frames: the estimator works relative to the primary body (§3.4). Output positions are in the
 * believed inertial frame of the briefing: the modelled bodies' barycentre moves uniformly from
 * its believed arrival state, and every position is placed relative to it.
 */

import {
  hullReach,
  type AsteroidForecastNote,
  type AttemptRecord,
  type AttitudeTarget,
  type ClosestApproach,
  type Cov3,
  type ExecutedCommand,
  type ForecastDetail,
  type ForecastDraft,
  type ForecastId,
  type ForecastObjectTrack,
  type ForecastSample,
  type ForecastSigmaBySource,
  type JsonValue,
  type MassProperties,
  type Plan,
  type ShipDefinition,
  type ShipEstimate,
} from '../contracts/index.ts';
import * as quat from '../lib/quat.ts';
import type { Quat } from '../lib/quat.ts';
import type { Vec3 } from '../lib/vec3.ts';
import {
  AttitudeLog,
  MassLog,
  RCS_GROUP,
  arrivalMassOf,
  burnsFromExecuted,
  handsOnThrust,
  rcsForce,
  rcsInfo,
  recordEnd,
  segmentsFor,
  thrusterInfo,
  type Burn,
  type HandsOnThrust,
} from './adapt.ts';
import { compileArc, simulate, type Arc, type Structure, type ThrustSegment } from './dynamics.ts';
import {
  EXPONENT_ID,
  RCS_SCALE_ID,
  agingBetween,
  arcCalibration,
  arrivalState,
  bodiesAt,
  contextFor,
  latestWindows,
  misalignId,
  pitchId,
  presentState,
  referenceFor,
  scaleId,
  type ModelContext,
  type ModelSnapshot,
} from './engine.ts';
import type { Matrix } from './linalg.ts';
import { asteroidOf } from './probes.ts';
import {
  anchorState,
  forecastCore,
  majorSigma,
  rangeFixes,
  wholeArcWindow,
  type ForecastCoreResult,
  type ProfileFit,
  type Window,
} from './tierL.ts';

export type { AsteroidForecastNote, ForecastDetail } from '../contracts/index.ts';

/** One sample's sizes by source, with the other bodies' share (`CovSplit.bodies`). */
export interface ModelSigmaBySource extends ForecastSigmaBySource {
  /** The other bodies' believed states at the present time (where they are pulls the ship), m. */
  readonly bodies: number;
}

/**
 * The model's forecast detail: the contract's (`ForecastDetail`), plus which body the present
 * state was fixed against and how old it is (2F request 12).
 */
export interface ModelForecastDetail extends ForecastDetail {
  readonly sigmaMajor: readonly ModelSigmaBySource[];
  /**
   * The body the present state was fixed against: the one the camera tracked most recently, and
   * the forecast's reference. Every covariance in the forecast (the ship's samples, the other
   * bodies' tracks) is relative to it; its own track carries none.
   */
  readonly presentBody: string;
  /** Issue time minus the present state's time, s. */
  readonly presentAge: number;
  /**
   * The present state is older than `settings.presentStaleAfter` (nothing was tracked lately):
   * the forecast is then carried from that older state, and says so.
   */
  readonly stale: boolean;
}

/**
 * The record as it stood at time t: what had been measured, executed and seen by then (A18: a
 * forecast is computed from the moment of commitment while time keeps running, so records that
 * arrive while it is being computed, the committed plan's own execution among them, must not
 * enter it).
 */
export function recordAsOf(rec: AttemptRecord, t: number): AttemptRecord {
  const later = <T extends { readonly t: number }>(a: readonly T[]) => a.some((x) => x.t > t);
  const ended = rec.outcome.kind !== 'in-progress' && rec.outcome.t > t;
  if (!later(rec.measurements) && !later(rec.executed) && !later(rec.events) && !ended) return rec;
  const upTo = <T extends { readonly t: number }>(a: readonly T[]) => a.filter((x) => x.t <= t);
  return {
    ...rec,
    measurements: upTo(rec.measurements),
    executed: upTo(rec.executed),
    events: upTo(rec.events),
    ...(ended ? { outcome: { kind: 'in-progress' as const } } : {}),
  };
}

export interface ForecastRequest {
  readonly id: ForecastId;
  /** The attempt in progress; its record gives executed burns, attitude and mass history. */
  readonly record: AttemptRecord;
  /** Sim time of issue. */
  readonly issuedAt: number;
  readonly plan: Plan;
  readonly massProperties: MassProperties;
  /** Forecast length, s (default settings.forecastMaxDuration). */
  readonly duration?: number;
  /** Sample spacing, s (default settings.forecastStep). */
  readonly step?: number;
}

/** Row-major 3×3 (symmetrised) → [xx, xy, xz, yy, yz, zz]. */
const toCov3 = (m: Matrix): Cov3 => [
  m.data[0]!,
  0.5 * (m.data[1]! + m.data[3]!),
  0.5 * (m.data[2]! + m.data[6]!),
  m.data[4]!,
  0.5 * (m.data[5]! + m.data[7]!),
  m.data[8]!,
];

/** Block (row, col offsets) of a 6×6 as a Cov3. */
const block3 = (m: Matrix, o: number): Cov3 => {
  const at = (i: number, j: number) => m.data[(o + i) * m.cols + o + j]!;
  return [at(0, 0), at(0, 1), at(0, 2), at(1, 1), at(1, 2), at(2, 2)];
};

const vec = (x: ArrayLike<number>, o = 0): Vec3 => ({ x: x[o]!, y: x[o + 1]!, z: x[o + 2]! });
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const len = (a: Vec3) => Math.hypot(a.x, a.y, a.z);

/** dᵀ C d / |d|² for a 3×3: the variance along d. */
function along(m: Matrix, d: Vec3): number {
  const n = len(d);
  if (!(n > 0)) return 0;
  const u = [d.x / n, d.y / n, d.z / n];
  let v = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) v += u[i]! * m.data[3 * i + j]! * u[j]!;
  return Math.max(v, 0);
}

/** Believed arrival barycentre of the modelled bodies (position, velocity) in the briefing frame. */
function barycentre(ctx: ModelContext, bodies: readonly string[], mu: (id: string) => number) {
  let M = 0;
  let p: Vec3 = { x: 0, y: 0, z: 0 };
  let v: Vec3 = { x: 0, y: 0, z: 0 };
  for (const id of bodies) {
    const b = ctx.bodies.find((q) => q.id === id);
    const m = Math.max(mu(id), 0);
    if (!b) continue;
    M += m;
    p = add(p, scale(b.position, m));
    v = add(v, scale(b.velocity, m));
  }
  if (M === 0) {
    const b = ctx.bodies.find((q) => q.id === bodies[0]);
    return { p: b?.position ?? { x: 0, y: 0, z: 0 }, v: b?.velocity ?? { x: 0, y: 0, z: 0 } };
  }
  return { p: scale(p, 1 / M), v: scale(v, 1 / M) };
}

/**
 * Planned burns from plan items (cutoffs and replacements as the ship would execute them).
 * With `handsOn`, `fly` items (a replayed procedure) count as burns: the throttle of the main
 * engine and the translation of the RCS.
 */
export function plannedBurns(plan: Plan, handsOn?: HandsOnThrust): Burn[] {
  const executed: ExecutedCommand[] = plan.items.map((i) => ({
    t: plan.epoch + i.at,
    command: i.command,
    source: 'plan',
    planId: plan.id,
    planItemId: i.id,
    status: 'executed',
  }));
  return burnsFromExecuted(executed, Infinity, handsOn);
}

const child = (v: JsonValue | undefined, key: string): JsonValue | undefined =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as { readonly [k: string]: JsonValue })[key]
    : undefined;

/**
 * The body rate a full hands-on yaw or pitch deflection asks for, from the design
 * (`propulsion.attitudeControl.handsOnTurnRate`), or 0 when the definition does not say.
 */
function handsOnTurnRate(ship: ShipDefinition): number {
  const v = child(child(child(ship.systems, 'propulsion'), 'attitudeControl'), 'handsOnTurnRate');
  return typeof v === 'number' ? v : 0;
}

/**
 * Build the forecast draft for a plan (not yet issued: pass it to issueForecast).
 *
 * It is computed as of `req.issuedAt`: the present state and the executed commands come from the
 * record up to that time only, so a forecast asked for at the moment of commitment is the same
 * however much has been recorded by the time it is served (A18).
 */
export function buildForecast(
  snap: ModelSnapshot,
  ctx: ModelContext,
  req: ForecastRequest,
): { draft: ForecastDraft; detail: ModelForecastDetail } {
  const d = snap.derived;
  const spec = d.spec;
  const s = spec.settings;
  const model = ctx;
  const record = recordAsOf(req.record, req.issuedAt);
  // This attempt's geometry (A10): bodies, asteroids and arrival estimate from its briefing.
  ctx = contextFor(model, record);
  const present =
    (d.present && d.problem.builds.has(record.id) && d.present.t <= req.issuedAt
      ? d.present
      : null) ??
    presentState(d, model, record.id, req.issuedAt) ??
    arrivalState(ctx, spec);
  const tNow = present.t;
  // Nothing after the last sample can change the forecast, so every burn stops there at the
  // latest: a held burn is commanded for far longer than any forecast.
  const tStop = req.issuedAt + (req.duration ?? s.forecastMaxDuration);
  const untilStop = (b: Burn): Burn => (b.t1 > tStop ? { ...b, t1: tStop } : b);
  const arcs = d.problem.builds.get(record.id)?.arcs ?? [];
  const arcId = (arcs.filter((a) => a.epoch <= req.issuedAt).at(-1) ?? arcs[0])?.id ?? record.id;
  // The forecast runs relative to the body the present state was fixed against (2F request 12),
  // with what the model knows of the other bodies there (2F request 13).
  const R = present.body;
  const ref = referenceFor(d, R, arcId, model);
  const bodiesNow = spec.dynamic ? bodiesAt(d, model, arcId, R, tNow, req.issuedAt) : null;
  const muOf = (id: string) => d.values[`body.${id}.mu`] ?? 0;

  // Executed burns not finished at the present state, then the plan's burns. A hands-on burn
  // still open when the forecast is issued stops at the last record (it is not known to go on);
  // a commanded burn of the attempt in progress runs on as commanded; once the attempt has
  // ended, nothing thrusts past its end.
  const att = new AttitudeLog(record.measurements);
  const mass = new MassLog(ctx.ship, record.measurements, arrivalMassOf(ctx));
  const adaptCtx = { ship: ctx.ship, settings: s, bodies: spec.bodies, primary: spec.primary };
  const executed = burnsFromExecuted(
    record.executed,
    record.outcome.kind === 'in-progress' ? Infinity : record.outcome.t,
    handsOnThrust(ctx.ship, recordEnd(record)),
  )
    .map(untilStop)
    .filter((b) => b.t1 > tNow && b.t1 > b.t0);
  const commands: ThrustSegment[] = segmentsFor(executed, adaptCtx, att, mass).segments;

  const bc = barycentre(ctx, spec.bodies, muOf);
  const others = ref.others ?? [];
  const nOthers = others.length;
  // Mean propagation (for attitude resolution and for the frame).
  const meanStructure = (segs: readonly ThrustSegment[]): ReturnType<typeof compileArc> => {
    const x = present.state;
    const st: Structure = {
      r0: ref.r0,
      n: ref.n,
      bodies: [
        { id: ref.body, mu: ref.mu, state: 'gauge' },
        ...others.map((o) => ({ id: o.id, mu: o.mu, state: o.stateAt(tNow) })),
      ],
      ship: [x[0]!, x[1]!, x[2]!, x[3]!, x[4]!, x[5]!],
      dynamicBodies: nOthers > 0,
      engine: { kE: ref.kE, dE: ref.dE, dP: ref.dP ?? 0 },
      ...(ref.engines ? { engines: ref.engines } : {}),
      kR: ref.kR ?? 1,
      kA: 1,
      camBias: [0, 0, 0],
    };
    return compileArc(st, { id: 'mean', epoch: tNow, commands: segs }, new Map());
  };
  /** Believed game-frame state of the ship and bodies at t. */
  const frameAt = (rel: ArrayLike<number>, bodies: ArrayLike<number>, t: number) => {
    // bodies: six numbers per other body, relative to the reference body R
    let M = muOf(R);
    let bp: Vec3 = { x: 0, y: 0, z: 0 };
    let bv: Vec3 = { x: 0, y: 0, z: 0 };
    others.forEach((o, k) => {
      const m = Math.max(o.mu, 0);
      M += m;
      bp = add(bp, scale(vec(bodies, 6 * k), m));
      bv = add(bv, scale(vec(bodies, 6 * k + 3), m));
    });
    const refBody = ctx.bodies.find((b) => b.id === R);
    const zero = { x: 0, y: 0, z: 0 };
    let pp: Vec3;
    let pv: Vec3;
    if (!spec.dynamic || M <= 0) {
      pv = refBody?.velocity ?? zero;
      pp = add(refBody?.position ?? zero, scale(pv, t));
    } else {
      pp = sub(add(bc.p, scale(bc.v, t)), scale(bp, 1 / M));
      pv = sub(bc.v, scale(bv, 1 / M));
    }
    const ship = { position: add(pp, vec(rel, 0)), velocity: add(pv, vec(rel, 3)) };
    const bodyPos: Record<string, Vec3> = { [R]: pp };
    others.forEach((o, k) => (bodyPos[o.id] = add(pp, vec(bodies, 6 * k))));
    return { ship, bodyPos };
  };
  const meanAt = (segs: readonly ThrustSegment[], t: number) => {
    const ca = meanStructure(segs);
    const tt = Math.max(t, tNow);
    const tr = simulate(ca, [], [tt], s.dt);
    const P = tr.pos[0]!;
    const V = tr.vel[0]!;
    const sh = 3 * (nOthers + 1);
    const rel = [0, 1, 2].map((c) => P[sh + c]! - P[c]!);
    rel.push(...[0, 1, 2].map((c) => V[sh + c]! - V[c]!));
    const bodies = new Float64Array(6 * nOthers);
    for (let k = 0; k < nOthers; k++) {
      const j = 3 * (k + 1);
      for (let c = 0; c < 3; c++) {
        bodies[6 * k + c] = P[j + c]! - P[c]!;
        bodies[6 * k + 3 + c] = V[j + c]! - V[c]!;
      }
    }
    return frameAt(rel, bodies, tt);
  };

  // ---- The plan's attitudes, in time order, with one running attitude (§3.3) ----
  const turnRate = handsOnTurnRate(ctx.ship);
  const qStart = att.at(req.issuedAt) ?? ctx.arrival.attitude;
  /** The attitude in force: held, or turning at a body rate from (t0, q0). */
  let mode: { t0: number; q0: Quat; w: Vec3 | null } = { t0: req.issuedAt, q0: qStart, w: null };
  const attitudeAt = (t: number): Quat =>
    mode.w ? quat.integrateBodyRate(mode.q0, mode.w, Math.max(0, t - mode.t0)) : mode.q0;
  const hold = (t: number, q: Quat) => (mode = { t0: t, q0: quat.normalize(q), w: null });
  /** A pointing target resolved at t from the running attitude, roll held; null: keep it. */
  const resolve = (target: AttitudeTarget, t: number): Quat | null => {
    const q = attitudeAt(t);
    switch (target.reference) {
      case 'inertial':
        return quat.normalize(target.attitude);
      case 'direction':
        return quat.pointAlong(q, target.direction);
      case 'prograde':
      case 'retrograde': {
        const v = meanAt(commands, t).ship.velocity;
        return quat.pointAlong(q, target.reference === 'prograde' ? v : scale(v, -1));
      }
      case 'toward':
      case 'away': {
        const f = meanAt(commands, t);
        const tp = f.bodyPos[target.target];
        if (!tp) return null;
        const dir = sub(tp, f.ship.position);
        return quat.pointAlong(q, target.reference === 'toward' ? dir : scale(dir, -1));
      }
      default:
        return null;
    }
  };
  /** Apply a plan item's effect on the running attitude. */
  const steer = (t: number, cmd: Plan['items'][number]['command']) => {
    if (cmd.kind === 'attitude') {
      const target = cmd.target;
      if (target.reference === 'rate') mode = { t0: t, q0: attitudeAt(t), w: target.rate };
      else if (target.reference === 'free') hold(t, attitudeAt(t));
      else {
        const q = resolve(target, t);
        if (q) hold(t, q);
      }
    } else if (cmd.kind === 'fly') {
      // Hands-on yaw (about body +z) and pitch (about body −y); roll is held at zero, the
      // demand's travel is a circle, and a deflection of 5% or less does nothing (src/ship).
      const { yaw, pitch } = cmd.input;
      const k = Math.hypot(yaw, pitch);
      if (turnRate > 0 && k > 0.05) {
        const c = turnRate / Math.max(1, k);
        mode = { t0: t, q0: attitudeAt(t), w: { x: 0, y: -pitch * c, z: yaw * c } };
      } else hold(t, attitudeAt(t));
    }
  };

  let mPlan = req.massProperties.mass;
  const rcs = rcsInfo(ctx.ship);
  // A planned hands-on burn left open runs to the end of the forecast.
  const planBurns = plannedBurns(req.plan, handsOnThrust(ctx.ship, tStop)).map(untilStop);
  const done = new Set<number>();
  const plannedAttitudes: { t: number; attitude: Quat }[] = [];
  const items = req.plan.items
    .map((it, i) => ({ t: req.plan.epoch + it.at, cmd: it.command, i }))
    .sort((a, b) => a.t - b.t || a.i - b.i);
  for (const item of items) {
    steer(item.t, item.cmd);
    for (const b of planBurns) {
      if (done.has(b.index) || b.t0 > item.t + 1e-9) continue;
      done.add(b.index);
      const force = burnForce(ctx.ship, b, s.g0);
      if (!force) continue;
      // A burn holds its own target while it fires, otherwise the running attitude (§3.3).
      const own = b.attitude ? resolve(b.attitude, b.t0) : null;
      if (own) hold(b.t0, own);
      const fixed = own;
      plannedAttitudes.push({ t: b.t0, attitude: fixed ?? attitudeAt(b.t0) });
      const info = b.thruster === RCS_GROUP ? null : thrusterInfo(ctx.ship, b.thruster);
      const push =
        b.thruster === RCS_GROUP && rcs && b.translate ? rcsForce(rcs, b.translate) : null;
      for (let t0 = b.t0; t0 < b.t1 - 1e-9; t0 += s.maxSegment) {
        const t1 = Math.min(b.t1, t0 + s.maxSegment);
        const mMid = Math.max(1, mPlan - force.flow * (0.5 * (t1 - t0)));
        const q = fixed ?? attitudeAt(0.5 * (t0 + t1));
        if (push)
          commands.push({
            t0,
            t1,
            u: 0,
            q,
            rcs: [push.x / mMid, push.y / mMid, push.z / mMid],
            thruster: RCS_GROUP,
          });
        else
          commands.push({
            t0,
            t1,
            u: force.force / mMid,
            q,
            ...(info?.mount ? { mount: info.mount } : {}),
            thruster: b.thruster,
          });
        mPlan -= force.flow * (t1 - t0);
      }
    }
  }

  // Sample times from issue to the end.
  const step = req.step ?? s.forecastStep;
  const duration = req.duration ?? s.forecastMaxDuration;
  const times: number[] = [];
  for (let t = req.issuedAt; t <= req.issuedAt + duration + 1e-9; t += step)
    if (t >= tNow) times.push(t);
  if (times.length === 0) times.push(Math.max(req.issuedAt, tNow));

  const profiles: ProfileFit[] = [...d.profiles, ...d.flatProfiles];
  // Engine terms for burns (§3.7, §8.2): the current arc's values and σ (arrival value plus its
  // deviation), else the arrival value, else the prior; plus aging from the last measurement
  // that constrained them to the time of issue.
  const lastArc = arcs.find((a) => a.id === arcId);
  const current = new Map((lastArc ? arcCalibration(d, lastArc.id) : []).map((c) => [c.id, c]));
  const engineTerm = (id: string, fallback: number, fallbackSigma: number) => {
    const c = current.get(id);
    const prior = ctx.priors.find((p) => p.id === id);
    const value = c?.value ?? d.values[id] ?? prior?.value ?? fallback;
    const sigma = c?.sigma ?? d.sigmas[id] ?? prior?.sigma ?? fallbackSigma;
    const aged = agingBetween(d, record, id, c?.tLast ?? 0, req.issuedAt).variance;
    return { value, sigma: Math.sqrt(sigma * sigma + aged) };
  };
  const engines: Record<string, { kE: number; dE: number; dP: number }> = {};
  const engineSigmas: Record<string, [number, number, number]> = {};
  const engineValues: Record<string, number> = {};
  const engineVar: Record<string, number> = {};
  const term = (id: string, fallback: number, fallbackSigma: number) => {
    const t = engineTerm(id, fallback, fallbackSigma);
    engineValues[id] = t.value;
    engineVar[id] = t.sigma * t.sigma;
    return t;
  };
  for (const thr of [
    ...new Set(commands.flatMap((c) => (c.thruster && c.u !== 0 ? [c.thruster] : []))),
  ].sort()) {
    const k = term(scaleId(thr), 1, s.priorThrustScaleSigma);
    const m = term(misalignId(thr), 0, s.priorMisalignmentSigma);
    const p = spec.planar
      ? { value: 0, sigma: 0 }
      : term(pitchId(thr), 0, s.priorMisalignmentSigma);
    engines[thr] = { kE: k.value, dE: m.value, dP: p.value };
    engineSigmas[thr] = [k.sigma, m.sigma, p.sigma];
  }
  const rcsUsed = commands.some((c) => c.rcs !== undefined);
  const kR = rcsUsed ? term(RCS_SCALE_ID, 1, s.priorRcsScaleSigma) : { value: 1, sigma: 0 };
  const engineIds = Object.keys(engineValues);
  const engineCov = new Array<number>(engineIds.length * engineIds.length).fill(0);
  engineIds.forEach((id, i) => (engineCov[i * engineIds.length + i] = engineVar[id]!));
  const muSigma: Record<string, number> = {};
  for (const o of others)
    if (!d.profiles.some((p) => p.body === o.id)) muSigma[o.id] = d.sigmas[`body.${o.id}.mu`] ?? 0;
  const fc = forecastCore({
    ref: { ...ref, engines, kR: kR.value },
    profiles,
    commands,
    tNow,
    xNow: present.state,
    PNow: present.covariance,
    times,
    dt: s.dt,
    s2: 1, // the present-state covariance already carries s²
    sigmaH: d.sigmaH0,
    validated: d.validated,
    engineSigma: [0, 0, 0],
    engineSigmas,
    rcsSigma: kR.sigma,
    muSigma,
    ...(spec.dynamic ? { bodyLaw: true } : {}),
    ...(bodiesNow ? { othersCov: bodiesNow.cov, othersEta: bodiesNow.eta } : {}),
    h: s.fdStep,
  });

  // Horizon (§8.4) and samples. Distances and their uncertainty are taken relative to each body:
  // the other bodies' believed motion is uncertain too (2F request 13).
  const radius = (id: string) => ctx.bodies.find((b) => b.id === id)?.radius ?? 0;
  // The farthest point of the hull from the centre of mass, in 3D.
  const hull = hullReach(req.massProperties.hull, req.massProperties.centerOfMass);
  const samples: ForecastSample[] = [];
  const sigmaMajor: ModelSigmaBySource[] = [];
  /** The ship's samples inside the horizon: index into fc, position, believed body positions. */
  const kept: { k: number; t: number; ship: Vec3; bodyPos: Readonly<Record<string, Vec3>> }[] = [];
  const tracks = new Map<string, { t: number; position: Vec3; positionCov: Cov3 }[]>(
    spec.bodies.map((b) => [b, []]),
  );
  const L = (p: ProfileFit, r: number) =>
    r > p.rMax ? Math.log(r / p.rMax) : r < p.rMin ? Math.log(r / p.rMin) : 0;
  const bodySeries = new Map<string, { t: number; d: Vec3; cov: Matrix }[]>(
    spec.bodies.map((b) => [b, []]),
  );
  for (let k = 0; k < fc.times.length; k++) {
    const rel = fc.mean[k]!;
    const bodies = fc.bodies[k]!;
    const cv = fc.cov[k]!;
    const total = majorSigma(cv.total);
    const shipRel = vec(rel);
    const dist: Record<string, number> = { [R]: len(shipRel) };
    others.forEach((o, j) => (dist[o.id] = len(sub(shipRel, vec(bodies, 6 * j)))));
    /** The ship's position covariance relative to body id (relative to R it is the total). */
    const relCov = (id: string): Matrix => (id === R ? cv.total : fc.relCov[k]![id]!);
    let nearest = R;
    for (const id of Object.keys(dist)) if (dist[id]! < dist[nearest]!) nearest = id;
    // The line ends at the horizon, and wherever a number stops being finite.
    if (
      !(majorSigma(relCov(nearest)) <= s.horizonFraction * dist[nearest]!) ||
      !rel.every(Number.isFinite)
    )
      break;
    const t = fc.times[k]!;
    const frame = frameAt(rel, bodies, t);
    // Extrapolating: outside the covered range of the body that pulls hardest here.
    const n = spec.exponent ? (d.values[EXPONENT_ID] ?? 2) : 2;
    let dominant = R;
    let best = -1;
    for (const [id, r] of Object.entries(dist)) {
      const a = (muOf(id) / (s.r0 * s.r0)) * Math.pow(s.r0 / r, n);
      if (a > best) {
        best = a;
        dominant = id;
      }
    }
    const prof = profiles.find((p) => p.body === dominant);
    const extrapolating = prof ? L(prof, dist[dominant]!) !== 0 : true;
    // Validated: extrapolating, but inside an adopted rule's validated span (§7.4, A5).
    const validated =
      extrapolating &&
      (d.validated[dominant]?.spans ?? []).some(
        ([lo, hi]) => lo <= dist[dominant]! && dist[dominant]! <= hi,
      );
    kept.push({ k, t, ship: frame.ship.position, bodyPos: frame.bodyPos });
    samples.push({
      t,
      position: frame.ship.position,
      velocity: frame.ship.velocity,
      positionCov: toCov3(cv.total),
      extrapolating,
      ...(validated ? { validated } : {}),
    });
    sigmaMajor.push({
      t,
      state: majorSigma(cv.state),
      profile: majorSigma(cv.profile),
      hedge: majorSigma(cv.hedge),
      engine: majorSigma(cv.engine),
      mass: majorSigma(cv.mass),
      bodies: majorSigma(cv.bodies),
      total,
    });
    for (const id of spec.bodies) {
      const bp = frame.bodyPos[id]!;
      // Every covariance is relative to R: the other bodies' tracks carry their own (2F
      // request 13), R's none.
      const positionCov: Cov3 = id === R ? [0, 0, 0, 0, 0, 0] : toCov3(fc.bodyCov[k]![id]!);
      tracks.get(id)!.push({ t, position: bp, positionCov });
      // Relative to a modelled body, the ship's envelope is the relative position's (§8.7).
      bodySeries.get(id)!.push({ t, d: sub(frame.ship.position, bp), cov: relCov(id) });
    }
  }

  const approach = new Map<string, ClosestApproach>();
  for (const [id, series] of bodySeries) {
    const ca = closestApproach(id, series, radius(id) + hull);
    if (ca) approach.set(id, ca);
  }

  // Tracked asteroids (§10, §8.7): each from its latest probe arc, flown under the same law.
  const asteroidNotes: AsteroidForecastNote[] = [];
  const latestProbe = new Map<string, Arc>();
  for (const a of d.probes.get(record.id) ?? []) latestProbe.set(asteroidOf(a.id)!, a);
  const keptAt = new Map(kept.map((q) => [q.t, q]));
  for (const [ast, probe] of latestProbe) {
    const arc = probe.meas.some((m) => m.t > req.issuedAt)
      ? { ...probe, meas: probe.meas.filter((m) => m.t <= req.issuedAt) }
      : probe;
    // The asteroid's present state, like the ship's, from the body it was fixed against last.
    let pick: { body: string; wins: Window[] } | null = latestWindows(arc, spec.bodies, s);
    if (!pick) {
      let lastFix = -Infinity;
      for (const b of spec.bodies) {
        const all = wholeArcWindow(arc, b);
        const end = rangeFixes(arc, b).at(-1)?.t ?? -Infinity;
        if (all && all.fixes.length >= s.windowKeepFixes && end > lastFix) {
          pick = { body: b, wins: [all] };
          lastFix = end;
        }
      }
    }
    if (!pick) {
      asteroidNotes.push({ id: ast, forecast: false });
      continue;
    }
    const Ra = pick.body;
    const aref = referenceFor(d, Ra, arc.id, model);
    // A track whose present state cannot be fitted is not forecast; the ship's forecast stands.
    let anc: ReturnType<typeof anchorState>;
    try {
      anc = anchorState(aref, d.profiles.find((p) => p.body === Ra) ?? null, arc, pick.wins, s.dt, {
        h: s.fdStep,
        gPrior: [1, s.localScalePriorSigma],
        slopeSigma: s.anchorSlopePriorSigma,
        extraProfiles: d.profiles.filter((p) => p.body !== Ra),
      });
    } catch {
      asteroidNotes.push({ id: ast, forecast: false });
      continue;
    }
    const aTimes = kept.map((q) => q.t).filter((t) => t >= anc.tNow);
    if (aTimes.length === 0 || ![...anc.state, ...anc.covariance.data].every(Number.isFinite)) {
      asteroidNotes.push({ id: ast, forecast: false });
      continue;
    }
    const PA = { rows: 6, cols: 6, data: anc.covariance.data.map((v) => v * d.noiseScale) };
    const afc = forecastCore({
      ref: aref,
      profiles,
      commands: [],
      tNow: anc.tNow,
      xNow: anc.state,
      PNow: PA,
      times: aTimes,
      dt: s.dt,
      s2: 1,
      sigmaH: d.sigmaH0,
      validated: d.validated,
      engineSigma: [0, 0, 0],
      muSigma,
      ...(spec.dynamic ? { bodyLaw: true } : {}),
      h: s.fdStep,
    });
    const radiusA = ctx.asteroids?.find((q) => q.id === ast)?.radius ?? 0;
    const track: { t: number; position: Vec3; positionCov: Cov3 }[] = [];
    const series: { t: number; d: Vec3; cov: Matrix }[] = [];
    for (let k = 0; k < afc.times.length; k++) {
      const rel = afc.mean[k]!;
      const ob = afc.bodies[k]!;
      const cv = afc.cov[k]!;
      let nearest = len(vec(rel));
      for (let j = 0; j < nOthers; j++)
        nearest = Math.min(nearest, len(sub(vec(rel), vec(ob, 6 * j))));
      if (!(majorSigma(cv.total) <= s.horizonFraction * nearest)) break;
      const t = afc.times[k]!;
      const here = keptAt.get(t)!;
      const position = add(here.bodyPos[Ra]!, vec(rel));
      track.push({ t, position, positionCov: toCov3(cv.total) });
      series.push({
        t,
        d: sub(here.ship, position),
        cov: relativeCovariance(fc, here.k, afc, k, Ra === R ? null : Ra),
      });
    }
    if (track.length > 0) tracks.set(ast, track);
    const ca = closestApproach(ast, series, radiusA + hull);
    if (ca) approach.set(ast, ca);
    asteroidNotes.push({
      id: ast,
      forecast: track.length > 0,
      tLast: anc.tNow,
      fixes: anc.info.nFixes,
    });
  }

  const presentFrame = (() => {
    const z = new Float64Array(6 * nOthers);
    others.forEach((o, k) => z.set(o.stateAt(tNow), 6 * k));
    return frameAt(present.state, z, tNow);
  })();
  const rate = lastRate(record);
  const initial: ShipEstimate = {
    t: tNow,
    position: presentFrame.ship.position,
    velocity: presentFrame.ship.velocity,
    positionCov: block3(present.covariance, 0),
    velocityCov: block3(present.covariance, 3),
    attitude: att.at(tNow) ?? ctx.arrival.attitude,
    attitudeSigma: ctx.arrival.attitudeSigma,
    angularVelocity: rate ?? { x: 0, y: 0, z: 0 },
  };
  const objects: ForecastObjectTrack[] = [...tracks.entries()].map(([id, samplesB]) => ({
    id,
    samples: samplesB,
  }));
  const adopted = snap.state.extensions.filter((e) => e.status === 'adopted').map((e) => e.id);
  const camera = present.camera;
  const detail: ModelForecastDetail = {
    sigmaMajor,
    presentSource: present.source,
    presentTime: tNow,
    asteroids: asteroidNotes,
    presentBody: R,
    presentAge: req.issuedAt - tNow,
    stale: req.issuedAt - tNow > s.presentStaleAfter,
  };
  const draft: ForecastDraft = {
    id: req.id,
    attemptId: req.record.id,
    issuedAt: req.issuedAt,
    modelVersion: snap.state.version,
    inputs: {
      initial,
      massProperties: req.massProperties,
      plan: req.plan,
      parameters: { ...d.values },
      extensions: adopted,
      calibration: snap.state.calibration,
      noiseScale: d.noiseScale,
      hedge: d.sigmaH0,
      ...(Object.keys(d.validated).length > 0
        ? {
            earnedHedge: Object.fromEntries(
              Object.entries(d.validated).map(([b, v]) => [b, { sigma: v.sigmaE, spans: v.spans }]),
            ),
          }
        : {}),
      ...(engineIds.length > 0
        ? { engine: { values: engineValues, covariance: { ids: engineIds, values: engineCov } } }
        : {}),
      ...(camera
        ? {
            camera: {
              values: Object.fromEntries(camera.ids.map((id, i) => [id, camera.value[i]!])),
              covariance: {
                ids: [...camera.ids],
                values: camera.ids.flatMap((_, i) =>
                  camera.ids.map((__, j) => (i === j ? camera.sigma[i]! ** 2 : 0)),
                ),
              },
            },
          }
        : {}),
      ...(plannedAttitudes.length > 0 ? { plannedAttitudes } : {}),
    },
    horizon: samples.length > 0 ? samples[samples.length - 1]!.t : req.issuedAt,
    samples,
    objects,
    closestApproaches: [...approach.values()],
    detail,
  };
  return { draft, detail };
}

/** Nominal force (N) and propellant flow (kg/s) of a planned burn. */
function burnForce(
  ship: ShipDefinition,
  b: Burn,
  g0: number,
): { force: number; flow: number } | null {
  if (b.thruster === RCS_GROUP) {
    const info = rcsInfo(ship);
    if (!info || !b.translate) return null;
    const f = rcsForce(info, b.translate);
    const force = len(f);
    return { force, flow: info.isp > 0 ? force / (info.isp * g0) : 0 };
  }
  const info = thrusterInfo(ship, b.thruster);
  if (!info) return null;
  const force = info.thrust * b.throttle;
  return { force, flow: info.isp > 0 ? force / (info.isp * g0) : 0 };
}

/**
 * §8.7: covariance of the relative position d = r_object − r_ship at one sample. Not the sum of
 * the two envelopes: both paths respond to the same law, so the shared sources (profile nodes,
 * hedge exponents, unprofiled masses) enter through S_object − S_ship. The two present states,
 * the ship's engine terms and the bodies' states in the ship's forecast are independent.
 *
 * `via`: the body the object's forecast is relative to, when it is not the ship forecast's
 * reference body: then d = (object − via) − (ship − via), and the ship's side is taken relative
 * to that body.
 */
function relativeCovariance(
  ship: ForecastCoreResult,
  ks: number,
  obj: ForecastCoreResult,
  ko: number,
  via: string | null,
): Matrix {
  const m = ship.sensitivity.independent(ks, via);
  for (let i = 0; i < 9; i++) m.data[i]! += obj.cov[ko]!.state.data[i]!;
  const col = (r: ForecastCoreResult, name: string, k: number, c: number) =>
    r.sensitivity.columns.get(name)?.[3 * k + c] ?? 0;
  const viaCol = (name: string, c: number) =>
    via === null ? 0 : (ship.sensitivity.bodyColumns.get(via)?.get(name)?.[3 * ks + c] ?? 0);
  for (const blk of ship.sensitivity.shared) {
    const n = blk.names.length;
    const S = blk.names.map((name) =>
      [0, 1, 2].map((c) => col(obj, name, ko, c) - (col(ship, name, ks, c) - viaCol(name, c))),
    );
    for (let a = 0; a < n; a++)
      for (let b = 0; b < n; b++) {
        const v = blk.cov.data[a * n + b]!;
        if (v === 0) continue;
        for (let r = 0; r < 3; r++)
          for (let c = 0; c < 3; c++) m.data[3 * r + c]! += S[a]![r]! * v * S[b]![c]!;
      }
  }
  return m;
}

/**
 * §8.7: the closest approach along the samples inside the horizon: the smallest |d|, refined with
 * a parabola through the three samples around it; clearance |d| − `margin` (the object's radius
 * and the hull's reach), σ along the line between the centres. When the smallest |d| is the last
 * sample inside the horizon it is reported there: the closest the forecast shows.
 */
function closestApproach(
  id: string,
  series: readonly { t: number; d: Vec3; cov: Matrix }[],
  margin: number,
): ClosestApproach | null {
  if (series.length === 0) return null;
  const r = series.map((q) => len(q.d));
  let k = 0;
  for (let i = 1; i < r.length; i++) if (r[i]! < r[k]!) k = i;
  let t = series[k]!.t;
  let dist = r[k]!;
  if (k > 0 && k + 1 < r.length) {
    const a = r[k - 1]!;
    const b = r[k]!;
    const c = r[k + 1]!;
    const curv = a - 2 * b + c;
    const h0 = series[k]!.t - series[k - 1]!.t;
    const h1 = series[k + 1]!.t - series[k]!.t;
    if (curv > 0 && Math.abs(h0 - h1) < 1e-6 * Math.max(h0, 1)) {
      const off = (0.5 * (a - c)) / curv;
      t = series[k]!.t + off * h0;
      dist = b - ((a - c) * (a - c)) / (8 * curv);
    }
  }
  const q = series[k]!;
  return { id, t, distance: dist - margin, sigma: Math.sqrt(along(q.cov, q.d)) };
}

/** Latest gyro rate, body frame, rad/s. */
function lastRate(rec: AttemptRecord): Vec3 | undefined {
  for (let i = rec.measurements.length - 1; i >= 0; i--) {
    const m = rec.measurements[i]!;
    if (m.kind === 'rate') return { x: m.value[0] ?? 0, y: m.value[1] ?? 0, z: m.value[2] ?? 0 };
  }
  return undefined;
}
