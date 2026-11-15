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
  ExtensionDecision,
  ExtensionTestRecord,
  ValidatedSpan,
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
import type { Arc } from './dynamics.ts';
import { attemptOfArc, isProbeArc } from './probes.ts';
import { earnedHedge, localFit, makeWindows, mergeSpans, rangeFixes } from './tierL.ts';

/** Extensions the model can fit (unseen-body and region thrust response are specified only). */
export function isTestableExtension(ext: ExtensionId): boolean {
  return ext === 'distance-law' || extensionBody(ext) !== null;
}

/**
 * One test of a rule, as Black Box keeps it (contract ExtensionTestRecord, never edited), plus
 * the held-out statistics. Its state carries the validated spans the test covered (§7.4).
 */
export interface ExtensionRecord extends ExtensionTestRecord {
  readonly heldOutTest?: Omit<HeldOutResult, 'fit' | 'globalShiftSigma'> & {
    readonly globalShiftSigma: Readonly<Record<string, number>>;
  };
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
  probes?: ReadonlyMap<AttemptId, readonly Arc[]>,
  unusable?: ReadonlyMap<AttemptId, string>,
): Trained {
  const spec = modelSpec(ctx, adopted);
  const s = spec.settings;
  const problem = tierGProblem(ctx, spec, [...train, held], {
    ...(probes ? { probes } : {}),
    ...(unusable ? { unusable } : {}),
  });
  const heldArcs = problem.builds.get(held.id)?.arcs ?? [];
  if (heldArcs.length === 0) throw new Error(`held-out attempt ${held.id} has no fittable arc`);
  const heldArc = heldArcs.reduce((a, b) => (b.meas.length > a.meas.length ? b : a));
  // Tracked asteroids are fitted with their attempts: the test checks the law at their distances.
  const heldProbes = problem.arcs.filter((a) => isProbeArc(a.id) && attemptOfArc(a.id) === held.id);
  const trainIds = new Set(train.map((r) => r.id));
  const trainArcIds = new Set(
    problem.arcs.filter((a) => trainIds.has(attemptOfArc(a.id))).map((a) => a.id),
  );
  const trainArcs = problem.arcs.filter((a) => trainArcIds.has(a.id));
  if (trainArcs.length === 0) throw new Error('no training attempt has a fittable arc');
  const trainParams = problem.params.filter(
    (p) => p.group === 'global' || trainArcIds.has(p.group),
  );
  const opts = { dt: s.dt, h: s.fdStep };
  const fit = stagedFit(problem.structure, trainArcs, trainParams, opts);
  const heldIds = new Set([heldArc.id, ...heldProbes.map((a) => a.id)]);
  const local = problem.params.filter((p) => heldIds.has(p.group));
  const heldOut = heldOutConsistency(
    problem.structure,
    fit,
    trainParams,
    [heldArc, ...heldProbes],
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
  /** Tracked asteroids' probe arcs per attempt (the model's Tier L builds them). */
  probes?: ReadonlyMap<AttemptId, readonly Arc[]>,
  /** Attempts the model could not use (`ModelDerived.unusable`): they give no arcs here either. */
  unusable?: ReadonlyMap<AttemptId, string>,
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
  const base = trainAndHoldOut(ctx, baseAdopted, train, held, probes, unusable);
  const extd = trainAndHoldOut(ctx, withExt, train, held, probes, unusable);
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
  // §7.4: how well the trained law extrapolated into the held-out attempt, and over which
  // distances per body (training plus held-out): the validated spans.
  const spans: ValidatedSpan[] = [];
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
    const ref = referenceFor(
      { spec, values, solutions, problem: extd.problem },
      spec.primary,
      heldArc.id,
      ctx,
    );
    const rows = makeWindows(heldArc, spec.primary, windowRule(s))
      .filter((w) => !w.powered && w.fixes.length >= s.windowKeepFixes)
      .map((w) => localFit(ref, heldArc, w, s.dt, [1, s.localScalePriorSigma]));
    // σ_e from how the trained law extrapolated beyond the training ship's distances (§7.4).
    // Arcs the test fitted: training arcs (ship and probes), the held-out ship arc and the
    // held-out attempt's probes.
    const inTraining = (a: Arc) => train.some((r) => attemptOfArc(a.id) === r.id);
    const inTest = (a: Arc) =>
      inTraining(a) ||
      a.id === extd.heldArcId ||
      (isProbeArc(a.id) && attemptOfArc(a.id) === heldOutId);
    const ranges = extd.problem.arcs
      .filter(
        (a) =>
          !isProbeArc(a.id) &&
          a.id !== extd.heldArcId &&
          train.some((r) => attemptOfArc(a.id) === r.id),
      )
      .flatMap((a) => rangeFixes(a, spec.primary).map((m) => m.z[1]!));
    // Every fit of the test counts toward the span: the ship's fixes and, around the body
    // they were measured from, the tracked asteroids' (A5).
    const probeRanges = (body: string) =>
      extd.problem.arcs
        .filter((a) => isProbeArc(a.id) && inTest(a))
        .flatMap((a) => rangeFixes(a, body).map((m) => m.z[1]!));
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
      if (eh.nWindowsOutside > 0 && eh.validatedRange) {
        const pr = probeRanges(spec.primary);
        spans.push({
          body: spec.primary,
          rMin: Math.min(eh.validatedRange[0], ...pr),
          rMax: Math.max(eh.validatedRange[1], ...pr),
          sigmaE: eh.sigmaH,
          heldOutAttempt: heldOutId,
        });
        const testArcs = extd.problem.arcs.filter(inTest);
        for (const body of spec.bodies.slice(1)) {
          const r = testArcs.flatMap((a) => rangeFixes(a, body).map((m) => m.z[1]!));
          if (r.length > 0)
            spans.push({
              body,
              rMin: Math.min(...r),
              rMax: Math.max(...r),
              sigmaE: eh.sigmaH,
              heldOutAttempt: heldOutId,
            });
        }
      }
    }
  }
  const adoptable = pass && ev.evidence && ident.identifiable;
  const { fit: _f, globalShiftSigma, ...hoRest } = ho;
  return {
    state: {
      id: ext,
      status: pass ? 'candidate' : 'rejected',
      fittedAt: modelVersion,
      validation,
      validatedSpans: spans,
    },
    training: [...training],
    heldOut: heldOutId,
    evidence: ev,
    identifiable: ident,
    heldOutTest: { ...hoRest, globalShiftSigma },
    fitted,
    adoptable,
  };
}

/** Adopted rules after replaying the decisions in order. */
export function adoptedFrom(decisions: readonly ExtensionDecision[]): ExtensionId[] {
  const out: ExtensionId[] = [];
  for (const d of decisions) {
    const i = out.indexOf(d.extension);
    if (d.action === 'adopted' && i < 0) out.push(d.extension);
    if (d.action === 'revoked' && i >= 0) out.splice(i, 1);
  }
  return out;
}

/**
 * The player adopts or revokes a rule (1G spec §6.1): a new decision appended to the record,
 * which Black Box keeps in order and never edits. Adopting is refused unless the rule's latest
 * test made it adoptable (§7.5); revoking, unless it is adopted.
 */
export function decide(
  tests: readonly ExtensionRecord[],
  decisions: readonly ExtensionDecision[],
  ext: ExtensionId,
  action: ExtensionDecision['action'],
  modelVersion: number,
  at: string,
): ExtensionDecision[] {
  const adopted = adoptedFrom(decisions);
  if (action === 'adopted') {
    const rec = latest(tests, ext);
    if (!rec || !rec.adoptable) throw new Error(`extension ${ext} has not passed a held-out test`);
    if (adopted.includes(ext)) throw new Error(`extension ${ext} is already adopted`);
  } else if (!adopted.includes(ext)) throw new Error(`extension ${ext} is not adopted`);
  return [...decisions, { extension: ext, action, modelVersion, at }];
}

/** Decisions for a list of adopted rules with no history (older saves). */
export function decisionsFromAdopted(
  adopted: readonly ExtensionId[],
  modelVersion: number,
): ExtensionDecision[] {
  return adopted.map((extension) => ({ extension, action: 'adopted', modelVersion, at: '' }));
}

function latest(tests: readonly ExtensionRecord[], ext: ExtensionId): ExtensionRecord | undefined {
  for (let i = tests.length - 1; i >= 0; i--) if (tests[i]!.state.id === ext) return tests[i];
  return undefined;
}

/** Every validated span of a rule: one per body per passing test, kept across tests (§7.4). */
export function spansOf(tests: readonly ExtensionRecord[], ext: ExtensionId): ValidatedSpan[] {
  return tests
    .filter((t) => t.state.id === ext && t.state.status !== 'rejected')
    .flatMap((t) => t.state.validatedSpans ?? []);
}

/** A rule shared by every body (the distance law) rather than one about a body or region. */
export const isSharedLaw = (ext: ExtensionId) => ext === 'distance-law';

export interface ValidatedHedge {
  /** Merged spans (m) where the earned σ_e applies. */
  readonly spans: readonly (readonly [number, number])[];
  /** The largest σ_e among the contributing tests. */
  readonly sigmaE: number;
}

/**
 * The earned hedge in force per body (§7.4, §8.2; DECISIONS A5 "every body"): spans of
 * adopted rules. With `sharedLaw`, a rule shared by all bodies applies its spans around every
 * body; a rule about one body applies them only there.
 */
export function validatedHedges(
  tests: readonly ExtensionRecord[],
  adopted: readonly ExtensionId[],
  bodies: readonly string[],
  sharedLaw: boolean,
): Record<string, ValidatedHedge> {
  const out: Record<string, ValidatedHedge> = {};
  for (const body of bodies) {
    const applies = (ext: ExtensionId, span: ValidatedSpan) => {
      if (sharedLaw && isSharedLaw(ext)) return true; // a shared law: around every body
      const about = extensionBody(ext);
      if (about !== null) return body === about && span.body === about; // a rule about one body
      return span.body === body; // the same-body reading
    };
    const contributing = adopted.flatMap((ext) =>
      spansOf(tests, ext).filter((sp) => applies(ext, sp)),
    );
    if (contributing.length === 0) continue;
    out[body] = {
      spans: mergeSpans(contributing.map((sp) => [sp.rMin, sp.rMax] as const)),
      sigmaE: Math.max(...contributing.map((sp) => sp.sigmaE)),
    };
  }
  return out;
}

/** ExtensionState per rule for ModelState: latest test, status from the decisions, all its spans. */
export function extensionStates(
  tests: readonly ExtensionRecord[],
  decisions: readonly ExtensionDecision[],
): ExtensionState[] {
  const ids: ExtensionId[] = [];
  for (const t of tests) if (!ids.includes(t.state.id)) ids.push(t.state.id);
  for (const d of decisions) if (!ids.includes(d.extension)) ids.push(d.extension);
  return ids.map((id) => {
    const t = latest(tests, id);
    let last: ExtensionDecision | undefined;
    for (const d of decisions) if (d.extension === id) last = d;
    const status = last ? last.action : (t?.state.status ?? 'candidate');
    return { ...(t?.state ?? { id }), status, validatedSpans: spansOf(tests, id) };
  });
}
