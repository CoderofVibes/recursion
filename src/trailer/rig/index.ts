/** One room and one WebGL context for all TV shots. Never imported by the game. */
import type { Object3D } from 'three';
import { loadShipDefinition } from '../../ship/definition.ts';
import { RoomView, type RoomFrame } from '../../view3d/room/RoomView.ts';
import type { RoomShot } from '../../view3d/opening/shot.ts';
import type { TrailerScene } from '../scene.ts';
import type { Beat } from '../timeline.ts';
import '../../app/control-room.css';
import './rig.css';

export interface RoomPicture {
  readonly data: RoomFrame;
  readonly camera: RoomShot;
  readonly range: number;
  readonly scenery?: Object3D | null;
  readonly hologram?: boolean;
  readonly headingUp?: boolean;
  readonly time?: number;
  readonly lossTime?: number;
  /** Prepared window light, mounted on the public projection group but outside its volume. */
  readonly windowLight?: Object3D;
}

class RoomRig {
  readonly element = document.createElement('div');
  readonly canvas = document.createElement('canvas');
  readonly labels = document.createElement('div');
  readonly room: RoomView;
  private light: Object3D | undefined;

  constructor() {
    this.element.className = 'tv-rig';
    this.labels.className = 'tv-labels';
    this.element.append(this.canvas, this.labels);
    // Keep a measurable canvas throughout preparation, even while every scene is hidden.
    this.park();
    this.room = new RoomView(
      this.canvas,
      this.labels,
      loadShipDefinition(),
      {
        mode() {},
        hot() {},
        pointerLock() {},
        consoleArrived() {},
        loss() {},
        flightPick() {},
        blackBox() {},
      },
      { scripted: true },
    );
  }

  park(): void {
    this.element.classList.add('tv-preparing');
    document.body.append(this.element);
  }

  attach(element: HTMLElement): void {
    this.element.classList.remove('tv-preparing');
    if (this.element.parentElement !== element) element.append(this.element);
  }

  draw(picture: RoomPicture): void {
    this.room.setWindowScenery(picture.scenery ?? null);
    this.room.flight.setRangeMin(picture.range);
    this.room.setFlightRange(picture.range);
    this.room.flight.setHeadingUp(picture.headingUp !== false);
    if (this.light !== picture.windowLight) {
      this.light?.removeFromParent();
      this.light = picture.windowLight;
      if (this.light) this.room.flight.group.add(this.light);
    }
    this.room.renderScriptedFrame(
      picture.data,
      {
        ...picture.camera,
        ...(picture.hologram === undefined ? {} : { hologram: picture.hologram }),
        ...(picture.lossTime === undefined ? {} : { lossTime: picture.lossTime }),
      },
      picture.time ?? 0,
    );
  }

  dispose(): void {
    this.room.dispose();
    this.element.remove();
  }
}

let shared: RoomRig | undefined;
let users = 0;
let preparation: Promise<void> = Promise.resolve();
let preparing = false;
// A Vite hot-update URL and the review tool's plain URL can name separate module instances.
const reviewKey = Symbol.for('recursion.trailer.review-scenes');
const reviewRegistry = globalThis as unknown as Record<symbol, Map<string, TrailerScene>>;
const reviewScenes = (reviewRegistry[reviewKey] ??= new Map<string, TrailerScene>());
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** Serialize shader warm-up because every scene shares the same canvas and label layer. */
export function roomScene(
  id: string,
  picture: (beat: Beat, local: number) => RoomPicture,
  setup: () => void | Promise<void> = () => {},
  cleanup: () => void = () => {},
): TrailerScene {
  const element = document.createElement('div');
  let ready = false;
  let disposed = false;
  let ownPreparation: Promise<void> | undefined;
  users++;
  const scene: TrailerScene = {
    id,
    element,
    prepare() {
      return (ownPreparation ??= preparation =
        preparation.then(async () => {
          if (disposed) return;
          const rig = (shared ??= new RoomRig());
          preparing = true;
          rig.park();
          await setup();
          await nextFrame();
          const beat = (await import('../timeline.ts')).beat(id);
          for (const local of [0, beat.length / 2, beat.length]) {
            const p = picture(beat, local);
            // Complete the window's bounded buffer preparation before Start.
            for (let n = 0; n < 8; n++) {
              rig.draw(p);
              await nextFrame();
            }
          }
          ready = true;
          preparing = false;
        }));
    },
    render(beat, local) {
      if (!ready || disposed || !shared || preparing) return;
      shared.attach(element);
      shared.draw(picture(beat, Math.max(0, Math.min(beat.length, local))));
    },
    resize(width, height) {
      // RoomView observes CSS size and owns its renderer's pixel ratio.
      document.documentElement.style.setProperty('--tv-width', `${width}px`);
      document.documentElement.style.setProperty('--tv-height', `${height}px`);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      reviewScenes.delete(id);
      cleanup();
      element.remove();
      if (--users === 0) {
        shared?.dispose();
        shared = undefined;
      }
    },
  };
  element.dataset.tvScene = id;
  reviewScenes.set(id, scene);
  return scene;
}

/** Dev-only capture entry: samples the actual registered scene, including backwards seeks. */
export async function sampleForReview(id: string, local: number): Promise<void> {
  const scene = reviewScenes.get(id);
  if (!scene) throw new Error(`No room scene ${id}`);
  await scene.prepare();
  const { beat, levelAt } = await import('../timeline.ts');
  for (const other of reviewScenes.values()) other.element.hidden = other !== scene;
  const current = beat(id);
  const veil = document.querySelector<HTMLElement>('.tr-veil');
  if (veil) veil.style.opacity = String(1 - levelAt(current.start + local));
  scene.render(current, local);
}
