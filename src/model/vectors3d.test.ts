/**
 * 1G estimator vectors, the 3D set (tests/vectors/estimator-3d/, spec revision 3): every fit is
 * rebuilt from the vector's inputs by this implementation, numeric fits are compared within the
 * vectors' tolerances, Tier L, the present state and the forecast points are compared with the
 * reference, and all 104 physical claims are re-evaluated from this implementation's results.
 *
 * Truth (the `truth` blocks and the truth columns of forecast points) is read here only to
 * evaluate claims. It never reaches estimator code (P11).
 */

import { describe, expect, it } from 'vitest';
import rawCarried from '../../tests/vectors/estimator-3d/carried-rule-other-plane.json?raw';
import rawForecast from '../../tests/vectors/estimator-3d/forecast-envelope-3d.json?raw';
import rawInclined from '../../tests/vectors/estimator-3d/inclined-newton-recovers-gm.json?raw';
import rawPlanes from '../../tests/vectors/estimator-3d/inv25-exponent-planes.json?raw';
import rawTwo from '../../tests/vectors/estimator-3d/inv25-two-planes.json?raw';
import rawBody from '../../tests/vectors/estimator-3d/offplane-body-signature.json?raw';
import rawRotation from '../../tests/vectors/estimator-3d/rotation-invariance.json?raw';
import rawThrust from '../../tests/vectors/estimator-3d/thrust-3d-confounded.json?raw';
import rawPlanarForecast from '../../tests/vectors/estimator/forecast-envelope.json?raw';
import rawPlanarNewton from '../../tests/vectors/estimator/newton-recovers-gm.json?raw';
import * as quat from '../lib/quat.ts';
import { empiricalFit, gmSlope } from './diagnostics.ts';
import { STATE_KEYS, type Arc, type ThrustSegment } from './dynamics.ts';
import { fromRows, matMul, pick, symEig, transpose, zeros, type Matrix } from './linalg.ts';
import {
  confounding,
  evidence,
  fitChi2Nu,
  fitCorr,
  fitGet,
  fitIndex,
  fitNu,
  heldOutConsistency,
  multipleCorrelation,
  residualSummary,
  stagedFit,
  type FitResult,
  type Param,
} from './solve.ts';
import {
  anchorState,
  buildProfile,
  earnedHedge,
  forecastCore,
  guessBody,
  guessShip,
  localFits,
  mahalanobis,
  majorAxis,
  majorSigma,
  makeWindows,
  noiseScale,
  rangeFixes,
  type Anchor,
  type CovSplit,
  type ProfileFit,
  type ReferenceLaw,
  type WindowFit,
} from './tierL.ts';
import {
  quatOf,
  toArc3,
  toCommand3,
  toParams3,
  toStructure3,
  type AnchorJson3,
  type CaseJson,
  type CaseJson3,
  type CommandJson3,
  type ExpectedFit,
  type FitJson3,
  type ForecastPointJson3,
  type ReferenceJson3,
  type SigmaParts3,
  type TierLJson3,
  type VectorJson,
  type VectorJson3,
} from './vector-harness.ts';

const DT = 60;
const OPTS = { dt: DT, h: 1e-3 };
const R0 = 1e6;
const MU_A = 1e10;
/** "3σ" for several numbers at once: √ of the 99.73% point of χ² with 6, 3 and 2 degrees. */
const CHI_6 = 4.479;
const CHI_3 = 3.763;
const CHI_2 = 3.439;
/** Arrival priors of the reference (assumptions.json, assumptions-3d.json). */
const PRIOR = {
  muA: 3e8,
  cam: 1e-4,
  kE: 0.05,
  dE: 0.01,
  dP: 0.01,
  kR: 0.1,
  sigmaH: 0.3,
};
const V = (raw: string) => JSON.parse(raw) as VectorJson3;

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

/** Claims evaluated by this implementation: vector → claim id → pass. */
const claims = new Map<string, Map<string, boolean>>();
function claim(vector: string, id: string, ok: boolean) {
  if (!claims.has(vector)) claims.set(vector, new Map());
  claims.get(vector)!.set(id, ok);
}
const allHold = (vector: string) => {
  for (const [id, ok] of claims.get(vector)!) expect(ok, `${vector}/${id}`).toBe(true);
};

const band = (nu: number, k = 3) => [1 - k * Math.sqrt(2 / nu), 1 + k * Math.sqrt(2 / nu)] as const;
const inBand = (f: FitResult) => {
  const [lo, hi] = band(fitNu(f));
  const c = fitChi2Nu(f);
  return c >= lo && c <= hi;
};

type V3 = readonly number[];
const dot = (a: V3, b: V3) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const cross = (a: V3, b: V3) => [
  a[1]! * b[2]! - a[2]! * b[1]!,
  a[2]! * b[0]! - a[0]! * b[2]!,
  a[0]! * b[1]! - a[1]! * b[0]!,
];
const norm = (a: V3) => Math.sqrt(dot(a, a));
const unit = (a: V3) => a.map((v) => v / norm(a));
const sub = (a: V3, b: V3) => a.map((v, i) => v - b[i]!);
const angle = (a: V3, b: V3) => Math.atan2(norm(cross(unit(a), unit(b))), dot(unit(a), unit(b)));
const deg = (r: number) => (r * 180) / Math.PI;
const mulMV = (m: readonly (readonly number[])[], v: V3) => m.map((row) => dot(row, v));
const mulMtV = (m: readonly (readonly number[])[], v: V3) =>
  [0, 1, 2].map((c) => m[0]![c]! * v[0]! + m[1]![c]! * v[1]! + m[2]![c]! * v[2]!);
const orbitNormal = (s: V3) => unit(cross(s.slice(0, 3), s.slice(3, 6)));

function arcsOf(c: CaseJson3): Map<string, Arc> {
  return new Map(c.attempts.map((a) => [a.id, toArc3(a)]));
}

/** Initial values per §4.5 from this implementation; everything else keeps the vector's. */
function myInit(fit: FitJson3, arcs: ReadonlyMap<string, Arc>): Record<string, number> {
  const out: Record<string, number> = {};
  const keys: readonly string[] = STATE_KEYS;
  for (const p of fit.parameters) {
    const ship = /^(.+)\.ship\.(x|y|z|vx|vy|vz)$/.exec(p.name);
    const body = /^(.+)\.B\.(x|y|z|vx|vy|vz)$/.exec(p.name);
    if (ship) out[p.name] = guessShip(arcs.get(ship[1]!)!, 'A', 0)[keys.indexOf(ship[2]!)]!;
    else if (body && rangeFixes(arcs.get(body[1]!)!, 'B').length >= 2)
      out[p.name] = guessBody(arcs.get(body[1]!)!, 'A', 'B', 0)[keys.indexOf(body[2]!)]!;
    else out[p.name] = p.init;
  }
  return out;
}

function runFit(fit: FitJson3, arcs: ReadonlyMap<string, Arc>, x0?: Record<string, number>) {
  const st = toStructure3(fit.model);
  const params = toParams3(fit, x0 ?? myInit(fit, arcs));
  const res = stagedFit(
    st,
    fit.attempts.map((a) => arcs.get(a)!),
    params,
    OPTS,
    undefined,
    fit.solver?.arcGrowing === false ? [1] : [0.25, 0.5, 1],
  );
  return { st, params, res };
}

/** Worst agreement with the reference over every numeric fit compared (DECISIONS D7). */
const worst = {
  fits: 0,
  estimateOverSigma: 0,
  sigmaRelative: 0,
  chi2Relative: 0,
  correlation: 0,
  where: '',
};
const forecastWorst = { mean: 0, cov: 0, window: 0, profile: 0, anchor: 0 };

/** Numeric comparison within the vectors' stated tolerance. Returns failures. */
function compareFit(f: FitResult, e: ExpectedFit, label = ''): string[] {
  const bad: string[] = [];
  worst.fits++;
  for (const [name, ref] of Object.entries(e.estimate)) {
    const [x, s] = fitGet(f, name);
    const sr = e.sigma[name]!;
    const dx = Math.abs(x - ref) / sr;
    if (dx > worst.estimateOverSigma) {
      worst.estimateOverSigma = dx;
      worst.where = `${label} ${name}`;
    }
    worst.sigmaRelative = Math.max(worst.sigmaRelative, Math.abs(s / sr - 1));
    if (dx > 0.05) bad.push(`${name}: ${x} vs ${ref} (${((x - ref) / sr).toFixed(3)} σ)`);
    if (Math.abs(s / sr - 1) > 0.05) bad.push(`${name} σ: ${s} vs ${sr}`);
  }
  worst.chi2Relative = Math.max(worst.chi2Relative, Math.abs(f.chi2 / e.chi2 - 1));
  if (Math.abs(f.chi2 / e.chi2 - 1) > 0.02) bad.push(`chi2 ${f.chi2} vs ${e.chi2}`);
  if (f.m !== e.m) bad.push(`m ${f.m} vs ${e.m}`);
  if (Math.abs(f.pEff - e.pEff) > 0.01) bad.push(`pEff ${f.pEff} vs ${e.pEff}`);
  const names = e.correlation.names;
  names.forEach((a, i) =>
    names.forEach((b, j) => {
      if (j <= i) return;
      const rho = fitCorr(f, a, b);
      const ref = e.correlation.matrix[i]![j]!;
      worst.correlation = Math.max(worst.correlation, Math.abs(rho - ref));
      if (Math.abs(rho - ref) > 0.02) bad.push(`rho(${a},${b}) ${rho} vs ${ref}`);
    }),
  );
  if (f.converged !== e.converged) bad.push(`converged ${f.converged} vs ${e.converged}`);
  // §9.1: the residuals by direction (along, normal, range, accel), coasting and powered.
  const mine = residualSummary(f);
  for (const [key, ref] of Object.entries(e.residualSummary)) {
    const got = mine[key];
    if (!got || got.n !== ref.n) bad.push(`residuals ${key}: n ${got?.n} vs ${ref.n}`);
    else if (Math.abs(got.rms - ref.rms) > 1e-3 * Math.max(ref.rms, 1))
      bad.push(`residuals ${key}: rms ${got.rms} vs ${ref.rms}`);
  }
  for (const key of Object.keys(mine))
    if (!(key in e.residualSummary)) bad.push(`residuals ${key}: not in the reference`);
  return bad;
}

function compareGuesses(fit: FitJson3, arcs: ReadonlyMap<string, Arc>): string[] {
  const mine = myInit(fit, arcs);
  return fit.parameters
    .filter((p) => Math.abs(mine[p.name]! - p.init) > 1e-6 * Math.max(1, Math.abs(p.init)))
    .map((p) => `${p.name}: ${mine[p.name]} vs ${p.init}`);
}

/** Estimate and 6×6 covariance of one six-number state of a fit. */
function stateBlock(f: FitResult, att: string, who = 'ship') {
  const ii = STATE_KEYS.map((k) => fitIndex(f, `${att}.${who}.${k}`));
  return { x: ii.map((i) => f.x[i]!), P: pick(f.P, ii) };
}

const truthState = (c: CaseJson3, att: string, who = 'ship') =>
  STATE_KEYS.map((k) => c.truth.values[`${att}.${who}.${k}`]!);

/** Angle between the fitted and true orbit normals, its 1σ size and its 2-number distance. */
function normalCheck(f: FitResult, att: string, truth: V3) {
  const { x, P } = stateBlock(f, att);
  const nFit = orbitNormal(x);
  const nTrue = orbitNormal(truth);
  const J = zeros(3, 6);
  for (let i = 0; i < 6; i++) {
    const h = 1e-3 * (i < 3 ? 1e3 : 1);
    const xp = [...x];
    const xm = [...x];
    xp[i]! += h;
    xm[i]! -= h;
    const np = orbitNormal(xp);
    const nm = orbitNormal(xm);
    for (let r = 0; r < 3; r++) J.data[r * 6 + i] = (np[r]! - nm[r]!) / (2 * h);
  }
  const C = matMul(matMul(J, P), transpose(J));
  const { values, vectors } = symEig(C);
  const d = sub(nFit, nTrue);
  let s = 0;
  for (let k = 0; k < 3; k++) {
    if (!(values[k]! > 1e-9 * values[2]!)) continue;
    let y = 0;
    for (let r = 0; r < 3; r++) y += vectors.data[r * 3 + k]! * d[r]!;
    s += (y * y) / values[k]!;
  }
  return {
    angle: angle(nFit, nTrue),
    sigma: Math.sqrt(values[2]!),
    mahalanobis: Math.sqrt(s),
    normalFitted: nFit,
  };
}

const refLaw = (r: ReferenceJson3): ReferenceLaw => ({
  r0: r.r0,
  body: 'A',
  mu: r.mu,
  n: r.n,
  cam: typeof r.cam === 'number' ? [0, 0, r.cam] : [r.cam[0]!, r.cam[1]!, r.cam[2]!],
  kE: r.kE ?? 1,
  dE: r.dE ?? 0,
  dP: r.dP ?? 0,
});

function tierL(ref: ReferenceLaw, arcs: readonly Arc[]) {
  const rows = localFits(ref, arcs, DT, { gSigma: 0.5 });
  const profile = buildProfile(rows, R0, 'A');
  return { rows, profile, s2: noiseScale(rows) };
}

function compareTierL(
  rows: readonly WindowFit[],
  prof: ProfileFit,
  s2: number,
  tl: TierLJson3,
): string[] {
  const bad: string[] = [];
  if (rows.length !== tl.windows.length)
    return [`window count ${rows.length} vs ${tl.windows.length}`];
  rows.forEach((r, i) => {
    const w = tl.windows[i]!;
    if (r.window !== w.window || r.t0 !== w.t0 || r.t1 !== w.t1 || r.nFixes !== w.nFixes)
      bad.push(
        `window ${w.window}: boundaries ${r.window} ${r.t0}-${r.t1}/${r.nFixes} vs ${w.t0}-${w.t1}/${w.nFixes}`,
      );
    forecastWorst.window = Math.max(forecastWorst.window, Math.abs(r.g - w.g) / w.sigma);
    if (Math.abs(r.g - w.g) > 0.05 * w.sigma) bad.push(`window ${w.window}: g ${r.g} vs ${w.g}`);
    if (Math.abs(r.sigma / w.sigma - 1) > 0.05)
      bad.push(`window ${w.window}: σ ${r.sigma} vs ${w.sigma}`);
    if (Math.abs(r.sweep - w.sweep) > 1e-9) bad.push(`window ${w.window}: sweep ${r.sweep}`);
    if (norm(sub(r.direction, w.direction)) > 1e-9) bad.push(`window ${w.window}: direction`);
    if (norm(sub(r.planeNormal, w.planeNormal)) > 1e-9) bad.push(`window ${w.window}: normal`);
  });
  const p = tl.profile;
  if (prof.g.length !== p.g.length) bad.push(`profile nodes ${prof.g.length} vs ${p.g.length}`);
  prof.g.forEach((g, b) => {
    forecastWorst.profile = Math.max(forecastWorst.profile, Math.abs(g - p.g[b]!) / p.sigma[b]!);
    if (Math.abs(g - p.g[b]!) > 0.1 * p.sigma[b]!) bad.push(`profile node ${b}: ${g} vs ${p.g[b]}`);
    if (Math.abs(prof.sigma[b]! / p.sigma[b]! - 1) > 0.05)
      bad.push(`profile σ ${b}: ${prof.sigma[b]} vs ${p.sigma[b]}`);
  });
  if (Math.abs(prof.inflation / p.inflation - 1) > 0.05)
    bad.push(`inflation ${prof.inflation} vs ${p.inflation}`);
  if (Math.abs(s2 / tl.noiseScale - 1) > 0.02) bad.push(`noise scale ${s2} vs ${tl.noiseScale}`);
  return bad;
}

function compareAnchor(anc: Anchor, ra: AnchorJson3): string[] {
  const bad: string[] = [];
  if (JSON.stringify(anc.info.windows) !== JSON.stringify(ra.windows)) bad.push('anchor windows');
  if (anc.tNow !== ra.tNow) bad.push(`tNow ${anc.tNow} vs ${ra.tNow}`);
  const C = fromRows(ra.covariance);
  for (let i = 0; i < 6; i++) {
    const s = Math.sqrt(C.data[i * 6 + i]!);
    forecastWorst.anchor = Math.max(
      forecastWorst.anchor,
      Math.abs(anc.state[i]! - ra.state[i]!) / s,
    );
    if (Math.abs(anc.state[i]! - ra.state[i]!) > 0.05 * s)
      bad.push(`state ${i}: ${anc.state[i]} vs ${ra.state[i]}`);
    if (Math.abs(Math.sqrt(anc.covariance.data[i * 6 + i]!) / s - 1) > 0.05)
      bad.push(`state σ ${i}: ${Math.sqrt(anc.covariance.data[i * 6 + i]!)} vs ${s}`);
  }
  if (Math.abs(anc.info.g - ra.g) > 0.05 * ra.gSigma) bad.push(`g ${anc.info.g} vs ${ra.g}`);
  if (Math.abs(anc.info.g1 - ra.g1) > 0.05 * ra.g1Sigma) bad.push(`g1 ${anc.info.g1} vs ${ra.g1}`);
  return bad;
}

const SOURCES = ['state', 'profile', 'hedge', 'hedgeEarned', 'hedgeDefault', 'engine', 'total'];

const sigmasOf = (cv: CovSplit): SigmaParts3 => ({
  state: majorSigma(cv.state),
  profile: majorSigma(cv.profile),
  hedge: majorSigma(cv.hedge),
  hedgeEarned: majorSigma(cv.hedgeEarned),
  hedgeDefault: majorSigma(cv.hedgeDefault),
  engine: majorSigma(cv.engine),
  total: majorSigma(cv.total),
});

/** [xx, xy, xz, yy, yz, zz] of a 3×3. */
const cov6 = (m: Matrix) => [0, 1, 2, 4, 5, 8].map((k) => m.data[k]!);

interface MyPoint {
  readonly t: number;
  readonly mean: Float64Array;
  readonly cov: CovSplit;
  readonly sig: SigmaParts3;
  readonly r: number;
  readonly inside: boolean;
  readonly within: boolean;
}

/** A forecast over checkpoints with the horizon rule of §8.4 applied in order. */
function forecastPoints(
  inp: Parameters<typeof forecastCore>[0],
  horizonFraction: number,
  coverage: { rMin: number; rMax: number },
): MyPoint[] {
  const fc = forecastCore(inp);
  let within = true;
  return inp.times.map((t, i) => {
    const mean = fc.mean[i]!;
    const cov = fc.cov[i]!;
    const sig = sigmasOf(cov);
    const r = Math.hypot(mean[0]!, mean[1]!, mean[2]!);
    within = within && sig.total <= horizonFraction * r;
    return { t, mean, cov, sig, r, inside: coverage.rMin <= r && r <= coverage.rMax, within };
  });
}

/** Forecast points against the reference inside its horizon (tolerances of Appendix A.2). */
function compareForecast(points: readonly MyPoint[], ref: readonly ForecastPointJson3[]): string[] {
  const bad: string[] = [];
  points.forEach((p, i) => {
    const rp = ref[i]!;
    if (p.within !== rp.withinHorizon) bad.push(`t=${p.t}: within ${p.within}`);
    if (p.inside !== rp.insideCoverage) bad.push(`t=${p.t}: inside ${p.inside}`);
    if (!rp.withinHorizon) return;
    const total = rp.sigmaMajor.total;
    const off = norm(sub(Array.from(p.mean.slice(0, 3)), rp.mean)) / total;
    forecastWorst.mean = Math.max(forecastWorst.mean, off);
    if (off > 0.05) bad.push(`t=${p.t}: mean off by ${off} of the major sigma`);
    cov6(p.cov.total).forEach((v, k) => {
      const d = Math.abs(v - rp.covTotal[k]!) / (total * total);
      forecastWorst.cov = Math.max(forecastWorst.cov, d);
      if (d > 0.05) bad.push(`t=${p.t}: covTotal[${k}] ${v} vs ${rp.covTotal[k]}`);
    });
    for (const k of SOURCES as (keyof SigmaParts3)[]) {
      const b = rp.sigmaMajor[k];
      if (b === undefined) continue;
      if (!(Math.abs(p.sig[k] - b) <= Math.max(0.05 * b, 1)))
        bad.push(`t=${p.t}: ${k} ${p.sig[k]} vs ${b}`);
    }
  });
  return bad;
}

const fitById = (c: CaseJson3, id: string) => c.fits.find((f) => f.id === id)!;
const caseById = (v: VectorJson3, id: string) => v.cases.find((c) => c.id === id)!;

// ---------------------------------------------------------------------------------------------
// 1. rotation-invariance: the bridge between the planar regression and the 3D code
// ---------------------------------------------------------------------------------------------

describe('rotation-invariance', () => {
  const v = V(rawRotation);
  const TOL_R = { estimateOverSigma: 1e-3, sigmaRelative: 1e-3, chi2Relative: 1e-6 };
  const TOL_P = { estimateOverSigma: 1e-3, sigmaRelative: 1e-3, chi2InPlaneRelative: 1e-4 };
  type Rot = { quaternion: number[]; matrix: number[][] };

  // Tier G: flat, rotated, and rotated so that one fix sits on the +z pole.
  const modes = ['flat', 'rotated', 'pole'] as const;
  const G = Object.fromEntries(
    modes.map((mode) => {
      const c = caseById(v, `tier-g-${mode}`);
      const arcs = arcsOf(c);
      const j = c.fits[0]!;
      return [mode, { c, arcs, j, r: runFit(j, arcs), R: (c['rotation'] as Rot).matrix }];
    }),
  ) as Record<
    (typeof modes)[number],
    {
      c: CaseJson3;
      arcs: Map<string, Arc>;
      j: FitJson3;
      r: ReturnType<typeof runFit>;
      R: number[][];
    }
  >;
  const fL = G.flat.r.res;

  /** A rotated fit against the flat fit turned by the rotation, compared in the flat frame. */
  function compareRotated(fR: FitResult, R: number[][]) {
    const L = stateBlock(fL, 'att1');
    const Rb = stateBlock(fR, 'att1');
    const T = zeros(6, 6);
    for (let b = 0; b < 2; b++)
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 3; c++) T.data[(3 * b + r) * 6 + 3 * b + c] = R[r]![c]!;
    const Tt = transpose(T);
    const back = [0, 1, 2, 3, 4, 5].map((i) =>
      Rb.x.reduce((s, xv, k) => s + Tt.data[i * 6 + k]! * xv, 0),
    );
    const Pb = matMul(matMul(Tt, Rb.P), T);
    const sL = [0, 1, 2, 3, 4, 5].map((i) => Math.sqrt(L.P.data[i * 6 + i]!));
    const sB = [0, 1, 2, 3, 4, 5].map((i) => Math.sqrt(Pb.data[i * 6 + i]!));
    let dx = Math.max(...back.map((b, i) => Math.abs(b - L.x[i]!) / sL[i]!));
    let ds = Math.max(...sB.map((s, i) => Math.abs(s / sL[i]! - 1)));
    let dc = 0;
    for (let i = 0; i < 6; i++)
      for (let k = 0; k < 6; k++)
        dc = Math.max(
          dc,
          Math.abs(
            Pb.data[i * 6 + k]! / (sB[i]! * sB[k]!) - L.P.data[i * 6 + k]! / (sL[i]! * sL[k]!),
          ),
        );
    for (const nm of ['mu.A', 'camera.bias.x', 'camera.bias.y', 'camera.bias.z']) {
      dx = Math.max(dx, Math.abs(fitGet(fR, nm)[0] - fitGet(fL, nm)[0]) / fitGet(fL, nm)[1]);
      ds = Math.max(ds, Math.abs(fitGet(fR, nm)[1] / fitGet(fL, nm)[1] - 1));
    }
    return {
      estimateOverSigma: dx,
      sigmaRelative: ds,
      stateCorrelationAbs: dc,
      chi2Relative: Math.abs(fR.chi2 / fL.chi2 - 1),
      mEqual: fR.m === fL.m,
    };
  }

  // Forecast: flat and rotated.
  const fmodes = ['flat', 'rotated'] as const;
  type Plans = Record<string, { commands: CommandJson3[]; checkpoints: number[] }>;
  type Fin = {
    reference: ReferenceJson3;
    engineSigma: { kE: number; dE: number; dP: number };
    sigmaH: number;
    horizonFraction: number;
    anchorWindows: number;
  };
  const F = Object.fromEntries(
    fmodes.map((mode) => {
      const c = caseById(v, `forecast-${mode}`);
      const fi = c['forecastInputs'] as Fin;
      const ref = refLaw(fi.reference);
      const arcs = [...arcsOf(c).values()];
      const cur = arcs[arcs.length - 1]!;
      const tl = tierL(ref, arcs);
      const wins = makeWindows(cur, 'A')
        .filter((w) => !w.powered)
        .slice(-fi.anchorWindows);
      const anc = anchorState(ref, tl.profile, cur, wins, DT, {
        gPrior: [1, 0.5],
        slopeSigma: 0.2,
      });
      const plans = Object.entries(c['plans'] as Plans).map(([pid, p]) => ({
        pid,
        points: forecastPoints(
          {
            ref,
            profiles: [tl.profile],
            commands: p.commands.map(toCommand3),
            tNow: anc.tNow,
            xNow: anc.state,
            PNow: anc.covariance,
            times: p.checkpoints,
            dt: DT,
            s2: tl.s2,
            sigmaH: fi.sigmaH,
            engineSigma: [fi.engineSigma.kE, fi.engineSigma.dE, fi.engineSigma.dP],
          },
          fi.horizonFraction,
          tl.profile,
        ),
        refPoints: (c['forecasts'] as { plan: string; points: ForecastPointJson3[] }[]).find(
          (f) => f.plan === pid,
        )!.points,
      }));
      return [mode, { c, tl, anc, plans, R: (c['rotation'] as Rot).matrix }];
    }),
  ) as Record<
    (typeof fmodes)[number],
    {
      c: CaseJson3;
      tl: ReturnType<typeof tierL>;
      anc: Anchor;
      plans: { pid: string; points: MyPoint[]; refPoints: ForecastPointJson3[] }[];
      R: number[][];
    }
  >;

  it('initial guesses follow §4.5 in every frame', () => {
    for (const mode of modes) expect(compareGuesses(G[mode].j, G[mode].arcs), mode).toEqual([]);
  });

  it('Tier G fits match the reference: flat, rotated, and with a fix on the pole', () => {
    for (const mode of modes)
      expect(compareFit(G[mode].r.res, G[mode].j.expected, `rotation ${mode}`), mode).toEqual([]);
  });

  it('Tier L, the present state and the forecast match the reference, flat and rotated', () => {
    for (const mode of fmodes) {
      const f = F[mode];
      expect(compareTierL(f.tl.rows, f.tl.profile, f.tl.s2, f.c.tierL!), mode).toEqual([]);
      expect(compareAnchor(f.anc, f.c['anchor'] as AnchorJson3), mode).toEqual([]);
      for (const p of f.plans)
        expect(compareForecast(p.points, p.refPoints), `${mode} ${p.pid}`).toEqual([]);
    }
  });

  it('claims', () => {
    const elMax = (mode: (typeof modes)[number]) =>
      Math.max(...G[mode].c.attempts[0]!.measurements.map((m) => Math.abs(m.z[1]!)));
    claim(
      v.id,
      'rotation-is-out-of-plane',
      elMax('rotated') > (45 * Math.PI) / 180 && Math.PI / 2 - elMax('pole') < 1e-3,
    );
    for (const mode of ['rotated', 'pole'] as const) {
      const d = compareRotated(G[mode].r.res, G[mode].R);
      claim(
        v.id,
        `tier-g-${mode}-equals-flat`,
        d.estimateOverSigma <= TOL_R.estimateOverSigma &&
          d.sigmaRelative <= TOL_R.sigmaRelative &&
          d.chi2Relative <= TOL_R.chi2Relative &&
          d.mEqual,
      );
    }
    // The flat fit against the planar vector's expected values, read from the planar file.
    const pexp = (JSON.parse(rawPlanarNewton) as VectorJson).cases[0]!.fits[0]!.expected;
    const pairs = [
      ['att1.ship.x', 'att1.ship.x'],
      ['att1.ship.y', 'att1.ship.y'],
      ['att1.ship.vx', 'att1.ship.vx'],
      ['att1.ship.vy', 'att1.ship.vy'],
      ['mu.A', 'mu.A'],
      ['camera.bias.z', 'camera.bias'],
    ] as const;
    const dxp = Math.max(
      ...pairs.map(([a, b]) => Math.abs(fitGet(fL, a)[0] - pexp.estimate[b]!) / pexp.sigma[b]!),
    );
    const dsp = Math.max(...pairs.map(([a, b]) => Math.abs(fitGet(fL, a)[1] / pexp.sigma[b]! - 1)));
    let inPlane = 0;
    fL.residTags.forEach((tag, i) => {
      if (tag.component === 0 || tag.component === 2) inPlane += fL.resid[i]! ** 2;
    });
    const dcp = Math.abs(inPlane / pexp.chi2 - 1);
    claim(
      v.id,
      'tier-g-flat-equals-planar',
      dxp <= TOL_P.estimateOverSigma &&
        dsp <= TOL_P.sigmaRelative &&
        dcp <= TOL_P.chi2InPlaneRelative,
    );
    const zz = ['z', 'vz'].map((k) => {
      const [x, s] = fitGet(fL, `att1.ship.${k}`);
      return x / s;
    });
    claim(
      v.id,
      'tier-g-flat-out-of-plane-zero',
      zz.every((q) => Math.abs(q) <= 3) &&
        fL.m === pexp.m + G.flat.c.attempts[0]!.measurements.length,
    );

    const L = F.flat;
    const Rr = F.rotated;
    const pcase = (JSON.parse(rawPlanarForecast) as VectorJson).cases[0]! as CaseJson;
    const wl = L.tl.rows;
    const wr = Rr.tl.rows;
    const wp = pcase.tierL!.windows;
    const sameBounds = (
      a: readonly { t0: number; t1: number; nFixes: number }[],
      b: readonly { t0: number; t1: number; nFixes: number }[],
    ) =>
      a.length === b.length &&
      a.every((q, i) => q.t0 === b[i]!.t0 && q.t1 === b[i]!.t1 && q.nFixes === b[i]!.nFixes);
    const dgRL = Math.max(...wl.map((a, i) => Math.abs(a.g - wr[i]!.g) / a.sigma));
    const dgLP = Math.max(...wl.map((a, i) => Math.abs(a.g - wp[i]!.g) / wp[i]!.sigma));
    const dsLP = Math.max(...wl.map((a, i) => Math.abs(a.sigma / wp[i]!.sigma - 1)));
    claim(
      v.id,
      'windows-rotated-equal-flat',
      sameBounds(wl, wr) && dgRL <= TOL_R.estimateOverSigma,
    );
    claim(
      v.id,
      'windows-flat-equal-planar',
      sameBounds(wl, wp) && dgLP <= TOL_P.estimateOverSigma && dsLP <= TOL_P.sigmaRelative,
    );
    const pl = L.tl.profile;
    const pr = Rr.tl.profile;
    const pp = pcase.tierL!.profile;
    const dnRL = Math.max(...pl.g.map((g, b) => Math.abs(g - pr.g[b]!) / pl.sigma[b]!));
    const dnLP = Math.max(...pl.g.map((g, b) => Math.abs(g - pp.g[b]!) / pp.sigma[b]!));
    claim(
      v.id,
      'profile-invariant',
      JSON.stringify(pl.uNodes) === JSON.stringify(pr.uNodes) &&
        JSON.stringify(pl.uNodes) === JSON.stringify(pp.uNodes) &&
        dnRL <= 0.01 &&
        dnLP <= 0.01,
    );

    // Present state: rotated against flat turned; flat against the planar vector in the plane.
    const R = Rr.R;
    const T = zeros(6, 6);
    for (let b = 0; b < 2; b++)
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 3; c++) T.data[(3 * b + r) * 6 + 3 * b + c] = R[r]![c]!;
    const Tt = transpose(T);
    const back = [0, 1, 2, 3, 4, 5].map((i) =>
      Array.from(Rr.anc.state).reduce((s, xv, k) => s + Tt.data[i * 6 + k]! * xv, 0),
    );
    const Pb = matMul(matMul(Tt, Rr.anc.covariance), T);
    const sL = [0, 1, 2, 3, 4, 5].map((i) => Math.sqrt(L.anc.covariance.data[i * 6 + i]!));
    const dax = Math.max(...back.map((b, i) => Math.abs(b - L.anc.state[i]!) / sL[i]!));
    const das = Math.max(...sL.map((s, i) => Math.abs(Math.sqrt(Pb.data[i * 6 + i]!) / s - 1)));
    claim(
      v.id,
      'present-state-rotated-equals-flat',
      dax <= TOL_R.estimateOverSigma && das <= TOL_R.sigmaRelative,
    );
    const pa = pcase.anchor!;
    const ii = [0, 1, 3, 4];
    const sp = ii.map((_, k) => Math.sqrt(pa.covariance[k]![k]!));
    const dap = Math.max(...ii.map((i, k) => Math.abs(L.anc.state[i]! - pa.state[k]!) / sp[k]!));
    const dspA = Math.max(...ii.map((i, k) => Math.abs(sL[i]! / sp[k]! - 1)));
    claim(
      v.id,
      'present-state-flat-equals-planar',
      dap <= TOL_P.estimateOverSigma && dspA <= TOL_P.sigmaRelative,
    );

    // Forecasts: rotated against flat turned; flat against the planar vector in the plane.
    const s2L = L.tl.s2;
    const s2P = pcase.forecastInputs!.noiseScale;
    let meanRL = 0;
    let covRL = 0;
    let meanLP = 0;
    let srcLP = 0;
    let horizonSame = true;
    const plane2 = (m: Matrix): Matrix => pick(m, [0, 1]);
    const Rm = fromRows(R);
    for (const fl of L.plans) {
      const fr = Rr.plans.find((p) => p.pid === fl.pid)!;
      const fp = pcase.forecasts!.find((p) => p.plan === fl.pid)!;
      fl.points.forEach((a, i) => {
        const b = fr.points[i]!;
        const p = fp.points[i]!;
        horizonSame = horizonSame && a.within === b.within && a.within === p.withinHorizon;
        if (!p.withinHorizon) return;
        const st = a.sig.total;
        const turned = mulMtV(R, Array.from(b.mean.slice(0, 3)));
        meanRL = Math.max(meanRL, norm(sub(turned, Array.from(a.mean.slice(0, 3)))) / st);
        const cb = matMul(matMul(transpose(Rm), b.cov.total), Rm);
        for (let k = 0; k < 9; k++)
          covRL = Math.max(covRL, Math.abs(cb.data[k]! - a.cov.total.data[k]!) / (st * st));
        meanLP = Math.max(
          meanLP,
          Math.hypot(a.mean[0]! - p.mean[0], a.mean[1]! - p.mean[1]) / p.sigmaMajor.total,
        );
        for (const k of ['profile', 'hedge', 'engine'] as const)
          if (p.sigmaMajor[k] > 1)
            srcLP = Math.max(srcLP, Math.abs(majorSigma(plane2(a.cov[k])) / p.sigmaMajor[k] - 1));
        srcLP = Math.max(
          srcLP,
          Math.abs(
            majorSigma(plane2(a.cov.state)) /
              Math.sqrt(s2L) /
              (p.sigmaMajor.state / Math.sqrt(s2P)) -
              1,
          ),
        );
      });
    }
    claim(
      v.id,
      'forecast-rotated-equals-flat',
      horizonSame && meanRL <= TOL_R.estimateOverSigma && covRL <= TOL_R.sigmaRelative,
    );
    claim(
      v.id,
      'forecast-flat-equals-planar',
      horizonSame && meanLP <= TOL_P.estimateOverSigma && srcLP <= TOL_P.sigmaRelative,
    );
    console.log(
      `rotation-invariance, this implementation: rotated against flat turned: ` +
        `Tier G ${compareRotated(G.rotated.r.res, G.rotated.R).estimateOverSigma.toExponential(1)} σ ` +
        `(pole ${compareRotated(G.pole.r.res, G.pole.R).estimateOverSigma.toExponential(1)} σ), ` +
        `χ² ${compareRotated(G.rotated.r.res, G.rotated.R).chi2Relative.toExponential(1)} ` +
        `(pole ${compareRotated(G.pole.r.res, G.pole.R).chi2Relative.toExponential(1)}), ` +
        `windows ${dgRL.toExponential(1)} σ, present state ${dax.toExponential(1)} σ, ` +
        `forecast mean ${meanRL.toExponential(1)}, covariance ${covRL.toExponential(1)}; ` +
        `flat against the planar vector: Tier G ${dxp.toExponential(1)} σ, in-plane χ² ${dcp.toExponential(1)}, ` +
        `windows ${dgLP.toExponential(1)} σ, present state ${dap.toExponential(1)} σ, ` +
        `forecast mean ${meanLP.toExponential(1)}, sources ${srcLP.toExponential(1)}`,
    );
    allHold(v.id);
  });
});

// ---------------------------------------------------------------------------------------------
// 2. inclined-newton-recovers-gm
// ---------------------------------------------------------------------------------------------

describe('inclined-newton-recovers-gm', () => {
  const v = V(rawInclined);
  const c = v.cases[0]!;
  const arcs = arcsOf(c);
  const j1 = fitById(c, 'newtonian');
  const j2 = fitById(c, 'superfluous-exponent');
  const r1 = runFit(j1, arcs);
  const r2 = runFit(j2, arcs);

  it('initial guesses follow §4.5', () => expect(compareGuesses(j1, arcs)).toEqual([]));
  it('fits match the reference', () => {
    expect(compareFit(r1.res, j1.expected, 'inclined')).toEqual([]);
    expect(compareFit(r2.res, j2.expected, 'inclined exponent')).toEqual([]);
  });

  it('claims', () => {
    const f1 = r1.res;
    const [mu, smu] = fitGet(f1, 'mu.A');
    claim(v.id, 'gm-recovered', Math.abs(mu - MU_A) <= 3 * smu);
    claim(v.id, 'gm-data-dominated', smu < 0.1 * PRIOR.muA);
    claim(v.id, 'chi2-consistent', inBand(f1));
    const s0 = truthState(c, 'att1');
    const { x, P } = stateBlock(f1, 'att1');
    const md = mahalanobis(sub(x, s0), P);
    expect(md).toBeCloseTo((j1['stateCheck'] as { mahalanobis6: number }).mahalanobis6, 2);
    claim(v.id, 'state-recovered', md < CHI_6);
    const nc = normalCheck(f1, 'att1', s0);
    const ref = j1['orbitNormal'] as { angle: number; sigma: number; mahalanobis: number };
    expect(Math.abs(nc.sigma / ref.sigma - 1)).toBeLessThan(0.05);
    expect(Math.abs(nc.mahalanobis - ref.mahalanobis)).toBeLessThan(0.05);
    claim(
      v.id,
      'plane-recovered',
      nc.mahalanobis < CHI_2 && Math.abs(deg(angle(nc.normalFitted, [0, 0, 1])) - 50) < 0.1,
    );
    claim(v.id, 'out-of-plane-observed', Math.sqrt(P.data[2 * 6 + 2]!) < 1000);
    claim(
      v.id,
      'camera-held-by-prior',
      ['x', 'y', 'z'].every((k) => fitGet(f1, `camera.bias.${k}`)[1] / PRIOR.cam > 0.95),
    );
    const [n, sn] = fitGet(r2.res, 'law.n');
    claim(v.id, 'exponent-consistent-with-2', Math.abs(n - 2) <= 3 * sn);
    const ev = evidence(f1, r2.res, 1);
    expect(ev.deltaCost).toBeCloseTo(j2.adoption!.deltaCost, 4);
    claim(v.id, 'superfluous-not-adoptable', !ev.evidence);
    allHold(v.id);
  });
});

// ---------------------------------------------------------------------------------------------
// 3. inv25-two-planes
// ---------------------------------------------------------------------------------------------

describe('inv25-two-planes', () => {
  const v = V(rawTwo);
  const c = v.cases[0]!;
  const arcs = arcsOf(c);
  const fits = Object.fromEntries(c.fits.map((f) => [f.id, { j: f, r: runFit(f, arcs) }]));

  it('local fits match the reference', () => {
    for (const id of ['local-att1', 'local-att2'])
      expect(compareFit(fits[id]!.r.res, fits[id]!.j.expected, `two-planes ${id}`)).toEqual([]);
  });

  it('claims', () => {
    const mus: Record<string, [number, number]> = {};
    const normals: Record<string, number[]> = {};
    for (const id of ['att1', 'att2']) {
      const { j, r } = fits[`local-${id}`]!;
      const [mu, smu] = fitGet(r.res, 'mu.A');
      mus[id] = [mu, smu];
      const theory = (j['theory'] as { muLocal: number }).muLocal;
      claim(v.id, `local-gm-${id}`, Math.abs(mu - theory) <= 3 * smu + 1e-3 * theory);
      claim(v.id, `local-white-${id}`, inBand(r.res));
      normals[id] = normalCheck(r.res, id, truthState(c, id)).normalFitted;
    }
    const [m1, s1] = mus['att1']!;
    const [m2, s2] = mus['att2']!;
    const ratio = m1 / m2;
    const sratio = ratio * Math.hypot(s1 / m1, s2 / m2);
    const expected = (c['derived'] as { gmRatioExpected: number }).gmRatioExpected;
    claim(v.id, 'gm-ratio', Math.abs(ratio - expected) <= 3 * sratio + 2e-3 * expected);
    const planes = c.truth['planes'] as Record<string, { normal: number[] }>;
    const sepTrue = angle(planes['att1']!.normal, planes['att2']!.normal);
    const sepFit = angle(normals['att1']!, normals['att2']!);
    claim(
      v.id,
      'planes-differ',
      sepTrue > (60 * Math.PI) / 180 && Math.abs(sepFit - sepTrue) < 1e-3,
    );
    claim(v.id, 'joint-misfit', fitChi2Nu(fits['joint']!.r.res) > 10);
    allHold(v.id);
  });
});

// ---------------------------------------------------------------------------------------------
// 4. thrust-3d-confounded: two misalignment angles, three-axis accelerometer, RCS segments
// ---------------------------------------------------------------------------------------------

describe('thrust-3d-confounded', () => {
  const v = V(rawThrust);
  const ENG = ['engine.kE', 'engine.dE', 'engine.dP'] as const;
  const ENG_PRIOR = { 'engine.kE': PRIOR.kE, 'engine.dE': PRIOR.dE, 'engine.dP': PRIOR.dP };
  const engTruth = (c: CaseJson3) => ({
    'engine.kE': c.truth.values['truth.kE']!,
    'engine.dE': c.truth.values['truth.dE']!,
    'engine.dP': c.truth.values['truth.dP']!,
  });
  const engineZ = (f: FitResult, c: CaseJson3) =>
    ENG.map((nm) => (fitGet(f, nm)[0] - engTruth(c)[nm]) / fitGet(f, nm)[1]);
  const turnBetween = (c: CaseJson3, i0: number, i1: number) => {
    const cps = (c.truth['checkpoints'] as Record<string, { shipState: number[] }[]>)['att1']!;
    return angle(orbitNormal(cps[i0]!.shipState), orbitNormal(cps[i1]!.shipState));
  };

  // Tilted hover: burn only, plus coast, plus accelerometer.
  const hover = ['burn-only', 'burn-plus-coast', 'burn-plus-accel'].map((id) => {
    const c = caseById(v, id);
    const j = c.fits[0]!;
    const arcs = arcsOf(c);
    const r = runFit(j, arcs);
    const conf = confounding(r.res, ['mu.A'], [...ENG], { ...ENG_PRIOR, 'mu.A': PRIOR.muA });
    return { c, j, arcs, r, conf, R: multipleCorrelation(r.res, 'engine.kE', ENG.slice(1)) };
  });

  // Out-of-plane burn: tracking only, with the accelerometer, and the one-angle engine.
  const oop = caseById(v, 'out-of-plane-burn');
  const oopFits = Object.fromEntries(
    oop.fits.map((j) => {
      const only = j.dataSubset === 'opnav measurements only';
      const arcs = new Map([
        ['att1', toArc3(oop.attempts[0]!, (m) => !only || m.kind === 'opnav')],
      ]);
      return [j.id, { j, arcs, r: runFit(j, arcs) }];
    }),
  );
  /** Principal sigmas of the camera block over its prior (ascending), least-determined axis. */
  const camEigen = (f: FitResult) => {
    const ii = ['x', 'y', 'z'].map((k) => fitIndex(f, `camera.bias.${k}`));
    const { values, vectors } = symEig(pick(f.P, ii));
    return {
      ratios: Array.from(values, (w) => Math.sqrt(w) / PRIOR.cam),
      axis: [0, 1, 2].map((r) => vectors.data[r * 3 + 2]!),
    };
  };

  // Hands-on flying: throttle steps and RCS translation as segments; then the RCS left out.
  const hands = caseById(v, 'hands-on');
  const jm = fitById(hands, 'segments-modelled');
  const jn = fitById(hands, 'rcs-left-to-residuals');
  const handArcs = arcsOf(hands);
  const rm = runFit(jm, handArcs);
  const used = (jn['commandsUsed'] as { t0: number; t1: number; u: number; q: number[] }[]).map(
    (q): ThrustSegment => ({ t0: q.t0, t1: q.t1, u: q.u, q: quatOf(q.q) }),
  );
  const noRcsArcs = new Map([
    ['att1', { ...toArc3(hands.attempts[0]!, (m) => m.kind === 'opnav'), commands: used }],
  ]);
  const rn = runFit(jn, noRcsArcs);

  it('initial guesses follow §4.5', () => {
    for (const h of hover) expect(compareGuesses(h.j, h.arcs), h.c.id).toEqual([]);
    for (const f of Object.values(oopFits)) expect(compareGuesses(f.j, f.arcs), f.j.id).toEqual([]);
    expect(compareGuesses(jm, handArcs)).toEqual([]);
    expect(compareGuesses(jn, noRcsArcs)).toEqual([]);
  });

  it('tilted-hover fits and their confounding match the reference', () => {
    for (const h of hover) {
      expect(compareFit(h.r.res, h.j.expected, `thrust ${h.c.id}`), h.c.id).toEqual([]);
      const ref = h.j['confounding'] as { maxAbsRho: number; kEvsMisalignment: number };
      expect(Math.abs(h.conf.maxAbsRho - ref.maxAbsRho), h.c.id).toBeLessThan(0.02);
      expect(Math.abs(h.R - ref.kEvsMisalignment), h.c.id).toBeLessThan(0.02);
    }
  });

  it('out-of-plane burn fits match the reference; the planned attitude is roll-held', () => {
    for (const f of Object.values(oopFits))
      expect(compareFit(f.r.res, f.j.expected, `thrust ${f.j.id}`), f.j.id).toEqual([]);
    // The burn's attitude is `pointAlong` from the attitude before it (§3.3).
    const ar = oop['attitudeResolution'] as { qBefore: number[]; direction: number[]; q: number[] };
    const [dx, dy, dz] = ar.direction as [number, number, number];
    const q = quat.pointAlong(quatOf(ar.qBefore), { x: dx, y: dy, z: dz });
    expect(quat.angleBetween(q, quatOf(ar.q))).toBeLessThan(1e-12);
    expect(quat.angleBetween(q, quatOf(oop.attempts[0]!.commands[0]!.q))).toBeLessThan(1e-12);
  });

  it('hands-on fits match the reference; windows close at any firing', () => {
    expect(compareFit(rm.res, jm.expected, 'thrust hands-on')).toEqual([]);
    expect(compareFit(rn.res, jn.expected, 'thrust rcs left out')).toEqual([]);
    const wins = makeWindows(handArcs.get('att1')!, 'A');
    expect(
      wins.map((w) => ({
        window: w.id,
        t0: w.t0,
        t1: w.t1,
        nFixes: w.fixes.length,
        powered: w.powered,
      })),
    ).toEqual(hands['windows']);
  });

  it('claims', () => {
    const rho: Record<string, number> = {};
    const rhoP: Record<string, number> = {};
    const ratios: Record<string, Record<string, number>> = {};
    const ratiosMu: Record<string, number> = {};
    for (const h of hover) {
      const id = h.c.id;
      const [mu, smu] = fitGet(h.r.res, 'mu.A');
      const z = [(mu - MU_A) / smu, ...engineZ(h.r.res, h.c)];
      claim(
        v.id,
        `recovered-${id}`,
        z.every((q) => Math.abs(q) <= 3),
      );
      rho[id] = fitCorr(h.r.res, 'mu.A', 'engine.kE');
      rhoP[id] = h.R;
      ratios[id] = h.conf.posteriorOverPrior;
      ratiosMu[id] = h.conf.gravityPosteriorOverPrior['mu.A']!;
    }
    claim(v.id, 'thrust-leaves-the-plane', deg(turnBetween(hover[0]!.c, 0, 1)) > 2);
    claim(v.id, 'burn-only-confounded', Math.abs(rho['burn-only']!) > 0.9);
    claim(v.id, 'burn-only-three-way', rhoP['burn-only']! > 0.9);
    for (const id of ['burn-plus-coast', 'burn-plus-accel'])
      claim(
        v.id,
        `${id}-breaks-confound`,
        Math.abs(rho[id]!) <= 0.9 &&
          ratios[id]!['engine.kE']! < 0.5 * ratios['burn-only']!['engine.kE']!,
      );
    claim(
      v.id,
      'accelerometer-pins-both-angles',
      ENG.every((nm) => ratios['burn-plus-accel']![nm]! < 0.1),
    );
    claim(v.id, 'burn-only-not-learned', ratiosMu['burn-only']! > 0.3);

    const ft = oopFits['tracking-only']!.r.res;
    const fa = oopFits['with-accelerometer']!.r.res;
    const f1 = oopFits['one-angle-engine']!.r.res;
    claim(v.id, 'plane-change', deg(turnBetween(oop, 0, 2)) > 10);
    claim(
      v.id,
      'out-of-plane-burn-recovered',
      engineZ(ft, oop).every((q) => Math.abs(q) <= 3) && inBand(ft),
    );
    const rt = (nm: (typeof ENG)[number]) => fitGet(ft, nm)[1] / ENG_PRIOR[nm];
    claim(
      v.id,
      'tracking-alone-weak-on-angles',
      rt('engine.dE') > 0.1 &&
        rt('engine.dP') > 0.1 &&
        Math.abs(fitCorr(ft, 'engine.dE', 'engine.dP')) > 0.9,
    );
    const rac = (nm: (typeof ENG)[number]) => fitGet(fa, nm)[1] / ENG_PRIOR[nm];
    const gain = (['engine.dE', 'engine.dP'] as const).map(
      (nm) => fitGet(fa, nm)[1] / fitGet(ft, nm)[1],
    );
    claim(
      v.id,
      'accelerometer-pins-plane-change',
      rac('engine.dE') < 0.05 && rac('engine.dP') < 0.05 && Math.max(...gain) < 0.35,
    );
    const z1 =
      (fitGet(f1, 'engine.dE')[0] - engTruth(oop)['engine.dE']) / fitGet(f1, 'engine.dE')[1];
    claim(v.id, 'one-angle-engine-biased', Math.abs(z1) > 3 && inBand(f1));
    claim(
      v.id,
      'accelerometer-agrees',
      engineZ(fa, oop).every((q) => Math.abs(q) <= 3),
    );
    const ce = camEigen(ft);
    const ar = oop['attitudeResolution'] as { qBefore: number[]; q: number[] };
    const turn = quat.toRotationVector(
      quat.multiply(quat.conjugate(quatOf(ar.qBefore)), quatOf(ar.q)),
    );
    const a = angle(ce.axis, [turn.x, turn.y, turn.z]);
    const axAngle = Math.min(a, Math.PI - a);
    claim(
      v.id,
      'camera-observable-after-turn',
      ce.ratios[0]! < 0.5 && ce.ratios[1]! < 0.5 && ce.ratios[2]! > 0.9 && deg(axAngle) < 5,
    );

    const fm = rm.res;
    const [kR, skR] = fitGet(fm, 'rcs.kR');
    const zm = [...engineZ(fm, hands), (kR - hands.truth.values['truth.kR']!) / skR];
    claim(v.id, 'hands-on-fits', zm.every((q) => Math.abs(q) <= 3) && inBand(fm));
    claim(v.id, 'rcs-scale-learned', skR < 0.2 * PRIOR.kR);
    const fn = rn.res;
    const zn = [(fitGet(fn, 'mu.A')[0] - MU_A) / fitGet(fn, 'mu.A')[1], ...engineZ(fn, hands)];
    claim(
      v.id,
      'rcs-cannot-be-left-out',
      fitChi2Nu(fn) > band(fitNu(fn))[1] &&
        Math.abs(zn[0]!) > 5 &&
        Math.abs(zn[2]!) > 5 &&
        Math.abs(zn[3]!) > 5,
    );
    const arc = handArcs.get('att1')!;
    const wins = makeWindows(arc, 'A');
    const fires = (c: ThrustSegment) => c.u !== 0 || (c.rcs?.some((q) => q !== 0) ?? false);
    const mixed = wins.filter(
      (w) =>
        w.fixes.some((m) => arc.commands.some((c) => c.t0 <= m.t && m.t < c.t1 && fires(c))) !==
        w.powered,
    );
    const span = wins.filter(
      (w) => !w.powered && arc.commands.some((c) => w.t0 < c.t1 && c.t0 < w.t1),
    );
    claim(
      v.id,
      'windows-split-at-any-thrust',
      mixed.length === 0 && span.length === 0 && wins.length >= 4,
    );
    allHold(v.id);
  });
});

// ---------------------------------------------------------------------------------------------
// 5. inv25-exponent-planes: Tier L and the profile across planes; held-out in another plane
// ---------------------------------------------------------------------------------------------

describe('inv25-exponent-planes', () => {
  const v = V(rawPlanes);
  const narrow = caseById(v, 'narrow');
  const wide = caseById(v, 'wide');
  const heldCase = caseById(v, 'held-out-other-plane');
  const nT = wide.truth.values['truth.n']!;
  const muT = wide.truth.values['truth.muA']!;
  const out: Record<string, FitResult> = {};
  for (const c of [narrow, wide]) out[c.id] = runFit(fitById(c, 'exponent'), arcsOf(c)).res;
  const wideArcMap = arcsOf(wide);
  const wideArcs = [...wideArcMap.values()];
  const ref = refLaw(wide.tierL!.reference);
  const tl = tierL(ref, wideArcs);
  const empJ = fitById(wide, 'empirical-on-calibrated-law');
  const emp = empiricalFit(ref, tl.profile, wideArcs, {
    ...OPTS,
    end: Object.fromEntries(wide.attempts.map((a) => [a.id, a.duration])),
  });

  // Held-out test across planes (§7): train on att1 and att3, hold out att2.
  function validate(id: string) {
    const j = fitById(heldCase, id);
    const r = runFit(j, wideArcMap);
    const held = wideArcMap.get(heldCase.heldOut!)!;
    const g = guessShip(held, 'A', 0);
    const local: Param[] = STATE_KEYS.map((k, i) => ({
      name: `${held.id}.ship.${k}`,
      init: g[i]!,
      scale: i < 3 ? 1e3 : 1,
      group: held.id,
    }));
    const ho = heldOutConsistency(r.st, r.res, r.params, held, local, OPTS, 3);
    return { j, r, ho, held };
  }
  const N = validate('newtonian');
  const X = validate('exponent');
  const fX = X.r.res;
  const [nX, snX] = fitGet(fX, 'law.n');
  const trainRanges = heldCase.training!.flatMap((id) =>
    rangeFixes(wideArcMap.get(id)!, 'A').map((m) => m.z[2]!),
  );
  const trainMin = Math.min(...trainRanges);
  const trainMax = Math.max(...trainRanges);
  const heldRows = localFits(
    {
      r0: R0,
      body: 'A',
      mu: fitGet(fX, 'mu.A')[0],
      n: nX,
      cam: [
        fitGet(fX, 'camera.bias.x')[0],
        fitGet(fX, 'camera.bias.y')[0],
        fitGet(fX, 'camera.bias.z')[0],
      ],
      kE: 1,
      dE: 0,
    },
    [X.held],
    DT,
    { gSigma: 0.5 },
  );
  const eh = earnedHedge(heldRows, trainMin, trainMax, snX, PRIOR.sigmaH, 0.01);

  it('exponent fits match the reference', () => {
    expect(
      compareFit(out['narrow']!, fitById(narrow, 'exponent').expected, 'planes narrow'),
    ).toEqual([]);
    expect(compareFit(out['wide']!, fitById(wide, 'exponent').expected, 'planes wide')).toEqual([]);
  });
  it('Tier L across three planes matches the reference', () =>
    expect(compareTierL(tl.rows, tl.profile, tl.s2, wide.tierL!)).toEqual([]));
  it('empirical fit (R, T, N) on the calibrated law matches the reference', () => {
    expect(emp.bounds).toEqual(empJ.model.empirical!.bounds);
    expect(compareFit(emp.fit, empJ.expected, 'planes empirical')).toEqual([]);
    emp.table.forEach((row, i) => {
      const r = empJ.table![i]!;
      expect(row.window).toBe(r.window);
      for (const k of ['R', 'T', 'N'] as const)
        expect(Math.abs(row[`a${k}`] - r[`a${k}`]), `${row.window} ${k}`).toBeLessThan(
          0.05 * r[`sigma${k}`],
        );
    });
  });
  it('held-out statistics and the earned hedge match the reference', () => {
    expect(compareFit(X.r.res, X.j.expected, 'planes held-out exponent')).toEqual([]);
    for (const r of [N, X]) {
      expect(r.ho.pass).toBe(r.j.heldOut!.pass);
      expect(r.ho.nu).toBe(r.j.heldOut!.nu);
      expect(r.ho.threshold).toBeCloseTo(r.j.heldOut!.threshold, 10);
    }
    expect(Math.abs(X.ho.T / X.j.heldOut!.T - 1)).toBeLessThan(0.02);
    const e = X.j['earnedHedge'] as {
      trainingCoverage: [number, number];
      nWindowsOutside: number;
      sigmaH: number;
      validatedRange: [number, number];
    };
    expect([trainMin, trainMax]).toEqual(e.trainingCoverage);
    expect(eh.nWindowsOutside).toBe(e.nWindowsOutside);
    expect(Math.abs(eh.sigmaH / e.sigmaH - 1)).toBeLessThan(0.05);
    expect(eh.validatedRange).toEqual(e.validatedRange);
  });

  it('claims', () => {
    const planes = wide.truth['planes'] as Record<string, { normal: number[] }>;
    const sep = [
      ['att1', 'att2'],
      ['att1', 'att3'],
      ['att2', 'att3'],
    ].map(([a, b]) => deg(angle(planes[a!]!.normal, planes[b!]!.normal)));
    claim(v.id, 'three-planes', Math.min(...sep) > 45);
    for (const c of ['narrow', 'wide']) {
      const [n, sn] = fitGet(out[c]!, 'law.n');
      claim(v.id, `exponent-${c}`, Math.abs(n - nT) <= 3 * sn);
      claim(v.id, `chi2-${c}`, inBand(out[c]!));
    }
    const worstGm = Math.max(
      ...tl.rows.map((r) => {
        const theory = muT * Math.sqrt(R0 / r.rGeoMean);
        return Math.abs(ref.mu * r.g - theory) / (3 * ref.mu * r.sigma + 0.01 * theory);
      }),
    );
    claim(v.id, 'gm-vs-distance-trend', worstGm <= 1);
    claim(v.id, 'gm-slope', Math.abs(gmSlope(tl.rows)!.slope + 0.5) < 0.02);
    claim(
      v.id,
      'all-windows-converge',
      tl.rows.every((r) => r.converged),
    );
    const wn = Math.max(...tl.rows.map((r) => angle(r.planeNormal, planes[r.arc]!.normal)));
    claim(v.id, 'window-normals', wn < 1e-3);
    claim(
      v.id,
      'wrong-law-leaves-nothing-non-central',
      emp.maxAbsTangentialZ < 4 && emp.maxAbsNormalZ < 4,
    );
    claim(v.id, 'calibrated-law-fits', fitChi2Nu(emp.fit) < 1.5);
    claim(v.id, 'profile-distance-explains', tl.profile.inflation < 3);
    claim(
      v.id,
      'coverage-narrows',
      fitGet(out['wide']!, 'law.n')[1] < 0.5 * fitGet(out['narrow']!, 'law.n')[1],
    );
    claim(v.id, 'newtonian-fails-heldout', !N.ho.pass);
    const ev = evidence(N.r.res, X.r.res, 1);
    expect(ev.deltaCost / X.j.adoption!.deltaCost).toBeCloseTo(1, 1);
    claim(v.id, 'exponent-passes-heldout-other-plane', ev.evidence && X.ho.pass);
    const vr = eh.validatedRange;
    claim(
      v.id,
      'validated-range-radial',
      vr !== undefined && 0.48e6 < vr[0] && vr[0] < 0.52e6 && 1.85e6 < vr[1] && vr[1] < 2.0e6,
    );
    claim(v.id, 'hedge-earned', eh.sigmaH < 0.2 * PRIOR.sigmaH);
    allHold(v.id);
  });
});

// ---------------------------------------------------------------------------------------------
// 6. offplane-body-signature: a missing body off the orbit plane; seen and unseen modes
// ---------------------------------------------------------------------------------------------

describe('offplane-body-signature', () => {
  const v = V(rawBody);
  const c = v.cases[0]!;
  const arcs = arcsOf(c);
  const a1 = arcs.get('att1')!;
  const truth = c.truth.values;
  const jA = fitById(c, 'A-only');
  const rA = runFit(jA, arcs);
  const ref: ReferenceLaw = {
    r0: R0,
    body: 'A',
    mu: fitGet(rA.res, 'mu.A')[0],
    n: 2,
    cam: [
      fitGet(rA.res, 'camera.bias.x')[0],
      fitGet(rA.res, 'camera.bias.y')[0],
      fitGet(rA.res, 'camera.bias.z')[0],
    ],
    kE: 1,
    dE: 0,
  };
  const tl = tierL(ref, [a1]);
  const empJ = fitById(c, 'empirical-on-calibrated-law');
  const emp = empiricalFit(ref, tl.profile, [a1], {
    ...OPTS,
    end: { att1: c.attempts[0]!.duration },
  });
  const jB = fitById(c, 'add-body-B');
  const rB = runFit(jB, arcs);
  // Unseen mode: fixes on A only, the whole arc at once (no arc growing).
  const jU = fitById(c, 'add-body-B-unseen');
  const onlyA = new Map([['att1', toArc3(c.attempts[0]!, (m) => m.target === 'A')]]);
  const rU = runFit(jU, onlyA);

  it('initial guesses for the seen body follow §4.5', () =>
    expect(compareGuesses(jB, arcs)).toEqual([]));
  it('Tier L under the A-only law matches the reference', () =>
    expect(compareTierL(tl.rows, tl.profile, tl.s2, c.tierL!)).toEqual([]));
  it('empirical fit (R, T, N) matches the reference', () => {
    expect(emp.bounds).toEqual(empJ.model.empirical!.bounds);
    expect(compareFit(emp.fit, empJ.expected, 'offplane empirical')).toEqual([]);
  });
  it('body extension fits match the reference, seen and unseen', () => {
    expect(compareFit(rB.res, jB.expected, 'offplane seen')).toEqual([]);
    expect(jU.compare).toBe('numeric');
    expect(compareFit(rU.res, jU.expected, 'offplane unseen')).toEqual([]);
  });

  it('claims', () => {
    const b0 = truthState(c, 'att1', 'B');
    const s0 = truthState(c, 'att1');
    const elev = Math.asin(dot(unit(b0.slice(0, 3)), orbitNormal(s0)));
    claim(v.id, 'body-off-plane', Math.abs(deg(elev)) > 30);
    claim(v.id, 'A-only-misfit', fitChi2Nu(rA.res) > 5);
    const rs = residualSummary(rA.res);
    expect(rs['coast.along']!.rms / jA.expected.residualSummary['coast.along']!.rms).toBeCloseTo(
      1,
      2,
    );
    expect(rs['coast.normal']!.rms / jA.expected.residualSummary['coast.normal']!.rms).toBeCloseTo(
      1,
      2,
    );
    claim(v.id, 'out-of-plane-residuals', rs['coast.normal']!.rms > 3);
    const g0 = truth['truth.muA']! / (R0 * R0);
    claim(
      v.id,
      'missing-body-tangential',
      emp.maxAbsTangentialZ > 5 && emp.maxAbsTangential / g0 > 3e-3,
    );
    claim(v.id, 'missing-body-normal', emp.maxAbsNormalZ > 5 && emp.maxAbsNormal / g0 > 1e-3);
    claim(v.id, 'profile-distance-fails', tl.profile.inflation > 3);
    const tidal = new Map(empJ.table!.map((r) => [r.window, r]));
    for (const [comp, lab] of [
      ['T', 'tangential'],
      ['N', 'normal'],
    ] as const) {
      const sig = emp.table.filter((r) => Math.abs(r[`a${comp}`]) > 3 * r[`sigma${comp}`]);
      const same = sig.filter(
        (r) => Math.sign(r[`a${comp}`]) === Math.sign(tidal.get(r.window)![`tidalAtMid${comp}`]!),
      );
      claim(v.id, `${lab}-tracks-tidal`, sig.length >= 4 && same.length === sig.length);
    }
    const [mb, smb] = fitGet(rB.res, 'mu.B');
    claim(v.id, 'body-gm-recovered', Math.abs(mb - truth['truth.muB']!) <= 3 * smb);
    claim(v.id, 'body-chi2', inBand(rB.res));
    const B = stateBlock(rB.res, 'att1', 'B');
    const md = mahalanobis(sub(B.x.slice(0, 3), b0.slice(0, 3)), pick(B.P, [0, 1, 2]));
    const szb = fitGet(rB.res, 'att1.B.z')[1];
    claim(v.id, 'body-position-recovered', md < CHI_3 && szb < 5e3 && Math.abs(b0[2]!) > 5e5);

    const fu = rU.res;
    const U = stateBlock(fu, 'att1', 'B');
    const P3 = pick(U.P, [0, 1, 2]);
    const mdu = mahalanobis(sub(U.x.slice(0, 3), b0.slice(0, 3)), P3);
    const [muU, smuU] = fitGet(fu, 'mu.B');
    const uh = unit(U.x.slice(0, 3));
    const Puh = [0, 1, 2].map((r) =>
      dot(
        [0, 1, 2].map((k) => P3.data[r * 3 + k]!),
        uh,
      ),
    );
    const sLine = Math.sqrt(dot(uh, Puh));
    const im = fitIndex(fu, 'mu.B');
    const cross3 = ['x', 'y', 'z'].map(
      (k) => fu.P.data[fitIndex(fu, `att1.B.${k}`) * fu.P.cols + im]!,
    );
    const rhoMd = dot(uh, cross3) / (sLine * smuU);
    const trace = P3.data[0]! + P3.data[4]! + P3.data[8]!;
    const sAcross = Math.sqrt(Math.max((trace - sLine * sLine) / 2, 0));
    const szu = fitGet(fu, 'att1.B.z')[1];
    claim(
      v.id,
      'unseen-locally-identifiable',
      fu.converged &&
        inBand(fu) &&
        mdu < CHI_3 &&
        Math.abs(muU - truth['truth.muB']!) <= 3 * smuU &&
        szu < 5e4,
    );
    claim(v.id, 'unseen-mass-distance-degenerate', Math.abs(rhoMd) > 0.95 && sLine > 3 * sAcross);
    allHold(v.id);
  });
});

// ---------------------------------------------------------------------------------------------
// Forecast vectors: shared pieces
// ---------------------------------------------------------------------------------------------

/** 1σ size out of a plane with unit normal n, and the largest 1σ size inside it. */
function planeSplit(cov: Matrix, n: V3): { out: number; inPlane: number } {
  const nh = unit(n);
  const C = [0, 1, 2].map((r) => [0, 1, 2].map((k) => cov.data[r * 3 + k]!));
  const a = unit(cross(nh, Math.abs(nh[0]!) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
  const b = cross(nh, a);
  const q = (u: V3, w: V3) => dot(u, mulMV(C, w));
  return {
    out: Math.sqrt(Math.max(q(nh, nh), 0)),
    inPlane: majorSigma(
      fromRows([
        [q(a, a), q(a, b)],
        [q(b, a), q(b, b)],
      ]),
    ),
  };
}

interface Judged extends MyPoint {
  readonly deviation: number;
  readonly maha: number;
  readonly mahaNoHedge: number;
  readonly sOut: number;
  readonly sIn: number;
  readonly axisToNormalDeg: number;
}

/** Forecast points judged against truth (checking only) and split against an orbit normal. */
function judge(
  points: readonly MyPoint[],
  ref: readonly ForecastPointJson3[],
  normal: V3,
): Judged[] {
  return points.map((p, i) => {
    const dev = sub(ref[i]!.truth!, Array.from(p.mean.slice(0, 3)));
    const noHedge = {
      rows: 3,
      cols: 3,
      data: p.cov.total.data.map((q, k) => q - p.cov.hedge.data[k]!),
    };
    const split = planeSplit(p.cov.total, normal);
    const a = angle(majorAxis(p.cov.total), normal);
    return {
      ...p,
      deviation: norm(dev),
      maha: mahalanobis(dev, p.cov.total),
      mahaNoHedge: mahalanobis(dev, noHedge),
      sOut: split.out,
      sIn: split.inPlane,
      axisToNormalDeg: deg(Math.min(a, Math.PI - a)),
    };
  });
}

/** The shape numbers of a forecast point against the reference's (inside the horizon). */
function compareShape(points: readonly Judged[], ref: readonly ForecastPointJson3[]): string[] {
  const bad: string[] = [];
  points.forEach((p, i) => {
    const rp = ref[i]!;
    if (!rp.withinHorizon) return;
    const tol = Math.max(0.05 * rp.sigmaMajor.total, 1);
    if (Math.abs(p.sOut - rp.sigmaOutOfPlane!) > tol) bad.push(`t=${p.t}: out of plane ${p.sOut}`);
    if (Math.abs(p.sIn - rp.sigmaInPlaneMajor!) > tol) bad.push(`t=${p.t}: in plane ${p.sIn}`);
  });
  return bad;
}

interface AttitudeResolution {
  qBefore: number[];
  direction: number[];
  q: number[];
}

/** `quat.pointAlong` (src/lib) against the reference's roll-held resolution of a planned burn. */
function resolutionError(ar: AttitudeResolution): number {
  const [x, y, z] = ar.direction as [number, number, number];
  return quat.angleBetween(quat.pointAlong(quatOf(ar.qBefore), { x, y, z }), quatOf(ar.q));
}

// ---------------------------------------------------------------------------------------------
// 7. forecast-envelope-3d: the envelope is an ellipsoid
// ---------------------------------------------------------------------------------------------

describe('forecast-envelope-3d', () => {
  const v = V(rawForecast);
  const c = v.cases[0]!;
  const fi = c['forecastInputs'] as {
    reference: ReferenceJson3;
    cameraSigma: [number, number, number];
    sigmaH: number;
    horizonFraction: number;
    anchorWindows: number;
    orbitNormalNow: number[];
  };
  const ref = refLaw(fi.reference);
  const arcs = arcsOf(c);
  const a3 = arcs.get('att3')!;
  const tl = tierL(ref, [...arcs.values()]);
  const wins = makeWindows(a3, 'A')
    .filter((w) => !w.powered)
    .slice(-fi.anchorWindows);
  const anc = anchorState(ref, tl.profile, a3, wins, DT, {
    gPrior: [1, 0.5],
    slopeSigma: 0.2,
    camSigma: fi.cameraSigma,
  });
  const nEst = orbitNormal(Array.from(anc.state));
  type PlanJson = {
    commands: CommandJson3[];
    checkpoints: number[];
    engineSigma: { kE: number; dE: number; dP: number };
    attitudeResolution?: AttitudeResolution;
  };
  const planJson = c['plans'] as Record<string, PlanJson>;
  const plans = Object.fromEntries(
    Object.entries(planJson).map(([pid, p]) => {
      const base = {
        ref,
        commands: p.commands.map(toCommand3),
        tNow: anc.tNow,
        xNow: anc.state,
        PNow: anc.covariance,
        times: p.checkpoints,
        dt: DT,
        s2: tl.s2,
        engineSigma: [p.engineSigma.kE, p.engineSigma.dE, p.engineSigma.dP] as const,
      };
      const refPoints = (c['forecasts'] as { plan: string; points: ForecastPointJson3[] }[]).find(
        (f) => f.plan === pid,
      )!.points;
      const points = judge(
        forecastPoints(
          { ...base, profiles: [tl.profile], sigmaH: fi.sigmaH },
          fi.horizonFraction,
          tl.profile,
        ),
        refPoints,
        nEst,
      );
      const bare = forecastCore({ ...base, profiles: [], sigmaH: 0 });
      const uncal = refPoints.map((rp, i) =>
        norm(sub(rp.truth!, Array.from(bare.mean[i]!.slice(0, 3)))),
      );
      return [pid, { points, refPoints, uncal }];
    }),
  );

  it('Tier L (profile from two other planes) matches the reference', () =>
    expect(compareTierL(tl.rows, tl.profile, tl.s2, c.tierL!)).toEqual([]));

  it('present state with the camera misalignment (11 parameters) matches the reference', () => {
    expect(compareAnchor(anc, c['anchor'] as AnchorJson3)).toEqual([]);
    expect(angle(nEst, fi.orbitNormalNow)).toBeLessThan(1e-6);
    expect(anc.info.camera!.priorSigma).toEqual(fi.cameraSigma);
  });

  it('forecast points, their 3×3 covariances and shapes match the reference', () => {
    for (const [pid, p] of Object.entries(plans)) {
      expect(compareForecast(p.points, p.refPoints), pid).toEqual([]);
      expect(compareShape(p.points, p.refPoints), pid).toEqual([]);
    }
  });

  it('planned burns are the roll-held attitudes of §3.3', () => {
    for (const [pid, p] of Object.entries(planJson))
      if (p.attitudeResolution)
        expect(resolutionError(p.attitudeResolution), pid).toBeLessThan(1e-12);
  });

  it('claims', () => {
    const cc = plans['coast']!.points;
    const dc = plans['dive']!.points;
    const pc = plans['plane-change']!.points;
    for (const [pid, p] of Object.entries(plans)) {
      const inh = p.points.filter((q) => q.within);
      claim(v.id, `honest-${pid}`, Math.max(...inh.map((q) => q.maha)) < CHI_3 && inh.length >= 3);
    }
    claim(
      v.id,
      'coast-full-horizon',
      cc.every((p) => p.within),
    );
    claim(v.id, 'calibration-pays', plans['coast']!.uncal[5]! > 10 * cc[5]!.deviation);
    claim(
      v.id,
      'no-hedge-inside-coverage',
      cc.every((p) => p.sig.hedge < 1e-6),
    );
    const r3 = Math.min(...rangeFixes(a3, 'A').map((m) => m.z[2]!));
    const own = cc.filter((p) => p.r < r3);
    claim(
      v.id,
      'profile-from-other-planes',
      own.length >= 3 && own.every((p) => p.sig.hedge < 1e-6 && p.maha < CHI_3),
    );
    const out = dc.filter((p) => !p.inside && p.within);
    claim(v.id, 'dive-leaves-coverage', out.length >= 1);
    const deep = out[out.length - 1]!;
    claim(
      v.id,
      'hedge-widens-outside',
      deep.sig.hedge ===
        Math.max(deep.sig.state, deep.sig.profile, deep.sig.hedge, deep.sig.engine),
    );
    claim(v.id, 'hedge-needed', Math.max(...out.map((p) => p.mahaNoHedge)) > CHI_3);
    claim(v.id, 'horizon-ends-dive', !dc[dc.length - 1]!.within);
    claim(v.id, 'dive-uncertainty-in-plane', deep.axisToNormalDeg > 60);
    const p1 = pc[0]!;
    claim(
      v.id,
      'out-of-plane-largest',
      p1.axisToNormalDeg < 25 &&
        p1.sOut > p1.sIn &&
        p1.sig.engine === Math.max(p1.sig.state, p1.sig.profile, p1.sig.hedge, p1.sig.engine),
    );
    const c1 = cc[0]!;
    claim(v.id, 'coasting-envelope-is-flat', c1.sOut < 0.5 * c1.sIn);
    claim(v.id, 'picture-orientation-in-envelope', c1.sOut > 0.7 * fi.cameraSigma[0] * c1.r);
    allHold(v.id);
  });
});

// ---------------------------------------------------------------------------------------------
// 8. carried-rule-other-plane: a validated span is distances only
// ---------------------------------------------------------------------------------------------

describe('carried-rule-other-plane', () => {
  const v = V(rawCarried);
  const c = v.cases[0]!;
  const fi = c['forecastInputs'] as {
    engineSigma: { kE: number; dE: number; dP: number };
    cameraSigma: [number, number, number];
    horizonFraction: number;
    anchorWindows: number;
  };
  const plan = c['plan'] as {
    commands: CommandJson3[];
    checkpoints: number[];
    attitudeResolution: AttitudeResolution;
  };
  const forecasts = c['forecasts'] as {
    model: string;
    reference: ReferenceJson3;
    validated: [number, number][];
    sigmaEarned: number | null;
    sigmaDefault: number;
    anchor: AnchorJson3;
    points: ForecastPointJson3[];
  }[];
  const a1 = toArc3(c.attempts[0]!);
  const wins = makeWindows(a1, 'A')
    .filter((w) => !w.powered)
    .slice(-fi.anchorWindows);
  const byN = new Map<number, { tl: ReturnType<typeof tierL>; anc: Anchor }>();
  const results = forecasts.map((f) => {
    const ref = refLaw(f.reference);
    if (!byN.has(ref.n)) {
      const tl = tierL(ref, [a1]);
      const anc = anchorState(ref, tl.profile, a1, wins, DT, {
        gPrior: [1, 0.5],
        slopeSigma: 0.2,
        camSigma: fi.cameraSigma,
      });
      byN.set(ref.n, { tl, anc });
    }
    const { tl, anc } = byN.get(ref.n)!;
    const points = judge(
      forecastPoints(
        {
          ref,
          profiles: [tl.profile],
          commands: plan.commands.map(toCommand3),
          tNow: anc.tNow,
          xNow: anc.state,
          PNow: anc.covariance,
          times: plan.checkpoints,
          dt: DT,
          s2: tl.s2,
          sigmaH: f.sigmaDefault,
          engineSigma: [fi.engineSigma.kE, fi.engineSigma.dE, fi.engineSigma.dP],
          ...(f.validated.length > 0
            ? { validated: { A: { spans: f.validated, sigmaE: f.sigmaEarned! } } }
            : {}),
        },
        fi.horizonFraction,
        tl.profile,
      ),
      f.points,
      orbitNormal(Array.from(anc.state)),
    ).map((p) => ({
      ...p,
      insideValidated: f.validated.some(([lo, hi]) => lo <= p.r && p.r <= hi),
    }));
    return { f, points, tl, anc };
  });
  const R = results.find((q) => q.f.model === 'carried-rule')!;
  const E = results.find((q) => q.f.model === 'earned-everywhere')!;
  const Nr = results.find((q) => q.f.model === 'no-rule')!;

  it('Tier L and the present state match the reference', () => {
    const tls = c.tierL as unknown as Record<string, TierLJson3>;
    expect(compareTierL(R.tl.rows, R.tl.profile, R.tl.s2, tls['power-law-2.5']!)).toEqual([]);
    expect(compareTierL(Nr.tl.rows, Nr.tl.profile, Nr.tl.s2, tls['newtonian']!)).toEqual([]);
    expect(compareAnchor(R.anc, R.f.anchor)).toEqual([]);
  });

  it('the three forecasts match the reference inside their horizons', () => {
    for (const q of [R, E, Nr]) {
      expect(compareForecast(q.points, q.f.points), q.f.model).toEqual([]);
      expect(compareShape(q.points, q.f.points), q.f.model).toEqual([]);
      q.points.forEach((p, i) =>
        expect(p.insideValidated, `${q.f.model} ${p.t}`).toBe(q.f.points[i]!.insideValidated),
      );
    }
    expect(resolutionError(plan.attitudeResolution)).toBeLessThan(1e-12);
  });

  it('claims', () => {
    const turned = (c.truth['planeTurnedByBurn'] as number) ?? 0;
    claim(v.id, 'dive-in-another-plane', deg(turned) > 20);
    const comps = ['state', 'profile', 'hedgeEarned', 'hedgeDefault', 'engine'] as const;
    const inh = R.points.filter((p) => p.within);
    claim(v.id, 'honest', Math.max(...inh.map((p) => p.maha)) < CHI_3 && inh.length >= 4);
    const zone = R.points.flatMap((p, i) =>
      p.within && !p.inside && p.insideValidated ? [i] : [],
    );
    claim(v.id, 'earned-zone-exists', zone.length >= 3);
    const ez = zone[zone.length - 1]!;
    claim(
      v.id,
      'earned-inside-validated',
      R.points[ez]!.sig.hedgeDefault < 1 &&
        Math.abs(R.points[ez]!.sig.total / E.points[ez]!.sig.total - 1) < 1e-6,
    );
    claim(
      v.id,
      'carried-rule-helps',
      Nr.points[ez]!.sig.hedgeDefault > 5 * R.points[ez]!.sig.hedgeEarned &&
        Nr.points[ez]!.deviation > 5 * R.points[ez]!.deviation,
    );
    const count = (q: typeof R) => q.points.filter((p) => p.within).length;
    const [nN, nR, nE] = [count(Nr), count(R), count(E)];
    claim(v.id, 'horizon-order', nN < nR && nR <= nE);
    claim(v.id, 'no-rule-ends-early', Nr.points[nN - 1]!.r > 0.6e6);
    claim(v.id, 'carried-rule-reaches-below', nR < R.points.length && R.points[nR - 1]!.r < 0.6e6);
    const first = (nR < R.points.length ? R.points[nR] : R.points[R.points.length - 1])!.sig;
    claim(
      v.id,
      'default-hedge-ends-it',
      first.hedgeDefault === Math.max(...comps.map((k) => first[k])) &&
        first.hedgeDefault > 2 * first.hedgeEarned,
    );
    const eSame = E.points[Math.min(nR, E.points.length - 1)]!.sig.total;
    claim(v.id, 'not-easy', first.total > 1.5 * eSame);
    allHold(v.id);
  });
});

// ---------------------------------------------------------------------------------------------
// All claims
// ---------------------------------------------------------------------------------------------

describe('estimator vectors, 3D set', () => {
  it('all 104 claims hold, and each vector claim was evaluated', () => {
    const vectors = [
      rawRotation,
      rawInclined,
      rawTwo,
      rawThrust,
      rawPlanes,
      rawBody,
      rawForecast,
      rawCarried,
    ].map(V);
    let total = 0;
    for (const v of vectors) {
      const mine = claims.get(v.id);
      expect(mine, v.id).toBeDefined();
      expect([...mine!.keys()].sort()).toEqual(v.checks.map((c) => c.id).sort());
      for (const [id, ok] of mine!) expect(ok, `${v.id}/${id}`).toBe(true);
      total += mine!.size;
    }
    console.log(
      `3D vectors: ${total} claims hold; ${worst.fits} numeric fits; ` +
        `worst estimate ${worst.estimateOverSigma.toExponential(1)} σ from the reference (${worst.where}), ` +
        `sigma ${worst.sigmaRelative.toExponential(1)} relative, ` +
        `χ² ${worst.chi2Relative.toExponential(1)} relative, ` +
        `correlation ${worst.correlation.toExponential(1)}; ` +
        `windows ${forecastWorst.window.toExponential(1)} σ, profile nodes ${forecastWorst.profile.toExponential(1)} σ, ` +
        `present state ${forecastWorst.anchor.toExponential(1)} σ, ` +
        `forecast means ${forecastWorst.mean.toExponential(1)} of the major sigma, ` +
        `covariance terms ${forecastWorst.cov.toExponential(1)} of its square`,
    );
    expect(total).toBe(104);
    // Far inside the tolerance (0.05 σ per estimate, 5% per sigma, 2% in χ², 0.02 per
    // correlation, 0.05 of the major sigma per forecast mean).
    expect(worst.fits).toBe(22);
    expect(worst.estimateOverSigma).toBeLessThan(1e-3);
    expect(worst.sigmaRelative).toBeLessThan(1e-3);
    expect(worst.chi2Relative).toBeLessThan(1e-5);
    expect(forecastWorst.mean).toBeLessThan(1e-3);
  });
});
