// Reapply privacy filtering to existing artifacts (e.g. those from an interrupted run).
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeEvidence } from './privacy.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
const files = walk(here).filter((f) => f.endsWith('.json') || f.endsWith('.gz'));
for (const file of files) writeEvidence(file, readFileSync(file));
console.log(`Sanitized ${files.length} JSON/profile/map artifacts.`);
