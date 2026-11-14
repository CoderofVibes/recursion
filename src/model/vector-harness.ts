/**
 * Test support: read 1G's estimator vectors (tests/vectors/estimator/) into estimator inputs.
 *
 * Only the inputs reach the estimator: attempts (measurements, commands), the model structure
 * and the parameter list. Each vector's `truth` block is read by the tests for checking claims
 * and is never passed to estimator code (1G, P11).
 */

import type { AttemptRecord, Measurement, ShipDefinition, ExecutedCommand } from '../contracts/index.ts';
import type { Arc, BodyDef, EstMeasurement, Ref, Structure, ThrustSegment } from './dynamics.ts';
import type { Param } from './solve.ts';

export type RefJson = number | { param: string };

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
  parameters: { name: string; group: string; init: number; prior: { mean: number; sigma: number } | null }[];
  expected: ExpectedFit;
  heldOut?: HeldOutJson;
  adoption?: { deltaCost: number; penalty: number; adopt: boolean; evidence?: boolean; heldOutPass?: boolean };
  earnedHedge?: { trainingCoverage: [number, number]; nWindowsOutside: number; delta?: number; ell?: number; sigmaH: number };
  table?: { window: string; t0: number; t1: number; aR: number; sigmaR: number; aT: number; sigmaT: number; tidalAtMidT?: number }[];
  signature?: { maxAbsTangentialZ: number; maxAbsTangentialOverG0: number };
  confounding?: { maxAbsRho: number; pairs: { gravity: string; propulsion: string; rho: number }[]; posteriorOverPrior: Record<string, number> };
  theory?: { muLocal: number };
}

export interface AttemptJson {
  id: string;
  epoch: number;
  duration: number;
  commands: { t0: number; t1: number; u: number; theta: number }[];
  measurements: { t: number; kind: 'opnav' | 'accel'; target?: string; z: number[]; sigma: number[] }[];
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
  forecastInputs?: { reference: TierLJson['reference']; engineSigma: { kE: number; dE: number }; sigmaH: number; horizonFraction: number; noiseScale: number; anchorWindows: number };
  anchor?: { windows: string[]; tNow: number; state: number[]; covariance: number[][]; g: number; gSigma: number; g1: number; g1Sigma: number };
  forecasts?: { plan: string; points: ForecastPointJson[] }[];
}

export interface VectorJson {
  id: string;
  cases: CaseJson[];
  checks: { id: string; claim: string; value: unknown; pass: boolean }[];
}

export function refOf(r: RefJson): Ref {
  return typeof r === 'number' ? r : r.param;
}

export function toStructure(m: ModelJson): Structure {
  const bodies: BodyDef[] = m.bodies.map((b) => ({
    id: b.id,
    mu: refOf(b.mu),
    state: b.state === 'gauge' ? 'gauge' : (b.state.map(refOf) as unknown as readonly [Ref, Ref, Ref, Ref]),
    gs: refOf(b.localScale),
  }));
  return {
    r0: m.law.r0,
    n: refOf(m.law.exponent),
    bodies,
    ship: m.ship.map(refOf) as unknown as readonly [Ref, Ref, Ref, Ref],
    dynamicBodies: m.dynamicBodies,
    engine: { kE: refOf(m.engine.kE), dE: refOf(m.engine.dE) },
    kA: refOf(m.accelScale),
    camBias: refOf(m.cameraBias),
  };
}

export function toArc(a: AttemptJson): Arc {
  const commands: ThrustSegment[] = a.commands.map((c) => ({ t0: c.t0, t1: c.t1, u: c.u, theta: c.theta }));
  const meas: EstMeasurement[] = a.measurements.map((m) =>
    m.kind === 'opnav'
      ? { kind: 'opnav', t: m.t, target: m.target!, z: m.z, sigma: m.sigma }
      : { kind: 'accel', t: m.t, z: m.z, sigma: m.sigma },
  );
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
// Vectors as Black Box records (for the game-facing layer)
// ---------------------------------------------------------------------------------------------


/** Test ship: one camera, one accelerometer, one thruster along +x; constant mass (no flow). */
export function testShip(mass: number, thrust: number): ShipDefinition {
  const base = { mass: 0, position: { x: 0, y: 0 }, ratedPower: 0, modes: ['on'], defaultMode: 'on', sheddable: false } as const;
  return {
    id: 'test-ship',
    name: 'Test ship',
    structureMass: mass,
    structureCenterOfMass: { x: 0, y: 0 },
    structureInertia: 1e5,
    equipment: [
      { ...base, id: 'cam', kind: 'optical-tracker', name: 'Nav camera', params: {} },
      { ...base, id: 'imu', kind: 'accelerometer', name: 'IMU', params: {} },
      { ...base, id: 'st', kind: 'star-tracker', name: 'Star tracker', params: {} },
      {
        ...base,
        id: 'main',
        kind: 'main-engine',
        name: 'Engine',
        mount: { position: { x: -5, y: 0 }, direction: { x: 1, y: 0 } },
        params: { thrust, isp: 0 },
      },
    ],
    tanks: [],
    buses: [],
    thermalNodes: [],
    configurations: [{ id: 'stowed', name: 'Stowed', footprint: [{ x: -5, y: -2 }, { x: 5, y: -2 }, { x: 5, y: 2 }, { x: -5, y: 2 }], transitionTime: 0 }],
    defaultConfiguration: 'stowed',
  };
}

/**
 * A vector attempt as an AttemptRecord: optical fixes become separate bearing and range
 * measurements (as 2B emits them), thrust segments become executed burn commands of `thruster`
 * at throttle u·mass/thrust with a star-tracker attitude measurement at each segment start.
 */
export function recordFromAttempt(
  a: AttemptJson,
  index: number,
  opts: { encounterId: string; mass: number; thrust: number; thruster?: string; target?: (t: string) => string },
): AttemptRecord {
  const thr = opts.thruster ?? 'main';
  const tgt = opts.target ?? ((t: string) => t);
  const measurements: Measurement[] = [];
  const atts = new Map<number, number>();
  for (const c of a.commands) atts.set(c.t0, c.theta);
  const pendingAtt = [...atts.entries()].sort((x, y) => x[0] - y[0]);
  let ai = 0;
  const flushAtt = (t: number) => {
    while (ai < pendingAtt.length && pendingAtt[ai]![0] <= t) {
      const [ta, v] = pendingAtt[ai++]!;
      measurements.push({ kind: 'attitude', t: ta, source: 'st', value: [v], sigma: [3.88e-5] });
    }
  };
  for (const m of a.measurements) {
    flushAtt(m.t);
    if (m.kind === 'opnav') {
      measurements.push({ kind: 'bearing', t: m.t, source: 'cam', target: tgt(m.target!), value: [m.z[0]!], sigma: [m.sigma[0]!] });
      if (m.z.length > 1)
        measurements.push({ kind: 'range', t: m.t, source: 'cam', target: tgt(m.target!), value: [m.z[1]!], sigma: [m.sigma[1]!] });
    } else measurements.push({ kind: 'accel', t: m.t, source: 'imu', value: [...m.z], sigma: [...m.sigma] });
  }
  flushAtt(Infinity);
  measurements.sort((x, y) => x.t - y.t);
  const executed: ExecutedCommand[] = a.commands.map((c) => ({
    t: c.t0,
    command: { kind: 'burn', thruster: thr, throttle: (c.u * opts.mass) / opts.thrust, duration: c.t1 - c.t0 },
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
      estimate: { t: 0, position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, positionCov: [1e8, 0, 1e8], velocityCov: [100, 0, 100], attitude: 0, attitudeSigma: 1e-3, angularRate: 0 },
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
