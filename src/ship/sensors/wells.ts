/** R36 truth-side camera acquisition. Only uncertain image bearings leave this module. */
import baseline from '../../../data/ship-baseline.json';
import type { Measurement } from '../../contracts/measurements.ts';
import type { ShipDefinition } from '../../contracts/ship.ts';
import type {
  EnvironmentEffects,
  EquipmentState,
  ShipSystemsState,
} from '../../contracts/truth/ship.ts';
import type { JsonValue } from '../../contracts/units.ts';
import type {
  WellAppearancePhase,
  WellCameraFrame,
  WellImageCovariance,
} from '../../contracts/wells-acquisition.ts';
import { fromRotationVector, rotate, rotateInverse } from '../../lib/quat.ts';
import { createRng } from '../../lib/rng.ts';
import * as v3 from '../../lib/vec3.ts';
import type { Vec3 } from '../../lib/vec3.ts';
import { getGeometry } from '../config/index.ts';
import { opticalQuality } from './index.ts';
import { sensorFunctionAvailable } from './function-available.ts';
import {
  decodeWellCameraFrame,
  encodeWellCameraFrame,
  WELL_CAMERA_FIELD,
  WELL_CAMERA_MAX_CONTOURS,
} from './wells-observations.ts';
import { visibleWellIntervals } from './wells-visibility.ts';

export const WELL_CAMERA_STREAM = 'sensors.camera/well-contours';
/** Finite extraction/buffer limits, not a physical visibility range or a clear-space certificate. */
export const WELL_CAMERA_LIMITS = Object.freeze({
  maxContours: WELL_CAMERA_MAX_CONTOURS,
  maxFrameBytes: 16 * 1024,
  maxSceneSegments: 65_536,
  resolutionSigmas: 3,
});

export interface WellLuminousSegment {
  readonly from: Vec3;
  readonly to: Vec3;
  /** Observable morphology supplied by the light producer, never a birth timer/force diagnosis. */
  readonly phase: WellAppearancePhase;
  /** Separate illumination validity, as with the ordinary camera: power cannot make dark light visible. */
  readonly adequateSignal: boolean;
}
export interface WellsSensorScene {
  readonly kind: 'well-camera-scene-v1';
  readonly t: number;
  readonly valid: boolean;
  readonly truncated: boolean;
  /** Static emissive support in the encounter inertial frame (S22); no moving dust surrogate. */
  readonly segments: readonly WellLuminousSegment[];
}
interface Pending {
  readonly measurement: Measurement;
  readonly remainingBytes: number;
}
interface Memory {
  readonly sequence: number;
  readonly nextAt: number;
  readonly lastAt: number;
  readonly rasterCursor: number;
  readonly droppedFrames: number;
  readonly pending?: Pending;
}
interface Pointing {
  readonly target?: string | null;
  readonly direction?: Vec3;
  readonly settleUntil?: number;
}
const phases = ['unresolved', 'precursor', 'ramping', 'active', 'fading'];
const finiteVec = (v: unknown): v is Vec3 =>
  !!v &&
  typeof v === 'object' &&
  Number.isFinite((v as Vec3).x) &&
  Number.isFinite((v as Vec3).y) &&
  Number.isFinite((v as Vec3).z);
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length + 24;
const sensingOf = (d: ShipDefinition) =>
  (d.systems?.sensing as unknown as typeof baseline.sensing | undefined) ?? baseline.sensing;

export function isWellsSensorScene(value: unknown): value is JsonValue & WellsSensorScene {
  return (
    !!value && typeof value === 'object' && 'kind' in value && value.kind === 'well-camera-scene-v1'
  );
}
function validateScene(scene: WellsSensorScene, t: number): void {
  if (
    scene.t !== t ||
    typeof scene.valid !== 'boolean' ||
    typeof scene.truncated !== 'boolean' ||
    !Array.isArray(scene.segments) ||
    scene.segments.length > WELL_CAMERA_LIMITS.maxSceneSegments ||
    scene.segments.some(
      (s) =>
        !s ||
        !finiteVec(s.from) ||
        !finiteVec(s.to) ||
        !phases.includes(s.phase) ||
        typeof s.adequateSignal !== 'boolean',
    )
  )
    throw new Error('well camera scene must be a bounded, finite CURRENT snapshot');
}
function memoryOf(state: ShipSystemsState, t: number): Memory {
  const m = state.ext?.wellCamera as unknown as Memory | undefined;
  if (!m) return { sequence: 0, nextAt: t, lastAt: t, rasterCursor: 0, droppedFrames: 0 };
  if (
    ![m.nextAt, m.lastAt].every(Number.isFinite) ||
    m.lastAt > t ||
    ![m.sequence, m.rasterCursor, m.droppedFrames].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    ) ||
    (m.pending &&
      (!decodeWellCameraFrame(m.pending.measurement) ||
        m.pending.measurement.t > t ||
        !Number.isSafeInteger(m.pending.remainingBytes) ||
        m.pending.remainingBytes <= 0 ||
        m.pending.remainingBytes > WELL_CAMERA_LIMITS.maxFrameBytes))
  )
    throw new Error('invalid saved well camera state');
  return m;
}

/** Seed once at run/encounter creation. Existing state is never reset or advanced here. */
export function initializeWellCameraStream(
  state: ShipSystemsState,
  seed: string | number,
): ShipSystemsState {
  if (state.rng[WELL_CAMERA_STREAM]) return state;
  return {
    ...state,
    rng: {
      ...state.rng,
      [WELL_CAMERA_STREAM]: createRng(seed).stream(WELL_CAMERA_STREAM).getState(),
    },
  };
}
function healthy(
  state: ShipSystemsState,
  definition: ShipDefinition,
  id: string,
  t: number,
): EquipmentState | undefined {
  const e = state.equipment[id],
    spec = definition.equipment.find((s) => s.id === id);
  if (!spec || !sensorFunctionAvailable(e, t) || !(e.powerDraw > 0)) return;
  const temperature =
    (spec.thermalNode ? state.thermal[spec.thermalNode] : undefined) ?? e.temperature;
  if (
    temperature !== undefined &&
    (temperature < (spec.params.tempMin ?? -Infinity) ||
      temperature >= (spec.params.tempMax ?? Infinity))
  )
    return;
  return e;
}

/** Scheduler hint only; caller must sample actual snapshots, never fabricate missing timestamps. */
export function wellCameraSchedule(
  state: ShipSystemsState,
  definition: ShipDefinition,
  env: EnvironmentEffects,
  recorderRate: number,
): { rate: number; nextAt: number; due: boolean } {
  if (!Number.isFinite(env.t) || !Number.isFinite(recorderRate) || recorderRate < 0)
    throw new Error('invalid well camera time/rate');
  const c = sensingOf(definition).camera;
  const camera = healthy(state, definition, 'camera', env.t),
    recorder = healthy(state, definition, 'black-box', env.t);
  const aim = (state.ext?.sensorPointing as unknown as Record<string, Pointing> | undefined)
    ?.camera;
  const scene = env.fieldSignals['ship-environment'] as { opticsValid?: boolean } | undefined;
  const ready =
    camera &&
    camera.powerDraw >= c.minTrackingPower &&
    env.t >= (camera.values.readyAt ?? 0) &&
    env.t >= (aim?.settleUntil ?? 0) &&
    scene?.opticsValid !== false;
  const rate =
    ready && recorder
      ? Math.max(0, Math.min(recorderRate, camera.powerDraw / c.referenceTrackingPower))
      : 0;
  const nextAt = memoryOf(state, env.t).nextAt;
  return { rate, nextAt, due: rate > 0 && env.t + 1e-10 >= nextAt };
}

/**
 * Spare bytes belong to an actual packet AFTER ordinary channels and prior optional products.
 * This function returns bytes consumed from that budget; it never charges a second packet.
 * One incomplete image may wait in volatile camera memory. Publication time is retention time.
 */
export function stepWellAcquisition(
  state: ShipSystemsState,
  definition: ShipDefinition,
  env: EnvironmentEffects,
  dt: number,
  packetBudgetBytes: number,
  recorderRate: number,
): { state: ShipSystemsState; measurements: Measurement[]; bytes: number } {
  if (
    !Number.isFinite(env.t) ||
    !(Number.isFinite(dt) && dt > 0) ||
    !(Number.isSafeInteger(packetBudgetBytes) && packetBudgetBytes >= 0) ||
    !(Number.isFinite(recorderRate) && recorderRate >= 0)
  )
    throw new Error('invalid well camera time/packet budget/rate');
  const scenes = Object.values(env.fieldSignals).filter(isWellsSensorScene);
  if (!scenes.length && !state.ext?.wellCamera) return { state, measurements: [], bytes: 0 };
  scenes.forEach((s) => validateScene(s, env.t));
  if (scenes.reduce((n, s) => n + s.segments.length, 0) > WELL_CAMERA_LIMITS.maxSceneSegments)
    throw new Error('well camera scenes exceed bounded extraction input');
  let next = { ...memoryOf(state, env.t), lastAt: env.t };
  let rng = state.rng;
  let spare = packetBudgetBytes;
  const measurements: Measurement[] = [];
  const c = sensingOf(definition).camera;
  const camera = healthy(state, definition, 'camera', env.t),
    recorder = healthy(state, definition, 'black-box', env.t);
  if (next.pending && (!camera || camera.powerDraw < c.minTrackingPower))
    next = { ...next, pending: undefined, droppedFrames: next.droppedFrames + 1 };
  const retain = () => {
    if (!next.pending || !recorder || spare <= 0) return;
    const used = Math.min(spare, next.pending.remainingBytes);
    spare -= used;
    if (used === next.pending.remainingBytes) {
      measurements.push({ ...next.pending.measurement, t: env.t });
      next = { ...next, pending: undefined };
    } else
      next = {
        ...next,
        pending: { ...next.pending, remainingBytes: next.pending.remainingBytes - used },
      };
  };
  retain();
  const schedule = wellCameraSchedule(state, definition, env, recorderRate);
  if (schedule.due && camera && scenes.some((s) => s.valid)) {
    next = { ...next, nextAt: env.t + 1 / schedule.rate };
    if (next.pending) next = { ...next, droppedFrames: next.droppedFrames + 1 };
    else {
      const spec = definition.equipment.find((e) => e.id === 'camera')!;
      const configured = getGeometry(state, definition).positions.camera ?? spec.position;
      const mount = v3.add(
        configured,
        spec.mount ? v3.sub(spec.mount.position, spec.position) : v3.ZERO,
      );
      const lever = rotate(
        env.kinematics.attitude,
        v3.sub(mount, state.massProperties.centerOfMass),
      );
      const eye = v3.add(env.kinematics.position, lever);
      const omega = rotate(env.kinematics.attitude, env.kinematics.angularVelocity);
      const eyeVelocity = v3.add(env.kinematics.velocity, v3.cross(omega, lever));
      const aim = (state.ext?.sensorPointing as unknown as Record<string, Pointing> | undefined)
        ?.camera;
      const locked = aim?.target
        ? env.targets.find((target) => target.id === aim.target)
        : undefined;
      const inertialAim = locked
        ? v3.sub(v3.add(env.kinematics.position, locked.relativePosition), eye)
        : aim?.direction;
      const forward = v3.normalize(
        inertialAim
          ? rotateInverse(env.kinematics.attitude, inertialAim)
          : (spec.mount?.direction ?? v3.UNIT_X),
      );
      if (!v3.isFinite3(forward) || v3.length(forward) === 0)
        throw new Error('invalid camera boresight');
      const right = v3.normalize(
        v3.cross(Math.abs(forward.z) < 0.99 ? v3.UNIT_Z : v3.UNIT_Y, forward),
      );
      const up = v3.cross(forward, right);
      const inertialForward = rotate(env.kinematics.attitude, forward);
      const halfAngle = spec.params.fovHalfAngle ?? c.fovHalfAngle;
      const exposure = clamp(
        camera.values.exposure ?? c.referenceExposure,
        c.minExposure,
        c.maxExposure,
      );
      const reportedCondition = clamp(
        camera.values.reportedCondition ?? camera.condition,
        Number.EPSILON,
        1,
      );
      // [ASSUMED] Split the existing camera angular variance equally between frame-common
      // pointing readback and independent endpoint noise. No new exact attitude is exposed.
      const commonTrue =
        opticalQuality(camera.powerDraw, 1, camera.condition, exposure, 0, halfAngle, definition)!
          .angularSigma / Math.SQRT2;
      const commonReported =
        opticalQuality(camera.powerDraw, 1, reportedCondition, exposure, 0, halfAngle, definition)!
          .angularSigma / Math.SQRT2;
      const saved = state.rng[WELL_CAMERA_STREAM];
      if (!saved) throw new Error(`Missing initialized sensor RNG stream: ${WELL_CAMERA_STREAM}`);
      const noise = createRng(0);
      noise.setState(saved);
      const commonError = fromRotationVector({
        x: noise.normal(0, commonTrue),
        y: noise.normal(0, commonTrue),
        z: noise.normal(0, commonTrue),
      });
      const measuredBasis = {
        forward: rotate(commonError, forward),
        right: rotate(commonError, right),
        up: rotate(commonError, up),
      };
      const occluders = env.targets.map((t) => ({
        center: v3.add(env.kinematics.position, t.relativePosition),
        radius: t.radius,
      }));
      const candidates: Array<{
        a: Vec3;
        b: Vec3;
        phase: WellAppearancePhase;
        row: number;
        column: number;
      }> = [];
      const visibleScenes = scenes.filter((s) => s.valid);
      for (const scene of visibleScenes)
        for (const segment of scene.segments) {
          if (!segment.adequateSignal) continue;
          for (const [lo, hi] of visibleWellIntervals(
            segment.from,
            segment.to,
            eye,
            inertialForward,
            halfAngle,
            occluders,
          )) {
            const a = v3.sub(v3.lerp(segment.from, segment.to, lo), eye),
              b = v3.sub(v3.lerp(segment.from, segment.to, hi), eye);
            const middle = v3.scale(v3.add(a, b), 0.5);
            const chord = v3.sub(b, a);
            const nearest = v3.addScaled(
              a,
              chord,
              clamp(-v3.dot(a, chord) / Math.max(v3.lengthSq(chord), Number.MIN_VALUE), 0, 1),
            );
            const minimumRange = v3.length(nearest);
            // A conservative bound for EVERY point of the stroke, not three samples that
            // could miss a high-rate interior. Static emission, translating/rotating aperture.
            // May discard a trackable piece; never certify unseen support or cancel smear
            // using truth-perfect pointing. Same exposure/smear limit as the ordinary camera.
            if (
              !(minimumRange > 0) ||
              (v3.length(eyeVelocity) / minimumRange + v3.length(omega)) * exposure >
                c.maxSmearAngle
            )
              continue;
            const av = rotateInverse(env.kinematics.attitude, a),
              bv = rotateInverse(env.kinematics.attitude, b);
            // [ASSUMED] Three-sigma image separation is the contour extraction threshold.
            const angle = v3.angleBetween(av, bv);
            const q = opticalQuality(
              camera.powerDraw,
              v3.length(middle),
              camera.condition,
              exposure,
              Math.min(halfAngle, v3.angleBetween(middle, inertialForward)),
              halfAngle,
              definition,
            );
            if (!q || angle < WELL_CAMERA_LIMITS.resolutionSigmas * q.angularSigma) continue;
            const mid = v3.add(av, bv),
              depth = v3.dot(mid, forward);
            candidates.push({
              a: av,
              b: bv,
              phase: segment.phase,
              row: v3.dot(mid, up) / depth,
              column: v3.dot(mid, right) / depth,
            });
          }
        }
      candidates.sort(
        (a, b) => a.row - b.row || a.column - b.column || a.phase.localeCompare(b.phase),
      );
      const cursor = candidates.length ? next.rasterCursor % candidates.length : 0;
      const contours: WellCameraFrame['contours'][number][] = [];
      const id = `camera:well-frame:${next.sequence}`;
      const endpoint = (
        p: Vec3,
      ): { slope: readonly [number, number]; cov: WellImageCovariance } => {
        const theta = Math.min(halfAngle, v3.angleBetween(p, forward));
        const trueSigma = opticalQuality(
          camera.powerDraw,
          v3.length(p),
          camera.condition,
          exposure,
          theta,
          halfAngle,
          definition,
        )!.angularSigma;
        const reportedSigma = opticalQuality(
          camera.powerDraw,
          v3.length(p),
          reportedCondition,
          exposure,
          theta,
          halfAngle,
          definition,
        )!.angularSigma;
        const independentTrue = Math.sqrt(Math.max(0, trueSigma ** 2 - commonTrue ** 2));
        const independentVariance = Math.max(
          Number.MIN_VALUE,
          reportedSigma ** 2 - commonReported ** 2,
        );
        const ray = v3.normalize(p),
          tangent = v3.anyPerpendicular(ray),
          other = v3.cross(ray, tangent);
        const perturbed = v3.addScaled(
          v3.addScaled(ray, tangent, noise.normal(0, independentTrue)),
          other,
          noise.normal(0, independentTrue),
        );
        const denominator = v3.dot(perturbed, forward);
        const x = v3.dot(perturbed, right) / denominator,
          y = v3.dot(perturbed, up) / denominator;
        const factor = independentVariance * (1 + x * x + y * y);
        return { slope: [x, y], cov: [factor * (1 + x * x), factor * x * y, factor * (1 + y * y)] };
      };
      for (let i = 0; i < Math.min(candidates.length, WELL_CAMERA_LIMITS.maxContours); i++) {
        const candidate = candidates[(cursor + i) % candidates.length]!;
        const a = endpoint(candidate.a),
          b = endpoint(candidate.b);
        contours.push({
          id: `${id}:contour:${i}`,
          start: a.slope,
          end: b.slope,
          startCov: a.cov,
          endCov: b.cov,
          phase: candidate.phase,
        });
      }
      let frame: WellCameraFrame = {
        version: 1,
        id,
        field: WELL_CAMERA_FIELD,
        source: 'camera',
        sequence: next.sequence,
        acquisition: [env.t, env.t],
        availableAt: env.t,
        exposure,
        cameraPower: camera.powerDraw,
        effectiveRate: schedule.rate,
        basis: measuredBasis,
        basisSigma: commonReported,
        basisCorrelation: 'frame-common-rotation',
        coverage: {
          status: 'unresolved',
          halfAngle,
          truncated:
            scenes.some((s) => !s.valid || s.truncated) || candidates.length > contours.length,
        },
        contours,
      };
      let measurement = encodeWellCameraFrame(frame);
      while (bytes(measurement) > WELL_CAMERA_LIMITS.maxFrameBytes && contours.length) {
        contours.pop();
        frame = { ...frame, coverage: { ...frame.coverage, truncated: true }, contours };
        measurement = encodeWellCameraFrame(frame);
      }
      next = {
        ...next,
        sequence: next.sequence + 1,
        rasterCursor: candidates.length ? (cursor + contours.length) % candidates.length : 0,
        pending: { measurement, remainingBytes: bytes(measurement) },
      };
      rng = { ...rng, [WELL_CAMERA_STREAM]: noise.getState() };
      retain();
    }
  }
  return {
    state: { ...state, rng, ext: { ...state.ext, wellCamera: next as unknown as JsonValue } },
    measurements,
    bytes: packetBudgetBytes - spare,
  };
}
