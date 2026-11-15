/**
 * S20 recheck of S15's local production benchmark, no installs:
 *   node tools/studies/s20/measure.mjs
 * Optional: --run smoke --views room --repeats 1 --seconds 2 --load-repeats 1
 * --phase all|load|frames|profile, --profiles native,modest, --warps 1,2000,
 * --no-build (requires an existing dist), --run NAME (keeps independent runs).
 * Times are observations, not deterministic constants. Inputs/order/seed are fixed.
 */
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { writeEvidence as writeFileSync } from './privacy.mjs';
import { cpus, freemem, platform, release, totalmem } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build, preview } from 'vite';
import { TraceMap, originalPositionFor, eachMapping } from '@jridgewell/trace-mapping';
import { launchChrome, sleep } from '../s15/cdp.mjs';
import { patchOverlay } from '../s15/patch-overlay.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = fileURLToPath(new URL('../../../', import.meta.url));
const argv = process.argv.slice(2);
const arg = (key, fallback) => { const n = argv.indexOf(`--${key}`); return n < 0 ? fallback : argv[n + 1]; };
const run = arg('run', 'baseline');
if (!/^[a-zA-Z0-9_-]+$/.test(run)) throw new Error('Unsafe run name');
const phase = arg('phase', 'all');
const seconds = Number(arg('seconds', 8));
const repeats = Number(arg('repeats', 2));
const loadRepeats = Number(arg('load-repeats', 5));
const views = arg('views', 'room,mission,plan,model,blackbox,systems,flight,map,ship').split(',');
const warps = arg('warps', '1,2000').split(',').map(Number);
const profileNames = arg('profiles', 'native,modest').split(',');
if (!['all', 'load', 'frames', 'profile'].includes(phase)) throw new Error('Unknown --phase');
if (![seconds, repeats, loadRepeats].every((n) => Number.isFinite(n) && n > 0)
    || !Number.isInteger(repeats) || !Number.isInteger(loadRepeats)) throw new Error('Invalid duration/repeat count');
if (views.some((v) => !['room', 'mission', 'plan', 'model', 'blackbox', 'systems', 'flight', 'map', 'ship'].includes(v)))
  throw new Error('Unknown view');
if (profileNames.some((p) => !['native', 'modest'].includes(p)) || warps.some((w) => ![1, 10, 60, 300, 1000, 2000].includes(w)))
  throw new Error('Unknown profile/warp');
const profiles = {
  native: { cpu: 1, latency: 0, downloadThroughput: -1, uploadThroughput: -1, connectionType: 'none' },
  modest: { cpu: 4, latency: 40, downloadThroughput: 10_000_000 / 8, uploadThroughput: 1_000_000 / 8, connectionType: 'wifi' },
};
const out = join(here, `${run}.json`);
const rawOut = join(here, `${run}-frames.json.gz`);
const artifacts = join(here, `${run}-profiles`);
const patch = arg('patch', null);
const overlay = patch ? patchOverlay(root, join(root, patch)) : null;
const dist = overlay ? join(here, '.scratch', `${run}-dist`) : join(root, 'dist');
const plugins = overlay ? [overlay.plugin] : [];
mkdirSync(artifacts, { recursive: true });
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const save = () => writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
const result = existsSync(out) && phase !== 'all' ? JSON.parse(readFileSync(out, 'utf8')) : {
  schema: 1, run, started: new Date().toISOString(), source: {
    commit: git('rev-parse', 'HEAD'), srcTree: git('rev-parse', 'HEAD:src'), dataTree: git('rev-parse', 'HEAD:data'),
    branch: git('branch', '--show-current'), dirtyInputs: git('diff', '--name-only', 'HEAD', '--', 'src', 'data', 'package.json', 'package-lock.json', 'vite.config.ts'),
  },
  host: { node: process.version, os: `${platform()} ${release()}`, cpu: cpus()[0]?.model,
    logicalCpus: cpus().length, totalMemoryBytes: totalmem(), freeMemoryBytesAtStart: freemem() },
  settings: { seconds, repeats, loadRepeats, views, warps, profiles, viewport: [1366, 768, 1],
    warmupMs: 1200, presentation: 'installed headless Chrome, GPU enabled; no GPU throttle',
    timeToInteraction: 'navigation start to a trusted key 3 producing console data-mode; separate console-ready paint includes camera travel',
    frameDefinition: 'consecutive requestAnimationFrame timestamps in foreground; not GPU execution duration',
    fixture: 'fresh origin storage, shipped arrival seed, no archived attempts, coasting, no synthetic bodies or commands',
    topWarpPolicy: 'bounded stress: reselect 2000 through the existing game control after automatic drops; log each drop; do not suppress alerts or model errors',
  }, loads: [], frames: [], profiles: [], errors: [],
};
if (result.source.dirtyInputs) throw new Error('Benchmark requires clean src/data/build inputs');
for (const tree of ['src', 'data']) {
  if (git('rev-parse', `HEAD:${tree}`) !== result.source[`${tree}Tree`])
    throw new Error('Source tree changed since this run; choose a new --run');
}
for (const path of ['package.json', 'package-lock.json', 'vite.config.ts', 'index.html']) {
  if (git('rev-parse', `HEAD:${path}`) !== git('rev-parse', `${result.source.commit}:${path}`))
    throw new Error('Build input changed since this run; choose a new --run');
}
if (existsSync(out) && phase !== 'all' && (result.source.patch?.sha256 ?? null) !==
    (patch ? hash(readFileSync(join(root, patch))) : null)) throw new Error('Patch identity changed; choose a new --run');
if (patch) result.source.patch = { path: patch, sha256: hash(readFileSync(join(root, patch))) };

const stats = (values) => {
  if (!values.length) return { n: 0, median: null, p95: null, worst: null };
  const a = [...values].sort((x, y) => x - y);
  const q = (p) => a[Math.max(0, Math.ceil(a.length * p) - 1)];
  return { n: a.length, median: q(0.5), p95: q(0.95), worst: a.at(-1), mean: a.reduce((s, x) => s + x, 0) / a.length };
};
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
async function command(exe, args) {
  await new Promise((yes, no) => {
    const p = spawn(exe, args, { cwd: root, stdio: 'inherit', windowsHide: true });
    p.on('error', no); p.on('exit', (code) => code === 0 ? yes() : no(new Error(`${exe} exit ${code}`)));
  });
}
if (!argv.includes('--no-build')) {
  // npm's installed JS entry point avoids cmd quoting and uses precisely the package build script.
  const npm = join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  if (overlay) await build({ root, plugins, build: { outDir: dist } });
  else await command(process.execPath, [npm, 'run', 'build']);
}
result.bundle = walk(dist).map((f) => {
  const b = readFileSync(f);
  return { file: relative(dist, f).replaceAll('\\', '/'), bytes: b.length,
    gzipBytes: gzipSync(b, { level: 9 }).length, sha256: hash(b) };
});
// Rebuild to memory with hidden source maps for attribution. Reject a code mismatch.
// Maps are diagnostic artifacts; never served in the measured production build or size totals.
const mapped = await build({ root, plugins, logLevel: 'error', build: { write: false, sourcemap: 'hidden', outDir: dist },
  worker: { plugins: () => [{ name: 's15-worker-map', generateBundle(_, bundle) {
    for (const c of Object.values(bundle)) if (c.type === 'chunk' && c.map)
      writeFileSync(join(artifacts, `${c.fileName.split('/').at(-1)}.map.gz`), gzipSync(JSON.stringify(c.map)));
  } }], },
});
const maps = new Map();
const outputs = (Array.isArray(mapped) ? mapped : [mapped]).flatMap((b) => b.output);
for (const c of outputs) {
  if (c.type !== 'asset' || c.fileName.endsWith('.map')) continue;
  if (!existsSync(join(dist, c.fileName)) || hash(readFileSync(join(dist, c.fileName))) !== hash(c.source))
    throw new Error(`Measured asset differs from current build: ${c.fileName}`);
}
result.chunkContents = [];
for (const c of outputs) {
  if (c.type !== 'chunk') continue;
  const actual = readFileSync(join(dist, c.fileName));
  if (hash(actual) !== hash(c.code)) throw new Error(`Source-map build differs from measured build: ${c.fileName}`);
  if (!c.map) continue;
  const tm = new TraceMap(c.map);
  maps.set(c.fileName.split('/').at(-1), tm);
  writeFileSync(join(artifacts, `${c.fileName.split('/').at(-1)}.map.gz`), gzipSync(JSON.stringify(c.map)));
  const groups = {};
  const positions = [];
  eachMapping(tm, (m) => positions.push(m));
  const lines = c.code.split('\n');
  const offsets = [0];
  for (const line of lines) offsets.push(offsets.at(-1) + line.length + 1);
  const group = (s) => {
    if (!s) return 'unmapped';
    if (s.includes('node_modules/three')) return 'Three.js + addons';
    if (/node_modules\/(react|react-dom|scheduler)/.test(s)) return 'React + DOM + scheduler';
    const m = s.match(/(?:^|\/)src\/([^/]+)/);
    if (m) return `src/${m[1]}`;
    if (s.includes('data/')) return 'data';
    return 'other';
  };
  for (let i = 0; i < positions.length; i++) {
    const m = positions[i], next = positions[i + 1];
    const start = offsets[m.generatedLine - 1] + m.generatedColumn;
    const end = next ? offsets[next.generatedLine - 1] + next.generatedColumn : c.code.length;
    const g = group(m.source); groups[g] = (groups[g] ?? 0) + Math.max(0, end - start);
  }
  result.chunkContents.push({ file: c.fileName, mappedGeneratedCharacters: groups,
    modules: Object.keys(c.modules).map((m) => m.replaceAll('\\', '/').replace(root.replaceAll('\\', '/'), '')) });
}
save();

let server, browser;
const rawFrames = [];
try {
  server = await preview({ root, logLevel: 'error', build: { outDir: dist }, preview: { host: '127.0.0.1', port: 4176, strictPort: true } });
  const base = 'http://127.0.0.1:4176/';
  browser = await launchChrome();
  const cdp = browser.cdp;
  result.browser = await cdp.send('Browser.getVersion');
  result.host.gpu = (await cdp.send('SystemInfo.getInfo')).gpu;
  result.chrome = { path: browser.chrome, args: browser.args.map((a) => a.startsWith('--user-data-dir') ? '--user-data-dir=<unique temporary profile>' : a) };
  let context, session, target;
  let responses = [];
  const workerSessions = new Set();
  cdp.listeners.add((m) => {
    if (m.method === 'Runtime.exceptionThrown') result.errors.push({ session: m.sessionId, details: m.params.exceptionDetails });
    if (m.method === 'Network.responseReceived' && m.sessionId === session) {
      const r = m.params.response;
      responses.push({ url: r.url.replace(base, '/'), status: r.status, mimeType: r.mimeType,
        fromDiskCache: !!r.fromDiskCache, fromServiceWorker: !!r.fromServiceWorker,
        contentEncoding: r.headers['Content-Encoding'] ?? r.headers['content-encoding'] ?? 'none' });
    }
    if (m.method === 'Target.attachedToTarget' && m.params.targetInfo.type === 'worker')
      workerSessions.add(m.params.sessionId);
    if (m.method === 'Target.detachedFromTarget') workerSessions.delete(m.params.sessionId);
  });
  const send = (method, params) => cdp.send(method, params, session);
  const js = (s) => cdp.js(s, session);
  async function tab(p) {
    if (context) await cdp.send('Target.disposeBrowserContext', { browserContextId: context });
    workerSessions.clear();
    context = (await cdp.send('Target.createBrowserContext')).browserContextId;
    target = (await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId: context })).targetId;
    session = (await cdp.send('Target.attachToTarget', { targetId: target, flatten: true })).sessionId;
    await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
    await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
    await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send('Emulation.setCPUThrottlingRate', { rate: profiles[p].cpu });
    const { cpu, ...network } = profiles[p];
    await send('Network.emulateNetworkConditions', { offline: false, ...network });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: readFileSync(join(here, '../s15/page-probe.js'), 'utf8') });
    await send('Page.bringToFront');
  }
  async function waitFor(expression, timeout = 90_000) {
    const start = Date.now();
    while (Date.now() - start < timeout) { if (await js(expression)) return; await sleep(40); }
    throw new Error(`Timed out: ${expression}`);
  }
  async function navigate() {
    responses = [];
    await send('Page.navigate', { url: base });
    await waitFor('!!window.__s15');
    return js('__s15.waitReady()');
  }
  async function key(key, code = `Digit${key}`) {
    const v = key === 'Escape' ? 27 : Number(key) + 48;
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: v });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: v });
  }
  async function click(selector, text) {
    const box = await js(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(selector)})].find(e =>
      e.textContent.trim() === ${JSON.stringify(text)} && !e.disabled && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
      if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
    if (!box) throw new Error(`No visible button ${selector}: ${text}`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...box });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...box });
  }
  async function consoleView() {
    await key('3');
    await waitFor(`document.querySelector('.cs-screen')?.getAttribute('aria-hidden') === 'false'`);
  }
  async function loadCase(p, repeat, cache) {
    if (cache === 'cold') { await tab(p); await send('Network.clearBrowserCache'); }
    else {
      await send('Page.navigate', { url: 'about:blank' });
      await send('Storage.clearDataForOrigin', { origin: base, storageTypes: 'indexeddb,local_storage' });
    }
    const ready = await navigate();
    // Browser-side observer timestamps the committed mode change, excluding Node polling time.
    await js(`window.__s15Interaction = { sent: performance.now() }; new MutationObserver((_, o) => {
      if (document.querySelector('.cr')?.dataset.mode === 'console') {
        window.__s15Interaction.ack = performance.now(); o.disconnect();
        requestAnimationFrame(() => requestAnimationFrame(() => { window.__s15Interaction.paint = performance.now(); }));
      }
    }).observe(document.querySelector('.cr'), { attributes: true });`);
    await key('3');
    await waitFor('!!window.__s15Interaction.paint');
    await waitFor(`document.querySelector('.cs-screen')?.getAttribute('aria-hidden') === 'false'`);
    const metrics = await js(`({ ready: __s15.ready, interaction: __s15Interaction, consoleReady: performance.now(),
      navigation: performance.getEntriesByType('navigation')[0].toJSON(),
      paints: performance.getEntriesByType('paint').map(e => e.toJSON()),
      resources: performance.getEntriesByType('resource').map(e => e.toJSON()),
      longTasks: __s15.longTasks, hidden: document.hidden })`);
    const row = { profile: p, repeat, cache, ...metrics, ready, responses };
    result.loads.push(row); save();
    console.log(`load ${p} ${cache} #${repeat}: ready ${ready.toFixed(0)} ms; interaction paint ${metrics.interaction.paint.toFixed(0)} ms`);
  }
  const labels = { mission: 'MISSION', plan: 'PLAN', model: 'MODEL', blackbox: 'BLACK BOX', systems: 'SYSTEMS' };
  async function prepare(p, view, warp) {
    await tab(p); await navigate(); await consoleView();
    const enter = await js(`document.querySelector('.cs-foot .cs-button')?.textContent.trim()`);
    await click('.cs-foot .cs-button', enter);
    await waitFor('__s15.status().phase === "operate"');
    if (warp !== 1) {
      await waitFor(`!!document.querySelector('.cs-foot .rx-chip')`);
      await click('.cs-foot .rx-chip', `${warp}×`);
      await waitFor(`__s15.status().warp === ${warp}`);
    }
    if (labels[view]) await click('.cs-tab', labels[view]);
    else {
      await key('Escape', 'Escape');
      if (view !== 'room') await key({ flight: '4', map: '1', ship: '2' }[view]);
      await waitFor(`document.querySelector('.cr')?.dataset.mode === ${JSON.stringify(view)}`);
    }
    await sleep(1200);
    await js('__s15.bind()');
  }
  function summarize(raw, info) {
    const rows = raw.rows;
    const wall = (raw.after.wall - raw.before.wall) / 1000;
    const sat = rows.filter((r) => r[2]);
    return { ...info, ...stats(rows.map((r) => r[0])), wallSeconds: wall,
      shipSeconds: raw.after.t - raw.before.t,
      achievedShipSecondsPerWallSecond: (raw.after.t - raw.before.t) / wall,
      saturationFraction: sat.length / rows.length, saturatedFrames: stats(sat.map((r) => r[0])),
      unsaturatedFrames: stats(rows.filter((r) => !r[2]).map((r) => r[0])),
      over33ms: rows.filter((r) => r[0] > 33.4).length / rows.length,
      over50ms: rows.filter((r) => r[0] > 50).length / rows.length,
      warpsObserved: [...new Set(rows.map((r) => r[3]))], phases: [...new Set(rows.map((r) => r[4]))],
      hiddenFrames: rows.filter((r) => r[6]).length,
      pausedFrames: rows.filter((r) => r[5]).length,
      attempts: [...new Set(rows.map((r) => r[7]))],
      startShipTime: raw.before.t, endShipTime: raw.after.t,
      longTasks: stats(raw.longTasks.map((r) => r.duration)), observerMs: raw.observerMs,
      warpReselections: raw.warpReselections,
      mode: raw.mode, page: raw.page, modelError: raw.modelError ?? null };
  }
  if (phase === 'all' || phase === 'load') {
    result.loads = [];
    for (let r = 1; r <= loadRepeats; r++) for (const p of profileNames) {
      await loadCase(p, r, 'cold'); await loadCase(p, r, 'warm');
    }
  }
  if (phase === 'all' || phase === 'frames') {
    result.frames = [];
    // Alternate profiles by repeat to limit temperature/order bias, always one case at a time.
    for (let r = 1; r <= repeats; r++) for (const p of (r % 2 ? profileNames : [...profileNames].reverse()))
      for (const warp of warps) for (const view of views) {
        await prepare(p, view, warp);
        const raw = await js(`__s15.sample(${seconds * 1000}, ${warp})`);
        const info = { profile: p, view, requestedWarp: warp, repeat: r };
        const row = summarize(raw, info);
        row.inventory = await js('__s15.inventory()');
        row.draws = await js('__s15.draws()');
        result.frames.push(row); rawFrames.push({ ...info, ...raw });
        save(); writeFileSync(rawOut, gzipSync(JSON.stringify(rawFrames)));
        console.log(`frames ${p} ${view} ${warp}x #${r}: ${row.median.toFixed(1)}/${row.p95.toFixed(1)}/${row.worst.toFixed(1)} ms; ${row.achievedShipSecondsPerWallSecond.toFixed(1)} ship s/s; ${(row.saturationFraction * 100).toFixed(0)}% saturated`);
      }
  }
  async function profileCase(worst, label = 'worst') {
    if (!/^[\w-]+$/.test(label)) throw new Error('Unsafe profile label');
    await prepare(worst.profile, worst.view, worst.requestedWarp);
    await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 1000 });
    for (const s of workerSessions) {
      await cdp.send('Profiler.enable', {}, s);
      await cdp.send('Profiler.setSamplingInterval', { interval: 1000 }, s);
      await cdp.send('Profiler.start', {}, s);
    }
    await send('Profiler.start');
    await cdp.send('Tracing.start', { categories: 'devtools.timeline,v8,blink.user_timing,disabled-by-default-devtools.timeline',
      options: 'record-as-much-as-possible', transferMode: 'ReturnAsStream' });
    const raw = await js(`__s15.sample(${Math.max(8, seconds) * 1000}, ${worst.requestedWarp})`);
    const { profile } = await send('Profiler.stop');
    const workerProfiles = [];
    for (const s of workerSessions) {
      try { workerProfiles.push((await cdp.send('Profiler.stop', {}, s)).profile); } catch { /* Worker exited. */ }
    }
    const traceDone = new Promise((resolve) => {
      const fn = (m) => { if (m.method === 'Tracing.tracingComplete') { cdp.listeners.delete(fn); resolve(m.params); } };
      cdp.listeners.add(fn);
    });
    await cdp.send('Tracing.end');
    const { stream } = await traceDone;
    const chunks = [];
    for (;;) {
      const part = await cdp.send('IO.read', { handle: stream });
      chunks.push(Buffer.from(part.data, part.base64Encoded ? 'base64' : 'utf8'));
      if (part.eof) break;
    }
    await cdp.send('IO.close', { handle: stream });
    writeFileSync(join(artifacts, `${label}-trace.json.gz`), gzipSync(Buffer.concat(chunks)));
    writeFileSync(join(artifacts, `${label}-main.cpuprofile.gz`), gzipSync(JSON.stringify(profile)));
    workerProfiles.forEach((w, i) => writeFileSync(join(artifacts, `${label}-worker-${i}.cpuprofile.gz`), gzipSync(JSON.stringify(w))));
    const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
    const weights = new Map();
    profile.samples.forEach((id, i) => weights.set(id, (weights.get(id) ?? 0) + profile.timeDeltas[i]));
    const functions = [];
    for (const [id, us] of weights) {
      const f = nodes.get(id).callFrame;
      const tm = maps.get(f.url.split('/').at(-1));
      const source = tm && f.lineNumber >= 0 ? originalPositionFor(tm, { line: f.lineNumber + 1, column: Math.max(0, f.columnNumber) }) : null;
      functions.push({ name: f.functionName || '(anonymous)', ms: us / 1000, source,
        generated: { url: f.url.replace(base, '/'), line: f.lineNumber + 1, column: f.columnNumber + 1 } });
    }
    functions.sort((a, b) => b.ms - a.ms);
    // Read-only, after timed sampling and stopped profilers: expose 3D's refusal diagnostics.
    const modelHealth = await js(`(async () => {
      const report = await __s15.desk.game.rules.report();
      return { status: __s15.status(), modelError: __s15.desk.modelError() ?? null,
        fitFailure: report.fitFailure ?? null, coverage: report.coverage,
        modelVersion: __s15.desk.game.model.state().version };
    })()`);
    const prof = { label, selectedBy: arg('profile-case', null) ? `explicit case ${arg('profile-case')}` : 'largest observed p95 frame interval in the required matrix', case: worst,
      modelHealth,
      instrumentedFrames: summarize(raw, { profile: worst.profile, view: worst.view, requestedWarp: worst.requestedWarp }),
      functions, workerCount: workerProfiles.length, artifacts: relative(here, artifacts).replaceAll('\\', '/') };
    result.profiles = [...result.profiles.filter((p) => (p.label ?? 'worst') !== label), prof]; save();
    const screen = await send('Page.captureScreenshot', { format: 'jpeg', quality: 75 });
    writeFileSync(join(artifacts, `${label}.jpg`), Buffer.from(screen.data, 'base64'));
    console.log(`profile ${worst.profile} ${worst.view} ${worst.requestedWarp}x: saved CPU profiles and timeline`);
  }
  if (phase === 'all' || phase === 'profile') {
    const requestedCase = arg('profile-case', null);
    const pool = requestedCase ? result.frames.filter((r) => `${r.profile}:${r.view}:${r.requestedWarp}` === requestedCase) : result.frames;
    const worst = pool.reduce((a, b) => !a || b.p95 > a.p95 ? b : a, null);
    if (!worst) throw new Error('No frame matrix; run --phase frames first with the same --run');
    await profileCase(worst, arg('profile-label', 'worst'));
  }
  result.completed = new Date().toISOString(); save();
} finally {
  if (browser) await browser.stop();
  if (server) await new Promise((r) => server.httpServer.close(r));
}
