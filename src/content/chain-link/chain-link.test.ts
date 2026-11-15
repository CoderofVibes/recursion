import { describe, expect, it } from 'vitest';
import { add, distance, scale } from '../../lib/vec3.ts';
import { rotate } from '../../lib/quat.ts';
import { createSimulation, validateWorld } from '../../sim/index.ts';
import {
  createLatticeField,
  sampleLatticeComponent,
  sweepLatticeExposure,
} from '../../sim/fields/lattice.ts';
import { getGeometry } from '../../ship/config/index.ts';
import { computeMassProperties, stepShipSystems } from '../../ship/index.ts';
import { CHAIN_LINK_ENTRY, createChainLink } from './index.ts';
import { createArrivalSystems } from '../../game/arrival.ts';
import { evaluateObjectives, initialObjectiveProgress } from '../../game/objectives.ts';
import { createChainLinkEnvironment, latticePoseFromShip } from './environment.ts';
import {
  EXTERIOR_PROBE,
  referenceDatum,
  FENCE_COUNT,
  FENCE_SPACING,
  FORWARD_EXIT_X,
  STACK_LENGTH,
  referencePath,
} from './layout.ts';

describe('Unseen Cathedral content provider', () => {
  it('constructs a finite registered field, ordinary rocks and a clean pre-contact arrival', () => {
    const setup = createChainLink('s17-entry', { catalogueIndex: 0 });
    expect(validateWorld(setup.definition.world)).toEqual([]);
    const simulation = createSimulation(setup.definition.world, {
      dt: setup.definition.dt,
      registry: setup.fieldRegistry,
    });
    expect(simulation.fields).toHaveLength(1);
    const field = simulation.fields[0]!;
    expect(field.kind).toBe('lattice');
    expect(FENCE_COUNT).toBe(20);
    expect(setup.layout.layers).toHaveLength(20);
    expect(setup.layout.layers.every((layer) => layer.strands.length === 12)).toBe(true);
    expect(field.intensity!(setup.layout.point({ x: 0, y: 0, z: 0 }), 0)).toBe(20);
    expect(field.intensity!(setup.layout.point({ x: 0, y: 40, z: 40 }), 0)).toBe(0);
    expect(field.intensity!(setup.layout.point({ x: 0, y: 400, z: 400 }), 0)).toBe(0);
    expect(field.intensity!(setup.definition.world.ship.kinematics.position, 0)).toBe(0);
    expect(simulation.step(simulation.initial).contacts).toEqual([]);
    expect(setup.definition.briefing.objectives.map((o) => o.kind)).toEqual([
      'reach-region',
      'reach-region',
    ]);
    expect(setup.reachRegionRules.every((rule) => rule.wholeShip)).toBe(true);
    expect(setup.objectiveRules.map((rule) => rule.kind)).toEqual(['reach-region', 'reach-region']);
    for (const exit of setup.exits) {
      const world = {
        ...setup.definition.world,
        ship: {
          ...setup.definition.world.ship,
          kinematics: { ...setup.definition.world.ship.kinematics, position: exit.center },
        },
      };
      expect(
        evaluateObjectives(setup.objectiveRules, initialObjectiveProgress, world).progress
          .completed,
      ).toBe(exit.id);
    }
  });

  it('gives belief only an uncertain rock survey, never opening centres or field parameters', () => {
    const setup = createChainLink('ordinary-rocks');
    const briefing = setup.definition.briefing;
    const serialized = JSON.stringify(briefing);
    for (const key of ['sheet-', 'strands', 'peakIntensity', 'openingCentres', 'cathedral-lattice'])
      expect(serialized).not.toContain(key);
    expect(briefing.arrivalEstimate.positionCov[0]).toBeGreaterThan(0);
    expect(briefing.arrivalEstimate.position).not.toEqual(
      setup.definition.world.ship.kinematics.position,
    );
    expect(briefing.knownAsteroids.length).toBeLessThan(setup.definition.world.asteroids.length);
    expect(setup.arrivalCommands).toContainEqual({ kind: 'recorder', sampleRate: 1 });
    expect(
      setup.arrivalCommands.some(
        (command) => command.kind === 'power' && command.equipment === 'science-processor',
      ),
    ).toBe(false);
  });

  it('is replayable and uses independent geometry, rock and sensor streams', () => {
    expect(createChainLink('replay').definition).toEqual(createChainLink('replay').definition);
    const a = createChainLink('one', { catalogueIndex: 0 });
    const b = createChainLink('one', { catalogueIndex: 1 });
    expect(a.layout.layers).not.toEqual(b.layout.layers);
    expect(a.definition.world.ship.systems.rng).toEqual(b.definition.world.ship.systems.rng);
    expect(
      createChainLink('two', { catalogueIndex: 0 }).definition.world.ship.systems.rng,
    ).not.toEqual(a.definition.world.ship.systems.rng);
    expect(() => createChainLink('bad', { catalogueIndex: 4 })).toThrow('catalogue');
    expect(CHAIN_LINK_ENTRY.create(4).definition).toEqual(CHAIN_LINK_ENTRY.create(4).definition);
    expect(CHAIN_LINK_ENTRY.create(3).definition.world.ship.systems.rng).not.toEqual(
      CHAIN_LINK_ENTRY.create(4).definition.world.ship.systems.rng,
    );
    expect(() => CHAIN_LINK_ENTRY.create(-1)).toThrow('run');
  });

  it('preserves carried damage, dose, heat, fuel, recorder, clock and acquired briefing', () => {
    const original = createChainLink('survivor');
    const arrived = original.definition.world.ship;
    const wornSystems = {
      ...arrived.systems,
      t: 7300,
      tanks: { ...arrived.systems.tanks, 'rcs-left': 39, 'rcs-right': 40 },
      exposure: { camera: 23 },
      recorder: { ...arrived.systems.recorder, bytesUsed: 700_000_000 },
      thermal: { ...arrived.systems.thermal, service: 312 },
      equipment: {
        ...arrived.systems.equipment,
        camera: { ...arrived.systems.equipment.camera!, condition: 0.4 },
      },
    };
    const systems = {
      ...wornSystems,
      massProperties: computeMassProperties(wornSystems, original.definition.ship),
    };
    const ship = { ...arrived, systems };
    const briefing = {
      ...original.definition.briefing,
      arrivalEstimate: { ...original.definition.briefing.arrivalEstimate, t: systems.t },
    };
    const carried = createChainLink('new-leg', {
      entrance: 'cross-transfer',
      arrival: { ship, definition: original.definition.ship, briefing },
    });
    expect(carried.definition.world.ship).toBe(ship);
    expect(carried.definition.world.t).toBe(7300);
    expect(carried.definition.briefing).toBe(briefing);
    expect(carried.arrivalCommands).toEqual([]);
    expect(() =>
      createChainLink('invalid', {
        arrival: {
          ship,
          definition: original.definition.ship,
          briefing: original.definition.briefing,
        },
      }),
    ).toThrow('epoch');
  });

  it('uses each current appendage prism, including intermediate jammed geometry', () => {
    const setup = createChainLink();
    const ship = setup.definition.world.ship;
    const id = 'radiator-right';
    expect(ship.systems.equipment[id]).toBeDefined();
    const systems = {
      ...ship.systems,
      equipment: {
        ...ship.systems.equipment,
        [id]: {
          ...ship.systems.equipment[id]!,
          condition: 0,
          values: { ...ship.systems.equipment[id]!.values, deployment: 0.43 },
        },
      },
    };
    const actual = {
      ...ship,
      systems: {
        ...systems,
        massProperties: computeMassProperties(systems, setup.definition.ship),
      },
    };
    const pose = latticePoseFromShip(actual, setup.definition.ship);
    expect(pose.centerOfMass).toEqual(actual.systems.massProperties.centerOfMass);
    const part = pose.components.find((c) => c.id === id)!;
    expect(part.shapes).toEqual(
      getGeometry(systems, setup.definition.ship)
        .hull.filter((p) => p.part === id)
        .map((prism) => ({ kind: 'prism', prism })),
    );
    expect(pose.components.find((c) => c.id === 'camera')!.shapes[0]!.kind).toBe('point');
    expect(pose.components.length).toBeGreaterThan(setup.definition.ship.equipment.length);
  });

  it('initializes only the new sensor stream on an arrival from another encounter', () => {
    const prototype = createChainLink('earlier-leg');
    const original = createArrivalSystems(prototype.definition.ship, {}, 'whole-run-seed');
    const ship = { ...prototype.definition.world.ship, systems: original };
    const setup = createChainLink('whole-run-seed', {
      arrival: {
        ship,
        definition: prototype.definition.ship,
        briefing: prototype.definition.briefing,
      },
    });
    const systems = setup.definition.world.ship.systems;
    expect(systems.rng['sensors.camera/lattice']).toBeDefined();
    for (const [name, stream] of Object.entries(original.rng))
      expect(systems.rng[name]).toEqual(stream);
    expect({ ...systems, rng: original.rng }).toEqual(original);
    const resumed = createChainLink('must-not-reseed', {
      arrival: {
        ship: setup.definition.world.ship,
        definition: setup.definition.ship,
        briefing: setup.definition.briefing,
      },
    });
    expect(resumed.definition.world.ship).toBe(setup.definition.world.ship);
  });

  it('offers truth geometry only to the acquisition adapter; rays face real opaque rocks', () => {
    const setup = createChainLink();
    const simulation = createSimulation(setup.definition.world, {
      dt: 0.1,
      registry: setup.fieldRegistry,
    });
    const env = createChainLinkEnvironment(setup).at(simulation.initial);
    expect(env.targets).toHaveLength(setup.definition.world.asteroids.length + 1);
    expect(env.fieldSignals['cathedral-lattice']).toMatchObject({ kind: 'lattice-scene-v1' });
    expect(env.intensity).toEqual({}); // cannot masquerade a snapshot as swept dose
  });

  it('can abort before first contact using actual RCS, fuel, power and thermal systems', () => {
    const setup = createChainLink('abort', { catalogueIndex: 0 });
    const simulation = createSimulation(setup.definition.world, {
      dt: 0.1,
      registry: setup.fieldRegistry,
    });
    const environment = createChainLinkEnvironment(setup);
    let state = simulation.initial;
    const initialFuel = { ...state.world.ship.systems.tanks };
    let minimumDistance = Infinity;
    for (let tick = 0; tick < 1500; tick++) {
      const systems = stepShipSystems(
        state.world.ship.systems,
        setup.definition.ship,
        tick === 0
          ? [
              {
                kind: 'fly',
                input: { translate: { x: -1, y: 0, z: 0 }, yaw: 0, pitch: 0, throttle: 0 },
              },
            ]
          : [],
        environment.at(state),
        simulation.dt,
      );
      const next = simulation.step(state, { systems: systems.state, actuators: systems.actuators });
      expect(next.contacts).toEqual([]);
      state = next.state;
      minimumDistance = Math.min(minimumDistance, 1800 - state.world.ship.kinematics.position.x);
    }
    expect(minimumDistance).toBeGreaterThan(300);
    expect(state.world.ship.kinematics.velocity.x).toBeLessThan(0);
    expect(
      Object.keys(initialFuel).some(
        (tank) => state.world.ship.systems.tanks[tank]! < initialFuel[tank]!,
      ),
    ).toBe(true);
    const pose = latticePoseFromShip(state.world.ship, setup.definition.ship);
    for (const component of pose.components)
      expect(sampleLatticeComponent(environment.field, pose, component).upper).toBe(0);
  });
});

describe('S17 geometry qualification, separate from electrical/controller playability', () => {
  it('requires transverse navigation on both nominal straight negative-control paths', () => {
    const setup = createChainLink('straight-negative-controls', { catalogueIndex: 0 });
    const field = createLatticeField('straight-controls', { layers: setup.layout.layers });
    const base = latticePoseFromShip(setup.definition.world.ship, setup.definition.ship);
    const at = (x: number, y: number, z: number) => ({
      ...base,
      position: add(
        setup.layout.point({ x, y, z }),
        rotate(setup.layout.orientation, base.centerOfMass),
      ),
    });
    expect(field.intensity(setup.layout.point({ x: 0, y: 0, z: 0 }))).toBe(20);
    const first = at(0, 40, 40);
    expect(first.components.every((c) => sampleLatticeComponent(field, first, c).upper === 0)).toBe(
      true,
    );
    const hits = Array.from({ length: FENCE_COUNT - 1 }, (_, j) => {
      const pose = at((j + 1) * FENCE_SPACING, 40, 40);
      return pose.components.some((c) => sampleLatticeComponent(field, pose, c).lower > 0);
    });
    expect(hits.filter(Boolean).length).toBeGreaterThan(0);
    // Two prescribed negative controls do not prove a probability or rule out every straight line.
  });

  it('joins the entry, twenty-fence loop and exit with continuous velocity and acceleration', () => {
    for (const x of [-500, 0, STACK_LENGTH, STACK_LENGTH + 350]) {
      const a = referencePath(x - 1e-5),
        b = referencePath(x + 1e-5);
      expect(distance(a.position, b.position)).toBeLessThan(0.00003);
      expect(distance(a.first, b.first)).toBeLessThan(1e-8);
      expect(distance(a.second, b.second)).toBeLessThan(1e-8);
    }
  });
  it('matches the independent finite 5 m radiator-chord integral while the COM is clear', () => {
    const setup = createChainLink('s17', { catalogueIndex: 0 });
    const ship = setup.definition.world.ship;
    const base = latticePoseFromShip(ship, setup.definition.ship);
    const radiator = base.components.find((c) => c.id === 'radiator-right')!;
    const field = createLatticeField('entry', { layers: [setup.layout.layers[0]!] });
    const dose = sweepLatticeExposure(
      field,
      {
        start: 0,
        end: 24,
        maxPointSpeed: 2,
        poseAt: (t) => ({
          ...base,
          components: [radiator],
          position: add(setup.layout.point({ x: -24 + 2 * t, y: 10, z: 40 }), base.centerOfMass),
        }),
      },
      { doseTolerance: 1e-7, clearanceTolerance: 0.01 },
    );
    expect(dose[0]!.dose).toBeCloseTo(82.507936508, 5);
    expect(field.intensity(setup.layout.point({ x: 0, y: 10, z: 40 }))).toBe(0);
  });

  it('has a continuously clear whole-ship prescribed centre path in every catalogue frame', () => {
    for (let index = 0; index < 4; index++) {
      const setup = createChainLink('qualification', { catalogueIndex: index });
      const field = createLatticeField('qualification', { layers: setup.layout.layers });
      const ship = setup.definition.world.ship;
      const deployed = {
        ...ship.systems,
        configuration: 'allDeployed',
        equipment: Object.fromEntries(
          Object.entries(ship.systems.equipment).map(([id, e]) => [
            id,
            {
              ...e,
              values: {
                ...e.values,
                ...(id.startsWith('solar-') || id.startsWith('radiator-') ? { deployment: 1 } : {}),
              },
            },
          ]),
        ),
      };
      const base = latticePoseFromShip(
        {
          ...ship,
          systems: {
            ...deployed,
            massProperties: computeMassProperties(deployed, setup.definition.ship),
          },
        },
        setup.definition.ship,
      );
      // The union retains every occupied component shape. Its minimum clearance equals
      // the minimum of per-component clearances, with one shared broad-phase search.
      const occupied = {
        id: 'whole-production-ship',
        shapes: base.components.flatMap((c) => c.shapes),
      };
      // Lipschitz bound 2.2 m/s includes the smooth loop's transverse motion at 2 m/s.
      // Every sample covers +/-2.5s; all occupied points have the same velocity.
      let minimum = Infinity;
      const sampledX = [
        ...Array.from({ length: Math.floor((STACK_LENGTH + 48) / 10) + 1 }, (_, i) => -24 + 10 * i),
        STACK_LENGTH + 24,
      ];
      for (const x of sampledX) {
        const pose = {
          ...base,
          position: add(
            setup.layout.point(referenceDatum(x)),
            rotate(setup.layout.orientation, base.centerOfMass),
          ),
        };
        const sample = sampleLatticeComponent(field, pose, occupied);
        minimum = Math.min(minimum, sample.clearance - 2.2 * 2.5);
      }
      expect(minimum).toBeGreaterThan(16);
    }
  });

  it('leaves a real finite exterior alternative with explicit additional distance', () => {
    const setup = createChainLink('outside', { catalogueIndex: 0 });
    const field = createLatticeField('outside', { layers: setup.layout.layers });
    let routeLength = 0;
    for (let i = 1; i < EXTERIOR_PROBE.length; i++) {
      const a = EXTERIOR_PROBE[i - 1]!;
      const b = EXTERIOR_PROBE[i]!;
      routeLength += distance(a, b);
      for (let j = 0; j <= 100; j++) {
        const p = add(scale(a, 1 - j / 100), scale(b, j / 100));
        expect(field.intensity(setup.layout.point(p))).toBe(0);
      }
    }
    expect(routeLength).toBeGreaterThan(FORWARD_EXIT_X + 500);
    // A sampled point route is not a whole-ship/control/resource success claim.
  });
});
