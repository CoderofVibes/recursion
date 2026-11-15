/** The trailer's staged map, drawn with 3B's funnel view and the theme's quieter body wire. */
import { LineSegments } from 'three';
import type { LineBasicMaterial } from 'three';
import { holoSize, holoWire } from '../../../theme/index.ts';
import { HOLO } from '../../../view3d/room/layout.ts';
import { makeFunnelView, readWellFunnelVisual } from '../../../view3d/fields/wells/funnel.ts';
import type { FieldViewFactory } from '../../../view3d/fieldViews.ts';

export const makeStagedWell: FieldViewFactory = (context) => {
  const view = makeFunnelView(context);
  const prepared = new WeakSet<LineBasicMaterial>();
  return {
    update(frame) {
      const field = { ...frame.field, kind: 'inverse-well' };
      view.update({ ...frame, field });
      const brightness = readWellFunnelVisual(field)?.brightness ?? 0;
      context.group.traverse((object) => {
        // Zero-uncertainty truth staging needs no second coincident boundary at each ring.
        if (object.type === 'LineSegments2') object.visible = false;
        if (object instanceof LineSegments) {
          const material = object.material as LineBasicMaterial;
          material.opacity = holoWire.body * brightness;
          if (!prepared.has(material)) {
            prepared.add(material);
            material.onBeforeCompile = (shader) => {
              shader.vertexShader =
                'varying vec3 tvWorld;\n' +
                shader.vertexShader.replace(
                  '#include <begin_vertex>',
                  '#include <begin_vertex>\n tvWorld = (modelMatrix * vec4(position, 1.0)).xyz;',
                );
              shader.fragmentShader =
                'varying vec3 tvWorld;\n' +
                shader.fragmentShader.replace(
                  '#include <clipping_planes_fragment>',
                  `#include <clipping_planes_fragment>\n if (distance(tvWorld, vec3(${HOLO.x.toFixed(6)}, ${HOLO.y.toFixed(6)}, ${HOLO.z.toFixed(6)})) > ${holoSize.radius.toFixed(6)}) discard;`,
                );
            };
            material.customProgramCacheKey = () => 'tv-funnel-volume';
            material.needsUpdate = true;
          }
        }
      });
    },
    dispose: () => view.dispose(),
  };
};
