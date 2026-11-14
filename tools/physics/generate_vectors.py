#!/usr/bin/env python3
"""Reproduce the proposed phase-1B SI reference vectors; standard library only.

This is an offline reference, deliberately independent of the future browser
integrator. No randomness, external packages, installation, or network is used.
See README.md for the schema, methods, and interpretation of tolerances.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "tests" / "vectors" / "physics.json"
GM = 1.0e10  # m^3 s^-2, the Newtonian-calibrated primary parameter
R0 = 1.0e6  # m, shared reference length for every pair
GM2 = 2.5e9  # m^3 s^-2
SEPARATION = 4.0e6  # m
TIMES = (0.0, 1000.0, 5000.0, 10000.0, 20000.0)  # s
POSITION_TOL = 0.1  # m, acceptance tolerance for a tested implementation
VELOCITY_TOL = 1.0e-5  # m s^-1
REFERENCE_POSITION_TOL = 1.0e-4  # m, independent refinement comparison
REFERENCE_VELOCITY_TOL = 1.0e-8  # m s^-1

# Dormand-Prince embedded explicit 5(4) tableau. The 5th-order solution is
# accepted; the difference from the 4th-order solution controls local error.
C = (0.0, 1/5, 3/10, 4/5, 8/9, 1.0, 1.0)
A = (
    (),
    (1/5,),
    (3/40, 9/40),
    (44/45, -56/15, 32/9),
    (19372/6561, -25360/2187, 64448/6561, -212/729),
    (9017/3168, -355/33, 46732/5247, 49/176, -5103/18656),
    (35/384, 0.0, 500/1113, 125/192, -2187/6784, 11/84),
)
B5 = (*A[6], 0.0)
B4 = (5179/57600, 0.0, 7571/16695, 393/640, -92097/339200,
      187/2100, 1/40)
E = tuple(a - b for a, b in zip(B5, B4))


def parameter(gm: float, exponent: float) -> float:
    """K = GM r0^(p-2), in m^(p+1) s^-2."""
    return gm * R0 ** (exponent - 2.0)


def acceleration(dx: float, dy: float, gm: float, p: float) -> tuple[float, float]:
    """Acceleration towards the source; dx,dy point from source to receiver."""
    d2 = dx * dx + dy * dy
    if d2 == 0.0:
        raise ValueError("Unsoftened point-source singularity: r = 0")
    multiplier = -parameter(gm, p) / d2 ** ((p + 1.0) / 2.0)
    return multiplier * dx, multiplier * dy


def potential(radius: float, gm: float, p: float) -> float:
    """Specific potential, J kg^-1 = m^2 s^-2, with zero at infinity."""
    return -parameter(gm, p) / ((p - 1.0) * radius ** (p - 1.0))


def single_rhs(p: float):
    def rhs(_t, state):
        x, y, vx, vy = state[:4]
        ax, ay = acceleration(x, y, GM, p)
        derivative = [vx, vy, ax, ay]
        if len(state) == 5:
            derivative.append((x * vy - y * vx) / (x * x + y * y))
        return derivative
    return rhs


def binary_initial(p: float) -> tuple[list[float], float]:
    fraction = GM2 / (GM + GM2)
    omega = math.sqrt(parameter(GM + GM2, p) / SEPARATION ** (p + 1.0))
    x1, x2 = -fraction * SEPARATION, (1.0 - fraction) * SEPARATION
    # Per-body [x,y,vx,vy], then the massless ship. This ordering is contractual.
    return [x1, 0.0, 0.0, omega*x1, x2, 0.0, 0.0, omega*x2,
            0.0, 2.0e6, 45.0, 0.0], omega


def binary_rhs(p: float):
    def rhs(_t, state):
        x1, y1, vx1, vy1, x2, y2, vx2, vy2, x, y, vx, vy = state
        ax1, ay1 = acceleration(x1-x2, y1-y2, GM2, p)
        ax2, ay2 = acceleration(x2-x1, y2-y1, GM, p)
        sx1, sy1 = acceleration(x-x1, y-y1, GM, p)
        sx2, sy2 = acceleration(x-x2, y-y2, GM2, p)
        return [vx1, vy1, ax1, ay1, vx2, vy2, ax2, ay2,
                vx, vy, sx1+sx2, sy1+sy2]
    return rhs


def dp_step(rhs, t, state, step):
    stages = []
    for ci, ai in zip(C, A):
        stage = [state[j] + step * sum(a * k[j] for a, k in zip(ai, stages))
                 for j in range(len(state))]
        stages.append(rhs(t + ci * step, stage))
    high = [state[j] + step * sum(b*k[j] for b, k in zip(B5, stages))
            for j in range(len(state))]
    error = [step * sum(e*k[j] for e, k in zip(E, stages))
             for j in range(len(state))]
    return high, error


def integrate(rhs, initial, times, *, refined=False, angle=False):
    """Land exactly at requested endpoints; max component scaled local error <=1.

    Baseline: rtol=2e-12, position atol=1e-7 m, velocity atol=1e-11 m/s.
    Refined:  rtol=2e-14, position atol=1e-9 m, velocity atol=1e-13 m/s.
    The refined run also halves max step (100 -> 50 s). These are numerical
    controls, not proofs of global accuracy; separate analytic/invariant tests
    and the baseline/refined difference check the resulting global error.
    """
    rtol = 2.0e-14 if refined else 2.0e-12
    atol = [1.0e-9 if i % 4 < 2 else 1.0e-13 for i in range(len(initial))]
    if not refined:
        atol = [value * 100.0 for value in atol]
    if angle:
        atol[-1] = 1.0e-14 if refined else 1.0e-12
    maximum = 50.0 if refined else 100.0
    step = 1.0
    t = 0.0
    state = list(initial)
    result = []
    attempts = 0
    for target in times:
        if target < t:
            raise ValueError("Checkpoint times must be nondecreasing and >= 0")
        while t < target:
            attempts += 1
            if attempts > 1000000:
                raise RuntimeError("Integration did not converge")
            trial = min(step, maximum, target - t)
            if trial <= 0.0 or t + trial == t:
                raise RuntimeError("Integration step underflow")
            new_state, error = dp_step(rhs, t, state, trial)
            scaled = max(abs(err)/(at + rtol*max(abs(old), abs(new)))
                         for err, at, old, new in zip(error, atol, state, new_state))
            if not math.isfinite(scaled):
                raise RuntimeError("Non-finite integration error")
            if scaled <= 1.0:
                state = new_state
                t = target if trial == target-t else t+trial
            factor = 5.0 if scaled == 0.0 else min(5.0, max(0.1, 0.9*scaled**(-0.2)))
            step = min(maximum, trial*factor)
        result.append(list(state))
    return result


def expectation(quantity, time, value, tolerance, unit, **extra):
    return {"quantity": quantity, "at_t": time, "value": value,
            "tolerance": tolerance, "unit": unit, **extra}


def law(p):
    return {"exponent": p, "normalization": "P4", "GM": GM, "r0": R0}


def slug(p):
    return "p2" if p == 2.0 else "p2p5"


def closed_cases(p):
    result = []
    for factor in (0.5, 1.0, 2.0, 4.0):
        radius = R0*factor
        circular = math.sqrt(parameter(GM, p)*radius**(1.0-p))
        omega = circular/radius
        period = 2.0*math.pi/omega
        # The quadrant checks avoid accidentally passing a magnitude-only law.
        direction = (0.6, -0.8) if factor == 4.0 else (1.0, 0.0)
        initial_r = [radius*component for component in direction]
        initial_v = [-direction[1]*circular, direction[0]*circular]
        check = [
            expectation("speed", 0.0, circular, 1e-10, "m s^-1"),
            expectation("acceleration", 0.0, list(acceleration(*initial_r, GM, p)), 1e-13, "m s^-2"),
            expectation("specific_potential", 0.0, potential(radius, GM, p), 1e-8, "m^2 s^-2"),
            expectation("specific_energy", 0.0, circular*circular/2.0+potential(radius, GM, p), 1e-8, "m^2 s^-2"),
            expectation("specific_angular_momentum", 0.0, radius*circular, 1e-6, "m^2 s^-1"),
            expectation("circular_period", 0.0, period, 1e-7, "s"),
            expectation("period_ratio_to_r0", 0.0, factor**((p+1.0)/2.0), 1e-12, "1"),
            expectation("escape_speed", 0.0, circular*math.sqrt(2.0/(p-1.0)), 1e-10, "m s^-1"),
            expectation("escape_to_circular_ratio", 0.0, math.sqrt(2.0/(p-1.0)), 1e-12, "1"),
            expectation("epicyclic_frequency", 0.0, omega*math.sqrt(3.0-p), 1e-15, "s^-1"),
            expectation("near_circular_radial_period", 0.0, period/math.sqrt(3.0-p), 1e-7, "s"),
            expectation("near_circular_apsidal_angle", 0.0, math.pi/math.sqrt(3.0-p), 1e-12, "rad"),
            expectation("near_circular_periapsis_to_periapsis_angle", 0.0, 2.0*math.pi/math.sqrt(3.0-p), 1e-12, "rad"),
            expectation("near_circular_precession_per_radial_cycle", 0.0, 2.0*math.pi*(1.0/math.sqrt(3.0-p)-1.0), 1e-12, "rad"),
        ]
        result.append({"id": f"closed-{slug(p)}-r{factor:g}r0",
                       "description": "Closed-form point-mass checks; apsidal quantities are small-eccentricity limits, not an exactly circular orbit's observable periapsis.",
                       "kind": "closed_form", "claim_status": "proposed mathematics conditional on the declared force law",
                       "law": law(p), "initial": {"r": initial_r, "v": initial_v}, "expect": check})
    return result


def energy_single(state, p):
    x, y, vx, vy = state[:4]
    return (vx*vx+vy*vy)/2.0+potential(math.hypot(x, y), GM, p)


def h_single(state):
    x, y, vx, vy = state[:4]
    return x*vy-y*vx


def binary_invariants(state, p, omega):
    x1, y1, vx1, vy1, x2, y2, vx2, vy2, x, y, vx, vy = state
    w1, w2 = GM/(GM+GM2), GM2/(GM+GM2)
    distance = math.hypot(x2-x1, y2-y1)
    energy = (w1*(vx1*vx1+vy1*vy1)+w2*(vx2*vx2+vy2*vy2))/2.0
    energy += w1*potential(distance, GM2, p)
    angular_momentum = w1*(x1*vy1-y1*vx1)+w2*(x2*vy2-y2*vx2)
    ship_potential = potential(math.hypot(x-x1, y-y1), GM, p)+potential(math.hypot(x-x2, y-y2), GM2, p)
    jacobi = -2.0*ship_potential-vx*vx-vy*vy+2.0*omega*(x*vy-y*vx)
    return {
        "binary_specific_energy": energy,
        "binary_specific_angular_momentum": angular_momentum,
        "binary_barycenter": [w1*x1+w2*x2, w1*y1+w2*y2],
        "binary_barycentric_velocity": [w1*vx1+w2*vx2, w1*vy1+w2*vy2],
        "ship_jacobi_constant": jacobi,
    }


def trajectory_case(p, binary):
    if binary:
        initial, omega = binary_initial(p)
        states = integrate(binary_rhs(p), initial, TIMES)
        init_json = {"bodies": [
            {"id": "primary", "GM": GM, "r": initial[0:2], "v": initial[2:4]},
            {"id": "secondary", "GM": GM2, "r": initial[4:6], "v": initial[6:8]},
        ], "r": initial[8:10], "v": initial[10:12]}
        invariants = binary_invariants(initial, p, omega)
    else:
        initial = [R0, 0.0, 0.0, 90.0]
        states = integrate(single_rhs(p), initial, TIMES)
        init_json = {"r": initial[:2], "v": initial[2:]}
        invariants = {"specific_energy": energy_single(initial, p),
                      "specific_angular_momentum": h_single(initial)}
    check = []
    for t, state in zip(TIMES, states):
        ship = state[8:] if binary else state
        check.extend([
            expectation("position", t, ship[:2], POSITION_TOL, "m"),
            expectation("velocity", t, ship[2:4], VELOCITY_TOL, "m s^-1"),
        ])
        if binary:
            for index, body in enumerate(("primary", "secondary")):
                body_state = state[4*index:4*index+4]
                check.extend([
                    expectation("body_position", t, body_state[:2], POSITION_TOL, "m", body=body),
                    expectation("body_velocity", t, body_state[2:4], VELOCITY_TOL, "m s^-1", body=body),
                ])
        for quantity, value in invariants.items():
            if "barycenter" in quantity:
                tolerance, unit = 1e-5, "m"
            elif "barycentric_velocity" in quantity:
                tolerance, unit = 1e-10, "m s^-1"
            elif "angular_momentum" in quantity:
                tolerance, unit = 1e-3, "m^2 s^-1"
            else:
                tolerance, unit = 2e-3, "m^2 s^-2"
            check.append(expectation(quantity, t, value, tolerance, unit))
    result = {"id": f"{'binary' if binary else 'single'}-{slug(p)}",
              "description": "Two mutually moving point masses on a circular relative orbit plus a massless ship; inertial barycentric coordinates." if binary else "Eccentric massless test-particle orbit around a fixed point source at the origin.",
              "kind": "trajectory", "claim_status": "offline numerical reference; not a game demonstration",
              "law": law(p), "initial": init_json,
              "source_dynamics": "mutual_binary_massless_ship" if binary else "fixed_origin",
              "expect": check}
    if binary:
        result["binary_angular_frequency"] = omega
    return result, initial, states


def build_vectors():
    cases, trajectories = [], []
    for p in (2.0, 2.5):
        cases.extend(closed_cases(p))
        for binary in (False, True):
            case, initial, states = trajectory_case(p, binary)
            cases.append(case)
            trajectories.append((p, binary, initial, states))
    result = {
        "version": 1, "units": "SI",
        "status": "Proposed mathematics and offline reference values; requires independent Phase-2 implementation checks.",
        "generator": "python tools/physics/generate_vectors.py",
        "reference_method": {"name": "adaptive Dormand-Prince embedded 5(4)",
            "rtol": 2e-12, "position_atol_m": 1e-7, "velocity_atol_m_per_s": 1e-11,
            "initial_step_s": 1.0, "max_step_s": 100.0,
            "refinement_rtol": 2e-14, "refinement_atol_factor": 0.01,
            "refinement_max_step_s": 50.0,
            "refinement_position_limit_m": REFERENCE_POSITION_TOL,
            "refinement_velocity_limit_m_per_s": REFERENCE_VELOCITY_TOL,
            "independent_audit": "classical RK4, fixed 5 s step, same 1e-4 m / 1e-8 m s^-1 comparison limits"},
        "conventions": {"coordinates": "planar Cartesian inertial; right handed x,y; prograde means +z angular momentum",
            "reference_length": "One universal r0 for every interacting pair; not reset at a new encounter or for a new body.",
            "force": "a_i = -sum_j GM_j*r0^(p-2)*(r_i-r_j)/|r_i-r_j|^(p+1)",
            "potential_zero": "infinity; p>1",
            "test_particle": "ship has zero gravitational source mass; no thrust, drag, collisions or softening in these vectors",
            "tolerance": "absolute SI error; arrays compared component by component; scalar tolerance applies to every component",
            "closed_form_at_t": "0 is evaluation time only; near-circular angles are analytic limits",
            "binary_specific_invariants": "binary energy and angular momentum divided by total binary mass; mass weights GM_i/sum(GM_i)",
            "ship_jacobi_constant": "C = -2*Phi - |v_inertial|^2 + 2*omega*(x*vy-y*vx); valid only for a circular binary of constant omega",
            "invariant_expectations": "same analytic initial invariant repeated at each checkpoint; not the numerically drifted value"},
        "cases": cases,
    }
    return result, trajectories


def assert_close(label, actual, expected, tolerance):
    if not math.isfinite(actual) or abs(actual-expected) > tolerance:
        raise AssertionError(f"{label}: got {actual:.17g}, expected {expected:.17g}, tolerance {tolerance:.3g}")


def analytic_newtonian_ellipse(t):
    radius, speed = R0, 90.0
    semi_major = GM/(2.0*GM/radius-speed*speed)
    eccentricity = radius/semi_major-1.0
    mean_motion = math.sqrt(GM/semi_major**3)
    mean_anomaly = math.pi+mean_motion*t
    anomaly = mean_anomaly
    for _ in range(30):
        correction = (anomaly-eccentricity*math.sin(anomaly)-mean_anomaly)/(1.0-eccentricity*math.cos(anomaly))
        anomaly -= correction
        if abs(correction) < 1e-15:
            break
    rate = mean_motion/(1.0-eccentricity*math.cos(anomaly))
    minor = semi_major*math.sqrt(1.0-eccentricity**2)
    return [semi_major*(eccentricity-math.cos(anomaly)), -minor*math.sin(anomaly),
            semi_major*math.sin(anomaly)*rate, -minor*math.cos(anomaly)*rate]


def independent_rk4(rhs, initial, times):
    """Independent fixed-step classical RK4 audit (5 s), never used to emit values."""
    state, t, result = list(initial), 0.0, []
    for target in times:
        while t < target:
            step = min(5.0, target-t)
            k1 = rhs(t, state)
            k2 = rhs(t+step/2.0, [y+step*k/2.0 for y, k in zip(state, k1)])
            k3 = rhs(t+step/2.0, [y+step*k/2.0 for y, k in zip(state, k2)])
            k4 = rhs(t+step, [y+step*k for y, k in zip(state, k3)])
            state = [y+step*(a+2.0*b+2.0*c+d)/6.0
                     for y, a, b, c, d in zip(state, k1, k2, k3, k4)]
            t = target if step == target-t else t+step
        result.append(list(state))
    return result


def validate(trajectories):
    maximum_position, maximum_velocity = 0.0, 0.0
    rk_position, rk_velocity = 0.0, 0.0
    for p, binary, initial, states in trajectories:
        rhs = binary_rhs(p) if binary else single_rhs(p)
        refined = integrate(rhs, initial, TIMES, refined=True)
        rk4 = independent_rk4(rhs, initial, TIMES)
        for time, baseline, independent in zip(TIMES, states, rk4):
            for index, (first, second) in enumerate(zip(baseline, independent)):
                position = index % 4 < 2
                limit = REFERENCE_POSITION_TOL if position else REFERENCE_VELOCITY_TOL
                assert_close(f"independent RK4 p={p}, binary={binary}, t={time}, component={index}", first, second, limit)
                if position:
                    rk_position = max(rk_position, abs(first-second))
                else:
                    rk_velocity = max(rk_velocity, abs(first-second))
        for time, baseline, tighter in zip(TIMES, states, refined):
            for index, (first, second) in enumerate(zip(baseline, tighter)):
                position = index % 4 < 2
                limit = REFERENCE_POSITION_TOL if position else REFERENCE_VELOCITY_TOL
                assert_close(f"refinement p={p}, binary={binary}, t={time}, component={index}", first, second, limit)
                if position:
                    maximum_position = max(maximum_position, abs(first-second))
                else:
                    maximum_velocity = max(maximum_velocity, abs(first-second))
            if binary:
                _, omega = binary_initial(p)
                start_invariants = binary_invariants(initial, p, omega)
                actual_invariants = binary_invariants(baseline, p, omega)
                for name, expected in start_invariants.items():
                    actual = actual_invariants[name]
                    expected_values = expected if isinstance(expected, list) else [expected]
                    actual_values = actual if isinstance(actual, list) else [actual]
                    limit = 1e-5 if "barycenter" in name else 1e-9 if "barycentric" in name else 1e-3 if "angular" in name else 1e-7
                    for first, second in zip(actual_values, expected_values):
                        assert_close(f"binary invariant {name} p={p} t={time}", first, second, limit)
                for body in (0, 1):
                    x = initial[4*body]
                    analytic = [x*math.cos(omega*time), x*math.sin(omega*time),
                                -omega*x*math.sin(omega*time), omega*x*math.cos(omega*time)]
                    for index, (actual, expected) in enumerate(zip(baseline[4*body:4*body+4], analytic)):
                        assert_close(f"analytic binary body {body} p={p} t={time}", actual, expected,
                                     REFERENCE_POSITION_TOL if index < 2 else REFERENCE_VELOCITY_TOL)
            else:
                assert_close(f"single energy p={p} t={time}", energy_single(baseline, p), energy_single(initial, p), 1e-7)
                assert_close(f"single angular momentum p={p} t={time}", h_single(baseline), h_single(initial), 1e-3)
                if p == 2.0:
                    for index, (actual, expected) in enumerate(zip(baseline, analytic_newtonian_ellipse(time))):
                        assert_close(f"Newtonian analytic ellipse t={time}", actual, expected,
                                     REFERENCE_POSITION_TOL if index < 2 else REFERENCE_VELOCITY_TOL)
    for p in (2.0, 2.5):
        omega = math.sqrt(parameter(GM, p)/R0**(p+1.0))
        circular = [R0, 0.0, 0.0, omega*R0]
        period = 2.0*math.pi/omega
        end = integrate(single_rhs(p), circular, [period], refined=True)[0]
        for index, (actual, expected) in enumerate(zip(end, circular)):
            assert_close(f"circular orbit closure p={p}", actual, expected,
                         REFERENCE_POSITION_TOL if index < 2 else REFERENCE_VELOCITY_TOL)
        # Independent finite-difference check of the potential gradient.
        dr = 1.0
        numerical_accel = -(potential(R0+dr, GM, p)-potential(R0-dr, GM, p))/(2.0*dr)
        assert_close(f"potential derivative p={p}", numerical_accel, acceleration(R0, 0.0, GM, p)[0], 1e-10)
        # A 1e-4 radial perturbation at fixed circular angular momentum. Integrate
        # unwrapped polar angle and locate the following apoapsis by bisection.
        radial_period = period/math.sqrt(3.0-p)
        eccentric = [R0*1.0001, 0.0, 0.0, omega*R0/1.0001, 0.0]
        lower, upper = 0.99*radial_period, 1.01*radial_period
        for _ in range(34):
            middle = (lower+upper)/2.0
            state = integrate(single_rhs(p), eccentric, [middle], refined=True, angle=True)[0]
            radial = state[0]*state[2]+state[1]*state[3]
            if radial > 0.0:
                lower = middle
            else:
                upper = middle
        near_angle = state[4]
        expected_angle = 2.0*math.pi/math.sqrt(3.0-p)
        assert_close(f"near-circular apsidal limit p={p}", near_angle, expected_angle, 2e-6)
        print(f"PASS near-circular p={p:g}: angle={near_angle:.12f} rad, limit={expected_angle:.12f} rad")
    print(f"PASS reference refinement: max position difference {maximum_position:.3g} m, max velocity difference {maximum_velocity:.3g} m/s")
    print(f"PASS independent fixed-step RK4 audit: max position difference {rk_position:.3g} m, max velocity difference {rk_velocity:.3g} m/s")
    print("PASS analytic circular closure, Newtonian ellipse, binary rotation, potential gradient, energy/angular momentum/barycenter/Jacobi invariants")


def report():
    print("ASSUMED scale: primary GM=1e10 m^3/s^2, secondary GM=2.5e9 m^3/s^2, universal r0=1e6 m")
    print("p=2.5: radius_m acceleration_m/s^2 circular_m/s escape_m/s period_s")
    for factor in (0.5, 1.0, 2.0, 4.0):
        radius = R0*factor
        speed = math.sqrt(parameter(GM, 2.5)*radius**(-1.5))
        print(f"{radius:g} {abs(acceleration(radius, 0, GM, 2.5)[0]):.12g} {speed:.12g} {speed*math.sqrt(4/3):.12g} {2*math.pi*radius/speed:.12g}")
    print("Same-start Newtonian-vs-p2.5 forecast: r=[2e6,0]m, v=[0,v_c(p2.5,2e6)]m/s; no thrust")
    radius = 2.0*R0
    speed = math.sqrt(parameter(GM, 2.5)*radius**(-1.5))
    initial = [radius, 0.0, 0.0, speed]
    times = [100.0, 1000.0, 10000.0]
    newtonian = integrate(single_rhs(2.0), initial, times, refined=True)
    truth = integrate(single_rhs(2.5), initial, times, refined=True)
    print("time_s position_error_norm_m velocity_error_norm_m/s")
    for time, predicted, actual in zip(times, newtonian, truth):
        dr = math.hypot(predicted[0]-actual[0], predicted[1]-actual[1])
        dv = math.hypot(predicted[2]-actual[2], predicted[3]-actual[3])
        print(f"{time:g} {dr:.12g} {dv:.12g}")
    for p in (2.0, 2.5):
        _, omega = binary_initial(p)
        print(f"Circular binary p={p:g}: omega={omega:.12g}rad/s; period={2*math.pi/omega:.12g}s")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--check", action="store_true", help="validate and compare existing JSON byte-for-byte; never write")
    modes.add_argument("--validate-only", action="store_true", help="run mathematical/reference checks; never read or write JSON")
    modes.add_argument("--report", action="store_true", help="print proposed-scale and forecast-error tables; never read or write JSON")
    args = parser.parse_args()
    if args.report:
        report()
        return
    vectors, trajectories = build_vectors()
    validate(trajectories)
    rendered = json.dumps(vectors, indent=2, allow_nan=False)+"\n"
    if args.validate_only:
        return
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_bytes() != rendered.encode("utf-8"):
            print(f"FAIL generated content differs from {OUTPUT.relative_to(ROOT)}", file=sys.stderr)
            raise SystemExit(1)
        print(f"PASS reproducible JSON: {len(vectors['cases'])} cases in {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_bytes(rendered.encode("utf-8"))
        print(f"WROTE {len(vectors['cases'])} cases to {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
