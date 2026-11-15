/**
 * Development-only visual fixture. These are authored display observations, NOT a physics
 * run or a reconstruction claim. Production receives its fragments from retained sensor fits.
 */
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Color, Group, PerspectiveCamera, Scene, Vector2, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { viewSnapshot } from '../../../contracts/fixtures/index.ts';
import type { Vec3 } from '../../../contracts/index.ts';
import { ChainLinkPanel } from '../../../console/encounters/chain-link/ChainLinkPanel.tsx';
import type { ReconstructionMode } from '../../../console/encounters/chain-link/ChainLinkPanel.tsx';
import {
  applyTheme,
  colour,
  hex,
  holoLines,
  motion,
  opacity,
  render,
} from '../../../theme/index.ts';
import { LineSet, label, thin } from '../../gfx.ts';
import type { LatticeStrand, LatticeVisual } from './data.ts';
import { boxEdges } from './geometry.ts';
import { makeLatticeView } from './LatticeView.ts';
import './preview.css';

applyTheme(document.documentElement);
const viewport = document.createElement('div');
viewport.className = 'lp-viewport';
document.body.append(viewport);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
viewport.append(renderer.domElement);
const tags = new CSS2DRenderer();
tags.domElement.className = 'lp-tags';
viewport.append(tags.domElement);
const scene = new Scene();
scene.background = new Color(hex(colour.viewBackground));
const camera = new PerspectiveCamera(42, 1, 1, 4000);
camera.position.set(-265, 164, 256);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(35, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = motion.cameraDamping;
controls.update();
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(
  new UnrealBloomPass(
    new Vector2(1, 1),
    render.bloom.strength,
    render.bloom.radius,
    render.bloom.threshold,
  ),
);
composer.addPass(new OutputPass());
const group = new Group();
scene.add(group);
const lines = new LineSet();
const view = makeLatticeView({ group, lines });
// Fixture measured ship envelopes: hull and deployed panels remain separate occupied volumes.
const hull = { center: { x: -45, y: 0, z: 0 }, halfSize: { x: 7, y: 2, z: 2 } };
for (const box of [
  hull,
  { center: { x: -45, y: 8, z: 0 }, halfSize: { x: 3, y: 6, z: 0.2 } },
  { center: { x: -45, y: -8, z: 0 }, halfSize: { x: 3, y: 6, z: 0.2 } },
])
  scene.add(lines.fatSegs(boxEdges(box), holoLines.trueHull));
const shipTag = label('SHIP · DEPLOYED ENVELOPE');
shipTag.position.set(-45, -9, 0);
scene.add(shipTag);
const floor: number[] = [];
for (let i = -160; i <= 240; i += 40) {
  floor.push(-100, -115, i, 240, -115, i, i, -115, -160, i, -115, 160);
}
scene.add(thin(floor, colour.grid, opacity.gridMinor));

const fragments: LatticeStrand[] = [];
for (let layer = 0; layer < 3; layer++)
  for (let row = -1; row <= 1; row++)
    for (let column = -1; column <= 1; column++) {
      const y = column * 80 + layer * 8;
      const z = row * 80 + layer * 7;
      const point = (dy: number, dz: number): Vec3 => ({
        x: layer * 70 + (y + dy) * layer * 0.08,
        y: y + dy,
        z: z + dz,
      });
      const corners = [point(0, -40), point(40, 0), point(0, 40), point(-40, 0), point(0, -40)];
      for (let edge = 0; edge < 4; edge++) {
        const index = fragments.length;
        fragments.push({
          id: `fixture-fragment:${index}`,
          points: [corners[edge]!, corners[edge + 1]!],
          sigmaM: 0.55 + layer * 0.3,
          confidence: 0.997,
          observedFrom: index * 0.6,
          observedTo: index * 0.6 + 0.6,
          validUntil: 600,
          sampleIds: [`fixture-record:${index}`, `fixture-record:${index + 1}`],
        });
      }
    }
const base: LatticeVisual = {
  schema: 'lattice-observations-v1',
  frameId: 'preview:relative-nav',
  attemptId: 'preview-only',
  updatedAt: 100,
  enabled: true,
  quality: 1,
  processing: { reportedAt: 100, validUntil: 101, available: true },
  requestedVolume: { center: { x: 70, y: 0, z: 0 }, halfSize: { x: 115, y: 125, z: 125 } },
  strands: [],
  coverage: [],
  limitation: 'RECORDED FRAGMENTS · OPENINGS UNRESOLVED',
};
let mode: ReconstructionMode = 'thread';
let retained = 0;
let previousTime = 0;
const previewParams = new URLSearchParams(location.search);
const silent = previewParams.has('silent');
const initialFrame = Number(previewParams.get('frame') ?? 0);
let activeTime = Number.isFinite(initialFrame) ? Math.max(0, initialFrame) * 0.6 : 0;
function animate(ms: number): void {
  const seconds = ms / 1000;
  const dt = Math.min(0.1, seconds - previousTime);
  previousTime = seconds;
  if (mode !== 'off' && !silent) activeTime += dt;
  retained = Math.min(fragments.length, Math.floor(activeTime / 0.6));
  const data = {
    ...base,
    enabled: mode !== 'off',
    updatedAt: retained,
    strands: fragments.slice(0, retained),
    limitation:
      mode === 'off'
        ? 'RECORDING STOPPED · OPENINGS UNRESOLVED'
        : `${retained} RECORDED FRAGMENTS · OPENINGS UNRESOLVED`,
  };
  view.update({
    field: {
      id: 'preview-field',
      kind: 'lattice',
      detected: true,
      visual: JSON.parse(JSON.stringify(data)),
    },
    snapshot: {
      ...viewSnapshot,
      t: silent ? 108 : 100,
      world: {
        ...viewSnapshot.world,
        ship: { ...viewSnapshot.world.ship, position: { x: -45, y: 0, z: 0 } },
      },
    },
    scale: 1,
    radius: 1000,
    inside: () => true,
    dt,
    time: seconds,
  });
  controls.update();
  composer.render();
  tags.render(scene, camera);
  requestAnimationFrame(animate);
}
function resize(): void {
  const width = innerWidth;
  const height = innerHeight;
  renderer.setSize(width, height);
  tags.setSize(width, height);
  composer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  lines.setResolution(width, height);
  lines.setPixelsPerUnit(height / 400);
}
addEventListener('resize', resize);
resize();
requestAnimationFrame(animate);

function Preview() {
  const [selected, setSelected] = useState<ReconstructionMode>('thread');
  const [count, setCount] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setCount(retained), motion.base);
    return () => clearInterval(timer);
  }, []);
  return (
    <>
      <div className="lp-title">
        <span>REC ∙ BLACK BOX / FLIGHT</span>
        <strong>THE UNSEEN CATHEDRAL</strong>
        <span>Measured fragments emerge. Unseen space stays unresolved.</span>
      </div>
      <div className="lp-panel">
        <ChainLinkPanel
          state={{
            mode: selected,
            now: silent ? 108 : 100,
            readings: {
              processor: { reportedAt: 100, validUntil: 101, available: true },
              recorder: { reportedAt: 100, validUntil: 101, available: true },
              sensors: { reportedAt: 100, validUntil: 101, available: true },
              thermal: { reportedAt: 100, validUntil: 101, available: true },
              reconstruction: { reportedAt: 99.4, validUntil: 101, available: selected !== 'off' },
            },
            discovered: true,
            recording: silent || selected !== 'off',
            optionalBytesRemaining: 7_900_000_000,
            recordingBytesPerSecond: 40_960,
            requestedProcessorW: selected === 'thread' ? 1000 : selected === 'survey' ? 350 : 0,
            deliveredProcessorW:
              silent || selected === 'thread' ? 1000 : selected === 'survey' ? 350 : 0,
            chainHeatW: silent || selected === 'thread' ? 1270 : selected === 'survey' ? 620 : 270,
            updatesPerSecond:
              silent || selected === 'thread' ? 5 / 3 : selected === 'survey' ? 0.2 : 0,
            retainedFrames: count,
            diagnosticSnapshot:
              count > 0
                ? { recordedAt: 99, bytes: 1024, sampleId: 'fixture-diagnostic:99' }
                : undefined,
            supportedFragments: count,
            coveredPatches: 0,
            validity: 'Display fixture · no opening clearance certified',
          }}
          onMode={(next) => {
            mode = next;
            setSelected(next);
          }}
        />
      </div>
      <div className="lp-footer">
        <span>DISPLAY FIXTURE · NOT A FLIGHT OR A RECONSTRUCTION VALIDATION</span>
        <span>
          Drag to orbit · scroll to inspect the whole ship · every violet fragment has recorded
          lineage
        </span>
      </div>
    </>
  );
}
createRoot(document.getElementById('lattice-preview')!).render(<Preview />);
