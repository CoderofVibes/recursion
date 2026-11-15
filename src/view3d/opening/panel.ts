import type { CanvasTexture } from 'three';
import { colour, dash, opacity, type } from '../../theme/index.ts';
import { consoleTopTexture } from '../room/textures.ts';

export type PanelState = 'cruise' | 'caution' | 'warning' | 'off';

/** The MODEL panel on the console top (the texture's own layout, `consoleTopTexture`). */
const MODEL = { x: 1096, y: 20, w: 420, h: 380 } as const;
/** Redraw the drift only when it has moved this much: each redraw re-uploads the texture. */
const DRIFT_STEP = 1 / 48;

/**
 * Paint the cruise indication and the steady alert on the physical console, and the MODEL
 * panel's track (owner, 2026-11-15): the measured track rides the forecast's dotted line inside
 * its band, then pulls away from it. Nothing on the panel says why. In free fall nothing is felt;
 * the instruments simply stop agreeing with the prediction, the game's own picture of a law it
 * does not yet know.
 */
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
  const maps = { cruise, caution, warning } as const;
  const drawn = new Map<CanvasTexture, number>();

  /** The console's top for a state, with its MODEL panel showing `drift` (0 to 1). */
  function map(state: PanelState, drift: number): CanvasTexture | undefined {
    if (state === 'off') return undefined;
    const texture = maps[state];
    const step = Math.round(drift / DRIFT_STEP) * DRIFT_STEP;
    if (drawn.get(texture) !== step) {
      drawn.set(texture, step);
      drawTrack(texture, step);
    }
    return texture;
  }

  return {
    map,
    dispose() {
      cruise.dispose();
      caution.dispose();
      warning.dispose();
    },
  };
}

function drawTrack(texture: CanvasTexture, drift: number): void {
  const context = (texture.image as HTMLCanvasElement).getContext('2d');
  if (!context) return;
  const { x, y, w, h } = MODEL;
  context.save();
  context.fillStyle = colour.panel;
  context.fillRect(x, y, w, h);
  context.strokeStyle = colour.panelEdge;
  context.lineWidth = 2;
  context.strokeRect(x + 1, y + 1, w - 2, h - 2);
  context.fillStyle = colour.inkDim;
  context.font = `${type.weight.strong} 17px ${type.family}`;
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.fillText('MODEL', x + 14, y + 26);

  // Plot area: time runs left to right; the forecast is a gentle straight climb.
  const left = x + 24;
  const right = x + w - 24;
  const top = y + 48;
  const bottom = y + h - 24;
  context.strokeStyle = colour.grid;
  context.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const gy = top + ((bottom - top) * i) / 4;
    context.beginPath();
    context.moveTo(left, gy);
    context.lineTo(right, gy);
    context.stroke();
  }
  const span = right - left;
  const forecastY = (u: number) => bottom - (0.25 + 0.3 * u) * (bottom - top);
  const band = 0.07 * (bottom - top);
  // The envelope.
  context.fillStyle = colour.forecast;
  context.globalAlpha = opacity.envelopeBody * 2;
  context.beginPath();
  for (let i = 0; i <= 40; i++) context.lineTo(left + (span * i) / 40, forecastY(i / 40) - band);
  for (let i = 40; i >= 0; i--) context.lineTo(left + (span * i) / 40, forecastY(i / 40) + band);
  context.closePath();
  context.fill();
  context.globalAlpha = 1;
  // The issued forecast: dotted, to the end of the plot.
  context.strokeStyle = colour.forecast;
  context.lineWidth = 6;
  context.setLineDash(dash.forecast.map((d) => d * 3));
  context.beginPath();
  context.moveTo(left, forecastY(0));
  context.lineTo(right, forecastY(1));
  context.stroke();
  context.setLineDash([]);
  // The measured track: solid, up to now. It follows the forecast, then leaves the band.
  const start = 0.3;
  const now = start + (1 - start) * drift;
  const away = (u: number) => {
    const past = Math.max(0, (u - start) / (1 - start));
    return past * past * 0.55 * (bottom - top);
  };
  context.strokeStyle = colour.measured;
  context.lineWidth = 6;
  context.beginPath();
  for (let i = 0; i <= 60; i++) {
    const u = (now * i) / 60;
    const py = forecastY(u) - away(u);
    if (i) context.lineTo(left + span * u, Math.max(top, py));
    else context.moveTo(left + span * u, py);
  }
  context.stroke();
  // Where the ship is now.
  context.fillStyle = colour.measured;
  context.beginPath();
  context.arc(left + span * now, Math.max(top, forecastY(now) - away(now)), 9, 0, 2 * Math.PI);
  context.fill();
  context.restore();
  texture.needsUpdate = true;
}
