/**
 * Painted textures for the room's surfaces and the console's top. Colours and type come from
 * the theme; what is painted where is layout.
 */
import { RepeatWrapping } from 'three';
import type { CanvasTexture } from 'three';
import { colour, roomSurface, type } from '../../theme/index.ts';
import { rgba } from '../../theme/index.ts';
import { canvasTex, clamp, dressingRandom } from '../gfx.ts';

const TAU = Math.PI * 2;

/** Wall and ceiling panelling: brushed plates with seams and rivets; `bands` adds dado rails. */
export function panelTexture(bands: boolean): CanvasTexture {
  const r = dressingRandom(21);
  const s = roomSurface;
  const t = canvasTex(512, 512, (x, w, h) => {
    x.fillStyle = s.panel;
    x.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) {
      x.fillStyle = rgba(s.panelGrain, r() * s.panelGrainAlpha);
      x.fillRect(r() * w, r() * h, 1, 10 + r() * 40);
    }
    x.strokeStyle = s.panelSeam;
    x.lineWidth = 5;
    for (let i = 0; i <= 2; i++) {
      x.beginPath();
      x.moveTo(i * 256, 0);
      x.lineTo(i * 256, h);
      x.stroke();
    }
    if (bands)
      for (const yy of [0.12, 0.7]) {
        x.beginPath();
        x.moveTo(0, h * yy);
        x.lineTo(w, h * yy);
        x.stroke();
      }
    x.fillStyle = s.panelRivet;
    for (let i = 0; i < 2; i++)
      for (const yy of bands ? [0.03, 0.16, 0.66, 0.74] : [0.06, 0.94])
        for (const dx of [16, 240]) {
          x.beginPath();
          x.arc(i * 256 + dx, h * yy, 3, 0, TAU);
          x.fill();
        }
  });
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/** Deck plates. */
export function deckTexture(): CanvasTexture {
  const r = dressingRandom(4);
  const s = roomSurface;
  const t = canvasTex(512, 512, (x, w, h) => {
    x.fillStyle = s.deck;
    x.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      x.fillStyle = rgba(s.deckGrain, r() * s.deckGrainAlpha);
      x.fillRect(r() * w, r() * h, 2 + r() * 5, 1);
    }
    x.strokeStyle = s.deckSeam;
    x.lineWidth = 6;
    x.strokeRect(0, 0, w, h);
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(w / 2, 0);
    x.lineTo(w / 2, h);
    x.stroke();
    x.fillStyle = s.deckRivet;
    for (const [a, b] of [
      [18, 18],
      [w - 18, 18],
      [18, h - 18],
      [w - 18, h - 18],
    ] as const) {
      x.beginPath();
      x.arc(a, b, 4, 0, TAU);
      x.fill();
    }
  });
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/**
 * The console's top as seen from the room: the idle face of its screen around the projector
 * well. Set dressing; the working screen is the CONSOLE view (src/console).
 */
export function consoleTopTexture(): CanvasTexture {
  return canvasTex(1536, 840, (x, w, h) => {
    x.fillStyle = roomSurface.padBack;
    x.fillRect(0, 0, w, h);
    const r = dressingRandom(8);
    const panel = (X: number, Y: number, W: number, H: number, title: string, bb = false): void => {
      x.fillStyle = colour.panel;
      x.fillRect(X, Y, W, H);
      x.strokeStyle = colour.panelEdge;
      x.lineWidth = 2;
      x.strokeRect(X + 1, Y + 1, W - 2, H - 2);
      x.fillStyle = bb ? colour.blackbox : colour.inkDim;
      x.font = `${type.weight.strong} 17px ${type.family}`;
      x.fillText(title, X + 14, Y + 26);
    };
    const bars = (X: number, Y: number, W: number, n: number, bb = false): void => {
      for (let i = 0; i < n; i++) {
        x.fillStyle = colour.unknown;
        x.fillRect(X, Y + i * 26, W, 8);
        x.fillStyle = bb ? colour.blackbox : colour.ink;
        x.fillRect(X, Y + i * 26, W * (0.15 + r() * 0.7), 8);
      }
    };
    const trace = (
      X: number,
      Y: number,
      W: number,
      H: number,
      col: string,
      dash: number[] = [],
    ): void => {
      x.strokeStyle = colour.grid;
      x.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        x.beginPath();
        x.moveTo(X, Y + (H * i) / 4);
        x.lineTo(X + W, Y + (H * i) / 4);
        x.stroke();
      }
      x.strokeStyle = col;
      x.lineWidth = 3;
      x.setLineDash(dash);
      x.beginPath();
      let v = 0.5;
      for (let i = 0; i <= 60; i++) {
        v = clamp(v + (r() - 0.5) * 0.12, 0.1, 0.9);
        const px = X + (i / 60) * W;
        const py = Y + H - v * H;
        if (i) x.lineTo(px, py);
        else x.moveTo(px, py);
      }
      x.stroke();
      x.setLineDash([]);
    };
    panel(20, 20, 420, 380, 'EQUIPMENT');
    bars(40, 60, 380, 12);
    panel(20, 420, 420, 400, 'POWER');
    bars(40, 460, 380, 7);
    trace(40, 660, 380, 130, colour.ink);
    panel(1096, 20, 420, 380, 'MODEL');
    trace(1116, 70, 380, 140, colour.ink);
    trace(1116, 230, 380, 140, colour.forecast, [4, 8]);
    panel(1096, 420, 420, 400, 'BLACK BOX', true);
    bars(1116, 460, 380, 4, true);
    trace(1116, 590, 380, 200, colour.blackbox);
    panel(460, 20, 616, 110, 'PLAN');
    trace(480, 50, 576, 60, colour.forecast, [4, 8]);
    panel(460, 710, 616, 110, 'MISSION');
    trace(480, 740, 576, 60, colour.ink);
    // Projector well in the middle.
    x.fillStyle = roomSurface.well;
    x.beginPath();
    x.arc(w / 2, h / 2, 250, 0, TAU);
    x.fill();
    x.strokeStyle = colour.panelEdge;
    x.lineWidth = 3;
    for (const rad of [250, 205, 120]) {
      x.beginPath();
      x.arc(w / 2, h / 2, rad, 0, TAU);
      x.stroke();
    }
    x.strokeStyle = colour.inkFaint;
    x.lineWidth = 2;
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * TAU;
      const reach = i % 3 ? 228 : 240;
      x.beginPath();
      x.moveTo(w / 2 + Math.cos(a) * 215, h / 2 + Math.sin(a) * 215);
      x.lineTo(w / 2 + Math.cos(a) * reach, h / 2 + Math.sin(a) * reach);
      x.stroke();
    }
  });
}

/** A lit key cap for the console rail. */
export function padTexture(text: string): CanvasTexture {
  return canvasTex(512, 180, (x, w, h) => {
    x.fillStyle = roomSurface.padBack;
    x.fillRect(0, 0, w, h);
    x.strokeStyle = roomSurface.padInk;
    x.lineWidth = 6;
    x.strokeRect(9, 9, w - 18, h - 18);
    x.fillStyle = roomSurface.padInkHot;
    x.font = `${type.weight.strong} 62px ${type.family}`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(text, w / 2, h / 2 + 4);
  });
}

/** The lettering on Black Box's casing. */
export function recorderFaceTexture(): CanvasTexture {
  return canvasTex(512, 256, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.fillStyle = roomSurface.recorderInk;
    x.font = `${type.weight.strong} 58px ${type.family}`;
    x.textAlign = 'center';
    x.fillText('BLACK BOX', w / 2, 110);
    x.font = `${type.weight.strong} 30px ${type.family}`;
    x.fillText('FLIGHT RECORDER · DO NOT OPEN', w / 2, 170);
  });
}
