"""S1 deterministic two-rigid-body tether reference; SI, Python 3.14 + numpy.

Run: python tools/studies/s1/reference.py
No dependencies beyond numpy, no random draws, no application code imports.
Body quaternion is wxyz, body-to-world. Angular momentum is WORLD-frame.
See docs/studies/s1/tether.md for the deliberately bounded contact model.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass, replace
import hashlib
import json
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
G0 = 9.80665


def cross(a, b):
    return np.array([a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2],
                     a[0]*b[1]-a[1]*b[0]])


def rotation(q):
    w, x, y, z = q / np.linalg.norm(q)
    return np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
                     [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
                     [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])


def qdot(q, omega):
    return .5*np.r_[-np.dot(omega, q[1:]), q[0]*omega+cross(omega, q[1:])]


def baseline():
    data = json.loads((ROOT/'data/ship-baseline.json').read_text())
    parts = []
    app = {a['id']: a for a in data['configuration']['appendages']}
    for p in data['equipment']:
        # Stowed capture configuration; immutable baseline masses retained.
        a = app.get(p['id'])
        pos = a['stowedPosition'] if a else p['position']
        iz = a['stowedInertia'] if a else p['intrinsicInertia']
        parts.append((p['id'], p['mass'], np.r_[pos, 0.], iz))
    for p in data['propellant']+data['reactants']:
        m = p['initialMass']
        parts.append((p['id'], m, np.r_[p['position'], 0.],
                      m*p['intrinsicInertiaPerKg']))
    mass = sum(p[1] for p in parts)
    com = sum(m*p for _, m, p, _ in parts)/mass
    inertia = np.zeros((3, 3))
    for _, m, p, iz in parts:
        r = p-com
        # ASSUMED finite-thickness lift; preserves every supplied Izz.
        inertia += np.diag([.6*iz, .6*iz, iz])+m*(np.dot(r, r)*np.eye(3)-np.outer(r, r))
    return mass, com, inertia, parts


MASS, COM, INERTIA, PARTS = baseline()


@dataclass
class Case:
    name: str
    duration: int = 100
    release: float = 50.
    radial_speed: float = 2.
    tangential_speed: float = 30.
    vertical_speed: float = .5
    length: float = 200.
    k: float = 20000.
    c: float = 15000.
    damper_engagement: float = .5
    limit: float = 200000.
    gm: float = 1.e10
    wrapped: bool = False
    reel_rate: float = 0.
    reel_start: float = 10.
    reel_end: float = 30.


class Model:
    def __init__(self, case):
        self.case = case
        self.m = np.array([MASS, 2.e6])
        self.inertia = [INERTIA, np.diag([1.e12, 1.e12, 2.e12])]
        self.inv = [np.linalg.inv(i) for i in self.inertia]
        self.anchor = [np.array([-4., 0., 0.])-COM,
                       np.array([950., 100., 40.]) if case.wrapped else np.array([1000., 0., 0.])]
        self.tail = np.linalg.norm(self.anchor[1]-[1000., 0., 0.]) if case.wrapped else 0.
        # Inclination about x: the trajectory genuinely leaves the global xy plane.
        angle = .6
        self.q = np.array([np.cos(angle/2), np.sin(angle/2), 0., 0.])
        self.R = rotation(self.q)
        self.origin = np.array([1.e6, 0., 0.])
        self.part_positions = np.array([p-COM for _, _, p, _ in PARTS])
        self.part_mass = np.array([m for _, m, _, _ in PARTS])

    def initial(self):
        y = np.zeros(43)
        for i in range(2):
            j = 13*i
            y[j:j+3] = self.origin
            y[j+3:j+6] = self.R@np.array([0., 0., 100.])
            y[j+6:j+10] = self.q
        y[:3] += self.R@(np.array([1204., 0., 0.])+COM)
        y[3:6] += self.R@np.array([self.case.radial_speed, self.case.tangential_speed,
                                  self.case.vertical_speed])
        y[10:13] = self.R@self.inertia[0]@np.array([.003, .002, .025])
        y[23:26] = self.R@self.inertia[1]@np.array([0., 0., .04])
        y[34:40] = y[:6]  # same-start, gravity-only ship counterfactual
        return y

    def line(self, t, y, attached, rate_override=None):
        mats, radii, omega, points, speed = [], [], [], [], []
        for i in range(2):
            j = 13*i
            R = rotation(y[j+6:j+10])
            r = R@self.anchor[i]
            w = R@self.inv[i]@R.T@y[j+10:j+13]
            mats.append(R); radii.append(r); omega.append(w)
            points.append(y[j:j+3]+r)
            speed.append(y[j+3:j+6]+cross(w, r))
        dvec = points[0]-points[1]
        distance = np.linalg.norm(dvec)
        n = dvec/distance
        c = self.case
        ell = c.length+c.reel_rate*np.clip(t-c.reel_start, 0., c.reel_end-c.reel_start)
        rate = c.reel_rate if c.reel_start <= t < c.reel_end else 0.
        if rate_override is not None:
            rate = rate_override
        extension = max(0., distance+self.tail-ell) if attached else 0.
        edot = np.dot(n, speed[0]-speed[1])-rate
        engagement = -np.expm1(-extension/c.damper_engagement)
        tension = max(0., c.k*extension+c.c*engagement*edot) if attached and extension > 0 else 0.
        heat = (tension-c.k*extension)*edot if extension > 0 else 0.
        return tension, extension, heat, -tension*rate, n, radii, omega, mats

    def gravity(self, x):
        r = np.linalg.norm(x)
        return -self.case.gm*1000.*x/r**3.5

    def gap(self, t, y):
        p = [y[13*i:13*i+3]+rotation(y[13*i+6:13*i+10])@self.anchor[i] for i in range(2)]
        c = self.case
        ell = c.length+c.reel_rate*np.clip(t-c.reel_start, 0., c.reel_end-c.reel_start)
        return float(np.linalg.norm(p[0]-p[1])+self.tail-ell)

    def rhs(self, t, y, attached, rate_override=None):
        out = np.zeros_like(y)
        tension, _, heat, work, n, radii, omega, _ = self.line(t, y, attached, rate_override)
        f = [-tension*n, tension*n]
        for i in range(2):
            j = 13*i
            grav = self.gravity(y[j:j+3])
            out[j:j+3] = y[j+3:j+6]
            out[j+3:j+6] = grav+f[i]/self.m[i]
            out[j+6:j+10] = qdot(y[j+6:j+10], omega[i])
            out[j+10:j+13] = cross(radii[i], f[i])
            out[28:31] += self.m[i]*grav
            out[31:34] += cross(y[j:j+3]-self.origin, self.m[i]*grav)
        out[26] = heat
        out[27] = work
        out[34:37] = y[37:40]
        out[37:40] = self.gravity(y[34:37])
        out[40:43] = f[0]
        return out

    def step(self, t, y, h, attached):
        # All control changes align with public tick boundaries. Use the interval's
        # achieved reel rate on BOTH boundary stages, avoiding a half-sampled jump.
        mid = t+h/2
        rate = self.case.reel_rate if self.case.reel_start <= mid < self.case.reel_end else 0.
        a = self.rhs(t, y, attached, rate)
        b = self.rhs(t+h/2, y+h*a/2, attached, rate)
        c = self.rhs(t+h/2, y+h*b/2, attached, rate)
        d = self.rhs(t+h, y+h*c, attached, rate)
        z = y+h*(a+2*b+2*c+d)/6
        for j in [6, 19]:
            z[j:j+4] /= np.linalg.norm(z[j:j+4])
        return z

    def invariants(self, y, t, attached):
        energy, P, H = 0., np.zeros(3), np.zeros(3)
        for i in range(2):
            j = 13*i
            x, v, q, L = y[j:j+3], y[j+3:j+6], y[j+6:j+10], y[j+10:j+13]
            R = rotation(q)
            w = R@self.inv[i]@R.T@L
            energy += .5*self.m[i]*np.dot(v, v)+.5*np.dot(w, L)
            energy -= self.m[i]*self.case.gm*1000./(1.5*np.linalg.norm(x)**1.5)
            P += self.m[i]*v
            H += cross(x-self.origin, self.m[i]*v)+L
        extension = self.line(t, y, attached)[1]
        energy += .5*self.case.k*extension**2
        return energy, P, H

    def loads(self, y, t, attached):
        T, _, _, _, n, radii, omega, mats = self.line(t, y, attached)
        R = mats[0]
        L = y[10:13]
        alpha = R@self.inv[0]@R.T@(cross(radii[0], -T*n)-cross(omega[0], L))
        # Specific support acceleration; excludes centroid free fall.
        r = self.part_positions@R.T
        a = -T*n/MASS+np.cross(alpha, r)+np.cross(omega[0], np.cross(omega[0], r))
        norms = np.linalg.norm(a, axis=1)
        return T, np.column_stack([norms, self.part_mass*norms])


def simulate(case, substeps=64, samples=True):
    # Commands on public integer ticks. Reject rather than silently round a plan.
    assert all(float(t).is_integer() for t in [case.release, case.reel_start, case.reel_end])
    model = Model(case)
    y = model.initial()
    initial = y.copy()
    attached = True
    removed = 0.
    e0, p0, h0 = model.invariants(y, 0., True)
    events = [{'kind': 'capture', 't': 0., 'impulse_Ns': [0., 0., 0.],
               'topology': 'prescribed-guide-wrap' if case.wrapped else 'straight'}]
    records = []
    max_tension = 0.
    peak_loads = np.zeros((len(PARTS), 2))
    peak_residual = np.zeros(3)
    was_taut = model.line(0., y, True)[0] > 0
    assert model.line(0., y, True)[0] < case.limit, 'invalid already-overloaded capture state'
    release_state = None
    for tick in range(case.duration):
        for sub in range(substeps):
            t = tick+sub/substeps
            h = 1./substeps
            if attached and t >= case.release:
                removed += .5*case.k*model.line(t, y, True)[1]**2
                events.append({'kind': 'release', 't': t, 'removed_elastic_J': removed})
                attached = False
                release_state = y.copy()
            if attached and model.gap(t, y) < -1e-9:
                # Slack is a force-free ballistic state. Split at first take-up,
                # so RK stages never smear the engagement across the free arc.
                free_end = model.step(t, y, h, False)
                if model.gap(t+h, free_end) >= 0:
                    lo, hi = 0., h
                    for _ in range(32):
                        mid = (lo+hi)/2
                        candidate = model.step(t, y, mid, False)
                        if model.gap(t+mid, candidate) >= 0:
                            hi = mid
                        else:
                            lo = mid
                    y = model.step(t, y, hi, False)
                    t, h = t+hi, h-hi
                    events.append({'kind': 'taut', 't': t, 'localized': True})
                    was_taut = True
            trial = model.step(t, y, h, attached)
            # Detect monotone threshold crossing within the resolved microstep.
            # This is not a proof against arbitrary substep spikes; convergence is tested.
            if attached and model.line(t+h, trial, True)[0] >= case.limit:
                lo, hi = 0., h
                for _ in range(32):
                    mid = (lo+hi)/2
                    candidate = model.step(t, y, mid, True)
                    if model.line(t+mid, candidate, True)[0] >= case.limit:
                        hi = mid
                    else:
                        lo = mid
                ybreak = model.step(t, y, hi, True)
                tension, extension, *_ = model.line(t+hi, ybreak, True)
                removed += .5*case.k*extension**2
                events.append({'kind': 'break', 't': t+hi, 'tension_N': tension,
                               'removed_elastic_J': removed})
                max_tension = max(max_tension, tension)
                _, loads = model.loads(ybreak, t+hi, True)
                peak_loads = np.maximum(peak_loads, loads)
                attached = False
                release_state = ybreak.copy()
                trial = model.step(t+hi, ybreak, h-hi, False)
            y = trial
            now = t+h
            tension, loads = model.loads(y, now, attached)
            max_tension = max(max_tension, tension)
            peak_loads = np.maximum(peak_loads, loads)
            taut = tension > 0
            if taut != was_taut and attached:
                events.append({'kind': 'taut' if taut else 'unloaded', 't': now,
                               'time_resolution_s': h})
            was_taut = taut
            e, p, angular = model.invariants(y, now, attached)
            residual = [abs(e+y[26]+removed-y[27]-e0),
                        np.linalg.norm(p-p0-y[28:31]),
                        np.linalg.norm(angular-h0-y[31:34])]
            peak_residual = np.maximum(peak_residual, residual)
        if samples and (tick == 0 or (tick+1) % 5 == 0):
            records.append({'t': tick+1, 'state': y.tolist(), 'attached': attached,
                            'tension_N': tension, 'ledger_residual': residual})
    final_e, _, _ = model.invariants(y, case.duration, attached)
    delta = y[3:6]-y[37:40]
    delta_local = model.R.T@delta
    spin_e = lambda z: .5*np.dot(z[23:26], rotation(z[19:23])@model.inv[1]@rotation(z[19:23]).T@z[23:26])
    useful = float(np.dot(delta, model.R@np.array([-1., 0., 0.])))
    return {'name': case.name, 'parameters': vars(case), 'substeps': substeps,
            'mass_kg': model.m.tolist(), 'inertia_body_kgm2': [i.tolist() for i in model.inertia],
            'anchors_from_com_m': [a.tolist() for a in model.anchor],
            'initial_state': initial.tolist(), 'final_state': y.tolist(),
            'release_state': release_state.tolist() if release_state is not None else None,
            'events': events, 'samples': records,
            'metrics': {'delta_v_vs_free_mps': delta.tolist(), 'delta_v_local_mps': delta_local.tolist(),
                        'delta_v_norm_mps': float(np.linalg.norm(delta)),
                        'useful_minus_local_x_mps': useful,
                        'speed_gain_vs_free_mps': float(np.linalg.norm(y[3:6])-np.linalg.norm(y[37:40])),
                        'peak_tension_N': max_tension, 'peak_com_accel_mps2': max_tension/MASS,
                        'peak_assembly_loads': {p[0]: v.tolist() for p, v in zip(PARTS, peak_loads)},
                        'spin_energy_change_J': spin_e(y)-spin_e(initial),
                        'structure_delta_angular_momentum': (y[23:26]-initial[23:26]).tolist(),
                        'heat_J': y[26], 'reel_work_J': y[27], 'removed_elastic_J': removed,
                        'mechanical_energy_change_J': final_e-e0,
                        'max_ledger_residual_E_P_H': peak_residual.tolist()}}


CASES = [Case('clean_capture_release'),
         Case('too_fast_break', radial_speed=12., duration=15, release=10.),
         Case('slack_wrap', wrapped=True, length=420., release=50.),
         Case('wrong_phase_release', release=140., duration=160)]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--quick', action='store_true', help='Explore 32-substep vectors; no golden write.')
    args = parser.parse_args()
    if args.quick:
        results = [simulate(c, 32) for c in CASES]
        runs = {}
    else:
        # Parallelism affects throughput only: each case's operation order is fixed.
        with ProcessPoolExecutor(max_workers=4) as pool:
            jobs = {(c.name, n): pool.submit(simulate, c, n) for n in [32, 64, 128] for c in CASES}
            runs = {key: job.result() for key, job in jobs.items()}
        results = [runs[(c.name, 64)] for c in CASES]
    payload = {'schema': 1, 'state_layout': '0:13 ship,13:26 structure; each xyz,vxyz,qwxyz,Lworldxyz;26 heat;27 reel work;28:31 gravity impulse;31:34 gravity angular impulse about [1e6,0,0];34:40 free ship xyz,vxyz;40:43 tether impulse on ship',
               'baseline_sha256': hashlib.sha256((ROOT/'data/ship-baseline.json').read_bytes()).hexdigest(),
               'baseline_com_m': COM.tolist(), 'cases': results}
    for r in results:
        m = r['metrics']
        print(r['name'], json.dumps({k:v for k,v in m.items() if k != 'peak_assembly_loads'}))
        print('events', r['events'])
    if not args.quick:
        import check_reference
        check_reference.main()
        checks = []
        for c, r in zip(CASES, results):
            metrics = r['metrics']
            refined = runs[(c.name, 128)]
            coarse = runs[(c.name, 32)]
            # Signed, external-ledger residuals, not two-body momentum conservation
            # in a fixed source. H is about a fixed origin; no giant barycentric cancellation.
            E, P, H = metrics['max_ledger_residual_E_P_H']
            assert E < 2., (c.name, 'energy', E)
            assert P < 1e-4 and H < 3., (c.name, 'momentum', P, H)
            assert metrics['heat_J'] >= 0
            def errors(a, b):
                ya, yb = np.array(a['final_state']), np.array(b['final_state'])
                return {'position_m': float(np.linalg.norm(ya[:3]-yb[:3])),
                        'velocity_mps': float(np.linalg.norm(ya[3:6]-yb[3:6])),
                        'peak_tension_N': abs(a['metrics']['peak_tension_N']-b['metrics']['peak_tension_N']),
                        'event_time_s': abs(a['events'][-1]['t']-b['events'][-1]['t'])}
            fine_err = errors(r, refined)
            assert fine_err['position_m'] < .05 and fine_err['velocity_mps'] < .001, fine_err
            assert fine_err['peak_tension_N'] < 100. and fine_err['event_time_s'] < 1e-4, fine_err
            checks.append({'case': c.name, '32_vs_64': errors(coarse, r), '64_vs_128': fine_err,
                           'max_ledger_residual_E_P_H': metrics['max_ledger_residual_E_P_H']})
        assert results[0]['events'][-1]['kind'] == 'release'
        assert results[0]['metrics']['useful_minus_local_x_mps'] > 40.
        assert results[1]['events'][-1]['kind'] == 'break'
        assert results[2]['events'][1]['kind'] == 'taut' and results[2]['events'][1]['t'] > 2.
        assert results[2]['events'][-1]['kind'] == 'break'
        assert results[3]['events'][-1]['kind'] == 'release'
        assert results[3]['metrics']['useful_minus_local_x_mps'] < 0
        # Isolated conservative coupled bodies, plus a powered reel with explicit work.
        auxiliary = [simulate(Case('vacuum_elastic', gm=0., c=0., limit=1e9, release=40., duration=45), 64),
                     simulate(Case('reel_in', reel_rate=-.1, duration=60, release=50.), 64)]
        # Repeat a complete hybrid break case; exact JSON-state replay in this runtime.
        replay = simulate(CASES[1], 64)
        assert replay == results[1], 'same-runtime replay changed'
        assert auxiliary[1]['metrics']['reel_work_J'] > 0
        for r in auxiliary:
            E, P, H = r['metrics']['max_ledger_residual_E_P_H']
            assert E < 2 and P < 1e-4 and H < 10, (r['name'], E, P, H)
        coarse_tick = simulate(CASES[0], 1, False)
        payload['validation'] = {'convergence': checks, 'exact_replay': True,
                                 'coarse_1s_clean': {'events': coarse_tick['events'], 'metrics': coarse_tick['metrics']},
                                 'auxiliary': auxiliary}
        (HERE/'vectors.json').write_text(json.dumps(payload, indent=2, allow_nan=False)+'\n')
        print('PASS four outcome vectors, two refinements, conservation ledgers, reel work, exact replay')


if __name__ == '__main__':
    main()
