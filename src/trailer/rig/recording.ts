/** Recorded optical channels. Interpolation is an edit of the recorded flight, never a new orbit. */
import { Quaternion } from 'three';
import type { ViewSnapshot, WindowView } from '../../contracts/index.ts';
import type { Quat } from '../../lib/quat.ts';
import type { Vec3 } from '../../lib/vec3.ts';
import type { RoomFrame } from '../../view3d/room/RoomView.ts';

interface PackedFrame {
  readonly t: number;
  readonly q: readonly number[];
  readonly p?: readonly number[];
  readonly sun: readonly number[];
  readonly lit: number;
  readonly o: readonly (readonly number[])[];
  readonly c: readonly { readonly id: string; readonly p: readonly (readonly number[])[] }[];
}
export interface Recording {
  readonly format: 'tv-optics-v1';
  readonly names: readonly (readonly [string, 'body' | 'asteroid'])[];
  readonly template: ViewSnapshot;
  readonly frames: readonly PackedFrame[];
}
interface OpticalFrame {
  readonly t: number;
  readonly attitude: Quat;
  readonly position?: Vec3;
  readonly window: WindowView;
}
const vector = (v: readonly number[], at = 0): Vec3 => ({
  x: v[at]!,
  y: v[at + 1]!,
  z: v[at + 2]!,
});
const chart = { regions: [], corridors: [], leads: [] };
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
function ray(a: Vec3, b: Vec3, u: number): Vec3 {
  const x = lerp(a.x, b.x, u),
    y = lerp(a.y, b.y, u),
    z = lerp(a.z, b.z, u);
  const m = Math.hypot(x, y, z);
  return { x: x / m, y: y / m, z: z / m };
}
function decode(recording: Recording, f: PackedFrame): OpticalFrame {
  return {
    t: f.t,
    attitude: { w: f.q[0]!, x: f.q[1]!, y: f.q[2]!, z: f.q[3]! },
    ...(f.p ? { position: vector(f.p) } : {}),
    window: {
      ...(f.sun.length ? { sun: { direction: vector(f.sun), visible: !!f.sun[3] } } : {}),
      sunlit: !!f.lit,
      objects: f.o.map((o) => ({
        id: recording.names[o[0]!]![0],
        kind: recording.names[o[0]!]![1],
        direction: vector(o, 1),
        angularRadius: o[4]!,
        lit: !!o[5],
      })),
      fields: f.c.map((c) => ({
        kind: 'cloud-bank' as const,
        id: c.id,
        patches: c.p.map((p) => ({
          direction: vector(p),
          angularRadius: p[3]!,
          brightness: p[4]!,
        })),
      })),
    },
  };
}

export function replay(recording: Recording) {
  const frames = recording.frames.map((f) => decode(recording, f));
  const first = frames[0]!,
    last = frames.at(-1)!;
  const qa = new Quaternion(),
    qb = new Quaternion();
  return {
    from: first.t,
    to: last.t,
    frame(t: number): RoomFrame {
      let i = 0;
      while (i < frames.length - 1 && frames[i + 1]!.t <= t) i++;
      const a = frames[i]!,
        b = frames[i + 1] ?? a;
      const u = Math.max(0, Math.min(1, (t - a.t) / Math.max(b.t - a.t, Number.EPSILON)));
      const bObjects = new Map(b.window.objects.map((o) => [o.id, o]));
      const q = qa
        .set(a.attitude.x, a.attitude.y, a.attitude.z, a.attitude.w)
        .slerp(qb.set(b.attitude.x, b.attitude.y, b.attitude.z, b.attitude.w), u)
        .normalize();
      const position =
        a.position && b.position
          ? {
              x: lerp(a.position.x, b.position.x, u),
              y: lerp(a.position.y, b.position.y, u),
              z: lerp(a.position.z, b.position.z, u),
            }
          : recording.template.world.ship.position;
      return {
        chart,
        recording: false,
        clearance: 0,
        snapshot: {
          ...recording.template,
          t,
          world: {
            ...recording.template.world,
            ship: {
              ...recording.template.world.ship,
              position,
              attitude: { w: q.w, x: q.x, y: q.y, z: q.z },
            },
          },
          window: {
            ...a.window,
            objects: a.window.objects.map((o) => {
              const next = bObjects.get(o.id);
              return !next
                ? o
                : {
                    ...o,
                    direction: ray(o.direction, next.direction, u),
                    angularRadius: lerp(o.angularRadius, next.angularRadius, u),
                  };
            }),
            fields: a.window.fields?.map((f) => {
              if (f.kind !== 'cloud-bank') return f;
              const next = b.window.fields?.find((other) => other.id === f.id);
              if (next?.kind !== 'cloud-bank' || next.patches.length !== f.patches.length) return f;
              return {
                ...f,
                patches: f.patches.map((p, k) => ({
                  direction: ray(p.direction, next.patches[k]!.direction, u),
                  angularRadius: lerp(p.angularRadius, next.patches[k]!.angularRadius, u),
                  brightness: lerp(p.brightness, next.patches[k]!.brightness, u),
                })),
              };
            }),
          },
        },
      };
    },
  };
}
