// The main console screen: what the player sees when they look down into the console.
// Placeholder pages in the Night Watch style; the real panels belong to the console thread.
import { colour as C, type as TY } from '../visual/theme.js';
import * as G from './gfx.js';

const rndFrom = (seed) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

const PAGES = {
  SYSTEMS: [
    { t: 'EQUIPMENT', r: 'BUS A · B · ESS', kind: 'bars', span: 2, rows: [['MAIN ENG', 0, 'READY'], ['RCS', 0.12, 'READY'], ['NAV CAM', 0.55, 'TRACK'], ['PROC', 0.4, 'OPNAV'],
      ['BLACK BOX', 0.3, 'REC', 'bbx'], ['RAD LOOP', 0.62, '2/2'], ['BATT A', 0.81, '81 %'], ['BATT B', 0.78, '78 %'], ['FUEL CELL A', 0.35, '2.1 kW'], ['FUEL CELL B', 0.33, '2.0 kW']] },
    { t: 'ALERTS', kind: 'list', span: 1, rows: [['▲', 'NAV σ RISING', 'caution'], ['○', 'RAD LOOP B STANDBY'], ['○', 'SOLAR STOWED']] },
    { t: 'CONFIGURATION', kind: 'list', span: 1, rows: [['RADIATORS', 'OUT'], ['SOLAR', 'STOWED'], ['FOOTPRINT', '16 × 20 m'], ['MASS', '30.4 t'], ['CoM', '+0.31 m']] },
    { t: 'CABIN LOOP', r: 'K', kind: 'trace', span: 2, seed: 31 },
    { t: 'PROPELLANT', r: '%', kind: 'trace', span: 2, seed: 77, fall: true },
  ],
  POWER: [
    { t: 'LOADS', r: 'W', kind: 'bars', span: 2, rows: [['ECLSS', 0.52, '1,180'], ['NAV CAM', 0.3, '420'], ['PROC', 0.44, '610'], ['BLACK BOX', 0.2, '160', 'bbx'], ['PUMPS', 0.25, '310'], ['HEATERS', 0.38, '520'], ['COMMS', 0.05, '40']] },
    { t: 'SOURCES', r: 'W', kind: 'bars', span: 2, rows: [['FUEL CELL A', 0.35, '2,100'], ['FUEL CELL B', 0.33, '2,000'], ['BATT A', 0.0, 'IDLE'], ['BATT B', 0.0, 'IDLE'], ['SOLAR L', 0, 'STOWED'], ['SOLAR R', 0, 'STOWED']] },
    { t: 'BUS A · BUS B', r: 'V', kind: 'trace', span: 3, seed: 12, two: true },
    { t: 'PROTECTION', kind: 'list', span: 1, rows: [['MAIN A', 'CLOSED'], ['MAIN B', 'CLOSED'], ['TIE', 'OPEN'], ['ESSENTIAL', 'DUAL FEED']] },
  ],
  THERMAL: [
    { t: 'LOOP TEMPERATURES', r: 'K', kind: 'trace', span: 3, seed: 5, two: true },
    { t: 'RADIATORS', kind: 'list', span: 1, rows: [['LEFT', 'OUT · 3.1 kW'], ['RIGHT', 'OUT · 3.0 kW'], ['VIEW', 'CLEAR'], ['PUMP A', 'ACTIVE'], ['PUMP B', 'STANDBY']] },
    { t: 'HEAT BY SOURCE', r: 'W', kind: 'bars', span: 4, rows: [['CABIN', 0.5, '2,300'], ['AVIONICS', 0.22, '640'], ['FUEL CELLS', 0.41, '1,900'], ['PROC', 0.2, '610'], ['ENGINE SOAK', 0.05, '90']] },
  ],
  MODEL: [
    { t: 'RESIDUAL VS DISTANCE', r: 'σ', kind: 'resid', span: 2 },
    { t: 'PARAMETERS', r: 'v 7', kind: 'list', span: 2, rows: [['M1 · GM', '1.02e10 ± 4 %'], ['M2 · GM', '2.3e9 ± 19 %', 'caution'], ['MAIN ENG SCALE', '0.994 ± 0.3 %'], ['NAV CAM BIAS', '+0.4 ± 0.2 mrad'], ['DISTANCE LAW', 'r⁻² (ASSUMED)']] },
    { t: 'FORECAST VS MEASURED', r: 'km', kind: 'trace', span: 3, seed: 44, fc: true },
    { t: 'EXTENSIONS', kind: 'list', span: 1, rows: [['DISTANCE LAW FAMILY', 'OFF'], ['SECOND BODY', 'ON'], ['HELD-OUT TEST', '—']] },
  ],
  DATA: [
    { t: 'RECORDING', kind: 'bars', span: 2, rows: [['STORE', 0.37, '37 %', 'bbx'], ['RATE', 0.5, 'NORMAL', 'bbx'], ['PROC SHARE', 0.44, '610 W']] },
    { t: 'MEASUREMENTS', r: 'THIS ATTEMPT', kind: 'list', span: 2, rows: [['OPTICAL FIXES', '164'], ['ACCELEROMETER', '5 BURNS'], ['STAR TRACKER', 'CONTINUOUS'], ['BEARINGS', '3'], ['UNEXPLAINED CHANNEL', '1', 'caution']] },
    { t: 'FIX QUALITY', r: 'σ km', kind: 'trace', span: 4, seed: 91 },
  ],
  'BLACK BOX': [
    { t: 'ATTEMPTS', r: 'REC', kind: 'cells', span: 4 },
    { t: 'ATTEMPT 3 · ATTEMPT 4', r: 'km', kind: 'trace', span: 2, seed: 23, prev: true },
    { t: 'WHAT CHANGED', kind: 'list', span: 1, rows: [['BURN START', 'T+7 → T+9'], ['THROTTLE', '0.42 → 0.30'], ['NAV CAM', 'SURVEY → TRACK'], ['RADIATORS', 'SAME']] },
    { t: 'WHERE IT DIVERGED', kind: 'list', span: 1, rows: [['FROM FORECAST', 'T+14 s', 'caution'], ['FROM ATTEMPT 3', 'T+9 s'], ['COASTING', '2.3σ'], ['POWERED', '0.7σ']] },
  ],
  PLAN: [
    { t: 'TIMELINE', kind: 'list', span: 2, rows: [['T+09', 'MAIN · 2 s · PROGRADE · 0.30'], ['T+26', 'YAW +12° · HOLD M1'], ['T+31', 'NAV CAM → DETAIL'], ['T+40', 'MAIN · 1 s · RADIAL IN']] },
    { t: 'PROCEDURES', kind: 'list', span: 2, rows: [['BROAD PASS', 'CONDITIONS DIFFER', 'caution'], ['BASELINE CHECK', 'MATCHES'], ['STAGGERED LOADS', 'MATCHES']] },
    { t: 'PROPELLANT ACROSS PLAN', r: '%', kind: 'trace', span: 4, seed: 61, fall: true, fc: true },
  ],
};

function prep(c) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = c.clientWidth;
  const h = c.clientHeight;
  c.width = w * dpr;
  c.height = h * dpr;
  const x = c.getContext('2d');
  x.scale(dpr, dpr);
  x.font = `11px ${TY.family}`;
  return [x, w, h];
}

function grid(x, w, h, nx = 8, ny = 4) {
  x.strokeStyle = C.grid;
  x.lineWidth = 1;
  x.beginPath();
  for (let i = 1; i < nx; i++) { x.moveTo((w * i) / nx + 0.5, 0); x.lineTo((w * i) / nx + 0.5, h); }
  for (let i = 1; i < ny; i++) { x.moveTo(0, (h * i) / ny + 0.5); x.lineTo(w, (h * i) / ny + 0.5); }
  x.stroke();
}

function series(seed, n, fall) {
  const r = rndFrom(seed);
  const out = [];
  let v = fall ? 0.85 : 0.5;
  for (let i = 0; i < n; i++) {
    v = G.clamp(v + (r() - 0.5) * 0.07 - (fall ? 0.004 : 0), 0.1, 0.9);
    out.push(v);
  }
  return out;
}

function plot(x, w, h, ys, colour, width, dash) {
  x.strokeStyle = colour;
  x.lineWidth = width;
  x.setLineDash(dash ?? []);
  x.beginPath();
  ys.forEach((v, i) => {
    const px = (i / (ys.length - 1)) * w;
    const py = h - v * h;
    if (i) x.lineTo(px, py);
    else x.moveTo(px, py);
  });
  x.stroke();
  x.setLineDash([]);
}

const DRAW = {
  bars(c, p) {
    const [x, w, h] = prep(c);
    const rh = Math.min(26, h / p.rows.length);
    p.rows.forEach(([name, f, val, cls], i) => {
      const y = i * rh + rh / 2;
      const col = cls === 'bbx' ? C.blackbox : C.ink;
      x.fillStyle = C.inkDim;
      x.textBaseline = 'middle';
      x.textAlign = 'left';
      x.fillText(name, 0, y);
      const bx = 96;
      const bw = w - bx - 70;
      x.fillStyle = C.unknown;
      x.fillRect(bx, y - 3, bw, 6);
      x.fillStyle = col;
      x.fillRect(bx, y - 3, bw * f, 6);
      x.textAlign = 'right';
      x.fillStyle = col;
      x.fillText(val, w, y);
    });
  },
  trace(c, p) {
    const [x, w, h] = prep(c);
    grid(x, w, h);
    const n = 120;
    const a = series(p.seed, n, p.fall);
    if (p.two) plot(x, w, h, series(p.seed + 9, n), C.inkDim, 1);
    if (p.prev) plot(x, w, h, a.map((v, i) => v + Math.max(0, i - 40) * 0.0035), C.blackbox, 1.3);
    if (p.fc) {
      const cut = Math.floor(n * 0.6);
      plot(x, (w * cut) / (n - 1), h, a.slice(0, cut + 1), C.measured, 1.8);
      x.save();
      x.translate((w * cut) / (n - 1), 0);
      plot(x, w - (w * cut) / (n - 1), h, a.slice(cut).map((v, i) => v - i * 0.003), C.forecast, 1.6, [2, 4]);
      x.restore();
    } else plot(x, w, h, a, C.measured, 1.8);
  },
  resid(c) {
    const [x, w, h] = prep(c);
    grid(x, w, h);
    const r = rndFrom(3);
    // 2-sigma band, then residuals that climb with distance: the model's structure is wrong.
    x.fillStyle = 'rgba(121, 201, 196, 0.12)';
    x.fillRect(0, h * 0.5, w, h * 0.3);
    x.strokeStyle = C.forecast;
    x.setLineDash([2, 3]);
    x.beginPath();
    x.moveTo(0, h * 0.5);
    x.lineTo(w, h * 0.5);
    x.stroke();
    x.setLineDash([]);
    for (let i = 0; i < 46; i++) {
      const u = r();
      const v = 0.65 + (r() - 0.5) * 0.16 - Math.max(0, u - 0.45) ** 1.6 * 1.35;
      x.fillStyle = v < 0.5 ? C.caution : C.ink;
      x.fillRect(u * w - 1.5, v * h - 1.5, 3, 3);
    }
  },
  cells(c) {
    const [x, w, h] = prep(c);
    const n = 4;
    const cw = Math.min(150, w / 6);
    for (let i = 0; i < n; i++) {
      const X = i * (cw + 10);
      const cur = i === n - 1;
      x.strokeStyle = cur ? C.blackbox : C.inkFaint;
      x.lineWidth = cur ? 2 : 1;
      x.strokeRect(X + 1, 1, cw, h - 2);
      x.fillStyle = cur ? C.blackbox : C.inkDim;
      x.textBaseline = 'top';
      x.textAlign = 'left';
      x.fillText(`ATTEMPT ${i + 1}`, X + 8, 8);
      x.fillStyle = C.inkDim;
      x.fillText(['✕ LOST · ROCK', '↺ RECALL', '✕ LOST · HEAT', '● RECORDING'][i], X + 8, 24);
      x.save();
      x.translate(X + 8, 46);
      plot(x, cw - 16, h - 56, series(40 + i, 30), cur ? C.blackbox : C.inkFaint, 1.2);
      x.restore();
    }
  },
};

/** Fill #console-screen and return { show(page) }. */
export function initConsoleScreen(root) {
  root.innerHTML = `
    <div class="cs-frame">
      <nav class="cs-tabs">${Object.keys(PAGES).map((k) => `<button data-page="${k}"${k === 'BLACK BOX' ? ' class="bbx"' : ''}>${k}</button>`).join('')}</nav>
      <div class="cs-grid"></div>
      <footer class="cs-foot"><span>MET 00:41:07</span><span id="cs-attempt">ATTEMPT 4</span><span class="cs-back">ESC ▸ STEP BACK</span></footer>
    </div>`;
  const gridEl = root.querySelector('.cs-grid');
  let page = 'SYSTEMS';

  function render() {
    root.querySelectorAll('.cs-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.page === page));
    gridEl.innerHTML = PAGES[page].map((p, i) => `
      <section class="panel" style="grid-column: span ${p.span}">
        <header class="ph"><span>${p.t}</span><span class="ph-r">${p.r ?? ''}</span></header>
        ${p.kind === 'list'
          ? `<dl class="cs-list">${p.rows.map(([k, v, c]) => `<dt>${k}</dt><dd class="${c ?? ''}">${v ?? ''}</dd>`).join('')}</dl>`
          : `<canvas data-i="${i}"></canvas>`}
      </section>`).join('');
    gridEl.querySelectorAll('canvas').forEach((c) => {
      const p = PAGES[page][Number(c.dataset.i)];
      DRAW[p.kind](c, p);
    });
  }
  root.querySelectorAll('.cs-tabs button').forEach((b) => (b.onclick = () => { page = b.dataset.page; render(); }));
  addEventListener('resize', () => { if (root.classList.contains('on')) render(); });
  return {
    show(p) { if (p) page = p; render(); },
    setAttempt(n) { root.querySelector('#cs-attempt').textContent = `ATTEMPT ${n}`; },
  };
}

/** The same console, seen from the room: a dim emissive texture for the table top. */
export function consoleTopTexture() {
  return G.canvasTex(1536, 840, (x, w, h) => {
    x.fillStyle = '#0a0806';
    x.fillRect(0, 0, w, h);
    const r = rndFrom(8);
    const panel = (X, Y, W, H, title, bb) => {
      x.fillStyle = C.panel;
      x.fillRect(X, Y, W, H);
      x.strokeStyle = C.panelEdge;
      x.lineWidth = 2;
      x.strokeRect(X + 1, Y + 1, W - 2, H - 2);
      x.fillStyle = bb ? C.blackbox : C.inkDim;
      x.font = `600 17px ${TY.family}`;
      x.fillText(title, X + 14, Y + 26);
    };
    const bars = (X, Y, W, n, bb) => {
      for (let i = 0; i < n; i++) {
        x.fillStyle = C.unknown;
        x.fillRect(X, Y + i * 26, W, 8);
        x.fillStyle = bb ? C.blackbox : C.ink;
        x.fillRect(X, Y + i * 26, W * (0.15 + r() * 0.7), 8);
      }
    };
    const trace = (X, Y, W, H, col, dash) => {
      x.strokeStyle = C.grid;
      x.lineWidth = 1;
      for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo(X, Y + (H * i) / 4); x.lineTo(X + W, Y + (H * i) / 4); x.stroke(); }
      x.strokeStyle = col;
      x.lineWidth = 3;
      x.setLineDash(dash ?? []);
      x.beginPath();
      let v = 0.5;
      for (let i = 0; i <= 60; i++) {
        v = G.clamp(v + (r() - 0.5) * 0.12, 0.1, 0.9);
        const px = X + (i / 60) * W;
        const py = Y + H - v * H;
        if (i) x.lineTo(px, py);
        else x.moveTo(px, py);
      }
      x.stroke();
      x.setLineDash([]);
    };
    panel(20, 20, 420, 380, 'EQUIPMENT'); bars(40, 60, 380, 12);
    panel(20, 420, 420, 400, 'POWER'); bars(40, 460, 380, 7); trace(40, 660, 380, 130, C.ink);
    panel(1096, 20, 420, 380, 'MODEL'); trace(1116, 70, 380, 140, C.ink); trace(1116, 230, 380, 140, C.forecast, [4, 8]);
    panel(1096, 420, 420, 400, 'BLACK BOX', true); bars(1116, 460, 380, 4, true); trace(1116, 590, 380, 200, C.blackbox);
    panel(460, 20, 616, 110, 'PLAN'); trace(480, 50, 576, 60, C.forecast, [4, 8]);
    panel(460, 710, 616, 110, 'THERMAL'); trace(480, 740, 576, 60, C.ink);
    // Projector well in the middle.
    x.fillStyle = '#050403';
    x.beginPath();
    x.arc(w / 2, h / 2, 250, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = C.panelEdge;
    x.lineWidth = 3;
    for (const rad of [250, 205, 120]) { x.beginPath(); x.arc(w / 2, h / 2, rad, 0, Math.PI * 2); x.stroke(); }
    x.strokeStyle = C.inkFaint;
    x.lineWidth = 2;
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      x.beginPath();
      x.moveTo(w / 2 + Math.cos(a) * 215, h / 2 + Math.sin(a) * 215);
      x.lineTo(w / 2 + Math.cos(a) * (i % 3 ? 228 : 240), h / 2 + Math.sin(a) * (i % 3 ? 228 : 240));
      x.stroke();
    }
  });
}

/** A lit key cap for the console rail. */
export function padTexture(text, bbx = false) {
  return G.canvasTex(512, 180, (x, w, h) => {
    x.fillStyle = '#0d0a07';
    x.fillRect(0, 0, w, h);
    x.strokeStyle = bbx ? C.blackbox : C.inkDim;
    x.lineWidth = 6;
    x.strokeRect(9, 9, w - 18, h - 18);
    x.fillStyle = bbx ? C.blackbox : C.ink;
    x.font = `600 62px ${TY.family}`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(text, w / 2, h / 2 + 4);
  });
}
