/**
 * The predictive model as the game uses it (1G spec §3, §4, §5, §8.1, §11; DECISIONS A4, P5, P8).
 *
 * buildModel() is a pure, deterministic function of the Black Box records, the encounter
 * briefing and the adopted extensions: Tier G over every retained arc, then Tier L (windows,
 * local fits, per-body calibration profiles, noise scale) under the new reference law, then
 * the present state of the attempt in progress. A rebuild from records therefore equals the
 * live state by construction (P8, spec §11.3). The model fits numbers; it never adopts a rule
 * by itself (extensions.ts).
 */

import type {
  AttemptId,
  AttemptRecord,
  BelievedBody,
  CalibrationProfile,
  CovarianceMatrix,
  DataSupport,
  EncounterBriefing,
  EncounterId,
  ExtensionId,
  ExtensionState,
  ModelState,
  ParameterEstimate,
  ParameterPrior,
  ResidualStats,
  ShipDefinition,
  ShipEstimate,
} from '../contracts/index.ts';
import { hashState } from '../lib/hash.ts';
import { arcsFromRecord, type ArcBuild, type Burn } from './adapt.ts';
import {
  compileArc,
  simulate,
  usable,
  SHIP_REFS,
  type Arc,
  type BodyDef,
  type EngineDef,
  type Structure,
} from './dynamics.ts';
import { zeros, type Matrix } from './linalg.ts';
import { resolveSettings, settingsRecord, type ModelSettings } from './settings.ts';
import { fitGet, fitNu, stagedFit, type FitResult, type Param } from './solve.ts';
import {
  anchorState,
  bodyStateParams,
  buildProfile,
  flatProfile,
  guessBody,
  guessShip,
  localFit,
  makeWindows,
  noiseScale,
  rangeFixes,
  shipParams,
  type Anchor,
  type FrozenBody,
  type ProfileFit,
  type ReferenceLaw,
  type WindowFit,
  type WindowRule,
} from './tierL.ts';

// ---------------------------------------------------------------------------------------------
// Context and structure
// ---------------------------------------------------------------------------------------------

/** What the model knows on arrival: the briefing, the nominal ship and settings. Belief only. */
export interface ModelContext {
  readonly encounterId: EncounterId;
  /** Arrival priors (briefing). `body.<id>.mu` priors define the modelled bodies. */
  readonly priors: readonly ParameterPrior[];
  /** Bodies known on arrival, as believed at t = 0 (briefing). */
  readonly bodies: readonly BelievedBody[];
  readonly ship: ShipDefinition;
  /** Navigation estimate on arrival (briefing). */
  readonly arrival: ShipEstimate;
  /** Ship mass on arrival, kg (default: dry plus full tanks). */
  readonly arrivalMass?: number;
  /** Bodies are held fixed instead of attracting each other (mock worlds only). */
  readonly fixedBodies?: boolean;
  readonly settings?: Partial<ModelSettings>;
}

export function contextFromBriefing(
  briefing: EncounterBriefing,
  ship: ShipDefinition,
  opts: { arrivalMass?: number; fixedBodies?: boolean; settings?: Partial<ModelSettings> } = {},
): ModelContext {
  return {
    encounterId: briefing.id,
    priors: briefing.priors,
    bodies: briefing.knownBodies,
    ship,
    arrival: briefing.arrivalEstimate,
    ...opts,
  };
}

export const muId = (body: string) => `body.${body}.mu`;
export const EXPONENT_ID = 'law.gravity.exponent';
export const scaleId = (thr: string) => `thruster.${thr}.scale`;
export const misalignId = (thr: string) => `thruster.${thr}.misalignment`;

/** Extension ids: 'distance-law', and 'unmodeled-body:<bodyId>' (seen mode, spec §6.3). */
export function extensionBody(ext: ExtensionId): string | null {
  return ext.startsWith('unmodeled-body:') ? ext.slice('unmodeled-body:'.length) : null;
}

export interface ModelSpec {
  readonly primary: string;
  /** Modelled bodies, primary first. */
  readonly bodies: readonly string[];
  readonly exponent: boolean;
  readonly dynamic: boolean;
  readonly cameraId: string;
  readonly settings: ModelSettings;
}

function priorOf(ctx: ModelContext, id: string): ParameterPrior | undefined {
  return ctx.priors.find((p) => p.id === id);
}

export function modelSpec(ctx: ModelContext, adopted: readonly ExtensionId[]): ModelSpec {
  const settings = resolveSettings(ctx.settings);
  const known = ctx.bodies.map((b) => b.id);
  const withPrior = known.filter((id) => priorOf(ctx, muId(id)));
  for (const p of ctx.priors) {
    const m = /^body\.(.+)\.mu$/.exec(p.id);
    if (m && !withPrior.includes(m[1]!)) withPrior.push(m[1]!);
  }
  const extra = adopted.map(extensionBody).filter((b): b is string => b !== null && !withPrior.includes(b));
  const bodies = [...withPrior, ...extra];
  if (bodies.length === 0) throw new Error('model: the briefing gives no body.<id>.mu prior');
  const muPrior = (id: string) => priorOf(ctx, muId(id))?.value ?? 0;
  const primary = bodies.reduce((best, id) => (muPrior(id) > muPrior(best) ? id : best), bodies[0]!);
  const camera = ctx.ship.equipment.find((e) => e.kind === 'optical-tracker')?.id ?? 'camera';
  return {
    primary,
    bodies: [primary, ...bodies.filter((b) => b !== primary)],
    exponent: adopted.includes('distance-law'),
    dynamic: !ctx.fixedBodies && bodies.length > 1,
    cameraId: camera,
    settings,
  };
}

export const windowRule = (s: ModelSettings): WindowRule => ({
  sweep: s.windowSweep,
  lnRange: s.windowLnRange,
  minFixes: s.windowMinFixes,
  keepFixes: s.windowKeepFixes,
});

// ---------------------------------------------------------------------------------------------
// Bodies on arrival (briefing) propagated with the prior law
// ---------------------------------------------------------------------------------------------

function briefingBody(ctx: ModelContext, id: string): BelievedBody | undefined {
  return ctx.bodies.find((b) => b.id === id);
}

/**
 * Other modelled bodies relative to the primary (primary at rest) at time t, from the briefing
 * at t = 0 propagated with the arrival priors. Rows: [x, y, vx, vy] per non-primary body.
 */
export function briefingBodiesAt(ctx: ModelContext, spec: ModelSpec, t: number): number[][] {
  const p = briefingBody(ctx, spec.primary);
  const rel = spec.bodies.slice(1).map((id) => {
    const b = briefingBody(ctx, id);
    if (!p || !b) return [0, 0, 0, 0];
    return [b.position.x - p.position.x, b.position.y - p.position.y, b.velocity.x - p.velocity.x, b.velocity.y - p.velocity.y];
  });
  if (t === 0 || rel.length === 0) return rel;
  if (!spec.dynamic) return rel.map((r) => [r[0]! + r[2]! * t, r[1]! + r[3]! * t, r[2]!, r[3]!]);
  const st: Structure = {
    r0: spec.settings.r0,
    n: 2,
    bodies: spec.bodies.map((id, j) => ({
      id,
      mu: priorOf(ctx, muId(id))?.value ?? 0,
      state: j === 0 ? 'gauge' : (rel[j - 1] as unknown as readonly [number, number, number, number]),
    })),
    ship: [1e15, 0, 0, 0],
    dynamicBodies: true,
    engine: { kE: 1, dE: 0 },
    kA: 1,
    camBias: 0,
  };
  const ca = compileArc(st, { id: 'briefing', epoch: 0, commands: [] }, new Map());
  const tr = simulate(ca, [], [t], spec.settings.dt);
  const P = tr.pos[0]!;
  const V = tr.vel[0]!;
  return spec.bodies.slice(1).map((_, k) => {
    const j = k + 1;
    return [P[2 * j]! - P[0]!, P[2 * j + 1]! - P[1]!, V[2 * j]! - V[0]!, V[2 * j + 1]! - V[1]!];
  });
}

// ---------------------------------------------------------------------------------------------
// Tier G problem
// ---------------------------------------------------------------------------------------------

export interface TierGProblem {
  readonly structure: Structure;
  readonly params: Param[];
  readonly arcs: Arc[];
  readonly builds: ReadonlyMap<AttemptId, ArcBuild>;
  /** Global parameter ids, in order. */
  readonly globals: readonly string[];
  readonly accelSource?: string;
}

function thrustersOf(arcs: readonly Arc[]): string[] {
  const s = new Set<string>();
  for (const a of arcs) for (const c of a.commands) if (c.thruster) s.add(c.thruster);
  return [...s].sort();
}

/** Tier G structure and parameters for the given attempts (§3.6, §4.5). */
export function tierGProblem(
  ctx: ModelContext,
  spec: ModelSpec,
  attempts: readonly AttemptRecord[],
): TierGProblem {
  const s = spec.settings;
  const builds = new Map<AttemptId, ArcBuild>();
  const arcs: Arc[] = [];
  const levels: string[] = [];
  for (const rec of attempts) {
    const b = arcsFromRecord(rec, {
      ship: ctx.ship,
      settings: s,
      ...(ctx.arrivalMass !== undefined ? { arrivalMass: ctx.arrivalMass } : {}),
      bodies: spec.bodies,
      primary: spec.primary,
    });
    builds.set(rec.id, b);
    arcs.push(...b.arcs);
    levels.push(...b.limitedLevels);
  }
  const thrusters = thrustersOf(arcs);
  const accelSource = attempts.flatMap((r) => r.measurements).find((m) => m.kind === 'accel')?.source;
  const hasAccel = arcs.some((a) => a.meas.some((m) => m.kind === 'accel'));
  const camId = `sensor.${spec.cameraId}.bias`;
  const kAId = `sensor.${accelSource ?? 'accelerometer'}.scale`;
  const engines: Record<string, EngineDef> = {};
  for (const thr of thrusters) engines[thr] = { kE: scaleId(thr), dE: misalignId(thr) };
  const others = spec.bodies.slice(1);
  const bodies: BodyDef[] = spec.bodies.map((id, j) => {
    if (j === 0) return { id, mu: muId(id), state: 'gauge' };
    if (!spec.dynamic) {
      const byArc: Record<string, readonly [number, number, number, number]> = {};
      for (const a of arcs) {
        const r = briefingBodiesAt(ctx, spec, a.epoch)[j - 1]!;
        byArc[a.id] = [r[0]!, r[1]!, 0, 0];
      }
      return { id, mu: muId(id), state: [0, 0, 0, 0], stateByArc: byArc };
    }
    return { id, mu: muId(id), state: [`{att}.${id}.x`, `{att}.${id}.y`, `{att}.${id}.vx`, `{att}.${id}.vy`] as const };
  });
  const structure: Structure = {
    r0: s.r0,
    n: spec.exponent ? EXPONENT_ID : 2,
    bodies,
    ship: SHIP_REFS,
    dynamicBodies: spec.dynamic,
    engine: { kE: 1, dE: 0 },
    engines,
    kA: hasAccel ? kAId : 1,
    camBias: camId,
  };
  const globals: Param[] = [];
  for (const id of spec.bodies) {
    const p = priorOf(ctx, muId(id));
    const mean = p?.value ?? 0;
    const sigma = p?.sigma ?? s.priorExtraBodyMuSigma;
    const unit = Math.abs(mean) > 0 ? Math.abs(mean) : 0.01 * sigma;
    globals.push({ name: muId(id), init: mean === 0 ? 0.01 * sigma : mean, scale: 1e-3 * unit, priorMean: mean, priorSigma: sigma, group: 'global' });
  }
  if (spec.exponent) {
    const p = priorOf(ctx, EXPONENT_ID);
    globals.push({ name: EXPONENT_ID, init: p?.value ?? 2, scale: 1e-3, priorMean: p?.value ?? 2, priorSigma: p?.sigma ?? s.priorExponentSigma, group: 'global' });
  }
  for (const thr of thrusters) {
    const ps = priorOf(ctx, scaleId(thr));
    const pm = priorOf(ctx, misalignId(thr));
    globals.push({ name: scaleId(thr), init: ps?.value ?? 1, scale: 1e-3, priorMean: ps?.value ?? 1, priorSigma: ps?.sigma ?? s.priorThrustScaleSigma, group: 'global' });
    globals.push({ name: misalignId(thr), init: pm?.value ?? 0, scale: 1e-3, priorMean: pm?.value ?? 0, priorSigma: pm?.sigma ?? s.priorMisalignmentSigma, group: 'global' });
  }
  if (hasAccel) {
    const p = priorOf(ctx, kAId);
    globals.push({ name: kAId, init: p?.value ?? 1, scale: 1e-4, priorMean: p?.value ?? 1, priorSigma: p?.sigma ?? s.priorAccelScaleSigma, group: 'global' });
  }
  {
    const p = priorOf(ctx, camId);
    globals.push({ name: camId, init: p?.value ?? 0, scale: 1e-5, priorMean: p?.value ?? 0, priorSigma: p?.sigma ?? s.priorCameraBiasSigma, group: 'global' });
  }
  const locals: Param[] = [];
  for (const a of arcs) {
    locals.push(...shipParams(a.id, guessShip(a, spec.primary, a.epoch)));
    if (spec.dynamic && others.length > 0) {
      const prior = briefingBodiesAt(ctx, spec, a.epoch);
      const pBody = briefingBody(ctx, spec.primary);
      others.forEach((id, k) => {
        const b = briefingBody(ctx, id);
        const posSigma = Math.sqrt(
          Math.max(b?.positionCov[0] ?? 0, b?.positionCov[2] ?? 0) + Math.max(pBody?.positionCov[0] ?? 0, pBody?.positionCov[2] ?? 0),
        );
        const mean = prior[k]!;
        const nFix = rangeFixes(a, id).length;
        const guess = nFix >= 3 ? guessBody(a, spec.primary, id, a.epoch) : mean;
        locals.push(
          ...bodyStateParams(a.id, id, guess, {
            mean,
            sigma: [Math.max(posSigma, 1), Math.max(posSigma, 1), s.priorBodyVelocitySigma, s.priorBodyVelocitySigma],
          }),
        );
      });
    }
  }
  for (const name of levels) {
    const arc = name.slice(0, name.indexOf('.burn'));
    locals.push({ name, init: 1, scale: 1e-3, priorMean: 1, priorSigma: s.limitedBurnLevelSigma, group: arc });
  }
  return {
    structure,
    params: [...locals, ...globals],
    arcs,
    builds,
    globals: globals.map((p) => p.name),
    ...(accelSource ? { accelSource } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// The model snapshot
// ---------------------------------------------------------------------------------------------

export interface ModelInput {
  readonly context: ModelContext;
  readonly attempts: readonly AttemptRecord[];
  /** Adopted extensions (structure). */
  readonly adopted: readonly ExtensionId[];
  /** Extension history for ModelState.extensions. */
  readonly extensions?: readonly ExtensionState[];
  /** Hedge earned by validated rules (§7.4); default settings.sigmaH. */
  readonly hedge?: number;
  readonly version: number;
  readonly parent?: number;
  /** The attempt in progress, for the present state. */
  readonly current?: AttemptId;
}

export interface ArcSolution {
  readonly arc: Arc;
  /** Parameter vector and index of the Tier G fit (or priors when not fitted). */
  readonly x: Float64Array;
  readonly idx: ReadonlyMap<string, number>;
  readonly structure: Structure;
}

export interface PresentState {
  readonly source: 'anchor' | 'arrival';
  /** Time of the state. */
  readonly t: number;
  /** Ship relative to the primary (x, y, vx, vy), primary at rest at t. */
  readonly state: Float64Array;
  /** 4×4 covariance including s². */
  readonly covariance: Matrix;
  readonly anchor?: Anchor;
}

export interface ModelDerived {
  readonly spec: ModelSpec;
  readonly problem: TierGProblem;
  readonly fit: FitResult | null;
  /** Global values in force (Tier G when converged, else priors). */
  readonly values: Readonly<Record<string, number>>;
  readonly sigmas: Readonly<Record<string, number>>;
  readonly solutions: ReadonlyMap<string, ArcSolution>;
  readonly windows: readonly WindowFit[];
  readonly profiles: readonly ProfileFit[];
  /** Covered ranges for bodies without a profile (hedge, §8.2). */
  readonly flatProfiles: readonly ProfileFit[];
  readonly noiseScale: number;
  readonly hedge: number;
  readonly present: PresentState | null;
}

export interface ModelSnapshot {
  readonly state: ModelState;
  readonly derived: ModelDerived;
}

/** Reference law for Tier L around `body` within one arc (§5.2), others frozen from Tier G. */
export function referenceFor(d: Pick<ModelDerived, 'spec' | 'values' | 'solutions'>, body: string, arcId: string, ctx: ModelContext): ReferenceLaw {
  const v = d.values;
  const spec = d.spec;
  const n = spec.exponent ? v[EXPONENT_ID] ?? 2 : 2;
  const engines: Record<string, { kE: number; dE: number }> = {};
  for (const [k, val] of Object.entries(v)) {
    const m = /^thruster\.(.+)\.scale$/.exec(k);
    if (m) engines[m[1]!] = { kE: val, dE: v[misalignId(m[1]!)] ?? 0 };
  }
  const sol = d.solutions.get(arcId);
  const others: FrozenBody[] = spec.bodies
    .filter((b) => b !== body)
    .map((id) => ({
      id,
      mu: v[muId(id)] ?? 0,
      stateAt: (t: number) => relativeState(d, ctx, sol, arcId, id, body, t),
    }));
  return {
    r0: spec.settings.r0,
    body,
    mu: v[muId(body)] ?? 0,
    n,
    cam: v[`sensor.${spec.cameraId}.bias`] ?? 0,
    kE: 1,
    dE: 0,
    engines,
    others,
  };
}

/** State of body `id` relative to body `ref` (ref at rest) at t, from an arc solution. */
function relativeState(
  d: Pick<ModelDerived, 'spec'>,
  ctx: ModelContext,
  sol: ArcSolution | undefined,
  _arcId: string,
  id: string,
  ref: string,
  t: number,
): readonly [number, number, number, number] {
  const bodies = d.spec.bodies;
  let P: Float64Array;
  let V: Float64Array;
  if (sol && t >= sol.arc.epoch) {
    const ca = compileArc(sol.structure, sol.arc, sol.idx);
    const tr = simulate(ca, sol.x, [t], d.spec.settings.dt);
    P = tr.pos[0]!;
    V = tr.vel[0]!;
  } else {
    const rel = briefingBodiesAt(ctx, d.spec, t);
    P = new Float64Array(2 * bodies.length);
    V = new Float64Array(2 * bodies.length);
    rel.forEach((r, k) => {
      P[2 * (k + 1)] = r[0]!;
      P[2 * (k + 1) + 1] = r[1]!;
      V[2 * (k + 1)] = r[2]!;
      V[2 * (k + 1) + 1] = r[3]!;
    });
  }
  const i = bodies.indexOf(id);
  const j = bodies.indexOf(ref);
  return [P[2 * i]! - P[2 * j]!, P[2 * i + 1]! - P[2 * j + 1]!, V[2 * i]! - V[2 * j]!, V[2 * i + 1]! - V[2 * j + 1]!];
}

function believedPull(mu: number, n: number, r0: number, r: number): number {
  return (mu / (r0 * r0)) * Math.pow(r0 / r, n);
}

/** Local fits keyed by window and reference law; results are identical with or without it. */
export type TierLCache = Map<string, WindowFit>;

export interface BuildOptions {
  /** Reuse these Tier G results instead of refitting (in-flight refresh, §11.2). */
  readonly reuse?: ModelDerived;
  readonly cache?: TierLCache;
}

/** Tier G + Tier L + present state: the full rebuild (§11.3). Pure and deterministic. */
export function buildModel(input: ModelInput, opts: BuildOptions = {}): ModelSnapshot {
  const ctx = input.context;
  const spec = modelSpec(ctx, input.adopted);
  const s = spec.settings;
  const attempts = [...input.attempts]
    .filter((a) => a.encounterId === ctx.encounterId)
    .sort((a, b) => a.index - b.index || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const problem = tierGProblem(ctx, spec, attempts);
  const reuse = opts.reuse;
  let fit: FitResult | null = reuse ? reuse.fit : null;
  if (!reuse && problem.arcs.length > 0)
    fit = stagedFit(problem.structure, problem.arcs, problem.params, { dt: s.dt, h: s.fdStep });
  const priorX = Float64Array.from(problem.params, (p) => p.init);
  const useFit = !reuse && fit !== null && fit.converged;
  const x = useFit ? fit!.x : priorX;
  const idx = new Map(problem.params.map((p, i) => [p.name, i]));
  const values: Record<string, number> = {};
  const sigmas: Record<string, number> = {};
  for (const g of problem.globals) {
    const i = idx.get(g)!;
    const prm = problem.params[i]!;
    values[g] = reuse?.values[g] ?? x[i]!;
    sigmas[g] = reuse?.sigmas[g] ?? (useFit ? fitGet(fit!, g)[1] : prm.priorSigma ?? 0);
  }
  const solutions = new Map<string, ArcSolution>();
  for (const a of problem.arcs) {
    const old = reuse?.solutions.get(a.id);
    solutions.set(a.id, old && old.arc.epoch === a.epoch ? old : { arc: a, x, idx, structure: problem.structure });
  }

  // Tier L per body with range fixes (§5).
  const partial = { spec, values, solutions };
  const rule = windowRule(s);
  const windows: WindowFit[] = [];
  const profiles: ProfileFit[] = [];
  const flatProfiles: ProfileFit[] = [];
  const n = spec.exponent ? values[EXPONENT_ID] ?? 2 : 2;
  for (const body of spec.bodies) {
    const rows: WindowFit[] = [];
    for (const a of problem.arcs) {
      const ref = referenceFor(partial, body, a.id, ctx);
      for (const w of makeWindows(a, body, rule)) {
        // Coasting windows only; a sliver between two burns is too short to fit.
        if (w.powered || w.fixes.length < s.windowKeepFixes) continue;
        if (ref.others && ref.others.length > 0) {
          const mid = w.fixes[w.fixes.length >> 1]!;
          const ship = [-mid.z[1]! * Math.cos(mid.z[0]!), -mid.z[1]! * Math.sin(mid.z[0]!)];
          const own = believedPull(ref.mu, n, s.r0, mid.z[1]!);
          const tooStrong = ref.others.some((o) => {
            const st = o.stateAt(mid.t);
            const r = Math.hypot(st[0] - ship[0]!, st[1] - ship[1]!);
            return believedPull(o.mu, n, s.r0, r) > s.otherBodyPullLimit * own;
          });
          if (tooStrong) continue;
        }
        const key = opts.cache
          ? `${w.id}|${w.t0}|${w.t1}|${w.fixes.length}|${hashState([
              ref.mu,
              ref.n,
              ref.cam,
              ref.engines ?? null,
              (ref.others ?? []).map((o) => [o.mu, o.stateAt(w.t0)]),
              s.localScalePriorSigma,
              s.dt,
            ])}`
          : '';
        const hit = opts.cache?.get(key);
        const row = hit ?? localFit(ref, a, w, s.dt, [1, s.localScalePriorSigma]);
        if (!hit) opts.cache?.set(key, row);
        rows.push(row);
      }
    }
    windows.push(...rows);
    if (rows.length > 0)
      profiles.push(buildProfile(rows, s.r0, body, { delta: s.profileStep, curvature: s.profileCurvature, ridge: s.profileRidge }));
    else {
      const ranges = problem.arcs.flatMap((a) => rangeFixes(a, body).map((m) => m.z[1]!));
      flatProfiles.push(
        ranges.length > 0 ? flatProfile(body, Math.min(...ranges), Math.max(...ranges), s.r0) : flatProfile(body, s.r0, s.r0, s.r0),
      );
    }
  }
  const s2 = noiseScale(windows);
  const hedge = Math.max(s.sigmaHFloor, Math.min(s.sigmaH, input.hedge ?? s.sigmaH));

  const derivedBase = { spec, problem, fit, values, sigmas, solutions, windows, profiles, flatProfiles, noiseScale: s2, hedge };
  const present = input.current ? presentState({ ...derivedBase, present: null }, ctx, input.current) : null;
  const derived: ModelDerived = { ...derivedBase, present };
  const state = toModelState(input, derived, attempts);
  return { state, derived };
}

/** §8.1: the present state of an attempt from its most recent coasting windows. */
export function presentState(d: ModelDerived, ctx: ModelContext, attemptId: AttemptId): PresentState | null {
  const s = d.spec.settings;
  const build = d.problem.builds.get(attemptId);
  const arc = build?.arcs[build.arcs.length - 1];
  const nFix = arc ? rangeFixes(arc, d.spec.primary).length : 0;
  if (!arc || nFix < s.windowMinFixes) return arrivalState(ctx, d.spec);
  const wins = makeWindows(arc, d.spec.primary, windowRule(s))
    .filter((w) => !w.powered && w.fixes.length >= s.windowKeepFixes)
    .slice(-s.anchorWindows);
  if (wins.length === 0) return arrivalState(ctx, d.spec);
  const prof = d.profiles.find((p) => p.body === d.spec.primary) ?? null;
  const extra = d.profiles.filter((p) => p.body !== d.spec.primary);
  const ref = referenceFor(d, d.spec.primary, arc.id, ctx);
  const anc = anchorState(ref, prof, arc, wins, s.dt, {
    h: s.fdStep,
    gPrior: [1, s.localScalePriorSigma],
    slopeSigma: s.anchorSlopePriorSigma,
    extraProfiles: extra,
  });
  const cov = zeros(4, 4);
  for (let i = 0; i < 16; i++) cov.data[i] = anc.covariance.data[i]! * d.noiseScale;
  return { source: 'anchor', t: anc.tNow, state: anc.state, covariance: cov, anchor: anc };
}

/** Before enough fixes: the arrival estimate, relative to the primary's believed arrival state. */
export function arrivalState(ctx: ModelContext, spec: ModelSpec): PresentState {
  const a = ctx.arrival;
  const p = briefingBody(ctx, spec.primary);
  const px = p?.position.x ?? 0;
  const py = p?.position.y ?? 0;
  const vx = p?.velocity.x ?? 0;
  const vy = p?.velocity.y ?? 0;
  const cov = zeros(4, 4);
  const pc = a.positionCov;
  const vc = a.velocityCov;
  const bc = p?.positionCov ?? [0, 0, 0];
  cov.data[0] = pc[0] + bc[0];
  cov.data[1] = cov.data[4] = pc[1] + bc[1];
  cov.data[5] = pc[2] + bc[2];
  cov.data[10] = vc[0];
  cov.data[11] = cov.data[14] = vc[1];
  cov.data[15] = vc[2];
  return {
    source: 'arrival',
    t: a.t,
    state: Float64Array.of(a.position.x - px, a.position.y - py, a.velocity.x - vx, a.velocity.y - vy),
    covariance: cov,
  };
}

// ---------------------------------------------------------------------------------------------
// Contract view
// ---------------------------------------------------------------------------------------------

function labelFor(ctx: ModelContext, id: string): { label: string; unit: string; extension?: string } {
  const p = priorOf(ctx, id);
  if (p) return { label: p.label, unit: p.unit, ...(p.extension ? { extension: p.extension } : {}) };
  let m = /^body\.(.+)\.mu$/.exec(id);
  if (m) {
    const name = ctx.bodies.find((b) => b.id === m![1])?.name ?? m[1]!;
    return { label: `${name} μ`, unit: 'm³/s²', extension: `unmodeled-body:${m[1]}` };
  }
  if (id === EXPONENT_ID) return { label: 'Distance-law exponent', unit: '', extension: 'distance-law' };
  const eqName = (eq: string) => ctx.ship.equipment.find((e) => e.id === eq)?.name ?? eq;
  m = /^thruster\.(.+)\.scale$/.exec(id);
  if (m) return { label: `${eqName(m[1]!)} thrust scale`, unit: '' };
  m = /^thruster\.(.+)\.misalignment$/.exec(id);
  if (m) return { label: `${eqName(m[1]!)} misalignment`, unit: 'rad' };
  m = /^sensor\.(.+)\.scale$/.exec(id);
  if (m) return { label: `${eqName(m[1]!)} scale`, unit: '' };
  m = /^sensor\.(.+)\.bias$/.exec(id);
  if (m) return { label: `${eqName(m[1]!)} bearing bias`, unit: 'rad' };
  return { label: id, unit: '' };
}

export function toCalibrationProfile(p: ProfileFit, windows: readonly WindowFit[]): CalibrationProfile {
  return {
    body: p.body,
    distances: p.uNodes.map((u) => p.r0 * Math.exp(u)),
    scale: [...p.g],
    covariance: Array.from(p.covariance.data),
    inflation: p.inflation,
    windows: windows
      .filter((w) => w.body === p.body)
      .map((w) => ({ start: w.t0, end: w.t1, distance: w.rGeoMean, scale: w.g, sigma: w.sigma })),
  };
}

function mergeSpans(spans: [number, number][]): [number, number][] {
  const s = [...spans].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const sp of s) {
    const last = out[out.length - 1];
    if (last && sp[0] <= last[1]) last[1] = Math.max(last[1], sp[1]);
    else out.push([sp[0], sp[1]]);
  }
  return out;
}

/** Cross-range residuals (m) from bearing residuals: whitened residual × σ × measured range. */
export function crossRangeResiduals(d: Pick<ModelDerived, 'fit' | 'problem'>): { arc: string; t: number; powered: boolean; m: number }[] {
  const fit = d.fit;
  if (!fit) return [];
  // The fit may predate the current arcs (in-flight refresh), so match by tag, not position.
  const fixes = new Map<string, { s: number; r: number }>();
  for (const a of d.problem.arcs)
    for (const m of a.meas)
      if (m.kind === 'opnav' && m.z.length > 1 && usable(d.problem.structure, m))
        fixes.set(`${a.id}|${m.t}|${m.target}`, { s: m.sigma[0]!, r: m.z[1]! });
  const out: { arc: string; t: number; powered: boolean; m: number }[] = [];
  fit.residTags.forEach((tag, k) => {
    if (tag.kind !== 'bearing') return;
    const f = fixes.get(`${tag.arc}|${tag.t}|${tag.target}`);
    if (f) out.push({ arc: tag.arc, t: tag.t, powered: tag.powered, m: fit.resid[k]! * f.s * f.r });
  });
  return out;
}

function toModelState(input: ModelInput, d: ModelDerived, attempts: readonly AttemptRecord[]): ModelState {
  const ctx = input.context;
  const fit = d.fit;
  const used = new Set(d.problem.arcs.map((a) => a.id.split('~')[0]!));
  const prm = new Map(d.problem.params.map((p) => [p.name, p]));
  const parameters: ParameterEstimate[] = d.problem.globals.map((g) => {
    const p = prm.get(g)!;
    const sigma = d.sigmas[g]!;
    const ps = p.priorSigma ?? sigma;
    return {
      id: g,
      ...labelFor(ctx, g),
      value: d.values[g]!,
      sigma,
      prior: { mean: p.priorMean ?? p.init, sigma: ps },
      support: ps > 0 ? Math.min(1, Math.max(0, 1 - (sigma * sigma) / (ps * ps))) : 0,
    };
  });
  // Priors the model does not estimate stay at the prior (support 0).
  for (const p of ctx.priors)
    if (!parameters.some((q) => q.id === p.id) && !(p.extension && !input.adopted.includes(p.extension)))
      if (!/^body\./.test(p.id))
        parameters.push({ id: p.id, label: p.label, unit: p.unit, value: p.value, sigma: p.sigma, prior: { mean: p.value, sigma: p.sigma }, ...(p.extension ? { extension: p.extension } : {}), support: 0 });
  const ids = d.problem.globals;
  const values = new Array<number>(ids.length * ids.length).fill(0);
  if (fit && fit.converged) {
    const gi = ids.map((g) => fit.names.indexOf(g));
    gi.forEach((a, i) => gi.forEach((b, j) => (values[i * ids.length + j] = fit.P.data[a * fit.P.cols + b]!)));
  } else ids.forEach((g, i) => (values[i * ids.length + i] = d.sigmas[g]! ** 2));
  const covariance: CovarianceMatrix = { ids: [...ids], values };

  const distance: Record<string, [number, number][]> = {};
  for (const body of d.spec.bodies) {
    const spans: [number, number][] = [];
    for (const a of d.problem.arcs) {
      const r = rangeFixes(a, body).map((m) => m.z[1]!);
      if (r.length > 0) spans.push([Math.min(...r), Math.max(...r)]);
    }
    distance[body] = mergeSpans(spans);
  }
  const powered: [number, number][] = [];
  for (const a of d.problem.arcs) {
    const accelTimes = a.meas.filter((m) => m.kind === 'accel').map((m) => m.t);
    const build = d.problem.builds.get(a.id.split('~')[0]!);
    for (const b of build?.burns ?? ([] as Burn[]))
      if (accelTimes.some((t) => t >= b.t0 && t < b.t1)) powered.push([b.t0, b.t1]);
  }
  const support: DataSupport = { distance, powered: mergeSpans(powered) };

  const res = crossRangeResiduals(d);
  const stat = (p: boolean) => {
    const sel = res.filter((r) => r.powered === p);
    return { rms: sel.length ? Math.sqrt(sel.reduce((s, r) => s + r.m * r.m, 0) / sel.length) : 0, n: sel.length };
  };
  const residuals: ResidualStats = { coast: stat(false), powered: stat(true) };
  const measurementCount = d.problem.arcs.reduce((s, a) => s + a.meas.length, 0);
  const manifest = attempts.map((a) => [a.id, a.measurements.length, a.executed.length, a.events.length]);
  return {
    version: input.version,
    ...(input.parent !== undefined ? { parent: input.parent } : {}),
    parameters,
    covariance,
    extensions: [...(input.extensions ?? [])],
    support,
    residuals,
    basedOn: { attempts: attempts.filter((a) => used.has(a.id)).map((a) => a.id), measurementCount },
    dataManifest: hashState(manifest),
    ...(fit
      ? { fit: { chi2: fit.chi2, nu: fitNu(fit), pEff: fit.pEff, iterations: fit.iterations, converged: fit.converged } }
      : {}),
    calibration: d.profiles.map((p) => toCalibrationProfile(p, d.windows)),
    settings: settingsRecord(d.spec.settings),
  };
}

/** Global parameter values by id (for forecast inputs and the reference law). */
export function parameterValues(d: Pick<ModelDerived, 'values'>): Record<string, number> {
  return { ...d.values };
}

/**
 * Ship calibration that carries to the next encounter (A4): thruster and sensor estimates as
 * priors. Body values and calibration tables do not transfer.
 */
export function carriedCalibration(state: ModelState): ParameterPrior[] {
  return state.parameters
    .filter((p) => /^(thruster|sensor)\./.test(p.id) && p.support > 0)
    .map((p) => ({ id: p.id, label: p.label, unit: p.unit, value: p.value, sigma: p.sigma }));
}
