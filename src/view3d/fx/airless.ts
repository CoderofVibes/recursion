/** Window-only surfaces. A16: no atmospheric halo, emission, or light on an unlit limb. */
import { Color, ShaderMaterial, Vector3 } from 'three';
import { colour, hex, outsideStyle, render } from '../../theme/index.ts';

const vertexShader = /* glsl */ `
  varying vec3 normalWorld, pointWorld, localPoint;
  void main() {
    mat4 m=modelMatrix;
    #ifdef USE_INSTANCING
      m=modelMatrix*instanceMatrix;
    #endif
    localPoint=position;
    normalWorld=normalize(mat3(m)*normal);
    vec4 p=m*vec4(position,1.0);
    pointWorld=p.xyz;
    gl_Position=projectionMatrix*viewMatrix*p;
  }
`;

export function airlessMaterial(rock = false, cool = false): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uSun: { value: new Vector3(...render.keyLight).normalize() },
      uLit: { value: 1 },
      cLit: {
        value: new Color(
          hex(rock ? outsideStyle.rock : cool ? outsideStyle.bodyLitCool : colour.bodyLit),
        ),
      },
      cEdge: { value: new Color(hex(colour.bodyRim)) },
    },
    vertexShader,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun,cLit,cEdge;
      uniform float uLit;
      varying vec3 normalWorld,pointWorld,localPoint;
      float hash(vec3 p) { return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
      void main() {
        vec3 n=${rock ? 'normalize(cross(dFdx(pointWorld),dFdy(pointWorld)))' : 'normalize(normalWorld)'};
        vec3 eye=normalize(cameraPosition-pointWorld);
        float day=max(dot(n,uSun),0.0);
        float opposition=pow(max(dot(eye,uSun),0.0),24.0);
        ${
          rock
            ? `
        vec3 light=cLit*day*(0.8+0.35*opposition);
        `
            : `
        // Regolith relief resolves only at the terminator; it never changes the limb.
        vec3 cell=localPoint*65.0;
        vec3 offset=fract(cell)-0.5;
        float bowl=length(offset);
        float craters=smoothstep(0.12,0.4,bowl)*(0.5+0.5*hash(floor(cell)));
        float resolved=1.0-smoothstep(0.2,0.8,length(fwidth(cell)));
        float terminator=(1.0-smoothstep(0.05,0.32,day))*resolved;
        float relief=mix(0.78,0.28+craters,terminator);
        float edge=pow(1.0-max(dot(n,eye),0.0),18.0)*day;
        vec3 light=cLit*day*relief*0.7+cEdge*edge*0.18;
        `
        }
        gl_FragColor=vec4(light*uLit,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}
