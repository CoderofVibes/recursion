// Reproducible screenshots and console audit of the unmodified production app.
// Run: node docs/handoffs/vx/capture.mjs before|after
import { preview } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../tools/studies/s15/cdp.mjs';

const label = process.argv[2] ?? 'after';
if (!['before', 'after'].includes(label)) throw new Error('Use before or after');
const server = await preview({ preview: { host: '127.0.0.1', port: 4186, strictPort: true } });
const browser = await launchChrome();
const cdp = browser.cdp;
const report = { label, cases: [], errors: [] };
let current = '';
cdp.listeners.add((m) => {
  if (m.method === 'Runtime.exceptionThrown')
    report.errors.push({ case: current, error: m.params.exceptionDetails.text });
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
    report.errors.push({
      case: current,
      error: m.params.args.map((a) => a.value ?? a.description).join(' '),
    });
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error')
    report.errors.push({ case: current, error: m.params.entry.text });
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
  const probe = readFileSync(
    new URL('../../../tools/studies/s15/page-probe.js', import.meta.url),
    'utf8',
  );
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: probe }, sessionId);
  for (const [name, query] of [
    ['deep-sky', ''],
    ['funnels', '?encounter=inverse-wells'],
    ['cathedral', '?encounter=chain-link'],
  ]) {
    current = name;
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:4186/${query}` }, sessionId);
    await sleep(2500);
    await cdp.js('window.__s15.waitReady()', sessionId);
    await cdp.js(
      `window.__s15.room.player.z = 1.4; window.__s15.room.player.pitch = 0.04;`,
      sessionId,
    );
    await sleep(1800);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
    writeFileSync(
      new URL(`${label}-${name}.png`, import.meta.url),
      Buffer.from(shot.data, 'base64'),
    );
    report.cases.push(
      await cdp.js(
        `({ name: ${JSON.stringify(name)}, mode: document.querySelector('.cr').dataset.mode, funnels: window.__s15.room.outsideStats(), modelError: window.__s15.desk.modelError() ?? null, skyQuaternion: window.__s15.room.scene.getObjectByName('deep-sky')?.parent.quaternion.toArray(), fields: window.__s15.desk.game.snapshot().window?.fields?.map(f => ({kind:f.kind,patches:f.patches?.length})), sun:window.__s15.desk.game.snapshot().window?.sun })`,
        sessionId,
      ),
    );
  }
} finally {
  writeFileSync(
    new URL(`${label}-console.json`, import.meta.url),
    JSON.stringify(report, null, 2) + '\n',
  );
  await browser.stop();
  await server.close();
}
console.log(JSON.stringify(report));
if (report.errors.length) process.exitCode = 1;
