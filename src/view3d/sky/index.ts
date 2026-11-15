import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  CubeCamera,
  Float32BufferAttribute,
  Group,
  HalfFloatType,
  LinearFilter,
  Mesh,
  Points,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  WebGLCubeRenderTarget,
  type Camera,
  type WebGLRenderer,
} from 'three';
import type { WindowView } from '../../contracts/index.ts';
import { toScene } from '../adapter.ts';
import { adaptedExposure } from './adaptation.ts';
import { atlasShader } from './shader.ts';
import { atlasStars } from './stars.ts';
import { skyStyle } from './style.ts';

const vertexShader = /* glsl */ `
  varying vec3 ray;
  void main() { ray=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }
`;
const sunShader = /* glsl */ `
  float a=acos(clamp(dot(d,sunDir),-1.0,1.0));
  float px=max(length(fwidth(d)),0.00005);
  float disc=1.0-smoothstep(0.00131-px*0.5,0.00131+px*0.5,a);
  float glare=1.0-0.85*exp(-a*a/0.012)*sunVisible;
  light*=exposure*glare;
  light+=cWhite*(disc*2.0+exp(-a*a/0.000018)*0.13)*sunVisible;
`;

/** One fixed celestial atlas across the expedition. A10 never moves distant galaxies. */
export function createDeepSky() {
  const object = new Group();
  object.name = 'deep-sky';
  const sun = new Vector3();
  const uniforms = {
    cWhite: { value: skyStyle.white },
    cCold: { value: skyStyle.cold },
    cRust: { value: skyStyle.rust },
    gain: { value: skyStyle.galaxyGain },
    sunDir: { value: sun },
    sunVisible: { value: 0 },
    exposure: { value: 1 },
  };
  const galaxyMaterial = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    uniforms,
    vertexShader,
    fragmentShader: /* glsl */ `
      varying vec3 ray;
      uniform vec3 cWhite,cCold,cRust,sunDir;
      uniform float gain,sunVisible,exposure;
      ${atlasShader}
      void main() {
        vec3 d=normalize(ray);
        vec3 light=atlasLight(d);
        ${sunShader}
        gl_FragColor=vec4(light,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const geometry = new SphereGeometry(7000, 48, 24);
  const dome = new Mesh(geometry, galaxyMaterial);
  dome.frustumCulled = false;
  dome.renderOrder = 1;
  object.add(dome);
  let atlas: WebGLCubeRenderTarget | undefined;
  let cachedMaterial: ShaderMaterial | undefined;
  const prepareAtlas = (renderer: WebGLRenderer) => {
    if (atlas || typeof renderer.getContext !== 'function' || object.parent?.visible === false)
      return;
    atlas = new WebGLCubeRenderTarget(512, {
      type: HalfFloatType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      generateMipmaps: false,
      depthBuffer: false,
    });
    const bakeMaterial = galaxyMaterial.clone();
    bakeMaterial.uniforms.sunVisible!.value = 0;
    bakeMaterial.uniforms.exposure!.value = 1;
    bakeMaterial.fragmentShader = bakeMaterial.fragmentShader
      .replace('#include <tonemapping_fragment>', '')
      .replace('#include <colorspace_fragment>', '');
    const bakeScene = new Scene();
    bakeScene.add(new Mesh(geometry, bakeMaterial));
    new CubeCamera(1, 9000, atlas).update(renderer, bakeScene);
    bakeMaterial.dispose();
    cachedMaterial = new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      uniforms: { ...uniforms, atlas: { value: atlas.texture } },
      vertexShader,
      fragmentShader: /* glsl */ `
        varying vec3 ray;
        uniform samplerCube atlas;
        uniform vec3 cWhite,sunDir;
        uniform float sunVisible,exposure;
        void main() {
          vec3 d=normalize(ray);
          vec3 light=textureCube(atlas,d).rgb;
          ${sunShader}
          gl_FragColor=vec4(light,1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    dome.material = cachedMaterial;
    galaxyMaterial.dispose();
  };
  const { positions, colours, sizes } = atlasStars();
  const starsGeometry = new BufferGeometry();
  starsGeometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  starsGeometry.setAttribute('color', new Float32BufferAttribute(colours, 3));
  starsGeometry.setAttribute('size', new Float32BufferAttribute(sizes, 1));
  const starMaterial = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexColors: true,
    uniforms: {
      sunDir: uniforms.sunDir,
      sunVisible: uniforms.sunVisible,
      exposure: uniforms.exposure,
      pixelRatio: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute float size;
      uniform float pixelRatio,sunVisible,exposure;
      uniform vec3 sunDir;
      varying vec3 light;
      void main() {
        float glare=1.0-0.85*exp((dot(normalize(position),sunDir)-1.0)/0.006)*sunVisible;
        light=color*glare*exposure;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
        gl_PointSize=(size+0.7)*pixelRatio;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 light;
      void main() {
        float r=length(gl_PointCoord-0.5)*2.0;
        float alpha=exp(-r*r*2.2)*(1.0-smoothstep(0.7,1.0,r));
        gl_FragColor=vec4(light,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const stars = new Points(starsGeometry, starMaterial);
  stars.frustumCulled = false;
  stars.renderOrder = 2;
  object.add(stars);
  let lastFrame: number | undefined;
  let initialized = false;
  return {
    object,
    setSun(view: WindowView | undefined) {
      uniforms.sunVisible.value = view?.sun?.visible ? 1 : 0;
      if (view?.sun) toScene(view.sun.direction, sun).normalize();
      if (!initialized) {
        uniforms.exposure.value = uniforms.sunVisible.value ? 0.58 : 1;
        initialized = true;
      }
    },
    /** Eye-centred dome: walking never introduces celestial parallax. Parent owns attitude. */
    followEye(camera: Camera, renderer: WebGLRenderer) {
      prepareAtlas(renderer);
      const now = performance.now();
      uniforms.exposure.value = adaptedExposure(
        uniforms.exposure.value,
        !!uniforms.sunVisible.value,
        lastFrame === undefined ? 0 : (now - lastFrame) / 1000,
      );
      lastFrame = now;
      object.parent?.updateWorldMatrix(true, false);
      object.position.copy(camera.position);
      if (object.parent) object.parent.worldToLocal(object.position);
      starMaterial.uniforms.pixelRatio!.value = renderer.getPixelRatio();
    },
    dispose() {
      object.removeFromParent();
      geometry.dispose();
      galaxyMaterial.dispose();
      cachedMaterial?.dispose();
      atlas?.dispose();
      starsGeometry.dispose();
      starMaterial.dispose();
    },
  };
}
