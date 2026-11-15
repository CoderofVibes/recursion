import type { Texture } from 'three';

/** A camera pose and room light levels for a scripted shot, in room coordinates. */
export interface RoomShot {
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [pitch: number, yaw: number, roll: number];
  readonly light: number;
  readonly console: number;
  readonly alarm?: number;
  readonly consoleMap?: Texture;
}
