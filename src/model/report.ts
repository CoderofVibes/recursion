/**
 * Player-facing diagnostics as plain JSON for the console (1G spec §9; layout belongs to 2D).
 * Missing data is reported as missing: no windows means no points, not zeros.
 */

import type { AttemptId } from '../contracts/index.ts';
import {
  burnResponse,
  empiricalFit,
  gmSlope,
  type BurnResponse,
  type EmpiricalRow,
} from './diagnostics.ts';
import { EXPONENT_ID, referenceFor, type ModelContext, type ModelSnapshot } from './engine.ts';
import { asteroidOf, attemptOfArc } from './probes.ts';
import { confounding, residualSummary, type Confounding, type ResidualClass } from './solve.ts';

export interface StrengthPoint {
  readonly attempt: AttemptId;
  /** Set when the window came from a tracked asteroid (a probe at its own distances, §10). */
  readonly probe?: string;
  readonly window: string;
  readonly start: number;
  readonly end: number;
  /** Geometric-mean distance and the window's extreme distances, m. */
  readonly distance: number;
  readonly rMin: number;
  readonly rMax: number;
  /** Direction of the ship as seen from the body, rad. */
  readonly azimuth: number;
  /** Local GM = μ_ref × g, m³/s², and its σ. */
  readonly gm: number;
  readonly gmSigma: number;
  readonly scale: number;
  readonly scaleSigma: number;
  readonly converged: boolean;
}

export interface BodyStrength {
  readonly body: string;
  /** μ of the reference law (the flat line under a Newtonian model). */
  readonly referenceMu: number;
  readonly referenceExponent: number;
  readonly points: readonly StrengthPoint[];
  /** Weighted d ln GM / d ln r (§9.2); null with fewer than two windows. */
  readonly slope: number | null;
  /** Profile inflation (§5.4): ≈1 when distance explains the local scales. */
  readonly inflation: number | null;
}

export interface ResidualPoint {
  readonly attempt: AttemptId;
  readonly t: number;
  readonly kind: string;
  readonly target: string | null;
  readonly powered: boolean;
  /** Whitened residual (z − h)/σ. */
  readonly value: number;
}

export interface DataCoverage {
  readonly attempt: AttemptId;
  readonly coastFixes: number;
  readonly poweredFixes: number;
  readonly accelSamples: number;
  readonly burns: number;
  readonly burnsWithoutAttitude: number;
  /** Plain statements of what is missing, e.g. "no coasting fixes". */
  readonly missing: readonly string[];
}

export interface ModelReport {
  readonly modelVersion: number;
  readonly strength: readonly BodyStrength[];
  readonly residuals: readonly ResidualPoint[];
  readonly residualSummary: Readonly<Record<string, ResidualClass>>;
  readonly confounding: Confounding | null;
  readonly coverage: readonly DataCoverage[];
  readonly noiseScale: number;
  readonly hedge: number;
}

/** §9.1–§9.3 from a snapshot. Cheap: no new fits. */
export function modelReport(snap: ModelSnapshot): ModelReport {
  const d = snap.derived;
  const n = d.spec.exponent ? (d.values[EXPONENT_ID] ?? 2) : 2;
  const strength: BodyStrength[] = d.spec.bodies.map((body) => {
    const mu = d.values[`body.${body}.mu`] ?? 0;
    const rows = d.windows.filter((w) => w.body === body);
    const prof = d.profiles.find((p) => p.body === body);
    return {
      body,
      referenceMu: mu,
      referenceExponent: n,
      points: rows.map((w) => ({
        attempt: attemptOfArc(w.arc),
        ...(asteroidOf(w.arc) !== null ? { probe: asteroidOf(w.arc)! } : {}),
        window: w.window,
        start: w.t0,
        end: w.t1,
        distance: w.rGeoMean,
        rMin: w.rMin,
        rMax: w.rMax,
        azimuth: w.azimuth,
        gm: mu * w.g,
        gmSigma: mu * w.sigma,
        scale: w.g,
        scaleSigma: w.sigma,
        converged: w.converged,
      })),
      slope: gmSlope(rows)?.slope ?? null,
      inflation: prof ? prof.inflation : null,
    };
  });
  const fit = d.fit;
  const residuals: ResidualPoint[] = fit
    ? fit.residTags.map((t, i) => ({
        attempt: t.arc.split('~')[0]!,
        t: t.t,
        kind: t.kind,
        target: t.target ?? null,
        powered: t.powered,
        value: fit.resid[i]!,
      }))
    : [];
  const gravity = d.problem.globals.filter((g) => g.startsWith('body.') || g === EXPONENT_ID);
  const propulsion = d.problem.globals.filter(
    (g) => g.startsWith('thruster.') || /^sensor\..+\.scale$/.test(g),
  );
  const priorSigma: Record<string, number> = {};
  for (const p of d.problem.params)
    if (p.priorSigma !== undefined) priorSigma[p.name] = p.priorSigma;
  const conf =
    fit && propulsion.length > 0
      ? confounding(fit, gravity, propulsion, priorSigma, d.spec.settings.confoundedRho)
      : null;
  const coverage: DataCoverage[] = [...d.problem.builds.entries()].map(([attempt, b]) => {
    let coast = 0;
    let powered = 0;
    let accel = 0;
    for (const a of b.arcs)
      for (const m of a.meas) {
        if (m.kind === 'accel') accel++;
        else if (m.kind === 'opnav') {
          const p = a.commands.some((c) => c.u !== 0 && m.t >= c.t0 && m.t < c.t1);
          if (p) powered++;
          else coast++;
        }
      }
    const missing: string[] = [];
    if (b.arcs.length === 0)
      missing.push('no fittable tracking (fewer than 3 range fixes on the primary)');
    if (coast === 0) missing.push('no coasting fixes');
    if (b.burns.length > 0 && powered === 0) missing.push('no fixes while thrusting');
    if (b.burns.length > 0 && accel === 0) missing.push('no accelerometer record during burns');
    if (b.unknownAttitude.length > 0) missing.push('burns without an attitude record');
    return {
      attempt,
      coastFixes: coast,
      poweredFixes: powered,
      accelSamples: accel,
      burns: b.burns.length,
      burnsWithoutAttitude: b.unknownAttitude.length,
      missing,
    };
  });
  return {
    modelVersion: snap.state.version,
    strength,
    residuals,
    residualSummary: fit ? residualSummary(fit) : {},
    confounding: conf,
    coverage,
    noiseScale: d.noiseScale,
    hedge: d.hedge,
  };
}

export interface BurnReport extends BurnResponse {
  readonly attempt: AttemptId;
  readonly thruster: string;
}

/** §9.5 per-burn response for every burn of the given attempts (more costly: one fit per burn). */
export function burnReport(
  snap: ModelSnapshot,
  ctx: ModelContext,
  attempts?: readonly AttemptId[],
): BurnReport[] {
  const d = snap.derived;
  const out: BurnReport[] = [];
  for (const [attempt, b] of d.problem.builds) {
    if (attempts && !attempts.includes(attempt)) continue;
    for (const arc of b.arcs) {
      const ref = referenceFor(d, d.spec.primary, arc.id, ctx);
      for (const burn of b.burns) {
        if (burn.t1 <= arc.epoch) continue;
        const segs = arc.commands.filter(
          (c) => c.thruster === burn.thruster && c.t0 >= burn.t0 && c.t1 <= burn.t1,
        );
        const r = burnResponse(
          ref,
          [...d.profiles, ...d.flatProfiles],
          arc,
          segs,
          d.spec.settings.dt,
          d.spec.settings.burnPad,
        );
        if (r) out.push({ ...r, attempt, thruster: burn.thruster });
      }
    }
  }
  return out;
}

export interface EmpiricalReport {
  readonly body: string;
  readonly rows: readonly (EmpiricalRow & { readonly attempt: AttemptId })[];
  readonly maxAbsTangentialZ: number;
  readonly chi2PerDof: number;
}

/** §9.4 empirical radial/tangential acceleration on the calibrated law (one Tier G-sized fit). */
export function empiricalReport(snap: ModelSnapshot, ctx: ModelContext): EmpiricalReport | null {
  const d = snap.derived;
  const arcs = d.problem.arcs;
  if (arcs.length === 0) return null;
  const body = d.spec.primary;
  const prof = d.profiles.find((p) => p.body === body) ?? null;
  const ref = referenceFor(d, body, arcs[0]!.id, ctx);
  const s = d.spec.settings;
  const emp = empiricalFit(ref, prof, arcs, { dt: s.dt, h: s.fdStep });
  return {
    body,
    rows: emp.table.map((r) => ({ ...r, attempt: r.window.split('.emp')[0]!.split('~')[0]! })),
    maxAbsTangentialZ: emp.maxAbsTangentialZ,
    chi2PerDof: emp.fit.chi2 / (emp.fit.m - emp.fit.pEff),
  };
}
