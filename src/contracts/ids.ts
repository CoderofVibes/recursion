/**
 * Identifiers. Plain strings, kebab-case, stable across saves (for example "alpha",
 * "main-engine", "attempt-0003"). Aliases only document which namespace a string belongs to.
 */

export type BodyId = string;
export type AsteroidId = string;
/** Anything the ship can track: a massive body or an asteroid. */
export type ObjectId = BodyId | AsteroidId;
export type EquipmentId = string;
export type BusId = string;
export type TankId = string;
export type ThermalNodeId = string;
export type ConfigurationId = string;
export type FieldId = string;
export type EncounterId = string;
export type ObjectiveId = string;
export type AttemptId = string;
export type ForecastId = string;
export type PlanId = string;
export type PlanItemId = string;
export type ProcedureId = string;
export type LeadId = string;
/** Dotted model parameter path, e.g. "body.alpha.mu". See README § Parameter IDs. */
export type ParameterId = string;
/** Model extension, e.g. "distance-law". See model.ts KNOWN_EXTENSIONS. */
export type ExtensionId = string;
/** Dotted telemetry channel, e.g. "battery-1.charge". See README § Telemetry channels. */
export type TelemetryChannel = string;
