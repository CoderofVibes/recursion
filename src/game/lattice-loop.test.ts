/**
 * The Unseen Cathedral's signature loop on the real ship, recorder and model (A16, brief §6):
 * the Black Box function is switched on with the panel's own commands, the ship records lattice
 * frames, the model rebuilds the lattice from them, and the believed world carries what the
 * model rebuilt to the screens. Truth is never consulted: everything asserted is belief.
 *
 * What the rebuild supports is the model's to say (2C). This checks the path, not the fit: the
 * believed lattice is exactly what the model returns for the frames recorded, it is drawn only
 * when the model supports strands, and nothing is believed with the function off.
 */

import { describe, expect, it } from 'vitest';
import { latticeModeCommands } from '../console/encounters/chain-link/commands.ts';
import { readLatticeVisual } from '../view3d/fields/lattice/data.ts';
import { createModelClient } from '../model/index.ts';
import { createBlackBox } from './belief/blackbox.ts';
import { createModelBridge } from './belief/model-bridge.ts';
import { encounterEntry } from './encounters.ts';
import { createGameSession } from './session.ts';

const FRAGMENTS = 'lattice.angular-fragments.v2';

describe('the Chain Link with the real model', () => {
  it(
    'carries the lattice the model rebuilds from the Black Box function’s frames to the screens',
    { timeout: 300_000 },
    async () => {
      const setup = encounterEntry('chain-link').create(0);
      // The bridge's clock is the test's, so hand-overs fall once a second of flight on any machine.
      let ms = 0;
      const client = createModelClient({ worker: false });
      const model = createModelBridge(client, {
        referenceRadius: setup.definition.briefing.referenceRadius ?? 1e6,
        clock: () => ms,
      });
      const blackBox = createBlackBox();
      const s = createGameSession(setup, {
        model,
        blackBox,
        rules: model.rules,
        now: () => 'test',
      });
      /** Fly `seconds` of ship time (the Cathedral steps a tenth of a second). */
      const fly = async (seconds: number) => {
        for (let i = 0; i < seconds; i++) {
          s.stepTicks(10);
          ms += 1000;
        }
        await model.settled();
      };
      const frames = () =>
        blackBox
          .attempt(s.status().attemptId)!
          .measurements.filter((m) => m.kind === 'field-signal' && m.channel === FRAGMENTS);

      // The function off: no frames are recorded and the ship believes no lattice.
      await fly(20);
      expect(frames()).toHaveLength(0);
      expect(s.snapshot().world.fields).toEqual([]);

      // Switched on from the panel: frames are recorded, and the believed world carries the
      // model's rebuild of them, for this attempt, with the function's own service report.
      for (const c of latticeModeCommands('survey')) s.command(c);
      await fly(70);
      const recorded = frames();
      expect(recorded.length).toBeGreaterThan(3);
      const fields = s.snapshot().world.fields;
      expect(fields).toHaveLength(1);
      const believed = fields[0]!;
      expect(believed.kind).toBe('lattice');
      const visual = readLatticeVisual(believed.visual);
      expect(visual).not.toBeNull();
      expect(visual!.attemptId).toBe(s.status().attemptId);
      expect(visual!.enabled).toBe(true);
      expect(visual!.processing?.available).toBe(true);
      // Exactly what the model returns for the frames recorded: the bridge adds and removes nothing.
      const latest = Math.max(...recorded.map((m) => m.t));
      expect(fields).toEqual(await client.lattice(s.status().attemptId, latest));
      // FLIGHT draws a believed field only once it is detected: only strands the model supports.
      expect(believed.detected).toBe(visual!.strands.length > 0);

      // Recurrence: the next attempt believes no lattice until it records its own frames.
      s.recall();
      await model.settled();
      expect(s.snapshot().world.fields).toEqual([]);
    },
  );
});
