// Generate the proposed 2D patch without editing src/. No install or source checkout needed.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const scratch = new URL('./.scratch/', import.meta.url);
mkdirSync(scratch, { recursive: true });
const path = 'src/view3d/gfx.ts';
const before = readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
let after = before.replace('  Float32BufferAttribute,\n', '  Float32BufferAttribute,\n  InterleavedBufferAttribute,\n');
const marker = "/** Replace a fat polyline's points (rebuilds the geometry; fine for a few lines a frame). */";
if (!before.includes(marker)) throw new Error('Patch baseline changed; review gfx.ts before regenerating');
after = after.replace(marker, `/** Reuse a fat line's position buffer when its segment count is unchanged. */
function updateFatPositions(l: LineSegments2, flat: readonly number[], polyline: boolean): boolean {
  const points = usable(flat, 6);
  const start = l.geometry.getAttribute('instanceStart');
  if (!(start instanceof InterleavedBufferAttribute)) return false;
  const array = start.data.array;
  const size = polyline ? 2 * (points.length - 3) : points.length;
  if (!(array instanceof Float32Array) || array.length !== size) return false;
  if (polyline) {
    for (let i = 0; i < points.length - 3; i += 3) {
      array[2 * i] = points[i]!;
      array[2 * i + 1] = points[i + 1]!;
      array[2 * i + 2] = points[i + 2]!;
      array[2 * i + 3] = points[i + 3]!;
      array[2 * i + 4] = points[i + 4]!;
      array[2 * i + 5] = points[i + 5]!;
    }
  } else array.set(points);
  start.data.needsUpdate = true;
  // Picking and clipping use the bounds; dashed lines use recomputed distances.
  l.geometry.computeBoundingBox();
  l.geometry.computeBoundingSphere();
  l.computeLineDistances();
  return true;
}

/** Replace a polyline's points; rebuild only when its segment count changes. */`);
after = after.replace('export function setFat(l: Line2, flat: readonly number[]): void {\n',
  'export function setFat(l: Line2, flat: readonly number[]): void {\n  if (updateFatPositions(l, flat, true)) return;\n');
after = after.replace('export function setFatSegs(l: LineSegments2, flat: readonly number[]): void {\n',
  'export function setFatSegs(l: LineSegments2, flat: readonly number[]): void {\n  if (updateFatPositions(l, flat, false)) return;\n');
writeFileSync(new URL('before.ts', scratch), before);
writeFileSync(new URL('after.ts', scratch), after);
let diff;
try { diff = execFileSync('git', ['diff', '--no-index', '--', 'before.ts', 'after.ts'], { cwd: fileURLToPath(scratch), encoding: 'utf8' }); }
catch (e) { if (e.status !== 1) throw e; diff = e.stdout; }
diff = diff.replaceAll('a/before.ts', `a/${path}`).replaceAll('b/after.ts', `b/${path}`);
const dest = new URL('../../../docs/studies/s15/', import.meta.url);
mkdirSync(dest, { recursive: true });
writeFileSync(new URL('reuse-line-buffers.patch', dest), diff);
execFileSync('git', ['apply', '--check', 'docs/studies/s15/reuse-line-buffers.patch'], { cwd: root, stdio: 'inherit' });
console.log('Generated patch; git apply --check passed. src/ was not changed.');
