/**
 * Composition root: picks the encounter and plugs the believed-side services into the loop.
 * This is the one place the app touches truth-side code; everything on screen goes through
 * `GameControls` (src/game/belief/controls.ts).
 *
 * - Predictive model: 2C's client (a Web Worker in the browser) behind `createModelBridge`.
 * - Black Box: 2C's recorder and archive, saved to IndexedDB (one slot per encounter build).
 * - On start a saved archive is restored and the model is rebuilt from it (P8).
 */

import { createBlackBoxStore } from '../blackbox/index.ts';
import {
  createGravityRange,
  ENCOUNTER_ID,
  LAW,
  SAVE_FORMAT,
  SEED,
} from '../content/gravity-range/index.ts';
import { createBlackBox } from '../game/belief/blackbox.ts';
import type { GameControls } from '../game/belief/controls.ts';
import { createModelBridge } from '../game/belief/model-bridge.ts';
import { createGameSession } from '../game/session.ts';
import { createModelClient } from '../model/index.ts';

export interface Game {
  readonly controls: GameControls;
  /** The last failed model call, if any. */
  modelError(): string | undefined;
  /** Delete every saved record of this encounter. Reload afterwards. */
  erase(): Promise<void>;
}

export async function createGame(): Promise<Game> {
  const setup = createGravityRange();
  // Records made by a different build of the encounter are not this world's evidence.
  const store = createBlackBoxStore(`recursion-${ENCOUNTER_ID}-${SEED}-${SAVE_FORMAT}`);
  const saved = await store.load().catch(() => undefined);
  const blackBox = createBlackBox({ ...(saved ? { archive: saved.archive } : {}), store });
  const archive = blackBox.archive();

  const model = createModelBridge(createModelClient(), {
    // The P4 reference radius is the convention the believed law shares with the briefing's
    // GM values; it is not something the model has to discover.
    referenceRadius: LAW.referenceRadius,
    restored: { attempts: archive.attempts, extensions: saved?.extensions ?? [] },
    onExtensions: (extensions) => {
      void store
        .putMeta({
          adoptedExtensions: extensions
            .filter((e) => e.state.status === 'adopted')
            .map((e) => e.state.id),
          leads: archive.leads,
          extensions,
        })
        .catch(() => undefined);
    },
  });
  const controls = createGameSession(setup, { model, blackBox, rules: model.rules });
  return { controls, modelError: model.lastError, erase: () => store.clear() };
}
