/**
 * The 3D half of the UI lab: the fixture snapshot drawn with the theme's materials, so each one
 * can be judged and tuned before the real view exists. Lab only. One scene unit is one kilometre;
 * game (x, y) maps to (x, 0, -y).
 */
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  IcosahedronGeometry,
  InstancedMesh,
  LineSegments,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { yawOf } from '../../lib/quat.ts';
import { colour, hex, motion, render } from '../index.ts';
import {
  bodyMaterial,
  envelopeGeometry,
  envelopeMaterial,
  envelopeStyle,
  latticeMaterial,
  LineKit,
  objectStyle,
  pixelsPerUnit,
  planeMaterial,
  planeVeilMaterial,
  rockMaterial,
  setPlaneCoverage,
  wellColour,
  wellLineMaterial,
} from '../three/index.ts';
import type { LineStyleName } from '../three/index.ts';
import { lab, sigmaKm } from './data.ts';

const S = 1 / 1000;
type P = { readonly x: number; readonly y: number };
const at = (p: P, y = 0): [number, number, number] => [p.x * S, y, -p.y * S];
const flat = (pts: readonly P[], y = 0): number[] => pts.flatMap((p) => at(p, y));
const circle = (c: P, radiusKm: number, n = 72, y = 0): number[] => {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push(c.x * S + Math.cos(a) * radiusKm, y, -c.y * S + Math.sin(a) * radiusKm);
  }
  return out;
};

export interface LabScene {
  setCompare(on: boolean): void;
  /** Mark a stretch of the extrapolated forecast as inside a validated span (A5). */
  setValidated(on: boolean): void;
  setLatticeQuality(q: number): void;
  dispose(): void;
}

export function mountScene(canvas: HTMLCanvasElement): LabScene {
  const { snapshot, forecast, compare } = lab;
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(hex(colour.viewBackground));
  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, 1, 6000);
  const ship = snapshot.world.ship;
  const target = new Vector3(190, 0, 60);
  const elevation = (render.defaultElevation * Math.PI) / 180;
  camera.position.set(
    target.x - 40,
    Math.sin(elevation) * 520,
    target.z + Math.cos(elevation) * 520,
  );
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(target);
  controls.enableDamping = true;
  controls.dampingFactor = motion.cameraDamping;
  controls.maxPolarAngle = Math.PI * 0.49;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const b = render.bloom;
  composer.addPass(new UnrealBloomPass(new Vector2(1, 1), b.strength, b.radius, b.threshold));
  composer.addPass(new OutputPass());

  const kit = new LineKit();
  const order = render.renderOrder;
  const line = (
    points: number[],
    style: LineStyleName,
    renderOrder: number = order.onPlane,
  ): Line2 => {
    const g = new LineGeometry();
    g.setPositions(points);
    const l = new Line2(g, kit.get(style));
    l.computeLineDistances();
    l.renderOrder = renderOrder;
    scene.add(l);
    return l;
  };

  // Flight plane with the ship's current coverage, and the veil that pushes back what is below.
  const ground = new PlaneGeometry(1500, 1100).rotateX(-Math.PI / 2).translate(260, 0, 0);
  const veil = new Mesh(ground, planeVeilMaterial());
  veil.renderOrder = order.plane - 1;
  const planeMat = planeMaterial();
  setPlaneCoverage(
    planeMat,
    [ship.position.x * S, ship.position.y * S],
    // LIFT(2G): each cone is drawn as its x–y sector about the axis's azimuth.
    snapshot.coverage.cones.map((s) => ({
      center: Math.atan2(s.axis.y, s.axis.x),
      halfWidth: s.halfAngle,
      range: s.range * S,
      quality: s.quality,
    })),
  );
  const plane = new Mesh(ground, planeMat);
  plane.renderOrder = order.plane;
  scene.add(veil, plane);

  // Bodies: sunlit spheres with their footprint on the plane.
  for (const body of snapshot.world.bodies) {
    const m = new Mesh(new SphereGeometry(body.radius * S, 64, 40), bodyMaterial());
    m.position.set(...at(body.position));
    scene.add(m);
    line(circle(body.position, body.radius * S), 'bodyFootprint');
  }

  // Asteroids: a lit rock where tracked, a ring sized by position uncertainty where not.
  const tracked = snapshot.world.asteroids.filter((a) => a.tracked);
  const rocks = new InstancedMesh(
    new IcosahedronGeometry(1, 1),
    rockMaterial({ emissive: objectStyle.tracked.emissive }),
    Math.max(1, tracked.length),
  );
  rocks.count = tracked.length;
  const m4 = new Matrix4();
  tracked.forEach((a, i) => {
    const r = Math.max(a.radius * S, 2.2);
    rocks.setMatrixAt(i, m4.makeScale(r, r, r).setPosition(...at(a.position)));
  });
  scene.add(rocks);
  const ring = kit.from('stale-ring', {
    colour: objectStyle.stale.colour,
    width: 1.2,
    opacity: 0.6,
  });
  for (const a of snapshot.world.asteroids.filter((x) => !x.tracked)) {
    const g = new LineGeometry();
    g.setPositions(circle(a.position, Math.max(2.5, sigmaKm(a.positionCov, 2)), 40));
    const l = new Line2(g, ring);
    l.renderOrder = order.onPlane;
    scene.add(l);
  }

  // Measured trail (solid) and the issued forecast (dotted) inside its 2σ envelope.
  line(flat(snapshot.trail.map((p) => p.position)), 'trail', order.abovePlane);
  line(flat(forecast.samples.map((s) => s.position)), 'forecast', order.abovePlane);
  const envelopeMat = envelopeMaterial({ hatchScale: 2 });
  const envelope = new Mesh(new BufferGeometry(), envelopeMat);
  envelope.renderOrder = order.envelope;
  scene.add(envelope);
  const buildEnvelope = (): void => {
    envelope.geometry.dispose();
    envelope.geometry = envelopeGeometry(
      forecast.samples.map((s) => ({
        position: at(s.position),
        halfWidth: sigmaKm(s.positionCov, envelopeStyle.sigmas),
        extrapolating: s.extrapolating,
        validated: s.validated === true,
      })),
    );
  };
  buildEnvelope();
  const end = forecast.samples[forecast.samples.length - 1];
  const prev = forecast.samples[forecast.samples.length - 2];
  if (end && prev) {
    const w = sigmaKm(end.positionCov, envelopeStyle.sigmas);
    const dir = new Vector3(...at(end.position)).sub(new Vector3(...at(prev.position)));
    const side = new Vector3(-dir.z, 0, dir.x).normalize().multiplyScalar(w);
    const c = new Vector3(...at(end.position));
    line([...c.clone().add(side).toArray(), ...c.clone().sub(side).toArray()], 'forecastHorizon');
  }

  // The ship: an enlarged symbol (true size is 14 m), body axis, and velocity.
  const symbol = 1.3; // km per metre of hull
  // LIFT(2G): the ship symbol is the first hull prism's outline, turned by the attitude's yaw.
  const yaw = yawOf(ship.attitude);
  const cosA = Math.cos(yaw);
  const sinA = Math.sin(yaw);
  const body = (p: P): P => ({
    x: ship.position.x + (p.x * cosA - p.y * sinA) * symbol * 1000,
    y: ship.position.y + (p.x * sinA + p.y * cosA) * symbol * 1000,
  });
  const hull = snapshot.ship.hull[0]?.outline ?? [];
  const first = hull[0];
  if (first) line(flat([...hull, first].map(body), 0.3), 'shipFootprint', order.shipMarks);
  line(
    flat([body(snapshot.ship.centerOfMass), body({ x: 11, y: 0 })], 0.3),
    'bodyAxis',
    order.shipMarks,
  );
  line(
    flat(
      [
        ship.position,
        { x: ship.position.x + ship.velocity.x * 260, y: ship.position.y + ship.velocity.y * 260 },
      ],
      0.3,
    ),
    'velocity',
    order.shipMarks,
  );

  // The objective, and an earlier attempt from Black Box.
  for (const o of snapshot.objectives)
    if ('region' in o && o.region)
      line(circle(o.region.center, o.region.radius * S), 'objectiveGate');
  const earlier = compare?.[0];
  const previous = earlier
    ? line(flat(earlier.trail.map((p) => p.position)), 'previousAttempt', order.abovePlane)
    : undefined;
  if (previous) previous.visible = false;

  // Field swatches: a lattice sheet standing across the plane, and a well funnel below it.
  // The sheet is drawn as two halves so the plane's veil dims only the part below it.
  const latticeMat = latticeMaterial({ cell: 26 });
  for (const half of [-1, 1]) {
    const sheet = new Mesh(new PlaneGeometry(260, 60).translate(0, half * 30, 0), latticeMat);
    sheet.position.set(330, 0, -90);
    sheet.rotation.y = -0.45;
    sheet.renderOrder = half < 0 ? order.belowPlane : order.abovePlane;
    scene.add(sheet);
  }

  // An enlarged specimen of the forecast envelope, so its three kinds of stretch can be judged:
  // sampled, then extrapolated, with a validated span in between when the box is ticked.
  const specimen = Array.from({ length: 60 }, (_, i) => {
    const t = i / 59;
    const a = -1.95 + t * 0.75;
    return {
      position: [-180 + Math.cos(a) * 300, 0.2, 455 + Math.sin(a) * 300] as [
        number,
        number,
        number,
      ],
      halfWidth: 4 + 26 * t * t,
      t,
    };
  });
  const specimenMesh = new Mesh(new BufferGeometry(), envelopeMaterial({ hatchScale: 2 }));
  specimenMesh.renderOrder = order.envelope;
  scene.add(specimenMesh);
  const buildSpecimen = (validated: boolean): void => {
    specimenMesh.geometry.dispose();
    specimenMesh.geometry = envelopeGeometry(
      specimen.map((s) => ({
        position: s.position,
        halfWidth: s.halfWidth,
        extrapolating: s.t > 0.36,
        validated: validated && s.t > 0.36 && s.t < 0.68,
      })),
    );
  };
  buildSpecimen(false);
  line(
    specimen.flatMap((s) => s.position),
    'forecast',
    order.abovePlane,
  );
  const tip = specimen[specimen.length - 1];
  const before = specimen[specimen.length - 2];
  if (tip && before) {
    const dir = new Vector3(...tip.position).sub(new Vector3(...before.position));
    const side = new Vector3(-dir.z, 0, dir.x).normalize().multiplyScalar(tip.halfWidth);
    const c = new Vector3(...tip.position);
    line([...c.clone().add(side).toArray(), ...c.clone().sub(side).toArray()], 'forecastHorizon');
  }
  const well = { x: 380000, y: -150000 };
  const funnel: number[] = [];
  const tint: number[] = [];
  const c0 = new Color();
  const { rings, meridians } = render.well;
  const radiusAt = (d: number): number => 3 + 24 / (1 + d * 9) ** 2;
  const push = (a: number, d: number): void => {
    funnel.push(
      well.x * S + Math.cos(a) * radiusAt(d),
      -d * 90,
      -well.y * S + Math.sin(a) * radiusAt(d),
    );
    tint.push(...wellColour(d, c0).toArray());
  };
  for (let i = 0; i < rings; i++)
    for (let k = 0; k < 48; k++) {
      push((k / 48) * Math.PI * 2, i / rings);
      push(((k + 1) / 48) * Math.PI * 2, i / rings);
    }
  for (let k = 0; k < meridians; k++)
    for (let i = 0; i < rings - 1; i++) {
      push((k / meridians) * Math.PI * 2, i / rings);
      push((k / meridians) * Math.PI * 2, (i + 1) / rings);
    }
  const fg = new BufferGeometry();
  fg.setAttribute('position', new Float32BufferAttribute(funnel, 3));
  fg.setAttribute('color', new Float32BufferAttribute(tint, 3));
  const wellLines = new LineSegments(fg, wellLineMaterial());
  wellLines.renderOrder = order.belowPlane;
  scene.add(wellLines);
  line(circle(well, radiusAt(0)), 'wellMouth');
  line(circle(well, radiusAt(0) * 1.45), 'wellBoundary');

  let frame = 0;
  let width = 0;
  let height = 0;
  const started = performance.now();
  const tick = (): void => {
    frame = requestAnimationFrame(tick);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    if (w !== width || h !== height) {
      width = w;
      height = h;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      kit.setResolution(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    controls.update();
    kit.setPixelsPerUnit(pixelsPerUnit(camera.fov, camera.position.distanceTo(controls.target), h));
    const time = latticeMat.uniforms.uTime;
    if (time) time.value = (performance.now() - started) / 1000;
    composer.render();
  };
  tick();

  return {
    setCompare(on) {
      if (previous) previous.visible = on;
    },
    setValidated(on) {
      buildSpecimen(on);
    },
    setLatticeQuality(q) {
      const u = latticeMat.uniforms.uQuality;
      if (u) u.value = q;
    },
    dispose() {
      cancelAnimationFrame(frame);
      controls.dispose();
      kit.dispose();
      renderer.dispose();
    },
  };
}
