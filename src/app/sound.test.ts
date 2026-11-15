/** Sound on or off (AU, R24): a choice the audio module follows. */
import { describe, expect, it } from 'vitest';
import { onSoundMuted, setSoundMuted, soundAvailable, soundMuted } from './sound.ts';

describe('the sound switch', () => {
  it('turns sound off and on, telling whoever listens once per change', () => {
    const heard: boolean[] = [];
    const off = onSoundMuted((m) => heard.push(m));
    setSoundMuted(false);
    setSoundMuted(true);
    setSoundMuted(true);
    expect(soundMuted()).toBe(true);
    setSoundMuted(false);
    expect(heard).toEqual([true, false]);
    off();
    setSoundMuted(true);
    expect(heard).toEqual([true, false]);
    setSoundMuted(false);
  });
});

describe('whether there is sound to switch (A26: no switch for a silent game)', () => {
  it('is false when the build has no audio module', () => {
    expect(soundAvailable(undefined)).toBe(false);
  });

  it('follows the audio module once it is in the build', () => {
    expect(soundAvailable({ soundAvailable: () => true })).toBe(true);
    expect(soundAvailable({ soundAvailable: () => false })).toBe(false);
  });

  it('is false for a module that does not say, or that fails to', () => {
    expect(soundAvailable({})).toBe(false);
    expect(
      soundAvailable({
        soundAvailable: () => {
          throw new Error('no audio context');
        },
      }),
    ).toBe(false);
  });
});
