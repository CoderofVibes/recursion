/**
 * State hashing for determinism tests (DECISIONS P2).
 *
 * hashState() walks any JSON-like value (objects, arrays, numbers, strings, booleans, null,
 * undefined, typed arrays) and returns a 16-hex-digit hash. Object keys are sorted, so key
 * order does not matter. Numbers are hashed by their exact IEEE-754 bits, so the hash
 * changes if any value changes in its last bit. All NaNs hash the same; +0 and -0 differ.
 *
 *   expect(hashState(runA)).toBe(hashState(runB));
 */

const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);

class Hasher {
  // Two independent 32-bit FNV-1a lanes with different offsets → 64-bit result.
  private h1 = 0x811c9dc5;
  private h2 = 0x01000193 ^ 0x9e3779b9;

  byte(b: number): void {
    this.h1 = Math.imul(this.h1 ^ (b & 0xff), 0x01000193);
    this.h2 = Math.imul(this.h2 ^ (b & 0xff), 0x01000193);
    this.h2 ^= this.h2 >>> 15;
  }

  word(w: number): void {
    this.byte(w);
    this.byte(w >>> 8);
    this.byte(w >>> 16);
    this.byte(w >>> 24);
  }

  number(n: number): void {
    if (Number.isNaN(n)) {
      // One canonical NaN.
      this.word(0);
      this.word(0x7ff80000);
      return;
    }
    f64[0] = n;
    this.word(u32[0] as number);
    this.word(u32[1] as number);
  }

  string(s: string): void {
    this.word(s.length);
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      this.byte(c);
      this.byte(c >>> 8);
    }
  }

  digest(): string {
    return (
      (this.h1 >>> 0).toString(16).padStart(8, '0') + (this.h2 >>> 0).toString(16).padStart(8, '0')
    );
  }
}

const TAG = {
  undefined: 1,
  null: 2,
  false: 3,
  true: 4,
  number: 5,
  string: 6,
  array: 7,
  object: 8,
  bigint: 9,
} as const;

function visit(h: Hasher, value: unknown, seen: Set<object>): void {
  if (value === undefined) return h.byte(TAG.undefined);
  if (value === null) return h.byte(TAG.null);
  switch (typeof value) {
    case 'boolean':
      return h.byte(value ? TAG.true : TAG.false);
    case 'number':
      h.byte(TAG.number);
      return h.number(value);
    case 'string':
      h.byte(TAG.string);
      return h.string(value);
    case 'bigint':
      h.byte(TAG.bigint);
      return h.string(value.toString());
    case 'function':
    case 'symbol':
      throw new TypeError(`hashState cannot hash a ${typeof value}`);
  }
  const obj = value as object;
  if (seen.has(obj)) throw new TypeError('hashState cannot hash a cyclic structure');
  seen.add(obj);
  if (Array.isArray(obj) || ArrayBuffer.isView(obj)) {
    const arr = obj as ArrayLike<unknown>;
    h.byte(TAG.array);
    h.word(arr.length);
    for (let i = 0; i < arr.length; i++) visit(h, arr[i], seen);
  } else {
    const record = obj as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((k) => record[k] !== undefined)
      .sort();
    h.byte(TAG.object);
    h.word(keys.length);
    for (const k of keys) {
      h.string(k);
      visit(h, record[k], seen);
    }
  }
  seen.delete(obj);
}

/** Deterministic 64-bit hash (16 hex digits) of a JSON-like value. */
export function hashState(value: unknown): string {
  const h = new Hasher();
  visit(h, value, new Set());
  return h.digest();
}
