import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  Points,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type Camera,
  type WebGLRenderer,
} from 'three';
import type { WindowView } from '../../contracts/index.ts';
import { createRng } from '../../lib/rng.ts';
import { toScene } from '../adapter.ts';
import { skyNoise } from './noise.ts';
import { skyStyle } from './style.ts';

/** One fixed celestial atlas across the expedition. A10 does not move distant galaxies. */
export function createDeepSky(seed = 'recursion-celestial-atlas-v1') {
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
  };
  const galaxyMaterial = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 ray;
      void main() { ray = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 ray;
      uniform vec3 cWhite, cCold, cRust, sunDir;
      uniform float gain, sunVisible;
      ${skyNoise}
      vec3 galaxy(vec3 d) {
        // A lens-shaped galaxy seen from outside, never a band encircling the observer.
        vec3 axis = normalize(vec3(0.37,0.025,-1.0));
        vec3 right = normalize(cross(axis,vec3(-0.20,1.0,0.0)));
        vec3 up = cross(right,axis);
        float facing = dot(d,axis);
        vec2 p = vec2(atan(dot(d,right),facing), asin(dot(d,up)));
        float x=p.x, y=p.y;
        float lens = exp(-pow(abs(x)/0.77,4.0));
        float thickness = 0.026+0.053*exp(-x*x*5.0);
        float body = exp(-abs(y)/thickness)*lens;
        float bulge = exp(-x*x/0.029-y*y/0.007);
        float halo = exp(-x*x/0.25-y*y/0.028)*0.035;
        float grain = dust(vec3(x*19.0,y*29.0,7.0));
        float lane = exp(-pow((y+0.012+(grain-0.5)*0.045)/0.018,2.0));
        float torn = smoothstep(0.26,0.68,dust(vec3(x*47.0,y*80.0,3.7)));
        float extinction = 1.0-clamp(lane*(0.65+torn*0.5),0.0,0.98);
        vec3 light = cWhite*(body*0.24+bulge*0.78)*extinction+ cWhite*halo;
        float knots = pow(max(0.0,grain-0.47)*3.0,3.0)*lane*lens;
        light += cRust*knots*0.12;
        light += cCold*exp(-pow((x-0.24)/0.1,2.0)-pow((y-0.09)/0.04,2.0))*0.04;
        return light*step(0.0,facing);
      }
      vec3 spiral(vec3 d) {
        vec3 axis = normalize(vec3(-0.65,0.35,1.0));
        vec3 right = normalize(cross(axis,vec3(0,1,0))), up = cross(right,axis);
        float f = dot(d,axis);
        vec2 p = vec2(dot(d,right),dot(d,up)*1.9);
        float r=length(p), a=atan(p.y,p.x);
        float arms = 0.5+0.5*cos(a*2.0-log(r+0.025)*5.5);
        float disk = exp(-r*13.0)*smoothstep(0.36,0.26,r);
        vec3 light = cWhite*disk*(0.07+0.08*arms)+cWhite*exp(-r*r*2200.0)*0.35;
        return light*step(0.0,f);
      }
      void main() {
        vec3 d=normalize(ray);
        vec3 atlas=vec3(-d.x,d.y,-d.z);
        vec3 light=(galaxy(atlas)+spiral(atlas))*gain;
        // Small hard solar disc, 0.15 degrees across, without diffraction or flare.
        float a=acos(clamp(dot(d,sunDir),-1.0,1.0));
        float px=max(length(fwidth(d)),0.00005);
        float disc=1.0-smoothstep(0.00131-px*0.5,0.00131+px*0.5,a);
        float halo=exp(-a*a/0.000018)*0.13;
        light += cWhite*(disc*2.0+halo)*sunVisible;
        gl_FragColor=vec4(light,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const geometry = new SphereGeometry(7000, 48, 24);
  const dome = new Mesh(geometry, galaxyMaterial);
  dome.frustumCulled = false;
  // Render after opaque room/bodies so their depth rejects hidden sky fragments.
  dome.renderOrder = 1;
  object.add(dome);
  const rng = createRng(seed).stream('stars');
  const positions: number[] = [],
    colours: number[] = [],
    sizes: number[] = [];
  for (let i = 0; i < skyStyle.starCount; i++) {
    const d = new Vector3();
    const band = i < skyStyle.starCount * 0.56;
    if (band) {
      // Unresolved population follows the main galaxy rather than a spherical grid.
      const az = rng.normal(0.35, 0.39),
        el = rng.normal(0.025, 0.045);
      d.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    } else {
      const z = rng.range(-1, 1),
        a = rng.range(0, Math.PI * 2),
        r = Math.sqrt(1 - z * z);
      d.set(r * Math.cos(a), z, r * Math.sin(a));
    }
    positions.push(-d.x * 6900, d.y * 6900, -d.z * 6900);
    const pick = rng.next();
    const c = (pick < 0.35 ? skyStyle.rust : pick < 0.7 ? skyStyle.cold : skyStyle.white).clone();
    const brightness = 0.045 + Math.pow(rng.next(), 7) * 0.95;
    c.multiplyScalar(brightness * (band ? 0.48 : 1));
    colours.push(c.r, c.g, c.b);
    sizes.push(skyStyle.starSize * (0.6 + Math.sqrt(brightness) * 0.65));
  }
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
      pixelRatio: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute float size;
      uniform float pixelRatio, sunVisible;
      uniform vec3 sunDir;
      varying vec3 light;
      void main() {
        float glare=1.0-0.85*exp((dot(normalize(position),sunDir)-1.0)/0.006)*sunVisible;
        light=color*glare;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
        gl_PointSize=size*pixelRatio+1.0;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 light;
      void main() {
        float r=length(gl_PointCoord-0.5)*2.0;
        float alpha=exp(-r*r*3.0)*(1.0-smoothstep(0.7,1.0,r));
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
  return {
    object,
    setSun(view: WindowView | undefined) {
      uniforms.sunVisible.value = view?.sun?.visible ? 1 : 0;
      if (view?.sun) toScene(view.sun.direction, sun).normalize();
    },
    /** Eye-centred dome: walking never introduces celestial parallax. Parent owns attitude. */
    followEye(camera: Camera, renderer: WebGLRenderer) {
      object.parent?.updateWorldMatrix(true, false);
      object.position.copy(camera.position);
      if (object.parent) object.parent.worldToLocal(object.position);
      starMaterial.uniforms.pixelRatio!.value = renderer.getPixelRatio();
    },
    dispose() {
      object.removeFromParent();
      geometry.dispose();
      galaxyMaterial.dispose();
      starsGeometry.dispose();
      starMaterial.dispose();
    },
  };
}
