/** QA entry only, never imported by the game. Synthetic optical rays, not encounter evidence. */
import { Vector3 } from 'three';
import { shipDefinition, viewSnapshot } from '../../contracts/fixtures/index.ts';
import type { ViewSnapshot, WindowCloudBank, WindowFunnel } from '../../contracts/index.ts';
import { applyTheme } from '../../theme/index.ts';
import { attitudeToScene } from '../adapter.ts';
import { createHomeWindow, HOME_SHOT } from '../opening/home.ts';
import { RoomView } from '../room/RoomView.ts';
import '../../app/opening/opening.css';

applyTheme(document.documentElement);
document.querySelector<HTMLElement>('#labels')!.style.display = 'none';
const ignore = () => {};
const room = new RoomView(
  document.querySelector<HTMLCanvasElement>('#view')!,
  document.querySelector<HTMLDivElement>('#labels')!,
  shipDefinition,
  {
    mode: ignore,
    hot: ignore,
    pointerLock: ignore,
    consoleArrived: ignore,
    loss: ignore,
    flightPick: ignore,
    blackBox: ignore,
  },
  { scripted: true },
);
const attitude = { w: Math.SQRT1_2, x: 0, y: 0, z: -Math.SQRT1_2 };
const inertialFromRoom = attitudeToScene(attitude);
function ray(v: Vector3) {
  const d = v.clone().normalize().applyQuaternion(inertialFromRoom);
  return { x: d.x, y: -d.z, z: d.y };
}
function funnel(
  id: string,
  mouth: Vector3,
  axis: Vector3,
  scale: number,
  phase: WindowFunnel['phase'],
): WindowFunnel {
  const across = new Vector3().crossVectors(axis, new Vector3(0, 1, 0)).normalize();
  const up = new Vector3().crossVectors(axis, across).normalize();
  const segments: WindowFunnel['segments'][number][] = [];
  const at = (t: number, a: number) => {
    const radius = (0.012 + 0.11 * (1 - t) ** 2) * scale;
    return mouth
      .clone()
      .addScaledVector(axis, t * 0.58 * scale)
      .addScaledVector(across, Math.cos(a) * radius)
      .addScaledVector(up, Math.sin(a) * radius);
  };
  for (let j = 0; j <= 24; j++)
    for (let i = 0; i < 48; i++) {
      const t = j / 24;
      segments.push({
        from: ray(at(t, (i * Math.PI) / 24)),
        to: ray(at(t, ((i + 1) * Math.PI) / 24)),
        depth: 1 - t,
      });
    }
  for (let i = 0; i < 12; i++)
    for (let j = 0; j < 24; j++)
      segments.push({
        from: ray(at(j / 24, (i * Math.PI) / 6)),
        to: ray(at((j + 1) / 24, (i * Math.PI) / 6)),
        depth: 1 - j / 24,
      });
  return {
    kind: 'funnel',
    id,
    schema: 'well-optical-v1',
    observedAt: 0,
    visible: true,
    phase,
    brightness: phase === 'precursor' ? 0.4 : phase === 'ramping' ? 0.5 : 0.8,
    segments,
  };
}
const funnels = [
  funnel(
    'side',
    new Vector3(-0.42, 0.16, -1),
    new Vector3(0.64, -0.6, -0.48).normalize(),
    1,
    'active',
  ),
  funnel(
    'end',
    new Vector3(0.45, 0.04, -1),
    new Vector3(0.02, 0.03, -1).normalize(),
    0.9,
    'active',
  ),
  funnel(
    'birth',
    new Vector3(-0.04, 0.16, -1),
    new Vector3(0.48, -0.8, -0.4).normalize(),
    0.5,
    'ramping',
  ),
];
const patches: WindowCloudBank['patches'][number][] = [];
for (let i = 0; i < 90; i++)
  for (let j = 0; j < 9; j++) {
    const az = -0.7 + (i / 89) * 1.4,
      el = -0.09 + Math.sin(az * 2) * 0.06 + j * 0.022;
    patches.push({
      direction: ray(new Vector3(Math.sin(az), el, -Math.cos(az))),
      angularRadius: 0.05,
      brightness: (1 - j / 10) * Math.sin(((i + 1) / 91) * Math.PI),
    });
  }
const clouds: WindowCloudBank = { kind: 'cloud-bank', id: 'fixture-crescent', patches };
let home: ReturnType<typeof createHomeWindow> | undefined;
let mode = 'sky';
const heading = document.createElement('main');
heading.className = 'rx-opening';
heading.innerHTML = '<h1 class="rx-opening-title">RECURSION</h1>';
heading.hidden = true;
document.body.append(heading);
function show(next: string) {
  mode = next;
  room.setWindowScenery(null);
  home?.dispose();
  home = undefined;
  heading.style.display = mode === 'title' ? 'grid' : 'none';
  if (mode === 'home' || mode === 'lens') {
    home = createHomeWindow();
    room.setWindowScenery(home.scenery);
    home.setLens(mode === 'lens' ? { az: -9.5, el: 3.2, einstein: 1.4, shadow: 0.08 } : null);
  }
}
Object.assign(window, { __vx: { show, stats: () => room.outsideStats() } });
function draw() {
  if (home) room.renderScriptedShot(HOME_SHOT);
  else {
    const snapshot: ViewSnapshot = {
      ...viewSnapshot,
      t: 0,
      world: { ...viewSnapshot.world, ship: { ...viewSnapshot.world.ship, attitude } },
      window: {
        objects: [],
        sunlit: true,
        fields:
          mode === 'funnels'
            ? funnels
            : mode === 'precursors' || mode === 'birth'
              ? funnels.map((f) => ({
                  ...f,
                  phase: mode === 'birth' ? 'ramping' : 'precursor',
                  brightness: 0.5,
                }))
              : mode === 'clouds'
                ? [clouds]
                : [],
      },
    };
    room.frame(
      0,
      {
        snapshot,
        chart: { regions: [], corridors: [], leads: [] },
        recording: false,
        clearance: 0,
      },
      HOME_SHOT,
    );
    room.renderScriptedShot(HOME_SHOT);
  }
  requestAnimationFrame(draw);
}
show('sky');
requestAnimationFrame(draw);
