/**
 * Flying by hand through the commands the game offers today: the main engine as a held burn and
 * yaw as a commanded rate, and the coasting forecast once the hands come off and the cutoff has
 * reached the ship.
 */
import { describe, expect, it } from 'vitest';
import type { Command } from '../contracts/index.ts';
import type { GameControls } from '../game/belief/controls.ts';
import { createHandsOn } from './hands.ts';

/** A game that records what it is told and lets the test move its clock. */
function fakeGame() {
  const commands: Command[] = [];
  const state = { t: 0, warp: 1000, paused: true, rate: 0 };
  const game = {
    command: (c: Command) => void commands.push(c),
    status: () => ({ t: state.t, warp: state.warp, paused: state.paused }),
    setWarp: (w: number) => void (state.warp = w),
    setPaused: (p: boolean) => void (state.paused = p),
    snapshot: () => ({ world: { ship: { angularRate: state.rate } } }),
  } as unknown as GameControls;
  return { game, commands, state };
}

const keys = (...held: string[]): ReadonlySet<string> => new Set(held);

describe('hands-on flight', () => {
  it('fires the main engine while W is held and cuts it off on release', () => {
    const { game, commands } = fakeGame();
    const hands = createHandsOn(game);
    hands.update(keys('w'), true, 0.016);
    hands.update(keys('w'), true, 0.016);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({ kind: 'burn', thruster: 'main-engine', throttle: 1 });
    hands.update(keys(), true, 0.016);
    expect(commands.at(-1)).toEqual({ kind: 'cutoff', thruster: 'main-engine' });
  });

  it('brings the clock to real time when the hands go on', () => {
    const { game, state } = fakeGame();
    createHandsOn(game).update(keys('w'), true, 0.016);
    expect(state.warp).toBe(1);
    expect(state.paused).toBe(false);
  });

  it('gives a quarter throttle with Shift', () => {
    const { game, commands } = fakeGame();
    createHandsOn(game).update(keys('w', 'shift'), true, 0.016);
    expect(commands[0]).toMatchObject({ kind: 'burn', throttle: 0.25 });
  });

  it('ignores the keys outside the flight view', () => {
    const { game, commands } = fakeGame();
    const out = createHandsOn(game).update(keys('w', 'q'), false, 0.016);
    expect(commands).toHaveLength(0);
    expect(out.input.throttle).toBe(0);
  });

  it('yaws at a commanded rate, stops the turn, then lets the attitude go', () => {
    const { game, commands, state } = fakeGame();
    const hands = createHandsOn(game);
    hands.update(keys('q'), true, 0.016);
    expect(commands.at(-1)).toMatchObject({ kind: 'attitude', target: { reference: 'rate' } });
    state.rate = 0.03;
    hands.update(keys(), true, 0.016);
    expect(commands.at(-1)).toEqual({ kind: 'attitude', target: { reference: 'rate', rate: 0 } });
    // Still turning: the controller keeps the attitude.
    state.t = 3;
    hands.update(keys(), true, 0.016);
    expect(commands.at(-1)).toMatchObject({ target: { reference: 'rate' } });
    // Stopped: holding an attitude costs RCS propellant, so it is released.
    state.rate = 0;
    state.t = 6;
    hands.update(keys(), true, 0.016);
    expect(commands.at(-1)).toEqual({ kind: 'attitude', target: { reference: 'free' } });
  });

  it('asks for the coasting forecast only once the cutoff has reached the ship', () => {
    const { game, state } = fakeGame();
    const hands = createHandsOn(game);
    hands.update(keys('w'), true, 0.5);
    expect(hands.update(keys(), true, 0.5).coast).toBe(false);
    // Half a second of real time has passed but the cutoff's tick has not run yet.
    expect(hands.update(keys(), true, 0.5).coast).toBe(false);
    state.t = 2;
    expect(hands.update(keys(), true, 0.016).coast).toBe(true);
    // Once only.
    expect(hands.update(keys(), true, 1).coast).toBe(false);
  });

  it('reports the axes that wait for the hands-on seam without commanding anything', () => {
    const { game, commands } = fakeGame();
    const out = createHandsOn(game).update(keys('a', 'r', 'arrowup'), true, 0.016);
    expect(out.input.translate).toEqual({ x: 0, y: 1, z: 1 });
    expect(out.input.pitch).toBe(1);
    expect(commands).toHaveLength(0);
  });

  it('releases everything when the player leaves the flight view', () => {
    const { game, commands } = fakeGame();
    const hands = createHandsOn(game);
    hands.update(keys('w', 'q'), true, 0.016);
    hands.release();
    expect(commands.slice(-2)).toEqual([
      { kind: 'cutoff', thruster: 'main-engine' },
      { kind: 'attitude', target: { reference: 'free' } },
    ]);
  });
});
