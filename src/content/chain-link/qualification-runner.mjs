/** Manual full-flight qualification. No production/game import may depend on this runner. */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { createServer } from 'vite';

const folder = dirname(fileURLToPath(import.meta.url));
const root = fileURLToPath(new URL('../../../', import.meta.url));
const protocol = 'a16-twenty-production-flight-v1';
const trees = ['src/sim', 'src/ship', 'src/lib', 'src/contracts', 'data'];
const sources = [
  'src/game/environment.ts',
  'src/game/truth-step.ts',
  'src/content/chain-link/index.ts',
  'src/content/chain-link/environment.ts',
  'src/content/chain-link/layout.ts',
  'src/content/chain-link/qualification.ts',
];
function filesAt(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    return entry.isDirectory()
      ? filesAt(child)
      : /\.(ts|json)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)
        ? [child]
        : [];
  });
}
function fingerprint() {
  const files = [
    ...sources.map((path) => join(root, path)),
    ...trees.flatMap((path) => filesAt(join(root, path))),
  ].sort();
  const hash = createHash('sha256');
  for (const file of files)
    hash.update(relative(root, file).replaceAll('\\', '/') + '\n').update(readFileSync(file));
  return hash.digest('hex');
}

if (process.argv[2] === '--combine') {
  const artifacts = [0, 1, 2, 3].map((i) =>
    JSON.parse(readFileSync(join(folder, `qualification-case-${i}.json`), 'utf8')),
  );
  const sourceSha256 = fingerprint();
  for (const [i, artifact] of artifacts.entries()) {
    if (
      artifact.protocol !== protocol ||
      artifact.sourceSha256 !== sourceSha256 ||
      artifact.result.catalogueIndex !== i ||
      !artifact.result.complete
    )
      throw new Error(`case ${i} is incomplete or does not match the current production source`);
  }
  writeFileSync(
    join(folder, 'qualification-results.json'),
    JSON.stringify({ protocol, sourceSha256, cases: artifacts.map((a) => a.result) }, null, 2) +
      '\n',
  );
  console.log('Combined four complete production flights with matching source fingerprint.');
} else {
  const catalogueIndex = Number(process.argv[2]);
  if (!Number.isInteger(catalogueIndex) || catalogueIndex < 0 || catalogueIndex > 3)
    throw new Error(
      'Usage: node src/content/chain-link/qualification-runner.mjs <0|1|2|3|--combine>',
    );
  const sourceSha256 = fingerprint();
  const server = await createServer({ root, server: { middlewareMode: true, hmr: false } });
  try {
    const { qualifyChainLink } = await server.ssrLoadModule(
      '/src/content/chain-link/qualification.ts',
    );
    const result = qualifyChainLink({
      catalogueIndex,
      progress: (elapsed, localX, rcsUsed) =>
        console.log(JSON.stringify({ catalogueIndex, elapsed, localX, rcsUsed })),
    });
    if (fingerprint() !== sourceSha256)
      throw new Error(
        'Production source changed during the flight; rerun before claiming qualification.',
      );
    writeFileSync(
      join(folder, `qualification-case-${catalogueIndex}.json`),
      JSON.stringify({ protocol, sourceSha256, result }, null, 2) + '\n',
    );
    console.log(JSON.stringify(result));
  } finally {
    await server.close();
  }
}
