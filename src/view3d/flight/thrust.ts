/**
 * What the ship's thrusters are doing, in two kinds the screens tell apart (A26 (2)): a burn
 * the player or a plan commanded (the main engine, or the jets pushing the ship along an axis
 * the hands hold), and the attitude jets turning the ship or holding it steady. The first is
 * drawn in full with its line of action and named; the second is drawn quietly.
 *
 * Belief side (P11): it reads the snapshot's commanded thrust, nothing else.
 */
import type { ShipDefinition, ThrustTick } from '../../contracts/index.ts';

export interface ThrustReading {
  /** Commanded burns: the main engine, or jets translating the ship by hand. */
  readonly burn: readonly ThrustTick[];
  /** Attitude control: jets turning the ship or stopping its rotation. */
  readonly attitude: readonly ThrustTick[];
}

/** The engines whose firing is always a commanded burn. */
export function mainEngines(definition: Pick<ShipDefinition, 'equipment'>): ReadonlySet<string> {
  return new Set(definition.equipment.filter((e) => e.kind === 'main-engine').map((e) => e.id));
}

/**
 * Sort what is firing. `translating` is true while the hands hold a translation control: the
 * jets are then pushing the ship where the player asked, not only holding its attitude.
 */
export function readThrust(
  ticks: readonly ThrustTick[],
  engines: ReadonlySet<string>,
  translating: boolean,
): ThrustReading {
  const burn: ThrustTick[] = [];
  const attitude: ThrustTick[] = [];
  for (const tick of ticks) {
    if (!(tick.magnitude > 0)) continue;
    if (engines.has(tick.source) || translating) burn.push(tick);
    else attitude.push(tick);
  }
  return { burn, attitude };
}

/** The reading in the HUD's words: what kind of firing, by what, and how hard. */
export function thrustLine(
  reading: ThrustReading,
  engines: ReadonlySet<string>,
): { readonly kind: 'burn' | 'attitude' | 'none'; readonly text: string } {
  if (reading.burn.length) {
    const force = reading.burn.reduce((n, t) => n + t.magnitude, 0);
    const main = reading.burn.some((t) => engines.has(t.source));
    const kilo = force >= 1000 ? `${(force / 1000).toFixed(1)} kN` : `${force.toFixed(0)} N`;
    return { kind: 'burn', text: `${main ? 'main engine' : 'jets'} · ${kilo}` };
  }
  if (reading.attitude.length)
    return {
      kind: 'attitude',
      text: `attitude jets · ${reading.attitude.length} firing`,
    };
  return { kind: 'none', text: 'none' };
}

/** Which translation keys the hands hold (lower case): the jets are then a commanded burn. */
export const TRANSLATE_KEYS: readonly string[] = ['s', 'a', 'd', 'r', 'f'];
