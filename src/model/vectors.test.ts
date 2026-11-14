/**
 * 1G estimator vectors (tests/vectors/estimator/): every fit is rebuilt from the vector's
 * inputs by this implementation, numeric fits are compared within the vectors' tolerances, and
 * all 54 physical claims are re-evaluated from this implementation's results.
 *
 * Truth (the `truth` blocks and the truth columns of forecast points) is read here only to
 * evaluate claims. It never reaches estimator code (P11).
 */

import { describe, expect, it } from 'vitest';
import rawBurn from '../../tests/vectors/estimator/burn-only-confounded.json?raw';
import rawValidation from '../../tests/vectors/estimator/extension-validation.json?raw';
import rawForecast from '../../tests/vectors/estimator/forecast-envelope.json?raw';
import rawCoverage from '../../tests/vectors/estimator/inv25-exponent-coverage.json?raw';
import rawTwo from '../../tests/vectors/estimator/inv25-newton-two-distances.json?raw';
import rawBody from '../../tests/vectors/estimator/missing-body-signature.json?raw';
import rawNewton from '../../tests/vectors/estimator/newton-recovers-gm.json?raw';
import { empiricalFit, gmSlope } from './diagnostics.ts';
import type { Arc } from './dynamics.ts';
import { fromRows } from './linalg.ts';
import {
  confounding,
  evidence,
  fitChi2Nu,
  fitCorr,
  fitGet,
  fitNu,
  heldOutConsistency,
  stagedFit,
  type FitResult,
  type Param,
} from './solve.ts';
import {
  anchorState,
  buildProfile,
  earnedHedge,
  forecastCore,
  guessBody,
  guessShip,
  localFits,
  mahalanobis,
  majorSigma,
  makeWindows,
  noiseScale,
  rangeFixes,
  type ProfileFit,
  type ReferenceLaw,
  type WindowFit,
} from './tierL.ts';
import {
  toArc,
  toParams,
  toStructure,
  type CaseJson,
  type ExpectedFit,
  type FitJson,
  type TierLJson,
  type VectorJson,
} from './vector-harness.ts';

const DT = 60;
const OPTS = { dt: DT, h: 1e-3 };
const R0 = 1e6;
const V = (raw: string) => JSON.parse(raw) as VectorJson;

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

/** Claims evaluated by this implementation: vector → claim id → pass. */
const claims = new Map<string, Map<string, boolean>>();
function claim(vector: string, id: string, ok: boolean) {
  if (!claims.has(vector)) claims.set(vector, new Map());
  claims.get(vector)!.set(id, ok);
}

const band = (nu: number, k = 3) => [1 - k * Math.sqrt(2 / nu), 1 + k * Math.sqrt(2 / nu)] as const;
const inBand = (f: FitResult) => {
  const [lo, hi] = band(fitNu(f));
  const c = fitChi2Nu(f);
  return c >= lo && c <= hi;
};

function arcsOf(c: CaseJson): Map<string, Arc> {
  return new Map(c.attempts.map((a) => [a.id, toArc(a)]));
}

/** Initial values per §4.5 from this implementation; globals keep the vector's prior means. */
function myInit(fit: FitJson, arcs: ReadonlyMap<string, Arc>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of fit.parameters) {
    const ship = /^(.+)\.ship\.(x|y|vx|vy)$/.exec(p.name);
    const body = /^(.+)\.B\.(x|y|vx|vy)$/.exec(p.name);
    const k = ['x', 'y', 'vx', 'vy'];
    if (ship) out[p.name] = guessShip(arcs.get(ship[1]!)!, 'A', 0)[k.indexOf(ship[2]!)]!;
    else if (body) out[p.name] = guessBody(arcs.get(body[1]!)!, 'A', 'B', 0)[k.indexOf(body[2]!)]!;
    else out[p.name] = p.init;
  }
  return out;
}

function runFit(fit: FitJson, arcs: ReadonlyMap<string, Arc>, x0?: Record<string, number>) {
  const st = toStructure(fit.model);
  const params = toParams(fit, x0 ?? myInit(fit, arcs));
  const res = stagedFit(
    st,
    fit.attempts.map((a) => arcs.get(a)!),
    params,
    OPTS,
  );
  return { st, params, res };
}

/** Numeric comparison within the vectors' stated tolerance. Returns failures. */
function compareFit(f: FitResult, e: ExpectedFit): string[] {
  const bad: string[] = [];
  for (const [name, ref] of Object.entries(e.estimate)) {
    const [x, s] = fitGet(f, name);
    const sr = e.sigma[name]!;
    if (Math.abs(x - ref) > 0.05 * sr)
      bad.push(`${name}: ${x} vs ${ref} (${((x - ref) / sr).toFixed(3)} σ)`);
    if (Math.abs(s / sr - 1) > 0.05) bad.push(`${name} σ: ${s} vs ${sr}`);
  }
  if (Math.abs(f.chi2 / e.chi2 - 1) > 0.02) bad.push(`chi2 ${f.chi2} vs ${e.chi2}`);
  if (f.m !== e.m) bad.push(`m ${f.m} vs ${e.m}`);
  const names = e.correlation.names;
  names.forEach((a, i) =>
    names.forEach((b, j) => {
      if (j <= i) return;
      const rho = fitCorr(f, a, b);
      const ref = e.correlation.matrix[i]![j]!;
      if (Math.abs(rho - ref) > 0.02) bad.push(`rho(${a},${b}) ${rho} vs ${ref}`);
    }),
  );
  if (f.converged !== e.converged) bad.push(`converged ${f.converged} vs ${e.converged}`);
  return bad;
}

function compareGuesses(fit: FitJson, arcs: ReadonlyMap<string, Arc>): string[] {
  const mine = myInit(fit, arcs);
  return fit.parameters
    .filter((p) => Math.abs(mine[p.name]! - p.init) > 1e-6 * Math.max(1, Math.abs(p.init)))
    .map((p) => `${p.name}: ${mine[p.name]} vs ${p.init}`);
}

function compareTierL(
  rows: readonly WindowFit[],
  prof: ProfileFit,
  s2: number,
  tl: TierLJson,
): string[] {
  const bad: string[] = [];
  if (rows.length !== tl.windows.length)
    return [`window count ${rows.length} vs ${tl.windows.length}`];
  rows.forEach((r, i) => {
    const w = tl.windows[i]!;
    if (r.window !== w.window || r.t0 !== w.t0 || r.t1 !== w.t1 || r.nFixes !== w.nFixes)
      bad.push(
        `window ${w.window}: boundaries ${r.window} ${r.t0}-${r.t1}/${r.nFixes} vs ${w.t0}-${w.t1}/${w.nFixes}`,
      );
    if (Math.abs(r.g - w.g) > 0.05 * w.sigma) bad.push(`window ${w.window}: g ${r.g} vs ${w.g}`);
    if (Math.abs(r.sigma / w.sigma - 1) > 0.05)
      bad.push(`window ${w.window}: σ ${r.sigma} vs ${w.sigma}`);
  });
  const p = tl.profile;
  if (prof.g.length !== p.g.length) bad.push(`profile nodes ${prof.g.length} vs ${p.g.length}`);
  prof.g.forEach((g, b) => {
    if (Math.abs(g - p.g[b]!) > 0.1 * p.sigma[b]!) bad.push(`profile node ${b}: ${g} vs ${p.g[b]}`);
    if (Math.abs(prof.sigma[b]! / p.sigma[b]! - 1) > 0.05)
      bad.push(`profile σ ${b}: ${prof.sigma[b]} vs ${p.sigma[b]}`);
  });
  if (Math.abs(prof.inflation / p.inflation - 1) > 0.05)
    bad.push(`inflation ${prof.inflation} vs ${p.inflation}`);
  if (Math.abs(s2 / tl.noiseScale - 1) > 0.02) bad.push(`noise scale ${s2} vs ${tl.noiseScale}`);
  return bad;
}

const refLaw = (r: TierLJson['reference']): ReferenceLaw => ({
  r0: r.r0,
  body: 'A',
  mu: r.mu,
  n: r.n,
  cam: r.cam,
  kE: r.kE ?? 1,
  dE: r.dE ?? 0,
});

function tierL(ref: ReferenceLaw, arcs: readonly Arc[]) {
  const rows = localFits(ref, arcs, DT, { gSigma: 0.5 });
  const profile = buildProfile(rows, R0, 'A');
  return { rows, profile, s2: noiseScale(rows) };
}

const fitById = (c: CaseJson, id: string) => c.fits.find((f) => f.id === id)!;

// ---------------------------------------------------------------------------------------------
// 1. newton-recovers-gm
// ---------------------------------------------------------------------------------------------

describe('newton-recovers-gm', () => {
  const v = V(rawNewton);
  const c = v.cases[0]!;
  const arcs = arcsOf(c);
  const truth = c.truth.values;
  const j1 = fitById(c, 'newtonian');
  const j2 = fitById(c, 'superfluous-exponent');
  const r1 = runFit(j1, arcs);
  const r2 = runFit(j2, arcs);

  it('initial guesses follow §4.5', () => {
    expect(compareGuesses(j1, arcs)).toEqual([]);
  });
  it('Newtonian fit matches the reference', () =>
    expect(compareFit(r1.res, j1.expected)).toEqual([]));
  it('superfluous exponent fit matches the reference', () =>
    expect(compareFit(r2.res, j2.expected)).toEqual([]));

  it('claims', () => {
    const [mu, smu] = fitGet(r1.res, 'mu.A');
    claim(v.id, 'gm-recovered', Math.abs(mu - truth['truth.muA']!) <= 3 * smu);
    claim(v.id, 'gm-data-dominated', smu < 0.1 * 3e8);
    claim(v.id, 'chi2-consistent', inBand(r1.res));
    const [n, sn] = fitGet(r2.res, 'law.n');
    claim(v.id, 'exponent-consistent-with-2', Math.abs(n - 2) <= 3 * sn);
    const ev = evidence(r1.res, r2.res, 1);
    expect(ev.deltaCost).toBeCloseTo(j2.adoption!.deltaCost, 0);
    claim(v.id, 'superfluous-not-adoptable', !ev.evidence);
    for (const [, ok] of claims.get(v.id)!) expect(ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// 2. inv25-newton-two-distances
// ---------------------------------------------------------------------------------------------

describe('inv25-newton-two-distances', () => {
  const v = V(rawTwo);
  const c = v.cases[0]!;
  const arcs = arcsOf(c);
  const fits = Object.fromEntries(c.fits.map((f) => [f.id, { j: f, r: runFit(f, arcs) }]));

  it('local fits match the reference', () => {
    expect(compareFit(fits['local-att1']!.r.res, fits['local-att1']!.j.expected)).toEqual([]);
    expect(compareFit(fits['local-att2']!.r.res, fits['local-att2']!.j.expected)).toEqual([]);
  });

  it('claims', () => {
    const mus: Record<string, [number, number]> = {};
    for (const id of ['att1', 'att2']) {
      const { j, r } = fits[`local-${id}`]!;
      const [mu, smu] = fitGet(r.res, 'mu.A');
      mus[id] = [mu, smu];
      const theory = j.theory!.muLocal;
      claim(v.id, `local-gm-${id}`, Math.abs(mu - theory) <= 3 * smu + 1e-3 * theory);
      claim(v.id, `local-white-${id}`, inBand(r.res));
    }
    const [m1, s1] = mus.att1!;
    const [m2, s2] = mus.att2!;
    const ratio = m1 / m2;
    const sratio = ratio * Math.hypot(s1 / m1, s2 / m2);
    const expected = c.derived!.gmRatioExpected;
    claim(v.id, 'gm-ratio', Math.abs(ratio - expected) <= 3 * sratio + 2e-3 * expected);
    claim(v.id, 'joint-misfit', fitChi2Nu(fits.joint!.r.res) > 10);
    for (const [, ok] of claims.get(v.id)!) expect(ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// 3. inv25-exponent-coverage
// ---------------------------------------------------------------------------------------------

describe('inv25-exponent-coverage', () => {
  const v = V(rawCoverage);
  const narrow = v.cases.find((c) => c.id === 'narrow')!;
  const wide = v.cases.find((c) => c.id === 'wide')!;
  const truth = wide.truth.values;
  const nT = truth['truth.n']!;
  const muT = truth['truth.muA']!;
  const out: Record<string, FitResult> = {};
  for (const c of [narrow, wide]) out[c.id] = runFit(fitById(c, 'exponent'), arcsOf(c)).res;
  const wideArcs = [...arcsOf(wide).values()];
  const ref = refLaw(wide.tierL!.reference);
  const tl = tierL(ref, wideArcs);
  const empJ = fitById(wide, 'empirical-on-calibrated-law');
  const emp = empiricalFit(ref, tl.profile, wideArcs, {
    ...OPTS,
    end: Object.fromEntries(wide.attempts.map((a) => [a.id, a.duration])),
  });

  it('exponent fits match the reference', () => {
    expect(compareFit(out.narrow!, fitById(narrow, 'exponent').expected)).toEqual([]);
    expect(compareFit(out.wide!, fitById(wide, 'exponent').expected)).toEqual([]);
  });
  it('Tier L windows, local fits and profile match the reference', () => {
    expect(compareTierL(tl.rows, tl.profile, tl.s2, wide.tierL!)).toEqual([]);
  });
  it('empirical fit on the calibrated law matches the reference', () => {
    expect(emp.bounds).toEqual(empJ.model.empirical!.bounds);
    expect(compareFit(emp.fit, empJ.expected)).toEqual([]);
  });

  it('claims', () => {
    for (const c of ['narrow', 'wide']) {
      const [n, sn] = fitGet(out[c]!, 'law.n');
      claim(v.id, `exponent-${c}`, Math.abs(n - nT) <= 3 * sn);
      claim(v.id, `chi2-${c}`, inBand(out[c]!));
    }
    const worst = Math.max(
      ...tl.rows.map((r) => {
        const gm = ref.mu * r.g;
        const sgm = ref.mu * r.sigma;
        const theory = muT * Math.sqrt(R0 / r.rGeoMean);
        return Math.abs(gm - theory) / (3 * sgm + 0.01 * theory);
      }),
    );
    claim(v.id, 'gm-vs-distance-trend', worst <= 1);
    const slope = gmSlope(tl.rows)!.slope;
    claim(v.id, 'gm-slope', Math.abs(slope + 0.5) < 0.02);
    claim(
      v.id,
      'all-windows-converge',
      tl.rows.every((r) => r.converged),
    );
    claim(v.id, 'wrong-law-leaves-no-tangential', emp.maxAbsTangentialZ < 4);
    claim(v.id, 'calibrated-law-fits', fitChi2Nu(emp.fit) < 1.5);
    claim(v.id, 'profile-distance-explains', tl.profile.inflation < 3);
    claim(
      v.id,
      'coverage-narrows',
      fitGet(out.wide!, 'law.n')[1] < 0.5 * fitGet(out.narrow!, 'law.n')[1],
    );
    for (const [, ok] of claims.get(v.id)!) expect(ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// 4. missing-body-signature
// ---------------------------------------------------------------------------------------------

describe('missing-body-signature', () => {
  const v = V(rawBody);
  const c = v.cases[0]!;
  const arcs = arcsOf(c);
  const a1 = arcs.get('att1')!;
  const truth = c.truth.values;
  const jA = fitById(c, 'A-only');
  const rA = runFit(jA, arcs);
  const ref: ReferenceLaw = {
    r0: R0,
    body: 'A',
    mu: fitGet(rA.res, 'mu.A')[0],
    n: 2,
    cam: fitGet(rA.res, 'camera.bias')[0],
    kE: 1,
    dE: 0,
  };
  const tl = tierL(ref, [a1]);
  const empJ = fitById(c, 'empirical-on-calibrated-law');
  const emp = empiricalFit(ref, tl.profile, [a1], {
    ...OPTS,
    end: { att1: c.attempts[0]!.duration },
  });
  const jB = fitById(c, 'add-body-B');
  const rB = runFit(jB, arcs);

  it('initial guesses for the seen body follow §4.5', () =>
    expect(compareGuesses(jB, arcs)).toEqual([]));
  it('Tier L under the A-only law matches the reference', () =>
    expect(compareTierL(tl.rows, tl.profile, tl.s2, c.tierL!)).toEqual([]));
  it('empirical fit matches the reference', () => {
    expect(emp.bounds).toEqual(empJ.model.empirical!.bounds);
    expect(compareFit(emp.fit, empJ.expected)).toEqual([]);
  });
  it('body extension fit matches the reference', () =>
    expect(compareFit(rB.res, jB.expected)).toEqual([]));

  it('claims', () => {
    claim(v.id, 'A-only-misfit', fitChi2Nu(rA.res) > 5);
    const g0 = truth['truth.muA']! / (R0 * R0);
    const zT = emp.maxAbsTangentialZ;
    const fT = emp.maxAbsTangential / g0;
    claim(v.id, 'missing-body-tangential', zT > 5 && fT > 3e-3);
    claim(v.id, 'profile-distance-fails', tl.profile.inflation > 5);
    const tidal = new Map(empJ.table!.map((r) => [r.window, r.tidalAtMidT!]));
    const sig = emp.table.filter((r) => Math.abs(r.aT) > 3 * r.sigmaT);
    const same = sig.filter((r) => Math.sign(r.aT) === Math.sign(tidal.get(r.window)!));
    claim(v.id, 'tangential-tracks-tidal', sig.length >= 4 && same.length === sig.length);
    const [mb, smb] = fitGet(rB.res, 'mu.B');
    claim(v.id, 'body-gm-recovered', Math.abs(mb - truth['truth.muB']!) <= 3 * smb);
    claim(v.id, 'body-chi2', inBand(rB.res));
    for (const [, ok] of claims.get(v.id)!) expect(ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// 5. burn-only-confounded
// ---------------------------------------------------------------------------------------------

describe('burn-only-confounded', () => {
  const v = V(rawBurn);
  const results = v.cases.map((c) => {
    const j = c.fits[0]!;
    const r = runFit(j, arcsOf(c));
    const conf = confounding(r.res, ['mu.A'], ['engine.kE', 'engine.dE'], {
      'engine.kE': 0.05,
      'engine.dE': 0.01,
      'mu.A': 3e8,
    });
    return { c, j, r, conf };
  });

  it('fits match the reference', () => {
    for (const { j, r, conf } of results) {
      expect(compareFit(r.res, j.expected)).toEqual([]);
      expect(Math.abs(conf.maxAbsRho - j.confounding!.maxAbsRho)).toBeLessThan(0.02);
    }
  });

  it('claims', () => {
    const rho: Record<string, number> = {};
    const kRatio: Record<string, number> = {};
    const muRatio: Record<string, number> = {};
    for (const { c, r, conf } of results) {
      const truth = c.truth.values;
      const [mu, smu] = fitGet(r.res, 'mu.A');
      const [kE, skE] = fitGet(r.res, 'engine.kE');
      claim(
        v.id,
        `recovered-${c.id}`,
        Math.abs(mu - truth['truth.muA']!) <= 3 * smu &&
          Math.abs(kE - truth['truth.kE']!) <= 3 * skE,
      );
      rho[c.id] = fitCorr(r.res, 'mu.A', 'engine.kE');
      kRatio[c.id] = conf.posteriorOverPrior['engine.kE']!;
      muRatio[c.id] = conf.gravityPosteriorOverPrior['mu.A']!;
    }
    claim(v.id, 'burn-only-confounded', Math.abs(rho['burn-only']!) > 0.9);
    for (const id of ['burn-plus-coast', 'burn-plus-accel'])
      claim(v.id, `${id}-breaks-confound`, Math.abs(rho[id]!) <= 0.9 && kRatio[id]! < 0.1);
    claim(v.id, 'burn-only-not-learned', muRatio['burn-only']! > 0.5);
    for (const [, ok] of claims.get(v.id)!) expect(ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// 6. extension-validation
// ---------------------------------------------------------------------------------------------

describe('extension-validation', () => {
  const v = V(rawValidation);

  function validate(c: CaseJson, id: string) {
    const arcs = arcsOf(c);
    const j = fitById(c, id);
    const r = runFit(j, arcs);
    const held = arcs.get(c.heldOut!)!;
    const local: Param[] = r.params
      .filter((p) => p.group === c.training![0])
      .map((p) => {
        const name = p.name.replace(`${c.training![0]}.`, `${held.id}.`);
        const guess = myInit(
          { ...j, parameters: [{ name, group: held.id, init: 0, prior: null }] },
          arcs,
        )[name]!;
        return { name, init: guess, scale: p.scale, group: held.id };
      });
    const ho = heldOutConsistency(r.st, r.res, r.params, held, local, OPTS, 3);
    return { j, r, ho, arcs };
  }

  const law = v.cases.find((c) => c.id === 'distance-law')!;
  const body = v.cases.find((c) => c.id === 'overlooked-body')!;
  const N = validate(law, 'newtonian');
  const X = validate(law, 'exponent');
  const A = validate(body, 'A-only');
  const W = validate(body, 'A-only-exponent');
  const B = validate(body, 'add-body-B');

  // Earned hedge (§7.4): local fits of the held-out attempt under the trained law.
  const fX = X.r.res;
  const [nX, snX] = fitGet(fX, 'law.n');
  const heldArc = X.arcs.get('att3')!;
  const trainRanges = law.training!.flatMap((id) =>
    rangeFixes(X.arcs.get(id)!, 'A').map((m) => m.z[1]!),
  );
  const trainMin = Math.min(...trainRanges);
  const trainMax = Math.max(...trainRanges);
  const rows = localFits(
    {
      r0: R0,
      body: 'A',
      mu: fitGet(fX, 'mu.A')[0],
      n: nX,
      cam: fitGet(fX, 'camera.bias')[0],
      kE: 1,
      dE: 0,
    },
    [heldArc],
    DT,
    { gSigma: 0.5 },
  );
  const eh = earnedHedge(rows, trainMin, trainMax, snX, 0.3, 0.01);

  it('numeric fits and held-out statistics match the reference', () => {
    for (const r of [X, B]) {
      expect(compareFit(r.r.res, r.j.expected)).toEqual([]);
      expect(Math.abs(r.ho.T / r.j.heldOut!.T - 1)).toBeLessThan(0.02);
      expect(r.ho.nu).toBe(r.j.heldOut!.nu);
      expect(r.ho.threshold).toBeCloseTo(r.j.heldOut!.threshold, 10);
    }
    for (const r of [N, X, A, W, B]) expect(r.ho.pass).toBe(r.j.heldOut!.pass);
  });

  it('earned hedge matches the reference', () => {
    const e = X.j.earnedHedge!;
    expect([trainMin, trainMax]).toEqual(e.trainingCoverage);
    expect(eh.nWindowsOutside).toBe(e.nWindowsOutside);
    expect(Math.abs(eh.sigmaH / e.sigmaH - 1)).toBeLessThan(0.05);
  });

  it('claims', () => {
    claim(v.id, 'newtonian-fails-heldout', !N.ho.pass);
    claim(v.id, 'exponent-passes-heldout', X.ho.pass);
    const evX = evidence(N.r.res, X.r.res, 1);
    claim(v.id, 'exponent-adoptable', evX.evidence && X.ho.pass);
    claim(v.id, 'exponent-from-training', Math.abs(nX - law.truth.values['truth.n']!) <= 3 * snX);
    claim(v.id, 'hedge-earned', eh.sigmaH < 0.2 * 0.3);
    claim(v.id, 'A-only-fails-heldout', !A.ho.pass);
    const evW = evidence(A.r.res, W.r.res, 1);
    claim(v.id, 'wrong-extension-fails', !W.ho.pass && !(evW.evidence && W.ho.pass));
    claim(v.id, 'wrong-extension-still-misfits', fitChi2Nu(W.r.res) > 5);
    const evB = evidence(A.r.res, B.r.res, 1);
    claim(v.id, 'right-extension-passes', evB.evidence && B.ho.pass);
    const [mb, smb] = fitGet(B.r.res, 'mu.B');
    claim(v.id, 'body-gm-from-training', Math.abs(mb - body.truth.values['truth.muB']!) <= 3 * smb);
    expect(evX.deltaCost / X.j.adoption!.deltaCost).toBeCloseTo(1, 1);
    for (const [, ok] of claims.get(v.id)!) expect(ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// 7. forecast-envelope
// ---------------------------------------------------------------------------------------------

describe('forecast-envelope', () => {
  const v = V(rawForecast);
  const c = v.cases[0]!;
  const fi = c.forecastInputs!;
  const ref = refLaw(fi.reference);
  const arcs = arcsOf(c);
  const a3 = arcs.get('att3')!;
  const tl = tierL(ref, [...arcs.values()]);
  const wins = makeWindows(a3, 'A')
    .filter((w) => !w.powered)
    .slice(-fi.anchorWindows);
  const anc = anchorState(ref, tl.profile, a3, wins, DT, { gPrior: [1, 0.5], slopeSigma: 0.2 });

  const plans = Object.entries(c.plans!).map(([pid, p]) => {
    const commands = p.commands.map((q) => ({ t0: q.t0, t1: q.t1, u: q.u, theta: q.theta }));
    const base = {
      ref,
      commands,
      tNow: anc.tNow,
      xNow: anc.state,
      PNow: anc.covariance,
      times: p.checkpoints,
      dt: DT,
      s2: tl.s2,
      engineSigma: [fi.engineSigma.kE, fi.engineSigma.dE] as const,
    };
    const fc = forecastCore({ ...base, profiles: [tl.profile], sigmaH: fi.sigmaH });
    const bare = forecastCore({ ...base, profiles: [], sigmaH: 0 });
    const refPoints = c.forecasts!.find((f) => f.plan === pid)!.points;
    let within = true;
    const points = p.checkpoints.map((t, i) => {
      const mean = fc.mean[i]!;
      const cv = fc.cov[i]!;
      const truth = refPoints[i]!.truth;
      const r = Math.hypot(mean[0]!, mean[1]!);
      const sig = {
        state: majorSigma(cv.state),
        profile: majorSigma(cv.profile),
        hedge: majorSigma(cv.hedge),
        engine: majorSigma(cv.engine),
        total: majorSigma(cv.total),
      };
      within = within && sig.total <= fi.horizonFraction * r;
      const dev: [number, number] = [truth[0] - mean[0]!, truth[1] - mean[1]!];
      const noHedge = {
        rows: 2,
        cols: 2,
        data: cv.total.data.map((q, k) => q - cv.hedge.data[k]!),
      };
      return {
        t,
        mean,
        sig,
        r,
        inside: tl.profile.rMin <= r && r <= tl.profile.rMax,
        within,
        deviation: Math.hypot(...dev),
        maha: mahalanobis(dev, cv.total),
        mahaNoHedge: mahalanobis(dev, noHedge),
        uncal: Math.hypot(truth[0] - bare.mean[i]![0]!, truth[1] - bare.mean[i]![1]!),
      };
    });
    return { pid, points, refPoints };
  });

  it('Tier L matches the reference', () =>
    expect(compareTierL(tl.rows, tl.profile, tl.s2, c.tierL!)).toEqual([]));

  it('present state matches the reference', () => {
    const ra = c.anchor!;
    expect(anc.info.windows).toEqual(ra.windows);
    expect(anc.tNow).toBe(ra.tNow);
    const C = fromRows(ra.covariance);
    for (let i = 0; i < 4; i++) {
      const s = Math.sqrt(C.data[i * 4 + i]!);
      expect(Math.abs(anc.state[i]! - ra.state[i]!)).toBeLessThan(0.05 * s);
      expect(Math.abs(Math.sqrt(anc.covariance.data[i * 4 + i]!) / s - 1)).toBeLessThan(0.05);
    }
    expect(Math.abs(anc.info.g - ra.g)).toBeLessThan(0.05 * ra.gSigma);
    expect(Math.abs(anc.info.g1 - ra.g1)).toBeLessThan(0.05 * ra.g1Sigma);
  });

  it('forecast points inside the horizon match the reference', () => {
    for (const { points, refPoints } of plans) {
      points.forEach((p, i) => {
        const rp = refPoints[i]!;
        expect(p.within).toBe(rp.withinHorizon);
        expect(p.inside).toBe(rp.insideCoverage);
        if (!rp.withinHorizon) return;
        expect(Math.hypot(p.mean[0]! - rp.mean[0], p.mean[1]! - rp.mean[1])).toBeLessThan(
          0.05 * rp.sigmaMajor.total,
        );
        for (const k of ['state', 'profile', 'hedge', 'engine', 'total'] as const) {
          const a = p.sig[k];
          const b = rp.sigmaMajor[k];
          expect(Math.abs(a - b) <= Math.max(0.05 * b, 1)).toBe(true);
        }
      });
    }
  });

  it('claims', () => {
    const coast = plans.find((p) => p.pid === 'coast')!.points;
    const dive = plans.find((p) => p.pid === 'dive')!.points;
    for (const [pid, pts] of [
      ['coast', coast],
      ['dive', dive],
    ] as const) {
      const inh = pts.filter((p) => p.within);
      const worst = Math.max(...inh.map((p) => p.maha));
      claim(v.id, `honest-${pid}`, worst < 3 && inh.length >= 3);
    }
    claim(
      v.id,
      'coast-full-horizon',
      coast.every((p) => p.within),
    );
    claim(v.id, 'calibration-pays', coast[5]!.uncal > 10 * coast[5]!.deviation);
    claim(
      v.id,
      'no-hedge-inside-coverage',
      coast.every((p) => p.sig.hedge < 1e-6),
    );
    const out = dive.filter((p) => !p.inside && p.within);
    claim(v.id, 'dive-leaves-coverage', out.length >= 1);
    const deep = out[out.length - 1]!;
    claim(
      v.id,
      'hedge-widens-outside',
      deep.sig.hedge ===
        Math.max(deep.sig.state, deep.sig.profile, deep.sig.hedge, deep.sig.engine),
    );
    claim(v.id, 'hedge-needed', Math.max(...out.map((p) => p.mahaNoHedge)) > 3);
    claim(v.id, 'horizon-ends-dive', !dive[dive.length - 1]!.within);
    for (const [, ok] of claims.get(v.id)!) expect(ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// All claims
// ---------------------------------------------------------------------------------------------

describe('estimator vectors', () => {
  it('all 54 claims hold, and each vector claim was evaluated', () => {
    const vectors = [
      rawNewton,
      rawTwo,
      rawCoverage,
      rawBody,
      rawBurn,
      rawValidation,
      rawForecast,
    ].map(V);
    let total = 0;
    for (const v of vectors) {
      const mine = claims.get(v.id);
      expect(mine, v.id).toBeDefined();
      expect([...mine!.keys()].sort()).toEqual(v.checks.map((c) => c.id).sort());
      for (const [id, ok] of mine!) expect(ok, `${v.id}/${id}`).toBe(true);
      total += mine!.size;
    }
    expect(total).toBe(54);
  });
});
