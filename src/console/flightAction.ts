/**
 * What the ship is doing with its attitude, in the HUD's words (NIGHT's finding 7: the ship
 * turns about a degree every two seconds, and FLIGHT said nothing while a key was held, so a
 * player thought the keys did nothing). The turn in progress is stated at once: which way, how
 * fast, and what is driving it.
 */
import type { AttitudeMode } from '../game/belief/controls.ts';

/** The rate that fills a rate bar, degrees a second. A display scale, not a limit of the ship. */
export const RATE_FULL = 2;

/** Below this the ship is not turning, as far as the HUD says: degrees a second. */
const STILL = 0.005;

const MODE_WORDS: Readonly<Record<AttitudeMode, string>> = {
  free: 'no attitude control',
  'hands-on': 'by hand',
  steady: 'rotation stopped · attitude free',
  hold: 'holding attitude',
  pointing: 'turning to the commanded direction',
  turning: 'turning at a commanded rate',
};

export interface TurnReading {
  /** The ship is turning, or the hands are asking it to. */
  readonly turning: boolean;
  /** Degrees a second: yaw positive to the left, pitch positive nose up. */
  readonly yaw: number;
  readonly pitch: number;
  readonly text: string;
}

const signed = (value: number, plus: string, minus: string): string =>
  `${value >= 0 ? plus : minus} ${Math.abs(value).toFixed(2)}°/s`;

/**
 * The turn as the HUD states it. `rates` are the ship's believed turn rates (rad/s); `hands`
 * are the controls held (-1, 0, 1): held keys count as turning from the first frame, before
 * the 30 t ship has gathered any rate to show.
 */
export function turnReading(
  rates: { readonly yaw: number; readonly pitch: number },
  mode: AttitudeMode,
  hands: { readonly yaw: number; readonly pitch: number },
): TurnReading {
  const yaw = (rates.yaw * 180) / Math.PI;
  const pitch = (rates.pitch * 180) / Math.PI;
  const asked = hands.yaw !== 0 || hands.pitch !== 0;
  const moving = Math.abs(yaw) > STILL || Math.abs(pitch) > STILL;
  if (!asked && !moving) return { turning: false, yaw, pitch, text: MODE_WORDS[mode] };
  const parts: string[] = [];
  if (hands.yaw !== 0 || Math.abs(yaw) > STILL) parts.push(`yaw ${signed(yaw, '⟲', '⟳')}`);
  if (hands.pitch !== 0 || Math.abs(pitch) > STILL) parts.push(`pitch ${signed(pitch, '↑', '↓')}`);
  // Hands on the controls: say so, and that the ship answers slowly, so a held key reads as
  // working from the first moment.
  const driver = asked ? 'by hand · rate builds slowly' : MODE_WORDS[mode];
  return { turning: true, yaw, pitch, text: `${parts.join(' · ')} · ${driver}` };
}
