/**
 * FLIGHT: the local environment in three dimensions, as the ship believes and senses it,
 * projected above the console (DECISIONS A8, A11, P10, P11). Built only from the `ViewSnapshot`.
 *
 * - The ship is a large symbol set back toward the player so the space ahead fills the volume;
 *   its true position is the mark at the centre of mass, and its true hull is drawn there at
 *   true scale.
 * - A level reference plane passes through the ship. Objects off it carry a stalk to it.
 * - The issued forecast is dotted and frozen; the measured trail is solid. The envelope is a
 *   tube of 2σ radius with a ribbon in the reference plane; it thins and hatches where the model
 *   extrapolates, is drawn distinctly inside a validated span, and ends at the horizon ring.
 * - Tracked rocks are solid marks with forecast tracks and closest-approach alerts. Rocks that
 *   are only seen are dim, sit where they were last believed with their uncertainty, and are
 *   never drawn as if forecast.
 * - Sensor coverage is a cone from the ship. The plane is tinted where the ship senses now, plain
 *   where it sensed earlier in this attempt (the hatch returning as that look ages), and hatched
 *   where it has not looked.
 *
 * Also used, zoomed out and without the large ship, as the MAP's region view (`setChart`).
 */
import {
  AdditiveBlending,
  BufferGeometry,
  CircleGeometry,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
  WireframeGeometry,
} from 'three';
import type { Camera } from 'three';
import type { Line2 } from 'three/addons/lines/Line2.js';
import type {
  Forecast,
  ForecastDraft,
  Objective,
  ShipDefinition,
  ViewSnapshot,
} from '../../contracts/index.ts';
import {
  colour,
  envelopeStyle,
  hex,
  holoLines,
  holoSize,
  holoWire,
  lineStyles,
  motion,
  render,
} from '../../theme/index.ts';
import type { LineStyle } from '../../theme/index.ts';
import {
  envelopeGeometry,
  envelopeMaterial,
  holoPlaneMaterial,
  MAX_EARLIER,
  planeStyle,
  setHoloPlane,
} from '../../theme/three/index.ts';
import {
  attitudeToScene,
  bodyToDrawing,
  clock,
  distance,
  length,
  coverageCones,
  hullOutline,
  range as formatRange,
  sigmaMajor,
  toScene,
  turnRates,
} from '../adapter.ts';
import type { GameVec } from '../adapter.ts';
import { fieldViewFor, loadFieldViews } from '../fieldViews.ts';
import type { FieldView } from '../fieldViews.ts';
import { arcXZ, clamp, label, LineSet, setFat, setFatSegs, setTag, setThin, thin } from '../gfx.ts';
import type { Tag } from '../gfx.ts';
import { makeShipModel } from '../ship/model.ts';
import { CoverageHistory } from './coverageHistory.ts';

const TAU = Math.PI * 2;
const MAX_ROCKS = 512;
/** Runs of a path that lie inside the volume: how many are drawn per path. */
const MAX_RUNS = 3;
/** Shortest and longest range (game metres from the ship to the rim). */
export const RANGE_MIN = 5_000;
export const RANGE_MAX = 12_000_000;
export const RANGE_DEFAULT = 1_500_000;
/** Seconds between rebuilds of clipped paths as the ship moves through the volume. */
const RECLIP = 0.25;

type AnyForecast = Forecast | ForecastDraft;

/** Which flight controls the hands are on, each -1, 0 or 1; drawn as rate arcs and chevrons. */
export interface HandsOnMarks {
  readonly yaw: number;
  readonly pitch: number;
}

export interface FlightFrame {
  readonly snapshot: ViewSnapshot;
  /** A draft forecast to show beside the issued one: the plan being edited. */
  readonly preview?: AnyForecast;
  /** The object the cursor or the player has chosen. */
  readonly selected?: string | null;
  /** Clearance the player planned for, metres: a predicted pass inside it raises an alert. */
  readonly clearance: number;
  readonly hands?: HandsOnMarks;
}

export interface ApproachAlert {
  readonly id: string;
  readonly name: string;
  /** Sim time of the predicted closest approach. */
  readonly t: number;
  /** Predicted hull-to-surface clearance and its one-sigma, metres. */
  readonly distance: number;
  readonly sigma: number;
  readonly level: 'advisory' | 'caution' | 'warning';
  /** A massive body (the slingshot pass) rather than a rock. */
  readonly body: boolean;
}

export interface FlightHolo {
  readonly group: Group;
  update(frame: FlightFrame, dt: number, time: number): void;
  range(): number;
  setRange(metres: number): void;
  headingUp(): boolean;
  setHeadingUp(on: boolean): void;
  /** The map's region view: chart-up, no large ship. */
  setChart(on: boolean): void;
  /** The object nearest the cursor (normalised device coordinates), if one is close. */
  pick(ndcX: number, ndcY: number, camera: Camera, viewportHeight: number): string | null;
  /** Closest approaches the latest issued forecast predicts, soonest first. */
  alerts(): readonly ApproachAlert[];
  /** How far the measured position is from where the latest forecast put the ship now. */
  miss(): { readonly metres: number; readonly sigmas: number } | null;
  setResolution(width: number, height: number): void;
  /** Screen pixels covered by one hologram metre at the hologram's distance from the camera. */
  setPixelsPerUnit(pixels: number): void;
  dispose(): void;
}

const niceStep = (x: number): number => {
  const p = 10 ** Math.floor(Math.log10(Math.max(x, 1e-9)));
  const m = x / p;
  return (m < 2 ? 1 : m < 5 ? 2 : 5) * p;
};

/** Split `items` into runs of consecutive items that pass `keep`. */
function runs<T>(items: readonly T[], keep: (item: T) => boolean): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  for (const item of items) {
    if (keep(item)) cur.push(item);
    else if (cur.length) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

export function makeFlightHolo(definition: ShipDefinition): FlightHolo {
  const Rh = holoSize.radius;
  const SET_BACK = holoSize.setBack * Rh;
  const order = render.renderOrder;

  const group = new Group(); // the host places and tilts this
  const rot = new Group(); // origin at the ship; turns the environment into the display frame
  const trans = new Group(); // game metres → hologram metres, centred on the ship
  group.add(rot);
  rot.add(trans);
  const linesH = new LineSet(); // drawn in hologram metres
  const linesE = new LineSet(); // drawn in game metres, inside `trans`

  let range = RANGE_DEFAULT;
  let headingUp = true;
  let chart = false;
  let pixelsPerMetre = 600;
  const toHolo = new Matrix4();
  const tmp = new Vector3();
  const tmp2 = new Vector3();
  const tmp3 = new Vector3();
  const inside = (scenePoint: Vector3, margin = 0.97): boolean =>
    tmp.copy(scenePoint).applyMatrix4(toHolo).length() < Rh * margin;
  const insideGame = (p: GameVec): boolean => inside(toScene(p, tmp2));

  // ---- Reference plane ---------------------------------------------------------------------
  const planeMat = holoPlaneMaterial(Rh);
  /** What the sensors covered earlier in this attempt (cleared when the clock runs backwards). */
  const seen = new CoverageHistory(planeStyle.earlierMemory, MAX_EARLIER);
  const plane = new Mesh(new CircleGeometry(Rh * 2.2, 96).rotateX(-Math.PI / 2), planeMat);
  plane.renderOrder = order.plane;
  plane.frustumCulled = false;
  rot.add(plane);

  // The volume: a rim at console level, two faint arcs over the top, and a mark for "ahead".
  group.add(linesH.fat(arcXZ(Rh, 0, TAU, 128), holoLines.rim, { order: order.onPlane }));
  {
    const dome: number[] = [];
    for (let i = 0; i < 48; i++) {
      const a = (Math.PI * i) / 48;
      const b = (Math.PI * (i + 1)) / 48;
      dome.push(Math.cos(a) * Rh, Math.sin(a) * Rh, 0, Math.cos(b) * Rh, Math.sin(b) * Rh, 0);
      dome.push(0, Math.sin(a) * Rh, Math.cos(a) * Rh, 0, Math.sin(b) * Rh, Math.cos(b) * Rh);
    }
    group.add(thin(dome, colour.ink, holoWire.dome));
  }
  group.add(
    linesH.fatSegs([0, 0, -Rh * 1.012, 0, 0, -Rh * 1.06], holoLines.aheadTick, {
      order: order.onPlane,
    }),
  );
  const rangeTag = label('', 'dim');
  rangeTag.position.set(Rh * 0.74, 0, Rh * 0.74);
  group.add(rangeTag);

  // ---- Bodies ------------------------------------------------------------------------------
  interface BodyMark {
    readonly g: Group;
    readonly wire: LineSegments;
    readonly equator: Line2;
    readonly tag: Tag;
    readonly marker: Group;
    readonly markerTag: Tag;
    radius: number;
  }
  const bodyMarks = new Map<string, BodyMark>();
  const bodyRadius = new Map<string, number>();
  const unitSphere = new WireframeGeometry(new SphereGeometry(1, 18, 10));
  const bodyWireMat = new LineBasicMaterial({
    color: hex(colour.bodyRim),
    transparent: true,
    opacity: holoWire.body,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const bodyMark = (id: string, name: string): BodyMark => {
    let m = bodyMarks.get(id);
    if (!m) {
      const g = new Group();
      const wire = new LineSegments(unitSphere, bodyWireMat);
      g.add(wire);
      const equator = linesE.fat(arcXZ(1, 0, TAU, 72), holoLines.bodyEquator);
      g.add(equator);
      const tag = label(name.toUpperCase());
      g.add(tag);
      trans.add(g);
      const marker = new Group(); // bearing mark on the rim when the body is outside the volume
      marker.add(
        linesH.fat([-0.03, 0, 0.035, 0, 0, 0, 0.03, 0, 0.035], holoLines.bodyBearing),
      );
      const markerTag = label('', 'dim');
      markerTag.position.set(0, 0.05, 0.02);
      marker.add(markerTag);
      group.add(marker);
      m = { g, wire, equator, tag, marker, markerTag, radius: 0 };
      bodyMarks.set(id, m);
    }
    return m;
  };

  // ---- Rocks -------------------------------------------------------------------------------
  const rockGeo = new OctahedronGeometry(1, 0);
  const rockMesh = (c: string, opacity: number): InstancedMesh => {
    const m = new InstancedMesh(
      rockGeo,
      new MeshBasicMaterial({
        color: hex(c),
        transparent: true,
        opacity,
        depthWrite: false,
        blending: AdditiveBlending,
        wireframe: true,
      }),
      MAX_ROCKS,
    );
    m.frustumCulled = false;
    m.renderOrder = order.abovePlane;
    m.count = 0;
    trans.add(m);
    return m;
  };
  const rocksTracked = rockMesh(colour.asteroid, holoWire.rockLive);
  const rocksSeen = rockMesh(colour.inkDim, holoWire.rockStale);
  // Stalks drop each object to the reference plane so its height reads.
  const stalks = thin([], colour.ink, holoWire.stalk);
  trans.add(stalks);
  // Where a rock is only believed to be: a ring of two sigma about its last estimate.
  const doubt = thin([], colour.asteroid, holoLines.uncertainty.opacity);
  trans.add(doubt);
  const M = new Matrix4();
  const Q = new Quaternion();
  const S = new Vector3();

  // Selection bracket and tag, and a ring on whatever the camera is tracking.
  const selectRing = linesH.fat(arcXZ(holoSize.selection, 0, TAU, 32), holoLines.selection, {
    order: order.shipMarks,
  });
  selectRing.visible = false;
  group.add(selectRing);
  const selectTag = label('', 'sel');
  selectTag.visible = false;
  group.add(selectTag);

  // ---- Paths: trail, forecasts, object tracks, comparison ----------------------------------
  /** A path drawn as up to MAX_RUNS polylines: the stretches of it inside the volume. */
  class Path {
    private readonly lines: Line2[] = [];
    constructor(style: LineStyle, renderOrder: number) {
      for (let i = 0; i < MAX_RUNS; i++) {
        const l = linesE.fat([], style, { order: renderOrder });
        l.visible = false;
        trans.add(l);
        this.lines.push(l);
      }
    }
    set(points: readonly GameVec[]): void {
      const parts = points.length ? runs(points, insideGame) : [];
      this.lines.forEach((l, i) => {
        const part = parts[i];
        l.visible = part !== undefined && part.length > 1;
        if (!l.visible || !part) return;
        const flat: number[] = [];
        for (const p of part) flat.push(p.x, p.z ?? 0, -p.y);
        setFat(l, flat);
      });
    }
    hide(): void {
      for (const l of this.lines) l.visible = false;
    }
    dispose(): void {
      for (const l of this.lines) l.geometry.dispose();
    }
  }
  const trail = new Path(lineStyles.trail, order.abovePlane);
  const trailHead = linesE.fat([], lineStyles.trail, { order: order.abovePlane });
  trans.add(trailHead);
  const forecastPath = new Path(lineStyles.forecast, order.abovePlane);
  const forecastOld = new Path(holoLines.forecastOld, order.abovePlane);
  const previewPath = new Path(holoLines.preview, order.abovePlane);
  const compareA = new Path(lineStyles.previousAttempt, order.abovePlane);
  const compareB = new Path(holoLines.compareB, order.abovePlane);
  const compareForecastA = new Path(holoLines.compareForecast, order.abovePlane);
  const compareForecastB = new Path(holoLines.compareForecast, order.abovePlane);
  const compareLinks = linesE.fatSegs([], lineStyles.compareLink, { order: order.onPlane });
  compareLinks.visible = false;
  trans.add(compareLinks);
  const compareTagA = label('', 'bbx');
  const compareTagB = label('', 'dim');
  compareTagA.visible = compareTagB.visible = false;
  trans.add(compareTagA, compareTagB);
  const objectPaths: Path[] = [];
  const objectPath = (i: number): Path => {
    while (objectPaths.length <= i)
      objectPaths.push(new Path(holoLines.objectTrack, order.abovePlane));
    return objectPaths[i]!;
  };

  // Envelope: a ribbon in the reference plane (theme shading) and rings around the path.
  const envelopeMat = envelopeMaterial({ hatchScale: Rh / 140 });
  const ribbons: Mesh[] = [];
  for (let i = 0; i < MAX_RUNS; i++) {
    const m = new Mesh(new BufferGeometry(), envelopeMat);
    m.frustumCulled = false;
    m.renderOrder = order.envelope;
    m.visible = false;
    trans.add(m);
    ribbons.push(m);
  }
  const tube = {
    sampled: thin([], envelopeStyle.colour, holoWire.tube, order.envelope),
    extrapolated: thin([], envelopeStyle.colour, holoWire.tubeExtrapolated, order.envelope),
    validated: thin([], envelopeStyle.colour, holoWire.tubeValidated, order.envelope),
  };
  trans.add(tube.sampled, tube.extrapolated, tube.validated);
  const horizonRing = linesE.fat([], lineStyles.forecastHorizon, { order: order.abovePlane });
  const kneeRing = linesE.fat([], lineStyles.forecastKnee, { order: order.abovePlane });
  horizonRing.visible = kneeRing.visible = false;
  trans.add(horizonRing, kneeRing);
  const horizonTag = label('', 'fc');
  horizonTag.visible = false;
  trans.add(horizonTag);
  const nowLink = linesE.fat([], lineStyles.forecastNowLink, { order: order.shipMarks });
  nowLink.visible = false;
  trans.add(nowLink);
  const nowTag = label('', 'fc');
  nowTag.visible = false;
  trans.add(nowTag);

  // Closest approaches predicted by the forecast: a ring on the forecast path, and a tag.
  interface ApproachMark {
    readonly ring: Line2;
    readonly ringWarning: Line2;
    readonly tag: Tag;
  }
  const approachMarks: ApproachMark[] = [];
  const approachMark = (i: number): ApproachMark => {
    while (approachMarks.length <= i) {
      const ring = linesH.fat(arcXZ(holoSize.selection * 0.8, 0, TAU, 28), holoLines.approachRing);
      const ringWarning = linesH.fat(
        arcXZ(holoSize.selection * 0.8, 0, TAU, 28),
        holoLines.approachRingWarning,
      );
      const tag = label('');
      ring.visible = ringWarning.visible = tag.visible = false;
      group.add(ring, ringWarning, tag);
      approachMarks.push({ ring, ringWarning, tag });
    }
    return approachMarks[i]!;
  };

  // Objectives: gates drawn in the reference plane about their centre.
  interface GateMark {
    readonly rings: Line2[];
    readonly tag: Tag;
  }
  const gates: GateMark[] = [];
  const gate = (i: number): GateMark => {
    while (gates.length <= i) {
      const rings = [0, 1].map(() => {
        const l = linesE.fat([], holoLines.objective, { order: order.onPlane });
        l.visible = false;
        trans.add(l);
        return l;
      });
      const tag = label('', 'dim');
      tag.visible = false;
      trans.add(tag);
      gates.push({ rings, tag });
    }
    return gates[i]!;
  };

  // ---- The ship ----------------------------------------------------------------------------
  const shipG = new Group(); // origin at the ship's centre of mass, in the display frame
  rot.add(shipG);
  const model = makeShipModel(definition, { detail: false });
  model.group.scale.setScalar(holoSize.shipScale);
  model.setOpacity(holoWire.shipSymbol);
  shipG.add(model.group);
  // Centre of mass (the ship's true position) with its dotted axis, and a nose tick.
  shipG.add(linesH.fat(arcXZ(holoSize.comRing, 0, TAU, 24), holoLines.centreOfMass));
  shipG.add(linesH.fat([0, -0.24, 0, 0, 0.26, 0], holoLines.comAxis));
  const RING = holoSize.bearingRing;
  shipG.add(linesH.fatSegs([0, 0, -RING, 0, 0, -RING - 0.04], holoLines.noseTick));
  const yawArc = linesH.fat([], holoLines.rateArc);
  const pitchArc = linesH.fat([], holoLines.rateArc);
  shipG.add(yawArc, pitchArc);
  const thrustMarks = linesH.fatSegs([], lineStyles.thrustChevron);
  const thrustAxis = linesH.fatSegs([], lineStyles.thrustLine);
  thrustMarks.visible = thrustAxis.visible = false;
  shipG.add(thrustMarks, thrustAxis);
  // Small symbol for the map's region view.
  const symbol = linesH.fat(
    [0, 0, -0.03, 0.014, 0, 0.018, -0.014, 0, 0.018, 0, 0, -0.03],
    holoLines.centreOfMass,
  );
  symbol.visible = false;
  shipG.add(symbol);
  // In the environment's orientation: a level bearing ring, the velocity arrow, sensor cones.
  const ring = new Group();
  ring.add(linesH.fat(arcXZ(RING, 0, TAU, 96), holoLines.bearingRing));
  {
    const ticks: number[] = [];
    for (let d = 0; d < 360; d += 15) {
      const a = (d * Math.PI) / 180;
      const r1 = RING * (d % 90 === 0 ? 0.9 : 0.95);
      ticks.push(Math.sin(a) * RING, 0, -Math.cos(a) * RING, Math.sin(a) * r1, 0, -Math.cos(a) * r1);
    }
    ring.add(thin(ticks, colour.ink, holoWire.tick));
  }
  rot.add(ring);
  const velocity = linesH.fat([], lineStyles.velocity);
  rot.add(velocity);
  const cones = thin([], colour.coverage, holoWire.sensorCone);
  rot.add(cones);
  // The true hull at true scale, where the ship really is.
  const hullG = new Group();
  trans.add(hullG);
  let hullLine: Line2 | null = null;
  let hullKey = '';

  // ---- Field plugins: an encounter's own phenomena, drawn only once the ship detects them ----
  loadFieldViews();
  const fieldViews = new Map<string, { view: FieldView; group: Group }>();

  // ---- State kept between frames -----------------------------------------------------------
  const displayQ = new Quaternion();
  const shipQ = new Quaternion();
  let displayReady = false;
  let reclip = 0;
  let trailCount = -1;
  let forecastKey = '';
  let previewKey = '';
  let compareKey = '';
  let latestAlerts: ApproachAlert[] = [];
  let latestMiss: { metres: number; sigmas: number } | null = null;
  const pickables: { id: string; p: Vector3 }[] = [];

  /** The forecast's position at time `t`, by linear interpolation; null outside its span. */
  const forecastAt = (
    f: AnyForecast,
    t: number,
  ): { p: GameVec; sigma: number } | null => {
    const s = f.samples;
    const first = s[0];
    const last = s[s.length - 1];
    if (!first || !last || t < first.t || t > last.t) return null;
    let lo = 0;
    let hi = s.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (s[mid]!.t <= t) lo = mid;
      else hi = mid;
    }
    const a = s[lo]!;
    const b = s[hi]!;
    const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
    const az = (a.position as GameVec).z ?? 0;
    const bz = (b.position as GameVec).z ?? 0;
    return {
      p: {
        x: a.position.x + (b.position.x - a.position.x) * k,
        y: a.position.y + (b.position.y - a.position.y) * k,
        z: az + (bz - az) * k,
      },
      sigma: sigmaMajor(a.positionCov) * (1 - k) + sigmaMajor(b.positionCov) * k,
    };
  };

  const ringAround = (
    centre: Vector3,
    tangent: Vector3,
    radius: number,
    n: number,
    out: number[],
    asSegments: boolean,
  ): void => {
    const u = tmp2.set(0, 1, 0).cross(tangent);
    if (u.lengthSq() < 1e-12) u.set(1, 0, 0);
    u.normalize();
    const v = tmp3.copy(tangent).cross(u).normalize();
    let px = 0;
    let py = 0;
    let pz = 0;
    for (let i = 0; i <= n; i++) {
      const a = (TAU * i) / n;
      const x = centre.x + (u.x * Math.cos(a) + v.x * Math.sin(a)) * radius;
      const y = centre.y + (u.y * Math.cos(a) + v.y * Math.sin(a)) * radius;
      const z = centre.z + (u.z * Math.cos(a) + v.z * Math.sin(a)) * radius;
      if (!asSegments) out.push(x, y, z);
      else if (i > 0) out.push(px, py, pz, x, y, z);
      px = x;
      py = y;
      pz = z;
    }
  };

  function drawForecast(f: AnyForecast | undefined, now: number, clearance: number): void {
    latestAlerts = [];
    for (const r of ribbons) r.visible = false;
    horizonRing.visible = kneeRing.visible = horizonTag.visible = false;
    for (const m of approachMarks) m.ring.visible = m.ringWarning.visible = m.tag.visible = false;
    for (const p of objectPaths) p.hide();
    setThin(tube.sampled, []);
    setThin(tube.extrapolated, []);
    setThin(tube.validated, []);
    if (!f || f.samples.length < 2) {
      forecastPath.hide();
      return;
    }
    const Sh = Rh / range;
    forecastPath.set(f.samples.map((s) => s.position));

    // Envelope: ribbon per run, and rings spaced evenly along the path.
    const parts = runs(f.samples, (s) => insideGame(s.position));
    ribbons.forEach((mesh, i) => {
      const part = parts[i];
      mesh.visible = part !== undefined && part.length > 1;
      if (!mesh.visible || !part) return;
      mesh.geometry.dispose();
      mesh.geometry = envelopeGeometry(
        part.map((s) => ({
          position: [s.position.x, (s.position as GameVec).z ?? 0, -s.position.y],
          halfWidth: envelopeStyle.sigmas * sigmaMajor(s.positionCov),
          extrapolating: s.extrapolating,
          validated: s.validated === true,
        })),
      );
    });
    const rings = { sampled: [] as number[], extrapolated: [] as number[], validated: [] as number[] };
    const centre = new Vector3();
    const next = new Vector3();
    const tangent = new Vector3();
    for (const part of parts) {
      let travelled = Infinity;
      for (let i = 0; i + 1 < part.length; i++) {
        const s = part[i]!;
        toScene(s.position, centre);
        toScene(part[i + 1]!.position, next);
        tangent.subVectors(next, centre);
        const step = tangent.length();
        travelled += step * Sh;
        if (travelled < 0.07 || step < 1e-9) continue;
        const radius = envelopeStyle.sigmas * sigmaMajor(s.positionCov);
        if (radius * Sh < 0.002) continue;
        travelled = 0;
        tangent.normalize();
        const into = !s.extrapolating
          ? rings.sampled
          : s.validated
            ? rings.validated
            : rings.extrapolated;
        ringAround(centre, tangent, radius, 20, into, true);
      }
    }
    setThin(tube.sampled, rings.sampled);
    setThin(tube.extrapolated, rings.extrapolated);
    setThin(tube.validated, rings.validated);

    // The horizon: where the forecast ends, a ring across the envelope. Nothing beyond it.
    const last = f.samples[f.samples.length - 1]!;
    const before = f.samples[f.samples.length - 2]!;
    if (insideGame(last.position)) {
      toScene(last.position, centre);
      tangent.subVectors(centre, toScene(before.position, next)).normalize();
      const flat: number[] = [];
      const r = Math.max(envelopeStyle.sigmas * sigmaMajor(last.positionCov), 0.012 / Sh);
      ringAround(centre, tangent, r, 32, flat, false);
      setFat(horizonRing, flat);
      horizonRing.visible = true;
      horizonTag.position.copy(centre);
      horizonTag.position.y += r + 0.045 / Sh;
      setTag(horizonTag, `FORECAST ENDS T+${clock(last.t)}`);
      horizonTag.visible = true;
    }
    // The knee: where the forecast leaves the distances the model has sampled.
    const kneeIndex = f.samples.findIndex((s) => s.extrapolating);
    const knee = kneeIndex > 0 ? f.samples[kneeIndex] : undefined;
    if (knee && insideGame(knee.position)) {
      toScene(knee.position, centre);
      tangent.subVectors(centre, toScene(f.samples[kneeIndex - 1]!.position, next)).normalize();
      const flat: number[] = [];
      const r = Math.max(envelopeStyle.sigmas * sigmaMajor(knee.positionCov), 0.008 / Sh);
      ringAround(centre, tangent, r, 24, flat, false);
      setFat(kneeRing, flat);
      kneeRing.visible = true;
    }

    // Other objects' predicted motion (tracked rocks and the bodies): forecast tracks.
    f.objects.forEach((track, i) => objectPath(i).set(track.samples.map((s) => s.position)));

    // Closest approaches still ahead.
    latestAlerts = f.closestApproaches
      // Still ahead, and a real pass: a body the path merely recedes from is not an approach.
      .filter((c) => c.t > now && (bodyRadius.get(c.id) === undefined || c.distance < 12 * bodyRadius.get(c.id)!))
      .map((c): ApproachAlert => {
        const body = bodyMarks.has(c.id);
        const near = c.distance - 2 * c.sigma;
        const level: ApproachAlert['level'] =
          near <= 0 || c.distance < clearance / 3
            ? 'warning'
            : near < clearance
              ? 'caution'
              : 'advisory';
        return {
          id: c.id,
          name: c.id.toUpperCase(),
          t: c.t,
          distance: c.distance,
          sigma: c.sigma,
          level,
          body,
        };
      })
      .sort((a, b) => a.t - b.t);
  }

  /** Marks that follow the forecast but move in the hologram every frame. */
  function placeApproaches(f: AnyForecast | undefined, now: number): void {
    latestAlerts.forEach((a, i) => {
      const mark = approachMark(i);
      const at = f ? forecastAt(f, a.t) : null;
      const shown = at !== null && insideGame(at.p) && (a.body || a.level !== 'advisory');
      mark.ring.visible = shown && a.level !== 'warning';
      mark.ringWarning.visible = shown && a.level === 'warning';
      mark.tag.visible = shown;
      if (!shown || !at) return;
      toScene(at.p, tmp2).applyMatrix4(toHolo);
      mark.ring.position.copy(tmp2);
      mark.ringWarning.position.copy(tmp2);
      mark.tag.position.copy(tmp2).y += holoSize.selection;
      const glyph = a.level === 'warning' ? '■ ' : a.level === 'caution' ? '▲ ' : '';
      setTag(
        mark.tag,
        `${glyph}${a.name}  CPA ${formatRange(a.distance)} ±${formatRange(a.sigma)}  T−${clock(a.t - now)}`,
      );
      mark.tag.element.className = `rx-tag ${a.level === 'advisory' ? 'fc' : a.level}`;
    });
    for (let i = latestAlerts.length; i < approachMarks.length; i++) {
      const m = approachMarks[i]!;
      m.ring.visible = m.ringWarning.visible = m.tag.visible = false;
    }
  }

  function drawObjectives(objectives: readonly Objective[], snapshot: ViewSnapshot): void {
    let n = 0;
    for (const o of objectives) {
      const target = o.target
        ? (snapshot.world.bodies.find((b) => b.id === o.target) ??
          snapshot.world.asteroids.find((a) => a.id === o.target))
        : undefined;
      const centre: GameVec | undefined = o.region?.center ?? target?.position;
      const radii = o.band
        ? [o.band.inner, o.band.outer]
        : o.depart
          ? [o.depart.beyond]
          : o.region
            ? [o.region.radius]
            : [];
      if (!centre || radii.length === 0) continue;
      const g = gate(n++);
      const c = toScene(centre, tmp2);
      g.rings.forEach((l, i) => {
        const r = radii[i];
        l.visible = r !== undefined;
        if (r !== undefined) setFat(l, arcXZ(r, 0, TAU, 128, c.y, c.x, c.z));
      });
      const r0 = radii[radii.length - 1]!;
      g.tag.position.set(c.x + r0 * 0.7071, c.y, c.z + r0 * 0.7071);
      setTag(g.tag, o.label);
      g.tag.visible = inside(g.tag.position);
    }
    for (let i = n; i < gates.length; i++) {
      const g = gates[i]!;
      g.tag.visible = false;
      for (const l of g.rings) l.visible = false;
    }
  }

  function drawCompare(snapshot: ViewSnapshot): void {
    const pair = snapshot.compare;
    if (!pair) {
      compareA.hide();
      compareB.hide();
      compareForecastA.hide();
      compareForecastB.hide();
      compareLinks.visible = compareTagA.visible = compareTagB.visible = false;
      return;
    }
    const [a, b] = pair;
    compareA.set(a.trail.map((p) => p.position));
    compareB.set(b.trail.map((p) => p.position));
    compareForecastA.set(a.forecast ? a.forecast.samples.map((s) => s.position) : []);
    compareForecastB.set(b.forecast ? b.forecast.samples.map((s) => s.position) : []);
    // Links between the two attempts at equal times, a dozen along the shorter record.
    const links: number[] = [];
    const n = Math.min(a.trail.length, b.trail.length);
    const every = Math.max(1, Math.floor(n / 12));
    for (let i = 0; i < n; i += every) {
      const pa = a.trail[i]!;
      const pb = b.trail[i]!;
      if (!insideGame(pa.position) || !insideGame(pb.position)) continue;
      links.push(pa.position.x, (pa.position as GameVec).z ?? 0, -pa.position.y);
      links.push(pb.position.x, (pb.position as GameVec).z ?? 0, -pb.position.y);
    }
    compareLinks.visible = links.length > 0;
    if (links.length) setFatSegs(compareLinks, links);
    const endA = a.trail[a.trail.length - 1];
    const endB = b.trail[b.trail.length - 1];
    compareTagA.visible = endA !== undefined && insideGame(endA.position);
    compareTagB.visible = endB !== undefined && insideGame(endB.position);
    if (endA) toScene(endA.position, compareTagA.position);
    if (endB) toScene(endB.position, compareTagB.position);
    setTag(compareTagA, a.label);
    setTag(compareTagB, b.label);
  }

  function update(frame: FlightFrame, dt: number, time: number): void {
    const { snapshot } = frame;
    const ship = snapshot.world.ship;
    const Sh = Rh / range;
    const shipScene = toScene(ship.position, new Vector3());

    // Display orientation: heading-up follows the ship, but never turns faster than the theme
    // allows, so a tumbling ship under time warp does not spin the hologram.
    attitudeToScene(ship.attitude, shipQ);
    if (!displayReady) {
      displayQ.copy(shipQ);
      displayReady = true;
    } else {
      const angle = displayQ.angleTo(shipQ);
      const step = motion.maxDisplayTurn * dt;
      if (angle <= step || angle < 1e-6) displayQ.copy(shipQ);
      else displayQ.slerp(shipQ, step / angle);
    }
    const hu = headingUp && !chart;
    rot.position.set(0, 0, hu ? SET_BACK : 0);
    if (hu) rot.quaternion.copy(displayQ).invert();
    else rot.quaternion.identity();
    trans.scale.setScalar(Sh);
    trans.position.copy(shipScene).multiplyScalar(-Sh);
    rot.updateMatrix();
    trans.updateMatrix();
    toHolo.multiplyMatrices(rot.matrix, trans.matrix);
    linesE.setPixelsPerUnit(pixelsPerMetre * Sh);

    // Reference plane: grid at a spacing that suits the range, what is sensed right now, and
    // what was sensed earlier in this attempt.
    const sensed = coverageCones(snapshot.coverage);
    seen.note(
      snapshot.t,
      ship.position.x,
      ship.position.y,
      sensed.map((c) => ({ sensor: c.sensor, center: c.bearing, halfWidth: c.halfAngle, range: c.range })),
    );
    (planeMat.uniforms.uToVolume!.value as Matrix4).copy(rot.matrix);
    setHoloPlane(
      planeMat,
      [ship.position.x, ship.position.y],
      Sh,
      niceStep(range / 2.5),
      sensed.map((c) => ({
        center: c.bearing,
        halfWidth: c.halfAngle,
        range: c.range,
        quality: c.quality,
      })),
      seen.earlier(snapshot.t, ship.position.x, ship.position.y),
    );
    setTag(rangeTag, `RANGE ${formatRange(range)}`);

    pickables.length = 0;
    const stalkFlat: number[] = [];
    const doubtFlat: number[] = [];
    const planeY = shipScene.y;

    // Bodies: where the ship believes they are.
    for (const b of snapshot.world.bodies) {
      bodyRadius.set(b.id, b.radius);
      const mark = bodyMark(b.id, b.name);
      const p = toScene(b.position, tmp3);
      const h = tmp.copy(p).applyMatrix4(toHolo);
      const inVolume = h.length() + b.radius * Sh * 0.35 < Rh;
      mark.g.visible = inVolume;
      mark.marker.visible = !inVolume;
      if (inVolume) {
        mark.g.position.copy(p);
        if (mark.radius !== b.radius) {
          mark.radius = b.radius;
          mark.wire.scale.setScalar(b.radius);
          setFat(mark.equator, arcXZ(b.radius, 0, TAU, 72));
          mark.tag.position.set(0, b.radius * 1.15, 0);
        }
        if (Math.abs(p.y - planeY) * Sh > 0.004) stalkFlat.push(p.x, p.y, p.z, p.x, planeY, p.z);
        pickables.push({ id: b.id, p: h.clone() });
      } else {
        const a = Math.atan2(h.x, -h.z);
        mark.marker.position.set(Math.sin(a) * Rh * 1.03, 0, -Math.cos(a) * Rh * 1.03);
        mark.marker.rotation.y = -a;
        const elevation = h.y / Math.max(1e-6, Math.hypot(h.x, h.z));
        const surface = distance(b.position, ship.position) - b.radius;
        setTag(
          mark.markerTag,
          `${b.name.toUpperCase()} ${formatRange(surface)}${elevation > 0.12 ? ' ▲' : elevation < -0.12 ? ' ▼' : ''}`,
        );
      }
    }
    for (const [id, mark] of bodyMarks)
      if (!snapshot.world.bodies.some((b) => b.id === id))
        mark.g.visible = mark.marker.visible = false;

    // Rocks: tracked ones bright; ones only seen dim, with their doubt. Never-seen ones are not
    // in the believed world and are not drawn.
    let nTracked = 0;
    let nSeen = 0;
    const minRock = holoSize.rockMin / Sh;
    for (const a of snapshot.world.asteroids) {
      const p = toScene(a.position, tmp3);
      const h = tmp.copy(p).applyMatrix4(toHolo);
      if (h.length() >= Rh * 0.97) continue;
      const r = Math.max(a.radius, minRock);
      let seed = 0;
      for (let k = 0; k < a.id.length; k++) seed = (seed * 31 + a.id.charCodeAt(k)) % 6283;
      Q.setFromAxisAngle(tmp2.set(0.3, 1, 0.2).normalize(), seed / 1000 + time * 0.05);
      M.compose(p, Q, S.set(r, r, r));
      if (a.tracked && nTracked < MAX_ROCKS) rocksTracked.setMatrixAt(nTracked++, M);
      else if (!a.tracked && nSeen < MAX_ROCKS) {
        rocksSeen.setMatrixAt(nSeen++, M);
        const doubtRadius = 2 * sigmaMajor(a.positionCov);
        if (doubtRadius > r * 1.2) {
          const ringFlat = arcXZ(doubtRadius, 0, TAU, 20, p.y, p.x, p.z);
          for (let k = 0; k + 5 < ringFlat.length; k += 3)
            doubtFlat.push(
              ringFlat[k]!,
              ringFlat[k + 1]!,
              ringFlat[k + 2]!,
              ringFlat[k + 3]!,
              ringFlat[k + 4]!,
              ringFlat[k + 5]!,
            );
        }
      }
      if (Math.abs(p.y - planeY) * Sh > 0.004) stalkFlat.push(p.x, p.y, p.z, p.x, planeY, p.z);
      pickables.push({ id: a.id, p: h.clone() });
    }
    rocksTracked.count = nTracked;
    rocksSeen.count = nSeen;
    rocksTracked.instanceMatrix.needsUpdate = true;
    rocksSeen.instanceMatrix.needsUpdate = true;
    setThin(stalks, stalkFlat);
    setThin(doubt, doubtFlat);

    // Fields: only what the ship perceives, drawn by the encounter's own plugin.
    for (const field of snapshot.world.fields) {
      if (!field.detected) continue;
      let entry = fieldViews.get(field.id);
      if (!entry) {
        const factory = fieldViewFor(field.kind);
        if (!factory) continue;
        const fieldGroup = new Group();
        trans.add(fieldGroup);
        entry = { view: factory({ group: fieldGroup, lines: linesE }), group: fieldGroup };
        fieldViews.set(field.id, entry);
      }
      entry.view.update({ field, snapshot, scale: Sh, radius: Rh, inside, dt, time });
    }
    for (const [id, entry] of fieldViews) {
      if (snapshot.world.fields.some((f) => f.id === id && f.detected)) continue;
      entry.view.dispose();
      trans.remove(entry.group);
      fieldViews.delete(id);
    }

    // The object the player has chosen.
    const chosen = frame.selected
      ? (snapshot.world.asteroids.find((a) => a.id === frame.selected) ??
        snapshot.world.bodies.find((b) => b.id === frame.selected))
      : undefined;
    const chosenHolo = chosen ? toScene(chosen.position, tmp3).applyMatrix4(toHolo) : null;
    const showChosen = chosen !== undefined && chosenHolo !== null && chosenHolo.length() < Rh;
    selectRing.visible = selectTag.visible = showChosen;
    if (showChosen && chosen && chosenHolo) {
      selectRing.position.copy(chosenHolo);
      selectRing.scale.setScalar(
        Math.max(1, (chosen.radius * Sh * 1.6) / holoSize.selection),
      );
      selectTag.position.copy(chosenHolo).y -= holoSize.selection * 1.4;
      const closing = Math.hypot(
        chosen.velocity.x - ship.velocity.x,
        chosen.velocity.y - ship.velocity.y,
        ((chosen.velocity as GameVec).z ?? 0) - ((ship.velocity as GameVec).z ?? 0),
      );
      const surface = distance(chosen.position, ship.position) - chosen.radius;
      setTag(
        selectTag,
        `${chosen.id.toUpperCase()}  ${formatRange(surface)}  ${closing.toFixed(1)} m/s  ` +
          `${chosen.tracked ? 'TRACKED' : `SEEN ±${formatRange(sigmaMajor(chosen.positionCov))}`}`,
      );
    }

    // Paths. The trail's newest stretch follows the ship every frame; the rest, and everything
    // clipped to the volume, is rebuilt when it changes and a few times a second as the ship moves.
    reclip -= dt;
    const forecasts = snapshot.forecasts;
    const latest = forecasts[forecasts.length - 1];
    const previous = forecasts.length > 1 ? forecasts[forecasts.length - 2] : undefined;
    const fKey = `${latest?.id ?? ''}|${previous?.id ?? ''}`;
    const pKey = frame.preview ? `${frame.preview.id}|${frame.preview.samples.length}` : '';
    const cKey = snapshot.compare
      ? `${snapshot.compare[0].attemptId}|${snapshot.compare[1].attemptId}`
      : '';
    const stale = reclip <= 0;
    if (stale) reclip = RECLIP;
    if (stale || trailCount !== snapshot.trail.length) {
      trailCount = snapshot.trail.length;
      trail.set(snapshot.trail.map((p) => p.position));
    }
    const lastTrail = snapshot.trail[snapshot.trail.length - 1];
    trailHead.visible = lastTrail !== undefined && insideGame(lastTrail.position);
    if (trailHead.visible && lastTrail) {
      const a = toScene(lastTrail.position, tmp2);
      setFat(trailHead, [a.x, a.y, a.z, shipScene.x, shipScene.y, shipScene.z]);
    }
    if (stale || fKey !== forecastKey) {
      forecastKey = fKey;
      drawForecast(latest, snapshot.t, frame.clearance);
      forecastOld.set(previous ? previous.samples.map((s) => s.position) : []);
    }
    if (stale || pKey !== previewKey) {
      previewKey = pKey;
      previewPath.set(frame.preview ? frame.preview.samples.map((s) => s.position) : []);
    }
    if (stale || cKey !== compareKey) {
      compareKey = cKey;
      drawCompare(snapshot);
    }
    if (stale) drawObjectives(snapshot.objectives, snapshot);
    placeApproaches(latest, snapshot.t);

    // Forecast-now link: from the ship to where the forecast put it at this moment.
    const expected = latest ? forecastAt(latest, snapshot.t) : null;
    latestMiss = null;
    nowLink.visible = nowTag.visible = false;
    if (expected) {
      const miss = distance(expected.p, ship.position);
      const sigma = Math.hypot(expected.sigma, sigmaMajor(ship.positionCov));
      latestMiss = { metres: miss, sigmas: sigma > 0 ? miss / sigma : 0 };
      const e = toScene(expected.p, tmp2);
      if (miss * Sh > 0.006 && inside(e)) {
        setFat(nowLink, [shipScene.x, shipScene.y, shipScene.z, e.x, e.y, e.z]);
        nowLink.visible = nowTag.visible = true;
        nowTag.position.copy(e);
        setTag(nowTag, `Δ ${formatRange(miss)}  ${latestMiss.sigmas.toFixed(1)}σ`);
        nowTag.element.className = `rx-tag ${latestMiss.sigmas > 2 ? 'caution' : 'fc'}`;
      }
    }

    // ---- Ship marks ------------------------------------------------------------------------
    shipG.quaternion.copy(shipQ); // with heading-up this undoes the display turn: nose away
    model.setConfig(ship.configuration);
    model.update(dt);
    const com = bodyToDrawing(snapshot.ship.centerOfMass, tmp2).multiplyScalar(holoSize.shipScale);
    model.group.position.copy(com).multiplyScalar(-1);
    model.group.visible = ring.visible = velocity.visible = cones.visible = !chart;
    symbol.visible = chart;

    const speed = length(ship.velocity);
    if (speed > 1e-3 && !chart) {
      const L = clamp(
        holoSize.velocityMin + Math.log10(1 + speed) * 0.12,
        holoSize.velocityMin,
        holoSize.velocityMax,
      );
      const v = toScene(ship.velocity, tmp2).multiplyScalar(L / speed);
      const side = tmp3.copy(v).cross(S.set(0, 1, 0));
      if (side.lengthSq() < 1e-12) side.set(1, 0, 0);
      side.normalize().multiplyScalar(0.016);
      const bx = v.x * 0.86;
      const by = v.y * 0.86;
      const bz = v.z * 0.86;
      setFat(velocity, [
        0, 0, 0, v.x, v.y, v.z,
        bx + side.x, by + side.y, bz + side.z,
        v.x, v.y, v.z,
        bx - side.x, by - side.y, bz - side.z,
      ]);
    } else velocity.visible = false;

    const rates = turnRates(ship);
    const yaw = clamp(-(rates.yaw * 40 + (frame.hands?.yaw ?? 0) * 0.3), -1.6, 1.6);
    yawArc.visible = !chart && Math.abs(yaw) > 0.02;
    if (yawArc.visible) setFat(yawArc, arcXZ(RING, 0, yaw, 24));
    const pitch = clamp(rates.pitch * 40 + (frame.hands?.pitch ?? 0) * 0.3, -1.2, 1.2);
    pitchArc.visible = !chart && Math.abs(pitch) > 0.02;
    if (pitchArc.visible) {
      const arc: number[] = [];
      for (let i = 0; i <= 16; i++) {
        const a = (pitch * i) / 16;
        arc.push(0, Math.sin(a) * RING, -Math.cos(a) * RING);
      }
      setFat(pitchArc, arc);
    }

    // Sensor coverage: a cone from the ship along each sector's axis, as far as fits.
    if (!chart) {
      const flat: number[] = [];
      for (const s of sensed) {
        const axis = s.axis;
        // As far as the sensor reaches, but never out of the projection volume: the distance
        // from the ship to the volume's edge along the cone, less the cone's own spread.
        const half = Math.min(s.halfAngle, 1.4);
        const along = tmp.copy(axis).applyQuaternion(rot.quaternion);
        const b = along.dot(rot.position);
        const toEdge = -b + Math.sqrt(Math.max(0, b * b - rot.position.lengthSq() + (Rh * 0.97) ** 2));
        const reach = Math.min(s.range * Sh, toEdge * Math.cos(half) * 0.92);
        const r = Math.tan(half) * reach;
        const u = tmp2.set(0, 1, 0).cross(axis);
        if (u.lengthSq() < 1e-12) u.set(1, 0, 0);
        u.normalize();
        const v = tmp3.copy(axis).cross(u).normalize();
        const at = (a: number): [number, number, number] => [
          axis.x * reach + (u.x * Math.cos(a) + v.x * Math.sin(a)) * r,
          axis.y * reach + (u.y * Math.cos(a) + v.y * Math.sin(a)) * r,
          axis.z * reach + (u.z * Math.cos(a) + v.z * Math.sin(a)) * r,
        ];
        for (let k = 0; k < 4; k++) flat.push(0, 0, 0, ...at((TAU * k) / 4 + 0.785));
        for (let k = 0; k < 32; k++) flat.push(...at((TAU * k) / 32), ...at((TAU * (k + 1)) / 32));
      }
      setThin(cones, flat);
    }

    // Thrust at the points of application: chevrons down each plume, and the line of action.
    const chevrons: number[] = [];
    const axes: number[] = [];
    for (const tick of snapshot.ship.thrust) {
      if (!(tick.magnitude > 0)) continue;
      const o = bodyToDrawing(tick.point, new Vector3())
        .multiplyScalar(holoSize.shipScale)
        .sub(com);
      const force = bodyToDrawing(tick.direction, new Vector3()).normalize();
      const plume = force.clone().multiplyScalar(-1);
      const across = new Vector3(0, 1, 0).cross(plume);
      if (across.lengthSq() < 1e-12) across.set(1, 0, 0);
      across.normalize().multiplyScalar(holoSize.chevron);
      for (const k of [0.04, 0.075, 0.11])
        for (const sign of [1, -1])
          chevrons.push(
            o.x + plume.x * k + across.x * sign,
            o.y + plume.y * k + across.y * sign,
            o.z + plume.z * k + across.z * sign,
            o.x + plume.x * (k + 0.026),
            o.y + plume.y * (k + 0.026),
            o.z + plume.z * (k + 0.026),
          );
      axes.push(
        o.x - force.x * 0.2,
        o.y - force.y * 0.2,
        o.z - force.z * 0.2,
        o.x + force.x * 0.7,
        o.y + force.y * 0.7,
        o.z + force.z * 0.7,
      );
    }
    thrustMarks.visible = thrustAxis.visible = !chart && chevrons.length > 0;
    if (chevrons.length) {
      setFatSegs(thrustMarks, chevrons);
      setFatSegs(thrustAxis, axes);
    }

    // True hull, at true scale, where the ship is.
    const outline = hullOutline(snapshot.ship);
    const key = `${ship.configuration}|${outline.length}`;
    if (key !== hullKey) {
      hullKey = key;
      if (hullLine) {
        hullG.remove(hullLine);
        hullLine.geometry.dispose();
      }
      const flat: number[] = [];
      for (const p of [...outline, ...(outline[0] ? [outline[0]] : [])]) {
        const d = bodyToDrawing(p, tmp2).sub(bodyToDrawing(snapshot.ship.centerOfMass, tmp3));
        flat.push(d.x, d.y, d.z);
      }
      hullLine = linesE.fat(flat, holoLines.trueHull, { order: order.shipMarks });
      hullG.add(hullLine);
    }
    hullG.position.copy(shipScene);
    hullG.quaternion.copy(shipQ);
  }

  return {
    group,
    update,
    range: () => range,
    setRange(metres) {
      range = clamp(metres, RANGE_MIN, RANGE_MAX);
      reclip = 0;
    },
    headingUp: () => headingUp,
    setHeadingUp(on) {
      headingUp = on;
      reclip = 0;
    },
    setChart(on) {
      chart = on;
      reclip = 0;
    },
    pick(ndcX, ndcY, camera, viewportHeight) {
      group.updateWorldMatrix(true, false);
      let best: string | null = null;
      let bestPx = 22;
      for (const item of pickables) {
        tmp.copy(item.p).applyMatrix4(group.matrixWorld).project(camera);
        if (tmp.z > 1) continue;
        const px = Math.hypot(tmp.x - ndcX, tmp.y - ndcY) * (viewportHeight / 2);
        if (px < bestPx) {
          bestPx = px;
          best = item.id;
        }
      }
      return best;
    },
    alerts: () => latestAlerts,
    miss: () => latestMiss,
    setResolution(width, height) {
      linesH.setResolution(width, height);
      linesE.setResolution(width, height);
    },
    setPixelsPerUnit(pixels) {
      pixelsPerMetre = pixels;
      linesH.setPixelsPerUnit(pixels);
    },
    dispose() {
      for (const entry of fieldViews.values()) entry.view.dispose();
      fieldViews.clear();
      linesH.dispose();
      linesE.dispose();
      model.dispose();
      planeMat.dispose();
      envelopeMat.dispose();
      for (const p of [
        trail,
        forecastPath,
        forecastOld,
        previewPath,
        compareA,
        compareB,
        compareForecastA,
        compareForecastB,
        ...objectPaths,
      ])
        p.dispose();
      rockGeo.dispose();
      unitSphere.dispose();
    },
  };
}
