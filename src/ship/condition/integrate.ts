import type { ShipDefinition } from '../../contracts/ship.ts';
import type { ShipEvent } from '../../contracts/measurements.ts';
import type { ShipSystemsState } from '../../contracts/truth/ship.ts';
import { nextConditionBoundary, stepCondition, type Energized, type Exposure } from './index.ts';

export interface ConditionInterval {
  /** Start-of-interval real electrical availability (after a fresh dispatch).
   * Caller also caps duration at depletion, protection and intensity edges. */
  readonly energized: Energized;
  readonly duration: number;
  /** Certified raw integrated prefix; recomputed from actual intermediate poses.
   * An unresolved dose/dwell bound must throw/refine, never silently round safe. */
  readonly sample: (duration: number) => Exposure;
}

/** Event scheduler, not another ship/game step. The owner supplies the existing
 * advance operation, then re-sweeps/re-dispatches from every returned boundary.
 * onSegment lets the game integrate force/observations BEFORE the ending fault.
 * It must not apply a whole-tick averaged actuator after a component dies. */
export function integrateConditionedInterval(
  initial: ShipSystemsState,
  definition: ShipDefinition,
  duration: number,
  interval: (state: ShipSystemsState, remaining: number) => ConditionInterval,
  advance: (
    state: ShipSystemsState,
    dt: number,
  ) => { state: ShipSystemsState; events: readonly ShipEvent[] },
  onSegment?: (start: ShipSystemsState, end: ShipSystemsState, dt: number) => void,
): { state: ShipSystemsState; events: ShipEvent[] } {
  if (!(duration > 0) || !Number.isFinite(duration))
    throw new RangeError('Invalid conditioned duration.');
  let state = initial;
  const end = initial.t + duration;
  const events: ShipEvent[] = [];
  while (state.t < end - 1e-10) {
    const input = interval(state, end - state.t);
    if (!(input.duration > 0) || input.duration > end - state.t + 1e-10)
      throw new RangeError('Condition interval must be positive and within the remaining time.');
    const dt = nextConditionBoundary(
      state,
      definition,
      input.sample,
      input.energized,
      input.duration,
    );
    const advanced = advance(state, dt);
    onSegment?.(state, advanced.state, dt);
    const conditioned = stepCondition(
      { ...advanced.state, t: state.t },
      definition,
      input.sample(dt),
      input.energized,
      dt,
    );
    events.push(...advanced.events, ...conditioned.events);
    state = { ...conditioned.state, t: state.t + dt };
  }
  return { state, events: events.sort((a, b) => a.t - b.t) };
}
