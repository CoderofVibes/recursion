/**
 * The turn in progress as FLIGHT states it (NIGHT's finding 7): a held key reads as working
 * from the first frame, before the ship has gathered any rate.
 */
import { describe, expect, it } from 'vitest';
import { RATE_FULL, turnReading } from './flightAction.ts';

const rad = (degrees: number): number => (degrees * Math.PI) / 180;
const STILL = { yaw: 0, pitch: 0 };

describe('the turn in progress', () => {
  it('says the ship is turning as soon as a key is held, before any rate has built', () => {
    const t = turnReading(STILL, 'hands-on', { yaw: 1, pitch: 0 });
    expect(t.turning).toBe(true);
    expect(t.text).toContain('yaw ⟲ 0.00°/s');
    expect(t.text).toContain('by hand');
    expect(t.text).toContain('rate builds slowly');
    // Only the axis in hand is named.
    expect(t.text).not.toContain('pitch');
  });

  it('gives the rate and its sense on each axis', () => {
    const left = turnReading({ yaw: rad(0.52), pitch: 0 }, 'hands-on', { yaw: 1, pitch: 0 });
    expect(left.yaw).toBeCloseTo(0.52, 9);
    expect(left.text).toContain('yaw ⟲ 0.52°/s');
    const right = turnReading({ yaw: rad(-0.3), pitch: rad(0.1) }, 'hands-on', {
      yaw: -1,
      pitch: 1,
    });
    expect(right.text).toContain('yaw ⟳ 0.30°/s');
    expect(right.text).toContain('pitch ↑ 0.10°/s');
    const down = turnReading({ yaw: 0, pitch: rad(-0.2) }, 'hands-on', { yaw: 0, pitch: -1 });
    expect(down.text).toContain('pitch ↓ 0.20°/s');
  });

  it('names what is turning the ship when the hands are off', () => {
    const plan = turnReading({ yaw: rad(0.4), pitch: 0 }, 'pointing', STILL);
    expect(plan.turning).toBe(true);
    expect(plan.text).toBe('yaw ⟲ 0.40°/s · turning to the commanded direction');
  });

  it('says what the attitude control is doing when the ship is still', () => {
    expect(turnReading(STILL, 'steady', STILL)).toMatchObject({
      turning: false,
      text: 'rotation stopped · attitude free',
    });
    expect(turnReading(STILL, 'hold', STILL).text).toBe('holding attitude');
    expect(turnReading(STILL, 'free', STILL).text).toBe('no attitude control');
    // Sensor noise on a still ship is not a turn.
    expect(turnReading({ yaw: rad(0.001), pitch: 0 }, 'hold', STILL).turning).toBe(false);
  });

  it('has a display scale for the rate bars', () => {
    expect(RATE_FULL).toBeGreaterThan(0);
  });
});
