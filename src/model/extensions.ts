/**
 * Model extensions (1G spec §6, §7; DECISIONS A4, P5): rules come only from the player.
 *
 * candidate → fitted on training attempts (Tier G) → validated on a held-out attempt →
 * adoptable | rejected; adoption happens only when the player adopts a passing rule, and the
 * player can revoke it. Every test is kept with its numbers (Black Box stores the history).
 * A validated rule earns a smaller hedge (§7.4). Empirical acceleration is a diagnostic, never
 * a rule (§6.4), so it cannot be tested or adopted here.
 */

import type {
  AttemptId,
  AttemptRecord,
  ExtensionId,
  ExtensionState,
  ValidationResult,
} from '../contracts/index.ts';
import {
  stagedFit,
  evidence,
  fitGet,
  heldOutConsistency,
  identifiability,
  type FitResult,
  type HeldOutResult,
} from './solve.ts';
import {
  EXPONENT_ID,
  crossRangeResiduals,
  extensionBody,
  modelSpec,
  referenceFor,
  tierGProblem,
  windowRule,
  type ArcSolution,
  type ModelContext,
} from './engine.ts';
import { earnedHedge, localFit, makeWindows, rangeFixes } from './tierL.ts';

/** Extensions the model can fit (unseen-body and region thrust response are specified only). */
export function isTestableExtension(ext: ExtensionId): boolean {
  return ext === 'distance-law' || extensionBody(ext) !== null;
}

export interface ExtensionRecord {
  readonly state: ExtensionState;
  readonly training: readonly AttemptId[];
  readonly heldOut?: AttemptId;
  readonly evidence?: {
    readonly deltaCost: number;
    readonly penalty: number;
    readonly evidence: boolean;
  };
  readonly identifiable?: { readonly identifiable: boolean; readonly reasons: readonly string[] };
  readonly heldOutTest?: Omit<HeldOutResult, 'fit' | 'globalShiftSigma'> & {
    readonly globalShiftSigma: Readonly<Record<string, number>>;
  };
  /** Fitted values of the parameters the extension adds. */
  readonly fitted?: Readonly<Record<string, { readonly value: number; readonly sigma: number }>>;
  /** Hedge earned in the held-out test (§7.4); absent if nothing was earned. */
  readonly earnedHedge?: number;
  /** Passed the held-out test with training evidence and identifiable parameters. */
  readonly adoptable: boolean;
}

interface Trained {
  readonly fit: FitResult;
  readonly heldOut: HeldOutResult;
  readonly problem: ReturnType<typeof tierGProblem>;
  readonly heldArcId: string;
}

function trainAndHoldOut(
  ctx: ModelContext,
  adopted: readonly ExtensionId[],
  train: readonly AttemptRecord[],
  held: AttemptRecord,
): Trained {
  const spec = modelSpec(ctx, adopted);
  const s = spec.settings;
  const problem = tierGProblem(ctx, spec, [...train, held]);
  const heldArcs = problem.builds.get(held.id)?.arcs ?? [];
  if (heldArcs.length === 0) throw new Error(`held-out attempt ${held.id} has no fittable arc`);
  const heldArc = heldArcs.reduce((a, b) => (b.meas.length > a.meas.length ? b : a));
  const trainArcIds = new Set(
    train.flatMap((r) => problem.builds.get(r.id)?.arcs.map((a) => a.id) ?? []),
  );
  const trainArcs = problem.arcs.filter((a) => trainArcIds.has(a.id));
  if (trainArcs.length === 0) throw new Error('no training attempt has a fittable arc');
  const trainParams = problem.params.filter(
    (p) => p.group === 'global' || trainArcIds.has(p.group),
  );
  const opts = { dt: s.dt, h: s.fdStep };
  const fit = stagedFit(problem.structure, trainArcs, trainParams, opts);
  const local = problem.params.filter((p) => p.group === heldArc.id);
  const heldOut = heldOutConsistency(
    problem.structure,
    fit,
    trainParams,
    heldArc,
    local,
    opts,
    s.heldOutSigmaK,
  );
  return { fit, heldOut, problem, heldArcId: heldArc.id };
}

function heldRms(t: Trained): number {
  const arc = t.problem.arcs.find((a) => a.id === t.heldArcId)!;
  const res = crossRangeResiduals({
    fit: t.heldOut.fit,
    problem: { ...t.problem, arcs: [arc] },
  });
  return res.length ? Math.sqrt(res.reduce((q, r) => q + r.m * r.m, 0) / res.length) : 0;
}

/**
 * Fit an extension on the training attempts and test it on a held-out attempt (§7.1, §7.2,
 * §7.4, §7.5). Does not adopt anything.
 */
export function testExtension(
  ctx: ModelContext,
  attempts: readonly AttemptRecord[],
  adopted: readonly ExtensionId[],
  ext: ExtensionId,
  training: readonly AttemptId[],
  heldOutId: AttemptId,
  modelVersion: number,
): ExtensionRecord {
  if (!isTestableExtension(ext)) throw new Error(`extension ${ext} cannot be fitted by this model`);
  if (training.includes(heldOutId))
    throw new Error('the held-out attempt must not be a training attempt');
  const byId = new Map(attempts.map((a) => [a.id, a]));
  const train = training.map((id) => {
    const r = byId.get(id);
    if (!r) throw new Error(`unknown attempt ${id}`);
    return r;
  });
  const held = byId.get(heldOutId);
  if (!held) throw new Error(`unknown attempt ${heldOutId}`);
  const baseAdopted = adopted.filter((e) => e !== ext);
  const withExt = [...baseAdopted, ext];
  const base = trainAndHoldOut(ctx, baseAdopted, train, held);
  const extd = trainAndHoldOut(ctx, withExt, train, held);
  const added = extd.problem.globals.filter((g) => !base.problem.globals.includes(g));
  const ev = evidence(base.fit, extd.fit, added.length);
  const priorSigma: Record<string, number> = {};
  for (const p of extd.problem.params)
    if (p.priorSigma !== undefined) priorSigma[p.name] = p.priorSigma;
  const ident = identifiability(extd.fit, added, priorSigma, extd.problem.globals);
  const fitted: Record<string, { value: number; sigma: number }> = {};
  for (const g of added) {
    const [value, sigma] = fitGet(extd.fit, g);
    fitted[g] = { value, sigma };
  }
  const ho = extd.heldOut;
  const pass = ho.pass;
  const validation: ValidationResult = {
    heldOutAttempt: heldOutId,
    modelVersion,
    statistic: ho.TperNu,
    threshold: ho.threshold,
    rmsBefore: heldRms(base),
    rmsAfter: heldRms(extd),
    verdict: pass && ev.evidence ? 'better' : pass ? 'no-better' : 'worse',
  };
  // §7.4: how well the trained law extrapolated into the held-out attempt.
  let hedge: number | undefined;
  if (pass) {
    const spec = modelSpec(ctx, withExt);
    const s = spec.settings;
    const values: Record<string, number> = {};
    for (const g of extd.problem.globals) values[g] = fitGet(extd.fit, g)[0];
    const idx = new Map(extd.problem.params.map((p, i) => [p.name, i]));
    const x = Float64Array.from(extd.problem.params, (p) =>
      extd.fit.names.includes(p.name) ? fitGet(extd.fit, p.name)[0] : p.init,
    );
    const solutions = new Map<string, ArcSolution>(
      extd.problem.arcs.map((a) => [
        a.id,
        {
          arc: a,
          x,
          idx,
          structure: extd.problem.structure,
          P: null,
          rel: [],
          scale: Float64Array.from(extd.problem.params, (p) => p.scale),
        },
      ]),
    );
    const heldArc = extd.problem.arcs.find((a) => a.id === extd.heldArcId)!;
    const ref = referenceFor({ spec, values, solutions }, spec.primary, heldArc.id, ctx);
    const rows = makeWindows(heldArc, spec.primary, windowRule(s))
      .filter((w) => !w.powered && w.fixes.length >= s.windowKeepFixes)
      .map((w) => localFit(ref, heldArc, w, s.dt, [1, s.localScalePriorSigma]));
    const ranges = extd.problem.arcs
      .filter((a) => a.id !== extd.heldArcId && train.some((r) => a.id.split('~')[0] === r.id))
      .flatMap((a) => rangeFixes(a, spec.primary).map((m) => m.z[1]!));
    if (ranges.length > 0) {
      const sigmaN = extd.fit.names.includes(EXPONENT_ID) ? fitGet(extd.fit, EXPONENT_ID)[1] : 0;
      const eh = earnedHedge(
        rows,
        Math.min(...ranges),
        Math.max(...ranges),
        sigmaN,
        s.sigmaH,
        s.sigmaHFloor,
      );
      if (eh.nWindowsOutside > 0) hedge = eh.sigmaH;
    }
  }
  const adoptable = pass && ev.evidence && ident.identifiable;
  const { fit: _f, globalShiftSigma, ...hoRest } = ho;
  return {
    state: { id: ext, status: pass ? 'candidate' : 'rejected', fittedAt: modelVersion, validation },
    training: [...training],
    heldOut: heldOutId,
    evidence: ev,
    identifiable: ident,
    heldOutTest: { ...hoRest, globalShiftSigma },
    fitted,
    ...(hedge !== undefined ? { earnedHedge: hedge } : {}),
    adoptable,
  };
}

/** The player adopts a rule. Refused unless its latest test made it adoptable (§7.5). */
export function adoptExtension(
  history: readonly ExtensionRecord[],
  ext: ExtensionId,
): ExtensionRecord[] {
  const i = latestIndex(history, ext);
  const rec = i >= 0 ? history[i]! : undefined;
  if (!rec || !rec.adoptable) throw new Error(`extension ${ext} has not passed a held-out test`);
  const out = [...history];
  out[i] = { ...rec, state: { ...rec.state, status: 'adopted' } };
  return out;
}

/** The player withdraws an adopted rule. */
export function revokeExtension(
  history: readonly ExtensionRecord[],
  ext: ExtensionId,
): ExtensionRecord[] {
  const i = latestIndex(history, ext);
  if (i < 0 || history[i]!.state.status !== 'adopted')
    throw new Error(`extension ${ext} is not adopted`);
  const out = [...history];
  out[i] = { ...history[i]!, state: { ...history[i]!.state, status: 'revoked' } };
  return out;
}

function latestIndex(history: readonly ExtensionRecord[], ext: ExtensionId): number {
  for (let i = history.length - 1; i >= 0; i--) if (history[i]!.state.id === ext) return i;
  return -1;
}

/** Adopted extensions, in adoption order. */
export function adoptedOf(history: readonly ExtensionRecord[]): ExtensionId[] {
  const out: ExtensionId[] = [];
  for (const r of history)
    if (r.state.status === 'adopted' && !out.includes(r.state.id)) out.push(r.state.id);
  return out.filter((id) => history[latestIndex(history, id)]!.state.status === 'adopted');
}

/** Hedge in force: the smallest earned by an adopted rule (§7.4), else undefined (default). */
export function hedgeOf(history: readonly ExtensionRecord[]): number | undefined {
  const earned = adoptedOf(history)
    .map((id) => history[latestIndex(history, id)]!.earnedHedge)
    .filter((h): h is number => h !== undefined);
  return earned.length ? Math.min(...earned) : undefined;
}

/** ExtensionState per extension (latest), for ModelState.extensions. */
export function extensionStates(history: readonly ExtensionRecord[]): ExtensionState[] {
  const ids: ExtensionId[] = [];
  for (const r of history) if (!ids.includes(r.state.id)) ids.push(r.state.id);
  return ids.map((id) => history[latestIndex(history, id)]!.state);
}
