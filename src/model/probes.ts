/**
 * Tracked asteroids as probes of the law (1G spec §10; DECISIONS A6, A11).
 *
 * An asteroid is a massless test particle like the ship, but it flies its own distances. Each
 * optical fix of an asteroid (azimuth, elevation and range from the ship) is combined with the
 * ship's believed position relative to a body at that time into a fix of that body as seen from
 * the asteroid. The ship's position comes from its Tier L window fits, which fit to the noise
 * whatever the law (a long-arc fit under a wrong law would bias every asteroid fix). The result
 * is an ordinary arc with no thrust, so everything built for the ship applies to it: windows and
 * local fits at the asteroid's distances (Tier L), its present state (six numbers), and its
 * forecast for clearance.
 *
 * [ASSUMED] Asteroid fixes without a range are not used (the ship needs the target's size for
 * a range, as 2B does). The ship's position error is treated as independent between fixes,
 * which is conservative per fix but ignores its correlation in time.
 */

import type { AttemptRecord, Measurement } from '../contracts/index.ts';
import * as quat from '../lib/quat.ts';
import type { Quat } from '../lib/quat.ts';
import { AttitudeLog, normalPoints } from './adapt.ts';
import {
  compileArc,
  simulate,
  type Arc,
  type ArcSolution,
  type EstMeasurement,
} from './dynamics.ts';

/** A bearing-and-range fix of one target from one camera at one time. */
export interface TargetFix {
  readonly t: number;
  readonly source: string;
  readonly target: string;
  readonly azimuth: number;
  readonly elevation: number;
  /** As reported: the azimuth sigma carries the 1 / cos(elevation). */
  readonly sigmaAzimuth: number;
  readonly sigmaElevation: number;
  readonly range: number;
  readonly sigmaRange: number;
}

/** Bearing+range pairs (same time, source and target) for targets that `keep` accepts. */
export function targetFixes(
  ms: readonly Measurement[],
  keep: (target: string) => boolean,
): TargetFix[] {
  const ranges = new Map<string, Measurement>();
  for (const m of ms)
    if (m.kind === 'range' && m.target && keep(m.target))
      ranges.set(`${m.t}|${m.source}|${m.target}`, m);
  const out: TargetFix[] = [];
  for (const m of ms) {
    if (m.kind !== 'bearing' || !m.target || !keep(m.target)) continue;
    const r = ranges.get(`${m.t}|${m.source}|${m.target}`);
    if (!r) continue;
    out.push({
      t: m.t,
      source: m.source,
      target: m.target,
      azimuth: m.value[0]!,
      elevation: m.value[1] ?? 0,
      sigmaAzimuth: m.sigma[0]!,
      sigmaElevation: m.sigma[1] ?? m.sigma[0]!,
      range: r.value[0]!,
      sigmaRange: r.sigma[0]!,
    });
  }
  return out;
}

const PROBE_SEP = '@';

/** Probe arc id: ship arc id, '@', asteroid id. */
export const probeArcId = (shipArc: string, asteroid: string) =>
  `${shipArc}${PROBE_SEP}${asteroid}`;
export const isProbeArc = (arcId: string) => arcId.includes(PROBE_SEP);
/** The ship arc a probe arc was built from (the arc id itself for ship arcs). */
export const shipArcOf = (arcId: string) => arcId.split(PROBE_SEP)[0]!;
export const asteroidOf = (arcId: string): string | null =>
  isProbeArc(arcId) ? arcId.slice(arcId.indexOf(PROBE_SEP) + 1) : null;
/** The attempt an arc belongs to (ship arcs `att` or `att~k`, probe arcs `…@asteroid`). */
export const attemptOfArc = (arcId: string) => shipArcOf(arcId).split('~')[0]!;

/**
 * Ship position relative to `body` at the given times (ascending, ≥ the solution's epoch), with
 * its 3×3 covariance [xx, xy, xz, yy, yz, zz] from the solution (central differences on its
 * parameters).
 */
export function shipRelative(
  sol: ArcSolution,
  body: string,
  times: readonly number[],
  dt: number,
  h: number,
): { pos: Float64Array[]; cov: Float64Array[] } {
  const ca = compileArc(sol.structure, sol.arc, sol.idx);
  const j = ca.bodyIndex.get(body);
  if (j === undefined) throw new Error(`shipRelative: ${body} is not in the solution`);
  const sh = 3 * ca.nb;
  const run = (x: ArrayLike<number>) =>
    simulate(ca, x, times, dt).pos.map((p) =>
      Float64Array.of(p[sh]! - p[3 * j]!, p[sh + 1]! - p[3 * j + 1]!, p[sh + 2]! - p[3 * j + 2]!),
    );
  const pos = run(sol.x);
  const P = sol.P;
  const rel = P ? sol.rel.filter((i) => ca.moves.has(i)) : [];
  const cols: Float64Array[][] = [];
  const xp = new Float64Array(sol.x);
  for (const i of rel) {
    const step = h * sol.scale[i]!;
    xp[i] = sol.x[i]! + step;
    const plus = run(xp);
    xp[i] = sol.x[i]! - step;
    const minus = run(xp);
    xp[i] = sol.x[i]!;
    cols.push(
      plus.map((pp, k) =>
        Float64Array.of(
          (pp[0]! - minus[k]![0]!) / (2 * step),
          (pp[1]! - minus[k]![1]!) / (2 * step),
          (pp[2]! - minus[k]![2]!) / (2 * step),
        ),
      ),
    );
  }
  const cov = times.map((_, k) => {
    const c = new Float64Array(6);
    if (!P) return c;
    const n = P.cols;
    for (let a = 0; a < rel.length; a++) {
      const ja = cols[a]![k]!;
      for (let b = 0; b < rel.length; b++) {
        const pab = P.data[rel[a]! * n + rel[b]!]!;
        if (pab === 0) continue;
        const jb = cols[b]![k]!;
        c[0]! += ja[0]! * pab * jb[0]!;
        c[1]! += ja[0]! * pab * jb[1]!;
        c[2]! += ja[0]! * pab * jb[2]!;
        c[3]! += ja[1]! * pab * jb[1]!;
        c[4]! += ja[1]! * pab * jb[2]!;
        c[5]! += ja[2]! * pab * jb[2]!;
      }
    }
    return c;
  });
  return { pos, cov };
}

const unitOf = (az: number, el: number): readonly number[] => {
  const ce = Math.cos(el);
  return [ce * Math.cos(az), ce * Math.sin(az), Math.sin(el)];
};

/** v turned by the rotation vector w (Rodrigues). */
function turn(w: readonly number[], v: readonly number[]): [number, number, number] {
  const a = Math.hypot(w[0]!, w[1]!, w[2]!);
  if (a === 0) return [v[0]!, v[1]!, v[2]!];
  const s = a < 1e-12 ? 1 : Math.sin(a) / a;
  const c = a < 1e-12 ? 0.5 : (1 - Math.cos(a)) / (a * a);
  const cx = w[1]! * v[2]! - w[2]! * v[1]!;
  const cy = w[2]! * v[0]! - w[0]! * v[2]!;
  const cz = w[0]! * v[1]! - w[1]! * v[0]!;
  return [
    v[0]! + s * cx + c * (w[1]! * cz - w[2]! * cy),
    v[1]! + s * cy + c * (w[2]! * cx - w[0]! * cz),
    v[2]! + s * cz + c * (w[0]! * cy - w[1]! * cx),
  ];
}

/** uᵀ C v for a symmetric 3×3 stored as [xx, xy, xz, yy, yz, zz]. */
const quad = (c: ArrayLike<number>, u: readonly number[], v: readonly number[]) =>
  u[0]! * (c[0]! * v[0]! + c[1]! * v[1]! + c[2]! * v[2]!) +
  u[1]! * (c[1]! * v[0]! + c[3]! * v[1]! + c[4]! * v[2]!) +
  u[2]! * (c[2]! * v[0]! + c[4]! * v[1]! + c[5]! * v[2]!);

/**
 * Probe arcs of one attempt: one per asteroid per ship arc, holding fixes of each modelled body
 * as seen from the asteroid, averaged into normal points. `pathFor(body, t)` gives the fit that
 * holds the ship's believed path relative to that body at t (a Tier L window fit), or null.
 */
export function probeArcs(input: {
  readonly record: AttemptRecord;
  readonly shipArcs: readonly Arc[];
  readonly bodies: readonly string[];
  /** Every briefed massive body, modelled or not: never an asteroid. */
  readonly knownBodies?: readonly string[];
  readonly pathFor: (body: string, t: number) => ArcSolution | null;
  /**
   * Believed camera misalignment (rotation vector, body frame): taken out of the asteroid's
   * measured direction, and put back on the derived fixes, which the estimator then treats like
   * any other fix.
   */
  readonly cameraBias: readonly [number, number, number];
  readonly dt: number;
  readonly h: number;
  readonly normalPointInterval: number;
  /** Planar reduction: the derived fixes carry no elevation row. */
  readonly planar?: boolean;
}): Arc[] {
  const bodySet = new Set([...input.bodies, ...(input.knownBodies ?? [])]);
  const fixes = targetFixes(input.record.measurements, (t) => !bodySet.has(t));
  if (fixes.length === 0) return [];
  const att = new AttitudeLog(input.record.measurements);
  // Ship positions, batched per path.
  const ship = new Map<string, { pos: Float64Array; cov: Float64Array }>(); // `${body}|${t}`
  for (const body of input.bodies) {
    const groups = new Map<ArcSolution, number[]>();
    for (const t of new Set(fixes.map((f) => f.t))) {
      const sol = input.pathFor(body, t);
      if (!sol) continue;
      const list = groups.get(sol);
      if (list) list.push(t);
      else groups.set(sol, [t]);
    }
    for (const [sol, ts] of groups) {
      const times = ts.sort((a, b) => a - b);
      const r = shipRelative(sol, body, times, input.dt, input.h);
      times.forEach((t, k) => ship.set(`${body}|${t}`, { pos: r.pos[k]!, cov: r.cov[k]! }));
    }
  }
  const b = input.cameraBias;
  const hasBias = b[0] !== 0 || b[1] !== 0 || b[2] !== 0;
  const arcs = [...input.shipArcs].sort((a, b2) => a.epoch - b2.epoch);
  const out: Arc[] = [];
  arcs.forEach((shipArc, k) => {
    const end = k + 1 < arcs.length ? arcs[k + 1]!.epoch : Infinity;
    const start = k === 0 ? -Infinity : shipArc.epoch;
    const byAsteroid = new Map<string, EstMeasurement[]>();
    for (const f of fixes) {
      if (f.t < start || f.t >= end) continue;
      const q: Quat | undefined = att.at(f.t);
      // The misalignment in the inertial frame at this fix: C(q) b.
      let w: [number, number, number] = [0, 0, 0];
      if (hasBias) {
        const v = quat.rotate(q ?? quat.IDENTITY, { x: b[0], y: b[1], z: b[2] });
        w = [v.x, v.y, v.z];
      }
      // Measured direction and its tangent basis, turned back to the believed true direction.
      const se = Math.sin(f.elevation);
      const back = (v: readonly number[]) => (hasBias ? turn([-w[0], -w[1], -w[2]], v) : v);
      const u = back(unitOf(f.azimuth, f.elevation));
      const eE = back([-Math.sin(f.azimuth), Math.cos(f.azimuth), 0]);
      const eN = back([
        -se * Math.cos(f.azimuth),
        -se * Math.sin(f.azimuth),
        Math.cos(f.elevation),
      ]);
      // Across the line of sight: the arcs the two angle errors subtend at the target.
      const cE = f.range * f.sigmaAzimuth * Math.cos(f.elevation);
      const cN = input.planar ? 0 : f.range * f.sigmaElevation;
      const sr2 = f.sigmaRange ** 2;
      for (const body of input.bodies) {
        const sp = ship.get(`${body}|${f.t}`);
        if (!sp) continue;
        // Asteroid relative to the body, and its covariance: ship path ⊕ fix.
        const pos = [0, 1, 2].map((c) => sp.pos[c]! + f.range * u[c]!);
        const cov = new Float64Array(6);
        let i = 0;
        for (let r = 0; r < 3; r++)
          for (let c = r; c < 3; c++)
            cov[i] =
              sp.cov[i++]! +
              sr2 * u[r]! * u[c]! +
              cE * cE * eE[r]! * eE[c]! +
              cN * cN * eN[r]! * eN[c]!;
        const R = Math.hypot(pos[0]!, pos[1]!, pos[2]!);
        const hd = [pos[0]! / R, pos[1]! / R, pos[2]! / R];
        // The body as the asteroid sees it: the true direction with its tangent basis (for the
        // sigmas), then as the camera would report it.
        const toBody = [-hd[0]!, -hd[1]!, -hd[2]!];
        const azT = Math.atan2(toBody[1]!, toBody[0]!);
        const elT = Math.asin(Math.max(-1, Math.min(1, toBody[2]!)));
        const tE = [-Math.sin(azT), Math.cos(azT), 0];
        const tN = [-Math.sin(elT) * Math.cos(azT), -Math.sin(elT) * Math.sin(azT), Math.cos(elT)];
        const seen = hasBias ? turn(w, toBody) : toBody;
        const az = Math.atan2(seen[1]!, seen[0]!);
        const el = input.planar ? 0 : Math.asin(Math.max(-1, Math.min(1, seen[2]!)));
        const ce = Math.cos(el);
        const sR = Math.sqrt(Math.max(quad(cov, hd, hd), 0));
        const sE = Math.sqrt(Math.max(quad(cov, tE, tE), 0)) / R;
        const sN = Math.sqrt(Math.max(quad(cov, tN, tN), 0)) / R;
        const meas: EstMeasurement = {
          kind: 'opnav',
          t: f.t,
          target: body,
          z: [az, el, R],
          // The azimuth sigma is reported as the arc over cos(elevation), as a sensor does.
          sigma: [sE / Math.max(ce, 1e-12), input.planar ? null : sN, sR],
          ...(q ? { q } : {}),
        };
        const list = byAsteroid.get(f.target);
        if (list) list.push(meas);
        else byAsteroid.set(f.target, [meas]);
      }
    }
    for (const [ast, meas] of [...byAsteroid.entries()].sort((a, b2) => (a[0] < b2[0] ? -1 : 1))) {
      const pts = normalPoints(meas, [], input.normalPointInterval, att);
      out.push({ id: probeArcId(shipArc.id, ast), epoch: pts[0]!.t, commands: [], meas: pts });
    }
  });
  return out;
}
