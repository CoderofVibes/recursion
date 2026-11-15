// Pack the dev-build dumps into one compact dataset for the console v2 layout mockups.
//   node pack.mjs <out-file>
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const load = (name) => JSON.parse(readFileSync(join(here, name), 'utf8'));
const A = load('a-preview-v0.json');
const B1 = load('b-flight-d1.json');
const B3 = load('b-flight-d3.json');
const C = load('c-model.json');
const D = load('d-preview-v3.json');

const sig = (v, n = 4) => (Number.isFinite(v) ? Number(v.toPrecision(n)) : v);
const metre = (p) => p.map((v) => Math.round(v));
const BODIES = new Set(A.world.bodies.map((b) => b.id));

function forecast(f) {
  if (!f) return null;
  const burns = (f.plan?.items ?? [])
    .filter((i) => i.command.kind === 'burn')
    .map((i) => ({
      t: (f.plan.epoch ?? f.issuedAt) + i.at,
      duration: sig(i.command.duration, 4),
      throttle: i.command.throttle,
      reference: i.command.attitude?.reference ?? 'axis',
    }));
  return {
    id: f.id,
    issuedAt: f.issuedAt,
    modelVersion: f.modelVersion,
    horizon: f.horizon,
    name: f.plan?.name,
    burns,
    samples: f.samples.map((s) => ({
      t: s.t,
      p: metre(s.p),
      v: s.v.map((x) => sig(x, 5)),
      cov: s.cov.map((x) => sig(x, 4)),
      x: s.x ? 1 : 0,
      val: s.val ? 1 : 0,
    })),
    tracks: f.objects
      .filter((o) => BODIES.has(o.id))
      .map((o) => ({ id: o.id, samples: o.samples.map((s) => ({ t: s.t, p: metre(s.p) })) })),
    closest: f.closestApproaches.map((c) => ({
      id: c.id,
      t: c.t,
      distance: Math.round(c.distance),
      sigma: Math.round(c.sigma),
    })),
    sigma: (f.sigma ?? []).map((s) =>
      Object.fromEntries(Object.entries(s).map(([k, v]) => [k, k === 't' ? v : Math.round(v)])),
    ),
    detail: f.detail,
  };
}

// Thin a trail to about 400 points.
const thin = (trail, n = 400) => {
  const step = Math.max(1, Math.floor(trail.length / n));
  return trail.filter((_, i) => i % step === 0 || i === trail.length - 1).map((p) => ({ t: p.t, p: metre(p.p) }));
};

function flight(B, attemptIndex) {
  const record = C.attempts.find((a) => a.index === attemptIndex);
  const div = record?.divergence?.[0];
  return {
    index: attemptIndex,
    endedAt: B.status.t,
    trail: thin(B.world.trail),
    forecast: forecast(B.world.forecasts[0]),
    divergence: div && {
      firstBeyond3Sigma: div.firstBeyond3Sigma,
      maxSigmas: sig(div.maxSigmas, 4),
      points: div.points.map((p) => ({ t: p.t, deviation: Math.round(p.deviation), sigmas: sig(p.sigmas, 3) })),
    },
    debrief: record?.debrief,
    commands: (record?.commands ?? [])
      .filter((c) => ['burn', 'mode', 'configure', 'point', 'power'].includes(c.command?.kind))
      .slice(0, 40)
      .map((c) => ({ t: c.t, source: c.source, command: c.command })),
    departure: B.status.departure?.[0],
    bodies: B.world.bodies.map((b) => ({ id: b.id, p: metre(b.p) })),
  };
}

const live = B1.world.ship;
const out = {
  note: 'Recorded from the dev build on 2026-11-15 (Twin Deeps, real ship, model and Black Box): a 16 m/s retrograde dive forecast on model v0, two flown dives (9.85 and 5 m/s), the distance law fitted on attempts 1-2 and held out on attempt 3, adopted, and the same 16 m/s plan forecast with the rule.',
  briefing: { id: A.briefing.id, name: A.briefing.name },
  bodies: A.world.bodies.map((b) => ({ id: b.id, name: b.name, radius: b.radius, p: metre(b.p) })),
  asteroids: A.world.asteroids.map((a) => ({ id: a.id, p: metre(a.p), radius: Math.round(a.radius) })),
  objectives: A.world.objectives,
  arrival: {
    ship: { p: metre([A.world.ship.position.x, A.world.ship.position.y, A.world.ship.position.z ?? 0]) },
    departure: A.status.departure?.[0],
    design: A.design,
  },
  ship: {
    equipment: A.shipDef.equipment.map((e) => ({
      id: e.id,
      name: e.name,
      kind: e.kind,
      ratedPower: e.ratedPower,
      bus: e.bus,
      thermalNode: e.thermalNode,
      modes: e.modes.filter((m) => m !== 'reset' && !/^(bank|jet)-/.test(m)),
      power: Object.fromEntries(
        Object.entries(e.params)
          .filter(([k]) => /^mode\..*\.power$/.test(k))
          .map(([k, v]) => [k.slice(5, -6), v]),
      ),
    })),
    buses: A.shipDef.buses,
    thermalNodes: A.shipDef.thermalNodes.map((n) => ({ id: n.id, name: n.name, max: n.max })),
    tanks: A.shipDef.tanks.map((t) => ({ id: t.id, name: t.name, capacity: t.capacity })),
    configurations: A.shipDef.configurations.map((c) => ({ id: c.id, name: c.name })),
    recorder: (({ capacity, bytesPerSample, minimumSampleRate, normalSampleRate, highSampleRate, powerMinimum, powerNormal, powerHigh }) => ({ capacity, bytesPerSample, minimumSampleRate, normalSampleRate, highSampleRate, powerMinimum, powerNormal, powerHigh }))(A.shipDef.systems.recorder),
    mass: live.massProperties.mass,
  },
  live: {
    t: B1.status.t,
    configuration: live.configuration,
    equipment: Object.fromEntries(
      Object.entries(live.equipment).map(([id, s]) => [
        id,
        { mode: s.mode, draw: sig(s.powerDraw, 5), allocation: s.allocation, condition: s.condition, readings: s.readings },
      ]),
    ),
    telemetry: Object.fromEntries(
      Object.entries(live.telemetry)
        .filter(([k]) => /\.(load|generated|discharged|temperature|propellant|bytes|sample-rate)$/.test(k))
        .map(([k, v]) => [k, sig(v.value, 6)]),
    ),
    series: Object.fromEntries(
      Object.entries(B1.series)
        .filter(([k]) => /^(miss|speed|range:|fuel-cell|essential|payload|main-|cabin|service|external|hx|black-box|battery|tank:main|tank:fuel-cell-hydrogen)/.test(k))
        .map(([k, v]) => [k, v.map((x) => sig(x, 5))]),
    ),
  },
  forecasts: { before: forecast(A.preview), after: forecast(D.preview) },
  flights: [flight(B1, 1), flight(B3, 3)],
  model: {
    version: C.model.version,
    basedOn: { attempts: C.model.basedOn.attempts.length, measurements: C.model.basedOn.measurementCount },
    fit: C.model.fit,
    residuals: C.model.residuals,
    parameters: C.model.parameters
      .filter((p) => !p.arc)
      .map((p) => ({ id: p.id, label: p.label, value: sig(p.value, 6), sigma: sig(p.sigma, 3), unit: p.unit, support: sig(p.support, 3), extension: p.extension })),
    extensions: C.model.extensions,
    strength: C.report.strength.map((s) => ({
      body: s.body,
      slope: s.slope,
      points: s.points.map((p) => ({
        attempt: C.attempts.find((a) => a.id === p.attempt)?.index,
        distance: Math.round(p.distance),
        rMin: Math.round(p.rMin),
        rMax: Math.round(p.rMax),
        scale: sig(p.scale, 5),
        sigma: sig(p.scaleSigma, 3),
        converged: p.converged,
        probe: p.probe ?? null,
      })),
    })),
    validated: C.report.validated,
    confounding: C.report.confounding && { confounded: C.report.confounding.confounded, maxAbsRho: sig(C.report.confounding.maxAbsRho, 3) },
    coverage: C.report.coverage,
    test: {
      training: C.test.training.map((id) => C.attempts.find((a) => a.id === id)?.index),
      heldOut: C.attempts.find((a) => a.id === C.test.heldOut)?.index,
      TperNu: sig(C.test.heldOutTest.TperNu, 4),
      threshold: sig(C.test.heldOutTest.threshold, 4),
      pass: C.test.heldOutTest.pass,
      rmsBefore: sig(C.test.state.validation.rmsBefore, 4),
      rmsAfter: sig(C.test.state.validation.rmsAfter, 4),
      fitted: C.test.fitted,
      evidence: C.test.evidence?.evidence,
    },
  },
  attempts: C.attempts.map((a) => ({ index: a.index, outcome: a.outcome.kind, measurements: a.measurements })),
};
// The same report before the law was adopted (a separate run of the same two dives).
const E = load('e-report-before.json');
out.model.before = {
  version: E.model.version,
  fit: E.model.fit,
  residuals: E.model.residuals,
  strength: E.report.strength.map((s) => ({
    body: s.body,
    slope: s.slope,
    points: s.points.map((p) => ({
      attempt: E.attempts.find((a) => a.id === p.attempt)?.index,
      distance: Math.round(p.distance),
      rMin: Math.round(p.rMin),
      rMax: Math.round(p.rMax),
      scale: sig(p.scale, 5),
      sigma: sig(p.scaleSigma, 3),
      converged: p.converged,
      probe: p.probe ?? null,
    })),
  })),
};
const file = process.argv[2];
const text = JSON.stringify(out);
writeFileSync(file, text);
console.log(`${file}: ${(text.length / 1024).toFixed(0)} kB`);
console.log('strength before the rule? points:', out.model.strength[0].points.map((p) => `${p.attempt}:${(p.distance / 1000).toFixed(0)}km×${p.scale}`).join(' '));
console.log('test fitted', JSON.stringify(out.model.test.fitted));
console.log('validated', JSON.stringify(out.model.validated).slice(0, 300));
console.log('a1 div first3σ', out.flights[0].divergence?.firstBeyond3Sigma, 'max', out.flights[0].divergence?.maxSigmas, 'n', out.flights[0].divergence?.points.length);
console.log('a3 div first3σ', out.flights[1].divergence?.firstBeyond3Sigma, 'max', out.flights[1].divergence?.maxSigmas, 'fc v', out.flights[1].forecast?.modelVersion);
console.log('a1 debrief forecasts', JSON.stringify(out.flights[0].debrief?.forecasts));
console.log('a3 changed', JSON.stringify(out.flights[1].debrief?.changed));
