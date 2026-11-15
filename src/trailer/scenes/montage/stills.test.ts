import { describe, expect, it } from 'vitest';
import { MONTAGE } from '../../timeline.ts';

/** Each still as a data URL, so its header can be read without the file system. */
const stills = import.meta.glob<string>('./stills/*.png', {
  eager: true,
  query: '?inline',
  import: 'default',
});

/** A PNG's width and height: big-endian in its header, bytes 16 to 23. */
function size(dataUrl: string): [number, number] {
  const head = atob(dataUrl.slice(dataUrl.indexOf(',') + 1, dataUrl.indexOf(',') + 1 + 32));
  const at = (i: number): number =>
    ((head.charCodeAt(i) << 24) |
      (head.charCodeAt(i + 1) << 16) |
      (head.charCodeAt(i + 2) << 8) |
      head.charCodeAt(i + 3)) >>>
    0;
  return [at(16), at(20)];
}

describe("the montage's stills", () => {
  it('holds one still for each of the eight screens, at the recording size', () => {
    expect(Object.keys(stills).sort()).toEqual(MONTAGE.map((m) => `./stills/${m.shot}.png`).sort());
    // 1536 × 864 CSS pixels at 1.25, the owner's panel.
    for (const [file, url] of Object.entries(stills)) expect(size(url), file).toEqual([1920, 1080]);
  });
});
