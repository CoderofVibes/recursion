// Meaningful equivalence checks for the allocation patch, loaded entirely in memory.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import ts from 'typescript';
import { patchOverlay } from './patch-overlay.mjs';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const patch = fileURLToPath(new URL('../../../docs/studies/s15/reuse-line-buffers.patch', import.meta.url));
const overlay = patchOverlay(root, patch);
const parsed = ts.getParsedCommandLineOfConfigFile(root + 'tsconfig.app.json', {}, {
  ...ts.sys, onUnRecoverableConfigFileDiagnostic: (d) => { throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n')); },
});
const host = ts.createCompilerHost(parsed.options);
const read = host.readFile;
host.readFile = (path) => overlay.files.get(path.replaceAll('\\', '/')) ?? read(path);
const program = ts.createProgram(parsed.fileNames, parsed.options, host);
const diagnostics = ts.getPreEmitDiagnostics(program);
assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCanonicalFileName: (p) => p, getCurrentDirectory: () => root, getNewLine: () => '\n',
}));
const serverOptions = { root, configFile: false, server: { middlewareMode: true, hmr: false, ws: false },
  optimizeDeps: { noDiscovery: true, entries: [] }, appType: 'custom' };
const original = await createServer(serverOptions);
const changed = await createServer({ ...serverOptions, plugins: [overlay.plugin] });
let cases = 0, reused = 0;
try {
  const a = await original.ssrLoadModule('/src/view3d/gfx.ts');
  const b = await changed.ssrLoadModule('/src/view3d/gfx.ts');
  const style = { colour: '#ffffff', width: 1, opacity: 1, dash: [2, 1] };
  function vector(line) {
    const g = line.geometry;
    return { start: Array.from(g.attributes.instanceStart.data.array),
      distance: Array.from(g.attributes.instanceDistanceStart.data.array),
      box: g.boundingBox.toArray ? g.boundingBox.toArray() : [g.boundingBox.min.toArray(), g.boundingBox.max.toArray()],
      sphere: [g.boundingSphere.center.toArray(), g.boundingSphere.radius], count: g.instanceCount };
  }
  for (const segments of [false, true]) {
    const first = [0, 0, 0, 1, 0, 0];
    const make = segments ? 'fatSegs' : 'fat';
    const set = segments ? 'setFatSegs' : 'setFat';
    const one = new a.LineSet(), two = new b.LineSet();
    const l = one[make](first, style), r = two[make](first, style);
    // Counts grow, hold, shrink, become empty, and grow again; include 3D and duplicate points.
    for (let i = 0; i < 120; i++) {
      const n = [2, 2, 6, 6, 16, 16, 0, 2][Math.floor(i / 3) % 8];
      const flat = [];
      for (let j = 0; j < n; j++) flat.push(Math.sin(i + j), Math.cos(i * 0.3 + j), (j % 3) * i / 13);
      const old = r.geometry, oldBuffer = old.attributes.instanceStart.data;
      const wantedSize = segments ? Math.max(6, flat.length) : 2 * (Math.max(6, flat.length) - 3);
      a[set](l, flat); b[set](r, flat);
      assert.deepEqual(vector(r), vector(l), `geometry, bounds, and dash distances differ in case ${cases}`);
      if (oldBuffer.array.length === wantedSize) {
        assert.equal(r.geometry, old); assert.equal(r.geometry.attributes.instanceStart.data, oldBuffer); reused++;
      }
      cases++;
    }
    l.geometry.dispose(); r.geometry.dispose(); one.dispose(); two.dispose();
  }
  const result = { typecheck: 'pass (full app/test TypeScript program with proposed source in memory)',
    equivalence: 'pass', cases, reused, checks: ['position bytes', 'dash-distance bytes', 'bounding box', 'bounding sphere', 'instance count', 'buffer identity at unchanged count'] };
  writeFileSync(new URL('./patch-verification.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
  console.log(result);
} finally { await original.close(); await changed.close(); }
