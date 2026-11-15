/** The funnel is an instrument glyph, not the physical influence shape or a window object. */
import { BufferGeometry, Float32BufferAttribute, LineSegments } from 'three';
import { lineStyles, opacity, render, envelopeStyle } from '../../../theme/index.ts';
import { wellColour, wellLineMaterial } from '../../../theme/three/index.ts';
import { toScene } from '../../adapter.ts';
import type { FieldViewFactory } from '../../fieldViews.ts';
import { setFatSegs } from '../../gfx.ts';
import { readWellVisual, wellDisplayState, WELL_VIEW_KIND, type WellVisual } from './evidence.ts';

export { readWellVisual, wellDisplayState, WELL_VIEW_KIND } from './evidence.ts';
export type { WellVisual, WellResponseEvidence, WellEstimate } from './evidence.ts';

/** Three orthogonal great circles: a spherical influence, even when the glyph looks conical. */
function sphereSegments(radius: number): number[] {
  const points: number[] = [];
  for (let axis = 0; axis < 3; axis++) {
    for (let i = 0; i < render.well.rings; i++) {
      for (const j of [i, i + 1]) {
        const angle = (j / render.well.rings) * Math.PI * 2;
        const a = radius * Math.cos(angle);
        const b = radius * Math.sin(angle);
        if (axis === 0) points.push(0, a, b);
        else if (axis === 1) points.push(a, 0, b);
        else points.push(a, b, 0);
      }
    }
  }
  return points;
}

/** Glyph dimensions come from the estimated transition width and influence radius. */
function funnelGeometry(v: WellVisual): BufferGeometry {
  const positions: number[] = [];
  const colours: number[] = [];
  const mouth = v.geometry.outerRadius.value - v.geometry.innerRadius.value;
  const depth = v.geometry.outerRadius.value;
  const append = (fraction: number, angle: number) => {
    const radius = mouth * (1 - fraction) ** 2;
    positions.push(radius * Math.cos(angle), -depth * fraction, radius * Math.sin(angle));
    const c = wellColour(fraction);
    colours.push(c.r, c.g, c.b);
  };
  for (let i = 0; i < render.well.rings; i++) {
    const fraction = i / render.well.rings;
    for (let j = 0; j < render.well.meridians; j++) {
      const angle = (j / render.well.meridians) * Math.PI * 2;
      append(fraction, angle);
      append(fraction, ((j + 1) / render.well.meridians) * Math.PI * 2);
      append(fraction, angle);
      append((i + 1) / render.well.rings, angle);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colours, 3));
  return geometry;
}

export const makeWellView: FieldViewFactory = ({ group, lines }) => {
  const bounds = lines.fatSegs([], lineStyles.wellBoundary, { order: render.renderOrder.envelope });
  const funnel = new LineSegments(new BufferGeometry(), wellLineMaterial());
  funnel.renderOrder = render.renderOrder.belowPlane;
  funnel.frustumCulled = false;
  group.add(bounds, funnel);
  let cached = '';
  return {
    update(frame) {
      const visual = readWellVisual(frame.field);
      const state = wellDisplayState(visual, frame.snapshot.t);
      bounds.visible = state === 'current' || state === 'stale';
      funnel.visible = state === 'current';
      if (!visual || !bounds.visible) return;
      const center = toScene(visual.geometry.center);
      bounds.position.copy(center);
      funnel.position.copy(center);
      bounds.material.opacity =
        state === 'stale' ? opacity.staleInstrument : lineStyles.wellBoundary.opacity;
      const key = JSON.stringify(visual.geometry);
      if (key === cached) return;
      cached = key;
      const { innerRadius, outerRadius, centerSigma } = visual.geometry;
      // Bounds include both local radius error and common centre error; no clear-space claim.
      const inner = Math.max(
        0,
        innerRadius.value - envelopeStyle.sigmas * (innerRadius.sigma + centerSigma),
      );
      const outer = outerRadius.value + envelopeStyle.sigmas * (outerRadius.sigma + centerSigma);
      setFatSegs(bounds, [...sphereSegments(inner), ...sphereSegments(outer)]);
      funnel.geometry.dispose();
      funnel.geometry = funnelGeometry(visual);
    },
    dispose() {
      group.remove(bounds, funnel);
      bounds.geometry.dispose();
      bounds.material.dispose();
      funnel.geometry.dispose();
      funnel.material.dispose();
    },
  };
};

export async function registerWellView(): Promise<void> {
  const { registerFieldView } = await import('../../fieldViews.ts');
  registerFieldView(WELL_VIEW_KIND, makeWellView);
}

// Vite hoists the registry's eager glob imports above its const initialization. Complete the
// import cycle before registering. A dynamic import waits for registry initialization even
// under asynchronous module loaders. The flight view picks up newly registered views each frame.
void registerWellView();
