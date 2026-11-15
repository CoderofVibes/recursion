/** C05 does not exist yet. Every object and motion in this set piece is explicitly staged. */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  Quaternion,
  Vector3,
} from 'three';
import { createRng } from '../../../lib/rng.ts';
import {
  colour,
  holoWire,
  lineStyles,
  motion,
  outsideStyle,
  render,
  roomMotion,
} from '../../../theme/index.ts';
import { createDeepSky } from '../../../view3d/sky/index.ts';
import { orientedFunnelGeometry } from '../../../view3d/fields/wells/funnel.ts';
import { wellLineMaterial } from '../../../theme/three/index.ts';

const RUN = 1800;
const SPEED = RUN / (motion.breathe / 1000);
const PARTICLES = 4000;

export function createBraid() {
  const scenery = new Group();
  const sky = createDeepSky();
  sky.setSun({
    sunlit: true,
    sun: { direction: { x: -0.4, y: 0.8, z: 0.45 }, visible: true },
    objects: [],
  });
  scenery.add(sky.object);
  // The set piece shares RoomView's renderer. The first off-screen render bakes its sky;
  // subsequent calls only follow the eye. No second WebGL context or separate render loop.
  const dome = sky.object.children.find((object) => object instanceof Mesh)!;
  dome.onBeforeRender = (renderer, _scene, camera) => {
    sky.followEye(camera, renderer);
    sky.object.updateMatrixWorld(true);
  };

  const rng = createRng('tv-braided-crossing-v1').stream('debris');
  const particles = Array.from({ length: PARTICLES }, (_, i) => {
    const band = i % 5;
    const depth = rng.range(0, RUN);
    // Shallow crossing directions; differently displaced gaps at successive depths.
    const slopes = [-0.075, 0.045, -0.035, 0.065, 0.012];
    const vertical = [0.016, -0.023, 0.031, -0.009, 0.004];
    const offsets = [-28, 31, 7, -9, 48];
    return {
      depth,
      band,
      x:
        offsets[band]! +
        slopes[band]! * depth +
        Math.sin(depth / 180 + band) * 18 +
        rng.normal(0, 3),
      y:
        (band - 2) * 7 +
        vertical[band]! * depth +
        Math.sin(depth / 270 + band) * 3 +
        rng.normal(0, 1.2),
      length: rng.range(0.15, 1.2),
      gain: rng.range(outsideStyle.starMin, holoWire.rockLive),
    };
  });
  const positions = new Float32Array(PARTICLES * 6);
  const colours = new Float32Array(PARTICLES * 6);
  const geometry = new BufferGeometry();
  const position = new BufferAttribute(positions, 3);
  const vertexColour = new BufferAttribute(colours, 3);
  geometry.setAttribute('position', position);
  geometry.setAttribute('color', vertexColour);
  const material = new LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    opacity: holoWire.body,
  });
  const debris = new LineSegments(geometry, material);
  debris.frustumCulled = false;
  scenery.add(debris);
  const warm = new Color(colour.measured).lerp(new Color(outsideStyle.rock), holoWire.shipSymbol);

  const funnels: { geometry: BufferGeometry; material: ReturnType<typeof wellLineMaterial> }[] = [];
  for (const [i, at] of [
    [-75, 15, -1400],
    [105, -22, -1900],
    [18, 37, -2400],
  ].entries()) {
    const length = 300;
    const mouthRadius = 42;
    const throatRadius = 1;
    const stations = Array.from({ length: render.well.rings + 1 }, (_, n) => {
      const fraction = n / render.well.rings;
      return {
        fraction,
        radius: {
          value: throatRadius + (mouthRadius - throatRadius) * (1 - fraction) ** 2,
          sigma: 0,
        },
      };
    });
    const g = orientedFunnelGeometry({
      mouth: { x: 0, y: 0, z: 0 },
      axis: { x: 0, y: 1, z: 0 },
      mouthSigma: 0,
      axisSigma: 0,
      length: { value: length, sigma: 0 },
      mouthRadius: { value: mouthRadius, sigma: 0 },
      throatRadius: { value: throatRadius, sigma: 0 },
      stations,
    });
    const p = g.getAttribute('position');
    const c = [];
    const faint = new Color(colour.well).multiplyScalar(lineStyles.wellMouth.opacity);
    const bright = new Color(colour.latticeCore);
    for (let n = 0; n < p.count; n++) {
      const tint = faint.clone().lerp(bright, (p.getY(n) / length) ** 3);
      c.push(tint.r, tint.g, tint.b);
    }
    g.setAttribute('color', new Float32BufferAttribute(c, 3));
    const m = wellLineMaterial();
    m.opacity *= holoWire.body;
    const mesh = new LineSegments(g, m);
    mesh.position.set(at[0]!, at[1]!, at[2]!);
    mesh.quaternion.copy(
      new Quaternion().setFromUnitVectors(
        new Vector3(0, 1, 0),
        new Vector3((i - 1) * roomMotion.frameTilt, 0, -1).normalize(),
      ),
    );
    scenery.add(mesh);
    funnels.push({ geometry: g, material: m });
  }

  return {
    scenery,
    sample(local: number): void {
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]!;
        const depth = ((((p.depth - local * SPEED) % RUN) + RUN) % RUN) + 12;
        const at = i * 6;
        const streak = (p.length * SPEED * motion.fast * holoWire.body) / 1000;
        positions[at] = positions[at + 3] = p.x;
        positions[at + 1] = positions[at + 4] = p.y;
        positions[at + 2] = -depth;
        positions[at + 5] = -depth - streak;
        // Small steady sparks. Wrap at the far end and fade continuously near the eye.
        const gain = p.gain * Math.min(1, depth / 40) * Math.min(1, (RUN + 12 - depth) / 80);
        for (let end = 0; end < 2; end++) {
          colours[at + end * 3] = warm.r * gain;
          colours[at + end * 3 + 1] = warm.g * gain;
          colours[at + end * 3 + 2] = warm.b * gain;
        }
      }
      position.needsUpdate = vertexColour.needsUpdate = true;
    },
    dispose(): void {
      sky.dispose();
      geometry.dispose();
      material.dispose();
      for (const f of funnels) {
        f.geometry.dispose();
        f.material.dispose();
      }
      scenery.removeFromParent();
    },
  };
}
