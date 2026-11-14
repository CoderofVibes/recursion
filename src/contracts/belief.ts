/**
 * The believed world: what the ship's model holds (DECISIONS P11).
 *
 * Built only from measurements, priors and the nominal ship design. Things the ship has not
 * sensed are absent or flagged untracked; positions carry uncertainty.
 */

import type { Vec2 } from '../lib/vec2.ts';
import type { Cov2, Gaussian } from './estimates.ts';
import type {
  AsteroidId,
  BodyId,
  ConfigurationId,
  EquipmentId,
  FieldId,
  TankId,
  TelemetryChannel,
} from './ids.ts';
import type { MassProperties } from './ship.ts';
import type { JsonValue, Meters, Radians, RadiansPerSecond, Seconds, Watts } from './units.ts';

/** Navigation estimate of the ship's kinematic state. */
export interface ShipEstimate {
  readonly t: Seconds;
  readonly position: Vec2;
  readonly velocity: Vec2;
  /** m². */
  readonly positionCov: Cov2;
  /** (m/s)². */
  readonly velocityCov: Cov2;
  readonly attitude: Radians;
  readonly attitudeSigma: Radians;
  readonly angularRate: RadiansPerSecond;
}

export interface TelemetryReading {
  readonly t: Seconds;
  readonly value: number;
  readonly sigma: number;
}

/** Equipment as the ship reports it (from telemetry and commanded state). */
export interface EquipmentStatus {
  readonly id: EquipmentId;
  readonly mode: string;
  /** Allocated power. */
  readonly allocation: Watts;
  /** Measured draw. */
  readonly powerDraw: Watts;
  /** Health estimate, 0 failed to 1 nominal. */
  readonly condition: number;
  /** Protection reported as tripped. */
  readonly tripped: boolean;
  readonly temperature?: number;
  readonly faults: readonly string[];
  /** Equipment-specific readings, e.g. { charge: 1.2e8 } for a battery (SI). */
  readonly readings: Readonly<Record<string, number>>;
}

export interface BelievedShip extends ShipEstimate {
  readonly configuration: ConfigurationId;
  /** From the nominal design and gauged propellant. */
  readonly massProperties: MassProperties;
  readonly equipment: Readonly<Record<EquipmentId, EquipmentStatus>>;
  /** Gauged propellant per tank, kg. */
  readonly propellant: Readonly<Record<TankId, Gaussian>>;
  /** Latest reading per telemetry channel. */
  readonly telemetry: Readonly<Record<TelemetryChannel, TelemetryReading>>;
}

export interface BelievedBody {
  readonly id: BodyId;
  readonly name: string;
  readonly position: Vec2;
  readonly velocity: Vec2;
  readonly positionCov: Cov2;
  readonly radius: Meters;
  /** Currently being tracked by a sensor. */
  readonly tracked: boolean;
  readonly lastFix?: Seconds;
}

export interface BelievedAsteroid {
  readonly id: AsteroidId;
  readonly position: Vec2;
  readonly velocity: Vec2;
  readonly positionCov: Cov2;
  readonly radius: Meters;
  readonly tracked: boolean;
  readonly lastSeen?: Seconds;
}

/** What the ship perceives of an environment field. `visual` is for field view plugins. */
export interface BelievedField {
  readonly id: FieldId;
  readonly kind: string;
  readonly detected: boolean;
  /** Plugin-specific data (e.g. lattice reconstruction quality and samples). */
  readonly visual?: JsonValue;
}

export interface BelievedWorld {
  readonly t: Seconds;
  readonly modelVersion: number;
  readonly ship: BelievedShip;
  readonly bodies: readonly BelievedBody[];
  readonly asteroids: readonly BelievedAsteroid[];
  readonly fields: readonly BelievedField[];
}
