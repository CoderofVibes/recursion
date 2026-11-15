// Validate complete measurements and privacy without rerunning the benchmark.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { scrub } from './privacy.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
const leaks = [];
const account = process.env.USERNAME;
const accountPattern = account ? new RegExp(`\\b${account.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i') : null;
const inspect = (v, file) => {
  if (typeof v === 'string' && (scrub(v) !== v || /[A-Za-z]:[\\/]Users[\\/]|\/(?:Users|home)\/[^/\s<>]+/.test(v) || accountPattern?.test(v))) leaks.push(file);
  else if (Array.isArray(v)) v.forEach((x) => inspect(x, file));
  else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => { inspect(k, file); inspect(x, file); });
};
let parsed = 0;
for (const file of walk(here).filter((f) => f.endsWith('.json') || f.endsWith('.gz'))) {
  const content = file.endsWith('.gz') ? gunzipSync(readFileSync(file)) : readFileSync(file);
  inspect(JSON.parse(content), relative(here, file)); parsed++;
}
const summary = JSON.parse(readFileSync(join(here, 'recheck-summary.json')));
const run = JSON.parse(readFileSync(join(here, 'recheck.json')));
const full = run.loads.length === 20 && run.frames.length === 72;
const valid = summary.validity.invalid.length === 0 && !summary.validity.browserExceptions;
console.log(JSON.stringify({ parsedArtifacts: parsed, homePathLeaks: [...new Set(leaks)],
  loadTrials: run.loads.length, frameTrials: run.frames.length, fullMatrix: full,
  validity: summary.validity, completed: run.completed ?? null }, null, 2));
if (leaks.length || !full || !valid || !run.completed) process.exitCode = 1;
