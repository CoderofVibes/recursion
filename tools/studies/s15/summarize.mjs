// Regenerate evidence tables and source-mapped profile summaries from a completed run.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';
const here = dirname(fileURLToPath(import.meta.url));
const run = process.argv[2] ?? 'baseline';
if (!/^[\w-]+$/.test(run)) throw new Error('Unsafe run name');
const x = JSON.parse(readFileSync(join(here, `${run}.json`)));
const raw = existsSync(join(here, `${run}-frames.json.gz`))
  ? JSON.parse(gunzipSync(readFileSync(join(here, `${run}-frames.json.gz`)))) : [];
const stat = (v) => {
  const a = [...v].sort((a, b) => a - b);
  return { n: a.length, median: a[Math.max(0, Math.ceil(a.length * 0.5) - 1)] ?? null,
    p95: a[Math.max(0, Math.ceil(a.length * 0.95) - 1)] ?? null, worst: a.at(-1) ?? null };
};
const fmt = (v, d = 1) => v === null || v === undefined ? '—' : v.toFixed(d);
const grouped = new Map();
for (const r of raw) {
  const key = `${r.profile}/${r.view}/${r.requestedWarp}`;
  if (!grouped.has(key)) grouped.set(key, []);
  grouped.get(key).push(r);
}
const frames = [];
for (const [key, runs] of grouped) {
  const rows = runs.flatMap((r) => r.rows);
  const wall = runs.reduce((s, r) => s + (r.after.wall - r.before.wall) / 1000, 0);
  const ship = runs.reduce((s, r) => s + r.after.t - r.before.t, 0);
  const saturated = rows.filter((r) => r[2]);
  let saturatedWall = 0, saturatedShip = 0;
  for (const r of runs) {
    let lastT = r.before.t;
    for (const row of r.rows) {
      if (row[2]) { saturatedWall += row[0] / 1000; saturatedShip += row[1] - lastT; }
      lastT = row[1];
    }
  }
  const a = runs[0];
  frames.push({ key, profile: a.profile, view: a.view, warp: a.requestedWarp,
    ...stat(rows.map((r) => r[0])), wall, ship, shipPerWall: ship / wall,
    saturationPercent: 100 * saturated.length / rows.length,
    saturated: { ...stat(saturated.map((r) => r[0])), shipPerWall: saturatedWall ? saturatedShip / saturatedWall : null },
    warningDrops: runs.reduce((n, r) => n + r.warpReselections.length, 0),
    modelErrors: [...new Set(runs.map((r) => r.modelError).filter(Boolean))],
    perRunP95: runs.map((r) => stat(r.rows.map((v) => v[0])).p95),
  });
}
const loads = [];
for (const profile of ['native', 'modest']) for (const cache of ['cold', 'warm']) {
  const rows = x.loads.filter((r) => r.profile === profile && r.cache === cache);
  if (!rows.length) continue;
  loads.push({ profile, cache, ready: stat(rows.map((r) => r.ready)),
    firstInteraction: stat(rows.map((r) => r.interaction.paint)),
    keyToAck: stat(rows.map((r) => r.interaction.ack - r.interaction.sent)),
    consoleReady: stat(rows.map((r) => r.consoleReady)),
    transfers: rows.map((r) => r.navigation.transferSize + r.resources.reduce((n, v) => n + v.transferSize, 0)),
    fcp: stat(rows.map((r) => r.paints.find((p) => p.name === 'first-contentful-paint')?.startTime).filter(Number.isFinite)),
  });
}
const artifact = join(here, `${run}-profiles`);
const artifactFiles = existsSync(artifact) ? readdirSync(artifact) : [];
const maps = new Map();
for (const f of artifactFiles.filter((f) => f.endsWith('.map.gz')))
  maps.set(f.replace('.map.gz', ''), new TraceMap(JSON.parse(gunzipSync(readFileSync(join(artifact, f))))));
function sourceOf(frame) {
  const map = maps.get(frame.url.split('/').at(-1));
  if (!map || frame.lineNumber < 0) return null;
  const p = originalPositionFor(map, { line: frame.lineNumber + 1, column: Math.max(0, frame.columnNumber) });
  if (p.source) p.source = p.source.replace(/^(\.\.\/)+/, '');
  return p;
}
function summarizeCPU(file) {
  const p = JSON.parse(gunzipSync(readFileSync(join(artifact, file))));
  const nodes = new Map(p.nodes.map((n) => [n.id, n]));
  const parents = new Map();
  for (const n of p.nodes) for (const id of n.children ?? []) parents.set(id, n.id);
  const functions = new Map(), groups = new Map();
  const infos = new Map();
  for (const n of p.nodes) {
    const source = sourceOf(n.callFrame);
    const name = source?.name || n.callFrame.functionName || '(anonymous)';
    const key = `${source?.source ?? n.callFrame.url}:${source?.line ?? n.callFrame.lineNumber}:${name}`;
    infos.set(n.id, { key, name, source });
    if (!functions.has(key)) functions.set(key, { name, source, selfMs: 0, inclusiveMs: 0 });
  }
  for (let i = 0; i < p.samples.length; i++) {
    const id = p.samples[i], ms = p.timeDeltas[i] / 1000;
    const info = infos.get(id);
    functions.get(info.key).selfMs += ms;
    const source = info.source?.source ?? '';
    const group = source.startsWith('src/') ? source.split('/').slice(0, 2).join('/')
      : source.startsWith('node_modules/three') ? 'Three.js + addons'
      : source.startsWith('node_modules/react') || source.startsWith('node_modules/scheduler') ? 'React + DOM + scheduler'
      : source || info.name;
    groups.set(group, (groups.get(group) ?? 0) + ms);
    const seen = new Set();
    for (let ancestor = id; ancestor !== undefined; ancestor = parents.get(ancestor)) {
      const key = infos.get(ancestor).key;
      if (!seen.has(key)) { functions.get(key).inclusiveMs += ms; seen.add(key); }
    }
  }
  return { file, sampledMs: p.timeDeltas.reduce((s, n) => s + n, 0) / 1000,
    self: [...functions.values()].sort((a, b) => b.selfMs - a.selfMs).slice(0, 50),
    inclusive: [...functions.values()].sort((a, b) => b.inclusiveMs - a.inclusiveMs).slice(0, 30),
    groups: [...groups].map(([group, ms]) => ({ group, ms })).sort((a, b) => b.ms - a.ms) };
}
const cpu = artifactFiles.filter((f) => f.endsWith('.cpuprofile.gz')).map(summarizeCPU);
const trace = [];
const traceFile = join(artifact, 'worst-trace.json.gz');
if (existsSync(traceFile)) {
  const timeline = JSON.parse(gunzipSync(readFileSync(traceFile)));
  const byName = new Map();
  for (const e of timeline.traceEvents) if (e.ph === 'X' && e.dur) {
    if (!byName.has(e.name)) byName.set(e.name, []);
    byName.get(e.name).push(e.dur / 1000);
  }
  for (const [name, values] of byName) trace.push({ name, ...stat(values), totalMs: values.reduce((s, n) => s + n, 0) });
  trace.sort((a, b) => b.totalMs - a.totalMs);
}
const totalBytes = x.bundle.reduce((n, f) => n + f.bytes, 0);
const gzipBytes = x.bundle.reduce((n, f) => n + f.gzipBytes, 0);
const summary = { run, source: x.source, totalBytes, gzipBytes, loads, frames, cpu, trace,
  validity: { browserExceptions: x.errors.length, frames: x.frames.length,
    invalid: x.frames.filter((r) => r.hiddenFrames || r.pausedFrames || r.phases.some((p) => p !== 'operate')
      || r.attempts.length !== 1 || r.mode !== (['mission', 'plan', 'model', 'blackbox', 'systems'].includes(r.view) ? 'console' : r.view)
      || (r.mode === 'console' && r.page !== r.view)),
    modelErrors: x.frames.filter((r) => r.modelError).length,
    maxObserverMsPerFrame: Math.max(...x.frames.map((r) => r.observerMs / r.n)) } };
writeFileSync(join(here, `${run}-summary.json`), JSON.stringify(summary, null, 2) + '\n');
const md = [
  `# ${run} — generated measurement tables`, '',
  `[DEMONSTRATED: tools/studies/s15/${run}.json and ${run}-frames.json.gz]`, '',
  'Nearest-rank quantiles pooled across the recorded trials. Frame times are rAF intervals; all durations are milliseconds. CPU profiles are separate instrumented trials.', '',
  ...(loads.length ? [
    '| Profile | Cache | Ready median / max | First interaction median / max | Console ready median / max |',
    '| --- | --- | ---: | ---: | ---: |',
    ...loads.map((r) => `| ${r.profile} | ${r.cache} | ${fmt(r.ready.median)} / ${fmt(r.ready.worst)} | ${fmt(r.firstInteraction.median)} / ${fmt(r.firstInteraction.worst)} | ${fmt(r.consoleReady.median)} / ${fmt(r.consoleReady.worst)} |`),
  ] : ['No load trials in this focused run.']), '',
  '| Profile | View | Requested warp | Frames | Median | p95 | Worst | Ship s / wall s | Saturated % | Warning drops |',
  '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...frames.map((r) => `| ${r.profile} | ${r.view} | ${r.warp}× | ${r.n} | ${fmt(r.median)} | ${fmt(r.p95)} | ${fmt(r.worst)} | ${fmt(r.shipPerWall)} | ${fmt(r.saturationPercent)} | ${r.warningDrops} |`), '',
  '## Intervals reporting saturation', '',
  '| Profile | View | Warp | Saturated samples | Median | p95 | Worst | Ship s / wall s within these intervals |',
  '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...frames.filter((r) => r.saturated.n).map((r) => `| ${r.profile} | ${r.view} | ${r.warp}× | ${r.saturated.n} | ${fmt(r.saturated.median)} | ${fmt(r.saturated.p95)} | ${fmt(r.saturated.worst)} | ${fmt(r.saturated.shipPerWall)} |`), '',
];
for (const p of cpu) {
  md.push(`## ${p.file}`, '', `Sampled duration: ${fmt(p.sampledMs)} ms. Inclusive entries overlap; do not add them.`, '',
    '| Function | Original location | Self ms | Inclusive ms |', '| --- | --- | ---: | ---: |',
    ...p.self.slice(0, 20).map((r) => `| ${r.name.replaceAll('|', '\\|')} | ${r.source?.source ?? 'native/runtime'}:${r.source?.line ?? '—'} | ${fmt(r.selfMs)} | ${fmt(r.inclusiveMs)} |`), '');
}
const docs = new URL(`../../../docs/studies/s15/${run}-tables.md`, import.meta.url);
writeFileSync(docs, md.join('\n').trimEnd() + '\n');
console.log(JSON.stringify({ run, totalBytes, gzipBytes, loadTrials: x.loads.length, validity: summary.validity }, null, 2));
