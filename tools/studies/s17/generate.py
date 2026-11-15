"""S17 independent numerical study. Python 3.14 + numpy; no game imports.

Run from any directory: python tools/studies/s17/generate.py
All ratings are assumed game values. Exposure is fictional U s, never Gy/Sv.
"""

from __future__ import annotations

import hashlib
import json
from math import cos, pi, sin, sqrt
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
BASELINE_BYTES = (ROOT / "data/ship-baseline.json").read_bytes()
BASE = json.loads(BASELINE_BYTES)
PITCH, WIDTH, PEAK = 80.0, 4.0, 20.0
COM = np.array([-0.3329, 0.0021, -0.1047])  # rounded full-tank datum offset
CHECKS = []


def check(name, passed):
    if not bool(passed):
        raise AssertionError(name)
    CHECKS.append(name)


def clean(value):
    if isinstance(value, np.ndarray):
        return clean(value.tolist())
    if isinstance(value, dict):
        return {k: clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [clean(v) for v in value]
    if isinstance(value, (float, np.floating)):
        return round(float(value), 10) if abs(value) > 5e-11 else 0.0
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.bool_):
        return bool(value)
    return value


def intensity(distance):
    return PEAK * max(0.0, 1.0 - (distance / WIDTH) ** 2) ** 4


def finite_intensity(point, sheet):
    p = np.array(sheet["basis"]).T @ (np.array(point)-sheet["opening_centre_m"])
    closest = float("inf")
    for a, b in sheet["segments_local_m"]:
        a, b = np.array(a), np.array(b)
        delta = b-a
        q = np.clip((p-a)@delta/(delta@delta), 0, 1)
        closest = min(closest, np.linalg.norm(p-a-q*delta))
    return intensity(closest)


def primitive(x, impact):
    """Integral from -infinity to x of I(sqrt(x*x + impact*impact)) dx."""
    a = max(0.0, 1.0 - (impact / WIDTH) ** 2)
    if a == 0:
        return 0.0
    extent = WIDTH * sqrt(a)
    u = min(1.0, max(-1.0, x / extent))
    return PEAK * a**4 * extent * (
        u - 4*u**3/3 + 6*u**5/5 - 4*u**7/7 + u**9/9 + 128/315
    )


def grid_gap(lo, hi, phase=0.0):
    """Distance of a closed projected interval to the infinite pitch grid.

    Entry fixtures are inside the finite patch; using infinite lines elsewhere
    is a conservative clearance lower bound, never a finite-edge blocker.
    """
    k = np.ceil((lo - phase) / PITCH)
    if phase + k * PITCH <= hi:
        return 0.0
    return min(phase + k * PITCH - hi, lo - (phase + (k-1)*PITCH))


def component_boxes(configuration):
    boxes = {}
    for e in BASE["equipment"]:
        p = np.array(e["position"], dtype=float)
        boxes[e["id"]] = (p, p)
    for a in BASE["configuration"]["appendages"]:
        deployed = configuration == "allDeployed" or (
            configuration == "radiators" and a["id"].startswith("radiator")
        )
        polygon = np.array(a["deployedPolygon" if deployed else "stowedPolygon"])
        boxes[a["id"]] = (
            np.r_[polygon.min(axis=0), a["zMin"]],
            np.r_[polygon.max(axis=0), a["zMax"]],
        )
    return boxes


def raw_dose(t, box, start, speed):
    """Exact worst-point integral for a nonrotating box crossing entry sheet.

    The box may straddle x=0 for a finite time; then its maximum intensity is
    constant even though the most exposed material point moves. Integral(max I),
    not max(integral I). No component can span two sheets in these fixtures.
    """
    lo, hi = box
    b = min(grid_gap(start[1]+lo[1], start[1]+hi[1]),
            grid_gap(start[2]+lo[2], start[2]+hi[2]))
    if b >= WIDTH:
        return 0.0
    front = (-start[0]-hi[0])/speed
    back = (-start[0]-lo[0])/speed
    half = primitive(0.0, b)/speed
    if t < front:
        return primitive(speed*(t-front), b)/speed
    if t <= back:
        return half + (t-front)*intensity(b)
    return half + (back-front)*intensity(b) + (
        primitive(speed*(t-back), b)-primitive(0.0, b)
    )/speed


def dose_time(target, box, start, speed, end):
    if raw_dose(end, box, start, speed) < target:
        return None
    lo, hi = 0.0, end
    for _ in range(60):
        mid = (lo+hi)/2
        if raw_dose(mid, box, start, speed) < target:
            lo = mid
        else:
            hi = mid
    return (lo+hi)/2


def high_interval(box, start, speed, threshold):
    lo, hi = box
    b = min(grid_gap(start[1]+lo[1], start[1]+hi[1]),
            grid_gap(start[2]+lo[2], start[2]+hi[2]))
    r2 = WIDTH**2 * (1-(threshold/PEAK)**0.25) - b*b
    if r2 <= 0:
        return None
    reach = sqrt(r2)
    return ((-start[0]-hi[0]-reach)/speed,
            (-start[0]-lo[0]+reach)/speed)


def entry_case(name, y, z, speed=2.0, configuration="radiators", all_off=False,
               hardened_console=True):
    start = np.array([-24.0, y, z])
    end = 48/speed
    boxes = component_boxes(configuration)
    eq = {e["id"]: dict(e) for e in BASE["equipment"]}
    if hardened_console:
        eq["console"]["radiationProfile"] = "hardened"
    candidates = []
    for id, e in eq.items():
        p = BASE["radiation"]["profiles"][e["radiationProfile"]]
        s = p["susceptibility"]
        if not s:
            continue
        d = s*raw_dose(end, boxes[id], start, speed)
        for key, kind in [("failureExposure", "dose-failure"),
                          ("latchInterval", "trip"), ("upsetInterval", "upset")]:
            step = p[key]
            if not step:
                continue
            count = int(d/step) if kind != "dose-failure" else int(d >= step)
            for k in range(1, count+1):
                t = dose_time(step*k/s, boxes[id], start, speed, end)
                candidates.append((t, 0 if kind == "dose-failure" else 1 if kind == "trip" else 2,
                                   id, kind))
        interval = high_interval(boxes[id], start, speed, p["burnoutIntensity"])
        if interval and interval[1]-max(0, interval[0]) >= BASE["radiation"]["burnoutDwell"]:
            candidates.append((max(0, interval[0])+0.1, 0, id, "burnout"))
    failed, tripped, events = set(), set(), []

    def powered(id):
        if all_off or id in failed or id in tripped:
            return False
        e = eq[id]
        if e["initialMode"] in ("off", "stowed", "hold"):
            return False
        # Idle battery switching/source contactors are energized. Hold motors
        # are not: appendage damage is still integrated while unpowered.
        bus = e.get("bus")
        dead = failed | tripped
        if bus == "essential":
            return not {"pdu-a", "pdu-b"}.issubset(dead)
        if bus in ("main-a", "main-b", "payload"):
            pdu = "pdu-a" if bus == "main-a" else "pdu-b"
            return pdu not in dead
        return False

    loss = None
    for t, _, id, kind in sorted(candidates):
        if id in failed or (kind != "dose-failure" and not powered(id)):
            continue
        # A burner must have remained energized for the whole 0.1 s dwell.
        # In this fixture supplies only disappear; no resets/power-on occurs.
        if kind in ("burnout", "dose-failure"):
            failed.add(id)
        elif kind == "trip":
            tripped.add(id)
        events.append({"t_s": t, "equipment": id, "kind": kind})
        if {"pdu-a", "pdu-b"}.issubset(failed):
            loss = t
            break
    stop = loss if loss is not None else end
    doses = {}
    for id, e in eq.items():
        p = BASE["radiation"]["profiles"][e["radiationProfile"]]
        raw = raw_dose(stop, boxes[id], start, speed)
        doses[id] = {"raw_U_s": raw, "weighted_U_s": raw*p["susceptibility"],
                     "profile": e["radiationProfile"],
                     "state": "failed" if id in failed else "tripped" if id in tripped else "intact"}
    first = next((e["t_s"] for e in events if e["kind"] in ("burnout", "dose-failure")), None)
    trace = []
    for t in sorted(set([*np.arange(0, stop, .5), stop])):
        row = {"t_s": t, "datum_x_m": start[0]+speed*t, "components": {}}
        for id in ("camera", "pdu-a", "radiator-right"):
            raw = raw_dose(t, boxes[id], start, speed)
            susceptibility = BASE["radiation"]["profiles"][eq[id]["radiationProfile"]]["susceptibility"]
            row["components"][id] = {"raw_U_s": raw, "weighted_U_s": raw*susceptibility}
        trace.append(row)
    return {"id": name, "datum_start_m": start, "velocity_m_s": [speed, 0, 0],
            "configuration": configuration, "all_off": all_off,
            "profile_overrides": {"console": "hardened"} if hardened_console else {},
            "stop_s": stop, "loss_s": loss,
            "first_permanent_failure_s": first,
            "readable_interval_s": None if loss is None or first is None else loss-first,
            "events": events, "component_doses": doses, "dose_trace": trace}


def rotation(yaw, pitch, roll):
    cy, sy, cp, sp, cr, sr = cos(yaw), sin(yaw), cos(pitch), sin(pitch), cos(roll), sin(roll)
    return np.array([[cy, -sy, 0], [sy, cy, 0], [0, 0, 1]]) @ np.array(
        [[cp, 0, sp], [0, 1, 0], [-sp, 0, cp]]) @ np.array(
        [[1, 0, 0], [0, cr, -sr], [0, sr, cr]])


def hull_boxes(configuration="allDeployed"):
    boxes = {"pressure-hull": (np.array([-8., -2.5, -2.5]), np.array([8., 2.5, 2.5]))}
    components = component_boxes(configuration)
    for a in BASE["configuration"]["appendages"]:
        boxes[a["id"]] = components[a["id"]]
    # Explicit S17 conservative additions: the game's present envelope omits
    # these parts. Proposed sizing, not measured CAD or a baseline modification.
    boxes.update({
        "camera-guard": (np.array([6.5, -.5, -2.7]), np.array([7.5, .5, -1.7])),
        "antenna-guard": (np.array([5.75, -.25, 2.5]), np.array([6.25, .25, 4.])),
        "engine-guard": (np.array([-9.75, -.75, -.75]), np.array([-7., .75, .75])),
        "rcs-guard": (np.array([-5.35, -2.35, -.35]), np.array([5.35, 2.35, .35])),
    })
    return boxes


def sheet_clearance_lower(datum, sheet, boxes):
    """Interval projection lower bound to infinite lines (finite lines safer)."""
    basis, centre = np.array(sheet["basis"]), np.array(sheet["opening_centre_m"])
    minimum = float("inf")
    for lo, hi in boxes.values():
        centre_local = basis.T @ (datum+(lo+hi)/2-centre)
        radius = np.abs(basis.T) @ ((hi-lo)/2)
        low, high = centre_local-radius, centre_local+radius
        normal_gap = max(0., low[0], -high[0])
        transverse = min(grid_gap(low[1], high[1], PITCH/2),
                         grid_gap(low[2], high[2], PITCH/2))
        minimum = min(minimum, sqrt(normal_gap**2+transverse**2)-WIDTH)
    return minimum


def stack():
    yz = [(40, 40), (68, 22), (36, 60), (68, 40), (40, 12), (12, 40), (44, 68), (20, 40)]
    sheets = []
    for i, (y, z) in enumerate(yz):
        angles = (0, 0, 0) if i == 0 else ((i%3-1)*8, ((i+1)%3-1)*8, (i%3-1)*12)
        basis = rotation(*(a*pi/180 for a in angles))
        segments = []
        for q in [-200, -120, -40, 40, 120, 200]:
            segments.extend([[[0, q, -200], [0, q, 200]], [[0, -200, q], [0, 200, q]]])
        # First opening (40,40) has strands at world y,z=0,80 as in entry vectors.
        sheets.append({"id": f"sheet-{i}", "opening_centre_m": [300*i, y, z],
                       "basis": basis, "segments_local_m": segments})
    return sheets


def route_at(t, sheets):
    """Fixed +x attitude, 2 m/s axial; quintic lateral rest-to-rest moves."""
    x = 2*t
    if x <= 0:
        return np.array([x, *sheets[0]["opening_centre_m"][1:]])
    if x >= 2100:
        return np.array([x, *sheets[-1]["opening_centre_m"][1:]])
    i = int(x//300)
    u = (x-300*i)/300
    h = 10*u**3-15*u**4+6*u**5
    a, b = np.array(sheets[i]["opening_centre_m"]), np.array(sheets[i+1]["opening_centre_m"])
    return np.r_[x, (a+(b-a)*h)[1:]]


def informed_pass(sheets, speed=2.0):
    boxes = hull_boxes()
    deltas = np.diff(np.array([s["opening_centre_m"] for s in sheets]), axis=0)[:, 1:]
    scale = speed/2
    duration = 1074/scale
    segment_time = 150/scale
    max_speed = sqrt(speed**2 + (1.875*np.linalg.norm(deltas, axis=1).max()/segment_time)**2)
    max_a = np.max(np.abs(deltas), axis=0)*(10/sqrt(3))/segment_time**2
    # One-second midpoints plus a Lipschitz bound cover the entire continuous
    # path, including between samples and entry/exit tails.
    minima, samples = [], []
    intervals = int(np.ceil(duration))
    step = duration/intervals
    for t in -12/scale+(np.arange(intervals)+.5)*step:
        p = route_at(t*scale, sheets)
        margin = min(sheet_clearance_lower(p, s, boxes) for s in sheets)
        minima.append(margin-max_speed*step/2)
        if int(t+0.5)%30 == 0:
            samples.append({"t_s": t, "datum_m": p, "com_m": p+COM})
    margin = min(minima)
    # Independent per-axis force demand relative to quoted full-tank 2G limits.
    check("route fits y authority with 20 percent reserve", max_a[0] < .8*400/30374)
    check("route fits z authority with 20 percent reserve", max_a[1] < .8*750/30374)
    check("continuous whole-ship route has >16m clearance", margin > 16)
    total_axis_dv = 2*1.875*np.sum(np.abs(deltas), axis=0)/segment_time
    ideal_propellant = 30374*sum(total_axis_dv)/(220*9.80665)
    return {"attitude_xyzw": [0, 0, 0, 1], "configuration": "allDeployed",
            "axial_speed_m_s": speed, "duration_s": duration, "sample_interval_s": step,
            "material_speed_bound_m_s": max_speed, "whole_sweep_clearance_lower_m": margin,
            "assumed_joint_uncertainty_guard_m": 6,
            "available_tracking_error_m": margin-6,
            "margin_after_10m_tracking_error_m": margin-16,
            "maximum_acceleration_yz_m_s2": max_a,
            "ideal_axis_delta_v_m_s": total_axis_dv,
            "ideal_translation_propellant_kg": ideal_propellant,
            "component_dose_upper_U_s": {e["id"]: 0 for e in BASE["equipment"]},
            "samples": samples, "envelope_boxes": boxes}


def seeded_uniforms(seed, count):
    """Portable fixture-only xorshift32; never Python's randomized hash()."""
    state = seed or 1
    values = []
    for _ in range(count):
        state ^= (state << 13) & 0xffffffff
        state ^= state >> 17
        state ^= (state << 5) & 0xffffffff
        state &= 0xffffffff
        values.append((state+.5)/4294967296)
    return values


def reconstruct(record):
    """Belief-only fit. Receives recordings, never a field or truth point list."""
    result = {"features": {}, "coverage": "unresolved", "patch_support_eligible": False}
    for feature in record["feature_ids"]:
        rows = [f for f in record["frames"] if feature in f["detections"] and not f["held_out"]]
        if len(rows) < 3:
            continue
        cameras = np.array([f["camera_position_estimate_m"] for f in rows])
        if np.linalg.norm(np.ptp(cameras, axis=0)) < 2:
            continue
        slopes = np.array([f["detections"][feature] for f in rows])
        A, b = [], []
        for c, (u, v) in zip(cameras, slopes):
            A.extend([[u, -1, 0], [v, 0, -1]])
            b.extend([u*c[0]-c[1], v*c[0]-c[2]])
        p = np.linalg.lstsq(np.array(A), b, rcond=None)[0]
        sigma = record["slope_sigma"]
        for _ in range(8):
            d = p-cameras
            predicted = d[:, 1:]/d[:, :1]
            J = np.zeros((2*len(rows), 3))
            J[0::2, 0], J[1::2, 0] = -d[:, 1]/d[:, 0]**2, -d[:, 2]/d[:, 0]**2
            J[0::2, 1], J[1::2, 2] = 1/d[:, 0], 1/d[:, 0]
            residual = (predicted-slopes).reshape(-1)
            p -= np.linalg.lstsq(J, residual, rcond=None)[0]
        # Common pose floor is a patch-wide correlated term, NOT pixel noise.
        independent_cov = np.linalg.inv(J.T@J)*sigma**2
        cov = independent_cov + np.eye(3)*record["common_pose_sigma_m"]**2
        held = []
        for f in record["frames"]:
            if not f["held_out"] or feature not in f["detections"]:
                continue
            d = p-np.array(f["camera_position_estimate_m"])
            held.extend(((d[1:]/d[0]-f["detections"][feature])/sigma).tolist())
        result["features"][feature] = {"position_m": p,
            "independent_covariance_m2": independent_cov, "covariance_with_common_pose_m2": cov,
            "training_count": len(rows), "held_out_rms_sigma": sqrt(np.mean(np.array(held)**2)) if held else None}
    complete = len(result["features"]) == len(record["feature_ids"])
    tested = complete and all(f["held_out_rms_sigma"] is not None and f["held_out_rms_sigma"] < 3
                              for f in result["features"].values())
    coverage = record["coverage_certificate"]
    if tested and coverage["resolved"] and coverage["all_edges_observed"]:
        result["coverage"] = "supported-within-recorded-footprint"
        result["patch_support_eligible"] = True
    result["common_pose_covariance_m2"] = np.eye(3)*record["common_pose_sigma_m"]**2
    result["lineage"] = [f["sequence"] for f in record["frames"]]
    return result


def recording_case():
    truth_points = {"f0": np.array([0., 0., 0.]), "f1": np.array([0., 80., 0.]),
                    "f2": np.array([0., 80., 80.]), "f3": np.array([0., 0., 80.])}
    uniform = iter(seeded_uniforms(170017, 54*8))
    record = {"feature_ids": list(truth_points), "slope_sigma": .0005,
              "common_pose_sigma_m": .5, "sensor": "camera", "processor_W": 1000,
              "camera_W": 200, "camera_cadence_Hz": 5/3,
              "coverage_certificate": {"resolved": True, "all_edges_observed": True,
                 "footprint": "one observed quadrilateral only", "resolution_m": 1,
                 "maximum_undetected_support_radius_m": 1,
                 "basis": "assumed calibrated fictional channel; not established by triangulation"},
              "observed_edges": [["f0", "f1"], ["f1", "f2"], ["f2", "f3"], ["f3", "f0"]],
              "frames": []}
    common_error = np.array([.4, -.3, .2])
    for i in range(54):
        t = i*.6
        camera = np.array([-120., 32.+.5*t, 40.])
        detections = {}
        for id, p in truth_points.items():
            d = p-camera
            check_angle = np.arctan2(np.linalg.norm(d[1:]), d[0])
            if check_angle > BASE["sensing"]["camera"]["fovHalfAngle"]:
                raise AssertionError("recorded feature outside camera FOV")
            # Bounded zero-mean independent noise with variance sigma^2.
            noise = np.array([next(uniform), next(uniform)])*2-1
            detections[id] = (d[1:]/d[0] + sqrt(3)*.0005*noise).tolist()
        record["frames"].append({"sequence": i, "t_s": t,
            "camera_position_estimate_m": (camera+common_error).tolist(),
            "attitude_xyzw": [0, 0, 0, 1], "held_out": i >= 48,
            "detections": detections})
    fit = reconstruct(record)
    check("54 recorded frames resolve four features with held-out residual <3 sigma", fit["patch_support_eligible"])
    errors = {id: np.array(f["position_m"])-truth_points[id] for id, f in fit["features"].items()}
    check("reconstruction error below 1.5m", max(np.linalg.norm(e) for e in errors.values()) < 1.5)
    empty = json.loads(json.dumps(record)); empty["frames"] = []
    check("unrecorded observations cannot reconstruct", not reconstruct(empty)["patch_support_eligible"])
    fixed = json.loads(json.dumps(record))
    for f in fixed["frames"]:
        f["camera_position_estimate_m"] = fixed["frames"][0]["camera_position_estimate_m"]
    check("no parallax remains unresolved", not reconstruct(fixed)["features"])
    occluded = json.loads(json.dumps(record))
    for f in occluded["frames"]:
        f["detections"].pop("f3")
    check("occluded corner is not a hole", not reconstruct(occluded)["patch_support_eligible"])
    no_detection_bound = json.loads(json.dumps(record))
    no_detection_bound["coverage_certificate"]["resolved"] = False
    check("triangulation alone cannot certify empty volume", not reconstruct(no_detection_bound)["patch_support_eligible"])
    check("archive JSON rebuild equals live result", clean(reconstruct(json.loads(json.dumps(record)))) == clean(fit))
    prefix = json.loads(json.dumps(record)); prefix["frames"] = prefix["frames"][:6]
    return {"record": record, "expected": fit, "early_six_frames": reconstruct(prefix),
            "truth_for_validation_only": truth_points, "errors_m": errors,
            "no_parallax_expected": reconstruct(fixed), "occluded_expected": reconstruct(occluded)}


def resource_vectors():
    modes = []
    usable = BASE["recorder"]["capacity"]-BASE["recorder"]["reservedEventCapacity"]
    for name, processing, recorder_hz, recorder_w, raw in [
        ("survey", 350, 10, 35, False), ("thread", 1000, 10, 35, False),
        ("raw-diagnostic", 1000, 50, 100, True)]:
        rate = min(.2+1.8*max(0, (processing-350)/650), 200/120, recorder_hz)
        packet_bps = recorder_hz*BASE["recorder"]["bytesPerSample"]
        raw_bps = BASE["recorder"]["rawFrameRateBytes"] if raw else 0
        # Processed features are included within packets, not charged twice.
        watts = processing+200+15+20+recorder_w
        service = processing+200+20
        modes.append({"mode": name, "delivered_processor_W": processing,
          "actual_feature_rate_Hz": rate, "chain_W": watts,
          "storage_B_s": packet_bps+raw_bps,
          "empty_store_duration_s": usable/(packet_bps+raw_bps),
          "pass_storage_B": 1074*(packet_bps+raw_bps),
          "pass_chain_energy_J": 1074*watts,
          "service_heat_J": 1074*service,
          "service_no_cooling_delta_K": 1074*service/4000000})
    check("normal packets fit feature budget", 40960 > (5/3)*16384)
    return {"usable_capacity_B": usable, "metadata_reserved_B": 100000000, "modes": modes,
            "warm_service_at_312_8K_full_mode_no_cooling_to_camera_limit_s": .2*4000000/1220,
            "remaining_32MB_raw_duration_s": 32000000/1204800,
            "remaining_32MB_feature_duration_s": 32000000/40960,
            "first_investigation_example_s": 72, "repeat_geometry_refresh_s": 32.4}


def verification():
    # Independently evaluate an antiderivative against numerical quadrature.
    values = []
    for dt in [1/32, 1/64, 1/128]:
        t = np.arange(-4, 4, dt)+dt/2
        value = sum(intensity(sqrt((2*x)**2+2**2))*dt for x in t)
        values.append(value)
    exact = (256/315)*PEAK*WIDTH/2*(1-(2/WIDTH)**2)**4.5
    check("point integral agrees with independent quadrature", abs(values[-1]-exact) < 1e-8)
    check("quadrature converges", abs(values[-1]-exact) < abs(values[0]-exact))
    check("polynomial CDF equals independent total formula", abs(primitive(100, 2)/2-exact) < 1e-12)
    # Worst point box plateau independently integrated, catches mount-only tests.
    box = (np.array([-4., 2., -.1]), np.array([1., 10., .1]))
    start = np.array([-24., 0., 0.])
    dt = 1/128
    numeric = 0.
    for t in np.arange(0, 24, dt)+dt/2:
        lo, hi = start+np.array([2*t, 0, 0])+box[0], start+np.array([2*t, 0, 0])+box[1]
        x = max(0., lo[0], -hi[0])
        numeric += intensity(x)*dt
    check("appendage max intensity integral includes plateau", abs(numeric-raw_dose(24, box, start, 2)) < 1e-8)
    zero = entry_case("clear", 40, 40)
    check("clear first opening has zero exposure", all(d["raw_U_s"] == 0 for d in zero["component_doses"].values()))
    off = entry_case("off", 0, 0, all_off=True)
    check("power off suppresses powered burnout", not any(e["kind"] == "burnout" for e in off["events"]))
    check("power off still accumulates dose", off["component_doses"]["camera"]["weighted_U_s"] > 32)
    check("off appendage can fail cumulatively", any(e["kind"] == "dose-failure" and e["equipment"] == "radiator-left" for e in off["events"]))
    first = stack()[0]
    check("junction is not double counted", finite_intensity([0, 0, 0], first) == PEAK)
    check("finite sheet permits exterior bypass", finite_intensity([0, 320, 320], first) == 0)
    check("finite field and entry analytic profile agree", abs(finite_intensity([1, 2, 20], first)-intensity(sqrt(5))) < 1e-12)
    shifted = dict(first)
    R = rotation(.3, -.2, .4)
    offset = np.array([10., -30., 70.])
    shifted["basis"] = R
    shifted["opening_centre_m"] = R@np.array(first["opening_centre_m"])+offset
    check("finite intensity is invariant under 3D rigid transforms", abs(finite_intensity(R@np.array([1.,2.,20.])+offset, shifted)-finite_intensity([1,2,20], first)) < 1e-10)
    fast_box = (np.zeros(3), np.zeros(3))
    interval = high_interval(fast_box, np.array([-10.,0.,0.]), 20, 10)
    check("outside-to-outside tick contains a severe dwell", interval[1]-interval[0] > .1 and intensity(10) == 0)
    return_data = {"point_impact_m": 2, "point_speed_m_s": 2, "analytic_U_s": exact,
            "midpoint_dt_s": [1/32, 1/64, 1/128], "midpoint_U_s": values,
            "appendage_exact_U_s": raw_dose(24, box, start, 2), "appendage_midpoint_U_s": numeric,
            "outside_to_outside_dwell_interval_s": interval, "off_case": off}
    return return_data


def main():
    checks = verification()
    cases = [entry_case("straight-rock-gap", 0, 0),
             entry_case("nearby-gap", 1, 1), entry_case("climb-over-rock", 20, 2),
             entry_case("wing-only", 10, 40), entry_case("informed-first-layer", 40, 40),
             entry_case("slow-blind", 0, 0, 1.4), entry_case("fast-blind", 0, 0, 2.6),
             entry_case("unchanged-console-baseline", 0, 0, hardened_console=False)]
    for c in cases[:3]:
        check(c["id"]+" loses both distribution feeds", c["loss_s"] is not None)
    check("nominal loss follows instrument failure by >=3s", cases[0]["readable_interval_s"] >= 3)
    check("hardened console remains intact until feed loss", cases[0]["component_doses"]["console"]["state"] == "intact")
    check("baseline console fails before distribution loss", cases[-1]["component_doses"]["console"]["state"] == "failed")
    check("wing-only pass survives with real damage", cases[3]["loss_s"] is None and bool(cases[3]["events"]))
    sheets = stack()
    route = informed_pass(sheets)
    slow_route = informed_pass(sheets, 1.4)
    reconstruction = recording_case()
    output = {"schema": "s17-reference-v1", "units": "m, s, W, J, B; fictional U and U s",
      "baseline_sha256": hashlib.sha256(BASELINE_BYTES).hexdigest(),
      "assumptions": {"pitch_m": PITCH, "influence_radius_m": WIDTH, "peak_U": PEAK,
        "entry_sheet": "first stack sheet; nearest per sheet, never double a junction",
        "loss_rule": "both PDUs irreversibly failed; assumed terminal electrical loss",
        "component_policy": "baseline mount points; full rectangular appendage prisms",
        "datum_to_com_m": COM, "event_time_tolerance_s": .001, "dose_tolerance_U_s": .00001,
        "reconstruction_position_tolerance_m": .001,
        "limits": "no full bus/thermal simulation, gravity integration, contact rocks, controller or playtest"},
      "entry_cases": cases, "stack": sheets, "informed_pass": route,
      "economical_informed_pass": slow_route,
      "reconstruction": reconstruction, "resources": resource_vectors(),
      "verification": checks, "checks_passed": CHECKS}
    payload = json.dumps(clean(output), indent=2, allow_nan=False)+"\n"
    (HERE/"vectors.json").write_text(payload, encoding="utf-8", newline="\n")
    print(f"S17: {len(CHECKS)} checks passed; wrote tools/studies/s17/vectors.json")
    print(json.dumps(clean({"entry": [{"id": c["id"], "loss_s": c["loss_s"],
          "readable_s": c["readable_interval_s"]} for c in cases],
          "route_clearance_m": route["whole_sweep_clearance_lower_m"],
          "translation_kg": route["ideal_translation_propellant_kg"]}), indent=2))


if __name__ == "__main__":
    main()
