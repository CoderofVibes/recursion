/**
 * Independent S22 numerical port through production translation and field dispatch.
 * Prescribed delivered-force vectors and variable mass are not a certificate for
 * real attitude turns, RCS allocation, sensors, resources or game loss chronology.
 */
import { describe, expect, it } from 'vitest';
import reference from './s22-reference.json';
import type { FieldInstanceSpec, TruthWorld } from '../../contracts/truth/index.ts';
import type { SimState } from '../../sim/types.ts';
import type { Vec3 } from '../../lib/vec3.ts';
import * as v3 from '../../lib/vec3.ts';
import { createSimulation } from '../../sim/index.ts';
import { actuators, makeWorld, massProps, thrust } from '../../sim/test-helpers.ts';
import {
  createFunnelCrushIndex,
  createWellRegistry,
  createWellSpatialIndex,
  DEFAULT_FUNNEL_ACCELERATION_BOUND,
  funnelCrushSegment,
  funnelSpec,
  funnelSupportBounds,
  sampleFunnel,
} from '../../sim/fields/wells.ts';
import {
  advanceFunnelLifecycle,
  createFunnelLifecycle,
  funnelLifecycleActivation,
  restoreFunnelLifecycle,
  type FunnelLifecycleEvent,
  type FunnelLifecycleState,
} from './lifecycle.ts';

const vec = (a: readonly number[]): Vec3 => ({ x: a[0]!, y: a[1]!, z: a[2]! });
const HULL_RADIUS = 20;
const EXHAUST_VELOCITY = 320 * 9.80665;
const MAX_STEP = 0.25;
const CLEARANCE_SEARCH = 25_000;
type Crossing = (typeof reference.many_funnel_crossings)[number];

function fieldsFor(lifecycle: FunnelLifecycleState): readonly FieldInstanceSpec[] {
  const byId = new Map(lifecycle.sites.map((site) => [site.id, site]));
  return reference.nominalField.funnels.map((funnel) => {
    const id = `funnel-${funnel.id}`;
    const axis = vec(funnel.axis);
    return funnelSpec(
      id,
      v3.addScaled(vec(funnel.center), axis, -62_500),
      axis,
      funnelLifecycleActivation(byId.get(id)!),
    );
  });
}

function fly(crossing: Crossing) {
  let lifecycle = createFunnelLifecycle(
    reference.nominalField.funnels.map((funnel) => ({
      id: `funnel-${funnel.id}`,
      center: vec(funnel.center),
      birthOffset: funnel.on === 0 ? null : funnel.on,
    })),
    0,
  );
  let fields = fieldsFor(lifecycle);
  let registry = createWellRegistry(fields);
  let byId = new Map(fields.map((field) => [field.id, field]));
  const crushIndex = createFunnelCrushIndex(fields);
  const supportIndex = createWellSpatialIndex(
    fields.map((field) => ({ id: field.id, bounds: funnelSupportBounds(field) })),
  );
  let mass = crossing.initial.mass_kg;
  let world: TruthWorld = {
    ...makeWorld({
      position: vec(crossing.initial.position_m),
      velocity: vec(crossing.initial.velocity_m_s),
      mp: massProps({ mass }),
    }),
    fields,
  };
  const births: FunnelLifecycleEvent[] = [];
  const met = new Set<string>();
  let minimumClearance = CLEARANCE_SEARCH;
  let reachedExit = false;
  let steps = 0;
  // The study endpoint supplies a time limit only. Exit is located from actual motion.
  const limit = Math.ceil(crossing.t_s) + 5;
  const cuts = [
    ...new Set([
      0,
      limit,
      ...crossing.commands.flatMap((command) => [
        command.start_s,
        command.start_s + command.duration_s,
      ]),
      ...lifecycle.sites.flatMap((site) =>
        site.nominalBirth === null ? [] : [site.nominalBirth - 900, site.nominalBirth],
      ),
    ]),
  ].sort((a, b) => a - b);

  function recordSegment(before: SimState, after: SimState, h: number): void {
    const a = before.world.ship.kinematics;
    const b = after.world.ship.kinematics;
    // Under S22's bound, a curved COM path differs from its chord by at most a*h²/8.
    const curveBound = (DEFAULT_FUNNEL_ACCELERATION_BOUND * h * h) / 8;
    const candidates = crushIndex.candidatesAlongSegment(
      a.position,
      b.position,
      HULL_RADIUS + curveBound + CLEARANCE_SEARCH,
    );
    // Outside this expanded index query, clearance is at least CLEARANCE_SEARCH.
    for (const id of candidates) {
      const contact = funnelCrushSegment(
        byId.get(id)!,
        a.position,
        b.position,
        before.world.t,
        after.world.t,
        HULL_RADIUS,
      );
      if (contact.clearance !== null)
        minimumClearance = Math.min(minimumClearance, contact.clearance - curveBound);
    }
    for (const id of supportIndex.candidatesAt(b.position))
      if (sampleFunnel(byId.get(id)!, b.position, after.world.t).weight > 0) met.add(id);
  }

  for (let cut = 1; cut < cuts.length && !reachedExit; cut++) {
    const begin = cuts[cut - 1]!;
    const end = cuts[cut]!;
    const kinematics = world.ship.kinematics;
    const due = lifecycle.sites[lifecycle.dueCursor]?.nominalBirth === begin;
    const transition = advanceFunnelLifecycle(
      lifecycle,
      begin,
      due
        ? [
            {
              t: begin,
              position: kinematics.position,
              velocity: kinematics.velocity,
              hullRadius: HULL_RADIUS,
            },
          ]
        : [],
    );
    // Reload the actual decision tape before building fresh immutable field closures.
    lifecycle = restoreFunnelLifecycle(JSON.parse(JSON.stringify(transition.state)));
    births.push(...transition.events.filter((event) => event.kind !== 'precursor'));
    if (due) {
      fields = fieldsFor(lifecycle);
      registry = createWellRegistry(fields);
      byId = new Map(fields.map((field) => [field.id, field]));
      world = { ...world, fields };
    }
    const force = crossing.commands
      .filter((command) => command.start_s <= begin && begin < command.start_s + command.duration_s)
      .reduce((sum, command) => v3.add(sum, vec(command.force_N)), v3.ZERO);
    const rate = v3.length(force) / EXHAUST_VELOCITY;
    const count = Math.ceil((end - begin) / MAX_STEP);
    const h = (end - begin) / count;
    const simulation = createSimulation(world, { dt: h, registry });
    let state = simulation.initial;
    const startMass = mass;
    const inputFor = (previous: SimState, beforeMass: number, duration: number) => ({
      actuators: actuators(
        [thrust(v3.ZERO, force)],
        massProps({ mass: beforeMass - (rate * duration) / 2 }),
      ),
      systems: {
        ...previous.world.ship.systems,
        t: previous.world.t + duration,
        massProperties: massProps({ mass: beforeMass - rate * duration }),
      },
    });
    for (let i = 0; i < count; i++) {
      const beforeMass = startMass - i * h * rate;
      let result = simulation.step(state, inputFor(state, beforeMass, h));
      let duration = h;
      if (
        state.world.ship.kinematics.position.x < reference.field.exit_x_m &&
        result.state.world.ship.kinematics.position.x >= reference.field.exit_x_m
      ) {
        // Pure trial steps bracket the first plane crossing; no trial consumes lifecycle state.
        let lo = 0;
        let hi = h;
        for (let refine = 0; refine < 32; refine++) {
          const trialDuration = (lo + hi) / 2;
          const trial = createSimulation(state.world, { dt: trialDuration, registry });
          const outcome = trial.step(trial.initial, inputFor(state, beforeMass, trialDuration));
          if (outcome.state.world.ship.kinematics.position.x < reference.field.exit_x_m)
            lo = trialDuration;
          else hi = trialDuration;
        }
        duration = hi;
        const final = createSimulation(state.world, { dt: duration, registry });
        result = final.step(final.initial, inputFor(state, beforeMass, duration));
        reachedExit = true;
      }
      recordSegment(state, result.state, duration);
      state = result.state;
      steps++;
      mass = beforeMass - rate * duration;
      if (reachedExit) break;
    }
    world = state.world;
  }
  lifecycle = advanceFunnelLifecycle(lifecycle, world.t).state;
  return {
    world,
    mass,
    minimumClearance,
    births,
    met: [...met].sort(),
    lifecycle,
    reachedExit,
    steps,
  };
}

describe('S22 many-funnel numerical routes through production translation', () => {
  for (const [index, crossing] of reference.many_funnel_crossings.entries()) {
    it(
      `ports ${index === 0 ? 'negative' : 'positive'} transverse crossing with actual saved births`,
      { timeout: 60_000 },
      () => {
        const got = fly(crossing);
        const kinematics = got.world.ship.kinematics;
        expect(got.reachedExit).toBe(true);
        expect(Math.abs(kinematics.position.x - reference.field.exit_x_m)).toBeLessThan(1e-6);
        expect(Math.hypot(kinematics.position.y, kinematics.position.z)).toBeLessThan(
          reference.field.exit_disc_radius_m,
        );
        expect(v3.distance(kinematics.position, vec(crossing.final.position_m))).toBeLessThan(
          reference.port_tolerances.position_m,
        );
        expect(v3.distance(kinematics.velocity, vec(crossing.final.velocity_m_s))).toBeLessThan(
          reference.port_tolerances.velocity_m_s,
        );
        expect(Math.abs(got.mass - crossing.final.mass_kg)).toBeLessThan(
          reference.port_tolerances.mass_kg,
        );
        expect(got.world.ship.systems.massProperties.mass).toBe(got.mass);
        expect(got.minimumClearance).toBeGreaterThan(crossing.minimum_crush_clearance_bound_m - 1);
        expect(got.minimumClearance).toBeLessThan(CLEARANCE_SEARCH);
        expect(got.met).toEqual(crossing.influences_met.map((id) => `funnel-${id}`).sort());
        expect(got.steps).toBeGreaterThan(crossing.t_s / MAX_STEP - 1);
        const expected = crossing.events.filter(
          (event) => event.event === 'birth' || event.event === 'birth-veto',
        );
        const decisions = (events: readonly { id: string; t: number; kind: string }[]) =>
          events.map((event) => `${event.t}:${event.id}:${event.kind}`).sort();
        expect(decisions(got.births)).toEqual(
          decisions(
            expected.map((event) => ({
              id: `funnel-${event.id}`,
              t: event.t_s,
              kind: event.event,
            })),
          ),
        );
        expect([...new Set(got.births.map((event) => event.t))]).toEqual([1200, 1800, 2400]);
        expect(got.births).toHaveLength(reference.field.birth_sites);
        expect(got.lifecycle.dueCursor).toBe(reference.field.count);
        expect(got.lifecycle.sites.every((site) => site.phase === 'active')).toBe(true);
        for (const event of got.births) {
          const independent = expected.find((candidate) => `funnel-${candidate.id}` === event.id)!;
          expect('guardMargin' in event && event.guardMargin).toBeGreaterThan(0);
          if ('guardMargin' in event)
            expect(Math.abs(event.guardMargin - independent.reachable_clearance_m!)).toBeLessThan(
              1,
            );
        }
      },
    );
  }
});
