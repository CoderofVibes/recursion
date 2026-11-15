import { describe, expect, it } from 'vitest';
import reference from './s16-reference.json';
import { createInverseWells, INVERSE_WELLS_ENTRY } from './index.ts';
import { certifyArrival, s16Layout, seededS16Layout, S16_CATALOGUE_SEEDS } from './s16-layout.ts';
import { fromMatrix, rotate } from '../../lib/quat.ts';
import { validateWellSpecs } from '../../sim/fields/wells.ts';
import type { Vec3 } from '../../lib/vec3.ts';

const vec = (v: readonly number[]): Vec3 => ({ x: v[0]!, y: v[1]!, z: v[2]! });

describe('committed S16 layout and scope of admission', () => {
  it('reproduces all 128 arrival bounds without treating route success as admission', () => {
    expect(S16_CATALOGUE_SEEDS).toHaveLength(25);
    let certificateRejections = 0;
    for (const candidate of reference.seedAudit.candidates) {
      const certificate = certifyArrival(
        vec(candidate.initial.position_m),
        vec(candidate.initial.velocity_m_s),
      );
      expect(certificate.maximumRadius).toBeCloseTo(
        candidate.certificate.maximum_possible_radius_m,
        7,
      );
      expect(certificate.certified).toBe(candidate.certificate.certified);
      if (!certificate.certified) certificateRejections++;
      expect(S16_CATALOGUE_SEEDS.includes(candidate.seed)).toBe(candidate.admitted);
    }
    expect(certificateRejections).toBe(99);
    expect(reference.seedAudit.first_failure_counts['two-route-neighborhood']).toBe(4);
    expect(() => s16Layout(16000)).toThrow(/not in/);
  });

  it('ports every admitted frame and creates no attractive background source', () => {
    for (const seed of S16_CATALOGUE_SEEDS) {
      const layout = s16Layout(seed);
      const setup = createInverseWells(`s16-${seed}`, { layout });
      expect(layout.arrivalCertificate.certified).toBe(true);
      expect(setup.definition.world.bodies.every((body) => body.gm === 0)).toBe(true);
      expect(setup.definition.briefing.knownBodies.map((body) => body.id)).toEqual([
        'garden-a-core',
      ]);
      validateWellSpecs(setup.definition.world.fields, 1);
      const entry = reference.seedAudit.candidates.find((item) => item.seed === seed)!;
      const q = fromMatrix(entry.garden_to_encounter_rotation.flat());
      expect(layout.entrances.power.position).toEqual(rotate(q, vec(entry.initial.position_m)));
      expect(layout.sun.direction).toEqual({ x: 0, y: 0, z: 1 });
    }
  });

  it('keeps the exit a rotated outward disc and requires real cross-transfer arrivals', () => {
    const nominal = s16Layout();
    expect(nominal.exits[0]).toMatchObject({
      center: { x: 330_000, y: 0, z: 0 },
      radius: 130_000,
      outwardNormal: { x: 1, y: 0, z: 0 },
    });
    expect(() =>
      createInverseWells('cross', { layout: nominal, entrance: 'cross-transfer' }),
    ).toThrow(/actual surviving ship/);
    expect(certifyArrival({ x: -100_000, y: 0, z: 0 }, { x: 35, y: 0, z: 0 }).certified).toBe(
      false,
    );
  });

  it('selects repeatable independent catalogue entries and never puts the catalogue in briefing', () => {
    expect(seededS16Layout('run-1')).toEqual(seededS16Layout('run-1'));
    const selected = new Set(
      Array.from({ length: 100 }, (_, i) => seededS16Layout(`run-${i}`).catalogueSeed),
    );
    expect(selected.size).toBeGreaterThan(20);
    const setup = createInverseWells('run-1', { layout: seededS16Layout('run-1') });
    expect(JSON.stringify(setup.definition.briefing)).not.toMatch(
      /certificate|centers_m|innerRadius|outerRadius|catalogue/,
    );
    expect(INVERSE_WELLS_ENTRY.create(0).definition).toEqual(
      INVERSE_WELLS_ENTRY.create(0).definition,
    );
    expect(INVERSE_WELLS_ENTRY.create(1).definition.seed).not.toBe(
      INVERSE_WELLS_ENTRY.create(0).definition.seed,
    );
    expect(() => INVERSE_WELLS_ENTRY.create(-1)).toThrow(/nonnegative/);
  });
});
