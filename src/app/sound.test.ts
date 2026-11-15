/** Sound on or off (AU, R24): a choice the audio module follows. */
import { describe, expect, it } from 'vitest';
import { onSoundMuted, setSoundMuted, soundMuted } from './sound.ts';

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
