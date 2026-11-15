import { SKY_ATLAS, DEG, type SkyLandmark } from './atlas.ts';
import { skyNoise } from './noise.ts';

const vec = (v: { x: number; y: number; z: number }) =>
  `vec3(${v.x.toFixed(9)},${v.y.toFixed(9)},${v.z.toFixed(9)})`;
const frame = (l: SkyLandmark) => `mat3(${vec(l.right)},${vec(l.up)},${vec(l.direction)})`;
const size = (l: SkyLandmark) =>
  `vec2(${((l.width * DEG) / 2).toFixed(9)},${((l.height * DEG) / 2).toFixed(9)})`;

/** Evaluated once into the cubemap. Resolved embers/stars stay in the points draw. */
export const atlasShader = /* glsl */ `
  ${skyNoise}
  vec2 project(vec3 d, mat3 frame) {
    float f=dot(d,frame[2]);
    return vec2(atan(dot(d,frame[0]),f),atan(dot(d,frame[1]),f));
  }
  vec3 galaxy(vec2 p, vec2 size) {
    float x=p.x, y=p.y;
    float lens=1.0-smoothstep(size.x*0.72,size.x,abs(x));
    float thickness=0.009+0.024*exp(-x*x/0.13);
    float disc=exp(-pow(y/thickness,2.0)*0.65)*lens;
    float bulge=exp(-x*x/0.023-y*y/0.0036);
    float grain=dust(vec3(x*22.0,y*38.0,7.0));
    float branch=dust(vec3(x*53.0,y*96.0,3.7));
    float laneY=y+0.012+(grain-0.5)*0.037;
    float laneWidth=0.009+branch*0.012;
    float lane=1.0-smoothstep(laneWidth,laneWidth+0.003,abs(laneY));
    float filaments=(1.0-smoothstep(0.03,0.09,abs(y)))*smoothstep(0.54,0.72,branch);
    float transmission=1.0-max(lane*0.998,filaments*0.75);
    // The glow is compact: the sky outside the lens is black, not a grey wash.
    float halo=exp(-x*x/0.19-y*y/0.012)*0.009;
    vec3 light=cWhite*((disc*0.16+bulge*0.72)*transmission+halo)*lens;
    float knots=pow(max(0.0,grain-0.53)*4.0,3.0)*lane*lens;
    return light+cRust*min(knots,1.0)*0.035;
  }
  vec3 wheel(vec2 p, vec2 size) {
    vec2 q=p/size;
    float r=length(q), a=atan(q.y,q.x);
    float arms=pow(0.5+0.5*cos(a*2.0-log(r+0.035)*6.0),5.0);
    float edge=1.0-smoothstep(0.84,1.0,r);
    float dustArm=0.5+0.5*cos(a*2.0-log(r+0.04)*6.0+0.8);
    float disc=exp(-r*3.1)*edge;
    vec3 soft=cWhite*disc*(0.065+arms*0.16)*(1.0-dustArm*0.35);
    return soft+cWhite*exp(-r*r*360.0)*0.38;
  }
  vec3 oddity(vec2 p, vec2 size, int kind) {
    vec2 q=p/size;
    float r=length(q), a=atan(q.y,q.x);
    float edge=1.0-smoothstep(0.8,1.0,r);
    if(kind==0) {
      // Needle: tightly wound light along a thin taper. The tip is a point sprite.
      float spine=exp(-q.y*q.y*30.0)*(1.0-smoothstep(0.5,1.0,abs(q.x)));
      return cWhite*edge*(exp(-r*4.0)*0.08+spine*0.12);
    }
    if(kind==1) {
      // Hollow: tilted thin galaxy, empty oval, a single rim knot. No glow in the hole.
      float rim=exp(-pow((r-0.66)/0.15,2.0));
      float knot=exp(-pow((q.x-0.62)/0.13,2.0)-pow((q.y+0.12)/0.18,2.0));
      return cWhite*(rim*0.105+knot*0.15)*edge*smoothstep(0.39,0.51,r);
    }
    // Eye: broken spiral wrapping a black hollow, never a solid luminous donut.
    float arms=pow(0.5+0.5*cos(a*2.0-log(r+0.025)*6.5),4.0);
    return cWhite*(0.025+arms*0.17)*exp(-pow((r-0.63)/0.24,2.0))*edge*smoothstep(0.26,0.4,r);
  }
  vec3 minor(vec2 p, vec2 size, int kind) {
    vec2 q=p/size;
    if(kind==0) return cCold*exp(-dot(q,q)*3.0)*(0.04+0.035*dust(vec3(q*4.0,21.0)));
    if(kind==1) {
      float a=exp(-dot(q-vec2(-0.35,-0.15),q-vec2(-0.35,-0.15))*28.0);
      float b=exp(-dot(q-vec2(0.35,0.15),q-vec2(0.35,0.15))*32.0);
      float tail=exp(-pow((q.y-q.x*0.35)/0.08,2.0)-q.x*q.x*3.0);
      return cWhite*((a+b)*0.14+tail*0.025);
    }
    return cWhite*exp(-dot(q,q)*5.0)*0.09;
  }
  vec3 atlasLight(vec3 d) {
    vec3 light=vec3(0.0);
    ${SKY_ATLAS.filter((l) => l.kind !== 'star')
      .map((l) => {
        const fn =
          l.kind === 'galaxy'
            ? 'galaxy'
            : l.kind === 'wheel'
              ? 'wheel'
              : ['needle', 'hollow', 'eye'].includes(l.kind)
                ? 'oddity'
                : 'minor';
        const kind =
          fn === 'oddity'
            ? `,${['needle', 'hollow', 'eye'].indexOf(l.kind)}`
            : fn === 'minor'
              ? `,${l.kind === 'cloud' ? 0 : l.kind === 'pair' ? 1 : 2}`
              : '';
        return `if(dot(d,${vec(l.direction)})>0.0) light+=${fn}(project(d,${frame(l)}),${size(l)}${kind});`;
      })
      .join('\n')}
    return light*gain;
  }
`;
