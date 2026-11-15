/**
 * Player-facing diagnostics as plain JSON for the console (1G spec revision 3, §9; layout belongs
 * to 2D). Missing data is reported as missing: no windows means no points, not zeros.
 */

import type { AttemptId, Vec3 } from '../contracts/index.ts';
import {
  burnResponse,
  empiricalFit,
  gmSlope,
  profileDeparture,
  type BurnResponse,
  type EmpiricalRow,
} from './diagnostics.ts';
import {
  EXPONENT_ID,
  cameraIds,
  misalignId,
  pitchId,
  referenceFor,
  scaleId,
  type ModelContext,
  type ModelDerived,
  type ModelSnapshot,
} from './engine.ts';
import { poweredAt } from './dynamics.ts';
import { pick, symEig } from './linalg.ts';
import { asteroidOf, attemptOfArc } from './probes.ts';
import {
  confounding,
  fitCorr,
  fitGet,
  multipleCorrelation,
  residualSummary,
  type Confounding,
  type FitResult,
  type ResidualClass,
} from './solve.ts';

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
  /** Azimuth of `direction` (from +x toward +y), rad. */
  readonly azimuth: number;
  /** Elevation of `direction` above the inertial x–y plane, rad. */
  readonly elevation: number;
  /** Mean direction of the ship as seen from the body over the window: a point on the sphere. */
  readonly direction: Vec3;
  /** The axis the line of sight turned about over the window: its orbit plane's normal. */
  readonly planeNormal: Vec3;
  /**
   * Departure from the calibration profile in σ of the window, (g − g_profile(r)) / σ_g (§9.2):
   * shown at `direction`, it is blank under a wrong distance law and paints a missing body's tide.
   */
  readonly departure: number;
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
  /** Whitened residual (z − h)/σ, in its direction (`kind`). */
  readonly value: number;
}

/**
 * §9.3 in 3D, per thruster: how the engine scale and the two misalignment angles share their
 * uncertainty. Roll only mixes the two angles, so the multiple correlation of the scale with both
 * is what finds a confound sitting on either or both.
 */
export interface EngineAngles {
  readonly thruster: string;
  /** R(kE | dE, dP). */
  readonly scaleWithAngles: number;
  /** ρ(dE, dP). */
  readonly angleCorrelation: number;
  /** Posterior σ / prior σ of each angle (1: the data taught nothing). */
  readonly yawPosteriorOverPrior: number | null;
  readonly pitchPosteriorOverPrior: number | null;
  /** What would help, in plain words, when the angles or the scale are not separated. */
  readonly advice: string | null;
}

/** §9.7: what the data have constrained of the camera misalignment (body frame). */
export interface CameraConstraint {
  /** Principal σ of the three components over the prior σ, ascending. */
  readonly principalOverPrior: readonly [number, number, number];
  /** The least-determined direction (body frame): re-pointing the ship about another axis measures it. */
  readonly leastDetermined: Vec3;
}

export interface DataCoverage {
  readonly attempt: AttemptId;
  /** False when none of the attempt's tracking is in the fits; `missing` then says why. */
  readonly used: boolean;
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
  /** §9.3 in 3D: the engine scale against both misalignment angles, per thruster. */
  readonly engineAngles: readonly EngineAngles[];
  /** §9.7: what the data have told about the camera misalignment; null without a fit. */
  readonly camera: CameraConstraint | null;
  /**
   * Set when the global fit ran and could not be solved: the reason. The numbers are then held
   * at their priors and each attempt is fitted on its own.
   */
  readonly fitFailure: string | null;
  /** Per attempt, used or not: an attempt the model cannot use is listed with the reason. */
  readonly coverage: readonly DataCoverage[];
  readonly noiseScale: number;
  /** Default hedge σ_h0 outside sampled distances (§8.2). */
  readonly defaultHedge: number;
  /** Per body: validated spans of adopted rules and their earned σ_e (§7.4, A5). */
  readonly validated: ModelDerived['validated'];
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
        azimuth: Math.atan2(w.direction[1], w.direction[0]),
        elevation: Math.atan2(w.direction[2], Math.hypot(w.direction[0], w.direction[1])),
        direction: { x: w.direction[0], y: w.direction[1], z: w.direction[2] },
        planeNormal: { x: w.planeNormal[0], y: w.planeNormal[1], z: w.planeNormal[2] },
        departure: prof ? profileDeparture(w, prof) : 0,
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
  // §9.1: along the track, out of the plane, along the line of sight; accelerometer apart.
  const residuals: ResidualPoint[] = fit
    ? fit.directed.map((r) => ({
        attempt: r.arc.split('~')[0]!,
        t: r.t,
        kind: r.direction,
        target: r.target ?? null,
        powered: r.powered,
        value: r.value,
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
  const engineAngles = fit ? anglesReport(fit, d, priorSigma) : [];
  const camera = fit ? cameraReport(fit, d, priorSigma) : null;
  const coverage: DataCoverage[] = [...d.problem.builds.entries()].map(([attempt, b]) => {
    let coast = 0;
    let powered = 0;
    let accel = 0;
    for (const a of b.arcs)
      for (const m of a.meas) {
        if (m.kind === 'accel') accel++;
        else if (m.kind === 'opnav') {
          const p = poweredAt(a.commands, m.t);
          if (p) powered++;
          else coast++;
        }
      }
    const missing: string[] = [];
    const unusable = d.unusable.get(attempt);
    if (unusable !== undefined) missing.push(`not used by the model: ${unusable}`);
    else if (b.arcs.length === 0)
      missing.push('no fittable tracking (fewer than 3 range fixes on the primary)');
    else for (const q of b.skipped) missing.push(`${q.arc} not fitted: ${q.reason}`);
    if (coast === 0) missing.push('no coasting fixes');
    if (b.burns.length > 0 && powered === 0) missing.push('no fixes while thrusting');
    if (b.burns.length > 0 && accel === 0) missing.push('no accelerometer record during burns');
    if (b.unknownAttitude.length > 0) missing.push('burns without an attitude record');
    return {
      attempt,
      used: b.arcs.length > 0,
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
    engineAngles,
    camera,
    fitFailure: d.fitFailure ?? null,
    coverage,
    noiseScale: d.noiseScale,
    defaultHedge: d.sigmaH0,
    validated: d.validated,
  };
}

/** §9.3 in 3D per thruster: R(kE | dE, dP), ρ(dE, dP) and both angles' posterior/prior σ. */
function anglesReport(
  fit: FitResult,
  d: ModelDerived,
  priorSigma: Readonly<Record<string, number>>,
): EngineAngles[] {
  const limit = d.spec.settings.confoundedRho;
  const out: EngineAngles[] = [];
  for (const g of d.problem.globals) {
    const m = /^thruster\.(.+)\.scale$/.exec(g);
    if (!m || !fit.names.includes(misalignId(m[1]!))) continue;
    const thr = m[1]!;
    const yaw = misalignId(thr);
    const pitch = pitchId(thr);
    const hasPitch = fit.names.includes(pitch);
    const ratio = (id: string) =>
      fit.names.includes(id) && priorSigma[id] ? fitGet(fit, id)[1] / priorSigma[id] : null;
    const R = multipleCorrelation(fit, scaleId(thr), hasPitch ? [yaw, pitch] : [yaw]);
    const rho = hasPitch ? fitCorr(fit, yaw, pitch) : 0;
    const loose = (ratio(yaw) ?? 0) > 0.5 || (ratio(pitch) ?? 0) > 0.5;
    out.push({
      thruster: thr,
      scaleWithAngles: R,
      angleCorrelation: rho,
      yawPosteriorOverPrior: ratio(yaw),
      pitchPosteriorOverPrior: ratio(pitch),
      advice:
        R > limit || Math.abs(rho) > limit || loose
          ? 'record the accelerometer during burns, or coast longer on each side of a burn'
          : null,
    });
  }
  return out;
}

/** §9.7: principal σ of the camera misalignment against its prior, and its weakest axis. */
function cameraReport(
  fit: FitResult,
  d: ModelDerived,
  priorSigma: Readonly<Record<string, number>>,
): CameraConstraint | null {
  const ids = cameraIds(d.spec.cameraId);
  if (!ids.every((id) => fit.names.includes(id))) return null;
  const ii = ids.map((id) => fit.names.indexOf(id));
  const { values, vectors } = symEig(pick(fit.P, ii));
  const prior = priorSigma[ids[2]] ?? d.spec.settings.priorCameraBiasSigma;
  const r = Array.from(values, (v) => Math.sqrt(Math.max(v, 0)) / prior);
  return {
    principalOverPrior: [r[0]!, r[1]!, r[2]!],
    leastDetermined: { x: vectors.data[2]!, y: vectors.data[5]!, z: vectors.data[8]! },
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
  /** Largest orbit-normal term in σ: a body off the orbit plane shows here first (§9.4). */
  readonly maxAbsNormalZ: number;
  readonly chi2PerDof: number;
}

/** §9.4 empirical radial, tangential and orbit-normal acceleration on the calibrated law. */
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
    maxAbsNormalZ: emp.maxAbsNormalZ,
    chi2PerDof: emp.fit.chi2 / (emp.fit.m - emp.fit.pEff),
  };
}
