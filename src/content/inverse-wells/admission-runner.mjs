/** Runs the existing 3E harness with 3B-owned cases; writes only this content folder. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = fileURLToPath(new URL('./admission-reports/', import.meta.url));
const args = process.argv.slice(2);
if (args.length !== 1 || !/^(all|list|s22-\d+-[a-z-]+)$/.test(args[0]))
  throw new Error(
    'Usage: node src/content/inverse-wells/admission-runner.mjs all|list|s22-22000-negative-y',
  );
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
  for (const directory of ['src', 'data', 'tools/harness']) await walk(directory);
  files['package-lock.json'] = hash(await readFile(path.join(root, 'package-lock.json')));
  return {
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    node: process.version,
    contentHash: hash(JSON.stringify(files)),
    files,
  };
}
const before = await fingerprint();
const server = await createServer({
  root,
  configFile: false,
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, ws: false },
  optimizeDeps: { noDiscovery: true, entries: [] },
});
try {
  const { ADMISSION_PROTOCOL, gardenAdmissionCases, gardenAdmission } = await server.ssrLoadModule(
    '/src/content/inverse-wells/admission.ts',
  );
  const cases = gardenAdmissionCases();
  const idOf = (entry) => `s22-${entry.catalogueSeed}-${entry.variant}`;
  if (args[0] === 'list') console.log(cases.map(idOf).join('\n'));
  else {
    const chosen = args[0] === 'all' ? cases : cases.filter((entry) => idOf(entry) === args[0]);
    if (!chosen.length) throw new Error(`Unknown admission case ${args[0]}`);
    const { runFlight } = await server.ssrLoadModule('/tools/harness/flight.ts');
    await mkdir(output, { recursive: true });
    for (const entry of chosen) {
      const { flight, setup, condition } = gardenAdmission(entry.catalogueSeed, entry.variant);
      console.log(
        `Flying ${flight.id} through 3E runFlight (${flight.duration}s, ${flight.mode})...`,
      );
      const report = {
        protocol: ADMISSION_PROTOCOL,
        command: ['node', 'src/content/inverse-wells/admission-runner.mjs', idOf(entry)],
        provenance: before,
        entry: { ...entry, condition, contentVersion: setup.contentVersion },
        acceptance: {
          status: 'incomplete',
          blockers: [
            'R30: births, precursor warp policy, saved lifecycle, whole-hull throat loss and work ledger are not wired in this baseline.',
            'R31/R32: optical funnels and acquired field geometry/response are not mounted/produced. Packet counts do not certify precursor coverage.',
            '3E clearance covers bodies/asteroids only: its wholeFlightSweptMinimumMeters is NOT all-funnel clearance.',
            "Continuous late arrivals, both branch orders, cross-transfer and carried-rule comparison need the retained owners' integration.",
          ],
        },
      };
      try {
        report.result = await runFlight(flight, setup);
        report.execution = report.result.modelError === null ? 'completed' : 'model-error';
        const r = report.result.metrics.resources;
        report.budgetTargets = {
          mainKg: 1000,
          rcsKg: 30,
          mainWithin: r.main.consumedKg <= 1000,
          rcsWithin: r.rcs.consumedKg <= 30,
          scope: 'Measured consumption only; incomplete flights do not pass route admission.',
        };
      } catch (error) {
        report.execution = 'error';
        report.error = error instanceof Error ? error.stack : String(error);
        process.exitCode = 1;
      }
      if ((await fingerprint()).contentHash !== before.contentHash)
        throw new Error('Inputs changed during flight; refusing a mixed-source report.');
      await writeFile(
        path.join(output, `${flight.id}.json`),
        JSON.stringify(report, null, 2) + '\n',
      );
      console.log(
        JSON.stringify({
          id: flight.id,
          execution: report.execution,
          stop: report.result?.actualStop,
          outcome: report.result?.outcome,
          firstFailedMargin: report.result?.metrics.firstFailedMargin,
          mainKg: report.result?.metrics.resources.main.consumedKg,
          rcsKg: report.result?.metrics.resources.rcs.consumedKg,
          acceptance: 'incomplete',
        }),
      );
      if (report.result?.modelError) process.exitCode = 1;
    }
  }
} finally {
  await server.close();
}
