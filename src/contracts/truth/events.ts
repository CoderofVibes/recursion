/**
 * TRUTH. Simulation events. Some are things the ship cannot know (true clearance, crossing an
 * invisible field boundary); the game layer turns the sensible ones into ShipEvents.
 */

import type { Vec2 } from '../../lib/vec2.ts';
import type { FieldId, ObjectId } from '../ids.ts';
import type { ShipEvent } from '../measurements.ts';
import type { Meters, MetersPerSecond, Seconds } from '../units.ts';

export type SimEvent =
  /** Local minimum of hull-to-surface clearance to an object. */
  | {
      readonly kind: 'clearance';
      readonly t: Seconds;
      readonly with: ObjectId;
      readonly distance: Meters;
    }
  /** Hull touched an object. */
  | {
      readonly kind: 'impact';
      readonly t: Seconds;
      readonly with: ObjectId;
      readonly relativeSpeed: MetersPerSecond;
      /** Contact point, body frame. */
      readonly point: Vec2;
    }
  | {
      readonly kind: 'field-boundary';
      readonly t: Seconds;
      readonly field: FieldId;
      readonly entered: boolean;
    };

export type TruthEvent = SimEvent | ShipEvent;
