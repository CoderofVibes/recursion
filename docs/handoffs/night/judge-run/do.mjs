// Step-by-step driver for a headless Chrome that stays up between calls.
//   node do.mjs start                      launch Chrome (fresh profile) and leave it running
//   node do.mjs stop                       close it
//   node do.mjs <step> :: <step> :: ...    run steps against the open page
// Steps: open URL | key K [holdMs] | hold K ms | click TARGET | fill SELECTOR VALUE | wait MS |
//        waitfor EXPR [timeoutMs] | text [SELECTOR] [maxChars] | shot NAME | js EXPR | issues |
//        media reduced|none | size W H | clear (storage) | luma
// Real key and mouse events only. An in-page collector keeps errors and warnings across calls.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Chrome's profile, its state file and the screenshots go in the system's temporary folder.
const HERE = join(tmpdir(), 'recursion-judge-run');
mkdirSync(HERE, { recursive: true });
const STATE = join(HERE, `chrome-state${process.env.JUDGE ? `-${process.env.JUDGE}` : ''}.json`);
const SHOTS = join(HERE, 'shots', process.env.JUDGE ?? '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const KEYS = {
  Enter: ['Enter', 'Enter', 13, '\r'],
  Escape: ['Escape', 'Escape', 27],
  Tab: ['Tab', 'Tab', 9],
  Space: [' ', 'Space', 32, ' '],
  ArrowUp: ['ArrowUp', 'ArrowUp', 38],
  ArrowDown: ['ArrowDown', 'ArrowDown', 40],
  ArrowLeft: ['ArrowLeft', 'ArrowLeft', 37],
  ArrowRight: ['ArrowRight', 'ArrowRight', 39],
  Shift: ['Shift', 'ShiftLeft', 16],
  minus: ['-', 'Minus', 189, '-'],
  equal: ['=', 'Equal', 187, '='],
  comma: [',', 'Comma', 188, ','],
  period: ['.', 'Period', 190, '.'],
  slash: ['/', 'Slash', 191, '/'],
};
function keyOf(k) {
  if (KEYS[k]) {
    const [key, code, vk, text] = KEYS[k];
    return { key, code, vk, text };
  }
  if (/^[a-z]$/i.test(k))
    return { key: k, code: `Key${k.toUpperCase()}`, vk: k.toUpperCase().charCodeAt(0), text: k };
  if (/^[0-9]$/.test(k)) return { key: k, code: `Digit${k}`, vk: k.charCodeAt(0), text: k };
  throw new Error(`no key mapping for ${k}`);
}

const COLLECTOR = `(() => {
  if (window.__judge) return;
  const log = (window.__judge = []);
  const stamp = () => new Date().toISOString().slice(11, 23);
  const add = (kind, text) => { if (log.length < 400) log.push(stamp() + ' ' + kind + ': ' + String(text).slice(0, 500)); };
  window.addEventListener('error', (e) => add('error', (e.error && e.error.stack) || e.message));
  window.addEventListener('unhandledrejection', (e) => add('unhandledrejection', (e.reason && e.reason.stack) || e.reason));
  for (const level of ['error', 'warn']) {
    const real = console[level].bind(console);
    console[level] = (...args) => { add('console.' + level, args.map((a) => (a && a.stack) || (typeof a === 'object' ? JSON.stringify(a) : a)).join(' ')); real(...args); };
  }
})();`;

async function connect() {
  if (!existsSync(STATE)) throw new Error('no Chrome running: node do.mjs start');
  const { port } = JSON.parse(readFileSync(STATE, 'utf8'));
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = list.find((t) => t.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((yes, no) => {
    ws.addEventListener('open', yes, { once: true });
    ws.addEventListener('error', no, { once: true });
  });
  let next = 0;
  const pending = new Map();
  ws.addEventListener('message', ({ data }) => {
    const m = JSON.parse(data);
    const p = m.id && pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    clearTimeout(p.timer);
    if (m.error) p.no(new Error(`${p.method}: ${m.error.message}`));
    else p.yes(m.result);
  });
  const send = (method, params = {}) =>
    new Promise((yes, no) => {
      const id = ++next;
      const timer = setTimeout(
        () => pending.delete(id) && no(new Error(`CDP timeout: ${method}`)),
        240_000,
      );
      pending.set(id, { yes, no, method, timer });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const js = async (expression) => {
    const r = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails)
      throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  return { send, js, close: () => ws.close() };
}

async function start() {
  if (existsSync(STATE)) await stop().catch(() => {});
  const profile = join(HERE, `profile-${Date.now()}`);
  mkdirSync(profile, { recursive: true });
  const proc = spawn(
    CHROME,
    [
      '--headless=new',
      '--remote-debugging-address=127.0.0.1',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--window-size=1366,768',
      '--no-first-run',
      '--no-default-browser-check',
      '--enable-gpu',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      'about:blank',
    ],
    { stdio: 'ignore', detached: true, windowsHide: true },
  );
  proc.unref();
  const active = join(profile, 'DevToolsActivePort');
  let port;
  for (let i = 0; i < 200 && !port; i++) {
    await sleep(100);
    try {
      [port] = readFileSync(active, 'utf8').trim().split(/\r?\n/);
    } catch {
      /* not written yet, or still being written */
    }
  }
  writeFileSync(STATE, JSON.stringify({ port: Number(port), pid: proc.pid, profile }));
  const c = await connect();
  await c.send('Page.enable');
  await c.send('Emulation.setDeviceMetricsOverride', {
    width: 1366,
    height: 768,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: COLLECTOR });
  c.close();
  console.log(`chrome up on ${port}`);
}

async function stop() {
  const { pid, profile } = JSON.parse(readFileSync(STATE, 'utf8'));
  try {
    const c = await connect();
    await c.send('Browser.close').catch(() => {});
    c.close();
  } catch {
    /* already gone */
  }
  await sleep(800);
  try {
    process.kill(pid);
  } catch {
    /* already gone */
  }
  rmSync(STATE, { force: true });
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  console.log('chrome stopped');
}

async function run(steps) {
  const c = await connect();
  const { send, js } = c;
  const locate = (target) => {
    const finder = target.startsWith('text=')
      ? `[...document.querySelectorAll('button, a, [role=radio], [role=tab], label, summary, [role=button]')].find((e) => {
           const t = (e.getAttribute('aria-label') ?? e.textContent ?? '').replace(/\\s+/g, ' ').trim();
           const want = ${JSON.stringify(target.slice(5))};
           const r = e.getBoundingClientRect();
           return r.width > 0 && r.height > 0 && (t.toUpperCase() === want.toUpperCase() || t.toUpperCase().startsWith(want.toUpperCase())) && !e.closest('[inert]');
         })`
      : `[...document.querySelectorAll(${JSON.stringify(target)})].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })`;
    return js(
      `(() => { const e = ${finder}; if (!e) return null; e.scrollIntoView({ block: 'center', inline: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, disabled: !!e.disabled || e.getAttribute('aria-disabled') === 'true', text: (e.textContent ?? '').trim().slice(0, 80) }; })()`,
    );
  };
  const down = async (k) => {
    const d = keyOf(k);
    await send('Input.dispatchKeyEvent', {
      type: d.text ? 'keyDown' : 'rawKeyDown',
      key: d.key,
      code: d.code,
      windowsVirtualKeyCode: d.vk,
      nativeVirtualKeyCode: d.vk,
      ...(d.text ? { text: d.text } : {}),
    });
  };
  const up = async (k) => {
    const d = keyOf(k);
    await send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: d.key,
      code: d.code,
      windowsVirtualKeyCode: d.vk,
      nativeVirtualKeyCode: d.vk,
    });
  };
  for (const step of steps) {
    const [cmd, ...a] = step;
    try {
      if (cmd === 'open') {
        await send('Page.navigate', { url: a[0] });
        for (
          let i = 0;
          i < 300 && !(await js(`document.readyState === 'complete'`).catch(() => false));
          i++
        )
          await sleep(100);
      } else if (cmd === 'key') {
        await down(a[0]);
        await sleep(Number(a[1] ?? 40));
        await up(a[0]);
        await sleep(40);
      } else if (cmd === 'hold') {
        // Auto-repeat like a held key, so a hold reads as one.
        await down(a[0]);
        const until = Date.now() + Number(a[1]);
        while (Date.now() < until) await sleep(50);
        await up(a[0]);
        await sleep(40);
      } else if (cmd === 'click') {
        const at = await locate(a.join(' '));
        if (!at) console.log(`  ! nothing to click: ${a.join(' ')}`);
        else if (at.disabled) console.log(`  ! disabled: ${a.join(' ')}`);
        else {
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
          await sleep(80);
        }
      } else if (cmd === 'fill') {
        const at = await locate(a[0]);
        if (!at) console.log(`  ! no field: ${a[0]}`);
        else {
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
          await send('Input.dispatchKeyEvent', {
            type: 'rawKeyDown',
            key: 'a',
            code: 'KeyA',
            windowsVirtualKeyCode: 65,
            modifiers: 2,
          });
          await send('Input.dispatchKeyEvent', {
            type: 'keyUp',
            key: 'a',
            code: 'KeyA',
            windowsVirtualKeyCode: 65,
            modifiers: 2,
          });
          await send('Input.insertText', { text: a.slice(1).join(' ') });
          await sleep(80);
        }
      } else if (cmd === 'wait') await sleep(Number(a[0]));
      else if (cmd === 'waitfor') {
        const until = Date.now() + Number(a[1] ?? 30_000);
        let ok = false;
        while (!(ok = await js(a[0]).catch(() => false)) && Date.now() < until) await sleep(150);
        if (!ok) console.log(`  ! timed out: ${a[0]}`);
      } else if (cmd === 'text') {
        const max = Number(a[1] ?? 2500);
        const t = await js(
          `(document.querySelector(${JSON.stringify(a[0] ?? 'body')})?.innerText ?? '(none)').replace(/\\n{2,}/g, '\\n')`,
        );
        console.log(t.length > max ? `${t.slice(0, max)}\n…(+${t.length - max})` : t);
      } else if (cmd === 'shot') {
        mkdirSync(SHOTS, { recursive: true });
        const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
        const file = join(SHOTS, `${a[0]}.jpg`);
        writeFileSync(file, Buffer.from(data, 'base64'));
        console.log(`  shot ${file}`);
      } else if (cmd === 'js') console.log(JSON.stringify(await js(a.join(' '))));
      else if (cmd === 'issues') {
        const list = await js(`(window.__judge ?? []).splice(0)`);
        console.log(list.length ? `issues:\n${list.join('\n')}` : 'issues: none');
      } else if (cmd === 'media')
        await send('Emulation.setEmulatedMedia', {
          features: [
            {
              name: 'prefers-reduced-motion',
              value: a[0] === 'reduced' ? 'reduce' : 'no-preference',
            },
          ],
        });
      else if (cmd === 'size')
        await send('Emulation.setDeviceMetricsOverride', {
          width: Number(a[0]),
          height: Number(a[1]),
          deviceScaleFactor: 1,
          mobile: false,
        });
      else if (cmd === 'clear') {
        const origin = await js('location.origin');
        await send('Storage.clearDataForOrigin', { origin, storageTypes: 'all' });
      } else if (cmd === 'throttle')
        await send('Emulation.setCPUThrottlingRate', { rate: Number(a[0]) });
      else console.log(`  ! unknown step ${cmd}`);
    } catch (e) {
      console.log(`  ! ${cmd} ${a.join(' ')}: ${e.message}`);
    }
  }
  c.close();
}

const args = process.argv.slice(2);
if (args[0] === 'start') await start();
else if (args[0] === 'stop') await stop();
else {
  const steps = [];
  let cur = [];
  for (const arg of args) {
    if (arg === '::') {
      if (cur.length) steps.push(cur);
      cur = [];
    } else cur.push(arg);
  }
  if (cur.length) steps.push(cur);
  await run(steps);
}
process.exit(0);
