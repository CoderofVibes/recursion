/**
 * Sound on or off: the player's choice, kept in this browser, for the audio module (AU, ledger
 * R24) to follow. The control room shows the switch and answers the `M` key; the audio module
 * reads `soundMuted()` and listens with `onSoundMuted`. Off until the player has touched the
 * page is the browser's rule, not this one: this only says whether sound is wanted.
 *
 * The switch is shown only when the game has sound to switch (`soundAvailable`): a build with
 * no audio module, or one whose module reports no sound, shows no switch and `M` does nothing.
 */
const KEY = 'recursion.muted';

let muted = read();
const listeners = new Set<(muted: boolean) => void>();

function read(): boolean {
  try {
    return globalThis.localStorage?.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * The audio module, if this build has one (AU's `src/audio/index.ts`, ledger R24). It is looked
 * for rather than imported, so the control room builds and runs the same before the module lands
 * and after: no module, no sound.
 */
const audio = Object.values(
  import.meta.glob<{ readonly soundAvailable?: () => boolean }>('../audio/index.ts', {
    eager: true,
  }),
)[0];

/**
 * Whether the game has sound to turn on or off: the audio module is in the build and says its
 * sound can play here. While it is false the switch is hidden and the `M` key is left alone.
 */
export function soundAvailable(module: typeof audio = audio): boolean {
  try {
    return module?.soundAvailable?.() === true;
  } catch {
    return false;
  }
}

/** Whether the player has turned sound off. */
export function soundMuted(): boolean {
  return muted;
}

export function setSoundMuted(on: boolean): void {
  if (on === muted) return;
  muted = on;
  try {
    globalThis.localStorage?.setItem(KEY, on ? '1' : '0');
  } catch {
    // Storage unavailable: the choice holds for this visit.
  }
  for (const l of listeners) l(on);
}

/** Hear when sound is turned off or on. Returns unsubscribe. */
export function onSoundMuted(listener: (muted: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
