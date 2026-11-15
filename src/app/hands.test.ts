/**
 * Flying by hand: the flight keys become the controls' state and go to the game through `fly`.
 */
import { describe, expect, it } from 'vitest';
import { HANDS_ON_NEUTRAL } from '../contracts/index.ts';
import type { Command, HandsOnInput } from '../contracts/index.ts';
import type { GameControls } from '../game/belief/controls.ts';
import { createHandsOn } from './hands.ts';

/** A game that records what it is told. */
function fakeGame() {
  const flown: HandsOnInput[] = [];
  const commands: Command[] = [];
  const state = { t: 0, warp: 1000, paused: true };
  const game = {
    fly: (input: HandsOnInput) => void flown.push(input),
    command: (c: Command) => void commands.push(c),
    status: () => ({ t: state.t, warp: state.warp, paused: state.paused }),
    setWarp: (w: number) => void (state.warp = w),
    setPaused: (p: boolean) => void (state.paused = p),
  } as unknown as GameControls;
  return { game, flown, commands, state };
}

const keys = (...held: string[]): ReadonlySet<string> => new Set(held);

describe('hands-on flight', () => {
  it('sends the main engine while W is held and releases the controls after', () => {
    const { game, flown } = fakeGame();
    const hands = createHandsOn(game);
    hands.update(keys('w'), true, 0.016);
    expect(flown.at(-1)).toMatchObject({ throttle: 1, yaw: 0, pitch: 0 });
    hands.update(keys(), true, 0.016);
    expect(flown.at(-1)).toEqual(HANDS_ON_NEUTRAL);
    // Nothing more is sent while the hands stay off.
    const sent = flown.length;
    hands.update(keys(), true, 0.016);
    expect(flown).toHaveLength(sent);
  });

  it('brings the clock to real time when the hands go on, and never starts or pauses it', () => {
    const { game, state } = fakeGame();
    createHandsOn(game).update(keys('w'), true, 0.016);
    expect(state.warp).toBe(1);
    // Entering the encounter is the player's own act (A12); the hands do not do it.
    expect(state.paused).toBe(true);
  });

  it('gives a quarter throttle with Shift', () => {
    const { game, flown } = fakeGame();
    createHandsOn(game).update(keys('w', 'shift'), true, 0.016);
    expect(flown.at(-1)?.throttle).toBe(0.25);
  });

  it('ignores the keys outside the flight view', () => {
    const { game, flown } = fakeGame();
    const out = createHandsOn(game).update(keys('w', 'q'), false, 0.016);
    expect(flown).toHaveLength(0);
    expect(out.input.throttle).toBe(0);
  });

  it('maps the keys to the body axes: forward, left and up are positive', () => {
    const { game, flown } = fakeGame();
    const hands = createHandsOn(game);
    hands.update(keys('a', 'r', 'arrowup', 'q'), true, 0.016);
    expect(flown.at(-1)).toEqual({ translate: { x: 0, y: 1, z: 1 }, yaw: 1, pitch: 1, throttle: 0 });
    hands.update(keys('s', 'd', 'f', 'arrowdown', 'e'), true, 0.016);
    expect(flown.at(-1)).toEqual({
      translate: { x: -1, y: -1, z: -1 },
      yaw: -1,
      pitch: -1,
      throttle: 0,
    });
  });

  it('leaves the coasting forecast to the game', () => {
    const { game } = fakeGame();
    const hands = createHandsOn(game);
    hands.update(keys('w'), true, 0.5);
    expect(hands.update(keys(), true, 0.5).coast).toBe(false);
  });

  it('cuts everything on X', () => {
    const { game, commands } = fakeGame();
    createHandsOn(game).update(keys('x'), true, 0.016);
    expect(commands).toEqual([{ kind: 'cutoff', thruster: 'all' }]);
  });

  it('releases the controls when the player leaves the flight view', () => {
    const { game, flown } = fakeGame();
    const hands = createHandsOn(game);
    hands.update(keys('w', 'q'), true, 0.016);
    hands.release();
    expect(flown.at(-1)).toEqual(HANDS_ON_NEUTRAL);
  });
});
