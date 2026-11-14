/**
 * Tier L (1G spec §5) and the forecast core (§8): windows of equal swept angle, short-arc local
 * fits, the noise scale, the per-body gravity calibration profile, the present state, the
 * linearised forecast with its uncertainty split by source, and the earned hedge (§7.4).
 */

import {
  poweredAt,
  simulate,
  compileArc,
  wrap,
  SHIP_REFS,
  type Arc,
  type BodyDef,
  type CompiledArc,
  type EstMeasurement,
  type ProfileDef,
  type Structure,
  type ThrustSegment,
} from './dynamics.ts';
import { fromRows, inverse, lstsq, sandwich, solve, symEig2, zeros, type Matrix } from './linalg.ts';
import { Problem, fitChi2Nu, fitGet, type Param } from './solve.ts';

// ---------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------

/** Window rule (§5.1) and profile constants (§5.4). [ASSUMED] */
export interface WindowRule {
  /** Close a window after the bearing sweeps this much, rad. */
  readonly sweep: number;
  /** … or ln(range) spans this much. */
  readonly lnRange: number;
  readonly minFixes: number;
  /** A tail shorter than this is dropped. */
  readonly keepFixes: number;
}

export const DEFAULT_WINDOW_RULE: WindowRule = { sweep: 0.7, lnRange: 0.15, minFixes: 12, keepFixes: 6 };

// ---------------------------------------------------------------------------------------------
// Reference law (§5.2): the adopted structure with its globals frozen
// ---------------------------------------------------------------------------------------------

/** Another modelled body, frozen at its believed state relative to the reference body. */
export interface FrozenBody {
  readonly id: string;
  readonly mu: number;
  /** Believed state (x, y, vx, vy) relative to the reference body at time t (that body at rest). */
  readonly stateAt: (t: number) => readonly [number, number, number, number];
}

export interface ReferenceLaw {
  readonly r0: number;
  /** Reference body id (the primary of local fits). */
  readonly body: string;
  readonly mu: number;
  readonly n: number;
  readonly cam: number;
  readonly kE: number;
  readonly dE: number;
  /** Per-thruster engine values, if they differ from kE/dE. */
  readonly engines?: Readonly<Record<string, { kE: number; dE: number }>>;
  readonly others?: readonly FrozenBody[];
}

/**
 * Single reference body at the gauge, others frozen at their believed states, globals fixed.
 * `epoch` places frozen bodies for a one-arc fit; `arcs` places them per arc for multi-arc fits.
 */
export function refStructure(
  ref: ReferenceLaw,
  epoch: number,
  opts: {
    gs?: string;
    gs1?: string;
    gsU0?: number;
    profiles?: readonly ProfileDef[];
    arcs?: readonly { id: string; epoch: number }[];
  } = {},
): Structure {
  const main: BodyDef = {
    id: ref.body,
    mu: ref.mu,
    state: 'gauge',
    ...(opts.gs !== undefined ? { gs: opts.gs } : {}),
    ...(opts.gs1 !== undefined ? { gs1: opts.gs1, gsU0: opts.gsU0 ?? 0 } : {}),
  };
  const others: BodyDef[] = (ref.others ?? []).map((o) => ({
    id: o.id,
    mu: o.mu,
    state: o.stateAt(epoch),
    ...(opts.arcs ? { stateByArc: Object.fromEntries(opts.arcs.map((a) => [a.id, o.stateAt(a.epoch)])) } : {}),
  }));
  const engines: Record<string, { kE: number; dE: number }> = { ...(ref.engines ?? {}) };
  return {
    r0: ref.r0,
    n: ref.n,
    bodies: [main, ...others],
    ship: SHIP_REFS,
    dynamicBodies: others.length > 0,
    engine: { kE: ref.kE, dE: ref.dE },
    engines,
    kA: 1,
    camBias: ref.cam,
    ...(opts.profiles ? { profiles: opts.profiles } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// Windows (§5.1)
// ---------------------------------------------------------------------------------------------

export type Fix = Extract<EstMeasurement, { kind: 'opnav' }>;

export interface Window {
  readonly id: string;
  readonly arc: string;
  readonly index: number;
  readonly t0: number;
  readonly t1: number;
  readonly fixes: readonly Fix[];
  readonly powered: boolean;
  readonly rGeo: number;
  readonly rMin: number;
  readonly rMax: number;
  readonly sweep: number;
}

/** Range-and-bearing fixes on a body, sorted by time (stable). */
export function rangeFixes(arc: Arc, body: string): Fix[] {
  return arc.meas
    .filter((m): m is Fix => m.kind === 'opnav' && m.target === body && m.z.length === 2)
    .map((m, i) => [m, i] as const)
    .sort((a, b) => a[0].t - b[0].t || a[1] - b[1])
    .map((p) => p[0]);
}

export function makeWindows(arc: Arc, body: string, rule: WindowRule = DEFAULT_WINDOW_RULE): Window[] {
  const fx = rangeFixes(arc, body);
  const groups: { fixes: Fix[]; sweep: number; forced: boolean }[] = [];
  let cur: Fix[] = [];
  let sweep = 0;
  let lmin = Infinity;
  let lmax = -Infinity;
  const pw = (t: number) => poweredAt(arc.commands, t);
  for (const m of fx) {
    if (cur.length > 0 && pw(m.t) !== pw(cur[0]!.t)) {
      groups.push({ fixes: cur, sweep, forced: true });
      cur = [];
      sweep = 0;
      lmin = Infinity;
      lmax = -Infinity;
    }
    if (cur.length > 0) sweep += wrap(m.z[0]! - cur[cur.length - 1]!.z[0]!);
    cur.push(m);
    const lr = Math.log(m.z[1]!);
    lmin = Math.min(lmin, lr);
    lmax = Math.max(lmax, lr);
    if (cur.length >= rule.minFixes && (Math.abs(sweep) >= rule.sweep || lmax - lmin >= rule.lnRange)) {
      groups.push({ fixes: cur, sweep, forced: false });
      cur = [];
      sweep = 0;
      lmin = Infinity;
      lmax = -Infinity;
    }
  }
  if (cur.length > 0) {
    const prev = groups[groups.length - 1];
    if (cur.length < rule.minFixes && prev && !prev.forced && pw(prev.fixes[0]!.t) === pw(cur[0]!.t)) {
      groups.pop();
      groups.push({ fixes: [...prev.fixes, ...cur], sweep: prev.sweep + sweep, forced: false });
    } else if (cur.length >= rule.keepFixes) {
      groups.push({ fixes: cur, sweep, forced: false });
    }
  }
  return groups.map((g, k) => {
    const rr = g.fixes.map((q) => q.z[1]!);
    const meanLn = rr.reduce((s, r) => s + Math.log(r), 0) / rr.length;
    return {
      id: `${arc.id}.w${k}`,
      arc: arc.id,
      index: k,
      t0: g.fixes[0]!.t,
      t1: g.fixes[g.fixes.length - 1]!.t,
      fixes: g.fixes,
      powered: pw(g.fixes[0]!.t),
      rGeo: Math.exp(meanLn),
      rMin: Math.min(...rr),
      rMax: Math.max(...rr),
      sweep: Math.abs(g.sweep),
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Initial guesses (§4.5)
// ---------------------------------------------------------------------------------------------

/** Least-squares quadratic through the first fixes (ship relative to the body), at tEpoch. */
export function quadGuess(fixes: readonly Fix[], tEpoch: number, nfix = 10): [number, number, number, number] {
  const fx = fixes.slice(0, nfix);
  if (fx.length < 3) throw new Error('quadGuess: need at least three range fixes');
  const design = fromRows(fx.map((m) => {
    const tau = m.t - tEpoch;
    return [1, tau, 0.5 * tau * tau];
  }));
  const rhs = fromRows(fx.map((m) => [-m.z[1]! * Math.cos(m.z[0]!), -m.z[1]! * Math.sin(m.z[0]!)]));
  const c = lstsq(design, rhs);
  return [c.data[0]!, c.data[1]!, c.data[2]!, c.data[3]!];
}

/** Ship state guess at tEpoch from the first ≤ 10 range fixes on `body` (in record order). */
export function guessShip(arc: Arc, body: string, tEpoch = arc.epoch, nfix = 10): [number, number, number, number] {
  const fx = arc.meas.filter((m): m is Fix => m.kind === 'opnav' && m.target === body && m.z.length === 2);
  return quadGuess(fx, tEpoch, nfix);
}

/** Seen body state guess (§4.5): ship quadratic plus the measured offset, linear over ≤ 8 fixes. */
export function guessBody(arc: Arc, primary: string, target: string, tEpoch = arc.epoch, nfix = 8): [number, number, number, number] {
  const fxA = arc.meas.filter((m): m is Fix => m.kind === 'opnav' && m.target === primary && m.z.length === 2).slice(0, 10);
  const coef = lstsq(
    fromRows(fxA.map((m) => [1, m.t - tEpoch, 0.5 * (m.t - tEpoch) ** 2])),
    fromRows(fxA.map((m) => [-m.z[1]! * Math.cos(m.z[0]!), -m.z[1]! * Math.sin(m.z[0]!)])),
  );
  const fx = arc.meas.filter((m): m is Fix => m.kind === 'opnav' && m.target === target && m.z.length === 2).slice(0, nfix);
  const rows = fx.map((m) => {
    const tau = m.t - tEpoch;
    const sx = coef.data[0]! + coef.data[2]! * tau + coef.data[4]! * 0.5 * tau * tau;
    const sy = coef.data[1]! + coef.data[3]! * tau + coef.data[5]! * 0.5 * tau * tau;
    return [sx + m.z[1]! * Math.cos(m.z[0]!), sy + m.z[1]! * Math.sin(m.z[0]!)];
  });
  const c2 = lstsq(fromRows(fx.map((m) => [1, m.t - tEpoch])), fromRows(rows));
  return [c2.data[0]!, c2.data[1]!, c2.data[2]!, c2.data[3]!];
}

export function shipParams(id: string, guess: readonly number[]): Param[] {
  const sc = [1e3, 1e3, 1, 1];
  return ['x', 'y', 'vx', 'vy'].map((k, i) => ({ name: `${id}.ship.${k}`, init: guess[i]!, scale: sc[i]!, group: id }));
}

export function bodyStateParams(
  id: string,
  body: string,
  guess: readonly number[],
  prior?: { mean: readonly number[]; sigma: readonly number[] },
): Param[] {
  const sc = [1e3, 1e3, 0.1, 0.1];
  return ['x', 'y', 'vx', 'vy'].map((k, i) => ({
    name: `${id}.${body}.${k}`,
    init: guess[i]!,
    scale: sc[i]!,
    group: id,
    ...(prior ? { priorMean: prior.mean[i]!, priorSigma: prior.sigma[i]! } : {}),
  }));
}

// ---------------------------------------------------------------------------------------------
// Local fits (§5.2) and noise scale (§5.3)
// ---------------------------------------------------------------------------------------------

export interface WindowFit {
  readonly window: string;
  readonly arc: string;
  readonly body: string;
  readonly t0: number;
  readonly t1: number;
  readonly nFixes: number;
  readonly sweep: number;
  readonly rGeoMean: number;
  readonly rMin: number;
  readonly rMax: number;
  /** Gravity scale relative to the reference law. */
  readonly g: number;
  readonly sigma: number;
  readonly chi2PerDof: number;
  readonly converged: boolean;
  /** Mean direction of the ship as seen from the body over the window, rad (§9.2). */
  readonly azimuth: number;
}

/** Mean direction of the ship as seen from `body` over [t0, t1]: bearing to the body + π. */
export function azimuth(arc: Arc, body: string, t0: number, t1: number): number {
  let s = 0;
  let c = 0;
  for (const m of arc.meas) {
    if (m.kind !== 'opnav' || m.target !== body || m.t < t0 || m.t > t1) continue;
    s += Math.sin(m.z[0]! + Math.PI);
    c += Math.cos(m.z[0]! + Math.PI);
  }
  return Math.atan2(s, c);
}

export function localFit(
  ref: ReferenceLaw,
  arc: Arc,
  w: Window,
  dt: number,
  gPrior: readonly [number, number] = [1, 0.5],
): WindowFit {
  const sub: Arc = { id: w.id, epoch: w.t0, commands: arc.commands, meas: w.fixes };
  const st = refStructure(ref, w.t0, { gs: '{att}.g' });
  const params: Param[] = [
    ...shipParams(w.id, quadGuess(w.fixes, w.t0)),
    { name: `${w.id}.g`, init: gPrior[0], scale: 1e-3, priorMean: gPrior[0], priorSigma: gPrior[1], group: w.id },
  ];
  const res = new Problem(st, [sub], params, { dt }).solve(params.map((p) => p.init));
  const [g, sg] = fitGet(res, `${w.id}.g`);
  return {
    window: w.id,
    arc: w.arc,
    body: ref.body,
    t0: w.t0,
    t1: w.t1,
    nFixes: w.fixes.length,
    sweep: w.sweep,
    rGeoMean: w.rGeo,
    rMin: w.rMin,
    rMax: w.rMax,
    g,
    sigma: sg,
    chi2PerDof: fitChi2Nu(res),
    converged: res.converged,
    azimuth: azimuth(arc, ref.body, w.t0, w.t1),
  };
}

/** Local fits of every coasting window of every arc (optionally filtered). */
export function localFits(
  ref: ReferenceLaw,
  arcs: readonly Arc[],
  dt: number,
  opts: { rule?: WindowRule; gSigma?: number; accept?: (w: Window, arc: Arc) => boolean } = {},
): WindowFit[] {
  const rows: WindowFit[] = [];
  for (const a of arcs)
    for (const w of makeWindows(a, ref.body, opts.rule))
      if (!w.powered && w.fixes.length >= 3 && (opts.accept?.(w, a) ?? true))
        rows.push(localFit(ref, a, w, dt, [1, opts.gSigma ?? 0.5]));
  return rows;
}

function median(v: readonly number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return NaN;
  return n % 2 ? s[(n - 1) / 2]! : 0.5 * (s[n / 2 - 1]! + s[n / 2]!);
}

/** §5.3: s² = max(1, median window χ²/ν). */
export function noiseScale(rows: readonly WindowFit[]): number {
  if (rows.length === 0) return 1;
  return Math.max(1, median(rows.map((r) => r.chi2PerDof)));
}

// ---------------------------------------------------------------------------------------------
// Calibration profile (§5.4)
// ---------------------------------------------------------------------------------------------

export interface ProfileSettings {
  /** Node spacing in ln r. */
  readonly delta: number;
  /** Second-difference (smoothness) sigma. */
  readonly curvature: number;
  /** Negligible ridge toward 1. */
  readonly ridge: number;
}

export const DEFAULT_PROFILE_SETTINGS: ProfileSettings = { delta: 0.1, curvature: 0.01, ridge: 10 };

export interface ProfileFit {
  readonly body: string;
  readonly r0: number;
  readonly delta: number;
  /** Node positions ln(r / r0). */
  readonly uNodes: readonly number[];
  readonly g: readonly number[];
  readonly sigma: readonly number[];
  /** Node covariance, inflation included. */
  readonly covariance: Matrix;
  readonly rMin: number;
  readonly rMax: number;
  readonly chi2: number;
  readonly nu: number;
  readonly inflation: number;
  readonly nWindows: number;
}

export function buildProfile(
  rows: readonly WindowFit[],
  r0: number,
  body: string,
  ps: ProfileSettings = DEFAULT_PROFILE_SETTINGS,
): ProfileFit {
  if (rows.length === 0) throw new Error('buildProfile: no windows');
  const { delta, curvature: curv, ridge } = ps;
  const u = rows.map((r) => Math.log(r.rGeoMean / r0));
  const g = rows.map((r) => r.g);
  const W = rows.map((r) => 1 / (r.sigma * r.sigma));
  const rMin = Math.min(...rows.map((r) => r.rMin));
  const rMax = Math.max(...rows.map((r) => r.rMax));
  const b0 = Math.floor(Math.log(rMin / r0) / delta);
  let b1 = Math.ceil(Math.log(rMax / r0) / delta);
  if (b1 === b0) b1 += 1;
  const nodes: number[] = [];
  for (let b = b0; b <= b1; b++) nodes.push(b * delta);
  const nn = nodes.length;
  const K = u.length;
  const A = zeros(K, nn);
  for (let k = 0; k < K; k++) {
    const x = Math.min(Math.max((u[k]! - nodes[0]!) / delta, 0), nn - 1);
    const i0 = Math.min(Math.floor(x), nn - 2);
    const wt = x - i0;
    A.data[k * nn + i0] = 1 - wt;
    A.data[k * nn + i0 + 1] = wt;
  }
  const Hd = zeros(nn, nn);
  const rhs = new Float64Array(nn);
  for (let k = 0; k < K; k++)
    for (let i = 0; i < nn; i++) {
      const aki = A.data[k * nn + i]!;
      if (aki === 0) continue;
      rhs[i]! += aki * W[k]! * g[k]!;
      for (let j = 0; j < nn; j++) Hd.data[i * nn + j]! += aki * W[k]! * A.data[k * nn + j]!;
    }
  const H = zeros(nn, nn);
  H.data.set(Hd.data);
  const c2 = 1 / (curv * curv);
  for (let r = 0; r + 2 < nn; r++) {
    const d = [1, -2, 1];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) H.data[(r + a) * nn + (r + b)]! += d[a]! * d[b]! * c2;
  }
  const rr = 1 / (ridge * ridge);
  for (let i = 0; i < nn; i++) {
    H.data[i * nn + i]! += rr;
    rhs[i]! += rr;
  }
  const c = solve(H, rhs);
  const C = inverse(H);
  let chi2 = 0;
  for (let k = 0; k < K; k++) {
    let ac = 0;
    for (let i = 0; i < nn; i++) ac += A.data[k * nn + i]! * c[i]!;
    chi2 += W[k]! * (ac - g[k]!) ** 2;
  }
  let tr = 0;
  for (let i = 0; i < nn; i++) for (let j = 0; j < nn; j++) tr += Hd.data[i * nn + j]! * C.data[j * nn + i]!;
  const nu = Math.max(1, K - tr);
  const inflation = Math.max(1, chi2 / nu);
  const Ci = { rows: nn, cols: nn, data: C.data.map((v) => v * inflation) };
  return {
    body,
    r0,
    delta,
    uNodes: nodes,
    g: Array.from(c),
    sigma: Array.from({ length: nn }, (_, i) => Math.sqrt(Ci.data[i * nn + i]!)),
    covariance: Ci,
    rMin,
    rMax,
    chi2,
    nu,
    inflation,
    nWindows: K,
  };
}

/** ProfileDef for the calibrated law; optional per-node perturbation refs and hedge exponent. */
export function profileDef(prof: ProfileFit, dNodes?: readonly string[], eta?: string): ProfileDef {
  const lr0 = Math.log(prof.r0);
  return {
    body: prof.body,
    uNodes: prof.uNodes.map((v) => lr0 + v),
    gNodes: prof.g,
    rMin: prof.rMin,
    rMax: prof.rMax,
    ...(dNodes ? { dNodes } : {}),
    ...(eta !== undefined ? { eta } : {}),
  };
}

/** Covered range only (g ≡ 1): lets the hedge act on a body without a profile (§8.2). */
export function flatProfile(body: string, rMin: number, rMax: number, r0: number): ProfileFit {
  const lo = Math.log(rMin / r0);
  const hi = Math.max(Math.log(rMax / r0), lo + 1e-6);
  return {
    body,
    r0,
    delta: hi - lo,
    uNodes: [lo, hi],
    g: [1, 1],
    sigma: [0, 0],
    covariance: zeros(2, 2),
    rMin,
    rMax: Math.exp(hi) * r0,
    chi2: 0,
    nu: 1,
    inflation: 1,
    nWindows: 0,
  };
}

// ---------------------------------------------------------------------------------------------
// Present state (§8.1)
// ---------------------------------------------------------------------------------------------

export interface AnchorInfo {
  readonly windows: readonly string[];
  readonly tFirst: number;
  readonly tLast: number;
  readonly nFixes: number;
  readonly pivotLnR: number;
  readonly g: number;
  readonly gSigma: number;
  readonly g1: number;
  readonly g1Sigma: number;
  readonly chi2PerDof: number;
  readonly converged: boolean;
}

export interface Anchor {
  /** Time of the last fix used. */
  readonly tNow: number;
  /** Ship state (x, y, vx, vy) relative to the reference body (gauge of tFirst). */
  readonly state: Float64Array;
  /** 4×4 covariance (before s²). */
  readonly covariance: Matrix;
  readonly info: AnchorInfo;
}

/**
 * Fit the most recent window(s) on the calibrated law with a free local scale and slope in
 * ln r, propagated to the last fix (§8.1). `prof` null gives the bare reference law.
 */
export function anchorState(
  ref: ReferenceLaw,
  prof: ProfileFit | null,
  arc: Arc,
  wins: readonly Window[],
  dt: number,
  opts: { h?: number; gPrior?: readonly [number, number]; slopeSigma?: number; extraProfiles?: readonly ProfileFit[] } = {},
): Anchor {
  const h = opts.h ?? 1e-3;
  const gPrior = opts.gPrior ?? [1, 0.5];
  const slopeSigma = opts.slopeSigma ?? 0.2;
  const fixes = wins.flatMap((w) => w.fixes);
  const aid = `${arc.id}.anchor`;
  const tFirst = fixes[0]!.t;
  const tLast = fixes[fixes.length - 1]!.t;
  const u0 = fixes.reduce((s, m) => s + Math.log(m.z[1]!), 0) / fixes.length;
  const sub: Arc = { id: aid, epoch: tFirst, commands: arc.commands, meas: fixes };
  const profiles = [...(prof ? [profileDef(prof)] : []), ...(opts.extraProfiles ?? []).map((p) => profileDef(p))];
  const st = refStructure(ref, tFirst, { gs: '{att}.g', gs1: '{att}.g1', gsU0: u0, profiles });
  const params: Param[] = [
    ...shipParams(aid, quadGuess(fixes, tFirst)),
    { name: `${aid}.g`, init: gPrior[0], scale: 1e-3, priorMean: gPrior[0], priorSigma: gPrior[1], group: aid },
    { name: `${aid}.g1`, init: 0, scale: 1e-2, priorMean: 0, priorSigma: slopeSigma, group: aid },
  ];
  const prob = new Problem(st, [sub], params, { dt });
  const res = prob.solve(params.map((p) => p.init));
  const q = res.x.length;
  const ca = compileArc(st, sub, prob.idx);
  // Ship relative to the reference body (equal to the gauge state when it is the only body).
  const rel = (xv: ArrayLike<number>) => shipAndBodies(ca, xv, [tLast], dt).state[0]!;
  const xNow = rel(res.x);
  const Jm = zeros(4, q);
  const xp = new Float64Array(res.x);
  for (let i = 0; i < q; i++) {
    const step = h * prob.scale[i]!;
    xp[i] = res.x[i]! + step;
    const sp = rel(xp);
    xp[i] = res.x[i]! - step;
    const sm = rel(xp);
    xp[i] = res.x[i]!;
    for (let r = 0; r < 4; r++) Jm.data[r * q + i] = (sp[r]! - sm[r]!) / (2 * step);
  }
  const PNow = sandwich(Jm, res.P);
  const [g, gS] = fitGet(res, `${aid}.g`);
  const [g1, g1S] = fitGet(res, `${aid}.g1`);
  return {
    tNow: tLast,
    state: xNow,
    covariance: PNow,
    info: {
      windows: wins.map((w) => w.id),
      tFirst,
      tLast,
      nFixes: fixes.length,
      pivotLnR: u0,
      g,
      gSigma: gS,
      g1,
      g1Sigma: g1S,
      chi2PerDof: fitChi2Nu(res),
      converged: res.converged,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Forecast core (§8.2–§8.4)
// ---------------------------------------------------------------------------------------------

export interface CovSplit {
  readonly state: Matrix;
  readonly profile: Matrix;
  readonly hedge: Matrix;
  readonly engine: Matrix;
  readonly mass: Matrix;
  readonly total: Matrix;
}

export interface ForecastCoreResult {
  readonly times: readonly number[];
  /** Ship state relative to the reference body: x, y, vx, vy. */
  readonly mean: readonly Float64Array[];
  /** Other modelled bodies relative to the reference body, per time: [x, y, vx, vy] per body. */
  readonly bodies: readonly Float64Array[];
  readonly cov: readonly CovSplit[];
}

export interface ForecastCoreInput {
  readonly ref: ReferenceLaw;
  /** Calibration profiles (reference body first if it has one). */
  readonly profiles: readonly ProfileFit[];
  readonly commands: readonly ThrustSegment[];
  readonly tNow: number;
  readonly xNow: ArrayLike<number>;
  readonly PNow: Matrix;
  readonly times: readonly number[];
  readonly dt: number;
  /** Noise scale s² on the present-state covariance. */
  readonly s2: number;
  /** Hedge σ_h (0 disables). */
  readonly sigmaH: number;
  /** Engine σ for planned burns: kE, dE of the default engine (ref.kE, ref.dE). */
  readonly engineSigma: readonly [number, number];
  /** Per-thruster σ (kE, dE); values come from ref.engines. */
  readonly engineSigmas?: Readonly<Record<string, readonly [number, number]>>;
  /** σ of μ for frozen bodies without a profile (§8.2). */
  readonly muSigma?: Readonly<Record<string, number>>;
  readonly h?: number;
}

/**
 * Linearised forecast (§8.3) from the present state under the calibrated law, with the
 * position covariance split by source: state, profile nodes, hedge, engine, body masses.
 */
export function forecastCore(inp: ForecastCoreInput): ForecastCoreResult {
  const { ref, profiles } = inp;
  const h = inp.h ?? 1e-3;
  const aid = 'fc';
  const names: string[] = ['fc.ship.x', 'fc.ship.y', 'fc.ship.vx', 'fc.ship.vy', 'f.kE', 'f.dE'];
  const x: number[] = [...Array.from(inp.xNow), ref.kE, ref.dE];
  const scale: number[] = [1e3, 1e3, 1, 1, 1e-3, 1e-3];
  const engineCols: [number, number][] = [[4, inp.engineSigma[0]], [5, inp.engineSigma[1]]];
  const engines: Record<string, { kE: string; dE: string }> = {};
  for (const [thr, e] of Object.entries(ref.engines ?? {})) {
    const sig = inp.engineSigmas?.[thr] ?? [0, 0];
    engines[thr] = { kE: `f.kE.${thr}`, dE: `f.dE.${thr}` };
    engineCols.push([names.length, sig[0]], [names.length + 1, sig[1]]);
    names.push(`f.kE.${thr}`, `f.dE.${thr}`);
    x.push(e.kE, e.dE);
    scale.push(1e-3, 1e-3);
  }
  const etaIdx: number[] = [];
  const nodeIdx: number[][] = [];
  const pdefs: ProfileDef[] = profiles.map((p, j) => {
    etaIdx.push(names.length);
    names.push(`f.eta${j}`);
    x.push(0);
    scale.push(1e-2);
    const nodes: string[] = [];
    const idxs: number[] = [];
    p.g.forEach((_, b) => {
      idxs.push(names.length);
      nodes.push(`f.c${j}.${b}`);
      names.push(`f.c${j}.${b}`);
      x.push(0);
      scale.push(1e-2);
    });
    nodeIdx.push(idxs);
    return profileDef(p, nodes, `f.eta${j}`);
  });
  const muIdx: [number, number][] = [];
  const others = (ref.others ?? []).map((o) => {
    const sig = inp.muSigma?.[o.id];
    if (sig !== undefined && sig > 0) {
      muIdx.push([names.length, sig]);
      names.push(`f.mu.${o.id}`);
      x.push(o.mu);
      scale.push(Math.max(1e-3 * Math.abs(o.mu), sig * 1e-2));
      return { ...o, muRef: `f.mu.${o.id}` as string | number };
    }
    return { ...o, muRef: o.mu as string | number };
  });
  const st: Structure = {
    r0: ref.r0,
    n: ref.n,
    bodies: [
      { id: ref.body, mu: ref.mu, state: 'gauge' },
      ...others.map((o) => ({ id: o.id, mu: o.muRef, state: o.stateAt(inp.tNow) })),
    ],
    ship: ['fc.ship.x', 'fc.ship.y', 'fc.ship.vx', 'fc.ship.vy'],
    dynamicBodies: others.length > 0,
    engine: { kE: 'f.kE', dE: 'f.dE' },
    engines,
    kA: 1,
    camBias: ref.cam,
    profiles: pdefs,
  };
  const idx = new Map(names.map((n, i) => [n, i]));
  const ca = compileArc(st, { id: aid, epoch: inp.tNow, commands: inp.commands }, idx);
  const order = inp.times.map((t, i) => [t, i] as const).sort((a, b) => a[0] - b[0]);
  const sortedTimes = order.map((o) => o[0]);
  const run = (xv: ArrayLike<number>) => {
    // simulate via shipStates-like path but keep body positions too
    return shipAndBodies(ca, xv, sortedTimes, inp.dt);
  };
  const base = run(x);
  const q = x.length;
  const T = sortedTimes.length;
  const S: Float64Array[] = []; // per param: d(rel pos)/dq, length 2T
  const xp = Float64Array.from(x);
  for (let i = 0; i < q; i++) {
    const step = h * scale[i]!;
    xp[i] = x[i]! + step;
    const plus = run(xp).rel;
    xp[i] = x[i]! - step;
    const minus = run(xp).rel;
    xp[i] = x[i]!;
    const col = new Float64Array(2 * T);
    for (let k = 0; k < T; k++) {
      col[2 * k] = (plus[k]![0]! - minus[k]![0]!) / (2 * step);
      col[2 * k + 1] = (plus[k]![1]! - minus[k]![1]!) / (2 * step);
    }
    S.push(col);
  }
  const outer = (cols: readonly number[], C: (a: number, b: number) => number, k: number): Matrix => {
    const m = zeros(2, 2);
    for (let a = 0; a < cols.length; a++)
      for (let b = 0; b < cols.length; b++) {
        const c = C(a, b);
        if (c === 0) continue;
        const sa = S[cols[a]!]!;
        const sb = S[cols[b]!]!;
        m.data[0]! += sa[2 * k]! * c * sb[2 * k]!;
        m.data[1]! += sa[2 * k]! * c * sb[2 * k + 1]!;
        m.data[2]! += sa[2 * k + 1]! * c * sb[2 * k]!;
        m.data[3]! += sa[2 * k + 1]! * c * sb[2 * k + 1]!;
      }
    return m;
  };
  const add = (...ms: Matrix[]) => {
    const m = zeros(2, 2);
    for (const q2 of ms) for (let i = 0; i < 4; i++) m.data[i]! += q2.data[i]!;
    return m;
  };
  const sh2 = inp.sigmaH * inp.sigmaH;
  const covs: CovSplit[] = new Array(T);
  const means: Float64Array[] = new Array(T);
  const bodies: Float64Array[] = new Array(T);
  for (let k = 0; k < T; k++) {
    const state = outer([0, 1, 2, 3], (a, b) => inp.s2 * inp.PNow.data[a * 4 + b]!, k);
    const engine = outer(
      engineCols.map((c) => c[0]),
      (a, b) => (a === b ? engineCols[a]![1] ** 2 : 0),
      k,
    );
    const hedge = outer(etaIdx, (a, b) => (a === b ? sh2 : 0), k);
    const profile = add(
      ...profiles.map((p, j) => outer(nodeIdx[j]!, (a, b) => p.covariance.data[a * p.covariance.cols + b]!, k)),
    );
    const mass = add(...muIdx.map(([i, sig]) => outer([i], () => sig * sig, k)));
    covs[k] = { state, profile, hedge, engine, mass, total: add(state, profile, hedge, engine, mass) };
    means[k] = base.state[k]!;
    bodies[k] = base.bodies[k]!;
  }
  // restore requested order
  const outMean: Float64Array[] = new Array(T);
  const outCov: CovSplit[] = new Array(T);
  const outBodies: Float64Array[] = new Array(T);
  order.forEach(([, i], k) => {
    outMean[i] = means[k]!;
    outCov[i] = covs[k]!;
    outBodies[i] = bodies[k]!;
  });
  return { times: inp.times, mean: outMean, bodies: outBodies, cov: outCov };
}

/**
 * Ship state and other bodies relative to the reference body (body 0) at sorted times.
 * Positions and velocities are differences from body 0 (which is at rest only at the epoch).
 */
function shipAndBodies(
  ca: CompiledArc,
  x: ArrayLike<number>,
  times: readonly number[],
  dt: number,
): { state: Float64Array[]; rel: Float64Array[]; bodies: Float64Array[] } {
  const traj = simulate(ca, x, times, dt);
  const nb = ca.nb;
  const s = nb;
  const state: Float64Array[] = [];
  const rel: Float64Array[] = [];
  const bodies: Float64Array[] = [];
  traj.pos.forEach((p, k) => {
    const v = traj.vel[k]!;
    state.push(Float64Array.of(p[2 * s]! - p[0]!, p[2 * s + 1]! - p[1]!, v[2 * s]! - v[0]!, v[2 * s + 1]! - v[1]!));
    rel.push(Float64Array.of(p[2 * s]! - p[0]!, p[2 * s + 1]! - p[1]!));
    const o = new Float64Array(4 * (nb - 1));
    for (let j = 1; j < nb; j++) {
      o[4 * (j - 1)] = p[2 * j]! - p[0]!;
      o[4 * (j - 1) + 1] = p[2 * j + 1]! - p[1]!;
      o[4 * (j - 1) + 2] = v[2 * j]! - v[0]!;
      o[4 * (j - 1) + 3] = v[2 * j + 1]! - v[1]!;
    }
    bodies.push(o);
  });
  return { state, rel, bodies };
}

/** √(largest eigenvalue) of a 2×2 covariance. */
export function majorSigma(c: Matrix): number {
  const [, l] = symEig2(c.data[0]!, 0.5 * (c.data[1]! + c.data[2]!), c.data[3]!);
  return Math.sqrt(Math.max(l, 0));
}

/** Mahalanobis distance of a 2-vector deviation under a 2×2 covariance. */
export function mahalanobis(dev: readonly [number, number], c: Matrix): number {
  const v = solve(c, dev);
  return Math.sqrt(dev[0] * v[0]! + dev[1] * v[1]!);
}

// ---------------------------------------------------------------------------------------------
// Earned hedge (§7.4)
// ---------------------------------------------------------------------------------------------

export interface EarnedHedge {
  readonly nWindowsOutside: number;
  readonly delta?: number;
  readonly ell?: number;
  readonly sigmaH: number;
}

export function earnedHedge(
  heldOutRows: readonly WindowFit[],
  trainRMin: number,
  trainRMax: number,
  sigmaN: number,
  sigmaH0: number,
  floor = 0.01,
): EarnedHedge {
  const ext: [number, number][] = [];
  for (const r of heldOutRows) {
    if (r.rGeoMean < trainRMin) ext.push([r.g - 1, Math.log(trainRMin / r.rGeoMean)]);
    else if (r.rGeoMean > trainRMax) ext.push([r.g - 1, Math.log(r.rGeoMean / trainRMax)]);
  }
  if (ext.length === 0) return { nWindowsOutside: 0, sigmaH: sigmaH0 };
  const delta = Math.sqrt(ext.reduce((s, e) => s + e[0] * e[0], 0) / ext.length);
  const ell = ext.reduce((s, e) => s + e[1], 0) / ext.length;
  const v = Math.sqrt(sigmaN * sigmaN + (delta / ell) ** 2);
  return { nWindowsOutside: ext.length, delta, ell, sigmaH: Math.min(sigmaH0, Math.max(floor, v)) };
}
