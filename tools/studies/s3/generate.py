"""Deterministic S3 kinematic and sensing checks; not a tether simulation.

Run from the repository root: python tools/studies/s3/generate.py [--check]
Only the Python standard library and numpy are used. No random draws occur.
The assumed values below are replaceable S3 examples, not S1/S2 hardware data.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np


PARAMETERS = {
    "attachment_radius_m": 500.0,
    "spin_rad_s": 0.02,
    "spin_axis": [1.0 / 3.0, 2.0 / 3.0, 2.0 / 3.0],
    "centre_velocity_m_s": [1.0, -0.5, 0.25],
    "pose_sigma_rad": math.radians(0.05),
    "spin_sigma_rad_s": 0.00005,
    "centre_position_sigma_m": 0.25,
    "landmark_position_sigma_m": 0.15,
    "capture_position_tolerance_m": 2.0,
    "release_surrogate_radius_m": 600.0,
    "release_coast_s": 600.0,
}


def skew(v):
    x, y, z = v
    return np.array([[0.0, -z, y], [z, 0.0, -x], [-y, x, 0.0]])


def rotation(rotvec):
    angle = float(np.linalg.norm(rotvec))
    if angle == 0.0:
        return np.eye(3)
    k = skew(np.asarray(rotvec) / angle)
    return np.eye(3) + math.sin(angle) * k + (1.0 - math.cos(angle)) * k @ k


def normalized(v):
    return np.asarray(v, dtype=float) / np.linalg.norm(v)


def serializable(value):
    """Round display results, retaining more accuracy than declared tolerances."""
    if isinstance(value, np.ndarray):
        return serializable(value.tolist())
    if isinstance(value, dict):
        return {key: serializable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [serializable(item) for item in value]
    if isinstance(value, (np.floating, float)):
        return float(f"{value:.12g}")
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.bool_):
        return bool(value)
    return value


def generate():
    p = PARAMETERS
    n = normalized(p["spin_axis"])
    omega = n * p["spin_rad_s"]
    radial = normalized([2.0, -1.0, 0.0])
    tangent = np.cross(n, radial)
    r = radial * p["attachment_radius_m"]
    vc = np.array(p["centre_velocity_m_s"])
    checks = []

    def check(name, condition, value, tolerance=None):
        entry = {"id": name, "pass": bool(condition), "value": value}
        if tolerance is not None:
            entry["tolerance"] = tolerance
        checks.append(entry)
        if not condition:
            raise AssertionError(f"{name}: {value}")

    velocity = vc + np.cross(omega, r)
    check("attachment-speed", abs(np.linalg.norm(velocity - vc) - 10.0) < 1e-12,
          np.linalg.norm(velocity - vc), 1e-12)
    check("motion-is-three-dimensional", abs((velocity - vc)[2]) > 1.0,
          (velocity - vc)[2])
    dt = 1e-4
    finite_velocity = (rotation(omega * dt) @ r - rotation(-omega * dt) @ r) / (2 * dt)
    derivative_error = np.linalg.norm(finite_velocity - (velocity - vc))
    check("velocity-matches-position-derivative", derivative_error < 1e-8,
          derivative_error, 1e-8)
    transform = rotation(normalized([-2.0, 1.0, 4.0]) * 0.73)
    rotated_velocity = transform @ vc + np.cross(transform @ omega, transform @ r)
    rotation_error = np.linalg.norm(rotated_velocity - transform @ velocity)
    check("rigid-rotation-equivariance", rotation_error < 1e-12, rotation_error, 1e-12)

    # x = [centre displacement, landmark displacement, pose error, spin error].
    # The same pose/landmark error affects both endpoint position and velocity.
    jp = np.hstack([np.eye(3), np.eye(3), -skew(r), np.zeros((3, 3))])
    jv = np.hstack([np.zeros((3, 3)), skew(omega), -skew(omega) @ skew(r), -skew(r)])
    jacobian = np.vstack([jp, jv])
    sigmas = np.repeat([
        p["centre_position_sigma_m"], p["landmark_position_sigma_m"],
        p["pose_sigma_rad"], p["spin_sigma_rad_s"],
    ], 3)
    covariance = (jacobian * sigmas) @ (jacobian * sigmas).T

    def perturb(x):
        rr = rotation(x[6:9]) @ (r + x[3:6])
        return np.r_[x[:3] + rr, vc + np.cross(omega + x[9:12], rr)]

    numerical_jacobian = np.zeros_like(jacobian)
    for column in range(12):
        dx = np.zeros(12)
        h = 1e-5 if column < 6 else 1e-7
        dx[column] = h
        numerical_jacobian[:, column] = (perturb(dx) - perturb(-dx)) / (2 * h)
    jacobian_error = np.max(np.abs(jacobian - numerical_jacobian))
    check("covariance-jacobian-finite-difference", jacobian_error < 1e-6,
          jacobian_error, 1e-6)
    eigenvalues = np.linalg.eigvalsh(covariance)
    check("joint-covariance-is-positive-semidefinite", np.min(eigenvalues) > -1e-12,
          eigenvalues, 1e-12)
    check("position-velocity-cross-covariance-retained", np.linalg.norm(covariance[:3, 3:]) > 1e-5,
          np.linalg.norm(covariance[:3, 3:]))

    # One transverse direction: independent current pose and rate estimates.
    # This is an illustrative linear uncertainty budget, not a probability of capture.
    def transverse_sigma(age):
        return math.sqrt(
            p["centre_position_sigma_m"] ** 2
            + p["landmark_position_sigma_m"] ** 2
            + p["attachment_radius_m"] ** 2 * (
                p["pose_sigma_rad"] ** 2 + (age * p["spin_sigma_rad_s"]) ** 2
            )
        )

    initial_variance = transverse_sigma(0) ** 2
    capture_tolerance = p["capture_position_tolerance_m"]
    threshold_variance = (capture_tolerance / 3) ** 2
    age_limit = math.sqrt(threshold_variance - initial_variance) / (
        p["attachment_radius_m"] * p["spin_sigma_rad_s"]
    )
    sigma_table = [{"age_s": age, "sigma_transverse_m": transverse_sigma(age),
                    "three_sigma_m": 3 * transverse_sigma(age)} for age in [0, 10, 20, 60]]
    check("fresh-fix-meets-example-capture-width", 3 * transverse_sigma(0) < capture_tolerance,
          3 * transverse_sigma(0))
    check("twenty-second-old-fix-exceeds-example-capture-width", 3 * transverse_sigma(20) > capture_tolerance,
          3 * transverse_sigma(20))
    check("capture-width-horizon-root", abs(3 * transverse_sigma(age_limit) - capture_tolerance) < 1e-12,
          age_limit, 1e-12)
    angular_sweep_1s = np.linalg.norm(rotation(omega) @ r - r)
    check("one-second-contact-sweep-exceeds-capture-width", angular_sweep_1s > capture_tolerance,
          angular_sweep_1s)
    capture_crossings = []
    for transverse_speed in [0.5, 2.0]:
        capture_crossings.append({"relative_transverse_speed_m_s": transverse_speed,
            "half_window_s": capture_tolerance / transverse_speed,
            "full_window_s": 2 * capture_tolerance / transverse_speed})

    # Local constant-angular-rate release surrogate. No tension, gravity, torque,
    # engine control or finite structure inertia is integrated in this calculation.
    release_radius = p["release_surrogate_radius_m"]
    r0 = release_radius * radial
    v0 = np.cross(omega, r0)
    T = p["release_coast_s"]
    baseline_at_common_time = r0 + v0 * T
    releases = []
    for delta in [-5.0, -2.0, 0.0, 2.0, 5.0]:
        rr = rotation(omega * delta) @ r0
        vv = np.cross(omega, rr)
        velocity_error = float(np.linalg.norm(vv - v0))
        exact_velocity_error = 2 * np.linalg.norm(v0) * abs(math.sin(p["spin_rad_s"] * delta / 2))
        check(f"release-velocity-chord-{delta:+g}s", abs(velocity_error - exact_velocity_error) < 1e-12,
              velocity_error, 1e-12)
        endpoint_at_common_time = rr + vv * (T - delta)
        releases.append({"timing_error_s": delta, "release_position_m": rr,
            "release_velocity_m_s": vv, "velocity_change_from_nominal_m_s": velocity_error,
            "direction_change_deg": math.degrees(abs(p["spin_rad_s"] * delta)),
            "position_difference_at_nominal_release_plus_600s_m":
                np.linalg.norm(endpoint_at_common_time - baseline_at_common_time)})
    def common_time_endpoint(delta):
        rr = rotation(omega * delta) @ r0
        vv = np.cross(omega, rr)
        return rr + vv * (T - delta)

    release_derivative = (common_time_endpoint(dt) - common_time_endpoint(-dt)) / (2 * dt)
    expected_release_derivative = T * np.cross(omega, v0)
    release_derivative_error = np.linalg.norm(release_derivative - expected_release_derivative)
    check("common-time-release-sensitivity", release_derivative_error < 1e-7,
          release_derivative_error, 1e-7)

    # Synthetic optical feature angles, assuming correspondence, metric shape and
    # the axis/frame have already been measured. Fit only phase and angular rate.
    training_times = np.array([0.0, 10.0, 20.0, 30.0])
    training_angles = []
    for t in training_times:
        point = rotation(omega * t) @ r
        training_angles.append(math.atan2(np.dot(point, tangent), np.dot(point, radial)))
    design = np.column_stack([np.ones(len(training_times)), training_times])
    fit = np.linalg.lstsq(design, np.unwrap(training_angles), rcond=None)[0]
    held_times = [40.0, 50.0, 60.0]
    held_errors = []
    wrong_sign_errors = []
    for t in held_times:
        observed = rotation(omega * t) @ r
        predicted = rotation(n * (fit[0] + fit[1] * t)) @ r
        wrong = rotation(-omega * t) @ r
        held_errors.append(np.linalg.norm(predicted - observed))
        wrong_sign_errors.append(np.linalg.norm(wrong - observed))
    check("tracked-feature-spin-fit", abs(fit[1] - p["spin_rad_s"]) < 1e-12, fit, 1e-12)
    check("held-out-feature-prediction", max(held_errors) < 1e-10, held_errors, 1e-10)
    check("wrong-spin-sign-fails-held-out", min(wrong_sign_errors) > 500, wrong_sign_errors)

    # A symmetric two-ended arm observed only at these times cannot distinguish
    # omega from omega + pi / cadence. Equal unlabeled endpoint sets are identical.
    cadence = 20.0
    alias_omega = p["spin_rad_s"] + math.pi / cadence
    alias_errors = []
    for t in [0, cadence, 2 * cadence, 3 * cadence]:
        original = rotation(omega * t) @ r
        alias = rotation(n * alias_omega * t) @ r
        alias_errors.append(min(np.linalg.norm(alias - original), np.linalg.norm(alias + original)))
    check("symmetric-arm-spin-alias", max(alias_errors) < 1e-10, alias_errors, 1e-10)

    # Independently integrate Euler rigid-body dynamics and Rdot = R [omega_body]x.
    # Both positive principal-moment triples obey the triangle inequalities.
    # Body x initially points at the landmark; body z is the measured spin axis.
    inertia_tensors = [np.diag([1.2e10, 1.6e10, 2.0e10]),
                       np.diag([6.0e10, 5.0e10, 8.0e10])]
    initial_rotation = np.column_stack([radial, tangent, n])
    landmark_body = np.array([p["attachment_radius_m"], 0.0, 0.0])
    euler_dt = 0.1

    def integrate_euler(inertia, omega_body):
        state = np.r_[omega_body, initial_rotation.ravel()]
        inverse_inertia = np.linalg.inv(inertia)

        def rhs(y):
            w = y[:3]
            attitude = y[3:].reshape(3, 3)
            wdot = -inverse_inertia @ np.cross(w, inertia @ w)
            return np.r_[wdot, (attitude @ skew(w)).ravel()]

        initial_h = initial_rotation @ inertia @ omega_body
        initial_energy = float(0.5 * omega_body @ inertia @ omega_body)
        max_h_error = 0.0
        max_energy_error = 0.0
        samples = []
        sample_steps = {round(t / euler_dt) for t in held_times}
        for step in range(1, max(sample_steps) + 1):
            k1 = rhs(state)
            k2 = rhs(state + 0.5 * euler_dt * k1)
            k3 = rhs(state + 0.5 * euler_dt * k2)
            k4 = rhs(state + euler_dt * k3)
            state = state + (euler_dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4)
            w = state[:3]
            attitude = state[3:].reshape(3, 3)
            h = attitude @ inertia @ w
            energy = float(0.5 * w @ inertia @ w)
            max_h_error = max(max_h_error, float(np.linalg.norm(h - initial_h) / np.linalg.norm(initial_h)))
            max_energy_error = max(max_energy_error, abs(energy - initial_energy) / initial_energy)
            if step in sample_steps:
                samples.append({"t_s": step * euler_dt, "omega_body_rad_s": w.copy(),
                                "landmark_inertial_m": attitude @ landmark_body})
        return {"samples": samples, "max_relative_angular_momentum_error": max_h_error,
                "max_relative_energy_error": max_energy_error}

    principal_spin_body = np.array([0.0, 0.0, p["spin_rad_s"]])
    principal_runs = [integrate_euler(inertia, principal_spin_body) for inertia in inertia_tensors]
    principal_tracks = [np.array([sample["landmark_inertial_m"] for sample in run["samples"]])
                        for run in principal_runs]
    exact_tracks = np.array([rotation(omega * t) @ r for t in held_times])
    principal_exact_error = max(float(np.max(np.linalg.norm(track - exact_tracks, axis=1)))
                                for track in principal_tracks)
    inertia_difference = float(np.max(np.linalg.norm(principal_tracks[0] - principal_tracks[1], axis=1)))
    check("euler-principal-axis-matches-independent-rodrigues", principal_exact_error < 1e-7,
          principal_exact_error, 1e-7)
    check("free-spin-does-not-identify-inertia", inertia_difference < 1e-7,
          inertia_difference, 1e-7)
    # Negative control: a tumble with these different inertia ratios must differ.
    off_axis_spin = np.array([0.006, 0.009, p["spin_rad_s"]])
    off_axis_runs = [integrate_euler(inertia, off_axis_spin) for inertia in inertia_tensors]
    off_axis_difference = np.linalg.norm(off_axis_runs[0]["samples"][-1]["landmark_inertial_m"]
                                        - off_axis_runs[1]["samples"][-1]["landmark_inertial_m"])
    check("euler-negative-control-responds-to-inertia-ratios", off_axis_difference > 1.0,
          off_axis_difference)
    max_h_error = max(run["max_relative_angular_momentum_error"] for run in principal_runs + off_axis_runs)
    max_energy_error = max(run["max_relative_energy_error"] for run in principal_runs + off_axis_runs)
    check("euler-torque-free-angular-momentum", max_h_error < 1e-10, max_h_error, 1e-10)
    check("euler-torque-free-energy", max_energy_error < 1e-10, max_energy_error, 1e-10)

    return serializable({
        "schema": "recursion.s3.kinematic-reference.v1",
        "status": "ASSUMED example values; DEMONSTRATED algebra only; no route/playability claim",
        "reconciliation_snapshot": {"s1": "baf65e0; no committed study artifacts at initial read",
                                    "s2": "baf65e0; no committed study artifacts at initial read"},
        "units": "SI; degree-valued display fields explicitly named",
        "frame": "right-handed inertial; angular-rate examples supplied in inertial axes",
        "parameters": p,
        "attachment": {"radius_vector_m": r, "omega_inertial_rad_s": omega,
                       "velocity_inertial_m_s": velocity,
                       "period_s": 2 * math.pi / p["spin_rad_s"],
                       "joint_position_velocity_covariance": covariance,
                       "position_major_sigma_m": math.sqrt(np.linalg.eigvalsh(covariance[:3, :3])[-1]),
                       "velocity_major_sigma_m_s": math.sqrt(np.linalg.eigvalsh(covariance[3:, 3:])[-1])},
        "capture": {"uncertainty_by_age": sigma_table,
                    "example_three_sigma_age_limit_s": age_limit,
                    "attachment_sweep_one_second_m": angular_sweep_1s,
                    "transverse_crossing_windows": capture_crossings},
        "release": {"scope": "constant-spin circular surrogate followed by free linear coast",
                    "nominal_velocity_m_s": v0, "nominal_speed_m_s": np.linalg.norm(v0),
                    "common-time-position-sensitivity_m_per_s": np.linalg.norm(expected_release_derivative),
                    "timing_cases": releases},
        "rotation_fit": {"training_times_s": training_times,
                         "training_feature_angles_rad": training_angles,
                         "phase_and_rate_fit": fit, "held_out_times_s": held_times,
                         "held_out_errors_m": held_errors,
                         "wrong_sign_errors_m": wrong_sign_errors,
                         "symmetric_alias_rate_rad_s": alias_omega,
                         "symmetric_alias_errors_m": alias_errors},
        "inertia_observability": {"assumption": "torque-free rigid bodies with measured common initial pose and rate",
                                  "inertia_body_kg_m2": inertia_tensors,
                                  "integration": "RK4 Euler angular rate and rotation-matrix kinematics",
                                  "step_s": euler_dt,
                                  "principal_axis_runs": principal_runs,
                                  "off_axis_negative_control_initial_rate_rad_s": off_axis_spin,
                                  "off_axis_negative_control_runs": off_axis_runs,
                                  "off_axis_landmark_separation_at_60s_m": off_axis_difference},
        "checks": checks,
    })


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify committed JSON without writing")
    args = parser.parse_args()
    result = generate()
    encoded = json.dumps(result, indent=2, sort_keys=True, allow_nan=False) + "\n"
    output = Path(__file__).with_name("vectors.json")
    if args.check:
        if not output.exists() or output.read_text(encoding="utf-8") != encoded:
            raise SystemExit("FAIL: vectors.json differs; regenerate and inspect the change")
        print(f"PASS: {len(result['checks'])} checks; vectors.json regenerates identically")
    else:
        output.write_text(encoded, encoding="utf-8", newline="\n")
        print(f"PASS: {len(result['checks'])} checks; wrote {output.name}")


if __name__ == "__main__":
    main()
