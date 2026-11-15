/**
 * The trailer's sound, as data: every cue's file, start, cut and level on the timeline
 * (docs/trailer/audio.md). The game's cues are reused where they fit, so the video sounds like
 * the game (ledger R56); the rest are the trailer's own files in `src/trailer/audio/`.
 * Gains are first guesses, balanced once the owner's files are in.
 */
import type { Cue as GameCue } from '../audio/catalogue.ts';
import { FLICKERS, SNAPS, TOTAL, beat } from './timeline.ts';

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

const alarms: SoundCue[] = [];
for (let at = LATTICE_STRIKE; at < SNAP; at = Math.round((at + ALARM_PERIOD) * 1000) / 1000) {
  alarms.push({ from: 'game', file: 'warning', at, until: SNAP, gain: 0.6 });
}

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
  { from: 'game', file: 'title-out', at: end('title'), until: start('slingshot'), gain: 0.45 },

  // The slingshot.
  {
    from: 'game',
    file: 'main-engine',
    at: start('slingshot'),
    until: end('slingshot'),
    loop: true,
    gain: 0.5,
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
    gain: 3.5,
  },
  {
    from: 'trailer',
    file: 'hull-strain',
    at: start('slingshot') + 0.3,
    until: end('slingshot'),
    gain: 0.5,
  },

  // The wells.
  {
    from: 'game',
    file: 'well-hum',
    at: start('wells'),
    until: end('wells'),
    loop: true,
    // The owner's take is quiet (peak -17 dBFS, mean -30): lifted to sit under the groan.
    gain: 3,
  },
  { from: 'trailer', file: 'well-groan', at: start('wells'), until: end('wells'), gain: 0.55 },
  { from: 'trailer', file: 'ship-creak', at: start('wells') + 0.6, until: end('wells'), gain: 0.5 },

  // The lattice: the cabin's quiet hum while the camera looks down at FLIGHT and up at the empty
  // window (silence mid-action would read as a snap), cut by the strike.
  {
    from: 'game',
    file: 'room-hum',
    at: start('lattice'),
    until: LATTICE_STRIKE,
    loop: true,
    gain: 0.35,
  },
  // The strike, its damage and the alarm, through the braid to the snap.
  { from: 'trailer', file: 'lattice-strike', at: LATTICE_STRIKE, until: SNAP, gain: 0.7 },
  { from: 'game', file: 'loss-failure', at: LATTICE_STRIKE, until: SNAP, gain: 0.55 },
  {
    from: 'game',
    file: 'lattice-radiation',
    at: LATTICE_STRIKE,
    until: SNAP,
    loop: true,
    gain: 0.4,
  },
  ...alarms,
  { from: 'trailer', file: 'braid-rush', at: start('braid'), until: SNAP, gain: 0.6 },

  // The snap: dead silence but the game's own cut.
  { from: 'game', file: 'black-cut', at: SNAP, until: start('montage-flight'), gain: 0.6 },

  // The montage.
  {
    from: 'trailer',
    file: 'montage-bed',
    at: start('montage-flight'),
    until: start('console'),
    fadeOut: 0.25,
    gain: 0.45,
  },

  // The console with Earth, then the snap before the card.
  {
    from: 'game',
    file: 'room-hum',
    at: start('console'),
    until: CARD_SNAP,
    loop: true,
    gain: 0.45,
  },
  { from: 'game', file: 'home-reveal', at: start('console'), until: CARD_SNAP, gain: 0.5 },
  { from: 'game', file: 'black-cut', at: CARD_SNAP, until: start('card'), gain: 0.6 },

  // The final card.
  { from: 'trailer', file: 'final-hit', at: start('card'), until: TOTAL, gain: 0.7 },
];
