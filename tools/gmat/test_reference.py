"""Integrity tests with synthetic in-memory data, NOT GMAT trajectory validation or GMAT execution."""

import copy
import csv
import hashlib
import io
import json
import math
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import reference as ref


def synthetic_raw(case):
    stream = io.StringIO()
    writer = csv.writer(stream)
    for time in range(0, ref.CASES[case]["duration_s"] + 1, ref.DT):
        x, y, vx, vy = ref.analytic_state(case, time)
        writer.writerow([time, x / 1000, y / 1000, 0, vx / 1000, vy / 1000,
                         0, 1000, ref.MU / 1e9])
    return stream.getvalue()


def synthetic_burn_rows(thrust_n=1000, fixed_direction=None):
    """Independent RK4 fixture, never saved or represented as a GMAT result.

    fixed_direction=(ux, uy) deliberately models the wrong (inertially fixed) thrust axis.
    """
    state = [ref.R0, 0.0, 0.0, ref.V0, 1000.0]
    rows = [[0, *state]]
    for time in range(6120):
        active = time < 120

        def rhs(values):
            x, y, vx, vy, mass = values
            gravity = ref.MU / math.hypot(x, y) ** 3
            ux, uy = fixed_direction or (vx / math.hypot(vx, vy), vy / math.hypot(vx, vy))
            accel = thrust_n / mass if active else 0
            return [vx, vy, -gravity * x + accel * ux,
                    -gravity * y + accel * uy, -1000 / (320 * ref.G0) if active else 0]

        k1 = rhs(state)
        k2 = rhs([y + k / 2 for y, k in zip(state, k1)])
        k3 = rhs([y + k / 2 for y, k in zip(state, k2)])
        k4 = rhs([y + k for y, k in zip(state, k3)])
        state = [y + (a + 2 * b + 2 * c + d) / 6
                 for y, a, b, c, d in zip(state, k1, k2, k3, k4)]
        if (time + 1) % 10 == 0:
            rows.append([time + 1, *state])
    return rows


class ReferenceIntegrityTests(unittest.TestCase):
    def test_kepler_cases_and_units(self):
        for case in ("C1", "C2", "C3"):
            with self.subTest(case=case):
                rows, checks = ref.parse_raw(case, synthetic_raw(case))
                self.assertEqual(checks["rows"], ref.CASES[case]["duration_s"] // 10 + 1)
                for actual, expected in zip(rows[0][1:5], ref.CASES[case]["initial"]):
                    self.assertAlmostEqual(actual, expected, places=6)

    def test_rejects_truncated_or_nonuniform_times(self):
        rows, _ = ref.parse_raw("C1", synthetic_raw("C1"))
        with self.assertRaisesRegex(ValueError, "expected 1801 rows"):
            ref.validate_rows("C1", rows[:-1])
        rows[2][0] = 30  # catches cumulative duration used as a stop argument
        with self.assertRaisesRegex(ValueError, "off the 10 s grid"):
            ref.validate_rows("C1", rows)

    def test_rejects_wrong_mu_out_of_plane_and_nonfinite(self):
        raw = list(csv.reader(io.StringIO(synthetic_raw("C1"))))
        for column, replacement, message in [(8, "398600", "wrong Earth GM"),
                                              (3, "0.1", "equatorial plane"),
                                              (6, "0.1", "equatorial plane"),
                                              (1, "nan", "nonfinite")]:
            with self.subTest(column=column):
                changed = copy.deepcopy(raw)
                changed[1][column] = replacement
                stream = io.StringIO()
                csv.writer(stream).writerows(changed)
                with self.assertRaisesRegex(ValueError, message):
                    ref.parse_raw("C1", stream.getvalue())

    def test_rejects_wrong_state_units_and_mass(self):
        rows, _ = ref.parse_raw("C1", synthetic_raw("C1"))
        changed = copy.deepcopy(rows)
        changed[0][1] /= 1000
        with self.assertRaisesRegex(ValueError, "state disagrees"):
            ref.validate_rows("C1", changed)
        rows[3][5] = 999
        with self.assertRaisesRegex(ValueError, "incorrect mass"):
            ref.validate_rows("C1", rows)

    def test_finite_burn_mass_and_cutoff(self):
        self.assertEqual(ref.expected_mass("C4", 0), 1000)
        self.assertAlmostEqual(ref.expected_mass("C4", 120), 961.7606420133277)
        self.assertEqual(ref.expected_mass("C4", 120), ref.expected_mass("C4", 6120))
        script = ref.script_text("C4")
        self.assertIn("GMAT Engine.DecrementMass = true;", script)
        self.assertLess(script.index("While sample < 12\n"), script.index("EndFiniteBurn"))
        self.assertLess(script.index("EndFiniteBurn"), script.index("While sample < 612\n"))

    def test_finite_burn_rejects_coasting_with_mass_loss(self):
        rows = []
        for time in range(0, 6121, 10):
            rows.append([time, *ref.analytic_state("C1", time), ref.expected_mass("C4", time)])
        with self.assertRaisesRegex(ValueError, "did not increase orbital energy"):
            ref.validate_rows("C4", rows)

    def test_finite_burn_accepts_bounded_cutoff_time_roundoff(self):
        rows = synthetic_burn_rows()
        ref.validate_rows("C4", rows)
        rows[12][0] -= 0.9 * ref.TIME_TOL
        ref.validate_rows("C4", rows)
        rows[12][5] -= 1e-4
        with self.assertRaisesRegex(ValueError, "incorrect mass"):
            ref.validate_rows("C4", rows)

    def test_conversion_roundtrip_and_provenance(self):
        # Synthetic artifacts exist only in an automatically removed temp directory.
        with tempfile.TemporaryDirectory() as directory:
            temp = Path(directory)
            (temp / "c1-circular.raw.csv").write_text(synthetic_raw("C1"), encoding="utf-8")
            with patch.object(ref, "VECTOR_DIR", temp), patch("sys.stdout", new_callable=io.StringIO):
                ref.convert("C1", temp, "SYNTHETIC-TEST-ONLY")
                ref.verify("C1")
            lines = (temp / "c1-circular.csv").read_text(encoding="utf-8").splitlines()
            meta = json.loads(lines[0][2:])
            self.assertEqual(meta["gmat_version"], "SYNTHETIC-TEST-ONLY")
            self.assertEqual(meta["mu_m3_s2"], ref.MU)
            self.assertEqual(meta["initial_state_columns"], ["x_m", "y_m", "vx_mps", "vy_mps", "mass_kg"])
            self.assertEqual(len(meta["raw_sha256"]), 64)
            self.assertEqual(lines[1], ",".join(ref.COLUMNS))
            self.assertEqual(len(lines), 1803)
            meta["script_sha256"] = "0" * 64
            lines[0] = "# " + json.dumps(meta)
            (temp / "c1-circular.csv").write_text("\n".join(lines), encoding="utf-8")
            with patch.object(ref, "VECTOR_DIR", temp):
                with self.assertRaisesRegex(ValueError, "script changed"):
                    ref.verify("C1")

    def test_invalid_report_does_not_create_vector(self):
        with tempfile.TemporaryDirectory() as directory:
            temp = Path(directory)
            (temp / "c1-circular.raw.csv").write_text("0,1,2\n", encoding="utf-8")
            with patch.object(ref, "VECTOR_DIR", temp):
                with self.assertRaisesRegex(ValueError, "expected 9 columns"):
                    ref.convert("C1", temp, "SYNTHETIC-TEST-ONLY")
            self.assertFalse((temp / "c1-circular.csv").exists())

    def test_missing_gmat_vectors_fail_verification(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(ref, "VECTOR_DIR", Path(directory)):
                with self.assertRaises(FileNotFoundError):
                    ref.verify("C1")

    def test_epoch_roundoff_drift_is_bounded_and_physics_uses_grid_time(self):
        # Pattern measured on GMAT R2026a: +1.437 ulp on the first two stops, then +0.437.
        rows, _ = ref.parse_raw("C2", synthetic_raw("C2"))
        drift = 0.0
        for index, row in enumerate(rows[1:], 1):
            drift += (1.437 if index <= 2 else 0.437) * ref.EPOCH_ULP_S
            row[0] += drift
        checks = ref.validate_rows("C2", rows)  # Kepler at reported time would miss by meters
        self.assertAlmostEqual(checks["max_reported_time_drift_s"], drift)
        self.assertGreater(drift, 9e-4)
        rows[-1][0] += 7200 * ref.EPOCH_ULP_S
        with self.assertRaisesRegex(ValueError, "off the 10 s grid"):
            ref.validate_rows("C2", rows)

    def test_kepler_from_state_matches_closed_form(self):
        for case in ("C1", "C2"):
            for time in (10, 1234, 6000, 17990):
                with self.subTest(case=case, time=time):
                    actual = ref.kepler_from_state(ref.CASES[case]["initial"], time)
                    expected = ref.analytic_state(case, time)
                    self.assertLess(math.hypot(actual[0] - expected[0], actual[1] - expected[1]), 1e-5)
                    self.assertLess(math.hypot(actual[2] - expected[2], actual[3] - expected[3]), 1e-8)

    def test_burn_audit_integrator_is_converged(self):
        coarse, fine = ref.burn_arc(100)[-1], ref.burn_arc(400)[-1]
        self.assertEqual(coarse[0], 120)
        self.assertLess(math.hypot(coarse[1] - fine[1], coarse[2] - fine[2]), 1e-6)
        self.assertAlmostEqual(fine[5], ref.expected_mass("C4", 120), places=9)

    def test_finite_burn_rejects_wrong_thrust_model(self):
        for label, rows in [("fixed axis", synthetic_burn_rows(fixed_direction=(0.0, 1.0))),
                            ("thrust", synthetic_burn_rows(thrust_n=1010))]:
            with self.subTest(label=label):
                with self.assertRaisesRegex(ValueError, "independent burn_rk4"):
                    ref.validate_rows("C4", rows)

    def test_finite_burn_rejects_mistimed_coast(self):
        rows = synthetic_burn_rows()
        cutoff = rows[12][1:5]
        for index in range(13, len(rows)):  # energy and momentum stay exact; phase is late
            rows[index][1:5] = ref.kepler_from_state(cutoff, (index - 12) * 10 + 0.01)
        with self.assertRaisesRegex(ValueError, "independent coast_kepler"):
            ref.validate_rows("C4", rows)

    def test_tight_variant_changes_only_audit_settings(self):
        for case in ref.CASES:
            base = ref.script_text(case).splitlines()
            tight = ref.script_text(case, "tight").splitlines()
            changed = sorted(set(tight) - set(base))
            self.assertEqual(len(base) + 1, len(tight))
            self.assertEqual(changed, sorted([
                "% AUDIT VARIANT 'tight': never convert into committed vectors.",
                f"GMAT Raw.Filename = '{ref.basename(case)}.tight.raw.csv';",
                "GMAT Reference.Accuracy = 1e-13;",
                "GMAT Reference.MaxStep = 5;"]))

    def test_log_scan_and_startup_rewrite(self):
        clean = ('*** Library "..\\plugins\\libMatlabInterface" did not open.\n'
                 "Successfully interpreted the script\nMission run completed.\n")
        self.assertEqual(ref.log_problems(clean), [])
        warning = clean + "**** WARNING **** the achieved stop is outside of the stopping tolerance\n"
        self.assertEqual(len(ref.log_problems(warning)), 1)
        self.assertEqual(ref.log_problems("Successfully interpreted the script\n"),
                         ["missing 'Mission run completed.'"])
        template = "ROOT_PATH = ../\nOUTPUT_PATH            = ../output/\nLOG_FILE = OUTPUT_PATH/GmatLog.txt\n"
        text = ref.startup_text(template, Path("C:/runs/with space"))
        self.assertIn("OUTPUT_PATH            = C:/runs/with space/\n", text)
        self.assertIn("ROOT_PATH = ../\n", text)
        with self.assertRaisesRegex(ValueError, "OUTPUT_PATH"):
            ref.startup_text("ROOT_PATH = ../\n", Path("C:/runs"))

    def test_compare_flags_tight_run_differences(self):
        with tempfile.TemporaryDirectory() as base, tempfile.TemporaryDirectory() as tight:
            raw = synthetic_raw("C1")
            (Path(base) / "c1-circular.raw.csv").write_text(raw, encoding="utf-8")
            (Path(tight) / "c1-circular.tight.raw.csv").write_text(raw, encoding="utf-8")
            # Relax the converter's own 0.05 m Kepler limit so only compare can object.
            with patch("sys.stdout", new_callable=io.StringIO), patch.object(ref, "STATE_TOL_M", 1.0):
                self.assertEqual(ref.compare(Path(base), Path(tight), "C1")["position_m"], 0)
                lines = raw.splitlines()
                fields = lines[100].split(",")
                fields[1] = repr(float(fields[1]) + 0.0002)  # +0.2 m in x (raw is km)
                lines[100] = ",".join(fields)
                (Path(tight) / "c1-circular.tight.raw.csv").write_text("\n".join(lines), encoding="utf-8")
                with self.assertRaisesRegex(ValueError, "position_m"):
                    ref.compare(Path(base), Path(tight), "C1")

    def test_convert_rejects_raw_changed_after_recorded_run(self):
        with tempfile.TemporaryDirectory() as directory:
            temp = Path(directory)
            (temp / "c1-circular.raw.csv").write_text(synthetic_raw("C1"), encoding="utf-8")
            manifest = {"variant": "baseline", "gmat_build_date": "test", "gmat_console_sha256": "0",
                        "runs": {"C1": {"raw_sha256": "0" * 64}}}
            (temp / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
            with patch.object(ref, "VECTOR_DIR", temp):
                with self.assertRaisesRegex(ValueError, "changed since the recorded GMAT run"):
                    ref.convert("C1", temp, "SYNTHETIC-TEST-ONLY")
            self.assertFalse((temp / "c1-circular.csv").exists())


# ---- Inclined cases C5-C7 (thread 2G): the same integrity checks in three dimensions ----

SCRIPT_SHA256_1D = {  # the scripts 1D ran, recorded in the committed C1-C4 vector headers
    "C1": "13956d781bb0b59001ab52349143cf96c87111ccd784515ea4d2ed2641d4afb9",
    "C2": "ce48edf9d0281ee007957763d7119770b336999df065bb4e09a118f17a750300",
    "C3": "5b99084cda6289f2cb4792586298118ebdc5525a3737fffb187b81c5fab59865",
    "C4": "4ff68e051e387d0b0ccbdec3f11d4ef1e7f3bc6665ebddd602a47bb8b00d2dc6",
}
C6_DIRECTION = (3 / 7, -2 / 7, 6 / 7)  # stated here on purpose, not read from reference.py


def rows_to_raw(rows):
    """SI rows [t, x, y, z, vx, vy, vz, mass] as a GMAT-style raw report (km, km/s)."""
    stream = io.StringIO()
    writer = csv.writer(stream)
    for row in rows:
        writer.writerow([repr(float(row[0])), *(repr(value / 1000) for value in row[1:7]),
                         repr(float(row[7])), ref.MU / 1e9])
    return stream.getvalue()


def synthetic_rows_3d(case, time_offset=0.0):
    """Closed-form rows for C5 or C7; time_offset shifts every sample after the first."""
    rows = []
    for time in range(0, ref.CASES[case]["duration_s"] + 1, ref.DT):
        rows.append([time, *ref.analytic_state(case, time + (time_offset if time else 0)), 1000.0])
    return rows


def vnb_axes(position, velocity):
    """GMAT's VNB: V along velocity, N along r x v, B = V x N."""
    v_hat = [c / math.hypot(*velocity) for c in velocity]
    h = ref.cross(position, velocity)
    n_hat = [c / math.hypot(*h) for c in h]
    return v_hat, n_hat, ref.cross(v_hat, n_hat)


def synthetic_burn_rows_3d(thrust_n=2000, direction=C6_DIRECTION, vnb=None):
    """Independent 1 s RK4 fixture for C6, never saved or represented as a GMAT result.

    direction: the inertially fixed thrust unit vector (the stated law by default).
    vnb=(v, n, b): deliberately the wrong law, those components of a frame that follows the
    velocity, as C4's thruster does.
    """
    state = [*ref.CASES["C6"]["initial"], 1000.0]
    rows = [[0, *state]]
    for time in range(7200):
        active = time < 200

        def rhs(values):
            x, y, z, vx, vy, vz, mass = values
            gravity = ref.MU / math.hypot(x, y, z) ** 3
            unit = direction
            if vnb:
                axes = vnb_axes((x, y, z), (vx, vy, vz))
                unit = [sum(c * axis[i] for c, axis in zip(vnb, axes)) for i in range(3)]
            accel = thrust_n / mass if active else 0
            return [vx, vy, vz, -gravity * x + accel * unit[0], -gravity * y + accel * unit[1],
                    -gravity * z + accel * unit[2], -2000 / (300 * ref.G0) if active else 0]

        k1 = rhs(state)
        k2 = rhs([y + k / 2 for y, k in zip(state, k1)])
        k3 = rhs([y + k / 2 for y, k in zip(state, k2)])
        k4 = rhs([y + k for y, k in zip(state, k3)])
        state = [y + (a + 2 * b + 2 * c + d) / 6
                 for y, a, b, c, d in zip(state, k1, k2, k3, k4)]
        if (time + 1) % 10 == 0:
            rows.append([time + 1, *state])
    return rows


class InclinedCaseTests(unittest.TestCase):
    def test_planar_cases_are_untouched(self):
        self.assertEqual(ref.PLANAR, ["C1", "C2", "C3", "C4"])
        self.assertEqual(ref.INCLINED, ["C5", "C6", "C7"])
        self.assertEqual(ref.COLUMNS, "t_s,x_m,y_m,vx_mps,vy_mps,mass_kg".split(","))
        self.assertEqual(ref.mass_flow("C4"), ref.MASS_FLOW)
        for case, digest in SCRIPT_SHA256_1D.items():
            with self.subTest(case=case):
                generated = ref.script_text(case).encode("utf-8")
                self.assertEqual(hashlib.sha256(generated).hexdigest(), digest)

    def test_orbit_axes_are_orthonormal_and_reduce_to_the_plane(self):
        self.assertEqual(ref.lift((1.0, 2.0, 3.0, 4.0), ref.orbit_axes(0, 0, 0)),
                         (1.0, 2.0, 0.0, 3.0, 4.0, 0.0))
        for inc, raan, aop in ref.ORIENTATION.values():
            p, q, w = ref.orbit_axes(inc, raan, aop)
            for a, b, expected in [(p, p, 1), (q, q, 1), (w, w, 1), (p, q, 0), (p, w, 0), (q, w, 0)]:
                self.assertAlmostEqual(ref.dot(a, b), expected, places=15)
            for actual, expected in zip(ref.cross(p, q), w):  # right-handed: W = P x Q
                self.assertAlmostEqual(actual, expected, places=15)
            self.assertAlmostEqual(w[2], math.cos(math.radians(inc)), places=15)

    def test_initial_states_have_the_stated_elements(self):
        # elements_from_state works from the h, node and eccentricity vectors, not from lift().
        c5 = ref.elements_from_state(ref.CASES["C5"]["initial"])
        for key, expected in [("sma_m", ref.A5), ("ecc", 0.35), ("inc_deg", 55),
                              ("raan_deg", 40), ("aop_deg", 30)]:
            self.assertAlmostEqual(c5[key] / expected, 1, places=12, msg=key)
        self.assertAlmostEqual(math.tau * math.sqrt(ref.A5**3 / ref.MU), 12000, places=9)
        eccentric = 2 * math.atan(math.sqrt(0.65 / 1.35) * math.tan(math.radians(c5["true_anomaly_deg"]) / 2))
        self.assertAlmostEqual(math.degrees(eccentric - 0.35 * math.sin(eccentric)), 45, places=10)
        c6 = ref.elements_from_state(ref.CASES["C6"]["initial"])
        for key, expected in [("sma_m", ref.R0), ("inc_deg", 45), ("raan_deg", 100),
                              ("arg_latitude_deg", 40)]:
            self.assertAlmostEqual(c6[key] / expected, 1, places=12, msg=key)
        self.assertLess(c6["ecc"], 1e-14)
        c7 = ref.elements_from_state(ref.CASES["C7"]["initial"])
        for key, expected in [("sma_m", -2 * ref.R0), ("ecc", 1.5), ("inc_deg", 120),
                              ("raan_deg", 250), ("aop_deg", 70)]:
            self.assertAlmostEqual(c7[key] / expected, 1, places=12, msg=key)
        periapsis = ref.analytic_state("C7", 20000)
        self.assertAlmostEqual(math.hypot(*periapsis[:3]) / ref.R0, 1, places=14)
        self.assertLess(ref.cross(periapsis[:3], periapsis[3:])[2], 0)  # retrograde
        for case in ref.INCLINED:  # every Cartesian component carries part of the state
            state = ref.CASES[case]["initial"]
            for half in (state[:3], state[3:]):
                self.assertGreater(min(abs(c) for c in half), 0.05 * math.hypot(*half), case)

    def test_inclined_kepler_cases_and_units(self):
        for case in ("C5", "C7"):
            with self.subTest(case=case):
                rows, checks = ref.parse_raw(case, rows_to_raw(synthetic_rows_3d(case)))
                self.assertEqual(checks["rows"], ref.CASES[case]["duration_s"] // 10 + 1)
                self.assertEqual(len(rows[0]), 8)
                for actual, expected in zip(rows[0][1:7], ref.CASES[case]["initial"]):
                    self.assertAlmostEqual(actual, expected, places=6)
                self.assertLess(checks["independent_max_errors"]["kepler"]["position_m"], 1e-6)
                self.assertLess(checks["coast_conservation_max"]["orbit_normal_rad"], 1e-12)
                self.assertGreater(max(abs(row[3]) for row in rows), 5e6)  # z is really used

    def test_kepler_from_state_3d_matches_closed_form_and_the_planar_routine(self):
        for time in (10, 1234, 12000, 35990):
            with self.subTest(time=time):
                actual = ref.kepler_from_state_3d(ref.CASES["C5"]["initial"], time)
                expected = ref.analytic_state("C5", time)
                self.assertLess(math.dist(actual[:3], expected[:3]), 1e-5)
                self.assertLess(math.dist(actual[3:], expected[3:]), 1e-8)
        flat = ref.CASES["C2"]["initial"]
        lifted = ref.kepler_from_state_3d(ref.lift(flat, ref.orbit_axes(0, 0, 0)), 4321)
        planar = ref.kepler_from_state(flat, 4321)
        self.assertLess(math.dist(lifted[:2], planar[:2]), 1e-7)
        self.assertLess(math.dist(lifted[3:5], planar[2:]), 1e-10)
        self.assertEqual((lifted[2], lifted[5]), (0.0, 0.0))

    def test_inclined_rejects_truncated_planar_layout_and_wrong_mass(self):
        rows = synthetic_rows_3d("C5")
        with self.assertRaisesRegex(ValueError, "expected 3601 rows"):
            ref.validate_rows("C5", rows[:-1])
        planar_layout = [[row[0], row[1], row[2], row[4], row[5], row[7]] for row in rows]
        with self.assertRaisesRegex(ValueError, "wrong column count"):
            ref.validate_rows("C5", planar_layout)
        changed = copy.deepcopy(rows)
        changed[0][3] *= -1  # mirrored through the equator
        with self.assertRaisesRegex(ValueError, "state disagrees with the initial state"):
            ref.validate_rows("C5", changed)
        rows[3][7] = 999
        with self.assertRaisesRegex(ValueError, "incorrect mass"):
            ref.validate_rows("C5", rows)

    def test_inclined_rejects_a_turning_orbit_plane(self):
        # What oblateness left switched on would do: the node drifts while the orbit keeps
        # its shape. 1e-9 rad per sample about +Z is 3.6e-6 rad by the end.
        rows = synthetic_rows_3d("C5")
        for index, row in enumerate(rows):
            c, s = math.cos(index * 1e-9), math.sin(index * 1e-9)
            row[1], row[2] = c * row[1] - s * row[2], s * row[1] + c * row[2]
            row[4], row[5] = c * row[4] - s * row[5], s * row[4] + c * row[5]
        with self.assertRaisesRegex(ValueError, "orbit plane drift"):
            ref.validate_rows("C5", rows)

    def test_inclined_rejects_flattened_and_mistimed_orbits(self):
        flattened = synthetic_rows_3d("C7")
        for row in flattened[1:]:  # the planar part of the right answer, z dropped
            row[3] = row[6] = 0.0
        with self.assertRaisesRegex(ValueError, "orbit plane drift"):
            ref.validate_rows("C7", flattened)
        for case in ("C5", "C7"):  # right orbit, right plane, 0.01 s late
            with self.subTest(case=case):
                with self.assertRaisesRegex(ValueError, "independent kepler"):
                    ref.validate_rows(case, synthetic_rows_3d(case, time_offset=0.01))

    def test_inclined_burn_mass_cutoff_and_script(self):
        self.assertEqual(ref.expected_mass("C6", 0), 1000)
        self.assertAlmostEqual(ref.expected_mass("C6", 200), 1000 - 200 * 2000 / (300 * 9.80665))
        self.assertAlmostEqual(ref.expected_mass("C6", 200), 864.0378382696, places=9)
        self.assertEqual(ref.expected_mass("C6", 200), ref.expected_mass("C6", 7200))
        self.assertEqual(ref.BURNS["C6"]["direction"], C6_DIRECTION)
        self.assertAlmostEqual(math.hypot(*C6_DIRECTION), 1, places=15)
        script = ref.script_text("C6")
        for line in ["GMAT Engine.CoordinateSystem = EarthMJ2000Eq;",
                     "GMAT Engine.ThrustDirection1 = 0.42857142857142855;",
                     "GMAT Engine.ThrustDirection2 = -0.2857142857142857;",
                     "GMAT Engine.ThrustDirection3 = 0.8571428571428571;",
                     "GMAT Engine.DecrementMass = true;", "GMAT Engine.C1 = 2000;",
                     "GMAT Engine.K1 = 300;", "GMAT Sat.DryMass = 800;", "GMAT Fuel.FuelMass = 200;"]:
            self.assertIn(line + "\n", script)
        self.assertNotIn("VNB;", script)  # only the header note may mention VNB
        self.assertNotIn("Engine.Axes", script)
        self.assertLess(script.index("BeginFiniteBurn PlaneChange(Sat);"), script.index("While sample < 20\n"))
        self.assertLess(script.index("While sample < 20\n"), script.index("EndFiniteBurn"))
        self.assertLess(script.index("EndFiniteBurn"), script.index("While sample < 720\n"))
        for case in ("C5", "C7"):
            self.assertNotIn("Thruster", ref.script_text(case))
            self.assertIn("GMAT Sat.DryMass = 1000;", ref.script_text(case))

    def test_inclined_burn_fixture_passes_with_rocket_equation_and_plane_change(self):
        rows = synthetic_burn_rows_3d()
        checks = ref.validate_rows("C6", rows)
        burn = checks["burn"]
        ideal = 300 * 9.80665 * math.log(1000 / 864.0378382696096)
        self.assertAlmostEqual(burn["rocket_equation_delta_v_mps"], ideal, places=9)
        self.assertAlmostEqual(burn["thrust_delta_v_mps"], ideal, places=6)
        self.assertLess(burn["thrust_delta_v_vector_error_mps"], 1e-7)
        self.assertAlmostEqual(math.degrees(burn["plane_change_rad"]), 2.78, places=2)
        self.assertLess(checks["independent_max_errors"]["burn_rk4"]["position_m"], 1e-4)
        self.assertLess(checks["independent_max_errors"]["coast_kepler"]["position_m"], 1e-3)
        rows[20][0] -= 0.9 * ref.TIME_TOL
        ref.validate_rows("C6", rows)
        rows[20][7] -= 1e-4
        with self.assertRaisesRegex(ValueError, "incorrect mass"):
            ref.validate_rows("C6", rows)

    def test_inclined_burn_audit_integrator_is_converged(self):
        coarse, fine = ref.burn_arc_3d("C6", 100)[-1], ref.burn_arc_3d("C6", 400)[-1]
        self.assertEqual(coarse[0], 200)
        self.assertLess(math.dist(coarse[1:4], fine[1:4]), 1e-6)
        self.assertAlmostEqual(fine[7], ref.expected_mass("C6", 200), places=9)

    def test_inclined_burn_rejects_wrong_thrust_model(self):
        start = ref.CASES["C6"]["initial"]
        frozen = [ref.dot(C6_DIRECTION, axis) for axis in vnb_axes(start[:3], start[3:])]
        self.assertGreater(frozen[1], 0.85)  # the stated direction is mostly out of plane
        wrong = {"velocity-following frame": synthetic_burn_rows_3d(vnb=frozen),
                 "mirrored direction": synthetic_burn_rows_3d(direction=(3 / 7, 2 / 7, 6 / 7)),
                 "thrust": synthetic_burn_rows_3d(thrust_n=2020)}
        ideal = 300 * 9.80665 * math.log(1000 / ref.expected_mass("C6", 200))
        for label, rows in wrong.items():
            with self.subTest(label=label):
                with self.assertRaisesRegex(ValueError, "rocket equation"):
                    ref.validate_rows("C6", rows)
                # With that guard held open, the independent integration still objects.
                with patch.object(ref, "thrust_delta_v", lambda *_: [ideal * u for u in C6_DIRECTION]):
                    with self.assertRaisesRegex(ValueError, "independent burn_rk4"):
                        ref.validate_rows("C6", rows)
        with self.assertRaisesRegex(ValueError, "did not turn the orbit plane"):
            ref.validate_rows("C6", synthetic_burn_rows_3d(vnb=(1, 0, 0)))  # C4's prograde law

    def test_inclined_burn_rejects_mistimed_coast(self):
        rows = synthetic_burn_rows_3d()
        cutoff = rows[20][1:7]
        for index in range(21, len(rows)):  # energy and momentum stay exact; phase is late
            rows[index][1:7] = ref.kepler_from_state_3d(cutoff, (index - 20) * 10 + 0.01)
        with self.assertRaisesRegex(ValueError, "independent coast_kepler"):
            ref.validate_rows("C6", rows)

    def test_inclined_conversion_roundtrip_and_provenance(self):
        # Synthetic artifacts exist only in an automatically removed temp directory.
        with tempfile.TemporaryDirectory() as directory:
            temp = Path(directory)
            (temp / "c5-inclined_eccentric.raw.csv").write_text(
                rows_to_raw(synthetic_rows_3d("C5")), encoding="utf-8")
            (temp / "c6-inclined_burn.raw.csv").write_text(
                rows_to_raw(synthetic_burn_rows_3d()), encoding="utf-8")
            with patch.object(ref, "VECTOR_DIR", temp), patch("sys.stdout", new_callable=io.StringIO) as out:
                for case in ("C5", "C6"):
                    ref.convert(case, temp, "SYNTHETIC-TEST-ONLY")
                    ref.verify(case)
                written = (temp / "c5-inclined_eccentric.csv").read_bytes()
                self.assertNotIn("(unchanged)", out.getvalue())
                ref.convert("C5", temp, "SYNTHETIC-TEST-ONLY")  # same bytes: file left alone
                self.assertIn("c5-inclined_eccentric.csv (unchanged)", out.getvalue())
                self.assertEqual((temp / "c5-inclined_eccentric.csv").read_bytes(), written)
            self.assertNotIn(b"\r", written)
            lines = written.decode("utf-8").splitlines()
            meta = json.loads(lines[0][2:])
            self.assertEqual(lines[1], "t_s,x_m,y_m,z_m,vx_mps,vy_mps,vz_mps,mass_kg")
            self.assertEqual(len(lines), 3603)
            self.assertEqual(len(lines[2].split(",")), 8)
            self.assertEqual(meta["initial_state_columns"],
                             ["x_m", "y_m", "z_m", "vx_mps", "vy_mps", "vz_mps", "mass_kg"])
            self.assertEqual(meta["initial_state_SI"], [*ref.CASES["C5"]["initial"], 1000])
            self.assertEqual(meta["mu_m3_s2"], ref.MU)
            self.assertIsNone(meta["burn"])
            self.assertEqual((meta["orbit"]["inc_deg"], meta["orbit"]["raan_deg"],
                              meta["orbit"]["aop_deg"], meta["orbit"]["ecc"]), (55, 40, 30, 0.35))
            burn = json.loads((temp / "c6-inclined_burn.csv").read_text(encoding="utf-8").splitlines()[0][2:])["burn"]
            self.assertEqual(burn["direction_unit_EarthMJ2000Eq"], list(C6_DIRECTION))
            self.assertEqual((burn["start_s"], burn["stop_s"], burn["thrust_N"], burn["Isp_s"],
                              burn["g0_mps2"], burn["coast_duration_s"]), (0, 200, 2000, 300, 9.80665, 7000))
            self.assertIn("inertial", burn["direction"])

    def test_planar_metadata_keeps_1d_burn_description(self):
        with tempfile.TemporaryDirectory() as directory:
            temp = Path(directory)
            raw = io.StringIO()
            csv.writer(raw).writerows([[row[0], row[1] / 1000, row[2] / 1000, 0, row[3] / 1000,
                                        row[4] / 1000, 0, row[5], ref.MU / 1e9]
                                       for row in synthetic_burn_rows()])
            (temp / "c4-finite_burn.raw.csv").write_text(raw.getvalue(), encoding="utf-8")
            with patch.object(ref, "VECTOR_DIR", temp), patch("sys.stdout", new_callable=io.StringIO):
                ref.convert("C4", temp, "SYNTHETIC-TEST-ONLY")
            meta = json.loads((temp / "c4-finite_burn.csv").read_text(encoding="utf-8").splitlines()[0][2:])
            self.assertNotIn("orbit", meta)
            self.assertEqual(meta["burn"], {
                "start_s": 0, "stop_s": 120, "thrust_N": 1000, "Isp_s": 320, "g0_mps2": 9.80665,
                "dry_mass_kg": 800, "fuel_initial_kg": 200, "coast_duration_s": 6000,
                "direction": "instantaneous Earth-relative velocity (Local VNB +X)"})

    def test_comparisons_see_out_of_plane_differences(self):
        with tempfile.TemporaryDirectory() as base, tempfile.TemporaryDirectory() as tight:
            raw = rows_to_raw(synthetic_rows_3d("C7"))
            (Path(base) / "c7-inclined_hyperbolic.raw.csv").write_text(raw, encoding="utf-8")
            (Path(tight) / "c7-inclined_hyperbolic.tight.raw.csv").write_text(raw, encoding="utf-8")
            with patch("sys.stdout", new_callable=io.StringIO):
                differences = ref.compare(Path(base), Path(tight), "C7")
            self.assertEqual((differences["position_m"], differences["velocity_mps"]), (0, 0))
        rows = synthetic_rows_3d("C7")
        changed = copy.deepcopy(rows)
        changed[100][3] += 0.2  # z only
        changed[200][6] -= 3e-4  # vz only
        changed[300][7] += 1e-3
        differences = ref.worst_differences(rows, changed)
        self.assertAlmostEqual(differences["position_m"], 0.2, places=6)
        self.assertAlmostEqual(differences["velocity_mps"], 3e-4, places=9)
        self.assertAlmostEqual(differences["mass_kg"], 1e-3, places=9)
        planar = [[0, 1.0, 2.0, 3.0, 4.0, 1000.0]]
        self.assertEqual(ref.worst_differences(planar, [[0, 4.0, 6.0, 3.0, 4.5, 999.0]]),
                         {"position_m": 5.0, "velocity_mps": 0.5, "mass_kg": 1.0})


if __name__ == "__main__":
    unittest.main()
