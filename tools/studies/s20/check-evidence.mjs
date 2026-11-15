/** S20 artifact integrity, not a substitute for scientific or player validation. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const docs = join(root, 'docs/studies/s20');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
const read = (p) => readFileSync(p, 'utf8');
const baseline = '19a9adafdf9c9e430fd2505ce087ace60065f554';
const inputs = ['src', 'data', 'index.html', 'package.json', 'package-lock.json', 'vite.config.ts'];
for (const p of inputs) {
  requireThat(git('rev-parse', `HEAD:${p}`) === git('rev-parse', `${baseline}:${p}`), `Changed input: ${p}`);
}
requireThat(!git('diff', '--name-only', 'HEAD', '--', ...inputs), 'Uncommitted application input');
const original = read(join(root, 'docs/studies/s12/claim-ledger.md'));
const ledger = read(join(docs, 'claim-ledger.md'));
const ids = [...original.matchAll(/^\| ([A-Z]\d{2}) \(/gm)].map(m => m[1]);
const actual = [...ledger.matchAll(/^\| ([A-Z]\d{2}) \|/gm)].map(m => m[1]);
requireThat(ids.length === 72 && actual.length === 72, 'Expected 72 claim rows');
requireThat(new Set(actual).size === 72 && ids.every(id => actual.includes(id)), 'Claim ID mismatch');
for (const row of ledger.split('\n').filter(s => /^\| [A-Z]\d{2} \|/.test(s))) {
  requireThat(/\*\*(now demonstrated|still pending|wrong)\*\*/.test(row), 'Unclassified claim');
}
const requests = read(join(docs, 'request-status.md'));
for (const id of [...Array.from({ length: 15 }, (_, i) => `R${i + 1}`), 'R3b']) {
  requireThat(requests.includes(`| ${id} —`), `Missing request ${id}`);
}
const files = [];
const walk = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'validation.json') continue;
    const p = join(directory, entry.name);
    if (entry.isDirectory()) walk(p); else files.push(p);
  }
};
walk(docs); walk(here); files.push(join(root, 'docs/handoffs/s20.md'));
const hashes = {};
let screenshots = 0;
for (const file of files.sort()) {
  requireThat(existsSync(file), `Missing evidence: ${relative(root, file)}`);
  const bytes = readFileSync(file);
  const name = relative(root, file).replaceAll('\\', '/');
  hashes[name] = createHash('sha256').update(bytes).digest('hex');
  if (/\.(jpg|png)$/i.test(file)) { screenshots++; continue; }
  const content = (file.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString('utf8');
  requireThat(!/[A-Z]:[\\/]+Users[\\/]+|\/Users\/|\/home\//i.test(content), `Private path: ${name}`);
  if (file.endsWith('.md')) {
    for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
      let target = match[1].split('#')[0];
      if (!target || /^(https?:|mailto:)/.test(target)) continue;
      target = target.replace(/^<|>$/g, '');
      requireThat(existsSync(resolve(dirname(file), target)), `Broken local link in ${name}: ${target}`);
    }
  }
}
requireThat(screenshots > 0, 'No screenshots retained');
const result = { schema: 1, sourceBaseline: baseline, claims: actual.length,
  requests: 16, screenshots, checkedFiles: files.length,
  scope: 'Coverage, existing local links, unchanged source/build inputs and private-path scan; not semantic proof.',
  sha256: hashes };
writeFileSync(join(here, 'validation.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ claims: result.claims, requests: result.requests, screenshots, files: files.length, status: 'pass' }));
