import { sources } from './catalogue.ts';

const VOLUME_KEY = 'recursion.volume';
const DEFAULT_VOLUME = 0.65;
const listeners = new Set<() => void>();

const clamp = (volume: number): number => Math.min(1, Math.max(0, volume));

function readVolume(): number {
  try {
    const saved = globalThis.localStorage?.getItem(VOLUME_KEY);
    if (saved && Number.isFinite(Number(saved))) return clamp(Number(saved));
  } catch {
    // The default is still usable when storage is disabled.
  }
  return DEFAULT_VOLUME;
}

let volume = readVolume();

/** Whether the build contains a known MP3 and the browser supports Web Audio. */
export function soundAvailable(): boolean {
  return sources.size > 0 && typeof AudioContext === 'function';
}

export function soundVolume(): number {
  return volume;
}

/** Set the master level from 0 to 1. The in-game M shortcut controls mute independently. */
export function setSoundVolume(value: number): void {
  if (!Number.isFinite(value)) return;
  const next = clamp(value);
  if (next === volume) return;
  volume = next;
  try {
    globalThis.localStorage?.setItem(VOLUME_KEY, String(volume));
  } catch {
    // Keep this visit's level in memory.
  }
  for (const listener of listeners) listener();
}

export function onSoundVolume(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
