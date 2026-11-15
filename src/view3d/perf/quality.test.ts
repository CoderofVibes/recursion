import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQualityHook, QualityGovernor } from './quality.ts';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('presentation-only render budget', () => {
  it('requires sustained slow frames, floors quality, and restores it slowly', () => {
    const quality = new QualityGovernor();
    quality.observe(200); // One hitch does not allocate new targets.
    expect(quality.scale).toBe(1);
    for (let i = 0; i < 100; i++) quality.observe(40);
    expect(quality.scale).toBe(0.7);
    for (let i = 0; i < 100; i++) quality.observe(40);
    expect(quality.scale).toBe(0.7);
    for (let i = 0; i < 800; i++) quality.observe(16);
    expect(quality.scale).toBe(0.7);
    for (let i = 0; i < 250; i++) quality.observe(16);
    expect(quality.scale).toBe(0.85);
    for (let i = 0; i < 1000; i++) quality.observe(16);
    expect(quality.scale).toBe(1);
  });

  it('discards hidden/transition gaps and does not degrade at the 33 ms gate', () => {
    const quality = new QualityGovernor();
    for (let i = 0; i < 200; i++) quality.observe(33);
    expect(quality.scale).toBe(1);
    quality.observe(5000);
    quality.observe(Number.NaN);
    for (let i = 0; i < 40; i++) quality.observe(40);
    quality.resetWindow();
    for (let i = 0; i < 40; i++) quality.observe(40);
    expect(quality.scale).toBe(1);
  });
});

describe('recording quality pin (R59)', () => {
  it.each([false, true])('holds native scale through slow frames (scripted=%s)', (scripted) => {
    vi.stubGlobal('window', { location: { search: '?encounter=gravity-range&quality=full' } });
    vi.stubGlobal('document', { hidden: false });
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    // Start with a reduced composer to verify that the pin explicitly restores native DPR.
    let pixelRatio = 1.4;
    const composer = {
      setPixelRatio: vi.fn((ratio: number) => {
        pixelRatio = ratio;
      }),
    };
    const hook = createQualityHook({ getPixelRatio: () => 2 }, composer, scripted);
    for (let i = 0; i < 600; i++) {
      now += 50;
      hook.frame(true, 1, 'flight', i);
      expect(pixelRatio).toBe(2);
    }
    // Console/transitions and warp changes must not release the recording pin.
    hook.frame(false, 1, 'console', 600);
    hook.frame(true, 2000, 'ship', 601);
    now += 50;
    hook.frame(true, 1, 'room', 602);
    expect(composer.setPixelRatio).toHaveBeenCalledTimes(1);
    expect(composer.setPixelRatio).toHaveBeenCalledWith(2);
    hook.dispose();
  });

  it.each(['', '?quality=auto', '?quality=fuller'])(
    'keeps adaptive rendering without the explicit full pin (%s)',
    (search) => {
      vi.stubGlobal('window', { location: { search } });
      vi.stubGlobal('document', { hidden: false });
      let now = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => now);
      const composer = { setPixelRatio: vi.fn() };
      const hook = createQualityHook({ getPixelRatio: () => 2 }, composer);
      for (let i = 0; i < 100; i++) {
        now += 50;
        hook.frame(true, 1, 'flight', i);
      }
      expect(composer.setPixelRatio.mock.calls).toEqual([[1.7], [1.4]]);
      hook.dispose();
    },
  );
});
