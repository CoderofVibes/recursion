/**
 * Field view plugins: how an encounter's own phenomenon (a lattice, a well) is drawn in the
 * FLIGHT hologram. The interface lives here; each plugin lives in `src/view3d/fields/<kind>/`
 * and belongs to the section that builds that encounter (build-plan ownership map).
 *
 * A plugin sees only what the ship perceives of the field: a `BelievedField` and its `visual`
 * data, produced by the game layer from what was sensed (P11). A field the ship has not
 * detected is never handed to a plugin, and the window never shows a field at all: holograms
 * are instruments, the window is the unaided eye (A8).
 *
 * To add one, create `src/view3d/fields/<kind>/index.ts` that calls `registerFieldView`.
 * Every such file is loaded when the flight view starts; nothing else needs editing.
 * See src/view3d/README.md.
 */
import type { Group, Vector3 } from 'three';
import type { BelievedField, ViewSnapshot } from '../contracts/index.ts';
import type { LineSet } from './gfx.ts';

/** What a plugin is given once, when its field is first detected. */
export interface FieldViewContext {
  /**
   * Add objects here. The group is in the environment's frame: scene axes (game x, z, -y, see
   * adapter.ts) and game metres. The hologram scales, turns and clips it.
   */
  readonly group: Group;
  /** Fat lines in this frame, with dashes kept in screen pixels. Use theme `LineStyle`s. */
  readonly lines: LineSet;
  /**
   * The part of the segment a→b (this frame) inside the projection volume, as fractions of a→b,
   * against the hologram's current projection; undefined when none of it is (3B). The same as
   * the frame's `clipSegment`, here for a plugin that clips outside `update`.
   */
  clipSegment?(a: Vector3, b: Vector3): readonly [from: number, to: number] | undefined;
  /** The projection's current revision: changes whenever every clip would. */
  clipRevision?(): number;
}

/** What a plugin is given every frame while its field is detected. */
export interface FieldViewFrame {
  readonly field: BelievedField;
  readonly snapshot: ViewSnapshot;
  /** Hologram metres per game metre at the current range. */
  readonly scale: number;
  /** Radius of the projection volume, hologram metres. */
  readonly radius: number;
  /** Whether a point (environment frame) is inside the projection volume. */
  inside(point: Vector3): boolean;
  /**
   * The part of the segment a→b (environment frame) inside the projection volume, as fractions
   * of the way from a to b, or undefined when none of it is. Exact against the hologram's own
   * boundary: both ends outside with the middle crossing, tangency, one end inside (3B).
   */
  clipSegment?(a: Vector3, b: Vector3): readonly [from: number, to: number] | undefined;
  /**
   * Changes whenever the projection (and so every clip) changes: reuse clipped buffers until then.
   * FLIGHT always supplies both; they are optional so frames built by hand in tests still fit.
   */
  readonly clipRevision?: number;
  /** Seconds: this frame, and since the view started. Real time, never warped. */
  readonly dt: number;
  readonly time: number;
}

export interface FieldView {
  update(frame: FieldViewFrame): void;
  dispose(): void;
}

export type FieldViewFactory = (context: FieldViewContext) => FieldView;

/**
 * The registry lives on a hoisted function, not a module-level const. Vite hoists this module's
 * eager plugin glob above every const, so a plugin that registers while this module is still
 * initialising would otherwise hit the const's temporal dead zone (integrator, after 3B).
 */
function registry(): Map<string, FieldViewFactory> {
  const self = registry as typeof registry & { map?: Map<string, FieldViewFactory> };
  return (self.map ??= new Map());
}

/** Register the view for one kind of field (`BelievedField.kind`). The last one registered wins. */
export function registerFieldView(kind: string, factory: FieldViewFactory): void {
  registry().set(kind, factory);
}

export function fieldViewFor(kind: string): FieldViewFactory | undefined {
  return registry().get(kind);
}

export function registeredFieldKinds(): string[] {
  return [...registry().keys()];
}

let loaded = false;

/** Load every plugin under `src/view3d/fields/`. Called once by the flight view. */
export function loadFieldViews(): void {
  if (loaded) return;
  loaded = true;
  // Each plugin registers itself as a side effect of being imported.
  import.meta.glob('./fields/*/index.ts', { eager: true });
}
