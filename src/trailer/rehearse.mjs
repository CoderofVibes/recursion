/* global process, console, fetch, WebSocket, setTimeout, URL, Buffer */
// node src/trailer/rehearse.mjs [run] [stills] [--base http://localhost:5190]
// The trailer's rehearsal, in an isolated headless Chrome at the owner's recording size
// (1536 x 864 CSS pixels at 1.25, so 1920 x 1080), on the page loaded with ?quality=full.
//   run     one full play started with a real Space key: every beat change against the sheet,
//           frame intervals, page errors, and the room's render size through the run (R59).
//           Writes docs/handoffs/tr/rehearsal.json.
//   stills  one still of each beat, held with ?still=, as docs/handoffs/tr/beat-<id>.jpg.
// With neither word it does both. Needs the dev server (npm run dev -- --port 5190 --strictPort).
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const baseAt = args.indexOf('--base');
const base = baseAt >= 0 ? args[baseAt + 1] : 'http://localhost:5190';
const words = args.filter((a, i) => !a.startsWith('--') && !(baseAt >= 0 && i === baseAt + 1));
const want = (word) => words.length === 0 || words.includes(word);
const out = new URL('../../docs/handoffs/tr/', import.meta.url);
mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const profile = mkdtempSync(join(tmpdir(), 'recursion-tr-'));
const chrome = spawn(
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  [
    '--headless=new',
    '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--window-size=1536,864',
    '--no-first-run',
    '--no-default-browser-check',
    '--enable-gpu',
    '--force_high_performance_gpu',
    '--autoplay-policy=no-user-gesture-required',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    'about:blank',
  ],
  { stdio: 'ignore', detached: true, windowsHide: true },
);
chrome.unref();
let port;
for (let i = 0; i < 200 && !port; i++) {
  await wait(100);
  try {
    [port] = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').trim().split(/\r?\n/);
  } catch {
    /* Chrome is writing the port. */
  }
}
const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const socket = new WebSocket(tabs.find((tab) => tab.type === 'page').webSocketDebuggerUrl);
await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
let next = 0;
const pending = new Map();
const issues = [];
socket.addEventListener('message', ({ data }) => {
  const m = JSON.parse(data);
  if (m.method === 'Runtime.exceptionThrown')
    issues.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
    issues.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
  const task = pending.get(m.id);
  if (!task) return;
  pending.delete(m.id);
  if (m.error) task.reject(new Error(JSON.stringify(m.error)));
  else task.resolve(m.result);
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++next;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
const js = async (expression) => {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails)
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
};
const open = async (query) => {
  await send('Page.navigate', { url: `${base}/src/trailer/?quality=full${query}` });
  for (let i = 0; i < 900; i++) {
    if (await js('window.__trailer?.state() === "ready"').catch(() => false)) return;
    await wait(100);
  }
  throw new Error('The trailer did not get ready');
};
const percentile = (values, p) =>
  [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))];

try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1536,
    height: 864,
    deviceScaleFactor: 1.25,
    mobile: false,
  });

  if (want('run')) {
    await open('');
    // Every frame: the interval since the last, the beat on screen, and the room's render size
    // (the composer's target against the canvas: equal while the pixel ratio is the renderer's).
    await js(`(() => {
      const renderSize = () => window.__trailerRenderSize?.() ?? null;
      const frames = (window.__rehearsal = { intervals: [], sizes: new Set() });
      let previous;
      const measure = (now) => {
        const state = window.__trailer.state();
        if (state === 'ended') return;
        if (state === 'playing') {
          if (previous !== undefined)
            frames.intervals.push({ beat: window.__trailer.record().at(-1)?.beat, ms: now - previous });
          const size = renderSize();
          if (size) frames.sizes.add(size.join(' '));
        }
        previous = now;
        requestAnimationFrame(measure);
      };
      requestAnimationFrame(measure);
    })()`);
    for (const type of ['keyDown', 'keyUp'])
      await send('Input.dispatchKeyEvent', {
        type,
        key: ' ',
        code: 'Space',
        windowsVirtualKeyCode: 32,
      });
    for (let i = 0; i < 400; i++) {
      if (await js('window.__trailer.state() === "ended"')) break;
      if (i === 399) throw new Error('The run did not end');
      await wait(100);
    }
    const result = await js(`(() => {
      const canvas = document.querySelector('.tv-rig canvas');
      const gl = canvas.getContext('webgl2');
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        state: window.__trailer.state(),
        record: window.__trailer.record(),
        missingSounds: window.__trailer.missing(),
        intervals: window.__rehearsal.intervals,
        renderSizes: [...window.__rehearsal.sizes],
        label: document.querySelector('.tr-label')?.textContent ?? null,
        gpu: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        css: [innerWidth, innerHeight],
        dpr: devicePixelRatio,
        canvas: [canvas.width, canvas.height],
      };
    })()`);
    const byBeat = {};
    for (const { beat, ms } of result.intervals) (byBeat[beat ?? 'before'] ??= []).push(ms);
    const frames = Object.fromEntries(
      Object.entries(byBeat).map(([beat, list]) => [
        beat,
        {
          frames: list.length,
          medianMs: +percentile(list, 0.5).toFixed(2),
          p95Ms: +percentile(list, 0.95).toFixed(2),
          worstMs: +Math.max(...list).toFixed(2),
          over16_7: list.filter((ms) => ms > 1000 / 60).length,
        },
      ]),
    );
    const late = result.record.map((r) => +(r.t - r.sheet).toFixed(4));
    const report = {
      url: '/src/trailer/?quality=full',
      state: result.state,
      beatChanges: result.record.length,
      worstLateS: Math.max(...late),
      record: result.record.map((r, i) => ({ beat: r.beat, sheet: r.sheet, late: late[i] })),
      missingSounds: result.missingSounds,
      cornerLabel: result.label,
      css: result.css,
      dpr: result.dpr,
      canvas: result.canvas,
      // One entry means the room's render target never changed size during the run.
      renderSizes: result.renderSizes,
      gpu: result.gpu,
      frames,
      issues,
    };
    writeFileSync(new URL('rehearsal.json', out), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ ...report, record: undefined, frames: undefined }, null, 2));
    console.table(frames);
  }

  if (want('stills')) {
    const beats = await js(
      `import('/src/trailer/timeline.ts').then((m) => m.BEATS.filter((b) => b.scene).map((b) => ({ id: b.id, start: b.start, length: b.length })))`,
    );
    for (const beat of beats) {
      // The middle of the beat; the lattice also just after its strike, with the damage on.
      const moments = [[beat.id, beat.start + beat.length / 2]];
      if (beat.id === 'lattice') moments.push(['lattice-strike', 9.4]);
      for (const [name, t] of moments) {
        await open(`&still=${t.toFixed(3)}`);
        await js('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
        await wait(400);
        const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
        writeFileSync(new URL(`beat-${name}.jpg`, out), Buffer.from(data, 'base64'));
        console.log(`still beat-${name}.jpg at ${t.toFixed(2)} s`);
      }
    }
    if (issues.length) console.log(`issues:\n${issues.join('\n')}`);
  }
} finally {
  await send('Browser.close').catch(() => {});
  socket.close();
}
process.exit(issues.length ? 1 : 0);
