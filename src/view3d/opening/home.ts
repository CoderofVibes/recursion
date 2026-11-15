import {
  BackSide,
  CanvasTexture,
  Color,
  Group,
  LinearFilter,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  Vector4,
  type IUniform,
} from 'three';
import { createRng } from '../../lib/rng.ts';
import { outsideStyle, render, roomSurface } from '../../theme/index.ts';
import { CON, ROOM, VIEW } from '../room/layout.ts';
import type { RoomShot } from './shot.ts';
import { skyStyle } from '../sky/style.ts';
import { skyNoise } from '../sky/noise.ts';
import './title.css';

/** A21/A17 share this standing position and the same Earth, just right of the forward mullion. */
export const HOME_SHOT: RoomShot = {
  position: [CON.x, ROOM.eye, 1.4],
  rotation: [-0.105, 0, 0],
  light: VIEW.room.level,
  console: VIEW.room.screen,
};

// The screen image is a distant Earth on final approach. Use the same angular size
// regardless of the window's compressed render distances.
const EARTH_RADIUS_KM = 6371;
const APPROACH_DISTANCE_KM = 250_000;
const SKY_DEPTH = 600;
/** The dome's own star field: cell size, the share of cells holding a star, and star size. */
const STAR_CELL_DEGREES = 0.9;
const STAR_DENSITY = 0.11;
const STAR_SIGMA_DEGREES = 0.035;
const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** Simplified coastline coordinates, in degrees east and north. Drawn for a small window disc. */
const COASTS: readonly (readonly (readonly [number, number])[])[] = [
  [
    [-150, 61],
    [-135, 58],
    [-126, 49],
    [-124, 39],
    [-117, 32],
    [-106, 22],
    [-90, 18],
    [-84, 10],
    [-79, 9],
    [-85, 22],
    [-97, 22],
    [-95, 29],
    [-82, 31],
    [-76, 39],
    [-65, 44],
    [-57, 52],
    [-64, 59],
    [-78, 54],
    [-86, 63],
    [-111, 72],
    [-139, 69],
  ],
  [
    [-78, 8],
    [-70, 12],
    [-57, 5],
    [-47, 1],
    [-34, -7],
    [-40, -20],
    [-52, -31],
    [-63, -40],
    [-67, -54],
    [-73, -49],
    [-74, -30],
    [-80, -9],
  ],
  [
    [-73, 77],
    [-60, 82],
    [-31, 81],
    [-21, 73],
    [-30, 65],
    [-45, 60],
    [-53, 64],
  ],
  [
    [-17, 34],
    [-10, 37],
    [1, 35],
    [12, 37],
    [23, 32],
    [33, 31],
    [43, 12],
    [51, 11],
    [42, -3],
    [39, -17],
    [32, -28],
    [19, -35],
    [11, -28],
    [11, -6],
    [5, 5],
    [-6, 4],
    [-16, 13],
  ],
  [
    [-10, 36],
    [-9, 44],
    [0, 49],
    [10, 54],
    [7, 61],
    [20, 70],
    [43, 69],
    [69, 73],
    [105, 74],
    [144, 72],
    [178, 67],
    [160, 58],
    [141, 46],
    [122, 30],
    [109, 20],
    [105, 8],
    [98, 15],
    [90, 22],
    [78, 8],
    [68, 24],
    [57, 27],
    [51, 15],
    [44, 13],
    [35, 31],
    [25, 38],
    [15, 38],
    [9, 44],
    [2, 42],
  ],
  [
    [113, -23],
    [115, -34],
    [128, -32],
    [137, -34],
    [152, -39],
    [154, -23],
    [144, -13],
    [138, -17],
    [127, -14],
  ],
  [
    [-11, 51],
    [-6, 58],
    [0, 55],
    [2, 52],
    [-5, 49],
  ],
];

function earthMap(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Earth map requires a canvas 2D context');
  const { width, height } = canvas;
  ctx.fillStyle = skyStyle.ocean.getStyle();
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = skyStyle.land.getStyle();
  for (const coast of COASTS) {
    ctx.beginPath();
    for (const [lon, lat] of coast) {
      ctx.lineTo(((lon + 180) / 360) * width, ((90 - lat) / 180) * height);
    }
    ctx.closePath();
    ctx.fill();
  }

  const clouds = createRng('opening').stream('earth-clouds');
  for (let i = 0; i < 160; i++) {
    const x = clouds.range(0, width);
    const y = clouds.range(0, height);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(clouds.range(-0.4, 0.4));
    ctx.scale(clouds.range(7, 38), clouds.range(1, 5));
    const cloud = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    cloud.addColorStop(0, skyStyle.white.getStyle());
    cloud.addColorStop(1, 'transparent');
    ctx.globalAlpha = clouds.range(0.17, 0.64);
    ctx.fillStyle = cloud;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = skyStyle.white.getStyle();
  ctx.fillRect(0, 0, width, height * 0.025);
  ctx.fillRect(0, height * 0.94, width, height * 0.06);
  return new CanvasTexture(canvas);
}

/** Where the anomaly sits in the window and how strongly it bends light; see `Lens` in the app. */
export interface WindowLens {
  /** Degrees right of the window's centre, and above the eye. */
  readonly az: number;
  readonly el: number;
  /** Einstein angle and shadow angle, degrees. A zero Einstein angle bends nothing. */
  readonly einstein: number;
  readonly shadow: number;
}

/**
 * Stars that sit close to the lens's early path, so the first sign of it (a star brightening,
 * sliding and splitting beside an empty point) happens where the player is already looking.
 * [az, el, brightness], degrees.
 */
const PATH_STARS = [
  [-14.6, 3.75, 0.9],
  [-12.1, 2.95, 0.75],
  [-9.5, 3.35, 1],
  [-7.3, 2.55, 0.8],
  [-3.9, 2.9, 0.85],
  [0.6, 2.75, 0.7],
] as const;

const direction = (az: number, el: number) =>
  new Vector3(
    Math.sin(radians(az)) * Math.cos(radians(el)),
    Math.sin(radians(el)),
    -Math.cos(radians(az)) * Math.cos(radians(el)),
  );

/**
 * The home sky as one dome around the eye: stars, Earth and, when given, a lens that bends
 * them. Everything is computed per pixel from the direction it looks along, so a bent ray simply
 * looks somewhere else: stars near the lens slide and split, Earth doubles and becomes a ring
 * when it sits behind it, and nothing comes out of the shadow. The same dome, without a lens, is
 * the ending's sky (A17). The caller can use it with a free camera.
 */
export function createHomeWindow() {
  const map = earthMap();
  // The disc is a few pixels across: sample it without mipmaps so the map's seam never shows.
  map.generateMipmaps = false;
  map.minFilter = LinearFilter;
  const eye = new Vector3(...HOME_SHOT.position);
  const bearing = new Vector3(Math.tan(radians(4.7)), Math.tan(radians(2)), -1).normalize();
  const toEye = bearing.clone().negate();
  const sunAlongLimb = new Vector3(-0.9, 0.38, 0);
  sunAlongLimb.addScaledVector(toEye, -sunAlongLimb.dot(toEye)).normalize();
  const phase = radians(83.24);
  const [warmG, warmB] = outsideStyle.starWarm;
  const lensDir = new Vector3(0, 0, -1);
  const material = new ShaderMaterial({
    side: BackSide,
    uniforms: {
      surfaceMap: { value: map },
      // Illuminated from the left and slightly from the viewer's side.
      sun: {
        value: sunAlongLimb.multiplyScalar(Math.sin(phase)).addScaledVector(toEye, Math.cos(phase)),
      },
      night: { value: new Color(roomSurface.void) },
      air: { value: skyStyle.air },
      starCold: { value: skyStyle.cold },
      starWhite: { value: skyStyle.white },
      rimPower: { value: render.rimPower },
      rimStrength: { value: render.rimStrength },
      earthDir: { value: bearing },
      earthRadius: { value: Math.asin(EARTH_RADIUS_KM / APPROACH_DISTANCE_KM) },
      // Put the Atlantic on the visible face, with the Americas on the sunlit side.
      earthTurn: { value: 1 },
      lensDir: { value: lensDir },
      einstein: { value: 0 },
      shadow: { value: 0 },
      starMin: { value: outsideStyle.starMin },
      starWarm: { value: [warmG, warmB] },
      pathStars: {
        value: PATH_STARS.map(([az, el, b]) => {
          const d = direction(az, el);
          return new Vector4(d.x, d.y, d.z, b);
        }),
      },
    },
    vertexShader: /* glsl */ `
      varying vec3 worldPosition;
      void main() {
        worldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D surfaceMap;
      uniform vec3 sun, night, air, earthDir, lensDir, starCold, starWhite;
      ${skyNoise}
      uniform float rimPower, rimStrength, earthRadius, earthTurn, einstein, shadow, starMin;
      uniform vec2 starWarm;
      uniform vec4 pathStars[${PATH_STARS.length}];
      varying vec3 worldPosition;

      // Star field: one candidate star per cell of the grid in azimuth and elevation.
      const float CELL = ${glsl(radians(STAR_CELL_DEGREES))};
      const float DENSITY = ${glsl(STAR_DENSITY)};
      const float SIGMA = ${glsl(radians(STAR_SIGMA_DEGREES))};

      vec4 hash4(vec2 p) {
        vec4 q = fract(vec4(p.xyxy) * vec4(0.1031, 0.1030, 0.0973, 0.1099));
        q += dot(q, q.wzxy + 33.33);
        return fract((q.xxyz + q.yzzw) * q.zywx);
      }

      // A star of brightness b at angular distance r, for a pixel that spans 'spread' of sky.
      float starLight(float r, float b, float spread) {
        float s2 = SIGMA * SIGMA + spread * spread;
        return b * (SIGMA * SIGMA / s2) * exp(-0.5 * r * r / s2);
      }

      vec3 stars(vec3 s, float spread) {
        float az = atan(s.x, -s.z);
        float el = asin(clamp(s.y, -1.0, 1.0));
        vec2 cell = floor(vec2(az, el) / CELL);
        vec3 light = vec3(0.0);
        for (int i = -1; i <= 1; i++) {
          for (int j = -1; j <= 1; j++) {
            vec2 c = cell + vec2(float(i), float(j));
            vec4 h = hash4(c + 17.0);
            if (h.x > DENSITY) continue;
            vec2 at = (c + h.yz) * CELL;
            vec2 off = vec2((az - at.x) * cos(el), el - at.y);
            float b = starMin + pow(h.w, 4.0) * (1.0 - starMin);
            float warm = hash4(c + 91.0).x;
            vec3 tint = vec3(
              1.0,
              starWarm.x + warm * (1.0 - starWarm.x - 0.02),
              starWarm.y + warm * (1.0 - starWarm.y - 0.02)
            );
            tint = mix(tint, starCold, smoothstep(0.48,0.8,warm));
            light += tint * starLight(length(off), b, spread);
          }
        }
        for (int k = 0; k < ${PATH_STARS.length}; k++) {
          float r = acos(clamp(dot(s, pathStars[k].xyz), -1.0, 1.0));
          light += vec3(1.0, starWarm.x, starWarm.y) * starLight(r, pathStars[k].w, spread);
        }
        return light;
      }

      // Earth as a lit sphere of angular radius earthRadius; alpha is how much of it covers s.
      vec4 earth(vec3 s, float spread) {
        float c = dot(s, earthDir);
        float g = acos(clamp(c, -1.0, 1.0));
        float cover = 1.0 - smoothstep(earthRadius - spread, earthRadius + spread, g);
        if (g > earthRadius * 1.04 + spread) return vec4(0.0);
        vec3 across = s - earthDir * c;
        float len = length(across);
        across = len > 1e-7 ? across / len : vec3(0.0);
        float r = min(sin(g) / sin(earthRadius), 1.0);
        vec3 n = normalize(across * r - earthDir * sqrt(max(0.0, 1.0 - r * r)));
        vec3 v = -earthDir;
        // World to the map's own frame (the map's sphere is turned by -earthTurn about y).
        float ct = cos(earthTurn);
        float st = sin(earthTurn);
        vec3 o = vec3(n.x * ct + n.z * st, n.y, -n.x * st + n.z * ct);
        float u = fract(atan(o.z, -o.x) / 6.28318530718);
        vec2 uv = vec2(u, 1.0 - acos(clamp(o.y, -1.0, 1.0)) / 3.14159265359);
        float day = dot(n, sun);
        float light = smoothstep(-0.025, 0.1, day) * (0.25 + 0.75 * sqrt(max(day, 0.0)));
        float rim = pow(1.0 - max(dot(n, v), 0.0), rimPower);
        vec3 surface = pow(texture2D(surfaceMap, uv).rgb, vec3(2.2));
        float glow = exp(-abs(g-earthRadius)/max(spread, earthRadius*0.014));
        glow *= smoothstep(-0.06,0.25,dot(across,sun))*0.3;
        vec3 earthLight = mix(night, surface + air * rim * rimStrength * 0.6, light);
        return vec4(mix(air*glow,earthLight,cover), max(cover,glow));
      }

      void main() {
        vec3 d = normalize(worldPosition - cameraPosition);
        // How much sky one pixel spans, before bending.
        float pixel = length(fwidth(d));
        vec3 s = d;
        float spread = pixel * 0.5;
        float lit = 1.0;
        if (einstein > 0.0) {
          float c = clamp(dot(d, lensDir), -1.0, 1.0);
          float a = acos(c);
          // Nothing comes out of the shadow. Its edge is one pixel soft.
          lit = smoothstep(shadow, shadow + pixel, a);
          vec3 across = d - lensDir * c;
          float len = length(across);
          if (len > 1e-7 && a > 1e-6) {
            across /= len;
            float e2 = einstein * einstein;
            float b = a - e2 / a;
            s = lensDir * cos(b) + across * sin(b);
            // A pixel near the lens looks at a stretched patch of sky: blur to match, so
            // squeezed images fade smoothly instead of sparkling.
            float stretch = max(1.0 + e2 / (a * a), abs(sin(b)) / max(sin(a), 1e-6));
            spread = pixel * 0.5 * stretch;
          }
        }
        // At home the familiar inside-galaxy band is deliberately different from the atlas.
        float latitude = dot(s,normalize(vec3(-0.28,0.94,0.20)));
        float cloud = dust(s*16.0+vec3(7.0));
        float band = exp(-latitude*latitude/0.008)*(0.3+cloud*0.7);
        vec3 col = night + stars(s, spread) + starWhite*band*0.016;
        vec4 planet = earth(d, pixel * 0.5);
        col = mix(col, planet.rgb, planet.a);
        gl_FragColor = vec4(mix(night, col, lit), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  // A dome around the eye: the room hides all of it but the window.
  const geometry = new SphereGeometry(SKY_DEPTH, 64, 32);
  const dome = new Mesh(geometry, material);
  dome.position.copy(eye);
  dome.onBeforeRender = (_renderer, _scene, camera) => {
    dome.position.copy(camera.position);
    dome.updateMatrixWorld();
  };
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  const scenery = new Group();
  scenery.add(dome);

  const uniforms = material.uniforms as Record<string, IUniform>;
  function setLens(lens: WindowLens | null) {
    if (!lens || lens.einstein <= 0) {
      uniforms.einstein!.value = 0;
      uniforms.shadow!.value = 0;
      return;
    }
    lensDir.copy(direction(lens.az, lens.el));
    uniforms.einstein!.value = radians(lens.einstein);
    uniforms.shadow!.value = radians(Math.min(lens.shadow, 179));
  }
  return {
    scenery,
    setLens,
    dispose() {
      scenery.removeFromParent();
      geometry.dispose();
      material.dispose();
      map.dispose();
    },
  };
}

/** A number as a GLSL float literal. */
function glsl(n: number): string {
  const text = String(n);
  return text.includes('.') || text.includes('e') ? text : `${text}.0`;
}
