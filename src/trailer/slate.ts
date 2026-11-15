/**
 * A stand-in for a scene not built yet: the beat's name, where its picture will come from, and
 * a bar showing how far into the beat the frame is. For timing only; never recorded.
 */
import type { TrailerScene } from './scene.ts';
import type { Beat } from './timeline.ts';

export function createSlate(id: string): TrailerScene {
  const element = document.createElement('div');
  element.className = 'tr-slate';
  const tag = document.createElement('div');
  tag.className = 'tr-slate-tag';
  tag.textContent = 'Stand-in';
  const label = document.createElement('div');
  label.className = 'tr-slate-label';
  const source = document.createElement('div');
  source.className = 'tr-slate-source';
  const time = document.createElement('div');
  time.className = 'tr-slate-time';
  const bar = document.createElement('div');
  bar.className = 'tr-slate-bar';
  const fill = document.createElement('div');
  bar.append(fill);
  element.append(tag, label, source, time, bar);
  let shown: Beat | null = null;

  return {
    id,
    element,
    prepare: () => Promise.resolve(),
    render(beat, local) {
      if (shown !== beat) {
        shown = beat;
        label.textContent = beat.label;
        source.textContent = beat.source;
        const end = beat.start + beat.length;
        time.textContent = `${beat.start.toFixed(2)}–${end.toFixed(2)} s`;
      }
      fill.style.width = `${Math.min(100, (local / beat.length) * 100)}%`;
    },
    resize() {},
    dispose() {
      element.remove();
    },
  };
}
