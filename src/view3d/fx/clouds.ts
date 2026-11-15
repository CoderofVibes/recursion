import {
  AdditiveBlending,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
  type Quaternion,
} from 'three';
import type { WindowCloudBank } from '../../contracts/index.ts';
import { colour } from '../../theme/index.ts';
import { toScene } from '../adapter.ts';
import { skyNoise } from '../sky/noise.ts';

const CAPACITY = 4096;
/** Optical patch sprites. They contain no dose, distance, force, or unobserved field. */
export function createCloudLight(displayRadius: number) {
  const plane = new PlaneGeometry(2, 2);
  const geometry = new InstancedBufferGeometry();
  geometry.index = plane.index;
  geometry.attributes.position = plane.attributes.position!;
  geometry.attributes.uv = plane.attributes.uv!;
  const rays = new InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3).setUsage(
    DynamicDrawUsage,
  );
  const sizes = new InstancedBufferAttribute(new Float32Array(CAPACITY), 1).setUsage(
    DynamicDrawUsage,
  );
  const gains = new InstancedBufferAttribute(new Float32Array(CAPACITY), 1).setUsage(
    DynamicDrawUsage,
  );
  geometry.setAttribute('ray', rays);
  geometry.setAttribute('radius', sizes);
  geometry.setAttribute('gain', gains);
  geometry.instanceCount = 0;
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      shell: { value: displayRadius },
      violet: { value: new Color(colour.well) },
      core: { value: new Color(colour.latticeCore) },
    },
    vertexShader: /* glsl */ `
      attribute vec3 ray;
      attribute float radius, gain;
      uniform float shell;
      varying vec2 patchUv;
      varying vec3 skyRay;
      varying float brightness;
      void main() {
        vec3 reference=abs(ray.y)>0.95?vec3(1,0,0):vec3(0,1,0);
        vec3 right=normalize(cross(ray,reference)), up=cross(right,ray);
        vec3 d=normalize(ray+(right*position.x+up*position.y)*radius);
        patchUv=position.xy; skyRay=d; brightness=gain;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(d*shell,1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 violet, core;
      varying vec2 patchUv;
      varying vec3 skyRay;
      varying float brightness;
      ${skyNoise}
      void main() {
        float r=length(patchUv);
        float edge=1.0-smoothstep(0.35,1.0,r);
        // Fixed inertial striations shared across patches, never boiling at time warp.
        float grain=noise3(skyRay*58.0);
        float az=atan(skyRay.x,-skyRay.z);
        float ribs=0.25+0.75*noise3(vec3(az*240.0+grain*2.0,skyRay.y*5.0,8.7));
        float light=edge*edge*(0.65+grain*0.35)*ribs*brightness*0.018;
        gl_FragColor=vec4(mix(violet,core,grain*0.65),light);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const object = new Mesh(geometry, material);
  object.name = 'radiation-cloud-light';
  object.frustumCulled = false;
  object.renderOrder = 3;
  const d = new Vector3(),
    room = new Vector3();
  return {
    object,
    update(banks: readonly WindowCloudBank[], rotation: Quaternion) {
      let count = 0;
      for (const bank of banks)
        for (const patch of bank.patches) {
          if (count === CAPACITY) break;
          if (!(
            patch.angularRadius > 0 &&
            patch.brightness > 0 &&
            Number.isFinite(patch.angularRadius)
          ))
            continue;
          toScene(patch.direction, d);
          if (!Number.isFinite(d.lengthSq()) || Math.abs(d.lengthSq() - 1) > 0.00001) continue;
          room.copy(d).applyQuaternion(rotation);
          if (room.z > Math.sin(Math.min(patch.angularRadius, Math.PI / 2))) continue;
          rays.setXYZ(count, d.x, d.y, d.z);
          sizes.setX(count, Math.tan(Math.min(patch.angularRadius, 1.4)));
          gains.setX(count, Math.min(1, patch.brightness));
          count++;
        }
      geometry.instanceCount = count;
      object.visible = count > 0;
      for (const attribute of [rays, sizes, gains]) {
        attribute.clearUpdateRanges();
        attribute.addUpdateRange(0, count * attribute.itemSize);
        attribute.needsUpdate = true;
      }
    },
    dispose() {
      object.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
