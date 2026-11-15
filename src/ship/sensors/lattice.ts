/** Truth-side acquisition only. Geometry never leaves this module; recorded rays do. */
import baseline from '../../../data/ship-baseline.json';
import type { Measurement } from '../../contracts/measurements.ts';
import type { ShipDefinition } from '../../contracts/ship.ts';
import type {
  EnvironmentEffects,
  EquipmentState,
  ShipSystemsState,
} from '../../contracts/truth/ship.ts';
import type { JsonValue } from '../../contracts/units.ts';
import { fromRotationVector, rotate, rotateInverse } from '../../lib/quat.ts';
import { createRng } from '../../lib/rng.ts';
import {
  add,
  angleBetween,
  cross,
  distance,
  dot,
  length,
  lerp,
  normalize,
  scale,
  sub,
  type Vec3,
} from '../../lib/vec3.ts';
import {
  encodeLatticeFrame,
  type LatticeAngularFragment,
  type LatticeObservationFrame,
} from './lattice-observations.ts';
import { functionAvailable } from '../condition/index.ts';
import { functionalPower } from './functional-power.ts';

export const LATTICE_SENSOR_STREAM = 'sensors.camera/lattice';
export const LATTICE_DIAGNOSTIC_STREAM = 'sensors.camera/lattice-diagnostic';

/** [ASSUMED: S17 black-box.md] Separate channel noise, not ordinary optical precision. */
export const LATTICE_ACQUISITION = Object.freeze({
  slopeSigma: 0.0005,
  maxRange: 1200,
  fragmentLength: 12,
  maxFragments: 96,
  maxFrameBytes: 16 * 1024,
});

export interface LatticeSensorScene {
  readonly kind: 'lattice-scene-v1';
  readonly segments: readonly { readonly a: Vec3; readonly b: Vec3 }[];
  /** Invalid illumination/channel calibration is not a negative detection. */
  readonly valid?: boolean;
}

interface PendingFrame {
  readonly measurement: Measurement;
  readonly remainingBytes: number;
}
interface Memory {
  readonly sequence: number;
  readonly nextAt: number;
  readonly pending?: PendingFrame;
  readonly droppedFrames: number;
  readonly rawStopped: boolean;
  readonly rasterCursor?: number;
}
interface Pointing {
  readonly target?: string | null;
  readonly direction?: Vec3;
  readonly settleUntil?: number;
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

/** Call only at new encounter creation; never reseed during a step/save restoration. */
export function initializeLatticeSensorStreams(
  state: ShipSystemsState,
  seed: string | number,
): ShipSystemsState {
  if (state.rng[LATTICE_SENSOR_STREAM] && state.rng[LATTICE_DIAGNOSTIC_STREAM]) return state;
  return {
    ...state,
    rng: {
      ...state.rng,
      [LATTICE_SENSOR_STREAM]:
        state.rng[LATTICE_SENSOR_STREAM] ??
        createRng(seed).stream(LATTICE_SENSOR_STREAM).getState(),
      [LATTICE_DIAGNOSTIC_STREAM]:
        state.rng[LATTICE_DIAGNOSTIC_STREAM] ??
        createRng(seed).stream(LATTICE_DIAGNOSTIC_STREAM).getState(),
    },
  };
}

export function latticeProcessingRate(
  processorPower: number,
  cameraPower: number,
  recorderRate: number,
): number {
  const p = baseline.sensing.latticeProcessing;
  if (processorPower < p.minPower || cameraPower < baseline.sensing.camera.minTrackingPower)
    return 0;
  const f = clamp((processorPower - p.minPower) / (p.fullPower - p.minPower), 0, 1);
  return Math.min(
    p.minUpdateRate + f * (p.fullUpdateRate - p.minUpdateRate),
    cameraPower / baseline.sensing.camera.referenceTrackingPower,
    recorderRate,
  );
}

export function healthy(
  state: ShipSystemsState,
  definition: ShipDefinition,
  id: string,
  t = state.t,
): EquipmentState | undefined {
  const e = state.equipment[id];
  const spec = definition.equipment.find((s) => s.id === id);
  if (!e || !spec || !functionAvailable(e, t) || e.powerDraw <= 0) return;
  const temperature =
    (spec.thermalNode ? state.thermal[spec.thermalNode] : undefined) ?? e.temperature;
  if (
    temperature !== undefined &&
    (temperature < (spec.params.tempMin ?? -Infinity) ||
      temperature >= (spec.params.tempMax ?? Infinity))
  )
    return;
  if (spec.kind === 'accelerometer' || spec.kind === 'gyro' || spec.kind === 'star-tracker') {
    const hardware = baseline.equipment.find((item) => item.id === id);
    const modes = hardware?.modes as Record<string, { power: number }> | undefined;
    if (functionalPower(e) + 1e-9 < (modes?.[e.mode]?.power ?? spec.ratedPower)) return;
  }
  return e;
}

export function isScene(value: JsonValue): value is JsonValue & LatticeSensorScene {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, JsonValue>;
  return record.kind === 'lattice-scene-v1' && Array.isArray(record.segments);
}

/** Conservatively reject a complete small fragment if any part could lie in an opaque sphere's cone. */
export function shadowed(a: Vec3, b: Vec3, origin: Vec3, env: EnvironmentEffects): boolean {
  const middle = scale(add(a, b), 0.5);
  const sight = sub(middle, origin);
  const range = length(sight);
  const half = distance(a, b) / 2;
  if (range <= half) return true;
  const fragmentAngle = Math.asin(Math.min(1, half / range));
  for (const target of env.targets) {
    const centre = add(env.kinematics.position, target.relativePosition);
    const line = sub(centre, origin);
    const d = length(line);
    if (d <= target.radius) return true;
    if (d - target.radius > range + half) continue;
    if (angleBetween(sight, line) <= Math.asin(Math.min(1, target.radius / d)) + fragmentAngle)
      return true;
  }
  return false;
}

/**
 * Called once per real sensor snapshot. `packetBudgetBytes` is spare capacity in an actual
 * recorder packet after ordinary channels; partial frames are not published to the model.
 * Cadence never backfills missed timestamps. Raw acquisition is optional and stops first.
 */
export function stepLatticeAcquisition(
  state: ShipSystemsState,
  definition: ShipDefinition,
  env: EnvironmentEffects,
  dt: number,
  packetBudgetBytes: number,
  recorderRate: number,
): { state: ShipSystemsState; measurements: Measurement[]; bytes: number } {
  const scenes = Object.entries(env.fieldSignals).filter(
    (entry): entry is [string, JsonValue & LatticeSensorScene] => isScene(entry[1]),
  );
  if (!scenes.length) return { state, measurements: [], bytes: 0 };
  const memory = (state.ext?.latticeAcquisition as unknown as Memory | undefined) ?? {
    sequence: 0,
    nextAt: env.t,
    droppedFrames: 0,
    rawStopped: false,
  };
  let next = { ...memory };
  const packetCapacity = Math.max(0, packetBudgetBytes);
  let packet = packetCapacity;
  const measurements: Measurement[] = [];
  const camera = healthy(state, definition, 'camera', env.t);
  const processor = healthy(state, definition, 'science-processor', env.t);
  const recorder = healthy(state, definition, 'black-box', env.t);
  const imu =
    healthy(state, definition, 'imu-a', env.t) ?? healthy(state, definition, 'imu-b', env.t);
  const tracker =
    healthy(state, definition, 'star-tracker-a', env.t) ??
    healthy(state, definition, 'star-tracker-b', env.t);
  const shipScene = env.fieldSignals['ship-environment'] as
    { opticsValid?: boolean; starsVisible?: boolean } | undefined;
  const aim = (state.ext?.sensorPointing as unknown as Record<string, Pointing> | undefined)
    ?.camera;
  const ready =
    camera &&
    env.t >= (camera.values.readyAt ?? 0) &&
    env.t >= (aim?.settleUntil ?? 0) &&
    shipScene?.opticsValid !== false;
  const rate =
    recorder &&
    camera &&
    processor?.mode === 'lattice' &&
    imu &&
    tracker &&
    shipScene?.starsVisible !== false &&
    length(env.kinematics.angularVelocity) <= baseline.sensing.starTracker.maxAngularRate
      ? latticeProcessingRate(functionalPower(processor), functionalPower(camera), recorderRate)
      : 0;
  let rng = state.rng;

  // An unfinished frame exists in volatile processing memory, not in the archive. A processor
  // outage cannot later turn its unrecorded tail into evidence merely by restoring power.
  if (next.pending && !processor)
    next = { ...next, pending: undefined, droppedFrames: next.droppedFrames + 1 };

  const retain = () => {
    if (!next.pending || packet <= 0 || !recorder) return;
    const used = Math.min(packet, next.pending.remainingBytes);
    packet -= used;
    const remainingBytes = next.pending.remainingBytes - used;
    if (remainingBytes === 0) {
      // This field-signal becomes a valid processed product only after its final retained byte.
      // Ray acquisition is preserved separately in the immutable payload; older snapshots are
      // never relabelled as current camera readings or appended out of recorder order.
      measurements.push({ ...next.pending.measurement, t: env.t });
      next = { ...next, pending: undefined };
    } else next = { ...next, pending: { ...next.pending, remainingBytes } };
  };
  retain();
  if (rate > 0 && ready && processor && camera && env.t + 1e-10 >= next.nextAt) {
    next = { ...next, nextAt: env.t + 1 / rate };
    if (next.pending) next = { ...next, droppedFrames: next.droppedFrames + 1 };
    else {
      const cameraSpec = definition.equipment.find((e) => e.id === 'camera')!;
      const mount = cameraSpec.mount?.position ?? cameraSpec.position;
      const origin = add(
        env.kinematics.position,
        rotate(env.kinematics.attitude, sub(mount, state.massProperties.centerOfMass)),
      );
      const locked = aim?.target ? env.targets.find((t) => t.id === aim.target) : undefined;
      const inertialAim = locked
        ? sub(add(env.kinematics.position, locked.relativePosition), origin)
        : aim?.direction;
      const forward = normalize(
        inertialAim
          ? rotateInverse(env.kinematics.attitude, inertialAim)
          : (cameraSpec.mount?.direction ?? { x: 1, y: 0, z: 0 }),
      );
      const right = normalize(
        cross(Math.abs(forward.z) < 0.99 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 }, forward),
      );
      const up = cross(forward, right);
      const exposure = clamp(
        camera.values.exposure ?? baseline.sensing.camera.referenceExposure,
        baseline.sensing.camera.minExposure,
        baseline.sensing.camera.maxExposure,
      );
      const halfAngle = cameraSpec.params.fovHalfAngle ?? baseline.sensing.camera.fovHalfAngle;
      const saved = rng[LATTICE_SENSOR_STREAM];
      if (!saved)
        throw new Error(`Missing initialized sensor RNG stream: ${LATTICE_SENSOR_STREAM}`);
      const noise = createRng(0);
      noise.setState(saved);
      const f = Math.max(0.25, (functionalPower(processor) - 350) / 650);
      const reportedHealth = Math.min(
        ...[camera, processor, imu!, tracker!].map(
          (e) => e.values.reportedCondition ?? e.condition,
        ),
      );
      const trueHealth = Math.min(
        camera.condition,
        processor.condition,
        imu!.condition,
        tracker!.condition,
      );
      const sigma = LATTICE_ACQUISITION.slopeSigma / f / Math.max(Number.EPSILON, reportedHealth);
      const trueSigma = LATTICE_ACQUISITION.slopeSigma / f / trueHealth;
      const basisSigma =
        baseline.sensing.starTracker.angularSigma / Math.max(Number.EPSILON, reportedHealth);
      const trueBasisSigma = baseline.sensing.starTracker.angularSigma / trueHealth;
      const basisError = fromRotationVector({
        x: noise.normal(0, trueBasisSigma),
        y: noise.normal(0, trueBasisSigma),
        z: noise.normal(0, trueBasisSigma),
      });
      // Only the measured encoder/attitude basis leaves acquisition. Emitting the exact body
      // projection of a commanded inertial aim would expose noiseless true ship attitude.
      const measuredBasis = {
        forward: rotate(basisError, forward),
        right: rotate(basisError, right),
        up: rotate(basisError, up),
      };
      const maxFragments = Math.max(
        1,
        Math.floor(LATTICE_ACQUISITION.maxFragments * Math.min(1, f)),
      );
      const fieldEntry = scenes[next.sequence % scenes.length]!;
      const [field, scene] = fieldEntry;
      const id = `${field}:frame:${next.sequence}`;
      const fragments: LatticeAngularFragment[] = [];
      const candidates: { av: Vec3; bv: Vec3; row: number; column: number }[] = [];
      if (scene.valid !== false)
        for (const segment of scene.segments) {
          const pieces = Math.max(
            1,
            Math.ceil(distance(segment.a, segment.b) / LATTICE_ACQUISITION.fragmentLength),
          );
          for (let part = 0; part < pieces; part++) {
            const a = lerp(segment.a, segment.b, part / pieces);
            const b = lerp(segment.a, segment.b, (part + 1) / pieces);
            const av = rotateInverse(env.kinematics.attitude, sub(a, origin));
            const bv = rotateInverse(env.kinematics.attitude, sub(b, origin));
            if (
              length(av) > LATTICE_ACQUISITION.maxRange ||
              length(bv) > LATTICE_ACQUISITION.maxRange ||
              dot(av, forward) <= 0 ||
              dot(bv, forward) <= 0 ||
              angleBetween(av, forward) >= halfAngle ||
              angleBetween(bv, forward) >= halfAngle ||
              shadowed(a, b, origin, env)
            )
              continue;
            const relativeMotion = cross(
              normalize(add(av, bv)),
              rotateInverse(env.kinematics.attitude, env.kinematics.velocity),
            );
            if (
              (length(env.kinematics.angularVelocity) +
                length(relativeMotion) / Math.max(1, length(av))) *
                exposure >
              baseline.sensing.camera.maxSmearAngle
            )
              continue;
            const midpoint = add(av, bv);
            candidates.push({
              av,
              bv,
              row: dot(midpoint, up) / dot(midpoint, forward),
              column: dot(midpoint, right) / dot(midpoint, forward),
            });
          }
        }
      // Raster through acquired image support. A finite per-frame budget must not permanently
      // starve later strands merely because they came later in a truth array.
      candidates.sort((a, b) => a.row - b.row || a.column - b.column);
      const truncated = candidates.length > maxFragments;
      const offset = candidates.length ? (next.rasterCursor ?? 0) % candidates.length : 0;
      for (let i = 0; i < Math.min(maxFragments, candidates.length); i++) {
        const { av, bv } = candidates[(offset + i) % candidates.length]!;
        const slopes = (v: Vec3): [number, number] => [
          noise.normal(dot(v, right) / dot(v, forward), trueSigma),
          noise.normal(dot(v, up) / dot(v, forward), trueSigma),
        ];
        fragments.push({
          id: `${id}:fragment:${fragments.length}`,
          start: slopes(av),
          end: slopes(bv),
          sigma,
        });
      }
      const frame: LatticeObservationFrame = {
        version: 2,
        id,
        field,
        sequence: next.sequence,
        // The environment is one instant: never fabricate an integrated earlier scene.
        acquisition: [env.t, env.t],
        availableAt: env.t,
        source: 'camera',
        processorPower: processor.powerDraw,
        cameraPower: camera.powerDraw,
        effectiveRate: rate,
        exposure,
        basis: measuredBasis,
        basisSigma,
        basisCorrelation: 'frame-common-rotation',
        coverage: {
          status: 'unresolved',
          halfAngle,
          rangeLimit: LATTICE_ACQUISITION.maxRange,
          angularResolution: sigma,
          truncated: truncated || scene.valid === false,
        },
        fragments,
      };
      let measurement = encodeLatticeFrame(frame);
      // Reserve a Float64 textual timestamp's maximum width for completion-time replacement.
      while (
        jsonBytes(measurement) + 24 > LATTICE_ACQUISITION.maxFrameBytes &&
        fragments.length > 0
      ) {
        fragments.pop();
        measurement = encodeLatticeFrame({
          ...frame,
          coverage: { ...frame.coverage, truncated: true },
          fragments,
        });
      }
      next = {
        ...next,
        sequence: next.sequence + 1,
        rasterCursor: candidates.length ? (offset + fragments.length) % candidates.length : 0,
        pending: { measurement, remainingBytes: jsonBytes(measurement) + 24 },
      };
      rng = { ...rng, [LATTICE_SENSOR_STREAM]: noise.getState() };
      retain();
    }
  }
  const rawRequested =
    recorder?.mode === 'high' && camera?.mode === 'detail' && processor?.mode === 'lattice';
  const rawBytes =
    rawRequested && ready ? baseline.recorder.rawFrameRateBytes * Math.max(0, dt) : 0;
  const headroom = Math.max(
    0,
    state.recorder.capacity - baseline.recorder.reservedEventCapacity - state.recorder.bytesUsed,
  );
  const rawAccepted = rawBytes <= headroom ? rawBytes : 0;
  next = { ...next, rawStopped: rawRequested === true && rawAccepted < rawBytes };
  return {
    state: {
      ...state,
      rng,
      recorder: { ...state.recorder, bytesUsed: state.recorder.bytesUsed + rawAccepted },
      ext: { ...state.ext, latticeAcquisition: next as unknown as JsonValue },
    },
    measurements,
    bytes: packetCapacity - packet,
  };
}
