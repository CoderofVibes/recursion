import { describe, expect, it } from 'vitest';
import baseline from '../../../data/ship-baseline.json';
import { HANDS_ON_NEUTRAL, type HandsOnInput } from '../../contracts/commands.ts';
import type { Vec3 } from '../../lib/vec3.ts';
import { applyCommands } from '../commands.ts';
import {
  createShipSystemsState,
  handsOnFirings,
  loadShipDefinition,
  nominalJets,
  type NominalFiring,
} from '../index.ts';
import { environment } from '../test-helpers.ts';
import { preparePropulsion } from './propulsion.ts';

const definition = loadShipDefinition();
const input = (part: Partial<HandsOnInput>): HandsOnInput => ({ ...HANDS_ON_NEUTRAL, ...part });
/** Jets carrying more than a trim, as `pod:index`. */
const principal = (firings: readonly NominalFiring[]): string[] =>
  firings
    .filter((f) => f.force > 50)
    .map((f) => (f.jet ? f.jet.replace('rcs-', '').replace('-a-', ':') : f.source));
/** Net force and torque about `about` of a set of firings. */
function net(firings: readonly NominalFiring[], about: Vec3) {
  const total = { fx: 0, fy: 0, fz: 0, tx: 0, ty: 0, tz: 0 };
  for (const f of firings) {
    const force = {
      x: f.direction.x * f.force,
      y: f.direction.y * f.force,
      z: f.direction.z * f.force,
    };
    const r = { x: f.point.x - about.x, y: f.point.y - about.y, z: f.point.z - about.z };
    total.fx += force.x;
    total.fy += force.y;
    total.fz += force.z;
    total.tx += r.y * force.z - r.z * force.y;
    total.ty += r.z * force.x - r.x * force.z;
    total.tz += r.x * force.y - r.y * force.x;
  }
  return total;
}

describe('thrust as designed (for drawing it without reading truth)', () => {
  it('the definition says where every jet is and which way it pushes', () => {
    const jets = nominalJets(definition);
    expect(jets).toHaveLength(40);
    for (const jet of jets) {
      const pod = definition.equipment.find((e) => e.id === jet.pod)!;
      expect(pod.kind).toBe('rcs-thruster');
      expect(jet.point).toEqual(pod.mount!.position);
      expect(Math.hypot(jet.direction.x, jet.direction.y, jet.direction.z)).toBe(1);
      expect(jet.thrust).toBe(200);
      expect(jet.id).toBe(`${jet.pod}-${jet.bank}-${jet.index}`);
    }
    // Pods at x = ±5, y = ±2 on the hull's mid-plane; a pod's mount direction is its jet 0.
    expect(jets.filter((jet) => jet.bank === 'a').map((jet) => jet.point.x + jet.point.y)).toEqual([
      7, 7, 7, 7, 7, 3, 3, 3, 3, 3, -3, -3, -3, -3, -3, -7, -7, -7, -7, -7,
    ]);
    expect(definition.equipment.find((e) => e.id === 'rcs-aft-right')!.mount).toEqual({
      position: { x: -5, y: -2, z: 0 },
      direction: { x: -1, y: 0, z: 0 },
    });
    // The same detail is in the definition's data for code that reads it directly.
    const data = definition.systems!.propulsion as unknown as typeof baseline.propulsion;
    expect(data.rcs.jets.map((jet) => jet.id)).toEqual(jets.map((jet) => jet.id));
    expect(data.rcs.jets[3]!.direction).toEqual([0, 0, 1]);
    // And the main engine's mount.
    expect(definition.equipment.find((e) => e.id === 'main-engine')!.mount).toEqual({
      position: { x: -7, y: 0.08, z: 0 },
      direction: { x: 1, y: 0, z: 0 },
    });
  });

  it('names the jets each hands-on demand fires (README § Drawing thrust)', () => {
    const cases: [Partial<HandsOnInput>, string[]][] = [
      // Translation: the nozzles facing away from the push, on every pod that has one.
      [
        { translate: { x: 1, y: 0, z: 0 } },
        ['forward-left:0', 'forward-right:2', 'aft-left:0', 'aft-right:2'],
      ],
      [
        { translate: { x: -1, y: 0, z: 0 } },
        ['forward-left:2', 'forward-right:0', 'aft-left:2', 'aft-right:0'],
      ],
      [{ translate: { x: 0, y: 1, z: 0 } }, ['forward-right:1', 'aft-right:1']],
      [{ translate: { x: 0, y: -1, z: 0 } }, ['forward-left:1', 'aft-left:1']],
      [
        { translate: { x: 0, y: 0, z: 1 } },
        ['forward-left:3', 'forward-right:3', 'aft-left:3', 'aft-right:3'],
      ],
      [
        { translate: { x: 0, y: 0, z: -1 } },
        ['forward-left:4', 'forward-right:4', 'aft-left:4', 'aft-right:4'],
      ],
      // Turns: one couple, 10 m apart.
      [{ yaw: 1 }, ['forward-right:1', 'aft-left:1']],
      [{ yaw: -1 }, ['forward-left:1', 'aft-right:1']],
      [{ pitch: 1 }, ['forward-right:3', 'aft-right:4']],
      [{ pitch: -1 }, ['forward-left:4', 'aft-left:3']],
    ];
    for (const [part, expected] of cases)
      expect(principal(handsOnFirings(definition, input(part))), JSON.stringify(part)).toEqual(
        expected,
      );
    expect(handsOnFirings(definition, HANDS_ON_NEUTRAL)).toEqual([]);
    // A deflection too small to leave the rate deadband fires nothing.
    expect(handsOnFirings(definition, input({ yaw: 0.04 }))).toEqual([]);
  });

  it('gives firings that add up to the demand about the arrival centre of mass', () => {
    const com = createShipSystemsState(definition).massProperties.centerOfMass;
    const push = net(handsOnFirings(definition, input({ translate: { x: 0, y: 1, z: 0 } })), com);
    expect(push.fy).toBeCloseTo(400, 6);
    for (const k of ['fx', 'fz', 'tx', 'ty', 'tz'] as const) expect(push[k]).toBeCloseTo(0, 6);
    // Nose up is a torque about −y; nose left one about +z; neither pushes the ship.
    const up = net(handsOnFirings(definition, input({ pitch: 1 })), com);
    expect(up.ty).toBeLessThan(-900);
    const left = net(handsOnFirings(definition, input({ yaw: 1 })), com);
    expect(left.tz).toBeGreaterThan(900);
    for (const turn of [up, left])
      for (const k of ['fx', 'fy', 'fz'] as const) expect(turn[k]).toBeCloseTo(0, 6);
    // Half a deflection, half the force.
    const half = net(
      handsOnFirings(definition, input({ translate: { x: -0.5, y: 0, z: 0 } })),
      com,
    );
    expect(half.fx).toBeCloseTo(-400, 6);
  });

  it('draws the main engine at its mount for a throttle', () => {
    const firings = handsOnFirings(definition, input({ throttle: 0.5, yaw: 1 }));
    expect(firings.at(-1)).toEqual({
      source: 'main-engine',
      point: { x: -7, y: 0.08, z: 0 },
      direction: { x: 1, y: 0, z: 0 },
      force: 12000,
    });
    expect(principal(firings)).toEqual(['forward-right:1', 'aft-left:1', 'main-engine']);
  });

  it('is what the ship step asks of its jets for the same input at rest', () => {
    for (const part of [
      { translate: { x: 1, y: -0.5, z: 0.25 } },
      { yaw: -1, pitch: 0.5 },
      { translate: { x: 0, y: 0, z: -1 }, yaw: 0.6 },
    ] satisfies Partial<HandsOnInput>[]) {
      const state = createShipSystemsState(definition);
      const flown = applyCommands(state, definition, [{ kind: 'fly', input: input(part) }]).state;
      const asked = preparePropulsion(flown, definition, environment(flown)).ext![
        'propulsion.control'
      ] as unknown as Record<string, Record<string, number>>;
      const nominal: Record<string, Record<string, number>> = {};
      for (const firing of handsOnFirings(definition, input(part), state.massProperties)) {
        const index = firing.jet!.slice(firing.jet!.lastIndexOf('-') + 1);
        (nominal[firing.source] ??= {})[index] = firing.force / 200;
      }
      // The same jets at the same duties (force / thrust, to rounding).
      expect(Object.keys(nominal).sort()).toEqual(Object.keys(asked).sort());
      for (const [pod, jets] of Object.entries(asked)) {
        expect(Object.keys(nominal[pod]!).sort()).toEqual(Object.keys(jets).sort());
        for (const [index, duty] of Object.entries(jets))
          expect(nominal[pod]![index]).toBeCloseTo(duty, 12);
      }
    }
  });

  it('uses the mass properties it is given', () => {
    const state = createShipSystemsState(definition);
    const shifted = {
      ...state.massProperties,
      centerOfMass: { ...state.massProperties.centerOfMass, x: 1.5 },
    };
    const lift = input({ translate: { x: 0, y: 0, z: 1 } });
    const force = (firings: readonly NominalFiring[], pod: string) =>
      firings.find((f) => f.source === pod && f.jet!.endsWith('-3'))!.force;
    // Centre of mass aft of the pods' centre: the forward pods throttle back. Forward of it:
    // the aft pods do.
    const arrival = handsOnFirings(definition, lift);
    expect(force(arrival, 'rcs-forward-left')).toBeLessThan(force(arrival, 'rcs-aft-left'));
    const forward = handsOnFirings(definition, lift, shifted);
    expect(force(forward, 'rcs-forward-left')).toBeGreaterThan(force(forward, 'rcs-aft-left'));
  });
});
