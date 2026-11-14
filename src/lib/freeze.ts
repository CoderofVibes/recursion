/**
 * Deep freeze for values that must never change after creation, such as issued forecasts
 * (DECISIONS P10: the dotted line is the forecast as issued, frozen).
 */

/**
 * Deeply readonly T. Arrays and tuples keep their shape: a `[number, number, number]` stays a
 * three-element tuple (readonly); it does not widen to `readonly number[]`.
 */
export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly unknown[]
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

/** Recursively Object.freeze a plain object or array graph and return it typed as deep-readonly. */
export function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value as DeepReadonly<T>;
}
