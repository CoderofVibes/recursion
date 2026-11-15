/**
 * Why a held-out test came out as it did, in plain words (R47).
 *
 * A failed test used to read only "the held-out attempt departs from it", which a player takes to
 * mean "the law is wrong". Often it means something else: the held-out attempt carries a burn,
 * a moment or a stretch the model cannot explain, and the misfit sits there, not across the
 * attempt. This reads the test's own numbers (the held-out fit's whitened residuals, its prior
 * penalty, the shift of each value in training σ) and says which it was. It changes no statistic
 * and no threshold: the verdict is still the test's (§7.2), this only explains it.
 *
 * Causes, in the order they are decided:
 * - `consistent`: the test passed.
 * - `training-unsettled`: the training fit did not converge, so there is nothing reliable to
 *   compare with.
 * - `no-fit`: the held-out fit did not converge from the training's values.
 * - `values`: the held-out data fit well enough, but only by pulling the shared values (the
 *   law, a mass, the engine) many training σ from where the training put them: the prior penalty
 *   is most of the excess.
 * - `burn`: most of the excess misfit is in powered flight.
 * - `span`: most of it lies in one stretch, at most a quarter of the attempt.
 * - `throughout`: it is spread along the attempt: the rule as fitted does not hold there.
 */

import type { FitResult } from './solve.ts';

export type HeldOutCause =
  | 'consistent'
  | 'training-unsettled'
  | 'no-fit'
  | 'values'
  | 'burn'
  | 'span'
  | 'throughout';

export interface HeldOutDiagnosis {
  readonly cause: HeldOutCause;
  /** The reason in plain words, for the page. */
  readonly why: string;
  /** Where the held-out misfit concentrates, attempt time, s (`burn`, `span`). */
  readonly from?: number;
  readonly to?: number;
  /** Share of the excess misfit in powered flight, 0–1. */
  readonly poweredShare?: number;
  /** Values the held-out attempt pulled furthest, in training σ (`values`). */
  readonly shifted?: readonly { readonly name: string; readonly label: string; readonly sigma: number }[];
}

export interface HeldOutNumbers {
  readonly pass: boolean;
  readonly chi2Data: number;
  readonly priorPenalty: number;
  readonly nu: number;
  readonly globalShiftSigma: Readonly<Record<string, number>>;
  readonly fit: Pick<FitResult, 'resid' | 'residTags' | 'converged'>;
}

/** "T+3:05" for an attempt time in seconds. */
export function attemptClock(t: number): string {
  const m = Math.max(0, Math.round(t / 60));
  return `T+${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/** A value's name in plain words. */
export function plainLabel(
  id: string,
  names: { readonly bodies?: Readonly<Record<string, string>>; readonly equipment?: Readonly<Record<string, string>> } = {},
): string {
  const part = id.split('.');
  if (id === 'law.gravity.exponent') return 'the distance exponent';
  if (part[0] === 'body' && part[2] === 'mu') return `${names.bodies?.[part[1]!] ?? part[1]}’s mass`;
  const eq = (k: string) => names.equipment?.[k] ?? k.replace(/-/g, ' ');
  if (part[0] === 'thruster') {
    if (part[2] === 'scale') return `the ${eq(part[1]!)}’s thrust`;
    if (part[2]?.startsWith('misalignment')) return `the ${eq(part[1]!)}’s pointing`;
  }
  if (part[0] === 'sensor') {
    if (part[2]?.startsWith('bias') && part[1] === 'camera') return 'the camera’s alignment';
    if (part[2] === 'scale') return `the ${eq(part[1]!)}’s scale`;
    if (part[2]?.startsWith('bias')) return `the ${eq(part[1]!)}’s bias`;
  }
  return id;
}

/** Share of the test's excess that must lie in one place to say the misfit is there. */
const MOST = 2 / 3;
/** A stretch is "one moment" when at most this share of the attempt holds that much. */
const STRETCH = 0.25;
/** Bins the held-out attempt is cut into to find the stretch. */
const BINS = 48;
/** Values shown as pulled: at least this many training σ. */
const PULLED = 3;

export function diagnoseHeldOut(
  ho: HeldOutNumbers,
  trainingConverged: boolean,
  label: (id: string) => string = (id) => id,
): HeldOutDiagnosis {
  if (ho.pass)
    return {
      cause: 'consistent',
      why: 'The held-out attempt agrees with the rule within its measurement noise.',
    };
  if (!trainingConverged)
    return {
      cause: 'training-unsettled',
      why: 'The training attempts could not be fitted to a settled answer, so there is nothing reliable to test against. Train on other attempts.',
    };
  if (!ho.fit.converged)
    return {
      cause: 'no-fit',
      why: 'The model could not fit the held-out attempt from what the training found: it holds something the model cannot follow. Hold out a different attempt.',
    };
  const rows = ho.fit.residTags.map((tag, i) => {
    const r = ho.fit.resid[i]!;
    return { t: tag.t, powered: tag.powered, r2: r * r, excess: Math.max(0, r * r - 1) };
  });
  const total = rows.reduce((a, r) => a + r.excess, 0);
  const dataExcess = Math.max(0, ho.chi2Data - ho.nu);
  if (ho.priorPenalty >= dataExcess || total <= 0) {
    const shifted = Object.entries(ho.globalShiftSigma)
      .filter(([, s]) => Math.abs(s) >= PULLED)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 3)
      .map(([name, sigma]) => ({ name, label: label(name), sigma }));
    const list = shifted.map((s) => s.label);
    const words =
      list.length === 0
        ? 'the shared values'
        : list.length === 1
          ? list[0]!
          : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
    const least = shifted.length > 0 ? Math.floor(Math.min(...shifted.map((s) => Math.abs(s.sigma)))) : PULLED;
    return {
      cause: 'values',
      why: `To fit the held-out attempt the model has to move ${words} ${least}σ or more from what the training found. One of these attempts holds something the model can’t explain, or the rule doesn’t hold over both.`,
      shifted,
    };
  }
  const powered = rows.filter((r) => r.powered);
  const poweredExcess = powered.reduce((a, r) => a + r.excess, 0);
  const poweredShare = poweredExcess / total;
  if (poweredShare >= 0.5) {
    const worst = powered.filter((r) => r.excess > 8);
    const ts = (worst.length > 0 ? worst : powered).map((r) => r.t);
    const from = Math.min(...ts);
    const to = Math.max(...ts);
    return {
      cause: 'burn',
      why: `Most of the misfit is in the held-out attempt’s burn (${attemptClock(from)} to ${attemptClock(to)}): the model can’t explain that burn, so this attempt can’t judge the rule. Hold out an attempt whose burns the model already follows.`,
      from,
      to,
      poweredShare,
    };
  }
  const t0 = Math.min(...rows.map((r) => r.t));
  const t1 = Math.max(...rows.map((r) => r.t));
  const width = (t1 - t0) / BINS;
  if (width > 0) {
    const bins = new Float64Array(BINS);
    const binOf = (t: number) => Math.min(BINS - 1, Math.floor((t - t0) / width));
    const chi2 = new Float64Array(BINS);
    const count = new Float64Array(BINS);
    for (const r of rows) {
      const k = binOf(r.t);
      bins[k]! += r.excess;
      chi2[k]! += r.r2;
      count[k]! += 1;
    }
    /** A bin out of family by the test's own form (§7.2). */
    const disturbed = (k: number) =>
      count[k]! > 0 && chi2[k]! / count[k]! > 1 + 3 * Math.sqrt(2 / count[k]!);
    let best: [number, number] | null = null;
    for (let a = 0; a < BINS; a++) {
      let sum = 0;
      for (let b = a; b < BINS; b++) {
        sum += bins[b]!;
        if (sum >= MOST * total) {
          if (!best || b - a < best[1] - best[0]) best = [a, b];
          break;
        }
      }
    }
    if (best && (best[1] - best[0] + 1) / BINS <= STRETCH) {
      // Widened over neighbouring bins that are out of family too, so the stretch named is the
      // whole disturbance and the rest is what lies outside it.
      let [a, b] = best;
      while (a > 0 && disturbed(a - 1)) a--;
      while (b < BINS - 1 && disturbed(b + 1)) b++;
      const from = t0 + a * width;
      const to = t0 + (b + 1) * width;
      const rest = rows.filter((r) => r.t < from || r.t > to);
      // The test's own form (§7.2) on the rows outside the stretch, to say the rest agrees.
      const restChi2 = rest.length ? rest.reduce((a, r) => a + r.r2, 0) / rest.length : Infinity;
      const quiet = restChi2 <= 1 + 3 * Math.sqrt(2 / Math.max(1, rest.length));
      return {
        cause: 'span',
        why: `Most of the misfit is between ${attemptClock(from)} and ${attemptClock(to)} of the held-out attempt: something happened there that the model can’t explain${quiet ? '. The rest of the attempt agrees with the rule.' : '.'}`,
        from,
        to,
        poweredShare,
      };
    }
  }
  return {
    cause: 'throughout',
    why: 'The held-out attempt departs from the rule all along, not at one moment: the rule as fitted doesn’t hold over it.',
    poweredShare,
  };
}
