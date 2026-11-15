/** Copy only committed A19/S22 data. Never execute or import its independent solver. */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const revision = process.argv[2];
if (!revision || !/^[a-f0-9]{7,40}$/.test(revision))
  throw new Error('usage: node src/content/inverse-wells/import-s22.mjs <committed S22 hash>');
const commit = execFileSync('git', ['rev-parse', `${revision}^{commit}`], {
  encoding: 'utf8',
}).trim();
const read = (file, schema) => {
  const value = JSON.parse(
    execFileSync('git', ['show', `${commit}:tools/studies/s22/${file}`], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    }),
  );
  if (value.schema !== schema) throw new Error(`unsupported S22 schema in ${file}`);
  return value;
};
const vectors = read('vectors.json', 'recursion.s22.v2');
const seeds = read('seeds.json', 'recursion.s22.catalogue.v2');
const field = read('field.json', 'recursion.s22.geometry.v2');
const source = { commit, path: 'tools/studies/s22/', profile: 's22-funnel-v1' };
const directory = dirname(fileURLToPath(import.meta.url));
const write = (name, value) =>
  writeFileSync(join(directory, name), `${JSON.stringify(value, null, 2)}\n`);
write('s22-reference.json', { source, ...vectors, seedAudit: seeds, nominalField: field });
write('s22-catalogue.json', {
  source,
  admitted: seeds.candidates
    .filter((candidate) => candidate.admitted)
    .map((candidate) => ({
      seed: candidate.seed,
      initial: candidate.initial,
      garden_to_encounter_rotation: candidate.garden_to_encounter_rotation,
      preparation_clearance_bound_m: candidate.preparation_clearance_bound_m,
    })),
});
process.stdout.write(
  `Copied ${seeds.accepted} admitted S22 records and independent vectors from ${commit}\n`,
);
