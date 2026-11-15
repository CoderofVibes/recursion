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
  BelievedAsteroid,
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
  TransitRecord,
} from '../contracts/index.ts';
import { hashState } from '../lib/hash.ts';
import {
  agingClass,
  agingOf,
  conditionAtEnd,
  historyIn,
  historyVariance,
  transitHistory,
  type AgingHistory,
} from './aging.ts';
import { arcsFromRecord, type ArcBuild, type Burn } from './adapt.ts';
import {
  compileArc,
  simulate,
  usable,
  SHIP_REFS,
  type Arc,
  type ArcSolution as DynArcSolution,
  type BodyDef,
  type ProfileDef,
  type EngineDef,
  type Ref,
  type Structure,
  type ThrustSegment,
} from './dynamics.ts';
import type { ValidatedHedge } from './extensions.ts';
import { zeros, type Matrix } from './linalg.ts';
import { attemptOfArc, probeArcs, shipArcOf } from './probes.ts';
import { resolveSettings, settingsRecord, type ModelSettings } from './settings.ts';
import { fitGet, fitNu, stagedFit, type FitResult, type Param } from './solve.ts';
import {
  anchorState,
  bodyStateParams,
  buildProfile,
  flatProfile,
  guessBody,
  guessShip,
  localFitDetailed,
  makeWindows,
  noiseScale,
  rangeFixes,
  shipParams,
  type Anchor,
  type FrozenBody,
  type LocalFitResult,
  type ProfileFit,
  type ReferenceLaw,
  type Window,
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
  /** Asteroids known on arrival (briefing): their radii set forecast clearances. */
  readonly asteroids?: readonly BelievedAsteroid[];
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
    asteroids: briefing.knownAsteroids,
    ship,
    arrival: briefing.arrivalEstimate,
    ...opts,
  };
}

/**
 * The geometry an attempt was given (DECISIONS A10: each run starts from different geometry):
 * the bodies' and asteroids' arrival states and the arrival estimate from the attempt's own
 * briefing when recorded (`AttemptStart.briefing`), else the encounter's. Priors, masses and
 * the ship never vary with it.
 */
export function contextFor(ctx: ModelContext, rec?: Pick<AttemptRecord, 'start'>): ModelContext {
  const b = rec?.start.briefing;
  if (!b) return ctx;
  return { ...ctx, bodies: b.knownBodies, asteroids: b.knownAsteroids, arrival: b.arrivalEstimate };
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
  const extra = adopted
    .map(extensionBody)
    .filter((b): b is string => b !== null && !withPrior.includes(b));
  const bodies = [...withPrior, ...extra];
  if (bodies.length === 0) throw new Error('model: the briefing gives no body.<id>.mu prior');
  const muPrior = (id: string) => priorOf(ctx, muId(id))?.value ?? 0;
  const primary = bodies.reduce(
    (best, id) => (muPrior(id) > muPrior(best) ? id : best),
    bodies[0]!,
  );
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
/** The law and masses in force: fitted values when there are any, else the arrival priors. */
export interface LawInForce {
  readonly n: number;
  readonly mu: (body: string) => number;
}

export function lawInForce(
  ctx: ModelContext,
  spec: ModelSpec,
  values?: Readonly<Record<string, number>>,
): LawInForce {
  const prior = (id: string) => priorOf(ctx, id)?.value;
  return {
    n: spec.exponent ? (values?.[EXPONENT_ID] ?? prior(EXPONENT_ID) ?? 2) : 2,
    mu: (b) => values?.[muId(b)] ?? prior(muId(b)) ?? 0,
  };
}

export function briefingBodiesAt(
  ctx: ModelContext,
  spec: ModelSpec,
  t: number,
  law: LawInForce = lawInForce(ctx, spec),
): number[][] {
  const p = briefingBody(ctx, spec.primary);
  const rel = spec.bodies.slice(1).map((id) => {
    const b = briefingBody(ctx, id);
    if (!p || !b) return [0, 0, 0, 0];
    return [
      b.position.x - p.position.x,
      b.position.y - p.position.y,
      b.velocity.x - p.velocity.x,
      b.velocity.y - p.velocity.y,
    ];
  });
  if (t === 0 || rel.length === 0) return rel;
  if (!spec.dynamic) return rel.map((r) => [r[0]! + r[2]! * t, r[1]! + r[3]! * t, r[2]!, r[3]!]);
  const st: Structure = {
    r0: spec.settings.r0,
    n: law.n,
    bodies: spec.bodies.map((id, j) => ({
      id,
      mu: law.mu(id),
      state:
        j === 0 ? 'gauge' : (rel[j - 1] as unknown as readonly [number, number, number, number]),
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
  readonly records: ReadonlyMap<AttemptId, AttemptRecord>;
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
  opts: {
    /** Tracked asteroids' probe arcs to fit as well (rule tests, §10 and A5). */
    readonly probes?: ReadonlyMap<AttemptId, readonly Arc[]>;
    /** Values in force (an earlier fit) for propagating the briefing's bodies to arc epochs. */
    readonly values?: Readonly<Record<string, number>>;
  } = {},
): TierGProblem {
  const law = lawInForce(ctx, spec, opts.values);
  const s = spec.settings;
  const builds = new Map<AttemptId, ArcBuild>();
  const records = new Map(attempts.map((r) => [r.id, r] as const));
  const arcCtx = (a: Arc) => contextFor(ctx, records.get(attemptOfArc(a.id)));
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
  for (const rec of attempts)
    for (const p of opts.probes?.get(rec.id) ?? [])
      if (rangeFixes(p, spec.primary).length >= 3) arcs.push(p);
  const thrusters = thrustersOf(arcs);
  const accelSource = attempts
    .flatMap((r) => r.measurements)
    .find((m) => m.kind === 'accel')?.source;
  const hasAccel = arcs.some((a) => a.meas.some((m) => m.kind === 'accel'));
  const camId = `sensor.${spec.cameraId}.bias`;
  const kAId = `sensor.${accelSource ?? 'accelerometer'}.scale`;
  // Ship calibrations: arrival value plus a per-arc deviation with an aging prior (§3.7).
  const dev = (g: string): Ref => [g, `{att}.${g}.d`];
  const engines: Record<string, EngineDef> = {};
  for (const thr of thrusters) engines[thr] = { kE: dev(scaleId(thr)), dE: dev(misalignId(thr)) };
  const others = spec.bodies.slice(1);
  const bodies: BodyDef[] = spec.bodies.map((id, j) => {
    if (j === 0) return { id, mu: muId(id), state: 'gauge' };
    if (!spec.dynamic) {
      const byArc: Record<string, readonly [number, number, number, number]> = {};
      for (const a of arcs) {
        const r = briefingBodiesAt(arcCtx(a), spec, a.epoch, law)[j - 1]!;
        byArc[a.id] = [r[0]!, r[1]!, 0, 0];
      }
      return { id, mu: muId(id), state: [0, 0, 0, 0], stateByArc: byArc };
    }
    return {
      id,
      mu: muId(id),
      state: [`{att}.${id}.x`, `{att}.${id}.y`, `{att}.${id}.vx`, `{att}.${id}.vy`] as const,
    };
  });
  const structure: Structure = {
    r0: s.r0,
    n: spec.exponent ? EXPONENT_ID : 2,
    bodies,
    ship: SHIP_REFS,
    dynamicBodies: spec.dynamic,
    engine: { kE: 1, dE: 0 },
    engines,
    kA: hasAccel ? dev(kAId) : 1,
    camBias: dev(camId),
  };
  const globals: Param[] = [];
  for (const id of spec.bodies) {
    const p = priorOf(ctx, muId(id));
    const mean = p?.value ?? 0;
    const sigma = p?.sigma ?? s.priorExtraBodyMuSigma;
    const unit = Math.abs(mean) > 0 ? Math.abs(mean) : 0.01 * sigma;
    globals.push({
      name: muId(id),
      init: mean === 0 ? 0.01 * sigma : mean,
      scale: 1e-3 * unit,
      priorMean: mean,
      priorSigma: sigma,
      group: 'global',
    });
  }
  if (spec.exponent) {
    const p = priorOf(ctx, EXPONENT_ID);
    globals.push({
      name: EXPONENT_ID,
      init: p?.value ?? 2,
      scale: 1e-3,
      priorMean: p?.value ?? 2,
      priorSigma: p?.sigma ?? s.priorExponentSigma,
      group: 'global',
    });
  }
  for (const thr of thrusters) {
    const ps = priorOf(ctx, scaleId(thr));
    const pm = priorOf(ctx, misalignId(thr));
    globals.push({
      name: scaleId(thr),
      init: ps?.value ?? 1,
      scale: 1e-3,
      priorMean: ps?.value ?? 1,
      priorSigma: ps?.sigma ?? s.priorThrustScaleSigma,
      group: 'global',
    });
    globals.push({
      name: misalignId(thr),
      init: pm?.value ?? 0,
      scale: 1e-3,
      priorMean: pm?.value ?? 0,
      priorSigma: pm?.sigma ?? s.priorMisalignmentSigma,
      group: 'global',
    });
  }
  if (hasAccel) {
    const p = priorOf(ctx, kAId);
    globals.push({
      name: kAId,
      init: p?.value ?? 1,
      scale: 1e-4,
      priorMean: p?.value ?? 1,
      priorSigma: p?.sigma ?? s.priorAccelScaleSigma,
      group: 'global',
    });
  }
  {
    const p = priorOf(ctx, camId);
    globals.push({
      name: camId,
      init: p?.value ?? 0,
      scale: 1e-5,
      priorMean: p?.value ?? 0,
      priorSigma: p?.sigma ?? s.priorCameraBiasSigma,
      group: 'global',
    });
  }
  const locals: Param[] = [];
  for (const a of arcs) {
    locals.push(...shipParams(a.id, guessShip(a, spec.primary, a.epoch)));
    if (spec.dynamic && others.length > 0) {
      const actx = arcCtx(a);
      const prior = briefingBodiesAt(actx, spec, a.epoch, law);
      const pBody = briefingBody(actx, spec.primary);
      others.forEach((id, k) => {
        const b = briefingBody(actx, id);
        const posSigma = Math.sqrt(
          Math.max(b?.positionCov[0] ?? 0, b?.positionCov[2] ?? 0) +
            Math.max(pBody?.positionCov[0] ?? 0, pBody?.positionCov[2] ?? 0),
        );
        const mean = prior[k]!;
        const nFix = rangeFixes(a, id).length;
        const guess = nFix >= 3 ? guessBody(a, spec.primary, id, a.epoch) : mean;
        locals.push(
          ...bodyStateParams(a.id, id, guess, {
            mean,
            sigma: [
              Math.max(posSigma, 1),
              Math.max(posSigma, 1),
              s.priorBodyVelocitySigma,
              s.priorBodyVelocitySigma,
            ],
          }),
        );
      });
    }
  }
  // Per-arc deviations of ship calibrations: prior σ² = aging accrued from arrival to the
  // arc's last retained measurement (§3.7 item 1).
  const recOf = new Map<string, AttemptRecord>();
  const segsOf = new Map<AttemptId, ThrustSegment[]>();
  for (const rec of attempts) {
    const b = builds.get(rec.id)!;
    for (const a of b.arcs) recOf.set(a.id, rec);
    segsOf.set(
      rec.id,
      b.arcs.flatMap((a) => a.commands),
    );
  }
  for (const a of arcs) {
    const rec = recOf.get(a.id) ?? records.get(attemptOfArc(a.id))!;
    const tLast = a.meas[a.meas.length - 1]!.t;
    for (const g of globals) {
      const ag = agingOf(g.name, spec.cameraId);
      if (!ag) continue;
      const hist = historyIn(rec, segsOf.get(rec.id)!, ag.cls, ag.equipment, 0, tLast);
      const q = historyVariance(agingClass(s, ag.cls), ag.cls, hist);
      locals.push({
        name: `${a.id}.${g.name}.d`,
        init: 0,
        scale: g.scale,
        priorMean: 0,
        priorSigma: Math.max(Math.sqrt(q), 1e-3 * g.scale),
        group: a.id,
      });
    }
  }
  for (const name of levels) {
    const arc = name.slice(0, name.indexOf('.burn'));
    locals.push({
      name,
      init: 1,
      scale: 1e-3,
      priorMean: 1,
      priorSigma: s.limitedBurnLevelSigma,
      group: arc,
    });
  }
  return {
    structure,
    params: [...locals, ...globals],
    arcs,
    builds,
    records,
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
  /** Earned hedge per body: validated spans of adopted rules and their σ_e (§7.4, A5). */
  readonly validated?: Readonly<Record<string, ValidatedHedge>>;
  readonly version: number;
  readonly parent?: number;
  /** The attempt in progress, for the present state. */
  readonly current?: AttemptId;
}

/**
 * A ship arc's believed trajectory: the structure, parameter vector and index it was fitted
 * with (Tier G, or a fit of that arc alone with the globals frozen), with covariance.
 */
export type ArcSolution = DynArcSolution;

/** Replace global parameter names by their values (arc-local names stay parameters). */
function freezeRef(r: Ref, values: Readonly<Record<string, number>>): Ref {
  if (typeof r === 'object') return r.map((q) => freezeRef(q, values));
  if (typeof r === 'string') return values[r] ?? r;
  return r;
}

export function frozenStructure(
  st: Structure,
  values: Readonly<Record<string, number>>,
): Structure {
  const f = (r: Ref) => freezeRef(r, values);
  const engines: Record<string, EngineDef> = {};
  for (const [k, e] of Object.entries(st.engines ?? {})) engines[k] = { kE: f(e.kE), dE: f(e.dE) };
  return {
    ...st,
    n: f(st.n),
    bodies: st.bodies.map((b) => ({ ...b, mu: f(b.mu) })),
    engine: { kE: f(st.engine.kE), dE: f(st.engine.dE) },
    engines,
    kA: f(st.kA),
    camBias: f(st.camBias),
  };
}

/** Fit one arc's own parameters with the globals frozen at `values` (in-flight refresh). */
export function arcFit(
  problem: TierGProblem,
  values: Readonly<Record<string, number>>,
  arc: Arc,
  s: ModelSettings,
): ArcSolution | null {
  const params = problem.params.filter((p) => p.group === arc.id);
  if (params.length === 0) return null;
  const structure = frozenStructure(problem.structure, values);
  const fit = stagedFit(structure, [arc], params, { dt: s.dt, h: s.fdStep });
  return {
    arc,
    structure,
    x: fit.x,
    idx: new Map(params.map((p, i) => [p.name, i])),
    P: fit.P,
    rel: params.map((_, i) => i),
    scale: Float64Array.from(params, (p) => p.scale),
  };
}

export interface PresentState {
  readonly source: 'anchor' | 'arrival';
  /** The body the state is relative to: the one tracked most recently (the primary at arrival). */
  readonly body: string;
  /** Time of the state (its last fix). */
  readonly t: number;
  /** Ship relative to `body` (x, y, vx, vy), that body at rest at t. */
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
  /** Tracked asteroids as test-particle arcs, per attempt (spec §10). */
  readonly probes: ReadonlyMap<AttemptId, readonly Arc[]>;
  readonly windows: readonly WindowFit[];
  readonly profiles: readonly ProfileFit[];
  /** Covered ranges for bodies without a profile (hedge, §8.2). */
  readonly flatProfiles: readonly ProfileFit[];
  readonly noiseScale: number;
  /** Default hedge σ_h0 (§8.2). */
  readonly sigmaH0: number;
  /** Earned hedge per body, from adopted rules' validated spans (§7.4). */
  readonly validated: Readonly<Record<string, ValidatedHedge>>;
  readonly present: PresentState | null;
}

export interface ModelSnapshot {
  readonly state: ModelState;
  readonly derived: ModelDerived;
}

/** Reference law for Tier L around `body` within one arc (§5.2), others frozen from Tier G. */
export function referenceFor(
  d: Pick<ModelDerived, 'spec' | 'values' | 'solutions'> & {
    readonly problem?: Pick<TierGProblem, 'records'>;
  },
  body: string,
  arcId: string,
  ctx: ModelContext,
): ReferenceLaw {
  const v = d.values;
  const spec = d.spec;
  const n = spec.exponent ? (v[EXPONENT_ID] ?? 2) : 2;
  const engines: Record<string, { kE: number; dE: number }> = {};
  for (const [k, val] of Object.entries(v)) {
    const m = /^thruster\.(.+)\.scale$/.exec(k);
    if (m) engines[m[1]!] = { kE: val, dE: v[misalignId(m[1]!)] ?? 0 };
  }
  // A probe arc flies in the same world as the ship arc it was built from.
  const sol = d.solutions.get(arcId) ?? d.solutions.get(shipArcOf(arcId));
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
  d: Pick<ModelDerived, 'spec'> & {
    readonly problem?: Pick<TierGProblem, 'records'>;
    readonly values?: Readonly<Record<string, number>>;
  },
  ctx: ModelContext,
  sol: ArcSolution | undefined,
  arcId: string,
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
    const rel = briefingBodiesAt(
      contextFor(ctx, d.problem?.records.get(attemptOfArc(arcId))),
      d.spec,
      t,
      lawInForce(ctx, d.spec, d.values),
    );
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
  return [
    P[2 * i]! - P[2 * j]!,
    P[2 * i + 1]! - P[2 * j + 1]!,
    V[2 * i]! - V[2 * j]!,
    V[2 * i + 1]! - V[2 * j + 1]!,
  ];
}

function believedPull(mu: number, n: number, r0: number, r: number): number {
  return (mu / (r0 * r0)) * Math.pow(r0 / r, n);
}

/** Local fits keyed by window and reference law; results are identical with or without it. */
export type TierLCache = Map<string, LocalFitResult>;

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
  const reuse = opts.reuse;
  const problem = tierGProblem(ctx, spec, attempts, reuse ? { values: reuse.values } : {});
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
    sigmas[g] = reuse?.sigmas[g] ?? (useFit ? fitGet(fit!, g)[1] : (prm.priorSigma ?? 0));
  }
  const scale = Float64Array.from(problem.params, (p) => p.scale);
  const solutions = new Map<string, ArcSolution>();
  for (const a of problem.arcs) {
    const old = reuse?.solutions.get(a.id);
    if (old && old.arc.epoch === a.epoch && old.arc.meas.length === a.meas.length) {
      solutions.set(a.id, old);
      continue;
    }
    if (useFit) {
      const rel = problem.params.flatMap((p, i) =>
        p.group === 'global' || p.group === a.id ? [i] : [],
      );
      solutions.set(a.id, { arc: a, x, idx, structure: problem.structure, P: fit!.P, rel, scale });
      continue;
    }
    // Not in a converged Tier G (in flight, or a fit that did not converge): fit the arc alone.
    const own = arcFit(problem, values, a, s);
    solutions.set(
      a.id,
      own ?? { arc: a, x, idx, structure: problem.structure, P: null, rel: [], scale },
    );
  }

  // Tier L per body with range fixes (§5): first the ship's arcs, then the tracked asteroids'
  // probe arcs (§10), whose fixes use the ship's path from its own window fits.
  const partial = { spec, values, solutions, problem };
  const rule = windowRule(s);
  const n = spec.exponent ? (values[EXPONENT_ID] ?? 2) : 2;
  const fitWindows = (arcs: readonly Arc[], body: string): LocalFitResult[] => {
    const out: LocalFitResult[] = [];
    for (const a of arcs) {
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
              w.fixes.map((f) => [f.t, f.z, f.sigma]),
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
        const res = hit ?? localFitDetailed(ref, a, w, s.dt, [1, s.localScalePriorSigma]);
        if (!hit) opts.cache?.set(key, res);
        out.push(res);
      }
    }
    return out;
  };
  const shipFits = new Map(spec.bodies.map((body) => [body, fitWindows(problem.arcs, body)]));

  // The ship's path relative to each body: the window fit covering t (to the next window).
  // The ship's path relative to each body: per ship arc, its window fits in time order; the
  // window covering t (from its first fix to the next window's) holds the path at t.
  const paths = new Map<string, ArcSolution[]>(); // `${body}|${shipArc}`
  for (const body of spec.bodies)
    for (const r of shipFits.get(body)!) {
      const key = `${body}|${r.row.arc}`;
      const list = paths.get(key) ?? [];
      list.push(r.solution);
      paths.set(key, list);
    }
  for (const list of paths.values()) list.sort((a, b) => a.arc.epoch - b.arc.epoch);
  const pathFor = (shipArc: string, body: string, t: number): ArcSolution | null => {
    const list = paths.get(`${body}|${shipArc}`) ?? [];
    let k = -1;
    for (let i = 0; i < list.length; i++) if (list[i]!.arc.epoch <= t) k = i;
    if (k < 0) return null;
    const best = list[k]!;
    const next = list[k + 1];
    const until = next
      ? next.arc.epoch
      : best.arc.meas[best.arc.meas.length - 1]!.t + s.normalPointInterval;
    return t <= until ? best : null;
  };
  const probes = new Map<AttemptId, Arc[]>();
  for (const rec of attempts) {
    const shipArcs = problem.builds.get(rec.id)?.arcs ?? [];
    if (shipArcs.length === 0) continue;
    const list = probeArcs({
      record: rec,
      shipArcs,
      bodies: spec.bodies,
      knownBodies: contextFor(ctx, rec).bodies.map((b) => b.id),
      pathFor: (body, t) => {
        // The ship arc of this attempt that holds t (arcs break at contacts): the last one
        // starting at or before t, else the first.
        let arc = shipArcs[0]!;
        for (const a of shipArcs) if (a.epoch <= t && a.epoch >= arc.epoch) arc = a;
        return pathFor(arc.id, body, t);
      },
      cameraBias: values[`sensor.${spec.cameraId}.bias`] ?? 0,
      dt: s.dt,
      h: s.fdStep,
      normalPointInterval: s.normalPointInterval,
    });
    if (list.length > 0) probes.set(rec.id, list);
  }
  const probeList = [...probes.values()].flat();
  const allArcs = [...problem.arcs, ...probeList];

  const windows: WindowFit[] = [];
  const profiles: ProfileFit[] = [];
  const flatProfiles: ProfileFit[] = [];
  for (const body of spec.bodies) {
    const rows = [...shipFits.get(body)!, ...fitWindows(probeList, body)].map((r) => r.row);
    windows.push(...rows);
    if (rows.length > 0)
      profiles.push(
        buildProfile(rows, s.r0, body, {
          delta: s.profileStep,
          curvature: s.profileCurvature,
          ridge: s.profileRidge,
        }),
      );
    else {
      const ranges = allArcs.flatMap((a) => rangeFixes(a, body).map((m) => m.z[1]!));
      flatProfiles.push(
        ranges.length > 0
          ? flatProfile(body, Math.min(...ranges), Math.max(...ranges), s.r0)
          : flatProfile(body, s.r0, s.r0, s.r0),
      );
    }
  }
  const s2 = noiseScale(windows);

  const derivedBase = {
    spec,
    problem,
    fit,
    values,
    sigmas,
    solutions,
    probes,
    windows,
    profiles,
    flatProfiles,
    noiseScale: s2,
    sigmaH0: s.sigmaH,
    validated: input.validated ?? {},
  };
  const present = input.current
    ? presentState({ ...derivedBase, present: null }, ctx, input.current)
    : null;
  const derived: ModelDerived = { ...derivedBase, present };
  const state = toModelState(input, derived, attempts);
  return { state, derived };
}

export interface ArcCalibration {
  readonly id: string;
  readonly arc: string;
  readonly value: number;
  /** σ as fitted in the arc (arrival value and deviation, jointly). */
  readonly sigma: number;
  /** Time of the arc's last retained measurement. */
  readonly tLast: number;
}

/**
 * Ship calibrations as used in one arc: arrival value plus that arc's deviation, with σ from
 * the joint covariance (§3.7). From Tier G when the arc was in it, else from the arc's own fit
 * (frozen arrival value, whose σ is added in quadrature).
 */
export function arcCalibration(
  d: Pick<ModelDerived, 'problem' | 'solutions' | 'values' | 'sigmas' | 'spec'>,
  arcId: string,
): ArcCalibration[] {
  const sol = d.solutions.get(arcId);
  const arc = d.problem.arcs.find((a) => a.id === arcId);
  if (!arc) return [];
  const tLast = arc.meas[arc.meas.length - 1]!.t;
  const out: ArcCalibration[] = [];
  for (const g of d.problem.globals) {
    if (!agingOf(g, d.spec.cameraId)) continue;
    const devName = `${arcId}.${g}.d`;
    const i = sol?.idx.get(g);
    const k = sol?.idx.get(devName);
    const P = sol?.P ?? null;
    let value = d.values[g] ?? 0;
    let v = (d.sigmas[g] ?? 0) ** 2;
    if (sol && k !== undefined) {
      const n = P?.cols ?? 0;
      if (i !== undefined) {
        value = sol.x[i]! + sol.x[k]!;
        v = P ? P.data[i * n + i]! + P.data[k * n + k]! + 2 * P.data[i * n + k]! : v;
      } else {
        value = (d.values[g] ?? 0) + sol.x[k]!;
        v += P ? P.data[k * n + k]! : 0;
      }
    }
    out.push({ id: g, arc: arcId, value, sigma: Math.sqrt(Math.max(v, 0)), tLast });
  }
  return out;
}

/** Aging of a ship calibration from `t0` to `t1` in an attempt (§3.7), with its drivers. */
export function agingBetween(
  d: Pick<ModelDerived, 'problem' | 'spec'>,
  rec: AttemptRecord,
  id: string,
  t0: number,
  t1: number,
): { variance: number; history: AgingHistory } {
  const ag = agingOf(id, d.spec.cameraId);
  if (!ag) return { variance: 0, history: { shipTime: 0, deltaV: 0, powerCycles: 0, drops: [] } };
  const segs = (d.problem.builds.get(rec.id)?.arcs ?? []).flatMap((a) => a.commands);
  const history = historyIn(rec, segs, ag.cls, ag.equipment, t0, t1);
  return {
    variance: historyVariance(agingClass(d.spec.settings, ag.cls), ag.cls, history),
    history,
  };
}

/** Latest recorded time of an attempt (its end, if it has ended). */
export function attemptEnd(rec: AttemptRecord): number {
  if (rec.outcome.kind !== 'in-progress') return rec.outcome.t;
  const last = <T extends { t: number }>(a: readonly T[]) => (a.length ? a[a.length - 1]!.t : 0);
  return Math.max(last(rec.measurements), last(rec.executed), last(rec.events));
}

/** §8.1: the present state of an attempt from its most recent coasting windows. */
export function presentState(
  d: ModelDerived,
  ctx: ModelContext,
  attemptId: AttemptId,
): PresentState | null {
  const s = d.spec.settings;
  const build = d.problem.builds.get(attemptId);
  const actx = contextFor(ctx, d.problem.records.get(attemptId));
  const arc = build?.arcs[build.arcs.length - 1];
  if (!arc) return arrivalState(actx, d.spec);
  // From whichever body the camera fixed most recently: pointing at the second body for
  // hours must not leave the present state behind (2F request 12). Ties go to the primary.
  let best: { body: string; wins: Window[]; end: number } | null = null;
  for (const body of d.spec.bodies) {
    if (rangeFixes(arc, body).length < s.windowMinFixes) continue;
    const wins = makeWindows(arc, body, windowRule(s))
      .filter((w) => !w.powered && w.fixes.length >= s.windowKeepFixes)
      .slice(-s.anchorWindows);
    if (wins.length === 0) continue;
    const end = wins[wins.length - 1]!.t1;
    if (!best || end > best.end) best = { body, wins, end };
  }
  if (!best) return arrivalState(actx, d.spec);
  const wins = best.wins;
  const prof = d.profiles.find((p) => p.body === best.body) ?? null;
  const extra = d.profiles.filter((p) => p.body !== best.body);
  const ref = referenceFor(d, best.body, arc.id, ctx);
  const anc = anchorState(ref, prof, arc, wins, s.dt, {
    h: s.fdStep,
    gPrior: [1, s.localScalePriorSigma],
    slopeSigma: s.anchorSlopePriorSigma,
    extraProfiles: extra,
  });
  const cov = zeros(4, 4);
  for (let i = 0; i < 16; i++) cov.data[i] = anc.covariance.data[i]! * d.noiseScale;
  return {
    source: 'anchor',
    body: best.body,
    t: anc.tNow,
    state: anc.state,
    covariance: cov,
    anchor: anc,
  };
}

export interface BodiesAt {
  /** Other modelled bodies' states relative to `ref` (ref at rest) at t: x, y, vx, vy. */
  readonly state: Readonly<Record<string, readonly [number, number, number, number]>>;
  /**
   * Their 4×4 covariances: the arc fit's own, plus the hedge on the bodies' motion since the
   * pair was last fixed (2F request 13): the law's pull between bodies is extrapolated too.
   */
  readonly cov: Readonly<Record<string, Matrix>>;
}

/** The other bodies relative to `ref` at time t of an arc, with honest uncertainty (§8.2). */
export function bodiesAt(
  d: ModelDerived,
  ctx: ModelContext,
  arcId: string,
  ref: string,
  t: number,
): BodiesAt {
  const spec = d.spec;
  const s = spec.settings;
  const others = spec.bodies.filter((b) => b !== ref);
  const sol = d.solutions.get(arcId) ?? d.solutions.get(shipArcOf(arcId));
  const arc = d.problem.arcs.find((a) => a.id === shipArcOf(arcId));
  const actx = contextFor(ctx, d.problem.records.get(attemptOfArc(arcId)));
  const law = lawInForce(ctx, spec, d.values);
  const state: Record<string, readonly [number, number, number, number]> = {};
  const cov: Record<string, Matrix> = {};
  for (const o of others) {
    state[o] = relativeState(d, ctx, sol, arcId, o, ref, t);
    cov[o] = zeros(4, 4);
  }
  if (others.length === 0) return { state, cov };
  // All bodies relative to ref at time u, from the arc's solution (or the briefing).
  const allAt = (u: number, x?: ArrayLike<number>): Record<string, number[]> => {
    const out: Record<string, number[]> = {};
    if (sol && u >= sol.arc.epoch) {
      const ca = compileArc(sol.structure, sol.arc, sol.idx);
      const tr = simulate(ca, x ?? sol.x, [u], s.dt);
      const P = tr.pos[0]!;
      const V = tr.vel[0]!;
      const r = ca.bodyIndex.get(ref)!;
      for (const b of spec.bodies) {
        const j = ca.bodyIndex.get(b)!;
        out[b] = [P[2 * j]! - P[2 * r]!, P[2 * j + 1]! - P[2 * r + 1]!, V[2 * j]! - V[2 * r]!, V[2 * j + 1]! - V[2 * r + 1]!];
      }
      return out;
    }
    const rel = briefingBodiesAt(actx, spec, u, law); // relative to the primary
    const p: Record<string, number[]> = { [spec.primary]: [0, 0, 0, 0] };
    spec.bodies.slice(1).forEach((b, k) => (p[b] = rel[k]!));
    for (const b of spec.bodies) out[b] = p[b]!.map((v, c) => v - p[ref]![c]!);
    return out;
  };
  // The fit's own uncertainty, or the briefing's.
  if (sol && sol.P && t >= sol.arc.epoch) {
    const P = sol.P;
    const n = P.cols;
    const cols: Record<string, number[]>[] = [];
    const xp = new Float64Array(sol.x);
    for (const i of sol.rel) {
      const step = s.fdStep * sol.scale[i]!;
      xp[i] = sol.x[i]! + step;
      const plus = allAt(t, xp);
      xp[i] = sol.x[i]! - step;
      const minus = allAt(t, xp);
      xp[i] = sol.x[i]!;
      const col: Record<string, number[]> = {};
      for (const o of others) col[o] = plus[o]!.map((v, c) => (v - minus[o]![c]!) / (2 * step));
      cols.push(col);
    }
    for (const o of others)
      sol.rel.forEach((ia, a) =>
        sol.rel.forEach((ib, b) => {
          const pab = P.data[ia * n + ib]!;
          if (pab === 0) return;
          for (let u = 0; u < 4; u++)
            for (let v = 0; v < 4; v++) cov[o]!.data[u * 4 + v]! += cols[a]![o]![u]! * pab * cols[b]![o]![v]!;
        }),
      );
  } else if (!sol) {
    const pc = (b: string) => {
      const q = briefingBody(actx, b)?.positionCov ?? [0, 0, 0];
      return Math.max(q[0], q[2]);
    };
    for (const o of others) {
      const pv = pc(o) + pc(ref);
      const vv = s.priorBodyVelocitySigma ** 2;
      [pv, pv, vv, vv].forEach((v, i) => (cov[o]!.data[i * 4 + i] = v));
    }
  }
  // The hedge on the bodies' mutual pull since the pair was last fixed.
  const covered = (b: string) => d.profiles.find((p) => p.body === b) ?? d.flatProfiles.find((p) => p.body === b);
  const lastFix = (b: string) => {
    if (!arc) return 0;
    const f = rangeFixes(arc, b);
    return f.length > 0 ? f[f.length - 1]!.t : arc.epoch;
  };
  for (const o of others) {
    const t0 = Math.min(lastFix(o), lastFix(ref), t);
    if (t - t0 <= 0) continue;
    const s0 = allAt(t0);
    const names: string[] = [];
    const sig: number[] = [];
    const profiles: ProfileDef[] = [];
    for (const b of spec.bodies) {
      const p = covered(b);
      if (!p) continue;
      const v = d.validated[b];
      names.push(`h.eta.${b}`);
      sig.push(d.sigmaH0);
      if (v && v.spans.length > 0) {
        names.push(`h.etaE.${b}`);
        sig.push(v.sigmaE);
      }
      const lr0 = Math.log(p.r0);
      profiles.push({
        body: b,
        uNodes: [lr0 + p.uNodes[0]!, lr0 + p.uNodes[p.uNodes.length - 1]!],
        gNodes: [1, 1],
        rMin: p.rMin,
        rMax: p.rMax,
        eta: `h.eta.${b}`,
        ...(v && v.spans.length > 0 ? { etaE: `h.etaE.${b}`, validated: v.spans } : {}),
      });
    }
    if (names.length === 0) continue;
    const st: Structure = {
      r0: s.r0,
      n: law.n,
      bodies: spec.bodies.map((b) => ({
        id: b,
        mu: law.mu(b),
        state: b === ref ? 'gauge' : (s0[b] as unknown as readonly [number, number, number, number]),
      })),
      ship: [1e15, 0, 0, 0],
      dynamicBodies: true,
      engine: { kE: 1, dE: 0 },
      kA: 1,
      camBias: 0,
      profiles,
    };
    const idx = new Map(names.map((nm, i) => [nm, i]));
    const ca = compileArc(st, { id: 'hedge', epoch: t0, commands: [] }, idx);
    const iRef = ca.bodyIndex.get(ref)!;
    const iO = ca.bodyIndex.get(o)!;
    const at = (x: ArrayLike<number>) => {
      const tr = simulate(ca, x, [t], s.dt);
      const P = tr.pos[0]!;
      const V = tr.vel[0]!;
      return [P[2 * iO]! - P[2 * iRef]!, P[2 * iO + 1]! - P[2 * iRef + 1]!, V[2 * iO]! - V[2 * iRef]!, V[2 * iO + 1]! - V[2 * iRef + 1]!];
    };
    const x0 = new Float64Array(names.length);
    names.forEach((_, i) => {
      const step = 1e-3;
      x0[i] = step;
      const plus = at(x0);
      x0[i] = -step;
      const minus = at(x0);
      x0[i] = 0;
      const col = plus.map((v, c) => (v - minus[c]!) / (2 * step));
      for (let u = 0; u < 4; u++)
        for (let w = 0; w < 4; w++) cov[o]!.data[u * 4 + w]! += col[u]! * sig[i]! ** 2 * col[w]!;
    });
  }
  return { state, cov };
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
    body: spec.primary,
    t: a.t,
    state: Float64Array.of(
      a.position.x - px,
      a.position.y - py,
      a.velocity.x - vx,
      a.velocity.y - vy,
    ),
    covariance: cov,
  };
}

// ---------------------------------------------------------------------------------------------
// Contract view
// ---------------------------------------------------------------------------------------------

function labelFor(
  ctx: ModelContext,
  id: string,
): { label: string; unit: string; extension?: string } {
  const p = priorOf(ctx, id);
  if (p)
    return { label: p.label, unit: p.unit, ...(p.extension ? { extension: p.extension } : {}) };
  let m = /^body\.(.+)\.mu$/.exec(id);
  if (m) {
    const name = ctx.bodies.find((b) => b.id === m![1])?.name ?? m[1]!;
    return { label: `${name} μ`, unit: 'm³/s²', extension: `unmodeled-body:${m[1]}` };
  }
  if (id === EXPONENT_ID)
    return { label: 'Distance-law exponent', unit: '', extension: 'distance-law' };
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

export function toCalibrationProfile(
  p: ProfileFit,
  windows: readonly WindowFit[],
): CalibrationProfile {
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
export function crossRangeResiduals(
  d: Pick<ModelDerived, 'fit' | 'problem'>,
): { arc: string; t: number; powered: boolean; m: number }[] {
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

function toModelState(
  input: ModelInput,
  d: ModelDerived,
  attempts: readonly AttemptRecord[],
): ModelState {
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
    if (
      !parameters.some((q) => q.id === p.id) &&
      !(p.extension && !input.adopted.includes(p.extension))
    )
      if (!/^body\./.test(p.id))
        parameters.push({
          id: p.id,
          label: p.label,
          unit: p.unit,
          value: p.value,
          sigma: p.sigma,
          prior: { mean: p.value, sigma: p.sigma },
          ...(p.extension ? { extension: p.extension } : {}),
          support: 0,
        });
  // Ship calibrations as used in each attempt's latest arc, with freshness (§3.7, §9.7).
  for (const rec of attempts) {
    const arcs = d.problem.builds.get(rec.id)?.arcs ?? [];
    const last = arcs[arcs.length - 1];
    if (!last) continue;
    const end = attemptEnd(rec);
    for (const c of arcCalibration(d, last.id)) {
      const g = parameters.find((q) => q.id === c.id)!;
      const aged = agingBetween(d, rec, c.id, c.tLast, end);
      const sigmaAged = Math.sqrt(aged.variance);
      const devPrior = prm.get(`${last.id}.${c.id}.d`);
      const priorSigma = Math.hypot(g.prior.sigma, devPrior?.priorSigma ?? 0);
      const sigma = Math.hypot(c.sigma, sigmaAged);
      parameters.push({
        id: c.id,
        label: g.label,
        unit: g.unit,
        value: c.value,
        sigma,
        prior: { mean: g.prior.mean, sigma: priorSigma },
        ...(g.extension ? { extension: g.extension } : {}),
        support:
          priorSigma > 0
            ? Math.min(1, Math.max(0, 1 - (c.sigma * c.sigma) / (priorSigma * priorSigma)))
            : 0,
        arc: rec.id,
        freshness: {
          sigmaMeasured: c.sigma,
          sigmaAged,
          lastMeasured: { attempt: rec.id, t: c.tLast },
          since: {
            shipTime: aged.history.shipTime,
            deltaV: aged.history.deltaV,
            powerCycles: aged.history.powerCycles,
            conditionLost: aged.history.drops.reduce((q, x) => q + x, 0),
          },
        },
      });
    }
  }
  const ids = d.problem.globals;
  const values = new Array<number>(ids.length * ids.length).fill(0);
  if (fit && fit.converged) {
    const gi = ids.map((g) => fit.names.indexOf(g));
    gi.forEach((a, i) =>
      gi.forEach((b, j) => (values[i * ids.length + j] = fit.P.data[a * fit.P.cols + b]!)),
    );
  } else ids.forEach((g, i) => (values[i * ids.length + i] = d.sigmas[g]! ** 2));
  const covariance: CovarianceMatrix = { ids: [...ids], values };

  const distance: Record<string, [number, number][]> = {};
  for (const body of d.spec.bodies) {
    const spans: [number, number][] = [];
    for (const a of [...d.problem.arcs, ...[...d.probes.values()].flat()]) {
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
    return {
      rms: sel.length ? Math.sqrt(sel.reduce((s, r) => s + r.m * r.m, 0) / sel.length) : 0,
      n: sel.length,
    };
  };
  const residuals: ResidualStats = { coast: stat(false), powered: stat(true) };
  const measurementCount = d.problem.arcs.reduce((s, a) => s + a.meas.length, 0);
  const manifest = attempts.map((a) => [
    a.id,
    a.measurements.length,
    a.executed.length,
    a.events.length,
  ]);
  return {
    version: input.version,
    ...(input.parent !== undefined ? { parent: input.parent } : {}),
    parameters,
    covariance,
    extensions: [...(input.extensions ?? [])],
    support,
    residuals,
    basedOn: {
      attempts: attempts.filter((a) => used.has(a.id)).map((a) => a.id),
      measurementCount,
    },
    dataManifest: hashState(manifest),
    ...(fit
      ? {
          fit: {
            chi2: fit.chi2,
            nu: fitNu(fit),
            pEff: fit.pEff,
            iterations: fit.iterations,
            converged: fit.converged,
          },
        }
      : {}),
    calibration: d.profiles.map((p) => toCalibrationProfile(p, d.windows)),
    noiseScale: d.noiseScale,
    settings: settingsRecord(d.spec.settings),
  };
}

/** Global parameter values by id (for forecast inputs and the reference law). */
export function parameterValues(d: Pick<ModelDerived, 'values'>): Record<string, number> {
  return { ...d.values };
}

/**
 * Ship calibration that carries to the next encounter (A4, A5; spec §11.5): the value of the
 * arc that carried the ship onward becomes the prior for the new arrival value, with variance
 * σ² + aging from that arc's last measurement to the new arrival (the rest of the attempt, then
 * the transit). Body values and calibration tables do not transfer.
 */
export function carriedCalibration(
  state: ModelState,
  transit?: TransitRecord,
  opts: { carrying?: AttemptRecord; settings?: Partial<ModelSettings> } = {},
): ParameterPrior[] {
  const settings = opts.settings;
  const s = resolveSettings(settings ?? (state.settings as Partial<ModelSettings> | undefined));
  const ship = state.parameters.filter((p) => /^(thruster|sensor)\./.test(p.id));
  const fromArc = transit ? ship.filter((p) => p.arc === transit.from) : [];
  const ids = [...new Set(ship.map((p) => p.id))];
  return ids.flatMap((id) => {
    const perArc = ship.filter((p) => p.id === id && p.arc !== undefined);
    const chosen =
      fromArc.find((p) => p.id === id) ??
      perArc[perArc.length - 1] ??
      ship.find((p) => p.id === id && p.arc === undefined);
    if (!chosen || chosen.support <= 0) return [];
    let v = chosen.sigma ** 2; // already includes aging to the end of the carrying attempt
    if (transit) {
      const cam = /^sensor\.(.+)\.bias$/.exec(id)?.[1] ?? '';
      const ag = agingOf(id, cam);
      if (ag) {
        const start = conditionAtEnd(opts.carrying, ag.equipment);
        v += historyVariance(
          agingClass(s, ag.cls),
          ag.cls,
          transitHistory(transit, ag.equipment, start),
        );
      }
    }
    return [
      { id, label: chosen.label, unit: chosen.unit, value: chosen.value, sigma: Math.sqrt(v) },
    ];
  });
}
