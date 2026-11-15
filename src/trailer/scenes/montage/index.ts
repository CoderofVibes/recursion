/**
 * The montage (13.1–23.9 s): the game's own screens, eight shots of 1.35 s, each under the
 * page's caption. Every picture is a still of the real screen from one really played session
 * (Twin Deeps on this branch's production build, real keys and clicks, at the owner's recording size:
 * 1536 × 864 CSS pixels at 1.25, so 1920 × 1080). `capture/play.sh` is the session;
 * `docs/handoffs/tr.md` says what was played and where each still was taken. Nothing in a still
 * is drawn, assigned or retouched: the edit is the choice of moments and the cuts between them.
 */
import type { SceneFactory } from '../../scene.ts';
import { MONTAGE } from '../../timeline.ts';

const files = import.meta.glob<string>('./stills/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** The still for a montage shot (`MONTAGE[].shot`): `stills/<shot>.png`. */
export function stillFor(shot: string): string | undefined {
  return files[`./stills/${shot}.png`];
}

export const createScene: SceneFactory = () => {
  const element = document.createElement('div');
  element.className = 'tr-montage';
  const frames = new Map<string, HTMLElement>();
  for (const { shot, label } of MONTAGE) {
    const url = stillFor(shot);
    let frame: HTMLElement;
    if (url) {
      const image = document.createElement('img');
      image.src = url;
      image.alt = label;
      image.decoding = 'sync';
      frame = image;
    } else {
      // No still yet: say so, so a missing screen is never mistaken for a finished shot.
      frame = document.createElement('div');
      frame.className = 'tr-montage-missing';
      frame.textContent = `${label}: still not captured`;
    }
    frame.hidden = true;
    frames.set(shot, frame);
    element.append(frame);
  }
  let shown: HTMLElement | undefined;

  return {
    id: 'montage',
    element,
    // Decode every still before Start, so no cut waits on one.
    prepare: () =>
      Promise.all(
        [...frames.values()].map((frame) =>
          frame instanceof HTMLImageElement ? frame.decode() : undefined,
        ),
      ).then(() => undefined),
    render(beat) {
      const frame = beat.shot ? frames.get(beat.shot) : undefined;
      if (frame === shown) return;
      if (shown) shown.hidden = true;
      if (frame) frame.hidden = false;
      shown = frame;
    },
    resize() {},
    dispose() {
      element.remove();
    },
  };
};
