import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../../', import.meta.url));
const here = fileURLToPath(new URL('./', import.meta.url));
const args = process.argv.slice(2);
const allowed = ['smoke', 'reference', 'learning', 'routes', 'all'];
let suite = 'smoke';
let seed = 'gravity-range-1';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--help') {
    console.log(
      'npm run harness -- --suite smoke|reference|learning|routes|all [--seed STRING]\nReports: tools/harness/reports/<suite>.{json,md}; learning records: <suite>.evidence.json.gz',
    );
    process.exit(0);
  }
  if (args[i] === '--suite' && allowed.includes(args[i + 1])) suite = args[++i];
  else if (args[i] === '--seed' && args[i + 1] && !args[i + 1].startsWith('--')) seed = args[++i];
  else throw new Error(`Invalid argument ${args[i]}; use --help`);
}
const hash = (data) => createHash('sha256').update(data).digest('hex');
async function manifest() {
  const files = {};
  async function walk(relative) {
    for (const entry of (await readdir(path.join(root, relative), { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      if (entry.name === 'reports' || entry.name === 'node_modules') continue;
      const name = `${relative}/${entry.name}`;
      if (entry.isDirectory()) await walk(name);
      else files[name] = hash(await readFile(path.join(root, name)));
    }
  }
  for (const directory of ['src', 'data', 'tools/harness', 'tools/studies/s8'])
    await walk(directory);
  files['package-lock.json'] = hash(await readFile(path.join(root, 'package-lock.json')));
  return {
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    files,
    contentHash: hash(JSON.stringify(files)),
    node: process.version,
  };
}
const provenance = await manifest();
const server = await createServer({
  root,
  configFile: false,
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, ws: false },
  optimizeDeps: { noDiscovery: true, entries: [] },
});
const report = {
  schema: 1,
  suite,
  seed,
  command: ['npm', 'run', 'harness', '--', ...args],
  provenance,
  results: {},
  acceptance: {
    status: 'incomplete',
    implementedProvider:
      'C02 gravity-range only; selected smoke/reference/learning/routes results below',
    blocked: [
      {
        owner: '2F',
        requirement: 'A12 active COMMIT runs at >=1x',
        reason:
          'Production session advance returns zero during forecast commit; integration fixture measures it.',
      },
      {
        owner: 'integrator / 2F',
        requirement: 'Full-flight whole-ship swept clearance',
        reason:
          'The harness evaluates production swept hull geometry on available endpoints. Absorbed-object and contact-relocated endpoints remain uncertified because TickResult omits the original per-tick minimum/absorbed data. Inspect each report coverage, not only its minimum.',
      },
      {
        owner: '3B / 3C / 3A / 2C / 2F',
        requirement:
          'Informed/blind/worn/abort W/L flights, actual exposure and damage, finite ballistic/exterior/burn-through bypass search',
        reason:
          'Integrated providers, supported arrival envelopes, reconstruction and chronological field/ship damage seam absent from this source baseline. Owner semantics A15/A16 are approved; implementation is pending.',
      },
      {
        owner: '3D / 3A / Phase 4',
        requirement:
          'Actual-state chain, sustainable preparation, optional investigations and remaining main/RCS/power/heat/control margin at Earth',
        reason:
          'Missing production expedition/transit/content providers; no invented reserve percentage.',
      },
      {
        owner: '3D / 2F',
        requirement: 'Exact in-flight whole-session save/resume',
        reason:
          'Truth JSON replay is tested; session restoration of queue, epochs, records and model is not exposed.',
      },
      {
        owner: '4C',
        requirement: 'C05 physically requires both lessons',
        reason:
          'No integrated C05 geometry or resource envelope; intended gate is not established.',
      },
      {
        owner: '4D',
        requirement: 'S6 moving aperture, partial crossing, surviving-state Earth',
        reason:
          'Shared opening implementation absent; A15/A17 choices approved. No optional systems implemented by harness.',
      },
      {
        owner: '2D / owner',
        requirement: 'Browser screen/hidden-page operation and human comprehension/difficulty',
        reason: 'Headless API fixtures cannot certify browser interaction or a human playtest.',
      },
    ],
    routesAwaitingProviders: {
      power: ['C01', 'C02', 'C03', 'P01', 'P02', 'P03', 'P04', 'C04', 'C05', 'C06', 'H01', 'H02'],
      sensing: ['C01', 'C02', 'C03', 'N01', 'N02', 'N03', 'C04', 'C05', 'C06', 'H01', 'H02'],
      powerThenSensing: [
        'C01',
        'C02',
        'C03',
        'P01',
        'P02',
        'P03',
        'N03',
        'C04',
        'C05',
        'C06',
        'H01',
        'H02',
      ],
      sensingThenPower: [
        'C01',
        'C02',
        'C03',
        'N01',
        'N02',
        'N03',
        'P03',
        'P04',
        'C04',
        'C05',
        'C06',
        'H01',
        'H02',
      ],
    },
  },
};
let failed = false;
try {
  if (suite === 'smoke' || suite === 'all') {
    console.log('Running production session integration checks...');
    const { runIntegrationChecks } = await server.ssrLoadModule('/tools/harness/integration.ts');
    report.results.integration = await runIntegrationChecks();
    failed ||= report.results.integration.checks.some((c) => c.status === 'fail');
  }
  for (const selected of ['smoke', 'routes'])
    if (suite === selected || suite === 'all') {
      const { casesFor } = await server.ssrLoadModule('/tools/harness/scenarios.ts');
      const { runFlight } = await server.ssrLoadModule('/tools/harness/flight.ts');
      report.results[selected] = [];
      for (const flight of casesFor(selected, seed)) {
        console.log(`Flying ${flight.id} (${flight.mode})...`);
        const result = await runFlight(flight);
        report.results[selected].push(result);
        failed ||= result.modelError !== null;
        console.log(
          `${flight.id}: ${result.outcome.kind} at ${result.actualStop}s; ${result.judgment}`,
        );
        // Content/balance findings stay valid outcomes. Smoke controls must match their purpose.
        if (selected === 'smoke') failed ||= !result.expectationMatched;
      }
    }
  if (suite === 'reference' || suite === 'all') {
    console.log('Checking imported S8 vectors at 8/4/2 s...');
    const { runReferenceChecks } = await server.ssrLoadModule('/tools/harness/references.ts');
    report.results.reference = await runReferenceChecks();
    failed ||= !report.results.reference.passed;
  }
  if (suite === 'learning' || suite === 'all') {
    console.log('Flying real-recorder experiments and carried-only/fresh comparisons...');
    const { runLearning } = await server.ssrLoadModule('/tools/harness/learning.ts');
    const learning = await runLearning(seed);
    report.results.learning = learning.summary;
    failed ||= Object.values(learning.summary.checks).some((value) => !value);
    const evidence = Buffer.from(JSON.stringify(learning.evidence));
    await mkdir(path.join(here, 'reports'), { recursive: true });
    await writeFile(path.join(here, `reports/${suite}.evidence.json.gz`), gzipSync(evidence));
    report.results.learning.evidence = {
      path: `${suite}.evidence.json.gz`,
      sha256Uncompressed: hash(evidence),
      bytesUncompressed: evidence.length,
    };
  }
  report.execution = failed ? 'failed-check' : 'completed';
} catch (error) {
  failed = true;
  report.execution = 'error';
  report.error = error instanceof Error ? error.stack : String(error);
} finally {
  await server.close();
}
await mkdir(path.join(here, 'reports'), { recursive: true });
await writeFile(path.join(here, `reports/${suite}.json`), JSON.stringify(report, null, 2) + '\n');
const lines = [
  `# 3E harness — ${suite}`,
  '',
  `Execution: **${report.execution}**. Expedition acceptance: **incomplete**.`,
  '',
  '`' + report.command.join(' ') + '`',
  '',
  `Source revision: ${provenance.revision}. Content/source SHA-256: ${provenance.contentHash}. Node: ${provenance.node}.`,
  '',
  `[Machine-readable results, controls and source hashes](${suite}.json). All measurements below are scripted; none is a human playtest.`,
  '',
];
for (const category of ['smoke', 'routes'])
  for (const flight of report.results[category] ?? []) {
    lines.push(
      `## ${flight.id}`,
      '',
      `[DEMONSTRATED: this run] ${flight.outcome.kind} at ${flight.actualStop} s; expected ${flight.expectation}; ${flight.judgment}.`,
      '',
      `${flight.knowledge}`,
      '',
      `First failed margin: ${JSON.stringify(flight.metrics.firstFailedMargin)}. Main/RCS inventory, charge, power, heat, condition, acquisition and clearance limitations are in the linked JSON.`,
      '',
    );
  }
if (report.results.integration)
  lines.push(
    '## Integration',
    '',
    ...report.results.integration.checks.map((c) => `- ${c.status}: ${c.id} — ${c.scope}`),
    '',
  );
if (report.results.reference)
  lines.push(
    '## Numerical reference',
    '',
    `[DEMONSTRATED: this run] Accepted at 2 s: ${report.results.reference.passed}. Coarse 8/4 s controls and errors are retained; reference-only impulses do not establish finite-burn feasibility or player evidence.`,
    '',
  );
if (report.results.learning)
  lines.push(
    '## Recorder/model learning',
    '',
    `[DEMONSTRATED: this run] ${JSON.stringify(report.results.learning.checks)}.`,
    '',
    'Original forecasts and acquired records are retained in the gzip evidence artifact; hashes identify them. The carried-only/fresh comparison covers an investigation window, not a full departure or expedition cakewalk pass.',
    '',
  );
lines.push(
  '## Pending acceptance',
  '',
  ...report.acceptance.blocked.map((b) => `- **${b.owner}** — ${b.requirement}: ${b.reason}`),
  '',
);
if (report.error) lines.push('## Execution error', '', '```text', report.error, '```', '');
await writeFile(path.join(here, `reports/${suite}.md`), lines.join('\n'));
console.log(
  `Wrote tools/harness/reports/${suite}.{json,md}; execution=${report.execution}, acceptance=incomplete`,
);
if (failed) process.exitCode = 1;
