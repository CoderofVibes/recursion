// Watch the open page until the attempt ends, a ship time is reached, or a time limit; print the
// state when it changes materially; re-raise warp after each drop if asked; film a loss.
//   node watch.mjs <seconds> [warp e.g. 2000×|-] [tag] [--until hh:mm]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HERE = join(tmpdir(), 'recursion-judge-run');
const NAME = process.env.JUDGE ? `-${process.env.JUDGE}` : '';
const { port } = JSON.parse(readFileSync(join(HERE, `chrome-state${NAME}.json`), 'utf8'));
const SHOTS = join(HERE, 'shots', process.env.JUDGE ?? '');
const limit = Number(process.argv[2] ?? 60) * 1000;
const warp = process.argv[3] && process.argv[3] !== '-' ? process.argv[3] : null;
const tag = process.argv[4] && !process.argv[4].startsWith('--') ? process.argv[4] : 'watch';
const untilAt = process.argv.indexOf('--until');
const until =
  untilAt > 0
    ? process.argv[untilAt + 1].split(':').reduce((n, x) => n * 60 + Number(x), 0) * 60
    : Infinity;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((yes) => ws.addEventListener('open', yes, { once: true }));
let next = 0;
const pending = new Map();
ws.addEventListener('message', ({ data }) => {
  const m = JSON.parse(data);
  const p = m.id && pending.get(m.id);
  if (p) {
    pending.delete(m.id);
    p(m.result ?? m.error);
  }
});
const send = (method, params = {}) =>
  new Promise((yes) => {
    const id = ++next;
    pending.set(id, yes);
    ws.send(JSON.stringify({ id, method, params }));
  });
const js = async (expression) =>
  (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result
    ?.value;
const shot = async (name) => {
  mkdirSync(SHOTS, { recursive: true });
  const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 65 });
  writeFileSync(join(SHOTS, `${name}.jpg`), Buffer.from(data, 'base64'));
};
const STATE = `(() => {
  const cr = document.querySelector('.cr');
  const src = cr?.dataset.mode === 'console' ? document.querySelector('.cs-foot') : document.querySelector('.cr-hud');
  const txt = src?.innerText ?? '';
  const t = src?.querySelector('.cs-time__met')?.textContent.trim() ?? '';
  const on = [...(src?.querySelectorAll('[role=radio][aria-checked=true]') ?? [])].map((e) => e.textContent.trim()).filter((s) => /×$/.test(s))[0] ?? '';
  const note = (txt.match(/▲[^\\n]*/) ?? [''])[0];
  const alerts = [...new Set([...document.querySelectorAll('.rx-alert')].map((e) => e.textContent.trim().replace(/\\s+/g, ' ')))].slice(0, 5);
  return { mode: cr?.dataset.mode, dying: cr?.hasAttribute('data-dying'), stage: document.querySelector('.cr-black')?.dataset.stage ?? null, t, warp: on, note, alerts, phase: (document.querySelector('.cs-foot')?.innerText.match(/ATTEMPT \\d+\\s+\\w+/) ?? [''])[0].replace(/\\s+/g, ' '), issues: (window.__judge ?? []).length };
})()`;
const clickText = (want) =>
  js(
    `(() => { const e = [...document.querySelectorAll('button, [role=radio]')].find((b) => b.textContent.trim().toUpperCase() === ${JSON.stringify(want.toUpperCase())} && !b.closest('[inert]') && b.getBoundingClientRect().width > 0); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
  ).then(async (at) => {
    if (!at) return false;
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: at.x,
      y: at.y,
      button: 'left',
      clickCount: 1,
    });
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: at.x,
      y: at.y,
      button: 'left',
      clickCount: 1,
    });
    return true;
  });

const t0 = Date.now();
let last = '';
let lastPrint = 0;
let drops = 0;
const secondsOf = (t) =>
  t
    ? t
        .slice(2)
        .split(':')
        .reduce((n, x) => n * 60 + Number(x), 0)
    : 0;
while (Date.now() - t0 < limit) {
  const s = await js(STATE);
  if (!s) {
    await sleep(300);
    continue;
  }
  const key = `${s.mode}|${s.dying}|${s.stage}|${s.warp}|${s.note}|${s.alerts.join(';').replace(/[0-9.,:]+/g, '#')}|${s.phase}`;
  if (key !== last || Date.now() - lastPrint > 15_000) {
    console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s ${JSON.stringify(s)}`);
    last = key;
    lastPrint = Date.now();
  }
  if (secondsOf(s.t) >= until) {
    console.log(`reached ${s.t}`);
    break;
  }
  if (s.dying || s.stage) {
    const from = Date.now();
    let n = 0;
    while (Date.now() - from < 7500) {
      const st = await js(
        `[document.querySelector('.cr')?.hasAttribute('data-dying'), document.querySelector('.cr-black')?.dataset.stage ?? null]`,
      );
      await shot(
        `${tag}-loss-${String(n).padStart(2, '0')}-${((Date.now() - from) / 1000).toFixed(2)}-${st?.[1] ?? (st?.[0] ? 'shake' : 'none')}`,
      );
      n++;
    }
    console.log(`filmed ${n} loss frames`);
    console.log(JSON.stringify(await js(STATE)));
    break;
  } else if (warp && s.warp !== warp && s.mode && drops < 60) {
    if (await clickText(warp)) drops++;
  }
  await sleep(350);
}
console.log(`done after ${((Date.now() - t0) / 1000).toFixed(1)}s; warp raised ${drops} times`);
console.log(JSON.stringify(await js(`(window.__judge ?? []).slice(-10)`)));
ws.close();
process.exit(0);
