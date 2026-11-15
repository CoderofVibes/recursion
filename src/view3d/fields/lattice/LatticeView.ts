/** A16: instruments make invisible structure legible, one supported fragment at a time. */
import { Group } from 'three';
import type { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { colour, dash, holoLines, line, motion, opacity, render } from '../../../theme/index.ts';
import type { LineStyle } from '../../../theme/index.ts';
import type { FieldView, FieldViewContext, FieldViewFrame } from '../../fieldViews.ts';
import { label, setFatSegs, setTag, setThin, thin } from '../../gfx.ts';
import { coverageState, readLatticeVisual } from './data.ts';
import {
  boxEdges,
  clipSegments,
  revealedSegments,
  scenePoint,
  uncertaintyRings,
  unknownHatch,
} from './geometry.ts';

const CORE: LineStyle = {
  colour: colour.latticeCore,
  width: line.traceSecondary,
  opacity: opacity.hullEdges,
};
const HALO: LineStyle = {
  colour: colour.lattice,
  width: line.measured + line.connector,
  opacity: render.lattice.sheetGain,
};
const OLD: LineStyle = {
  colour: colour.lattice,
  width: line.previousAttempt,
  opacity: opacity.priorEvidence,
  dash: dash.envelopeEdge,
};
const ACQUISITION: LineStyle = {
  colour: colour.blackbox,
  width: line.connector,
  opacity: opacity.connector,
  dash: dash.connector,
};

/** Does not call latticeMaterial: its periodic sheet would invent unobserved neighbours. */
export function makeLatticeView({ group, lines }: FieldViewContext): FieldView {
  const root = new Group();
  root.name = 'lattice-evidence';
  group.add(root);
  const core = lines.fatSegs([], CORE, { order: render.renderOrder.abovePlane });
  const halo = lines.fatSegs([], HALO, { order: render.renderOrder.envelope });
  const old = lines.fatSegs([], OLD, { order: render.renderOrder.abovePlane });
  const acquisition = lines.fatSegs([], ACQUISITION, { order: render.renderOrder.abovePlane });
  const unknown = thin([], colour.inkFaint, opacity.unknownHatch, render.renderOrder.envelope);
  unknown.name = 'unresolved-volume';
  const boundary = thin([], colour.inkDim, opacity.coverageEdge, render.renderOrder.onPlane);
  const measured = thin([], colour.coverage, opacity.coverageEdge, render.renderOrder.onPlane);
  const uncertainty = thin([], colour.lattice, opacity.envelopeEdge, render.renderOrder.envelope);
  const threat = lines.fatSegs([], holoLines.approachRingWarning, {
    order: render.renderOrder.shipMarks,
  });
  const status = label('UNRESOLVED', 'dim');
  const component = label('', 'dim');
  root.add(
    unknown,
    boundary,
    measured,
    uncertainty,
    halo,
    core,
    old,
    acquisition,
    threat,
    status,
    component,
  );
  const firstSeen = new Map<string, number>();
  let context = '';
  let revision = '';
  let lastGeometry = -Infinity;

  const set = (target: LineSegments2, vertices: number[]): void => {
    target.visible = vertices.length > 0;
    if (target.visible) setFatSegs(target, vertices);
  };

  function update(frame: FieldViewFrame): void {
    const data = readLatticeVisual(frame.field.visual);
    root.visible = data !== null && frame.field.detected;
    if (!data) return;
    const key = `${data.attemptId}/${data.frameId}`;
    if (key !== context) {
      firstSeen.clear();
      revision = '';
      context = key;
    }
    const now = frame.snapshot.t;
    const clip = (flat: readonly number[]) =>
      clipSegments(flat, frame.snapshot.world.ship.position, frame.radius / frame.scale);
    const present = new Set(data.strands.map((strand) => strand.id));
    for (const id of firstSeen.keys()) if (!present.has(id)) firstSeen.delete(id);
    const currentRevision = `${data.updatedAt}:${data.strands.length}:${data.coverage.length}:${data.enabled}`;
    let animating = false;
    const fresh: number[] = [];
    const stale: number[] = [];
    const halos: number[] = [];
    const pulses: number[] = [];
    const rings: number[] = [];
    const jointVertices = new Set<string>();
    let supported = 0;
    for (const strand of data.strands) {
      if (strand.observedTo > now) continue;
      const observation = strand.id;
      if (!firstSeen.has(observation)) firstSeen.set(observation, frame.time);
      const progress = Math.min(
        1,
        (frame.time - firstSeen.get(observation)!) / (motion.settle / 1000),
      );
      animating ||= progress < 1;
      if (strand.validUntil < now) {
        stale.push(...revealedSegments(strand.points, 1));
        continue;
      }
      supported++;
      const positions = revealedSegments(strand.points, progress);
      fresh.push(...positions);
      halos.push(...positions);
      if (progress < 1) pulses.push(...positions.slice(-6));
      // S17 joint bound is three sigma, not reduced by how many fragments are displayed.
      for (const point of strand.points) {
        const vertex = `${point.x}/${point.y}/${point.z}/${strand.sigmaM}`;
        if (!jointVertices.has(vertex)) {
          jointVertices.add(vertex);
          rings.push(...uncertaintyRings([point], 3 * strand.sigmaM));
        }
      }
    }
    // Rebuild on evidence, at a modest cadence for expiry, and through the one-shot reveal.
    if (
      currentRevision !== revision ||
      animating ||
      frame.time - lastGeometry >= motion.base / 1000
    ) {
      set(core, clip(fresh));
      set(halo, clip(halos));
      set(old, clip(stale));
      set(acquisition, clip(pulses));
      setThin(uncertainty, clip(rings));
      uncertainty.visible = rings.length > 0;
      const hatch = clip(unknownHatch(data, now));
      setThin(unknown, hatch);
      unknown.visible = hatch.length > 0;
      setThin(boundary, clip(boxEdges(data.requestedVolume)));
      const patches = data.coverage
        .filter((p) => coverageState(p, now) === 'clear-supported')
        .flatMap(boxEdges);
      setThin(measured, clip(patches));
      measured.visible = patches.length > 0;
      revision = currentRevision;
      lastGeometry = frame.time;
    }
    // Confidence is geometry width; low processing power never makes hazardous space vanish.
    const current = data.coverage.filter((p) => coverageState(p, now) === 'clear-supported').length;
    setTag(
      status,
      data.limitation ??
        (supported > 0
          ? `${supported} FRAGMENTS · ${current > 0 ? `${current} COVERED PATCHES` : 'OPENINGS UNRESOLVED'}`
          : data.enabled
            ? 'RECORDING · DEPTH UNRESOLVED'
            : 'RECORDING STOPPED · SPACE UNRESOLVED'),
    );
    const c = data.requestedVolume.center;
    const h = data.requestedVolume.halfSize;
    status.position.set(...scenePoint({ x: c.x, y: c.y, z: c.z + h.z }));
    status.visible = frame.inside(status.position);
    const t = data.threat;
    threat.visible = component.visible =
      t !== undefined && t.observedTo <= now && t.validUntil >= now;
    if (t && threat.visible) {
      set(
        threat,
        clip(uncertaintyRings([t.position], Math.max(t.sigmaM * 3, Math.abs(t.marginM)))),
      );
      threat.material.color.set(t.marginM <= 0 ? colour.warning : colour.caution);
      component.position.set(...scenePoint(t.position));
      setTag(
        component,
        `${t.marginM <= 0 ? '■' : '▲'} ${t.name.toUpperCase()} · ${t.marginM.toFixed(1)} m ± ${t.sigmaM.toFixed(1)}`,
      );
      component.visible = frame.inside(component.position);
    }
  }
  return {
    update,
    dispose() {
      for (const object of [core, halo, old, acquisition, threat]) {
        object.geometry.dispose();
        object.material.dispose();
      }
      for (const object of [unknown, boundary, measured, uncertainty]) {
        object.geometry.dispose();
        object.material.dispose();
      }
      group.remove(root);
      status.removeFromParent();
      component.removeFromParent();
      firstSeen.clear();
    },
  };
}
