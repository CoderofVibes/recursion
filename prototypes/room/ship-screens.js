// Readout panels for the ship view: an overview, and one screen per system with a schematic, levels,
// trends, key numbers and the selected component. Numbers come from data/ship-baseline.json at its
// initial modes wherever the baseline has them; the rest are placeholders and marked as such in the
// handoff. The real panels belong to the console thread.
import { colour as C, type as TY } from '../visual/theme.js';
import { EQUIPMENT, BUSES, RES, SHIP, FOOTPRINTS, MAIN_ENGINE } from './ship-data.js';
import { SYSTEMS } from './ship-parts.js';

const EQ = new Map(EQUIPMENT.map((e) => [e.id, e]));
const G0 = 9.80665;
const fmt = (v, d = 0) => v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const NAME = (id) => id.replace(/-/g, ' ').toUpperCase();
const rndFrom = (seed) => {
  let s = seed || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

function prep(c) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  // The panel may be drawn while its column is hidden; fall back to the styled size.
  const w = c.clientWidth || 304;
  const h = c.clientHeight || parseFloat(c.style.height) || 42;
  c.width = w * dpr;
  c.height = h * dpr;
  const x = c.getContext('2d');
  x.scale(dpr, dpr);
  return [x, w, h];
}

/** Boxes on a grid joined by right-angled lines. */
function diagram(c, { cols, rows, nodes, links }) {
  const [x, w, h] = prep(c);
  const cw = w / cols;
  const ch = h / rows;
  const box = (n) => {
    const bw = cw * (n.w ?? 1) - 8;
    const bh = Math.min(ch - 8, 30);
    return { x: n.c * cw + 4, y: n.r * ch + (ch - bh) / 2, w: bw, h: bh };
  };
  const by = new Map(nodes.map((n) => [n.id, n]));
  x.lineWidth = 1;
  for (const [a, b, cls] of links) {
    const A = box(by.get(a));
    const B = box(by.get(b));
    x.strokeStyle = cls === 'off' ? C.inkFaint : C.inkDim;
    x.setLineDash(cls === 'off' ? [3, 3] : []);
    x.beginPath();
    if (Math.abs(A.x - B.x) < 2) {
      x.moveTo(A.x + A.w / 2, A.y + A.h);
      x.lineTo(B.x + B.w / 2, B.y);
    } else {
      const fwd = B.x > A.x;
      const x0 = fwd ? A.x + A.w : A.x;
      const x1 = fwd ? B.x : B.x + B.w;
      const mx = (x0 + x1) / 2;
      x.moveTo(x0, A.y + A.h / 2);
      x.lineTo(mx, A.y + A.h / 2);
      x.lineTo(mx, B.y + B.h / 2);
      x.lineTo(x1, B.y + B.h / 2);
    }
    x.stroke();
  }
  x.setLineDash([]);
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  for (const n of nodes) {
    const b = box(n);
    const col = n.cls === 'bbx' ? C.blackbox : n.cls === 'off' ? C.inkFaint : n.cls === 'caution' ? C.caution : C.ink;
    x.fillStyle = C.panel;
    x.fillRect(b.x, b.y, b.w, b.h);
    x.strokeStyle = col;
    x.lineWidth = n.cls === 'bus' ? 2 : 1;
    x.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    x.fillStyle = col;
    x.font = `600 9px ${TY.family}`;
    x.fillText(n.label, b.x + b.w / 2, b.y + (n.sub ? b.h / 2 - 5 : b.h / 2));
    if (n.sub) {
      x.fillStyle = n.cls === 'off' ? C.inkFaint : C.inkDim;
      x.font = `9px ${TY.family}`;
      x.fillText(n.sub, b.x + b.w / 2, b.y + b.h / 2 + 6);
    }
  }
}

function trend(c, { seed, base = 0.5, drift = 0, limit, colour = C.measured }) {
  const [x, w, h] = prep(c);
  x.strokeStyle = C.grid;
  x.lineWidth = 1;
  x.beginPath();
  for (let i = 1; i < 6; i++) { x.moveTo((w * i) / 6 + 0.5, 0); x.lineTo((w * i) / 6 + 0.5, h); }
  for (let i = 1; i < 3; i++) { x.moveTo(0, (h * i) / 3 + 0.5); x.lineTo(w, (h * i) / 3 + 0.5); }
  x.stroke();
  if (limit != null) {
    x.strokeStyle = C.caution;
    x.setLineDash([4, 4]);
    x.beginPath();
    x.moveTo(0, h - limit * h);
    x.lineTo(w, h - limit * h);
    x.stroke();
    x.setLineDash([]);
  }
  const r = rndFrom(seed);
  x.strokeStyle = colour;
  x.lineWidth = 1.6;
  x.beginPath();
  let v = base;
  for (let i = 0; i <= 90; i++) {
    v = Math.min(0.94, Math.max(0.06, v + (r() - 0.5) * 0.05 + drift));
    const px = (i / 90) * w;
    if (i) x.lineTo(px, h - v * h);
    else x.moveTo(px, h - v * h);
  }
  x.stroke();
}

function footprint(c, cfg, com) {
  const [x, w, h] = prep(c);
  const k = Math.min(w / 30, h / 19);
  const X = (bx) => w / 2 + bx * k * 1.05;
  const Y = (by) => h / 2 - by * k * 0.72;
  x.strokeStyle = C.grid;
  x.lineWidth = 1;
  for (let m = -12; m <= 12; m += 4) { x.beginPath(); x.moveTo(X(-10), Y(m)); x.lineTo(X(10), Y(m)); x.stroke(); }
  for (let m = -8; m <= 8; m += 4) { x.beginPath(); x.moveTo(X(m), Y(-12)); x.lineTo(X(m), Y(12)); x.stroke(); }
  const poly = (pts, col, lw, dash) => {
    x.strokeStyle = col;
    x.lineWidth = lw;
    x.setLineDash(dash ?? []);
    x.beginPath();
    pts.forEach(([a, b], i) => (i ? x.lineTo(X(a), Y(b)) : x.moveTo(X(a), Y(b))));
    x.closePath();
    x.stroke();
    x.setLineDash([]);
  };
  poly(FOOTPRINTS[cfg], C.ink, 1.6);
  poly(FOOTPRINTS.stowed, C.inkDim, 1, [3, 3]);
  x.strokeStyle = C.ink;
  x.beginPath();
  x.arc(X(com[0]), Y(com[1]), 4, 0, 7);
  x.moveTo(X(com[0]) - 7, Y(com[1]));
  x.lineTo(X(com[0]) + 7, Y(com[1]));
  x.moveTo(X(com[0]), Y(com[1]) - 7);
  x.lineTo(X(com[0]), Y(com[1]) + 7);
  x.stroke();
  x.strokeStyle = C.thrust;
  x.setLineDash([4, 3]);
  x.beginPath();
  x.moveTo(X(-8), Y(0.08));
  x.lineTo(X(8), Y(0.08));
  x.stroke();
  x.setLineDash([]);
  x.fillStyle = C.inkDim;
  x.font = `9px ${TY.family}`;
  x.fillText('FWD ▸', X(8) + 4, Y(0) + 3);
}

/** What each system's screen shows. st = { modeOf, frac, config, com }. */
function screen(sys, st) {
  const mode = (id) => st.modeOf.get(id);
  const m = (id) => EQ.get(id).modes[mode(id)] ?? { power: 0, heat: 0, gen: 0 };
  const sumBy = (pred, key) => EQUIPMENT.filter(pred).reduce((a, e) => a + (m(e.id)[key] || 0), 0);
  const busLoad = (b) => sumBy((e) => e.bus === b, 'power');
  const load = sumBy(() => true, 'power');
  const heat = sumBy(() => true, 'heat');
  const state = (id) => mode(id).toUpperCase();
  const on = (id) => (mode(id) === 'off' || mode(id) === 'standby' || mode(id) === 'stowed' ? 'off' : '');
  const prop = Object.fromEntries(RES.propellant.map((p) => [p.id, p]));
  const dv = (isp, mp) => G0 * isp * Math.log(SHIP.wetMass / (SHIP.wetMass - mp));
  const rej = (f) => RES.radiatorEmissivity * 5.670374e-8 * (5 + (RES.radiatorAreaPerWing - 5) * f) * 285 ** 4;
  const L = RES.life;
  const days = (kg, rate) => kg / (rate * L.crew * 86400);

  switch (sys) {
    case 'power': {
      const fc = Math.max(0, load) / 2;
      return {
        status: 'FUEL CELLS FOLLOWING · SOLAR STOWED',
        diagram: { cols: 4, rows: 5,
          nodes: [
            { id: 'sl', c: 0, r: 0, label: 'SOLAR L', sub: st.frac.sol > 0.9 ? 'NO LIGHT' : 'STOWED', cls: 'off' }, { id: 'fa', c: 0, r: 1, label: 'FUEL CELL A', sub: `${fmt(fc)} W` },
            { id: 'ba', c: 0, r: 2, label: 'BATTERY A', sub: '81 %' }, { id: 'A', c: 1, r: 1, label: 'MAIN A', sub: '120 V', cls: 'bus' },
            { id: 'sr', c: 3, r: 0, label: 'SOLAR R', sub: st.frac.sol > 0.9 ? 'NO LIGHT' : 'STOWED', cls: 'off' }, { id: 'fb', c: 3, r: 1, label: 'FUEL CELL B', sub: `${fmt(fc)} W` },
            { id: 'bb', c: 3, r: 2, label: 'BATTERY B', sub: '78 %' }, { id: 'B', c: 2, r: 1, label: 'MAIN B', sub: '120 V', cls: 'bus' },
            { id: 'E', c: 1, r: 3, label: 'ESSENTIAL', sub: '28 V · DUAL FEED', cls: 'bus', w: 2 }, { id: 'P', c: 1, r: 4, label: 'PAYLOAD', sub: `${fmt(busLoad('payload'))} W`, w: 2 },
          ],
          links: [['sl', 'A', 'off'], ['fa', 'A'], ['ba', 'A'], ['sr', 'B', 'off'], ['fb', 'B'], ['bb', 'B'], ['A', 'B', 'off'], ['A', 'E'], ['E', 'P']] },
        bars: [
          ...BUSES.map((b) => ({ k: `${b.id.toUpperCase()} LOAD`, v: busLoad(b.id) / b.maxPower, t: `${fmt(busLoad(b.id))} / ${fmt(b.maxPower)} W` })),
          { k: 'FUEL CELL A', v: fc / RES.fuelCellMaxPerStack, t: `${fmt(fc)} W` }, { k: 'FUEL CELL B', v: fc / RES.fuelCellMaxPerStack, t: `${fmt(fc)} W` },
          { k: 'BATTERY A', v: 0.81, t: '81 %' }, { k: 'BATTERY B', v: 0.78, t: '78 %' },
          { k: 'HYDROGEN', v: 1, t: `${RES.reactants[0].mass} kg` }, { k: 'OXYGEN', v: 1, t: `${RES.reactants[1].mass} kg` },
        ],
        trends: [{ t: 'BUS LOAD', u: 'kW', v: (load / 1000).toFixed(2), seed: 12, base: 0.4 }, { t: 'BATTERY A · B', u: '%', v: '81 · 78', seed: 31, base: 0.8, drift: -0.0006 }],
        nums: [['TOTAL LOAD', `${fmt(load)} W`], ['SUPPLY', `${fmt(fc * 2)} W`], ['SOLAR CEILING', `${fmt((RES.solarMaxPerWing * 2) / 1000)} kW`], ['BUS TIE', `OPEN · ${fmt(RES.tieMaxPower / 1000)} kW`]],
      };
    }
    case 'thermal': {
      const n = Object.fromEntries(RES.thermalNodes.map((t) => [t.id, t]));
      const cap = rej(st.frac.rad) * 2;
      const bar = (id, lo, hi) => ({ k: NAME(id), v: (n[id].t - lo) / (hi - lo), lim: (n[id].warn - lo) / (hi - lo), t: `${n[id].t} K` });
      return {
        status: st.frac.rad > 0.9 ? 'RADIATORS OUT · LOOPS RUNNING' : '▲ RADIATORS STOWED · REJECTION LIMITED', alert: st.frac.rad <= 0.9,
        diagram: { cols: 4, rows: 3,
          nodes: [
            { id: 'cab', c: 0, r: 1, label: 'CABIN', sub: `${n.cabin.t} K` }, { id: 'pa', c: 1, r: 0, label: 'PUMP A', sub: state('internal-pump-a') }, { id: 'pb', c: 1, r: 2, label: 'PUMP B', sub: state('internal-pump-b'), cls: on('internal-pump-b') },
            { id: 'hx', c: 2, r: 1, label: 'INTERFACE HX', sub: `${n['hx-water'].t} K` }, { id: 'rl', c: 3, r: 0, label: 'RADIATOR L', sub: `${fmt(rej(st.frac.rad) / 1000, 1)} kW` }, { id: 'rr', c: 3, r: 2, label: 'RADIATOR R', sub: `${fmt(rej(st.frac.rad) / 1000, 1)} kW` },
          ],
          links: [['cab', 'pa'], ['cab', 'pb', on('internal-pump-b')], ['pa', 'hx'], ['pb', 'hx', on('internal-pump-b')], ['hx', 'rl'], ['hx', 'rr']] },
        bars: [bar('cabin', 280, 320), bar('service', 280, 340), bar('external-loop', 260, 345),
          { k: 'HEAT LOAD', v: heat / RES.loopMaxHeat[0].max, t: `${fmt(heat)} / ${fmt(RES.loopMaxHeat[0].max)} W` },
          { k: 'REJECTION', v: Math.min(1, heat / cap), lim: 0.8, t: `${fmt(heat / 1000, 1)} / ${fmt(cap / 1000, 1)} kW`, alert: heat > cap * 0.8 }],
        trends: [{ t: 'CABIN', u: 'K', v: n.cabin.t, seed: 5, base: 0.42, limit: 0.74 }, { t: 'EXTERNAL LOOP', u: 'K', v: n['external-loop'].t, seed: 9, base: 0.35, drift: st.frac.rad > 0.9 ? 0 : 0.004, limit: 0.8 }],
        nums: [['RADIATING AREA', `${fmt(2 * (5 + (RES.radiatorAreaPerWing - 5) * st.frac.rad))} m²`], ['EMISSIVITY', RES.radiatorEmissivity], ['WATER FREEZE', '273 K'], ['SINK', '3 K']],
      };
    }
    case 'propulsion': {
      const b = (id, label) => ({ k: label, v: prop[id].mass / prop[id].capacity, t: `${fmt(prop[id].mass)} kg` });
      return {
        status: 'MAIN READY · RCS BANK A · ION OFF',
        diagram: { cols: 3, rows: 4,
          nodes: [
            { id: 'mt', c: 0, r: 0, label: 'MAIN TANK', sub: `${fmt(prop['main-propellant'].mass)} kg` }, { id: 'v', c: 1, r: 0, label: 'VALVES', sub: 'CLOSED' }, { id: 'me', c: 2, r: 0, label: 'MAIN ENGINE', sub: state('main-engine') },
            { id: 'rt', c: 0, r: 1, label: 'RCS TANKS', sub: '150 + 150 kg' }, { id: 'rf', c: 2, r: 1, label: 'PODS FWD L·R', sub: state('rcs-forward-left') }, { id: 'ra', c: 2, r: 2, label: 'PODS AFT L·R', sub: state('rcs-aft-left') },
            { id: 'xe', c: 0, r: 3, label: 'XENON', sub: `${prop.xenon.mass} kg` }, { id: 'pp', c: 1, r: 3, label: 'POWER UNIT', sub: 'OFF', cls: 'off' }, { id: 'io', c: 2, r: 3, label: 'ION DRIVE', sub: state('ion-drive'), cls: on('ion-drive') },
          ],
          links: [['mt', 'v'], ['v', 'me'], ['rt', 'rf'], ['rt', 'ra'], ['xe', 'pp', 'off'], ['pp', 'io', 'off']] },
        bars: [b('main-propellant', 'MAIN PROPELLANT'), b('rcs-left', 'RCS LEFT'), b('rcs-right', 'RCS RIGHT'), b('xenon', 'XENON'),
          { k: 'THRUST ARM', v: Math.abs(0.08 - st.com[1]) / 0.5, t: `${Math.round(Math.abs(0.08 - st.com[1]) * 100)} cm` }],
        trends: [{ t: 'CHAMBER', u: 'K', v: '291', seed: 3, base: 0.2 }, { t: 'TANK PRESSURE', u: 'MPa', v: '1.72', seed: 8, base: 0.6 }],
        nums: [['THRUST', `${fmt(MAIN_ENGINE.thrust / 1000, 1)} kN`], ['SPECIFIC IMPULSE', `${MAIN_ENGINE.isp} s`], ['Δv MAIN', `${fmt(dv(MAIN_ENGINE.isp, prop['main-propellant'].mass))} m/s`],
          ['Δv ION', `${fmt(dv(prop.xenon.isp, prop.xenon.mass))} m/s`], ['GIMBAL', '±2.0°'], ['RCS JET', '200 N']],
      };
    }
    case 'guidance': {
      const cam = RES.camera;
      return {
        status: 'TRACKING M1 · ATTITUDE HOLD',
        diagram: { cols: 4, rows: 3,
          nodes: [
            { id: 'st', c: 0, r: 0, label: 'STAR TRK A·B', sub: 'LOCKED' }, { id: 'im', c: 0, r: 1, label: 'INERTIAL A·B', sub: 'THRUST ONLY' }, { id: 'cam', c: 0, r: 2, label: 'NAV CAMERA', sub: state('camera') },
            { id: 'sp', c: 1, r: 2, label: 'SCIENCE PROC', sub: state('science-processor') }, { id: 'ca', c: 2, r: 0, label: 'COMPUTER A', sub: state('flight-cpu-a') }, { id: 'cb', c: 2, r: 2, label: 'COMPUTER B', sub: state('flight-cpu-b'), cls: on('flight-cpu-b') },
            { id: 'co', c: 3, r: 0, label: 'CONSOLE', sub: 'FORECAST' }, { id: 'bx', c: 3, r: 2, label: 'BLACK BOX', sub: 'REC', cls: 'bbx' },
          ],
          links: [['st', 'ca'], ['im', 'ca'], ['cam', 'sp'], ['sp', 'ca'], ['sp', 'cb', on('flight-cpu-b')], ['ca', 'co'], ['ca', 'bx']] },
        bars: [{ k: 'CAMERA POWER', v: m('camera').power / 200, t: `${fmt(m('camera').power)} W` }, { k: 'PROCESSING', v: m('science-processor').power / 700, t: `${fmt(m('science-processor').power)} W` },
          { k: 'COMPUTER A', v: 0.46, t: '46 %' }, { k: 'COVERAGE', v: 52 / 360, t: '52° OF 360°' }, { k: 'FIX AGE', v: 0.12, t: '1.2 s' }],
        trends: [{ t: 'FIX σ', u: 'km', v: fmt(cam.range * cam.sigma, 2), seed: 91, base: 0.3, limit: 0.7 }, { t: 'POINTING ERROR', u: 'mrad', v: '0.4', seed: 44, base: 0.25 }],
        nums: [['ANGULAR σ', `${fmt(cam.sigma * 1e6)} µrad`], ['AT RANGE', `${fmt(cam.range)} km`], ['GRAVITY', 'INFERRED FROM TRACK'], ['MODEL', 'v 7']],
      };
    }
    case 'data': {
      const rec = RES.recorder;
      return {
        status: 'RECORDING · NO LINK', orange: true,
        diagram: { cols: 3, rows: 4,
          nodes: [
            { id: 't', c: 0, r: 0, label: 'TELEMETRY' }, { id: 'me', c: 0, r: 1, label: 'MEASUREMENTS' }, { id: 'cm', c: 0, r: 2, label: 'COMMANDS' }, { id: 'f', c: 0, r: 3, label: 'FORECASTS', sub: 'AS ISSUED' },
            { id: 'bb', c: 1, r: 1, label: 'BLACK BOX', sub: state('black-box'), cls: 'bbx' }, { id: 'mo', c: 2, r: 0, label: 'MODEL', sub: 'REBUILT FROM RECORD' }, { id: 'at', c: 2, r: 1, label: 'ATTEMPTS', sub: '3 HELD' },
            { id: 'ch', c: 2, r: 2, label: 'CHANNEL 7', sub: '▲ UNEXPLAINED', cls: 'caution' }, { id: 'hg', c: 2, r: 3, label: 'ANTENNA', sub: 'NO LINK', cls: 'off' },
          ],
          links: [['t', 'bb'], ['me', 'bb'], ['cm', 'bb'], ['f', 'bb'], ['bb', 'mo'], ['bb', 'at'], ['bb', 'ch'], ['bb', 'hg', 'off']] },
        bars: [{ k: 'STORE', v: 0.37, t: `${fmt((rec.capacity * 0.37) / 1e9, 2)} / ${fmt(rec.capacity / 1e9)} GB`, bbx: true }, { k: 'SAMPLE RATE', v: rec.normalRate / rec.highRate, t: `${rec.normalRate} / ${rec.highRate} Hz`, bbx: true },
          { k: 'RECORDER POWER', v: m('black-box').power / 100, t: `${fmt(m('black-box').power)} W`, bbx: true }, { k: 'DOWNLINK', v: 0, t: `0 / ${fmt(RES.comms.rate / 1000)} kbit/s` }],
        trends: [{ t: 'RECORD RATE', u: 'Hz', v: rec.normalRate, seed: 61, base: 0.5, colour: C.blackbox }, { t: 'STORE', u: '%', v: '37', seed: 17, base: 0.3, drift: 0.0012, colour: C.blackbox }],
        nums: [['FIXES HELD', '164'], ['BURNS HELD', '5'], ['FORECASTS HELD', '12'], ['PROCEDURES', '3']],
      };
    }
    case 'life': {
      const d = { o2: days(L.o2, L.o2Rate), w: days(L.water, L.waterRate), f: days(L.food, L.foodRate), c: days(L.sorbent, L.co2Rate) };
      return {
        status: `CREW ${L.crew} · AIR LOOP A`,
        diagram: { cols: 3, rows: 3,
          nodes: [
            { id: 's', c: 0, r: 1, label: 'CABIN STORES', sub: 'O₂ · WATER · FOOD' }, { id: 'a', c: 1, r: 0, label: 'AIR LOOP A', sub: state('eclss-a') }, { id: 'b', c: 1, r: 2, label: 'AIR LOOP B', sub: state('eclss-b'), cls: on('eclss-b') },
            { id: 'c', c: 2, r: 1, label: 'CABIN', sub: `CREW ${L.crew}` },
          ],
          links: [['s', 'a'], ['s', 'b', on('eclss-b')], ['a', 'c'], ['b', 'c', on('eclss-b')]] },
        bars: [{ k: 'OXYGEN', v: 1, t: `${L.o2} kg · ${fmt(d.o2, 1)} d` }, { k: 'WATER', v: 1, t: `${L.water} kg · ${fmt(d.w, 1)} d`, alert: true }, { k: 'FOOD', v: 1, t: `${L.food} kg · ${fmt(d.f, 1)} d` },
          { k: 'CO₂ SORBENT', v: 1, t: `${L.sorbent} kg · ${fmt(d.c, 1)} d` }, { k: 'CABIN CO₂', v: 0.08, lim: 0.6, t: '0.16 kPa' }],
        trends: [{ t: 'CABIN CO₂', u: 'kPa', v: '0.16', seed: 77, base: 0.15, limit: 0.6 }, { t: 'CABIN', u: 'K', v: '295', seed: 5, base: 0.42 }],
        nums: [['SHORTEST STORE', `WATER · ${fmt(d.w, 1)} d`], ['CREW HEAT', '400 W'], ['RECYCLING', 'NONE'], ['AIR LOOP', 'A ACTIVE · B STANDBY']],
      };
    }
    default: {
      const by = {};
      for (const e of EQUIPMENT) {
        const s = { generation: 'POWER', storage: 'POWER', distribution: 'POWER', thermal: 'THERMAL', propulsion: 'PROPULSION', tank: 'PROPULSION', structure: 'STRUCTURE',
          crew: 'LIFE', 'life-support': 'LIFE', data: 'DATA', communications: 'DATA' }[e.subsystem] ?? 'GUIDANCE';
        by[s] = (by[s] ?? 0) + e.mass;
      }
      const xs = FOOTPRINTS[st.config].map((p) => p[0]);
      const ys = FOOTPRINTS[st.config].map((p) => p[1]);
      return {
        status: `${SHIP.dryMass / 1000} t DRY · ${fmt(SHIP.wetMass / 1000, 1)} t WET`, footprint: true,
        bars: Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ k, v: v / SHIP.dryMass, t: `${fmt(v)} kg` })),
        trends: [],
        nums: [['LENGTH', `${Math.max(...xs) - Math.min(...xs)} m`], ['SPAN', `${Math.max(...ys) - Math.min(...ys)} m`], ['CENTRE OF MASS', `${st.com[0] >= 0 ? '+' : '−'}${Math.abs(st.com[0]).toFixed(2)} m`],
          ['THRUST ARM', `${Math.round(Math.abs(0.08 - st.com[1]) * 100)} cm`], ['CREW', L.crew], ['ASSEMBLIES', EQUIPMENT.length]],
      };
    }
  }
}

const bars = (list) => list.map((b) => `<div class="lv${b.alert ? ' caution' : ''}${b.bbx ? ' bbx' : ''}"><span>${b.k}</span><i><b style="width:${Math.round(Math.min(1, Math.max(0, b.v)) * 100)}%"></b>${b.lim != null ? `<u style="left:${Math.round(b.lim * 100)}%"></u>` : ''}</i><em>${b.t}</em></div>`).join('');

/**
 * Draw both columns. st = { system, selected, parts, modeOf, frac, config, com };
 * on = { system(id|null), part(id|null), config(name), mode(id, mode) }.
 */
export function renderShipPanels(ui, st, on, CONFIGS) {
  const sys = st.system;
  const d = screen(sys ?? 'structure', st);
  const list = sys ? st.parts.filter((p) => p.sys === sys && p.eq) : [];
  ui.left.innerHTML = `
    <nav class="sys-list">${[{ id: null, name: 'VEHICLE' }, ...SYSTEMS.filter((s) => s.id !== 'structure')].map((s) => `<button data-sys="${s.id ?? ''}" class="${(s.id ?? null) === sys ? 'on' : ''}${s.id === 'data' ? ' bbx' : ''}">${s.name}</button>`).join('')}</nav>
    <section class="panel">
      <header class="ph"><span>${sys ? SYSTEMS.find((s) => s.id === sys).name : 'RECURSION RETURN VEHICLE'}</span></header>
      <div class="sys-status${d.alert ? ' caution' : ''}${d.orange ? ' bbx' : ''}">${d.status}</div>
      <canvas class="dg" style="height:${d.footprint ? 150 : (d.diagram.rows * 38)}px"></canvas>
      ${d.footprint ? `<div class="pl-cap">CONFIGURATION</div><div class="pl-modes">${Object.entries(CONFIGS).map(([k, v]) => `<button data-cfg="${k}" class="${k === st.config ? 'on' : ''}">${v.label}</button>`).join('')}</div>` : ''}
    </section>
    ${list.length ? `<section class="panel"><header class="ph"><span>COMPONENTS</span><span class="ph-r">${list.length}</span></header><ul class="cmp">${list.map((p) => {
      const e = EQ.get(p.eq);
      const mo = st.modeOf.get(p.eq);
      const mm = e.modes[mo] ?? {};
      return `<li data-part="${p.id}" class="${p.id === st.selected ? 'on' : ''}${p.orange ? ' bbx' : ''}"><i class="${mo === 'off' || mo === 'standby' || mo === 'stowed' ? '' : 'live'}"></i><span>${p.name.replace(/\s{2}.*/, '')}</span><em>${mo.toUpperCase()}</em><b>${mm.gen ? `≤ ${fmt(mm.gen / 1000)} k` : fmt(mm.power || 0)} W</b></li>`;
    }).join('')}</ul></section>` : ''}`;
  const sel = st.selected ? st.parts.find((p) => p.id === st.selected) : null;
  const e = sel?.eq ? EQ.get(sel.eq) : null;
  const mo = e ? st.modeOf.get(e.id) : null;
  const mm = e ? e.modes[mo] ?? {} : null;
  const bus = e ? BUSES.find((b) => b.id === e.bus) : null;
  ui.right.innerHTML = `
    <section class="panel"><header class="ph"><span>${sys ? 'LEVELS' : 'MASS BY SYSTEM'}</span></header>${bars(d.bars)}</section>
    ${d.trends.length ? `<section class="panel"><header class="ph"><span>LAST 10 MIN</span></header>${d.trends.map((t, i) => `<div class="tr"><span>${t.t}</span><em>${t.v} ${t.u}</em><canvas data-tr="${i}"></canvas></div>`).join('')}</section>` : ''}
    <section class="panel nums">${d.nums.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</section>
    ${e ? `<section class="panel sel${sel.orange ? ' bbx' : ''}"><header class="ph"><span>${sel.name.replace(/\s{2}.*/, '')}</span><span class="ph-r">${e.subsystem.toUpperCase()}</span></header>
      <div class="pl-modes">${Object.keys(e.modes).map((k) => `<button data-mode="${k}" class="${k === mo ? 'on' : ''}">${k.toUpperCase()}</button>`).join('')}</div>
      <div class="nums in">
        <div><span>BUS</span><b>${bus ? `${bus.id.toUpperCase()} · ${bus.voltage} V` : '—'}</b></div><div><span>LOOP</span><b>${(e.thermalNode ?? '—').toUpperCase()}</b></div>
        <div><span>${mm.gen ? 'RATED SUPPLY' : 'DRAW'}</span><b>${fmt(mm.gen || mm.power || 0)} W</b></div><div><span>HEAT</span><b>${fmt(mm.heat || 0)} W</b></div>
        <div><span>MASS</span><b>${fmt(e.mass)} kg</b></div><div><span>SPARE</span><b>${(e.redundancy || '—').toUpperCase()}</b></div>
      </div>
      <div class="pl-cap">CONDITION</div><div class="cond"><i style="width:${e.id.endsWith('-b') ? 100 : 94}%"></i></div></section>` : ''}`;

  const dg = ui.left.querySelector('canvas.dg');
  if (d.footprint) footprint(dg, st.config, st.com);
  else diagram(dg, d.diagram);
  ui.right.querySelectorAll('canvas[data-tr]').forEach((c) => trend(c, d.trends[Number(c.dataset.tr)]));
  ui.left.querySelectorAll('[data-sys]').forEach((b) => (b.onclick = () => on.system(b.dataset.sys || null)));
  ui.left.querySelectorAll('[data-cfg]').forEach((b) => (b.onclick = () => on.config(b.dataset.cfg)));
  ui.left.querySelectorAll('[data-part]').forEach((b) => (b.onclick = () => on.part(b.dataset.part)));
  ui.right.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => on.mode(e.id, b.dataset.mode)));
}
