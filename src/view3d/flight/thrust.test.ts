/**
 * Thrust as the screens tell it apart (A26 (2)): a commanded burn against the attitude jets.
 */
import { describe, expect, it } from 'vitest';
import { shipDefinition } from '../../contracts/fixtures/index.ts';
import type { ThrustTick } from '../../contracts/index.ts';
import { mainEngines, readThrust, thrustLine } from './thrust.ts';

const tick = (source: string, magnitude: number): ThrustTick => ({
  source,
  point: { x: 0, y: 0, z: 0 },
  direction: { x: 1, y: 0, z: 0 },
  magnitude,
});

describe('thrust: a commanded burn against the attitude jets', () => {
  const engines = mainEngines(shipDefinition);
  const jet = shipDefinition.equipment.find((e) => e.kind === 'rcs-thruster')!.id;
  const engine = [...engines][0]!;

  it('knows the main engine from the jets by what the ship is built with', () => {
    expect(engines.size).toBeGreaterThan(0);
    expect(engines.has(jet)).toBe(false);
  });

  it('counts the main engine as a burn, and jets alone as attitude control', () => {
    const burning = readThrust([tick(engine, 24_000), tick(jet, 220)], engines, false);
    expect(burning.burn.map((t) => t.source)).toEqual([engine]);
    expect(burning.attitude.map((t) => t.source)).toEqual([jet]);
    expect(thrustLine(burning, engines)).toEqual({ kind: 'burn', text: 'main engine · 24.0 kN' });

    const holding = readThrust([tick(jet, 220), tick(jet, 220)], engines, false);
    expect(holding.burn).toEqual([]);
    expect(thrustLine(holding, engines)).toEqual({
      kind: 'attitude',
      text: 'attitude jets · 2 firing',
    });
  });

  it('counts jets as a burn while the hands hold a translation control', () => {
    const pushing = readThrust([tick(jet, 220), tick(jet, 220)], engines, true);
    expect(pushing.burn).toHaveLength(2);
    expect(pushing.attitude).toEqual([]);
    expect(thrustLine(pushing, engines)).toEqual({ kind: 'burn', text: 'jets · 440 N' });
  });

  it('says nothing is firing when nothing is, and ignores a commanded zero', () => {
    const idle = readThrust([tick(jet, 0)], engines, true);
    expect(idle).toEqual({ burn: [], attitude: [] });
    expect(thrustLine(idle, engines)).toEqual({ kind: 'none', text: 'none' });
  });
});
