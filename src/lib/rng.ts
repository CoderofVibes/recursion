/**
 * Seeded random numbers with named streams (DECISIONS P2: determinism).
 *
 * All randomness in the game comes from here. Never call Math.random() in simulation,
 * ship-systems, model or content code.
 *
 * Named streams are derived from the root seed and the stream name only, so adding a new
 * stream (or drawing more numbers from one) never changes the numbers another stream gives.
 *
 *   const root = createRng('gravity-range');
 *   const optical = root.stream('sensors.optical');
 *   optical.normal(0, sigma);
 *
 * Generator: sfc32 (32-bit small fast chaotic), seeded through splitmix32 from a string hash.
 * State is four uint32 words and can be saved and restored exactly.
 */

export type RngState = readonly [number, number, number, number];

export interface Rng {
  /** Name of this stream ('' for the root). */
  readonly name: string;
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform uint32 in [0, 2^32). */
  nextUint32(): number;
  /** Uniform in [min, max). */
  range(min: number, max: number): number;
  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Normally distributed sample (Box–Muller, no cached spare, so state stays four words). */
  normal(mean?: number, sd?: number): number;
  /** True with probability p. */
  chance(p: number): boolean;
  /** Pick one element uniformly. Throws on an empty array. */
  pick<T>(items: readonly T[]): T;
  /** Independent child stream; depends only on this stream's seed key and `name`. */
  stream(name: string): Rng;
  /** Snapshot of the generator state. */
  getState(): RngState;
  /** Restore a snapshot taken with getState(). */
  setState(state: RngState): void;
}

/** 32-bit FNV-1a hash of a string (UTF-16 code units). */
export function hashString32(text: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function splitmix32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
}

function initialState(key: string): [number, number, number, number] {
  const mix = splitmix32(hashString32(key));
  const state: [number, number, number, number] = [mix(), mix(), mix(), mix()];
  // sfc32 must not start from all zeros.
  if ((state[0] | state[1] | state[2] | state[3]) === 0) state[3] = 1;
  return state;
}

class Sfc32 implements Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  readonly name: string;
  private readonly key: string;

  constructor(name: string, key: string) {
    this.name = name;
    this.key = key;
    [this.a, this.b, this.c, this.d] = initialState(key);
    // Discard the first outputs to decorrelate nearby keys.
    for (let i = 0; i < 12; i++) this.nextUint32();
  }

  nextUint32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  next(): number {
    return this.nextUint32() / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  normal(mean = 0, sd = 1): number {
    // 1 - next() is in (0, 1], so the log is finite.
    const u1 = 1 - this.next();
    const u2 = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error(`rng.pick on empty array (stream "${this.name}")`);
    return items[Math.floor(this.next() * items.length)] as T;
  }

  stream(name: string): Rng {
    const childName = this.name ? `${this.name}/${name}` : name;
    return new Sfc32(childName, `${this.key}\u0000${name}`);
  }

  getState(): RngState {
    return [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.d >>> 0];
  }

  setState(state: RngState): void {
    [this.a, this.b, this.c, this.d] = [state[0] | 0, state[1] | 0, state[2] | 0, state[3] | 0];
  }
}

/** Root generator for a seed. Numeric and string seeds are both accepted. */
export function createRng(seed: number | string): Rng {
  return new Sfc32('', `seed:${String(seed)}`);
}
