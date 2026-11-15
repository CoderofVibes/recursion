/**
 * The 30-second trailer's timeline: the owner's beat sheet (docs/submission/video.md, with the
 * owner's later updates in docs/trailer/beats.md), the flickers and snaps that make up its
 * flash schedule (R43), and the montage's captions. Pure data and functions: the page draws from
 * these numbers and the tests check the same ones.
 */

/** The whole trailer, seconds. */
export const TOTAL = 30;

export interface Beat {
  /** Unique, used in logs and the rehearsal record. */
  readonly id: string;
  /** The scene that draws it; null is black. */
  readonly scene: string | null;
  /** Which shot within the scene (the montage's screens). */
  readonly shot?: string;
  readonly start: number;
  readonly length: number;
  /** What it is, for stand-in slates and logs. */
  readonly label: string;
  /** Where the picture comes from (the sheet's Source column). */
  readonly source: string;
  readonly caption?: string;
}

/** A flicker: the picture drops to `level` at `at` for `length` seconds, then returns at `after`. */
export interface Dip {
  readonly at: number;
  readonly length: number;
  readonly level: number;
  readonly after: number;
}

interface Row {
  readonly id: string;
  readonly scene: string | null;
  readonly shot?: string;
  readonly length: number;
  readonly label: string;
  readonly source: string;
  readonly caption?: string;
}

/** The montage's screens: FLIGHT opens with the owner's first caption; the rest are proposals. */
export const MONTAGE: readonly { shot: string; label: string; caption: string }[] = [
  { shot: 'flight', label: 'FLIGHT', caption: 'Engineer your way home.' },
  { shot: 'map', label: 'MAP', caption: 'Chart an unknown universe.' },
  { shot: 'region', label: 'Region view', caption: 'Each region has its own physics.' },
  { shot: 'explore', label: 'EXPLORE', caption: 'Find the way out.' },
  { shot: 'model', label: 'MODEL', caption: 'Fit the laws from what you measured.' },
  { shot: 'plan', label: 'PLAN', caption: 'Plan each burn against the forecast.' },
  { shot: 'blackbox', label: 'BLACK BOX', caption: 'Every loss leaves a record.' },
  { shot: 'ship', label: 'SHIP with SYSTEMS', caption: 'Every watt and kilogram counts.' },
];
/** Seconds each montage screen holds: 8 × 1.35 = 10.8 s, the sheet's montage. */
export const MONTAGE_SHOT = 1.35;

const SHEET: readonly Row[] = [
  { id: 'open', scene: null, length: 0.5, label: 'Black', source: '—' },
  {
    id: 'title',
    scene: 'title',
    length: 1.5,
    label: 'RECURSION',
    source: 'Staged: appears all at once, flickers, gone',
  },
  { id: 'after-title', scene: null, length: 0.3, label: 'Black', source: '—' },
  {
    id: 'slingshot',
    scene: 'slingshot',
    length: 2.5,
    label: 'Slingshot',
    source: "Real pass (VX's Twin Deeps view); the shake is staged",
  },
  {
    id: 'wells',
    scene: 'wells',
    length: 2.5,
    label: 'Sea of gravity wells',
    source: 'Real wells (VX, R50) in the window and on the hologram; the rotation is staged',
  },
  {
    id: 'lattice',
    scene: 'lattice',
    length: 3,
    label: 'The lattice',
    source:
      "FLIGHT's lattice (staged unless 2C's R46 lands); the empty window and the damage are real",
  },
  {
    id: 'braid',
    scene: 'braid',
    length: 2.5,
    label: 'The braid',
    source: 'Staged: fast motion past both sides of the window, flickering before the snap',
  },
  { id: 'snap', scene: null, length: 0.3, label: 'Snap to black', source: '—' },
  ...MONTAGE.map((m) => ({
    id: `montage-${m.shot}`,
    scene: 'montage',
    shot: m.shot,
    length: MONTAGE_SHOT,
    label: m.label,
    source: "Real screen (3F's redesign) with real data from a played session",
    caption: m.caption,
  })),
  {
    id: 'console',
    scene: 'console',
    length: 2.3,
    label: 'The console',
    source: "Real: the console and the ship's hologram, Earth in the window (A21)",
  },
  { id: 'before-card', scene: null, length: 0.3, label: 'Black', source: '—' },
  {
    id: 'card',
    scene: 'card',
    length: 3.5,
    label: 'RECURSION and the link',
    source: 'Final card',
  },
];

/** Rounded to the millisecond so sums of tenths land exactly on the sheet's times. */
const ms = (s: number): number => Math.round(s * 1000) / 1000;

export const BEATS: readonly Beat[] = (() => {
  let start = 0;
  return SHEET.map((row) => {
    const beat: Beat = { ...row, start: ms(start) };
    start = ms(start + row.length);
    return beat;
  });
})();

/** The beat on screen at `t`, or null before 0 and from TOTAL on. */
export function beatAt(t: number): Beat | null {
  if (t < 0 || t >= TOTAL) return null;
  for (let i = BEATS.length - 1; i >= 0; i--) {
    const beat = BEATS[i]!;
    if (t >= beat.start) return beat;
  }
  return null;
}

export function beat(id: string): Beat {
  const found = BEATS.find((b) => b.id === id);
  if (!found) throw new Error(`No beat ${id}`);
  return found;
}

/**
 * The title's flicker, like the game's (`src/app/opening/sequence.ts`): dips at least 0.37 s apart,
 * so with the title's rise, its fall at 2.0 s and the slingshot's rise at 2.3 s no second holds
 * more than three falls or three rises.
 */
export const TITLE_DIPS: readonly Dip[] = [
  { at: 0.95, length: 0.07, level: 0, after: 1 },
  { at: 1.35, length: 0.05, level: 0.25, after: 0.85 },
  { at: 1.72, length: 0.09, level: 0, after: 0.6 },
];

/**
 * The braid starts to flicker before the snap (owner, 2026-11-15): three dips 0.4 s apart, the
 * last 0.4 s before the snap at 12.8 s, which is the fourth fall but more than a second after
 * the first.
 */
export const BRAID_DIPS: readonly Dip[] = [
  { at: 11.6, length: 0.06, level: 0.1, after: 1 },
  { at: 12.0, length: 0.05, level: 0.3, after: 0.8 },
  { at: 12.4, length: 0.08, level: 0, after: 0.6 },
];

const DIPS: ReadonlyMap<string, readonly Dip[]> = new Map([
  ['title', TITLE_DIPS],
  ['braid', BRAID_DIPS],
]);

/** Every flicker, in order (for the sound of each one). */
export const FLICKERS: readonly number[] = [...TITLE_DIPS, ...BRAID_DIPS].map((d) => d.at);

/**
 * How much of the picture shows at `t`, 0 (black) to 1. Black beats are 0; a shot is 1 except
 * through its flickers. The page dims the whole frame by this, so the flash count the tests
 * make is the one the viewer sees.
 */
export function levelAt(t: number): number {
  const current = beatAt(t);
  if (!current || current.scene === null) return 0;
  let level = 1;
  for (const dip of DIPS.get(current.id) ?? []) {
    if (t < dip.at) break;
    level = t < dip.at + dip.length ? dip.level : dip.after;
  }
  return level;
}

/** The two snaps to black, where the action stops and the sound cuts dead (R56). */
export const SNAPS: readonly number[] = [beat('snap').start, beat('before-card').start];
