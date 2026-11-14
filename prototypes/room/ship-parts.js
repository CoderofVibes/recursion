// The ship as a set of drawn parts, one per assembly in data/ship-baseline.json (1C proposal).
// Fore-and-aft and left-right positions follow the baseline; heights, sizes and shapes are display
// choices, drawn after real hardware of the same kind (see docs/handoffs/1E.md, Round 3, sources).
// Body frame: x forward, y left, z up, metres.
import { W } from './wire.js';

const TAU = Math.PI * 2;
const DECK = -1.0;
const R_CABIN = 2.5;
const R_SVC = 2.38;

export const SYSTEMS = [
  { id: 'structure', name: 'STRUCTURE' },
  { id: 'power', name: 'POWER' },
  { id: 'thermal', name: 'THERMAL' },
  { id: 'propulsion', name: 'PROPULSION' },
  { id: 'guidance', name: 'GUIDANCE' },
  { id: 'data', name: 'DATA' },
  { id: 'life', name: 'LIFE SUPPORT' },
];

const HULL = [[8.0, 0.95], [7.7, 1.3], [6.9, 2.12], [6.2, 2.5], [0.3, 2.5], [0.0, R_SVC], [-5.5, R_SVC], [-6.1, 1.7], [-6.4, 0.75]];

/** Solar wing: five hinged panels on a yoke. s = +1 left, -1 right; f = deployed fraction. */
function solarWing(s, f) {
  const w = W();
  const y0 = 2.6 + 0.4 * f;
  const len = 0.2 + 8.8 * f;
  for (let i = 0; i < 5; i++) w.grid([0, s * (y0 + (len * i) / 5), 0], [6, 0, 0], [0, (s * len) / 5, 0], 12, f > 0.3 ? 3 : 1);
  w.poly([[0.6, s * y0, 0], [3, s * R_CABIN, 0], [5.4, s * y0, 0]]).seg([3, s * R_CABIN, 0], [3, s * y0, 0]);
  w.ring([3, s * R_CABIN, 0], 0.16, 'y', 12);
  return w;
}

/** Radiator wing: four panels with coolant tubes and a manifold. */
function radiatorWing(s, f) {
  const w = W();
  const y0 = 2.45 + 0.25 * f;
  const len = 0.15 + 7.15 * f;
  for (let i = 0; i < 4; i++) {
    const a = y0 + (len * i) / 4;
    const b = y0 + (len * (i + 1)) / 4;
    w.poly([[-4, s * a, 0], [1, s * a, 0], [1, s * b, 0], [-4, s * b, 0]], true);
    if (f > 0.3) for (let k = 1; k < 6; k++) w.seg([-4 + (5 * k) / 6, s * (a + 0.08), 0], [-4 + (5 * k) / 6, s * (b - 0.08), 0]);
  }
  w.seg([-4.15, s * y0, 0], [1.15, s * y0, 0]);
  for (const x of [-3.2, 0.2]) w.poly([[x, s * R_SVC, 0.25], [x, s * y0, 0], [x, s * R_SVC, -0.25]]);
  return w;
}

function pump(c, r) {
  return W().cyl([c[0] - 0.22, c[1], c[2]], 'x', 0.3, r * 0.75, { mer: 6, n: 14 }).cyl([c[0] + 0.08, c[1], c[2]], 'x', 0.1, r, { mer: 6, n: 16 })
    .ring([c[0] + 0.13, c[1], c[2]], r * 0.45, 'x', 12).seg([c[0] + 0.13, c[1], c[2] + r], [c[0] + 0.13, c[1], c[2] + r + 0.16]);
}

function rcsPod(x, s, R) {
  const w = W();
  const y = s * (R + 0.14);
  w.box([x, y, 0], [0.62, 0.28, 0.62]);
  const nozzle = (c, d) => w.cone(c, d, 0.24, 0.04, 0.12, { mer: 6, n: 12 });
  nozzle([x + 0.31, y, 0], [1, 0, 0]);
  nozzle([x - 0.31, y, 0], [-1, 0, 0]);
  nozzle([x, y, 0.31], [0, 0, 1]);
  nozzle([x, y, -0.31], [0, 0, -1]);
  nozzle([x, y + s * 0.14, 0], [0, s, 0]);
  return w;
}

/**
 * Every part: { id, sys, name, eq, anchor, r, wire | dyn, ext, net, major, orange }.
 *   eq     the baseline equipment id this part stands for (selectable), if any
 *   ext    visible from outside (used for the small ship in the flight hologram)
 *   net    pipes, harness and links: shown only when its system is isolated
 *   major  called out in the overview
 *   dyn    (rad, sol) => Wire, for parts that move with deployment
 */
export function buildParts() {
  const P = [];
  const add = (p) => P.push({ r: 0.45, ...p });

  // ---- Structure -------------------------------------------------------------------------------
  add({ id: 'hull', sys: 'structure', name: 'PRESSURE HULL', eq: 'habitat-structure', anchor: [3, 0, 2.5], r: 0, ext: true,
    wire: W().lathe([0, 0, 0], 'x', HULL, { mer: 12, n: 44 }) });
  const frames = W();
  for (let x = 5.4; x > 0.5; x -= 0.82) frames.ring([x, 0, 0], R_CABIN, 'x', 44);
  for (let x = -0.8; x > -5.2; x -= 0.8) frames.ring([x, 0, 0], R_SVC, 'x', 44);
  add({ id: 'frames', sys: 'structure', name: 'RING FRAMES', anchor: [-3, 0, 2.38], r: 0, faint: true, wire: frames });
  add({ id: 'bulkhead', sys: 'structure', name: 'AFT CABIN BULKHEAD', anchor: [0, 0, 2.38], r: 0,
    wire: W().disc([0, 0, 0], R_SVC, 'x', 12, 3).disc([-5.5, 0, 0], R_SVC, 'x', 8, 2) });
  add({ id: 'deck', sys: 'structure', name: 'CABIN DECK', anchor: [5.4, 1.6, DECK], r: 0, faint: true,
    wire: W().grid([0.3, -2.29, DECK], [5.9, 0, 0], [0, 4.58, 0], 6, 5) });
  add({ id: 'canopy', sys: 'structure', name: 'PANORAMIC WINDOW', anchor: [6.55, 0, 2.3], r: 0, ext: true,
    wire: W().lathe([0, 0, 0], 'x', [[6.25, 2.47], [6.85, 2.15]], { mer: 9, n: 30, a0: 0.35, a1: Math.PI - 0.35 }) });
  const dock = W().lathe([0, 0, 0], 'x', [[8.0, 0.95], [8.3, 0.95], [8.3, 0.68]], { mer: 12, n: 24 });
  for (let k = 0; k < 3; k++) {
    const a = (TAU * k) / 3 + 0.5;
    dock.poly([[8.3, Math.cos(a) * 0.68, Math.sin(a) * 0.68], [8.55, Math.cos(a) * 0.5, Math.sin(a) * 0.5], [8.3, Math.cos(a + 0.5) * 0.68, Math.sin(a + 0.5) * 0.68]]);
  }
  add({ id: 'dock', sys: 'structure', name: 'DOCKING PORT', anchor: [8.3, 0, 0.9], r: 0, ext: true, major: true, wire: dock });
  const thrust = W().ring([-6.4, 0.08, 0], 0.34, 'x', 20);
  for (let k = 0; k < 8; k++) {
    const a = (TAU * k) / 8;
    thrust.seg([-5.5, Math.cos(a) * R_SVC, Math.sin(a) * R_SVC], [-6.4, 0.08 + Math.cos(a) * 0.34, Math.sin(a) * 0.34]);
  }
  add({ id: 'thrust-frame', sys: 'structure', name: 'THRUST STRUCTURE', anchor: [-5.9, 0, 1.6], r: 0, wire: thrust });

  // ---- Power -----------------------------------------------------------------------------------
  for (const [s, n] of [[1, 'left'], [-1, 'right']]) {
    add({ id: `solar-${n}`, sys: 'power', name: `SOLAR WING ${n[0].toUpperCase()}`, eq: `solar-${n}`, anchor: [3, s * 2.6, 0], r: 0.9, ext: true, major: s > 0,
      dyn: (rad, sol) => solarWing(s, sol), follow: 'sol', side: s });
    const A = n === 'left' ? 'a' : 'b';
    const y = s * 1.05;
    const fc = W().cyl([-1.45, y, 0.95], 'x', 0.7, 0.28, { mer: 6, n: 18 });
    for (let i = 1; i < 12; i++) fc.ring([-1.45 + (0.7 * i) / 12, y, 0.95], 0.28, 'x', 18);
    fc.ring([-1.45, y, 0.95], 0.32, 'x', 18).ring([-0.75, y, 0.95], 0.32, 'x', 18).box([-0.55, y, 0.95], [0.3, 0.5, 0.44])
      .run([[-0.4, y - 0.15, 1.17], [-0.4, y - 0.15, 1.4], [-1.3, y - 0.15, 1.4], [-1.3, y - 0.15, 1.23]])
      .run([[-0.4, y + 0.15, 1.17], [-0.4, y + 0.15, 1.5], [-1.1, y + 0.15, 1.5], [-1.1, y + 0.15, 1.23]]);
    add({ id: `fuel-cell-${A}`, sys: 'power', name: `FUEL CELL ${A.toUpperCase()}`, eq: `fuel-cell-${A}`, anchor: [-1.05, y, 0.95], wire: fc });
    const by = s * 1.15;
    const bat = W().box([1.0, by, -1.62], [0.9, 0.6, 0.5]);
    for (let i = 0; i < 4; i++) for (const j of [-1, 1]) bat.cyl([0.67 + i * 0.22, by + j * 0.15, -1.82], 'z', 0.4, 0.09, { mer: 4, n: 10 });
    bat.seg([0.6, by, -1.36], [1.4, by, -1.36]);
    add({ id: `battery-${A}`, sys: 'power', name: `BATTERY ${A.toUpperCase()}`, eq: `battery-${A}`, anchor: [1.0, by, -1.62], wire: bat });
    const pdu = W().box([0.45, by, -1.6], [0.45, 0.6, 0.55]).slices([0.45, by, -1.6], [0.45, 0.6, 0.55], 1, 6);
    for (let i = 0; i < 3; i++) for (const k of [-1, 1]) pdu.ring([0.68, by + (i - 1) * 0.18, -1.6 + k * 0.14], 0.04, 'x', 8);
    add({ id: `pdu-${A}`, sys: 'power', name: `POWER DISTRIBUTION ${A.toUpperCase()}`, eq: `pdu-${A}`, anchor: [0.45, by, -1.6], r: 0.35, wire: pdu });
    add({ id: `harness-${A}`, sys: 'power', name: '', net: true, anchor: [0, 0, 0], r: 0,
      wire: W().run([[3, s * R_CABIN, 0], [3, s * 2.2, -1.15], [0.45, s * 1.9, -1.15], [0.45, by, -1.33]])
        .run([[-0.55, y, 0.73], [-0.2, s * 1.4, 0.2], [0.1, s * 1.6, -0.9], [0.45, by, -1.33]])
        .run([[0.55, by, -1.37], [0.68, by, -1.37]])
        .run([[0.45, s * 1.9, -1.15], [6.0, s * 1.9, -1.15]]).run([[0.45, s * 1.9, -1.15], [-5.4, s * 1.9, -1.15]])
        .run([[0.45, s * 0.85, -1.6], [0.45, 0, -1.6]]) });
  }
  add({ id: 'reactant-tanks', sys: 'power', name: 'REACTANT TANKS  H₂ · O₂', eq: 'reactant-tanks', anchor: [1.0, 0, -1.68], r: 0.5,
    wire: W().sphere([1.0, -0.36, -1.68], 0.34, 'z').sphere([1.0, -0.36, -1.68], 0.27, 'z', { mer: 4 })
      .sphere([1.0, 0.36, -1.68], 0.28, 'z').sphere([1.0, 0.36, -1.68], 0.22, 'z', { mer: 4 }) });
  add({ id: 'product-water-tank', sys: 'power', name: 'PRODUCT WATER', eq: 'product-water-tank', anchor: [2.0, 0, -1.7], r: 0.3,
    wire: W().capsule([2.0, 0, -1.7], 'y', 0.7, 0.2) });

  // ---- Thermal ---------------------------------------------------------------------------------
  for (const [s, n] of [[1, 'left'], [-1, 'right']]) {
    const A = n === 'left' ? 'a' : 'b';
    add({ id: `radiator-${n}`, sys: 'thermal', name: `RADIATOR ${n[0].toUpperCase()}`, eq: `radiator-${n}`, anchor: [-1.5, s * 2.5, 0], r: 0.9, ext: true, major: s < 0,
      dyn: (rad) => radiatorWing(s, rad), follow: 'rad', side: s });
    add({ id: `internal-pump-${A}`, sys: 'thermal', name: `CABIN LOOP PUMP ${A.toUpperCase()}`, eq: `internal-pump-${A}`, anchor: [2.0, s * 1.15, -1.62], r: 0.3, wire: pump([2.0, s * 1.15, -1.62], 0.17) });
    add({ id: `external-pump-${A}`, sys: 'thermal', name: `EXTERNAL LOOP PUMP ${A.toUpperCase()}`, eq: `external-pump-${A}`, anchor: [-2.0, s * 1.95, 1.0], r: 0.3, wire: pump([-2.0, s * 1.95, 1.0], 0.2) });
  }
  const hx = W().box([0, 0, -1.72], [0.9, 0.9, 0.42]).slices([0, 0, -1.72], [0.9, 0.9, 0.42], 2, 9);
  for (const [x, y] of [[0.45, 0.3], [0.45, -0.3], [-0.45, 0.3], [-0.45, -0.3]]) hx.ring([x, y, -1.72], 0.07, 'x', 10);
  add({ id: 'interface-hx', sys: 'thermal', name: 'INTERFACE HEAT EXCHANGER', eq: 'interface-hx', anchor: [0, 0, -1.72], r: 0.5, wire: hx });
  add({ id: 'loop-internal', sys: 'thermal', name: 'CABIN WATER LOOP', net: true, anchor: [5.6, 0, -1.6], r: 0, callout: true,
    wire: W().run([[0.45, 0.3, -1.72], [1.2, 1.7, -1.6], [5.6, 1.7, -1.6], [5.6, -1.7, -1.6], [1.2, -1.7, -1.6], [0.45, -0.3, -1.72]])
      .run([[4, 1.7, -1.6], [4, 0.9, -1.2]]).run([[4, -1.7, -1.6], [4, -0.9, -1.2]]).run([[2, 1.7, -1.6], [2, 0.6, 0.85]]).run([[2, -1.7, -1.6], [2, -0.6, 0.85]]) });
  add({ id: 'loop-external', sys: 'thermal', name: 'EXTERNAL LOOP', net: true, anchor: [-3.4, 0, -1.9], r: 0, callout: true,
    wire: W().run([[-0.45, 0.3, -1.72], [-1.0, 1.9, -1.0], [-2.0, 1.95, 0.8]]).run([[-2.0, 1.95, 1.2], [-1.5, R_SVC, 0.25], [-1.5, 2.45, 0]])
      .run([[-0.45, -0.3, -1.72], [-1.0, -1.9, -1.0], [-2.0, -1.95, 0.8]]).run([[-2.0, -1.95, 1.2], [-1.5, -R_SVC, 0.25], [-1.5, -2.45, 0]])
      .run([[-3.4, 2.45, 0], [-3.4, 1.9, -1.4], [-3.4, -1.9, -1.4], [-3.4, -2.45, 0]]) });

  // ---- Propulsion ------------------------------------------------------------------------------
  const tank = W().capsule([-2.75, 0, 0], 'x', 2.9, 1.4, { mer: 12, n: 32 });
  for (const x of [-2.1, -3.5]) tank.ring([x, 0, 0], 1.4, 'x', 32).ring([x, 0, 0], 1.12, 'x', 28);
  tank.lathe([-2.8, 0, 0], [-1, 0, 0], [[0, 1.4], [0.18, 1.1], [0.32, 0.6], [0.36, 0]], { mer: 8, n: 28, rings: false })
    .sphere([-4.5, 0.85, 0.95], 0.28, 'x', { mer: 6 }).sphere([-4.5, -0.85, 0.95], 0.28, 'x', { mer: 6 });
  add({ id: 'main-tank', sys: 'propulsion', name: 'MAIN PROPELLANT TANK', eq: 'main-tank', anchor: [-2.75, 0, 0], r: 1.2, major: true, wire: tank });
  add({ id: 'rcs-tanks', sys: 'propulsion', name: 'RCS TANKS', eq: 'rcs-tanks', anchor: [-0.95, 0, 1.6], r: 0.4,
    wire: W().sphere([-0.95, 0.42, 1.6], 0.3, 'z').sphere([-0.95, -0.42, 1.6], 0.3, 'z') });
  add({ id: 'xenon-tank', sys: 'propulsion', name: 'XENON TANK', eq: 'xenon-tank', anchor: [-3.0, 0, -1.9], r: 0.35,
    wire: W().sphere([-3.0, 0, -1.9], 0.32, 'x').ring([-3.0, 0, -1.9], 0.335, 'y', 20).ring([-3.0, 0, -1.9], 0.335, 'z', 20) });
  const BELL = [[0, 0.22], [0.1, 0.3], [0.42, 0.3], [0.55, 0.17], [0.62, 0.16], [0.75, 0.32], [0.95, 0.56], [1.2, 0.82], [1.45, 1.02], [1.65, 1.16]];
  const eng = W().lathe([-6.4, 0.08, 0], [-1, 0, 0], BELL, { mer: 16, n: 36 });
  for (const [t, r] of [[0.85, 0.44], [1.07, 0.69], [1.32, 0.93], [1.55, 1.1]]) eng.ring([-6.4 - t, 0.08, 0], r, 'x', 36);
  for (const [dy, dz] of [[0.95, 0], [0, 0.95]]) eng.seg([-5.75, 0.08 + dy, dz], [-6.75, 0.08 + dy * 0.34, dz * 0.34]).box([-6.1, 0.08 + dy * 0.75, dz * 0.75], [0.3, 0.1, 0.1]);
  for (const k of [-1, 1]) eng.box([-6.28, 0.08 + k * 0.42, 0.42], [0.2, 0.18, 0.18]).run([[-4.15, k * 0.4, 0.3], [-5.5, k * 0.5, 0.42], [-6.18, 0.08 + k * 0.42, 0.42], [-6.45, 0.08 + k * 0.2, 0.2]]);
  add({ id: 'main-engine', sys: 'propulsion', name: 'MAIN ENGINE  24 kN', eq: 'main-engine', anchor: [-7.3, 0.08, 0], r: 0.9, ext: true, major: true, wire: eng });
  const ion = W().lathe([-5.95, 0, -1.5], [-1, 0, 0], [[0, 0.14], [0.12, 0.3], [0.4, 0.34], [0.46, 0.36]], { mer: 8, n: 22 })
    .disc([-6.41, 0, -1.5], 0.34, 'x', 12, 5).disc([-6.45, 0, -1.5], 0.34, 'x', 0, 4).ring([-6.15, 0, -1.5], 0.44, 'x', 22)
    .cyl([-6.25, 0, -1.08], [-1, 0, 0], 0.24, 0.045, { mer: 4, n: 8 }).box([-5.45, 0, -1.55], [0.5, 0.5, 0.3]).slices([-5.45, 0, -1.55], [0.5, 0.5, 0.3], 0, 5);
  add({ id: 'ion-drive', sys: 'propulsion', name: 'ION DRIVE', eq: 'ion-drive', anchor: [-6.2, 0, -1.5], r: 0.45, ext: true, major: true, wire: ion });
  for (const [x, R, fa] of [[5, R_CABIN, 'forward'], [-5, R_SVC, 'aft']])
    for (const [s, n] of [[1, 'left'], [-1, 'right']])
      add({ id: `rcs-${fa}-${n}`, sys: 'propulsion', name: `RCS POD ${fa === 'forward' ? 'FWD' : 'AFT'} ${n[0].toUpperCase()}`, eq: `rcs-${fa}-${n}`, anchor: [x, s * (R + 0.14), 0], r: 0.45,
        ext: true, major: fa === 'forward' && s > 0, wire: rcsPod(x, s, R) });
  add({ id: 'feed', sys: 'propulsion', name: '', net: true, anchor: [0, 0, 0], r: 0,
    wire: W().run([[-0.95, 0.42, 1.9], [-0.95, 0, 2.1], [5, 0, 2.2], [5, 2.3, 0.6], [5, R_CABIN + 0.14, 0.31]]).run([[5, 0, 2.2], [5, -2.3, 0.6], [5, -R_CABIN - 0.14, 0.31]])
      .run([[-0.95, -0.42, 1.9], [-0.95, 0, 2.1], [-5, 0, 2.2], [-5, 2.2, 0.6], [-5, R_SVC + 0.14, 0.31]]).run([[-5, 0, 2.2], [-5, -2.2, 0.6], [-5, -R_SVC - 0.14, 0.31]])
      .run([[-3.0, 0, -2.22], [-4.6, 0, -2.1], [-5.45, 0, -1.7]]).run([[-5.7, 0, -1.55], [-5.95, 0, -1.5]]) });

  // ---- Guidance --------------------------------------------------------------------------------
  const con = W().box([4, 0, -0.11], [1.8, 3.0, 0.12]).box([4, 0, -0.58], [1.1, 2.2, 0.82]).ring([4, 0, -0.04], 0.4, 'z', 24).ring([4, 0, 0.55], 0.95, 'z', 28);
  for (let k = 0; k < 8; k++) {
    const a = (TAU * k) / 8;
    con.seg([4 + Math.cos(a) * 0.4, Math.sin(a) * 0.4, -0.04], [4 + Math.cos(a) * 0.95, Math.sin(a) * 0.95, 0.55]);
  }
  add({ id: 'console', sys: 'guidance', name: 'CONTROL ROOM · YOU ARE HERE', eq: 'console', anchor: [4, 0, 0.1], r: 0.8, major: true, wire: con });
  const cam = W().ring([7.15, 0, -1.9], 0.3, 'z', 18).poly([[7.15, 0.3, -1.9], [7.15, 0.3, -2.25], [7.15, -0.3, -2.25], [7.15, -0.3, -1.9]])
    .cyl([6.95, 0, -2.2], 'x', 0.55, 0.17, { mer: 8, n: 16 }).cone([7.5, 0, -2.2], 'x', 0.25, 0.17, 0.27, { mer: 8, n: 16 }).ring([7.3, 0, -2.2], 0.11, 'x', 12);
  add({ id: 'camera', sys: 'guidance', name: 'OPTICAL NAV CAMERA', eq: 'camera', anchor: [7.3, 0, -2.2], r: 0.4, ext: true, major: true, wire: cam });
  const fov = W();
  for (const a of [-0.45, 0.45]) fov.seg([7.75, 0, -2.2], [7.75 + Math.cos(a) * 4.5, Math.sin(a) * 4.5, -2.2]).seg([7.75, 0, -2.2], [7.75 + Math.cos(a) * 4.5, 0, -2.2 + Math.sin(a) * 4.5]);
  fov.ring([7.75 + Math.cos(0.45) * 4.5, 0, -2.2], Math.sin(0.45) * 4.5, 'x', 32).ring([7.75 + Math.cos(0.45) * 2.4, 0, -2.2], Math.sin(0.45) * 2.4, 'x', 28);
  add({ id: 'fov', sys: 'guidance', name: 'FIELD OF VIEW  ±26°', net: true, callout: true, anchor: [11.5, 0, -0.4], r: 0, wire: fov });
  for (const [s, A] of [[1, 'a'], [-1, 'b']]) {
    const b = [6.0, s * 1.0, 2.25];
    const d = [0.15, s * 0.42, 0.9];
    const st = W().box([6.0, s * 1.0, 2.2], [0.3, 0.3, 0.2]).cone(b, d, 0.5, 0.08, 0.21, { mer: 8, n: 16 });
    for (const t of [0.17, 0.33]) st.ring([b[0] + d[0] * t, b[1] + d[1] * t, b[2] + d[2] * t], 0.08 + 0.26 * t, d, 14);
    add({ id: `star-tracker-${A}`, sys: 'guidance', name: `STAR TRACKER ${A.toUpperCase()}`, eq: `star-tracker-${A}`, anchor: [6.05, s * 1.12, 2.5], r: 0.3, ext: true, wire: st });
    add({ id: `imu-${A}`, sys: 'guidance', name: `INERTIAL UNIT ${A.toUpperCase()}`, eq: `imu-${A}`, anchor: [0.5, s * 0.2, 1.25], r: 0.18,
      wire: W().box([0.5, s * 0.2, 1.25], [0.2, 0.2, 0.2]).seg([0.5, s * 0.2, 1.25], [0.75, s * 0.2, 1.25]).seg([0.5, s * 0.2, 1.25], [0.5, s * 0.45, 1.25]).seg([0.5, s * 0.2, 1.25], [0.5, s * 0.2, 1.5]) });
    add({ id: `flight-cpu-${A}`, sys: 'guidance', name: `FLIGHT COMPUTER ${A.toUpperCase()}`, eq: `flight-cpu-${A}`, anchor: [2.0, s * 0.6, 1.0], r: 0.3,
      wire: W().box([2.0, s * 0.6, 1.0], [0.5, 0.4, 0.3]).slices([2.0, s * 0.6, 1.0], [0.5, 0.4, 0.3], 0, 9) });
  }
  add({ id: 'science-processor', sys: 'guidance', name: 'SCIENCE PROCESSOR', eq: 'science-processor', anchor: [1.0, 0.6, 1.0], r: 0.28,
    wire: W().box([1.0, 0.6, 1.0], [0.45, 0.35, 0.28]).slices([1.0, 0.6, 1.0], [0.45, 0.35, 0.28], 0, 6).slices([1.0, 0.6, 1.2], [0.45, 0.35, 0.1], 1, 8) });
  add({ id: 'bus-guidance', sys: 'guidance', name: '', net: true, anchor: [0, 0, 0], r: 0,
    wire: W().run([[6.0, 1.0, 2.2], [5.2, 1.0, 1.6], [2.25, 0.6, 1.15]]).run([[6.0, -1.0, 2.2], [5.2, -1.0, 1.6], [2.25, -0.6, 1.15]])
      .run([[6.95, 0, -2.2], [6.2, 0.6, -1.2], [1.4, 0.6, -1.1], [1.0, 0.6, 0.86]]).run([[1.22, 0.6, 1.0], [1.75, 0.6, 1.0]])
      .run([[0.6, 0.2, 1.25], [1.75, 0.6, 1.0]]).run([[0.6, -0.2, 1.25], [1.75, -0.6, 1.0]])
      .run([[2.25, 0.6, 0.9], [3.45, 0.5, -0.17]]).run([[2.25, -0.6, 0.9], [3.45, -0.5, -0.17]]) });

  // ---- Data ------------------------------------------------------------------------------------
  const bb = W().capsule([2.0, 0, 1.6], 'x', 0.62, 0.17, { mer: 8, n: 18 }).ring([1.85, 0, 1.6], 0.2, 'x', 18).ring([2.15, 0, 1.6], 0.2, 'x', 18)
    .cyl([2.31, 0, 1.6], 'x', 0.22, 0.045, { mer: 4, n: 8 }).box([2.0, 0, 1.83], [0.5, 0.3, 0.08]).seg([1.85, 0.2, 1.6], [1.85, 0.2, 1.83]).seg([2.15, -0.2, 1.6], [2.15, -0.2, 1.83]);
  add({ id: 'black-box', sys: 'data', name: 'BLACK BOX', eq: 'black-box', anchor: [2.0, 0, 1.6], r: 0.35, major: true, orange: true, wire: bb });
  const n = [0.25, 0, 0.97];
  const V = [5.6, 0, 3.45];
  const dish = W().run([[5.6, 0, R_CABIN], [5.6, 0, 3.3]]).box([5.6, 0, 3.33], [0.24, 0.24, 0.2])
    .lathe(V, n, [[0, 0], [0.02, 0.2], [0.08, 0.4], [0.18, 0.6], [0.32, 0.8], [0.45, 0.95]], { mer: 12, n: 28 });
  const fp = [V[0] + n[0] * 0.75, 0, V[2] + n[2] * 0.75];
  for (let k = 0; k < 3; k++) {
    const a = (TAU * k) / 3;
    dish.seg(fp, [V[0] + n[0] * 0.45 + Math.cos(a) * 0.92 * 0.97, Math.sin(a) * 0.95, V[2] + n[2] * 0.45 - Math.cos(a) * 0.92 * 0.25]);
  }
  dish.ring(fp, 0.07, n, 10);
  add({ id: 'comms', sys: 'data', name: 'HIGH-GAIN ANTENNA', eq: 'comms', anchor: [5.7, 0, 3.6], r: 0.7, ext: true, major: true, wire: dish });
  add({ id: 'bus-data', sys: 'data', name: 'RECORD CHANNELS', net: true, callout: true, anchor: [3.2, 0, 1.75], r: 0,
    wire: W().run([[2.0, 0.4, 1.0], [2.0, 0.15, 1.5]]).run([[2.0, -0.4, 1.0], [2.0, -0.15, 1.5]]).run([[1.0, 0.6, 1.14], [1.7, 0.1, 1.6]])
      .run([[2.35, 0, 1.6], [4, 0, 1.75], [4, 0, 0.55]]).run([[2.25, 0.6, 1.1], [5.6, 0.3, 2.3], [5.6, 0, R_CABIN]])
      .run([[0.45, 1.15, -1.33], [1.6, 0.3, 0.4], [1.9, 0.1, 1.45]]).run([[0, 0, -1.5], [1.5, -0.3, 0.4], [1.9, -0.1, 1.45]]) });

  // ---- Life support ----------------------------------------------------------------------------
  const seats = W();
  for (const y of [-1.5, -0.5, 0.5, 1.5])
    seats.box([2.9, y, -0.52], [0.46, 0.46, 0.1]).box([2.68, y, -0.18], [0.1, 0.46, 0.62]).seg([2.9, y, -0.57], [2.9, y, DECK]).ring([2.9, y, DECK], 0.16, 'z', 10);
  add({ id: 'crew', sys: 'life', name: 'CREW STATIONS (4)', eq: 'crew', anchor: [2.8, 0, -0.2], r: 0.7, wire: seats });
  const stores = W();
  for (const y of [-0.72, 0, 0.72]) stores.box([3.0, y, -1.62], [1.1, 0.62, 0.7]).slices([3.0, y, -1.62], [1.1, 0.62, 0.7], 0, 3);
  add({ id: 'cabin-stores', sys: 'life', name: 'CABIN STORES', eq: 'cabin-stores', anchor: [3.0, 0, -1.62], r: 0.7, wire: stores });
  for (const [s, A] of [[1, 'a'], [-1, 'b']]) {
    const y = s * 1.12;
    const e = W().box([4.6, y, -1.62], [1.15, 0.7, 0.78]);
    for (const dy of [-0.2, 0, 0.2]) e.cyl([4.1, y + dy, -1.72], 'x', 0.9, 0.09, { mer: 4, n: 10 });
    e.ring([5.18, y, -1.5], 0.2, 'x', 16).disc([5.18, y, -1.5], 0.2, 'x', 6, 1)
      .run([[4.6, y, -1.23], [4.6, s * 1.9, -0.95], [4.6, s * 2.25, 0.9]]);
    for (const x of [1.5, 3.0, 4.6]) e.seg([x - 0.2, s * 2.25, 0.9], [x + 0.2, s * 2.25, 0.9]).seg([x - 0.2, s * 2.2, 1.0], [x + 0.2, s * 2.2, 1.0]);
    e.run([[4.6, s * 2.25, 0.9], [1.3, s * 2.25, 0.9]]);
    add({ id: `eclss-${A}`, sys: 'life', name: `AIR REVITALISATION ${A.toUpperCase()}`, eq: `eclss-${A}`, anchor: [4.6, y, -1.62], r: 0.6, wire: e });
  }
  return P;
}

/** Overall extent, for framing. */
export const SHIP_EXTENT = { fore: 8.55, aft: -8.05, radius: R_CABIN };
