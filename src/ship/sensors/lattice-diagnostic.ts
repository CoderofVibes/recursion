/** A16's <=1KiB uninterpreted image. This is acquisition, not lattice reconstruction. */
import baseline from '../../../data/ship-baseline.json';
import { functionalPower } from './functional-power.ts';
import type { Measurement } from '../../contracts/measurements.ts';
import type { ShipDefinition } from '../../contracts/ship.ts';
import type { EnvironmentEffects, ShipSystemsState } from '../../contracts/truth/ship.ts';
import type { JsonValue } from '../../contracts/units.ts';
import { rotate, rotateInverse } from '../../lib/quat.ts';
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
  healthy,
  isScene,
  shadowed,
  LATTICE_ACQUISITION,
  LATTICE_DIAGNOSTIC_STREAM,
} from './lattice.ts';
import {
  encodeLatticeDiagnostic,
  LATTICE_DIAGNOSTIC_MAX_BYTES,
  type LatticeDiagnosticTile,
} from './lattice-diagnostic-observations.ts';

interface Memory {
  readonly nextAt: number;
  readonly sequence: number;
  readonly lastRetainedAt?: number;
  readonly missedSlots: number;
}
interface Pointing {
  readonly target?: string | null;
  readonly direction?: Vec3;
  readonly settleUntil?: number;
}
const memoryOf = (state: ShipSystemsState, t: number): Memory =>
  (state.ext?.latticeDiagnostic as unknown as Memory | undefined) ?? {
    nextAt: t,
    sequence: 0,
    missedSlots: 0,
  };
const clamp = (x: number, low: number, high: number) => Math.min(high, Math.max(low, x));

/** A scheduling request only; the caller must supply a real recorder packet and delivered watts. */
export function latticeDiagnosticSchedule(
  state: ShipSystemsState,
  definition: ShipDefinition,
  env: EnvironmentEffects,
): { readonly due: boolean; readonly rate: number } {
  const camera = healthy(state, definition, 'camera', env.t);
  const processor = healthy(state, definition, 'science-processor', env.t);
  const recorder = healthy(state, definition, 'black-box', env.t);
  const scene = env.fieldSignals['ship-environment'] as { opticsValid?: boolean } | undefined;
  const aim = (state.ext?.sensorPointing as unknown as Record<string, Pointing> | undefined)
    ?.camera;
  const exposure = clamp(
    camera?.values.exposure ?? baseline.sensing.camera.referenceExposure,
    baseline.sensing.camera.minExposure,
    baseline.sensing.camera.maxExposure,
  );
  const ready =
    camera &&
    processor &&
    recorder &&
    functionalPower(recorder) >= baseline.recorder.powerMinimum &&
    state.recorder.sampleRate > 0 &&
    length(env.kinematics.angularVelocity) * exposure <= baseline.sensing.camera.maxSmearAngle &&
    functionalPower(processor) >= 40 &&
    functionalPower(camera) >= baseline.sensing.camera.minTrackingPower &&
    env.t >= (camera.values.readyAt ?? 0) &&
    env.t >= (aim?.settleUntil ?? 0) &&
    scene?.opticsValid !== false &&
    Object.values(env.fieldSignals).some((signal) => isScene(signal) && signal.valid !== false);
  const rate = ready
    ? Math.min(1, functionalPower(camera) / baseline.sensing.camera.referenceTrackingPower)
    : 0;
  return { due: rate > 0 && env.t + 1e-10 >= memoryOf(state, env.t).nextAt, rate };
}

/** Retains only an actual current image. Insufficient bytes drop this slot; there is no delayed raw image queue. */
export function stepLatticeDiagnostic(
  state: ShipSystemsState,
  definition: ShipDefinition,
  env: EnvironmentEffects,
  packetBudgetBytes: number,
): { state: ShipSystemsState; measurements: Measurement[]; bytes: number } {
  const schedule = latticeDiagnosticSchedule(state, definition, env);
  const recorder = healthy(state, definition, 'black-box', env.t);
  if (
    !schedule.due ||
    !recorder ||
    functionalPower(recorder) < baseline.recorder.powerMinimum ||
    state.recorder.sampleRate <= 0
  )
    return { state, measurements: [], bytes: 0 };
  const memory = memoryOf(state, env.t);
  const next = { ...memory, nextAt: env.t + 1 / schedule.rate, sequence: memory.sequence + 1 };
  const camera = healthy(state, definition, 'camera', env.t)!;
  const processor = healthy(state, definition, 'science-processor', env.t)!;
  const spec = definition.equipment.find((e) => e.id === 'camera')!;
  const origin = add(
    env.kinematics.position,
    rotate(
      env.kinematics.attitude,
      sub(spec.mount?.position ?? spec.position, state.massProperties.centerOfMass),
    ),
  );
  const aim = (state.ext?.sensorPointing as unknown as Record<string, Pointing> | undefined)
    ?.camera;
  const target = aim?.target ? env.targets.find((t) => t.id === aim.target) : undefined;
  const inertialAim = target
    ? sub(add(env.kinematics.position, target.relativePosition), origin)
    : aim?.direction;
  const forward = normalize(
    inertialAim
      ? rotateInverse(env.kinematics.attitude, inertialAim)
      : (spec.mount?.direction ?? { x: 1, y: 0, z: 0 }),
  );
  const right = normalize(
    cross(Math.abs(forward.z) < 0.99 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 }, forward),
  );
  const up = cross(forward, right);
  const halfAngle = spec.params.fovHalfAngle ?? baseline.sensing.camera.fovHalfAngle;
  const extent = Math.tan(halfAngle);
  const exposure = clamp(
    camera.values.exposure ?? baseline.sensing.camera.referenceExposure,
    baseline.sensing.camera.minExposure,
    baseline.sensing.camera.maxExposure,
  );
  const scenes = Object.entries(env.fieldSignals).filter(
    (entry) => isScene(entry[1]) && entry[1].valid !== false,
  );
  const [field, rawScene] = scenes[memory.sequence % scenes.length]!;
  if (!isScene(rawScene)) throw new Error('diagnostic scene changed during snapshot');
  const pixels: (number | null)[] = Array(64).fill(0) as number[];
  const ray = (u: number, v: number): Vec3 =>
    normalize(add(forward, add(scale(right, u), scale(up, v))));
  for (let row = 0; row < 8; row++)
    for (let column = 0; column < 8; column++) {
      const u0 = ((column / 8) * 2 - 1) * extent,
        u1 = (((column + 1) / 8) * 2 - 1) * extent;
      const v0 = ((row / 8) * 2 - 1) * extent,
        v1 = (((row + 1) / 8) * 2 - 1) * extent;
      const corners = [ray(u0, v0), ray(u0, v1), ray(u1, v0), ray(u1, v1)];
      if (
        corners.some((direction) => angleBetween(direction, forward) > halfAngle) ||
        shadowed(
          add(
            origin,
            rotate(env.kinematics.attitude, scale(corners[0]!, LATTICE_ACQUISITION.maxRange)),
          ),
          add(
            origin,
            rotate(env.kinematics.attitude, scale(corners[3]!, LATTICE_ACQUISITION.maxRange)),
          ),
          origin,
          env,
        )
      )
        pixels[row * 8 + column] = null;
    }
  let visible = false;
  for (const segment of rawScene.segments) {
    const pieces = Math.max(
      1,
      Math.ceil(distance(segment.a, segment.b) / LATTICE_ACQUISITION.fragmentLength),
    );
    for (let piece = 0; piece < pieces; piece++) {
      const a = lerp(segment.a, segment.b, piece / pieces),
        b = lerp(segment.a, segment.b, (piece + 1) / pieces);
      const av = rotateInverse(env.kinematics.attitude, sub(a, origin)),
        bv = rotateInverse(env.kinematics.attitude, sub(b, origin));
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
      const motion = cross(
        normalize(add(av, bv)),
        rotateInverse(env.kinematics.attitude, env.kinematics.velocity),
      );
      if (
        (length(env.kinematics.angularVelocity) + length(motion) / Math.max(1, length(av))) *
          exposure >
        baseline.sensing.camera.maxSmearAngle
      )
        continue;
      visible = true;
      const project = (v: Vec3): readonly [number, number] => [
        (dot(v, right) / dot(v, forward) / extent + 1) * 4,
        (dot(v, up) / dot(v, forward) / extent + 1) * 4,
      ];
      const p = project(av),
        q = project(bv);
      const samples = Math.max(
        1,
        Math.ceil(Math.max(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1])) * 4),
      );
      for (let j = 0; j <= samples; j++) {
        const column = Math.floor(p[0] + ((q[0] - p[0]) * j) / samples),
          row = Math.floor(p[1] + ((q[1] - p[1]) * j) / samples);
        if (row >= 0 && row < 8 && column >= 0 && column < 8 && pixels[row * 8 + column] !== null)
          pixels[row * 8 + column] = 12;
      }
    }
  }
  // A globally smeared view is unavailable, not an all-dark tile that appears reassuring.
  if (
    !visible &&
    length(env.kinematics.angularVelocity) * exposure > baseline.sensing.camera.maxSmearAngle
  )
    pixels.fill(null);
  const saved = state.rng[LATTICE_DIAGNOSTIC_STREAM];
  if (!saved)
    throw new Error(`Missing initialized sensor RNG stream: ${LATTICE_DIAGNOSTIC_STREAM}`);
  const noise = createRng(0);
  noise.setState(saved);
  const declaredSigma = Math.min(
    15,
    Math.ceil(
      Math.sqrt(
        1 / Math.max(Number.EPSILON, camera.values.reportedCondition ?? camera.condition) ** 2 +
          1 / 12,
      ),
    ),
  );
  for (let i = 0; i < pixels.length; i++)
    if (pixels[i] !== null)
      pixels[i] = clamp(Math.round(noise.normal(pixels[i]!, 1 / camera.condition)), 0, 15);
  const tile: LatticeDiagnosticTile = {
    version: 1,
    id: `${field}:diagnostic:${memory.sequence}`,
    field,
    source: 'camera',
    sequence: memory.sequence,
    acquisition: [env.t, env.t],
    availableAt: env.t,
    halfAngle,
    exposure,
    cameraPower: camera.powerDraw,
    processorPower: processor.powerDraw,
    acquisitionRate: schedule.rate,
    sincePrevious: memory.lastRetainedAt === undefined ? null : env.t - memory.lastRetainedAt,
    size: 8,
    pixels,
    pixelSigma: declaredSigma,
    coverage: 'unresolved',
  };
  const measurement = encodeLatticeDiagnostic(tile);
  const bytes = new TextEncoder().encode(JSON.stringify(measurement)).length;
  const retained = bytes <= LATTICE_DIAGNOSTIC_MAX_BYTES && bytes <= packetBudgetBytes;
  return {
    state: {
      ...state,
      rng: { ...state.rng, [LATTICE_DIAGNOSTIC_STREAM]: noise.getState() },
      ext: {
        ...state.ext,
        latticeDiagnostic: {
          ...next,
          missedSlots: memory.missedSlots + Number(!retained),
          ...(retained ? { lastRetainedAt: env.t } : {}),
        } as unknown as JsonValue,
      },
    },
    measurements: retained ? [measurement] : [],
    bytes: retained ? bytes : 0,
  };
}
