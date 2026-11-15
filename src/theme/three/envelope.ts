/**
 * The forecast's uncertainty envelope: a ribbon whose half-width is 2σ (DECISIONS P10).
 * Sampled stretches are a plain tint. Extrapolated stretches are fainter and hatched. Stretches
 * inside an adopted rule's validated span (A5) sit between the two: a more open hatch.
 * Owner: 1E, the UI lane.
 */
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  ShaderMaterial,
} from 'three';
import { hex } from '../colour.ts';
import { envelopeStyle } from './styles.ts';

/** One station along the forecast path. */
export interface EnvelopeStation {
  /** Centre of the envelope, world space. */
  readonly position: readonly [number, number, number];
  /** Half-width here, world units: `envelopeStyle.sigmas` times the across-track sigma. */
  readonly halfWidth: number;
  readonly extrapolating?: boolean;
  readonly validated?: boolean;
}

const sub = (a: readonly number[], b: readonly number[]): [number, number, number] => [
  (a[0] ?? 0) - (b[0] ?? 0),
  (a[1] ?? 0) - (b[1] ?? 0),
  (a[2] ?? 0) - (b[2] ?? 0),
];
const cross = (a: readonly number[], b: readonly number[]): [number, number, number] => [
  (a[1] ?? 0) * (b[2] ?? 0) - (a[2] ?? 0) * (b[1] ?? 0),
  (a[2] ?? 0) * (b[0] ?? 0) - (a[0] ?? 0) * (b[2] ?? 0),
  (a[0] ?? 0) * (b[1] ?? 0) - (a[1] ?? 0) * (b[0] ?? 0),
];

/**
 * Ribbon geometry for `envelopeMaterial`. The ribbon lies in the plane whose normal is `up`
 * (the flight plane by default) and widens to each station's half-width.
 * Attributes: `position`, `aAcross` (-1 at one edge, +1 at the other), `aKind` (0 sampled,
 * 1 extrapolated, 2 validated).
 */
export function envelopeGeometry(
  stations: readonly EnvelopeStation[],
  up: readonly [number, number, number] = [0, 1, 0],
): BufferGeometry {
  const n = stations.length;
  const position: number[] = [];
  const across: number[] = [];
  const kind: number[] = [];
  const index: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = stations[i];
    const a = stations[Math.max(0, i - 1)];
    const b = stations[Math.min(n - 1, i + 1)];
    if (!s || !a || !b) continue;
    const side = cross(sub(b.position, a.position), up);
    const len = Math.hypot(side[0], side[1], side[2]) || 1;
    const k = s.extrapolating ? (s.validated ? 2 : 1) : 0;
    for (const sign of [1, -1]) {
      position.push(
        s.position[0] + (side[0] / len) * s.halfWidth * sign,
        s.position[1] + (side[1] / len) * s.halfWidth * sign,
        s.position[2] + (side[2] / len) * s.halfWidth * sign,
      );
      across.push(sign);
      kind.push(k);
    }
    if (i + 1 < n) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(position, 3));
  g.setAttribute('aAcross', new Float32BufferAttribute(across, 1));
  g.setAttribute('aKind', new Float32BufferAttribute(kind, 1));
  g.setIndex(index);
  return g;
}

export interface EnvelopeMaterialOptions {
  /** Multiplies the token hatch spacing, to suit the encounter's scale. Default 1. */
  readonly hatchScale?: number;
}

/** Material for `envelopeGeometry`. Set `uniforms.uHatchScale.value` when the view's scale changes. */
export function envelopeMaterial({ hatchScale = 1 }: EnvelopeMaterialOptions = {}): ShaderMaterial {
  const s = envelopeStyle;
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    uniforms: {
      uColour: { value: new Color(hex(s.colour)) },
      uHatchScale: { value: hatchScale },
      uBody: { value: [s.body, s.extrapolatedBody, s.validatedBody] },
      uEdge: { value: [s.edge, s.extrapolatedEdge, s.validatedEdge] },
      uHatch: { value: [0, s.extrapolatedHatch, s.validatedHatch] },
      uSpacing: { value: [1, s.hatchSpacing, s.validatedHatchSpacing] },
    },
    vertexShader: /* glsl */ `
      attribute float aAcross;
      attribute float aKind;
      varying float vAcross;
      varying float vKind;
      varying vec3 vWorld;
      void main() {
        vAcross = aAcross;
        vKind = aKind;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColour;
      uniform float uHatchScale;
      uniform float uBody[3];
      uniform float uEdge[3];
      uniform float uHatch[3];
      uniform float uSpacing[3];
      varying float vAcross;
      varying float vKind;
      varying vec3 vWorld;
      void main() {
        int k = int(vKind + 0.5);
        float edge = smoothstep(1.0 - fwidth(vAcross) * 2.5, 1.0, abs(vAcross));
        float sp = uSpacing[k] * uHatchScale;
        float h = (vWorld.x - vWorld.z) / sp;
        float line = 1.0 - smoothstep(0.0, fwidth(h) * 1.5, abs(fract(h) - 0.5) - 0.18);
        float a = uBody[k] + uHatch[k] * line * (1.0 - edge) + uEdge[k] * edge;
        gl_FragColor = vec4(uColour * a, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
