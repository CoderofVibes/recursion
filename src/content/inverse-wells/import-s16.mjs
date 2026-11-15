/** Copy committed independent study data into this content lane; never run its solver. */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const revision = process.argv[2];
if (!revision || !/^[a-f0-9]{7,40}$/.test(revision))
  throw new Error('usage: node src/content/inverse-wells/import-s16.mjs <committed S16 hash>');
const commit = execFileSync('git', ['rev-parse', `${revision}^{commit}`], {
  encoding: 'utf8',
}).trim();
const read = (path) =>
  JSON.parse(
    execFileSync('git', ['show', `${commit}:${path}`], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    }),
  );
const vectors = read('tools/studies/s16/vectors.json');
const seeds = read('tools/studies/s16/seeds.json');
const stripSamples = (value) =>
  Array.isArray(value)
    ? value.map(stripSamples)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .filter(([key]) => key !== 'samples')
            .map(([key, item]) => [key, stripSamples(item)]),
        )
      : value;
const directory = dirname(fileURLToPath(import.meta.url));
const source = { commit, path: 'tools/studies/s16/', profile: 'A15-S5-quintic-40-50km' };
const write = (name, value) =>
  writeFileSync(join(directory, name), `${JSON.stringify(value, null, 2)}\n`);
write('s16-reference.json', { source, ...stripSamples(vectors), seedAudit: seeds });
write('s16-catalogue.json', {
  source,
  layout: vectors.layout,
  admitted: seeds.candidates
    .filter((candidate) => candidate.admitted)
    .map((candidate) => ({
      seed: candidate.seed,
      centers_m: candidate.centers_m,
      initial: candidate.initial,
      garden_to_encounter_rotation: candidate.garden_to_encounter_rotation,
      certificate: candidate.certificate,
    })),
});
process.stdout.write(
  `Copied ${seeds.accepted} admitted layouts and independent vectors from ${commit}\n`,
);
