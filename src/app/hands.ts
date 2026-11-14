/**
 * Flying by hand (DECISIONS A8, A11; P6: the model forecasts, the player flies).
 *
 * The seam for hands-on control belongs to thread 2G, which defines the per-frame input the
 * shell sends the game (translation on three axes, yaw and pitch rates with roll held, main
 * engine throttle). Until that lands, this adapter flies with what `GameControls.command`
 * already offers: the main engine as a held burn, and yaw as a commanded turn rate. The other
 * axes are named here so the keys and the hologram's marks are ready; they report as not yet
 * available. When 2G's seam merges, `HandsOn.update` forwards `HandsOnInput` to it instead.
 *
 * Keys: W main engine (Shift: quarter throttle) · Q / E yaw · S retro · A / D lateral ·
 * R / F vertical · ↑ / ↓ pitch · X cut everything.
 */
import type { GameControls } from '../game/belief/controls.ts';
import { motion } from '../theme/index.ts';
import { turnRates } from '../view3d/adapter.ts';

/** The input the shell sends each frame. Proposed to 2G as the hands-on seam's shape. */
export interface HandsOnInput {
  /** Translation in the body frame, each -1 to 1: forward, left, up. */
  readonly translate: { readonly x: number; readonly y: number; readonly z: number };
  /** Turn rates as fractions of the hands-on rate, -1 to 1. Roll is held. */
  readonly yaw: number;
  readonly pitch: number;
  /** Main engine throttle, 0 to 1. */
  readonly throttle: number;
}

export const IDLE: HandsOnInput = { translate: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, throttle: 0 };

/** Which controls work today. The rest wait for 2G's seam. */
export const AVAILABLE = { throttle: true, yaw: true, pitch: false, translate: false } as const;

/** [ASSUMED] play values. */
const YAW_RATE = 0.03; // rad/s commanded while Q or E is held
const HELD_BURN = 3600; // s: a held burn is commanded long and cut off on release
const SETTLE_RATE = 0.002; // rad/s: below this the turn is over and the attitude is let go
const SETTLE_LIMIT = 90; // sim s after which the attitude is let go regardless
const SETTLE_TICKS = 2; // sim s for a cutoff to reach the ship and be recorded

export interface HandsOn {
  /**
   * Read the keys and command the ship. `active` is false outside the flight view (the hands
   * are off). Returns what the hands are doing now and whether they just came off the controls
   * long enough ago for a coasting forecast.
   */
  update(keys: ReadonlySet<string>, active: boolean, realDt: number): {
    readonly input: HandsOnInput;
    readonly coast: boolean;
  };
  /** Hands off, engine off: used when leaving the flight view or ending an attempt. */
  release(): void;
}

export function createHandsOn(game: GameControls): HandsOn {
  let throttle = 0;
  let yaw = 0;
  /** Sim time the turn was released, while the controller is still stopping it. */
  let settling: number | undefined;
  let sinceInput: number | undefined;
  /** Sim time the hands came off. */
  let releasedAt: number | undefined;

  const apply = (input: HandsOnInput): void => {
    if (input.throttle !== throttle) {
      throttle = input.throttle;
      if (throttle > 0)
        game.command({ kind: 'burn', thruster: 'main-engine', throttle, duration: HELD_BURN });
      else game.command({ kind: 'cutoff', thruster: 'main-engine' });
    }
    if (input.yaw !== yaw) {
      yaw = input.yaw;
      game.command({ kind: 'attitude', target: { reference: 'rate', rate: yaw * YAW_RATE } });
      settling = yaw === 0 ? game.status().t : undefined;
    }
  };

  return {
    update(keys, active, realDt) {
      const has = (k: string): number => (active && keys.has(k) ? 1 : 0);
      const input: HandsOnInput = {
        translate: {
          x: -has('s'),
          y: has('a') - has('d'),
          z: has('r') - has('f'),
        },
        yaw: has('q') - has('e'),
        pitch: has('arrowup') - has('arrowdown'),
        throttle: has('w') ? (keys.has('shift') ? 0.25 : 1) : 0,
      };
      if (active && keys.has('x')) {
        game.command({ kind: 'cutoff', thruster: 'all' });
        throttle = 0;
        yaw = 0;
        settling = undefined;
      }
      const busy = input.throttle > 0 || input.yaw !== 0;
      if (busy) {
        // Hands on: real time, so a burn lasts as long as the key is held.
        const status = game.status();
        if (status.warp !== 1) game.setWarp(1);
        if (status.paused) game.setPaused(false);
      }
      apply(input);

      // Once the turn has stopped, let the attitude go: holding it costs RCS propellant.
      if (settling !== undefined) {
        const now = game.status().t;
        const rate = Math.abs(turnRates(game.snapshot().world.ship.angularRate).yaw);
        if ((now - settling > 2 && rate < SETTLE_RATE) || now - settling > SETTLE_LIMIT) {
          game.command({ kind: 'attitude', target: { reference: 'free' } });
          settling = undefined;
        }
      }

      // Hands just off the controls: time for a coasting forecast. It waits for the cutoff to
      // reach the ship (a tick or two), so the forecast is of the burn that was actually flown.
      let coast = false;
      if (busy) {
        sinceInput = 0;
        releasedAt = undefined;
      } else if (sinceInput !== undefined) {
        const now = game.status().t;
        releasedAt ??= now;
        sinceInput += realDt;
        if (sinceInput * 1000 >= motion.coastForecastDelay && now >= releasedAt + SETTLE_TICKS) {
          coast = true;
          sinceInput = undefined;
          releasedAt = undefined;
        }
      }
      return { input, coast };
    },
    release() {
      if (throttle > 0) game.command({ kind: 'cutoff', thruster: 'main-engine' });
      if (yaw !== 0) game.command({ kind: 'attitude', target: { reference: 'free' } });
      throttle = 0;
      yaw = 0;
      settling = undefined;
      sinceInput = undefined;
      releasedAt = undefined;
    },
  };
}
