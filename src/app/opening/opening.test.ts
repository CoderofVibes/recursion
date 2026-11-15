import { describe, expect, it } from 'vitest';
import { appOpening, BROWSER_SLOT, claimOpening, openingLaunch, resetOpening } from './launch.ts';
import {
  ALARM_DURATION,
  DARK_AFTER_TITLE,
  EARTH_BEARING,
  ALARM_STARTS,
  OPENING_END,
  openingCues,
  sampleOpening,
  TITLE_FLICKERS,
  TITLE_OUT,
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
    expect(reduced.every((f) => [...f.translation, ...f.rotation].every((v) => v === 0))).toBe(
      true,
    );
    // A fully still sky (R44): no anomaly bends or darkens anything in the window.
    expect(reduced.every((f) => f.lens === null)).toBe(true);
    expect(samples.every((t) => sampleOpening(t, false).lens !== null)).toBe(true);
    expect(reduced.filter((f) => f.beat === 'wake').every((f) => f.wake === 1)).toBe(true);
    expect(sampleOpening(8.1, true).alarm).toBe(1);
    expect(sampleOpening(10.6, true).alarm).toBe(0);
    // The alarm light comes on once and goes off once: steady, never a pulse.
    const lamp = reduced.map((f) => f.alarm);
    expect(lamp.filter((v, i) => i > 0 && v !== lamp[i - 1]!)).toHaveLength(2);
  });

  it('fades plainly to black in reduced motion, where full motion cuts (R44)', () => {
    const cue = (id: string) => openingCues(0, OPENING_END).find((c) => c.id === id)!.at;
    const failure = cue('loss-failure');
    const title = cue('opening-title');
    const before = samples.filter((t) => t < title);
    const curtain = before.map((t) => sampleOpening(t, true).blackout);
    // Nothing before the failure, then only ever darker, and fully black well before the title.
    expect(
      before.filter((t) => t <= failure).every((t) => sampleOpening(t, true).blackout === 0),
    ).toBe(true);
    expect(curtain.every((v, i) => i === 0 || v >= curtain[i - 1]!)).toBe(true);
    const black = before.find((t) => sampleOpening(t, true).blackout === 1)!;
    expect(black - failure).toBeGreaterThan(1);
    expect(title - black).toBeGreaterThanOrEqual(1);
    // A fade, not a cut: no step between samples (10 ms apart) is larger than a twentieth.
    expect(curtain.every((v, i) => i === 0 || v - curtain[i - 1]! < 0.05)).toBe(true);
    // Full motion keeps its cut: clear until the dark has the window, then black at once.
    const full = before.map((t) => sampleOpening(t, false).blackout);
    expect(new Set(full)).toEqual(new Set([0, 1]));
  });

  it('shows the anomaly by what it does: stars, the console, then the dark, never Earth', () => {
    const ms = Array.from({ length: Math.ceil(OPENING_END * 1000) }, (_, i) => i / 1000);
    const cue = (id: string) => openingCues(0, OPENING_END).find((c) => c.id === id)!.at;
    const lens = (t: number) => sampleOpening(t, false).lens!;
    const offEarth = (t: number) =>
      Math.hypot(lens(t).az - EARTH_BEARING.az, lens(t).el - EARTH_BEARING.el);
    // Through the calm it bends light but its dark is under a pixel (0.086° at 720 px, 62° fov).
    const calm = ms.filter((t) => t < cue('opening-rumble'));
    expect(calm.every((t) => lens(t).einstein > 0 && lens(t).shadow < 0.05)).toBe(true);
    expect(lens(0).az).toBeLessThan(-10);
    // It drifts without jumping.
    for (let i = 1; i < ms.length; i++) {
      const a = lens(ms[i - 1]!);
      const b = lens(ms[i]!);
      expect(Math.abs(b.az - a.az)).toBeLessThan(0.02);
    }
    // Earth is never doubled or ringed (owner): the lens stays 10° off and moves Earth's light
    // by under 0.2° (a point lens shifts light at angle a by einstein² / a).
    const shown = ms.filter((t) => t < cue('black-cut'));
    expect(shown.every((t) => offEarth(t) > 10)).toBe(true);
    expect(shown.every((t) => lens(t).einstein ** 2 / offEarth(t) < 0.2)).toBe(true);
    // Its own dark shows by the failure, then fills the window (150° wide) before the cut.
    expect(lens(cue('loss-failure')).shadow).toBeGreaterThan(0.25);
    expect(lens(cue('black-cut')).shadow).toBeGreaterThan(75);
    // The console's measured track leaves the forecast during the calm and keeps going.
    const drift = shown.map((t) => sampleOpening(t, false).drift);
    expect(drift.every((v, i) => i === 0 || v >= drift[i - 1]!)).toBe(true);
    expect(sampleOpening(cue('opening-rumble'), false).drift).toBeGreaterThan(0.3);
    expect(sampleOpening(cue('loss-failure'), false).drift).toBe(1);
  });

  it('holds black, fades the whole title in over 1.5 s, flickers it, then holds black 2 s', () => {
    const ms = Array.from({ length: Math.ceil(OPENING_END * 1000) }, (_, i) => i / 1000);
    const cue = (id: string) => openingCues(0, OPENING_END).find((c) => c.id === id)!.at;
    const cut = cue('black-cut');
    const begins = cue('opening-title');
    const room = cue('room-wake');
    const title = ms.map((t) => sampleOpening(t, false).title);
    // A held black of at least a second between the cut and the title.
    expect(begins - cut).toBeGreaterThanOrEqual(1);
    expect(
      ms.filter((t) => t >= cut && t < begins).every((t) => sampleOpening(t, false).title === 0),
    ).toBe(true);
    // The whole word fades in, rising steadily, fully shown 1.5 s after it starts.
    const fading = ms
      .filter((t) => t >= begins && t <= begins + 1.5)
      .map((t) => sampleOpening(t, false).title);
    expect(fading.every((v, i) => i === 0 || v >= fading[i - 1]!)).toBe(true);
    expect(sampleOpening(begins + 0.75, false).title).toBeCloseTo(0.5, 2);
    const full = ms.find((t) => sampleOpening(t, false).title === 1)!;
    expect(full - begins).toBeCloseTo(1.5, 3);
    // Steady at full from then until the flicker starts.
    const steady = ms.filter((t) => t >= full && t < TITLE_FLICKERS[0].at);
    expect(steady.length).toBeGreaterThan(1000);
    expect(steady.every((t) => sampleOpening(t, false).title === 1)).toBe(true);
    // Every drop of 0.1 or more is a flash; count them in every rolling second.
    const drops: number[] = [];
    for (let i = 1; i < title.length; i++) if (title[i - 1]! - title[i]! >= 0.1) drops.push(ms[i]!);
    expect(drops.length).toBe(TITLE_FLICKERS.length + 1);
    for (const at of drops)
      expect(drops.filter((d) => d >= at && d < at + 1).length).toBeLessThanOrEqual(3);
    // Out for good, then black for 2 s before the room starts to appear.
    expect(room - TITLE_OUT).toBeCloseTo(DARK_AFTER_TITLE, 9); // to float precision
    expect(DARK_AFTER_TITLE).toBe(2);
    const after = ms.filter((t) => t >= TITLE_OUT && t < room);
    expect(after.every((t) => sampleOpening(t, false).title === 0)).toBe(true);
    expect(after.every((t) => sampleOpening(t, false).blackout === 1)).toBe(true);
    expect(sampleOpening(room + 0.5, false).blackout).toBeLessThan(1);
    // Reduced motion: the same fade, no flicker, and the title goes out at the same moment.
    const reduced = ms.filter((t) => t >= full && t < TITLE_OUT);
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

  it('opens in the room; the opening plays only when asked for, ahead of the start region', async () => {
    const start = 'gravity-range';
    // The owner's call (2026-11-15): no opening unless `?opening=replay` asks for it.
    expect(appOpening(start, start, '')).toBeNull();
    expect(appOpening(start, start, '?encounter=gravity-range')).toBeNull();
    const gate = appOpening(start, start, '?encounter=gravity-range&opening=replay')!;
    expect(gate).toEqual({ saveSlot: BROWSER_SLOT, hasProgress: false, replay: true });
    // A region opened by its own address keeps its normal entry.
    expect(appOpening('inverse-wells', start, '?encounter=inverse-wells')).toBeNull();
    expect(appOpening('chain-link', start, '?opening=replay')).toBeNull();
    // The browser's marker still works as before, for the replay's launch and Skip.
    const launch = (replay = false) => openingLaunch(gate.saveSlot, gate.hasProgress, replay);
    expect(launch()).toBe('first');
    expect(await claimOpening(gate.saveSlot, new AbortController().signal)).toBe(true);
    expect(launch()).toBe('direct');
    expect(launch(true)).toBe('replay');
    resetOpening(gate.saveSlot);
    expect(launch()).toBe('first');
  });
});
