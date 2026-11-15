"""S5 lattice reference: fictional intensity, real 3D distances, deterministic checks.

No game imports. SI geometry/time; intensity U and exposure U*s are fictional.
Capsules are reference geometry, not a replacement for 2G's convex hull prisms.
"""

from dataclasses import dataclass
from math import ceil, cos, pi, sin, sqrt

import numpy as np


def vec(values):
    return np.asarray(values, dtype=float)


def rotation(axis, angle):
    axis = vec(axis)
    axis /= np.linalg.norm(axis)
    x, y, z = axis
    cross = np.array([[0, -z, y], [z, 0, -x], [-y, x, 0]])
    return np.eye(3) * cos(angle) + (1 - cos(angle)) * np.outer(axis, axis) + sin(angle) * cross


def point_segment_distance(p, a, b):
    d = b - a
    dd = float(d @ d)
    u = np.clip(float((p - a) @ d) / dd, 0, 1) if dd else 0
    return float(np.linalg.norm(p - a - u * d))


def segment_distance(a, b, c, d):
    """Constrained closest distance: interior stationary point + four edges.

    Near-parallel lines use SVD instead of subtracting nearly equal products.
    This floating-point reference is verified at the fixture scales, not an exact
    arithmetic collision predicate for unrestricted world coordinates.
    """
    u, v, w = b - a, d - c, a - c
    aa, bb, cc = float(u @ u), float(u @ v), float(v @ v)
    dd, ee = float(u @ w), float(v @ w)
    candidates = [point_segment_distance(a, c, d), point_segment_distance(b, c, d),
                  point_segment_distance(c, a, b), point_segment_distance(d, a, b)]
    determinant = aa * cc - bb * bb
    if determinant > 1e-14 * aa * cc:
        s = (bb * ee - cc * dd) / determinant
        t = (aa * ee - bb * dd) / determinant
        if 0 <= s <= 1 and 0 <= t <= 1:
            candidates.append(float(np.linalg.norm(w + s * u - t * v)))
    elif aa > 0 and cc > 0:
        # Exact parallel lines attain their minimum on one of the four edges.
        cross = np.cross(u, v)
        if float(cross @ cross) > 0:
            st, _, _, _ = np.linalg.lstsq(np.column_stack((u, -v)), -w, rcond=None)
            if 0 <= st[0] <= 1 and 0 <= st[1] <= 1:
                candidates.append(float(np.linalg.norm(w + st[0] * u - st[1] * v)))
    return min(candidates)


@dataclass(frozen=True)
class Sheet:
    id: str
    centre: np.ndarray
    basis: np.ndarray  # columns normal, u, v; right-handed body-to-inertial rotation
    segments: tuple
    width: float = 4.0
    peak: float = 20.0

    def local(self, p):
        return self.basis.T @ (p - self.centre)

    def distance(self, p):
        p = self.local(p)
        return min(point_segment_distance(p, a, b) for a, b in self.segments)

    def intensity(self, p):
        return profile(self.distance(p), self.width, self.peak)

    def capsule_distance(self, a, b, radius):
        a, b = self.local(a), self.local(b)
        return max(0.0, min(segment_distance(a, b, c, d) for c, d in self.segments) - radius)

    def metadata(self):
        return {"id": self.id, "centre_m": self.centre.tolist(),
                "basis_columns_normal_u_v": self.basis.tolist(),
                "segments_local_m": [[a.tolist(), b.tolist()] for a, b in self.segments],
                "influence_radius_m": self.width, "peak_intensity_U": self.peak}


def grid_sheet(id="sheet-0", centre=(0, 0, 0), basis=None, pitch=80.0, half_extent=200.0):
    """Finite segments, no infinite repeated distance and no invisible perimeter wall."""
    lines = []
    limit = ceil(half_extent / pitch) + 1
    for k in range(-limit, limit + 1):
        q = (k + 0.5) * pitch
        if abs(q) <= half_extent:
            lines.append((vec((0, q, -half_extent)), vec((0, q, half_extent))))
            lines.append((vec((0, -half_extent, q)), vec((0, half_extent, q))))
    return Sheet(id, vec(centre), np.eye(3) if basis is None else basis, tuple(lines))


def profile(distance, width=4.0, peak=20.0):
    return peak * max(0.0, 1 - (distance / width) ** 2) ** 4


def analytic_dose(impact, speed=2.0, width=4.0, peak=20.0):
    return (256 / 315) * peak * width / abs(speed) * max(0.0, 1 - (impact / width) ** 2) ** 4.5


def midpoint_dose(fn, start, end, dt):
    n = int(round((end - start) / dt))
    assert abs(n * dt - (end - start)) < 1e-10
    return sum(fn(start + (k + 0.5) * dt) * dt for k in range(n))


def crossing_integral(t, impact=2.0, speed=2.0, width=4.0, peak=20.0):
    """Exact cumulative point exposure from first entry; x=v*t, t=0 closest."""
    amplitude = max(0.0, 1 - (impact / width) ** 2)
    if amplitude == 0:
        return 0.0
    extent = width * sqrt(amplitude) / abs(speed)
    u = max(-1.0, min(1.0, t / extent))
    primitive = u - 4 * u**3 / 3 + 6 * u**5 / 5 - 4 * u**7 / 7 + u**9 / 9
    return peak * amplitude**4 * extent * (primitive + 128 / 315)


def bisect_monotone(fn, target, lo, hi):
    for _ in range(64):
        mid = (lo + hi) / 2
        if fn(mid) < target:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def glancing_electrical_vector():
    """Baseline standard profile; isolate and deliberately reset between three passes.

    Fractional exposure crossings are analytic. No full electrical/thermal simulation
    is claimed. Protected latch -> local power off; dose continues while off.
    """
    impact, speed, width, peak = 2.0, 2.0, 4.0, 20.0
    dose = analytic_dose(impact, speed, width, peak)
    extent = sqrt(width * width - impact * impact) / speed
    total, events, intervals = 0.0, [], []
    for passage in range(3):
        epoch = 10.0 * passage
        begin, finish = total, total + dose
        thresholds = []
        for step, kind in ((6.0, "upset"), (20.0, "protected-latch-trip")):
            for n in range(int(begin // step) + 1, int(finish // step) + 1):
                thresholds.append((n * step, kind))
        powered = True
        for level, kind in sorted(thresholds, key=lambda e: (e[0], e[1] != "protected-latch-trip")):
            t = epoch + extent + bisect_monotone(crossing_integral, level - begin, -extent, extent)
            events.append({"t_s": t, "dose_Us": level, "kind": kind,
                           "emitted": powered, "cursor_advanced": True})
            if kind == "protected-latch-trip" and powered:
                powered = False
        intervals.append({"pass": passage + 1, "start_s": epoch, "end_s": epoch + 2 * extent,
                          "closest_approach_s": epoch + extent,
                          "point_start_m": [-speed * extent, 38, 0],
                          "point_end_m": [speed * extent, 38, 0],
                          "dose_before_Us": begin, "dose_after_Us": finish,
                          "powered_at_end": powered})
        total = finish
    leakage = 1 + 0.25 * max(0.0, min(1.0, (total - 20.0) / 60.0))
    assert 20 < total < 80
    assert len([e for e in events if e["kind"] == "upset" and e["emitted"]]) == 3
    assert len([e for e in events if e["kind"] == "protected-latch-trip" and e["emitted"]]) == 1
    assert events[-1]["kind"] == "upset" and not events[-1]["emitted"]
    powered_dwell = 2 * width * sqrt(1 - (10 / peak) ** 0.25) / speed
    assert powered_dwell > 0.1
    return {"point_path_m": "[2*t, 38, 0], closest approach t=0 to strand [0,40,z]",
            "impact_m": impact, "speed_m_s": speed, "intensity_peak_U": profile(impact),
            "raw_exposure_per_pass_Us": dose, "standard_profile": {
                "susceptibility": 1, "degradation_start_Us": 20, "failure_Us": 80,
                "upset_interval_Us": 6, "latch_interval_Us": 20,
                "burnout_intensity_U": 10, "burnout_dwell_s": 0.1},
            "passes": intervals, "events": events, "total_exposure_Us": total,
            "permanent_failure": False, "operating_draw_multiplier_after_reset": leakage,
            "hardened_exposure_same_path_Us": total * 0.5,
            "passive_exposure_same_path_Us": 0.0,
            "unpowered_same_path_exposure_Us": total,
            "reset_clears_exposure": False,
            "central_powered_crossing": {"raw_exposure_Us": analytic_dose(0),
                "time_above_10U_s": powered_dwell,
                "burnout_if_energized_for_first_0_1s_above_threshold": True}}


HULL = (vec((-6, 0, 0)), vec((6, 0, 0)), 2.0)
RADIATOR = (vec((0, 3, 0)), vec((0, 14, 0)), 0.5)
STOWED = (vec((0, 3, 0)), vec((0, 5, 0)), 0.5)


def clearance(sheet, capsule, position, attitude=None):
    a, b, radius = capsule
    q = np.eye(3) if attitude is None else attitude
    return sheet.capsule_distance(position + q @ a, position + q @ b, radius) - sheet.width


def swept_bounds(distance_at, t0, t1, speed_bound, tolerance=0.02):
    """Certify minimum clearance bracket with a Lipschitz/Hausdorff speed bound.

    Adaptive binary subdivision is deterministic inside an externally fixed tick.
    Every time is covered, including intervals with safe endpoints. The supplied
    speed bound must bound EVERY material point and include deployment and rotation.
    """
    leaves = []
    stack = [(t0, t1)]
    evaluations = 0
    while stack:
        lo, hi = stack.pop()
        mid = (lo + hi) / 2
        value = distance_at(mid)
        evaluations += 1
        error = speed_bound * (hi - lo) / 2
        if error <= tolerance:
            leaves.append((value - error, value))
        else:
            if evaluations > 100000:
                raise RuntimeError("sweep budget exhausted: unresolved, never silently clear")
            stack.extend([(mid, hi), (lo, mid)])
    lower, upper = min(a for a, b in leaves), min(b for a, b in leaves)
    return {"lower_m": lower, "upper_m": upper, "midpoint_evaluations": evaluations,
            "tolerance_m": tolerance, "material_speed_bound_m_s": speed_bound,
            "classification": "clear" if lower > 0 else "exposed" if upper < 0 else "unresolved"}


def build_vectors():
    sheet = grid_sheet()
    checks = []

    def check(name, condition):
        assert condition, name
        checks.append(name)

    check("segments-cross-in-3d", segment_distance(vec((0, -1, 0)), vec((0, 1, 0)),
          vec((-1, 0, 0)), vec((1, 0, 0))) == 0)
    check("parallel-and-degenerate-segments", abs(segment_distance(vec((0, 0, 0)), vec((1, 0, 0)),
          vec((0, 3, 0)), vec((1, 3, 0))) - 3) < 1e-12 and
          point_segment_distance(vec((1, 2, 2)), vec((0, 0, 0)), vec((0, 0, 0))) == 3)
    check("near-parallel-interior-crossing", segment_distance(vec((-1e9, 0, 0)), vec((1e9, 0, 0)),
          vec((-1e9, -10, 0)), vec((1e9, 10, 0))) < 1e-6)
    check("clear-opening-exact-zero", sheet.intensity(vec((0, 0, 0))) == 0)
    check("finite-sheet-no-periodic-wall", sheet.intensity(vec((0, 40, 205))) == 0)
    check("junction-not-double-counted", sheet.intensity(vec((0, 40, 40))) == 20)
    check("different-sheets-add", sum(s.intensity(vec((0, 40, 40))) for s in (sheet, sheet)) == 40)

    # A rigid coordinate change exercises all three axes without changing the answer.
    q = rotation((1, 2, 3), 0.7)
    shift = vec((80, -50, 17))
    tilted = grid_sheet("tilted", shift, q)
    check("rigid-frame-invariant", abs(tilted.intensity(shift + q @ vec((1, 38, 0))) -
          sheet.intensity(vec((1, 38, 0)))) < 1e-10)
    layer_specs = [grid_sheet(f"layer-{i}", (300 * i, 9 * (i % 3 - 1), 11 * (i % 2)),
                  rotation((0, 1, 1), (i % 3 - 1) * 12 * pi / 180)).metadata() for i in range(8)]

    passes = []
    for offset, label in ((0, "opening-with-deployed-radiator"), (24, "centre-clear-radiator-exposed")):
        pose = lambda t, offset=offset: vec((2 * t - 16, offset, 0))
        component_results = {}
        for name, capsule in (("hull", HULL), ("radiator", RADIATOR), ("stowed-comparison", STOWED)):
            bounds = swept_bounds(lambda t: clearance(sheet, capsule, pose(t)), 0, 16, 2.0)
            dose_fn = lambda t: profile(sheet.capsule_distance(pose(t) + capsule[0],
                                                               pose(t) + capsule[1], capsule[2]))
            # At fixed attitude normal translation, minimum occurs at x=0 (or a hull plateau).
            minimum = clearance(sheet, capsule, pose(8))
            check(label + "-" + name + "-bound", bounds["lower_m"] <= minimum <= bounds["upper_m"] + 1e-12)
            dose_values = [midpoint_dose(dose_fn, 0, 16, dt) for dt in (0.125, 0.0625, 0.03125)]
            check(label + "-" + name + "-dose-converges", abs(dose_values[-1] - dose_values[-2]) < 1e-4)
            component_results[name] = {"capsule_body_m": [capsule[0].tolist(), capsule[1].tolist()],
                "capsule_radius_m": capsule[2], "minimum_clearance_m": minimum, "sweep": bounds,
                "raw_exposure_Us_dt_0_125_0_0625_0_03125": dose_values}
        passes.append({"id": label, "start_com_m": pose(0).tolist(), "end_com_m": pose(16).tolist(),
                       "duration_s": 16, "velocity_m_s": [2, 0, 0], "attitude_wxyz": [1, 0, 0, 0],
                       "com_minimum_clearance_m": sheet.distance(pose(8)) - sheet.width,
                       "components": component_results})
    check("deployed-pass-clear", passes[0]["components"]["radiator"]["minimum_clearance_m"] == 21.5)
    check("com-only-would-miss", passes[1]["com_minimum_clearance_m"] == 12 and
          passes[1]["components"]["radiator"]["minimum_clearance_m"] == -2.5)
    check("stowing-changes-clearance", passes[1]["components"]["stowed-comparison"]["minimum_clearance_m"] == 6.5)

    # End poses clear; a moving deployed appendage sweeps into a strand halfway through.
    # Rotation is about local z, i.e. a yaw motion; no manual roll control is assumed.
    long_boom = (vec((0, 3, 0)), vec((0, 34, 0)), 0.5)
    p = vec((0, 5, 0))
    angle = 0.6
    fn = lambda t: clearance(sheet, long_boom, p, rotation((0, 0, 1), -angle + 2 * angle * t))
    rotating = swept_bounds(fn, 0, 1, 34.5 * 2 * angle, tolerance=0.05)
    check("rotation-safe-ends-unsafe-middle", fn(0) > 0 and fn(1) > 0 and fn(0.5) < 0)
    check("sweep-detects-rotation", rotating["classification"] == "exposed")

    # A point crosses a full influence tube in one coarse 1 s tick; endpoint-only misses it.
    fast = lambda t: float(np.linalg.norm(vec((20 * t - 10, 0, 0)))) - 4
    fast_sweep = swept_bounds(fast, 0, 1, 20, tolerance=0.02)
    check("fast-outside-outside-crossing", fast(0) > 0 and fast(1) > 0 and fast_sweep["upper_m"] < 0)

    doses = []
    for impact in (0.0, 2.0, 3.2, 4.0):
        expected = analytic_dose(impact)
        fn = lambda t: profile(sqrt((2 * t) ** 2 + impact**2))
        values = [midpoint_dose(fn, -3, 3, dt) for dt in (0.125, 0.0625, 0.03125)]
        check("analytic-dose-b=" + str(impact), abs(values[-1] - expected) < 1e-6)
        check("dose-speed-scaling-b=" + str(impact), abs(analytic_dose(impact, speed=4) * 2 - expected) < 1e-12)
        doses.append({"impact_m": impact, "analytic_exposure_Us": expected,
                      "speed_m_s": 2.0, "integration_interval_s": [-3, 3],
                      "influence_radius_m": 4.0, "peak_intensity_U": 20.0,
                      "midpoint_exposure_Us_dt_0_125_0_0625_0_03125": values})

    # Max |dI/dd| = 8 I0/w * (1/sqrt(7)) * (6/7)^3, useful for conservative quadrature bounds.
    lipschitz = 8 * sheet.peak / sheet.width / sqrt(7) * (6 / 7) ** 3
    return {"schema": "s5-lattice-v1", "units": {"length": "m", "time": "s", "intensity": "fictional U", "exposure": "fictional U*s"},
            "reference_sheet": sheet.metadata(), "staggered_tilted_eight_sheet_spec": layer_specs,
            "sheet_spec_note": "Finite geometry example, no path feasibility or playability claim.",
            "profile_lipschitz_U_per_m": lipschitz, "passes": passes,
            "rigid_transform_check": {"translation_m": shift.tolist(), "rotation_matrix": q.tolist()},
            "rotating_appendage": {"capsule_body_m": [long_boom[0].tolist(), long_boom[1].tolist()],
                "radius_m": long_boom[2], "com_m": p.tolist(), "yaw_start_end_rad": [-angle, angle],
                "interval_s": [0, 1],
                "endpoint_clearances_m": [fn_value for fn_value in (
                    clearance(sheet, long_boom, p, rotation((0, 0, 1), -angle)),
                    clearance(sheet, long_boom, p, rotation((0, 0, 1), angle)))],
                "midpoint_clearance_m": clearance(sheet, long_boom, p), "sweep": rotating},
            "fast_crossing": {"start_relative_to_strand_m": [-10, 0, 0],
                              "end_relative_to_strand_m": [10, 0, 0],
                              "interval_s": [0, 1], "influence_radius_m": 4.0,
                              "sweep": fast_sweep}, "analytic_crossings": doses,
            "glancing_electrical": glancing_electrical_vector(), "checks": checks}
