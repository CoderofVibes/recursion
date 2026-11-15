/**
 * What a trailer scene is. Each scene lives in its own folder, `src/trailer/scenes/<id>/index.ts`,
 * and exports `createScene`; the page finds them by folder name, so a new scene needs no change
 * anywhere else. A beat whose scene has no folder yet shows a stand-in slate.
 */
import type { Beat } from './timeline.ts';

export interface TrailerScene {
  /** Must equal the scene's folder name and the beats' `scene`. */
  readonly id: string;
  /**
   * What the page shows while one of this scene's beats is on screen: a canvas or a DOM layer.
   * The page sizes it to the whole viewport and hides it otherwise (a hard cut).
   */
  readonly element: HTMLElement;
  /**
   * Load everything and compile every shader before Start, so nothing hitches on camera. Called
   * once; Start waits for every scene's promise.
   */
  prepare(): Promise<void>;
  /**
   * Draw the frame `local` seconds into `beat` (0 at its start, up to `beat.length`). The picture
   * must depend only on these arguments, so every run, every replay and a jump to any moment draw
   * the same frame.
   */
  render(beat: Beat, local: number): void;
  /** The viewport changed: CSS pixels and the device pixel ratio (the owner records at 1.25). */
  resize(width: number, height: number, pixelRatio: number): void;
  dispose(): void;
}

export type SceneFactory = () => TrailerScene;
