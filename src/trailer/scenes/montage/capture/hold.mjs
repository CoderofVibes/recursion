/* global process, console, fetch, WebSocket, setTimeout, URL, Buffer */
// node src/trailer/scenes/montage/capture/hold.mjs
// Launches an isolated headless Chrome for NIGHT's driver (docs/handoffs/night/judge-run/do.mjs,
// instance JUDGE=m) and holds its page at the owner's recording size: 1536 x 864 CSS pixels at
// 1.25, so a screenshot is 1920 x 1080. The size lasts only while this process stays attached,
// so it runs for the whole session; `JUDGE=m node do.mjs stop` closes Chrome and ends it.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HERE = join(tmpdir(), 'recursion-judge-run');
mkdirSync(HERE, { recursive: true });
const profile = join(HERE, `profile-${Date.now()}`);
mkdirSync(profile, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const proc = spawn(
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
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    'about:blank',
  ],
  { stdio: 'ignore', detached: true, windowsHide: true },
);
proc.unref();
let port;
for (let i = 0; i < 200 && !port; i++) {
  await sleep(100);
  try {
    [port] = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').trim().split(/\r?\n/);
  } catch {
    /* Chrome is writing the port. */
  }
}
writeFileSync(
  join(HERE, 'chrome-state-m.json'),
  JSON.stringify({ port: Number(port), pid: proc.pid, profile }),
);

const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const socket = new WebSocket(tabs.find((tab) => tab.type === 'page').webSocketDebuggerUrl);
await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
let next = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  const done = pending.get(message.id);
  if (!done) return;
  pending.delete(message.id);
  done(message.result);
});
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++next;
    pending.set(id, resolve);
    socket.send(JSON.stringify({ id, method, params }));
  });
send('Page.enable');
send('Emulation.setDeviceMetricsOverride', {
  width: 1536,
  height: 864,
  deviceScaleFactor: 1.25,
  mobile: false,
});
// Page errors and warnings, kept for do.mjs's `issues` step.
send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
    if (window.__judge) return;
    const log = (window.__judge = []);
    const add = (kind, text) => { if (log.length < 400) log.push(kind + ': ' + String(text).slice(0, 500)); };
    window.addEventListener('error', (e) => add('error', (e.error && e.error.stack) || e.message));
    window.addEventListener('unhandledrejection', (e) => add('unhandledrejection', (e.reason && e.reason.stack) || e.reason));
    const real = console.error.bind(console);
    console.error = (...args) => { add('console.error', args.map((a) => (a && a.stack) || (typeof a === 'object' ? JSON.stringify(a) : a)).join(' ')); real(...args); };
  })();`,
});
// Screenshots come from this connection, the one that holds the size: another connection's
// would be 1536 x 864. png.mjs asks for one over this local port.
const shots = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  const dir = url.searchParams.get('dir');
  const name = url.searchParams.get('name');
  const result = await send('Page.captureScreenshot', { format: 'png' });
  const bytes = Buffer.from(result.data, 'base64');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.png`), bytes);
  // A PNG's size is in its header: bytes 16-23.
  response.end(`png ${name}: ${bytes.readUInt32BE(16)} x ${bytes.readUInt32BE(20)}\n`);
});
shots.listen(0, '127.0.0.1', () => {
  writeFileSync(
    join(HERE, 'chrome-state-m-shots.json'),
    JSON.stringify({ port: shots.address().port }),
  );
  console.log(`chrome up on ${port}, held at 1536 x 864 at 1.25`);
});
socket.addEventListener('close', () => process.exit(0));
