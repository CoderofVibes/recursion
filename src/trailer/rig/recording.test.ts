import { describe, expect, it } from 'vitest';
import { replay, type Recording } from './recording.ts';
import captured from '../scenes/slingshot/fixture.json';

describe('recorded optical replay', () => {
  const recording = captured as unknown as Recording;
  it('keeps exact keyframe membership, lit flags and angular sizes, including the last frame', () => {
    const flight = replay(recording);
    for (const sample of recording.frames) {
      const actual = flight.frame(sample.t).snapshot.window!.objects;
      expect(actual.map((object) => object.id)).toEqual(
        sample.o.map((object) => recording.names[object[0]!]![0]),
      );
      actual.forEach((object, i) => {
        expect(object.angularRadius).toBe(sample.o[i]![4]);
        expect(object.lit).toBe(!!sample.o[i]![5]);
      });
    }
  });

  it('can seek backwards between recorded samples without changing an earlier result', () => {
    const flight = replay(recording);
    const at = flight.from + (flight.to - flight.from) * 0.37;
    const before = structuredClone(flight.frame(at));
    flight.frame(flight.to);
    flight.frame(flight.from);
    expect(flight.frame(at)).toEqual(before);
  });
});
