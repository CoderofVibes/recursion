import { lossSequence } from '../../theme/index.ts';

const TREMOR = 2.8;
const STUMBLE = 4.1;
const FAILURE = 5.65;
const CUT = FAILURE + lossSequence.shakeEnd;
/** A held black after the cut, then the whole title fades in over 1.5 s (owner, 2026-11-14). */
const TITLE = 8.25;
const TITLE_SHOWN = TITLE + 1.5;

/**
 * The title (owner, 2026-11-14): after a held black every letter fades in together over 1.5 s,
 * holds steady, starts to flicker like a failing screen, then goes out for good. Each dip is
 * [start, seconds, level during the dip]; after a dip the title returns at `after`. Dips start at
 * least 0.4 s apart and the title goes out at TITLE_OUT, so any one second holds at most three
 * flashes. Black then holds for DARK_AFTER_TITLE before the room appears.
 */
export const TITLE_FLICKERS = [
  { at: 11.0, length: 0.07, level: 0, after: 1 },
  { at: 11.42, length: 0.05, level: 0.25, after: 0.85 },
  { at: 11.82, length: 0.09, level: 0, after: 0.6 },
] as const;
export const TITLE_OUT = 12.2;
/** Seconds of black after the title goes out, before the room starts to appear (owner). */
export const DARK_AFTER_TITLE = 2;
const REVEAL = TITLE_OUT + DARK_AFTER_TITLE;
/** The new sky goes in under black a little before the reveal (S23's 0.65 s). */
const ARRIVAL_SKY = REVEAL - 0.65;
const SETTLED = REVEAL + 1.55;
export const OPENING_END = 16;

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
export const ALARM_STARTS = [2.9, 4.1, 4.77, 5.65, 6.32] as const;
export const ALARM_DURATION = 0.24;

const CUES = [
  { at: 2.8, id: 'opening-rumble' },
  { at: 2.9, id: 'opening-alarm' },
  { at: 4.1, id: 'opening-alarm' },
  { at: 4.77, id: 'opening-alarm' },
  { at: 5.65, id: 'loss-failure' },
  { at: 6.95, id: 'black-cut' },
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
  readonly lens: number;
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
  [4.35, [0.1, -0.07, 0.06], [-2.5, -1.5, 2.8]],
  [4.78, [0.025, -0.015, 0.015], [-0.5, -0.3, 0.5]],
  [5.02, ZERO, ZERO],
  [5.22, [-0.08, -0.05, 0.045], [-1.7, 1.2, -2.2]],
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
  const rise = range(t, TREMOR, 3.8);
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
    lens: 0,
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
      console: t < 5.02 ? 'caution' : t < FAILURE + lossSequence.hologramEnd ? 'warning' : 'off',
      alarm: reducedMotion ? (t < FAILURE + lossSequence.hologramEnd ? 1 : 0) : alarmAt(t),
      lens: reducedMotion ? 0 : ease(range(t, 5.35, 6.35)),
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
