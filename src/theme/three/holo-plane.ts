/**
 * The hologram's reference plane (DECISIONS A8, A11): the level plane through the ship inside the
 * projection volume. Same reading as the flight plane (`plane.ts`): a grid, the sectors the ship
 * can sense right now tinted by quality, and a hatch over everything it cannot. It differs in
 * where it lives (a disc a metre across that the environment slides and turns beneath, so it
 * works in the mesh's own frame, not the world's) and in reading three ways rather than two:
 * space sensed earlier in the attempt shows the dimmed grid without the hatch, and the hatch
 * returns as that look ages (`planeStyle.earlierMemory`).
 */
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Matrix4,
  ShaderMaterial,
  Vector2,
  Vector4,
} from 'three';
import { hex } from '../colour.ts';
import { MAX_SECTORS } from './plane.ts';
import type { PlaneSector } from './plane.ts';
import { planeStyle } from './styles.ts';

/** Most sectors sensed earlier that the plane can show at once. */
export const MAX_EARLIER = 24;

/** A sector sensed earlier, seen from where the ship is now. */
export interface EarlierSector {
  /** Direction of the sector's centre, radians counter-clockwise from game +x. */
  readonly center: number;
  readonly halfWidth: number;
  /** Game metres. */
  readonly range: number;
  /** Where the ship was when it sensed it, less where it is now: game metres. */
  readonly dx: number;
  readonly dy: number;
  /** 1 just sensed, falling to 0 when it reads as unknown again. */
  readonly fresh: number;
}

/**
 * Material for a disc lying in its own XZ plane, centred on the ship.
 * `radius` is the projection volume's radius in the disc's units (hologram metres).
 */
export function holoPlaneMaterial(radius: number): ShaderMaterial {
  const p = planeStyle;
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    uniforms: {
      uRadius: { value: radius },
      /** Disc frame → the volume's frame, to fade the disc out at the volume's edge. */
      uToVolume: { value: new Matrix4() },
      /** Hologram metres per game metre. */
      uScale: { value: 1 },
      uShip: { value: new Vector2() },
      uSectors: { value: Array.from({ length: MAX_SECTORS }, () => new Vector4()) },
      uSectorCount: { value: 0 },
      /** Sensed earlier: (centre, half-width, range, freshness) and the apex offset (dx, dy). */
      uEarlier: { value: Array.from({ length: MAX_EARLIER }, () => new Vector4()) },
      uEarlierAt: { value: Array.from({ length: MAX_EARLIER }, () => new Vector2()) },
      uEarlierCount: { value: 0 },
      uMinor: { value: 1 },
      uMajor: { value: 5 },
      uHatchSpacing: { value: 1 },
      cGrid: { value: new Color(hex(p.grid)) },
      cMajor: { value: new Color(hex(p.gridMajor)) },
      cUnknown: { value: new Color(hex(p.unknown)) },
      cCoverage: { value: new Color(hex(p.coverage)) },
      oGridMinor: { value: p.gridMinor },
      oStaleGrid: { value: p.staleGrid },
      oUnknownHatch: { value: p.unknownHatch },
      oTint: { value: p.coverageTint },
      oEdge: { value: p.coverageEdge },
    },
    vertexShader: /* glsl */ `
      uniform mat4 uToVolume;
      varying vec3 vLocal;
      varying vec3 vVolume;
      void main() {
        vLocal = position;
        vVolume = (uToVolume * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      #define MAX_SECTORS ${MAX_SECTORS}
      #define MAX_EARLIER ${MAX_EARLIER}
      uniform float uRadius, uScale;
      uniform vec2 uShip;
      uniform vec4 uSectors[MAX_SECTORS];
      uniform int uSectorCount;
      uniform vec4 uEarlier[MAX_EARLIER];
      uniform vec2 uEarlierAt[MAX_EARLIER];
      uniform int uEarlierCount;
      uniform float uMinor, uMajor, uHatchSpacing;
      uniform vec3 cGrid, cMajor, cUnknown, cCoverage;
      uniform float oGridMinor, oStaleGrid, oUnknownHatch, oTint, oEdge;
      varying vec3 vLocal;
      varying vec3 vVolume;
      const float PI = 3.141592653589793;
      float gridLine(vec2 p, float spacing) {
        vec2 q = p / spacing;
        vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q);
        return 1.0 - min(min(g.x, g.y), 1.0);
      }
      void main() {
        float rr = length(vVolume) / uRadius;
        if (rr > 1.0) discard;
        // Game-plane coordinates of this fragment: the ship plus the offset across the disc.
        vec2 d = vec2(vLocal.x, -vLocal.z) / uScale;
        vec2 g = uShip + d;
        float dist = length(d);
        float ang = atan(d.y, d.x);
        float dw = fwidth(dist) + 1e-6;
        float aw = dw / max(dist, 1e-4);
        float cover = 0.0;
        float quality = 0.0;
        float edge = 0.0;
        for (int i = 0; i < MAX_SECTORS; i++) {
          if (i >= uSectorCount) break;
          vec4 s = uSectors[i];
          float da = abs(mod(ang - s.x + PI, 2.0 * PI) - PI);
          float inAngle = s.y >= PI ? 1.0 : 1.0 - smoothstep(s.y - aw, s.y + aw, da);
          float inRange = 1.0 - smoothstep(s.z - dw, s.z + dw, dist);
          cover = max(cover, inAngle * inRange);
          quality = max(quality, inAngle * inRange * s.w);
          float arc = (1.0 - smoothstep(0.0, dw * 2.5, abs(dist - s.z))) * inAngle;
          float side = s.y >= PI ? 0.0 : (1.0 - smoothstep(0.0, aw * 2.5, abs(da - s.y))) * inRange;
          edge = max(edge, max(arc, side));
        }
        // Sensed earlier in this attempt, from wherever the ship was then.
        float earlier = 0.0;
        for (int i = 0; i < MAX_EARLIER; i++) {
          if (i >= uEarlierCount) break;
          vec4 e = uEarlier[i];
          vec2 q = d - uEarlierAt[i];
          float qd = length(q);
          float qw = dw / max(qd, 1e-4);
          float qa = abs(mod(atan(q.y, q.x) - e.x + PI, 2.0 * PI) - PI);
          float inAngle = e.y >= PI ? 1.0 : 1.0 - smoothstep(e.y - qw, e.y + qw, qa);
          float inRange = 1.0 - smoothstep(e.z - dw, e.z + dw, qd);
          earlier = max(earlier, inAngle * inRange * e.w);
        }
        vec3 grid = cGrid * gridLine(g, uMinor) * oGridMinor + cMajor * gridLine(g, uMajor);
        float h = (g.x + g.y) / uHatchSpacing;
        float hatch = 1.0 - smoothstep(0.0, fwidth(h) * 1.5, abs(fract(h) - 0.5) - 0.2);
        vec3 unknown = grid * oStaleGrid + cUnknown * hatch * oUnknownHatch * (1.0 - earlier);
        vec3 known = grid + cCoverage * oTint * quality;
        vec3 col = mix(unknown, known, cover) + cCoverage * edge * oEdge;
        col *= smoothstep(1.0, 0.9, rr);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/**
 * Tell the reference plane where the ship is (game x, y), the projection scale, what the ship
 * can sense now and what it sensed earlier (freshest first; the rest are dropped). Grid lines
 * are spaced to suit the range shown: `major` game metres apart.
 */
export function setHoloPlane(
  material: ShaderMaterial,
  ship: readonly [number, number],
  scale: number,
  major: number,
  sectors: readonly PlaneSector[],
  earlier: readonly EarlierSector[] = [],
): void {
  const u = material.uniforms;
  (u.uShip!.value as Vector2).set(ship[0], ship[1]);
  u.uScale!.value = scale;
  u.uMajor!.value = major;
  u.uMinor!.value = major / 5;
  u.uHatchSpacing!.value = major / 4;
  const slots = u.uSectors!.value as Vector4[];
  const kept = [...sectors].sort((a, b) => b.halfWidth - a.halfWidth).slice(0, MAX_SECTORS);
  kept.forEach((s, i) => slots[i]?.set(s.center, s.halfWidth, s.range, s.quality));
  u.uSectorCount!.value = kept.length;
  const past = earlier.slice(0, MAX_EARLIER);
  const pastSlots = u.uEarlier!.value as Vector4[];
  const pastAt = u.uEarlierAt!.value as Vector2[];
  past.forEach((e, i) => {
    pastSlots[i]?.set(e.center, e.halfWidth, e.range, e.fresh);
    pastAt[i]?.set(e.dx, e.dy);
  });
  u.uEarlierCount!.value = past.length;
}
