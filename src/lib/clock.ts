/**
 * Fixed-step clock (DECISIONS P2).
 *
 * The simulation always advances in whole steps of `dt` seconds. Sim time is computed from an
 * integer step count (t = steps × dt), so it never drifts from repeated float addition.
 * The clock turns real frame time and a time-warp factor into a number of steps to run.
 *
 *   const clock = createFixedStepClock({ dt: 0.05 });
 *   // each animation frame:
 *   const n = clock.advance(frameSeconds, warp);
 *   for (let i = 0; i < n; i++) world = step(world, clock.dt);
 *   render(world, clock.alpha); // alpha in [0, 1) for interpolation between steps
 */

export interface FixedStepClockOptions {
  /** Step size, seconds of sim time. */
  dt: number;
  /** Cap on steps per advance() so a stalled tab cannot freeze the game. Default 2000. */
  maxStepsPerAdvance?: number;
  /** Starting step count. Default 0. */
  startStep?: number;
}

export interface FixedStepClock {
  readonly dt: number;
  /** Whole steps taken so far. */
  readonly step: number;
  /** Sim time in seconds: step × dt. */
  readonly time: number;
  /** Fraction of a step accumulated but not yet run, in [0, 1). */
  readonly alpha: number;
  /** True if the last advance() hit maxStepsPerAdvance and dropped time. */
  readonly saturated: boolean;
  /**
   * Accumulate `realSeconds × warp` of sim time and return how many whole steps to run now.
   * warp 0 means paused. Negative inputs are treated as 0.
   */
  advance(realSeconds: number, warp?: number): number;
  /** Run exactly n steps' worth of time (for headless runs and tests). Returns n. */
  advanceSteps(n: number): number;
  /** Time at a given step count, using the same formula as `time`. */
  timeAt(step: number): number;
  /** Reset to a step count, clearing accumulated time. */
  reset(step?: number): void;
}

export function createFixedStepClock(options: FixedStepClockOptions): FixedStepClock {
  const { dt } = options;
  if (!(dt > 0) || !Number.isFinite(dt)) throw new Error(`clock dt must be positive, got ${dt}`);
  const maxSteps = options.maxStepsPerAdvance ?? 2000;

  let step = options.startStep ?? 0;
  let accumulated = 0; // sim seconds not yet consumed by a whole step
  let saturated = false;

  return {
    dt,
    get step() {
      return step;
    },
    get time() {
      return step * dt;
    },
    get alpha() {
      return accumulated / dt;
    },
    get saturated() {
      return saturated;
    },
    advance(realSeconds: number, warp = 1): number {
      const add = Math.max(0, realSeconds) * Math.max(0, warp);
      accumulated += add;
      // Tolerance so float residue (0.25 − 0.2 + 0.05 = 0.0999…) still completes a step.
      let n = Math.floor(accumulated / dt + 1e-9);
      saturated = n > maxSteps;
      if (saturated) {
        n = maxSteps;
        accumulated = 0;
      } else {
        accumulated = Math.min(Math.max(accumulated - n * dt, 0), dt * (1 - 1e-12));
      }
      step += n;
      return n;
    },
    advanceSteps(n: number): number {
      const whole = Math.max(0, Math.floor(n));
      step += whole;
      return whole;
    },
    timeAt(s: number): number {
      return s * dt;
    },
    reset(s = 0): void {
      step = s;
      accumulated = 0;
      saturated = false;
    },
  };
}
