import baseline from '../../data/ship-baseline.json';
import { isHandsOnNeutral, type AttitudeTarget, type Command } from '../contracts/commands.ts';
import type { ShipEvent } from '../contracts/measurements.ts';
import type { ShipDefinition } from '../contracts/ship.ts';
import type { EquipmentState, ShipSystemsState } from '../contracts/truth/ship.ts';
import type { JsonValue } from '../contracts/units.ts';
import { isFiniteQuat } from '../lib/quat.ts';
import { isFinite3, type Vec3 } from '../lib/vec3.ts';

/**
 * [ASSUMED] Play value: the turn rate a full yaw or pitch deflection asks for, rad/s. It equals
 * the star trackers' rate limit (sensing.starTracker.maxAngularRate), so a full-rate turn is
 * the fastest that can still keep the attitude fix.
 */
export const HANDS_ON_TURN_RATE = 0.01;
/**
 * A hands-on burn has no planned end: it lasts until the next `fly` command replaces or removes
 * it. Finite, not Infinity, so the state stays JSON-serialisable.
 */
const HANDS_ON_BURN_HOLD = 1e7;

const finite = (value: number) => Number.isFinite(value);
/** −0 becomes +0, so a stored value is unchanged by a JSON round trip (replays stay exact). */
const unsigned = (value: number) => value + 0;
const plain = (v: Vec3) => ({ x: unsigned(v.x), y: unsigned(v.y), z: unsigned(v.z) });
const unitRange = (value: number) => finite(value) && value >= -1 && value <= 1;
/** A direction to look along: finite and not the zero vector (any length will do). */
const usableDirection = (v: Vec3) => isFinite3(v) && (v.x !== 0 || v.y !== 0 || v.z !== 0);
/** The ship holds only these; the game layer resolves every other target to one of them first. */
const supportedAttitude = (target: AttitudeTarget) =>
  target.reference === 'free' ||
  (target.reference === 'inertial' && isFiniteQuat(target.attitude)) ||
  (target.reference === 'rate' && isFinite3(target.rate));

/** Ordered, immutable command application. Invalid commands produce sensed rejections. */
export function applyCommands(
  input: ShipSystemsState,
  definition: ShipDefinition,
  commands: readonly Command[],
): { state: ShipSystemsState; events: ShipEvent[] } {
  let state = input;
  const events: ShipEvent[] = [];
  const data = (definition.systems ?? baseline) as unknown as typeof baseline;
  const update = (id: string, changes: Partial<EquipmentState>) => {
    state = {
      ...state,
      equipment: { ...state.equipment, [id]: { ...state.equipment[id]!, ...changes } },
    };
  };
  /** Hand the RCS pods back to the attitude controller (undoes an individual cutoff). */
  const releaseRcsControl = () => {
    for (const spec of definition.equipment.filter((e) => e.kind === 'rcs-thruster')) {
      const current = state.equipment[spec.id]!;
      update(spec.id, { values: { ...current.values, controlInhibited: 0 } });
    }
  };
  const activeChain = (id: string) => {
    const spec = definition.equipment.find((e) => e.id === id)!;
    const current = state.equipment[id]!;
    if (spec.sheddable || current.mode !== 'active') return false;
    return !definition.equipment.some((spare) => {
      const actual = state.equipment[spare.id];
      return (
        spare.id !== id &&
        spec.redundancyGroup &&
        spare.redundancyGroup === spec.redundancyGroup &&
        actual?.mode === 'active' &&
        actual.condition > 0 &&
        !actual.tripped &&
        actual.allocation >= (spare.params['mode.active.power'] ?? spare.ratedPower) &&
        actual.powerDraw >= (spare.params['mode.active.power'] ?? spare.ratedPower)
      );
    });
  };
  for (const command of commands) {
    let reason: string | undefined;
    switch (command.kind) {
      case 'mark':
        break;
      case 'attitude':
        if (!supportedAttitude(command.target))
          reason = 'Resolve belief-relative attitude to a finite inertial angle in the game layer.';
        else {
          state = { ...state, attitudeTarget: command.target };
          releaseRcsControl();
        }
        break;
      case 'fly': {
        const input = command.input;
        if (
          !unitRange(input.translate.x) ||
          !unitRange(input.translate.y) ||
          !unitRange(input.translate.z) ||
          !unitRange(input.yaw) ||
          !unitRange(input.pitch) ||
          !finite(input.throttle) ||
          input.throttle < 0 ||
          input.throttle > 1
        )
          reason = 'Hands-on input needs every axis within -1..1 and throttle within 0..1.';
        else {
          // LIFT(2G): working stub of hands-on flying. Yaw and pitch become a body rate target
          // (the controller acts on yaw only), the throttle holds a main-engine burn, and
          // `translate` is stored but not yet acted on. Released controls null the rates; they
          // do not yet hold the attitude.
          const mainId = data.propulsion.main.equipmentId;
          const main = state.equipment[mainId];
          // Same availability rule as a timed burn: a throttle cannot wake an engine that is off.
          const firing =
            input.throttle > 0 &&
            !!main &&
            main.condition > 0 &&
            !main.tripped &&
            main.mode !== 'off' &&
            main.mode !== 'heater';
          // The burn an earlier `fly` started is known by its end time, so releasing the
          // throttle never cancels a timed burn commanded since.
          const heldUntil = state.ext?.handsOnBurnUntil;
          const burns = state.burns.filter(
            (b) => b.thruster !== mainId || (!firing && b.until !== heldUntil),
          );
          const until = state.t + HANDS_ON_BURN_HOLD;
          state = {
            ...state,
            attitudeTarget: {
              reference: 'rate',
              rate: isHandsOnNeutral(input)
                ? { x: 0, y: 0, z: 0 }
                : {
                    x: 0,
                    y: unsigned(-input.pitch * HANDS_ON_TURN_RATE),
                    z: unsigned(input.yaw * HANDS_ON_TURN_RATE),
                  },
            },
            burns: firing
              ? [...burns, { thruster: mainId, throttle: input.throttle, until }]
              : burns,
            ext: {
              ...state.ext,
              handsOn: {
                translate: plain(input.translate),
                yaw: unsigned(input.yaw),
                pitch: unsigned(input.pitch),
                throttle: unsigned(input.throttle),
              },
              handsOnBurnUntil: firing ? until : null,
            },
          };
          releaseRcsControl();
          if (firing) update(mainId, { values: { ...main.values, controlInhibited: 0 } });
        }
        break;
      }
      case 'burn': {
        const spec = definition.equipment.find((e) => e.id === command.thruster);
        const actual = state.equipment[command.thruster];
        if (!spec || !actual || !['main-engine', 'rcs-thruster'].includes(spec.kind))
          reason = 'Unknown thruster.';
        else if (command.thruster === 'ion-drive')
          reason = 'Long-coast ion propulsion is deferred to Phase 3.';
        else if (
          !finite(command.throttle) ||
          command.throttle <= 0 ||
          command.throttle > 1 ||
          !finite(command.duration) ||
          command.duration <= 0
        )
          reason = 'Burn needs finite positive duration and throttle in (0, 1].';
        else if (
          actual.condition <= 0 ||
          actual.tripped ||
          actual.mode === 'off' ||
          actual.mode === 'heater'
        )
          reason = 'Thruster unavailable; select ready mode and restore power first.';
        else if (command.attitude && !supportedAttitude(command.attitude))
          reason = 'Resolve belief-relative burn attitude in the game layer.';
        else if (
          command.duration * command.throttle * (spec.params.thrust ?? 0) + 1e-9 <
          (spec.params.minimumImpulse ?? 0)
        )
          reason = 'Commanded impulse is below the minimum impulse bit.';
        else {
          state = {
            ...state,
            burns: [
              ...state.burns.filter((b) => b.thruster !== command.thruster),
              {
                thruster: command.thruster,
                throttle: command.throttle,
                until: state.t + command.duration,
              },
            ],
            attitudeTarget: command.attitude ?? state.attitudeTarget,
          };
          update(spec.id, { values: { ...actual.values, controlInhibited: 0 } });
          if (command.attitude) releaseRcsControl();
        }
        break;
      }
      case 'cutoff':
        if (
          command.thruster !== 'all' &&
          !definition.equipment.some(
            (e) => e.id === command.thruster && ['main-engine', 'rcs-thruster'].includes(e.kind),
          )
        )
          reason = 'Unknown thruster.';
        else {
          state = {
            ...state,
            attitudeTarget:
              command.thruster === 'all' ? { reference: 'free' } : state.attitudeTarget,
            burns: state.burns.filter(
              (b) => command.thruster !== 'all' && b.thruster !== command.thruster,
            ),
          };
          for (const spec of definition.equipment.filter((e) =>
            ['main-engine', 'rcs-thruster'].includes(e.kind),
          )) {
            if (command.thruster !== 'all' && command.thruster !== spec.id) continue;
            const current = state.equipment[spec.id]!;
            update(spec.id, {
              values: {
                ...current.values,
                pendingImpulse: 0,
                pulseRemaining: 0,
                controlInhibited: 1,
              },
            });
          }
        }
        break;
      case 'mode': {
        const spec = definition.equipment.find((e) => e.id === command.equipment);
        const current = state.equipment[command.equipment];
        if (!spec || !current) reason = 'Unknown equipment.';
        else if (command.mode === 'reset') {
          const trippedAt = current.values.trippedAt ?? -Infinity;
          const thermalSafe =
            current.temperature === undefined ||
            current.temperature < (spec.params.tempMax ?? Infinity);
          if (
            !current.tripped ||
            current.condition <= 0 ||
            !thermalSafe ||
            (current.values.faultPower ?? 0) > 0 ||
            state.t - trippedAt < data.power.rpc.resetDelay
          )
            reason = 'Reset requires an intact, cooled branch, cleared fault and reset delay.';
          else {
            update(spec.id, {
              tripped: false,
              faults: current.faults.filter((fault) => fault !== 'overcurrent'),
              values: { ...current.values, overloadTime: 0 },
            });
            events.push({ kind: 'equipment-recovered', t: state.t, equipment: spec.id });
          }
        } else if (
          spec.kind === 'rcs-thruster' &&
          ['bank-a', 'bank-b', 'jet-0', 'jet-1'].includes(command.mode)
        ) {
          const bankCommand = command.mode.startsWith('bank');
          const bank = command.mode === 'bank-b' ? 1 : 0;
          update(spec.id, {
            mode: 'ready',
            values: {
              ...current.values,
              pendingImpulse: 0,
              pulseRemaining: 0,
              ...(bankCommand
                ? {
                    bank,
                    readyTime: current.values.bank === bank ? (current.values.readyTime ?? 0) : 0,
                  }
                : { selectedJet: command.mode === 'jet-1' ? 1 : 0 }),
            },
          });
          state = { ...state, burns: state.burns.filter((b) => b.thruster !== spec.id) };
        } else if (!spec.modes.includes(command.mode)) reason = 'Unknown equipment mode.';
        else if (spec.id === 'crew' && command.mode !== 'occupied')
          reason = 'Crew metabolism cannot be switched off.';
        else if (activeChain(spec.id) && command.mode !== 'active')
          reason =
            'The last active essential function cannot be disabled; activate a healthy powered spare first.';
        else if (['firing', 'fire-one', 'fire-two'].includes(command.mode))
          reason = 'Use a timed burn command to request thrust.';
        else {
          update(spec.id, { mode: command.mode });
          if (command.mode === 'off' || command.mode === 'heater') {
            update(spec.id, {
              values: { ...current.values, pendingImpulse: 0, pulseRemaining: 0 },
            });
            state = { ...state, burns: state.burns.filter((b) => b.thruster !== spec.id) };
          }
          if (spec.kind === 'recorder')
            state = {
              ...state,
              recorder: {
                ...state.recorder,
                sampleRate:
                  command.mode === 'off'
                    ? 0
                    : command.mode === 'minimum'
                      ? data.recorder.minimumSampleRate
                      : command.mode === 'high'
                        ? data.recorder.highSampleRate
                        : data.recorder.normalSampleRate,
              },
            };
        }
        break;
      }
      case 'power': {
        const spec = definition.equipment.find((e) => e.id === command.equipment);
        const current = state.equipment[command.equipment];
        if (!spec || !current) reason = 'Unknown equipment.';
        else if (!finite(command.allocation) || command.allocation < 0)
          reason = 'Power allocation must be finite and nonnegative.';
        else if (spec.kind === 'battery' || spec.kind === 'power-source') break;
        else if (
          activeChain(spec.id) &&
          command.allocation < (spec.params['mode.active.power'] ?? spec.ratedPower)
        )
          reason = 'Essential demand cannot be deliberately shed.';
        else update(spec.id, { allocation: Math.min(command.allocation, spec.ratedPower) });
        break;
      }
      case 'point': {
        const spec = definition.equipment.find((e) => e.id === command.sensor);
        if (!spec || !['optical-tracker', 'star-tracker'].includes(spec.kind))
          reason = 'Unknown pointing instrument.';
        else if (
          (command.direction !== undefined && !usableDirection(command.direction)) ||
          (command.target === null && command.direction === undefined)
        )
          reason = 'Inertial pointing requires a finite, non-zero direction.';
        else {
          const prior = (state.ext?.sensorPointing ?? {}) as Record<string, JsonValue>;
          state = {
            ...state,
            ext: {
              ...state.ext,
              sensorPointing: {
                ...prior,
                [command.sensor]: {
                  target: command.target,
                  ...(command.direction !== undefined
                    ? { direction: plain(command.direction) }
                    : {}),
                  settleUntil: state.t + data.sensing.camera.settleTime,
                },
              },
            },
          };
        }
        break;
      }
      case 'configure':
        if (!definition.configurations.some((c) => c.id === command.configuration))
          reason = 'Unknown physical configuration.';
        else if (command.configuration !== state.configuration || state.transition) {
          const target = definition.configurations.find((c) => c.id === command.configuration)!;
          state = {
            ...state,
            transition: { to: command.configuration, completesAt: state.t + target.transitionTime },
          };
        }
        break;
      case 'recorder':
        if (
          !finite(command.sampleRate) ||
          command.sampleRate < 0 ||
          command.sampleRate > data.recorder.highSampleRate
        )
          reason = 'Recorder rate must be within the installed hardware range.';
        else {
          state = { ...state, recorder: { ...state.recorder, sampleRate: command.sampleRate } };
          const id = data.recorder.equipmentId;
          update(id, {
            mode:
              command.sampleRate === 0
                ? 'off'
                : command.sampleRate <= data.recorder.minimumSampleRate
                  ? 'minimum'
                  : command.sampleRate <= data.recorder.normalSampleRate
                    ? 'normal'
                    : 'high',
          });
        }
        break;
    }
    if (reason) events.push({ kind: 'command-rejected', t: state.t, command, reason });
  }
  return { state, events };
}
