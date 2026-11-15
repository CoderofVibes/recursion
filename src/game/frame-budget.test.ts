/**
 * A20: at high warp with nobody flying by hand, the simulation takes a bigger slice of each
 * frame, and every result stays identical (P2). Proved on 2G's command tape (command-tape.ts),
 * flown through the whole session as a committed plan: tick by tick, in ordinary 10 ms slices,
 * and in 200 ms coasting slices. The truth state and everything Black Box recorded must match
 * exactly, to the bit.
 */

import { describe, expect, it } from 'vitest';
import { createGravityRange, LAW } from '../content/gravity-range/index.ts';
import { HANDS_ON_NEUTRAL } from '../contracts/index.ts';
import { createBlackBox } from './belief/blackbox.ts';
import { createStandInModel } from './belief/standin-model.ts';
import { COMMAND_TAPE, TAPE_TICKS, tapeSetup, type TapeVariant } from './command-tape.ts';
import { createGameSession } from './session.ts';

/** JSON that keeps −0, NaN and ±Infinity apart from 0 and null. */
const exact = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    typeof v === 'number' && (Object.is(v, -0) || !Number.isFinite(v))
      ? `#${String(v === 0 ? '-0' : v)}`
      : v,
  );

type Slicing = 'ticks' | 'ordinary' | 'coasting';

async function fly(variant: TapeVariant, slicing: Slicing, ticks: number) {
  const setup = tapeSetup(createGravityRange(), variant);
  // The frame clock: each reading costs a millisecond, so a 10 ms slice ends after about 88
  // ticks and a 200 ms one after about 1,600, whatever the machine.
  let ms = 0;
  const blackBox = createBlackBox();
  const session = createGameSession(setup, {
    model: createStandInModel({ referenceRadius: LAW.referenceRadius }),
    blackBox,
    now: () => 'now',
    clock: () => (ms += 1),
  });
  const dt = setup.definition.dt;
  await session.commit({
    name: 'command tape',
    items: COMMAND_TAPE.filter((e) => e.at < ticks).map((e) => ({
      at: e.at * dt,
      command: e.command,
    })),
  });
  const perFrame: number[] = [];
  let coastingSeen = false;
  if (slicing === 'ticks') session.stepTicks(ticks);
  else {
    session.setPaused(false);
    if (slicing === 'coasting') session.setFrameBudget({ coastingMs: 200 });
    while (
      session.status().t < (ticks - 2000) * dt &&
      session.status().outcome.kind === 'in-progress'
    ) {
      // Back to top warp after any alert dropped it (A12).
      session.setWarp(2000);
      coastingSeen ||= session.status().coasting;
      perFrame.push(session.advance(1));
    }
    session.stepTicks(ticks - Math.round(session.status().t / dt));
  }
  return {
    truth: exact(session.truth()),
    records: exact(blackBox.archive()),
    t: session.status().t,
    perFrame,
    coastingSeen,
  };
}

describe('frame budget (A20)', () => {
  it('coasting is high warp with nobody flying by hand; it takes the coasting slice', () => {
    const session = createGameSession(createGravityRange(), {
      model: createStandInModel({ referenceRadius: LAW.referenceRadius }),
      blackBox: createBlackBox(),
      now: () => 'now',
    });
    // A20's approved defaults: 10 ms ordinarily, 14 ms while coasting.
    session.setPaused(false);
    session.setWarp(1000);
    expect(session.status()).toMatchObject({ coasting: true, frameBudget: 14 });
    session.setPaused(true);
    session.setWarp(1);
    expect(session.setFrameBudget({ coastingMs: 80 })).toEqual({
      ms: 10,
      coastingMs: 80,
      coastingFrom: 300,
    });
    // Waiting at arrival is not coasting.
    expect(session.status()).toMatchObject({ coasting: false, frameBudget: 10 });
    session.setPaused(false);
    session.setWarp(60);
    expect(session.status()).toMatchObject({ coasting: false, frameBudget: 10 });
    session.setWarp(1000);
    expect(session.status()).toMatchObject({ coasting: true, frameBudget: 80 });
    // Somebody takes the controls: the ordinary slice, so the ship answers every frame.
    session.fly({ ...HANDS_ON_NEUTRAL, yaw: 0.5 });
    expect(session.status()).toMatchObject({ coasting: false, frameBudget: 10 });
    session.fly(HANDS_ON_NEUTRAL);
    expect(session.status().coasting).toBe(true);
    // Clamped to 1–1,000 ms.
    expect(session.setFrameBudget({ ms: 0, coastingMs: 1e6 })).toMatchObject({
      ms: 1,
      coastingMs: 1000,
    });
  });

  it.each(['nominal', 'worn'] as const)(
    'the %s command tape gives identical results however the frames slice it',
    { timeout: 300_000 },
    async (variant) => {
      const ticks = await fly(variant, 'ticks', TAPE_TICKS);
      const ordinary = await fly(variant, 'ordinary', TAPE_TICKS);
      const coasting = await fly(variant, 'coasting', TAPE_TICKS);
      expect(ticks.t).toBe(TAPE_TICKS);
      expect(ordinary.t).toBe(TAPE_TICKS);
      expect(coasting.t).toBe(TAPE_TICKS);
      expect(ordinary.truth).toBe(ticks.truth);
      expect(coasting.truth).toBe(ticks.truth);
      expect(ordinary.records).toBe(ticks.records);
      expect(coasting.records).toBe(ticks.records);
      // And the coasting slices really were bigger.
      expect(coasting.coastingSeen).toBe(true);
      const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
      expect(mean(coasting.perFrame)).toBeGreaterThan(5 * mean(ordinary.perFrame));
    },
  );
});
