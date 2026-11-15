// Group S15 main-thread self times by source area; per tick (ship second) and per frame.
// Usage, from the repository root: node docs/engineering/s15-rank1/profile-groups.mjs
import fs from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const group = (src) => {
  if (!src) return '(program, GC, unmapped)';
  const s = src.source.replaceAll('\\', '/');
  if (s.includes('node_modules/three')) return 'three.js';
  if (s.includes('node_modules/react') || s.includes('node_modules/scheduler')) return 'react';
  const m = s.match(/src\/([a-z0-9-]+)(\/[a-z0-9-]+)?/i);
  if (!m) return 'other';
  if (m[1] === 'ship') return 'src/ship';
  if (m[1] === 'game') return s.includes('environment.ts') ? 'src/game/environment.ts' : 'src/game (rest)';
  return `src/${m[1]}`;
};
const out = {};
for (const c of ['before', 'after']) {
  const r = JSON.parse(fs.readFileSync(`${here}/${c}/2g-r1.json`, 'utf8'));
  const pr = r.profiles.at(-1);
  const sums = {};
  let total = 0;
  for (const f of pr.functions) {
    const g = f.name === '(garbage collector)' ? '(garbage collector)' : group(f.source);
    sums[g] = (sums[g] ?? 0) + f.ms;
    total += f.ms;
  }
  out[c] = { sums, total, ticks: pr.instrumentedFrames.shipSeconds, frames: pr.instrumentedFrames.n };
}
const keys = [...new Set(Object.values(out).flatMap((o) => Object.keys(o.sums)))].sort(
  (a, b) => (out.before.sums[b] ?? 0) - (out.before.sums[a] ?? 0),
);
console.log('area | before ms (share) | before ms/tick | after ms (share) | after ms/tick');
for (const k of keys) {
  const b = out.before, a = out.after;
  const cell = (o) => `${(o.sums[k] ?? 0).toFixed(0)} (${((100 * (o.sums[k] ?? 0)) / o.total).toFixed(1)}%) | ${((o.sums[k] ?? 0) / o.ticks).toFixed(3)}`;
  console.log(`${k} | ${cell(b)} | ${cell(a)}`);
}
for (const [c, o] of Object.entries(out))
  console.log(c, 'sampled', o.total.toFixed(0), 'ms', 'ticks', o.ticks, 'frames', o.frames, 'ms per frame', (o.total / o.frames).toFixed(1));
