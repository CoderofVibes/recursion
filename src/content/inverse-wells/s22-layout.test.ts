import { describe, expect, it } from 'vitest';
import reference from './s22-reference.json';
import { s22Layout, s22LocalWells, seededS22Layout, S22_CATALOGUE_SEEDS } from './s22-layout.ts';
import { createInverseWells, INVERSE_WELLS_ENTRY } from './index.ts';
import { advanceFunnelLifecycle } from './lifecycle.ts';
import { encounterEntry, saveSlot } from '../../game/encounters.ts';
import { distance, addScaled, dot, lengthSq, sub, type Vec3 } from '../../lib/vec3.ts';
import { rotate } from '../../lib/quat.ts';
import { evaluateObjectives, initialObjectiveProgress } from '../../game/objectives.ts';
import { createSimulation } from '../../sim/index.ts';
import { readFunnelParameters } from '../../sim/fields/wells.ts';

const vec = (p: readonly number[]): Vec3 => ({ x: p[0]!, y: p[1]!, z: p[2]! });

describe('committed S22 geometry and loading', () => {
  it('reproduces all 2601 independent nominal sites with the game RNG and exact draw order', () => {
    const wells = s22LocalWells(22000);
    expect(wells).toHaveLength(2601);
    wells.forEach((well, i) => {
      const expected = reference.nominalField.funnels[i]!;
      expect(well.id).toBe(`funnel-${expected.id}`);
      expect(distance(well.center, vec(expected.center))).toBeLessThan(1e-8);
      expect(distance(well.funnel!.axis, vec(expected.axis))).toBeLessThan(1e-12);
      expect(well.funnel!.birthOffset).toBe(expected.on === 0 ? null : expected.on);
    });
    expect(wells.filter((well) => well.funnel!.birthOffset !== null)).toHaveLength(650);
  });

  it('retains all proposal rejections and only selects the seven new mechanics entries', () => {
    expect(S22_CATALOGUE_SEEDS).toEqual(reference.seedAudit.admitted_ids);
    expect(reference.seedAudit.first_failure_counts).toEqual({
      'preparation-margin': 13,
      'warning-or-recovery': 9,
      'crossing-neighborhood': 3,
    });
    for (const candidate of reference.seedAudit.candidates) {
      const x = candidate.initial.position_m[0]!;
      const vx = candidate.initial.velocity_m_s[0]!;
      const clearance = 120_000 - 1020 - x! - vx * 560 - 0.5 * 0.1 * 560 ** 2;
      expect(clearance).toBeCloseTo(candidate.preparation_clearance_bound_m, 7);
      expect(S22_CATALOGUE_SEEDS.includes(candidate.seed)).toBe(candidate.admitted);
    }
    expect(() => s22Layout(22001)).toThrow(/not in/);
    expect(() => s22Layout(16002)).toThrow(/not in/);
    expect(seededS22Layout('repeat')).toEqual(seededS22Layout('repeat'));
  });

  it('builds source-free pulling funnels without thousands of body/occlusion entries', () => {
    const setup = createInverseWells('nominal', { layout: s22Layout() });
    expect(setup.contentStatus).toBe('funnel-prototype');
    expect(setup.definition.world.fields).toHaveLength(2601);
    expect(setup.definition.world.bodies).toHaveLength(1);
    expect(setup.definition.world.bodies[0]!.gm).toBe(0);
    const fields = setup.definition.world.fields.map((spec) => setup.fields.create(spec));
    expect(fields.filter((field) => field.acceleration)).toHaveLength(1);
    expect(fields.filter((field) => field.modifyThrust)).toHaveLength(1);
    expect(readFunnelParameters(setup.definition.world.fields[4]!).activation).toEqual({
      phase: 'pending',
    });
    expect(JSON.stringify(setup.definition.briefing)).not.toMatch(
      /pullMin|mouthRadius|activeSince|dueCursor|s22\.geometry|catalogueSeed/,
    );
    const sim = createSimulation(setup.definition.world, { dt: 1, registry: setup.fields });
    let state = sim.initial;
    for (let i = 0; i < 100; i++) state = sim.step(state).state;
    expect(
      distance(
        state.world.ship.kinematics.velocity,
        setup.definition.world.ship.kinematics.velocity,
      ),
    ).toBeGreaterThan(2);
  });

  it('preserves actual carried ship/evidence and requires saved lifecycle at a late epoch', () => {
    const layout = s22Layout();
    const base = createInverseWells('carried', { layout });
    const ship = {
      ...base.definition.world.ship,
      systems: { ...base.definition.world.ship.systems, t: 10 },
    };
    const briefing = {
      ...base.definition.briefing,
      arrivalEstimate: { ...base.definition.briefing.arrivalEstimate, t: 10 },
    };
    const arrival = { ship, definition: base.definition.ship, briefing };
    expect(() => createInverseWells('carried', { layout, arrival })).toThrow(/saved lifecycle/);
    const lifecycle = advanceFunnelLifecycle(base.funnelLifecycle!, 10, []).state;
    const carried = createInverseWells('carried', {
      layout,
      arrival,
      lifecycle,
      entrance: 'cross-transfer',
    });
    expect(carried.definition.world.ship).toBe(ship);
    expect(carried.definition.briefing).toBe(briefing);
    expect(carried.arrivalCommands).toEqual([]);
    expect(carried.funnelLifecycle).toEqual(lifecycle);
    expect(() =>
      createInverseWells('carried', { layout: s22Layout(22005), arrival, lifecycle }),
    ).toThrow(/match this layout/);
  });

  it('guards actual support anchors and points at the actual established reference', () => {
    const layout = s22Layout();
    expect(() =>
      createInverseWells('bad-anchor', {
        layout: {
          ...layout,
          wells: layout.wells.map((well, i) =>
            i === 4 ? { ...well, center: { ...well.center, x: well.center.x + 1e6 } } : well,
          ),
        },
      }),
    ).toThrow(/anchor/);
    const pending = layout.wells[4]!;
    const reordered = {
      ...layout,
      wells: [pending, ...layout.wells.filter((well) => well !== pending)],
    };
    const setup = createInverseWells('reorder', { layout: reordered });
    expect(setup.arrivalCommands).toContainEqual({
      kind: 'point',
      sensor: 'camera',
      target: setup.definition.world.bodies[0]!.id,
    });
    expect(() =>
      createInverseWells('no-reference', { layout: { ...layout, wells: [pending] } }),
    ).toThrow(/navigation reference/);
    const scaledAxes = createInverseWells('scaled-axes', {
      layout: {
        ...layout,
        wells: layout.wells.map((well) => ({
          ...well,
          funnel: {
            ...well.funnel!,
            // Accepted rounded unit axes must share the field parser's normalization.
            axis: addScaled({ x: 0, y: 0, z: 0 }, well.funnel!.axis, 1 + 5e-11),
          },
        })),
      },
    });
    const reference = readFunnelParameters(scaledAxes.definition.world.fields[0]!);
    expect(
      distance(
        scaledAxes.definition.world.bodies[0]!.position,
        addScaled(reference.mouth, reference.axis, reference.length),
      ),
    ).toBeLessThan(1e-8);
  });

  it('loads by its agreed ID and isolated save slot while Gravity stays the default', () => {
    expect(encounterEntry('inverse-wells')).toBe(INVERSE_WELLS_ENTRY);
    expect(encounterEntry().id).toBe('gravity-range');
    expect(encounterEntry('unknown').id).toBe('gravity-range');
    expect(saveSlot(INVERSE_WELLS_ENTRY)).not.toBe(saveSlot(encounterEntry()));
    expect(INVERSE_WELLS_ENTRY.create(0).definition.world.fields).toHaveLength(2601);
    expect(INVERSE_WELLS_ENTRY.create(1).definition.seed).not.toBe(
      INVERSE_WELLS_ENTRY.create(0).definition.seed,
    );
  });

  it('admits a clear carried hull even when its enclosing sphere overlaps a throat', () => {
    const layout = s22Layout();
    const base = createInverseWells('hull-arrival', { layout });
    const attitude = layout.entrances.power.attitude;
    const ship = {
      ...base.definition.world.ship,
      kinematics: {
        ...base.definition.world.ship.kinematics,
        position: rotate(attitude, { x: 120_000, y: 1100, z: 0 }),
      },
      systems: {
        ...base.definition.world.ship.systems,
        massProperties: {
          ...base.definition.world.ship.systems.massProperties,
          centerOfMass: { x: 0, y: 0, z: 0 },
          hull: [
            {
              outline: [
                { x: -200, y: -1 },
                { x: 200, y: -1 },
                { x: 200, y: 1 },
                { x: -200, y: 1 },
              ],
              zMin: -1,
              zMax: 1,
            },
          ],
        },
      },
    };
    const arrival = { ship, definition: base.definition.ship, briefing: base.definition.briefing };
    expect(createInverseWells('hull-arrival', { layout, arrival }).definition.world.ship).toBe(
      ship,
    );
    expect(() =>
      createInverseWells('hull-arrival', {
        layout,
        arrival: {
          ...arrival,
          ship: {
            ...ship,
            kinematics: {
              ...ship.kinematics,
              position: rotate(attitude, { x: 120_000, y: 1000, z: 0 }),
            },
          },
        },
      }),
    ).toThrow(/excluded core/);
  });

  it('keeps the prototype destination beyond the study disc and completes both nominal exterior coasts', () => {
    const layout = s22Layout();
    const setup = createInverseWells('exit', { layout });
    const exit = layout.exits[0]!;
    const target = exit.destinationRegion!;
    expect(dot(sub(target.center, exit.center), exit.outwardNormal!)).toBeCloseTo(
      target.radius + 1000,
      7,
    );
    for (const route of reference.many_funnel_crossings) {
      const position = rotate(layout.entrances.power.attitude, vec(route.final.position_m));
      const velocity = rotate(layout.entrances.power.attitude, vec(route.final.velocity_m_s));
      const t = -dot(sub(position, target.center), velocity) / lengthSq(velocity);
      expect(t).toBeGreaterThan(0);
      const closest = addScaled(position, velocity, t);
      expect(distance(closest, target.center)).toBeLessThan(target.radius - 20);
      const at = (point: Vec3) => ({
        ...setup.definition.world,
        ship: {
          ...setup.definition.world.ship,
          kinematics: { ...setup.definition.world.ship.kinematics, position: point, velocity },
        },
      });
      expect(
        evaluateObjectives(setup.objectiveRules, initialObjectiveProgress, at(position)).progress
          .completed,
      ).toBeUndefined();
      expect(
        evaluateObjectives(setup.objectiveRules, initialObjectiveProgress, at(closest)).progress
          .completed,
      ).toBe('forward');
    }
  });
});
