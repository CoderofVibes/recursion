import { Vector2, type WebGLRenderer } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { roomBloom } from '../../theme/index.ts';
import { mountPerfReadout } from './readout.tsx';

let firstDraw: number | null = null;

/** Retain navigation's first draw across the opening-to-room scene replacement. */
export class BudgetComposer extends EffectComposer {
  override render(deltaTime?: number): void {
    super.render(deltaTime);
    firstDraw ??= performance.now();
  }
}

/** Resolution policy, not appearance: keep the theme's bloom strength/radius/threshold. */
export class BudgetBloomPass extends UnrealBloomPass {
  constructor() {
    super(new Vector2(1, 1), roomBloom.strength, roomBloom.radius, roomBloom.threshold);
  }

  override setSize(width: number, height: number): void {
    super.setSize(Math.max(1, Math.ceil(width / 2)), Math.max(1, Math.ceil(height / 2)));
  }
}

/** A18's unchanged gate. Quality choices never reach the game or its clock. */
export const FRAME_BUDGET_MS = 33;
const SCALES = [1, 0.85, 0.7] as const;
const WINDOW_MS = 2000;
const RECOVER_MS = 15000;

/** Hysteresis avoids repeated render-target allocation and visible resolution hunting. */
export class QualityGovernor {
  private level = 0;
  private samples: number[] = [];
  private elapsed = 0;
  private healthy = 0;

  get scale(): number {
    return SCALES[this.level]!;
  }

  resetWindow(): void {
    this.samples.length = 0;
    this.elapsed = 0;
    this.healthy = 0;
  }

  observe(intervalMs: number): boolean {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0 || intervalMs > 1000) {
      this.resetWindow();
      return false;
    }
    this.samples.push(intervalMs);
    this.elapsed += intervalMs;
    if (this.elapsed < WINDOW_MS) return false;
    this.samples.sort((a, b) => a - b);
    const p95 = this.samples[Math.ceil(this.samples.length * 0.95) - 1]!;
    this.healthy = p95 <= FRAME_BUDGET_MS * 0.6 ? this.healthy + this.elapsed : 0;
    this.samples.length = 0;
    this.elapsed = 0;
    if (p95 > FRAME_BUDGET_MS && this.level < SCALES.length - 1) {
      this.level++;
      this.healthy = 0;
      return true;
    }
    if (this.healthy >= RECOVER_MS && this.level > 0) {
      this.level--;
      this.healthy = 0;
      return true;
    }
    return false;
  }
}

/**
 * One hook at the start of RoomView.frame. Use the wall clock, not the loop's capped dt.
 * Ignore the opaque console, transitions, loss, hidden tabs and deliberately thinned warp
 * frames. Only render targets change; CSS labels and console instruments stay native size.
 */
export function createQualityHook(
  renderer: WebGLRenderer,
  composer: EffectComposer,
  scripted = false,
) {
  const governor = new QualityGovernor();
  let previous: number | undefined;
  let eligibleBefore = false;
  let view = scripted ? 'opening' : 'room';
  let currentWarp = 1;
  let shipTime: number | undefined;
  const dispose = mountPerfReadout(() => ({
    view,
    warp: currentWarp,
    shipTime,
    scale: governor.scale,
    ready: firstDraw,
  }));
  const frame = (eligible: boolean, warp: number, mode: string, t: number): void => {
    view = scripted ? 'opening' : mode;
    currentWarp = warp;
    shipTime = t;
    const now = performance.now();
    const active = eligible && warp === 1 && !document.hidden;
    if (previous !== undefined && active && eligibleBefore) {
      if (governor.observe(now - previous))
        composer.setPixelRatio(renderer.getPixelRatio() * governor.scale);
    } else governor.resetWindow();
    previous = now;
    eligibleBefore = active;
  };
  return { frame, dispose };
}
