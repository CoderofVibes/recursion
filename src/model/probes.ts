/**
 * Tracked asteroids as probes of the law (1G spec §10; DECISIONS A6).
 *
 * An asteroid is a massless test particle like the ship, but it flies its own distances. Each
 * optical fix of an asteroid (bearing and range from the ship) is combined with the ship's
 * believed position relative to a body at that time into a fix of that body as seen from the
 * asteroid. The ship's position comes from its Tier L window fits, which fit to the noise
 * whatever the law (a long-arc fit under a wrong law would bias every asteroid fix). The result is an ordinary arc with no thrust, so
 * everything built for the ship applies to it: windows and local fits at the asteroid's
 * distances (Tier L), its present state, and its forecast for clearance.
 *
 * [ASSUMED] Asteroid fixes without a range are not used (the ship needs the target's size for
 * a range, as 2B does). The ship's position error is treated as independent between fixes,
 * which is conservative per fix but ignores its correlation in time.
 */

import type { AttemptRecord, Measurement } from '../contracts/index.ts';
import { normalPoints } from './adapt.ts';
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
  readonly bearing: number;
  readonly sigmaBearing: number;
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
    // LIFT(2G): a bearing enters as its azimuth ([0]); elevation ([1]) is ignored.
    out.push({
      t: m.t,
      source: m.source,
      target: m.target,
      bearing: m.value[0]!,
      sigmaBearing: m.sigma[0]!,
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
 * its 2×2 covariance [xx, xy, yy] from the solution (central differences on its parameters).
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
  const sh = ca.nb;
  const run = (x: ArrayLike<number>) =>
    simulate(ca, x, times, dt).pos.map((p) =>
      Float64Array.of(p[2 * sh]! - p[2 * j]!, p[2 * sh + 1]! - p[2 * j + 1]!),
    );
  const pos = run(sol.x);
  const P = sol.P;
  const rel = P ? sol.rel : [];
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
        ),
      ),
    );
  }
  const cov = times.map((_, k) => {
    const c = new Float64Array(3);
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
        c[2]! += ja[1]! * pab * jb[1]!;
      }
    }
    return c;
  });
  return { pos, cov };
}

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
  /** Believed camera bias (rad): removed from asteroid bearings, kept on the derived fixes. */
  readonly cameraBias: number;
  readonly dt: number;
  readonly h: number;
  readonly normalPointInterval: number;
}): Arc[] {
  const bodySet = new Set([...input.bodies, ...(input.knownBodies ?? [])]);
  const fixes = targetFixes(input.record.measurements, (t) => !bodySet.has(t));
  if (fixes.length === 0) return [];
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
  const arcs = [...input.shipArcs].sort((a, b) => a.epoch - b.epoch);
  const out: Arc[] = [];
  arcs.forEach((shipArc, k) => {
    const end = k + 1 < arcs.length ? arcs[k + 1]!.epoch : Infinity;
    const start = k === 0 ? -Infinity : shipArc.epoch;
    const byAsteroid = new Map<string, EstMeasurement[]>();
    for (const f of fixes) {
      if (f.t < start || f.t >= end) continue;
      const b = f.bearing - input.cameraBias;
      const ux = Math.cos(b);
      const uy = Math.sin(b);
      const cr = f.range * f.sigmaBearing;
      for (const body of input.bodies) {
        const sp = ship.get(`${body}|${f.t}`);
        if (!sp) continue;
        const qx = sp.pos[0]! + f.range * ux;
        const qy = sp.pos[1]! + f.range * uy;
        // Covariance of the asteroid's position relative to the body: ship path ⊕ fix.
        const cxx = sp.cov[0]! + f.sigmaRange ** 2 * ux * ux + cr * cr * uy * uy;
        const cxy = sp.cov[1]! + (f.sigmaRange ** 2 - cr * cr) * ux * uy;
        const cyy = sp.cov[2]! + f.sigmaRange ** 2 * uy * uy + cr * cr * ux * ux;
        const R = Math.hypot(qx, qy);
        const hx = qx / R;
        const hy = qy / R;
        const sR = Math.sqrt(Math.max(hx * hx * cxx + 2 * hx * hy * cxy + hy * hy * cyy, 0));
        const sB = Math.sqrt(Math.max(hy * hy * cxx - 2 * hx * hy * cxy + hx * hx * cyy, 0)) / R;
        const m: EstMeasurement = {
          kind: 'opnav',
          t: f.t,
          target: body,
          z: [Math.atan2(-qy, -qx) + input.cameraBias, R],
          sigma: [sB, sR],
        };
        const list = byAsteroid.get(f.target);
        if (list) list.push(m);
        else byAsteroid.set(f.target, [m]);
      }
    }
    for (const [ast, meas] of [...byAsteroid.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      const pts = normalPoints(meas, [], input.normalPointInterval);
      out.push({ id: probeArcId(shipArc.id, ast), epoch: pts[0]!.t, commands: [], meas: pts });
    }
  });
  return out;
}
