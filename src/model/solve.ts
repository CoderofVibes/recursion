/**
 * Tier G solver (1G spec revision 3, §4): batch weighted least squares with priors, solved by
 * Levenberg–Marquardt on scaled parameters; covariance, effective parameter count and
 * whitened residuals at the solution. Jacobians are central finite differences of the whitened
 * residuals (step 1e-3 × scale, §4.3). Deterministic.
 *
 * A fix gives up to three rows (east, north, range) and an accelerometer sample up to three;
 * m, p_eff and ν count the rows that are used.
 */

import {
  MIN_ARC_FIXES,
  compileArc,
  planMeasurements,
  poweredAt,
  rangeFixTimes,
  residuals,
  simulate,
  usable,
  type Arc,
  type CompiledArc,
  type EstMeasurement,
  type MeasPlan,
  type Structure,
  type Trajectory,
} from './dynamics.ts';
import { inverse, solve, zeros, type Matrix } from './linalg.ts';

export interface Param {
  readonly name: string;
  readonly init: number;
  /** Finite-difference step unit and conditioning scale (§3.6). */
  readonly scale: number;
  readonly priorMean?: number;
  readonly priorSigma?: number;
  /** 'global', or the id of the arc this parameter belongs to. */
  readonly group: string;
}

/** Gaussian prior on a block of parameters with full information matrix (§4.1, §7.2). */
export interface FullPrior {
  readonly names: readonly string[];
  readonly mean: Float64Array;
  readonly info: Matrix;
}

export type ResidualKind = 'bearing' | 'range' | 'accel' | 'relpos';

export interface ResidualTag {
  readonly arc: string;
  readonly t: number;
  /** 'bearing': component 0 is the east (azimuth) row, 1 the north (elevation) row. */
  readonly kind: ResidualKind;
  readonly target: string | undefined;
  readonly component: number;
  readonly powered: boolean;
}

/** The direction a residual is shown in (§9.1). */
export type ResidualDirection = 'along' | 'normal' | 'range' | 'accel' | 'relpos';

/**
 * A whitened residual by direction (§9.1): a fix's bearing 2-vector resolved along the apparent
 * motion of the line of sight (`along`: in the orbit plane, along the track) and across it
 * (`normal`: out of the orbit plane); `range` is along the line of sight.
 */
export interface DirectedResidual {
  readonly arc: string;
  readonly t: number;
  readonly direction: ResidualDirection;
  readonly target: string | undefined;
  readonly powered: boolean;
  readonly value: number;
}

export interface FitResult {
  readonly names: readonly string[];
  readonly x: Float64Array;
  /** Posterior covariance (unscaled units). */
  readonly P: Matrix;
  /** Data term of the cost. */
  readonly chi2: number;
  readonly priorCost: number;
  /** Number of scalar measurements. */
  readonly m: number;
  readonly pEff: number;
  readonly iterations: number;
  readonly converged: boolean;
  /** Whitened residuals (z − h)/σ, one per used row. */
  readonly resid: Float64Array;
  readonly residTags: readonly ResidualTag[];
  /** The same residuals by direction (§9.1). */
  readonly directed: readonly DirectedResidual[];
}

export const fitNu = (f: FitResult) => f.m - f.pEff;
export const fitChi2Nu = (f: FitResult) => f.chi2 / fitNu(f);

export function fitIndex(f: FitResult, name: string): number {
  const i = f.names.indexOf(name);
  if (i < 0) throw new Error(`fit has no parameter ${name}`);
  return i;
}

/** [value, sigma] of a parameter. */
export function fitGet(f: FitResult, name: string): [number, number] {
  const i = fitIndex(f, name);
  return [f.x[i]!, Math.sqrt(f.P.data[i * f.P.cols + i]!)];
}

export function fitCorr(f: FitResult, a: string, b: string): number {
  const i = fitIndex(f, a);
  const j = fitIndex(f, b);
  const n = f.P.cols;
  return f.P.data[i * n + j]! / Math.sqrt(f.P.data[i * n + i]! * f.P.data[j * n + j]!);
}

export function fitSigma(f: FitResult): Float64Array {
  const n = f.P.cols;
  return Float64Array.from(f.names, (_, i) => Math.sqrt(f.P.data[i * n + i]!));
}

interface Block {
  readonly arc: Arc;
  readonly ca: CompiledArc;
  readonly meas: readonly EstMeasurement[];
  readonly plan: MeasPlan;
  /** Parameter indices this block depends on (globals and its own arc). */
  readonly rel: readonly number[];
  readonly tags: readonly ResidualTag[];
}

export interface SolverOptions {
  /** Integration step, s. */
  readonly dt: number;
  /** Finite-difference step in units of each parameter's scale (§4.3). */
  readonly h?: number;
  readonly fullPriors?: readonly FullPrior[];
  /** Per arc: use only measurements with t ≤ tmax (arc growing, §4.5). */
  readonly tmax?: ReadonlyMap<string, number>;
  readonly maxIterations?: number;
  readonly tolerance?: number;
}

const NOT_FINITE = 'fit: a measurement or a prediction is not a finite number';

function tagKind(m: EstMeasurement, c: number): ResidualKind {
  if (m.kind === 'opnav') return c < 2 ? 'bearing' : 'range';
  if (m.kind === 'range') return 'range';
  if (m.kind === 'accel') return 'accel';
  return 'relpos';
}

/** A least-squares problem: one structure, several arcs, a parameter list. */
export class Problem {
  readonly names: string[];
  readonly idx: Map<string, number>;
  readonly scale: Float64Array;
  readonly blocks: Block[] = [];
  readonly m: number;
  private readonly h: number;
  private readonly dt: number;
  private readonly fullPriors: readonly FullPrior[];
  readonly st: Structure;
  readonly params: readonly Param[];

  constructor(st: Structure, arcs: readonly Arc[], params: readonly Param[], opts: SolverOptions) {
    this.st = st;
    this.params = params;
    this.names = params.map((p) => p.name);
    this.idx = new Map(this.names.map((n, i) => [n, i]));
    if (this.idx.size !== this.names.length) throw new Error('Problem: duplicate parameter names');
    this.scale = Float64Array.from(params, (p) => p.scale);
    this.h = opts.h ?? 1e-3;
    this.dt = opts.dt;
    this.fullPriors = opts.fullPriors ?? [];
    let m = 0;
    for (const arc of arcs) {
      const tmax = opts.tmax?.get(arc.id);
      const meas = arc.meas.filter((q) => usable(st, q) && (tmax === undefined || q.t <= tmax));
      if (meas.length === 0) continue;
      const plan = planMeasurements(meas);
      if (plan.m === 0) continue;
      const rel: number[] = [];
      params.forEach((p, i) => {
        if (p.group === 'global' || p.group === arc.id) rel.push(i);
      });
      const tags = plan.meta.map(([mi, c]) => {
        const q = meas[mi]!;
        return {
          arc: arc.id,
          t: q.t,
          kind: tagKind(q, c),
          target: q.target,
          component: c,
          powered: poweredAt(arc.commands, q.t),
        };
      });
      this.blocks.push({ arc, ca: compileArc(st, arc, this.idx), meas, plan, rel, tags });
      m += plan.m;
    }
    this.m = m;
  }

  private trajectory(b: Block, x: ArrayLike<number>): Trajectory | null {
    return b.plan.needsTrajectory ? simulate(b.ca, x, b.plan.ti.times, this.dt) : null;
  }

  residual(x: Float64Array): Float64Array {
    const out = new Float64Array(this.m);
    let off = 0;
    for (const b of this.blocks) {
      out.set(residuals(b.ca, x, b.plan, this.dt), off);
      off += b.plan.m;
    }
    return out;
  }

  /**
   * Whitened residual r and Jacobian J = −dr/dx (m × p, row-major), by central differences of
   * the whitened residuals, so that H = JᵀJ and g = Jᵀr.
   *
   * Three savings, none of which changes what is computed: a parameter the arc does not depend
   * on gives a zero column; one that enters only the measurement equations (camera
   * misalignment, accelerometer scale) reuses the trajectory; and parameters that only ever
   * appear added together (an arrival value and its per-arc deviation, §3.7) share one column.
   */
  residualAndJacobian(x: Float64Array): { r: Float64Array; J: Matrix } {
    const p = x.length;
    const r = new Float64Array(this.m);
    const J = zeros(this.m, p);
    let off = 0;
    const xp = new Float64Array(x);
    for (const b of this.blocks) {
      const nz = b.plan.m;
      const base = this.trajectory(b, x);
      r.set(residuals(b.ca, x, b.plan, this.dt, undefined, base), off);
      const plus = new Float64Array(nz);
      const minus = new Float64Array(nz);
      const done = new Set<number>();
      for (const k of b.rel) {
        const moves = b.ca.moves.has(k);
        if (!moves && !b.ca.measures.has(k)) continue;
        const twin = b.ca.sameAs.get(k);
        if (twin !== undefined && done.has(twin)) {
          for (let i = 0; i < nz; i++) J.data[(off + i) * p + k] = J.data[(off + i) * p + twin]!;
          done.add(k);
          continue;
        }
        const step = this.h * this.scale[k]!;
        xp[k] = x[k]! + step;
        residuals(b.ca, xp, b.plan, this.dt, plus, moves ? null : base);
        xp[k] = x[k]! - step;
        residuals(b.ca, xp, b.plan, this.dt, minus, moves ? null : base);
        xp[k] = x[k]!;
        for (let i = 0; i < nz; i++)
          J.data[(off + i) * p + k] = (minus[i]! - plus[i]!) / (2 * step);
        done.add(k);
      }
      off += nz;
    }
    return { r, J };
  }

  /**
   * §9.1: the residuals by direction, at x. A fix's two bearing rows are a 2-vector in the
   * tangent plane at the measured direction; it is resolved along the apparent motion of the
   * line of sight and across it, each whitened by the sigma in its own direction. A fix with one
   * bearing row (the planar reduction) gives that row as `along`.
   */
  directed(x: ArrayLike<number>, resid: Float64Array): DirectedResidual[] {
    const out: DirectedResidual[] = [];
    let off = 0;
    for (const b of this.blocks) {
      const plan = b.plan;
      const traj = this.trajectory(b, x);
      const ship = 3 * b.ca.nb;
      for (let i = 0; i < b.meas.length; i++) {
        const q = b.meas[i]!;
        const kE = plan.row[3 * i]!;
        const kN = plan.row[3 * i + 1]!;
        const kR = plan.row[3 * i + 2]!;
        const first = kE >= 0 ? kE : kN >= 0 ? kN : kR;
        if (first < 0) continue;
        const tag = b.tags[first]!;
        const push = (direction: ResidualDirection, value: number) =>
          out.push({
            arc: tag.arc,
            t: tag.t,
            direction,
            target: tag.target,
            powered: tag.powered,
            value,
          });
        const at = (k: number) => resid[off + k]!;
        if (q.kind === 'accel' || q.kind === 'relpos') {
          for (const k of [kE, kN, kR]) if (k >= 0) push(q.kind, at(k));
          continue;
        }
        if (q.kind === 'range') {
          push('range', at(kE));
          continue;
        }
        if (kR >= 0) push('range', at(kR));
        if (kE >= 0 && kN >= 0) {
          const ti = plan.ti.at[i]!;
          const P = traj!.pos[ti]!;
          const V = traj!.vel[ti]!;
          const j = 3 * b.ca.bodyIndex.get(q.target)!;
          const d = [P[j]! - P[ship]!, P[j + 1]! - P[ship + 1]!, P[j + 2]! - P[ship + 2]!];
          const w = [V[j]! - V[ship]!, V[j + 1]! - V[ship + 1]!, V[j + 2]! - V[ship + 2]!];
          const rho = Math.hypot(d[0]!, d[1]!, d[2]!);
          const ph = [d[0]! / rho, d[1]! / rho, d[2]! / rho];
          const wp = w[0]! * ph[0]! + w[1]! * ph[1]! + w[2]! * ph[2]!;
          const a = [w[0]! - wp * ph[0]!, w[1]! - wp * ph[1]!, w[2]! - wp * ph[2]!];
          const na = Math.hypot(a[0]!, a[1]!, a[2]!);
          if (!(na > 0)) {
            push('along', at(kE));
            push('normal', at(kN));
            continue;
          }
          for (let c = 0; c < 3; c++) a[c]! /= na;
          const nn = [
            ph[1]! * a[2]! - ph[2]! * a[1]!,
            ph[2]! * a[0]! - ph[0]! * a[2]!,
            ph[0]! * a[1]! - ph[1]! * a[0]!,
          ];
          const B = plan.basis;
          const sE = 1 / plan.w[3 * i]!;
          const sN = 1 / plan.w[3 * i + 1]!;
          const tE = at(kE) * sE;
          const tN = at(kN) * sN;
          for (const [direction, u] of [
            ['along', a],
            ['normal', nn],
          ] as const) {
            const uE = u[0]! * B[9 * i + 3]! + u[1]! * B[9 * i + 4]! + u[2]! * B[9 * i + 5]!;
            const uN = u[0]! * B[9 * i + 6]! + u[1]! * B[9 * i + 7]! + u[2]! * B[9 * i + 8]!;
            push(direction, (tE * uE + tN * uN) / Math.hypot(sE * uE, sN * uN));
          }
        } else if (kE >= 0) push('along', at(kE));
        else if (kN >= 0) push('normal', at(kN));
      }
      off += plan.m;
    }
    return out;
  }

  /** Prior information, gradient (toward the prior) and cost at x. */
  priorTerms(x: Float64Array): { H: Matrix; g: Float64Array; cost: number } {
    const p = x.length;
    const H = zeros(p, p);
    const g = new Float64Array(p);
    let cost = 0;
    this.params.forEach((prm, i) => {
      if (prm.priorSigma !== undefined) {
        const w = 1 / (prm.priorSigma * prm.priorSigma);
        const mean = prm.priorMean ?? 0;
        H.data[i * p + i]! += w;
        g[i]! += w * (mean - x[i]!);
        cost += w * (x[i]! - mean) * (x[i]! - mean);
      }
    });
    for (const fp of this.fullPriors) {
      const I = fp.names.map((n) => {
        const i = this.idx.get(n);
        if (i === undefined) throw new Error(`full prior: unknown parameter ${n}`);
        return i;
      });
      const nI = I.length;
      const dx = Float64Array.from(I, (i, a) => x[i]! - fp.mean[a]!);
      for (let a = 0; a < nI; a++) {
        let gi = 0;
        for (let b = 0; b < nI; b++) {
          const inf = fp.info.data[a * nI + b]!;
          H.data[I[a]! * p + I[b]!]! += inf;
          gi += inf * dx[b]!;
          cost += dx[a]! * inf * dx[b]!;
        }
        g[I[a]!]! -= gi;
      }
    }
    return { H, g, cost };
  }

  /**
   * A solve or inverse of the normal matrix. When it cannot be done, the error says what the
   * data and the priors leave undetermined, so a caller can name it as the reason a fit was
   * left out: such a fit is never returned as if it had been solved.
   */
  private normal<T>(H: Matrix, op: (m: Matrix) => T): T {
    try {
      return op(H);
    } catch {
      if (H.data.some((v) => !Number.isFinite(v))) throw new Error(NOT_FINITE);
      const free = this.names.filter((_, i) => H.data[i * H.cols + i] === 0);
      throw new Error(
        `fit: the data do not determine ${free.length > 0 ? free.join(', ') : 'every parameter'}`,
      );
    }
  }

  /** Levenberg–Marquardt from x0 (§4.4), then covariance and outputs (§4.6). */
  solve(x0: ArrayLike<number>, maxit = 60, tol = 1e-3): FitResult {
    let x = Float64Array.from(x0);
    const p = x.length;
    const S = this.scale;
    let { r, J } = this.residualAndJacobian(x);
    let pt = this.priorTerms(x);
    let cost = dot(r, r) + pt.cost;
    // A cost that is not finite cannot be reduced: no step would be accepted, and the start
    // would come back marked converged.
    if (!Number.isFinite(cost)) throw new Error(NOT_FINITE);
    let lam = 1e-3;
    let converged = false;
    let it: number;
    for (it = 1; it <= maxit; it++) {
      const { H, g } = normal(J, r, S, pt.H, pt.g, this.m, p);
      let dmax = 0;
      for (let i = 0; i < p; i++) dmax = Math.max(dmax, H.data[i * p + i]!);
      const floor = 1e-12 * Math.max(1, dmax);
      const D = Float64Array.from({ length: p }, (_, i) => Math.max(H.data[i * p + i]!, floor));
      let accepted = false;
      let delta: Float64Array = new Float64Array(p);
      let xn = x;
      let cn = cost;
      for (let tries = 0; tries < 12; tries++) {
        const A = { rows: p, cols: p, data: new Float64Array(H.data) };
        for (let i = 0; i < p; i++) A.data[i * p + i]! += lam * D[i]!;
        delta = this.normal(A, (m) => solve(m, g));
        xn = Float64Array.from(x, (v, i) => v + S[i]! * delta[i]!);
        const rn = this.residual(xn);
        cn = dot(rn, rn) + this.priorTerms(xn).cost;
        if (cn <= cost) {
          accepted = true;
          break;
        }
        lam *= 10;
      }
      if (!accepted) {
        converged = true; // no descent available: at a minimum to working precision
        break;
      }
      const Hi = this.normal(H, inverse);
      let stepSig = 0;
      for (let i = 0; i < p; i++)
        stepSig = Math.max(
          stepSig,
          Math.abs(delta[i]!) / Math.sqrt(Math.max(Hi.data[i * p + i]!, 1e-300)),
        );
      const dcost = cost - cn;
      x = xn;
      cost = cn;
      lam = Math.max(lam / 10, 1e-12);
      ({ r, J } = this.residualAndJacobian(x));
      pt = this.priorTerms(x);
      if (stepSig < tol || (dcost < 1e-9 * Math.max(cost, 1) && stepSig < 0.1)) {
        converged = true;
        break;
      }
    }
    if (it > maxit) it = maxit;
    const { H, Hd } = normal(J, r, S, pt.H, pt.g, this.m, p);
    const Hi = this.normal(H, inverse);
    const P = zeros(p, p);
    for (let i = 0; i < p; i++)
      for (let j = 0; j < p; j++) P.data[i * p + j] = S[i]! * Hi.data[i * p + j]! * S[j]!;
    let pEff = 0;
    for (let i = 0; i < p; i++)
      for (let k = 0; k < p; k++) pEff += Hd.data[i * p + k]! * Hi.data[k * p + i]!;
    return {
      names: this.names,
      x,
      P,
      chi2: dot(r, r),
      priorCost: pt.cost,
      m: this.m,
      pEff,
      iterations: it,
      converged,
      resid: r,
      residTags: this.blocks.flatMap((b) => b.tags),
      directed: this.directed(x, r),
    };
  }
}

function dot(a: Float64Array, b: Float64Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

/** Scaled normal equations: Hd = (JS)ᵀ(JS), H = Hd + S·Hp·S, g = (JS)ᵀr + S·gp. */
function normal(
  J: Matrix,
  r: Float64Array,
  S: Float64Array,
  Hp: Matrix,
  gp: Float64Array,
  m: number,
  p: number,
): { H: Matrix; Hd: Matrix; g: Float64Array } {
  const Hd = zeros(p, p);
  const g = new Float64Array(p);
  const row = new Float64Array(p);
  const nz: number[] = [];
  for (let k = 0; k < m; k++) {
    nz.length = 0;
    for (let i = 0; i < p; i++) {
      const v = J.data[k * p + i]!;
      if (v !== 0) {
        row[i] = v * S[i]!;
        nz.push(i);
      }
    }
    const rk = r[k]!;
    for (const i of nz) {
      const ri = row[i]!;
      g[i]! += ri * rk;
      for (const j of nz) Hd.data[i * p + j]! += ri * row[j]!;
    }
  }
  const H = zeros(p, p);
  for (let i = 0; i < p; i++) {
    g[i]! += S[i]! * gp[i]!;
    for (let j = 0; j < p; j++)
      H.data[i * p + j] = Hd.data[i * p + j]! + S[i]! * Hp.data[i * p + j]! * S[j]!;
  }
  return { H, Hd, g };
}

/**
 * Arc growing (§4.5): fit the first 25%, 50%, then all of each arc's usable data, each stage
 * starting from the previous solution.
 *
 * A stage never cuts an arc below the fixes that determine its state: the arc keeps at least its
 * first MIN_ARC_FIXES range fixes on the gauge body, or all of its data if it has fewer. A
 * quarter of a short arc can hold a single fix, which gives a position and no velocity; the
 * stage's normal matrix is then singular, and no later stage could run.
 */
export function stagedFit(
  st: Structure,
  arcs: readonly Arc[],
  params: readonly Param[],
  opts: SolverOptions,
  x0?: ArrayLike<number>,
  fracs: readonly number[] = [0.25, 0.5, 1],
): FitResult {
  let x: ArrayLike<number> = x0 ?? params.map((p) => p.init);
  let res: FitResult | null = null;
  const gauge = st.bodies.find((b) => b.state === 'gauge')?.id;
  for (const f of fracs) {
    let tmax: Map<string, number> | undefined;
    if (f < 1) {
      tmax = new Map();
      for (const a of arcs) {
        const ts = a.meas.filter((m) => usable(st, m)).map((m) => m.t);
        if (ts.length === 0) continue;
        const lo = Math.min(...ts);
        const hi = Math.max(...ts);
        const fixes = gauge === undefined ? [] : rangeFixTimes(a.meas, gauge);
        const determined = fixes.length >= MIN_ARC_FIXES ? fixes[MIN_ARC_FIXES - 1]! : hi;
        tmax.set(a.id, Math.max(lo + f * (hi - lo), determined));
      }
    }
    const prob = new Problem(st, arcs, params, { ...opts, ...(tmax ? { tmax } : {}) });
    res = prob.solve(x, opts.maxIterations ?? 60, opts.tolerance ?? 1e-3);
    x = res.x;
  }
  return res!;
}

// ---------------------------------------------------------------------------------------------
// Diagnostics on a fit (§9.1, §9.3)
// ---------------------------------------------------------------------------------------------

export interface ResidualClass {
  readonly n: number;
  readonly rms: number;
  readonly mean: number;
}

/**
 * §9.1: whitened residual RMS split into coasting and powered, by direction. Keys
 * `coast.along`, `coast.normal`, `coast.range`, `powered.along`, `powered.normal`,
 * `powered.range`, `powered.accel` (and `.relpos` for relative-position records).
 */
export function residualSummary(f: FitResult): Record<string, ResidualClass> {
  const out: Record<string, ResidualClass> = {};
  for (const seg of ['coast', 'powered'] as const) {
    for (const direction of ['along', 'normal', 'range', 'accel', 'relpos'] as const) {
      let n = 0;
      let ss = 0;
      let s = 0;
      for (const d of f.directed) {
        if (d.direction !== direction || d.powered !== (seg === 'powered')) continue;
        n++;
        ss += d.value * d.value;
        s += d.value;
      }
      if (n > 0) out[`${seg}.${direction}`] = { n, rms: Math.sqrt(ss / n), mean: s / n };
    }
  }
  return out;
}

/**
 * §9.3: multiple correlation of one parameter with a set of others,
 * R = √(cᵀ S⁻¹ c / P_aa), c = cov(a, others), S = cov(others). Used for the engine scale against
 * the two misalignment angles, which roll mixes: no single pair correlation finds a confound
 * that sits on both. Others the fit does not hold are left out; 0 when none is left.
 */
export function multipleCorrelation(f: FitResult, a: string, others: readonly string[]): number {
  if (!f.names.includes(a)) return 0;
  const ia = fitIndex(f, a);
  const io = others.filter((n) => f.names.includes(n)).map((n) => fitIndex(f, n));
  if (io.length === 0) return 0;
  const n = f.P.cols;
  const S = zeros(io.length, io.length);
  io.forEach((i, r) => io.forEach((j, c) => (S.data[r * io.length + c] = f.P.data[i * n + j]!)));
  const c = Float64Array.from(io, (i) => f.P.data[ia * n + i]!);
  let v: Float64Array;
  try {
    v = solve(S, c);
  } catch {
    return 0;
  }
  let q = 0;
  for (let i = 0; i < c.length; i++) q += c[i]! * v[i]!;
  const paa = f.P.data[ia * n + ia]!;
  return paa > 0 ? Math.sqrt(Math.max(q / paa, 0)) : 0;
}

export interface Confounding {
  readonly pairs: readonly { gravity: string; propulsion: string; rho: number }[];
  readonly maxAbsRho: number;
  /** Per propulsion parameter: posterior σ / prior σ (1 = the data taught nothing). */
  readonly posteriorOverPrior: Readonly<Record<string, number>>;
  /** Per gravity parameter: posterior σ / prior σ. */
  readonly gravityPosteriorOverPrior: Readonly<Record<string, number>>;
  readonly confounded: boolean;
}

/** §9.3: correlation between gravity and propulsion parameters. */
export function confounding(
  f: FitResult,
  gravity: readonly string[],
  propulsion: readonly string[],
  priorSigma: Readonly<Record<string, number>>,
  threshold = 0.9,
): Confounding {
  const has = (n: string) => f.names.includes(n);
  const pairs: { gravity: string; propulsion: string; rho: number }[] = [];
  for (const g of gravity)
    for (const q of propulsion)
      if (has(g) && has(q)) pairs.push({ gravity: g, propulsion: q, rho: fitCorr(f, g, q) });
  const maxAbsRho = pairs.reduce((m, p) => Math.max(m, Math.abs(p.rho)), 0);
  const ratio = (names: readonly string[]) => {
    const o: Record<string, number> = {};
    for (const n of names) {
      const ps = priorSigma[n];
      if (has(n) && ps !== undefined) o[n] = fitGet(f, n)[1] / ps;
    }
    return o;
  };
  return {
    pairs,
    maxAbsRho,
    posteriorOverPrior: ratio(propulsion),
    gravityPosteriorOverPrior: ratio(gravity),
    confounded: maxAbsRho > threshold,
  };
}

// ---------------------------------------------------------------------------------------------
// Held-out consistency (§7.2) and training evidence (§7.1)
// ---------------------------------------------------------------------------------------------

export interface HeldOutResult {
  readonly T: number;
  readonly nu: number;
  readonly TperNu: number;
  readonly threshold: number;
  readonly pass: boolean;
  readonly chi2Data: number;
  readonly priorPenalty: number;
  /** Per global: (held-out estimate − training mean) / training σ. */
  readonly globalShiftSigma: Readonly<Record<string, number>>;
  readonly fit: FitResult;
}

/**
 * §7.2: fit the held-out arc's local parameters together with the globals, using the training
 * posterior of the globals as a full Gaussian prior. T = χ²(held-out) + prior penalty;
 * ν = m − (number of local parameters). Pass if T/ν ≤ 1 + k·√(2/ν).
 */
export function heldOutConsistency(
  st: Structure,
  trainFit: FitResult,
  trainParams: readonly Param[],
  /** The held-out arc, or several (a held-out attempt's ship arc and its asteroid probes). */
  heldOut: Arc | readonly Arc[],
  localParams: readonly Param[],
  opts: SolverOptions,
  k = 3,
): HeldOutResult {
  const gl = trainParams.filter((p) => p.group === 'global');
  const gi = gl.map((p) => fitIndex(trainFit, p.name));
  const mean = Float64Array.from(gi, (i) => trainFit.x[i]!);
  const n = gi.length;
  const cov = zeros(n, n);
  for (let a = 0; a < n; a++)
    for (let b = 0; b < n; b++)
      cov.data[a * n + b] = trainFit.P.data[gi[a]! * trainFit.P.cols + gi[b]!]!;
  const info = inverse(cov);
  const gparams: Param[] = gl.map((p, a) => ({
    name: p.name,
    init: mean[a]!,
    scale: p.scale,
    group: 'global',
  }));
  const params = [...localParams, ...gparams];
  const fp: FullPrior = { names: gl.map((p) => p.name), mean, info };
  const heldArcs: readonly Arc[] = Array.isArray(heldOut) ? heldOut : [heldOut as Arc];
  const res = stagedFit(st, heldArcs, params, { ...opts, fullPriors: [fp] });
  const nu = res.m - localParams.length;
  const T = res.chi2 + res.priorCost;
  const threshold = 1 + k * Math.sqrt(2 / nu);
  const shift: Record<string, number> = {};
  gl.forEach((p, a) => {
    shift[p.name] = (fitGet(res, p.name)[0] - mean[a]!) / Math.sqrt(cov.data[a * n + a]!);
  });
  return {
    T,
    nu,
    TperNu: T / nu,
    threshold,
    pass: T / nu <= threshold,
    chi2Data: res.chi2,
    priorPenalty: res.priorCost,
    globalShiftSigma: shift,
    fit: res,
  };
}

/** §7.1: training evidence. delta = J(base) − J(extended) ≥ (added globals) · ln(m). */
export function evidence(
  base: FitResult,
  extended: FitResult,
  addedGlobals: number,
): { deltaCost: number; penalty: number; evidence: boolean } {
  const deltaCost = base.chi2 + base.priorCost - (extended.chi2 + extended.priorCost);
  const penalty = addedGlobals * Math.log(base.m);
  return { deltaCost, penalty, evidence: deltaCost >= penalty };
}

/**
 * §7.5 item 4: identifiability. A new parameter is not identifiable if its posterior σ exceeds
 * half its prior σ, or it correlates above 0.98 with another parameter.
 */
export function identifiability(
  f: FitResult,
  added: readonly string[],
  priorSigma: Readonly<Record<string, number>>,
  among: readonly string[] = f.names,
): { identifiable: boolean; reasons: string[] } {
  const reasons: string[] = [];
  for (const a of added) {
    const ps = priorSigma[a];
    const s = fitGet(f, a)[1];
    if (ps !== undefined && s > 0.5 * ps)
      reasons.push(`${a}: posterior σ is ${(s / ps).toFixed(2)} of its prior`);
    for (const b of among) {
      if (b === a || !f.names.includes(b)) continue;
      const rho = fitCorr(f, a, b);
      if (Math.abs(rho) > 0.98) reasons.push(`${a}: |ρ| = ${Math.abs(rho).toFixed(3)} with ${b}`);
    }
  }
  return { identifiable: reasons.length === 0, reasons };
}
