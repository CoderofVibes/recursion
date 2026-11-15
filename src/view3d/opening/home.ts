import {
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  Points,
  PointsMaterial,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { createRng } from '../../lib/rng.ts';
import { colour, hex, outsideStyle, render, roomSurface } from '../../theme/index.ts';
import { CON, ROOM, VIEW } from '../room/layout.ts';
import type { RoomShot } from './shot.ts';

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
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Earth map requires a canvas 2D context');
  const { width, height } = canvas;
  ctx.fillStyle = outsideStyle.bodyLitCool;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = colour.bodyLit;
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
    cloud.addColorStop(0, colour.ink);
    cloud.addColorStop(1, 'transparent');
    ctx.globalAlpha = clouds.range(0.17, 0.64);
    ctx.fillStyle = cloud;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }
  return new CanvasTexture(canvas);
}

/** The caller can use the same set piece with a free camera during the ending. */
export function createHomeWindow() {
  const map = earthMap();
  const geometry = new SphereGeometry(1, 48, 32);
  const eye = new Vector3(...HOME_SHOT.position);
  const bearing = new Vector3(Math.tan(radians(4.7)), Math.tan(radians(2)), -1);
  const toEye = bearing.clone().normalize().negate();
  const sunAlongLimb = new Vector3(-0.9, 0.38, 0);
  sunAlongLimb.addScaledVector(toEye, -sunAlongLimb.dot(toEye)).normalize();
  const phase = radians(83.24);
  const material = new ShaderMaterial({
    uniforms: {
      surfaceMap: { value: map },
      // Illuminated from the left and slightly from the viewer's side.
      sun: {
        value: sunAlongLimb.multiplyScalar(Math.sin(phase)).addScaledVector(toEye, Math.cos(phase)),
      },
      night: { value: new Color(roomSurface.void) },
      air: { value: new Color(outsideStyle.bodyLitCool) },
      rimPower: { value: render.rimPower },
      rimStrength: { value: render.rimStrength },
    },
    vertexShader: /* glsl */ `
      varying vec2 mapUv;
      varying vec3 worldNormal;
      varying vec3 worldPosition;
      void main() {
        mapUv = uv;
        worldNormal = mat3(modelMatrix) * normal;
        worldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D surfaceMap;
      uniform vec3 sun;
      uniform vec3 night;
      uniform vec3 air;
      uniform float rimPower;
      uniform float rimStrength;
      varying vec2 mapUv;
      varying vec3 worldNormal;
      varying vec3 worldPosition;
      void main() {
        vec3 n = normalize(worldNormal);
        vec3 v = normalize(cameraPosition - worldPosition);
        float light = smoothstep(-0.025, 0.38, dot(n, sun));
        float rim = pow(1.0 - max(dot(n, v), 0.0), rimPower);
        vec3 surface = pow(texture2D(surfaceMap, mapUv).rgb, vec3(2.2));
        gl_FragColor = vec4(mix(night, surface + air * rim * rimStrength, light), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new Mesh(geometry, material);
  mesh.position.copy(eye).addScaledVector(bearing, SKY_DEPTH);
  mesh.scale.setScalar(eye.distanceTo(mesh.position) * (EARTH_RADIUS_KM / APPROACH_DISTANCE_KM));
  // Put the Atlantic on the visible face, with the Americas on the sunlit side.
  mesh.rotation.y = -1;
  const scenery = new Group();
  scenery.add(mesh);

  // Three inertial reference stars near the scripted optical cue. Their excursion is at
  // most 0.45° and the brightness remains fixed. The rest of the sky stays in the room.
  const guides = [
    [-1.6, 0.7],
    [0.7, -1.25],
    [1.3, 0.95],
  ] as const;
  const starGeometry = new BufferGeometry();
  const points = new Float32BufferAttribute(new Float32Array(3 * guides.length), 3);
  starGeometry.setAttribute('position', points);
  const starMaterial = new PointsMaterial({
    color: hex(colour.inkDim),
    size: outsideStyle.starSize,
    sizeAttenuation: false,
  });
  const stars = new Points(starGeometry, starMaterial);
  stars.frustumCulled = false;
  scenery.add(stars);
  let lastLensing = -1;
  function setLensing(amount: number) {
    if (lastLensing === amount) return;
    lastLensing = amount;
    for (const [i, [x, y]] of guides.entries()) {
      const distance = Math.hypot(x, y);
      const bend = 1 + (amount * 0.45 * Math.sin((Math.PI * distance) / 3)) / distance;
      const depth = 6000;
      points.setXYZ(
        i,
        depth * Math.tan(radians(-13.2 + x * bend)),
        ROOM.eye + depth * Math.tan(radians(1.5 + y * bend)),
        -depth,
      );
    }
    points.needsUpdate = true;
  }
  setLensing(0);
  return {
    scenery,
    setLensing,
    dispose() {
      scenery.removeFromParent();
      geometry.dispose();
      material.dispose();
      map.dispose();
      starGeometry.dispose();
      starMaterial.dispose();
    },
  };
}
