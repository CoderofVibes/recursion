/**
 * What a forecast's uncertainty is made of, and what would shrink it. Over the forecast: the
 * envelope's size against time, split by source. At the moment shown: the same split as one bar,
 * with the source that limits the forecast named, and the remedy that is the player's to choose
 * (track longer, fly or probe those distances, calibrate the engine, adopt a tested rule).
 *
 * The sources add in quadrature, so each one's share is its share of the variance.
 */
import { useMemo } from 'react';
import { SOURCES, limiting, shares } from './chartMath.ts';
import type { SigmaBySource } from './chartMath.ts';

export interface UncertaintyPanelProps {
  readonly series: readonly SigmaBySource[];
  /** The moment shown. */
  readonly t: number;
  /** A length as the console writes it. */
  readonly format: (metres: number) => string;
  readonly label?: string;
}

const W = 320;
const H = 64;

/**
 * The envelope's size against time as stacked areas, one per source: stacked by share of the
 * variance and scaled to the total's size, so the top edge is the envelope itself.
 */
export function uncertaintyLayers(
  series: readonly SigmaBySource[],
): { readonly id: string; readonly d: string }[] {
  if (series.length === 0) return [];
  const t0 = series[0]!.t;
  const t1 = series.at(-1)!.t;
  const top = Math.max(1, ...series.map((s) => s.total));
  const x = (time: number): string => (((time - t0) / Math.max(1e-9, t1 - t0)) * W).toFixed(1);
  const y = (sigma: number): string => (H - (sigma / top) * H).toFixed(1);
  // Each moment's shares once, then each layer from them.
  const split = series.map((s) => shares(s));
  return SOURCES.map((source, layer) => {
    const upper: string[] = [];
    const lower: string[] = [];
    series.forEach((s, n) => {
      const parts = split[n]!;
      let below = 0;
      for (let i = 0; i < layer; i++) below += parts[i]!.share;
      const above = below + parts[layer]!.share;
      upper.push(`${x(s.t)} ${y(above * s.total)}`);
      lower.push(`${x(s.t)} ${y(below * s.total)}`);
    });
    return { id: source.id, d: `M${upper.join('L')}L${lower.reverse().join('L')}Z` };
  });
}

export function UncertaintyPanel({
  series,
  t,
  format,
  label = 'What the uncertainty is made of',
}: UncertaintyPanelProps) {
  // Worked out once for a forecast: the console redraws five times a second (S15).
  const layers = useMemo(() => uncertaintyLayers(series), [series]);
  if (series.length === 0)
    return (
      <div className="ci-unc" role="img" aria-label={`${label}: no forecast`}>
        <p className="cs-note">no forecast: nothing to break down</p>
      </div>
    );
  const t0 = series[0]!.t;
  const t1 = series.at(-1)!.t;
  const x = (time: number): number => ((time - t0) / Math.max(1e-9, t1 - t0)) * W;
  let now = series[0]!;
  for (const s of series) if (s.t <= t + 1e-6) now = s;
  const parts = shares(now);
  const worst = limiting(now);
  const remedy = SOURCES.find((s) => s.id === worst)!;
  return (
    <div className="ci-unc">
      <svg
        className="ci-unc__plot"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label}: grows to ${format(series.at(-1)!.total)} at the forecast's end`}
      >
        {layers.map((l) => (
          <path key={l.id} className="ci-unc__layer" data-src={l.id} d={l.d} />
        ))}
        <line className="ci-unc__cursor" x1={x(now.t)} x2={x(now.t)} y1={0} y2={H} />
      </svg>
      <div className="ci-unc__head">
        <span className="ci-unc__total">±{format(now.total)}</span>
        <span className="ci-unc__what">1σ here · limited by {remedy.label}</span>
      </div>
      <div className="ci-unc__bar" role="img" aria-label={`Limited by ${remedy.label}`}>
        {parts
          .filter((p) => p.share > 0.004)
          .map((p) => (
            <span
              key={p.id}
              className="ci-unc__seg"
              data-src={p.id}
              style={{ width: `${(p.share * 100).toFixed(1)}%` }}
            />
          ))}
      </div>
      <ul className="ci-unc__legend">
        {SOURCES.map((source) => {
          const part = parts.find((p) => p.id === source.id)!;
          if (part.sigma <= 0) return null;
          return (
            <li key={source.id} data-on={source.id === worst ? '' : undefined}>
              <span className="ci-unc__key" data-src={source.id} />
              <span className="ci-unc__name">{source.label}</span>
              <span className="ci-unc__value">{format(part.sigma)}</span>
            </li>
          );
        })}
      </ul>
      <p className="ci-unc__remedy">to shrink it: {remedy.remedy}</p>
    </div>
  );
}
