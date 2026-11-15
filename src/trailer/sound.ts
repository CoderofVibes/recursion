/**
 * The trailer's sound: loads every cue's file once, then schedules the whole timeline on the
 * audio clock at Start, so picture and sound stay locked and Game Bar records both together.
 * A file that isn't there (or doesn't decode) plays as silence.
 */
import { sources as gameSources } from '../audio/catalogue.ts';
import { CUES, type SoundCue } from './cues.ts';
import { TOTAL } from './timeline.ts';

/** The trailer's own files, found at build time so a missing one is never requested. */
const trailerFiles = import.meta.glob<string>('./audio/*.mp3', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** Seconds of ramp on a cut: dead to the ear, no click. */
const CUT = 0.004;

export function urlOf(cue: SoundCue): string | undefined {
  return cue.from === 'game' ? gameSources.get(cue.file) : trailerFiles[`./audio/${cue.file}.mp3`];
}

export interface Sound {
  readonly context: AudioContext;
  /** Which files played as silence, for the status line. */
  readonly missing: readonly string[];
  /** Schedule every cue so timeline time 0 falls at context time `origin`; `from` skips ahead. */
  play(origin: number, from: number): void;
  /** Stop everything now (replay). */
  stop(): void;
}

export async function loadSound(): Promise<Sound> {
  const context = new AudioContext({ latencyHint: 'playback' });
  // A limiter on the master, so the peaks stay below clipping (about -1 dBFS).
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -2;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;
  const master = context.createGain();
  master.gain.value = 0.9;
  master.connect(limiter).connect(context.destination);

  const buffers = new Map<string, AudioBuffer>();
  const missing = new Set<string>();
  const urls = new Map<string, string>();
  for (const cue of CUES) {
    const url = urlOf(cue);
    if (url) urls.set(cue.file, url);
    else missing.add(cue.file);
  }
  await Promise.all(
    [...urls].map(async ([file, url]) => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(String(response.status));
        buffers.set(file, await context.decodeAudioData(await response.arrayBuffer()));
      } catch {
        missing.add(file);
      }
    }),
  );

  let playing: { source: AudioBufferSourceNode; gain: GainNode }[] = [];

  function stop(): void {
    for (const { source, gain } of playing) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
      source.disconnect();
      gain.disconnect();
    }
    playing = [];
  }

  function play(origin: number, from: number): void {
    stop();
    for (const cue of CUES) {
      const buffer = buffers.get(cue.file);
      if (!buffer) continue;
      const until = Math.min(cue.until ?? cue.at + buffer.duration, TOTAL);
      if (until <= from) continue;
      const begin = Math.max(cue.at, from);
      const offset = begin - cue.at;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = cue.loop ?? false;
      const gain = context.createGain();
      source.connect(gain).connect(master);
      const at = (s: number) => origin + s;
      gain.gain.setValueAtTime(cue.gain, at(begin));
      const fade = cue.fadeOut ?? CUT;
      if (cue.until !== undefined || until === TOTAL) {
        gain.gain.setValueAtTime(cue.gain, at(Math.max(begin, until - fade)));
        gain.gain.linearRampToValueAtTime(0, at(until));
        source.stop(at(until) + 0.01);
      }
      source.start(at(begin), source.loop ? offset % buffer.duration : offset);
      playing.push({ source, gain });
    }
  }

  return { context, missing: [...missing], play, stop };
}
