/**
 * Units. Everything is SI internally; these aliases document intent and are plain numbers.
 * Sim time is seconds since the encounter's arrival (t = 0). Angles are radians,
 * counter-clockwise from inertial +x. Covariances are in the square of the quantity's unit.
 */

export type Seconds = number;
export type Meters = number;
export type MetersPerSecond = number;
export type MetersPerSecond2 = number;
export type Kilograms = number;
/** Moment of inertia about the plane-normal axis through the centre of mass. */
export type KilogramMeters2 = number;
export type Radians = number;
export type RadiansPerSecond = number;
export type Newtons = number;
export type NewtonSeconds = number;
export type NewtonMeters = number;
export type Watts = number;
export type Joules = number;
export type Kelvin = number;
export type Volts = number;
export type Hertz = number;
export type Bytes = number;
/**
 * Lattice field intensity, in the fictional "lattice unit" (Chain Link Fence). Not a real
 * radiation dose: see data/ship-baseline.json radiation.exposureUnit (1C).
 */
export type LatticeIntensity = number;
/** Accumulated lattice exposure: intensity × susceptibility × time, "lattice-unit·s". */
export type LatticeExposure = number;
/** Dimensionless value in [0, 1]. */
export type Fraction = number;

/** JSON-serialisable value: anything stored in Black Box, saves or content files. */
export type JsonValue =
  null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };
