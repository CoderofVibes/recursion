/**
 * The trailer's sound, as data: every cue's file, start, cut and level on the timeline
 * (docs/trailer/audio.md). The game's cues are reused where they fit, so the video sounds like
 * the game (ledger R56); the rest are the trailer's own files in `src/trailer/audio/`.
 * Gains are first guesses, balanced once the owner's files are in.
 */
import type { Cue as GameCue } from '../audio/catalogue.ts';
import { BEATS, FLICKERS, SNAPS, TOTAL, beat } from './timeline.ts';

export const TRAILER_FILES = [
  'title-hit',
  'flicker-crackle',
  'hull-strain',
  'well-groan',
  'ship-creak',
  'lattice-strike',
  'braid-rush',
  'montage-bed',
  'final-hit',
] as const;
export type TrailerFile = (typeof TRAILER_FILES)[number];

interface Common {
  /** Start, seconds on the timeline. */
  readonly at: number;
  /** Cut dead here (a few milliseconds' ramp, so it doesn't click). Default: the file plays out. */
  readonly until?: number;
  readonly loop?: boolean;
  /** Linear gain into the master. */
  readonly gain: number;
  /** Seconds of fade before `until` (a soft end instead of a cut). */
  readonly fadeOut?: number;
  /** Playback speed: below 1 is slower and lower, to stretch a take (owner's notes on the files). */
  readonly rate?: number;
  /** Seconds into the file to start from, skipping a take's silent lead-in. */
  readonly offset?: number;
}
export type SoundCue =
  | (Common & { readonly from: 'game'; readonly file: GameCue })
  | (Common & { readonly from: 'trailer'; readonly file: TrailerFile });

const SHEET_IDS: readonly string[] = BEATS.map((b) => b.id);
const end = (id: string): number => {
  const b = beat(id);
  return Math.round((b.start + b.length) * 1000) / 1000;
};
const start = (id: string): number => beat(id).start;

const [SNAP, CARD_SNAP] = SNAPS as [number, number];
/** The lattice's strike (a placeholder until the lattice scene sets its moment). */
export const LATTICE_STRIKE = 9.0;
/** The alarm repeats on this period from the strike until the snap cuts it (R56: `warning`). */
export const ALARM_PERIOD = 0.9;

/**
 * The effects sit under the music (owner, 2026-11-15): every effect from the slingshot to the
 * console plays at this share of its level, and the montage's bed leads. The title's own sounds,
 * the snaps' cut and the final hit are not under the bed and keep their levels.
 */
export const UNDER = 0.5;

const alarms: SoundCue[] = [];
for (let at = LATTICE_STRIKE; at < SNAP; at = Math.round((at + ALARM_PERIOD) * 1000) / 1000) {
  alarms.push({ from: 'game', file: 'warning', at, until: SNAP, gain: 0.6 * UNDER });
}

/**
 * The montage's bed under every scene, cut to its beat (owner, 2026-11-15). The take's pulse is
 * not a steady tempo, but its four big accents fall about every 2.24 s of the file; at
 * `BED_RATE` they fall every 2.5 s, a scene's length. Each scene starts the bed on one of them,
 * so every cut lands on an accent and the next accent falls after the next cut (no double hit).
 * The lattice starts on a lighter hit and runs a little slower, so its big accent lands on the
 * strike. The snaps still cut it dead, like everything else.
 */
export const BED_ACCENTS = [2.072, 4.365, 6.589, 8.806] as const;
export const BED_RATE = 0.88;
const BED_GAIN = 1.6;
/** File seconds before a hit, so its attack lands on the cut, not after it. */
export const BED_LEAD = 0.02;
const [A1, A2, A3, A4] = BED_ACCENTS;
/** A lighter hit in the take, 1.44 s before its last big accent. */
const LATTICE_HIT = 7.367;
const LATTICE_RATE = (A4 - LATTICE_HIT) / (LATTICE_STRIKE - beat('lattice').start);
const bed = (at: number, until: number, hit: number, rate = BED_RATE): SoundCue => ({
  from: 'trailer',
  file: 'montage-bed',
  at,
  until,
  offset: hit - BED_LEAD,
  rate,
  gain: BED_GAIN,
});
/** The montage's shots, each on a big accent in turn. */
const montageBed = (): SoundCue[] => {
  const shots = SHEET_IDS.filter((id) => id.startsWith('montage-'));
  return shots.map((id, i) => {
    const next = shots[i + 1];
    return bed(start(id), next ? start(next) : start('console'), [A1, A2, A3][i % 3]!);
  });
};

export const CUES: readonly SoundCue[] = [
  // The title.
  {
    from: 'trailer',
    file: 'title-hit',
    at: start('title'),
    until: end('title'),
    fadeOut: 0.3,
    // The owner's take sounds for 1.34 s; slowed to fill the title's 1.5 s (owner's note).
    rate: 0.89,
    gain: 0.7,
  },
  ...FLICKERS.map((at): SoundCue => ({
    from: 'trailer',
    file: 'flicker-crackle',
    at,
    until: Math.min(Math.round((at + 0.3) * 1000) / 1000, SNAP),
    // The take peaks at -20 dBFS: lifted to be heard over the hit.
    gain: 1.8,
  })),
  // No sound as the title goes out (owner, 2026-11-15): the game's `title-out` right after the
  // hit would be one effect up against another. The hit fades into the black before the slingshot.

  // The bed under the action, from the slingshot's cut to the snap.
  bed(start('slingshot'), start('wells'), A1),
  bed(start('wells'), start('lattice'), A2),
  bed(start('lattice'), start('braid'), LATTICE_HIT, LATTICE_RATE),
  bed(start('braid'), SNAP, A1),

  // The slingshot.
  {
    from: 'game',
    file: 'main-engine',
    at: start('slingshot'),
    until: end('slingshot'),
    loop: true,
    gain: 0.5 * UNDER,
  },
  {
    from: 'game',
    file: 'opening-rumble',
    at: start('slingshot'),
    until: end('slingshot'),
    // The take: 0.35 s of silence, 1.7 s of rumble peaking at -22 dBFS. Skip the silence, slow it
    // to fill the slingshot's 2.5 s and lift it (owner's note: slower, louder).
    offset: 0.35,
    rate: 0.68,
    gain: 3.5 * UNDER,
  },
  {
    from: 'trailer',
    file: 'hull-strain',
    at: start('slingshot') + 0.3,
    until: end('slingshot'),
    gain: 0.5 * UNDER,
  },

  // The wells.
  {
    from: 'game',
    file: 'well-hum',
    at: start('wells'),
    until: end('wells'),
    loop: true,
    // The owner's take is quiet (peak -17 dBFS, mean -30): lifted to sit under the groan.
    gain: 3 * UNDER,
  },
  {
    from: 'trailer',
    file: 'well-groan',
    at: start('wells'),
    until: end('wells'),
    gain: 0.55 * UNDER,
  },
  {
    from: 'trailer',
    file: 'ship-creak',
    at: start('wells') + 0.6,
    until: end('wells'),
    gain: 0.5 * UNDER,
  },

  // The lattice: the cabin's quiet hum while the camera looks down at FLIGHT and up at the empty
  // window (silence mid-action would read as a snap), cut by the strike.
  {
    from: 'game',
    file: 'room-hum',
    at: start('lattice'),
    until: LATTICE_STRIKE,
    loop: true,
    gain: 0.35 * UNDER,
  },
  // The strike, its damage and the alarm, through the braid to the snap.
  { from: 'trailer', file: 'lattice-strike', at: LATTICE_STRIKE, until: SNAP, gain: 0.7 * UNDER },
  { from: 'game', file: 'loss-failure', at: LATTICE_STRIKE, until: SNAP, gain: 0.55 * UNDER },
  {
    from: 'game',
    file: 'lattice-radiation',
    at: LATTICE_STRIKE,
    until: SNAP,
    loop: true,
    // The owner's take is very quiet (peak -26 dBFS, mean -47; owner's note: higher volume):
    // lifted so its ticks peak near -8 dBFS under the alarm (then put under the bed).
    gain: 8 * UNDER,
  },
  ...alarms,
  { from: 'trailer', file: 'braid-rush', at: start('braid'), until: SNAP, gain: 0.6 * UNDER },

  // The snap: dead silence but the game's own cut.
  { from: 'game', file: 'black-cut', at: SNAP, until: start('montage-flight'), gain: 0.6 },

  // The montage, its bed cut on each shot.
  ...montageBed(),

  // The console with Earth, then the snap before the card.
  bed(start('console'), CARD_SNAP, A1),
  {
    from: 'game',
    file: 'room-hum',
    at: start('console'),
    until: CARD_SNAP,
    loop: true,
    gain: 0.45 * UNDER,
  },
  // No `home-reveal` here (owner, 2026-11-15): the console shot keeps the one cabin sound the
  // video already has, the room's hum above, so it sounds like the same cabin as the lattice shot.
  { from: 'game', file: 'black-cut', at: CARD_SNAP, until: start('card'), gain: 0.6 },

  // The final card.
  { from: 'trailer', file: 'final-hit', at: start('card'), until: TOTAL, gain: 0.7 },
];
