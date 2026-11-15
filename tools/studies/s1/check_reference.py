"""Independent local mechanics checks; no trajectory fixture regeneration.

Run: python tools/studies/s1/check_reference.py
Uses finite differences/virtual work and coordinate transformations, rather than
another time integrator. Only standard library and numpy are required.
"""
from __future__ import annotations

import math

import numpy as np

from reference import Case, Model


def product(a, b):
    """Hamilton product, used independently of reference.rotation/qdot."""
    return np.r_[a[0]*b[0]-np.dot(a[1:], b[1:]),
                 a[0]*b[1:]+b[0]*a[1:]+np.cross(a[1:], b[1:])]


def axis_angle(axis, angle):
    a = np.asarray(axis, dtype=float)
    return np.r_[math.cos(angle/2), a/np.linalg.norm(a)*math.sin(angle/2)]


def rotate(q, v):
    q = q/np.linalg.norm(q)
    return product(product(q, np.r_[0., v]), q*np.array([1., -1., -1., -1.]))[1:]


def points(model, y):
    return [y[13*i:13*i+3]+rotate(y[13*i+6:13*i+10], model.anchor[i])
            for i in range(2)]


def independent_energy(model, t, y, attached=True):
    """Body-frame angular kinetic energy and geometric spring strain."""
    energy = 0.
    for i in range(2):
        j = 13*i
        conjugate = y[j+6:j+10]*np.array([1., -1., -1., -1.])
        body_L = rotate(conjugate, y[j+10:j+13])
        energy += .5*model.m[i]*np.dot(y[j+3:j+6], y[j+3:j+6])
        energy += .5*np.dot(body_L, np.linalg.solve(model.inertia[i], body_L))
    a, b = points(model, y)
    c = model.case
    paid = min(max(t-c.reel_start, 0.), c.reel_end-c.reel_start)
    strain = max(0., np.linalg.norm(a-b)+model.tail-c.length-c.reel_rate*paid)
    return energy+(.5*c.k*strain*strain if attached else 0.)


def independent_momenta(model, y):
    momentum = np.zeros(3)
    angular = np.zeros(3)
    for i in range(2):
        j = 13*i
        p = model.m[i]*y[j+3:j+6]
        momentum += p
        angular += np.cross(y[j:j+3], p)+y[j+10:j+13]
    return momentum, angular


def setup(edot=2., rate=0., extension=1.2, wrapped=False, damping=40.):
    """Small asymmetric bodies keep finite-difference cancellation modest."""
    model = Model(Case('analytical', gm=0., k=200., c=damping,
                       reel_rate=rate, wrapped=wrapped))
    model.m = np.array([17., 41.])
    model.inertia = [np.array([[70., 3., -4.], [3., 90., 2.], [-4., 2., 110.]]),
                     np.array([[120., -6., 5.], [-6., 150., 9.], [5., 9., 190.]])]
    model.inv = [np.linalg.inv(i) for i in model.inertia]
    model.anchor = [np.array([.7, -.3, .4]), np.array([-1.1, .9, -.2])]
    terminal = np.array([.8, -.4, .5])
    model.tail = np.linalg.norm(terminal-model.anchor[1]) if wrapped else 0.
    y = np.zeros(43)
    y[:3], y[13:16] = [2., 1., -.5], [8., -2., 1.5]
    y[6:10] = axis_angle([1., 2., -1.], .7)
    y[19:23] = axis_angle([.3, 2., 1.], -.4)
    body_omega = [np.array([.3, -.2, .4]), np.array([-.1, .2, .15])]
    for i in range(2):
        j = 13*i
        y[j+10:j+13] = rotate(y[j+6:j+10], model.inertia[i]@body_omega[i])
    y[3:6], y[16:19] = [.4, -.8, .3], [-.2, .6, .1]
    a, b = points(model, y)
    n = (a-b)/np.linalg.norm(a-b)
    endpoint_velocity = []
    for i in range(2):
        j = 13*i
        endpoint_velocity.append(y[j+3:j+6]+np.cross(
            rotate(y[j+6:j+10], body_omega[i]),
            rotate(y[j+6:j+10], model.anchor[i])))
    actual = np.dot(n, endpoint_velocity[0]-endpoint_velocity[1])
    y[3:6] += (edot+rate-actual)*n
    t = 15.
    model.case.length = np.linalg.norm(a-b)+model.tail-extension-rate*(t-model.case.reel_start)
    y[34:40] = y[:6]
    return model, t, y, terminal


def close(actual, expected, atol, label):
    error = float(np.max(np.abs(np.asarray(actual)-np.asarray(expected))))
    assert error <= atol, f'{label}: error {error:.12g} exceeds {atol:.12g}'
    return error


def check_momentum_and_virtual_work():
    model, t, y, _ = setup(damping=0.)
    out = model.rhs(t, y, True)
    close(model.m[0]*out[3:6]+model.m[1]*out[16:19], 0., 1e-12,
          'opposite forces')
    eps = 2e-5
    plus = independent_momenta(model, y+eps*out)
    minus = independent_momenta(model, y-eps*out)
    linear_error = close((plus[0]-minus[0])/(2*eps), 0., 1e-8, 'total P derivative')
    angular_error = close((plus[1]-minus[1])/(2*eps), 0., 1e-7, 'total H derivative')
    # Potential-energy gradients under independent translations and active
    # rotations must agree with each body's actual generalized force.
    worst = 0.
    eps = 1e-6
    for i in range(2):
        j = 13*i
        for axis in np.eye(3):
            yp, ym = y.copy(), y.copy()
            yp[j:j+3] += eps*axis
            ym[j:j+3] -= eps*axis
            force = -(independent_energy(model, t, yp)-independent_energy(model, t, ym))/(2*eps)
            worst = max(worst, close(force, model.m[i]*np.dot(axis, out[j+3:j+6]),
                                     2e-6, 'translation virtual work'))
            # Zero angular momentum isolates elastic potential in a rotation.
            yp, ym = y.copy(), y.copy()
            yp[j+10:j+13] = ym[j+10:j+13] = 0.
            yp[j+6:j+10] = product(axis_angle(axis, eps), y[j+6:j+10])
            ym[j+6:j+10] = product(axis_angle(axis, -eps), y[j+6:j+10])
            torque = -(independent_energy(model, t, yp)-independent_energy(model, t, ym))/(2*eps)
            worst = max(worst, close(torque, np.dot(axis, out[j+10:j+13]),
                                     2e-6, 'rotation virtual work'))
    return max(linear_error, angular_error), worst


def transform(y, q):
    z = y.copy()
    for j in (0, 13):
        z[j:j+3] = rotate(q, y[j:j+3])
        z[j+3:j+6] = rotate(q, y[j+3:j+6])
        z[j+6:j+10] = product(q, y[j+6:j+10])
        z[j+10:j+13] = rotate(q, y[j+10:j+13])
    for j in (28, 31, 34, 37, 40):
        z[j:j+3] = rotate(q, y[j:j+3])
    return z


def check_rotation():
    worst = 0.
    for wrapped in (False, True):
        model, t, y, _ = setup(rate=-.4, wrapped=wrapped)
        for attached in (False, True):
            for q in (axis_angle([2., -3., .7], 1.13), axis_angle([-1., .4, 3.], 2.7)):
                original = model.rhs(t, y, attached)
                rotated = model.rhs(t, transform(y, q), attached)
                worst = max(worst, close(rotated, transform(original, q), 3e-10,
                                         '3D RHS equivariance'))
    return worst


def check_energy_ledger():
    worst = 0.
    scenarios = [('loading', 2., 0., 1.2), ('unloading', -2., 0., 1.2),
                 ('clipped unloading', -10., 0., 1.2),
                 ('reel in', .8, -.4, 1.2), ('pay out', -.5, .6, 1.2),
                 ('slack', .5, -.2, -.5)]
    for name, edot, rate, extension in scenarios:
        for wrapped in (False, True):
            model, t, y, _ = setup(edot, rate, extension, wrapped)
            out = model.rhs(t, y, True)
            close(model.invariants(y, t, True)[0], independent_energy(model, t, y),
                  2e-10, f'{name} stored energy')
            eps = 2e-5
            derivative = (independent_energy(model, t+eps, y+eps*out)
                          -independent_energy(model, t-eps, y-eps*out))/(2*eps)
            worst = max(worst, close(derivative+out[26]-out[27], 0., 3e-5,
                                     f'{name} differential energy ledger'))
            assert out[26] >= -1e-12, f'{name}: negative dissipation'
            if name in ('clipped unloading', 'slack'):
                close(out[3:6], 0., 1e-12, f'{name} force must vanish')
            if name == 'reel in':
                assert out[27] > 0., 'reel-in must add mechanical work'
            if name == 'pay out':
                assert out[27] < 0., 'pay-out must absorb mechanical work'
    return worst


def check_guide():
    model, t, y, terminal = setup(wrapped=True)
    out = model.rhs(t, y, True)
    tension = np.linalg.norm(model.m[0]*out[3:6])
    ship, guide = points(model, y)
    center, q = y[13:16], y[19:23]
    end = center+rotate(q, terminal)
    direction = (end-guide)/np.linalg.norm(end-guide)
    # Resolve the two actual reactions, rather than using the effective anchor.
    guide_force = tension*((ship-guide)/np.linalg.norm(ship-guide)+direction)
    terminal_force = -tension*direction
    force_error = close(guide_force+terminal_force, model.m[1]*out[16:19],
                        2e-12, 'guide plus terminal resultant')
    torque = np.cross(guide-center, guide_force)+np.cross(end-center, terminal_force)
    torque_error = close(torque, out[23:26], 2e-12, 'guide plus terminal torque')
    worst = max(force_error, torque_error)
    # Virtual work on a rigidly moved guide AND terminal checks the whole path.
    eps = 1e-6
    for axis in np.eye(3):
        paths = []
        tails = []
        for sign in (1., -1.):
            rot = axis_angle(axis, sign*eps)
            moved_guide = center+rotate(rot, guide-center)
            moved_end = center+rotate(rot, end-center)
            tail = np.linalg.norm(moved_end-moved_guide)
            tails.append(tail)
            paths.append(np.linalg.norm(ship-moved_guide)+tail)
        tail_derivative = (tails[0]-tails[1])/(2*eps)
        close(tail_derivative, 0., 1e-9, 'rigid guide-tail length derivative')
        generalized_torque = -tension*(paths[0]-paths[1])/(2*eps)
        worst = max(worst, close(generalized_torque, np.dot(axis, out[23:26]),
                                 2e-6, 'whole wrapped path virtual work'))
    return worst


def main():
    momentum, force_gradient = check_momentum_and_virtual_work()
    rotation = check_rotation()
    energy = check_energy_ledger()
    guide = check_guide()
    print('PASS independent mechanics checks: momentum, anchor virtual work, '
          '3D equivariance, six energy-ledger regimes, guide reactions')
    print(f'max residuals: momentum derivative={momentum:.3g}; '
          f'force/torque gradient={force_gradient:.3g}; RHS rotation={rotation:.3g}; '
          f'energy rate={energy:.3g}; guide={guide:.3g}')


if __name__ == '__main__':
    main()
