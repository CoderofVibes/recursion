/**
 * The trailer page (thread TR): plays the 30-second demo video, picture and sound together, for
 * the owner to record in one take (docs/submission/video.md, docs/trailer/).
 *
 * A black page. Space or a click starts it, R replays, C hides the captions, F toggles full
 * screen, H hides the status line. Every run plays the same: the picture is drawn from the
 * audio clock's output time, and every sound is scheduled on that clock at Start.
 *
 * Dev only: served by `npm run dev` at /src/trailer/. The game never imports it and it isn't in
 * the production build. `?from=12.5` starts at 12.5 s; `?still=6.1` holds the frame at 6.1 s.
 */
import { applyTheme } from '../theme/index.ts';
import type { SceneFactory, TrailerScene } from './scene.ts';
import { createSlate } from './slate.ts';
import { loadSound, type Sound } from './sound.ts';
import { BEATS, CORNER_LABEL, TOTAL, beatAt, levelAt } from './timeline.ts';
import './trailer.css';

const modules = import.meta.glob<{ createScene: SceneFactory }>('./scenes/*/index.ts', {
  eager: true,
});

const params = new URLSearchParams(location.search);
const seconds = (value: string | null): number | null => {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), TOTAL) : null;
};
const FROM = seconds(params.get('from')) ?? 0;
const STILL = seconds(params.get('still'));
/** Seconds between pressing Start and the first frame, so every sound is scheduled ahead. */
const LEAD = 0.25;

applyTheme(document.documentElement);

const root = document.getElementById('trailer')!;
const make = (className: string): HTMLDivElement => {
  const el = document.createElement('div');
  el.className = className;
  return el;
};
const stage = make('tr-stage');
const caption = make('tr-caption');
const veil = make('tr-veil');
const status = make('tr-status');
const label = make('tr-label');
label.textContent = CORNER_LABEL;
caption.hidden = true;
root.append(stage, caption, veil, label, status);

// Scenes: one per folder under scenes/, a stand-in slate for any beat whose scene isn't built.
const scenes = new Map<string, TrailerScene>();
for (const [path, module] of Object.entries(modules)) {
  const folder = path.split('/')[2]!;
  const scene = module.createScene();
  if (scene.id !== folder) throw new Error(`Scene ${scene.id} lives in scenes/${folder}`);
  scenes.set(folder, scene);
}
for (const beat of BEATS) {
  if (beat.scene && !scenes.has(beat.scene)) scenes.set(beat.scene, createSlate(beat.scene));
}
for (const scene of scenes.values()) {
  scene.element.classList.add('tr-scene');
  scene.element.hidden = true;
  stage.append(scene.element);
}
const resize = (): void => {
  for (const scene of scenes.values())
    scene.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio);
};
window.addEventListener('resize', resize);
resize();

type State = 'loading' | 'ready' | 'playing' | 'ended';
let state: State = 'loading';
let sound: Sound | null = null;
/** Context time of timeline 0 (audio clock), and the same on the page's clock as a fallback. */
let origin = 0;
let pageOrigin = 0;
let captionsOn = true;
let statusOn = STILL === null;
/** Beat changes in the current run, for the rehearsal record. */
let record: { beat: string; t: number; sheet: number }[] = [];

function say(text: string): void {
  status.textContent = text;
  status.hidden = !statusOn || state === 'playing';
}

/** Timeline seconds at the moment this frame is shown, from what the speakers are playing. */
function timeAt(frameTime: number): number {
  if (sound && sound.context.state === 'running') {
    const context = sound.context;
    const stamp = context.getOutputTimestamp();
    if (stamp.contextTime !== undefined && stamp.performanceTime) {
      return stamp.contextTime + (frameTime - stamp.performanceTime) / 1000 - origin;
    }
    return context.currentTime - (context.outputLatency || context.baseLatency || 0) - origin;
  }
  return (frameTime - pageOrigin) / 1000;
}

async function start(): Promise<void> {
  if (state === 'loading' || STILL !== null) return;
  if (sound) {
    await sound.context.resume();
    origin = sound.context.currentTime + LEAD - FROM;
    sound.play(origin, FROM);
  }
  pageOrigin = performance.now() + (LEAD - FROM) * 1000;
  record = [];
  lastBeat = undefined;
  state = 'playing';
  say('');
}

let shown: TrailerScene | undefined;
/**
 * Seconds before a cut into a room shot that the shot is already being drawn, out of sight under
 * the picture on screen. The room's WebGL canvas is hidden through the black beats and the
 * montage's stills, and a canvas first shown at the cut costs its first frames (measured in the
 * rehearsal: seven long frames at the console's cut after the montage).
 */
const PREROLL = 0.3;
let warming: TrailerScene | undefined;
/** The room shots share one canvas (rig/index.ts marks their elements). */
const isRoom = (scene: TrailerScene | undefined): boolean =>
  scene?.element.dataset.tvScene !== undefined;
let lastBeat: string | null | undefined;
let lastCaption: string | undefined;

function draw(t: number): void {
  const beat = beatAt(t);
  const scene = beat?.scene ? scenes.get(beat.scene) : undefined;
  // Never under another room shot: they share the canvas, so it would show the next shot early.
  const ahead = t >= 0 ? beatAt(t + PREROLL) : null;
  const next = ahead?.scene ? scenes.get(ahead.scene) : undefined;
  const warm = next !== scene && isRoom(next) && !isRoom(scene) ? next : undefined;
  if (warm !== warming) {
    if (warming) {
      warming.element.classList.remove('tr-preroll');
      if (warming !== scene) warming.element.hidden = true;
    }
    if (warm) {
      warm.element.classList.add('tr-preroll');
      warm.element.hidden = false;
    }
    warming = warm;
  }
  if (scene !== shown) {
    if (shown && shown !== warm) shown.element.hidden = true;
    if (scene) scene.element.hidden = false;
    shown = scene;
  }
  if (ahead && warm) warm.render(ahead, 0);
  if (beat && scene) scene.render(beat, t - beat.start);
  veil.style.opacity = String(1 - levelAt(t));
  const text = beat?.caption;
  if (text !== lastCaption) {
    lastCaption = text;
    caption.textContent = text ?? '';
  }
  caption.hidden = !captionsOn || !text;
  if (state === 'playing' && (beat?.id ?? null) !== lastBeat) {
    lastBeat = beat?.id ?? null;
    if (beat) record.push({ beat: beat.id, t, sheet: beat.start });
  }
}

function frame(now: number): void {
  requestAnimationFrame(frame);
  if (STILL !== null) return draw(STILL);
  if (state !== 'playing') return draw(-1);
  const t = timeAt(now);
  if (t >= TOTAL) {
    state = 'ended';
    say(readyText());
    return draw(-1);
  }
  draw(t < FROM ? -1 : t);
}
requestAnimationFrame(frame);

function readyText(): string {
  const silent = sound?.missing.length ?? 0;
  const from = FROM > 0 ? ` from ${FROM} s` : '';
  return [
    `Ready${from} · Space or click to play · R replay · C captions ${captionsOn ? 'on' : 'off'} · F full screen · H hide this`,
    silent ? `${silent} sound files not in yet (they play as silence)` : 'All sound files in',
  ].join('\n');
}

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  switch (event.code) {
    case 'Space':
      event.preventDefault();
      if (state === 'ready' || state === 'ended') void start();
      break;
    case 'KeyR':
      if (state !== 'loading') {
        sound?.stop();
        void start();
      }
      break;
    case 'KeyC':
      captionsOn = !captionsOn;
      if (state !== 'playing') say(readyText());
      break;
    case 'KeyH':
      statusOn = !statusOn;
      say(state === 'loading' ? 'Loading…' : readyText());
      break;
    case 'KeyF':
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
      break;
  }
});
window.addEventListener('pointerdown', () => {
  if (state === 'ready' || state === 'ended') void start();
});

// Load every scene and sound before Start, so nothing hitches on camera.
say('Loading…');
const loading = Promise.all([
  loadSound().then(
    (loaded) => {
      sound = loaded;
    },
    () => {
      sound = null;
    },
  ),
  ...[...scenes.values()].map((scene) => scene.prepare()),
]);
loading.then(
  () => {
    state = 'ready';
    say(readyText());
  },
  (error: unknown) => say(`A scene failed to load: ${String(error)}`),
);

/** For the rehearsal driver: the run's beat changes and the clock. */
Object.assign(window, {
  __trailer: {
    state: () => state,
    record: () => record,
    missing: () => sound?.missing ?? [],
  },
});
