/**
 * The loss of the ship as the eye meets it (A8): what the room's lights, the hologram and the
 * camera do in each moment of the shake, before the cut to black.
 *
 * A pure function of the time since the loss, so the flash rate can be tested (R43): the lights
 * sag toward the cut and drop out in the theme's few authored dips; the hologram is dark during a
 * dip and for good from `hologramEnd`. Nothing here runs free, so no second holds more than three
 * flashes however the frames fall.
 */
import { lossSequence } from '../../theme/index.ts';

export interface LossFrame {
  /** The room's lights, as a share of the view's own level; 0 once the screen has cut to black. */
  readonly light: number;
  /** Whether a hologram that was showing is still lit. */
  readonly hologram: boolean;
  /** The camera's lift, metres, and roll, radians. */
  readonly lift: number;
  readonly roll: number;
}

/** Smooth start and stop over 0–1. */
const ease = (u: number): number => u * u * (3 - 2 * u);

const BLACK: LossFrame = { light: 0, hologram: false, lift: 0, roll: 0 };

/**
 * The loss sequence `t` seconds after the ship is lost. With `reducedMotion` nothing shakes and
 * nothing flickers: the lights sink steadily and the hologram goes out once.
 */
export function sampleLoss(t: number, reducedMotion: boolean): LossFrame {
  const L = lossSequence;
  if (t >= L.shakeEnd) return BLACK;
  const sag = 1 - (1 - L.dim) * ease(Math.max(0, t) / L.shakeEnd);
  if (reducedMotion) return { light: sag, hologram: t < L.hologramEnd, lift: 0, roll: 0 };
  const dipped = L.dips.some((dip) => t >= dip.at && t < dip.at + dip.length);
  const k = 1 - t / (L.shakeEnd * 1.27);
  return {
    light: dipped ? L.dipLevel * sag : sag,
    hologram: !dipped && t < L.hologramEnd,
    lift: Math.sin(t * 41) * L.shake * k + Math.sin(t * 17) * L.shake * 0.4,
    roll: Math.sin(t * 29 + 1) * L.roll * k,
  };
}
