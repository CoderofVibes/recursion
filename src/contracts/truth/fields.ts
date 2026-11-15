/**
 * TRUTH. Environment fields: local physics that plugs into the simulation.
 *
 * Gravity is built into the simulation. Everything else (Inverse Wells, the Chain Link Fence
 * lattice, later phenomena) is a field: a factory registered by kind, instantiated from a
 * JSON spec in the encounter definition. A field may do any combination of: add acceleration,
 * modify the thrust response, produce lattice intensity, emit a raw sensor signal.
 * Field implementations live in src/sim/fields/<kind>.ts.
 */

import type { Vec3 } from '../../lib/vec3.ts';
import type { FieldId } from '../ids.ts';
import type { JsonValue, LatticeIntensity, Seconds } from '../units.ts';

/** Data form of a field, stored in encounter definitions and saves. */
export interface FieldInstanceSpec {
  readonly id: FieldId;
  readonly kind: string;
  /** Validated by the factory for this kind. */
  readonly params: JsonValue;
}

export interface EnvironmentField {
  readonly id: FieldId;
  readonly kind: string;
  /** Extra acceleration on any particle (ship, asteroid) at a position, inertial m/s². */
  acceleration?(position: Vec3, t: Seconds): Vec3;
  /**
   * Thrust response: given the nominal thrust force (inertial, N) on the ship at a position
   * and velocity, return the force actually applied. Identity outside the field.
   */
  modifyThrust?(force: Vec3, position: Vec3, velocity: Vec3, t: Seconds): Vec3;
  /**
   * Lattice intensity at a point in space. The game layer samples it over each
   * equipment item's occupied geometry (never just the ship's centre of mass, 1C).
   */
  intensity?(position: Vec3, t: Seconds): LatticeIntensity;
  /** Raw signal sensors could pick up at a position (processed by ship systems). */
  signal?(position: Vec3, t: Seconds): JsonValue;
  /**
   * True inside the field's region. When it changes for the ship between steps, the
   * simulation emits a `field-boundary` SimEvent (2A request). Omit for fields with no edge.
   */
  inside?(position: Vec3, t: Seconds): boolean;
}

export interface FieldFactory {
  readonly kind: string;
  create(spec: FieldInstanceSpec): EnvironmentField;
}

export interface FieldRegistry {
  register(factory: FieldFactory): void;
  has(kind: string): boolean;
  kinds(): readonly string[];
  /** Throws for an unregistered kind. */
  create(spec: FieldInstanceSpec): EnvironmentField;
}

export function createFieldRegistry(factories: readonly FieldFactory[] = []): FieldRegistry {
  const byKind = new Map<string, FieldFactory>();
  const registry: FieldRegistry = {
    register(factory) {
      if (byKind.has(factory.kind))
        throw new Error(`field kind "${factory.kind}" already registered`);
      byKind.set(factory.kind, factory);
    },
    has: (kind) => byKind.has(kind),
    kinds: () => [...byKind.keys()].sort(),
    create(spec) {
      const factory = byKind.get(spec.kind);
      if (!factory) throw new Error(`no field factory registered for kind "${spec.kind}"`);
      return factory.create(spec);
    },
  };
  for (const f of factories) registry.register(f);
  return registry;
}
