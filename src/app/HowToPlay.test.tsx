import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import readme from '../../README.md?raw';
import { HOW_TO_PLAY, HowToPlay } from './HowToPlay.tsx';

it('links the room to the README’s recipes, in a new tab', () => {
  const html = renderToStaticMarkup(<HowToPlay />);
  expect(html).toContain(`href="${HOW_TO_PLAY}"`);
  expect(html).toContain('target="_blank"');
  expect(html).toContain('rel="noopener"');
  expect(html).toContain('HOW TO PLAY');
});

it('points at a heading the README has', () => {
  expect(HOW_TO_PLAY.endsWith('#how-to-play')).toBe(true);
  expect(readme).toMatch(/^## How to play$/m);
});
