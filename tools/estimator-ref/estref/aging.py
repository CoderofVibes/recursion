"""Aging of ship calibration parameters (spec 3.7, DECISIONS A5 item 4).

Each ship calibration parameter is a random walk on the ship's own clock. Its
variance grows with ship time, with use, and at each drop in reported
equipment condition. Rates per parameter class are in assumptions.json."""
from __future__ import annotations

import math

DAY = 86400.0


def accrued_variance(cls, dt=0.0, use=0.0, drops=()):
    """Variance added to a parameter of class `cls` (a dict from assumptions.json)
    over ship time dt [s], `use` (in the class's use unit) and condition drops."""
    v = cls["sigmaPerRootDay"] ** 2 * (dt / DAY)
    v += cls["sigmaPerRootUse"] ** 2 * (use / cls["useRef"])
    v += sum((cls["sigmaPerCondition"] * d) ** 2 for d in drops)
    return v


def aged_sigma(sigma, cls, dt=0.0, use=0.0, drops=()):
    return math.sqrt(sigma**2 + accrued_variance(cls, dt, use, drops))


def commanded_dv(commands, t0, t1):
    """Commanded delta-v [m/s] over [t0, t1): sum of u * overlap over thrust segments."""
    return sum(c.u * max(0.0, min(c.t1, t1) - max(c.t0, t0)) for c in commands)
