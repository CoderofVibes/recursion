/**
 * Things seen by light: massive bodies and rocks, lit by the one distant sun (DECISIONS A3).
 * These are for the window and for solid marks in the sensor view. Owner: 1E, the UI lane.
 */
import { Color, ShaderMaterial, Vector3 } from 'three';
import { colour, hex } from '../colour.ts';
import { render } from '../render.ts';
import { objectStyle } from './styles.ts';

const VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying vec3 vLocal;
  void main() {
    mat4 m = modelMatrix;
    #ifdef USE_INSTANCING
      m = modelMatrix * instanceMatrix;
    #endif
    vLocal = normal;
    vNormal = normalize(mat3(m) * normal);
    vec4 world = m * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }`;

const defaultSun = (): Vector3 => new Vector3(...render.keyLight).normalize();

export interface BodyMaterialOptions {
  /** The body's sunlit colour. Defaults to the theme's; a content author may tint a body. */
  readonly lit?: string;
}

/**
 * A massive body: dark, with soft sunlight and a warm rim where the light grazes it.
 * Point it at the sun with `setSun`.
 */
export function bodyMaterial({ lit = colour.bodyLit }: BodyMaterialOptions = {}): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uSun: { value: defaultSun() },
      cDark: { value: new Color(hex(colour.body)) },
      cLit: { value: new Color(hex(lit)) },
      cRim: { value: new Color(hex(colour.bodyRim)) },
      uRimStrength: { value: render.rimStrength },
      uRimPower: { value: render.rimPower },
    },
    vertexShader: VERTEX,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun, cDark, cLit, cRim;
      uniform float uRimStrength, uRimPower;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying vec3 vLocal;
      void main() {
        vec3 n = normalize(vNormal);
        vec3 v = normalize(cameraPosition - vWorld);
        float sun = dot(n, uSun);
        float day = smoothstep(-0.05, 0.9, sun);
        float band = 0.86 + 0.14 * sin(vLocal.y * 21.0 + sin(vLocal.y * 7.0) * 2.0);
        float rim = pow(1.0 - max(dot(n, v), 0.0), uRimPower) * smoothstep(-0.25, 0.4, sun);
        gl_FragColor = vec4(cDark * 0.18 + cLit * day * band * 0.75 + cRim * rim * uRimStrength * 1.4, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export interface RockMaterialOptions {
  /** Self-glow, for a rock the ship is tracking in the sensor view. 0 for the window. */
  readonly emissive?: number;
}

/**
 * A rock: flat facets lit by the sun, dark on the far side. Works on an `InstancedMesh`.
 * `rockMaterial({ emissive: objectStyle.tracked.emissive })` is the tracked mark.
 */
export function rockMaterial({ emissive = 0 }: RockMaterialOptions = {}): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uSun: { value: defaultSun() },
      cRock: { value: new Color(hex(objectStyle.tracked.colour)) },
      uEmissive: { value: emissive },
    },
    vertexShader: VERTEX,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun, cRock;
      uniform float uEmissive;
      varying vec3 vWorld;
      void main() {
        vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        float sun = max(dot(n, uSun), 0.0);
        gl_FragColor = vec4(cRock * (0.035 + 0.6 * sun + uEmissive), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/** Aim a body or rock material at the sun. `direction` points from the scene toward the sun. */
export function setSun(
  material: ShaderMaterial,
  direction: readonly [number, number, number],
): void {
  (material.uniforms.uSun?.value as Vector3).set(...direction).normalize();
}
