/**
 * The predictive model as the game uses it (1G spec revision 3: §3, §4, §5, §8.1, §11; DECISIONS
 * A4, A11, P5, P8). Three-dimensional: six state numbers per arc and per moving body, both thrust
 * misalignment angles, the RCS scale, and the camera misalignment as a rotation in the body
 * frame. `settings.planar` runs the planar reduction (spec Appendix A.3) for planar records.
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
  Cov3,
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
import { RCS_GROUP, arcsFromRecord, type ArcBuild, type Burn } from './adapt.ts';
import {
  MIN_ARC_FIXES,
  bodyRefs,
  compileArc,
  hasRange,
  lineOfSight,
  rangeFixTimes,
  segmentPowered,
  shipRefs,
  simulate,
  STATE_KEYS,
  usable,
  type Arc,
  type ArcSolution as DynArcSolution,
  type BodyDef,
  type EngineDef,
  type ProfileDef,
  type Ref,
  type Refs3,
  type State6,
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
  profileDef,
  rangeFixes,
  shipParams,
  type Anchor,
  type EngineValues,
  type FrozenBody,
  type LocalFitResult,
  type ProfileFit,
  type ReferenceLaw,
  type Vec3T,
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
/** Thrust misalignment about body +z (toward +y): the planar angle, spec `engine.dE`. */
export const misalignId = (thr: string) => `thruster.${thr}.misalignment`;
/** Thrust misalignment about body −y (toward +z): spec `engine.dP`. */
export const pitchId = (thr: string) => `thruster.${thr}.misalignment-pitch`;
/** The RCS translation scale, spec `rcs.kR` (`rcs` is the group, not an equipment id). */
export const RCS_SCALE_ID = scaleId(RCS_GROUP);
/**
 * The camera misalignment's parameter ids about body x, y and z (spec `camera.bias.x, .y, .z`):
 * the planar `sensor.<camera>.bias` is the z component.
 */
export const cameraIds = (camera: string): readonly [string, string, string] => [
  `sensor.${camera}.bias-x`,
  `sensor.${camera}.bias-y`,
  `sensor.${camera}.bias`,
];

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
  /** Planar reduction (spec Appendix A.3, `settings.planar`). */
  readonly planar: boolean;
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
    planar: settings.planar === 1,
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

/** The law and masses a propagation uses: the values in force, else the arrival priors. */
export interface LawInForce {
  readonly n: number;
  readonly mu: (body: string) => number;
}

/**
 * The law and body masses in force (2F request 2): the model's current values (a converged
 * global fit's, carried into the attempt in progress) where it has them, else the priors; the
 * exponent only once the distance-law rule is adopted.
 */
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

/**
 * Other modelled bodies relative to the primary (primary at rest) at time t, from the briefing
 * at t = 0 propagated under `law` (default: the arrival priors). Rows: [x, y, z, vx, vy, vz] per
 * non-primary body (z and vz are 0 in the planar reduction).
 */
export function briefingBodiesAt(
  ctx: ModelContext,
  spec: ModelSpec,
  t: number,
  law: LawInForce = lawInForce(ctx, spec),
): State6[] {
  const p = briefingBody(ctx, spec.primary);
  const out = spec.planar ? 0 : 1;
  const rel: State6[] = spec.bodies.slice(1).map((id) => {
    const b = briefingBody(ctx, id);
    if (!p || !b) return [0, 0, 0, 0, 0, 0];
    return [
      b.position.x - p.position.x,
      b.position.y - p.position.y,
      out * (b.position.z - p.position.z),
      b.velocity.x - p.velocity.x,
      b.velocity.y - p.velocity.y,
      out * (b.velocity.z - p.velocity.z),
    ];
  });
  if (t === 0 || rel.length === 0) return rel;
  if (!spec.dynamic)
    return rel.map((r) => [r[0] + r[3] * t, r[1] + r[4] * t, r[2] + r[5] * t, r[3], r[4], r[5]]);
  const st: Structure = {
    r0: spec.settings.r0,
    n: law.n,
    bodies: spec.bodies.map((id, j) => ({
      id,
      mu: law.mu(id),
      state: j === 0 ? 'gauge' : rel[j - 1]!,
    })),
    ship: [1e15, 0, 0, 0, 0, 0],
    dynamicBodies: true,
    engine: { kE: 1, dE: 0, dP: 0 },
    kA: 1,
    camBias: [0, 0, 0],
  };
  const ca = compileArc(st, { id: 'briefing', epoch: 0, commands: [] }, new Map());
  const tr = simulate(ca, [], [t], spec.settings.dt);
  const P = tr.pos[0]!;
  const V = tr.vel[0]!;
  return spec.bodies.slice(1).map((_, k) => {
    const j = 3 * (k + 1);
    return [
      P[j]! - P[0]!,
      P[j + 1]! - P[1]!,
      P[j + 2]! - P[2]!,
      V[j]! - V[0]!,
      V[j + 1]! - V[1]!,
      V[j + 2]! - V[2]!,
    ];
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

/** Engines that fire in the arcs (the RCS translation group is not an engine). */
function thrustersOf(arcs: readonly Arc[]): string[] {
  const s = new Set<string>();
  for (const a of arcs)
    for (const c of a.commands)
      if (c.thruster && c.thruster !== RCS_GROUP && c.u !== 0) s.add(c.thruster);
  return [...s].sort();
}

/** Does any arc fire the RCS for translation? */
const hasRcs = (arcs: readonly Arc[]) =>
  arcs.some((a) => a.commands.some((c) => c.rcs !== undefined && segmentPowered({ ...c, u: 0 })));

/** Tier G structure and parameters for the given attempts (§3.6, §4.5). */
export function tierGProblem(
  ctx: ModelContext,
  spec: ModelSpec,
  attempts: readonly AttemptRecord[],
  opts: {
    /** Tracked asteroids' probe arcs to fit as well (rule tests, §10 and A5). */
    readonly probes?: ReadonlyMap<AttemptId, readonly Arc[]>;
    /** Attempts the model cannot use, with the reason: they give no arcs (`ModelDerived.unusable`). */
    readonly unusable?: ReadonlyMap<AttemptId, string>;
    /**
     * Values in force (the last global fit's, in flight): the briefing's bodies are carried to
     * each arc's epoch under them (2F request 2). Absent: the priors.
     */
    readonly values?: Readonly<Record<string, number>>;
  } = {},
): TierGProblem {
  const s = spec.settings;
  const law = lawInForce(ctx, spec, opts.values);
  const builds = new Map<AttemptId, ArcBuild>();
  const records = new Map(attempts.map((r) => [r.id, r] as const));
  const arcCtx = (a: Arc) => contextFor(ctx, records.get(attemptOfArc(a.id)));
  const arcs: Arc[] = [];
  const levels: string[] = [];
  for (const rec of attempts) {
    const unusable = opts.unusable?.get(rec.id);
    const b: ArcBuild =
      unusable !== undefined
        ? {
            arcs: [],
            burns: [],
            limitedLevels: [],
            unknownAttitude: [],
            skipped: [{ arc: rec.id, reason: unusable }],
          }
        : arcsFromRecord(rec, {
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
    for (const p of opts.unusable?.has(rec.id) ? [] : (opts.probes?.get(rec.id) ?? []))
      if (rangeFixTimes(p.meas, spec.primary).length >= MIN_ARC_FIXES) arcs.push(p);
  const thrusters = thrustersOf(arcs);
  const rcs = hasRcs(arcs);
  const planar = spec.planar;
  const accelSource = attempts
    .flatMap((r) => r.measurements)
    .find((m) => m.kind === 'accel')?.source;
  const hasAccel = arcs.some((a) => a.meas.some((m) => m.kind === 'accel'));
  const camIds = cameraIds(spec.cameraId);
  const kAId = `sensor.${accelSource ?? 'accelerometer'}.scale`;
  // Ship calibrations: arrival value plus a per-arc deviation with an aging prior (§3.7).
  const dev = (g: string): Ref => [g, `{att}.${g}.d`];
  const engines: Record<string, EngineDef> = {};
  for (const thr of thrusters)
    engines[thr] = {
      kE: dev(scaleId(thr)),
      dE: dev(misalignId(thr)),
      dP: planar ? 0 : dev(pitchId(thr)),
    };
  const others = spec.bodies.slice(1);
  const bodies: BodyDef[] = spec.bodies.map((id, j): BodyDef => {
    if (j === 0) return { id, mu: muId(id), state: 'gauge' };
    if (!spec.dynamic) {
      const byArc: Record<string, State6> = {};
      for (const a of arcs) {
        const r = briefingBodiesAt(arcCtx(a), spec, a.epoch, law)[j - 1]!;
        byArc[a.id] = [r[0], r[1], r[2], 0, 0, 0];
      }
      return { id, mu: muId(id), state: [0, 0, 0, 0, 0, 0], stateByArc: byArc };
    }
    return { id, mu: muId(id), state: bodyRefs(id, planar) };
  });
  const camBias: Refs3 = planar
    ? [0, 0, dev(camIds[2])]
    : [dev(camIds[0]), dev(camIds[1]), dev(camIds[2])];
  const structure: Structure = {
    r0: s.r0,
    n: spec.exponent ? EXPONENT_ID : 2,
    bodies,
    ship: shipRefs(planar),
    dynamicBodies: spec.dynamic,
    engine: { kE: 1, dE: 0, dP: 0 },
    engines,
    kR: rcs ? dev(RCS_SCALE_ID) : 1,
    kA: hasAccel ? dev(kAId) : 1,
    camBias,
  };
  const globals: Param[] = [];
  const shipGlobal = (id: string, mean: number, sigma: number, scale: number) => {
    const p = priorOf(ctx, id);
    globals.push({
      name: id,
      init: p?.value ?? mean,
      scale,
      priorMean: p?.value ?? mean,
      priorSigma: p?.sigma ?? sigma,
      group: 'global',
    });
  };
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
  if (spec.exponent) shipGlobal(EXPONENT_ID, 2, s.priorExponentSigma, 1e-3);
  for (const thr of thrusters) {
    shipGlobal(scaleId(thr), 1, s.priorThrustScaleSigma, 1e-3);
    shipGlobal(misalignId(thr), 0, s.priorMisalignmentSigma, 1e-3);
    if (!planar) shipGlobal(pitchId(thr), 0, s.priorMisalignmentSigma, 1e-3);
  }
  if (rcs) shipGlobal(RCS_SCALE_ID, 1, s.priorRcsScaleSigma, 1e-3);
  if (hasAccel) shipGlobal(kAId, 1, s.priorAccelScaleSigma, 1e-4);
  // The camera misalignment: the planar bias (about body z) first, as in the planar model.
  shipGlobal(camIds[2], 0, s.priorCameraBiasSigma, 1e-5);
  if (!planar) {
    shipGlobal(camIds[0], 0, s.priorCameraBiasSigma, 1e-5);
    shipGlobal(camIds[1], 0, s.priorCameraBiasSigma, 1e-5);
  }
  const locals: Param[] = [];
  for (const a of arcs) {
    locals.push(...shipParams(a.id, guessShip(a, spec.primary, a.epoch), planar));
    if (spec.dynamic && others.length > 0) {
      const actx = arcCtx(a);
      const prior = briefingBodiesAt(actx, spec, a.epoch, law);
      const pBody = briefingBody(actx, spec.primary);
      const largest = (c?: Cov3) => Math.max(c?.[0] ?? 0, c?.[3] ?? 0, c?.[5] ?? 0);
      others.forEach((id, k) => {
        const b = briefingBody(actx, id);
        // The prior on a body's position: the larger believed variance on any axis, of the body
        // and of the primary it is measured from, on each component.
        const posSigma = Math.max(
          Math.sqrt(largest(b?.positionCov) + largest(pBody?.positionCov)),
          1,
        );
        const mean = prior[k]!;
        const nFix = rangeFixes(a, id).length;
        const guess = nFix >= 3 ? guessBody(a, spec.primary, id, a.epoch) : mean;
        const vs = s.priorBodyVelocitySigma;
        locals.push(
          ...bodyStateParams(
            a.id,
            id,
            guess,
            { mean, sigma: [posSigma, posSigma, posSigma, vs, vs, vs] },
            planar,
          ),
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
  const fe = (e: EngineDef): EngineDef => ({ kE: f(e.kE), dE: f(e.dE), dP: f(e.dP) });
  const engines: Record<string, EngineDef> = {};
  for (const [k, e] of Object.entries(st.engines ?? {})) engines[k] = fe(e);
  return {
    ...st,
    n: f(st.n),
    bodies: st.bodies.map((b) => ({ ...b, mu: f(b.mu) })),
    engine: fe(st.engine),
    engines,
    kR: f(st.kR ?? 1),
    kA: f(st.kA),
    camBias: [f(st.camBias[0]), f(st.camBias[1]), f(st.camBias[2])],
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
  /**
   * The body the state is fixed against and relative to: the one the camera fixed most recently
   * (2F request 12; the primary at arrival).
   */
  readonly body: string;
  /** Time of the state (its last fix). */
  readonly t: number;
  /** Ship relative to `body` (x, y, z, vx, vy, vz), that body at rest at t. */
  readonly state: Float64Array;
  /** 6×6 covariance including s² (and the camera misalignment's share, §8.1). */
  readonly covariance: Matrix;
  /**
   * The camera misalignment the present state carried (§8.1): values and σ about body x, y, z
   * (the current arc's, aged); absent when it was held fixed (planar reduction, arrival state).
   */
  readonly camera?: {
    readonly ids: readonly string[];
    readonly value: Vec3T;
    readonly sigma: Vec3T;
  };
  /**
   * How the true state differs from `state` per unit of each shared hedge exponent (the present
   * state's consider analysis, `Anchor.hedge`): the forecast moves it with the exponent.
   */
  readonly hedge?: Readonly<Record<string, Float64Array>>;
  readonly anchor?: Anchor;
}

export interface ModelDerived {
  readonly spec: ModelSpec;
  readonly problem: TierGProblem;
  readonly fit: FitResult | null;
  /** Why Tier G gave no result although it ran: the values are then held at their priors. */
  readonly fitFailure?: string;
  /**
   * Attempts the model could not be built with, each with the reason. They are left out of every
   * fit and the rest are fitted: one bad attempt never stops the model (`buildModel`).
   */
  readonly unusable: ReadonlyMap<AttemptId, string>;
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
    readonly problem?: Pick<TierGProblem, 'records'> & Partial<Pick<TierGProblem, 'params'>>;
  },
  body: string,
  arcId: string,
  ctx: ModelContext,
): ReferenceLaw {
  const v = d.values;
  const spec = d.spec;
  const n = spec.exponent ? (v[EXPONENT_ID] ?? 2) : 2;
  const engines: Record<string, EngineValues> = {};
  for (const [k, val] of Object.entries(v)) {
    const m = /^thruster\.(.+)\.scale$/.exec(k);
    if (m && m[1] !== RCS_GROUP)
      engines[m[1]!] = { kE: val, dE: v[misalignId(m[1]!)] ?? 0, dP: v[pitchId(m[1]!)] ?? 0 };
  }
  const cam = cameraIds(spec.cameraId);
  // A probe arc flies in the same world as the ship arc it was built from.
  const sol = d.solutions.get(arcId) ?? d.solutions.get(shipArcOf(arcId));
  const others: FrozenBody[] = spec.bodies
    .filter((b) => b !== body)
    .map((id) => ({
      id,
      mu: v[muId(id)] ?? 0,
      stateAt: (t: number) =>
        relativeState(
          d,
          ctx,
          fromSolution(sol, spec, body, id, d.problem?.params) ? sol : undefined,
          arcId,
          id,
          body,
          t,
        ),
    }));
  return {
    r0: spec.settings.r0,
    body,
    mu: v[muId(body)] ?? 0,
    n,
    cam: [v[cam[0]] ?? 0, v[cam[1]] ?? 0, v[cam[2]] ?? 0],
    kE: 1,
    dE: 0,
    dP: 0,
    kR: v[RCS_SCALE_ID] ?? 1,
    engines,
    others,
    planar: spec.planar,
  };
}

/**
 * Whether body `id`'s believed state in an arc, seen from reference body `body`, comes from the
 * arc's solution: when a converged global fit made it, or when the arc tracked the body (and the
 * reference body). Otherwise it comes from the briefing, propagated under the law in force (§5.2:
 * the reference law holds believed values only).
 *
 * A converged global fit is not believed for a body the arc never fixed if it moved that body's
 * state beyond `settings.bodyPriorPullLimit` σ of its prior: with nothing measuring the body, the
 * fit is using it to absorb what its law cannot explain (a Newtonian fit of an inverse-2.5 dive
 * moved Beta 88 km at 11,400 s and 870 km at 13,800 s, against a 5 km, 1 m/s prior; 2F request
 * 13).
 */
function fromSolution(
  sol: ArcSolution | undefined,
  spec: ModelSpec,
  body: string,
  id: string,
  params?: readonly Param[],
): boolean {
  if (!sol) return false;
  const seen = (b: string) => rangeFixTimes(sol.arc.meas, b).length >= MIN_ARC_FIXES;
  if (seen(id) && (body === spec.primary || seen(body))) return true;
  return sol.fromGlobalFit === true && !pulledBeyondPrior(sol, id, params, spec.settings);
}

const priorsByProblem = new WeakMap<readonly Param[], Map<string, Param>>();

/** A body's state in an arc's solution sits beyond the pull limit of its prior (see above). */
function pulledBeyondPrior(
  sol: ArcSolution,
  id: string,
  params: readonly Param[] | undefined,
  s: ModelSettings,
): boolean {
  if (!params) return false;
  let byName = priorsByProblem.get(params);
  if (!byName) {
    byName = new Map(params.map((p) => [p.name, p]));
    priorsByProblem.set(params, byName);
  }
  // The body's state in this arc, and its mass, which carries it along the arc.
  for (const name of [...STATE_KEYS.map((k) => `${sol.arc.id}.${id}.${k}`), muId(id)]) {
    const p = byName.get(name);
    const i = sol.idx.get(name);
    if (!p || i === undefined || p.priorMean === undefined || !(p.priorSigma! > 0)) continue;
    if (Math.abs(sol.x[i]! - p.priorMean) > s.bodyPriorPullLimit * p.priorSigma!) return true;
  }
  return false;
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
): State6 {
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
    P = new Float64Array(3 * bodies.length);
    V = new Float64Array(3 * bodies.length);
    rel.forEach((r, k) => {
      for (let c = 0; c < 3; c++) {
        P[3 * (k + 1) + c] = r[c]!;
        V[3 * (k + 1) + c] = r[3 + c]!;
      }
    });
  }
  const i = 3 * bodies.indexOf(id);
  const j = 3 * bodies.indexOf(ref);
  return [
    P[i]! - P[j]!,
    P[i + 1]! - P[j + 1]!,
    P[i + 2]! - P[j + 2]!,
    V[i]! - V[j]!,
    V[i + 1]! - V[j + 1]!,
    V[i + 2]! - V[j + 2]!,
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

const reasonOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Path of the first number in `v` that is not finite, or null. */
function nonFinite(v: unknown, path = ''): string | null {
  if (typeof v === 'number') return Number.isFinite(v) ? null : path;
  if (v === null || typeof v !== 'object') return null;
  if (ArrayBuffer.isView(v) || Array.isArray(v)) {
    const list = v as unknown as ArrayLike<unknown>;
    for (let i = 0; i < list.length; i++) {
      const q = list[i];
      if (typeof q === 'number' ? Number.isFinite(q) : nonFinite(q) === null) continue;
      return nonFinite(q, `${path}[${i}]`);
    }
    return null;
  }
  for (const [k, q] of Object.entries(v)) {
    const bad = nonFinite(q, path ? `${path}.${k}` : k);
    if (bad !== null) return bad;
  }
  return null;
}

/** What a snapshot derives from the attempts: none of it may be NaN or infinite. */
function nonFiniteIn(snap: ModelSnapshot): string | null {
  const { parameters, covariance, support, residuals, fit, calibration, noiseScale } = snap.state;
  const p = snap.derived.present;
  return nonFinite({
    parameters,
    covariance,
    support,
    residuals,
    fit,
    calibration,
    noiseScale,
    present: p ? { t: p.t, state: p.state, covariance: p.covariance.data } : null,
  });
}

/**
 * Tier G + Tier L + present state: the full rebuild (§11.3). Pure and deterministic.
 *
 * One bad attempt never stops the model. If the build fails, or gives a number that is not
 * finite, every attempt is built on its own; those that fail alone are left out with the reason
 * (`ModelDerived.unusable`, which the report carries) and the rest are fitted. Attempts that
 * fail only together are all left out, so the model then stands on its priors and says why. The
 * verdicts are a function of the records like everything else, so a rebuild still equals the
 * live state.
 */
export function buildModel(input: ModelInput, opts: BuildOptions = {}): ModelSnapshot {
  const attempt = (
    inp: ModelInput,
    unusable: ReadonlyMap<AttemptId, string>,
  ): { readonly snap?: ModelSnapshot; readonly reason: string } => {
    try {
      const snap = buildOnce(inp, opts, unusable);
      const bad = nonFiniteIn(snap);
      return bad === null
        ? { snap, reason: '' }
        : { reason: `${bad} would not be a finite number` };
    } catch (e) {
      return { reason: reasonOf(e) };
    }
  };
  const mine = input.attempts.filter((a) => a.encounterId === input.context.encounterId);
  // An in-flight refresh keeps the verdicts of the last full build, except on the attempt in
  // progress, whose record is still growing.
  const unusable = new Map(
    [...(opts.reuse?.unusable ?? [])].filter(
      ([id]) => id !== input.current && mine.some((a) => a.id === id),
    ),
  );
  const whole = attempt(input, unusable);
  if (whole.snap) return whole.snap;
  for (const rec of mine) {
    if (unusable.has(rec.id)) continue;
    const alone = attempt({ ...input, attempts: [rec] }, new Map());
    if (!alone.snap) unusable.set(rec.id, alone.reason);
  }
  const rest = attempt(input, unusable);
  if (rest.snap) return rest.snap;
  for (const rec of mine)
    if (!unusable.has(rec.id))
      unusable.set(rec.id, `could not be fitted together with the other attempts: ${rest.reason}`);
  return buildOnce(input, opts, unusable);
}

function buildOnce(
  input: ModelInput,
  opts: BuildOptions,
  unusable: ReadonlyMap<AttemptId, string>,
): ModelSnapshot {
  const ctx = input.context;
  const spec = modelSpec(ctx, input.adopted);
  const s = spec.settings;
  const attempts = [...input.attempts]
    .filter((a) => a.encounterId === ctx.encounterId)
    .sort((a, b) => a.index - b.index || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const reuse = opts.reuse;
  const problem = tierGProblem(ctx, spec, attempts, {
    unusable,
    ...(reuse ? { values: reuse.values } : {}),
  });
  let fit: FitResult | null = reuse ? reuse.fit : null;
  let fitFailure = reuse?.fitFailure;
  if (!reuse && problem.arcs.length > 0) {
    // A global fit that cannot be solved leaves the values at their priors (§11.2: a Tier G
    // result becomes the reference law only if it converged), and each arc is then fitted alone.
    try {
      fit = stagedFit(problem.structure, problem.arcs, problem.params, { dt: s.dt, h: s.fdStep });
    } catch (e) {
      fitFailure = reasonOf(e);
    }
  }
  const priorX = Float64Array.from(problem.params, (p) => p.init);
  const useFit =
    !reuse && fit !== null && fit.converged && nonFinite([fit.x, fit.P.data, fit.chi2]) === null;
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
  // The mass of a body no arc ever fixed is believed only as far as its prior allows: a fit that
  // moves it further is using it to absorb what its law cannot explain (a Newtonian fit of an
  // inverse-2.5 dive put Beta's μ at 1.4e10 against 2.2e9 ± 8e8; 2F request 13). It is then held
  // at its prior, with the prior's σ, everywhere the values are in force.
  if (useFit) {
    const fixed = new Set(
      spec.bodies.filter((b) =>
        problem.arcs.some((a) => rangeFixTimes(a.meas, b).length >= MIN_ARC_FIXES),
      ),
    );
    for (const b of spec.bodies) {
      const id = muId(b);
      const prm = problem.params[idx.get(id) ?? -1];
      if (fixed.has(b) || !prm || prm.priorMean === undefined || !(prm.priorSigma! > 0)) continue;
      if (Math.abs(values[id]! - prm.priorMean) > s.bodyPriorPullLimit * prm.priorSigma!) {
        values[id] = prm.priorMean;
        sigmas[id] = prm.priorSigma!;
      }
    }
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
      solutions.set(a.id, {
        arc: a,
        x,
        idx,
        structure: problem.structure,
        P: fit!.P,
        rel,
        scale,
        fromGlobalFit: true,
      });
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
  /**
   * Local fits of the coasting windows of `arcs` about `body`. A window where another body pulls
   * too hard is left out of the calibration profile (§13.7); with `forPaths` true for its arc it
   * is still fitted, flagged `excluded`, because the ship's path there is all a tracked rock's
   * fixes need (a rock of Beta's belt is met between the bodies, where Alpha pulls half as hard
   * as Beta and every window is excluded; S8's ring crossing).
   */
  const fitWindows = (
    arcs: readonly Arc[],
    body: string,
    forPaths: (arc: Arc) => boolean = () => false,
  ): (LocalFitResult & { readonly excluded: boolean })[] => {
    const out: (LocalFitResult & { readonly excluded: boolean })[] = [];
    for (const a of arcs) {
      const ref = referenceFor(partial, body, a.id, ctx);
      const paths = forPaths(a);
      for (const w of makeWindows(a, body, rule)) {
        // Coasting windows only; a sliver between two burns is too short to fit.
        if (w.powered || w.fixes.length < s.windowKeepFixes) continue;
        let excluded = false;
        if (ref.others && ref.others.length > 0) {
          const mid = w.fixes[w.fixes.length >> 1]!;
          const los = lineOfSight(mid);
          const ship = los.map((c) => -mid.z[2]! * c);
          const own = believedPull(ref.mu, n, s.r0, mid.z[2]!);
          const tooStrong = ref.others.some((o) => {
            const st = o.stateAt(mid.t);
            const r = Math.hypot(st[0] - ship[0]!, st[1] - ship[1]!, st[2] - ship[2]!);
            return believedPull(o.mu, n, s.r0, r) > s.otherBodyPullLimit * own;
          });
          if (tooStrong && !paths) continue;
          excluded = tooStrong;
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
        let res: LocalFitResult;
        try {
          res = hit ?? localFitDetailed(ref, a, w, s.dt, [1, s.localScalePriorSigma]);
        } catch (e) {
          // A path-only window that cannot be fitted is simply not a path.
          if (excluded) continue;
          throw e;
        }
        if (!hit) opts.cache?.set(key, res);
        out.push({ ...res, excluded });
      }
    }
    return out;
  };
  // Attempts that tracked a rock (a range fix on anything that is not a briefed body).
  const rockArcs = new Set(
    attempts
      .filter((rec) => {
        const known = new Set(contextFor(ctx, rec).bodies.map((b) => b.id));
        return rec.measurements.some(
          (m) => m.kind === 'range' && !!m.target && !known.has(m.target),
        );
      })
      .flatMap((rec) => (problem.builds.get(rec.id)?.arcs ?? []).map((a) => a.id)),
  );
  const shipFits = new Map(
    spec.bodies.map((body) => [body, fitWindows(problem.arcs, body, (a) => rockArcs.has(a.id))]),
  );

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
      cameraBias: cameraIds(spec.cameraId).map((id) => values[id] ?? 0) as unknown as Vec3T,
      dt: s.dt,
      h: s.fdStep,
      normalPointInterval: s.normalPointInterval,
      planar: spec.planar,
    });
    if (list.length > 0) probes.set(rec.id, list);
  }
  const probeList = [...probes.values()].flat();
  const allArcs = [...problem.arcs, ...probeList];

  const windows: WindowFit[] = [];
  const profiles: ProfileFit[] = [];
  const flatProfiles: ProfileFit[] = [];
  for (const body of spec.bodies) {
    const rows = [...shipFits.get(body)!, ...fitWindows(probeList, body)]
      .filter((r) => !r.excluded)
      .map((r) => r.row);
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
      const ranges = allArcs.flatMap((a) => rangeFixes(a, body).map((m) => m.z[2]!));
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
    ...(fitFailure !== undefined ? { fitFailure } : {}),
    unusable,
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

/**
 * The body whose coasting windows end last in an arc, with its most recent windows (§8.1): the
 * body the camera fixed most recently. Ties go to the first in `bodies` (the primary).
 */
export function latestWindows(
  arc: Arc,
  bodies: readonly string[],
  s: ModelSettings,
): { body: string; wins: Window[] } | null {
  let best: { body: string; wins: Window[]; end: number } | null = null;
  for (const body of bodies) {
    if (rangeFixes(arc, body).length < s.windowMinFixes) continue;
    const wins = makeWindows(arc, body, windowRule(s))
      .filter((w) => !w.powered && w.fixes.length >= s.windowKeepFixes)
      .slice(-s.anchorWindows);
    if (wins.length === 0) continue;
    const end = wins[wins.length - 1]!.t1;
    if (!best || end > best.end) best = { body, wins, end };
  }
  return best ? { body: best.body, wins: best.wins } : null;
}

/** An arc's data up to time t (the moment a forecast was asked for, A18). */
function arcAsOf(arc: Arc, t: number): Arc {
  const last = arc.meas[arc.meas.length - 1];
  return !last || last.t <= t ? arc : { ...arc, meas: arc.meas.filter((m) => m.t <= t) };
}

/**
 * §8.1: the present state of an attempt from its most recent coasting windows, on whichever body
 * the camera fixed last (2F request 12: hours pointed at the second body must not leave the
 * present state behind). With `asOf`, only data up to that time are used (A18: a forecast is
 * computed from the moment of commitment, whatever has been recorded since).
 */
export function presentState(
  d: ModelDerived,
  ctx: ModelContext,
  attemptId: AttemptId,
  asOf?: number,
): PresentState | null {
  const s = d.spec.settings;
  const build = d.problem.builds.get(attemptId);
  const rec = d.problem.records.get(attemptId);
  const actx = contextFor(ctx, rec);
  const arcs = build?.arcs ?? [];
  const last = asOf === undefined ? arcs.at(-1) : arcs.filter((a) => a.epoch <= asOf).at(-1);
  const arc = last && asOf !== undefined ? arcAsOf(last, asOf) : last;
  const pick = arc ? latestWindows(arc, d.spec.bodies, s) : null;
  if (!arc || !pick) return arrivalState(actx, d.spec);
  const { body, wins } = pick;
  const prof = d.profiles.find((p) => p.body === body) ?? null;
  const extra = d.profiles.filter((p) => p.body !== body);
  const base = referenceFor(d, body, arc.id, ctx);
  // §8.1: the camera misalignment joins the fit, held by a prior at the values this arc uses
  // with their σ (Tier G's posterior and the arc's deviation, aged to the last fix), or the
  // arrival prior. The planar reduction holds it fixed, as revision 2 did.
  const camera = d.spec.planar ? null : cameraInForce(d, arc.id, rec, wins);
  const ref: ReferenceLaw = camera ? { ...base, cam: camera.value } : base;
  // The other bodies join the fit the same way, held by what the model knows of them at the
  // first fix (2F request 13): a second body moved under a law not sampled out there would
  // otherwise bias the present state with nothing in its covariance to say so.
  const tFirst = wins[0]!.fixes[0]!.t;
  const bodyPriors =
    d.spec.dynamic && !(globalThis as { __noBP?: boolean }).__noBP
      ? bodyCovariances(d, bodiesAt(d, ctx, arc.id, body, tFirst, asOf))
      : undefined;
  // A present-state fit that cannot be solved leaves the arrival state, the best state the
  // model then has: a forecast is always available.
  let anc: Anchor;
  try {
    anc = anchorState(ref, prof, arc, wins, s.dt, {
      h: s.fdStep,
      gPrior: [1, s.localScalePriorSigma],
      slopeSigma: s.anchorSlopePriorSigma,
      extraProfiles: extra,
      camSigma: camera?.sigma ?? null,
      ...(bodyPriors ? { bodyPriors } : {}),
      considerHedge: {
        sigmaH: d.sigmaH0,
        validated: d.validated,
        flat: d.flatProfiles,
        // As the forecast does (§8.2): the masses of other bodies without a profile.
        mu: Object.fromEntries(
          d.spec.bodies
            .filter((b) => b !== body && !d.profiles.some((p) => p.body === b))
            .map((b) => [b, d.sigmas[muId(b)] ?? 0]),
        ),
      },
    });
  } catch {
    return arrivalState(actx, d.spec);
  }
  const cov = zeros(6, 6);
  for (let i = 0; i < 36; i++) cov.data[i] = anc.covariance.data[i]! * d.noiseScale;
  if (nonFinite([anc.tNow, anc.state, cov.data]) !== null) return arrivalState(actx, d.spec);
  return {
    source: 'anchor',
    body,
    t: anc.tNow,
    state: anc.state,
    covariance: cov,
    anchor: anc,
    ...(anc.hedge ? { hedge: anc.hedge } : {}),
    ...(camera ? { camera } : {}),
  };
}

export interface BodiesAt {
  /** The other modelled bodies' states relative to the reference body (at rest) at t. */
  readonly state: Readonly<Record<string, State6>>;
  /**
   * Their 6×6 covariances from the data: the arc's fit (Tier G, or the arc alone), else the
   * briefing's, carried to t. Scaled by the noise scale s², like the present state.
   */
  readonly cov: Readonly<Record<string, Matrix>>;
  /**
   * How each state at t depends on the shared hedge exponents (`eta:<body>`, `etaE:<body>`):
   * the law's hedge acts on the bodies' mutual pulls from the time the body was last fixed, so
   * its believed position at t is already uncertain by that much (2F request 13).
   */
  readonly eta: Readonly<Record<string, Readonly<Record<string, Float64Array>>>>;
  /** From when the hedge acts on each body's motion: its last range fix, or 0 (the briefing). */
  readonly since: Readonly<Record<string, number>>;
}

/**
 * The other modelled bodies relative to `ref` at time t of a ship arc, with what the model knows
 * of them: where the fits put them, how well, and how the unsampled law has moved them since they
 * were last fixed (§8.2, §8.7; 2F request 13). Data after `asOf` are not used for the times the
 * bodies were last fixed.
 */
export function bodiesAt(
  d: ModelDerived,
  ctx: ModelContext,
  arcId: string,
  ref: string,
  t: number,
  asOf = Infinity,
): BodiesAt {
  const spec = d.spec;
  const s = spec.settings;
  const others = spec.bodies.filter((b) => b !== ref);
  const state: Record<string, State6> = {};
  const cov: Record<string, Matrix> = {};
  const eta: Record<string, Record<string, Float64Array>> = {};
  const since: Record<string, number> = {};
  const sol = d.solutions.get(arcId) ?? d.solutions.get(shipArcOf(arcId));
  const trusted = (id: string) => fromSolution(sol, spec, ref, id, d.problem.params);
  for (const o of others) {
    state[o] = relativeState(d, ctx, trusted(o) ? sol : undefined, arcId, o, ref, t);
    cov[o] = zeros(6, 6);
    eta[o] = {};
    since[o] = 0;
  }
  // Bodies held at their briefed positions (no mutual motion modelled) carry nothing more.
  if (others.length === 0 || !spec.dynamic) return { state, cov, eta, since };
  const actx = contextFor(ctx, d.problem.records.get(attemptOfArc(arcId)));
  const law = lawInForce(ctx, spec, d.values);
  const s2 = d.noiseScale;
  /** Every body's state relative to `ref` at t, from a compiled arc run. */
  const relTo = (ca: ReturnType<typeof compileArc>, x: ArrayLike<number>, at: number) => {
    const tr = simulate(ca, x, [at], s.dt);
    const P = tr.pos[0]!;
    const V = tr.vel[0]!;
    const r = 3 * ca.bodyIndex.get(ref)!;
    const out: Record<string, number[]> = {};
    for (const b of others) {
      const j = 3 * ca.bodyIndex.get(b)!;
      out[b] = [0, 1, 2, 0, 1, 2].map((c, k) =>
        k < 3 ? P[j + c]! - P[r + c]! : V[j + c]! - V[r + c]!,
      );
    }
    return out;
  };
  /** cov[b] += Σ J_a C_ab J_bᵀ over central-difference columns of `run` (per body, 6 numbers). */
  const accumulate = (
    n: number,
    step: (i: number) => number,
    run: (i: number, delta: number) => Record<string, number[]>,
    C: (a: number, b: number) => number,
    bodies: readonly string[],
  ) => {
    const J: Record<string, number[][]> = {};
    for (const b of bodies) J[b] = [];
    for (let i = 0; i < n; i++) {
      const hstep = step(i);
      const plus = run(i, hstep);
      const minus = run(i, -hstep);
      for (const b of bodies) J[b]!.push(plus[b]!.map((v, c) => (v - minus[b]![c]!) / (2 * hstep)));
    }
    for (const b of bodies)
      for (let a = 0; a < n; a++)
        for (let bb = 0; bb < n; bb++) {
          const c = C(a, bb);
          if (c === 0) continue;
          const Ja = J[b]![a]!;
          const Jb = J[b]![bb]!;
          for (let u = 0; u < 6; u++)
            for (let w = 0; w < 6; w++) cov[b]!.data[u * 6 + w]! += s2 * Ja[u]! * c * Jb[w]!;
        }
  };
  // The fit's own uncertainty: central differences over the parameters that move the bodies.
  const solved = others.filter((o) => trusted(o) && sol?.P && t >= sol.arc.epoch);
  if (sol && sol.P && solved.length > 0) {
    const P = sol.P;
    const nP = P.cols;
    const rel = new Set(sol.rel);
    const own = new Set(
      spec.bodies.flatMap((b) => STATE_KEYS.map((k) => `${sol.arc.id}.${b}.${k}`)),
    );
    const moving: number[] = [];
    for (const [name, i] of sol.idx)
      if (rel.has(i) && (own.has(name) || name === EXPONENT_ID || /^body\..+\.mu$/.test(name)))
        moving.push(i);
    const ca = compileArc(sol.structure, sol.arc, sol.idx);
    const xp = Float64Array.from(sol.x);
    accumulate(
      moving.length,
      (a) => s.fdStep * sol.scale[moving[a]!]!,
      (a, delta) => {
        const i = moving[a]!;
        xp[i] = sol.x[i]! + delta;
        const out = relTo(ca, xp, t);
        xp[i] = sol.x[i]!;
        return out;
      },
      (a, b) => P.data[moving[a]! * nP + moving[b]!]!,
      solved,
    );
  }
  // The briefing's uncertainty, carried to t under the law in force, for the rest.
  const briefed = others.filter((o) => !solved.includes(o));
  if (briefed.length > 0) {
    const pBody = briefingBody(actx, spec.primary);
    const largest = (c?: Cov3) => Math.max(c?.[0] ?? 0, c?.[3] ?? 0, c?.[5] ?? 0);
    const rel0 = briefingBodiesAt(actx, spec, 0, law);
    const nonPrimary = spec.bodies.slice(1);
    const sig: number[] = [];
    nonPrimary.forEach((id) => {
      const b = briefingBody(actx, id);
      const ps = Math.max(Math.sqrt(largest(b?.positionCov) + largest(pBody?.positionCov)), 1);
      const vs = s.priorBodyVelocitySigma;
      const keep = spec.planar ? [1, 1, 0, 1, 1, 0] : [1, 1, 1, 1, 1, 1];
      [ps, ps, ps, vs, vs, vs].forEach((v, c) => sig.push(keep[c]! * v));
    });
    const muSig = spec.bodies.map((b) => d.sigmas[muId(b)] ?? 0);
    const nState = sig.length;
    const run = (i: number, delta: number) => {
      const start = rel0.map((r) => [...r]);
      const mu = spec.bodies.map((b) => law.mu(b));
      if (i < nState) start[Math.floor(i / 6)]![i % 6]! += delta;
      else mu[i - nState]! += delta;
      const st: Structure = {
        r0: s.r0,
        n: law.n,
        bodies: spec.bodies.map((id, j) => ({
          id,
          mu: mu[j]!,
          state: j === 0 ? 'gauge' : (start[j - 1] as unknown as State6),
        })),
        ship: [1e15, 0, 0, 0, 0, 0],
        dynamicBodies: true,
        engine: { kE: 1, dE: 0, dP: 0 },
        kA: 1,
        camBias: [0, 0, 0],
      };
      return relTo(compileArc(st, { id: 'briefing', epoch: 0, commands: [] }, new Map()), [], t);
    };
    const steps = [...sig.map((v) => Math.max(1e-3 * v, 1e-6)), ...muSig.map((v) => 1e-3 * v)];
    const vars = [...sig, ...muSig].map((v) => v * v);
    const live = vars.flatMap((v, i) => (v > 0 && steps[i]! > 0 ? [i] : []));
    accumulate(
      live.length,
      (a) => steps[live[a]!]!,
      (a, delta) => run(live[a]!, delta),
      (a, b) => (a === b ? vars[live[a]!]! / s2 : 0),
      briefed,
    );
  }
  // The hedge on the bodies' mutual pulls since the pair was last fixed. A body is fixed relative
  // to the ship at its last range fix (up to asOf), else at the briefing (0); the body pulling
  // hardest on the ship is fixed by the ship's own motion for as long as anything is tracked
  // (orbit determination), so its last fix is the last fix on any body.
  const covered = new Map([...d.profiles, ...d.flatProfiles].map((p) => [p.body, p]));
  const arc = d.problem.arcs.find((a) => a.id === shipArcOf(arcId));
  const lastFix = (b: string) =>
    arc
      ? rangeFixes(arc, b)
          .filter((m) => m.t <= asOf)
          .at(-1)?.t
      : undefined;
  const anyLast = Math.max(-Infinity, ...spec.bodies.map((b) => lastFix(b) ?? -Infinity));
  let dominant: string | null = null;
  if (sol && Number.isFinite(anyLast)) {
    const tq = Math.max(sol.arc.epoch, Math.min(t, anyLast));
    const ca = compileArc(sol.structure, sol.arc, sol.idx);
    const P = simulate(ca, sol.x, [tq], s.dt).pos[0]!;
    const sh = 3 * ca.nb;
    let best = -Infinity;
    for (const b of spec.bodies) {
      const j = 3 * ca.bodyIndex.get(b)!;
      const r = Math.hypot(P[sh]! - P[j]!, P[sh + 1]! - P[j + 1]!, P[sh + 2]! - P[j + 2]!);
      const pull = law.mu(b) / Math.pow(r, law.n);
      if (pull > best) {
        best = pull;
        dominant = b;
      }
    }
  }
  const fixedAt = (b: string) => {
    if (b !== ref && !trusted(b)) return 0;
    const own = lastFix(b) ?? 0;
    return b === dominant ? Math.max(own, anyLast) : own;
  };
  for (const o of others) {
    const t0 = Math.min(fixedAt(o), fixedAt(ref), t);
    since[o] = t0;
    if (!(t > t0)) continue;
    const names: string[] = [];
    const shared: string[] = [];
    const profiles: ProfileDef[] = [];
    for (const b of spec.bodies) {
      const p = covered.get(b);
      if (!p) continue;
      const v = d.validated[b];
      names.push(`h.eta.${b}`);
      shared.push(`eta:${b}`);
      const earned = v && v.spans.length > 0 ? { etaE: `h.etaE.${b}`, spans: v.spans } : undefined;
      if (earned) {
        names.push(earned.etaE);
        shared.push(`etaE:${b}`);
      }
      profiles.push(profileDef(p, undefined, `h.eta.${b}`, earned));
    }
    if (names.length === 0) continue;
    const start = (b: string): State6 =>
      relativeState(d, ctx, trusted(b) ? sol : undefined, arcId, b, ref, t0);
    const st: Structure = {
      r0: s.r0,
      n: law.n,
      bodies: [
        { id: ref, mu: law.mu(ref), state: 'gauge' },
        ...others.map((b) => ({ id: b, mu: law.mu(b), state: start(b) })),
      ],
      ship: [1e15, 0, 0, 0, 0, 0],
      dynamicBodies: true,
      engine: { kE: 1, dE: 0, dP: 0 },
      kA: 1,
      camBias: [0, 0, 0],
      profiles,
      bodyProfiles: true,
    };
    const ca = compileArc(
      st,
      { id: 'hedge', epoch: t0, commands: [] },
      new Map(names.map((nm, i) => [nm, i])),
    );
    const x0 = new Float64Array(names.length);
    const hstep = 1e-3;
    names.forEach((_, i) => {
      x0[i] = hstep;
      const plus = relTo(ca, x0, t)[o]!;
      x0[i] = -hstep;
      const minus = relTo(ca, x0, t)[o]!;
      x0[i] = 0;
      eta[o]![shared[i]!] = Float64Array.from(plus, (v, c) => (v - minus[c]!) / (2 * hstep));
    });
  }
  return { state, cov, eta, since };
}

/**
 * The bodies' full 6×6 covariances at one time: the fits' part plus the hedge's, each hedge
 * exponent at its σ (σ_h0, or σ_e for an earned one), as used where the hedge exponents are not
 * carried on as shared sources (the present-state fit).
 */
export function bodyCovariances(
  d: Pick<ModelDerived, 'sigmaH0' | 'validated'>,
  b: BodiesAt,
): Record<string, Matrix> {
  const out: Record<string, Matrix> = {};
  for (const [id, c] of Object.entries(b.cov)) {
    const m: Matrix = { rows: 6, cols: 6, data: Float64Array.from(c.data) };
    for (const [name, J] of Object.entries(b.eta[id] ?? {})) {
      const body = name.slice(name.indexOf(':') + 1);
      const sig = name.startsWith('etaE:') ? (d.validated[body]?.sigmaE ?? 0) : d.sigmaH0;
      for (let u = 0; u < 6; u++)
        for (let w = 0; w < 6; w++) m.data[u * 6 + w]! += sig * sig * J[u]! * J[w]!;
    }
    out[id] = m;
  }
  return out;
}

/**
 * The camera misalignment an arc uses (body x, y, z): the arrival value plus the arc's deviation
 * with σ from the joint covariance, aged from the arc's last retained measurement to the last
 * fix of `wins` (§3.7, §8.1).
 */
function cameraInForce(
  d: ModelDerived,
  arcId: string,
  rec: AttemptRecord | undefined,
  wins: readonly { readonly t1: number }[],
): NonNullable<PresentState['camera']> {
  const ids = cameraIds(d.spec.cameraId);
  const cal = new Map(arcCalibration(d, arcId).map((c) => [c.id, c]));
  const tNow = Math.max(...wins.map((w) => w.t1));
  const one = (id: string): [number, number] => {
    const c = cal.get(id);
    const value = c?.value ?? d.values[id] ?? 0;
    const sigma = c?.sigma ?? d.sigmas[id] ?? d.spec.settings.priorCameraBiasSigma;
    const aged = rec && c ? agingBetween(d, rec, id, c.tLast, tNow).variance : 0;
    return [value, Math.sqrt(sigma * sigma + aged)];
  };
  const v = ids.map(one);
  return {
    ids,
    value: [v[0]![0], v[1]![0], v[2]![0]],
    sigma: [v[0]![1], v[1]![1], v[2]![1]],
  };
}

/** Before enough fixes: the arrival estimate, relative to the primary's believed arrival state. */
export function arrivalState(ctx: ModelContext, spec: ModelSpec): PresentState {
  const a = ctx.arrival;
  const p = briefingBody(ctx, spec.primary);
  const zero = { x: 0, y: 0, z: 0 };
  const pp = p?.position ?? zero;
  const pv = p?.velocity ?? zero;
  const bc: Cov3 = p?.positionCov ?? [0, 0, 0, 0, 0, 0];
  // The planar reduction holds everything out of the plane at zero.
  const keep = spec.planar ? [1, 1, 0] : [1, 1, 1];
  const cov = zeros(6, 6);
  // [xx, xy, xz, yy, yz, zz] → rows and columns (i, j) of a 3×3 block at offset o.
  const sym = [
    [0, 1, 2],
    [1, 3, 4],
    [2, 4, 5],
  ];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      const k = sym[i]![j]!;
      const w = keep[i]! * keep[j]!;
      cov.data[i * 6 + j] = w * (a.positionCov[k]! + bc[k]!);
      cov.data[(3 + i) * 6 + 3 + j] = w * a.velocityCov[k]!;
    }
  return {
    source: 'arrival',
    body: spec.primary,
    t: a.t,
    state: Float64Array.of(
      a.position.x - pp.x,
      a.position.y - pp.y,
      keep[2]! * (a.position.z - pp.z),
      a.velocity.x - pv.x,
      a.velocity.y - pv.y,
      keep[2]! * (a.velocity.z - pv.z),
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
  if (id === RCS_SCALE_ID) return { label: 'RCS translation scale', unit: '' };
  m = /^thruster\.(.+)\.scale$/.exec(id);
  if (m) return { label: `${eqName(m[1]!)} thrust scale`, unit: '' };
  m = /^thruster\.(.+)\.misalignment$/.exec(id);
  if (m) return { label: `${eqName(m[1]!)} misalignment`, unit: 'rad' };
  m = /^thruster\.(.+)\.misalignment-pitch$/.exec(id);
  if (m) return { label: `${eqName(m[1]!)} pitch misalignment`, unit: 'rad' };
  m = /^sensor\.(.+)\.scale$/.exec(id);
  if (m) return { label: `${eqName(m[1]!)} scale`, unit: '' };
  m = /^sensor\.(.+)\.bias$/.exec(id);
  if (m) return { label: `${eqName(m[1]!)} bearing bias`, unit: 'rad' };
  m = /^sensor\.(.+)\.bias-(x|y)$/.exec(id);
  if (m) return { label: `${eqName(m[1]!)} misalignment about body ${m[2]}`, unit: 'rad' };
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

/**
 * Cross-range residuals (m) from bearing residuals: whitened residual × σ × measured range, for
 * both tangent directions of a fix (east and north; east only in the planar reduction). σ is
 * the arc each row subtends: σ_az·cos(el) for the east row, σ_el for the north row.
 */
export function crossRangeResiduals(
  d: Pick<ModelDerived, 'fit' | 'problem'>,
): { arc: string; t: number; powered: boolean; m: number }[] {
  const fit = d.fit;
  if (!fit) return [];
  // The fit may predate the current arcs (in-flight refresh), so match by tag, not position.
  const fixes = new Map<string, { s: readonly number[]; r: number }>();
  for (const a of d.problem.arcs)
    for (const m of a.meas)
      if (hasRange(m) && usable(d.problem.structure, m))
        fixes.set(`${a.id}|${m.t}|${m.target}`, {
          s: [(m.sigma[0] ?? 0) * Math.cos(m.z[1]!), m.sigma[1] ?? 0],
          r: m.z[2]!,
        });
  const out: { arc: string; t: number; powered: boolean; m: number }[] = [];
  fit.residTags.forEach((tag, k) => {
    if (tag.kind !== 'bearing') return;
    const f = fixes.get(`${tag.arc}|${tag.t}|${tag.target}`);
    if (f)
      out.push({
        arc: tag.arc,
        t: tag.t,
        powered: tag.powered,
        m: fit.resid[k]! * f.s[tag.component]! * f.r,
      });
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
      const r = rangeFixes(a, body).map((m) => m.z[2]!);
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
      const cam = /^sensor\.(.+)\.bias(?:-x|-y)?$/.exec(id)?.[1] ?? '';
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
