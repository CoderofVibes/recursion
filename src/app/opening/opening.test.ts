import { describe, expect, it } from 'vitest';
import { claimOpening, openingLaunch, resetOpening } from './launch.ts';
import {
  ALARM_DURATION,
  ALARM_STARTS,
  OPENING_END,
  openingCues,
  sampleOpening,
  TITLE_FLICKERS,
  TITLE_OUT,
  TITLE_WORD,
} from './sequence.ts';

describe('scripted opening', () => {
  const samples = Array.from({ length: Math.ceil(OPENING_END * 100) + 2 }, (_, i) => i / 100);

  it('goes from Earth through alarms, then puts the title between blackout and wake', () => {
    const frames = samples.map((t) => sampleOpening(t, false));
    expect([...new Set(frames.map((f) => f.beat))]).toEqual([
      'home',
      'alarm',
      'stumble',
      'impact',
      'dark',
      'title',
      'arrival',
      'wake',
      'end',
    ]);
    expect(frames.filter((f) => f.title > 0).every((f) => f.blackout === 1)).toBe(true);
    expect(frames.some((f) => f.title === 1)).toBe(true);
    expect(frames.some((f) => f.translation.some((v) => v !== 0))).toBe(true);
    expect(frames.at(-1)?.blackout).toBe(0);
  });

  it('keeps pulses at or below 3 Hz and makes the alarm steady in reduced motion', () => {
    for (const at of ALARM_STARTS) {
      const overlap = ALARM_STARTS.filter(
        (start) => start < at + ALARM_DURATION + 1 && start >= at,
      );
      expect(overlap.length).toBeLessThanOrEqual(2);
    }
    const reduced = samples.map((t) => sampleOpening(t, true));
    expect(
      reduced.every((f) => [...f.translation, ...f.rotation, f.lens].every((v) => v === 0)),
    ).toBe(true);
    expect(reduced.filter((f) => f.beat === 'wake').every((f) => f.wake === 1)).toBe(true);
    expect(sampleOpening(4.4, true).alarm).toBe(1);
    expect(sampleOpening(6.9, true).alarm).toBe(0);
  });

  it('holds black, builds the title letter by letter in 1.5 s, flickers it, then leaves black', () => {
    const ms = Array.from({ length: Math.ceil(OPENING_END * 1000) }, (_, i) => i / 1000);
    const cue = (id: string) => openingCues(0, OPENING_END).find((c) => c.id === id)!.at;
    const cut = cue('black-cut');
    const begins = cue('opening-title');
    const room = cue('room-wake');
    // A held black of at least a second between the cut and the first letter.
    expect(begins - cut).toBeGreaterThanOrEqual(1);
    expect(
      ms
        .filter((t) => t >= cut && t < begins)
        .every((t) => sampleOpening(t, false).letters.every((l) => l === 0)),
    ).toBe(true);
    // The letters come up in order, the last one fully up 1.5 s after the first starts.
    const upAt = TITLE_WORD.split('').map((_, i) =>
      ms.find((t) => sampleOpening(t, false).letters[i] === 1)!,
    );
    expect(upAt).toEqual([...upAt].sort((a, b) => a - b));
    expect(upAt.at(-1)! - begins).toBeCloseTo(1.5, 3);
    expect(upAt[0]! - begins).toBeLessThan(1.5);
    // Steady at full from the end of the build until the flicker starts.
    const steady = ms.filter((t) => t >= upAt.at(-1)! && t < TITLE_FLICKERS[0].at);
    expect(steady.length).toBeGreaterThan(1000);
    expect(steady.every((t) => sampleOpening(t, false).title === 1)).toBe(true);
    // Every drop of 0.1 or more is a flash; count them in every rolling second.
    const title = ms.map((t) => sampleOpening(t, false).title);
    const drops: number[] = [];
    for (let i = 1; i < title.length; i++) if (title[i - 1]! - title[i]! >= 0.1) drops.push(ms[i]!);
    expect(drops.length).toBe(TITLE_FLICKERS.length + 1);
    for (const at of drops)
      expect(drops.filter((d) => d >= at && d < at + 1).length).toBeLessThanOrEqual(3);
    // Out for good: black from TITLE_OUT until the room appears.
    const after = ms.filter((t) => t >= TITLE_OUT && t < room);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((t) => sampleOpening(t, false).title === 0)).toBe(true);
    expect(after.every((t) => sampleOpening(t, false).blackout === 1)).toBe(true);
    // Reduced motion: the same build, no flicker, and the title goes out at the same moment.
    const reduced = ms.filter((t) => t >= begins && t < TITLE_OUT);
    expect(reduced.every((t) => sampleOpening(t, true).title === 1)).toBe(true);
    expect(sampleOpening(TITLE_OUT, true).title).toBe(0);
  });

  it('dispatches each cue edge once at multiple frame rates', () => {
    for (const fps of [30, 60, 120]) {
      const cues = Array.from({ length: OPENING_END * fps }, (_, i) =>
        openingCues(i / fps, (i + 1) / fps),
      ).flat();
      expect(cues).toEqual(openingCues(0, OPENING_END));
    }
  });

  it('plays once per save, bypasses old progress, and permits skipping an explicit replay', async () => {
    expect(openingLaunch('new', false, true)).toBe('first');
    expect(openingLaunch('old', true, true)).toBe('direct');
    const signal = new AbortController().signal;
    expect(await claimOpening('new', signal)).toBe(true);
    expect(await claimOpening('new', signal)).toBe(false);
    expect(openingLaunch('new', false, false)).toBe('direct');
    expect(openingLaunch('new', true, false)).toBe('direct');
    expect(openingLaunch('new', true, true)).toBe('replay');
    expect(openingLaunch('other', false, false)).toBe('first');
    resetOpening('new');
    expect(openingLaunch('new', false, false)).toBe('first');
  });
});
