/**
 * Player-facing diagnostics computed from fits (1G spec revision 3, §9): empirical radial,
 * tangential and orbit-normal acceleration on the calibrated law (§6.4, §9.4), local GM against
 * distance and its slope (§9.2), each window's departure from the profile at its direction on
 * the sphere (§9.2), and per-burn response with three factors (§9.5). Empirical terms are
 * diagnostics, never rules: they are excluded from validation and never enter a forecast.
 */

import { segmentPowered, type Arc, type ThrustSegment } from './dynamics.ts';
import {
  stagedFit,
  fitGet,
  fitIndex,
  type FitResult,
  type Param,
  type SolverOptions,
  Problem,
} from './solve.ts';
import {
  guessShip,
  makeWindows,
  profileAt,
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

/** Empirical parameters per window: R, T and (unless `normal` is false) N. */
export function empParams(arcId: string, nseg: number, priorSigma = 1e-2, normal = true): Param[] {
  const out: Param[] = [];
  for (let k = 0; k < nseg; k++)
    for (const c of normal ? ['R', 'T', 'N'] : ['R', 'T'])
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
  /** Orbit-normal term (0 with σ 0 in the planar reduction, where it is held at zero). */
  readonly aN: number;
  readonly sigmaN: number;
}

export interface EmpiricalResult {
  readonly fit: FitResult;
  readonly params: readonly Param[];
  readonly bounds: Readonly<Record<string, readonly number[]>>;
  readonly table: readonly EmpiricalRow[];
  /** Largest |aT| / σT: a central-force error leaves none; an unmodelled mass does. */
  readonly maxAbsTangentialZ: number;
  readonly maxAbsTangential: number;
  /** Largest |aN| / σN and |aN|: a body off the orbit plane shows here first (§9.4). */
  readonly maxAbsNormalZ: number;
  readonly maxAbsNormal: number;
}

/**
 * §6.4: arc states plus radial, tangential and orbit-normal empirical acceleration per window,
 * on the reference law times the calibration profile (globals frozen). With `ref.planar` the
 * orbit-normal term is held at zero.
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
  const normal = !ref.planar;
  const bounds: Record<string, number[]> = {};
  for (const a of arcs) {
    const end = opts.end?.[a.id] ?? Math.max(...a.meas.map((m) => m.t));
    bounds[a.id] = empBounds(a, ref.body, end, opts.rule);
  }
  const base = refStructure(ref, arcs[0]?.epoch ?? 0, {
    ...(prof ? { profiles: [profileDef(prof)] } : {}),
    arcs: arcs.map((a) => ({ id: a.id, epoch: a.epoch })),
  });
  const st = { ...base, emp: { ref: ref.body, bounds, normal } };
  const params = arcs.flatMap((a) => [
    ...shipParams(a.id, guessShip(a, ref.body, a.epoch), ref.planar),
    ...empParams(a.id, bounds[a.id]!.length - 1, opts.priorSigma, normal),
  ]);
  const fit = stagedFit(st, arcs, params, opts);
  const table: EmpiricalRow[] = [];
  for (const a of arcs) {
    const b = bounds[a.id]!;
    for (let k = 0; k + 1 < b.length; k++) {
      const [aR, sR] = fitGet(fit, `${a.id}.emp${k}.R`);
      const [aT, sT] = fitGet(fit, `${a.id}.emp${k}.T`);
      const [aN, sN] = normal ? fitGet(fit, `${a.id}.emp${k}.N`) : [0, 0];
      table.push({
        window: `${a.id}.emp${k}`,
        t0: b[k]!,
        t1: b[k + 1]!,
        aR,
        sigmaR: sR,
        aT,
        sigmaT: sT,
        aN,
        sigmaN: sN,
      });
    }
  }
  const z = (v: number, s: number) => (s > 0 ? Math.abs(v / s) : 0);
  return {
    fit,
    params,
    bounds,
    table,
    maxAbsTangentialZ: table.reduce((m, r) => Math.max(m, z(r.aT, r.sigmaT)), 0),
    maxAbsTangential: table.reduce((m, r) => Math.max(m, Math.abs(r.aT)), 0),
    maxAbsNormalZ: table.reduce((m, r) => Math.max(m, z(r.aN, r.sigmaN)), 0),
    maxAbsNormal: table.reduce((m, r) => Math.max(m, Math.abs(r.aN)), 0),
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

/**
 * §9.2: a window's departure from the profile, (g − g_profile(r_geo)) / σ_g, to be shown at the
 * window's direction on the sphere around the body. A wrong distance law leaves the sphere
 * blank; a missing body paints its tide on it.
 */
export function profileDeparture(row: WindowFit, prof: ProfileFit): number {
  return row.sigma > 0 ? (row.g - profileAt(prof, row.rGeoMean)) / row.sigma : 0;
}

export interface BurnResponse {
  readonly t0: number;
  readonly t1: number;
  /** What fired: the main engine (three factors), or RCS translation alone (`along` only). */
  readonly kind: 'engine' | 'rcs';
  /**
   * Achieved / commanded acceleration along the commanded thrust direction (f_x: body +x turned
   * by the recorded attitude; for RCS, along the commanded translation).
   */
  readonly along: number;
  readonly alongSigma: number;
  /** Achieved / commanded acceleration across it toward body +y (f_y ≈ kE·dE when nominal). */
  readonly across: number;
  readonly acrossSigma: number;
  /** Achieved / commanded acceleration across it toward body +z (f_z ≈ kE·dP when nominal). */
  readonly up: number;
  readonly upSigma: number;
  readonly nFixes: number;
  readonly chi2PerDof: number;
  readonly converged: boolean;
}

/**
 * §9.5 [ASSUMED; not in the 1G reference]: maneuver reconstruction from tracking. Fixes from
 * `pad` seconds before the burn to `pad` after it are fitted with gravity frozen at the
 * calibrated law; the window state (six numbers) and three response factors on the burn's
 * segments are free: a_T = u C(q) [f_x, f_y, f_z]. A burn of RCS translation alone has one
 * factor, along the commanded push. Returns null when there are too few fixes.
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
  const engine = burn.some((s) => s.u !== 0);
  if (!engine && !burn.some(segmentPowered)) return null;
  const segs: ThrustSegment[] = burn.map((s) =>
    engine ? { ...s, thruster: '__burn__' } : { ...s, scale: `${id}.k` },
  );
  const others = arc.commands.filter((c) => !burn.includes(c));
  const base = refStructure(ref, fixes[0]!.t, { profiles: profiles.map((p) => profileDef(p)) });
  const planar = ref.planar === true;
  const st = {
    ...base,
    engines: {
      ...(base.engines ?? {}),
      __burn__: { kE: `${id}.kE`, dE: `${id}.dE`, dP: planar ? 0 : `${id}.dP` },
    },
  };
  const sub: Arc = { id, epoch: fixes[0]!.t, commands: [...others, ...segs], meas: fixes };
  const ship = shipParams(id, quadGuess(fixes, fixes[0]!.t), planar);
  const common = {
    t0,
    t1,
    nFixes: fixes.length,
  };
  if (!engine) {
    const params: Param[] = [
      ...ship,
      { name: `${id}.k`, init: 1, scale: 1e-3, priorMean: 1, priorSigma: 2, group: id },
    ];
    const res = new Problem(st, [sub], params, { dt }).solve(params.map((p) => p.init));
    const [k, sk] = fitGet(res, `${id}.k`);
    return {
      ...common,
      kind: 'rcs',
      along: k,
      alongSigma: sk,
      across: 0,
      acrossSigma: 0,
      up: 0,
      upSigma: 0,
      chi2PerDof: res.chi2 / (res.m - res.pEff),
      converged: res.converged,
    };
  }
  const params: Param[] = [
    ...ship,
    { name: `${id}.kE`, init: ref.kE, scale: 1e-3, priorMean: 1, priorSigma: 2, group: id },
    { name: `${id}.dE`, init: ref.dE, scale: 1e-3, priorMean: 0, priorSigma: 1, group: id },
    ...(planar
      ? []
      : [
          {
            name: `${id}.dP`,
            init: ref.dP ?? 0,
            scale: 1e-3,
            priorMean: 0,
            priorSigma: 1,
            group: id,
          },
        ]),
  ];
  const res = new Problem(st, [sub], params, { dt }).solve(params.map((p) => p.init));
  const [k] = fitGet(res, `${id}.kE`);
  const [d] = fitGet(res, `${id}.dE`);
  const p = planar ? 0 : fitGet(res, `${id}.dP`)[0];
  // f = k [cos p cos d, cos p sin d, sin p]; σ from the joint covariance of (k, d, p).
  const names = planar ? [`${id}.kE`, `${id}.dE`] : [`${id}.kE`, `${id}.dE`, `${id}.dP`];
  const ii = names.map((n) => fitIndex(res, n));
  const cov = (a: number, b: number) => res.P.data[ii[a]! * res.P.cols + ii[b]!]!;
  const cp = Math.cos(p);
  const sp = Math.sin(p);
  const cd = Math.cos(d);
  const sd = Math.sin(d);
  const jac = [
    [cp * cd, -k * cp * sd, -k * sp * cd],
    [cp * sd, k * cp * cd, -k * sp * sd],
    [sp, 0, k * cp],
  ];
  const sigma = (row: number[]) => {
    let v = 0;
    for (let a = 0; a < names.length; a++)
      for (let b = 0; b < names.length; b++) v += row[a]! * cov(a, b) * row[b]!;
    return Math.sqrt(Math.max(v, 0));
  };
  return {
    ...common,
    kind: 'engine',
    along: k * cp * cd,
    alongSigma: sigma(jac[0]!),
    across: k * cp * sd,
    acrossSigma: sigma(jac[1]!),
    up: k * sp,
    upSigma: planar ? 0 : sigma(jac[2]!),
    chi2PerDof: res.chi2 / (res.m - res.pEff),
    converged: res.converged,
  };
}
