/**
 * Composition root: picks the encounter and plugs the believed-side services into the loop.
 * This is the one place the app touches truth-side code; everything on screen goes through
 * `GameControls` (src/game/belief/controls.ts).
 */

import { createGravityRange, LAW } from '../content/gravity-range/index.ts';
import type { GameControls } from '../game/belief/controls.ts';
import { createStandInBlackBox } from '../game/belief/standin-blackbox.ts';
import { createStandInModel } from '../game/belief/standin-model.ts';
import { createGameSession } from '../game/session.ts';

export function createGame(): GameControls {
  const setup = createGravityRange();
  // SEAM (2C): replace the two stand-ins with adapters over src/model and src/blackbox.
  // The reference radius is the P4 convention the believed law shares with the briefing's GM
  // values; it is not something the model has to discover.
  const model = createStandInModel({ referenceRadius: LAW.referenceRadius });
  const blackBox = createStandInBlackBox();
  return createGameSession(setup, { model, blackBox });
}
