import { lossSequence } from '../../theme/index.ts';

/**
 * Times in seconds. The calm before the tremor is 6.5 s (S23 had 2.8): long enough for the
 * player to take in Earth while the anomaly shows itself, first in the stars beside one empty
 * point, then on the console, where the measured track pulls away from the forecast (owner,
 * 2026-11-15). Every S23 beat after the calm keeps its spacing, 3.7 s later.
 */
const TREMOR = 6.5;
const STUMBLE = 7.8;
const FAILURE = 9.35;
const CUT = FAILURE + lossSequence.shakeEnd;
/** A held black after the cut, then the whole title fades in over 1.5 s (owner, 2026-11-14). */
const TITLE = 11.95;
const TITLE_SHOWN = TITLE + 1.5;

/**
 * The title (owner, 2026-11-14): after a held black every letter fades in together over 1.5 s,
 * holds steady, starts to flicker like a failing screen, then goes out for good. Each dip is
 * [start, seconds, level during the dip]; after a dip the title returns at `after`. Dips start at
 * least 0.4 s apart and the title goes out at TITLE_OUT, so any one second holds at most three
 * flashes. Black then holds for DARK_AFTER_TITLE before the room appears.
 */
export const TITLE_FLICKERS = [
  { at: 14.7, length: 0.07, level: 0, after: 1 },
  { at: 15.12, length: 0.05, level: 0.25, after: 0.85 },
  { at: 15.52, length: 0.09, level: 0, after: 0.6 },
] as const;
export const TITLE_OUT = 15.9;
/** Seconds of black after the title goes out, before the room starts to appear (owner). */
export const DARK_AFTER_TITLE = 2;
const REVEAL = TITLE_OUT + DARK_AFTER_TITLE;
/** The new sky goes in under black a little before the reveal (S23's 0.65 s). */
const ARRIVAL_SKY = REVEAL - 0.65;
const SETTLED = REVEAL + 1.55;
export const OPENING_END = 19.5;

function titleAt(t: number, reducedMotion: boolean): number {
  if (t < TITLE || t >= TITLE_OUT) return 0;
  const shown = ease(range(t, TITLE, TITLE_SHOWN));
  if (reducedMotion) return shown;
  let level = 1;
  for (const dip of TITLE_FLICKERS) {
    if (t < dip.at) break;
    level = t < dip.at + dip.length ? dip.level : dip.after;
  }
  return shown * level;
}

/** S23 pulse starts. The envelope stays local to two room strips. */
export const ALARM_STARTS = [6.6, 7.8, 8.47, 9.35, 10.02] as const;
export const ALARM_DURATION = 0.24;

const CUES = [
  { at: 6.5, id: 'opening-rumble' },
  { at: 6.6, id: 'opening-alarm' },
  { at: 7.8, id: 'opening-alarm' },
  { at: 8.47, id: 'opening-alarm' },
  { at: 9.35, id: 'loss-failure' },
  { at: 10.65, id: 'black-cut' },
  { at: TITLE, id: 'opening-title' },
  { at: TITLE_OUT, id: 'title-out' },
  { at: REVEAL, id: 'room-wake' },
] as const;
export type OpeningCue = (typeof CUES)[number]['id'];
export const openingCues = (from: number, to: number) =>
  CUES.filter(({ at }) => from < at && at <= to);

type Vector = readonly [number, number, number];
const ZERO: Vector = [0, 0, 0];

export type OpeningBeat =
  'home' | 'alarm' | 'stumble' | 'impact' | 'dark' | 'title' | 'arrival' | 'wake' | 'end';

/**
 * A point lens in the window: where it sits (degrees of azimuth right of the window's centre and
 * elevation above the eye), its Einstein angle and the angle of its dark shadow, degrees. Light
 * from directly behind it reaches the eye as a ring of the Einstein angle; nothing inside the
 * shadow reaches the eye at all. Presentation values, not a simulated body (S23: no implied mass).
 */
export interface Lens {
  readonly az: number;
  readonly el: number;
  readonly einstein: number;
  readonly shadow: number;
}

export interface OpeningFrame {
  readonly beat: OpeningBeat;
  readonly blackout: number;
  /** The title's brightness, 0 to 1 (its fade in and flicker). */
  readonly title: number;
  readonly alarm: number;
  readonly light: number;
  readonly console: 'cruise' | 'caution' | 'warning' | 'off';
  readonly translation: Vector;
  /** Pitch, yaw and roll, radians. */
  readonly rotation: Vector;
  /** The anomaly as seen through the window (an invisible lens; it is never named on screen). */
  readonly lens: Lens;
  /** How far the console's measured track has pulled away from its forecast, 0 to 1. */
  readonly drift: number;
  readonly wake: number;
  readonly ambience: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const range = (t: number, from: number, to: number) => clamp01((t - from) / (to - from));
const mix = (a: number, b: number, u: number) => a + (b - a) * u;
const ease = (u: number) => u * u * (3 - 2 * u);
const radians = (degrees: number) => (degrees * Math.PI) / 180;
const STUMBLES = [
  [STUMBLE, ZERO, ZERO],
  [8.05, [0.1, -0.07, 0.06], [-2.5, -1.5, 2.8]],
  [8.48, [0.025, -0.015, 0.015], [-0.5, -0.3, 0.5]],
  [8.72, ZERO, ZERO],
  [8.92, [-0.08, -0.05, 0.045], [-1.7, 1.2, -2.2]],
  [FAILURE, ZERO, ZERO],
] as const;

function stumbleAt(t: number): { translation: Vector; rotation: Vector } {
  for (let i = 1; i < STUMBLES.length; i++) {
    const [from, p, r] = STUMBLES[i - 1]!;
    const [to, q, s] = STUMBLES[i]!;
    if (t < from || t > to) continue;
    const progress = ease(range(t, from, to));
    return {
      translation: [
        mix(p[0], q[0], progress),
        mix(p[1], q[1], progress),
        mix(p[2], q[2], progress),
      ],
      rotation: [
        radians(mix(r[0], s[0], progress)),
        radians(mix(r[1], s[1], progress)),
        radians(mix(r[2], s[2], progress)),
      ],
    };
  }
  return { translation: ZERO, rotation: ZERO };
}

function shakeAt(t: number): { translation: Vector; rotation: Vector } {
  const tremor = Math.max(0, t - TREMOR);
  const stumble = range(t, STUMBLE, FAILURE);
  const failureTime = Math.max(0, t - FAILURE);
  const failure = ease(range(t, FAILURE, FAILURE + 0.12));
  const decay = 1 - ease(range(t, FAILURE + 0.12, CUT));
  const rise = range(t, TREMOR, TREMOR + 1);
  const y = mix(0.012 * rise + 0.026 * stumble, lossSequence.shake, failure) * decay;
  const roll = mix(radians(0.2 * rise + 0.35 * stumble), lossSequence.roll, failure) * decay;
  const cyclesAtFailure = (FAILURE - TREMOR) * 3.2 + (FAILURE - STUMBLE) * 0.65;
  const base = cyclesAtFailure + failureTime * 4.5;
  const ramp = Math.min(failureTime, 0.12);
  const extra = failureTime - ramp + (ramp * ramp) / (2 * 0.12);
  const cycles =
    t < FAILURE ? tremor * 3.2 + (FAILURE - STUMBLE) * 0.65 * stumble ** 2 : base + 2 * extra;
  const rollCycles = t < FAILURE ? cycles : base + 0.1 * extra;
  const offset = stumbleAt(t);
  const [dx, dy, dz] = offset.translation;
  const [pitch, yaw, tilt] = offset.rotation;
  return {
    translation: [dx, dy + Math.sin(2 * Math.PI * cycles) * y, dz],
    rotation: [pitch, yaw, tilt + Math.sin(2 * Math.PI * rollCycles) * roll],
  };
}

function alarmAt(t: number): number {
  const start = ALARM_STARTS.find((at) => at <= t && t < at + ALARM_DURATION);
  if (start === undefined) return 0;
  const age = t - start;
  return ease(range(age, 0, 0.06)) * (1 - ease(range(age, 0.14, ALARM_DURATION)));
}

/**
 * The lens's path (owner, 2026-11-15). It starts in the left pane, small, and drifts right, but
 * stays well clear of Earth (az +4.7°, el +2.0°): the owner cut Earth doubling into a ring. Stars
 * it passes brighten, slide and split (calm). It grows as the ship falls toward it, a dark point
 * ringed by bent starlight (alarm, stumble, failure). Then the dark swells from that point until
 * it fills the window, and the cut to black comes out of it. Each key is [t, az, el, einstein,
 * shadow]. Earth stays at least 10° away, where the lens moves its light by under 0.2°.
 */
export const LENS_KEYS = [
  [0, -17, 3.4, 0.25, 0],
  [TREMOR, -9, 2.9, 0.7, 0.02],
  [FAILURE, -6.2, 2.7, 1.1, 0.35],
  [10.15, -5.6, 2.6, 1.25, 0.8],
  // Full by the black-cut cue, so the dark has the window for a moment before the cut.
  [CUT - 0.2, -5.6, 2.6, 1.3, 85],
] as const;
/** Earth's bearing in the window, degrees (S23). */
export const EARTH_BEARING = { az: 4.7, el: 2.0 } as const;
/** In reduced motion the dark never swells over the window: the room simply goes black. */
export const REDUCED_SHADOW = LENS_KEYS[3][4];

function lensAt(t: number, reducedMotion: boolean): Lens {
  let i = 1;
  while (i < LENS_KEYS.length - 1 && t > LENS_KEYS[i]![0]) i++;
  const a = LENS_KEYS[i - 1]!;
  const b = LENS_KEYS[i]!;
  const u = range(t, a[0], b[0]);
  const last = i === LENS_KEYS.length - 1;
  // The last stretch accelerates: the dark takes the window all at once.
  const k = last ? u ** 3 : ease(u);
  const shadow = mix(a[4], b[4], k);
  return {
    az: mix(a[1], b[1], k),
    el: mix(a[2], b[2], k),
    einstein: mix(a[3], b[3], k),
    shadow: reducedMotion ? Math.min(shadow, REDUCED_SHADOW) : shadow,
  };
}

/** The console's measured track leaves the forecast during the calm and keeps going. */
const DRIFT_FROM = 2;

/** Sample the authored S23 beat sheet with visible elapsed seconds. */
export function sampleOpening(t: number, reducedMotion: boolean): OpeningFrame {
  const wake = reducedMotion ? 1 : ease(range(t, REVEAL, SETTLED));
  const base: OpeningFrame = {
    beat: 'home',
    blackout: 0,
    title: 0,
    alarm: 0,
    light: 1,
    console: 'cruise',
    translation: ZERO,
    rotation: ZERO,
    lens: lensAt(t, reducedMotion),
    drift: ease(range(t, DRIFT_FROM, FAILURE)),
    wake,
    ambience: 1,
  };
  if (t < TREMOR) return base;
  if (t < CUT) {
    const pose = reducedMotion ? { translation: ZERO, rotation: ZERO } : shakeAt(t);
    return {
      ...base,
      ...pose,
      beat: t < STUMBLE ? 'alarm' : t < FAILURE ? 'stumble' : 'impact',
      light:
        t < FAILURE
          ? mix(1, 0.65, range(t, STUMBLE, FAILURE))
          : mix(0.65, 0.1, range(t, FAILURE, CUT)),
      console: t < 8.72 ? 'caution' : t < FAILURE + lossSequence.hologramEnd ? 'warning' : 'off',
      alarm: reducedMotion ? (t < FAILURE + lossSequence.hologramEnd ? 1 : 0) : alarmAt(t),
      ambience: 1 - range(t, FAILURE, CUT),
    };
  }
  if (t < TITLE) return { ...base, beat: 'dark', blackout: 1, ambience: 0 };
  if (t < TITLE_OUT) {
    return {
      ...base,
      beat: 'title',
      blackout: 1,
      title: titleAt(t, reducedMotion),
      ambience: 0,
    };
  }
  if (t < ARRIVAL_SKY) return { ...base, beat: 'dark', blackout: 1, ambience: 0 };
  if (t < REVEAL) return { ...base, beat: 'arrival', blackout: 1, ambience: 0 };
  if (t < OPENING_END) {
    const reveal = ease(range(t, REVEAL, SETTLED));
    return { ...base, beat: 'wake', blackout: 1 - reveal, ambience: reveal };
  }
  return { ...base, beat: 'end' };
}
