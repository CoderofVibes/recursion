import { describe, expect, it } from 'vitest';
import { BED_ACCENTS, BED_LEAD, CUES, LATTICE_STRIKE, QUIETER, UNDER } from './cues.ts';
import { SNAPS, TOTAL, beat } from './timeline.ts';

describe("the trailer's sound", () => {
  it('plays only inside the 30 s, each cue ending after it starts', () => {
    for (const cue of CUES) {
      expect(cue.at).toBeGreaterThanOrEqual(0);
      expect(cue.at).toBeLessThan(TOTAL);
      if (cue.until !== undefined) {
        expect(cue.until).toBeGreaterThan(cue.at);
        expect(cue.until).toBeLessThanOrEqual(TOTAL);
      }
      // A loop with no end would run past the video.
      if (cue.loop) expect(cue.until).toBeDefined();
    }
  });

  it('goes dead on every snap to black: everything earlier is cut there, and nothing plays', () => {
    const next = [beat('montage-flight').start, beat('card').start];
    SNAPS.forEach((snap, i) => {
      for (const cue of CUES.filter((c) => c.at < snap)) {
        expect(cue.until, `${cue.file} at ${cue.at} s`).toBeDefined();
        // The one exception (owner): the music bed bridges the first snap into the console shots.
        if (cue.file === 'montage-bed' && i === 0) continue;
        expect(cue.until!).toBeLessThanOrEqual(snap);
      }
      const during = CUES.filter((c) => c.at >= snap && c.at < next[i]!);
      // The owner's call (2026-11-15): no black-cut either; its take read as a drum.
      expect(during.map((c) => c.file)).toEqual([]);
    });
  });

  it("sounds the alarm (the game's warning) from the strike and cuts it dead at 12.8 s", () => {
    const alarm = CUES.filter((c) => c.file === 'warning');
    expect(alarm[0]!.at).toBe(LATTICE_STRIKE);
    expect(alarm.length).toBeGreaterThanOrEqual(3);
    for (const cue of alarm) expect(cue.until).toBe(12.8);
    expect(SNAPS[0]).toBe(12.8);
  });

  it('cuts the montage bed on its accents: every scene starts on one, none falls inside a scene', () => {
    const bed = CUES.filter((c) => c.file === 'montage-bed');
    // Under every scene from the wells to the console (owner): three action scenes, eight shots,
    // one.
    expect(bed).toHaveLength(12);
    expect(bed[0]!.at).toBe(beat('wells').start);
    expect(Math.max(...bed.map((c) => c.until!))).toBe(SNAPS[1]);
    for (const cue of bed) {
      const rate = cue.rate ?? 1;
      const hit = (cue.offset ?? 0) + BED_LEAD;
      // Never across the card's snap; the first it bridges, from the braid (owner).
      expect(cue.at >= SNAPS[1]! || cue.until! <= SNAPS[1]!).toBe(true);
      if (cue.at < SNAPS[0]! && cue.until! > SNAPS[0]!) {
        expect(cue.at).toBe(beat('braid').start);
        expect(cue.until).toBe(beat('montage-flight').start);
      }
      // The next big accent in the take falls at or after this cue's cut, never just before it;
      // the one exception is the lattice's, which is placed on the strike.
      for (const accent of BED_ACCENTS.filter((a) => a > hit + 0.1)) {
        const lands = cue.at + (accent - hit) / rate;
        if (Math.abs(lands - LATTICE_STRIKE) < 1e-9) continue;
        expect(lands).toBeGreaterThanOrEqual(cue.until! - 1e-9);
      }
      // It starts on an accent, or (the lattice) on a hit that brings an accent onto the strike.
      if (!BED_ACCENTS.some((a) => Math.abs(a - hit) < 1e-9)) {
        expect(cue.at).toBe(beat('lattice').start);
        expect(cue.at + (BED_ACCENTS[3] - hit) / rate).toBeCloseTo(LATTICE_STRIKE, 9);
      }
    }
    // Consecutive: each scene's bed ends where the next begins, except across the first snap.
    for (let i = 1; i < bed.length; i++)
      if (bed[i]!.at !== beat('montage-flight').start)
        expect(bed[i]!.at).toBeCloseTo(bed[i - 1]!.until!, 9);
  });

  it('puts the effects under the bed, and leaves the title and the slingshot alone', () => {
    const at = (file: string) => CUES.filter((c) => c.file === file).map((c) => c.gain);
    expect(at('main-engine')).toEqual([0.5]);
    expect(at('warning').every((g) => g === 0.6 * UNDER)).toBe(true);
    expect(at('title-hit')).toEqual([0.7]);
    expect(at('black-cut')).toEqual([]);
    // The braid's rush leads its scene, over the bed (owner).
    expect(at('braid-rush')).toEqual([1]);
    // The owner's calls: no final hit under the card, and the wells' and the lattice's own
    // sounds a further 30% down.
    expect(at('final-hit')).toEqual([]);
    for (const file of ['well-hum', 'well-groan', 'ship-creak', 'lattice-strike', 'loss-failure'])
      expect(at(file).every((g) => g < 6 * UNDER * QUIETER + 1e-9)).toBe(true);
    expect(at('lattice-radiation')).toEqual([8 * UNDER * QUIETER]);
  });

  it("reuses the game's cues R56 names, where R56 puts them", () => {
    const at = (file: string) => CUES.filter((c) => c.file === file).map((c) => c.at);
    expect(at('main-engine')).toEqual([beat('slingshot').start]);
    expect(at('opening-rumble')).toEqual([beat('slingshot').start]);
    expect(at('well-hum')).toEqual([beat('wells').start]);
    expect(at('lattice-radiation')).toEqual([LATTICE_STRIKE]);
    expect(at('loss-failure')).toEqual([LATTICE_STRIKE]);
    expect(at('room-hum')).toEqual([beat('lattice').start, beat('console').start]);
    // The owner's two cuts (2026-11-15): the title goes out in silence, and the console with
    // Earth keeps the room's hum alone, the same cabin sound as the lattice shot.
    expect(at('home-reveal')).toEqual([]);
    expect(at('title-out')).toEqual([]);
  });
});
