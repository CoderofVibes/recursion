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
import { addSym3, fromPrincipal, principalAxes, scaleSym3 } from '../lib/sym3.ts';
import { createSimulation, type SimState, type Simulation } from '../sim/index.ts';
import { stepShipSystems } from '../ship/index.ts';
import type { EncounterSetup } from './encounter.ts';
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
  /** What the ship noticed this tick, in time order. */
  readonly events: readonly ShipEvent[];
  /** Truth-only events (true clearances, impacts). For tests and tuning; never forwarded. */
  readonly simEvents: readonly SimEvent[];
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

export function createTruthStepper(setup: EncounterSetup): TruthStepper {
  const { definition, objectiveRules, play } = setup;
  const simulation = createSimulation(definition.world, {
    dt: definition.dt,
    ...(setup.fields ? { registry: setup.fields } : {}),
  });
  const intensityFields = simulation.fields.filter((f) => typeof f.intensity === 'function');
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
    intensityFields,
    ship: definition.ship,
  };
  const hook = setup.environment;
  const sun = definition.world.sun;
  const initial: GameTruthState = {
    sim: simulation.initial,
    objectives: initialObjectiveProgress,
  };

  return {
    dt: definition.dt,
    simulation,
    initial,

    step(state, commands = []): TickResult {
      if (state.lost) throw new Error('the ship is lost; start a new attempt');
      const before = state.sim;
      const t = before.world.t;

      // 1. Environment at the start of the tick.
      const built = buildEnvironment(before, environment);
      const env = hook ? hook(before, built) : built;
      // The exposure account: this tick's intensity, held over the tick.
      let exposure = state.exposure;
      for (const id in env.intensity) {
        const dose = env.intensity[id]! * definition.dt;
        if (!(dose > 0)) continue;
        exposure = { ...exposure, [id]: (exposure?.[id] ?? 0) + dose };
      }

      // 2. Ship systems over [t, t + dt].
      const ship = stepShipSystems(
        before.world.ship.systems,
        definition.ship,
        commands.map((c) => c.command),
        env,
        definition.dt,
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
      const stepped = simulation.step(before, {
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
      // Critical electrical service (A18 (5)), on the systems as the tick left them. A collision
      // this tick comes first; a power loss this tick comes before any objective it would meet.
      let power = state.power;
      if (!lost) {
        const judged = evaluatePower(
          power ?? initialPowerProgress,
          ship.state,
          definition.ship,
          definition.dt,
          play.power.lossGrace,
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
        const judged = evaluateObjectives(objectiveRules, objectives, sim.world, spent);
        objectives = judged.progress;
        events.push(...judged.events);
      }
      events.sort((a, b) => a.t - b.t);

      return {
        state: {
          sim,
          objectives,
          ...(power ? { power } : {}),
          ...(exposure ? { exposure } : {}),
          ...(lost ? { lost } : {}),
        },
        executed,
        measurements: ship.measurements,
        events,
        simEvents: stepped.events,
      };
    },
  };
}

function isVisible(env: ReturnType<typeof buildEnvironment>, id: string): boolean {
  const scene = env.fieldSignals['ship-environment'] as
    { readonly visibility?: Readonly<Record<string, boolean>> } | undefined;
  return scene?.visibility?.[id] === true;
}
