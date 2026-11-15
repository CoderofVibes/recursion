/** Summarize retained production reports; no simulation or regenerated evidence. */
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import path from 'node:path';
import console from 'node:console';

const folder = fileURLToPath(new URL('./admission-reports/live-field-v2/', import.meta.url));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const reports = [];
for (const name of (await readdir(folder)).filter((n) => /^s22-.*\.json$/.test(n)).sort()) {
  const bytes = await readFile(path.join(folder, name));
  const report = JSON.parse(bytes);
  let previous = null;
  try {
    previous = JSON.parse(await readFile(path.join(folder, '..', name), 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  reports.push({ name, sha256: hash(bytes), report, previous });
}
if (!reports.length) throw new Error('No live-field reports');
const source = reports[0].report.provenance;
if (reports.some((r) => r.report.provenance.contentHash !== source.contentHash))
  throw new Error(
    'Mixed source fingerprints; run the full matrix on one source before summarizing',
  );
const outcome = (r) =>
  !r?.result
    ? (r?.execution ?? 'unavailable')
    : r.result.outcome.kind === 'lost'
      ? `lost (${r.result.outcome.cause})`
      : r.result.outcome.kind === 'completed'
        ? `completed (${r.result.outcome.objective})`
        : r.result.outcome.kind;
const rows = reports.map(({ name, sha256, report: r, previous: old }) => ({
  file: name,
  sha256,
  id: r.result?.id ?? name,
  execution: r.execution,
  outcome: r.result?.outcome ?? null,
  actualStop: r.result?.actualStop ?? null,
  previousOutcome: old?.result?.outcome ?? null,
  previousStop: old?.result?.actualStop ?? null,
  changed: old ? JSON.stringify(old.result?.outcome) !== JSON.stringify(r.result?.outcome) : null,
  mainKg: r.result?.metrics.resources.main.consumedKg ?? null,
  rcsKg: r.result?.metrics.resources.rcs.consumedKg ?? null,
  firstFailedMargin: r.result?.metrics.firstFailedMargin ?? null,
  targets: r.budgetTargets ?? null,
  lifecycle: r.fieldObservations?.eventCounts ?? null,
  finalPhases: r.fieldObservations?.finalPhases ?? null,
  sweptTicks: r.fieldObservations?.sweptTicks ?? null,
  contacts: r.fieldObservations?.contacts ?? null,
  exactRepeat: r.repeat?.passed ?? false,
}));
const summary = {
  protocol: 's22-live-field-summary-v1',
  source,
  execution: reports.every((r) => r.report.execution === 'completed') ? 'completed' : 'has-errors',
  acceptance: 'incomplete',
  count: rows.length,
  exactRepeat: rows.every((r) => r.exactRepeat),
  results: rows,
};
await writeFile(path.join(folder, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
const lines = [
  '# Live-field admission rerun',
  '',
  `Execution: **${summary.execution}**; ${rows.length} cases. Encounter admission: **incomplete**.`,
  '',
  `Source revision: \`${source.revision}\`. Source fingerprint: \`${source.contentHash}\`.`,
  '',
  `Exact full-result and field-observation repetition: **${summary.exactRepeat ? 'passed for every case' : 'not established for every case'}**.`,
  '',
  'These use the existing 3E runner and the production lifecycle/throat hooks. Field observers return each hook result unchanged. Fixed author controls and the approved field are not tuned by this run.',
  '',
  '| Case | Historical result | Current result / stop (s) | Main (kg) | RCS (kg) | Birth / veto |',
  '| --- | --- | --- | ---: | ---: | ---: |',
  ...reports.map(({ name, report: r, previous: old }) => {
    const f = r.fieldObservations,
      resource = r.result?.metrics.resources;
    return `| [${r.result?.id ?? name}](${name}) | ${outcome(old)} | ${outcome(r)} / ${r.result?.actualStop ?? '—'} | ${resource?.main.consumedKg.toFixed(6) ?? '—'} | ${resource?.rcs.consumedKg.toFixed(6) ?? '—'} | ${f?.eventCounts.birth ?? 0} / ${f?.eventCounts['birth-veto'] ?? 0} |`;
  }),
  '',
  'Historical results used the static-field baseline in checkpoint `0eccbc4`. Several production integrations changed since that baseline, so changed outcomes are not a one-variable causal experiment.',
  '',
  'The 1,000 kg main / 30 kg RCS targets apply to consumption, not to whether an incomplete flight passed admission. Generic harness clearance excludes funnels. The production throat sweep uses fixed starting attitude and straight COM segments; it does not certify continuously rotating/deploying hull clearance.',
  '',
  'A precursor marked `seen` by the game is not independently verified camera detection, window readability or a 900 s observed warning margin. This matrix does not establish acquired geometry, pull/reversal adoption, forecast accuracy, field work, whole-session restoration or continuous branch/cross-transfer arrivals. No report is a human playtest.',
  '',
  '[Machine summary and exact report hashes](summary.json).',
  '',
];
await writeFile(path.join(folder, 'SUMMARY.md'), lines.join('\n'));
console.log(
  JSON.stringify({
    execution: summary.execution,
    count: rows.length,
    exactRepeat: summary.exactRepeat,
    changed: rows.filter((r) => r.changed).length,
    outcomes: rows.map((r) => ({ id: r.id, outcome: r.outcome, stop: r.actualStop })),
  }),
);
