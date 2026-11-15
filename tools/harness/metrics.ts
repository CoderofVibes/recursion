/**
 * Truth-side evaluation only. None of this report is passed to a pilot, model or recorder.
 * Values come from production state, interval ledgers, acquired packets and events; the
 * harness neither integrates motion nor invents damage, electrical or success thresholds.
 */
import type { Measurement, ShipEvent } from '../../src/contracts/measurements.ts';
import { hullReach, type Hull } from '../../src/contracts/ship.ts';
import type { JsonValue } from '../../src/contracts/units.ts';
import type { EncounterSetup } from '../../src/game/encounter.ts';
import {
  midStepMassProperties,
  type GameTruthState,
  type TickResult,
} from '../../src/game/truth-step.ts';
import { rotateInverse } from '../../src/lib/quat.ts';
import type { Vec3 } from '../../src/lib/vec3.ts';
import {
  createPrismResult,
  packPrism,
  segmentHull,
  type PackedPrism,
} from '../../src/sim/geometry.ts';

interface Range {
  min: number;
  max: number;
  final: number;
}

interface Integral extends Range {
  /** Integral of production interval-average rates, not endpoint trapezoids. */
  integral: number;
  sampledSeconds: number;
}

interface ComponentMetric {
  initialCondition: number;
  condition: Range;
  everTripped: boolean;
  finalTripped: boolean;
  finalMode: string;
  powerDrawW: Range;
  temperatureK: Range | null;
  chargeJ: Range | null;
  initialExposure: number | null;
  finalExposure: number | null;
  exposureAdded: number | null;
}

interface ObservationMetric {
  packets: number;
  firstAt: number;
  lastAt: number;
  maxGapSeconds: number;
  byKind: Record<string, number>;
}

interface ClearanceMetric {
  t: number;
  with: string;
  distance: number;
  source: 'completed-pass' | 'pending-pass' | 'impact';
}

interface SweptMinimum {
  t: number;
  with: string;
  distance: number;
  source: 'production-geometry' | 'impact';
}

/**
 * Re-evaluate geometry on production endpoints, not motion. A conservative enclosing-sphere
 * test rejects only segments unable to improve the retained minimum. Actual candidates use
 * the simulator's own segmentHull. The midpoint COM/end hull match createTruthStepper.
 */
function createSweepMetrics(initial: GameTruthState) {
  let previous = initial;
  let minimum: SweptMinimum | null = null;
  let bound = Infinity;
  let intervals = 0;
  let objectIntervals = 0;
  let refined = 0;
  let culled = 0;
  let contactIntervals = 0;
  let unpairedObjectIntervals = 0;
  const unpairedIds = new Set<string>();
  const packs = new WeakMap<Hull, readonly PackedPrism[]>();
  const scratch = createPrismResult();
  const keep = (candidate: SweptMinimum) => {
    if (minimum === null || candidate.distance < minimum.distance) minimum = candidate;
  };
  const unpaired = (id: string) => {
    unpairedObjectIntervals += 1;
    unpairedIds.add(id);
  };
  type Sphere = { readonly id: string; readonly radius: number; readonly position: Vec3 };

  return {
    sample(result: TickResult) {
      intervals += 1;
      const before = previous.sim.world;
      const priorContacts = previous.sim.contacts;
      const after = result.state.sim.world;
      previous = result.state;
      for (const event of result.simEvents)
        if (event.kind === 'impact')
          keep({ t: event.t, with: event.with, distance: 0, source: 'impact' });
      // Contact response relocates the endpoint, losing the original unconstrained trajectory.
      if (
        result.simEvents.some((event) => event.kind === 'impact') ||
        result.state.sim.contacts.length > 0 ||
        priorContacts.length > 0
      ) {
        contactIntervals += 1;
        return;
      }
      const a = before.ship.kinematics;
      const b = after.ship.kinematics;
      const mass = midStepMassProperties(
        before.ship.systems.massProperties,
        after.ship.systems.massProperties,
      );
      const com = mass.centerOfMass;
      const reach = hullReach(mass.hull, com);
      let packed = packs.get(mass.hull);
      if (!packed) {
        packed = mass.hull.length
          ? mass.hull.map((part) => packPrism(part.outline, part.zMin, part.zMax))
          : [packPrism([{ x: com.x, y: com.y }], com.z, com.z)];
        // Empty hull means a CoM point, which can move as tanks empty; do not cache it.
        if (mass.hull.length) packs.set(mass.hull, packed);
      }

      const evaluate = (first: readonly Sphere[], last: readonly Sphere[]) => {
        let byId: Map<string, Sphere> | undefined;
        const matched =
          first.length === last.length && first.every((item, index) => item.id === last[index]!.id);
        if (!matched) {
          byId = new Map(last.map((item) => [item.id, item]));
          const oldIds = new Set(first.map((item) => item.id));
          for (const item of last) if (!oldIds.has(item.id)) unpaired(item.id);
        }
        for (let index = 0; index < first.length; index++) {
          const old = first[index]!;
          const current = matched ? last[index]! : byId!.get(old.id);
          if (!current || current.radius !== old.radius) {
            unpaired(old.id);
            continue;
          }
          objectIntervals += 1;
          const p = rotateInverse(a.attitude, {
            x: old.position.x - a.position.x,
            y: old.position.y - a.position.y,
            z: old.position.z - a.position.z,
          });
          const q = rotateInverse(b.attitude, {
            x: current.position.x - b.position.x,
            y: current.position.y - b.position.y,
            z: current.position.z - b.position.z,
          });
          const dx = q.x - p.x,
            dy = q.y - p.y,
            dz = q.z - p.z;
          const length2 = dx * dx + dy * dy + dz * dz;
          const tau =
            length2 === 0
              ? 0
              : Math.max(0, Math.min(1, -(p.x * dx + p.y * dy + p.z * dz) / length2));
          const distance = Math.hypot(p.x + tau * dx, p.y + tau * dy, p.z + tau * dz);
          // Round downward generously at machine precision, not by a gameplay safety margin.
          const rounding =
            Number.EPSILON *
            64 *
            (Math.hypot(p.x, p.y, p.z) + Math.hypot(q.x, q.y, q.z) + reach + current.radius + 1);
          const lower = distance - reach - current.radius - rounding;
          bound = Math.min(bound, lower);
          if (minimum !== null && lower > minimum.distance) {
            culled += 1;
            continue;
          }
          refined += 1;
          segmentHull(
            com.x + p.x,
            com.y + p.y,
            com.z + p.z,
            com.x + q.x,
            com.y + q.y,
            com.z + q.z,
            packed,
            -1,
            scratch,
          );
          keep({
            t: before.t + (after.t - before.t) * scratch.tau,
            with: old.id,
            distance: Math.max(0, scratch.distance - current.radius),
            source: 'production-geometry',
          });
        }
      };
      evaluate(before.bodies, after.bodies);
      evaluate(before.asteroids, after.asteroids);
    },
    finish() {
      const complete = contactIntervals === 0 && unpairedObjectIntervals === 0 && intervals > 0;
      return {
        minimum: minimum as SweptMinimum | null,
        wholeFlightMinimumMeters: complete
          ? ((minimum as SweptMinimum | null)?.distance ?? null)
          : null,
        evaluatedBoundingSphereLowerBoundMeters: Number.isFinite(bound) ? bound : null,
        complete,
        coverage: {
          intervals,
          objectIntervals,
          refined,
          culled,
          contactIntervals,
          unpairedObjectIntervals,
          unpairedIds: [...unpairedIds].sort(),
        },
        method:
          'Production segmentHull on body-frame endpoint chords, using production midpoint COM and end-of-tick hull. A conservative hull bounding-sphere test culls segments that cannot improve the retained minimum. Spheres are bodies/asteroids; local fields and apertures need their authored evaluators.',
        limitation:
          'This measures the production fixed-tick geometry approximation, requiring |omega|*dt << 1, not an exact continuous trajectory. End-hull geometry is held fixed during each tick as in production, so sub-tick appendage motion is not certified. Contact-relocated or missing/new/radius-changing object endpoints make full coverage incomplete; authoritative impacts still report zero. Missing absorbed-object trajectories require TickResult to expose the original Simulation.minClearance/absorbed result. A negative bounding-sphere bound alone is not a collision.',
      };
    },
  };
}

export interface FailedMargin {
  t: number;
  kind: string;
  subject: string;
  detail: string;
}

const range = (value: number): Range => ({ min: value, max: value, final: value });
function observe(previous: Range | null, value: number | undefined): Range | null {
  if (value === undefined || !Number.isFinite(value)) return previous;
  if (!previous) return range(value);
  previous.min = Math.min(previous.min, value);
  previous.max = Math.max(previous.max, value);
  previous.final = value;
  return previous;
}
const object = (value: JsonValue | undefined): Record<string, JsonValue> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, JsonValue>)
    : undefined;
const numeric = (value: JsonValue | undefined): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/** One sampler per flight/leg. Call sample for EVERY production tick, even at high warp. */
export function createMetrics(setup: EncounterSetup, initial: GameTruthState) {
  const definition = setup.definition.ship;
  const start = initial.sim.world.t;
  let lastTime = start;
  let ticks = 0;
  let firstFailedMargin: FailedMargin | null = null;
  let minClearance: ClearanceMetric | null = null;
  let completedPasses = 0;
  let impacts = 0;
  let maxHullReach = 0;
  let maxAngularStep = 0;
  let maxRollRate = 0;
  let maxAngularSpeed = 0;
  const components: Record<string, ComponentMetric> = {};
  const tanks: Record<string, { initialKg: number; remainingKg: Range }> = {};
  const thermal: Record<string, Range> = {};
  const operatingMargin: Record<string, Range> = {};
  const ledgers: Record<string, Integral> = {};
  const byKind: Record<string, number> = {};
  const observations: Record<string, ObservationMetric> = {};
  const eventCounts: Record<string, number> = {};
  const deliveredImpulse: Record<string, number> = {};
  const unservedImpulse: Record<string, { initial: number; final: number }> = {};
  const initialSystems = initial.sim.world.ship.systems;
  const swept = createSweepMetrics(initial);
  let acquiredPackets = 0;

  function fail(failure: FailedMargin): void {
    if (firstFailedMargin === null || failure.t < firstFailedMargin.t) firstFailedMargin = failure;
  }

  function clearance(value: ClearanceMetric): void {
    if (minClearance === null || value.distance < minClearance.distance) minClearance = value;
  }

  function ledger(name: string, value: number | undefined, dt: number): void {
    if (value === undefined) return;
    const before = ledgers[name];
    if (!before) {
      ledgers[name] = { ...range(value), integral: value * dt, sampledSeconds: dt };
      return;
    }
    observe(before, value);
    before.integral += value * dt;
    before.sampledSeconds += dt;
  }

  function stateMetrics(state: GameTruthState, dt: number): void {
    const { systems, kinematics } = state.sim.world.ship;
    const t = state.sim.world.t;
    const mass = systems.massProperties;
    maxHullReach = Math.max(maxHullReach, hullReach(mass.hull, mass.centerOfMass));
    const omega = kinematics.angularVelocity;
    const speed = Math.hypot(omega.x, omega.y, omega.z);
    maxAngularSpeed = Math.max(maxAngularSpeed, speed);
    maxAngularStep = Math.max(maxAngularStep, speed * setup.definition.dt);
    maxRollRate = Math.max(maxRollRate, Math.abs(omega.x));
    for (const [id, amount] of Object.entries(systems.tanks)) {
      const previous = tanks[id];
      if (previous) observe(previous.remainingKg, amount);
      else tanks[id] = { initialKg: amount, remainingKg: range(amount) };
    }
    for (const [id, value] of Object.entries(systems.thermal)) {
      thermal[id] = observe(thermal[id] ?? null, value)!;
      const node = definition.thermalNodes.find((candidate) => candidate.id === id);
      if (node) {
        const margin = Math.min(value - node.min, node.max - value);
        operatingMargin[id] = observe(operatingMargin[id] ?? null, margin)!;
        if (margin < 0)
          fail({
            t,
            kind: 'thermal-operating-limit',
            subject: id,
            detail: `Margin ${margin} K to nominal operating limit`,
          });
      }
    }
    for (const [id, equipment] of Object.entries(systems.equipment)) {
      let metric = components[id];
      if (!metric) {
        const exposure = systems.exposure[id] ?? null;
        metric = {
          initialCondition: equipment.condition,
          condition: range(equipment.condition),
          everTripped: equipment.tripped,
          finalTripped: equipment.tripped,
          finalMode: equipment.mode,
          powerDrawW: range(equipment.powerDraw),
          temperatureK: observe(null, equipment.temperature),
          chargeJ: observe(null, equipment.values.charge),
          initialExposure: exposure,
          finalExposure: exposure,
          exposureAdded: exposure === null ? null : 0,
        };
        components[id] = metric;
      }
      observe(metric.condition, equipment.condition);
      observe(metric.powerDrawW, equipment.powerDraw);
      metric.temperatureK = observe(metric.temperatureK, equipment.temperature);
      metric.chargeJ = observe(metric.chargeJ, equipment.values.charge);
      metric.finalMode = equipment.mode;
      metric.everTripped ||= equipment.tripped;
      metric.finalTripped = equipment.tripped;
      metric.finalExposure = systems.exposure[id] ?? null;
      metric.exposureAdded =
        metric.initialExposure === null || metric.finalExposure === null
          ? null
          : metric.finalExposure - metric.initialExposure;
      if (equipment.condition <= 0)
        fail({
          t,
          kind: 'component-failed',
          subject: id,
          detail: 'Production condition reached zero',
        });
      if (equipment.tripped)
        fail({
          t,
          kind: 'protection-tripped',
          subject: id,
          detail: 'Production protection state is tripped',
        });
      if (dt > 0 && equipment.values.impulse !== undefined)
        deliveredImpulse[id] = (deliveredImpulse[id] ?? 0) + equipment.values.impulse;
      if (equipment.values.unservedImpulse !== undefined) {
        const initialValue = initialSystems.equipment[id]?.values.unservedImpulse ?? 0;
        unservedImpulse[id] = { initial: initialValue, final: equipment.values.unservedImpulse };
      }
    }
    if (dt > 0) {
      const power = object(systems.ext?.power);
      const heat = object(systems.ext?.thermal);
      for (const name of [
        'generated',
        'fuelGenerated',
        'discharged',
        'charged',
        'load',
        'conversionLoss',
        'batteryLoss',
        'unmet',
      ])
        ledger(`power.${name}`, numeric(power?.[name]), dt);
      for (const name of ['heatInput', 'radiated'])
        ledger(`thermal.${name}`, numeric(heat?.[name]), dt);
      // This ledger field is already an interval energy, so convert to a rate first.
      const energy = numeric(heat?.storedEnergyChange);
      ledger('thermal.storedEnergyRate', energy === undefined ? undefined : energy / dt, dt);
      const residual = numeric(heat?.energyResidual);
      ledger('thermal.energyResidualRate', residual === undefined ? undefined : residual / dt, dt);
      if ((numeric(power?.unmet) ?? 0) > 0)
        fail({
          t: t - dt,
          kind: 'unmet-electrical-load',
          subject: 'power',
          detail: `${power!.unmet} W unmet during this interval`,
        });
    }
  }

  function observation(measurement: Measurement): void {
    acquiredPackets += 1;
    byKind[measurement.kind] = (byKind[measurement.kind] ?? 0) + 1;
    if (!measurement.target && !measurement.field) return;
    // Prefix prevents a field and object with the same id being conflated.
    const id = measurement.target ? `target:${measurement.target}` : `field:${measurement.field}`;
    let metric = observations[id];
    if (!metric) {
      metric = {
        packets: 0,
        firstAt: measurement.t,
        lastAt: measurement.t,
        maxGapSeconds: 0,
        byKind: {},
      };
      observations[id] = metric;
    }
    metric.packets += 1;
    metric.maxGapSeconds = Math.max(metric.maxGapSeconds, measurement.t - metric.lastAt);
    metric.firstAt = Math.min(metric.firstAt, measurement.t);
    metric.lastAt = Math.max(metric.lastAt, measurement.t);
    metric.byKind[measurement.kind] = (metric.byKind[measurement.kind] ?? 0) + 1;
  }

  function event(event: ShipEvent): void {
    eventCounts[event.kind] = (eventCounts[event.kind] ?? 0) + 1;
    switch (event.kind) {
      case 'breaker-trip':
      case 'battery-depleted':
      case 'equipment-fault':
      case 'load-shed':
        fail({
          t: event.t,
          kind: event.kind,
          subject: event.equipment,
          detail: JSON.stringify(event),
        });
        break;
      case 'thermal-limit':
        fail({ t: event.t, kind: event.kind, subject: event.node, detail: JSON.stringify(event) });
        break;
      case 'propellant-depleted':
        fail({ t: event.t, kind: event.kind, subject: event.tank, detail: JSON.stringify(event) });
        break;
      case 'ship-lost':
        fail({ t: event.t, kind: event.kind, subject: 'ship', detail: event.cause });
        break;
    }
  }

  stateMetrics(initial, 0);

  return {
    sample(result: TickResult): void {
      const time = result.state.sim.world.t;
      if (!Number.isFinite(time) || Math.abs(time - lastTime - setup.definition.dt) > 1e-6)
        throw new Error(
          'Metrics need every consecutive production tick; sampling batches loses resource and clearance evidence.',
        );
      lastTime = time;
      ticks += 1;
      swept.sample(result);
      for (const value of result.simEvents) {
        if (value.kind === 'clearance') {
          completedPasses += 1;
          clearance({ ...value, source: 'completed-pass' });
        } else if (value.kind === 'impact') {
          impacts += 1;
          clearance({ t: value.t, with: value.with, distance: 0, source: 'impact' });
          fail({
            t: value.t,
            kind: 'hull-contact',
            subject: value.with,
            detail: `Relative speed ${value.relativeSpeed} m/s`,
          });
        }
      }
      for (const [id, value] of Object.entries(result.state.sim.closing))
        clearance({ ...value, with: id, source: 'pending-pass' });
      for (const value of result.events) event(value);
      for (const value of result.measurements) observation(value);
      stateMetrics(result.state, setup.definition.dt);
    },

    finish(state: GameTruthState) {
      if (!Number.isFinite(state.sim.world.t) || Math.abs(state.sim.world.t - lastTime) > 1e-6)
        throw new Error('Final state differs from the last sampled tick.');
      const ship = state.sim.world.ship;
      const summarizeTanks = (ids: readonly string[]) => ({
        initialKg: ids.reduce((sum, id) => sum + (tanks[id]?.initialKg ?? 0), 0),
        remainingKg: ids.reduce((sum, id) => sum + (tanks[id]?.remainingKg.final ?? 0), 0),
        consumedKg: ids.reduce(
          (sum, id) => sum + ((tanks[id]?.initialKg ?? 0) - (tanks[id]?.remainingKg.final ?? 0)),
          0,
        ),
      });
      const measuredClearance = minClearance as ClearanceMetric | null;
      const sweep = swept.finish();
      return {
        audience: 'truth-side evaluation only',
        interval: { start, end: lastTime, ticks, dt: setup.definition.dt },
        outcome: state.lost
          ? { kind: 'lost', cause: state.lost }
          : state.objectives.completed
            ? { kind: 'completed', objective: state.objectives.completed }
            : { kind: 'in-progress' },
        firstFailedMargin,
        clearance: {
          minimumReportedPass: measuredClearance,
          completedPasses,
          impacts,
          maxHullReachMeters: maxHullReach,
          // A conservative bound on these reported minima only, not a complete-flight bound.
          reportedPassHullLowerBoundMeters:
            measuredClearance === null
              ? null
              : measuredClearance.source === 'impact'
                ? 0
                : measuredClearance.distance - maxHullReach,
          wholeFlightSweptMinimumMeters: sweep.wholeFlightMinimumMeters,
          evaluatedSweepMinimumMeters: sweep.minimum?.distance ?? null,
          swept: sweep,
          limitation:
            'Pass-event figures can omit receding and unfinished far passes and use CoM distance beyond 5000 m. The separate swept report evaluates every available endpoint pair with production hull geometry and documents incomplete coverage and fixed-tick limits.',
        },
        resources: {
          main: summarizeTanks(
            definition.tanks
              .filter((tank) => tank.feeds.includes('main-engine'))
              .map((tank) => tank.id),
          ),
          rcs: summarizeTanks(
            definition.tanks
              .filter((tank) =>
                tank.feeds.some((id) =>
                  definition.equipment.some(
                    (equipment) => equipment.id === id && equipment.kind === 'rcs-thruster',
                  ),
                ),
              )
              .map((tank) => tank.id),
          ),
          tanks,
          ledgers,
          ledgerUnits:
            'min/max/final are W; integral is J. sampledSeconds states coverage. Missing keys mean unavailable, never zero.',
          thermalNodesK: thermal,
          thermalOperatingMarginsK: operatingMargin,
          recorder: ship.systems.recorder,
        },
        components,
        control: {
          maxAngularSpeedRadPerSecond: maxAngularSpeed,
          maxAbsoluteBodyRollRateRadPerSecond: maxRollRate,
          maxAngularStepRadians: maxAngularStep,
          deliveredImpulseNs: deliveredImpulse,
          unservedImpulseNs: Object.fromEntries(
            Object.entries(unservedImpulse).map(([id, value]) => [id, value.final - value.initial]),
          ),
          quantifiedReachabilityMargin: null,
          limitation:
            'Rates, delivered/unserved impulses and component condition are diagnostics. They do not establish remaining directional control authority or roll-held reachability; those require an authored maneuver and acceptance envelope.',
        },
        observations: {
          packets: acquiredPackets,
          byKind,
          byTarget: Object.fromEntries(
            Object.entries(observations).map(([id, value]) => [
              id,
              { ...value, freshnessSeconds: lastTime - value.lastAt },
            ]),
          ),
          limitation:
            'Counts and acquisition gaps are from recorded production packets. Packet counts do not prove spatial coverage; unseen targets and fields are unresolved. Forecast horizon belongs to the separate real-model result.',
        },
        events: eventCounts,
      };
    },
  };
}

export type FlightMetrics = ReturnType<ReturnType<typeof createMetrics>['finish']>;
