/* global process, console, fetch, WebSocket, setTimeout, URL, Buffer */
// node src/trailer/rig/review.mjs PORT SCENE [still-time]
// Native 1920x1080 output at 1536x864 CSS and DPR 1.25. No new browser or software.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const [port, scene, still = '5.5'] = process.argv.slice(2);
const out = new URL('../../../docs/handoffs/tv/', import.meta.url);
mkdirSync(out, { recursive: true });
const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const target = tabs.find((tab) => tab.type === 'page');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
let next = 0;
const pending = new Map();
const issues = [];
socket.addEventListener('message', ({ data }) => {
  const m = JSON.parse(data);
  if (m.method === 'Runtime.exceptionThrown') issues.push(m.params.exceptionDetails);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
    issues.push(m.params.args);
  const task = pending.get(m.id);
  if (!task) return;
  pending.delete(m.id);
  if (m.error) task.reject(new Error(JSON.stringify(m.error)));
  else task.resolve(m.result);
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++next;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
const js = async (expression) => {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails)
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1536,
    height: 864,
    deviceScaleFactor: 1.25,
    mobile: false,
  });
  await send('Page.navigate', { url: `http://127.0.0.1:5191/src/trailer/?still=${still}` });
  for (let i = 0; i < 600; i++) {
    if (await js('window.__trailer?.state() === "ready"').catch(() => false)) break;
    if (i === 599) throw new Error('Trailer preparation timed out');
    await wait(100);
  }
  await js('window.__tvRAF = requestAnimationFrame; window.requestAnimationFrame = () => 0;');
  await wait(50);
  const length = await js(
    `import('/src/trailer/timeline.ts').then(m => m.beat(${JSON.stringify(scene)}).length)`,
  );
  const sample = (local) =>
    js(
      `import('/src/trailer/rig/index.ts').then(m => m.sampleForReview(${JSON.stringify(scene)}, ${local}))`,
    );
  const hashes = {};
  for (const [name, local] of [
    ['start', 0],
    ['middle', length / 2],
    ['end', length - 1 / 165],
    ['repeat', length / 2],
  ]) {
    if (name === 'repeat') {
      // Exercise cross-shot state too: a deterministic seek must survive other shots' ranges,
      // hologram modes, camera poses and outside scenery sharing this same RoomView.
      await js(`(async () => {
        const { sampleForReview } = await import('/src/trailer/rig/index.ts');
        const { beat } = await import('/src/trailer/timeline.ts');
        for (const element of document.querySelectorAll('[data-tv-scene]')) {
          const id = element.dataset.tvScene;
          if (id === ${JSON.stringify(scene)}) continue;
          await sampleForReview(id, 0);
          await sampleForReview(id, beat(id).length - 1 / 165);
        }
      })()`);
    }
    await sample(local);
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    const bytes = Uint8Array.from(atobNode(data));
    hashes[name] = createHash('sha256').update(bytes).digest('hex');
    if (name !== 'repeat') writeFileSync(new URL(`${scene}-${name}.png`, out), bytes);
  }
  const metrics = await js(`(async () => {
    const { sampleForReview } = await import('/src/trailer/rig/index.ts');
    const intervals = [], costs = [];
    let previous;
    const began = performance.now();
    await new Promise(resolve => {
      const draw = async now => {
        if (previous !== undefined) intervals.push(now - previous);
        previous = now;
        const t = performance.now();
        await sampleForReview(${JSON.stringify(scene)}, ((now - began) / 1000) % ${length});
        costs.push(performance.now() - t);
        if (now - began < 5000) window.__tvRAF(draw); else resolve();
      };
      window.__tvRAF(draw);
    });
    const canvas = document.querySelector('.tv-rig canvas');
    const gl = canvas.getContext('webgl2');
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return { intervals, costs, gpu: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), css: [innerWidth, innerHeight], dpr: devicePixelRatio, physical: [canvas.width, canvas.height], canvases: document.querySelectorAll('.tv-rig canvas').length };
  })()`);
  const percentile = (a, p) =>
    [...a].sort((a, b) => a - b)[Math.min(a.length - 1, Math.floor(a.length * p))];
  const report = {
    scene,
    hashes,
    deterministic: hashes.middle === hashes.repeat,
    ...metrics,
    medianMs: percentile(metrics.intervals, 0.5),
    p95Ms: percentile(metrics.intervals, 0.95),
    worstMs: Math.max(...metrics.intervals),
    renderP95Ms: percentile(metrics.costs, 0.95),
    issues,
  };
  writeFileSync(new URL(`${scene}-review.json`, out), JSON.stringify(report, null, 2) + '\n');
  const brief = Object.fromEntries(
    Object.entries(report).filter(([key]) => !['intervals', 'costs', 'hashes'].includes(key)),
  );
  console.log(JSON.stringify(brief, null, 2));
} finally {
  socket.close();
}

function atobNode(value) {
  return Buffer.from(value, 'base64');
}
