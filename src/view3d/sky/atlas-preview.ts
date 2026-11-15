/** QA only. Uses the shipping renderer; never imported by the app. */
import { Color, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { colour } from '../../theme/index.ts';
import { COVERAGE_DIRECTIONS, DEEP_POLE, DEG, SKY_ATLAS, atlasLandmark } from './atlas.ts';
import { createDeepSky } from './index.ts';

const renderer = new WebGLRenderer({
  canvas: document.querySelector<HTMLCanvasElement>('#view')!,
  antialias: true,
  preserveDrawingBuffer: true,
});
const scene = new Scene(),
  sky = createDeepSky();
scene.add(sky.object);
sky.setSun(undefined);
const camera = new PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 10000);
const render = (
  direction: Vector3,
  fov: number,
  width = innerWidth,
  height = innerHeight,
  up = new Vector3(0, 1, 0),
) => {
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.fov = fov;
  camera.up.copy(up);
  camera.lookAt(direction);
  camera.updateProjectionMatrix();
  sky.followEye(camera, renderer);
  renderer.render(scene, camera);
};
function show(name: string, detail = false) {
  const l = atlasLandmark(name);
  render(l.direction, detail ? 10 : 68, innerWidth, innerHeight, l.up);
  return {
    name,
    verticalFov: camera.fov,
    horizontalFov: (2 * Math.atan(Math.tan((camera.fov * DEG) / 2) * camera.aspect)) / DEG,
    draws: renderer.info.render.calls,
    points: renderer.info.render.points,
  };
}
function pixels() {
  const gl = renderer.getContext(),
    w = renderer.domElement.width,
    h = renderer.domElement.height;
  const data = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data);
  let peak = 0,
    total = 0,
    quiet = 0,
    count = 0;
  const linear = (s: number) => (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4);
  const luminance = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const lab = (r: number, g: number, b: number) => {
    const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
    const y = f(luminance(r, g, b));
    return [
      116 * y - 16,
      500 * (f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047) - y),
      200 * (y - f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883)),
    ];
  };
  let red = 0,
    green = 0,
    blue = 0,
    maxLuminance = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (((x + 0.5) / w - 0.5) ** 2 + ((y + 0.5) / h - 0.5) ** 2 > 0.25) continue;
      const i = (y * w + x) * 4,
        light = Math.max(data[i]!, data[i + 1]!, data[i + 2]!);
      const r = linear(data[i]! / 255),
        g = linear(data[i + 1]! / 255),
        b = linear(data[i + 2]! / 255);
      red += r;
      green += g;
      blue += b;
      maxLuminance = Math.max(maxLuminance, luminance(r, g, b));
      peak = Math.max(peak, light);
      total += light;
      count++;
      if (light < 12) quiet++;
    }
  const measured = new Color(colour.measured);
  // Equal-lightness colour comparison: darkness alone cannot pass the hue-separation test.
  const sum = luminance(red, green, blue);
  const meanLab = sum > 0 ? lab((red * 0.5) / sum, (green * 0.5) / sum, (blue * 0.5) / sum) : null;
  const hueSeparation = Object.fromEntries(
    ['forecast', 'thrust', 'velocity', 'blackbox', 'caution', 'warning'].map((role) => {
      const c = new Color(colour[role as keyof typeof colour]);
      const k = 0.5 / luminance(c.r, c.g, c.b),
        target = lab(c.r * k, c.g * k, c.b * k);
      return [role, meanLab ? Math.hypot(...meanLab.map((v, i) => v - target[i]!)) : null];
    }),
  );
  return {
    peak,
    mean: total / count,
    quietFraction: quiet / count,
    measuredLineFraction: maxLuminance / luminance(measured.r, measured.g, measured.b),
    hueSeparation,
  };
}
function audit() {
  // Exclude field stars: a bright random star cannot pass the diffuse landmark check.
  sky.object.children[1]!.visible = false;
  const cones = COVERAGE_DIRECTIONS.map((d, i) => {
    render(d, 60, 512, 512);
    return { cone: i, exempt: d.angleTo(DEEP_POLE) < 30 * DEG, ...pixels() };
  });
  const landmarks = SKY_ATLAS.filter((l) => l.kind !== 'star').map((l) => {
    render(l.direction, 60, 512, 512, l.up);
    return { id: l.id, ...pixels() };
  });
  sky.object.children[1]!.visible = true;
  show('galaxy');
  return { cones, landmarks };
}
Object.assign(window, { __atlas: { show, audit } });
show('galaxy');
