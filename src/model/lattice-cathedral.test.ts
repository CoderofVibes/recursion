/**
 * R46: the Cathedral is threadable. A judge records at Thread for a few minutes and FLIGHT shows
 * strands the model supports, true to the lattice.
 *
 * NIGHT found the rebuild supported nothing on the twenty-fence lattice: 18,999 tracks from
 * 19,296 fragments, 0 of 2,952 fitted features supported. 3C's sensor rasters 96 of several
 * hundred candidate fragments per frame, so a node returns only every several frames, moved by
 * parallax, along an epipolar line where its strand neighbours also lie; linking each frame to
 * the last made nearly every return a new track. The model now links sightings by voting on
 * depth (`associate` in reconstruct.ts). No gate was lowered: the fit, its held-out test and the
 * strands' rules are unchanged.
 *
 * Real game, ship, recorder and model; the believed field is exactly what FLIGHT is handed.
 * Truth (the layout's strands) is used only to judge.
 */

import { describe, expect, it } from 'vitest';
import { latticeModeCommands } from '../console/encounters/chain-link/commands.ts';
import type { ChainLinkSetup } from '../content/chain-link/index.ts';
import type { Vec3 } from '../contracts/index.ts';
import { createBlackBox } from '../game/belief/blackbox.ts';
import { createModelBridge } from '../game/belief/model-bridge.ts';
import { encounterEntry } from '../game/encounters.ts';
import { createGameSession } from '../game/session.ts';
import { readLatticeVisual } from '../view3d/fields/lattice/data.ts';
import { createModelClient } from './index.ts';

const FRAGMENTS = 'lattice.angular-fragments.v2';

/** Distance from p to the segment a–b, m. */
function toSegment(p: Vec3, a: Vec3, b: Vec3): number {
  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const ap = { x: p.x - a.x, y: p.y - a.y, z: p.z - a.z };
  const L = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z;
  const u = Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y + ap.z * ab.z) / L));
  return Math.hypot(a.x + u * ab.x - p.x, a.y + u * ab.y - p.y, a.z + u * ab.z - p.z);
}

describe('the Cathedral threaded (R46)', () => {
  it(
    'three minutes at Thread: supported strands in FLIGHT, every edge along a true strand',
    { timeout: 300_000 },
    async () => {
      // Run 1: an arrival survey off by under 1.5σ on each axis. (Run 0's is off 2.7σ in one
      // velocity axis; every rebuilt point shares that drift, as its covariance says.)
      const setup = encounterEntry('chain-link').create(1) as ChainLinkSetup;
      let ms = 0;
      const client = createModelClient({ worker: false });
      const model = createModelBridge(client, {
        referenceRadius: setup.definition.briefing.referenceRadius ?? 1e6,
        clock: () => ms,
      });
      const blackBox = createBlackBox();
      const s = createGameSession(setup, { model, blackBox, rules: model.rules, now: () => 'test' });
      try {
        const fly = (seconds: number) => {
          for (let i = 0; i < seconds; i++) {
            s.stepTicks(10);
            ms += 1000;
          }
        };
        fly(20);
        for (const c of latticeModeCommands('thread')) s.command(c);
        fly(180);
        await model.settled();
        const frames = blackBox
          .attempt(s.status().attemptId)!
          .measurements.filter((m) => m.kind === 'field-signal' && m.channel === FRAGMENTS);
        expect(frames.length).toBeGreaterThan(250);
        const latest = Math.max(...frames.map((m) => m.t));
        const fields = await client.lattice(s.status().attemptId, latest);
        expect(fields).toHaveLength(1);
        const field = fields[0]!;
        // FLIGHT draws a believed field once it is detected: supported strands.
        expect(field.detected).toBe(true);
        const visual = readLatticeVisual(field.visual)!;
        expect(visual).not.toBeNull();
        // Before: none. Now some forty strands of supported features.
        expect(visual.strands.length).toBeGreaterThanOrEqual(25);
        const drawn = visual.strands.reduce((acc, st) => acc + st.points.length, 0);
        expect(drawn).toBeGreaterThanOrEqual(150);

        // Judged against truth: each drawn edge lies along one true strand, within 3σ of its
        // ends' stated uncertainty (a strand turns only at a sheet's corner, where two meet).
        const segs = setup.layout.layers.flatMap((l) => l.strands);
        let off = 0;
        let edges = 0;
        for (const st of visual.strands)
          for (let i = 1; i < st.points.length; i++) {
            edges++;
            const a = st.points[i - 1]!;
            const b = st.points[i]!;
            const along = segs.some(
              (sg) =>
                toSegment(a, sg.a, sg.b) <= 3 * st.sigmaM && toSegment(b, sg.a, sg.b) <= 3 * st.sigmaM,
            );
            if (!along) off++;
          }
        expect(edges).toBeGreaterThan(100);
        expect(off).toBe(0);
      } finally {
        client.terminate();
      }
    },
  );
});
