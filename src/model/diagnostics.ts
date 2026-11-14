/**
 * Player-facing diagnostics computed from fits (1G spec §9): empirical radial/tangential
 * acceleration on the calibrated law (§6.4, §9.4), local GM against distance and its slope
 * (§9.2), and per-burn response (§9.5). Empirical terms are diagnostics, never rules: they are
 * excluded from validation and never enter a forecast.
 */

import { type Arc, type ThrustSegment } from './dynamics.ts';
import {
  stagedFit,
  fitGet,
  type FitResult,
  type Param,
  type SolverOptions,
  Problem,
} from './solve.ts';
import {
  guessShip,
  makeWindows,
  profileDef,
  quadGuess,
  rangeFixes,
  refStructure,
  shipParams,
  type ProfileFit,
  type ReferenceLaw,
  type WindowFit,
  type WindowRule,
} from './tierL.ts';

/** Empirical window boundaries for an arc: epoch, window starts after the first, end. */
export function empBounds(arc: Arc, body: string, end: number, rule?: WindowRule): number[] {
  const wins = makeWindows(arc, body, rule);
  return [arc.epoch, ...wins.slice(1).map((w) => w.t0), end];
}

export function empParams(arcId: string, nseg: number, priorSigma = 1e-2): Param[] {
  const out: Param[] = [];
  for (let k = 0; k < nseg; k++)
    for (const c of ['R', 'T'])
      out.push({
        name: `${arcId}.emp${k}.${c}`,
        init: 0,
        scale: 1e-6,
        priorMean: 0,
        priorSigma,
        group: arcId,
      });
  return out;
}

export interface EmpiricalRow {
  readonly window: string;
  readonly t0: number;
  readonly t1: number;
  readonly aR: number;
  readonly sigmaR: number;
  readonly aT: number;
  readonly sigmaT: number;
}

export interface EmpiricalResult {
  readonly fit: FitResult;
  readonly params: readonly Param[];
  readonly bounds: Readonly<Record<string, readonly number[]>>;
  readonly table: readonly EmpiricalRow[];
  /** Largest |aT| / σT: a central-force error leaves none; an unmodelled mass does. */
  readonly maxAbsTangentialZ: number;
  readonly maxAbsTangential: number;
}

/**
 * §6.4: arc states plus radial/tangential empirical acceleration per window, on the reference
 * law times the calibration profile (globals frozen).
 */
export function empiricalFit(
  ref: ReferenceLaw,
  prof: ProfileFit | null,
  arcs: readonly Arc[],
  opts: SolverOptions & {
    end?: Readonly<Record<string, number>>;
    rule?: WindowRule;
    priorSigma?: number;
  },
): EmpiricalResult {
  const bounds: Record<string, number[]> = {};
  for (const a of arcs) {
    const end = opts.end?.[a.id] ?? Math.max(...a.meas.map((m) => m.t));
    bounds[a.id] = empBounds(a, ref.body, end, opts.rule);
  }
  const base = refStructure(ref, arcs[0]?.epoch ?? 0, {
    ...(prof ? { profiles: [profileDef(prof)] } : {}),
    arcs: arcs.map((a) => ({ id: a.id, epoch: a.epoch })),
  });
  const st = { ...base, emp: { ref: ref.body, bounds } };
  const params = arcs.flatMap((a) => [
    ...shipParams(a.id, guessShip(a, ref.body, a.epoch)),
    ...empParams(a.id, bounds[a.id]!.length - 1, opts.priorSigma),
  ]);
  const fit = stagedFit(st, arcs, params, opts);
  const table: EmpiricalRow[] = [];
  for (const a of arcs) {
    const b = bounds[a.id]!;
    for (let k = 0; k + 1 < b.length; k++) {
      const [aR, sR] = fitGet(fit, `${a.id}.emp${k}.R`);
      const [aT, sT] = fitGet(fit, `${a.id}.emp${k}.T`);
      table.push({
        window: `${a.id}.emp${k}`,
        t0: b[k]!,
        t1: b[k + 1]!,
        aR,
        sigmaR: sR,
        aT,
        sigmaT: sT,
      });
    }
  }
  return {
    fit,
    params,
    bounds,
    table,
    maxAbsTangentialZ: table.reduce((m, r) => Math.max(m, Math.abs(r.aT / r.sigmaT)), 0),
    maxAbsTangential: table.reduce((m, r) => Math.max(m, Math.abs(r.aT)), 0),
  };
}

/** §9.2: weighted slope of ln(local GM) against ln(r) (n_implied = n_model − slope). */
export function gmSlope(rows: readonly WindowFit[]): { slope: number; intercept: number } | null {
  if (rows.length < 2) return null;
  let sw = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (const r of rows) {
    const w = (r.g / r.sigma) ** 2;
    const x = Math.log(r.rGeoMean);
    const y = Math.log(r.g);
    sw += w;
    sx += w * x;
    sy += w * y;
    sxx += w * x * x;
    sxy += w * x * y;
  }
  const det = sw * sxx - sx * sx;
  if (det === 0) return null;
  const slope = (sw * sxy - sx * sy) / det;
  return { slope, intercept: (sy - slope * sx) / sw };
}

export interface BurnResponse {
  readonly t0: number;
  readonly t1: number;
  /** Achieved / commanded acceleration along the commanded direction. */
  readonly along: number;
  readonly alongSigma: number;
  /** Achieved / commanded acceleration across it (≈ tan dE when nominal). */
  readonly across: number;
  readonly acrossSigma: number;
  readonly nFixes: number;
  readonly chi2PerDof: number;
  readonly converged: boolean;
}

/**
 * §9.5 [ASSUMED; not in the 1G reference]: maneuver reconstruction from tracking. Fixes from
 * `pad` seconds before the burn to `pad` after it are fitted with gravity frozen at the
 * calibrated law; the window state and two response factors on the burn's segments are free.
 * Returns null when there are too few fixes.
 */
export function burnResponse(
  ref: ReferenceLaw,
  profiles: readonly ProfileFit[],
  arc: Arc,
  burn: readonly ThrustSegment[],
  dt: number,
  pad = 1200,
): BurnResponse | null {
  if (burn.length === 0) return null;
  const t0 = Math.min(...burn.map((s) => s.t0));
  const t1 = Math.max(...burn.map((s) => s.t1));
  const fixes = rangeFixes(arc, ref.body).filter((m) => m.t >= t0 - pad && m.t <= t1 + pad);
  if (fixes.length < 8 || fixes[0]!.t > t0) return null;
  const id = `${arc.id}.burn@${t0}`;
  const segs: ThrustSegment[] = burn.map((s) => ({ ...s, thruster: '__burn__' }));
  const others = arc.commands.filter((c) => !burn.includes(c));
  const base = refStructure(ref, fixes[0]!.t, { profiles: profiles.map((p) => profileDef(p)) });
  const st = {
    ...base,
    engines: { ...(base.engines ?? {}), __burn__: { kE: `${id}.kE`, dE: `${id}.dE` } },
  };
  const sub: Arc = { id, epoch: fixes[0]!.t, commands: [...others, ...segs], meas: fixes };
  const params: Param[] = [
    ...shipParams(id, quadGuess(fixes, fixes[0]!.t)),
    { name: `${id}.kE`, init: ref.kE, scale: 1e-3, priorMean: 1, priorSigma: 2, group: id },
    { name: `${id}.dE`, init: ref.dE, scale: 1e-3, priorMean: 0, priorSigma: 1, group: id },
  ];
  const res = new Problem(st, [sub], params, { dt }).solve(params.map((p) => p.init));
  const [k, sk] = fitGet(res, `${id}.kE`);
  const [d, sd] = fitGet(res, `${id}.dE`);
  return {
    t0,
    t1,
    along: k * Math.cos(d),
    alongSigma: Math.hypot(sk * Math.cos(d), k * sd * Math.sin(d)),
    across: k * Math.sin(d),
    acrossSigma: Math.hypot(sk * Math.sin(d), k * sd * Math.cos(d)),
    nFixes: fixes.length,
    chi2PerDof: res.chi2 / (res.m - res.pEff),
    converged: res.converged,
  };
}
