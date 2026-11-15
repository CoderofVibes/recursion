// Run the unchanged S15 measurement logic against the production build, as a returning
// player. The once-per-browser opening is acknowledged in the CDP-created profile only.
// No game method, simulation, rendering or timing is replaced.
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const runner = new URL('../../../tools/studies/s15/measure.mjs', import.meta.url);
const temporary = new URL('vx-returning.mjs', runner);
const original = readFileSync(runner, 'utf8');
const needle = "source: readFileSync(join(here, 'page-probe.js'), 'utf8')";
if (!original.includes(needle)) throw new Error('S15 injection point changed');
const port = Number(process.env.VX_PREVIEW_PORT ?? 4175);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid preview port');
const source = original
  .replace(
    needle,
    `source: "localStorage.setItem('recursion:opening-seen','1');\\n" + readFileSync(join(here, 'page-probe.js'), 'utf8')`,
  )
  .replace('port: 4175,', `port: ${port},`)
  .replace('127.0.0.1:4175/', `127.0.0.1:${port}/`);
let created = false;
try {
  writeFileSync(temporary, source, { flag: 'wx' });
  created = true;
  const result = spawnSync(process.execPath, [fileURLToPath(temporary), ...process.argv.slice(2)], {
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  if (created) unlinkSync(temporary);
}
