/**
 * The final card (26.5–30.0 s): RECURSION in the game's title style, the link to the playable
 * build, and the labels from docs/submission/video.md. A draft until the owner settles the card
 * after the other work wraps up (docs/trailer/beats.md, update 4).
 */
import '../../../app/opening/opening.css';
import '../../../view3d/opening/title.css';
import type { SceneFactory } from '../../scene.ts';

/** The playable build (README). Confirm it's live from a private window before recording. */
export const PLAY_LINK = 'coderofvibes.github.io/recursion';

export const LABELS: readonly string[] = [
  'Gameplay footage, edited; some shots staged for the video.',
  'Built with AI assistance (Claude, OpenAI Codex). Audio by ElevenLabs (AI-generated).',
  'Physics checked against NASA GMAT.',
];

export const createScene: SceneFactory = () => {
  const element = document.createElement('div');
  element.className = 'rx-opening tr-card';
  const block = document.createElement('div');
  block.className = 'tr-card-block';
  const title = document.createElement('h1');
  title.className = 'rx-opening-title';
  title.textContent = 'RECURSION';
  const link = document.createElement('div');
  link.className = 'tr-card-link';
  link.textContent = PLAY_LINK;
  const labels = document.createElement('ul');
  labels.className = 'tr-card-labels';
  for (const text of LABELS) {
    const item = document.createElement('li');
    item.textContent = text;
    labels.append(item);
  }
  block.append(title, link);
  element.append(block, labels);
  return {
    id: 'card',
    element,
    prepare: () => document.fonts.ready.then(() => undefined),
    render() {},
    resize() {},
    dispose() {
      element.remove();
    },
  };
};
