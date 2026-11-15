import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../../lib/vec3.ts';
import { getGeometry } from '../config/configuration.ts';
import { loadShipDefinition } from '../definition.ts';
import { createShipSystemsState } from '../state.ts';
import { allocateJets, wrenchOf, type AllocatorJet } from './allocator.ts';
import { activeJets, type Jet } from './jets.ts';

const definition = loadShipDefinition();
const state = createShipSystemsState(definition);
const com = state.massProperties.centerOfMass;
const options = { thrust: 200, maxPerPod: 2, torquePriority: 10 };
const PODS = ['rcs-forward-left', 'rcs-forward-right', 'rcs-aft-left', 'rcs-aft-right'];
const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

type Named = AllocatorJet & { readonly jet: Jet };
function jetsOn(pods: readonly string[] = PODS): Named[] {
  const geometry = getGeometry(state, definition);
  return pods.flatMap((pod, index) =>
    activeJets(definition, state, pod).map((jet) => ({
      pod: index,
      point: geometry.positions[pod]!,
      direction: jet.direction,
      jet,
    })),
  );
}
const all = jetsOn();
/** Names of the jets that fire, as `pod:index`, e.g. `forward-right:1`. */
const firing = (jets: readonly Named[], duty: readonly number[]): string[] =>
  jets
    .filter((_, j) => duty[j]! > 1e-6)
    .map((entry) => `${entry.jet.pod.replace('rcs-', '')}:${entry.jet.index}`);
const perPod = (jets: readonly Named[], duty: readonly number[]): number[] => {
  const sums = PODS.map(() => 0);
  jets.forEach((entry, j) => (sums[entry.pod]! += duty[j]!));
  return sums;
};
const allocate = (force: Vec3, torque: Vec3, jets: readonly Named[] = all) => {
  const duty = allocateJets(jets, com, force, torque, options);
  return { duty, wrench: wrenchOf(jets, duty, options.thrust, com) };
};
const axis = (k: 'x' | 'y' | 'z', value: number): Vec3 => ({ ...ZERO, [k]: value });

describe('RCS layout (1E pods: nozzles fore, aft, up, down and outboard)', () => {
  it('has five jets per pod and bank, the first two the 1C modes', () => {
    for (const pod of PODS) {
      const jets = activeJets(definition, state, pod);
      expect(jets.map((jet) => jet.index)).toEqual([0, 1, 2, 3, 4]);
      const left = pod.endsWith('left');
      // jet-0 axial as in 1C (left pods push forward, right pods aft), jet-1 lateral and
      // inboard, jet-2 the opposite axial, jet-3 up, jet-4 down.
      expect(jets.map((jet) => jet.direction)).toEqual([
        { x: left ? 1 : -1, y: 0, z: 0 },
        { x: 0, y: left ? -1 : 1, z: 0 },
        { x: left ? -1 : 1, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
        { x: 0, y: 0, z: -1 },
      ]);
    }
    expect(definition.equipment.find((e) => e.id === PODS[0])!.modes).toEqual(
      expect.arrayContaining(['bank-a', 'bank-b', 'jet-0', 'jet-1', 'jet-2', 'jet-3', 'jet-4']),
    );
  });
});

describe('jet allocator', () => {
  it('turns with couples: the demanded torque, no net force, two jets', () => {
    const cases: [Vec3, string[]][] = [
      // Yaw: the lateral jets of diagonally opposite pods, 10 m apart.
      [axis('z', 1000), ['forward-right:1', 'aft-left:1']],
      [axis('z', -1000), ['forward-left:1', 'aft-right:1']],
      // Pitch: one side's forward and aft vertical jets, 10 m apart.
      [axis('y', 1000), ['forward-left:4', 'aft-left:3']],
      [axis('y', -1000), ['forward-right:3', 'aft-right:4']],
      // Roll: the forward pods' vertical jets, 4 m apart.
      [axis('x', 500), ['forward-left:3', 'forward-right:4']],
      [axis('x', -500), ['forward-left:4', 'forward-right:3']],
    ];
    for (const [torque, expected] of cases) {
      const { duty, wrench } = allocate(ZERO, torque);
      expect(firing(all, duty)).toEqual(expected);
      for (const k of ['x', 'y', 'z'] as const) {
        expect(wrench.force[k]).toBeCloseTo(0, 9);
        expect(wrench.torque[k]).toBeCloseTo(torque[k], 9);
      }
      // A couple's two jets fire equally, so their minimum bits fire together.
      const used = duty.filter((u) => u > 1e-6);
      expect(used[0]).toBeCloseTo(used[1]!, 12);
    }
    // Least propellant: yaw takes the 10 m lateral couple (0.5 + 0.5 of duty for 1000 N·m),
    // not the 4 m axial couples (which would need 2.5).
    expect(allocate(ZERO, axis('z', 1000)).duty.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });

  it('reaches the full torque authority of each axis as pure couples', () => {
    // docs/engineering/ship-baseline.md, RCS authority: roll ±1600, pitch ±4000, yaw ±3600 N·m.
    for (const [k, limit] of [
      ['x', 1600],
      ['y', 4000],
      ['z', 3600],
    ] as const) {
      for (const sign of [1, -1]) {
        const { duty, wrench } = allocate(ZERO, axis(k, sign * 1e6));
        expect(wrench.torque[k]).toBeCloseTo(sign * limit, 6);
        for (const other of ['x', 'y', 'z'] as const) {
          expect(wrench.force[other]).toBeCloseTo(0, 6);
          if (other !== k) expect(wrench.torque[other]).toBeCloseTo(0, 6);
        }
        expect(Math.max(...duty)).toBeLessThanOrEqual(1);
        expect(Math.max(...perPod(all, duty))).toBeLessThanOrEqual(2 + 1e-9);
      }
    }
    // A demand beyond the authority is scaled back, not bent: half-way demands are exact.
    const half = allocate(ZERO, { x: 0, y: 0, z: 1800 });
    expect(half.wrench.torque.z).toBeCloseTo(1800, 9);
  });

  it('pushes along each axis without torque about the centre of mass', () => {
    // Forces a full deflection asks for: 800, 400 and 800 N. Along z the forward pods throttle
    // back to balance the centre of mass 0.33 m aft of the pods' centre: 750 N delivered.
    for (const [k, asked, delivered] of [
      ['x', 800, 800],
      ['y', 400, 400],
      ['z', 800, 750.07],
    ] as const) {
      for (const sign of [1, -1]) {
        const { duty, wrench } = allocate(axis(k, sign * asked), ZERO);
        expect(wrench.force[k]).toBeCloseTo(sign * delivered, 1);
        for (const other of ['x', 'y', 'z'] as const) {
          if (other !== k) expect(wrench.force[other]).toBeCloseTo(0, 6);
          expect(wrench.torque[other]).toBeCloseTo(0, 6);
        }
        expect(Math.max(...duty)).toBeLessThanOrEqual(1);
        expect(Math.max(...perPod(all, duty))).toBeLessThanOrEqual(2 + 1e-9);
      }
    }
    // Small demands are exact in every direction at once.
    const mixed = allocate({ x: 300, y: -100, z: 200 }, { x: 100, y: -300, z: 500 });
    expect(mixed.wrench.force.x).toBeCloseTo(300, 8);
    expect(mixed.wrench.force.y).toBeCloseTo(-100, 8);
    expect(mixed.wrench.force.z).toBeCloseTo(200, 8);
    expect(mixed.wrench.torque.x).toBeCloseTo(100, 8);
    expect(mixed.wrench.torque.y).toBeCloseTo(-300, 8);
    expect(mixed.wrench.torque.z).toBeCloseTo(500, 8);
  });

  it('keeps to two jets per pod and gives torque priority when the jets are short', () => {
    // Every axis at once at full deflection wants three jets of each pod.
    const { duty, wrench } = allocate({ x: 800, y: 400, z: 800 }, ZERO);
    expect(Math.max(...perPod(all, duty))).toBeLessThanOrEqual(2 + 1e-9);
    expect(Math.max(...duty)).toBeLessThanOrEqual(1);
    // What is delivered is along the demand, scaled back.
    const scale = wrench.force.x / 800;
    expect(scale).toBeGreaterThan(0.5);
    expect(scale).toBeLessThan(1);
    expect(wrench.force.y / 400).toBeCloseTo(scale, 6);
    expect(wrench.force.z / 800).toBeCloseTo(scale, 6);
    for (const k of ['x', 'y', 'z'] as const) expect(wrench.torque[k]).toBeCloseTo(0, 6);
    // With a full push and a full turn asked together, the turn is delivered whole.
    const both = allocate({ x: 800, y: 0, z: 0 }, { x: 0, y: 0, z: 3600 });
    expect(both.wrench.torque.z).toBeCloseTo(3600, 6);
    expect(both.wrench.force.x).toBeLessThan(800);
    expect(both.wrench.force.x).toBeGreaterThanOrEqual(-1e-6);
    expect(both.wrench.force.y).toBeCloseTo(0, 6);
  });

  it('is deterministic and asks nothing for a zero demand', () => {
    const demand: [Vec3, Vec3] = [
      { x: 120, y: -40, z: 310 },
      { x: -75, y: 420, z: -1300 },
    ];
    const first = allocate(...demand);
    expect(allocate(...demand).duty).toEqual(first.duty);
    expect(first.duty.every((u) => u >= 0 && u <= 1)).toBe(true);
    expect(allocate(ZERO, ZERO).duty.every((u) => u === 0)).toBe(true);
    expect(allocateJets([], com, demand[0], demand[1], options)).toEqual([]);
  });

  it('still turns with couples when a pod is out, and does not bend a demand it cannot meet', () => {
    const three = jetsOn(PODS.filter((pod) => pod !== 'rcs-forward-left'));
    for (const torque of [
      axis('z', 500),
      axis('z', -500),
      axis('y', 500),
      axis('y', -500),
      axis('x', 300),
      axis('x', -300),
    ]) {
      const duty = allocateJets(three, com, ZERO, torque, options);
      const wrench = wrenchOf(three, duty, options.thrust, com);
      for (const k of ['x', 'y', 'z'] as const) {
        expect(wrench.force[k]).toBeCloseTo(0, 8);
        expect(wrench.torque[k]).toBeCloseTo(torque[k], 8);
      }
    }
    // With only the right-hand pods no couple can roll the ship, and a roll made by one side's
    // vertical jets would push it bodily: the allocator leaves the demand unmet.
    const right = jetsOn(PODS.filter((pod) => pod.endsWith('right')));
    expect(allocateJets(right, com, ZERO, axis('x', 300), options).every((u) => u === 0)).toBe(
      true,
    );
    // A yaw from one lateral jet on a 5 m arm costs a small side force, which is worth it.
    const yaw = allocateJets(right, com, ZERO, axis('z', 500), options);
    const wrench = wrenchOf(right, yaw, options.thrust, com);
    expect(wrench.torque.z).toBeCloseTo(500, 6);
    expect(Math.hypot(wrench.force.x, wrench.force.y, wrench.force.z)).toBeLessThan(110);
  });
});
