import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class CDP {
  constructor(ws) {
    this.ws = ws;
    this.next = 0;
    this.pending = new Map();
    this.listeners = new Set();
    ws.addEventListener('message', ({ data }) => {
      const m = JSON.parse(data);
      if (m.id) {
        const p = this.pending.get(m.id);
        if (!p) return;
        this.pending.delete(m.id);
        clearTimeout(p.timer);
        if (m.error) p.reject(new Error(`${p.method}: ${m.error.message}`));
        else p.resolve(m.result);
      } else for (const fn of this.listeners) fn(m);
    });
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((yes, no) => {
      ws.addEventListener('open', yes, { once: true });
      ws.addEventListener('error', no, { once: true });
    });
    return new CDP(ws);
  }
  send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++this.next;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 120_000);
      this.pending.set(id, { resolve, reject, timer, method });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  async js(expression, sessionId) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }
  close() { this.ws.close(); }
}

export async function launchChrome() {
  const candidates = [process.env.S15_CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe')].filter(Boolean);
  const chrome = candidates.find(existsSync);
  if (!chrome) throw new Error('Installed Chrome not found. Set S15_CHROME; do not install a browser.');
  const profile = mkdtempSync(join(tmpdir(), 'recursion-s15-'));
  const args = ['--headless=new', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
    `--user-data-dir=${profile}`, '--window-size=1366,768', '--no-first-run', '--no-default-browser-check',
    '--enable-gpu', '--disable-background-networking', '--disable-component-update',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', 'about:blank'];
  const proc = spawn(chrome, args, { stdio: 'ignore', windowsHide: true });
  let launchError;
  proc.on('error', (e) => { launchError = e; });
  let cdp;
  try {
    for (let i = 0; i < 100; i++) {
      if (launchError) throw launchError;
      const active = join(profile, 'DevToolsActivePort');
      if (existsSync(active)) {
        const [port, path] = readFileSync(active, 'utf8').trim().split(/\r?\n/);
        cdp = await CDP.connect(`ws://127.0.0.1:${port}${path}`);
        break;
      }
      await sleep(100);
    }
    if (!cdp) throw new Error('Chrome did not expose DevTools');
    return { chrome, args, cdp, async stop() {
      await cdp.send('Browser.close').catch(() => {});
      cdp.close();
      await sleep(700);
      proc.kill();
      // Delete only the unique scratch profile created by this invocation, never a user profile.
      const target = resolve(profile), parent = resolve(tmpdir());
      if (!target.startsWith(parent + sep) || !target.split(sep).at(-1).startsWith('recursion-s15-'))
        throw new Error('Unexpected Chrome scratch-profile path');
      rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } };
  } catch (e) { proc.kill(); throw e; }
}
