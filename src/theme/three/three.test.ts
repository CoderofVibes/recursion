import { Color, Vector2, Vector3, Vector4 } from 'three';
import { describe, expect, it } from 'vitest';
import { colour, hex, opacity, render } from '../index.ts';
import {
  bodyMaterial,
  envelopeGeometry,
  envelopeMaterial,
  envelopeStyle,
  ghostWireMaterial,
  holoPlaneMaterial,
  latticeMaterial,
  LineKit,
  lineMaterial,
  lineStyles,
  MAX_EARLIER,
  MAX_SECTORS,
  pixelsPerUnit,
  planeMaterial,
  planeStyle,
  rockMaterial,
  setHoloPlane,
  setPlaneCoverage,
  setSun,
  wellColour,
  wireMaterial,
} from './index.ts';

describe('line materials', () => {
  it('carry a style: the forecast is dotted and teal, the trail solid ink', () => {
    const fc = lineMaterial(lineStyles.forecast);
    expect(fc.dashed).toBe(true);
    const [dashPx, gapPx] = lineStyles.forecast.dash ?? [];
    expect(dashPx).toBeGreaterThan(0);
    expect(fc.dashSize).toBe(dashPx);
    expect(fc.gapSize).toBe(gapPx);
    expect(fc.linewidth).toBe(lineStyles.forecast.width);
    expect(fc.color.getHex()).toBe(new Color(hex(colour.forecast)).getHex());
    const trail = lineMaterial(lineStyles.trail);
    expect(trail.dashed).toBe(false);
    expect(trail.color.getHex()).toBe(new Color(hex(colour.measured)).getHex());
  });

  it('pixelsPerUnit follows the camera', () => {
    expect(pixelsPerUnit(90, 1, 2)).toBeCloseTo(1);
    expect(pixelsPerUnit(90, 2, 2)).toBeCloseTo(0.5);
    expect(pixelsPerUnit(60, 10, 900)).toBeCloseTo(900 / (20 * Math.tan(Math.PI / 6)));
  });

  it('the kit makes one material per style and keeps them all in step', () => {
    const kit = new LineKit();
    const a = kit.get('forecast');
    expect(kit.get('forecast')).toBe(a);
    kit.setResolution(1600, 900);
    kit.setPixelsPerUnit(4);
    const b = kit.get('trail');
    for (const m of [a, b]) {
      expect(m.resolution.x).toBe(1600);
      expect(m.resolution.y).toBe(900);
      expect(m.dashScale).toBe(4);
    }
    kit.dispose();
    expect(kit.get('forecast')).not.toBe(a);
  });

  it('wireframes use the token opacity and the role colour', () => {
    expect(wireMaterial().opacity).toBe(opacity.wire);
    expect(wireMaterial('blackbox', 0.5).opacity).toBe(opacity.wire * 0.5);
    expect(wireMaterial('blackbox').color.getHex()).toBe(new Color(hex(colour.blackbox)).getHex());
    expect(ghostWireMaterial().opacity).toBe(opacity.wireGhost);
  });
});

describe('forecast envelope', () => {
  const stations = [
    { position: [0, 0, 0], halfWidth: 1 },
    { position: [10, 0, 0], halfWidth: 2, extrapolating: true },
    { position: [20, 0, 0], halfWidth: 4, extrapolating: true, validated: true },
  ] as const;

  it('builds a ribbon that widens across the path, in the flight plane', () => {
    const g = envelopeGeometry(stations);
    const p = g.getAttribute('position');
    expect(p.count).toBe(6);
    expect(g.getIndex()?.count).toBe(12);
    // Path along +x with up = +y: the ribbon spreads along z, by the half-width, and stays level.
    expect(p.getX(0)).toBeCloseTo(0);
    expect(Math.abs(p.getZ(0))).toBeCloseTo(1);
    expect(p.getZ(0)).toBeCloseTo(-p.getZ(1));
    expect(Math.abs(p.getZ(4))).toBeCloseTo(4);
    for (let i = 0; i < 6; i++) expect(p.getY(i)).toBeCloseTo(0);
    expect(Array.from(g.getAttribute('aAcross').array)).toEqual([1, -1, 1, -1, 1, -1]);
    expect(Array.from(g.getAttribute('aKind').array)).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it('shades sampled, extrapolated and validated stretches from the tokens', () => {
    const m = envelopeMaterial({ hatchScale: 3 });
    expect(m.uniforms.uBody?.value).toEqual([
      envelopeStyle.body,
      envelopeStyle.extrapolatedBody,
      envelopeStyle.validatedBody,
    ]);
    expect(m.uniforms.uHatch?.value[0]).toBe(0);
    expect(m.uniforms.uHatchScale?.value).toBe(3);
    // Validated sits between sampled and extrapolated.
    expect(envelopeStyle.validatedBody).toBeLessThan(envelopeStyle.body);
    expect(envelopeStyle.validatedBody).toBeGreaterThan(envelopeStyle.extrapolatedBody);
  });
});

describe('flight plane', () => {
  it('takes its grid and colours from the theme', () => {
    const m = planeMaterial();
    expect(m.uniforms.uMinor?.value).toBe(planeStyle.minorSpacing);
    expect(m.uniforms.uMajor?.value).toBe(planeStyle.majorSpacing);
    expect((m.uniforms.cCoverage?.value as Color).getHex()).toBe(
      new Color(hex(colour.coverage)).getHex(),
    );
    expect(planeMaterial({ minorSpacing: 1000 }).uniforms.uMinor?.value).toBe(1000);
  });

  it('accepts the ship position and sensor sectors, up to its limit', () => {
    const m = planeMaterial();
    const many = Array.from({ length: MAX_SECTORS + 3 }, (_, i) => ({
      center: i,
      halfWidth: 0.1 + i * 0.01,
      range: 100,
      quality: 0.5,
    }));
    setPlaneCoverage(m, [12, -7], many);
    expect((m.uniforms.uShip?.value as Vector2).toArray()).toEqual([12, -7]);
    expect(m.uniforms.uSectorCount?.value).toBe(MAX_SECTORS);
    // Widest sectors are the ones kept.
    const first = (m.uniforms.uSectors?.value as Vector4[])[0];
    expect(first?.y).toBeCloseTo(0.1 + (MAX_SECTORS + 2) * 0.01);
    setPlaneCoverage(m, [0, 0], []);
    expect(m.uniforms.uSectorCount?.value).toBe(0);
  });

  it('in the hologram, also takes what was sensed earlier, freshest first, up to its limit', () => {
    const m = holoPlaneMaterial(0.5);
    const earlier = Array.from({ length: MAX_EARLIER + 4 }, (_, i) => ({
      center: i,
      halfWidth: 0.5,
      range: 6e6,
      dx: -1000 * i,
      dy: 250,
      fresh: 1 - i / (MAX_EARLIER + 4),
    }));
    setHoloPlane(m, [1e6, 2e6], 1e-7, 5e5, [], earlier);
    expect(m.uniforms.uEarlierCount?.value).toBe(MAX_EARLIER);
    const [first] = m.uniforms.uEarlier?.value as Vector4[];
    expect(first?.toArray()).toEqual([0, 0.5, 6e6, 1]);
    expect((m.uniforms.uEarlierAt?.value as Vector2[])[3]?.toArray()).toEqual([-3000, 250]);
    setHoloPlane(m, [1e6, 2e6], 1e-7, 5e5, []);
    expect(m.uniforms.uEarlierCount?.value).toBe(0);
    expect(m.fragmentShader).toContain('uEarlier');
  });
});

describe('bodies, rocks and fields', () => {
  it('bodies and rocks face the sun they are given', () => {
    const body = bodyMaterial();
    const key = new Vector3(...render.keyLight).normalize();
    expect((body.uniforms.uSun?.value as Vector3).distanceTo(key)).toBeCloseTo(0);
    setSun(body, [0, 0, 5]);
    expect((body.uniforms.uSun?.value as Vector3).toArray()).toEqual([0, 0, 1]);
    expect(rockMaterial().uniforms.uEmissive?.value).toBe(0);
    expect(rockMaterial({ emissive: 0.25 }).uniforms.uEmissive?.value).toBe(0.25);
  });

  it('the lattice reads its strand width and gain from the theme', () => {
    const m = latticeMaterial({ quality: 0.2 });
    expect(m.uniforms.uStrand?.value).toBe(render.lattice.strandWidth);
    expect(m.uniforms.uQuality?.value).toBe(0.2);
    expect((m.uniforms.cStrand?.value as Color).getHex()).toBe(
      new Color(hex(colour.lattice)).getHex(),
    );
  });

  it('a well dims as it descends', () => {
    const mouth = wellColour(0);
    const throat = wellColour(1);
    expect(mouth.getHex()).toBe(new Color(hex(colour.well)).getHex());
    expect(throat.r).toBeLessThan(mouth.r);
    expect(throat.r).toBeCloseTo(mouth.r * (1 - render.well.depthFalloff));
    expect(wellColour(7).r).toBeCloseTo(throat.r);
  });
});
