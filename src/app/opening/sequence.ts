import { hudMotion, lossSequence, motion, roomMotion } from '../../theme/index.ts';

/** Seconds on the presentation clock. The simulation clock is still held at arrival. */
const calmEnd = lossSequence.resetAt;
const alarmEnd = calmEnd + motion.settle / 1000;
const impactEnd = alarmEnd + lossSequence.shakeEnd;
const darkEnd = impactEnd + roomMotion.travel;
const titleEnd = darkEnd + motion.breathe / 1000;
export const OPENING_END = titleEnd + hudMotion.lossFade / 1000;

/** A complete pulse takes at least two alert-in beats (1.67 Hz with the stock theme). */
export const ALARM_PERIOD = Math.max(1 / 3, (2 * motion.alertIn) / 1000);

export type OpeningBeat = 'home' | 'alarm' | 'impact' | 'dark' | 'title' | 'wake' | 'end';

export interface OpeningFrame {
  readonly beat: OpeningBeat;
  readonly blackout: number;
  readonly title: number;
  readonly alarm: number;
  readonly shakeY: number;
  readonly roll: number;
}

const lerp01 = (n: number) => Math.min(1, Math.max(0, n));
const ease = (n: number) => {
  const u = lerp01(n);
  return u * u * (3 - 2 * u);
};

/** Deterministic at a given time. Alerts form one continuous pulse train across the impact. */
export function sampleOpening(t: number, reducedMotion: boolean): OpeningFrame {
  const base = { blackout: 0, title: 0, alarm: 0, shakeY: 0, roll: 0 };
  if (t < calmEnd) return { ...base, beat: 'home' };
  if (t < impactEnd) {
    const alarmTime = t - calmEnd;
    const impactTime = Math.max(0, t - alarmEnd);
    const phase = (alarmTime / ALARM_PERIOD) % 1;
    const alarm = reducedMotion ? 1 : (1 - Math.cos(2 * Math.PI * phase)) / 2;
    const jolt = ease(impactTime / (motion.fast / 1000));
    return {
      ...base,
      beat: t < alarmEnd ? 'alarm' : 'impact',
      alarm,
      shakeY: reducedMotion ? 0 : Math.sin(impactTime * 24) * lossSequence.shake * jolt,
      roll: reducedMotion ? 0 : Math.sin(impactTime * 11) * lossSequence.roll * jolt,
    };
  }
  if (t < darkEnd) return { ...base, beat: 'dark', blackout: 1 };
  if (t < titleEnd) {
    const titleIn = ease((t - darkEnd) / (motion.settle / 1000));
    const titleOut = ease((titleEnd - t) / (motion.base / 1000));
    return { ...base, beat: 'title', blackout: 1, title: Math.min(titleIn, titleOut) };
  }
  if (t < OPENING_END) {
    return { ...base, beat: 'wake', blackout: 1 - ease((t - titleEnd) / (OPENING_END - titleEnd)) };
  }
  return { ...base, beat: 'end' };
}
