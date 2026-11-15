/**
 * Number and time formatting for instruments. Values keep their units and Greek letters in
 * lower case here; the stylesheet upper-cases labels only (src/theme/README.md).
 */

/** hh:mm:ss. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** A duration in the largest sensible unit: 42 s, 12.5 min, 3.2 h. */
export function duration(seconds: number): string {
  const s = Math.abs(seconds);
  if (!Number.isFinite(s)) return '—';
  if (s < 90) return `${s.toFixed(0)} s`;
  if (s < 5400) return `${(s / 60).toFixed(1)} min`;
  return `${(s / 3600).toFixed(1)} h`;
}

/**
 * One formatter per format, made once (S15: `toLocaleString` builds a new one on every call,
 * hundreds of times a second on SYSTEMS). Same output as `toLocaleString('en-US', options)`.
 */
const GROUPED = new Intl.NumberFormat('en-US');
const FIXED_GROUPED = new Map<number, Intl.NumberFormat>();
const grouped = (digits: number): Intl.NumberFormat => {
  let f = FIXED_GROUPED.get(digits);
  if (!f)
    FIXED_GROUPED.set(
      digits,
      (f = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })),
    );
  return f;
};

/** Metres as m or km. */
export function dist(metres: number): string {
  const m = Math.abs(metres);
  if (!Number.isFinite(m)) return '—';
  if (m < 10_000) return `${metres.toFixed(0)} m`;
  if (m < 1_000_000) return `${(metres / 1000).toFixed(1)} km`;
  return `${GROUPED.format(Math.round(metres / 1000))} km`;
}

export const km = (metres: number, digits = 0): string => grouped(digits).format(metres / 1000);

export const fixed = (value: number, digits = 1): string =>
  Number.isFinite(value) ? value.toFixed(digits) : '—';

export const whole = (value: number): string =>
  Number.isFinite(value) ? GROUPED.format(Math.round(value)) : '—';

/** A value with as many significant figures as its uncertainty warrants: 1.02e10 ± 3e8. */
export function sci(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return '—';
  const a = Math.abs(value);
  if (a === 0) return '0';
  if (a >= 1e5 || a < 1e-3) {
    const [m, e] = value.toExponential(digits - 1).split('e');
    return `${m}×10${superscript(Number(e))}`;
  }
  return Number(value.toPrecision(digits)).toString();
}

const SUPER: Readonly<Record<string, string>> = {
  '-': '⁻',
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
};
const superscript = (n: number): string =>
  String(n)
    .split('')
    .map((c) => SUPER[c] ?? c)
    .join('');

/** Bytes as kB, MB, GB. */
export function bytes(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n < 1e6) return `${(n / 1e3).toFixed(0)} kB`;
  if (n < 1e9) return `${(n / 1e6).toFixed(1)} MB`;
  return `${(n / 1e9).toFixed(2)} GB`;
}

/** An equipment or tank id as an instrument name: "main-engine" → "main engine". */
export const name = (id: string): string => id.replace(/-/g, ' ');

/** A configuration's name as words: the ship names them in one (`allDeployed` → `all deployed`). */
export const configurationName = (given: string): string =>
  given.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

/** Degrees from radians, 0–360. */
export const degrees = (radians: number): number =>
  ((((radians * 180) / Math.PI) % 360) + 360) % 360;
