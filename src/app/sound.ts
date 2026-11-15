/**
 * Sound on or off: the player's choice, kept in this browser, for the audio module (AU, ledger
 * R24) to follow. The control room shows the switch and answers the `M` key; the audio module
 * reads `soundMuted()` and listens with `onSoundMuted`. Off until the player has touched the
 * page is the browser's rule, not this one: this only says whether sound is wanted.
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
