import { LineSegments, Mesh, Raycaster, Vector3 } from 'three';
import type { Object3D } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadShipDefinition } from '../../ship/index.ts';
import { holoWire } from '../../theme/index.ts';
import { shipWire } from '../../theme/three/ship-holo.ts';
import { makeShipHolo } from './ShipHolo.ts';
import { CONFIGS, P, drawShip, makeShipModel } from './model.ts';
import { SHIP_EXTENT, SYSTEMS, buildParts } from './parts.ts';
import { W } from './wire.ts';

const definition = loadShipDefinition();

describe('wire kit', () => {
  it('counts segments shape by shape', () => {
    expect(W().seg([0, 0, 0], [1, 0, 0]).segments).toBe(1);
    expect(
      W().poly([
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
      ]).segments,
    ).toBe(2);
    expect(
      W().poly(
        [
          [0, 0, 0],
          [1, 0, 0],
          [1, 1, 0],
        ],
        true,
      ).segments,
    ).toBe(3);
    expect(W().box([0, 0, 0], [1, 2, 3]).segments).toBe(12);
    expect(W().ring([0, 0, 0], 1, 'x', 24).segments).toBe(24);
    // Two rings of 14 and six meridians of one span each.
    expect(W().cyl([0, 0, 0], 'x', 1, 0.5, { mer: 6, n: 14 }).segments).toBe(2 * 14 + 6);
    // A partial surface closes with one more meridian; a zero-radius station draws no ring.
    expect(W().cone([0, 0, 0], 'z', 1, 0, 1, { mer: 4, n: 8, a0: 0, a1: Math.PI }).segments).toBe(
      8 + 5,
    );
    expect(W().cyl([0, 0, 0], 'y', 1, 1, { mer: 4, n: 8, rings: false }).segments).toBe(4);
    expect(W().grid([0, 0, 0], [1, 0, 0], [0, 1, 0], 3, 2).segments).toBe(4 + 3);
    expect(W().disc([0, 0, 0], 1, 'x', 8, 2).segments).toBe(2 * 28 + 8);
    expect(W().slices([0, 0, 0], [1, 2, 3], 1, 4).segments).toBe(3 * 4);
    expect(W().sphere([0, 0, 0], 1).segments).toBe(9 * 20 + 8 * 8);
    expect(W().capsule([0, 0, 0], 'x', 3, 0.5).segments).toBe(11 * 24 + 8 * 11);
  });

  it('draws a ring at its radius, in the plane across its axis', () => {
    const c = [1, 2, 3] as const;
    const s = W().ring(c, 0.5, [0, 0, 2], 12).s;
    for (let i = 0; i < s.length; i += 3) {
      expect(s[i + 2]).toBeCloseTo(c[2], 12);
      expect(Math.hypot(s[i]! - c[0], s[i + 1]! - c[1])).toBeCloseTo(0.5, 12);
    }
  });

  it('mirrors, merges and maps the body frame to three: (x, y, z) → (-y, z, -x)', () => {
    const w = W().seg([1, 2, 3], [4, 5, 6]);
    expect(Array.from(w.toThree())).toEqual([-2, 3, -1, -5, 6, -4]);
    expect(w.mirrored().s).toEqual([1, -2, 3, 4, -5, 6]);
    expect(W().merge(w).merge(w.mirrored()).segments).toBe(2);
    expect(P(1, 2, 3).toArray()).toEqual([-2, 3, -1]);
  });
});

describe('ship parts', () => {
  const parts = buildParts();
  const systems = new Set<string>(SYSTEMS.map((s) => s.id));

  it('gives every part a unique id and a system from SYSTEMS', () => {
    expect(new Set(parts.map((p) => p.id)).size).toBe(parts.length);
    for (const p of parts) expect(systems.has(p.sys), p.id).toBe(true);
    for (const s of SYSTEMS)
      expect(
        parts.some((p) => p.sys === s.id),
        s.id,
      ).toBe(true);
  });

  it('has one part for every piece of equipment in the real definition', () => {
    for (const e of definition.equipment)
      expect(
        parts.filter((p) => p.eq === e.id).map((p) => p.id),
        e.id,
      ).toHaveLength(1);
    // The only drawn assembly the definition does not list is the structure itself, which it
    // carries as `structureMass`.
    const listed = new Set(definition.equipment.map((e) => e.id));
    const unlisted = parts.filter((p) => p.eq !== undefined && !listed.has(p.eq));
    expect(unlisted.map((p) => p.eq)).toEqual(['habitat-structure']);
  });

  it('draws every part: fixed wire, or wings that follow a deployment', () => {
    for (const p of parts) {
      if (p.dyn) {
        expect(p.wire, p.id).toBeUndefined();
        expect(p.follow === 'rad' || p.follow === 'sol', p.id).toBe(true);
        expect(Math.abs(p.side ?? 0), p.id).toBe(1);
        expect(p.span, p.id).toBeGreaterThan(0);
        expect(p.dyn(0, 0).segments, p.id).toBeGreaterThan(0);
        // Run out, a wing gains its cell lines or coolant tubes.
        expect(p.dyn(1, 1).segments, p.id).toBeGreaterThan(p.dyn(0, 0).segments);
      } else {
        expect(p.wire?.segments ?? 0, p.id).toBeGreaterThan(0);
      }
    }
    expect(parts.filter((p) => p.dyn).map((p) => p.id)).toEqual([
      'solar-left',
      'solar-right',
      'radiator-left',
      'radiator-right',
    ]);
  });

  it('keeps the vehicle itself inside SHIP_EXTENT fore and aft', () => {
    for (const p of parts) {
      if (p.net) continue; // the camera's field of view reaches ahead of the ship
      const s = (p.dyn ? p.dyn(1, 1) : p.wire!).s;
      for (let i = 0; i < s.length; i += 3) {
        expect(s[i]!, p.id).toBeLessThanOrEqual(SHIP_EXTENT.fore + 1e-9);
        expect(s[i]!, p.id).toBeGreaterThanOrEqual(SHIP_EXTENT.aft - 1e-9);
      }
    }
  });
});

describe('makeShipModel', () => {
  const lines = (root: Object3D): LineSegments[] =>
    root.children.filter((o): o is LineSegments => o instanceof LineSegments);
  const vertices = (root: Object3D): number =>
    lines(root).reduce((n, l) => n + l.geometry.getAttribute('position').count, 0);

  it('draws every part with detail, and only the outside without', () => {
    const parts = buildParts();
    const full = makeShipModel(definition);
    expect(lines(full.group)).toHaveLength(parts.length);
    // One pick sphere per piece of equipment, none of them rendered.
    const picks = full.group.children.filter((o) => o instanceof Mesh);
    expect(picks).toHaveLength(definition.equipment.length);
    expect(picks.every((o) => !o.visible)).toBe(true);

    const symbol = makeShipModel(definition, { detail: false });
    expect(symbol.group.children).toHaveLength(parts.filter((p) => p.ext).length);
    expect(lines(symbol.group)).toHaveLength(symbol.group.children.length);
    full.dispose();
    symbol.dispose();
  });

  it('starts in the default configuration and eases to another', () => {
    const model = drawShip(definition);
    expect(model.config()).toBe(definition.defaultConfiguration);
    expect(model.deployment).toEqual({ rad: 1, sol: 0 });
    const before = vertices(model.group);

    model.setConfig('no-such-configuration');
    expect(model.config()).toBe(definition.defaultConfiguration);

    model.setConfig('allDeployed');
    model.update(0.5);
    expect(model.deployment.sol).toBeGreaterThan(0);
    expect(model.deployment.sol).toBeLessThan(1);
    let steps = 0;
    while (model.step(0.5) && steps < 20) steps++;
    expect(steps).toBeLessThan(20);
    expect(model.deployment).toEqual({
      rad: CONFIGS.allDeployed.rad,
      sol: CONFIGS.allDeployed.sol,
    });
    expect(model.step(0.5)).toBe(false);
    // Solar wings run out show their cells.
    expect(vertices(model.group)).toBeGreaterThan(before);

    model.setConfig('stowed', true);
    expect(model.deployment).toEqual({ rad: 0, sol: 0 });
    model.dispose();
  });

  it('puts the dry centre of mass where the definition does', () => {
    const model = drawShip(definition);
    const config = definition.configurations.find((c) => c.id === definition.defaultConfiguration)!;
    let m = definition.structureMass;
    let x = m * definition.structureCenterOfMass.x;
    let y = m * definition.structureCenterOfMass.y;
    for (const e of definition.equipment) {
      const p = config.equipmentPositions?.[e.id] ?? e.position;
      m += e.mass;
      x += e.mass * p.x;
      y += e.mass * p.y;
    }
    const com = model.centreOfMassBody();
    expect(com.x).toBeCloseTo(x / m, 9);
    expect(com.y).toBeCloseTo(y / m, 9);
    expect(model.centreOfMass().toArray()).toEqual([-com.y, 0, -com.x]);
    model.setOpacity(holoWire.shipSymbol);
    model.dispose();
  });
});

/** Just enough of an element for a CSS2D tag: text, a class list, a style. */
class FakeElement {
  className = '';
  textContent = '';
  readonly style: Record<string, string> = {};
  readonly parentNode = null;
  readonly ownerDocument = { defaultView: { Element: FakeElement } };
  readonly classes = new Set<string>();
  readonly classList = {
    toggle: (name: string, on: boolean): void => {
      if (on) this.classes.add(name);
      else this.classes.delete(name);
    },
  };
  setAttribute(): void {}
}

describe('makeShipHolo', () => {
  afterEach(() => vi.unstubAllGlobals());
  const make = () => {
    vi.stubGlobal('document', { createElement: () => new FakeElement() });
    return makeShipHolo(definition);
  };
  /** Every tag under a root: its element, and whether it is showing. */
  const tagsOf = (root: Object3D): { el: FakeElement; visible: boolean }[] => {
    const out: { el: FakeElement; visible: boolean }[] = [];
    root.traverse((o) => {
      const el = (o as { element?: unknown }).element;
      if (el instanceof FakeElement) out.push({ el, visible: o.visible });
    });
    return out;
  };
  const tag = (root: Object3D, text: string) => tagsOf(root).find((t) => t.el.textContent === text);
  /** A ray along the ship's axis from astern, where the first thing met is the main engine. */
  const fromAstern = (root: Object3D, spin: Object3D): Raycaster => {
    root.updateMatrixWorld(true);
    const from = spin.localToWorld(P(-30, 0.08, 0));
    const to = spin.localToWorld(P(-7.3, 0.08, 0));
    return new Raycaster(from, to.sub(from).normalize());
  };

  it('lists the systems and the equipment each one holds', () => {
    const holo = make();
    expect(holo.systems.map((s) => s.id)).toEqual(SYSTEMS.map((s) => s.id));
    const parts = holo.parts();
    expect(parts.map((p) => p.id).sort()).toEqual(definition.equipment.map((e) => e.id).sort());
    expect(holo.parts()).toBe(parts);
    const systems = new Set(holo.systems.map((s) => s.id));
    for (const p of parts) expect(systems.has(p.system), p.id).toBe(true);
    expect(parts.find((p) => p.id === 'main-engine')).toEqual({
      id: 'main-engine',
      system: 'propulsion',
      name: 'MAIN ENGINE',
    });
    holo.dispose();
  });

  it('opens in the overview, calling out the major items and the marks', () => {
    const holo = make();
    expect(holo.system()).toBeNull();
    expect(holo.selected()).toBeNull();
    expect(holo.config()).toBe(definition.defaultConfiguration);
    expect(holo.deployment()).toEqual({ radiators: 1, solar: 0 });
    // The engine's rating is the definition's; the Black Box is orange.
    expect(tag(holo.group, 'MAIN ENGINE  24 kN')).toMatchObject({ visible: true });
    expect(tag(holo.group, 'BLACK BOX')?.el.className).toBe('rx-tag call bbx');
    expect(tag(holo.group, 'FUEL CELL A')).toMatchObject({ visible: false });
    expect(tag(holo.group, 'FOOTPRINT 16 × 20 m')?.el.className).toBe('rx-tag dim');
    expect(tag(holo.group, 'THRUST ARM 8 cm')?.el.className).toBe('rx-tag thr');
    const com = holo.centreOfMass();
    expect(tag(holo.group, `CoM  +${com.x.toFixed(2)} m  DRY`)).toBeDefined();
    holo.dispose();
  });

  it('isolates a system, clears a selection that is not in it, and tells its listeners', () => {
    const holo = make();
    const heard = vi.fn();
    const stop = holo.onChange(heard);

    holo.select('black-box');
    expect(holo.selected()).toBe('black-box');
    expect(holo.system()).toBe('data');
    expect(tag(holo.group, 'BLACK BOX')?.el.classes.has('sel')).toBe(true);
    expect(tag(holo.group, 'RECORD CHANNELS')).toMatchObject({ visible: true });
    expect(heard).toHaveBeenCalledTimes(1);

    holo.select('black-box');
    holo.hover('comms');
    expect(tag(holo.group, 'HIGH-GAIN ANTENNA')).toMatchObject({ visible: true });
    holo.hover(null);
    expect(heard).toHaveBeenCalledTimes(1);

    holo.setSystem('power');
    expect(holo.system()).toBe('power');
    expect(holo.selected()).toBeNull();
    expect(tag(holo.group, 'BLACK BOX')).toMatchObject({ visible: false });
    expect(tag(holo.group, 'FUEL CELL A')).toMatchObject({ visible: true });
    expect(heard).toHaveBeenCalledTimes(2);

    // Choosing a part of another system moves the view to that system.
    holo.select('camera');
    expect(holo.system()).toBe('guidance');
    holo.select('no-such-equipment');
    expect(holo.selected()).toBeNull();
    holo.setSystem('no-such-system');
    expect(holo.system()).toBeNull();
    expect(heard).toHaveBeenCalledTimes(5);

    stop();
    holo.setSystem('thermal');
    expect(heard).toHaveBeenCalledTimes(5);
    holo.dispose();
  });

  it('ghosts the hull behind an isolated system and hides the rest', () => {
    const holo = make();
    const opacityOf = (text: string): number[] => {
      // The model group holds one wire per part, in drawing order, ahead of anything else.
      const model = holo.spin.children[0]!;
      const drawn = model.children.filter((o): o is LineSegments => o instanceof LineSegments);
      const index = buildParts().findIndex((p) => p.name === text);
      const line = drawn[index]!;
      const material = Array.isArray(line.material) ? line.material[0]! : line.material;
      return [line.visible ? 1 : 0, material.opacity];
    };
    expect(opacityOf('PRESSURE HULL')).toEqual([1, shipWire.overviewHull]);
    expect(opacityOf('BLACK BOX')).toEqual([1, shipWire.overviewBlackBox]);
    expect(opacityOf('RECORD CHANNELS')[0]).toBe(0);

    holo.setSystem('data');
    expect(opacityOf('PRESSURE HULL')).toEqual([1, shipWire.ghost]);
    expect(opacityOf('BLACK BOX')).toEqual([1, shipWire.isolatedPart]);
    expect(opacityOf('RECORD CHANNELS')).toEqual([1, shipWire.isolatedNetwork]);
    expect(opacityOf('MAIN PROPELLANT TANK')[0]).toBe(0);

    holo.select('comms');
    expect(opacityOf('HIGH-GAIN ANTENNA')).toEqual([1, shipWire.hot]);
    expect(opacityOf('BLACK BOX')).toEqual([1, shipWire.isolatedBeside]);
    holo.dispose();
  });

  it('picks equipment under a ray, and only from the isolated system', () => {
    const holo = make();
    holo.snap();
    expect(holo.pick(fromAstern(holo.group, holo.spin))).toBe('main-engine');
    expect(holo.pick(new Raycaster(new Vector3(0, 50, 0), new Vector3(0, 1, 0)))).toBeNull();
    holo.setSystem('power');
    expect(holo.pick(fromAstern(holo.group, holo.spin))).toBeNull();
    holo.dispose();
  });

  it('frames an isolated system and comes back to the whole vehicle', () => {
    const holo = make();
    holo.snap();
    const whole = holo.spin.scale.x;
    holo.setSystem('data');
    holo.update(0.1);
    expect(holo.spin.scale.x).toBeGreaterThan(whole);
    holo.snap();
    const framed = holo.spin.scale.x;
    expect(framed).toBeGreaterThan(whole);
    holo.update(1);
    expect(holo.spin.scale.x).toBeCloseTo(framed, 12);
    holo.setSystem(null);
    holo.snap();
    expect(holo.spin.scale.x).toBeCloseTo(whole, 12);
    holo.dispose();
  });

  it('runs the wings out, telling its listeners at the start and when they stop', () => {
    const holo = make();
    const heard = vi.fn();
    holo.onChange(heard);
    holo.setConfig('allDeployed');
    expect(holo.config()).toBe('allDeployed');
    expect(heard).toHaveBeenCalledTimes(1);
    holo.update(0.5);
    expect(holo.deployment().solar).toBeGreaterThan(0);
    expect(holo.deployment().solar).toBeLessThan(1);
    expect(heard).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 20; i++) holo.update(0.5);
    expect(holo.deployment()).toEqual({ radiators: 1, solar: 1 });
    expect(heard).toHaveBeenCalledTimes(2);
    expect(tag(holo.group, 'FOOTPRINT 16 × 24 m')).toMatchObject({ visible: true });

    holo.setConfig('stowed');
    holo.snap();
    expect(holo.deployment()).toEqual({ radiators: 0, solar: 0 });
    expect(heard).toHaveBeenCalledTimes(4);
    holo.setConfig('no-such-configuration');
    expect(holo.config()).toBe('stowed');
    expect(heard).toHaveBeenCalledTimes(4);
    holo.setResolution(1280, 720);
    holo.setPixelsPerUnit(900);
    holo.dispose();
  });
});
