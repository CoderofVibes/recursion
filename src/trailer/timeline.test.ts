import { describe, expect, it } from 'vitest';
import {
  BEATS,
  BRAID_DIPS,
  MONTAGE,
  TITLE_DIPS,
  TOTAL,
  beat,
  beatAt,
  levelAt,
} from './timeline.ts';

/** The owner's sheet (docs/submission/video.md, docs/trailer/beats.md): each beat's start. */
const SHEET: readonly [string, number][] = [
  ['open', 0],
  ['title', 0.5],
  ['after-title', 2.0],
  ['slingshot', 2.3],
  ['wells', 4.8],
  ['lattice', 7.3],
  ['braid', 10.3],
  ['snap', 12.8],
  ['montage-flight', 13.1],
  ['console', 23.9],
  ['before-card', 26.2],
  ['card', 26.5],
];

describe("the trailer's timeline", () => {
  it('runs exactly 30.0 s, beat after beat with no gap', () => {
    expect(BEATS[0]!.start).toBe(0);
    for (let i = 1; i < BEATS.length; i++) {
      const prev = BEATS[i - 1]!;
      expect(BEATS[i]!.start).toBeCloseTo(prev.start + prev.length, 9);
    }
    const last = BEATS.at(-1)!;
    expect(last.start + last.length).toBeCloseTo(TOTAL, 9);
  });

  it("puts every beat where the owner's sheet does", () => {
    for (const [id, start] of SHEET) expect(beat(id).start).toBe(start);
  });

  it('holds eight montage screens of 1.35 s, each with its caption, FLIGHT first', () => {
    const shots = BEATS.filter((b) => b.scene === 'montage');
    expect(shots.map((b) => b.shot)).toEqual(MONTAGE.map((m) => m.shot));
    expect(shots).toHaveLength(8);
    for (const shot of shots) {
      expect(shot.length).toBe(1.35);
      expect(shot.caption).toBeTruthy();
    }
    expect(shots[0]!.caption).toBe('Engineer your way home.');
    expect(beat('montage-ship').start + 1.35).toBeCloseTo(beat('console').start, 9);
  });

  it('cuts hard: black on the snaps, a shot right after, no black between montage and console', () => {
    expect(levelAt(12.79)).toBeGreaterThan(0);
    expect(levelAt(12.8)).toBe(0);
    expect(levelAt(13.1)).toBe(1);
    expect(levelAt(beat('console').start - 0.001)).toBe(1);
    expect(levelAt(beat('console').start)).toBe(1);
    expect(levelAt(-0.1)).toBe(0);
    expect(levelAt(TOTAL)).toBe(0);
    expect(beatAt(TOTAL)).toBeNull();
  });

  it('flickers the braid before the snap, and its dips are over before the snap', () => {
    const braid = beat('braid');
    for (const dip of BRAID_DIPS) {
      expect(dip.at).toBeGreaterThan(braid.start);
      expect(dip.at + dip.length).toBeLessThan(braid.start + braid.length);
    }
    for (const dip of TITLE_DIPS) {
      expect(dip.at + dip.length).toBeLessThan(beat('title').start + beat('title').length);
    }
  });
});

/**
 * Photosensitivity (R43, WCAG 2.3.1), counted as the game's loss test counts it
 * (`src/view3d/room/loss.test.ts`): a flash is a pair of opposing changes in brightness of a
 * tenth of full or more; falls and rises are each held to three in any second, which is
 * stricter than counting pairs. The whole frame's level covers the title, the snaps, the black
 * beats and the braid. Cuts between two bright shots aren't modelled here; the rehearsal capture
 * checks them.
 */
describe("the trailer's flashes", () => {
  const FLASH = 0.1;

  interface Swing {
    readonly at: number;
    readonly dir: 1 | -1;
  }

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

  const busiestSecond = (at: readonly number[]): number =>
    Math.max(0, ...at.map((from) => at.filter((t) => t >= from && t <= from + 1).length));

  const frames = (fps: number, phase: number): number[] =>
    Array.from(
      { length: Math.floor((TOTAL + 0.5) * fps - phase) },
      (_, i) => (i + phase) / fps - 0.25,
    );

  it('holds at most three falls and three rises in any second, at any frame rate', () => {
    const cases = [
      frames(1000, 0),
      ...[24, 30, 60, 144, 165].flatMap((fps) => [0, 0.37, 0.81].map((p) => frames(fps, p))),
    ];
    for (const times of cases) {
      const s = swings(
        times,
        times.map((t) => levelAt(t)),
      );
      expect(busiestSecond(s.filter((x) => x.dir < 0).map((x) => x.at))).toBeLessThanOrEqual(3);
      expect(busiestSecond(s.filter((x) => x.dir > 0).map((x) => x.at))).toBeLessThanOrEqual(3);
    }
  });

  it('does flicker: the title and the braid each dip three times', () => {
    const fine = frames(1000, 0);
    const falls = swings(
      fine,
      fine.map((t) => levelAt(t)),
    )
      .filter((x) => x.dir < 0)
      .map((x) => x.at);
    const inside = (from: number, to: number) => falls.filter((t) => t >= from && t < to).length;
    expect(inside(0.5, 2.0)).toBe(3);
    expect(inside(10.3, 12.8)).toBe(3);
  });
});
