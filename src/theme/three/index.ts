/**
 * Three.js materials and geometry helpers built from the theme. Owner: 1E, the UI lane.
 *
 * The view composes the scene; these decide how each thing in it is drawn. Import from here
 * (this entry pulls in `three`); plain style data is also on `src/theme/index.ts`.
 * See them running in the UI lab: `npm run dev`, then /src/theme/lab/index.html.
 */
export { lineStyles, envelopeStyle, planeStyle, objectStyle } from './styles.ts';
export type { LineStyle } from './styles.ts';
export { holoLines, holoWire, holoSize } from './holo.ts';
export { shipWire, shipHoloMotion } from './ship-holo.ts';
export { mapLines, mapWire, mapHaze, mapMotion } from './map-holo.ts';
export { lineMaterial, pixelsPerUnit, LineKit, wireMaterial, ghostWireMaterial } from './lines.ts';
export type { LineStyleName, LineOptions, WireRole } from './lines.ts';
export { envelopeGeometry, envelopeMaterial } from './envelope.ts';
export type { EnvelopeStation, EnvelopeMaterialOptions } from './envelope.ts';
export { planeMaterial, setPlaneCoverage, planeVeilMaterial, MAX_SECTORS } from './plane.ts';
export type { PlaneSector, PlaneMaterialOptions } from './plane.ts';
export { holoPlaneMaterial, setHoloPlane, MAX_EARLIER } from './holo-plane.ts';
export type { EarlierSector } from './holo-plane.ts';
export { bodyMaterial, rockMaterial, setSun } from './bodies.ts';
export type { BodyMaterialOptions, RockMaterialOptions } from './bodies.ts';
export { latticeMaterial, wellLineMaterial, wellColour } from './fields.ts';
export type { LatticeMaterialOptions } from './fields.ts';
