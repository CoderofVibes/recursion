type StorageAccess = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type OpeningLaunch = 'first' | 'replay' | 'direct';

const openedThisPage = new Set<string>();
const marker = (saveSlot: string) => `${saveSlot}:opening-seen`;

function browserStorage(): StorageAccess | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function openingLaunch(
  saveSlot: string,
  hasProgress: boolean,
  replay: boolean,
  storage = browserStorage(),
): OpeningLaunch {
  const key = marker(saveSlot);
  let seen = openedThisPage.has(key);
  try {
    seen ||= storage?.getItem(key) === '1';
  } catch {
    // The browser can deny access to storage even when the object exists.
  }
  if (seen) return replay ? 'replay' : 'direct';
  return hasProgress ? 'direct' : 'first';
}

function markOpeningSeen(saveSlot: string, storage = browserStorage()): void {
  const key = marker(saveSlot);
  openedThisPage.add(key);
  try {
    storage?.setItem(key, '1');
  } catch {
    // Remember within this page if the browser denies persistence.
  }
}

/** Serialize first-launch claims across tabs where the browser exposes Web Locks. */
export async function claimOpening(saveSlot: string, signal: AbortSignal): Promise<boolean> {
  const claim = () => {
    if (signal.aborted || openingLaunch(saveSlot, false, false) !== 'first') return false;
    markOpeningSeen(saveSlot);
    return true;
  };
  try {
    if (navigator.locks) return await navigator.locks.request(marker(saveSlot), { signal }, claim);
  } catch {
    // Unavailable storage or locks fall back to an in-page claim.
  }
  return claim();
}

export function resetOpening(saveSlot: string, storage = browserStorage()): void {
  const key = marker(saveSlot);
  openedThisPage.delete(key);
  try {
    storage?.removeItem(key);
  } catch {
    // Keep the in-page reset usable without storage.
  }
}

/**
 * The app's one marker (A25): the opening plays once per browser, not once per save or region.
 * Every region's page shares it, so a region opened from the picker never replays the opening.
 */
export const BROWSER_SLOT = 'recursion';

/**
 * What the app hands the gate for the encounter it loaded, or null where the room is entered
 * directly. The opening wakes into the region the expedition starts in (`startRegion`); a
 * region opened by its own address keeps its normal entry and leaves the marker alone. Recorded
 * progress does not bypass it: the gate is the browser's, not a save's. `?opening=replay`
 * replays an opening this browser has already seen, with Skip.
 */
export function appOpening(
  region: string,
  startRegion: string,
  search: string,
): { readonly saveSlot: string; readonly hasProgress: false; readonly replay: boolean } | null {
  if (region !== startRegion) return null;
  return {
    saveSlot: BROWSER_SLOT,
    hasProgress: false,
    replay: new URLSearchParams(search).get('opening') === 'replay',
  };
}

const MOTION_PREFERENCE = 'recursion:opening-reduced-motion';

export function readMotionPreference(): boolean | undefined {
  try {
    const saved = browserStorage()?.getItem(MOTION_PREFERENCE);
    return saved === '1' ? true : saved === '0' ? false : undefined;
  } catch {
    return undefined;
  }
}

export function saveMotionPreference(reduce: boolean): void {
  try {
    browserStorage()?.setItem(MOTION_PREFERENCE, reduce ? '1' : '0');
  } catch {
    // The setting still applies to the current opening.
  }
}
