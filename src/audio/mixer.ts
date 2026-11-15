import { onSoundMuted, soundMuted } from '../app/sound.ts';
import { sources, type Cue, type Loop, type Shot } from './catalogue.ts';
import { onSoundVolume, soundVolume } from './index.ts';

interface Voice {
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
  level: number;
}

const SHOT_GAIN: Record<Shot, number> = {
  'opening-rumble': 0.35,
  'opening-alarm': 0.48,
  'loss-failure': 0.58,
  'black-cut': 0.38,
  'opening-title': 0.42,
  'title-out': 0.3,
  'room-wake': 0.4,
  'console-click': 0.23,
  advisory: 0.38,
  caution: 0.53,
  warning: 0.64,
  'black-box-record': 0.36,
  'home-reveal': 0.4,
};

const FADE = 0.065;
const usableLevel = (): number => (soundMuted() ? 0 : soundVolume());

export function startMixer() {
  const abort = new AbortController();
  const buffers = new Map<Cue, AudioBuffer>();
  const beds = new Map<Loop, Voice>();
  const effects = new Map<Shot, Voice>();
  let context: AudioContext | undefined;
  let master: GainNode | undefined;
  let held = false;

  const smooth = (param: AudioParam, level: number, now: number): void => {
    param.cancelScheduledValues(now);
    param.setTargetAtTime(level, now, FADE / 3);
  };

  function hush(voice: Voice): void {
    const now = voice.source.context.currentTime;
    smooth(voice.gain.gain, 0, now);
    voice.source.stop(now + FADE);
  }

  function stopShots(): void {
    for (const voice of effects.values()) hush(voice);
    effects.clear();
  }

  function applyLevel(): void {
    if (context && master) smooth(master.gain, usableLevel(), context.currentTime);
    if (usableLevel() === 0) stopShots();
  }
  const offMute = onSoundMuted(applyLevel);
  const offVolume = onSoundVolume(applyLevel);

  async function load(audio: AudioContext, cue: Cue, url: string): Promise<void> {
    try {
      const response = await fetch(url, { signal: abort.signal });
      if (!response.ok) return;
      const buffer = await audio.decodeAudioData(await response.arrayBuffer());
      if (!abort.signal.aborted) buffers.set(cue, buffer);
    } catch {
      // Optional file, failed fetch or undecodable MP3. Other voices keep playing.
    }
  }

  function onGesture(event: Event): void {
    if (!event.isTrusted || document.hidden) return;
    if (!context) {
      try {
        context = new AudioContext();
      } catch {
        return;
      }
      master = context.createGain();
      master.gain.value = usableLevel();
      master.connect(context.destination);
      for (const [cue, url] of sources) void load(context, cue, url);
    }
    if (context.state !== 'running') void context.resume().catch(() => {});
  }

  const gestures = ['pointerdown', 'pointerup', 'keydown'] as const;
  for (const type of gestures)
    window.addEventListener(type, onGesture, { capture: true, signal: abort.signal });

  function hold(hidden: boolean): void {
    if (hidden === held) return;
    held = hidden;
    if (context) void (hidden ? context.suspend() : context.resume()).catch(() => {});
  }
  document.addEventListener('visibilitychange', () => hold(document.hidden), {
    signal: abort.signal,
  });

  function start(cue: Cue, level: number, loop: boolean): Voice | undefined {
    const buffer = buffers.get(cue);
    if (!buffer || !master || context?.state !== 'running' || document.hidden) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = loop;
    gain.gain.value = 0;
    smooth(gain.gain, level, context.currentTime);
    source.connect(gain).connect(master);
    source.start();
    return { source, gain, level };
  }

  return {
    hold,
    bed(cue: Loop, level: number): void {
      const voice = beds.get(cue);
      if (voice) {
        if (level <= 0) {
          beds.delete(cue);
          hush(voice);
        } else if (Math.abs(voice.level - level) > 0.005) {
          smooth(voice.gain.gain, level, voice.source.context.currentTime);
          voice.level = level;
        }
        return;
      }
      if (level <= 0) return;
      const started = start(cue, level, true);
      if (!started) return;
      beds.set(cue, started);
      started.source.onended = () => {
        started.source.disconnect();
        started.gain.disconnect();
      };
    },
    shot(cue: Shot): boolean {
      if (usableLevel() === 0 || effects.has(cue)) return false;
      const voice = start(cue, SHOT_GAIN[cue], false);
      if (!voice) return false;
      effects.set(cue, voice);
      voice.source.onended = () => {
        if (effects.get(cue) === voice) effects.delete(cue);
        voice.source.disconnect();
        voice.gain.disconnect();
      };
      return true;
    },
    stopShots,
    dispose(): void {
      abort.abort();
      offMute();
      offVolume();
      if (context) void context.close().catch(() => {});
    },
  };
}

export type Mixer = ReturnType<typeof startMixer>;
