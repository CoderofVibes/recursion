/** Static, direction-space noise: no clock, twinkling, texture downloads or shader randomness. */
export const skyNoise = /* glsl */ `
  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  float noise3(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f*f*(3.0-2.0*f);
    return mix(mix(mix(hash31(i),hash31(i+vec3(1,0,0)),f.x),
                   mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),
                   mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z);
  }
  float dust(vec3 p) {
    float v = 0.0, a = 0.55;
    for (int i=0; i<5; i++) { v += a*noise3(p); p = p*2.07+vec3(13.1,7.7,4.3); a *= 0.49; }
    return v;
  }
`;
