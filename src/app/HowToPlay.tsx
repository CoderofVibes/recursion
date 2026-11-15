/**
 * The room's way to the judges' recipes (owner, 2026-11-15): the README's "How to play", in a new
 * tab, so the game keeps running here.
 */
export const HOW_TO_PLAY = 'https://github.com/CoderofVibes/recursion#how-to-play';

export function HowToPlay() {
  return (
    <a className="cr-routes__help" href={HOW_TO_PLAY} target="_blank" rel="noopener">
      HOW TO PLAY ↗
    </a>
  );
}
