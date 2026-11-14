/**
 * Phenomena the ship reconstructs rather than sees: the lattice (brief §6) and wells (brief §7).
 * Both are fictional, both are violet, and neither ever appears in the window.
 * Owner: 1E, the UI lane. Encounter sections place the geometry; these decide how it looks.
 */
import { AdditiveBlending, Color, DoubleSide, LineBasicMaterial, ShaderMaterial } from 'three';
import { colour, hex } from '../colour.ts';
import { render } from '../render.ts';

export interface LatticeMaterialOptions {
  /** Size of one diamond of the mesh, world units. */
  readonly cell?: number;
  /** Reconstruction quality, 0 (barely powered: thick, broken, noisy) to 1 (sharp). */
  readonly quality?: number;
}

/**
 * A sheet of the lattice: bright along the strands, fading to clear at the centre of each
 * opening. Put it on a plane whose local x and y span the sheet. Drive `uniforms.uQuality` from
 * the processing power allocated to the reconstruction and `uniforms.uTime` from the clock.
 */
export function latticeMaterial({
  cell = 9,
  quality = 1,
}: LatticeMaterialOptions = {}): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    uniforms: {
      uCell: { value: cell },
      uQuality: { value: quality },
      uTime: { value: 0 },
      uStrand: { value: render.lattice.strandWidth },
      uGain: { value: render.lattice.sheetGain },
      cStrand: { value: new Color(hex(colour.lattice)) },
      cCore: { value: new Color(hex(colour.latticeCore)) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vSheet;
      void main() {
        vSheet = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uCell, uQuality, uTime, uStrand, uGain;
      uniform vec3 cStrand, cCore;
      varying vec2 vSheet;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec2 p = vSheet / uCell;
        vec2 q = vec2(p.x + p.y, p.x - p.y);
        vec2 f = 0.5 - abs(fract(q) - 0.5);
        float d = min(f.x, f.y) * uCell;
        // Low quality: strands three times as thick, with whole patches dropping out.
        float intensity = exp(-d / (uStrand * mix(3.0, 1.0, uQuality)));
        float patch = step(0.45, hash(floor(vSheet / (uCell * 0.12)) + floor(uTime * 9.0)));
        intensity *= mix(0.35 + 0.65 * patch, 1.0, uQuality);
        vec3 col = mix(cStrand, cCore, smoothstep(0.55, 1.0, intensity));
        gl_FragColor = vec4(col * intensity * uGain * mix(1.5, 3.5, uQuality), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/** Lines of a well's funnel. Colour each vertex with `wellColour` so the funnel fades with depth. */
export function wellLineMaterial(): LineBasicMaterial {
  return new LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}

/**
 * Colour of a point on a well's funnel. `depth` runs from 0 at the mouth (on the flight plane)
 * to 1 at the throat; the funnel dims as it descends.
 */
export function wellColour(depth: number, out: Color = new Color()): Color {
  const k = 1 - render.well.depthFalloff * Math.min(1, Math.max(0, depth));
  return out.set(hex(colour.well)).multiplyScalar(k);
}
