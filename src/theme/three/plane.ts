/**
 * The flight plane: a grid, the sectors the ship can sense right now, and a hatch over everything
 * it cannot (never filled in). Game coordinates map to the scene as (x, y) → (x, 0, -y), so the
 * view from above is not mirrored (docs/design/visual-direction.md § 9). Owner: 1E, the UI lane.
 */
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  MeshBasicMaterial,
  ShaderMaterial,
  Vector2,
  Vector4,
} from 'three';
import { hex } from '../colour.ts';
import { planeStyle } from './styles.ts';

/** Most sensor sectors the plane can show at once. */
export const MAX_SECTORS = 8;

/** The fields of a contract `SensorSector` that the plane draws. */
export interface PlaneSector {
  /** Direction of the sector's centre, radians counter-clockwise from +x (game frame). */
  readonly center: number;
  readonly halfWidth: number;
  /** World units. */
  readonly range: number;
  /** 0 useless to 1 full quality: scales the tint. */
  readonly quality: number;
}

export interface PlaneMaterialOptions {
  /** World units between grid lines; defaults come from the theme and suit the prototype's scale. */
  readonly minorSpacing?: number;
  readonly majorSpacing?: number;
  /** World units between hatch lines over unsensed space. */
  readonly hatchSpacing?: number;
}

/** Material for a mesh lying in the scene's XZ plane. Feed it coverage with `setPlaneCoverage`. */
export function planeMaterial({
  minorSpacing = planeStyle.minorSpacing,
  majorSpacing = planeStyle.majorSpacing,
  hatchSpacing = planeStyle.unknownSpacing,
}: PlaneMaterialOptions = {}): ShaderMaterial {
  const p = planeStyle;
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    uniforms: {
      uShip: { value: new Vector2() },
      uSectors: { value: Array.from({ length: MAX_SECTORS }, () => new Vector4()) },
      uSectorCount: { value: 0 },
      uMinor: { value: minorSpacing },
      uMajor: { value: majorSpacing },
      uHatchSpacing: { value: hatchSpacing },
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
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      #define MAX_SECTORS ${MAX_SECTORS}
      uniform vec2 uShip;
      uniform vec4 uSectors[MAX_SECTORS];
      uniform int uSectorCount;
      uniform float uMinor, uMajor, uHatchSpacing;
      uniform vec3 cGrid, cMajor, cUnknown, cCoverage;
      uniform float oGridMinor, oStaleGrid, oUnknownHatch, oTint, oEdge;
      varying vec3 vWorld;
      const float PI = 3.141592653589793;
      float gridLine(vec2 p, float spacing) {
        vec2 q = p / spacing;
        vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q);
        return 1.0 - min(min(g.x, g.y), 1.0);
      }
      void main() {
        vec2 g = vec2(vWorld.x, -vWorld.z);
        vec2 d = g - uShip;
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
        vec3 grid = cGrid * gridLine(g, uMinor) * oGridMinor + cMajor * gridLine(g, uMajor);
        float h = (g.x + g.y) / uHatchSpacing;
        float hatch = 1.0 - smoothstep(0.0, fwidth(h) * 1.5, abs(fract(h) - 0.5) - 0.2);
        vec3 unknown = grid * oStaleGrid + cUnknown * hatch * oUnknownHatch;
        vec3 known = grid + cCoverage * oTint * quality;
        vec3 col = mix(unknown, known, cover) + cCoverage * edge * oEdge;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/**
 * Tell the plane where the ship is and what it can sense. `ship` is in game coordinates (x, y).
 * Sectors beyond MAX_SECTORS are dropped, widest first kept.
 */
export function setPlaneCoverage(
  material: ShaderMaterial,
  ship: readonly [number, number],
  sectors: readonly PlaneSector[],
): void {
  const u = material.uniforms;
  (u.uShip?.value as Vector2).set(ship[0], ship[1]);
  const slots = u.uSectors?.value as Vector4[];
  const kept = [...sectors].sort((a, b) => b.halfWidth - a.halfWidth).slice(0, MAX_SECTORS);
  kept.forEach((s, i) => slots[i]?.set(s.center, s.halfWidth, s.range, s.quality));
  if (u.uSectorCount) u.uSectorCount.value = kept.length;
}

/**
 * A dim sheet in the plane that pushes back whatever hangs below it (well funnels, the lower
 * half of the lattice), so depth reads. Draw it before the plane itself.
 */
export function planeVeilMaterial(): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: new Color(hex(planeStyle.veilColour)),
    transparent: true,
    opacity: planeStyle.veil,
    depthWrite: false,
    side: DoubleSide,
  });
}
