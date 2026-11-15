/** Independent authored starting states to exercise the two production R30 safety paths. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = fileURLToPath(new URL('./admission-reports/safety-probes-v1/', import.meta.url));
const hash = (value) => createHash('sha256').update(value).digest('hex');
async function fingerprint() {
  const files = {};
  async function walk(relative) {
    for (const item of (await readdir(path.join(root, relative), { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      if (['reports', 'admission-reports', 'node_modules'].includes(item.name)) continue;
      const name = `${relative}/${item.name}`;
      if (item.isDirectory()) await walk(name);
      else if (/\.(ts|tsx|mjs|json)$/.test(name))
        files[name] = hash(await readFile(path.join(root, name)));
    }
  }
  for (const dir of ['src', 'data', 'tools/harness']) await walk(dir);
  files['package-lock.json'] = hash(await readFile(path.join(root, 'package-lock.json')));
  return {
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    node: process.version,
    files,
    contentHash: hash(JSON.stringify(files)),
  };
}
const provenance = await fingerprint();
const server = await createServer({
  root,
  configFile: false,
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, ws: false },
  optimizeDeps: { noDiscovery: true, entries: [] },
});
try {
  const { createInverseWells } = await server.ssrLoadModule('/src/content/inverse-wells/index.ts');
  const { s22Layout } = await server.ssrLoadModule('/src/content/inverse-wells/s22-layout.ts');
  const { readFunnelParameters } = await server.ssrLoadModule('/src/sim/fields/wells.ts');
  const v3 = await server.ssrLoadModule('/src/lib/vec3.ts');
  const { observeGardenAdmission } = await server.ssrLoadModule(
    '/src/content/inverse-wells/admission-observer.ts',
  );
  const { runFlight } = await server.ssrLoadModule('/tools/harness/flight.ts');
  await mkdir(output, { recursive: true });
  for (const probe of ['off-reference-throat', 'unsafe-birth-veto']) {
    const make = () => {
      const layout = s22Layout(22000),
        seed = `s22-admission/probe:${probe}`;
      const base = createInverseWells(seed, { layout });
      const crush = probe === 'off-reference-throat';
      const target = layout.wells.find((w) =>
        crush
          ? w.id !== 'funnel-0' && w.funnel.birthOffset === null
          : w.funnel.birthOffset === 1200,
      );
      if (!target) throw new Error('Missing authored safety target');
      const p = readFunnelParameters(base.definition.world.fields.find((f) => f.id === target.id));
      const kinematics = {
        ...layout.entrances.power,
        position: crush ? v3.addScaled(p.mouth, p.axis, p.length - 5000) : target.center,
        velocity: crush ? v3.scale(p.axis, 10) : v3.ZERO,
      };
      const setup = createInverseWells(seed, {
        layout: { ...layout, entrances: { ...layout.entrances, power: kinematics } },
      });
      return {
        target: target.id,
        kinematics,
        setup,
        flight: {
          id: `s22-${probe}`,
          seed,
          mode: 'navigation-probe',
          controls: [],
          duration: crush ? 600 : 1300,
          expected: crush ? 'lost' : 'survive-window',
          knowledge:
            '[ASSUMED] Independent authored initial-state safety fixture, not a live teleport, supported arrival envelope, route or player inference. Full S22 field and production mechanics unchanged.',
        },
      };
    };
    const first = make(),
      observer = observeGardenAdmission(first.setup);
    const result = await runFlight(first.flight, observer.setup),
      fields = observer.finish();
    const second = make(),
      observer2 = observeGardenAdmission(second.setup);
    const repeated = await runFlight(second.flight, observer2.setup),
      fields2 = observer2.finish();
    const firstHash = hash(JSON.stringify({ result, fields }));
    const secondHash = hash(JSON.stringify({ result: repeated, fields: fields2 }));
    const relevant = fields.contacts.find((c) => c.field === first.target);
    const veto = fields.events
      .flatMap((e) => e.events)
      .find((e) => e.id === first.target && e.kind === 'birth-veto');
    const checks = {
      exactRepeat: firstHash === secondHash,
      expectedOutcome: result.expectationMatched,
      noModelError: result.modelError === null,
      specificSafetyPath:
        probe === 'off-reference-throat'
          ? result.outcome.kind === 'lost' &&
            result.outcome.cause === 'structural' &&
            relevant?.t === result.outcome.t
          : !!veto && fields.finalPhases.cancelled >= 1 && fields.contacts.length === 0,
      noPropellantCommanded:
        result.metrics.resources.main.consumedKg === 0 &&
        result.metrics.resources.rcs.consumedKg === 0,
    };
    if ((await fingerprint()).contentHash !== provenance.contentHash)
      throw new Error('Source changed during probe');
    const report = {
      protocol: 's22-production-safety-probe-v1',
      command: ['node', 'src/content/inverse-wells/admission-probes.mjs'],
      provenance,
      execution: Object.values(checks).every(Boolean) ? 'passed' : 'finding',
      acceptance: 'incomplete',
      probe,
      target: first.target,
      initialKinematics: first.kinematics,
      checks,
      repeat: { firstHash, secondHash },
      result,
      fieldObservations: fields,
    };
    await writeFile(path.join(output, `${probe}.json`), JSON.stringify(report, null, 2) + '\n');
    console.log(
      JSON.stringify({
        probe,
        target: first.target,
        checks,
        outcome: result.outcome,
        eventCounts: fields.eventCounts,
        contacts: fields.contacts,
      }),
    );
    if (report.execution !== 'passed') process.exitCode = 1;
  }
} finally {
  await server.close();
}
