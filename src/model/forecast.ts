/**
 * Forecast service (1G spec §8; DECISIONS P6, P10, P11).
 *
 * The forecast propagates the player's plan from the present state (Tier L) under the adopted
 * law × the calibration profiles, with a linearised envelope (state, profile nodes, hedge outside
 * sampled distances, engine and unprofiled masses) and ends at the horizon where the 1σ envelope
 * exceeds a fraction of the distance to the nearest body. It uses its own propagation from
 * believed parameters only; it never imports src/sim or truth. The model forecasts; it does not
 * plan: attitude targets are resolved exactly as commanded, at ignition.
 *
 * Frames: the estimator works relative to the primary body (§3.4). Output positions are in the
 * believed inertial frame of the briefing: the modelled bodies' barycentre moves uniformly from
 * its believed arrival state, and every position is placed relative to it.
 */

import type {
  AttemptRecord,
  AttitudeTarget,
  ClosestApproach,
  Cov2,
  ExecutedCommand,
  ForecastDraft,
  ForecastId,
  ForecastObjectTrack,
  ForecastSample,
  MassProperties,
  Plan,
  ShipEstimate,
} from '../contracts/index.ts';
import type { Vec2 } from '../lib/vec2.ts';
import {
  AttitudeLog,
  MassLog,
  arrivalMassOf,
  burnsFromExecuted,
  segmentsFor,
  thrusterInfo,
  type Burn,
} from './adapt.ts';
import { compileArc, simulate, type Structure, type ThrustSegment } from './dynamics.ts';
import {
  EXPONENT_ID,
  arrivalState,
  misalignId,
  presentState,
  referenceFor,
  scaleId,
  type ModelContext,
  type ModelSnapshot,
  type PresentState,
} from './engine.ts';
import { forecastCore, majorSigma, type ProfileFit } from './tierL.ts';

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

export interface ForecastDetail {
  /** Per sample, the 1σ major axis of each uncertainty source (m). */
  readonly sigmaMajor: readonly { t: number; state: number; profile: number; hedge: number; engine: number; mass: number; total: number }[];
  /** How the present state was obtained. */
  readonly presentSource: PresentState['source'];
  readonly presentTime: number;
}

const toCov2 = (m: { data: Float64Array }): Cov2 => [m.data[0]!, 0.5 * (m.data[1]! + m.data[2]!), m.data[3]!];

/** Believed arrival barycentre of the modelled bodies (position, velocity) in the briefing frame. */
function barycentre(ctx: ModelContext, bodies: readonly string[], mu: (id: string) => number) {
  let M = 0;
  const p = { x: 0, y: 0 };
  const v = { x: 0, y: 0 };
  for (const id of bodies) {
    const b = ctx.bodies.find((q) => q.id === id);
    const m = Math.max(mu(id), 0);
    if (!b) continue;
    M += m;
    p.x += m * b.position.x;
    p.y += m * b.position.y;
    v.x += m * b.velocity.x;
    v.y += m * b.velocity.y;
  }
  if (M === 0) {
    const b = ctx.bodies.find((q) => q.id === bodies[0]);
    return { p: b?.position ?? { x: 0, y: 0 }, v: b?.velocity ?? { x: 0, y: 0 } };
  }
  return { p: { x: p.x / M, y: p.y / M }, v: { x: v.x / M, y: v.y / M } };
}

/** Planned burns from plan items (cutoffs and replacements as the ship would execute them). */
export function plannedBurns(plan: Plan): Burn[] {
  const executed: ExecutedCommand[] = plan.items.map((i) => ({
    t: plan.epoch + i.at,
    command: i.command,
    source: 'plan',
    planId: plan.id,
    planItemId: i.id,
    status: 'executed',
  }));
  return burnsFromExecuted(executed);
}

/** The attitude target in force at each planned burn (burn's own, else the latest attitude command). */
function planAttitudes(plan: Plan): Map<number, AttitudeTarget | undefined> {
  const items = [...plan.items].sort((a, b) => a.at - b.at);
  const out = new Map<number, AttitudeTarget | undefined>();
  let current: AttitudeTarget | undefined;
  for (const i of items) {
    if (i.command.kind === 'attitude') current = i.command.target;
    if (i.command.kind === 'burn') out.set(plan.epoch + i.at, i.command.attitude ?? current);
  }
  return out;
}

/** Build the forecast draft for a plan (not yet issued: pass it to issueForecast). */
export function buildForecast(snap: ModelSnapshot, ctx: ModelContext, req: ForecastRequest): { draft: ForecastDraft; detail: ForecastDetail } {
  const d = snap.derived;
  const spec = d.spec;
  const s = spec.settings;
  const present =
    (d.present && d.problem.builds.has(req.record.id) ? d.present : null) ??
    presentState(d, ctx, req.record.id) ??
    arrivalState(ctx, spec);
  const tNow = present.t;
  const arcId = d.problem.builds.get(req.record.id)?.arcs.at(-1)?.id ?? req.record.id;
  const ref = referenceFor(d, spec.primary, arcId, ctx);
  const muOf = (id: string) => d.values[`body.${id}.mu`] ?? 0;

  // Executed burns not finished at the present state, then the plan's burns.
  const att = new AttitudeLog(req.record.measurements);
  const mass = new MassLog(ctx.ship, req.record.measurements, arrivalMassOf(ctx));
  const adaptCtx = { ship: ctx.ship, settings: s, bodies: spec.bodies, primary: spec.primary };
  const executed = burnsFromExecuted(req.record.executed, Infinity).filter((b) => b.t1 > tNow);
  const commands: ThrustSegment[] = segmentsFor(executed, adaptCtx, att, mass).segments;

  const bc = barycentre(ctx, spec.bodies, muOf);
  const others = ref.others ?? [];
  const nOthers = others.length;
  // Mean propagation (for attitude resolution at ignition and for the frame).
  const meanStructure = (segs: readonly ThrustSegment[]): ReturnType<typeof compileArc> => {
    const st: Structure = {
      r0: ref.r0,
      n: ref.n,
      bodies: [{ id: ref.body, mu: ref.mu, state: 'gauge' }, ...others.map((o) => ({ id: o.id, mu: o.mu, state: o.stateAt(tNow) }))],
      ship: [present.state[0]!, present.state[1]!, present.state[2]!, present.state[3]!],
      dynamicBodies: nOthers > 0,
      engine: { kE: ref.kE, dE: ref.dE },
      ...(ref.engines ? { engines: ref.engines } : {}),
      kA: 1,
      camBias: 0,
    };
    return compileArc(st, { id: 'mean', epoch: tNow, commands: segs }, new Map());
  };
  /** Believed game-frame state of the ship and bodies at t. */
  const frameAt = (rel: Float64Array, bodies: Float64Array, t: number) => {
    // bodies: [x, y, vx, vy] per other body, relative to the primary
    let M = muOf(spec.primary);
    let bx = 0;
    let by = 0;
    let bvx = 0;
    let bvy = 0;
    others.forEach((o, k) => {
      const m = Math.max(o.mu, 0);
      M += m;
      bx += m * bodies[4 * k]!;
      by += m * bodies[4 * k + 1]!;
      bvx += m * bodies[4 * k + 2]!;
      bvy += m * bodies[4 * k + 3]!;
    });
    const fixed = !spec.dynamic;
    const primary = ctx.bodies.find((b) => b.id === spec.primary);
    let px: number;
    let py: number;
    let pvx: number;
    let pvy: number;
    if (fixed || M <= 0) {
      px = (primary?.position.x ?? 0) + (primary?.velocity.x ?? 0) * t;
      py = (primary?.position.y ?? 0) + (primary?.velocity.y ?? 0) * t;
      pvx = primary?.velocity.x ?? 0;
      pvy = primary?.velocity.y ?? 0;
    } else {
      px = bc.p.x + bc.v.x * t - bx / M;
      py = bc.p.y + bc.v.y * t - by / M;
      pvx = bc.v.x - bvx / M;
      pvy = bc.v.y - bvy / M;
    }
    const ship = { position: { x: px + rel[0]!, y: py + rel[1]! }, velocity: { x: pvx + rel[2]!, y: pvy + rel[3]! } };
    const bodyPos: Record<string, Vec2> = { [spec.primary]: { x: px, y: py } };
    others.forEach((o, k) => (bodyPos[o.id] = { x: px + bodies[4 * k]!, y: py + bodies[4 * k + 1]! }));
    return { ship, bodyPos };
  };
  const meanAt = (segs: readonly ThrustSegment[], t: number) => {
    const ca = meanStructure(segs);
    const tr = simulate(ca, [], [Math.max(t, tNow)], s.dt);
    const P = tr.pos[0]!;
    const V = tr.vel[0]!;
    const sh = nOthers + 1;
    const rel = Float64Array.of(P[2 * sh]! - P[0]!, P[2 * sh + 1]! - P[1]!, V[2 * sh]! - V[0]!, V[2 * sh + 1]! - V[1]!);
    const bodies = new Float64Array(4 * nOthers);
    for (let k = 0; k < nOthers; k++) {
      const j = k + 1;
      bodies.set([P[2 * j]! - P[0]!, P[2 * j + 1]! - P[1]!, V[2 * j]! - V[0]!, V[2 * j + 1]! - V[1]!], 4 * k);
    }
    return frameAt(rel, bodies, Math.max(t, tNow));
  };

  // Planned burns: direction resolved at ignition from the believed state (P6: as commanded).
  const attitudes = planAttitudes(req.plan);
  let mPlan = req.massProperties.mass;
  for (const b of plannedBurns(req.plan)) {
    const info = thrusterInfo(ctx.ship, b.thruster);
    if (!info) continue;
    const target = b.attitude ?? attitudes.get(b.t0);
    const latest = att.at(Math.min(b.t0, req.issuedAt)) ?? ctx.arrival.attitude;
    let angle = latest;
    if (target) {
      if (target.reference === 'inertial') angle = target.angle;
      else if (target.reference === 'prograde' || target.reference === 'retrograde') {
        const st = meanAt(commands, b.t0).ship.velocity;
        angle = Math.atan2(st.y, st.x) + (target.reference === 'retrograde' ? Math.PI : 0) + (target.offset ?? 0);
      } else if (target.reference === 'toward' || target.reference === 'away') {
        const f = meanAt(commands, b.t0);
        const tp = f.bodyPos[target.target];
        if (tp) angle = Math.atan2(tp.y - f.ship.position.y, tp.x - f.ship.position.x) + (target.reference === 'away' ? Math.PI : 0) + (target.offset ?? 0);
      } else if (target.reference === 'rate') angle = latest + target.rate * (b.t0 - req.issuedAt);
    }
    const flow = info.isp > 0 ? (info.thrust * b.throttle) / (info.isp * s.g0) : 0;
    const force = info.thrust * b.throttle;
    for (let t0 = b.t0; t0 < b.t1 - 1e-9; t0 += s.maxSegment) {
      const t1 = Math.min(b.t1, t0 + s.maxSegment);
      const mMid = Math.max(1, mPlan - flow * (0.5 * (t1 - t0)));
      commands.push({ t0, t1, u: force / mMid, theta: angle + info.bodyAngle, bodyAngle: info.bodyAngle, thruster: b.thruster });
      mPlan -= flow * (t1 - t0);
    }
  }

  // Sample times from issue to the end.
  const step = req.step ?? s.forecastStep;
  const duration = req.duration ?? s.forecastMaxDuration;
  const times: number[] = [];
  for (let t = req.issuedAt; t <= req.issuedAt + duration + 1e-9; t += step) if (t >= tNow) times.push(t);
  if (times.length === 0) times.push(Math.max(req.issuedAt, tNow));

  const profiles: ProfileFit[] = [...d.profiles, ...d.flatProfiles];
  const engineSigmas: Record<string, [number, number]> = {};
  for (const thr of Object.keys(ref.engines ?? {}))
    engineSigmas[thr] = [d.sigmas[scaleId(thr)] ?? s.priorThrustScaleSigma, d.sigmas[misalignId(thr)] ?? s.priorMisalignmentSigma];
  // Thrusters never fitted fly with prior values and prior σ.
  const engines: Record<string, { kE: number; dE: number }> = { ...(ref.engines ?? {}) };
  for (const c of commands) {
    if (!c.thruster || engines[c.thruster]) continue;
    const ps = ctx.priors.find((p) => p.id === scaleId(c.thruster!));
    const pm = ctx.priors.find((p) => p.id === misalignId(c.thruster!));
    engines[c.thruster] = { kE: ps?.value ?? 1, dE: pm?.value ?? 0 };
    engineSigmas[c.thruster] = [ps?.sigma ?? s.priorThrustScaleSigma, pm?.sigma ?? s.priorMisalignmentSigma];
  }
  const muSigma: Record<string, number> = {};
  for (const o of others) if (!d.profiles.some((p) => p.body === o.id)) muSigma[o.id] = d.sigmas[`body.${o.id}.mu`] ?? 0;
  const fc = forecastCore({
    ref: { ...ref, engines },
    profiles,
    commands,
    tNow,
    xNow: present.state,
    PNow: present.covariance,
    times,
    dt: s.dt,
    s2: 1, // the present-state covariance already carries s²
    sigmaH: d.hedge,
    engineSigma: [0, 0],
    engineSigmas,
    muSigma,
    h: s.fdStep,
  });

  // Horizon (§8.4) and samples.
  const radius = (id: string) => ctx.bodies.find((b) => b.id === id)?.radius ?? 0;
  const hull = Math.max(0, ...req.massProperties.footprint.map((p) => Math.hypot(p.x - req.massProperties.centerOfMass.x, p.y - req.massProperties.centerOfMass.y)));
  const samples: ForecastSample[] = [];
  const sigmaMajor: ForecastDetail['sigmaMajor'][number][] = [];
  const tracks = new Map<string, { t: number; position: Vec2; positionCov: Cov2 }[]>(spec.bodies.map((b) => [b, []]));
  const approach = new Map<string, ClosestApproach>();
  const L = (p: ProfileFit, r: number) => (r > p.rMax ? Math.log(r / p.rMax) : r < p.rMin ? Math.log(r / p.rMin) : 0);
  for (let k = 0; k < fc.times.length; k++) {
    const rel = fc.mean[k]!;
    const bodies = fc.bodies[k]!;
    const cv = fc.cov[k]!;
    const total = majorSigma(cv.total);
    const dist: Record<string, number> = { [spec.primary]: Math.hypot(rel[0]!, rel[1]!) };
    others.forEach((o, j) => (dist[o.id] = Math.hypot(rel[0]! - bodies[4 * j]!, rel[1]! - bodies[4 * j + 1]!)));
    const nearest = Math.min(...Object.values(dist));
    if (total > s.horizonFraction * nearest) break;
    const t = fc.times[k]!;
    const frame = frameAt(rel, bodies, t);
    // Extrapolating: outside the covered range of the body that pulls hardest here.
    const n = spec.exponent ? d.values[EXPONENT_ID] ?? 2 : 2;
    let dominant = spec.primary;
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
    const positionCov = toCov2(cv.total);
    samples.push({ t, position: frame.ship.position, velocity: frame.ship.velocity, positionCov, extrapolating });
    sigmaMajor.push({ t, state: majorSigma(cv.state), profile: majorSigma(cv.profile), hedge: majorSigma(cv.hedge), engine: majorSigma(cv.engine), mass: majorSigma(cv.mass), total });
    for (const id of spec.bodies) {
      const bp = frame.bodyPos[id]!;
      tracks.get(id)!.push({ t, position: bp, positionCov: [0, 0, 0] });
      const dx = frame.ship.position.x - bp.x;
      const dy = frame.ship.position.y - bp.y;
      const r = Math.hypot(dx, dy);
      const clearance = r - radius(id) - hull;
      const prev = approach.get(id);
      if (!prev || clearance < prev.distance) {
        const ux = dx / r;
        const uy = dy / r;
        const sig = Math.sqrt(Math.max(0, ux * ux * positionCov[0] + 2 * ux * uy * positionCov[1] + uy * uy * positionCov[2]));
        approach.set(id, { id, t, distance: clearance, sigma: sig });
      }
    }
  }

  const presentFrame = (() => {
    const z = new Float64Array(4 * nOthers);
    others.forEach((o, k) => z.set(o.stateAt(tNow), 4 * k));
    return frameAt(present.state, z, tNow);
  })();
  const pc = present.covariance.data;
  const initial: ShipEstimate = {
    t: tNow,
    position: presentFrame.ship.position,
    velocity: presentFrame.ship.velocity,
    positionCov: [pc[0]!, pc[1]!, pc[5]!],
    velocityCov: [pc[10]!, pc[11]!, pc[15]!],
    attitude: att.at(tNow) ?? ctx.arrival.attitude,
    attitudeSigma: ctx.arrival.attitudeSigma,
    angularRate: lastValue(req.record, 'rate') ?? 0,
  };
  const objects: ForecastObjectTrack[] = [...tracks.entries()].map(([id, samplesB]) => ({ id, samples: samplesB }));
  const adopted = snap.state.extensions.filter((e) => e.status === 'adopted').map((e) => e.id);
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
      hedge: d.hedge,
    },
    horizon: samples.length > 0 ? samples[samples.length - 1]!.t : req.issuedAt,
    samples,
    objects,
    closestApproaches: [...approach.values()],
  };
  return { draft, detail: { sigmaMajor, presentSource: present.source, presentTime: tNow } };
}

function lastValue(rec: AttemptRecord, kind: 'rate' | 'attitude'): number | undefined {
  for (let i = rec.measurements.length - 1; i >= 0; i--) {
    const m = rec.measurements[i]!;
    if (m.kind === kind) return m.value[0];
  }
  return undefined;
}
