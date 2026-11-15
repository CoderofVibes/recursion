"""S5 well mathematics and deterministic reference vectors, not production code.

Imported by generate.py. SI throughout; numpy plus the Python standard library.
The smooth case uses independent midpoint and RK4 propagators. No seeded noise is
needed because these are exact field/integrator fixtures, not sensor simulations.
"""

from __future__ import annotations

from dataclasses import dataclass
from itertools import permutations
import math

import numpy as np


@dataclass(frozen=True)
class Well:
    id: str
    center: tuple[float, float, float]
    core_m: float = 1_000.0
    inner_m: float = 40_000.0
    outer_m: float = 50_000.0

    def __post_init__(self) -> None:
        if not (0 < self.core_m < self.inner_m < self.outer_m):
            raise ValueError("Require 0 < core < inner < outer")
        if not all(math.isfinite(v) for v in (*self.center, self.outer_m)):
            raise ValueError("Non-finite well geometry")


def smoothstep5(s: float) -> float:
    """Monotone C2 smootherstep on [0, 1]."""
    s = min(1.0, max(0.0, s))
    return s * s * s * (10.0 + s * (-15.0 + 6.0 * s))


def influence(radius: float, well: Well) -> float:
    if radius <= well.inner_m:
        return 1.0
    if radius >= well.outer_m:
        return 0.0
    return 1.0 - smoothstep5((radius - well.inner_m) / (well.outer_m - well.inner_m))


def response(position: np.ndarray, wells: tuple[Well, ...]) -> tuple[np.ndarray, float]:
    """Union-strength convex composition; return T and union influence.

    Core occupancy is an invalid state, to be intercepted by a swept core collision
    before this constitutive relation is evaluated. The field is not core softening.
    Sorting is part of deterministic floating-point summation, not a priority rule.
    """
    if len({w.id for w in wells}) != len(wells):
        raise ValueError("Duplicate well ID")
    union = 0.0
    weight = 0.0
    weighted_projector = np.zeros((3, 3))
    for well in sorted(wells, key=lambda w: w.id):
        relative = position - np.asarray(well.center)
        radius = float(np.linalg.norm(relative))
        if radius <= well.core_m:
            raise ValueError("Ship is at or inside an excluded well core")
        w = influence(radius, well)
        if w == 0.0:
            continue
        e = relative / radius
        weight += w
        # Stable evaluation of 1 - product(1 - w), including tiny influences.
        union += (1.0 - union) * w
        weighted_projector += w * np.outer(e, e)
    if weight == 0.0:
        return np.eye(3), 0.0
    return np.eye(3) - 2.0 * (union / weight) * weighted_projector, union


REFERENCE_RADIUS_M = 1_000_000.0
GRAVITY_EXPONENT = 2.5
SOURCE_GM = 10_000_000_000.0
SOURCE_CENTER = np.array([0.0, -2_000_000.0, 1_000_000.0])
EXHAUST_SPEED_M_S = 320.0 * 9.80665
BURN_FORCE_N = np.array([-24_000.0, 0.0, 0.0])
MAIN_WELL = Well("well-a", (0.0, 0.0, 0.0))


def gravity(position: np.ndarray) -> tuple[np.ndarray, float]:
    relative = position - SOURCE_CENTER
    radius = float(np.linalg.norm(relative))
    k = SOURCE_GM * REFERENCE_RADIUS_M ** (GRAVITY_EXPONENT - 2.0)
    acceleration = -k * relative / radius ** (GRAVITY_EXPONENT + 1.0)
    potential = -k / ((GRAVITY_EXPONENT - 1.0) * radius ** (GRAVITY_EXPONENT - 1.0))
    return acceleration, potential


def derivative(state: np.ndarray, wells: tuple[Well, ...], force: np.ndarray) -> np.ndarray:
    """State = x(3), v(3), m, Wnominal, Wfield, EmassTransport."""
    out = np.zeros(10)
    position, velocity, mass = state[:3], state[3:6], state[6]
    g, potential = gravity(position)
    transform, _ = response(position, wells)
    delivered = transform @ force
    mdot = -float(np.linalg.norm(force)) / EXHAUST_SPEED_M_S
    out[:3] = velocity
    out[3:6] = g + delivered / mass
    out[6] = mdot
    out[7] = float(np.dot(velocity, force))
    out[8] = float(np.dot(velocity, delivered - force))
    out[9] = mdot * (0.5 * float(np.dot(velocity, velocity)) + potential)
    return out


def advance(state: np.ndarray, h: float, wells: tuple[Well, ...], force: np.ndarray,
            method: str) -> np.ndarray:
    first = derivative(state, wells, force)
    if method == "midpoint":
        return state + h * derivative(state + 0.5 * h * first, wells, force)
    if method != "rk4":
        raise ValueError(method)
    second = derivative(state + 0.5 * h * first, wells, force)
    third = derivative(state + 0.5 * h * second, wells, force)
    fourth = derivative(state + h * third, wells, force)
    return state + (h / 6.0) * (first + 2 * second + 2 * third + fourth)


def hermite_position(left: np.ndarray, right: np.ndarray, h: float, fraction: float) -> np.ndarray:
    """Dense position used for the smooth fixture's bracketed shell event times."""
    f = fraction
    return ((2*f**3 - 3*f*f + 1) * left[:3]
            + (f**3 - 2*f*f + f) * h * left[3:6]
            + (-2*f**3 + 3*f*f) * right[:3]
            + (f**3 - f*f) * h * right[3:6])


def crossing_events(left: np.ndarray, right: np.ndarray, h: float, t: float) -> list[dict]:
    """Monotone-shell fixture detector, NOT a production general sweep algorithm."""
    result = []
    for name, radius in (("inner", 40_000.0), ("zero-response", 45_000.0), ("outer", 50_000.0)):
        d0 = float(np.linalg.norm(left[:3])) - radius
        d1 = float(np.linalg.norm(right[:3])) - radius
        if d0 * d1 >= 0.0:
            continue
        lo, hi = 0.0, 1.0
        for _ in range(55):
            mid = 0.5 * (lo + hi)
            dm = float(np.linalg.norm(hermite_position(left, right, h, mid))) - radius
            if (dm > 0) == (d0 > 0):
                lo = mid
            else:
                hi = mid
        result.append({"surface": name, "t_s": t + h * 0.5 * (lo + hi),
                       "direction": "outbound" if d1 > d0 else "inbound"})
    return result


def mechanical_energy(state: np.ndarray) -> float:
    return state[6] * (0.5 * float(np.dot(state[3:6], state[3:6])) + gravity(state[:3])[1])


def pack_state(state: np.ndarray) -> dict:
    return {"position_m": state[:3].tolist(), "velocity_m_s": state[3:6].tolist(),
            "mass_kg": float(state[6]), "nominal_propulsion_work_J": float(state[7]),
            "field_extra_work_J": float(state[8]), "mass_transport_energy_J": float(state[9])}


def propagate(initial: np.ndarray, duration: float, h: float, wells: tuple[Well, ...],
              force: np.ndarray, method: str) -> dict:
    count = round(duration / h)
    assert abs(count * h - duration) < 1e-12
    state = initial.copy()
    samples = [{"t_s": 0.0, **pack_state(state)}]
    events = []
    for i in range(count):
        previous = state
        state = advance(previous, h, wells, force, method)
        events.extend(crossing_events(previous, state, h, i*h))
        if (i + 1) % round(20.0 / h) == 0 or i + 1 == count:
            samples.append({"t_s": (i+1)*h, **pack_state(state)})
    change = mechanical_energy(state) - mechanical_energy(initial)
    accounted = float(np.sum(state[7:10]))
    return {"method": method, "step_s": h, "duration_s": duration,
            "initial": pack_state(initial), "final": pack_state(state),
            "samples": samples, "events": events,
            "mechanical_energy_change_J": change,
            "energy_ledger_residual_J": change - accounted}


def scalar_root(target: float) -> float:
    lo, hi = 0.0, 1.0
    for _ in range(80):
        mid = 0.5 * (lo + hi)
        if smoothstep5(mid) < target:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def swept_sphere_times(start: np.ndarray, end: np.ndarray, radius: float, duration: float) -> list[float]:
    """Exact constant-velocity segment/sphere intersections; catches outside/outside."""
    delta = end - start
    a = float(np.dot(delta, delta))
    b = 2.0 * float(np.dot(start, delta))
    c = float(np.dot(start, start)) - radius * radius
    discriminant = b*b - 4*a*c
    if a == 0.0 or discriminant < 0.0:
        return []
    roots = sorted({(-b - math.sqrt(discriminant)) / (2*a),
                    (-b + math.sqrt(discriminant)) / (2*a)})
    return [u * duration for u in roots if 0.0 <= u <= 1.0]


def build_vectors() -> dict:
    well = MAIN_WELL
    position = np.array([6_000.0, 8_000.0, 24_000.0])
    nominal = np.array([0.8, -0.2, 0.3])
    matrix, _ = response(position, (well,))
    e = position / np.linalg.norm(position)
    actual = matrix @ nominal
    radial = float(np.dot(nominal, e))
    assert np.allclose(actual, nominal - 2 * radial * e, rtol=0, atol=1e-14)
    assert abs(float(np.dot(actual, e)) + radial) < 1e-14
    assert np.allclose(actual - np.dot(actual, e)*e, nominal-radial*e, atol=1e-14)
    assert abs(np.linalg.norm(actual) - np.linalg.norm(nominal)) < 1e-14
    mid_matrix, _ = response(np.array([45_000.0, 0.0, 0.0]), (well,))
    assert np.array_equal(mid_matrix, np.diag([0.0, 1.0, 1.0]))
    assert np.array_equal(response(np.array([50_000.0, 0.0, 0.0]), (well,))[0], np.eye(3))
    core_rejections = 0
    for core_position in (np.zeros(3), np.array([500.0, 0.0, 0.0])):
        try:
            response(core_position, (well,))
        except ValueError:
            core_rejections += 1
    assert core_rejections == 2

    overlaps = (Well("x", (-30_000.0, 0.0, 0.0)),
                Well("y", (0.0, -30_000.0, 0.0)))
    overlap_matrix, union = response(np.zeros(3), overlaps)
    assert np.array_equal(overlap_matrix, np.diag([0.0, 0.0, 1.0]))
    triple = (*overlaps, Well("z", (0.0, 0.0, -45_000.0)))
    overlap_tests = []
    for test_position in (np.zeros(3), np.array([8000., 9000., 15000.]), np.array([0., 0., 100000.])):
        base, strength = response(test_position, triple)
        for order in permutations(triple):
            assert np.array_equal(base, response(test_position, order)[0])
        eigen = np.linalg.eigvalsh(base)
        assert max(abs(eigen)) <= 1.0 + 2e-15
        overlap_tests.append({"position_m": test_position.tolist(), "matrix": base.tolist(),
                              "union_strength": strength, "eigenvalues": eigen.tolist()})

    low = well.inner_m + (well.outer_m-well.inner_m) * scalar_root(0.45)
    high = well.inner_m + (well.outer_m-well.inner_m) * scalar_root(0.55)
    hinge_seconds = (high-low) / 100.0
    hinge = {"criterion": "abs(radial gain) <= 0.1", "inner_m": low, "outer_m": high,
             "width_m": high-low, "crossing_at_100_m_s_s": hinge_seconds,
             "propellant_at_24_kN_320_s_kg": hinge_seconds * 24_000.0 / EXHAUST_SPEED_M_S,
             "midpoint_radial_gain": 0.0, "midpoint_tangential_gains": [1.0, 1.0]}

    initial = np.array([-39_000., 0., 0., -150., 0., 0., 30_400., 0., 0., 0.])
    reference = propagate(initial, 100.0, 1/32, (well,), BURN_FORCE_N, "rk4")
    finer = propagate(initial, 100.0, 1/64, (well,), BURN_FORCE_N, "rk4")
    ref_final = np.asarray(reference["final"]["position_m"])
    ref_velocity = np.asarray(reference["final"]["velocity_m_s"])
    reference_check = {"comparison_step_s": 1/64,
                       "position_difference_m": float(np.linalg.norm(ref_final-np.asarray(finer["final"]["position_m"]))),
                       "velocity_difference_m_s": float(np.linalg.norm(ref_velocity-np.asarray(finer["final"]["velocity_m_s"]))) }
    assert reference_check["position_difference_m"] < 2e-8
    assert reference_check["velocity_difference_m_s"] < 2e-10
    assert abs(reference["energy_ledger_residual_J"]) < 0.01
    assert [event["surface"] for event in reference["events"]] == ["inner", "zero-response", "outer"]
    assert reference["final"]["mass_kg"] < initial[6]
    convergence = []
    for h in (1.0, 0.5, 0.25, 0.125, 0.0625):
        test = propagate(initial, 100.0, h, (well,), BURN_FORCE_N, "midpoint")
        final = test["final"]
        error_p = float(np.linalg.norm(np.asarray(final["position_m"])-ref_final))
        error_v = float(np.linalg.norm(np.asarray(final["velocity_m_s"])-ref_velocity))
        event_error = max(abs(a["t_s"]-b["t_s"]) for a, b in zip(test["events"], reference["events"], strict=True))
        convergence.append({"step_s": h, "position_error_m": error_p, "velocity_error_m_s": error_v,
                            "max_event_time_error_s": event_error,
                            "energy_ledger_residual_J": test["energy_ledger_residual_J"]})
    ratios = [convergence[i]["position_error_m"]/convergence[i+1]["position_error_m"]
              for i in range(len(convergence)-1)]
    assert all(3.8 < ratio < 4.2 for ratio in ratios)
    assert convergence[-1]["position_error_m"] < 0.01
    assert convergence[-1]["velocity_error_m_s"] < 1e-5
    assert convergence[-1]["max_event_time_error_s"] < 1e-4
    assert abs(convergence[-1]["energy_ledger_residual_J"]) < 2.0
    consumed = initial[6]-reference["final"]["mass_kg"]
    assert abs(consumed - 100.0*24_000.0/EXHAUST_SPEED_M_S) < 1e-7

    # A coast traverses the entire well off-axis; full P4 gravity remains active.
    coast_initial = np.array([-60_000., 8_000., 6_000., 200., 0., 0., 30_400., 0., 0., 0.])
    coast_on = propagate(coast_initial, 600.0, 0.5, (well,), np.zeros(3), "midpoint")
    coast_off = propagate(coast_initial, 600.0, 0.5, (), np.zeros(3), "midpoint")
    assert coast_on == coast_off
    assert coast_on["final"]["field_extra_work_J"] == 0.0
    assert coast_on["final"]["mass_kg"] == coast_initial[6]
    assert len(coast_on["events"]) == 6

    hard_start = np.array([-60_000., 10_000., 0.])
    hard_end = np.array([60_000., 10_000., 0.])
    hard_times = swept_sphere_times(hard_start, hard_end, 50_000.0, 1.0)
    assert len(hard_times) == 2
    assert np.linalg.norm(hard_start) > 50_000.0 and np.linalg.norm(hard_end) > 50_000.0
    return {
        "schema": "recursion.s5.wells.v1",
        "claims": {"law": "FICTIONAL", "geometry_ratings": "ASSUMED", "numerics": "DEMONSTRATED by assertions in wells_reference.py"},
        "well": {"id": well.id, "center_m": list(well.center), "core_m": well.core_m,
                 "inner_m": well.inner_m, "outer_m": well.outer_m,
                 "overlap": "B=(1-product(1-w))/sum(w) * sum(w e eT); T=I-2B"},
        "projection": {"position_m": position.tolist(), "nominal_acceleration_m_s2": nominal.tolist(),
                       "actual_acceleration_m_s2": actual.tolist(), "matrix": matrix.tolist()},
        "hinge": hinge,
        "overlap": {"orthogonal_full_matrix": overlap_matrix.tolist(), "union_strength": union,
                    "orthogonal_full_well_ids": [w.id for w in overlaps],
                    "input_wells": [{"id": w.id, "center_m": list(w.center),
                                     "core_m": w.core_m, "inner_m": w.inner_m,
                                     "outer_m": w.outer_m} for w in triple],
                    "cases": overlap_tests, "permutations_per_case": 6, "core_rejections": core_rejections},
        "burn": {"force_inertial_N": BURN_FORCE_N.tolist(), "isp_s": 320.0,
                 "g0_m_s2": 9.80665, "source_position_m": SOURCE_CENTER.tolist(),
                 "source_gm_m3_s2": SOURCE_GM, "shared_reference_radius_m": REFERENCE_RADIUS_M,
                 "gravity_exponent": GRAVITY_EXPONENT, "reference": reference,
                 "reference_self_check": reference_check, "midpoint_convergence": convergence,
                 "position_error_halving_ratios": ratios,
                 "recommended_comparison_tolerances": {"position_m": 0.01, "velocity_m_s": 1e-5,
                                                        "event_time_s": 1e-4, "mass_kg": 1e-6,
                                                        "energy_ledger_residual_J": 2.0}},
        "coast": {"field_on_equals_field_off": True,
                  "force_inertial_N": [0.0, 0.0, 0.0],
                  "source_position_m": SOURCE_CENTER.tolist(), "source_gm_m3_s2": SOURCE_GM,
                  "shared_reference_radius_m": REFERENCE_RADIUS_M,
                  "gravity_exponent": GRAVITY_EXPONENT, "result": coast_on},
        "hard_boundary_diagnostic": {"purpose": "Geometric diagnostic only: endpoint booleans miss both crossings",
                                     "start_m": hard_start.tolist(), "end_m": hard_end.tolist(),
                                     "radius_m": 50_000.0, "duration_s": 1.0,
                                     "event_times_s": hard_times, "propagated_burn": False},
        "limitations": ["No production event solver, complete ship-system simulation, sensor fit, or playtest.",
                        "Smooth-fixture event locator brackets monotone crossings; general sweeps must isolate all roots.",
                        "Coast field equality is exact at the same step, not a claim of exact P4 integration.",
                        "Field work is in the declared inertial frame; mass-transport term is necessary for variable mass."]
    }
