/**
 * Tier L (1G spec revision 3, §5) and the forecast core (§8), in three dimensions: windows of
 * equal swept angle (the sweep is a vector), short-arc local fits with a six-number state, the
 * noise scale, the per-body gravity calibration profile, the present state with the camera
 * misalignment, the linearised forecast with a 3×3 position covariance per sample split by
 * source, and the earned hedge (§7.4).
 *
 * Distances the model tracks (covered range, profile nodes, validated spans) are radial scalars
 * (A11): nothing in the profile or the hedge has a direction.
 */

import {
  bodyRefs,
  compileArc,
  hasRange,
  lineOfSight,
  poweredAt,
  shipRefs,
  simulate,
  STATE_KEYS,
  type Arc,
  type ArcSolution,
  type BodyDef,
  type CompiledArc,
  type EngineDef,
  type Fix,
  type ProfileDef,
  type State6,
  type Structure,
  type ThrustSegment,
} from './dynamics.ts';
import { fromRows, inverse, lstsq, sandwich, solve, symEig, zeros, type Matrix } from './linalg.ts';
import { Problem, fitChi2Nu, fitGet, type Param } from './solve.ts';

export type { Fix } from './dynamics.ts';

export type Vec3T = readonly [number, number, number];

// ---------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------

/** Window rule (§5.1) and profile constants (§5.4). [ASSUMED] */
export interface WindowRule {
  /** Close a window after the line of sight sweeps this much, rad. */
  readonly sweep: number;
  /** … or ln(range) spans this much. */
  readonly lnRange: number;
  readonly minFixes: number;
  /** A tail shorter than this is dropped. */
  readonly keepFixes: number;
}

export const DEFAULT_WINDOW_RULE: WindowRule = {
  sweep: 0.7,
  lnRange: 0.15,
  minFixes: 12,
  keepFixes: 6,
};

// ---------------------------------------------------------------------------------------------
// Reference law (§5.2): the adopted structure with its globals frozen
// ---------------------------------------------------------------------------------------------

/** Another modelled body, frozen at its believed state relative to the reference body. */
export interface FrozenBody {
  readonly id: string;
  readonly mu: number;
  /** Believed state (six numbers) relative to the reference body at time t (that body at rest). */
  readonly stateAt: (t: number) => State6;
}

export interface EngineValues {
  readonly kE: number;
  readonly dE: number;
  readonly dP: number;
}

export interface ReferenceLaw {
  readonly r0: number;
  /** Reference body id (the primary of local fits). */
  readonly body: string;
  readonly mu: number;
  readonly n: number;
  /** Camera misalignment, body frame (x, y, z); z is the planar bias. */
  readonly cam: Vec3T;
  readonly kE: number;
  readonly dE: number;
  readonly dP?: number;
  /** RCS translation scale. Default 1. */
  readonly kR?: number;
  /** Per-thruster engine values, if they differ from kE/dE/dP. */
  readonly engines?: Readonly<Record<string, EngineValues>>;
  readonly others?: readonly FrozenBody[];
  /**
   * Planar reduction (§1, A.3): states are fitted in the x–y plane, z and vz held at the fixed
   * number 0. The measurements must then carry no out-of-plane rows.
   */
  readonly planar?: boolean;
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
    ...(opts.arcs
      ? { stateByArc: Object.fromEntries(opts.arcs.map((a) => [a.id, o.stateAt(a.epoch)])) }
      : {}),
  }));
  const engines: Record<string, EngineDef> = { ...(ref.engines ?? {}) };
  return {
    r0: ref.r0,
    n: ref.n,
    bodies: [main, ...others],
    ship: shipRefs(ref.planar),
    dynamicBodies: others.length > 0,
    engine: { kE: ref.kE, dE: ref.dE, dP: ref.dP ?? 0 },
    engines,
    kR: ref.kR ?? 1,
    kA: 1,
    camBias: ref.cam,
    ...(opts.profiles ? { profiles: opts.profiles } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// Windows (§5.1)
// ---------------------------------------------------------------------------------------------

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
  /** Size of the swept angle, rad. */
  readonly sweep: number;
  /** Unit sweep vector: the axis the line of sight turned about (the orbit normal); zero if none. */
  readonly planeNormal: Vec3T;
  /** Mean direction of the ship as seen from the body over the window's fixes (unit). */
  readonly direction: Vec3T;
}

/** Range-and-bearing fixes on a body, sorted by time (stable). */
export function rangeFixes(arc: Arc, body: string): Fix[] {
  return arc.meas
    .filter((m): m is Fix => hasRange(m) && m.target === body)
    .map((m, i) => [m, i] as const)
    .sort((a, b) => a[0].t - b[0].t || a[1] - b[1])
    .map((p) => p[0]);
}

/**
 * Rotation vector of the line of sight between two fixes: the angle between the two unit
 * vectors, along a × b. Planar data give wrap(Δ bearing) about z.
 */
function sweepStep(a: readonly number[], b: readonly number[]): [number, number, number] {
  const cx = a[1]! * b[2]! - a[2]! * b[1]!;
  const cy = a[2]! * b[0]! - a[0]! * b[2]!;
  const cz = a[0]! * b[1]! - a[1]! * b[0]!;
  const s = Math.sqrt(cx * cx + cy * cy + cz * cz);
  if (s === 0) return [0, 0, 0];
  const k = Math.atan2(s, a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!) / s;
  return [k * cx, k * cy, k * cz];
}

function windowOf(
  id: string,
  arcId: string,
  index: number,
  fixes: readonly Fix[],
  sweep: readonly number[],
  powered: boolean,
): Window {
  const rr = fixes.map((q) => q.z[2]!);
  const meanLn = rr.reduce((s, r) => s + Math.log(r), 0) / rr.length;
  const mag = Math.hypot(sweep[0]!, sweep[1]!, sweep[2]!);
  const d = [0, 0, 0];
  for (const q of fixes) {
    const l = lineOfSight(q);
    d[0]! -= l[0];
    d[1]! -= l[1];
    d[2]! -= l[2];
  }
  const dn = Math.hypot(d[0]!, d[1]!, d[2]!);
  return {
    id,
    arc: arcId,
    index,
    t0: fixes[0]!.t,
    t1: fixes[fixes.length - 1]!.t,
    fixes,
    powered,
    rGeo: Math.exp(meanLn),
    rMin: Math.min(...rr),
    rMax: Math.max(...rr),
    sweep: mag,
    planeNormal: mag > 0 ? [sweep[0]! / mag, sweep[1]! / mag, sweep[2]! / mag] : [0, 0, 0],
    direction: dn > 0 ? [d[0]! / dn, d[1]! / dn, d[2]! / dn] : [d[0]!, d[1]!, d[2]!],
  };
}

/**
 * §5.1: the sweep is a vector, the sum of the line of sight's rotation vectors between
 * consecutive fixes. A window closes once it holds minFixes and either |sweep| or the spread of
 * ln(range) reaches its limit; it always closes when thrust (engine or RCS) turns on or off.
 */
export function makeWindows(
  arc: Arc,
  body: string,
  rule: WindowRule = DEFAULT_WINDOW_RULE,
): Window[] {
  const fx = rangeFixes(arc, body);
  const groups: { fixes: Fix[]; sweep: [number, number, number]; forced: boolean }[] = [];
  let cur: Fix[] = [];
  let sweep: [number, number, number] = [0, 0, 0];
  let last: [number, number, number] = [0, 0, 0];
  let lmin = Infinity;
  let lmax = -Infinity;
  const pw = (t: number) => poweredAt(arc.commands, t);
  const reset = () => {
    cur = [];
    sweep = [0, 0, 0];
    lmin = Infinity;
    lmax = -Infinity;
  };
  for (const m of fx) {
    if (cur.length > 0 && pw(m.t) !== pw(cur[0]!.t)) {
      groups.push({ fixes: cur, sweep, forced: true });
      reset();
    }
    const los = lineOfSight(m);
    if (cur.length > 0) {
      const st = sweepStep(last, los);
      sweep = [sweep[0] + st[0], sweep[1] + st[1], sweep[2] + st[2]];
    }
    last = los;
    cur.push(m);
    const lr = Math.log(m.z[2]!);
    lmin = Math.min(lmin, lr);
    lmax = Math.max(lmax, lr);
    if (
      cur.length >= rule.minFixes &&
      (Math.hypot(sweep[0], sweep[1], sweep[2]) >= rule.sweep || lmax - lmin >= rule.lnRange)
    ) {
      groups.push({ fixes: cur, sweep, forced: false });
      reset();
    }
  }
  if (cur.length > 0) {
    const prev = groups[groups.length - 1];
    if (
      cur.length < rule.minFixes &&
      prev &&
      !prev.forced &&
      pw(prev.fixes[0]!.t) === pw(cur[0]!.t)
    ) {
      // The sweeps add; the step between the two groups was never counted in either.
      groups.pop();
      groups.push({
        fixes: [...prev.fixes, ...cur],
        sweep: [prev.sweep[0] + sweep[0], prev.sweep[1] + sweep[1], prev.sweep[2] + sweep[2]],
        forced: false,
      });
    } else if (cur.length >= rule.keepFixes) {
      groups.push({ fixes: cur, sweep, forced: false });
    }
  }
  return groups.map((g, k) =>
    windowOf(`${arc.id}.w${k}`, arc.id, k, g.fixes, g.sweep, pw(g.fixes[0]!.t)),
  );
}

/** All range fixes of an arc on `body` as one window (a short track not yet cut into windows). */
export function wholeArcWindow(arc: Arc, body: string, powered = false): Window | null {
  const fixes = rangeFixes(arc, body);
  if (fixes.length === 0) return null;
  let sweep: [number, number, number] = [0, 0, 0];
  for (let i = 1; i < fixes.length; i++) {
    const st = sweepStep(lineOfSight(fixes[i - 1]!), lineOfSight(fixes[i]!));
    sweep = [sweep[0] + st[0], sweep[1] + st[1], sweep[2] + st[2]];
  }
  return windowOf(`${arc.id}.all`, arc.id, 0, fixes, sweep, powered);
}

// ---------------------------------------------------------------------------------------------
// Initial guesses (§4.5)
// ---------------------------------------------------------------------------------------------

/** Measured ship position relative to the fix's target: −ρ m. */
function measuredPosition(m: Fix): [number, number, number] {
  const l = lineOfSight(m);
  const r = m.z[2]!;
  return [-r * l[0], -r * l[1], -r * l[2]];
}

/** Least-squares quadratic through the first fixes (ship relative to the body), at tEpoch. */
export function quadGuess(fixes: readonly Fix[], tEpoch: number, nfix = 10): State6 {
  const fx = fixes.slice(0, nfix);
  if (fx.length < 3) throw new Error('quadGuess: need at least three range fixes');
  const design = fromRows(
    fx.map((m) => {
      const tau = m.t - tEpoch;
      return [1, tau, 0.5 * tau * tau];
    }),
  );
  const c = lstsq(design, fromRows(fx.map(measuredPosition)));
  return [c.data[0]!, c.data[1]!, c.data[2]!, c.data[3]!, c.data[4]!, c.data[5]!];
}

/** Ship state guess at tEpoch from the first ≤ 10 range fixes on `body` (in record order). */
export function guessShip(arc: Arc, body: string, tEpoch = arc.epoch, nfix = 10): State6 {
  const fx = arc.meas.filter((m): m is Fix => hasRange(m) && m.target === body);
  return quadGuess(fx, tEpoch, nfix);
}

/** Seen body state guess (§4.5): ship quadratic plus the measured offset, linear over ≤ 8 fixes. */
export function guessBody(
  arc: Arc,
  primary: string,
  target: string,
  tEpoch = arc.epoch,
  nfix = 8,
): State6 {
  const fxA = arc.meas.filter((m): m is Fix => hasRange(m) && m.target === primary).slice(0, 10);
  const coef = lstsq(
    fromRows(fxA.map((m) => [1, m.t - tEpoch, 0.5 * (m.t - tEpoch) ** 2])),
    fromRows(fxA.map(measuredPosition)),
  );
  const fx = arc.meas.filter((m): m is Fix => hasRange(m) && m.target === target).slice(0, nfix);
  const rows = fx.map((m) => {
    const tau = m.t - tEpoch;
    const off = measuredPosition(m);
    return [0, 1, 2].map(
      (c) =>
        coef.data[c]! + coef.data[3 + c]! * tau + coef.data[6 + c]! * 0.5 * tau * tau - off[c]!,
    );
  });
  const c2 = lstsq(fromRows(fx.map((m) => [1, m.t - tEpoch])), fromRows(rows));
  return [c2.data[0]!, c2.data[1]!, c2.data[2]!, c2.data[3]!, c2.data[4]!, c2.data[5]!];
}

const SHIP_SCALE = [1e3, 1e3, 1e3, 1, 1, 1];
const BODY_SCALE = [1e3, 1e3, 1e3, 0.1, 0.1, 0.1];
/** Indices of the state components that are parameters: all six, or x, y, vx, vy when planar. */
const stateKeep = (planar: boolean) => (planar ? [0, 1, 3, 4] : [0, 1, 2, 3, 4, 5]);

/** Ship state parameters from a six-number guess; `planar` leaves z and vz out (held at 0). */
export function shipParams(id: string, guess: readonly number[], planar = false): Param[] {
  return stateKeep(planar).map((i) => ({
    name: `${id}.ship.${STATE_KEYS[i]!}`,
    init: guess[i]!,
    scale: SHIP_SCALE[i]!,
    group: id,
  }));
}

/** State parameters of a moving body; `planar` leaves z and vz out (held at 0). */
export function bodyStateParams(
  id: string,
  body: string,
  guess: readonly number[],
  prior?: { mean: readonly number[]; sigma: readonly number[] },
  planar = false,
): Param[] {
  return stateKeep(planar).map((i) => ({
    name: `${id}.${body}.${STATE_KEYS[i]!}`,
    init: guess[i]!,
    scale: BODY_SCALE[i]!,
    group: id,
    ...(prior ? { priorMean: prior.mean[i]!, priorSigma: prior.sigma[i]! } : {}),
  }));
}

export { bodyRefs, shipRefs };

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
  /** Mean direction of the ship as seen from the body over the window: a unit vector (§9.2). */
  readonly direction: Vec3T;
  /** The axis the line of sight turned about: the orbit normal of the window (§5.1). */
  readonly planeNormal: Vec3T;
}

export interface LocalFitResult {
  readonly row: WindowFit;
  /** The window's own fit: the ship's path over the window, relative to the window's body. */
  readonly solution: ArcSolution;
}

export function localFit(
  ref: ReferenceLaw,
  arc: Arc,
  w: Window,
  dt: number,
  gPrior: readonly [number, number] = [1, 0.5],
): WindowFit {
  return localFitDetailed(ref, arc, w, dt, gPrior).row;
}

/** §5.2: window state (six numbers; four in the planar reduction) and a local gravity scale. */
export function localFitDetailed(
  ref: ReferenceLaw,
  arc: Arc,
  w: Window,
  dt: number,
  gPrior: readonly [number, number] = [1, 0.5],
): LocalFitResult {
  const sub: Arc = { id: w.id, epoch: w.t0, commands: arc.commands, meas: w.fixes };
  const st = refStructure(ref, w.t0, { gs: '{att}.g' });
  const params: Param[] = [
    ...shipParams(w.id, quadGuess(w.fixes, w.t0), ref.planar),
    {
      name: `${w.id}.g`,
      init: gPrior[0],
      scale: 1e-3,
      priorMean: gPrior[0],
      priorSigma: gPrior[1],
      group: w.id,
    },
  ];
  const prob = new Problem(st, [sub], params, { dt });
  const res = prob.solve(params.map((p) => p.init));
  const [g, sg] = fitGet(res, `${w.id}.g`);
  const solution: ArcSolution = {
    arc: sub,
    structure: st,
    x: res.x,
    idx: prob.idx,
    P: res.P,
    rel: params.map((_, i) => i),
    scale: prob.scale,
  };
  const row: WindowFit = {
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
    direction: w.direction,
    planeNormal: w.planeNormal,
  };
  return { row, solution };
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
// Calibration profile (§5.4): indexed by distance alone
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
    for (let a = 0; a < 3; a++)
      for (let b = 0; b < 3; b++) H.data[(r + a) * nn + (r + b)]! += d[a]! * d[b]! * c2;
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
  for (let i = 0; i < nn; i++)
    for (let j = 0; j < nn; j++) tr += Hd.data[i * nn + j]! * C.data[j * nn + i]!;
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

/** The profile's scale at distance r: linear between nodes, held at its edge values (§5.4). */
export function profileAt(prof: ProfileFit, r: number): number {
  const nn = prof.uNodes.length;
  const u = Math.log(Math.min(Math.max(r, prof.rMin), prof.rMax) / prof.r0);
  const x = Math.min(
    Math.max((u - prof.uNodes[0]!) / (prof.uNodes[1]! - prof.uNodes[0]!), 0),
    nn - 1,
  );
  const i0 = Math.min(Math.floor(x), nn - 2);
  const w = x - i0;
  return (1 - w) * prof.g[i0]! + w * prof.g[i0 + 1]!;
}

/** Union of distance spans as sorted disjoint [lo, hi] (spec §7.4). */
export function mergeSpans(spans: readonly (readonly [number, number])[]): [number, number][] {
  const out: [number, number][] = [];
  for (const [lo, hi] of [...spans]
    .map((q) => [q[0], q[1]] as [number, number])
    .sort((a, b) => a[0] - b[0])) {
    const last = out[out.length - 1];
    if (last && lo <= last[1]) last[1] = Math.max(last[1], hi);
    else out.push([lo, hi]);
  }
  return out;
}

/**
 * ProfileDef for the calibrated law; optional per-node perturbation refs, the default hedge
 * exponent, and the earned exponent with the validated spans it applies in (§8.2).
 */
export function profileDef(
  prof: ProfileFit,
  dNodes?: readonly string[],
  eta?: string,
  earned?: { etaE: string; spans: readonly (readonly [number, number])[] },
): ProfileDef {
  const lr0 = Math.log(prof.r0);
  return {
    body: prof.body,
    uNodes: prof.uNodes.map((v) => lr0 + v),
    gNodes: prof.g,
    rMin: prof.rMin,
    rMax: prof.rMax,
    ...(dNodes ? { dNodes } : {}),
    ...(eta !== undefined ? { eta } : {}),
    ...(earned && earned.spans.length > 0
      ? { etaE: earned.etaE, validated: mergeSpans(earned.spans) }
      : {}),
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
  /** The camera misalignment the fit carried: its prior (the current value and σ) and result. */
  readonly camera?: {
    readonly prior: Vec3T;
    readonly priorSigma: Vec3T;
    readonly value: Vec3T;
    readonly sigma: Vec3T;
  };
}

export interface Anchor {
  /** Time of the last fix used. */
  readonly tNow: number;
  /** Ship state (x, y, z, vx, vy, vz) relative to the reference body (gauge of tFirst). */
  readonly state: Float64Array;
  /** 6×6 covariance (before s²). It contains the camera misalignment's share. */
  readonly covariance: Matrix;
  readonly info: AnchorInfo;
}

/**
 * Fit the most recent window(s) on the calibrated law with a free local scale and slope in
 * ln r, propagated to the last fix (§8.1). `prof` null gives the bare reference law.
 *
 * `camSigma` (three numbers) carries the camera misalignment as three more parameters held by a
 * prior at the reference law's values: the unknown orientation of the picture is then part of
 * the state covariance (11 parameters in all). Without it the misalignment is held fixed, as in
 * the planar reduction.
 */
export function anchorState(
  ref: ReferenceLaw,
  prof: ProfileFit | null,
  arc: Arc,
  wins: readonly Window[],
  dt: number,
  opts: {
    h?: number;
    gPrior?: readonly [number, number];
    slopeSigma?: number;
    extraProfiles?: readonly ProfileFit[];
    camSigma?: Vec3T | null;
  } = {},
): Anchor {
  const h = opts.h ?? 1e-3;
  const gPrior = opts.gPrior ?? [1, 0.5];
  const slopeSigma = opts.slopeSigma ?? 0.2;
  const fixes = wins.flatMap((w) => w.fixes);
  const aid = `${arc.id}.anchor`;
  const tFirst = fixes[0]!.t;
  const tLast = fixes[fixes.length - 1]!.t;
  const u0 = fixes.reduce((s, m) => s + Math.log(m.z[2]!), 0) / fixes.length;
  const sub: Arc = { id: aid, epoch: tFirst, commands: arc.commands, meas: fixes };
  const profiles = [
    ...(prof ? [profileDef(prof)] : []),
    ...(opts.extraProfiles ?? []).map((p) => profileDef(p)),
  ];
  const base = refStructure(ref, tFirst, {
    gs: '{att}.g',
    gs1: '{att}.g1',
    gsU0: u0,
    profiles,
  });
  const camSigma = opts.camSigma ?? null;
  const camKeys = ['x', 'y', 'z'] as const;
  const st: Structure = camSigma
    ? { ...base, camBias: ['{att}.cam.x', '{att}.cam.y', '{att}.cam.z'] }
    : base;
  const params: Param[] = [
    ...shipParams(aid, quadGuess(fixes, tFirst), ref.planar),
    {
      name: `${aid}.g`,
      init: gPrior[0],
      scale: 1e-3,
      priorMean: gPrior[0],
      priorSigma: gPrior[1],
      group: aid,
    },
    { name: `${aid}.g1`, init: 0, scale: 1e-2, priorMean: 0, priorSigma: slopeSigma, group: aid },
    ...(camSigma
      ? camKeys.map((k, i) => ({
          name: `${aid}.cam.${k}`,
          init: ref.cam[i]!,
          scale: 1e-5,
          priorMean: ref.cam[i]!,
          priorSigma: camSigma[i]!,
          group: aid,
        }))
      : []),
  ];
  const prob = new Problem(st, [sub], params, { dt });
  const res = prob.solve(params.map((p) => p.init));
  const q = res.x.length;
  const ca = compileArc(st, sub, prob.idx);
  // Ship relative to the reference body (equal to the gauge state when it is the only body).
  const rel = (xv: ArrayLike<number>) => shipAndBodies(ca, xv, [tLast], dt).state[0]!;
  const xNow = rel(res.x);
  const Jm = zeros(6, q);
  const xp = new Float64Array(res.x);
  for (let i = 0; i < q; i++) {
    if (!ca.moves.has(i)) continue; // the camera turns the picture, not the path
    const step = h * prob.scale[i]!;
    xp[i] = res.x[i]! + step;
    const sp = rel(xp);
    xp[i] = res.x[i]! - step;
    const sm = rel(xp);
    xp[i] = res.x[i]!;
    for (let r = 0; r < 6; r++) Jm.data[r * q + i] = (sp[r]! - sm[r]!) / (2 * step);
  }
  const PNow = sandwich(Jm, res.P);
  const [g, gS] = fitGet(res, `${aid}.g`);
  const [g1, g1S] = fitGet(res, `${aid}.g1`);
  const cam = camSigma ? camKeys.map((k) => fitGet(res, `${aid}.cam.${k}`)) : null;
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
      ...(cam && camSigma
        ? {
            camera: {
              prior: ref.cam,
              priorSigma: camSigma,
              value: [cam[0]![0], cam[1]![0], cam[2]![0]] as const,
              sigma: [cam[0]![1], cam[1]![1], cam[2]![1]] as const,
            },
          }
        : {}),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Forecast core (§8.2–§8.4)
// ---------------------------------------------------------------------------------------------

/** Position covariance (3×3 each) of one forecast sample, split by source (§8.3). */
export interface CovSplit {
  readonly state: Matrix;
  readonly profile: Matrix;
  /** Both hedge parts: earned inside validated spans and default elsewhere (§8.3). */
  readonly hedge: Matrix;
  readonly hedgeEarned: Matrix;
  readonly hedgeDefault: Matrix;
  /** Engine scale and both misalignment angles of every thruster, and the RCS scale. */
  readonly engine: Matrix;
  readonly mass: Matrix;
  /**
   * The other bodies' believed states at the start (`ForecastCoreInput.othersCov`): where they
   * are moves the ship through their pull. Zero when no body state is uncertain.
   */
  readonly bodies: Matrix;
  readonly total: Matrix;
}

export interface ForecastCoreResult {
  readonly times: readonly number[];
  /** Ship state relative to the reference body: x, y, z, vx, vy, vz. */
  readonly mean: readonly Float64Array[];
  /** Other modelled bodies relative to the reference body, per time: six numbers per body. */
  readonly bodies: readonly Float64Array[];
  /** The ship's position covariance (relative to the reference body), split by source. */
  readonly cov: readonly CovSplit[];
  /**
   * Per time, per other body: the 3×3 covariance of that body's position relative to the
   * reference body, from every source (its own state, the law's hedge on the bodies' mutual
   * pulls, the profiles, the masses). Empty records when there are no other bodies.
   */
  readonly bodyCov: readonly Readonly<Record<string, Matrix>>[];
  /**
   * Per time, per other body: the 3×3 covariance of the ship relative to that body (§8.7: the
   * shared sources partly cancel). Relative to the reference body it is `cov[k].total`.
   */
  readonly relCov: readonly Readonly<Record<string, Matrix>>[];
  /**
   * Sensitivity of the relative position to each uncertain source, for covariances of
   * differences between two forecasts made with the same sources (§8.7).
   */
  readonly sensitivity: ForecastSensitivity;
}

/** Columns d(position)/d(source) of a forecast, per requested time (3 numbers per time). */
export interface ForecastSensitivity {
  /** Source name → column over the requested times (length 3·T). */
  readonly columns: ReadonlyMap<string, Float64Array>;
  /** Shared sources (profile nodes, hedge exponents, masses) and their covariance blocks. */
  readonly shared: readonly { readonly names: readonly string[]; readonly cov: Matrix }[];
  /** The same columns for each other body's position relative to the reference body. */
  readonly bodyColumns: ReadonlyMap<string, ReadonlyMap<string, Float64Array>>;
  /**
   * Covariance of the ship's position relative to `body` (or to the reference body, null) from
   * the sources no other forecast shares: the present state, the engine and the bodies' states.
   */
  readonly independent: (k: number, body: string | null) => Matrix;
}

export interface ForecastCoreInput {
  readonly ref: ReferenceLaw;
  /** Calibration profiles (reference body first if it has one). */
  readonly profiles: readonly ProfileFit[];
  readonly commands: readonly ThrustSegment[];
  readonly tNow: number;
  /** Six numbers. */
  readonly xNow: ArrayLike<number>;
  /** 6×6. */
  readonly PNow: Matrix;
  readonly times: readonly number[];
  readonly dt: number;
  /** Noise scale s² on the present-state covariance. */
  readonly s2: number;
  /** Default hedge σ_h0 outside sampled distances (0 disables). */
  readonly sigmaH: number;
  /** Per body: validated spans (m) where the earned σ_e applies instead (§7.4, §8.2). */
  readonly validated?: Readonly<
    Record<
      string,
      { readonly spans: readonly (readonly [number, number])[]; readonly sigmaE: number }
    >
  >;
  /** Engine σ for planned burns: kE, dE, dP of the default engine (ref.kE, ref.dE, ref.dP). */
  readonly engineSigma: readonly [number, number, number?];
  /** Per-thruster σ (kE, dE, dP); values come from ref.engines. */
  readonly engineSigmas?: Readonly<Record<string, readonly [number, number, number?]>>;
  /** σ of the RCS translation scale (value ref.kR). */
  readonly rcsSigma?: number;
  /** σ of μ for frozen bodies without a profile (§8.2). */
  readonly muSigma?: Readonly<Record<string, number>>;
  /**
   * The forecast law (profiles and hedge) acts on the bodies' mutual pulls as well as on the
   * ship (`Structure.bodyProfiles`; 2F request 13). Default false: the bodies move under the
   * bare law, as in the reference.
   */
  readonly bodyLaw?: boolean;
  /**
   * Per other body: the 6×6 covariance of its state at tNow relative to the reference body (what
   * the fits know of it). Each such body's state becomes six more uncertain sources.
   */
  readonly othersCov?: Readonly<Record<string, Matrix>>;
  /**
   * Per other body: how its state at tNow already depends on the shared hedge exponents (six
   * numbers per source, named `eta:<body>` or `etaE:<body>` as in `sensitivity`), because the
   * hedge acted on its motion before tNow too. A hedge exponent is one number for the whole
   * forecast: moving it moves the body's starting state by this much as well.
   */
  readonly othersEta?: Readonly<Record<string, Readonly<Record<string, ArrayLike<number>>>>>;
  readonly h?: number;
}

/**
 * Linearised forecast (§8.3) from the present state under the calibrated law, with the 3×3
 * position covariance split by source: state, profile nodes, hedge, engine, body masses and the
 * other bodies' states; and the other bodies' own position covariances (§8.7).
 */
export function forecastCore(inp: ForecastCoreInput): ForecastCoreResult {
  const { ref, profiles } = inp;
  const h = inp.h ?? 1e-3;
  const aid = 'fc';
  const names: string[] = [...STATE_KEYS.map((k) => `fc.ship.${k}`), 'f.kE', 'f.dE', 'f.dP'];
  const x: number[] = [...Array.from(inp.xNow), ref.kE, ref.dE, ref.dP ?? 0];
  const scale: number[] = [1e3, 1e3, 1e3, 1, 1, 1, 1e-3, 1e-3, 1e-3];
  const engineCols: [number, number][] = [
    [6, inp.engineSigma[0]],
    [7, inp.engineSigma[1]],
    [8, inp.engineSigma[2] ?? 0],
  ];
  const engines: Record<string, EngineDef> = {};
  for (const [thr, e] of Object.entries(ref.engines ?? {})) {
    const sig = inp.engineSigmas?.[thr] ?? [0, 0, 0];
    engines[thr] = { kE: `f.kE.${thr}`, dE: `f.dE.${thr}`, dP: `f.dP.${thr}` };
    engineCols.push(
      [names.length, sig[0]],
      [names.length + 1, sig[1]],
      [names.length + 2, sig[2] ?? 0],
    );
    names.push(`f.kE.${thr}`, `f.dE.${thr}`, `f.dP.${thr}`);
    x.push(e.kE, e.dE, e.dP);
    scale.push(1e-3, 1e-3, 1e-3);
  }
  engineCols.push([names.length, inp.rcsSigma ?? 0]);
  names.push('f.kR');
  x.push(ref.kR ?? 1);
  scale.push(1e-3);
  const etaIdx: number[] = [];
  const etaEIdx: [number, number][] = [];
  const nodeIdx: number[][] = [];
  /** Shared hedge sources by name (`eta:<body>`, `etaE:<body>`) → parameter index. */
  const etaByName = new Map<string, number>();
  const pdefs: ProfileDef[] = profiles.map((p, j) => {
    etaIdx.push(names.length);
    etaByName.set(`eta:${p.body}`, names.length);
    names.push(`f.eta${j}`);
    x.push(0);
    scale.push(1e-2);
    const v = inp.validated?.[p.body];
    let earned: { etaE: string; spans: readonly (readonly [number, number])[] } | undefined;
    if (v && v.spans.length > 0) {
      etaEIdx.push([names.length, v.sigmaE]);
      etaByName.set(`etaE:${p.body}`, names.length);
      names.push(`f.etaE${j}`);
      x.push(0);
      scale.push(1e-2);
      earned = { etaE: `f.etaE${j}`, spans: v.spans };
    }
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
    return profileDef(p, nodes, `f.eta${j}`, earned);
  });
  const muIdx: [number, number][] = [];
  /** Per other body with an uncertain state: the indices of its six state parameters. */
  const bodyStateIdx = new Map<string, number[]>();
  const others = (ref.others ?? []).map((o) => {
    const sig = inp.muSigma?.[o.id];
    let muRef: string | number = o.mu;
    if (sig !== undefined && sig > 0) {
      muIdx.push([names.length, sig]);
      names.push(`f.mu.${o.id}`);
      x.push(o.mu);
      scale.push(Math.max(1e-3 * Math.abs(o.mu), sig * 1e-2));
      muRef = `f.mu.${o.id}`;
    }
    const s0 = o.stateAt(inp.tNow);
    if (!inp.othersCov?.[o.id] && !inp.othersEta?.[o.id]) return { ...o, muRef, state: s0 };
    const list: number[] = [];
    STATE_KEYS.forEach((k, c) => {
      list.push(names.length);
      names.push(`f.st.${o.id}.${k}`);
      x.push(s0[c]!);
      scale.push(c < 3 ? 1e3 : 0.1);
    });
    bodyStateIdx.set(o.id, list);
    const st = STATE_KEYS.map((k) => `f.st.${o.id}.${k}`) as unknown as BodyDef['state'];
    return { ...o, muRef, state: st };
  });
  const nO = others.length;
  const st: Structure = {
    r0: ref.r0,
    n: ref.n,
    bodies: [
      { id: ref.body, mu: ref.mu, state: 'gauge' },
      ...others.map((o) => ({ id: o.id, mu: o.muRef, state: o.state })),
    ],
    ship: STATE_KEYS.map((k) => `fc.ship.${k}`) as unknown as Structure['ship'],
    dynamicBodies: nO > 0,
    engine: { kE: 'f.kE', dE: 'f.dE', dP: 'f.dP' },
    engines,
    kR: 'f.kR',
    kA: 1,
    camBias: [0, 0, 0],
    profiles: pdefs,
    ...(inp.bodyLaw ? { bodyProfiles: true } : {}),
  };
  const idx = new Map(names.map((n, i) => [n, i]));
  const ca = compileArc(st, { id: aid, epoch: inp.tNow, commands: inp.commands }, idx);
  const order = inp.times.map((t, i) => [t, i] as const).sort((a, b) => a[0] - b[0]);
  const sortedTimes = order.map((o) => o[0]);
  const run = (xv: ArrayLike<number>) => shipAndBodies(ca, xv, sortedTimes, inp.dt);
  const base = run(x);
  const q = x.length;
  const T = sortedTimes.length;
  // A hedge exponent also moves the bodies' starting states (`othersEta`).
  const coupling = new Map<number, [number, number][]>();
  for (const [id, byName] of Object.entries(inp.othersEta ?? {})) {
    const list = bodyStateIdx.get(id);
    if (!list) continue;
    for (const [nm, col] of Object.entries(byName)) {
      const i = etaByName.get(nm);
      if (i === undefined) continue;
      const pairs = coupling.get(i) ?? [];
      list.forEach((k, c) => {
        const v = col[c] ?? 0;
        if (v !== 0 && Number.isFinite(v)) pairs.push([k, v]);
      });
      coupling.set(i, pairs);
    }
  }
  // Covariance groups (each block independent of the others).
  interface Group {
    readonly cols: readonly number[];
    readonly C: (a: number, b: number) => number;
  }
  const diag = (pairs: readonly [number, number][]): Group => ({
    cols: pairs.map((p) => p[0]),
    C: (a, b) => (a === b ? pairs[a]![1] ** 2 : 0),
  });
  const sh2 = inp.sigmaH * inp.sigmaH;
  const gState: Group = {
    cols: [0, 1, 2, 3, 4, 5],
    C: (a, b) => inp.s2 * inp.PNow.data[a * 6 + b]!,
  };
  const gEngine = diag(engineCols);
  const gHedgeD = diag(etaIdx.map((i) => [i, inp.sigmaH] as [number, number]));
  const gHedgeE = diag(etaEIdx);
  const gProfile: Group[] = profiles.map((p, j) => ({
    cols: nodeIdx[j]!,
    C: (a, b) => p.covariance.data[a * p.covariance.cols + b]!,
  }));
  const gMass = diag(muIdx);
  const gBodies: Group[] = [...bodyStateIdx.entries()].flatMap(([id, list]) => {
    const C = inp.othersCov?.[id];
    return C ? [{ cols: list, C: (a: number, b: number) => C.data[a * 6 + b]! }] : [];
  });
  // A source that cannot move the path, or carries no uncertainty, needs no propagation.
  const weight = new Float64Array(q);
  const mark = (g: Group) =>
    g.cols.forEach((i, a) => (weight[i] = Math.max(weight[i]!, Math.abs(g.C(a, a)))));
  [gState, gEngine, gHedgeD, gHedgeE, gMass, ...gProfile, ...gBodies].forEach(mark);
  const S: (Float64Array | null)[] = []; // per param: d(ship rel pos)/dq, length 3T (null: zero)
  const SB: (Float64Array | null)[] = []; // per param: d(bodies' rel pos)/dq, length 3·nO·T
  const xp = Float64Array.from(x);
  for (let i = 0; i < q; i++) {
    const couple = coupling.get(i) ?? [];
    if (!(weight[i]! > 0) || (!ca.moves.has(i) && couple.length === 0)) {
      S.push(null);
      SB.push(null);
      continue;
    }
    const step = h * scale[i]!;
    const shift = (sgn: number) => {
      xp[i] = x[i]! + sgn * step;
      for (const [k, c] of couple) xp[k] = x[k]! + sgn * c * step;
    };
    shift(1);
    const plus = run(xp);
    shift(-1);
    const minus = run(xp);
    xp[i] = x[i]!;
    for (const [k] of couple) xp[k] = x[k]!;
    const col = new Float64Array(3 * T);
    const colB = new Float64Array(3 * nO * T);
    for (let k = 0; k < T; k++) {
      for (let c = 0; c < 3; c++)
        col[3 * k + c] = (plus.state[k]![c]! - minus.state[k]![c]!) / (2 * step);
      for (let o = 0; o < nO; o++)
        for (let c = 0; c < 3; c++)
          colB[3 * (nO * k + o) + c] =
            (plus.bodies[k]![6 * o + c]! - minus.bodies[k]![6 * o + c]!) / (2 * step);
    }
    S.push(col);
    SB.push(nO > 0 ? colB : null);
  }
  /**
   * Σ over a group of u_a C_ab u_bᵀ at time k, where u_a (three numbers) is the column of the
   * combination `coefShip · ship − Σ coefBody · body` for parameter a.
   */
  const quad = (groups: readonly Group[], k: number, body: number | null, withShip = true) => {
    const m = zeros(3, 3);
    const u = (i: number, out: number[]): boolean => {
      const s = S[i];
      const sb = SB[i];
      if (!s && !sb) return false;
      for (let c = 0; c < 3; c++) {
        let v = withShip && s ? s[3 * k + c]! : 0;
        if (body !== null && sb) v -= sb[3 * (nO * k + body) + c]!;
        out[c] = v;
      }
      return true;
    };
    const ua = [0, 0, 0];
    for (const g of groups) {
      const n = g.cols.length;
      const U: (number[] | null)[] = g.cols.map((i) => {
        const o = [0, 0, 0];
        return u(i, o) ? o : null;
      });
      for (let a = 0; a < n; a++) {
        const A = U[a];
        if (!A) continue;
        // w = Σ_b C_ab u_b, then m += A wᵀ
        ua[0] = 0;
        ua[1] = 0;
        ua[2] = 0;
        for (let b = 0; b < n; b++) {
          const B = U[b];
          if (!B) continue;
          const c = g.C(a, b);
          if (c === 0) continue;
          ua[0]! += c * B[0]!;
          ua[1]! += c * B[1]!;
          ua[2]! += c * B[2]!;
        }
        for (let r = 0; r < 3; r++)
          for (let s = 0; s < 3; s++) m.data[3 * r + s]! += A[r]! * ua[s]!;
      }
    }
    return m;
  };
  const add = (...ms: Matrix[]) => {
    const m = zeros(3, 3);
    for (const q2 of ms) for (let i = 0; i < 9; i++) m.data[i]! += q2.data[i]!;
    return m;
  };
  const allGroups = [gState, gEngine, gHedgeD, gHedgeE, gMass, ...gProfile, ...gBodies];
  const indepGroups = [gState, gEngine, ...gBodies];
  const covs: CovSplit[] = new Array(T);
  const bodyCovs: Record<string, Matrix>[] = new Array(T);
  const relCovs: Record<string, Matrix>[] = new Array(T);
  for (let k = 0; k < T; k++) {
    const state = quad([gState], k, null);
    const engine = quad([gEngine], k, null);
    const hedgeDefault = quad([gHedgeD], k, null);
    const hedgeEarned = quad([gHedgeE], k, null);
    const hedge = add(hedgeDefault, hedgeEarned);
    const profile = quad(gProfile, k, null);
    const mass = quad([gMass], k, null);
    const bodies = quad(gBodies, k, null);
    covs[k] = {
      state,
      profile,
      hedge,
      hedgeEarned,
      hedgeDefault,
      engine,
      mass,
      bodies,
      total: add(state, profile, hedge, engine, mass, bodies),
    };
    const bc: Record<string, Matrix> = {};
    const rc: Record<string, Matrix> = {};
    others.forEach((o, j) => {
      bc[o.id] = quad(allGroups, k, j, false);
      rc[o.id] = quad(allGroups, k, j);
    });
    bodyCovs[k] = bc;
    relCovs[k] = rc;
  }
  // restore requested order
  const outMean: Float64Array[] = new Array(T);
  const outCov: CovSplit[] = new Array(T);
  const outBodies: Float64Array[] = new Array(T);
  const outBodyCov: Record<string, Matrix>[] = new Array(T);
  const outRelCov: Record<string, Matrix>[] = new Array(T);
  const sortedOf = new Array<number>(T);
  order.forEach(([, i], k) => {
    outMean[i] = base.state[k]!;
    outCov[i] = covs[k]!;
    outBodies[i] = base.bodies[k]!;
    outBodyCov[i] = bodyCovs[k]!;
    outRelCov[i] = relCovs[k]!;
    sortedOf[i] = k;
  });
  const unsort = (col: Float64Array) => {
    const o = new Float64Array(3 * T);
    order.forEach(([, i], k) => {
      for (let c = 0; c < 3; c++) o[3 * i + c] = col[3 * k + c]!;
    });
    return o;
  };
  const unsortBody = (col: Float64Array | null, j: number) => {
    const o = new Float64Array(3 * T);
    if (!col) return o;
    order.forEach(([, i], k) => {
      for (let c = 0; c < 3; c++) o[3 * i + c] = col[3 * (nO * k + j) + c]!;
    });
    return o;
  };
  const columns = new Map<string, Float64Array>();
  const bodyColumns = new Map<string, Map<string, Float64Array>>(
    others.map((o) => [o.id, new Map<string, Float64Array>()]),
  );
  const zero = new Float64Array(3 * T);
  // Sources shared with any other forecast under the same law are named by what they are, not
  // by their place in this forecast's list.
  const sharedName = (i: number): string => {
    for (let j = 0; j < profiles.length; j++) {
      const body = profiles[j]!.body;
      if (etaIdx[j] === i) return `eta:${body}`;
      if (names[i] === `f.etaE${j}`) return `etaE:${body}`;
      const b = nodeIdx[j]!.indexOf(i);
      if (b >= 0) return `node:${body}:${b}`;
    }
    return names[i]!;
  };
  const setCol = (i: number, nm: string) => {
    columns.set(nm, S[i] ? unsort(S[i]) : zero);
    others.forEach((o, j) => bodyColumns.get(o.id)!.set(nm, unsortBody(SB[i] ?? null, j)));
  };
  const shared: { names: string[]; cov: Matrix }[] = [];
  profiles.forEach((p, j) => {
    const nm = nodeIdx[j]!.map(sharedName);
    nodeIdx[j]!.forEach((i, b) => setCol(i, nm[b]!));
    shared.push({ names: nm, cov: p.covariance });
    const e = etaIdx[j]!;
    setCol(e, sharedName(e));
    shared.push({ names: [sharedName(e)], cov: { rows: 1, cols: 1, data: Float64Array.of(sh2) } });
  });
  for (const [i, se] of etaEIdx) {
    setCol(i, sharedName(i));
    shared.push({
      names: [sharedName(i)],
      cov: { rows: 1, cols: 1, data: Float64Array.of(se * se) },
    });
  }
  for (const [i, sig] of muIdx) {
    setCol(i, names[i]!);
    shared.push({
      names: [names[i]!],
      cov: { rows: 1, cols: 1, data: Float64Array.of(sig * sig) },
    });
  }
  const bodyIndex = new Map(others.map((o, j) => [o.id, j]));
  const independent = (k: number, body: string | null): Matrix => {
    const j = body === null ? null : (bodyIndex.get(body) ?? null);
    return quad(indepGroups, sortedOf[k]!, j);
  };
  return {
    times: inp.times,
    mean: outMean,
    bodies: outBodies,
    cov: outCov,
    bodyCov: outBodyCov,
    relCov: outRelCov,
    sensitivity: { columns, shared, bodyColumns, independent },
  };
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
): { state: Float64Array[]; bodies: Float64Array[] } {
  const traj = simulate(ca, x, times, dt);
  const nb = ca.nb;
  const s = 3 * nb;
  const state: Float64Array[] = [];
  const bodies: Float64Array[] = [];
  traj.pos.forEach((p, k) => {
    const v = traj.vel[k]!;
    state.push(
      Float64Array.of(
        p[s]! - p[0]!,
        p[s + 1]! - p[1]!,
        p[s + 2]! - p[2]!,
        v[s]! - v[0]!,
        v[s + 1]! - v[1]!,
        v[s + 2]! - v[2]!,
      ),
    );
    const o = new Float64Array(6 * (nb - 1));
    for (let j = 1; j < nb; j++)
      for (let c = 0; c < 3; c++) {
        o[6 * (j - 1) + c] = p[3 * j + c]! - p[c]!;
        o[6 * (j - 1) + 3 + c] = v[3 * j + c]! - v[c]!;
      }
    bodies.push(o);
  });
  return { state, bodies };
}

/**
 * √(largest eigenvalue) of a symmetric covariance: the longest semi-axis of the 1σ ellipsoid
 * (§8.4). For a planar covariance embedded in 3D this is the planar ellipse's.
 */
export function majorSigma(c: Matrix): number {
  const { values } = symEig(c);
  return Math.sqrt(Math.max(values[values.length - 1]!, 0));
}

/** Unit vector along the longest axis of a covariance, signed so its largest component is positive. */
export function majorAxis(c: Matrix): number[] {
  const { vectors } = symEig(c);
  const n = c.rows;
  const a = Array.from({ length: n }, (_, r) => vectors.data[r * n + (n - 1)]!);
  let big = 0;
  for (let i = 1; i < n; i++) if (Math.abs(a[i]!) > Math.abs(a[big]!)) big = i;
  return a[big]! < 0 ? a.map((v) => -v) : a;
}

/**
 * Mahalanobis distance of a deviation under a covariance of the same size. Directions in which
 * the covariance is exactly zero (a planar covariance lifted to 3D) are left out.
 */
export function mahalanobis(dev: readonly number[], c: Matrix): number {
  const n = dev.length;
  if (c.rows !== n || c.cols !== n) throw new Error('mahalanobis: size mismatch');
  const { values, vectors } = symEig(c);
  const top = Math.max(values[n - 1]!, 1e-300);
  let s = 0;
  for (let k = 0; k < n; k++) {
    if (!(values[k]! > 1e-12 * top)) continue;
    let y = 0;
    for (let r = 0; r < n; r++) y += vectors.data[r * n + k]! * dev[r]!;
    s += (y * y) / values[k]!;
  }
  return Math.sqrt(s);
}

// ---------------------------------------------------------------------------------------------
// Earned hedge (§7.4)
// ---------------------------------------------------------------------------------------------

export interface EarnedHedge {
  readonly nWindowsOutside: number;
  readonly delta?: number;
  readonly ell?: number;
  readonly sigmaH: number;
  /** Validated range: training coverage joined with the held-out windows (§7.4). */
  readonly validatedRange?: readonly [number, number];
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
  const heldMin = Math.min(...heldOutRows.map((r) => r.rMin));
  const heldMax = Math.max(...heldOutRows.map((r) => r.rMax));
  return {
    nWindowsOutside: ext.length,
    delta,
    ell,
    sigmaH: Math.min(sigmaH0, Math.max(floor, v)),
    validatedRange: [Math.min(trainRMin, heldMin), Math.max(trainRMax, heldMax)],
  };
}
