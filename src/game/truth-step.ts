/**
 * TRUTH side. One simulation tick (src/contracts/README.md § One simulation tick):
 *
 *   1. build EnvironmentEffects from the truth world (sunlight, shadows, what the camera sees,
 *      the encounter's field intensity at each equipment item);
 *   2. ship systems (2B) step with the commands due now;
 *   3. simulation (2A) integrates bodies, asteroids and the ship with the actuators and the
 *      encounter's fields;
 *   4. contacts become ShipEvents; the world decides loss (collision, then critical power) and
 *      objectives.
 *
 * What comes out for the believed side is only what the ship sensed: recorded measurements and
 * ShipEvents. Truth stays in `GameTruthState`.
 */

import type { Command, ExecutedCommand, CommandSource } from '../contracts/commands.ts';
import type { PlanId, PlanItemId } from '../contracts/ids.ts';
import type { LossCause, Measurement, ShipEvent } from '../contracts/measurements.ts';
import type { MassProperties } from '../contracts/ship.ts';
import type { SimEvent } from '../contracts/truth/index.ts';
import { rotate } from '../lib/quat.ts';
import { addSym3, fromPrincipal, principalAxes, scaleSym3 } from '../lib/sym3.ts';
import { createSimulation, type SimState, type Simulation } from '../sim/index.ts';
import { stepShipSystems } from '../ship/index.ts';
import { radiationProfiles, type Exposure } from '../ship/condition/index.ts';
import { integrateConditionedInterval } from '../ship/condition/integrate.ts';
import { energizedEquipment } from '../ship/power/service.ts';
import { withRadiationMonitorInput } from '../ship/sensors/radiation-environment.ts';
import { latestRadiationReading } from '../ship/sensors/radiation.ts';
import type { ShipDefinition } from '../contracts/ship.ts';
import type {
  EnvironmentEffects,
  EnvironmentField,
  ShipStepResult,
  ShipSystemsState,
} from '../contracts/truth/index.ts';
import { adaptSetup } from './adapters.ts';
import type { DynamicsEvent, EncounterSetup } from './encounter.ts';
import { hullReach } from '../contracts/ship.ts';
import type { JsonValue } from '../contracts/units.ts';
import { buildEnvironment, type EnvironmentOptions } from './environment.ts';
import {
  evaluateObjectives,
  initialObjectiveProgress,
  type ObjectiveProgress,
} from './objectives.ts';
import { evaluatePower, initialPowerProgress, type PowerProgress } from './power.ts';

/** Everything true about an attempt in flight. Plain JSON; save, restore and hash freely. */
export interface GameTruthState {
  readonly sim: SimState;
  readonly objectives: ObjectiveProgress;
  /** How long critical electrical service has been out (A18 (5)). Absent: never. */
  readonly power?: PowerProgress;
  /** The encounter's own changing truth (`EncounterSetup.dynamics`: 3B's well lifecycle). */
  readonly dynamics?: JsonValue;
  /** The encounter's own account (`EncounterSetup.ledger`: the work 3B's wells do). */
  readonly ledger?: JsonValue;
  /**
   * Raw field exposure per equipment item, lattice-unit seconds (∫ intensity dt, before any
   * susceptibility; A16, R14). Items never exposed are left out. What the exposure does to the
   * equipment is the ship's damage model (3A); the truth step only keeps the account.
   */
  readonly exposure?: Readonly<Record<string, number>>;
  /** Set on the tick the ship was lost; no further ticks are allowed. */
  readonly lost?: LossCause;
}

/** A command due this tick, already resolved to inertial references, with where it came from. */
export interface DueCommand {
  readonly command: Command;
  readonly source: CommandSource;
  readonly planId?: PlanId;
  readonly planItemId?: PlanItemId;
}

export interface TickResult {
  readonly state: GameTruthState;
  /** Commands as they reached the ship this tick, with what the ship did with them. */
  readonly executed: readonly ExecutedCommand[];
  /** Measurements the ship acquired and recorded this tick (valid at the tick's start time). */
  readonly measurements: readonly Measurement[];
  /**
   * The radiation monitor's readings sensed on board this tick, recorded or not (A24, R52): what
   * the flight computer's caution reads. Instrument readings, belief-safe; only those also in
   * `measurements` reach Black Box.
   */
  readonly sensed: readonly Measurement[];
  /** What the ship noticed this tick, in time order. */
  readonly events: readonly ShipEvent[];
  /** Truth-only events (true clearances, impacts). For tests and tuning; never forwarded. */
  readonly simEvents: readonly SimEvent[];
  /**
   * What the encounter's dynamics did this tick (a well's precursor, its birth or veto). Truth;
   * those marked `seen` are what the eye sees through the window, which is all the session
   * passes on (A12: a newly seen precursor drops warp to 1×).
   */
  readonly dynamics?: readonly DynamicsEvent[];
}

export interface TruthStepper {
  readonly dt: number;
  readonly simulation: Simulation;
  /** The arrival state. Recurrence (P8) restarts from exactly this. */
  readonly initial: GameTruthState;
  /** One tick. Pure: the same state and commands always give the same result. */
  step(state: GameTruthState, commands?: readonly DueCommand[]): TickResult;
}

/**
 * Mean of two mass-property sets; the hull is the newer one. The inertia is the mean of the two
 * tensors in the body frame, given back as its own principal moments and axes, so it is right
 * also when the principal axes turn within the step (propellant leaving a tank off the axes).
 */
export function midStepMassProperties(
  before: MassProperties,
  after: MassProperties,
): MassProperties {
  // Nothing changed (coasting): the ship hands back the same properties, and so do we.
  if (before === after) return after;
  const a = before.inertia;
  const b = after.inertia;
  const sameInertia =
    a.moments.x === b.moments.x &&
    a.moments.y === b.moments.y &&
    a.moments.z === b.moments.z &&
    a.axes.w === b.axes.w &&
    a.axes.x === b.axes.x &&
    a.axes.y === b.axes.y &&
    a.axes.z === b.axes.z;
  const mean = sameInertia
    ? undefined
    : principalAxes(
        scaleSym3(addSym3(fromPrincipal(a.moments, a.axes), fromPrincipal(b.moments, b.axes)), 0.5),
      );
  return {
    mass: 0.5 * (before.mass + after.mass),
    centerOfMass: {
      x: 0.5 * (before.centerOfMass.x + after.centerOfMass.x),
      y: 0.5 * (before.centerOfMass.y + after.centerOfMass.y),
      z: 0.5 * (before.centerOfMass.z + after.centerOfMass.z),
    },
    inertia: mean ? { moments: mean.values, axes: mean.axes } : b,
    hull: after.hull,
  };
}

/**
 * The ship-systems step over one tick, split at every condition boundary inside it (3A, R26):
 * a dose failure, a protection latch, an upset, the end of a reboot. Each piece runs the
 * existing ship step from the state the last one left, the environment carried to its start
 * (the ship's position moved on along its velocity), and 3A's condition step applies the
 * piece's dose and its ending fault before the next one is dispatched. Commands take effect
 * in the first piece. The simulation gets each piece's thrust as the impulse it gave: a
 * thruster that dies part way contributes only up to its death.
 *
 * Without field intensity and with no reboot pending, nothing can happen inside the tick, and
 * this is the plain ship step: the same result to the bit.
 *
 * `refresh` gives a piece that starts inside the tick what must be read at its own instant (the
 * radiation monitor's point input, which the monitor accepts only for the time it is stamped).
 */
export function conditionedShipStep(
  systems: ShipSystemsState,
  definition: ShipDefinition,
  commands: readonly Command[],
  env: EnvironmentEffects,
  dt: number,
  refresh?: (env: EnvironmentEffects, systems: ShipSystemsState) => EnvironmentEffects,
): ConditionedStep {
  const intensity = env.intensity;
  const exposed = Object.keys(intensity).length > 0;
  const rebooting = Object.values(systems.equipment).some(
    (e) => (e.values.radiationRestartUntil ?? 0) > systems.t,
  );
  if (!exposed && !rebooting) {
    const plain = stepShipSystems(systems, definition, commands, env, dt);
    return { ...plain, sensed: sensedSince(plain.state, systems.t) };
  }

  const profiles = radiationProfiles(definition);
  // The intensity holds over the tick (sampled at its start), so a piece's dose is its length
  // times the intensity; above burnout when strictly over the profile's threshold.
  const sample = (d: number): Exposure => {
    const out: Record<string, { rawDose: number; aboveBurnout: boolean }> = {};
    for (const id in intensity) {
      const i = intensity[id]!;
      out[id] = {
        rawDose: i * d,
        aboveBurnout: i > (profiles.get(id)?.burnoutIntensity ?? Infinity),
      };
    }
    return out;
  };
  const pieces: { result: ShipStepResult; dt: number; start: number }[] = [];
  const t0 = systems.t;
  const done = integrateConditionedInterval(
    systems,
    definition,
    dt,
    (state, remaining) => ({
      energized: energizedEquipment(state, definition),
      duration: remaining,
      sample,
    }),
    (state, d) => {
      const offset = state.t - t0;
      const k = env.kinematics;
      const carried: EnvironmentEffects = {
        ...env,
        t: state.t,
        kinematics: {
          ...k,
          position: {
            x: k.position.x + k.velocity.x * offset,
            y: k.position.y + k.velocity.y * offset,
            z: k.position.z + k.velocity.z * offset,
          },
        },
      };
      const at = offset === 0 ? env : refresh ? refresh(carried, state) : carried;
      const result = stepShipSystems(state, definition, pieces.length === 0 ? commands : [], at, d);
      pieces.push({ result, dt: d, start: state.t });
      return { state: result.state, events: result.events };
    },
  );
  // What the radiation monitor sensed on board in each piece (R52), recorded or not.
  const sensed = pieces.flatMap((p) => sensedSince(p.result.state, p.start));
  if (pieces.length === 1)
    return { ...pieces[0]!.result, state: done.state, events: done.events, sensed };
  // Each piece's thrust, as the share of the tick's impulse it gave.
  const thrusts = pieces.flatMap(({ result, dt: d }) =>
    result.actuators.thrusts.map((thrust) => ({
      ...thrust,
      force: {
        x: (thrust.force.x * d) / dt,
        y: (thrust.force.y * d) / dt,
        z: (thrust.force.z * d) / dt,
      },
    })),
  );
  const torque = { x: 0, y: 0, z: 0 };
  for (const { result, dt: d } of pieces) {
    torque.x += (result.actuators.torque.x * d) / dt;
    torque.y += (result.actuators.torque.y * d) / dt;
    torque.z += (result.actuators.torque.z * d) / dt;
  }
  return {
    state: done.state,
    actuators: { thrusts, torque, massProperties: pieces.at(-1)!.result.actuators.massProperties },
    measurements: pieces.flatMap((p) => p.result.measurements),
    events: done.events,
    sensed,
  };
}

/** The ship step, with what the radiation monitor sensed on board over it (R52). */
export type ConditionedStep = ShipStepResult & { readonly sensed: readonly Measurement[] };

/** The monitor's on-board reading, if it was sensed at or after `from`. */
function sensedSince(state: ShipSystemsState, from: number): Measurement[] {
  const reading = latestRadiationReading(state);
  return reading && reading.t >= from ? [reading] : [];
}

/**
 * The arrival state as recurrence restarts from it (3A, R26): an overtemperature indication
 * the unit has cooled from is cleared (the fault, and the trip it caused), and everything
 * physical stays: condition, damage, freeze rupture, exposure.
 */
export function clearCooledOvertemperature(
  systems: ShipSystemsState,
  definition: ShipDefinition,
): ShipSystemsState {
  let equipment: Record<string, ShipSystemsState['equipment'][string]> | undefined;
  for (const spec of definition.equipment) {
    const e = systems.equipment[spec.id];
    if (!e || !e.faults.includes('overtemperature')) continue;
    const max = spec.params.tempMax ?? Infinity;
    if (e.temperature !== undefined && e.temperature >= max) continue;
    const faults = e.faults.filter((f) => f !== 'overtemperature');
    // The trip goes too, unless something else (an overcurrent) holds it.
    const tripped = e.tripped && faults.includes('overcurrent');
    equipment ??= { ...systems.equipment };
    equipment[spec.id] = { ...e, faults, tripped };
  }
  return equipment ? { ...systems, equipment } : systems;
}

const NONE: readonly EnvironmentField[] = [];

export function createTruthStepper(given: EncounterSetup): TruthStepper {
  // The field encounters' hooks (3B's wells, 3C's lattice), whatever setup came in.
  const setup = adaptSetup(given);
  const { definition, objectiveRules, play } = setup;
  const options = { dt: definition.dt, ...(setup.fields ? { registry: setup.fields } : {}) };
  const simulation = createSimulation(definition.world, options);
  const intensityOf = (sim: Simulation) =>
    sim.fields.filter((f) => typeof f.intensity === 'function');
  const intensityFields = intensityOf(simulation);
  // The field instances follow the world's specs: when the encounter's dynamics change them (a
  // well switching on), the simulation is rebuilt for the new ones, and the hazards with it.
  let current = {
    specs: definition.world.fields,
    simulation,
    intensityFields,
    hazards: setup.hazards?.(definition.world.fields),
  };
  const forFields = (world: SimState['world']) => {
    if (world.fields !== current.specs) {
      const registry = setup.dynamics?.registry?.(world.fields) ?? setup.fields;
      // The simulation counts time as its first epoch plus ticks, so keep the arrival's epoch.
      const sim = createSimulation(
        { ...world, t: simulation.t0 },
        { ...options, ...(registry ? { registry } : {}) },
      );
      current = {
        specs: world.fields,
        simulation: sim,
        intensityFields: intensityOf(sim),
        hazards: setup.hazards?.(world.fields),
      };
    }
    return current;
  };
  // What the briefing told the ship about: it knows where these bodies are, and how big they
  // and the surveyed asteroids are.
  const briefedBodies = new Set(definition.briefing.knownBodies.map((b) => b.id));
  const environment: EnvironmentOptions = {
    // The camera can range anything whose radius the briefing gives: the bodies and every
    // surveyed asteroid.
    knownSizeTargets: [
      ...definition.briefing.knownBodies.map((b) => b.id),
      ...definition.briefing.knownAsteroids.map((a) => a.id),
    ],
    sunExclusionAngle: play.sunExclusionAngle,
    ship: definition.ship,
  };
  const hook = setup.environment;
  const sun = definition.world.sun;
  const arrivalSystems = simulation.initial.world.ship.systems;
  const cleared = clearCooledOvertemperature(arrivalSystems, definition.ship);
  const initial: GameTruthState = {
    sim:
      cleared === arrivalSystems
        ? simulation.initial
        : {
            ...simulation.initial,
            world: {
              ...simulation.initial.world,
              ship: { ...simulation.initial.world.ship, systems: cleared },
            },
          },
    objectives: initialObjectiveProgress,
    ...(setup.dynamics ? { dynamics: setup.dynamics.initial } : {}),
    ...(setup.ledger ? { ledger: setup.ledger.initial } : {}),
  };

  return {
    dt: definition.dt,
    simulation,
    initial,

    step(state, commands = []): TickResult {
      if (state.lost) throw new Error('the ship is lost; start a new attempt');
      let before = state.sim;
      const t = before.world.t;

      // 0. The encounter's own dynamics, due at the start of this tick, with the ship's actual
      //    committed state then; the fields they imply take effect for the tick.
      let dynamics = state.dynamics;
      const happened: DynamicsEvent[] = [];
      if (setup.dynamics && dynamics !== undefined) {
        for (let due = setup.dynamics.next(dynamics); due !== null && due <= t;) {
          if (due < t)
            throw new Error(`encounter dynamics due at ${due} s, between ticks (tick at ${t} s)`);
          const k = before.world.ship.kinematics;
          const mp = before.world.ship.systems.massProperties;
          const advanced = setup.dynamics.advance(dynamics, due, {
            t: due,
            position: k.position,
            velocity: k.velocity,
            hullRadius: hullReach(mp.hull, mp.centerOfMass),
          });
          dynamics = advanced.state;
          happened.push(...advanced.events);
          const next = setup.dynamics.next(dynamics);
          if (next !== null && next <= due) throw new Error('encounter dynamics did not advance');
          due = next;
        }
        if (happened.length > 0) {
          const specs = setup.dynamics.fields(dynamics, before.world.fields);
          if (specs !== before.world.fields)
            before = { ...before, world: { ...before.world, fields: specs } };
        }
      }
      const fieldsNow = forFields(before.world);

      // 1. Environment at the start of the tick: every source of intensity there is now, the
      //    simulation's fields and the encounter's own (the clouds), at each equipment item and
      //    at the radiation monitor (A24, R37), which reads the whole list at its own point.
      const extra = setup.intensityFields?.(before) ?? NONE;
      const point =
        extra.length > 0 ? [...fieldsNow.intensityFields, ...extra] : fieldsNow.intensityFields;
      const built = buildEnvironment(before, { ...environment, intensityFields: point });
      const systemsBefore = before.world.ship.systems;
      const env = withRadiationMonitorInput(
        hook ? hook(before, built) : built,
        systemsBefore,
        definition.ship,
        point,
      );
      // The exposure account: this tick's intensity, held over the tick.
      let exposure = state.exposure;
      for (const id in env.intensity) {
        const dose = env.intensity[id]! * definition.dt;
        if (!(dose > 0)) continue;
        exposure = { ...exposure, [id]: (exposure?.[id] ?? 0) + dose };
      }

      // 2. Ship systems over [t, t + dt].
      const ship = conditionedShipStep(
        systemsBefore,
        definition.ship,
        commands.map((c) => c.command),
        env,
        definition.dt,
        // A piece that starts inside the tick reads the monitor's point where the ship is then.
        (at, systems) => withRadiationMonitorInput(at, systems, definition.ship, point),
      );
      const rejected = new Map<Command, string>();
      for (const e of ship.events)
        if (e.kind === 'command-rejected') rejected.set(e.command, e.reason);
      const executed: ExecutedCommand[] = commands.map((c) => {
        const reason = rejected.get(c.command);
        return {
          t,
          command: c.command,
          source: c.source,
          ...(c.planId ? { planId: c.planId } : {}),
          ...(c.planItemId ? { planItemId: c.planItemId } : {}),
          status: reason === undefined ? 'executed' : 'rejected',
          ...(reason === undefined ? {} : { reason }),
        };
      });

      // 3. Simulation, with the mass properties at the middle of the step (2B reports the end
      //    of the step; the mean keeps burns second order).
      const stepped = fieldsNow.simulation.step(before, {
        actuators: {
          ...ship.actuators,
          massProperties: midStepMassProperties(
            before.world.ship.systems.massProperties,
            ship.actuators.massProperties,
          ),
        },
        systems: ship.state,
      });

      // The simulation rebuilds the world each step and does not carry `sun` over (2A, see the
      // 2F handoff). The sun never changes within an encounter, so put it back.
      const sim: SimState = sun
        ? { ...stepped.state, world: { ...stepped.state.world, sun } }
        : stepped.state;

      // The encounter's own account over the tick, from the ship's actual state at each end and
      // the thrust it commanded (3B's request 4: the work the wells do).
      let ledger = state.ledger;
      if (setup.ledger && ledger !== undefined) {
        // The net thrust, body frame, carried by the ship's attitude at each end.
        const body = { x: 0, y: 0, z: 0 };
        for (const thrust of ship.actuators.thrusts) {
          body.x += thrust.force.x;
          body.y += thrust.force.y;
          body.z += thrust.force.z;
        }
        const stage = (s: SimState) => ({
          t: s.world.t,
          position: s.world.ship.kinematics.position,
          velocity: s.world.ship.kinematics.velocity,
          mass: s.world.ship.systems.massProperties.mass,
          force: rotate(s.world.ship.kinematics.attitude, body),
        });
        ledger = setup.ledger.account(
          ledger,
          before.world.fields,
          stage(before),
          stage(sim),
          definition.dt,
        );
      }

      // 4. What the ship noticed.
      const events: ShipEvent[] = [...ship.events];
      let lost: LossCause | undefined;
      let lostAt = t + definition.dt;
      for (const contact of stepped.contacts) {
        if (!contact.impact) continue;
        events.push({
          kind: 'contact',
          t: contact.t,
          // The ship can name what it hit if it is a body it was briefed about (it knows where
          // those are, looking or not), or anything the camera could see this tick.
          ...(briefedBodies.has(contact.with) || isVisible(env, contact.with)
            ? { with: contact.with }
            : {}),
          impulse: contact.impulse,
        });
        if (contact.relativeSpeed >= play.lossSpeed && !lost) {
          lost = 'collision';
          lostAt = contact.t;
        }
      }
      // Structural hazards (3B's throats): the earliest contact of any part of the hull over
      // the tick, swept from its start; it ends the attempt there, unless a collision came first.
      if (fieldsNow.hazards) {
        const k = before.world.ship.kinematics;
        const [hit] = fieldsNow.hazards.sweep(
          { position: k.position, attitude: k.attitude },
          before.world.ship.systems.massProperties,
          sim.world.ship.kinematics.position,
          t,
          t + definition.dt,
        );
        if (hit && (!lost || hit.t < lostAt)) {
          lost = hit.cause;
          lostAt = hit.t;
        }
      }
      // Critical electrical service (A18 (5)), on the systems as the tick left them. A collision
      // this tick comes first; a power loss this tick comes before any objective it would meet.
      let power = state.power;
      if (!lost) {
        // An outage that begins with a fault part way through the tick counts from the fault.
        let onset = 0;
        if ((power?.functions.length ?? 0) === 0) {
          let first = Infinity;
          for (const e of ship.events)
            if ((e.kind === 'equipment-fault' || e.kind === 'breaker-trip') && e.t < first)
              first = e.t;
          if (Number.isFinite(first)) onset = Math.min(definition.dt, Math.max(0, first - t));
        }
        const judged = evaluatePower(
          power ?? initialPowerProgress,
          ship.state,
          definition.ship,
          definition.dt,
          play.power.lossGrace,
          onset,
        );
        if (judged.progress !== (power ?? initialPowerProgress)) power = judged.progress;
        if (judged.lost) lost = 'power';
      }
      let objectives = state.objectives;
      if (lost) {
        events.push({ kind: 'ship-lost', t: lostAt, cause: lost });
      } else {
        // Δv spent this tick: the net thrust force over the mid-step mass (couples cancel).
        let fx = 0;
        let fy = 0;
        let fz = 0;
        for (const thrust of ship.actuators.thrusts) {
          fx += thrust.force.x;
          fy += thrust.force.y;
          fz += thrust.force.z;
        }
        const midMass =
          0.5 *
          (before.world.ship.systems.massProperties.mass + ship.actuators.massProperties.mass);
        const spent = (Math.hypot(fx, fy, fz) / midMass) * definition.dt;
        const judged = evaluateObjectives(
          objectiveRules,
          objectives,
          sim.world,
          spent,
          before.world,
        );
        objectives = judged.progress;
        events.push(...judged.events);
      }
      events.sort((a, b) => a.t - b.t);

      return {
        state: {
          sim,
          objectives,
          ...(power ? { power } : {}),
          ...(dynamics !== undefined ? { dynamics } : {}),
          ...(ledger !== undefined ? { ledger } : {}),
          ...(exposure ? { exposure } : {}),
          ...(lost ? { lost } : {}),
        },
        executed,
        measurements: ship.measurements,
        sensed: ship.sensed,
        events,
        simEvents: stepped.events,
        ...(happened.length > 0 ? { dynamics: happened } : {}),
      };
    },
  };
}

function isVisible(env: ReturnType<typeof buildEnvironment>, id: string): boolean {
  const scene = env.fieldSignals['ship-environment'] as
    { readonly visibility?: Readonly<Record<string, boolean>> } | undefined;
  return scene?.visibility?.[id] === true;
}
