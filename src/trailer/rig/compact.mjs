/* global process, console, URL */
// Lossless structure packing + nine significant digits (angular error below 1e-8 rad).
// node src/trailer/rig/compact.mjs slingshot|lattice
import { readFileSync, writeFileSync, statSync } from 'node:fs';
const scene = process.argv[2];
if (!['slingshot', 'lattice'].includes(scene)) throw new Error('Choose a TV recording');
const path = new URL(`../scenes/${scene}/fixture.json`, import.meta.url);
const recording = JSON.parse(readFileSync(path));
if (recording.format) throw new Error('Already packed');
const names = [];
const index = new Map();
const id = (name, kind) => {
  if (!index.has(name)) {
    index.set(name, names.length);
    names.push([name, kind]);
  }
  return index.get(name);
};
const v = (p) => [p.x, p.y, p.z];
const round = (n) => Number(n.toPrecision(9));
const sampled =
  scene === 'slingshot'
    ? recording.frames.filter((_, i, all) => i % 2 === 0 || i === all.length - 1)
    : recording.frames;
const frames = sampled.map((f) => ({
  t: f.t,
  q: [f.attitude.w, f.attitude.x, f.attitude.y, f.attitude.z],
  ...(f.position ? { p: v(f.position) } : {}),
  sun: f.window.sun ? [...v(f.window.sun.direction), +f.window.sun.visible] : [],
  lit: +f.window.sunlit,
  o: f.window.objects.map((o) => [id(o.id, o.kind), ...v(o.direction), o.angularRadius, +o.lit]),
  c: (f.window.fields ?? [])
    .filter((c) => c.kind === 'cloud-bank')
    .map((c) => ({
      id: c.id,
      p: c.patches.map((p) => [...v(p.direction), p.angularRadius, p.brightness]),
    })),
}));
// The template supplies the ship's real configuration; per-frame optics are in frames above.
const template = {
  ...recording.template,
  window: { sunlit: true, objects: [] },
  world: { ...recording.template.world, fields: [], bodies: [], asteroids: [] },
  objectives: [],
  coverage: { cones: [] },
  trail: [],
  forecasts: [],
  coverageEarlier: [],
};
const packed = { ...recording, format: 'tv-optics-v1', names, template, frames };
if (scene === 'slingshot' && !packed.provenance.lookDirection)
  packed.provenance.lookDirection = packed.provenance.inputs.find(
    (i) => i.t === 95000,
  ).command.target.direction;
writeFileSync(
  path,
  JSON.stringify(packed, (_key, value) => (typeof value === 'number' ? round(value) : value)) +
    '\n',
);
console.log(`${scene}: ${statSync(path).size} bytes`);
