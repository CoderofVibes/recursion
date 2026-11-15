/**
 * The mathematics behind the console's trajectory chart and the forecast's step-through: a 3D
 * path seen in a chart plane, how wide its uncertainty is across the path, the steps a forecast
 * can be walked through, and what its uncertainty is made of. Pure functions on plain numbers
 * (belief side, P11): a forecast in, drawable rows out.
 */

export type P2 = readonly [number, number];
export type P3 = readonly [number, number, number];
/** Symmetric 3×3 covariance, [xx, xy, xz, yy, yz, zz] (the contracts' Cov3). */
export type Sym3 = readonly [number, number, number, number, number, number];

/** The plane a chart is drawn in: orthonormal right and up directions, inertial. */
export interface ChartPlane {
  readonly u: P3;
  readonly w: P3;
}

/** Chart-up: the encounter's reference plane seen from above, as the MAP shows a region. */
export const CHART_UP: ChartPlane = { u: [1, 0, 0], w: [0, 1, 0] };

const dot = (a: P3, b: P3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** A point seen in the chart plane, metres. */
export const onPlane = (plane: ChartPlane, p: P3): P2 => [dot(p, plane.u), dot(p, plane.w)];

/** Variance of a covariance along a unit direction. */
const varianceAlong = (cov: Sym3, n: P3): number =>
  cov[0] * n[0] * n[0] +
  cov[3] * n[1] * n[1] +
  cov[5] * n[2] * n[2] +
  2 * (cov[1] * n[0] * n[1] + cov[2] * n[0] * n[2] + cov[4] * n[1] * n[2]);

/** One sigma of a covariance along a direction in space (any length), metres. */
export function sigmaAlong(cov: Sym3, direction: P3): number {
  const len = Math.hypot(direction[0], direction[1], direction[2]);
  if (!(len > 0)) return 0;
  const n: P3 = [direction[0] / len, direction[1] / len, direction[2] / len];
  return Math.sqrt(Math.max(0, varianceAlong(cov, n)));
}

/** The covariance seen in the chart plane: [uu, uw, ww]. */
export function planeCov(plane: ChartPlane, cov: Sym3): readonly [number, number, number] {
  const { u, w } = plane;
  const cu: P3 = [
    cov[0] * u[0] + cov[1] * u[1] + cov[2] * u[2],
    cov[1] * u[0] + cov[3] * u[1] + cov[4] * u[2],
    cov[2] * u[0] + cov[4] * u[1] + cov[5] * u[2],
  ];
  return [dot(u, cu), dot(w, cu), varianceAlong(cov, w)];
}

/** One sigma across a path heading `dir` (in the plane), metres: how wide the envelope is there. */
export function sigmaAcross(plane: ChartPlane, cov: Sym3, dir: P2): number {
  const len = Math.hypot(dir[0], dir[1]);
  if (!(len > 0)) return Math.sqrt(Math.max(0, Math.max(cov[0], cov[3], cov[5])));
  // The in-plane normal to the heading, lifted back into 3D.
  const nx = -dir[1] / len;
  const ny = dir[0] / len;
  const n: P3 = [
    nx * plane.u[0] + ny * plane.w[0],
    nx * plane.u[1] + ny * plane.w[1],
    nx * plane.u[2] + ny * plane.w[2],
  ];
  return Math.sqrt(Math.max(0, varianceAlong(cov, n)));
}

/** The one-sigma ellipse of a covariance in the chart plane: semi-axes (m) and the major axis's angle. */
export function sigmaEllipse(
  plane: ChartPlane,
  cov: Sym3,
): { readonly a: number; readonly b: number; readonly angle: number } {
  const [uu, uw, ww] = planeCov(plane, cov);
  const mean = (uu + ww) / 2;
  const spread = Math.hypot((uu - ww) / 2, uw);
  return {
    a: Math.sqrt(Math.max(0, mean + spread)),
    b: Math.sqrt(Math.max(0, mean - spread)),
    angle: 0.5 * Math.atan2(2 * uw, uu - ww),
  };
}

/** One sample of a forecast as the chart draws it. */
export interface PathPoint {
  readonly t: number;
  readonly x: number;
  readonly y: number;
  /** One sigma across the path in the chart plane, m. */
  readonly sigma: number;
  /** The model has no data here (drawn hatched). */
  readonly extrapolating: boolean;
  /** Extrapolating, but inside a span an adopted rule was tested over. */
  readonly validated: boolean;
}

export interface PathSample {
  readonly t: number;
  readonly position: P3;
  readonly cov?: Sym3;
  readonly extrapolating?: boolean;
  readonly validated?: boolean;
}

/** A forecast's samples as chart points: position in the plane, and the envelope's half-width. */
export function pathOf(plane: ChartPlane, samples: readonly PathSample[]): PathPoint[] {
  const flat = samples.map((s) => onPlane(plane, s.position));
  return samples.map((s, i) => {
    const before = flat[Math.max(0, i - 1)]!;
    const after = flat[Math.min(flat.length - 1, i + 1)]!;
    const dir: P2 = [after[0] - before[0], after[1] - before[1]];
    return {
      t: s.t,
      x: flat[i]![0],
      y: flat[i]![1],
      sigma: s.cov ? sigmaAcross(plane, s.cov, dir) : 0,
      extrapolating: s.extrapolating ?? false,
      validated: s.validated ?? false,
    };
  });
}

/** Where a timed path is at `t`: linear between the samples either side, clamped to its ends. */
export function at<T extends { readonly t: number; readonly x: number; readonly y: number }>(
  points: readonly T[],
  t: number,
): { readonly x: number; readonly y: number; readonly index: number } | undefined {
  if (points.length === 0) return undefined;
  let lo = 0;
  let hi = points.length - 1;
  if (t <= points[0]!.t) return { x: points[0]!.x, y: points[0]!.y, index: 0 };
  if (t >= points[hi]!.t) return { x: points[hi]!.x, y: points[hi]!.y, index: hi };
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid]!.t <= t) lo = mid;
    else hi = mid;
  }
  const a = points[lo]!;
  const b = points[hi]!;
  const f = (t - a.t) / Math.max(1e-9, b.t - a.t);
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, index: f < 0.5 ? lo : hi };
}

/**
 * The envelope as outlines: one closed polygon per run of samples that share a kind (supported,
 * validated, extrapolating), `k` sigmas either side of the path. Points are in chart metres.
 * Each run ends on the sample the next begins with, so the outlines meet; a lone last sample of
 * another kind has no area of its own and simply ends the run before it.
 */
export function envelopeRuns(
  points: readonly PathPoint[],
  k = 2,
): { readonly kind: 'supported' | 'validated' | 'extrapolating'; readonly outline: P2[] }[] {
  const kindOf = (p: PathPoint): 'supported' | 'validated' | 'extrapolating' =>
    p.extrapolating ? (p.validated ? 'validated' : 'extrapolating') : 'supported';
  const runs: { kind: 'supported' | 'validated' | 'extrapolating'; outline: P2[] }[] = [];
  let start = 0;
  for (let i = 1; i <= points.length; i++) {
    if (i < points.length && kindOf(points[i]!) === kindOf(points[start]!)) continue;
    // Each run shares its last sample with the next, so the outlines meet without a gap.
    const end = Math.min(points.length - 1, i);
    const left: P2[] = [];
    const right: P2[] = [];
    for (let j = start; j <= end; j++) {
      const p = points[j]!;
      const a = points[Math.max(0, j - 1)]!;
      const b = points[Math.min(points.length - 1, j + 1)]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = (-(b.y - a.y) / len) * p.sigma * k;
      const ny = ((b.x - a.x) / len) * p.sigma * k;
      left.push([p.x + nx, p.y + ny]);
      right.push([p.x - nx, p.y - ny]);
    }
    if (end > start)
      runs.push({ kind: kindOf(points[start]!), outline: [...left, ...right.reverse()] });
    start = i;
  }
  return runs;
}

// ---- Steps: the moments a forecast can be walked through ---------------------------------------

export type StepKind = 'now' | 'burn' | 'coast' | 'pointing' | 'closest' | 'beyond' | 'ends';

export interface Step {
  readonly t: number;
  readonly kind: StepKind;
  /** A short name for the step's chip: "BURN 1", "ALPHA CLOSEST". */
  readonly label: string;
  /** What happens there, in instrument words. */
  readonly detail: string;
  /** The object a closest approach is to. */
  readonly object?: string;
}

export interface StepInputs {
  readonly issuedAt: number;
  /** Time of the forecast's last sample: where the model stops forecasting. */
  readonly endsAt: number;
  /** True when the forecast stops because its envelope outgrew its usefulness, not at its planned horizon. */
  readonly endsEarly?: boolean;
  /** The first moment the model is beyond its data, when that is after the start. */
  readonly beyondAt?: number;
  readonly burns: readonly {
    readonly t: number;
    readonly duration: number;
    readonly label: string;
  }[];
  readonly pointings?: readonly { readonly t: number; readonly label: string }[];
  readonly closest: readonly {
    readonly id: string;
    readonly name: string;
    readonly t: number;
    readonly text: string;
  }[];
}

/**
 * The steps of a forecast, in time order: now, each burn and the coast after it, each planned
 * pointing, each closest approach, and where the forecast ends. Steps beyond the forecast's end
 * are left out: the model says nothing there.
 */
export function stepsOf(inputs: StepInputs): Step[] {
  const steps: Step[] = [
    { t: inputs.issuedAt, kind: 'now', label: 'NOW', detail: 'the present state, as tracked' },
  ];
  inputs.burns.forEach((b, i) => {
    steps.push({ t: b.t, kind: 'burn', label: `BURN ${i + 1}`, detail: b.label });
    steps.push({
      t: b.t + b.duration,
      kind: 'coast',
      label: `COAST ${i + 1}`,
      detail: 'engine off: the ship coasts',
    });
  });
  for (const p of inputs.pointings ?? [])
    steps.push({ t: p.t, kind: 'pointing', label: 'POINT', detail: p.label });
  if (inputs.beyondAt !== undefined && inputs.beyondAt > inputs.issuedAt)
    steps.push({
      t: inputs.beyondAt,
      kind: 'beyond',
      label: 'BEYOND THE DATA',
      detail: 'from here the model has not measured the pull: the envelope is a hedge',
    });
  for (const c of inputs.closest)
    steps.push({
      t: c.t,
      kind: 'closest',
      label: `${c.name.toUpperCase()} CLOSEST`,
      detail: c.text,
      object: c.id,
    });
  const within = steps
    .filter((s) => s.t >= inputs.issuedAt && s.t <= inputs.endsAt)
    .sort((a, b) => a.t - b.t);
  within.push({
    t: inputs.endsAt,
    kind: 'ends',
    label: 'FORECAST ENDS',
    detail: inputs.endsEarly
      ? 'beyond the data: the model cannot say what happens next'
      : 'the end of the forecast',
  });
  return within;
}

/** The step in force at `t`: the last one at or before it. */
export function stepAt(steps: readonly Step[], t: number): number {
  let index = 0;
  steps.forEach((s, i) => {
    if (s.t <= t + 1e-6) index = i;
  });
  return index;
}

// ---- What the uncertainty is made of ------------------------------------------------------------

/** One sample's one-sigma sizes by source (the contracts' ForecastSigmaBySource), metres. */
export interface SigmaBySource {
  readonly t: number;
  readonly state: number;
  readonly profile: number;
  readonly hedge: number;
  readonly engine: number;
  readonly mass: number;
  readonly bodies?: number;
  readonly total: number;
}

export type SourceId = 'tracking' | 'pull' | 'beyond' | 'bodies' | 'ship';

/** The sources as the console groups them, with what the player can do about each. */
export const SOURCES: readonly {
  readonly id: SourceId;
  readonly label: string;
  /** What shrinks it. */
  readonly remedy: string;
}[] = [
  {
    id: 'tracking',
    label: 'tracking now',
    remedy: 'track a body with the camera before committing',
  },
  { id: 'pull', label: 'measured pull', remedy: 'more fixes at these distances' },
  {
    id: 'beyond',
    label: 'beyond the data',
    remedy: 'fly or probe these distances, or adopt a rule that passes its test',
  },
  { id: 'bodies', label: 'other bodies', remedy: 'track the other body' },
  { id: 'ship', label: 'engine and mass', remedy: 'a recorded burn calibrates the engine' },
];

/**
 * A sample's uncertainty split by source: each source's share of the variance (the sources add
 * in quadrature, so shares of σ² sum to one) and its own one-sigma size.
 */
export function shares(
  s: SigmaBySource,
): { readonly id: SourceId; readonly sigma: number; readonly share: number }[] {
  const parts: readonly (readonly [SourceId, number])[] = [
    ['tracking', s.state],
    ['pull', s.profile],
    ['beyond', s.hedge],
    ['bodies', s.bodies ?? 0],
    ['ship', Math.hypot(s.engine, s.mass)],
  ];
  const sum = parts.reduce((n, [, v]) => n + v * v, 0);
  return parts.map(([id, sigma]) => ({ id, sigma, share: sum > 0 ? (sigma * sigma) / sum : 0 }));
}

/** The largest source at a sample: what most limits the forecast there. */
export function limiting(s: SigmaBySource): SourceId {
  return shares(s).reduce((best, p) => (p.share > best.share ? p : best)).id;
}

// ---- Framing ------------------------------------------------------------------------------------

export interface Bounds {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** The box holding every point, grown by `pad` (a fraction of its larger side). */
export function boundsOf(points: readonly P2[], pad = 0.08): Bounds {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of points) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  if (!Number.isFinite(x0)) return { x0: -1, y0: -1, x1: 1, y1: 1 };
  const grow = Math.max(x1 - x0, y1 - y0, 1) * pad;
  return { x0: x0 - grow, y0: y0 - grow, x1: x1 + grow, y1: y1 + grow };
}

/** A box of half-width `half` about a point: the chart following the ship. */
export const boundsAbout = (x: number, y: number, half: number): Bounds => ({
  x0: x - half,
  y0: y - half,
  x1: x + half,
  y1: y + half,
});

/** A round length for a scale bar: about a fifth of the chart's width, as 1, 2 or 5 × 10ⁿ m. */
export function scaleLength(widthMetres: number): number {
  const target = widthMetres / 5;
  const power = 10 ** Math.floor(Math.log10(Math.max(target, 1e-9)));
  const lead = target / power;
  return (lead >= 5 ? 5 : lead >= 2 ? 2 : 1) * power;
}
