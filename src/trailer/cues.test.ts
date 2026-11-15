import { describe, expect, it } from 'vitest';
import { CUES, LATTICE_STRIKE } from './cues.ts';
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

  it('goes dead on every snap to black: everything earlier is cut there, and only black-cut plays', () => {
    const next = [beat('montage-flight').start, beat('card').start];
    SNAPS.forEach((snap, i) => {
      for (const cue of CUES.filter((c) => c.at < snap)) {
        expect(cue.until, `${cue.file} at ${cue.at} s`).toBeDefined();
        expect(cue.until!).toBeLessThanOrEqual(snap);
      }
      const during = CUES.filter((c) => c.at >= snap && c.at < next[i]!);
      expect(during.map((c) => c.file)).toEqual(['black-cut']);
    });
  });

  it("sounds the alarm (the game's warning) from the strike and cuts it dead at 12.8 s", () => {
    const alarm = CUES.filter((c) => c.file === 'warning');
    expect(alarm[0]!.at).toBe(LATTICE_STRIKE);
    expect(alarm.length).toBeGreaterThanOrEqual(3);
    for (const cue of alarm) expect(cue.until).toBe(12.8);
    expect(SNAPS[0]).toBe(12.8);
  });

  it("reuses the game's cues R56 names, where R56 puts them", () => {
    const at = (file: string) => CUES.filter((c) => c.file === file).map((c) => c.at);
    expect(at('main-engine')).toEqual([beat('slingshot').start]);
    expect(at('opening-rumble')).toEqual([beat('slingshot').start]);
    expect(at('well-hum')).toEqual([beat('wells').start]);
    expect(at('lattice-radiation')).toEqual([LATTICE_STRIKE]);
    expect(at('loss-failure')).toEqual([LATTICE_STRIKE]);
    expect(at('black-cut')).toEqual([...SNAPS]);
    expect(at('room-hum')).toEqual([beat('console').start]);
    expect(at('home-reveal')).toEqual([beat('console').start]);
  });
});
