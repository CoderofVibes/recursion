/**
 * Test support: read 1G's estimator vectors into estimator inputs. The planar set
 * (tests/vectors/estimator/) is run through the three-dimensional estimator in the planar
 * reduction of spec revision 3, Appendix A.3; the 3D set (tests/vectors/estimator-3d/) directly.
 *
 * Only the inputs reach the estimator: attempts (measurements, commands), the model structure
 * and the parameter list. Each vector's `truth` block is read by the tests for checking claims
 * and is never passed to estimator code (1G, P11).
 */

import {
  cov3FromPlanar,
  isotropicInertia,
  prismHull,
  type AttemptRecord,
  type Measurement,
  type ShipDefinition,
  type ExecutedCommand,
} from '../contracts/index.ts';
import * as quat from '../lib/quat.ts';
import type {
  Arc,
  BodyDef,
  EstMeasurement,
  Ref,
  Refs3,
  Refs6,
  Structure,
  ThrustSegment,
} from './dynamics.ts';
import type { Param } from './solve.ts';

export type RefJson = number | { param: string } | { sum: RefJson[] };

export interface ModelJson {
  law: { form: string; r0: number; exponent: RefJson };
  bodies: { id: string; mu: RefJson; state: 'gauge' | RefJson[]; localScale: RefJson }[];
  dynamicBodies: boolean;
  ship: RefJson[];
  engine: { kE: RefJson; dE: RefJson };
  accelScale: RefJson;
  cameraBias: RefJson;
  empirical?: { frameBody: string; bounds: Record<string, number[]> };
  profile?: { body: string; lnRNodes: number[]; g: number[]; rMin: number; rMax: number };
}

export interface ExpectedFit {
  estimate: Record<string, number>;
  sigma: Record<string, number>;
  correlation: { names: string[]; matrix: number[][] };
  chi2: number;
  priorCost: number;
  m: number;
  pEff: number;
  nu: number;
  chi2PerDof: number;
  converged: boolean;
  residualSummary: Record<string, { n: number; rms: number; mean: number }>;
}

export interface HeldOutJson {
  attempt: string;
  T: number;
  nu: number;
  TperNu: number;
  threshold: number;
  pass: boolean;
  chi2Data: number;
  priorPenalty: number;
}

export interface FitJson {
  id: string;
  description: string;
  compare: 'numeric' | 'qualitative';
  attempts: string[];
  model: ModelJson;
  parameters: {
    name: string;
    group: string;
    init: number;
    prior: { mean: number; sigma: number } | null;
  }[];
  expected: ExpectedFit;
  heldOut?: HeldOutJson;
  adoption?: {
    deltaCost: number;
    penalty: number;
    adopt: boolean;
    evidence?: boolean;
    heldOutPass?: boolean;
  };
  earnedHedge?: {
    trainingCoverage: [number, number];
    nWindowsOutside: number;
    delta?: number;
    ell?: number;
    sigmaH: number;
  };
  table?: {
    window: string;
    t0: number;
    t1: number;
    aR: number;
    sigmaR: number;
    aT: number;
    sigmaT: number;
    tidalAtMidT?: number;
  }[];
  signature?: { maxAbsTangentialZ: number; maxAbsTangentialOverG0: number };
  confounding?: {
    maxAbsRho: number;
    pairs: { gravity: string; propulsion: string; rho: number }[];
    posteriorOverPrior: Record<string, number>;
  };
  theory?: { muLocal: number };
}

export interface AttemptJson {
  id: string;
  epoch: number;
  duration: number;
  commands: { t0: number; t1: number; u: number; theta: number }[];
  measurements: {
    t: number;
    kind: 'opnav' | 'accel';
    target?: string;
    z: number[];
    sigma: number[];
  }[];
}

export interface WindowJson {
  window: string;
  attempt: string;
  t0: number;
  t1: number;
  nFixes: number;
  rGeoMean: number;
  rMin: number;
  rMax: number;
  g: number;
  sigma: number;
  chi2PerDof: number;
  converged: boolean;
}

export interface ProfileJson {
  uNodes: number[];
  g: number[];
  sigma: number[];
  covariance: number[][];
  rMin: number;
  rMax: number;
  inflation: number;
  nWindows: number;
}

export interface TierLJson {
  reference: { r0: number; mu: number; n: number; cam: number; kE?: number; dE?: number };
  windows: WindowJson[];
  noiseScale: number;
  profile: ProfileJson;
}

export interface ForecastPointJson {
  t: number;
  mean: [number, number];
  rangePredicted: number;
  insideCoverage: boolean;
  sigmaMajor: { state: number; profile: number; hedge: number; engine: number; total: number };
  withinHorizon: boolean;
  /** Truth (checking only). */
  truth: [number, number];
}

export interface CaseJson {
  id: string;
  attempts: AttemptJson[];
  truth: { values: Record<string, number> };
  fits: FitJson[];
  tierL?: TierLJson;
  training?: string[];
  heldOut?: string;
  derived?: { gmRatioExpected: number };
  now?: number;
  plans?: Record<string, { commands: AttemptJson['commands']; checkpoints: number[] }>;
  forecastInputs?: {
    reference: TierLJson['reference'];
    engineSigma: { kE: number; dE: number };
    sigmaH: number;
    horizonFraction: number;
    noiseScale: number;
    anchorWindows: number;
  };
  anchor?: {
    windows: string[];
    tNow: number;
    state: number[];
    covariance: number[][];
    g: number;
    gSigma: number;
    g1: number;
    g1Sigma: number;
  };
  forecasts?: { plan: string; points: ForecastPointJson[] }[];
}

export interface VectorJson {
  id: string;
  cases: CaseJson[];
  checks: { id: string; claim: string; value: unknown; pass: boolean }[];
}

export function refOf(r: RefJson): Ref {
  if (typeof r === 'number') return r;
  if ('sum' in r) return r.sum.map(refOf);
  return r.param;
}

/** Planar state refs [x, y, vx, vy] lifted: z and vz are the fixed number 0 (A.3). */
function liftState(refs: readonly RefJson[]): Refs6 {
  const [x, y, vx, vy] = refs.map(refOf) as [Ref, Ref, Ref, Ref];
  return [x, y, 0, vx, vy, 0];
}

/**
 * A planar structure in the planar reduction (A.3): z and vz of the ship and of every body, the
 * pitch misalignment and the camera components about body x and y are the fixed number 0; the
 * planar `camera.bias` is the z component.
 */
export function toStructure(m: ModelJson): Structure {
  const bodies: BodyDef[] = m.bodies.map((b) => ({
    id: b.id,
    mu: refOf(b.mu),
    state: b.state === 'gauge' ? 'gauge' : liftState(b.state),
    gs: refOf(b.localScale),
  }));
  return {
    r0: m.law.r0,
    n: refOf(m.law.exponent),
    bodies,
    ship: liftState(m.ship),
    dynamicBodies: m.dynamicBodies,
    engine: { kE: refOf(m.engine.kE), dE: refOf(m.engine.dE), dP: 0 },
    kR: 1,
    kA: refOf(m.accelScale),
    camBias: [0, 0, refOf(m.cameraBias)],
  };
}

/** A planar thrust segment lifted: its angle is a rotation about +z. */
export const liftCommand = (c: { t0: number; t1: number; u: number; theta: number }) => ({
  t0: c.t0,
  t1: c.t1,
  u: c.u,
  q: quat.fromYaw(c.theta),
});

/**
 * A planar attempt lifted (A.3): bearing b becomes azimuth b at elevation 0 with no elevation
 * row, [fx, fy] becomes [fx, fy, 0] with no f_z row, a command angle a rotation about +z.
 */
export function toArc(a: AttemptJson): Arc {
  const commands: ThrustSegment[] = a.commands.map(liftCommand);
  const meas: EstMeasurement[] = a.measurements.map((m) => {
    if (m.kind === 'accel')
      return {
        kind: 'accel',
        t: m.t,
        z: [m.z[0]!, m.z[1]!, 0],
        sigma: [m.sigma[0]!, m.sigma[1]!, null],
      };
    return m.z.length > 1
      ? {
          kind: 'opnav',
          t: m.t,
          target: m.target!,
          z: [m.z[0]!, 0, m.z[1]!],
          sigma: [m.sigma[0]!, null, m.sigma[1]!],
        }
      : { kind: 'opnav', t: m.t, target: m.target!, z: [m.z[0]!, 0], sigma: [m.sigma[0]!, null] };
  });
  return { id: a.id, epoch: a.epoch, commands, meas };
}

/** Finite-difference / conditioning scales of the 1G reference (spec §3.6). */
export function referenceScale(name: string): number {
  if (/\.ship\.(x|y)$/.test(name)) return 1e3;
  if (/\.ship\.(vx|vy)$/.test(name)) return 1;
  if (/\.B\.(x|y)$/.test(name)) return 1e3;
  if (/\.B\.(vx|vy)$/.test(name)) return 0.1;
  if (name === 'mu.A') return 1e7;
  if (name === 'mu.B') return 2.5e6;
  if (name === 'law.n') return 1e-3;
  if (name === 'camera.bias') return 1e-5;
  if (name === 'engine.kE' || name === 'engine.dE') return 1e-3;
  if (/\.engine\.d(kE|dE)$/.test(name)) return 1e-3;
  if (name === 'accel.kA') return 1e-4;
  if (/\.emp\d+\.(R|T)$/.test(name)) return 1e-6;
  throw new Error(`no reference scale for ${name}`);
}

/** Parameters with the vector's priors and groups; `init` from the given guesses or the vector. */
export function toParams(fit: FitJson, init?: Readonly<Record<string, number>>): Param[] {
  return fit.parameters.map((p) => ({
    name: p.name,
    init: init?.[p.name] ?? p.init,
    scale: referenceScale(p.name),
    group: p.group,
    ...(p.prior ? { priorMean: p.prior.mean, priorSigma: p.prior.sigma } : {}),
  }));
}

// ---------------------------------------------------------------------------------------------
// The 3D set (tests/vectors/estimator-3d/, spec Appendix A.2)
// ---------------------------------------------------------------------------------------------

export interface ModelJson3 {
  law: { form: string; r0: number; exponent: RefJson };
  bodies: { id: string; mu: RefJson; state: 'gauge' | RefJson[]; localScale: RefJson }[];
  dynamicBodies: boolean;
  ship: RefJson[];
  engine: { kE: RefJson; dE: RefJson; dP: RefJson };
  rcsScale: RefJson;
  accelScale: RefJson;
  cameraBias: RefJson[];
  empirical?: { frameBody: string; bounds: Record<string, number[]> };
  profile?: { body: string; lnRNodes: number[]; g: number[]; rMin: number; rMax: number };
}

export interface CommandJson3 {
  t0: number;
  t1: number;
  u: number;
  q: number[];
  rcs?: number[];
}

export interface MeasurementJson3 {
  t: number;
  kind: 'opnav' | 'accel';
  target?: string;
  z: number[];
  sigma: (number | null)[];
  q?: number[];
}

export interface AttemptJson3 {
  id: string;
  epoch: number;
  duration: number;
  commands: CommandJson3[];
  measurements: MeasurementJson3[];
}

export interface EmpiricalRowJson3 {
  window: string;
  t0: number;
  t1: number;
  aR: number;
  sigmaR: number;
  aT: number;
  sigmaT: number;
  aN: number;
  sigmaN: number;
  tidalAtMidT?: number;
  tidalAtMidN?: number;
}

export interface FitJson3 {
  id: string;
  description: string;
  compare: 'numeric' | 'qualitative';
  attempts: string[];
  model: ModelJson3;
  parameters: FitJson['parameters'];
  expected: ExpectedFit;
  heldOut?: HeldOutJson;
  adoption?: FitJson['adoption'];
  solver?: { arcGrowing?: boolean };
  dataSubset?: string;
  table?: EmpiricalRowJson3[];
  [extra: string]: unknown;
}

export interface WindowJson3 extends WindowJson {
  sweep: number;
  direction: number[];
  planeNormal: number[];
}

export interface ReferenceJson3 {
  r0: number;
  mu: number;
  n: number;
  /** The z component, or [x, y, z]. */
  cam: number | number[];
  kE?: number;
  dE?: number;
  dP?: number;
}

export interface TierLJson3 {
  reference: ReferenceJson3;
  windows: WindowJson3[];
  noiseScale: number;
  profile: ProfileJson;
}

export type SigmaParts3 = Record<
  'state' | 'profile' | 'hedge' | 'hedgeEarned' | 'hedgeDefault' | 'engine' | 'total',
  number
>;

export interface ForecastPointJson3 {
  t: number;
  mean: number[];
  rangePredicted: number;
  insideCoverage: boolean;
  insideValidated?: boolean;
  sigmaMajor: Partial<SigmaParts3> & { total: number };
  covTotal: number[];
  withinHorizon: boolean;
  majorAxis?: number[];
  sigmaOutOfPlane?: number;
  sigmaInPlaneMajor?: number;
  majorAxisToNormalDeg?: number;
  /** Truth (checking only). */
  truth?: number[];
  [extra: string]: unknown;
}

export interface AnchorJson3 {
  windows: string[];
  tNow: number;
  state: number[];
  covariance: number[][];
  g: number;
  gSigma: number;
  g1: number;
  g1Sigma: number;
}

export interface CaseJson3 {
  id: string;
  attempts: AttemptJson3[];
  attemptsFrom?: string;
  truth: { values: Record<string, number>; [extra: string]: unknown };
  fits: FitJson3[];
  tierL?: TierLJson3;
  training?: string[];
  heldOut?: string;
  [extra: string]: unknown;
}

export interface VectorJson3 {
  id: string;
  cases: CaseJson3[];
  checks: { id: string; claim: string; value: unknown; pass: boolean }[];
}

export const quatOf = (q: readonly number[]): quat.Quat => ({
  w: q[0]!,
  x: q[1]!,
  y: q[2]!,
  z: q[3]!,
});

export function toStructure3(m: ModelJson3): Structure {
  const bodies: BodyDef[] = m.bodies.map((b) => ({
    id: b.id,
    mu: refOf(b.mu),
    state: b.state === 'gauge' ? 'gauge' : (b.state.map(refOf) as unknown as Refs6),
    gs: refOf(b.localScale),
  }));
  return {
    r0: m.law.r0,
    n: refOf(m.law.exponent),
    bodies,
    ship: m.ship.map(refOf) as unknown as Refs6,
    dynamicBodies: m.dynamicBodies,
    engine: { kE: refOf(m.engine.kE), dE: refOf(m.engine.dE), dP: refOf(m.engine.dP) },
    kR: refOf(m.rcsScale),
    kA: refOf(m.accelScale),
    camBias: m.cameraBias.map(refOf) as unknown as Refs3,
    ...(m.empirical ? { emp: { ref: m.empirical.frameBody, bounds: m.empirical.bounds } } : {}),
    ...(m.profile
      ? {
          profiles: [
            {
              body: m.profile.body,
              uNodes: m.profile.lnRNodes,
              gNodes: m.profile.g,
              rMin: m.profile.rMin,
              rMax: m.profile.rMax,
            },
          ],
        }
      : {}),
  };
}

export const toCommand3 = (c: CommandJson3): ThrustSegment => ({
  t0: c.t0,
  t1: c.t1,
  u: c.u,
  q: quatOf(c.q),
  ...(c.rcs ? { rcs: [c.rcs[0]!, c.rcs[1]!, c.rcs[2]!] as const } : {}),
});

export function toArc3(a: AttemptJson3, keep?: (m: MeasurementJson3) => boolean): Arc {
  const meas: EstMeasurement[] = a.measurements
    .filter((m) => keep?.(m) ?? true)
    .map((m) =>
      m.kind === 'opnav'
        ? {
            kind: 'opnav',
            t: m.t,
            target: m.target!,
            z: m.z,
            sigma: m.sigma,
            ...(m.q ? { q: quatOf(m.q) } : {}),
          }
        : { kind: 'accel', t: m.t, z: m.z, sigma: m.sigma },
    );
  return { id: a.id, epoch: a.epoch, commands: a.commands.map(toCommand3), meas };
}

/** Finite-difference / conditioning scales of the 3D reference (spec §3.6). */
export function referenceScale3(name: string): number {
  const parts = name.split('.');
  const leaf = parts[parts.length - 1]!;
  if (name === 'mu.A') return 1e7;
  if (name === 'mu.B') return 2.5e6;
  if (name === 'law.n') return 1e-3;
  if (/^engine\.(kE|dE|dP)$/.test(name) || ['dkE', 'ddE', 'ddP'].includes(leaf)) return 1e-3;
  if (name === 'rcs.kR' || leaf === 'dkR') return 1e-3;
  if (name === 'accel.kA' || leaf === 'dkA') return 1e-4;
  if (/^camera\.bias\.(x|y|z)$/.test(name) || parts.includes('dbias')) return 1e-5;
  if (['R', 'T', 'N'].includes(leaf) && /^emp\d+$/.test(parts[parts.length - 2]!)) return 1e-6;
  if (leaf === 'g') return 1e-3;
  if (['x', 'y', 'z'].includes(leaf)) return 1e3;
  if (['vx', 'vy', 'vz'].includes(leaf)) return parts[parts.length - 2] === 'ship' ? 1 : 0.1;
  throw new Error(`no reference scale for ${name}`);
}

export function toParams3(fit: FitJson3, init?: Readonly<Record<string, number>>): Param[] {
  return fit.parameters.map((p) => ({
    name: p.name,
    init: init?.[p.name] ?? p.init,
    scale: referenceScale3(p.name),
    group: p.group,
    ...(p.prior ? { priorMean: p.prior.mean, priorSigma: p.prior.sigma } : {}),
  }));
}

// ---------------------------------------------------------------------------------------------
// Vectors as Black Box records (for the game-facing layer)
// ---------------------------------------------------------------------------------------------

/** Test ship: one camera, one accelerometer, one thruster along +x; constant mass (no flow). */
/** A test ship for the planar vectors' records: every position at z = 0, a flat hull. */
export function testShip(mass: number, thrust: number): ShipDefinition {
  const base = {
    mass: 0,
    position: { x: 0, y: 0, z: 0 },
    ratedPower: 0,
    modes: ['on'],
    defaultMode: 'on',
    sheddable: false,
  } as const;
  return {
    id: 'test-ship',
    name: 'Test ship',
    structureMass: mass,
    structureCenterOfMass: { x: 0, y: 0, z: 0 },
    structureInertia: isotropicInertia(1e5),
    equipment: [
      { ...base, id: 'cam', kind: 'optical-tracker', name: 'Nav camera', params: {} },
      { ...base, id: 'imu', kind: 'accelerometer', name: 'IMU', params: {} },
      { ...base, id: 'st', kind: 'star-tracker', name: 'Star tracker', params: {} },
      {
        ...base,
        id: 'main',
        kind: 'main-engine',
        name: 'Engine',
        mount: { position: { x: -5, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
        params: { thrust, isp: 0 },
      },
    ],
    tanks: [],
    buses: [],
    thermalNodes: [],
    configurations: [
      {
        id: 'stowed',
        name: 'Stowed',
        hull: prismHull(
          [
            { x: -5, y: -2 },
            { x: 5, y: -2 },
            { x: 5, y: 2 },
            { x: -5, y: 2 },
          ],
          0,
          0,
        ),
        transitionTime: 0,
      },
    ],
    defaultConfiguration: 'stowed',
  };
}

/**
 * A planar vector attempt as an AttemptRecord: optical fixes become separate bearing and range
 * measurements (as 2B emits them), thrust segments become executed burn commands of `thruster`
 * at throttle u·mass/thrust, with a star-tracker attitude measurement at each segment's start and
 * end (the vector's attitude holds over the segment). The vectors are planar, so the records have
 * nothing out of the plane: elevation 0, accelerometer z 0, attitude a rotation about +z, every
 * z = 0. Run them with `settings.planar = 1` (spec Appendix A.3).
 */
export function recordFromAttempt(
  a: AttemptJson,
  index: number,
  opts: {
    encounterId: string;
    mass: number;
    thrust: number;
    thruster?: string;
    target?: (t: string) => string;
  },
): AttemptRecord {
  const thr = opts.thruster ?? 'main';
  const tgt = opts.target ?? ((t: string) => t);
  const measurements: Measurement[] = [];
  // Stable sort: at a boundary the segment that ends comes before the one that starts.
  const pendingAtt = a.commands
    .flatMap((c) => [[c.t0, c.theta] as const, [c.t1, c.theta] as const])
    .map((q, i) => [q, i] as const)
    .sort((x, y) => x[0][0] - y[0][0] || x[1] - y[1])
    .map((q) => q[0]);
  let ai = 0;
  const flushAtt = (t: number) => {
    while (ai < pendingAtt.length && pendingAtt[ai]![0] <= t) {
      const [ta, v] = pendingAtt[ai++]!;
      measurements.push({
        kind: 'attitude',
        t: ta,
        source: 'st',
        value: [0, 0, v],
        sigma: [3.88e-5, 3.88e-5, 3.88e-5],
      });
    }
  };
  for (const m of a.measurements) {
    flushAtt(m.t);
    if (m.kind === 'opnav') {
      measurements.push({
        kind: 'bearing',
        t: m.t,
        source: 'cam',
        target: tgt(m.target!),
        value: [m.z[0]!, 0],
        sigma: [m.sigma[0]!, m.sigma[0]!],
      });
      if (m.z.length > 1)
        measurements.push({
          kind: 'range',
          t: m.t,
          source: 'cam',
          target: tgt(m.target!),
          value: [m.z[1]!],
          sigma: [m.sigma[1]!],
        });
    } else
      measurements.push({
        kind: 'accel',
        t: m.t,
        source: 'imu',
        value: [m.z[0]!, m.z[1]!, 0],
        sigma: [m.sigma[0]!, m.sigma[1]!, m.sigma[0]!],
      });
  }
  flushAtt(Infinity);
  measurements.sort((x, y) => x.t - y.t);
  const executed: ExecutedCommand[] = a.commands.map((c) => ({
    t: c.t0,
    command: {
      kind: 'burn',
      thruster: thr,
      throttle: (c.u * opts.mass) / opts.thrust,
      duration: c.t1 - c.t0,
    },
    source: 'plan',
    status: 'executed',
  }));
  const end = Math.max(a.duration, ...a.measurements.map((m) => m.t));
  return {
    id: a.id,
    index,
    encounterId: opts.encounterId,
    startedAt: '2026-11-14T12:00:00Z',
    start: {
      estimate: {
        t: 0,
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        positionCov: cov3FromPlanar([1e8, 0, 1e8]),
        velocityCov: cov3FromPlanar([100, 0, 100]),
        attitude: quat.fromYaw(0),
        attitudeSigma: 1e-3,
        angularVelocity: { x: 0, y: 0, z: 0 },
      },
      configuration: 'stowed',
      modelVersion: 0,
    },
    plans: [],
    executed,
    forecasts: [],
    measurements,
    events: [],
    outcome: { kind: 'recalled', t: end },
    modelVersionAtEnd: 0,
  };
}
