import { colour, type } from '../../theme/index.ts';
import { consoleTopTexture } from '../room/textures.ts';

/** Paint the cruise indication and the steady alert on the physical console. */
export function createOpeningPanel() {
  const cruise = consoleTopTexture();
  const caution = consoleTopTexture();
  const warning = consoleTopTexture();
  for (const [texture, label, ink] of [
    [cruise, 'MARS RETURN', colour.ink],
    [caution, '▲ CAUTION', colour.caution],
    [warning, '■ WARNING', colour.warning],
  ] as const) {
    const canvas = texture.image as HTMLCanvasElement;
    const context = canvas.getContext('2d');
    if (!context) continue;
    const x = canvas.width / 2;
    const y = canvas.height * 0.13;
    const width = canvas.width * 0.38;
    const height = type.size.display * 4;
    context.fillStyle = colour.panel;
    context.fillRect(x - width / 2, y - height / 2, width, height);
    context.fillStyle = ink;
    context.font = `${type.weight.strong} ${type.size.display * 3}px ${type.family}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(label, x, y);
    texture.needsUpdate = true;
  }
  return {
    maps: { cruise, caution, warning, off: undefined },
    dispose() {
      cruise.dispose();
      caution.dispose();
      warning.dispose();
    },
  };
}
