/** Trailer-only truth staging. This module must never enter the production game graph. */
import type {
  BelievedField,
  JsonValue,
  ViewSnapshot,
  WindowFunnel,
} from '../../../contracts/index.ts';
import { multiply, fromAxisAngle } from '../../../lib/quat.ts';
import { motion } from '../../../theme/index.ts';
import type { WellFunnelVisual } from '../../../view3d/fields/wells/funnel.ts';
import type { RoomFrame } from '../../../view3d/room/RoomView.ts';
import capture from './fixture.json';

export const provenance = capture.provenance;
const snapshot = capture.snapshot as unknown as ViewSnapshot;
export const optics = snapshot.window!.fields!.filter(
  (f): f is WindowFunnel => f.kind === 'funnel',
);
const byId = new Map(capture.geometry.map((g) => [g.id, g]));
const stations = [0, 0.15, 0.3, 0.45, 0.6, 0.73, 0.84, 0.93, 1];
const estimate = (value: number) => ({ value, sigma: 0 });

// Every window entry, including its frozen ramp/precursor brightness. No invented sites.
export const stagedFields: readonly BelievedField[] = optics.map((optical) => {
  const g = byId.get(optical.id)!;
  const visual: WellFunnelVisual = {
    schema: 'well-funnel-observation-v2',
    provenance: {
      attemptId: 'trailer-staged-wells',
      frameId: 'trailer-truth-geometry',
      measurementIds: ['staged-not-acquired'],
      from: snapshot.t,
      to: snapshot.t,
      current: true,
    },
    support: 'supported',
    validUntil: snapshot.t,
    rule: 'ordinary',
    responses: [],
    phase: optical.phase,
    brightness: optical.brightness,
    geometry: {
      mouth: g.mouth,
      axis: g.axis,
      mouthSigma: 0,
      axisSigma: 0,
      length: estimate(g.length),
      mouthRadius: estimate(g.mouthRadius),
      throatRadius: estimate(g.throatRadius),
      stations: stations.map((fraction) => ({
        fraction,
        radius: estimate(g.throatRadius + (g.mouthRadius - g.throatRadius) * (1 - fraction) ** 2),
      })),
    },
  };
  return {
    id: optical.id,
    kind: 'tv-well',
    detected: true,
    visual: visual as unknown as JsonValue,
  };
});

/** The torque is display-only: eased-in yaw, at no more than the theme's display turn rate. */
export function pullYaw(local: number): number {
  const elapsed = Math.max(0, local - motion.settle / 1000);
  const ramp = motion.settle / 1000;
  return (
    motion.maxDisplayTurn * (elapsed < ramp ? (elapsed * elapsed) / (2 * ramp) : elapsed - ramp / 2)
  );
}

const chart = { regions: [], corridors: [], leads: [] };
export function wellsFrame(local: number): RoomFrame {
  return {
    chart,
    recording: false,
    clearance: 0,
    snapshot: {
      ...snapshot,
      objectives: [],
      coverage: { cones: [] },
      // The same VX optical entries are prebuilt once by this scene's native funnel renderer.
      window: { ...snapshot.window!, fields: [] },
      world: {
        ...snapshot.world,
        bodies: [],
        asteroids: [],
        fields: stagedFields,
        ship: {
          ...snapshot.world.ship,
          // The staged map uses the optical eye, rather than the erroneous Newtonian estimate.
          position: capture.shipKinematics.position,
          attitude: multiply(
            capture.shipKinematics.attitude,
            fromAxisAngle({ x: 0, y: 0, z: 1 }, pullYaw(local)),
          ),
        },
      },
    },
  };
}
