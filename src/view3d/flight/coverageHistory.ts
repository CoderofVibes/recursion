/**
 * What the ship has sensed earlier in this attempt (P11; handoff R6). The snapshot carries only
 * what the sensors cover now. The view remembers each sector it was shown, anchored where the
 * ship was at the time, so the reference plane can read three ways: sensed now, sensed earlier
 * (fading as ship time passes, because things move), and never sensed (hatched).
 *
 * Only this attempt is remembered: a clock that runs backwards (Recall, a loss, a new attempt)
 * clears it. Earlier attempts would need Black Box data in the snapshot.
 */
import type { EarlierSector } from '../../theme/three/index.ts';

/** A sector as the plane draws it, from one sensor. */
export interface SensedSector {
  readonly sensor: string;
  /** Direction of the sector's centre, radians counter-clockwise from game +x. */
  readonly center: number;
  readonly halfWidth: number;
  /** Game metres. */
  readonly range: number;
}

interface Kept {
  readonly sensor: string;
  readonly center: number;
  readonly halfWidth: number;
  readonly range: number;
  /** Where the ship was (game x, y). */
  readonly x: number;
  readonly y: number;
  /** Ship time it was last sensed. */
  t: number;
}

/**
 * A new sector is kept when the sensor has turned by more than half its width, changed its
 * width or reach by a tenth, or the ship has moved a fiftieth of the reach since the last one;
 * otherwise the last one is renewed.
 */
const TURN = 0.5;
const CHANGE = 0.1;
const MOVE = 0.02;

const angleBetween = (a: number, b: number): number =>
  Math.abs(((((a - b) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);

export class CoverageHistory {
  private readonly kept: Kept[] = [];
  private last = -Infinity;
  private readonly memory: number;
  private readonly capacity: number;

  /**
   * @param memory ship seconds after which a sector sensed earlier reads as unknown again
   * @param capacity most sectors remembered; the stalest go first
   */
  constructor(memory: number, capacity: number) {
    this.memory = memory;
    this.capacity = capacity;
  }

  /** Note what the sensors cover at ship time `t`, from the ship's position (game x, y). */
  note(t: number, x: number, y: number, sectors: readonly SensedSector[]): void {
    if (t < this.last) this.kept.length = 0;
    this.last = t;
    this.expire(t);
    for (const s of sectors) {
      let previous: Kept | undefined;
      for (let i = this.kept.length - 1; i >= 0 && !previous; i--)
        if (this.kept[i]!.sensor === s.sensor) previous = this.kept[i];
      if (previous && same(previous, s, x, y)) {
        previous.t = t;
        continue;
      }
      this.kept.push({ ...s, x, y, t });
    }
    while (this.kept.length > this.capacity) {
      let stalest = 0;
      for (let i = 1; i < this.kept.length; i++) if (this.kept[i]!.t < this.kept[stalest]!.t) stalest = i;
      this.kept.splice(stalest, 1);
    }
  }

  /**
   * What was sensed earlier and is still remembered at ship time `t`, as offsets from the
   * ship's position now (game x, y), freshest first. `fresh` falls from 1 to 0 over the memory.
   */
  earlier(t: number, x: number, y: number): EarlierSector[] {
    return this.kept
      .map((k) => ({
        center: k.center,
        halfWidth: k.halfWidth,
        range: k.range,
        dx: k.x - x,
        dy: k.y - y,
        fresh: Math.max(0, Math.min(1, 1 - (t - k.t) / this.memory)),
      }))
      .filter((e) => e.fresh > 0)
      .sort((a, b) => b.fresh - a.fresh);
  }

  /** Forget everything (a new attempt). */
  clear(): void {
    this.kept.length = 0;
    this.last = -Infinity;
  }

  private expire(t: number): void {
    for (let i = this.kept.length - 1; i >= 0; i--)
      if (t - this.kept[i]!.t >= this.memory) this.kept.splice(i, 1);
  }
}

function same(k: Kept, s: SensedSector, x: number, y: number): boolean {
  return (
    angleBetween(k.center, s.center) <= TURN * s.halfWidth &&
    Math.abs(k.halfWidth - s.halfWidth) <= CHANGE * s.halfWidth &&
    Math.abs(k.range - s.range) <= CHANGE * s.range &&
    Math.hypot(k.x - x, k.y - y) <= MOVE * s.range
  );
}
