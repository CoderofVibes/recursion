"""S19: independent P4 torque, observability and rigid-body reference.

Run: python tools/studies/s19/tidal_check.py [--check]
Only stdlib + numpy. Writes results.json and vectors.json beside this script.
No simulation/game imports; no source/data edits. All inputs are SI.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
BASELINE = ROOT / "data/ship-baseline.json"
DATA = json.loads(BASELINE.read_text(encoding="utf-8"))
R0 = 1_000_000.0
P = 2.5
D = 4_000_000.0
MU = {"alpha": 1e10, "beta": 2.5e9}
RADII = {"alpha": 250_000.0, "beta": 160_000.0}
CONTROL = DATA["propulsion"]["attitudeControl"]
AUTHORITY = np.array([1600.0, 4000.0, 3600.0])
SIGMA_ATT = DATA["sensing"]["starTracker"]["angularSigma"]
SIGMA_GYRO = DATA["sensing"]["imu"]["gyroSigma"]
ARCSEC = 180.0 / math.pi * 3600.0


def cross(a, b):
    return np.array([a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]])


def unit(v):
    v = np.array(v, dtype=float)
    return v / np.linalg.norm(v)


def mass_properties(config, loading="arrival"):
    """Independent parallel-axis sum, including each part's intrinsic tensor.

    'spent' removes all propellant and converts the 54 kg reactants into retained
    water. A limiting configuration, not an asserted post-C02 resource state.
    """
    appendages = {a["id"]: a for a in DATA["configuration"]["appendages"]}
    parts = []
    for e in DATA["equipment"]:
        m, pos = e["mass"], e["position"]
        j = [e["intrinsicInertiaRoll"], e["intrinsicInertiaPitch"], e["intrinsicInertia"]]
        if e["id"] in appendages:
            a = appendages[e["id"]]
            extended = config == "allDeployed" or (
                config == "radiators" if e["id"].startswith("radiator") else config == "solar")
            prefix = "deployed" if extended else "stowed"
            pos = a[prefix + "Position"]
            j = [a[prefix + "InertiaRoll"], a[prefix + "InertiaPitch"], a[prefix + "Inertia"]]
        parts.append((m, np.array(pos), np.array(j)))
    for r in DATA["propellant"] + DATA["reactants"]:
        m = r["initialMass"] if loading == "arrival" else (54 if r["id"] == "product-water" else 0)
        parts.append((m, np.array(r["position"]), np.full(3, m*r["intrinsicInertiaPerKg"])))
    mass = sum(m for m, _, _ in parts)
    com = sum(m*r for m, r, _ in parts) / mass
    tensor = np.zeros((3, 3))
    for m, r, j in parts:
        x = r - com
        tensor += np.diag(j) + m*(np.dot(x, x)*np.eye(3)-np.outer(x, x))
    return mass, com, tensor


def strength(mu, r, p=P):
    """a/r, in s^-2; coefficient (p+1) is applied by torque()."""
    return mu * R0**(p-2) / r**(p+1)


def acceleration(mu, r, p=P):
    return -strength(mu, np.linalg.norm(r), p) * np.asarray(r)


def torque(tensor, mu, r_body, p=P):
    r = np.linalg.norm(r_body)
    n = r_body / r
    return (p+1)*strength(mu, r, p)*cross(n, tensor @ n)


def torque_bound(tensor, coefficient):
    moments = np.linalg.eigvalsh(tensor)
    return coefficient*(moments[-1]-moments[0])/2


def qmul(a, b):
    return np.r_[a[0]*b[0]-np.dot(a[1:], b[1:]), a[0]*b[1:]+b[0]*a[1:]+cross(a[1:], b[1:])]


def qrot(q, v):
    return v + 2*cross(q[1:], cross(q[1:], v)+q[0]*v)


def rotation_vector(q):
    q = q / np.linalg.norm(q)
    if q[0] < 0:
        q = -q
    s = np.linalg.norm(q[1:])
    return 2*q[1:] if s < 1e-15 else (2*math.atan2(s, q[0])/s)*q[1:]


def control_torque(q, w, tensor, mode):
    """Exact control.ts demand law; ideal continuous delivery, no jet allocator.

    Saturation is an axis-wise diagnostic bound, not the coupled LP feasible set.
    None of the reported small-disturbance holds approaches saturation.
    """
    if mode in ("free", "roll_constrained"):
        return np.zeros(3)
    error = -rotation_vector(q)  # target is initial identity attitude
    wanted = CONTROL["attitudeGain"]*np.sign(error)*np.maximum(np.abs(error)-CONTROL["attitudeDeadband"], 0)
    mag = np.linalg.norm(wanted)
    if mag > CONTROL["slewRate"]:
        wanted *= CONTROL["slewRate"]/mag
    rate_error = wanted-w
    alpha = np.where(np.abs(rate_error) > CONTROL["rateDeadband"], CONTROL["rateGain"]*rate_error, 0)
    return np.clip(tensor @ alpha, -AUTHORITY, AUTHORITY)


def binary(t):
    omega = math.sqrt(sum(MU.values())*R0**0.5/D**3.5)
    n = np.array([math.cos(omega*t), math.sin(omega*t), 0.0])
    tangent = np.array([-n[1], n[0], 0.0])
    return [(MU["alpha"], -0.2*D*n, -0.2*D*omega*tangent),
            (MU["beta"], 0.8*D*n, 0.8*D*omega*tangent)]


def rk4(f, t, y, dt):
    k1 = f(t, y)
    k2 = f(t+dt/2, y+dt*k1/2)
    k3 = f(t+dt/2, y+dt*k2/2)
    k4 = f(t+dt, y+dt*k3)
    return y + dt/6*(k1+2*k2+2*k3+k4)


def simulate(config, scenario, mode, duration=300, dt=1.0, loading="arrival"):
    """Moving 3D CoM and quaternion, constant actual tensor, fixed 1 s control ticks.

    Controller demand sampled at integer seconds then held across RK4 substeps.
    This keeps controller timing fixed during convergence checks.
    """
    _, _, tensor = mass_properties(config, loading)
    inverse = np.linalg.inv(tensor)
    if scenario["kind"] == "binary_exit":
        sources = binary
        pos = scenario["radius"]*unit(scenario["direction"])
        vel = 66*unit(scenario["direction"])
    else:
        mu = MU[scenario["body"]]
        sources = lambda t: [(mu, np.zeros(3), np.zeros(3))]
        n = unit(scenario["direction"])
        tangent = unit(cross(unit(scenario.get("normal", [0, 0, 1])), n))
        pos = scenario["radius"]*n
        # Unbound isolated-body flyby, starting at periapsis; not a C02 route.
        v = math.sqrt(scenario.get("v_inf", 40)**2 + 2*mu*R0**0.5/(1.5*scenario["radius"]**1.5))
        vel = v*tangent
    state = np.r_[pos, vel, [1, 0, 0, 0], [0, 0, 0]]
    command = np.zeros(3)
    peak_torque = np.zeros(3)
    peak_control = np.zeros(3)
    first_control = None
    peak_angle = 0.0
    min_clearance = float("inf")
    trace = []
    impulse = np.zeros(3)
    reaction_peak = 0.0

    def dynamics(t, y):
        nonlocal reaction_peak
        q, w = y[6:10]/np.linalg.norm(y[6:10]), y[10:13]
        qc = q*np.array([1, -1, -1, -1])
        a, tau = np.zeros(3), np.zeros(3)
        for mu, location, _ in sources(t):
            r = y[:3]-location
            a += acceleration(mu, r)
            tau += torque(tensor, mu, qrot(qc, r))
        gyro = cross(w, tensor@w)
        if mode == "roll_constrained":
            # Ideal omega_x=0 reaction; yaw/pitch free. Diagnostic, not a game mode.
            wd = np.r_[0.0, np.linalg.solve(tensor[1:, 1:], (tau-gyro)[1:])]
            reaction_peak = max(reaction_peak, abs((tensor@wd+gyro-tau)[0]))
        else:
            wd = inverse @ (tau+command-gyro)
        qd = 0.5*qmul(q, np.r_[0.0, w])
        return np.r_[y[3:6], a, qd, wd]

    steps = round(duration/dt)
    assert abs(steps*dt-duration) < 1e-9 and abs(round(1/dt)*dt-1) < 1e-9
    for step in range(steps+1):
        t = step*dt
        q, w = state[6:10], state[10:13]
        qc = q*np.array([1, -1, -1, -1])
        tau = sum((torque(tensor, mu, qrot(qc, state[:3]-loc)) for mu, loc, _ in sources(t)), np.zeros(3))
        peak_torque = np.maximum(peak_torque, np.abs(tau))
        angle = np.linalg.norm(rotation_vector(q))
        peak_angle = max(peak_angle, angle)
        for mu, loc, _ in sources(t):
            radius = RADII["alpha" if mu == MU["alpha"] else "beta"]
            min_clearance = min(min_clearance, np.linalg.norm(state[:3]-loc)-radius)
        if step % round(20/dt) == 0 or step == steps:
            trace.append({"t_s": t, "position_m": state[:3].tolist(), "quaternion_wxyz": q.tolist(),
                          "body_rate_rad_s": w.tolist(), "gravity_torque_Nm": tau.tolist()})
        if step == steps:
            break
        if step % round(1/dt) == 0:
            command = control_torque(q, w, tensor, mode)
            if first_control is None and np.any(command):
                first_control = t
        peak_control = np.maximum(peak_control, np.abs(command))
        impulse += np.abs(command)*dt
        state = rk4(dynamics, t, state, dt)
        state[6:10] /= np.linalg.norm(state[6:10])
    return {"config": config, "loading": loading, "scenario": scenario, "mode": mode,
            "duration_s": duration, "dt_s": dt, "final_state": state.tolist(), "trace": trace,
            "peak_gravity_torque_components_Nm": peak_torque.tolist(),
            "peak_control_components_Nm": peak_control.tolist(), "first_control_s": first_control,
            "control_abs_angular_impulse_Nms": impulse.tolist(),
            "roll_constraint_peak_reaction_Nm": reaction_peak,
            "final_angle_deg": np.linalg.norm(rotation_vector(state[6:10]))*180/math.pi,
            "peak_angle_deg": peak_angle*180/math.pi, "min_centre_altitude_m": min_clearance}


def acceleration_sigma(duration, cadence, sigma=SIGMA_ATT):
    """Known iid attitude errors; fit offset, initial rate, and 0.5*alpha*t^2.

    Unit-scaled design avoids ill conditioning. Nuisance offset/rate are fitted,
    not presumed known. No claim about real hardware's unmodelled correlations.
    """
    count = math.floor(duration*cadence+1e-9)+1
    if count < 3:
        return float("inf")
    # Closed inverse of the uniformly sampled quadratic design matrix.
    return sigma*cadence**2*math.sqrt(720/(count*(count**2-1)*(count**2-4)))


def detect_time(alpha, cadence):
    period = 1/cadence
    low, high = 2, round(86400/period)
    if alpha < 3*acceleration_sigma(high*period, cadence):
        return None
    while low < high:
        middle = (low+high)//2
        if alpha >= 3*acceleration_sigma(middle*period, cadence):
            high = middle
        else:
            low = middle+1
    return low*period


def bounds(tensor, coefficient):
    maximum = torque_bound(tensor, coefficient)
    # A global bound on |angular acceleration| from rest; deliberately loose.
    alpha = maximum/np.linalg.eigvalsh(tensor)[0]
    return {"torque_max_Nm": maximum, "alpha_bound_rad_s2": alpha,
            "free_300s_angle_bound_arcsec": 0.5*alpha*300**2*ARCSEC,
            "free_300s_rate_bound_rad_s": alpha*300,
            "constant_signal_3sigma_time_005Hz_s": detect_time(alpha, 0.05),
            "constant_signal_3sigma_time_1Hz_s": detect_time(alpha, 1.0)}


def quadrature_cloud(mass, tensor):
    """Six positive masses with exactly the requested COM and second moment.

    This checks the leading tidal term, not the detailed spatial density of the
    ship. S = tr(I)/2 identity - I. Points +/-sqrt(3*s_i/M) along S eigenvectors.
    """
    s = np.trace(tensor)/2*np.eye(3)-tensor
    values, axes = np.linalg.eigh(s)
    assert min(values) >= -1e-8
    points = []
    for i in range(3):
        p = math.sqrt(max(0, 3*values[i]/mass))*axes[:, i]
        points.extend([p, -p])
    return np.array(points), np.full(6, mass/6)


def verify_algebra(tensor, mass):
    n = unit([1, 2, 3])
    r = 400_000*n
    expected = torque(tensor, MU["alpha"], r)
    points, masses = quadrature_cloud(mass, tensor)
    cloud_tensor = sum((m*(np.dot(x, x)*np.eye(3)-np.outer(x, x)) for x, m in zip(points, masses)), np.zeros((3, 3)))
    np.testing.assert_allclose(cloud_tensor, tensor, atol=1e-8)
    def direct(scale):
        return sum((cross(scale*x, m*(acceleration(MU["alpha"], r+scale*x)-acceleration(MU["alpha"], r)))
                    for x, m in zip(points, masses)), np.zeros(3))/scale**2
    errors = [np.linalg.norm(direct(s)-expected)/np.linalg.norm(expected) for s in (100, 50, 25, 1)]
    assert 3.8 < errors[0]/errors[1] < 4.2
    assert 3.8 < errors[1]/errors[2] < 4.2
    assert errors[-1] < 1e-7
    # Analytic Jacobian versus central finite differences of the vector law.
    analytic = strength(MU["alpha"], np.linalg.norm(r))*(3.5*np.outer(n, n)-np.eye(3))
    finite = np.column_stack([(acceleration(MU["alpha"], r+np.eye(3)[i])-acceleration(MU["alpha"], r-np.eye(3)[i]))/2 for i in range(3)])
    np.testing.assert_allclose(analytic, finite, rtol=1e-8, atol=1e-16)
    # No torque on isotropic inertia; principal alignment; sign under n -> -n.
    np.testing.assert_allclose(torque(np.eye(3), MU["alpha"], r), 0, atol=1e-20)
    eig, axes = np.linalg.eigh(tensor)
    for axis in axes.T:
        np.testing.assert_allclose(torque(tensor, MU["alpha"], 400_000*axis), 0, atol=1e-15)
    np.testing.assert_allclose(torque(tensor, MU["alpha"], -r), expected)
    max_direction = unit(axes[:, 0]+axes[:, -1])
    np.testing.assert_allclose(np.linalg.norm(torque(tensor, MU["alpha"], 400_000*max_direction)),
                               torque_bound(tensor, 3.5*strength(MU["alpha"], 400_000)), rtol=1e-12)
    np.testing.assert_allclose(torque(tensor, MU["alpha"], 2*r), expected/2**3.5)
    np.testing.assert_allclose(torque(tensor, 2*MU["alpha"], r), 2*expected)
    np.testing.assert_allclose(torque(tensor, MU["alpha"], r, 2), 3*MU["alpha"]/np.linalg.norm(r)**3*cross(n, tensor@n))
    # Potential-gradient sign, using U_orient = c/2 n.I.n at fixed radius.
    c = 3.5*strength(MU["alpha"], np.linalg.norm(r))
    potential_gradient = []
    for axis in np.eye(3):
        h = 1e-5
        rotated = [qrot(np.r_[math.cos(h/2), sign*math.sin(h/2)*axis], n) for sign in (-1, 1)]
        # Positive body rotation sends n in the body frame through negative h.
        potential_gradient.append(-c/2*(rotated[0]@tensor@rotated[0]-rotated[1]@tensor@rotated[1])/(2*h))
    np.testing.assert_allclose(potential_gradient, expected, rtol=1e-8, atol=1e-11)
    # Derive the observation threshold again from an explicit design matrix.
    times = np.arange(0, 301, 20)/300
    design = np.column_stack([np.ones(len(times)), times, times**2/2])
    numerical_sigma = SIGMA_ATT*math.sqrt(np.linalg.inv(design.T@design)[2, 2])/300**2
    np.testing.assert_allclose(acceleration_sigma(300, 0.05), numerical_sigma, rtol=1e-12)
    # In a static tidal field the rotational kinetic + orientation potential is conserved.
    inverse = np.linalg.inv(tensor)
    y = np.r_[1, 0, 0, 0, 0.0001, -0.0002, 0.0003]
    def rotational_energy(z):
        nb = qrot(z[:4]*np.array([1, -1, -1, -1]), n)
        return 0.5*z[4:]@tensor@z[4:] + 0.5*c*nb@tensor@nb
    energy0 = rotational_energy(y)
    def fixed_field(t, z):
        q = z[:4]/np.linalg.norm(z[:4])
        w = z[4:]
        nb = qrot(q*np.array([1, -1, -1, -1]), n)
        return np.r_[0.5*qmul(q, np.r_[0.0, w]), inverse@(c*cross(nb, tensor@nb)-cross(w, tensor@w))]
    for i in range(3600):
        y = rk4(fixed_field, i, y, 1)
        y[:4] /= np.linalg.norm(y[:4])
    energy_error = abs(rotational_energy(y)-energy0)/abs(energy0)
    assert energy_error < 1e-10, energy_error
    return {"direct_cloud_relative_errors_scales_100_50_25_1": errors,
            "gradient_max_absolute_error_s2": float(np.max(np.abs(finite-analytic))),
            "static_field_3600s_relative_energy_error": energy_error,
            "analytic_torque_Nm": expected.tolist(), "direct_cloud_torque_Nm": direct(1).tolist()}


def make_results():
    configs = DATA["ship"]["configurations"]
    tensors, properties = {}, []
    for config in configs:
        for loading in ("arrival", "spent"):
            mass, com, tensor = mass_properties(config, loading)
            tensors[config, loading] = tensor
            properties.append({"config": config, "loading": loading, "mass_kg": mass,
                               "com_m": com.tolist(), "tensor_kg_m2": tensor.tolist(),
                               "principal_moments_kg_m2": np.linalg.eigvalsh(tensor).tolist()})
    mass, _, tensor = mass_properties("radiators")
    assert mass == 30374
    np.testing.assert_allclose(np.diag(tensor), [102615, 307412, 325049], atol=1)
    verification = verify_algebra(tensor, mass)
    sweep = []
    for body in MU:
        radii = sorted(set([RADII[body]+1000, 300_000, 400_000, 700_000, 1_000_000,
                           1_650_000, 3_200_000, 5_800_000, 6_250_000, 9_450_000, 11_700_000]))
        for r in radii:
            if r <= RADII[body]:
                continue
            c = 3.5*strength(MU[body], r)
            for (config, loading), j in tensors.items():
                row = {"body": body, "radius_m": r, "altitude_m": r-RADII[body],
                       "config": config, "loading": loading, "coefficient_s2": c,
                       "torque_max_Nm": torque_bound(j, c)}
                for plane, direction in (("yaw_xy45", [1, 1, 0]), ("pitch_xz45", [1, 0, 1]), ("oblique", [1, 2, 3])):
                    tau = torque(j, MU[body], r*unit(direction))
                    row[plane] = {"torque_Nm": tau.tolist(), "initial_alpha_rad_s2": np.linalg.solve(j, tau).tolist()}
                sweep.append(row)
    exit_bounds = []
    # DEPART is barycentric. Minimum distances to either source need not occur
    # at the same point: adding both maxima is a conservative upper envelope.
    for radius in (9_000_000, 9_450_000, 11_700_000):
        distances = {"alpha": radius-0.2*D, "beta": radius-0.8*D}
        c = sum(3.5*strength(MU[k], r) for k, r in distances.items())
        for (config, loading), j in tensors.items():
            exit_bounds.append({"barycentric_radius_m": radius, "source_distance_lower_bounds_m": distances,
                                "config": config, "loading": loading, **bounds(j, c)})
    sensor = []
    for duration in (60, 120, 300, 600, 1800, 3600):
        for cadence in (0.05, 1.0, 2.0):
            sensor.append({"duration_s": duration, "cadence_Hz": cadence,
                           "attitude_alpha_1sigma_rad_s2": acceleration_sigma(duration, cadence),
                           "two_endpoint_angle_3sigma_rad": 3*math.sqrt(2)*SIGMA_ATT,
                           "gyro_rate_change_3sigma_rad_s": 3*math.sqrt(2)*SIGMA_GYRO})
    scenarios = [
        {"id": "alpha-251km-yaw", "kind": "flyby", "body": "alpha", "radius": 251_000, "direction": [1, 1, 0]},
        {"id": "beta-161km-yaw", "kind": "flyby", "body": "beta", "radius": 161_000, "direction": [1, 1, 0]},
        {"id": "alpha-400km-yaw", "kind": "flyby", "body": "alpha", "radius": 400_000, "direction": [1, 1, 0]},
        {"id": "beta-700km-yaw", "kind": "flyby", "body": "beta", "radius": 700_000, "direction": [1, 1, 0]},
        {"id": "beta-1650km-yaw", "kind": "flyby", "body": "beta", "radius": 1_650_000, "direction": [1, 1, 0]},
        {"id": "beta-161km-oblique", "kind": "flyby", "body": "beta", "radius": 161_000,
         "direction": [1, 2, 3], "normal": [1, -2, 1]},
        {"id": "exit-9450km-oblique", "kind": "binary_exit", "radius": 9_450_000, "direction": [1, 1, 1]},
    ]
    runs = []
    for scenario in scenarios:
        for config in ("stowed", "radiators", "allDeployed"):
            for mode in ("free", "hold", "roll_constrained"):
                runs.append(simulate(config, scenario, mode))
    # Quaternion/orbit convergence on a moving, fully 3D near-body free case.
    test_case = scenarios[-2]
    reference = simulate("radiators", test_case, "free", dt=0.25)
    errors = []
    for dt in (8.0, 4.0, 2.0):
        # For this free test RK4 may step >1 s; separate driver below.
        errors.append(convergence_error(tensor, test_case, dt, reference))
    assert errors[0]/errors[1] > 12 and errors[1]/errors[2] > 10, errors
    verification["free_RK4_8_4_2s_final_state_errors"] = errors
    # The 1 s free vector must also agree with the 0.25 s reference.
    free_1s = next(r for r in runs if r["scenario"]["id"] == test_case["id"] and r["mode"] == "free" and r["config"] == "radiators")
    q_error = 2*np.linalg.norm(np.array(free_1s["final_state"][6:10])-np.array(reference["final_state"][6:10]))
    assert q_error < 1e-9
    verification["free_1s_vs_quarter_s_quaternion_angle_error_rad"] = float(q_error)
    # A full hold must never fire at the proposed pocket from an initially steady ship.
    assert all(r["first_control_s"] is None for r in runs if r["scenario"]["kind"] == "binary_exit")
    # Roll-only constraint cannot erase the dominant yaw signature.
    a = next(r for r in runs if r["config"] == "radiators" and r["mode"] == "free" and r["scenario"]["id"] == "alpha-400km-yaw")
    b = next(r for r in runs if r["config"] == "radiators" and r["mode"] == "roll_constrained" and r["scenario"]["id"] == "alpha-400km-yaw")
    assert abs(a["final_angle_deg"]-b["final_angle_deg"]) < 0.02
    # Torque/attitude scaling threshold from the unamplified physical law.
    threshold = []
    j = tensors["radiators", "arrival"]
    for body in MU:
        for duration in (60, 300):
            for angle_deg in (1, 5):
                alpha_per_c = np.linalg.solve(j, cross(unit([1, 1, 0]), j@unit([1, 1, 0])))[2]
                c_needed = 2*math.radians(angle_deg)/(duration**2*abs(alpha_per_c))
                r = (3.5*MU[body]*R0**0.5/c_needed)**(1/3.5)
                threshold.append({"body": body, "duration_s": duration, "free_angle_deg": angle_deg,
                                  "frozen_geometry_radius_m": r, "outside_collision_sphere": bool(r>RADII[body])})
    input_paths = ["data/ship-baseline.json", "src/ship/propulsion/control.ts", "src/ship/sensors/index.ts",
                   "src/content/gravity-range/briefing.ts", "src/content/gravity-range/world.ts"]
    results = {"schema": 1, "baseline_sha256": hashlib.sha256(BASELINE.read_bytes()).hexdigest(),
               "source_sha256": {path: hashlib.sha256((ROOT/path).read_bytes()).hexdigest() for path in input_paths},
               "law": {"exponent": P, "reference_radius_m": R0, "gm_m3_s2": MU, "collision_radii_m": RADII},
               "assumptions": ["No effect multiplier; fixed A10 masses/sizes", "No game physics implementation claimed",
                               "Held cases: actual demand law, ideal continuous delivery at 1 s ticks",
                               "Roll-constrained is a diagnostic, not an available player mode",
                               "Detect times: stationary maximum signal, independent healthy sensor noise; optimistic"],
               "mass_properties": properties, "single_source_sweep": sweep, "exit_envelope": exit_bounds,
               "sensor_thresholds": sensor, "free_visibility_thresholds": threshold, "verification": verification,
               "response_summary": [{k: v for k, v in run.items() if k not in ("trace", "final_state")} for run in runs]}
    vectors = {"schema": 1, "quaternion_order": "w,x,y,z", "frame": "body to inertial; body +x forward",
               "units": "SI except explicitly suffixed angle_deg", "law": results["law"],
               "baseline_sha256": results["baseline_sha256"], "algebra": verification,
               "state_layout": ["x", "y", "z", "vx", "vy", "vz", "qw", "qx", "qy", "qz", "wx", "wy", "wz"],
               "runs": runs}
    return results, vectors


def convergence_error(tensor, scenario, dt, reference):
    """Independent unsampled free dynamics integration to test RK4 convergence."""
    initial = reference["trace"][0]
    n = unit(scenario["direction"])
    tangent = unit(cross(unit(scenario["normal"]), n))
    mu, r = MU[scenario["body"]], scenario["radius"]
    v = math.sqrt(40**2+2*mu*R0**0.5/(1.5*r**1.5))
    y = np.r_[initial["position_m"], v*tangent, [1, 0, 0, 0], [0, 0, 0]]
    inverse = np.linalg.inv(tensor)
    def f(t, z):
        q, w = z[6:10]/np.linalg.norm(z[6:10]), z[10:13]
        rb = qrot(q*np.array([1, -1, -1, -1]), z[:3])
        return np.r_[z[3:6], acceleration(mu, z[:3]), 0.5*qmul(q, np.r_[0.0, w]),
                     inverse@(torque(tensor, mu, rb)-cross(w, tensor@w))]
    t = 0.0
    while t < 300:
        h = min(dt, 300-t)
        y = rk4(f, t, y, h)
        y[6:10] /= np.linalg.norm(y[6:10])
        t += h
    # Dimensionless scaled full-state error, weighted by position scale, speed, radians and rate.
    scale = np.r_[np.full(3, r), np.full(3, v), np.ones(4), np.full(3, 0.001)]
    return float(np.linalg.norm((y-np.array(reference["final_state"]))/scale))


def serialize(value):
    return json.dumps(value, indent=2, allow_nan=False) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify saved outputs without rewriting")
    args = parser.parse_args()
    results, vectors = make_results()
    for name, value in (("results.json", results), ("vectors.json", vectors)):
        path = HERE / name
        content = serialize(value)
        if args.check:
            assert path.read_text(encoding="utf-8") == content, f"stale output: {name}"
        else:
            path.write_text(content, encoding="utf-8", newline="\n")
    print(f"PASS: algebra, direct-force convergence, RK4 convergence, roll constraint, outer hold; {len(results['single_source_sweep'])} sweep rows, {len(vectors['runs'])} response vectors; "
          + ("saved JSON matches" if args.check else "wrote results.json and vectors.json"))


if __name__ == "__main__":
    main()
