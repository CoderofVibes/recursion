import { describe, expect, it } from 'vitest';
import { lossSequence } from '../../theme/index.ts';
import { sampleLoss } from './loss.ts';

/**
 * Photosensitivity (R43, WCAG 2.3.1): no second of the loss sequence may hold more than three
 * flashes. A flash is a pair of opposing changes in brightness of a tenth of full or more; the
 * checks below count the falls and the rises separately and hold each to three in any second,
 * which is stricter than counting pairs.
 */
// The app's TypeScript settings carry no Node types, hence the indirect import (as in the
// theme's component test).
const { readFileSync } = (await import(/* @vite-ignore */ `node:${'fs'}`)) as {
  readFileSync(path: URL, encoding: 'utf8'): string;
};

const FLASH = 0.1;
const END = lossSequence.shakeEnd + 1;

interface Swing {
  readonly at: number;
  readonly dir: 1 | -1;
}

/** Every change of `FLASH` or more away from the last extreme, with the moment it got there. */
function swings(times: readonly number[], values: readonly number[]): Swing[] {
  const out: Swing[] = [];
  let high = values[0]!;
  let low = values[0]!;
  let dir = 0;
  for (let i = 1; i < values.length; i++) {
    const v = values[i]!;
    if (dir >= 0) {
      high = Math.max(high, v);
      if (high - v >= FLASH) {
        out.push({ at: times[i]!, dir: -1 });
        dir = -1;
        low = v;
        continue;
      }
    }
    if (dir <= 0) {
      low = Math.min(low, v);
      if (v - low >= FLASH) {
        out.push({ at: times[i]!, dir: 1 });
        dir = 1;
        high = v;
      }
    }
  }
  return out;
}

/** The most events any one-second stretch holds. */
function busiestSecond(at: readonly number[]): number {
  return Math.max(0, ...at.map((from) => at.filter((t) => t >= from && t <= from + 1).length));
}

function frames(fps: number, phase: number): number[] {
  // By index, so the grid does not drift: the 1 kHz grid then has a sample on every authored edge.
  return Array.from({ length: Math.floor(END * fps - phase) }, (_, i) => (i + phase) / fps);
}

describe('the loss sequence (A8), as the eye meets it', () => {
  const fine = frames(1000, 0);

  it('holds at most three flashes of the lights in any second, at any frame rate', () => {
    const cases = [
      fine,
      ...[24, 30, 60, 144].flatMap((fps) => [0, 0.37, 0.81].map((p) => frames(fps, p))),
    ];
    for (const times of cases) {
      const light = swings(
        times,
        times.map((t) => sampleLoss(t, false).light),
      );
      const falls = light.filter((s) => s.dir < 0).map((s) => s.at);
      const rises = light.filter((s) => s.dir > 0).map((s) => s.at);
      expect(busiestSecond(falls)).toBeLessThanOrEqual(3);
      expect(busiestSecond(rises)).toBeLessThanOrEqual(3);
    }
    // It does flicker: the authored dips are there, and the cut to black is the last fall.
    const light = swings(
      fine,
      fine.map((t) => sampleLoss(t, false).light),
    );
    expect(light.filter((s) => s.dir > 0)).toHaveLength(lossSequence.dips.length);
    expect(light.filter((s) => s.dir < 0)).toHaveLength(lossSequence.dips.length + 1);
    expect(light.at(-1)).toEqual({ at: expect.closeTo(lossSequence.shakeEnd, 3), dir: -1 });
  });

  it('spaces the dips so that four never fall within a second, the cut included', () => {
    const starts = [...lossSequence.dips.map((dip) => dip.at), lossSequence.shakeEnd];
    for (let i = 0; i + 3 < starts.length; i++)
      expect(starts[i + 3]! - starts[i]!).toBeGreaterThan(1);
    // Each dip is over before the next begins, and the last before the cut.
    lossSequence.dips.forEach((dip, i) => expect(dip.at + dip.length).toBeLessThan(starts[i + 1]!));
  });

  it('blinks the hologram only with the lights, and puts it out with the last dip', () => {
    const dips = lossSequence.dips;
    const lit = fine.map((t) => sampleLoss(t, false).hologram);
    const changes = fine.filter((_, i) => i > 0 && lit[i] !== lit[i - 1]);
    // Off at each dip's start, on at each dip's end but the last: never a flash of its own.
    const expected = dips.flatMap((dip, i) =>
      i < dips.length - 1 ? [dip.at, dip.at + dip.length] : [dip.at],
    );
    expect(changes).toHaveLength(expected.length);
    changes.forEach((t, i) => expect(t).toBeCloseTo(expected[i]!, 2));
    expect(dips.at(-1)!.at).toBe(lossSequence.hologramEnd);
    expect(
      fine
        .filter((t) => t >= lossSequence.hologramEnd)
        .every((t) => !sampleLoss(t, false).hologram),
    ).toBe(true);
  });

  it('shakes while it fails, and is black and still from the cut on', () => {
    const shaking = fine.filter((t) => t < lossSequence.shakeEnd).map((t) => sampleLoss(t, false));
    expect(Math.max(...shaking.map((f) => Math.abs(f.lift)))).toBeGreaterThan(
      lossSequence.shake * 0.8,
    );
    expect(Math.max(...shaking.map((f) => Math.abs(f.roll)))).toBeGreaterThan(
      lossSequence.roll * 0.5,
    );
    expect(sampleLoss(0, false).light).toBe(1);
    for (const t of fine.filter((at) => at >= lossSequence.shakeEnd))
      expect(sampleLoss(t, false)).toEqual({ light: 0, hologram: false, lift: 0, roll: 0 });
  });

  it('neither shakes nor flickers with reduced motion', () => {
    const still = fine.map((t) => sampleLoss(t, true));
    expect(still.every((f) => f.lift === 0 && f.roll === 0)).toBe(true);
    // The lights only ever sink, and the hologram goes out once.
    expect(still.every((f, i) => i === 0 || f.light <= still[i - 1]!.light)).toBe(true);
    expect(still.filter((f, i) => i > 0 && f.hologram !== still[i - 1]!.hologram)).toHaveLength(1);
    const light = swings(
      fine,
      still.map((f) => f.light),
    );
    expect(light.filter((s) => s.dir > 0)).toHaveLength(0);
  });

  it('leaves the flicker to the lights: the overlay over the scene has no animation', () => {
    const css = readFileSync(
      new URL('../../app/control-room.css', import.meta.url),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/animation|@keyframes/);
  });
});
