/**
 * TRUTH side. One simulation tick (src/contracts/README.md § One simulation tick):
 *
 *   1. build EnvironmentEffects from the truth world (sunlight, shadows, what the camera sees);
 *   2. ship systems (2B) step with the commands due now;
 *   3. simulation (2A) integrates bodies, asteroids and the ship with the actuators;
 *   4. contacts become ShipEvents, the world decides loss and objectives.
 *
 * What comes out for the believed side is only what the ship sensed: recorded measurements and
 * ShipEvents. Truth stays in `GameTruthState`.
 */

import type { Command, ExecutedCommand, CommandSource } from '../contracts/commands.ts';
import type { PlanId, PlanItemId } from '../contracts/ids.ts';
import type { LossCause, Measurement, ShipEvent } from '../contracts/measurements.ts';
import type { MassProperties } from '../contracts/ship.ts';
import type { SimEvent } from '../contracts/truth/index.ts';
import { createSimulation, type SimState, type Simulation } from '../sim/index.ts';
import { stepShipSystems } from '../ship/index.ts';
import type { EncounterSetup } from './encounter.ts';
import { buildEnvironment, type EnvironmentOptions } from './environment.ts';
import {
  evaluateObjectives,
  initialObjectiveProgress,
  type ObjectiveProgress,
} from './objectives.ts';

/** Everything true about an attempt in flight. Plain JSON; save, restore and hash freely. */
export interface GameTruthState {
  readonly sim: SimState;
  readonly objectives: ObjectiveProgress;
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

/** Mean of two mass-property sets; the hull is the newer one. */
function midStepMassProperties(before: MassProperties, after: MassProperties): MassProperties {
  return {
    mass: 0.5 * (before.mass + after.mass),
    centerOfMass: {
      x: 0.5 * (before.centerOfMass.x + after.centerOfMass.x),
      y: 0.5 * (before.centerOfMass.y + after.centerOfMass.y),
      z: 0.5 * (before.centerOfMass.z + after.centerOfMass.z),
    },
    // LIFT(2G): the principal moments are averaged on the newer axes, which is the mean inertia
    // only while the principal axes do not turn within a step.
    inertia: {
      moments: {
        x: 0.5 * (before.inertia.moments.x + after.inertia.moments.x),
        y: 0.5 * (before.inertia.moments.y + after.inertia.moments.y),
        z: 0.5 * (before.inertia.moments.z + after.inertia.moments.z),
      },
      axes: after.inertia.axes,
    },
    hull: after.hull,
  };
}

export function createTruthStepper(setup: EncounterSetup): TruthStepper {
  const { definition, objectiveRules, play } = setup;
  const simulation = createSimulation(definition.world, { dt: definition.dt });
  const environment: EnvironmentOptions = {
    // The camera can range the bodies whose radius the briefing gives.
    knownSizeTargets: definition.briefing.knownBodies.map((b) => b.id),
    sunExclusionAngle: play.sunExclusionAngle,
  };
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
      const env = buildEnvironment(before, environment);

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
          // The ship can name what it hit only if the camera could see it this tick.
          ...(isVisible(env, contact.with) ? { with: contact.with } : {}),
          impulse: contact.impulse,
        });
        if (contact.relativeSpeed >= play.lossSpeed && !lost) {
          lost = 'collision';
          lostAt = contact.t;
        }
      }
      let objectives = state.objectives;
      if (lost) {
        events.push({ kind: 'ship-lost', t: lostAt, cause: lost });
      } else {
        const judged = evaluateObjectives(objectiveRules, objectives, sim.world);
        objectives = judged.progress;
        events.push(...judged.events);
      }
      events.sort((a, b) => a.t - b.t);

      return {
        state: { sim, objectives, ...(lost ? { lost } : {}) },
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
