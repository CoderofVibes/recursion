"""Generate and run GMAT scripts, then convert real GMAT reports; never generate reference orbits.

Python standard library only. Run with --help from any working directory.

C1-C4 (phase 1D) lie in the EarthMJ2000Eq XY plane and keep 1D's six-column layout.
C5-C7 (thread 2G) are inclined: the same model, runner and checks in three dimensions.
"""

import argparse
import csv
import hashlib
import io
import json
import math
import re
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
VECTOR_DIR = HERE.parents[1] / "tests" / "vectors" / "gmat"
MU = 398600.4415e9  # GMAT Earth's documented point-mass default, m^3/s^2
G0 = 9.80665
DT = 10
BURN_S = 120
MASS_FLOW = 1000 / (320 * G0)  # kg/s for the C4 engine
R0 = (MU * (6000 / math.tau) ** 2) ** (1 / 3)
V0 = math.sqrt(MU / R0)
EPOCH_A1MJD = 21545
# GMAT holds the spacecraft epoch as a double A1 Modified Julian date. Near J2000 that
# resolves 2**-38 day (~3.14e-7 s), so the reported ElapsedSecs gains round-off on every
# 10 s Propagate even though each propagation lasts 10 s. Measured on R2026a.
EPOCH_ULP_S = math.ulp(float(EPOCH_A1MJD)) * 86400
STOP_TOL_TEXT = "1e-6"  # tightest decade GMAT can meet above that epoch resolution
STOP_TOL = float(STOP_TOL_TEXT)
TIME_TOL = 1e-5  # timing allowance beyond accumulated epoch round-off
STATE_TOL_M, STATE_TOL_MPS = 0.05, 5e-5  # sanity limits vs independent solutions
COLUMNS = "t_s,x_m,y_m,vx_mps,vy_mps,mass_kg".split(",")  # planar cases C1-C4
COLUMNS_3D = "t_s,x_m,y_m,z_m,vx_mps,vy_mps,vz_mps,mass_kg".split(",")  # inclined cases C5-C7
VARIANTS = {  # "tight" is an audit-only copy, written outside tools/gmat by `run`.
    "baseline": {"accuracy": "1e-12", "max_step": 10, "suffix": ""},
    "tight": {"accuracy": "1e-13", "max_step": 5, "suffix": ".tight"},
}
COMPARE_TOL = {"position_m": 0.1, "velocity_mps": 1e-4, "mass_kg": 1e-6}


def hyperbolic_state(time_from_periapsis):
    """Closed-form conic with Newton solve for hyperbolic anomaly (SI)."""
    e, a = 1.5, R0 / 0.5  # a is the positive magnitude of negative SMA
    n = math.sqrt(MU / a**3)
    mean = n * time_from_periapsis
    anomaly = math.asinh(mean / e)
    for _ in range(50):
        correction = (e * math.sinh(anomaly) - anomaly - mean) / (
            e * math.cosh(anomaly) - 1
        )
        anomaly -= correction
        if abs(correction) < 1e-14:
            break
    rate = n / (e * math.cosh(anomaly) - 1)
    return (
        a * (e - math.cosh(anomaly)),
        a * math.sqrt(e**2 - 1) * math.sinh(anomaly),
        -a * math.sinh(anomaly) * rate,
        a * math.sqrt(e**2 - 1) * math.cosh(anomaly) * rate,
    )


def elliptic_state(a, e, period, time_from_periapsis):
    """Closed-form ellipse in its own plane, periapsis on +x, by Newton solve of Kepler's equation."""
    mean = math.remainder(math.tau * time_from_periapsis / period, math.tau)
    anomaly = mean
    for _ in range(50):
        correction = (anomaly - e * math.sin(anomaly) - mean) / (
            1 - e * math.cos(anomaly)
        )
        anomaly -= correction
        if abs(correction) < 1e-14:
            break
    rate = math.sqrt(MU / a**3) / (1 - e * math.cos(anomaly))
    return (a * (math.cos(anomaly) - e),
            a * math.sqrt(1 - e**2) * math.sin(anomaly),
            -a * math.sin(anomaly) * rate,
            a * math.sqrt(1 - e**2) * math.cos(anomaly) * rate)


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def norm(a):
    return math.sqrt(dot(a, a))


def orbit_axes(inc_deg, raan_deg, aop_deg):
    """Inertial unit vectors of an orbit plane: P (to periapsis), Q (90 deg ahead), W (normal).

    The classical 3-1-3 rotation Rz(RAAN) Rx(INC) Rz(AOP); W is along the angular momentum.
    """
    inc, raan, aop = (math.radians(angle) for angle in (inc_deg, raan_deg, aop_deg))
    ci, si, co, so = math.cos(inc), math.sin(inc), math.cos(raan), math.sin(raan)
    cw, sw = math.cos(aop), math.sin(aop)
    return ((co * cw - so * sw * ci, so * cw + co * sw * ci, sw * si),
            (-co * sw - so * cw * ci, -so * sw + co * cw * ci, cw * si),
            (so * si, -co * si, ci))


def lift(planar, axes):
    """Place an in-plane state (x, y, vx, vy) on the plane spanned by P and Q: a 6-vector."""
    x, y, vx, vy = planar
    p, q, _ = axes
    return (*(x * a + y * b for a, b in zip(p, q)), *(vx * a + vy * b for a, b in zip(p, q)))


A2 = (MU * (24000 / math.tau) ** 2) ** (1 / 3)
E2 = 1 - R0 / A2
A5 = (MU * (12000 / math.tau) ** 2) ** (1 / 3)
E5 = 0.35
C5_PERIOD_S, C5_T0_S = 12000, 1500  # starts 1500 s after periapsis: mean anomaly 45 deg
# Orientation (INC, RAAN, AOP) in degrees. C6 is circular, so its "AOP" is the argument of
# latitude at t=0. C7 is retrograde (INC > 90 deg).
ORIENTATION = {"C5": (55, 40, 30), "C6": (45, 100, 40), "C7": (120, 250, 70)}
# Finite burns start at t=0 and stop at stop_s: constant thrust and Isp, mass flow F/(Isp*g0).
# Without "direction" the thrust follows the instantaneous velocity (GMAT Local VNB +X).
BURNS = {
    "C4": {"thrust_N": 1000, "Isp_s": 320, "stop_s": BURN_S, "name": "Prograde",
           "law": "instantaneous Earth-relative velocity (Local VNB +X)"},
    "C6": {"thrust_N": 2000, "Isp_s": 300, "stop_s": 200, "name": "PlaneChange",
           "direction": (3 / 7, -2 / 7, 6 / 7),
           "law": "fixed in EarthMJ2000Eq (inertial) for the whole burn, unit vector (3,-2,6)/7; "
                  "it does not follow the velocity or the orbit plane"},
}
CASES = {
    "C1": {"name": "circular", "duration_s": 18000,
           "initial": (R0, 0.0, 0.0, V0)},
    "C2": {"name": "eccentric", "duration_s": 72000,
           "initial": (R0, 0.0, 0.0, math.sqrt(MU * (2 / R0 - 1 / A2)))},
    "C3": {"name": "hyperbolic", "duration_s": 40000,
           "initial": hyperbolic_state(-20000)},
    "C4": {"name": "finite_burn", "duration_s": 6120,
           "initial": (R0, 0.0, 0.0, V0)},
    "C5": {"name": "inclined_eccentric", "duration_s": 36000,
           "note": "Ellipse: period 12000 s, ECC 0.35, INC 55, RAAN 40, AOP 30 deg; "
                   "t=0 is 1500 s after periapsis. Three periods.",
           "initial": lift(elliptic_state(A5, E5, C5_PERIOD_S, C5_T0_S),
                           orbit_axes(*ORIENTATION["C5"])),
           "orbit": {"shape": "ellipse", "sma_m": A5, "ecc": E5, "period_s": C5_PERIOD_S,
                     "inc_deg": 55, "raan_deg": 40, "aop_deg": 30, "mean_anomaly_deg_at_t0": 45,
                     "time_since_periapsis_s_at_t0": C5_T0_S}},
    "C6": {"name": "inclined_burn", "duration_s": 7200,
           "note": "Circle: period 6000 s, INC 45, RAAN 100 deg, argument of latitude 40 deg "
                   "at t=0. 2000 N, Isp 300 s for 0-200 s along the constant EarthMJ2000Eq "
                   "unit vector (3,-2,6)/7 (inertially fixed, not VNB), then a 7000 s coast.",
           "initial": lift((R0, 0.0, 0.0, V0), orbit_axes(*ORIENTATION["C6"])),
           "orbit": {"shape": "circle before the burn", "radius_m": R0, "period_s": 6000,
                     "inc_deg": 45, "raan_deg": 100, "arg_latitude_deg_at_t0": 40}},
    "C7": {"name": "inclined_hyperbolic", "duration_s": 40000,
           "note": "Hyperbola: ECC 1.5, periapsis radius as C1, INC 120 (retrograde), RAAN 250, "
                   "AOP 70 deg; periapsis at t=20000 s.",
           "initial": lift(hyperbolic_state(-20000), orbit_axes(*ORIENTATION["C7"])),
           "orbit": {"shape": "hyperbola", "sma_m": -R0 / 0.5, "ecc": 1.5,
                     "periapsis_radius_m": R0, "inc_deg": 120, "raan_deg": 250, "aop_deg": 70,
                     "periapsis_time_s": 20000}},
}
PLANAR = [case for case, spec in CASES.items() if len(spec["initial"]) == 4]
INCLINED = [case for case, spec in CASES.items() if len(spec["initial"]) == 6]


def is_3d(case):
    return len(CASES[case]["initial"]) == 6


def mass_flow(case):
    return BURNS[case]["thrust_N"] / (BURNS[case]["Isp_s"] * G0)  # kg/s


def basename(case):
    return f"{case.lower()}-{CASES[case]['name']}"


def script_text(case, variant="baseline"):
    spec, settings = CASES[case], VARIANTS[variant]
    if is_3d(case):
        x, y, z, vx, vy, vz = (format(value / 1000, ".17g") for value in spec["initial"])
    else:  # 1D's planar scripts, byte for byte
        x, y, vx, vy = (format(value / 1000, ".17g") for value in spec["initial"])
        z = vz = "0"
    burn = BURNS.get(case)
    lines = [
        f"% Recursion {'2G' if is_3d(case) else '1D'} {case}: {spec['name']}. "
        "GENERATED by reference.py; edit the generator.",
        "% [ASSUMED] Test configuration. Run record: docs/verification/gmat.md.",
        "% EarthMJ2000Eq, km and km/s here; converter produces SI CSV.",
        "% Raw columns: elapsed_s,x_km,y_km,z_km,vx_km_s,vy_km_s,vz_km_s,mass_kg,mu_km3_s2.",
        "% ElapsedSecs stop conditions are durations; always advance another 10 s.",
        "% Reported ElapsedSecs carries GMAT epoch round-off; the converter grids by sample.",
    ]
    if "note" in spec:
        lines.append(f"% {spec['note']}")
    if variant != "baseline":
        lines.append(f"% AUDIT VARIANT '{variant}': never convert into committed vectors.")
    lines += [
        "GMAT Earth.Mu = 398600.4415;",
        "Create Spacecraft Sat;",
        "GMAT Sat.DateFormat = A1ModJulian;",
        f"GMAT Sat.Epoch = '{EPOCH_A1MJD}';",
        "GMAT Sat.CoordinateSystem = EarthMJ2000Eq;",
        "GMAT Sat.DisplayStateType = Cartesian;",
        f"GMAT Sat.X = {x};",
        f"GMAT Sat.Y = {y};",
        f"GMAT Sat.Z = {z};",
        f"GMAT Sat.VX = {vx};",
        f"GMAT Sat.VY = {vy};",
        f"GMAT Sat.VZ = {vz};",
        f"GMAT Sat.DryMass = {800 if burn else 1000};",
    ]
    if burn:
        lines += [
            "Create ChemicalTank Fuel;",
            "GMAT Fuel.FuelMass = 200;",
            "Create ChemicalThruster Engine;",
        ]
        if "direction" in burn:  # components in the inertial frame, constant for the whole burn
            lines.append("GMAT Engine.CoordinateSystem = EarthMJ2000Eq;")
            lines += [f"GMAT Engine.ThrustDirection{axis} = {component:.17g};"
                      for axis, component in enumerate(burn["direction"], 1)]
        else:  # first axis of VNB: along the instantaneous velocity
            lines += [
                "GMAT Engine.CoordinateSystem = Local;",
                "GMAT Engine.Origin = Earth;",
                "GMAT Engine.Axes = VNB;",
                "GMAT Engine.ThrustDirection1 = 1;",
                "GMAT Engine.ThrustDirection2 = 0;",
                "GMAT Engine.ThrustDirection3 = 0;",
            ]
        lines += [
            "GMAT Engine.DutyCycle = 1;",
            "GMAT Engine.ThrustScaleFactor = 1;",
            "GMAT Engine.DecrementMass = true;",
            "GMAT Engine.GravitationalAccel = 9.80665;",
            "GMAT Engine.Tank = {Fuel};",
            f"GMAT Engine.C1 = {burn['thrust_N']};",
            f"GMAT Engine.K1 = {burn['Isp_s']};",
        ]
        for coefficient in range(2, 17):
            lines += [f"GMAT Engine.C{coefficient} = 0;",
                      f"GMAT Engine.K{coefficient} = 0;"]
        lines += [
            "GMAT Sat.Tanks = {Fuel};",
            "GMAT Sat.Thrusters = {Engine};",
            f"Create FiniteBurn {burn['name']};",
            f"GMAT {burn['name']}.Thrusters = {{Engine}};",
        ]
    lines += [
        "Create ForceModel PointEarth;",
        "GMAT PointEarth.CentralBody = Earth;",
        "GMAT PointEarth.PrimaryBodies = {};",
        "GMAT PointEarth.PointMasses = {Earth};",
        "GMAT PointEarth.Drag = None;",
        "GMAT PointEarth.SRP = Off;",
        "GMAT PointEarth.RelativisticCorrection = Off;",
        "GMAT PointEarth.ErrorControl = RSSStep;",
        "Create Propagator Reference;",
        "GMAT Reference.FM = PointEarth;",
        "GMAT Reference.Type = RungeKutta89;",
        "GMAT Reference.InitialStepSize = 1;",
        f"GMAT Reference.Accuracy = {settings['accuracy']};",
        "GMAT Reference.MinStep = 0;",
        f"GMAT Reference.MaxStep = {settings['max_step']};",
        "GMAT Reference.MaxStepAttempts = 100;",
        "GMAT Reference.StopIfAccuracyIsViolated = true;",
        "Create ReportFile Raw;",
        f"GMAT Raw.Filename = '{basename(case)}{settings['suffix']}.raw.csv';",
        "GMAT Raw.Precision = 17;",
        "GMAT Raw.WriteHeaders = false;",
        "GMAT Raw.FixedWidth = false;",
        "GMAT Raw.Delimiter = ',';",
        "GMAT Raw.WriteReport = false;",
        "Create Variable sample bodyMu;",
        "BeginMissionSequence;",
        "GMAT sample = 0;",
        "% Configured GM, not a runtime measurement (Earth.Mu is a setup field).",
        "GMAT bodyMu = 398600.4415;",
    ]
    report = ("Report Raw Sat.ElapsedSecs Sat.EarthMJ2000Eq.X Sat.EarthMJ2000Eq.Y "
              "Sat.EarthMJ2000Eq.Z Sat.EarthMJ2000Eq.VX Sat.EarthMJ2000Eq.VY "
              "Sat.EarthMJ2000Eq.VZ Sat.TotalMass bodyMu;")
    lines.append(report)  # Initialize elapsed-time reporting at the initial epoch.
    if burn:
        lines.append(f"BeginFiniteBurn {burn['name']}(Sat);")
    for end_step in ([burn["stop_s"] // DT, spec["duration_s"] // DT] if burn
                     else [spec["duration_s"] // DT]):
        lines += [
            f"While sample < {end_step}",
            "   Propagate Reference(Sat) {Sat.ElapsedSecs = 10, "
            f"StopTolerance = {STOP_TOL_TEXT}}};",
            "   GMAT sample = sample + 1;",
            "   " + report,
            "EndWhile;",
        ]
        if burn and end_step == burn["stop_s"] // DT:
            lines.append(f"EndFiniteBurn {burn['name']}(Sat);")
    return "\n".join(lines) + "\n"


def expected_mass(case, time):
    return 1000 - (mass_flow(case) * min(time, BURNS[case]["stop_s"]) if case in BURNS else 0)


def analytic_state(case, time):
    """Independent Kepler sanity check, never used to write reference vectors.

    Planar cases give (x, y, vx, vy). Inclined cases give (x, y, z, vx, vy, vz): the in-plane
    closed form placed on the stated orbit plane.
    """
    if case == "C5":
        return lift(elliptic_state(A5, E5, C5_PERIOD_S, C5_T0_S + time),
                    orbit_axes(*ORIENTATION[case]))
    if case == "C7":
        return lift(hyperbolic_state(time - 20000), orbit_axes(*ORIENTATION[case]))
    if case == "C1":
        angle = math.tau * time / 6000
        return (R0 * math.cos(angle), R0 * math.sin(angle),
                -V0 * math.sin(angle), V0 * math.cos(angle))
    if case == "C3":
        return hyperbolic_state(time - 20000)
    if case != "C2":
        raise ValueError("No analytic powered-flight reference")
    return elliptic_state(A2, E2, 24000, time)


def f_and_g(r0, speed_squared, r_dot_v, dt):
    """Lagrange coefficients (f, g, f_dot, g_dot) of a point-mass elliptic orbit over dt."""
    energy = speed_squared / 2 - MU / r0
    if energy >= 0:
        raise ValueError("Kepler coast check needs an elliptic orbit")
    a = -MU / (2 * energy)
    n = math.sqrt(MU / a**3)
    ecos, esin = 1 - r0 / a, r_dot_v / math.sqrt(MU * a)
    delta = n * dt  # eccentric-anomaly change, from Kepler's equation in differences
    for _ in range(50):
        f_val = (delta - ecos * math.sin(delta) + esin * (1 - math.cos(delta)) - n * dt)
        correction = f_val / (1 - ecos * math.cos(delta) + esin * math.sin(delta))
        delta -= correction
        if abs(correction) < 1e-15:
            break
    r = a * (1 - ecos * math.cos(delta) + esin * math.sin(delta))
    f = 1 - a / r0 * (1 - math.cos(delta))
    g = dt - (delta - math.sin(delta)) / n
    f_dot = -math.sqrt(MU * a) * math.sin(delta) / (r * r0)
    g_dot = 1 - a / r * (1 - math.cos(delta))
    return f, g, f_dot, g_dot


def kepler_from_state(state, dt):
    """Point-mass elliptic propagation of a planar SI state by f and g functions."""
    x, y, vx, vy = state
    f, g, f_dot, g_dot = f_and_g(math.hypot(x, y), vx * vx + vy * vy, x * vx + y * vy, dt)
    return (f * x + g * vx, f * y + g * vy, f_dot * x + g_dot * vx, f_dot * y + g_dot * vy)


def kepler_from_state_3d(state, dt):
    """kepler_from_state for a 3D SI state (x, y, z, vx, vy, vz): the same f and g functions."""
    position, velocity = state[:3], state[3:6]
    f, g, f_dot, g_dot = f_and_g(norm(position), dot(velocity, velocity),
                                 dot(position, velocity), dt)
    return (*(f * p + g * v for p, v in zip(position, velocity)),
            *(f_dot * p + g_dot * v for p, v in zip(position, velocity)))


def elements_from_state(state):
    """Classical elements of a 3D SI state, from its angular-momentum, node and eccentricity
    vectors: sma_m, ecc, inc_deg, raan_deg, aop_deg, true_anomaly_deg, arg_latitude_deg.

    A separate route to the angles that lift() was given; used by tests and to describe
    results, never to write vectors. For a circle use arg_latitude_deg, not aop/true anomaly.
    """
    position, velocity = state[:3], state[3:6]
    r, h = norm(position), cross(position, velocity)
    node = (-h[1], h[0], 0.0)  # z axis cross h: toward the ascending node
    ecc_vector = [(dot(velocity, velocity) - MU / r) * p / MU - dot(position, velocity) * v / MU
                  for p, v in zip(position, velocity)]

    def angle_in_plane(vector, origin):  # from `origin`, positive about h, 0..360 deg
        return math.degrees(math.atan2(dot(cross(origin, vector), h) / norm(h),
                                       dot(origin, vector))) % 360

    return {"sma_m": 1 / (2 / r - dot(velocity, velocity) / MU), "ecc": norm(ecc_vector),
            "inc_deg": math.degrees(math.atan2(math.hypot(h[0], h[1]), h[2])),
            "raan_deg": math.degrees(math.atan2(node[1], node[0])) % 360,
            "aop_deg": angle_in_plane(ecc_vector, node),
            "true_anomaly_deg": angle_in_plane(position, ecc_vector),
            "arg_latitude_deg": angle_in_plane(position, node)}


def rk4_samples(case, step, end_s=None):
    """Independent fixed-step RK4 of a case's stated model, for audits only; never a vector.

    Point-mass gravity; C4 adds 1000 N along the instantaneous velocity with constant
    mass flow until exactly 120 s. Returns 10 s samples as [t, x, y, vx, vy, mass]
    (inclined cases: [t, x, y, z, vx, vy, vz, mass], from rk4_samples_3d).
    """
    if is_3d(case):
        return rk4_samples_3d(case, step, end_s)
    substeps = round(DT / step)
    if substeps < 1 or abs(substeps * step - DT) > 1e-9 * DT:
        raise ValueError("RK4 step must divide the 10 s sample interval")
    h = DT / substeps
    end_s = CASES[case]["duration_s"] if end_s is None else end_s
    state = [*CASES[case]["initial"], 1000.0]

    def rate(values, thrusting):
        x, y, vx, vy, mass = values
        gravity = -MU / math.hypot(x, y) ** 3
        thrust = 1000 / (mass * math.hypot(vx, vy)) if thrusting else 0.0
        return [vx, vy, gravity * x + thrust * vx, gravity * y + thrust * vy,
                -MASS_FLOW if thrusting else 0.0]

    rows = [[0, *state]]
    for sample in range(1, end_s // DT + 1):
        thrusting = case == "C4" and sample * DT <= BURN_S  # 10 s divides the 120 s burn
        for _ in range(substeps):
            k1 = rate(state, thrusting)
            k2 = rate([s + h / 2 * k for s, k in zip(state, k1)], thrusting)
            k3 = rate([s + h / 2 * k for s, k in zip(state, k2)], thrusting)
            k4 = rate([s + h * k for s, k in zip(state, k3)], thrusting)
            state = [s + h / 6 * (a + 2 * b + 2 * c + d)
                     for s, a, b, c, d in zip(state, k1, k2, k3, k4)]
        rows.append([sample * DT, *state])
    return rows


def burn_arc(substeps=200):
    """Converged RK4 of the C4 burn arc (0..120 s), for auditing GMAT only."""
    return rk4_samples("C4", DT / substeps, BURN_S)


def rk4_samples_3d(case, step, end_s=None):
    """rk4_samples for the inclined cases: 10 s samples as [t, x, y, z, vx, vy, vz, mass].

    Point-mass gravity in three dimensions. A burn adds its constant thrust along its fixed
    inertial direction, with constant mass flow, until exactly its stop time.
    """
    substeps = round(DT / step)
    if substeps < 1 or abs(substeps * step - DT) > 1e-9 * DT:
        raise ValueError("RK4 step must divide the 10 s sample interval")
    h = DT / substeps
    end_s = CASES[case]["duration_s"] if end_s is None else end_s
    burn = BURNS.get(case)
    state = [*CASES[case]["initial"], 1000.0]

    def rate(values, thrusting):
        x, y, z, vx, vy, vz, mass = values
        gravity = -MU / math.hypot(x, y, z) ** 3
        thrust = burn["thrust_N"] / mass if thrusting else 0.0
        ux, uy, uz = burn["direction"] if thrusting else (0.0, 0.0, 0.0)
        return [vx, vy, vz, gravity * x + thrust * ux, gravity * y + thrust * uy,
                gravity * z + thrust * uz, -mass_flow(case) if thrusting else 0.0]

    rows = [[0, *state]]
    for sample in range(1, end_s // DT + 1):
        thrusting = bool(burn) and sample * DT <= burn["stop_s"]  # 10 s divides the burn
        for _ in range(substeps):
            k1 = rate(state, thrusting)
            k2 = rate([s + h / 2 * k for s, k in zip(state, k1)], thrusting)
            k3 = rate([s + h / 2 * k for s, k in zip(state, k2)], thrusting)
            k4 = rate([s + h * k for s, k in zip(state, k3)], thrusting)
            state = [s + h / 6 * (a + 2 * b + 2 * c + d)
                     for s, a, b, c, d in zip(state, k1, k2, k3, k4)]
        rows.append([sample * DT, *state])
    return rows


def burn_arc_3d(case, substeps=200):
    """Converged RK4 of an inclined case's burn arc (0..stop), for auditing GMAT only."""
    return rk4_samples_3d(case, DT / substeps, BURNS[case]["stop_s"])


def thrust_delta_v(case, rows):
    """Velocity the engine added over the burn, measured from the samples themselves.

    v(cutoff) - v(0) minus the integral of point-mass gravity along the sampled path
    (Boole's rule on the 10 s samples; its truncation error here is below 1e-9 m/s).
    Returns the 3-vector in m/s; the rocket equation says Isp*g0*ln(m0/m_cutoff) along the
    thrust direction when that direction is inertially fixed.
    """
    steps = BURNS[case]["stop_s"] // DT
    if steps % 4:
        raise ValueError("Boole's rule needs the burn to span a multiple of four 10 s intervals")
    weights = [7 if index in (0, steps) else 32 if index % 2 else 12 if index % 4 else 14
               for index in range(steps + 1)]
    gravity = [[-MU * component / norm(row[1:4]) ** 3 for component in row[1:4]]
               for row in rows[:steps + 1]]
    return [rows[steps][4 + axis] - rows[0][4 + axis]
            - 2 * DT / 45 * sum(weight * g[axis] for weight, g in zip(weights, gravity))
            for axis in range(3)]


def validate_rows_3d(case, rows):
    """validate_rows for an inclined case: rows of [reported_t, x, y, z, vx, vy, vz, mass] (SI)."""
    spec, burn = CASES[case], BURNS.get(case)
    count = spec["duration_s"] // DT + 1
    if len(rows) != count:
        raise ValueError(f"{case}: expected {count} rows, got {len(rows)}")
    max_drift = max_mass_error = 0.0
    mass_tolerance = 1e-7 + (mass_flow(case) * TIME_TOL if burn else 0)
    for index, row in enumerate(rows):
        if len(row) != 8 or not all(math.isfinite(v) for v in row):
            raise ValueError(f"{case} row {index}: nonfinite or wrong column count")
        grid = index * DT
        drift = abs(row[0] - grid)
        max_drift = max(max_drift, drift)
        if drift > TIME_TOL + index * EPOCH_ULP_S:
            raise ValueError(f"{case} row {index}: time {row[0]} is off the 10 s grid")
        mass_error = abs(row[7] - expected_mass(case, grid))
        max_mass_error = max(max_mass_error, mass_error)
        if mass_error > mass_tolerance:
            raise ValueError(f"{case} row {index}: incorrect mass / mass flow")
    if (math.dist(rows[0][1:4], spec["initial"][:3]) > 1e-6
            or math.dist(rows[0][4:7], spec["initial"][3:]) > 1e-9):
        raise ValueError(f"{case} row 0: state disagrees with the initial state")

    def energy(row):
        return dot(row[4:7], row[4:7]) / 2 - MU / norm(row[1:4])

    def momentum(row):
        return cross(row[1:4], row[4:7])

    def tilt(h_a, h_b):  # angle between two orbit normals, rad (small-angle safe)
        return math.atan2(norm(cross(h_a, h_b)), dot(h_a, h_b))

    # Coasting on a point mass keeps the energy and the whole angular-momentum vector, so
    # the orbit plane cannot turn. A burn case is held to that from its cutoff sample on.
    cutoff_index = burn["stop_s"] // DT if burn else 0
    cutoff = rows[cutoff_index]
    energy_ref, h_ref = energy(cutoff), momentum(cutoff)
    conservation = {"energy_J_per_kg": 0.0, "angular_momentum_vector_relative": 0.0,
                    "orbit_normal_rad": 0.0}
    for row in rows[cutoff_index:]:
        h = momentum(row)
        for key, value in (("energy_J_per_kg", abs(energy(row) - energy_ref)),
                           ("angular_momentum_vector_relative",
                            math.dist(h, h_ref) / norm(h_ref)),
                           ("orbit_normal_rad", tilt(h, h_ref))):
            conservation[key] = max(conservation[key], value)
    if (conservation["energy_J_per_kg"] > 0.1
            or conservation["angular_momentum_vector_relative"] > 1e-9
            or conservation["orbit_normal_rad"] > 1e-9):
        raise ValueError(f"{case}: coast energy/angular momentum/orbit plane drift")
    checks = {"rows": count, "max_reported_time_drift_s": max_drift,
              "max_mass_error_kg": max_mass_error, "coast_conservation_max": conservation}
    if burn:
        # The burn must turn the orbit plane and, having a prograde part, add orbital energy.
        plane_change = tilt(momentum(rows[0]), h_ref)
        if plane_change < 1e-3 or energy_ref <= energy(rows[0]):
            raise ValueError(f"{case}: burn did not turn the orbit plane and add orbital energy")
        ideal = BURNS[case]["Isp_s"] * G0 * math.log(1000 / expected_mass(case, burn["stop_s"]))
        gained = thrust_delta_v(case, rows)
        delta_v_error = math.dist(gained, [ideal * u for u in burn["direction"]])
        checks["burn"] = {"plane_change_rad": plane_change,
                          "thrust_delta_v_mps": norm(gained),
                          "rocket_equation_delta_v_mps": ideal,
                          "thrust_delta_v_vector_error_mps": delta_v_error}
        if delta_v_error > STATE_TOL_MPS:
            raise ValueError(f"{case}: velocity gained from thrust disagrees with the rocket "
                             f"equation along the stated direction ({delta_v_error:.3g} m/s)")
        arc = burn_arc_3d(case)
        segments = {"burn_rk4": [(row, reference[1:7]) for row, reference
                                 in zip(rows[:cutoff_index + 1], arc)],
                    "coast_kepler": [(row, kepler_from_state_3d(cutoff[1:7],
                                                                (index - cutoff_index) * DT))
                                     for index, row in enumerate(rows) if index > cutoff_index]}
    else:
        segments = {"kepler": [(row, analytic_state(case, index * DT))
                               for index, row in enumerate(rows)]}
    errors = {}
    for segment, pairs in segments.items():
        position = max(math.dist(r[1:4], e[:3]) for r, e in pairs)
        velocity = max(math.dist(r[4:7], e[3:6]) for r, e in pairs)
        errors[segment] = {"position_m": position, "velocity_mps": velocity}
        if position > STATE_TOL_M or velocity > STATE_TOL_MPS:
            raise ValueError(f"{case}: state disagrees with independent {segment} solution "
                             f"({position:.3g} m, {velocity:.3g} m/s)")
    checks["independent_max_errors"] = errors
    return checks


def validate_rows(case, rows):
    """Check rows of [reported_t, x, y, vx, vy, mass] (SI) for one case.

    Physical checks use the exact sample time index*10 s. The reported time may drift
    from it only by GMAT's accumulated epoch round-off plus TIME_TOL.
    Inclined cases carry z and vz as well and are checked by validate_rows_3d.
    """
    if is_3d(case):
        return validate_rows_3d(case, rows)
    count = CASES[case]["duration_s"] // DT + 1
    if len(rows) != count:
        raise ValueError(f"{case}: expected {count} rows, got {len(rows)}")
    max_drift = max_mass_error = 0.0
    # Allow TIME_TOL of physical stop timing at full flow (R2026a: ~5e-7 s at the first stop).
    mass_tolerance = 1e-7 + (MASS_FLOW * TIME_TOL if case == "C4" else 0)
    for index, row in enumerate(rows):
        if len(row) != 6 or not all(math.isfinite(v) for v in row):
            raise ValueError(f"{case} row {index}: nonfinite or wrong column count")
        grid = index * DT
        drift = abs(row[0] - grid)
        max_drift = max(max_drift, drift)
        if drift > TIME_TOL + index * EPOCH_ULP_S:
            raise ValueError(f"{case} row {index}: time {row[0]} is off the 10 s grid")
        mass_error = abs(row[5] - expected_mass(case, grid))
        max_mass_error = max(max_mass_error, mass_error)
        if mass_error > mass_tolerance:
            raise ValueError(f"{case} row {index}: incorrect mass / mass flow")
    if (math.hypot(rows[0][1] - CASES[case]["initial"][0], rows[0][2] - CASES[case]["initial"][1]) > 1e-6
            or math.hypot(rows[0][3] - CASES[case]["initial"][2],
                          rows[0][4] - CASES[case]["initial"][3]) > 1e-9):
        raise ValueError(f"{case} row 0: state disagrees with the initial state")
    cutoff_index = BURN_S // DT
    if case == "C4":
        # C4 must gain orbital energy during its prograde burn and conserve it in coast.
        def energy(row):
            return (row[3] ** 2 + row[4] ** 2) / 2 - MU / math.hypot(row[1], row[2])
        cutoff = rows[cutoff_index]
        energy_at_cutoff = energy(cutoff)
        if energy_at_cutoff <= energy(rows[0]):
            raise ValueError("C4: prograde burn did not increase orbital energy")
        momentum = cutoff[1] * cutoff[4] - cutoff[2] * cutoff[3]
        for row in rows[cutoff_index:]:
            h = row[1] * row[4] - row[2] * row[3]
            if abs(energy(row) - energy_at_cutoff) > 0.1 or abs(h / momentum - 1) > 1e-9:
                raise ValueError("C4: coast energy/angular momentum drift")
        burn = burn_arc()
        segments = {"burn_rk4": [(row, reference[1:5]) for row, reference
                                 in zip(rows[:cutoff_index + 1], burn)],
                    "coast_kepler": [(row, kepler_from_state(cutoff[1:5], (index - cutoff_index) * DT))
                                     for index, row in enumerate(rows) if index > cutoff_index]}
    else:
        segments = {"kepler": [(row, analytic_state(case, index * DT))
                               for index, row in enumerate(rows)]}
    errors = {}
    for segment, pairs in segments.items():
        position = max(math.hypot(r[1] - e[0], r[2] - e[1]) for r, e in pairs)
        velocity = max(math.hypot(r[3] - e[2], r[4] - e[3]) for r, e in pairs)
        errors[segment] = {"position_m": position, "velocity_mps": velocity}
        if position > STATE_TOL_M or velocity > STATE_TOL_MPS:
            raise ValueError(f"{case}: state disagrees with independent {segment} solution "
                             f"({position:.3g} m, {velocity:.3g} m/s)")
    return {"rows": count, "max_reported_time_drift_s": max_drift,
            "max_mass_error_kg": max_mass_error, "independent_max_errors": errors}


def parse_raw(case, raw_text):
    rows = []
    for line_number, fields in enumerate(csv.reader(io.StringIO(raw_text)), 1):
        if not fields or all(not value.strip() for value in fields):
            continue
        if len(fields) != 9:
            raise ValueError(f"raw line {line_number}: expected 9 columns")
        values = [float(value) for value in fields]
        if not all(math.isfinite(value) for value in values):
            raise ValueError(f"raw line {line_number}: nonfinite value")
        time, x, y, z, vx, vy, vz, mass, mu = values
        if abs(mu * 1e9 - MU) > 1:
            raise ValueError(f"raw line {line_number}: wrong Earth GM")
        if is_3d(case):
            rows.append([time, x * 1000, y * 1000, z * 1000,
                         vx * 1000, vy * 1000, vz * 1000, mass])
            continue
        if abs(z * 1000) > 1e-6 or abs(vz * 1000) > 1e-9:
            raise ValueError(f"raw line {line_number}: trajectory left the equatorial plane")
        rows.append([time, x * 1000, y * 1000, vx * 1000, vy * 1000, mass])
    return rows, validate_rows(case, rows)


def columns(case):
    return COLUMNS_3D if is_3d(case) else COLUMNS


def worst_differences(first, second):
    """Largest same-sample differences between two runs' rows, planar or 3D."""
    half = (len(first[0]) - 2) // 2  # 2 planar, 3 inclined
    return {
        "position_m": max(math.dist(a[1:1 + half], b[1:1 + half]) for a, b in zip(first, second)),
        "velocity_mps": max(math.dist(a[1 + half:1 + 2 * half], b[1 + half:1 + 2 * half])
                            for a, b in zip(first, second)),
        "mass_kg": max(abs(a[-1] - b[-1]) for a, b in zip(first, second)),
    }


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def metadata(case, version, raw_bytes, checks, run=None):
    script = HERE / f"{basename(case)}.script"
    if script.read_text(encoding="utf-8") != script_text(case):
        raise ValueError(f"{script.name} differs from the declared case; regenerate or update specification")
    burn = BURNS.get(case)
    burn_meta = burn and {"start_s": 0, "stop_s": burn["stop_s"], "thrust_N": burn["thrust_N"],
                          "Isp_s": burn["Isp_s"], "g0_mps2": G0, "dry_mass_kg": 800,
                          "fuel_initial_kg": 200, "direction": burn["law"],
                          "coast_duration_s": CASES[case]["duration_s"] - burn["stop_s"]}
    if burn and "direction" in burn:
        burn_meta["direction_unit_EarthMJ2000Eq"] = list(burn["direction"])
    meta = {
        "case": case, "gmat_version": version, "frame": "EarthMJ2000Eq",
        "epoch_A1ModJulian": EPOCH_A1MJD, "mu_m3_s2": MU,
        "initial_state_SI": [*CASES[case]["initial"], 1000],
        "initial_state_columns": [*columns(case)[1:]],
        "sample_interval_s": DT, "duration_s": CASES[case]["duration_s"],
        "time_column": "sample index * 10 s of propagation; GMAT ElapsedSecs epoch "
                       "round-off is recorded in checks, never interpolated",
        "propagator": "RungeKutta89", "accuracy": float(VARIANTS["baseline"]["accuracy"]), "error_control": "RSSStep",
        "max_step_s": VARIANTS["baseline"]["max_step"], "stop_tolerance_s": STOP_TOL,
        "burn": burn_meta,
        "raw_sha256": hashlib.sha256(raw_bytes).hexdigest(),
        "script_sha256": sha256(script),
        "gmat_run": run,
        "checks": checks,
    }
    if is_3d(case):  # the stated orbit the initial state was built from (angles in degrees)
        meta["orbit"] = CASES[case]["orbit"]
    return meta


def convert(case, raw_dir, version):
    raw_path = raw_dir / f"{basename(case)}.raw.csv"
    raw_bytes = raw_path.read_bytes()
    rows, checks = parse_raw(case, raw_bytes.decode("utf-8-sig"))
    run = None
    manifest_path = raw_dir / "manifest.json"
    if manifest_path.is_file():  # written by `run`; cross-check it rather than trust it
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        entry = manifest["runs"].get(case)
        if manifest.get("variant") != "baseline" or not entry:
            raise ValueError(f"{manifest_path}: not a baseline run of {case}")
        if entry["raw_sha256"] != hashlib.sha256(raw_bytes).hexdigest():
            raise ValueError(f"{raw_path.name}: changed since the recorded GMAT run")
        run = {key: manifest[key] for key in ("gmat_build_date", "gmat_console_sha256")}
    meta = metadata(case, version, raw_bytes, checks, run)
    VECTOR_DIR.mkdir(parents=True, exist_ok=True)
    output = VECTOR_DIR / f"{basename(case)}.csv"
    stream = io.StringIO(newline="")
    stream.write("# " + json.dumps(meta, sort_keys=True, separators=(",", ":")) + "\n")
    writer = csv.writer(stream, lineterminator="\n")
    writer.writerow(columns(case))
    for index, row in enumerate(rows):
        # The time column is the sample's propagation time; states are never interpolated.
        writer.writerow([str(index * DT), *(format(v, ".17g") for v in row[1:])])
    content = stream.getvalue().encode("utf-8")
    # A vector that already holds exactly these bytes is left untouched (others may be reading it).
    unchanged = output.is_file() and output.read_bytes() == content
    if not unchanged:
        output.write_bytes(content)
    print(f"{output.name}{' (unchanged)' if unchanged else ''}: {json.dumps(checks, sort_keys=True)}")


def read_vector(case):
    path = VECTOR_DIR / f"{basename(case)}.csv"
    with path.open(encoding="utf-8", newline="") as stream:
        comment = stream.readline()
        if not comment.startswith("# "):
            raise ValueError(f"{path.name}: missing provenance header")
        meta = json.loads(comment[2:])
        reader = csv.reader(stream)
        if next(reader) != columns(case):
            raise ValueError(f"{path.name}: incorrect SI column header")
        rows = [[float(value) for value in fields] for fields in reader]
    return path, meta, rows


def verify(case):
    path, meta, rows = read_vector(case)
    if (meta["case"] != case or meta["mu_m3_s2"] != MU
            or meta["frame"] != "EarthMJ2000Eq" or not meta["gmat_version"]):
        raise ValueError(f"{path.name}: incorrect metadata")
    if meta["script_sha256"] != sha256(HERE / f"{basename(case)}.script"):
        raise ValueError(f"{path.name}: script changed since conversion")
    print(f"{path.name}: {json.dumps(validate_rows(case, rows), sort_keys=True)}")


def feasibility(case, step):
    """Measure a plain fixed-step RK4 (not the game) against the committed GMAT vector."""
    _, _, rows = read_vector(case)
    result = worst_differences(rows, rk4_samples(case, step))
    print(f"{case} RK4 step {step:g} s vs GMAT vector: {json.dumps(result, sort_keys=True)}")
    return result


LOG_PROBLEM = re.compile(r"(?i)error|warning|exception|fail|abort|violat")


def log_problems(text):
    """Lines in a GMAT log that block acceptance, plus missing success markers."""
    problems = [line.strip() for line in text.splitlines() if LOG_PROBLEM.search(line)]
    for marker in ("Successfully interpreted the script", "Mission run completed."):
        if marker not in text:
            problems.append(f"missing '{marker}'")
    return problems


def startup_text(template, out_dir):
    text, count = re.subn(r"(?m)^OUTPUT_PATH\s*=.*$",
                          lambda _: f"OUTPUT_PATH            = {out_dir.as_posix()}/", template)
    if count != 1:
        raise ValueError("GMAT startup file has no single OUTPUT_PATH line")
    return text


def run_gmat(gmat_bin, out_dir, variant, cases):
    """Run GmatConsole on each case into a new directory; record hashes in manifest.json."""
    gmat_bin = gmat_bin.resolve()
    exe = next((gmat_bin / name for name in ("GmatConsole.exe", "GmatConsole")
                if (gmat_bin / name).is_file()), None)
    if exe is None:
        raise ValueError(f"{gmat_bin}: no GmatConsole executable")
    out_dir = out_dir.resolve()
    if out_dir.exists() and any(out_dir.iterdir()):
        raise ValueError(f"{out_dir}: use a new, empty output directory")
    out_dir.mkdir(parents=True, exist_ok=True)
    startup = out_dir / "gmat_startup_file.txt"
    startup.write_text(startup_text((gmat_bin / "gmat_startup_file.txt").read_text(encoding="utf-8"),
                                    out_dir), encoding="utf-8")
    readme = gmat_bin.parent / "README.txt"
    release = re.search(r"Version (R\d{4}[a-z])", readme.read_text(encoding="utf-8", errors="replace")) \
        if readme.is_file() else None
    manifest = {"variant": variant, "gmat_release_from_readme": release and release.group(1),
                "gmat_console": str(exe), "gmat_console_sha256": sha256(exe),
                "gmat_build_date": None, "runs": {}}
    for case in cases:
        name = basename(case) + VARIANTS[variant]["suffix"]
        if variant == "baseline":
            script = HERE / f"{basename(case)}.script"
            if script.read_text(encoding="utf-8") != script_text(case):
                raise ValueError(f"{script.name}: differs from generator; run `scripts` first")
        else:
            script = out_dir / f"{name}.script"
            script.write_text(script_text(case, variant), encoding="utf-8", newline="\n")
        log = out_dir / f"{name}.gmat.log"
        result = subprocess.run([str(exe), "--startup_file", str(startup), "--logfile", str(log),
                                 "--run", str(script)], cwd=gmat_bin, stdin=subprocess.DEVNULL,
                                capture_output=True, text=True, timeout=1200)
        (out_dir / f"{name}.stdout.txt").write_text(result.stdout + result.stderr, encoding="utf-8")
        log_text = log.read_text(encoding="utf-8", errors="replace") if log.is_file() else ""
        problems = log_problems(log_text)
        if result.returncode != 0 or problems:
            raise ValueError(f"{case}: GMAT exit {result.returncode}; see {log}: {problems[:5]}")
        raw = out_dir / f"{name}.raw.csv"
        if not raw.is_file():
            raise ValueError(f"{case}: GMAT finished but wrote no {raw.name}")
        build = re.search(r"GMAT Build Date: (.+)", log_text)
        manifest["gmat_build_date"] = build and build.group(1).strip()
        run_time = re.search(r"Total Run Time: (.+)", log_text)
        manifest["runs"][case] = {"script": str(script), "script_sha256": sha256(script),
                                  "raw_sha256": sha256(raw),
                                  "run_time": run_time and run_time.group(1).strip()}
        print(f"{raw.name}: GMAT run clean ({manifest['runs'][case]['run_time']})")
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def compare(baseline_dir, tight_dir, case):
    """Maximum same-sample differences between a baseline run and a tighter audit run."""
    runs = []
    for directory, suffix in ((baseline_dir, ""), (tight_dir, VARIANTS["tight"]["suffix"])):
        text = (directory / f"{basename(case)}{suffix}.raw.csv").read_text(encoding="utf-8-sig")
        runs.append(parse_raw(case, text)[0])
    differences = {**worst_differences(*runs),
                   "reported_time_s": max(abs(a[0] - b[0]) for a, b in zip(*runs))}
    print(f"{case} baseline vs tight: {json.dumps(differences, sort_keys=True)}")
    exceeded = [key for key, limit in COMPARE_TOL.items() if differences[key] > limit]
    if exceeded:
        raise ValueError(f"{case}: tighter propagation differs beyond {exceeded}")
    return differences


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    scripts = commands.add_parser("scripts", help="generate/check the GMAT scripts")
    scripts.add_argument("--check", action="store_true")
    running = commands.add_parser("run", help="run GmatConsole on each case into a new directory")
    running.add_argument("--gmat-bin", type=Path, required=True, help="GMAT bin directory")
    running.add_argument("--out-dir", type=Path, required=True, help="new or empty directory")
    running.add_argument("--variant", choices=VARIANTS, default="baseline")
    conversion = commands.add_parser("convert", help="validate real GMAT reports and emit SI CSVs")
    conversion.add_argument("--raw-dir", type=Path, required=True)
    conversion.add_argument("--gmat-version", required=True, help="actual installed release/build from About/log")
    verification = commands.add_parser("verify", help="validate already converted vectors; missing files fail")
    comparison = commands.add_parser("compare", help="compare baseline and tight raw runs")
    comparison.add_argument("--baseline-dir", type=Path, required=True)
    comparison.add_argument("--tight-dir", type=Path, required=True)
    rk4 = commands.add_parser("feasibility", help="measure a fixed-step RK4 against the vectors")
    rk4.add_argument("--step", type=float, default=1.0, help="seconds; must divide 10")
    groups = {"all": list(CASES), "planar": PLANAR, "inclined": INCLINED}
    for command in (running, conversion, verification, comparison, rk4):
        command.add_argument("--case", choices=[*CASES, *groups], default="all",
                             help="one case, or planar (C1-C4), inclined (C5-C7) or all")
    args = parser.parse_args()
    try:
        if args.command == "scripts":
            for case in CASES:
                path = HERE / f"{basename(case)}.script"
                current = path.read_text(encoding="utf-8") if path.is_file() else None
                if current == script_text(case):
                    print(f"{path.name}: matches")
                elif args.check:
                    raise ValueError(f"{path.name}: differs from generator")
                else:
                    path.write_text(script_text(case), encoding="utf-8", newline="\n")
                    print(f"{path.name}: written")
            return
        cases = groups.get(args.case, [args.case])
        if args.command == "run":
            run_gmat(args.gmat_bin, args.out_dir, args.variant, cases)
        for case in cases:
            if args.command == "convert":
                if not args.gmat_version.strip() or "\n" in args.gmat_version:
                    raise ValueError("supply the installed GMAT release/build")
                convert(case, args.raw_dir, args.gmat_version.strip())
            elif args.command == "verify":
                verify(case)
            elif args.command == "compare":
                compare(args.baseline_dir, args.tight_dir, case)
            elif args.command == "feasibility":
                feasibility(case, args.step)
    except (OSError, ValueError, KeyError, StopIteration, subprocess.SubprocessError) as error:
        parser.exit(1, f"ERROR: {error}\n")


if __name__ == "__main__":
    main()
