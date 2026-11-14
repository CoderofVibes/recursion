/**
 * Comparing two attempts (brief §2: "What did I change? What actually happened? Where did the
 * result differ from the prediction? What does the evidence support?").
 *
 * - Configuration and plan diff, and the commands that actually executed.
 * - Where the outcome diverged from each issued forecast: the measured position relative to a
 *   tracked body against the forecast's, in metres and in σ of the forecast envelope.
 * - Residual series split into coasting and powered (spec §9.1), measured strength against
 *   distance (§9.2) and the confounding indicator with what is missing (§9.3), from the model.
 * Missing data is reported as missing, never filled in.
 */

import type {
  AttemptId,
  AttemptOutcome,
  AttemptRecord,
  Command,
  ConfigurationId,
  Forecast,
  Measurement,
} from '../contracts/index.ts';
import type { BodyStrength, DataCoverage, ModelReport, ResidualPoint } from '../model/report.ts';
import type { Confounding } from '../model/solve.ts';

// ---------------------------------------------------------------------------------------------
// Configuration, plans and commands
// ---------------------------------------------------------------------------------------------

export interface ConfigurationTimeline {
  readonly start: ConfigurationId;
  readonly changes: readonly { readonly t: number; readonly configuration: string }[];
}

export function configurationTimeline(rec: AttemptRecord): ConfigurationTimeline {
  return {
    start: rec.start.configuration,
    changes: rec.events.flatMap((e) =>
      e.kind === 'configuration-changed' ? [{ t: e.t, configuration: e.configuration }] : [],
    ),
  };
}

export type ItemDiff =
  | { readonly kind: 'same'; readonly t: number; readonly command: Command }
  | {
      readonly kind: 'changed';
      readonly tA: number;
      readonly tB: number;
      readonly a: Command;
      readonly b: Command;
      readonly fields: readonly string[];
    }
  | { readonly kind: 'only-a'; readonly t: number; readonly command: Command }
  | { readonly kind: 'only-b'; readonly t: number; readonly command: Command };

/** Fields of two commands of the same kind that differ (dotted paths). */
export function commandFields(a: unknown, b: unknown, prefix = ''): string[] {
  if (Object.is(a, b)) return [];
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null)
    return [prefix || '(value)'];
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  return keys.flatMap((k) =>
    commandFields(
      (a as Record<string, unknown>)[k],
      (b as Record<string, unknown>)[k],
      prefix ? `${prefix}.${k}` : k,
    ),
  );
}

/**
 * Align two timed command lists: same kind (and same equipment, where the command names one)
 * paired in time order; identical pairs within `tolerance` seconds are 'same', other pairs
 * 'changed' with the differing fields; the rest belong to one attempt only.
 */
export function diffCommands(
  a: readonly { t: number; command: Command }[],
  b: readonly { t: number; command: Command }[],
  tolerance = 1,
): ItemDiff[] {
  const key = (c: Command) => {
    switch (c.kind) {
      case 'burn':
      case 'cutoff':
        return `${c.kind}:${c.thruster}`;
      case 'power':
      case 'mode':
        return `${c.kind}:${c.equipment}`;
      case 'point':
        return `${c.kind}:${c.sensor}`;
      default:
        return c.kind;
    }
  };
  const groups = new Map<
    string,
    { a: { t: number; command: Command }[]; b: { t: number; command: Command }[] }
  >();
  for (const [side, list] of [
    ['a', a],
    ['b', b],
  ] as const)
    for (const item of [...list].sort((x, y) => x.t - y.t)) {
      const k = key(item.command);
      if (!groups.has(k)) groups.set(k, { a: [], b: [] });
      groups.get(k)![side].push(item);
    }
  const out: ItemDiff[] = [];
  for (const g of groups.values()) {
    const n = Math.max(g.a.length, g.b.length);
    for (let i = 0; i < n; i++) {
      const x = g.a[i];
      const y = g.b[i];
      if (x && y) {
        const fields = commandFields(x.command, y.command);
        if (fields.length === 0 && Math.abs(x.t - y.t) <= tolerance)
          out.push({ kind: 'same', t: x.t, command: x.command });
        else
          out.push({
            kind: 'changed',
            tA: x.t,
            tB: y.t,
            a: x.command,
            b: y.command,
            fields: Math.abs(x.t - y.t) > tolerance ? ['t', ...fields] : fields,
          });
      } else if (x) out.push({ kind: 'only-a', t: x.t, command: x.command });
      else if (y) out.push({ kind: 'only-b', t: y.t, command: y.command });
    }
  }
  const t = (d: ItemDiff) => (d.kind === 'changed' ? Math.min(d.tA, d.tB) : d.t);
  return out.sort((p, q) => t(p) - t(q));
}

const planned = (rec: AttemptRecord) =>
  rec.plans.flatMap((p) => p.items.map((i) => ({ t: p.epoch + i.at, command: i.command })));
const executedOk = (rec: AttemptRecord) =>
  rec.executed.filter((c) => c.status !== 'rejected').map((c) => ({ t: c.t, command: c.command }));

// ---------------------------------------------------------------------------------------------
// Forecast against outcome
// ---------------------------------------------------------------------------------------------

export interface DivergencePoint {
  readonly t: number;
  readonly body: string;
  /** |measured − forecast| of the ship relative to the body, m. */
  readonly deviation: number;
  /** The same in σ of forecast envelope ⊕ fix noise (Mahalanobis distance). */
  readonly sigmas: number;
}

export interface ForecastDivergence {
  readonly forecast: string;
  readonly issuedAt: number;
  readonly horizon: number;
  readonly modelVersion: number;
  readonly points: readonly DivergencePoint[];
  /**
   * Where the outcome left the forecast: the first fix of the first run of `window` consecutive
   * fixes whose RMS Mahalanobis distance exceeds 3 (single fixes beyond 3σ happen by chance), or
   * null if it never did while measured.
   */
  readonly firstBeyond3Sigma: number | null;
  readonly maxSigmas: number | null;
  /** Spans inside the forecast where no fix was recorded (missing, not zero). */
  readonly gaps: readonly (readonly [number, number])[];
  /** True when nothing was measured while the forecast was valid. */
  readonly unmeasured: boolean;
}

interface Fix {
  readonly t: number;
  readonly body: string;
  readonly bearing: number;
  readonly range: number;
  readonly sb: number;
  readonly sr: number;
}

function fixes(ms: readonly Measurement[]): Fix[] {
  const out: Fix[] = [];
  const ranges = new Map<string, Measurement>();
  for (const m of ms)
    if (m.kind === 'range' && m.target) ranges.set(`${m.t}|${m.source}|${m.target}`, m);
  for (const m of ms) {
    if (m.kind !== 'bearing' || !m.target) continue;
    const r = ranges.get(`${m.t}|${m.source}|${m.target}`);
    if (r)
      out.push({
        t: m.t,
        body: m.target,
        bearing: m.value[0]!,
        range: r.value[0]!,
        sb: m.sigma[0]!,
        sr: r.sigma[0]!,
      });
  }
  return out;
}

/** Linear interpolation in a time series (assumes sorted by t). */
function interp<T extends { t: number }>(
  s: readonly T[],
  t: number,
  get: (q: T) => number[],
): number[] | null {
  if (s.length === 0 || t < s[0]!.t || t > s[s.length - 1]!.t) return null;
  let lo = 0;
  let hi = s.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s[mid]!.t <= t) lo = mid;
    else hi = mid;
  }
  const a = s[lo]!;
  const b = s[hi]!;
  const w = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  const va = get(a);
  const vb = get(b);
  return va.map((v, i) => v + w * (vb[i]! - v));
}

export function forecastDivergence(
  f: Forecast,
  rec: AttemptRecord,
  opts: { window?: number; gapFactor?: number } = {},
): ForecastDivergence {
  const gapFactor = opts.gapFactor ?? 3;
  const window = opts.window ?? 5;
  const samples = f.samples;
  const start = f.issuedAt;
  const end = f.horizon;
  const fx = fixes(rec.measurements).filter((q) => q.t >= start && q.t <= end);
  const points: DivergencePoint[] = [];
  for (const q of fx) {
    const track = f.objects.find((o) => o.id === q.body);
    if (!track) continue;
    const s = interp(samples, q.t, (p) => [p.position.x, p.position.y, ...p.positionCov]);
    const b = interp(track.samples, q.t, (p) => [p.position.x, p.position.y]);
    if (!s || !b) continue;
    const px = s[0]! - b[0]!;
    const py = s[1]! - b[1]!;
    const ux = Math.cos(q.bearing);
    const uy = Math.sin(q.bearing);
    const mx = -q.range * ux;
    const my = -q.range * uy;
    const dx = mx - px;
    const dy = my - py;
    // Fix covariance: σr along the line of sight, ρ·σb across it.
    const sc = q.range * q.sb;
    const cxx = s[2]! + q.sr ** 2 * ux * ux + sc ** 2 * uy * uy;
    const cxy = s[3]! + (q.sr ** 2 - sc ** 2) * ux * uy;
    const cyy = s[4]! + q.sr ** 2 * uy * uy + sc ** 2 * ux * ux;
    const det = cxx * cyy - cxy * cxy;
    const m2 = det > 0 ? (cyy * dx * dx - 2 * cxy * dx * dy + cxx * dy * dy) / det : Infinity;
    points.push({ t: q.t, body: q.body, deviation: Math.hypot(dx, dy), sigmas: Math.sqrt(m2) });
  }
  const times = [...new Set(fx.map((q) => q.t))].sort((a, b) => a - b);
  const gaps: [number, number][] = [];
  if (times.length > 1) {
    const steps = times
      .slice(1)
      .map((t, i) => t - times[i]!)
      .sort((a, b) => a - b);
    const typical = steps[steps.length >> 1]!;
    if (times[0]! - start > gapFactor * typical) gaps.push([start, times[0]!]);
    for (let i = 1; i < times.length; i++)
      if (times[i]! - times[i - 1]! > gapFactor * typical) gaps.push([times[i - 1]!, times[i]!]);
    const last = Math.min(end, rec.outcome.kind === 'in-progress' ? end : rec.outcome.t);
    if (last - times[times.length - 1]! > gapFactor * typical)
      gaps.push([times[times.length - 1]!, last]);
  } else if (end > start) gaps.push([start, end]);
  let beyond: DivergencePoint | undefined;
  for (let i = 0; i + window <= points.length && !beyond; i++) {
    let s2 = 0;
    for (let k = i; k < i + window; k++) s2 += points[k]!.sigmas ** 2;
    if (Math.sqrt(s2 / window) > 3) beyond = points[i];
  }
  return {
    forecast: f.id,
    issuedAt: f.issuedAt,
    horizon: f.horizon,
    modelVersion: f.modelVersion,
    points,
    firstBeyond3Sigma: beyond ? beyond.t : null,
    maxSigmas: points.length ? Math.max(...points.map((p) => p.sigmas)) : null,
    gaps,
    unmeasured: points.length === 0,
  };
}

// ---------------------------------------------------------------------------------------------
// The comparison
// ---------------------------------------------------------------------------------------------

export interface AttemptSide {
  readonly id: AttemptId;
  readonly outcome: AttemptOutcome;
  readonly configuration: ConfigurationTimeline;
  readonly divergence: readonly ForecastDivergence[];
  /** From the model; empty arrays with a note when the attempt has no fitted data. */
  readonly residuals: {
    readonly coast: readonly ResidualPoint[];
    readonly powered: readonly ResidualPoint[];
  };
  readonly strength: readonly { readonly body: string; readonly points: BodyStrength['points'] }[];
  readonly coverage: DataCoverage | null;
  readonly missing: readonly string[];
}

export interface AttemptComparison {
  readonly a: AttemptSide;
  readonly b: AttemptSide;
  readonly configurationDiffers: boolean;
  readonly plans: readonly ItemDiff[];
  readonly executed: readonly ItemDiff[];
  /** Confounding indicator of the model over all retained data (§9.3), if any. */
  readonly confounding: Confounding | null;
  /** Bodies' strength-against-distance slopes and inflation (the reference law runs through them). */
  readonly strengthSummary: readonly {
    body: string;
    slope: number | null;
    inflation: number | null;
    referenceMu: number;
    referenceExponent: number;
  }[];
  readonly modelVersion: number | null;
}

function side(rec: AttemptRecord, model: ModelReport | null): AttemptSide {
  const divergence = rec.forecasts.map((f) => forecastDivergence(f, rec));
  const res = model?.residuals.filter((r) => r.attempt === rec.id) ?? [];
  const coverage = model?.coverage.find((c) => c.attempt === rec.id) ?? null;
  const missing: string[] = [...(coverage?.missing ?? [])];
  if (!model) missing.push('no model report: residuals and strength not available');
  else if (res.length === 0) missing.push('no fitted measurements in this attempt');
  if (rec.forecasts.length === 0) missing.push('no forecast was issued');
  for (const d of divergence)
    if (d.unmeasured) missing.push(`forecast ${d.forecast}: nothing measured while it was valid`);
  return {
    id: rec.id,
    outcome: rec.outcome,
    configuration: configurationTimeline(rec),
    divergence,
    residuals: { coast: res.filter((r) => !r.powered), powered: res.filter((r) => r.powered) },
    strength: (model?.strength ?? []).map((s) => ({
      body: s.body,
      points: s.points.filter((p) => p.attempt === rec.id),
    })),
    coverage,
    missing,
  };
}

/** Compare two attempts. `model` is the current ModelReport (model client `report()`), optional. */
export function compareAttempts(
  a: AttemptRecord,
  b: AttemptRecord,
  model: ModelReport | null = null,
): AttemptComparison {
  const ca = configurationTimeline(a);
  const cb = configurationTimeline(b);
  return {
    a: side(a, model),
    b: side(b, model),
    configurationDiffers: JSON.stringify(ca) !== JSON.stringify(cb),
    plans: diffCommands(planned(a), planned(b)),
    executed: diffCommands(executedOk(a), executedOk(b)),
    confounding: model?.confounding ?? null,
    strengthSummary: (model?.strength ?? []).map((s) => ({
      body: s.body,
      slope: s.slope,
      inflation: s.inflation,
      referenceMu: s.referenceMu,
      referenceExponent: s.referenceExponent,
    })),
    modelVersion: model?.modelVersion ?? null,
  };
}
