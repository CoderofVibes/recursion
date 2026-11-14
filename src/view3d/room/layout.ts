/**
 * The control room's layout (DECISIONS A8): dimensions in metres, where the console and its
 * hologram stand, and where the camera goes for each view. Scene axes: x right, y up, the
 * window is toward -z and the door toward +z. How surfaces and lights look is in
 * `src/theme/room.ts`; this file is only where things are.
 */

/** The compartment: 8 m wide (owner), a curved front wall of radius R centred at z = zc. */
export const ROOM = {
  W: 8,
  /** z of the back wall (the door end). */
  back: 4.6,
  /** z of the centre of the front wall's curve. */
  zc: -1.0,
  R: 4,
  H: 3.0,
  /** Window sill and head heights. */
  sill: 0.82,
  head: 2.62,
  /** Standing eye height. */
  eye: 1.68,
} as const;
export type RoomDims = typeof ROOM;

/** The central console: centre, plan size, height of its top. */
export const CON = { x: 0, z: -0.9, w: 3.0, d: 1.8, top: 0.95 } as const;
export type ConsoleDims = typeof CON;

/** Centre of the hologram volume above the console. */
export const HOLO = { x: 0, y: 1.42, z: CON.z } as const;

/** Height at which the outside's reference plane passes the window: about eye level. */
export const HORIZON_Y = 1.6;

/** Window arc in degrees (owner decision open; 1E's default). */
export const WINDOW_ARC = 150;

/** Where the player stands on walking in, and after a loss (A9). */
export const DOOR = { x: 0, z: 3.75, yaw: 0, pitch: -0.05 } as const;

export type ViewMode = 'room' | 'map' | 'ship' | 'console' | 'flight';

export interface ViewPose {
  /** Camera position and what it looks at; absent for the room (the player's own eyes). */
  readonly pos?: readonly [number, number, number];
  readonly look?: readonly [number, number, number];
  readonly up?: readonly [number, number, number];
  /** Room light level, 0 dark to 1 lit. */
  readonly level: number;
  /** Opacity of the veil that hides the room behind a hologram. */
  readonly veil: number;
  /** Brightness of the console's own screen. */
  readonly screen: number;
  /** Tilt of the hologram toward the camera, radians. */
  readonly tilt: number;
  /** Hologram brightness; 0 hides it. */
  readonly holo: number;
  /** How far the hologram rises above its resting height, metres. */
  readonly lift: number;
  readonly fov: number;
}

/**
 * Camera and room state per view. MAP and SHIP hide the room; FLIGHT dims it and keeps the
 * window; CONSOLE looks straight down into the console's screen (A8).
 */
export const VIEW: Readonly<Record<ViewMode, ViewPose>> = {
  room: { level: 1, veil: 0, screen: 0.75, tilt: 0, holo: 1, lift: 0, fov: 62 },
  map: {
    pos: [0, 2.5, CON.z + 2.95],
    look: [0, 1.93, CON.z],
    level: 0,
    veil: 1,
    screen: 0,
    tilt: 0.24,
    holo: 1.4,
    lift: 0.5,
    fov: 48,
  },
  ship: {
    pos: [0, 2.3, CON.z + 2.3],
    look: [0, 1.72, CON.z],
    level: 0,
    veil: 1,
    screen: 0,
    tilt: 0,
    holo: 1.4,
    lift: 0.36,
    fov: 42,
  },
  console: {
    pos: [0, 2.56, CON.z + 0.001],
    look: [0, CON.top, CON.z],
    up: [0, 0, -1],
    level: 0.5,
    veil: 0,
    screen: 1,
    tilt: 0,
    holo: 0,
    lift: 0,
    fov: 62,
  },
  flight: {
    pos: [0, 1.9, CON.z + 2.55],
    look: [0, 1.42, CON.z - 1.0],
    level: 0.3,
    veil: 0,
    screen: 0.4,
    tilt: 0.3,
    holo: 1.2,
    lift: 0,
    fov: 60,
  },
};

/** What the cursor can find on the console. */
export type Hotspot = 'map' | 'ship' | 'console' | 'flight' | 'blackbox';

export const HOTSPOT_NAME: Readonly<Record<Hotspot, string>> = {
  map: 'MAP',
  ship: 'SHIP',
  console: 'CONSOLE',
  flight: 'FLIGHT',
  blackbox: 'BLACK BOX',
};

/** The four pads on the console's key rail, left to right. */
export const PADS: readonly Exclude<Hotspot, 'blackbox'>[] = ['map', 'ship', 'console', 'flight'];

/** How close the player must be for the cursor to find a hotspot, metres. */
export const REACH = 3.8;
