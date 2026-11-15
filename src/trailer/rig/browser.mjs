/* global console, setTimeout */
// Isolated installed Chrome, requesting the recording laptop's discrete GPU.
// Chromium uses this same flag in its dual-GPU integration tests. No OS preferences change.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profile = mkdtempSync(join(tmpdir(), 'recursion-tv-'));
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
for (let i = 0; i < 200; i++) {
  await new Promise((resolve) => setTimeout(resolve, 100));
  try {
    const [port] = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split(/\r?\n/);
    console.log(JSON.stringify({ port: Number(port), pid: proc.pid, profile }));
    break;
  } catch {
    /* Chrome is writing the port. */
  }
}
