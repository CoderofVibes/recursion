import { lossSequence } from '../../../theme/index.ts';
import { sampleLoss } from '../../../view3d/room/loss.ts';

/** Absolute trailer time, aligned with TR's existing strike/failure/alarm cues. */
export const STRIKE = 9;
export const LOCAL_STRIKE = 1.7;
export const DAMAGE_DIPS = lossSequence.dips.map((dip) => ({
  at: STRIKE + dip.at,
  length: dip.length,
  multiplier: lossSequence.dipLevel,
  level: sampleLoss(dip.at, false).light,
  after: sampleLoss(dip.at + dip.length, false).light,
}));
/** The braid holds the last light level. No new rise at the cut into it. */
export const BRAID_ROOM_LEVEL = sampleLoss(3 - LOCAL_STRIKE, false).light;
