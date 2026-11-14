// Display-rule specimens for the Night Watch direction.
// Each scene adds to the shared world and may frame the camera. Prototype only.

const NOISE = /* glsl */`
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }`;

function el(tag, attrs = {}, text = '') {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text) e.textContent = text;
  return e;
}
function caption(text) { return el('span', { class: 'scene-note' }, text); }

function circlePts(cx, cz, r, y, n = 96) {
  const p = [];
  for (let k = 0; k <= n; k++) { const a = (k / n) * Math.PI * 2; p.push(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r); }
  return p;
}
function arrow(x0, z0, x1, z1, y, head = 1.2, open = true) {
  const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l;
  const cs = Math.cos(0.45), sn = Math.sin(0.45), hx = -ux, hz = -uz;
  const p = [x0, y, z0, x1, y, z1,
    x1, y, z1, x1 + (hx * cs - hz * sn) * head, y, z1 + (hx * sn + hz * cs) * head,
    x1, y, z1, x1 + (hx * cs + hz * sn) * head, y, z1 + (-hx * sn + hz * cs) * head];
  if (!open) p.push(x1 + (hx * cs - hz * sn) * head, y, z1 + (hx * sn + hz * cs) * head, x1 + (hx * cs + hz * sn) * head, y, z1 + (-hx * sn + hz * cs) * head);
  return p;
}
function minDistToPath(ctx, x, z) {
  let d = Infinity;
  for (let i = 0; i < ctx.N; i += 10) d = Math.min(d, Math.hypot(x - ctx.meas.x[i], z - ctx.meas.z[i]));
  return d;
}

// ---------------------------------------------------------------------------
export const SCENES = {
  flight: {
    name: 'FLIGHT',
    build(ctx) {
      return {
        group: new ctx.THREE.Group(),
        controls: [caption('Dotted = F-07 as issued (frozen). Solid = measured. Band = 2σ, hatched where it extrapolates; bar = horizon. Hatched plane = never sensed; dim grid = sensed earlier; orange = carried by Black Box.')],
      };
    },
  },

  // -------------------------------------------------------------------------
  wells: {
    name: 'WELLS',
    build(ctx) {
      const { THREE, C, color, lineMat, polyline, segments, label } = ctx;
      const g = new THREE.Group();
      const candidates = [[38, -26], [30, 56], [-66, 58], [-78, -34], [8, -62], [62, -8]];
      const specs = [{ Rb: 11, Rm: 7, D: 48 }, { Rb: 9, Rm: 6, D: 40 }, { Rb: 8, Rm: 5, D: 34 }];
      const wells = [];
      for (const [x, z] of candidates) {
        if (wells.length === specs.length) break;
        const s = specs[wells.length];
        if (minDistToPath(ctx, x, z) > s.Rb + 5) wells.push({ x, z, ...s, rt: 0.45 });
      }
      const field = color(C.well);
      wells.forEach((w, n) => {
        // Funnel below the plane: contour rings tightening toward a long narrow throat.
        const pos = [], col = [];
        const lam = w.D * 0.12, K = 30;
        const radius = (d) => w.rt + (w.Rm - w.rt) / Math.pow(1 + d / lam, 2);
        const shade = (d) => 0.12 + 0.88 * Math.exp(-d / (0.7 * w.D));
        for (let k = 0; k <= K; k++) {
          const d = w.D * Math.pow(k / K, 1.25), r = radius(d), b = shade(d);
          for (let s = 0; s < 64; s++) {
            const a0 = (s / 64) * Math.PI * 2, a1 = ((s + 1) / 64) * Math.PI * 2;
            pos.push(w.x + Math.cos(a0) * r, -d, w.z + Math.sin(a0) * r, w.x + Math.cos(a1) * r, -d, w.z + Math.sin(a1) * r);
            col.push(field.r * b, field.g * b, field.b * b, field.r * b, field.g * b, field.b * b);
          }
        }
        for (let m = 0; m < 12; m++) {
          const a = (m / 12) * Math.PI * 2;
          for (let s = 0; s < 40; s++) {
            const d0 = w.D * Math.pow(s / 40, 1.25), d1 = w.D * Math.pow((s + 1) / 40, 1.25);
            const r0 = radius(d0), r1 = radius(d1), b0 = shade(d0) * 0.55, b1 = shade(d1) * 0.55;
            pos.push(w.x + Math.cos(a) * r0, -d0, w.z + Math.sin(a) * r0, w.x + Math.cos(a) * r1, -d1, w.z + Math.sin(a) * r1);
            col.push(field.r * b0, field.g * b0, field.b * b0, field.r * b1, field.g * b1, field.b * b1);
          }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        const funnel = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        funnel.renderOrder = -20;                    // drawn before the plane, so the plane's veil dims it
        g.add(funnel);

        // Depth staff: dotted axis with a tick every 10 u of depth.
        const staff = [];
        for (let d = 0; d < w.D; d += 1.6) staff.push(w.x, -d, w.z, w.x, -Math.min(d + 0.7, w.D), w.z);
        for (let d = 10; d < w.D; d += 10) staff.push(w.x - 0.8, -d, w.z, w.x + 0.8, -d, w.z);
        const staffObj = segments(staff, lineMat(C.well, 1, { opacity: 0.6 }));
        staffObj.renderOrder = -20;
        g.add(staffObj);

        // On the plane: mouth (solid), response-reversal boundary (dashed, the thing to cross deliberately), faint interior.
        g.add(polyline(circlePts(w.x, w.z, w.Rm, 0.05), lineMat(C.well, 1.2, { opacity: 0.85 })));
        g.add(polyline(circlePts(w.x, w.z, w.Rb, 0.07), lineMat(C.well, ctx.L.boundary, { dashed: true, dashSize: 1.1, gapSize: 0.8 })));
        const tint = new THREE.Mesh(new THREE.CircleGeometry(w.Rb, 64).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({ color: C.well, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false }));
        tint.position.set(w.x, 0.02, w.z);
        tint.renderOrder = 2;
        g.add(tint);
        const tag = label(`W${n + 1}`, 'field');
        tag.position.set(w.x + w.Rb * 0.72, 0.4, w.z - w.Rb * 0.72);
        g.add(tag);
      });

      // Specimen inside W1's boundary: commanded thrust outward (magenta), measured acceleration inward (ink).
      const w = wells[0];
      const ax = -0.55, az = 0.84, al = Math.hypot(ax, az);
      const ux = ax / al, uz = az / al;
      const sx = w.x + ux * w.Rb * 0.62, sz = w.z + uz * w.Rb * 0.62;
      const parts = ctx.makeShip();
      parts.ship.position.set(sx, 0, sz);
      parts.ship.rotation.y = -Math.atan2(uz, ux);
      parts.ship.scale.setScalar(0.9);
      parts.thrust.visible = true;
      g.add(parts.ship);
      g.add(segments(arrow(sx + ux * 4.2, sz + uz * 4.2, sx + ux * 9.5, sz + uz * 9.5, 0.6, 1.2), lineMat(C.thrust, 2.2)));
      g.add(segments(arrow(sx - ux * 1.2, sz - uz * 1.2, sx - ux * 6.5, sz - uz * 6.5, 0.6, 1.3, false), lineMat(C.measured, 2.4)));
      const t1 = label('CMD', 'thr'); t1.position.set(sx + ux * 9.8, 0.6, sz + uz * 9.8); g.add(t1);
      const t2 = label('ACC', ''); t2.position.set(sx - ux * 7.2, 0.6, sz - uz * 7.2); g.add(t2);

      ctx.frame?.(w.x - 4, w.z + 4, 95, 38, -20);
      return {
        group: g,
        controls: [caption('Funnels hang below the plane (dimmed by it). Dashed ring = where thrust response reverses. Specimen: CMD outward, measured ACC inward.')],
        dispose() { ctx.frame?.(); },
      };
    },
  },

  // -------------------------------------------------------------------------
  lattice: {
    name: 'LATTICE',
    build(ctx) {
      const { THREE, C, color, meas, idx, label } = ctx;
      const g = new THREE.Group();
      const below = [new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)];
      const above = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)];
      const uniforms = { uQ: { value: 0.75 }, uTime: { value: 0 } };
      const fences = [];
      const picks = [[15, 0.2, 1.2], [18.5, -0.45, 2.2], [22, 0.3, 0.0], [17, 1.1, 1.6], [20.5, -1.25, 0.7]];
      for (const [tt, jitter, phase] of picks) {
        const i = idx(tt), j = Math.min(ctx.N - 1, i + 1);
        const th = Math.atan2(meas.z[j] - meas.z[i], meas.x[j] - meas.x[i]) + Math.PI / 2 + jitter;
        fences.push({ x: meas.x[i], z: meas.z[i], th, L: 44, H: 28, s: 4.6, w: 0.32, phase });
      }
      const vert = /* glsl */`varying vec2 vUv;
        #include <clipping_planes_pars_vertex>
        void main() { vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <clipping_planes_vertex>
        }`;
      const frag = /* glsl */`
        uniform vec3 uCol; uniform vec3 uCore; uniform vec2 uSize;
        uniform float uSpacing; uniform float uWidth; uniform float uPhase; uniform float uQ; uniform float uTime; uniform float uCut; uniform float uGain;
        varying vec2 vUv;
        #include <clipping_planes_pars_fragment>
        ${NOISE}
        void main() {
          #include <clipping_planes_fragment>
          vec2 p = (vUv - 0.5) * uSize;
          float across = 0.0;
          if (uCut > 0.5) { across = p.y; p.y = 0.0; }
          p.y += uPhase;
          float a = (p.x + p.y) / uSpacing, b = (p.x - p.y) / uSpacing;
          float d = min(abs(fract(a + 0.5) - 0.5), abs(fract(b + 0.5) - 0.5)) * uSpacing * 0.70710678;
          float w = uWidth * mix(3.0, 1.0, uQ);
          float I = exp(-d / w);                                   // intense on strands, clear in the centres
          float n = vnoise(p * 0.22 + vec2(uTime * 0.05, 0.0));
          float mask = mix(smoothstep(0.4, 0.8, n), 1.0, uQ * uQ);  // low processing power: patchy
          float grain = hash(floor(p * 4.0) + floor(uTime * 10.0));
          I *= mask * mix(0.45 + 0.55 * grain, 1.0, uQ) * smoothstep(0.03, 0.2, uQ);
          vec2 e = abs(vUv - 0.5) * 2.0;
          float border = (1.0 - smoothstep(0.82, 1.0, e.x)) * (uCut > 0.5 ? exp(-across * across * 1.2) : (1.0 - smoothstep(0.7, 1.0, e.y)));
          gl_FragColor = vec4(mix(uCol, uCore, pow(I, 3.0)), I * border * uGain);
        }`;
      const mat = (f, cut, gain, clip) => {
        const m = new THREE.ShaderMaterial({
          transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, clipping: !!clip, clippingPlanes: clip ?? null,
          uniforms: {
            ...uniforms,
            uCol: { value: color(C.lattice) }, uCore: { value: color(C.latticeCore) }, uSize: { value: new THREE.Vector2(f.L, cut ? 3 : f.H) },
            uSpacing: { value: f.s }, uWidth: { value: f.w }, uPhase: { value: f.phase }, uCut: { value: cut ? 1 : 0 }, uGain: { value: gain },
          },
          vertexShader: vert, fragmentShader: frag,
        });
        return m;
      };
      for (const f of fences) {
        const grp = new THREE.Group();
        grp.position.set(f.x, 0, f.z);
        grp.rotation.y = -f.th;
        const lo = new THREE.Mesh(new THREE.PlaneGeometry(f.L, f.H, 1, 1), mat(f, false, 0.45, below)); lo.renderOrder = -20;
        const hi = new THREE.Mesh(new THREE.PlaneGeometry(f.L, f.H, 1, 1), mat(f, false, 0.45, above)); hi.renderOrder = 4;
        const cut = new THREE.Mesh(new THREE.PlaneGeometry(f.L, 3, 1, 1).rotateX(-Math.PI / 2), mat(f, true, 1.0, null));
        cut.position.y = 0.09; cut.renderOrder = 4;
        grp.add(lo, hi, cut);
        g.add(grp);
      }
      const tag = label('PROC · LATTICE', 'field');
      tag.position.set(fences[0].x + 6, 15, fences[0].z);
      g.add(tag);

      const slider = el('input', { type: 'range', id: 'proc-w', min: '0', max: '100', value: '75' });
      const out = el('span', { class: 'scene-val' }, '75');
      slider.addEventListener('input', () => { out.textContent = slider.value; });
      const wrap = el('label', { class: 'scene-range' });
      wrap.append(el('span', {}, 'PROC W'), slider, out);

      const c = fences[1];
      ctx.frame?.(c.x, c.z, 82, 30, 25);
      return {
        group: g,
        time: 17.5,
        controls: [wrap, caption('Reconstruction from existing sensors, quality set by processing power. Bright strip = where a sheet cuts the flight plane; gaps are the clear centres.')],
        update(t) { uniforms.uQ.value = Number(slider.value) / 100; uniforms.uTime.value = t; },
        dispose() { ctx.frame?.(); },
      };
    },
  },

  // -------------------------------------------------------------------------
  compare: {
    name: 'COMPARE',
    build(ctx) {
      const { THREE, C, meas, prev, idx, N, DT, lineMat, segments, polyline, label, world, PLAN, PREV } = ctx;
      const g = new THREE.Group();
      world.fcGroup.visible = false;
      world.trailFull = true;
      // Equal-time connectors every 2 s: where the two attempts were at the same moment.
      const links = [];
      for (let tt = 2; tt <= 46; tt += 2) { const i = idx(tt); links.push(meas.x[i], 0.1, meas.z[i], prev.x[i], 0.1, prev.z[i]); }
      g.add(segments(links, lineMat(C.ink, 1, { opacity: 0.28 })));
      // What changed: each attempt's burn, in the thrust colour.
      const seg = (sim, a, b, op) => { const p = []; for (let i = idx(a); i <= idx(b); i++) p.push(sim.x[i], 0.2, sim.z[i]); return polyline(p, lineMat(C.thrust, 3.2, { opacity: op })); };
      g.add(seg(meas, PLAN.burnT, PLAN.burnT + PLAN.burnDur, 0.95), seg(prev, PREV.burnT, PREV.burnT + PREV.burnDur, 0.6));
      // First divergence beyond 2 u.
      let iD = N - 1;
      for (let i = 0; i < N; i++) if (Math.hypot(meas.x[i] - prev.x[i], meas.z[i] - prev.z[i]) > 2) { iD = i; break; }
      g.add(polyline((() => { const p = []; for (let k = 0; k <= 4; k++) { const a = (k / 4) * Math.PI * 2 + Math.PI / 4; p.push(meas.x[iD] + Math.cos(a) * 1.8, 0.2, meas.z[iD] + Math.sin(a) * 1.8); } return p; })(), lineMat(C.ink, 1.6)));
      const dt = label(`Δ T+${(iD * DT).toFixed(1)}`, '');
      dt.position.set(meas.x[iD] + 2, 0.4, meas.z[iD] + 2);
      g.add(dt);
      const now = label('ATT 03', '');
      now.position.set(meas.x[N - 1], 0.4, meas.z[N - 1]);
      g.add(now);
      return {
        group: g,
        time: 48,
        controls: [caption('ATT 03 (ink) against ATT 02 (Black Box orange). Thin links join equal times. Magenta = each attempt\'s burn. ◇ = first divergence.')],
        dispose() { world.fcGroup.visible = true; world.trailFull = false; },
      };
    },
  },

  // -------------------------------------------------------------------------
  feedback: {
    name: 'FEEDBACK',
    build(ctx) {
      const { THREE, C, M, meas, idx, lineMat, segments, normalAt, fx } = ctx;
      const g = new THREE.Group();
      // An objective gate on the measured path (success specimen).
      const i = idx(30), [nx, nz] = normalAt(meas, i, 4.5);
      const gx = meas.x[i], gz = meas.z[i];
      g.add(segments([gx - nx, 0.1, gz - nz, gx - nx * 0.55, 0.1, gz - nz * 0.55, gx + nx * 0.55, 0.1, gz + nz * 0.55, gx + nx, 0.1, gz + nz], lineMat(C.ink, 2, { opacity: 0.7 })));
      const closeMat = lineMat(C.ink, 2);
      const close = segments([gx - nx * 0.55, 0.1, gz - nz * 0.55, gx + nx * 0.55, 0.1, gz + nz * 0.55], closeMat);
      g.add(close);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: C.ink, transparent: true, depthWrite: false }));
      ring.position.set(gx, 0.12, gz);
      g.add(ring);

      const btn = (k, glyph) => { const b = el('button', { class: `fx fx-${k}` }); b.innerHTML = `<i>${glyph}</i>${k.toUpperCase()}`; b.addEventListener('click', () => ctx.trigger(k)); return b; };
      return {
        group: g,
        controls: [btn('caution', '▲'), btn('warning', '■'), btn('damage', '■'), btn('success', '○'), btn('reset', ''), caption('One fade-in or one flicker, then steady. Every alert also gets a shape and a Black Box mark.')],
        update() {
          const s = fx.successAt < 0 ? Infinity : performance.now() - fx.successAt;
          const k = Math.min(1, s / M.settle);
          close.visible = s < Infinity;
          closeMat.opacity = 1;
          const r = 4.5 + 3 * Math.min(1, s / (M.settle * 2));
          ring.visible = s < M.settle * 2;
          ring.scale.setScalar(r);
          ring.material.opacity = (1 - Math.min(1, s / (M.settle * 2))) * 0.8 * k;
        },
        dispose() { ctx.trigger('reset'); },
      };
    },
  },
};
