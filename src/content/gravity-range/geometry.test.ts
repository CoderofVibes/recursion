/**
 * The catalogue of arrival geometries (A10, A18 (4)) against S8's rejection rules
 * (`docs/studies/s8/seeds.md` § Generator rejection rules), and runs drawing from it. Rule 4
 * (the route and its perturbed controls) is in `s8-vectors.test.ts`; rule 5 (the ring's phase)
 * waits for S21's belt; rule 6 (a wrong-law warning before contact) is S8's wrong-law vector,
 * checked for the reference geometry there.
 */

import { describe, expect, it } from 'vitest';
import type { TruthWorld } from '../../contracts/truth/index.ts';
import { createBlackBox } from '../../game/belief/blackbox.ts';
import { createStandInModel } from '../../game/belief/standin-model.ts';
import { innerNeck, jacobiConstant } from '../../game/jacobi.ts';
import { createGameSession } from '../../game/session.ts';
import { encounterEntry } from '../../game/encounters.ts';
import { hashState } from '../../lib/hash.ts';
import { distance } from '../../lib/vec3.ts';
import { createSimulation } from '../../sim/index.ts';
import { createGravityRange, GEOMETRIES, geometryForRun, LAW, NOMINAL, SEED } from './index.ts';

const nominal = createGravityRange();

describe('the arrival catalogue (S8 rejection rules)', () => {
  it('rule 1: only the arrival changes; law, bodies, sun, ship and rock layout are the reference’s', () => {
    const strip = (w: TruthWorld) => ({
      ...w,
      asteroids: [],
      ship: { ...w.ship, kinematics: null },
    });
    for (const g of GEOMETRIES) {
      const s = createGravityRange(SEED, { geometry: g });
      expect(hashState(strip(s.definition.world)), g.id).toBe(
        hashState(strip(nominal.definition.world)),
      );
      expect(s.definition.ship).toEqual(nominal.definition.ship);
      // Every rock that survives the arrival exclusion is the reference layout's rock.
      const reference = new Map(nominal.definition.world.asteroids.map((a) => [a.id, a]));
      const fromSeed = createGravityRange(SEED, { geometry: g }).definition.world.asteroids;
      for (const rock of fromSeed)
        if (reference.has(rock.id)) expect(rock).toEqual(reference.get(rock.id));
      // The ship arrives 1,000 km from Alpha on a circular orbit at the catalogue's offset.
      const k = s.definition.world.ship.kinematics;
      const alpha = s.definition.world.bodies[0]!;
      expect(distance(k.position, alpha.position)).toBeCloseTo(LAW.referenceRadius, 3);
      const bearing = Math.atan2(k.position.y - alpha.position.y, k.position.x - alpha.position.x);
      const expected = Math.PI + g.offset;
      expect(Math.cos(bearing - expected)).toBeCloseTo(1, 12);
    }
  });

  it(
    'rule 2: nothing within 60 km of each actual arrival, and the first two hours sweep clear',
    { timeout: 120_000 },
    () => {
      for (const g of GEOMETRIES) {
        const world = createGravityRange(SEED, { geometry: g }).definition.world;
        const ship = world.ship.kinematics.position;
        for (const rock of world.asteroids)
          expect(distance(rock.position, ship), `${g.id} ${rock.id}`).toBeGreaterThan(
            60_000 + rock.radius,
          );
        // [ASSUMED] Coasting two hours from arrival (longer than any certificate's wait but the
        // first), the hull stays more than 10 km from every rock and body.
        const sim = createSimulation(world, { dt: 1 });
        const run = sim.run(sim.initial, 2 * 3600, { stopOnImpact: true });
        expect(
          run.events.filter((e) => e.kind === 'impact'),
          g.id,
        ).toEqual([]);
        for (const e of run.events)
          if (e.kind === 'clearance')
            expect(e.distance, `${g.id} ${e.with}`).toBeGreaterThan(10_000);
      }
    },
  );

  it('rule 3: no arrival can drift out of Alpha’s lobe: its Jacobi constant is above the neck', () => {
    for (const g of GEOMETRIES) {
      const world = createGravityRange(SEED, { geometry: g }).definition.world;
      // S8: the minimum over every bearing is 5,769.39, against 5,468.32 at L1.
      expect(jacobiConstant(world)!, g.id).toBeGreaterThan(5_769);
      expect(jacobiConstant(world)!, g.id).toBeGreaterThan(innerNeck(world)! + 300);
    }
  });

  it('the briefing tells each geometry’s own arrival, within its stated error', () => {
    for (const g of GEOMETRIES) {
      const s = createGravityRange(SEED, { geometry: g });
      const w = s.definition.world;
      const alpha = w.bodies[0]!;
      const e = s.definition.briefing.arrivalEstimate;
      const truth = {
        x: w.ship.kinematics.position.x - alpha.position.x,
        y: w.ship.kinematics.position.y - alpha.position.y,
        z: w.ship.kinematics.position.z - alpha.position.z,
      };
      const sigma = Math.sqrt(e.positionCov[0] + e.positionCov[3] + e.positionCov[5]);
      expect(distance(e.position, truth), g.id).toBeLessThan(4 * sigma);
    }
  });
});

describe('runs (A10)', () => {
  it('the first run meets the reference geometry; later runs draw from the catalogue, the same way every time', () => {
    expect(geometryForRun(SEED, 0)).toBe(NOMINAL);
    const drawn = Array.from({ length: 40 }, (_, run) => geometryForRun(SEED, run).id);
    expect(Array.from({ length: 40 }, (_, run) => geometryForRun(SEED, run).id)).toEqual(drawn);
    // Every catalogue geometry turns up within the first forty runs.
    expect(new Set(drawn)).toEqual(new Set(GEOMETRIES.map((g) => g.id)));
  });

  it('each run has its own sensor noise and survey error, so no run repeats a measurement', () => {
    const geometry = NOMINAL;
    const a = createGravityRange(SEED, { run: 0 });
    const b = createGravityRange(SEED, { run: 7, geometry });
    expect(hashState(a.definition.world.ship.systems.rng)).not.toBe(
      hashState(b.definition.world.ship.systems.rng),
    );
    expect(a.definition.briefing.arrivalEstimate.position).not.toEqual(
      b.definition.briefing.arrivalEstimate.position,
    );
    // The same run is the same encounter, bit for bit.
    expect(hashState(createGravityRange(SEED, { run: 3 }).definition)).toBe(
      hashState(createGravityRange(SEED, { run: 3 }).definition),
    );
  });

  it(
    'a session gives each attempt its run’s geometry and records the briefing it was given',
    { timeout: 60_000 },
    () => {
      const entry = encounterEntry('gravity-range');
      const blackBox = createBlackBox();
      const session = createGameSession((run) => entry.create(run), {
        model: createStandInModel({ referenceRadius: LAW.referenceRadius }),
        blackBox,
        now: () => 'now',
      });
      const arrivals: string[] = [];
      for (let i = 0; i < 4; i++) {
        session.stepTicks(120);
        arrivals.push(hashState(session.truth().sim.world.ship.kinematics));
        session.recall();
      }
      const records = blackBox.archive().attempts.filter((r) => r.outcome.kind !== 'in-progress');
      expect(records).toHaveLength(4);
      records.forEach((r, i) => {
        const expected = entry.create(i).definition.briefing;
        expect(r.start.briefing).toEqual(expected);
        expect(r.start.estimate).toEqual(expected.arrivalEstimate);
      });
      // No two attempts recorded the same camera fix.
      const firstFix = records.map((r) => r.measurements.find((m) => m.kind === 'bearing')!.value);
      expect(new Set(firstFix.map((v) => v.join(','))).size).toBe(4);
      // The session's briefing follows the attempt in progress.
      expect(session.briefing).toEqual(entry.create(4).definition.briefing);
      expect(arrivals).toHaveLength(4);
    },
  );
});
