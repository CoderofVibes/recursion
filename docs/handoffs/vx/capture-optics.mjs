// Production-compiled renderer fixtures. NOT proof of encounter optics publication.
// before loads the same camera/channel fixtures with renderer sources from BASE.
import { build, preview } from 'vite';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep } from '../../../tools/studies/s15/cdp.mjs';
const label = process.argv[2] ?? 'after';
if (!['before', 'after'].includes(label)) throw new Error('Use before or after');
const base = '0ee3d1c';
const root = fileURLToPath(new URL('../../../', import.meta.url)).replaceAll('\\', '/');
const sources = new Map();
if (label === 'before')
  for (const path of [
    'src/view3d/room/outside.ts',
    'src/view3d/room/RoomView.ts',
    'src/view3d/opening/home.ts',
  ])
    sources.set(
      root + path,
      execFileSync('git', ['show', `${base}:${path}`], { encoding: 'utf8' }),
    );
const outDir = `dist/vx-optics-${label}`;
await build({
  plugins: [
    {
      name: 'vx-before-renderer',
      enforce: 'pre',
      load(id) {
        return sources.get(id.replaceAll('\\', '/'));
      },
    },
  ],
  build: { outDir, rolldownOptions: { input: 'docs/handoffs/vx/optics.html' } },
});
const server = await preview({
  build: { outDir },
  preview: { host: '127.0.0.1', port: 4187, strictPort: true },
});
const browser = await launchChrome(),
  cdp = browser.cdp;
const report = {
  label,
  source: label === 'before' ? base : 'working-tree',
  fixture: 'synthetic light-only contract; no game or physics',
  cases: [],
  errors: [],
};
cdp.listeners.add((m) => {
  if (m.method === 'Runtime.exceptionThrown')
    report.errors.push(
      m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text,
    );
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
    report.errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
});
try {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send(
    'Emulation.setDeviceMetricsOverride',
    { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false },
    sessionId,
  );
  await cdp.send(
    'Page.navigate',
    { url: 'http://127.0.0.1:4187/docs/handoffs/vx/optics.html' },
    sessionId,
  );
  await sleep(2000);
  for (const name of ['sky', 'funnels', 'clouds', 'home', 'lens', 'title']) {
    await cdp.js(`window.__vx.show(${JSON.stringify(name)})`, sessionId);
    await sleep(1500);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
    writeFileSync(
      new URL(`${label}-fixture-${name}.png`, import.meta.url),
      Buffer.from(shot.data, 'base64'),
    );
    report.cases.push({ name, stats: await cdp.js('window.__vx.stats()', sessionId) });
  }
  await cdp.send(
    'Emulation.setDeviceMetricsOverride',
    { width: 360, height: 640, deviceScaleFactor: 1, mobile: false },
    sessionId,
  );
  await sleep(500);
  report.titleFitsMobile = await cdp.js(
    'document.querySelector("h1").scrollWidth<=innerWidth',
    sessionId,
  );
} finally {
  writeFileSync(
    new URL(`${label}-optics-console.json`, import.meta.url),
    JSON.stringify(report, null, 2) + '\n',
  );
  await browser.stop();
  await server.close();
}
console.log(JSON.stringify(report));
if (report.errors.length || !report.titleFitsMobile) process.exitCode = 1;
