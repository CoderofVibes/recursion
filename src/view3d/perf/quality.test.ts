import { describe, expect, it } from 'vitest';
import { QualityGovernor } from './quality.ts';

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
