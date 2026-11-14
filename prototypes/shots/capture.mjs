// Plays the Gravity range in the control room and saves screenshots (UI lane, 2D).
//
// Drives the dev build in headless Chrome over the DevTools protocol, with nothing installed:
// Node 22's own WebSocket and the Chrome on this machine. It walks in, records a mission design,
// flies by hand, flies two dives on committed plans, tests and adopts the distance law, compares
// the dives, flies a third with the rule, visits SHIP and MAP, and loses the ship to a plan that
// trusts the old law. It also reports the frame rate with a few hundred rocks.
//
//   npm run dev -- --port 5184 --strictPort
//   node prototypes/shots/capture.mjs <outDir> [http://localhost:5184/]
//
// It needs the dev build: it uses `window.__recursion` (src/app/loop.ts). Do not edit files
// under src/ while it runs; the dev server would reload the page under it.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.argv[2];
const base = process.argv[3] ?? 'http://localhost:5184/';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profile = join(process.env.TEMP ?? '.', `recursion-shots-${Date.now()}`);
const port = 9333;
mkdirSync(outDir, { recursive: true });

const proc = spawn(chrome, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--window-size=1280,720',
  '--hide-scrollbars',
  '--enable-gpu',
  '--ignore-gpu-blocklist',
  '--no-first-run',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function target() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('chrome did not start');
}

const ws = new WebSocket(await target());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const waiting = new Map();
const errors = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && waiting.has(m.id)) {
    const { resolve, reject } = waiting.get(m.id);
    waiting.delete(m.id);
    if (m.error) reject(new Error(m.error.message));
    else resolve(m.result);
  } else if (m.method === 'Runtime.exceptionThrown') {
    errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
  }
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    waiting.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
const js = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
const shot = async (name) => {
  await sleep(350);
  const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
  writeFileSync(join(outDir, `${name}.jpg`), Buffer.from(r.data, 'base64'));
  console.log('shot', name);
};
const go = async (query) => {
  await send('Page.navigate', { url: base + query });
  await sleep(3500);
};
const R = 'window.__recursion';
const waitSim = async (seconds, label) => {
  // Real frames are running; wait until the sim clock passes the mark or the attempt ends.
  const start = Date.now();
  for (;;) {
    const s = await js(`JSON.stringify(${R}.game.status())`).then(JSON.parse);
    if (s.t >= seconds || s.phase === 'ended' || Date.now() - start > 120000) {
      console.log(label, 't', s.t, s.phase, 'saturated', s.saturated, `${((Date.now() - start) / 1000).toFixed(1)} s`);
      return s;
    }
    await sleep(500);
  }
};
const dive = (seconds, name) => `${R}.desk.commitPlan({name:'${name}', items:[
  {at:0, command:{kind:'attitude', target:{reference:'retrograde'}}},
  {at:300, command:{kind:'burn', thruster:'main-engine', throttle:1, duration:${seconds}, attitude:{reference:'retrograde'}}},
  {at:${306 + seconds}, command:{kind:'attitude', target:{reference:'free'}}}]})`;
const key = (type, k) => js(`window.dispatchEvent(new KeyboardEvent('${type}', {key:'${k}'}))`);
const view = async (mode) => { await js(`${R}.view.go('${mode}')`); await sleep(1400); };

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });

  // ---- Walking in --------------------------------------------------------------------------
  await go('');
  console.log('renderer', await js(`(() => { const c = document.createElement('canvas').getContext('webgl'); const e = c.getExtension('WEBGL_debug_renderer_info'); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; })()`));
  await shot('room-entry');

  // ---- Frame rate, as the game runs and with a few hundred rocks -------------------------------
  const fps = (seconds) => js(`new Promise((resolve) => { let n = 0; const t0 = performance.now(); const tick = () => { n++; if (performance.now() - t0 < ${seconds * 1000}) requestAnimationFrame(tick); else resolve(Math.round(n / ((performance.now() - t0) / 1000))); }; requestAnimationFrame(tick); })`);
  await view('flight');
  console.log('fps flight, as shipped', await fps(4));
  await js(`(() => { const g = ${R}.game; const real = g.snapshot.bind(g); window.__realSnapshot = real; g.snapshot = () => { const s = real(); const rocks = []; for (let i = 0; i < 400; i++) { const a = i * 2.399963, r = 3e5 + (i % 40) * 3e4; rocks.push({ id: 'x-' + i, position: { x: Math.cos(a) * r, y: Math.sin(a) * r }, velocity: { x: 0, y: 0 }, positionCov: [4e6, 0, 4e6], radius: 500 + (i % 7) * 400, tracked: i % 5 === 0 }); } return { ...s, world: { ...s.world, asteroids: [...s.world.asteroids, ...rocks] } }; }; })()`);
  await sleep(600);
  console.log('fps flight, 411 rocks', await fps(4));
  await shot('room-flight-rocks');
  await view('room');
  console.log('fps room, 411 rocks', await fps(3));
  await js(`${R}.game.snapshot = window.__realSnapshot`);

  // ---- Prepare: the mission design ---------------------------------------------------------
  await js(`${R}.desk.setPage('mission')`);
  await view('console');
  await shot('room-console-mission');
  await js(`${R}.desk.commitDesign()`);

  // ---- Fly by hand: a short burn, then the coasting forecast -------------------------------
  await view('flight');
  await key('keydown', 'w');
  await sleep(2500);
  await shot('room-flight-hands-on');
  await key('keyup', 'w');
  await sleep(4000);
  await shot('room-flight-coast-forecast');

  // ---- Attempt 1: a shallow dive on a committed plan, watched at warp ------------------------
  await js(`${R}.game.recall()`);
  await sleep(7500);
  await shot('room-back-at-the-door');
  await js(`${R}.desk.commitDesign()`);
  await view('flight');
  await js(dive(6.5, 'shallow dive'));
  await sleep(3000);
  await js(`${R}.game.setWarp(2000)`);
  await waitSim(19000, 'dive 1');
  await js(`${R}.game.setWarp(60)`);
  await shot('room-flight-forecast-and-trail');
  await js(`${R}.game.setWarp(2000)`);
  await waitSim(28800, 'dive 1 end');
  await js(`${R}.game.recall()`);
  await sleep(7500);
  await js(`${R}.desk.setPage('blackbox')`);
  await view('console');
  await shot('room-console-debrief');

  // ---- Attempt 2: deeper, to hold out ---------------------------------------------------------
  await js(`${R}.desk.setDesign({evidence:'validate', reserve: 5300}); ${R}.desk.commitDesign()`);
  await js(dive(12.5, 'deep dive'));
  await sleep(3000);
  await js(`${R}.game.setWarp(2000)`);
  await waitSim(28800, 'dive 2');
  await js(`${R}.game.recall()`);
  await sleep(9000);
  await js(`${R}.desk.setPage('model'); ${R}.desk.refreshReport(true)`);
  await view('console');
  await sleep(4000);
  await shot('room-console-model-before-rule');

  // ---- The rule: test it held out, adopt it, see the improvement hold --------------------------
  const ids = await js(`JSON.stringify(${R}.game.blackBox.archive().attempts.filter(a => a.outcome.kind !== 'in-progress' && a.measurements.length > 2000).map(a => a.id))`).then(JSON.parse);
  console.log('attempts with data', ids);
  const test = await js(`${R}.game.rules.test('distance-law', ${JSON.stringify(ids.slice(0, -1))}, '${ids.at(-1)}').then((r) => { ${R}.desk.tests.set('distance-law', r); ${R}.desk.notify(); return JSON.stringify({adoptable: r.adoptable, T: r.heldOutTest?.TperNu, fitted: r.fitted}); })`);
  console.log('rule test', test);
  await shot('room-console-model-rule-tested');
  await js(`${R}.game.rules.adopt('distance-law').then(() => ${R}.desk.refreshReport(true))`);
  await sleep(4000);
  await shot('room-console-model-rule-adopted');

  // ---- Compare the two dives ---------------------------------------------------------------------
  await js(`${R}.desk.setPage('blackbox')`);
  await sleep(500);
  for (const id of ids.slice(-2)) {
    const n = Number(id.slice(-4));
    await js(`[...document.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim().startsWith('Attempt ${n}'))?.click()`);
    await sleep(300);
  }
  await sleep(800);
  await shot('room-console-compare');
  await js(`${R}.desk.setCompare(${JSON.stringify(ids.slice(-2))})`);
  await view('flight');
  await js(`${R}.view.flight.setHeadingUp(false); ${R}.view.flight.setRange(1300000)`);
  await sleep(1200);
  await shot('room-flight-compare-overlay');
  await js(`${R}.desk.setCompare(undefined); ${R}.view.flight.setHeadingUp(true)`);

  // ---- Attempt 3 with the rule: a dive deeper than any flown, forecast through its low point ---
  await js(`${R}.desk.setDesign({evidence:'fly'}); ${R}.desk.commitDesign()`);
  await js(dive(16, 'deeper dive'));
  await sleep(3500);
  await js(`${R}.desk.setPage('plan')`);
  await view('console');
  await shot('room-console-plan');
  await view('flight');
  await js(`${R}.game.setWarp(2000)`);
  await waitSim(15000, 'dive 3');
  await js(`${R}.game.setWarp(60)`);
  await shot('room-flight-with-rule');

  // ---- Probe: point the camera at a rock (A6) ---------------------------------------------------
  const rock = await js(`${R}.game.snapshot().world.asteroids[0]?.id ?? ''`);
  if (rock) {
    await js(`${R}.game.command({ kind: 'point', sensor: 'camera', target: '${rock}' }); ${R}.game.setWarp(300)`);
    await sleep(6000);
    await js(`${R}.game.commit({ name: 'coast', items: [] })`).catch(() => undefined);
    await sleep(2500);
    console.log('rock probe', await js(`(() => { const s = ${R}.game.snapshot(); const a = s.world.asteroids.find((x) => x.id === '${rock}'); const f = s.forecasts.at(-1); const rec = ${R}.game.blackBox.attempt(${R}.game.status().attemptId); return JSON.stringify({ rock: '${rock}', tracked: a?.tracked, lastSeen: a?.lastSeen, t: s.t, forecastObjects: f?.objects.map((o) => o.id), fixes: rec?.measurements.filter((m) => m.target === '${rock}').reduce((n, m) => ({ ...n, [m.kind]: (n[m.kind] ?? 0) + 1 }), {}), bodiesTracked: s.world.bodies.map((b) => [b.id, b.tracked]) }); })()`));
    await js(`${R}.game.command({ kind: 'point', sensor: 'camera', target: 'alpha' }); ${R}.game.setWarp(60)`);
  }

  // ---- The other views -------------------------------------------------------------------------
  await js(`${R}.desk.setPage('systems')`);
  await view('console');
  await shot('room-console-systems');
  await view('ship');
  await sleep(1200);
  await shot('room-ship');
  await js(`${R}.view.ship.setSystem('power')`);
  await sleep(2200);
  await shot('room-ship-power');
  await js(`${R}.view.ship.setSystem('propulsion'); ${R}.view.ship.select('main-engine')`);
  await sleep(2200);
  await shot('room-ship-propulsion');
  await js(`${R}.view.ship.setSystem(null)`);
  await view('map');
  await sleep(1200);
  await shot('room-map');
  await js(`${R}.view.setRegion(true); ${R}.view.flight.setRange(5200000)`);
  await sleep(1500);
  await shot('room-map-region');
  await js(`${R}.view.setRegion(false)`);

  // ---- A loss: a plan that trusts the old law -----------------------------------------------------
  await js(`${R}.game.recall()`);
  await sleep(7500);
  await js(`${R}.game.rules.revoke('distance-law')`);
  await sleep(2500);
  await view('flight');
  await js(dive(41, 'newtonian dive'));
  await sleep(3500);
  await js(`${R}.game.setWarp(2000)`);
  let lost = false;
  for (let i = 0; i < 240 && !lost; i++) {
    lost = await js(`${R}.view.dying()`);
    if (!lost) await sleep(100);
  }
  await sleep(500);
  await shot('room-loss-shake');
  await sleep(2600);
  await shot('room-loss-black-box');
  await sleep(4500);
  await shot('room-loss-back-at-the-door');
  await js(`${R}.desk.setPage('blackbox')`);
  await view('console');
  await shot('room-console-debrief-loss');

  console.log('model error', await js(`${R}.desk.modelError() ?? 'none'`));
  const before = errors.length;
  await send('Page.navigate', { url: base + 'src/theme/lab/index.html' });
  await sleep(4000);
  await shot('ui-lab');
  console.log('lab errors', errors.length - before);
  console.log('page errors', errors.length ? errors.slice(0, 8) : 'none');
} catch (e) {
  console.error('FAILED', e);
  console.log('page errors', errors.slice(0, 8));
} finally {
  ws.close();
  proc.kill();
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* chrome may still hold it */ }
}
