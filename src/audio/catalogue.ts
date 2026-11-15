import type { OpeningCue } from '../app/opening/sequence.ts';

export const loops = [
  'room-hum',
  'main-engine',
  'rcs-thruster',
  'well-hum',
  'lattice-radiation',
] as const;
export type Loop = (typeof loops)[number];

export type Shot =
  | OpeningCue
  | 'console-click'
  | 'advisory'
  | 'caution'
  | 'warning'
  | 'equipment-damage'
  | 'black-box-record'
  | 'home-reveal';

const shots: readonly Shot[] = [
  'opening-rumble',
  'opening-alarm',
  'loss-failure',
  'black-cut',
  'opening-title',
  'title-out',
  'room-wake',
  'console-click',
  'advisory',
  'caution',
  'warning',
  'equipment-damage',
  'black-box-record',
  'home-reveal',
];
export type Cue = Loop | Shot;

// Discover files at build time so an absent cue never produces an HTTP request.
// Public files are served at the deployment base, including on project Pages.
const publicFiles = new Set(Object.keys(import.meta.glob('/public/audio/*.mp3')));
export const sources: ReadonlyMap<Cue, string> = new Map(
  [...loops, ...shots].flatMap((cue) => {
    const path = `audio/${cue}.mp3`;
    return publicFiles.has(`/public/${path}`)
      ? [[cue, `${import.meta.env.BASE_URL}${path}`] as const]
      : [];
  }),
);
