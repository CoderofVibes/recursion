// Same camera and current QA harness, with shipping sky/effect sources from the chosen base.
// Reference art is never loaded. All images here are rendered game code.
import { build, preview } from 'vite';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep } from '../../../tools/studies/s15/cdp.mjs';
const label = process.argv[2] ?? 'after';
if (!['before', 'after'].includes(label)) throw new Error('Use before or after');
const base = '01a0947';
const root = fileURLToPath(new URL('../../../', import.meta.url)).replaceAll('\\', '/');
const sources = new Map();
if (label === 'before')
  for (const path of [
    'src/view3d/sky/index.ts',
    'src/view3d/sky/style.ts',
    'src/view3d/sky/noise.ts',
    'src/view3d/fx/funnels.ts',
  ])
    sources.set(
      root + path,
      execFileSync('git', ['show', `${base}:${path}`], { encoding: 'utf8' }),
    );
const outDir = `dist/vx-art-${label}`;
await build({
  plugins: [
    {
      name: 'vx-art-baseline',
      enforce: 'pre',
      load: (id) => sources.get(id.replaceAll('\\', '/')),
    },
  ],
  build: {
    outDir,
    rolldownOptions: { input: ['docs/handoffs/vx/atlas.html', 'docs/handoffs/vx/optics.html'] },
  },
});
const server = await preview({
  build: { outDir },
  preview: { host: '127.0.0.1', port: 4188, strictPort: true },
});
const browser = await launchChrome(),
  cdp = browser.cdp;
const report = {
  label,
  source: label === 'before' ? base : 'working-tree',
  scope: 'Shipping sky; optical effects are synthetic fixtures, not encounter publication.',
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
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error')
    report.errors.push(m.params.entry.text);
});
try {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  for (const domain of ['Page', 'Runtime', 'Log'])
    await cdp.send(`${domain}.enable`, {}, sessionId);
  await cdp.send(
    'Emulation.setDeviceMetricsOverride',
    { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false },
    sessionId,
  );
  const shot = async (name) => {
    const png = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
    writeFileSync(
      new URL(`art-${label}-${name}.png`, import.meta.url),
      Buffer.from(png.data, 'base64'),
    );
  };
  await cdp.send(
    'Page.navigate',
    { url: 'http://127.0.0.1:4188/docs/handoffs/vx/atlas.html' },
    sessionId,
  );
  await sleep(2000);
  for (const name of ['galaxy', 'ember-wheel', 'needle', 'hollow', 'eye']) {
    report.cases.push(
      await cdp.js(
        `__atlas.show('${name}',${!['galaxy', 'ember-wheel'].includes(name)})`,
        sessionId,
      ),
    );
    await shot(name);
  }
  report.atlas = await cdp.js('__atlas.audit()', sessionId);
  await cdp.send(
    'Page.navigate',
    { url: 'http://127.0.0.1:4188/docs/handoffs/vx/optics.html' },
    sessionId,
  );
  await sleep(1500);
  for (const name of ['sky', 'funnels', 'precursors', 'birth', 'clouds']) {
    await cdp.js(`__vx.show('${name}')`, sessionId);
    await sleep(1200);
    await shot(`room-${name}`);
    report.cases.push({ name: `room-${name}`, stats: await cdp.js('__vx.stats()', sessionId) });
  }
} finally {
  await browser.stop();
  await server.close();
}
const json = JSON.stringify(report, null, 2) + '\n';
if (/[A-Z]:[\\/]|[/\\]Users[/\\]/.test(json)) throw new Error('Nonportable evidence');
writeFileSync(new URL(`art-${label}-audit.json`, import.meta.url), json);
console.log(
  JSON.stringify({
    label,
    cases: report.cases.length,
    errors: report.errors,
    litCones: report.atlas.cones.filter((c) => !c.exempt && c.peak >= 12).length,
    maxLineFraction: Math.max(...report.atlas.landmarks.map((l) => l.measuredLineFraction)),
    minHueSeparation: Math.min(
      ...report.atlas.landmarks.flatMap((l) =>
        Object.values(l.hueSeparation).filter((d) => d !== null),
      ),
    ),
  }),
);
if (report.errors.length) process.exitCode = 1;
if (label === 'after') {
  if (report.atlas.cones.some((c) => !c.exempt && (c.peak < 12 || c.quietFraction > 0.99998)))
    process.exitCode = 1;
  if (report.atlas.landmarks.some((l) => l.quietFraction < 0.75)) process.exitCode = 1;
  if (
    report.atlas.landmarks.some(
      (l) =>
        l.measuredLineFraction > 0.3 ||
        Object.values(l.hueSeparation).some((d) => d === null || d < 20),
    )
  )
    process.exitCode = 1;
}
