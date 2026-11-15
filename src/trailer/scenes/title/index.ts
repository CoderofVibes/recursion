/**
 * The title (0.5–2.0 s): RECURSION appears all at once, flickers and is gone. Staged for the
 * video, in the game's own title style (the opening's classes), so the two match. The flicker
 * is the timeline's (`TITLE_DIPS`), applied by the page to the whole frame.
 */
import '../../../app/opening/opening.css';
import '../../../view3d/opening/title.css';
import type { SceneFactory } from '../../scene.ts';

export const createScene: SceneFactory = () => {
  const element = document.createElement('div');
  element.className = 'rx-opening tr-title';
  const title = document.createElement('h1');
  title.className = 'rx-opening-title';
  title.textContent = 'RECURSION';
  element.append(title);
  return {
    id: 'title',
    element,
    prepare: () => document.fonts.ready.then(() => undefined),
    render() {},
    resize() {},
    dispose() {
      element.remove();
    },
  };
};
