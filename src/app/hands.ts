/**
 * Flying by hand (DECISIONS A8, A11; P6: the model forecasts, the player flies).
 *
 * The flight keys become the state of the player's controls, `HandsOnInput`, and go to the game
 * through `GameControls.fly`: translation on three axes, yaw and pitch with roll held, and the
 * main engine. The game flies that input until the next one, and when the controls are released
 * it issues the coasting forecast itself, frozen and recorded (P10).
 *
 * Keys: W main engine (Shift: quarter throttle) · S retro · A / D lateral · R / F vertical ·
 * Q / E yaw · ↑ / ↓ pitch · X cut everything.
 */
import { HANDS_ON_NEUTRAL, isHandsOnNeutral } from '../contracts/index.ts';
import type { HandsOnInput } from '../contracts/index.ts';
import type { GameControls } from '../game/belief/controls.ts';

export type { HandsOnInput };

/** Which controls the ship answers to. */
export const AVAILABLE = { throttle: true, yaw: true, pitch: true, translate: true } as const;

export interface HandsOn {
  /**
   * Read the keys and fly. `active` is false outside the flight view (the hands are off).
   * Returns what the hands are doing now. `coast` is always false: the game issues the coasting
   * forecast when the controls are released.
   */
  update(keys: ReadonlySet<string>, active: boolean, realDt: number): {
    readonly input: HandsOnInput;
    readonly coast: boolean;
  };
  /** Hands off: used when leaving the flight view or ending an attempt. */
  release(): void;
}

export function createHandsOn(game: GameControls): HandsOn {
  let flying = false;

  return {
    update(keys, active) {
      const has = (k: string): number => (active && keys.has(k) ? 1 : 0);
      const input: HandsOnInput = {
        translate: {
          x: 0 - has('s'),
          y: has('a') - has('d'),
          z: has('r') - has('f'),
        },
        yaw: has('q') - has('e'),
        pitch: has('arrowup') - has('arrowdown'),
        throttle: has('w') ? (keys.has('shift') ? 0.25 : 1) : 0,
      };
      if (active && keys.has('x')) game.command({ kind: 'cutoff', thruster: 'all' });
      const busy = !isHandsOnNeutral(input);
      // Hands on: real time, so a burn lasts as long as the key is held.
      if (busy && game.status().warp !== 1) game.setWarp(1);
      // The game ignores an input equal to the last one, so this is cheap to call every frame.
      if (busy || flying) game.fly(busy ? input : HANDS_ON_NEUTRAL);
      flying = busy;
      return { input, coast: false };
    },
    release() {
      if (flying) game.fly(HANDS_ON_NEUTRAL);
      flying = false;
    },
  };
}
