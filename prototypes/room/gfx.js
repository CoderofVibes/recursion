// Small drawing helpers for the compartment mock-up. Colours come from the Night Watch theme mirror.
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { colour as C, hex } from '../visual/theme.js';

const mats = new Set();
export function setResolution(w, h) {
  for (const m of mats) m.resolution.set(w, h);
}

/** Screen-space line material: width in CSS px, dash in the line's own units. */
export function lineMat({ colour = C.ink, width = 1.5, opacity = 1, dash = null, additive = true } = {}) {
  const m = new LineMaterial({
    color: hex(colour),
    linewidth: width,
    transparent: true,
    opacity,
    depthWrite: false,
    dashed: !!dash,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  if (dash) {
    m.dashSize = dash[0];
    m.gapSize = dash[1];
  }
  m.resolution.set(innerWidth, innerHeight);
  mats.add(m);
  return m;
}

export function fat(flat, o = {}) {
  const g = new LineGeometry();
  g.setPositions(flat);
  const l = new Line2(g, lineMat(o));
  l.computeLineDistances();
  l.frustumCulled = false;
  if (o.order != null) l.renderOrder = o.order;
  return l;
}

export function fatSegs(flat, o = {}) {
  const g = new LineSegmentsGeometry();
  g.setPositions(flat);
  const l = new LineSegments2(g, lineMat(o));
  l.computeLineDistances();
  l.frustumCulled = false;
  if (o.order != null) l.renderOrder = o.order;
  return l;
}

/** Replace a fat polyline's points (rebuilds the geometry; fine for a few lines a frame). */
export function setFat(l, flat) {
  l.geometry.dispose();
  l.geometry = new LineGeometry();
  l.geometry.setPositions(flat);
  l.computeLineDistances();
}

export function setFatSegs(l, flat) {
  l.geometry.dispose();
  l.geometry = new LineSegmentsGeometry();
  l.geometry.setPositions(flat);
  l.computeLineDistances();
}

/** One-pixel additive line segments, for wireframes. */
export function thin(flat, { colour = C.ink, opacity = 0.6, order } = {}) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(flat, 3));
  const l = new THREE.LineSegments(
    g,
    new THREE.LineBasicMaterial({
      color: hex(colour),
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  l.frustumCulled = false;
  if (order != null) l.renderOrder = order;
  return l;
}

/** Circle (or arc) in the XZ plane as a flat point list. Angle 0 points to -z, positive toward +x. */
export function arcXZ(r, a0 = 0, a1 = Math.PI * 2, n = 96, y = 0, cx = 0, cz = 0) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push(cx + Math.sin(a) * r, y, cz - Math.cos(a) * r);
  }
  return out;
}

/** Turn a polyline point list into a segment list. */
export function toSegs(flat) {
  const out = [];
  for (let i = 0; i + 5 < flat.length; i += 3)
    out.push(flat[i], flat[i + 1], flat[i + 2], flat[i + 3], flat[i + 4], flat[i + 5]);
  return out;
}

export function label(text, cls = '') {
  const el = document.createElement('div');
  el.className = `tag ${cls}`;
  el.textContent = text;
  const o = new CSS2DObject(el);
  o.userData.el = el;
  return o;
}

export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
