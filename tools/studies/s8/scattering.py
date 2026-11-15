"""Independent isolated-Beta scattering quadrature; no application imports.

Run ``python tools/studies/s8/scattering.py`` to write scattering.json.
Numbers are SI. The reported turn is UNWRAPPED, not acos(v_in dot v_out).
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

GM_BETA = 2.5e9
R0 = 1e6
# rp [km], v_infinity [m/s], 2G true turn [deg], Newton turn [deg], vp [m/s]
CLAIMS = (
    (300, 40, 220, 114, 148),
    (300, 60, 162, 89, 155),
    (400, 40, 189, 106, 122),
    (500, 40, 165, 99, 105),
    (571, 29, 197, 114, 93),
    (700, 28, 180, 110, 81),
    (830, 28, 161, 105, 72),
    (980, 28, 144, 100, 65),
    (1120, 28, 129, 95, 60),
    (1250, 28, 118, 92, 56),
    (1650, 28, 92, 82, 49),
    (840, 14.5, 252, 138, 67),
)


def scattering(rp: float, vinf: float, exponent: float = 2.5,
               order: int = 256) -> tuple[float, float]:
    """Return unwrapped deflection degrees and periapsis speed.

    With u=rp/r, A=2*K/((p-1)*rp**(p-1)), vp**2=vinf**2+A,
    theta_infinity = integral_0^1 vp/sqrt(vinf**2+A*u**(p-1)-vp**2*u**2) du.
    u=1-s**2 removes the periapsis square-root singularity. The subtraction
    u**(p-1)-u**2 is evaluated with expm1 to avoid cancellation at u=1.
    """
    k = GM_BETA * R0 ** (exponent - 2)
    a = 2 * k / ((exponent - 1) * rp ** (exponent - 1))
    vp = math.sqrt(vinf * vinf + a)
    points, weights = np.polynomial.legendre.leggauss(order)
    s = (points + 1) / 2
    u = 1 - s * s
    f = vinf**2 * s*s * (2-s*s) + a * u*u * np.expm1((exponent-3) * np.log(u))
    half_angle = float(np.dot(weights / 2, 2 * s * vp / np.sqrt(f)))
    return math.degrees(2 * half_angle - math.pi), vp


def results() -> dict:
    rows = []
    errors = []
    for rp, vinf, true_claim, newton_claim, speed_claim in CLAIMS:
        true, speed = scattering(rp*1000, vinf)
        fine, fine_speed = scattering(rp*1000, vinf, order=512)
        newton, _ = scattering(rp*1000, vinf, exponent=2)
        analytic_newton = math.degrees(2*math.asin(1/(1+rp*1000*vinf**2/GM_BETA)))
        errors.append(abs(newton-analytic_newton))
        rows.append({
            "periapsis_m": rp*1000, "vinfinity_m_s": vinf,
            "true_turn_deg": fine, "newton_turn_deg": analytic_newton,
            "periapsis_speed_m_s": fine_speed,
            "claim_true_turn_deg": true_claim,
            "claim_newton_turn_deg": newton_claim,
            "claim_periapsis_speed_m_s": speed_claim,
            "difference_true_turn_deg": fine-true_claim,
            "difference_newton_turn_deg": analytic_newton-newton_claim,
            "difference_periapsis_speed_m_s": fine_speed-speed_claim,
            "quadrature_256_512_difference_deg": abs(fine-true),
        })
    assert max(errors) < 1e-7
    assert max(r['quadrature_256_512_difference_deg'] for r in rows) < 1e-7
    return {
        "source": "2G handoff at 2986c3551a6a5bf1fd79262e48e39024ad937769",
        "method": "Isolated point-source energy/angular-momentum quadrature; 512-point Gauss-Legendre; u=1-s^2",
        "angle_definition": "2 * angle(periapsis to infinity) - pi; unwrapped",
        "comparison": "Same rp and vinfinity in both laws; not same impact parameter",
        "max_newton_quadrature_vs_analytic_deg": max(errors),
        "rows": rows,
    }


if __name__ == "__main__":
    output = results()
    destination = Path(__file__).with_name("scattering.json")
    destination.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {destination.name}: {len(output['rows'])} rows")
    for row in output["rows"]:
        print(f"{row['periapsis_m']/1000:4.0f} {row['vinfinity_m_s']:4.1f}: "
              f"true {row['true_turn_deg']:.6f} ({row['difference_true_turn_deg']:+.6f}), "
              f"Newton {row['newton_turn_deg']:.6f} ({row['difference_newton_turn_deg']:+.6f}), "
              f"vp {row['periapsis_speed_m_s']:.6f} ({row['difference_periapsis_speed_m_s']:+.6f})")
