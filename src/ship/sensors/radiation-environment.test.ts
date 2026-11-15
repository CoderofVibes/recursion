import { describe, expect, it } from 'vitest';
import type { ShipDefinition } from '../../contracts/ship.ts';
import type { EnvironmentField } from '../../contracts/truth/fields.ts';
import type { EnvironmentEffects } from '../../contracts/truth/ship.ts';
import { createGravityRange } from '../../content/gravity-range/index.ts';
import { binaryAxes, crescentIntensity } from '../../content/gravity-range/clouds.ts';
import { createLatticeField } from '../../sim/fields/lattice.ts';
import type { Vec3 } from '../../lib/vec3.ts';
import { loadShipDefinition } from '../definition.ts';
import { createShipSystemsState } from '../state.ts';
import { RADIATION_MONITOR } from './radiation-spec.ts';
import { sampleRadiationAtMonitor, withRadiationMonitorInput } from './radiation-environment.ts';

const definition = loadShipDefinition();
const state = createShipSystemsState(definition, 'radiation-monitor-geometry');
const host = RADIATION_MONITOR.host;
const mount = definition.equipment.find((equipment) => equipment.id === host)!.position;
function environment(): EnvironmentEffects {
  return {
    t: 7,
    kinematics: {
      position: { x: 100, y: -20, z: 50 },
      velocity: { x: 0, y: 0, z: 0 },
      attitude: { w: 1, x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
    },
    targets: [],
    specificForce: { x: 0, y: 0, z: 0 },
    intensity: { [host]: 99_999, 'radiator-right': 88_888 },
    fieldSignals: { preserved: { kind: 'unrelated-scene' } },
    sunlight: { direction: { x: 1, y: 0, z: 0 }, irradiance: 0 },
  };
}
/** Independent identity-attitude placement: position = detector - (mount - current COM). */
function detectorAt(point: Vec3): EnvironmentEffects {
  const env = environment();
  const com = state.massProperties.centerOfMass;
  return {
    ...env,
    kinematics: {
      ...env.kinematics,
      position: {
        x: point.x - mount.x + com.x,
        y: point.y - mount.y + com.y,
        z: point.z - mount.z + com.z,
      },
    },
  };
}
const constant = (value: number): EnvironmentField => ({
  id: 'constant',
  kind: 'test',
  intensity: () => value,
});

describe('truth-side radiation monitor point input', () => {
  it('uses the configured mount, current COM and full 3D attitude, with time and additive fields', () => {
    const configured: ShipDefinition = {
      ...definition,
      configurations: [
        ...definition.configurations,
        {
          ...definition.configurations[0]!,
          id: 'monitor-moved',
          equipmentPositions: { [host]: { x: 4, y: -3, z: 2 } },
        },
      ],
    };
    const moved = {
      ...state,
      configuration: 'monitor-moved',
      massProperties: { ...state.massProperties, centerOfMass: { x: 1, y: 2, z: -1 } },
    };
    const env = environment();
    const rotated = {
      ...env,
      kinematics: { ...env.kinematics, attitude: { w: 0.5, x: 0.5, y: 0.5, z: 0.5 } },
    };
    const visited: Vec3[] = [];
    const field: EnvironmentField = {
      id: 'affine',
      kind: 'test',
      intensity(point, t) {
        visited.push(point);
        return point.x + 2 * point.y + 3 * point.z + t;
      },
    };
    // q=(1,1,1,1)/2 maps (x,y,z) to (z,x,y). Configured offset (3,-5,3)
    // becomes (3,3,-5); add the COM's inertial (100,-20,50), not the body datum.
    expect(sampleRadiationAtMonitor(moved, configured, rotated, [field, constant(0.5)])).toBe(
      211.5,
    );
    expect(visited).toEqual([{ x: 103, y: -17, z: 45 }]);
  });

  it('samples real finite strand endpoints and sums fields without applying instrument saturation', () => {
    const layers = [
      {
        id: 'finite',
        radius: 4,
        peakIntensity: 20,
        strands: [{ id: 'finite-segment', a: { x: 0, y: 0, z: -2 }, b: { x: 0, y: 0, z: 2 } }],
      },
    ];
    const a = createLatticeField('first', { layers });
    const b = createLatticeField('second', { layers });
    // Two metres beyond the real finite endpoint: 20*(1-2²/4²)^4, not infinite-line peak.
    expect(sampleRadiationAtMonitor(state, definition, detectorAt({ x: 0, y: 0, z: 4 }), [a])).toBe(
      6.328125,
    );
    expect(sampleRadiationAtMonitor(state, definition, detectorAt({ x: 0, y: 0, z: 7 }), [a])).toBe(
      0,
    );
    expect(
      sampleRadiationAtMonitor(state, definition, detectorAt({ x: 0, y: 0, z: 0 }), [a, b]),
    ).toBe(40);
  });

  it('samples the actual Gravity crescent at its half-ramp and plateau in the binary frame', () => {
    const axes = binaryAxes(createGravityRange().definition.world);
    const cloud: EnvironmentField = {
      id: 'real-crescent',
      kind: 'radiation-crescent',
      intensity: (point) => crescentIntensity(point, axes),
    };
    const point = (radius: number): Vec3 => ({
      x: axes.origin.x + radius * (0.5 * axes.x.x - (Math.sqrt(3) / 2) * axes.y.x),
      y: axes.origin.y + radius * (0.5 * axes.x.y - (Math.sqrt(3) / 2) * axes.y.y),
      z: axes.origin.z + radius * (0.5 * axes.x.z - (Math.sqrt(3) / 2) * axes.y.z),
    });
    // At azimuth -60°, radial smoothstep(.5)=.5. Expected values are independent
    // of the field sampler: 0.05*.5 and the full 0.05 U plateau.
    expect(
      sampleRadiationAtMonitor(state, definition, detectorAt(point(1_025_000)), [cloud]),
    ).toBeCloseTo(0.025, 12);
    expect(
      sampleRadiationAtMonitor(state, definition, detectorAt(point(1_500_000)), [cloud]),
    ).toBeCloseTo(0.05, 12);
    expect(sampleRadiationAtMonitor(state, definition, detectorAt(point(830_000)), [cloud])).toBe(
      0,
    );
  });

  it('does not substitute any component intensity, dose, or existing detector signal', () => {
    const env = environment();
    const input = {
      ...env,
      fieldSignals: {
        ...env.fieldSignals,
        [RADIATION_MONITOR.inputKey]: { kind: 'radiation-monitor-input-v1', t: 0, rate: 12345 },
      },
    };
    const exposed = { ...state, exposure: { [host]: 50_000, 'radiator-right': 60_000 } };
    const result = withRadiationMonitorInput(input, exposed, definition, []);
    expect(result.fieldSignals[RADIATION_MONITOR.inputKey]).toEqual({
      kind: 'radiation-monitor-input-v1',
      t: 7,
      rate: 0,
    });
    expect(result.intensity).toBe(input.intensity);
    expect(result.fieldSignals.preserved).toBe(env.fieldSignals.preserved);
    expect(input.fieldSignals[RADIATION_MONITOR.inputKey].rate).toBe(12345);
    expect(
      sampleRadiationAtMonitor(exposed, definition, input, [
        { id: 'force-only', kind: 'test', acceleration: () => ({ x: 1, y: 0, z: 0 }) },
      ]),
    ).toBe(0);
  });

  it('removes stale input when the host is absent from either hardware inventory', () => {
    const { [host]: _host, ...equipment } = state.equipment;
    const absentDefinition = {
      ...definition,
      equipment: definition.equipment.filter((equipment) => equipment.id !== host),
    };
    const env = withRadiationMonitorInput(environment(), state, definition, [constant(1)]);
    for (const [shipState, shipDefinition] of [
      [{ ...state, equipment }, definition],
      [state, absentDefinition],
    ] as const) {
      expect(
        sampleRadiationAtMonitor(shipState, shipDefinition, env, [constant(1)]),
      ).toBeUndefined();
      const result = withRadiationMonitorInput(env, shipState, shipDefinition, [constant(1)]);
      expect(result.fieldSignals[RADIATION_MONITOR.inputKey]).toBeUndefined();
      expect(result.fieldSignals.preserved).toBe(env.fieldSignals.preserved);
    }
  });

  it('keeps invalid field rates and overflow unavailable instead of claiming clear space', () => {
    const env = withRadiationMonitorInput(environment(), state, definition, [constant(1)]);
    for (const fields of [
      [constant(-1)],
      [constant(NaN)],
      [constant(Infinity)],
      [constant(Number.MAX_VALUE), constant(Number.MAX_VALUE)],
    ]) {
      expect(sampleRadiationAtMonitor(state, definition, env, fields)).toBeUndefined();
      expect(
        withRadiationMonitorInput(env, state, definition, fields).fieldSignals[
          RADIATION_MONITOR.inputKey
        ],
      ).toBeUndefined();
    }
    expect(sampleRadiationAtMonitor(state, definition, { ...env, t: NaN }, [])).toBeUndefined();
    const invalid = {
      ...env,
      kinematics: { ...env.kinematics, position: { x: Infinity, y: 0, z: 0 } },
    };
    expect(sampleRadiationAtMonitor(state, definition, invalid, [])).toBeUndefined();
  });
});
