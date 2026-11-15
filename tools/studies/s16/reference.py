"""S16 author-side mechanics, not the flight controller or a sensor simulation.

SI, static non-overlapping wells, mass-varying finite burns, no gravity sources.
The zero gravity sum is intentional: a well is not itself a gravity source.
Only the standard library and numpy; never imports production physics.
"""
from __future__ import annotations

import math
import numpy as np

CORE, INNER, OUTER, HULL = 1000.0, 40000.0, 50000.0, 20.0
MASS, FORCE, VE = 30374.0, 24000.0, 320.0 * 9.80665
CENTERS = np.array([[0., 0., 0.], [130000., 25000., 20000.],
                    [260000., -25000., -20000.]])
EXIT_X, EXIT_RADIUS = 330000.0, 130000.0
# Even all 40 jets firing together (impossible pod allocation) are allowed in
# this upper bound. It also allows instantaneous pointing and dry mass at t=0.
ACCEL_BOUND = (24000.0 + 40 * 200.0 + 0.236) / 24000.0


def norm(x):
    return float(np.linalg.norm(x))


def weight(r):
    if r <= INNER:
        return 1.0
    if r >= OUTER:
        return 0.0
    s = (r - INNER) / (OUTER - INNER)
    return 1 - s*s*s*(10 + s*(-15 + 6*s))


def transform(x, force, centers=CENTERS):
    d = x - centers
    r2 = np.sum(d*d, axis=1)
    i = int(np.argmin(r2))
    r = math.sqrt(float(r2[i]))
    if r <= CORE:
        raise ValueError("excluded core: terminate contact before force evaluation")
    if r >= OUTER:
        return force.copy()
    e = d[i] / r
    return force - 2 * weight(r) * np.dot(force, e) * e


def rhs(s, force, centers, ordinary):
    f = force if ordinary else transform(s[:3], force, centers)
    return np.r_[s[3:6], f/s[6], -norm(force)/VE]


def advance(s, h, force, centers=CENTERS, ordinary=False, method="rk4"):
    # All coast segments are exact in this source-free reference.
    if not np.any(force):
        out = s.copy()
        out[:3] += h*s[3:6]
        return out
    k1 = rhs(s, force, centers, ordinary)
    k2 = rhs(s+h*k1/2, force, centers, ordinary)
    if method == "midpoint":
        return s+h*k2
    k3 = rhs(s+h*k2/2, force, centers, ordinary)
    k4 = rhs(s+h*k3, force, centers, ordinary)
    return s+h*(k1+2*k2+2*k3+k4)/6


def segment_minimum(a, b, centers):
    delta = b-a
    den = float(np.dot(delta, delta))
    u = np.zeros(len(centers)) if den == 0 else np.clip(
        np.sum((centers-a)*delta, axis=1)/den, 0, 1)
    return np.sqrt(np.sum((a + u[:, None]*delta-centers)**2, axis=1))


def roots(a, b, center, radius):
    d, q = b-a, a-center
    aa, bb, cc = float(np.dot(d, d)), 2*float(np.dot(q, d)), float(np.dot(q, q)-radius**2)
    disc = bb*bb-4*aa*cc
    if aa == 0 or disc < 0:
        return []
    return sorted(u for u in {(-bb-math.sqrt(disc))/(2*aa),
                              (-bb+math.sqrt(disc))/(2*aa)} if 0 < u <= 1)


def pack(s):
    return {"position_m": s[:3].tolist(), "velocity_m_s": s[3:6].tolist(),
            "mass_kg": float(s[6])}


def initial(gap=100., speed=35., y=0., z=0., vy=0., vz=0., mass=MASS):
    return np.array([-math.sqrt((OUTER+gap)**2-y*y-z*z), y, z,
                     speed, vy, vz, mass])


def burn(start, duration, direction):
    return {"start_s": float(start), "duration_s": float(duration),
            "force_N": (FORCE*np.asarray(direction)/norm(direction)).tolist()}


def fly(s0, burns, centers=CENTERS, step=1., end=14000., ordinary=False,
        method="rk4", samples=True, exit_enabled=True):
    """Piecewise constant inertial forces. Coast sweeps exact; powered sweeps
    use chords, conservatively reduced by a*h^2/8. Commands split steps exactly.
    Contact examples occur on coasts: their first-contact times are exact roots.
    """
    s, t = s0.copy(), 0.0
    if not np.all(np.isfinite(s)) or s[6] < 24000.:
        raise ValueError('finite state and baseline dry-mass floor required')
    if min(norm(s[:3]-c) for c in centers) <= CORE+HULL:
        raise ValueError('initial whole-ship contact')
    minimum = np.full(len(centers), np.inf)
    events, history, outcome = [], [{"t_s": t, **pack(s)}], "timeout"
    cuts = sorted({0., end, *(c["start_s"] for c in burns),
                   *(c["start_s"]+c["duration_s"] for c in burns)})
    while t < end-1e-9:
        force = sum((np.asarray(c["force_N"]) for c in burns
                     if c["start_s"]-1e-9 <= t < c["start_s"]+c["duration_s"]-1e-9),
                    np.zeros(3))
        # Long exact coasts, fine powered steps. Samples and all shell roots
        # are emitted at exact segment times, not at display-frame boundaries.
        h = step if np.any(force) else (20.0 if samples else end-t)
        h = min(h, next(c-t for c in cuts if c > t+1e-9), end-t)
        nxt = advance(s, h, force, centers, ordinary, method)
        stop_fraction, stop_kind = 1., None
        for c in centers:
            hit = roots(s[:3], nxt[:3], c, CORE+HULL)
            if hit and hit[0] <= stop_fraction:
                stop_fraction, stop_kind = hit[0], "contact"
        if exit_enabled and s[0] < EXIT_X <= nxt[0]:
            u = (EXIT_X-s[0])/(nxt[0]-s[0])
            at = s + u*(nxt-s)
            if norm(at[1:3]) <= EXIT_RADIUS and u <= stop_fraction:
                stop_fraction, stop_kind = u, "exit"
        if stop_kind:
            h *= stop_fraction
            nxt = advance(s, h, force, centers, ordinary, method)
        chord_error = ACCEL_BOUND*h*h/8 if np.any(force) else 0.
        minimum = np.minimum(minimum, segment_minimum(s[:3], nxt[:3], centers)-chord_error)
        for i, c in enumerate(centers):
            for label, radius in (("outer", OUTER), ("zero-gain", 45000.), ("inner", INNER)):
                for u in roots(s[:3], nxt[:3], c, radius):
                    direction = "outbound" if np.dot(nxt[:3]-s[:3], s[:3]+u*(nxt[:3]-s[:3])-c)>0 else "inbound"
                    events.append({"t_s": t+h*u, "well": i+1,
                                   "surface": label, "direction": direction})
        t += h
        s = nxt
        if samples:
            history.append({"t_s": t, **pack(s)})
        if stop_kind:
            outcome = stop_kind
            break
    return {"initial": pack(s0), "commands": burns, "step_s": step,
            "outcome": outcome, "t_s": t, "final": pack(s),
            "propellant_kg": float(s0[6]-s[6]),
            "ideal_impulse_m_s": VE*math.log(s0[6]/s[6]),
            "minimum_core_clearance_m": (minimum-CORE-HULL).tolist(),
            "influences_met": [i+1 for i, r in enumerate(minimum) if r < OUTER],
            "events": sorted(events, key=lambda e:(e["t_s"],e["well"],e["surface"])),
            **({"samples": history} if samples else {})}


def certificate(s0):
    """All admissible controls, not a finite route search.

    |x(T)-[x0+v0*T]| <= a_max*T^2/2. If that whole reachable ball
    lies inside one well at any T, every trajectory has entered it by T.
    """
    t = norm(s0[3:6])/ACCEL_BOUND
    radius_bound = norm(s0[:3]+t*s0[3:6]) + ACCEL_BOUND*t*t/2
    return {"t_s": t, "acceleration_bound_m_s2": ACCEL_BOUND,
            "maximum_possible_radius_m": radius_bound,
            "forced_penetration_m": OUTER-radius_bound,
            "certified": bool(radius_bound <= OUTER-100.)}


class Rng:
    """Port of src/lib/rng.ts: FNV1a, splitmix32, sfc32, 12 warmup draws.
    Keys here are ASCII (no Python/JS Unicode-code-unit difference).
    """
    def __init__(self, key):
        h = 0x811c9dc5
        for c in key:
            h = ((h ^ ord(c))*0x01000193) & 0xffffffff
        self.s = []
        for _ in range(4):
            h = (h+0x9e3779b9)&0xffffffff
            z = ((h ^ (h>>16))*0x85ebca6b)&0xffffffff
            z = ((z ^ (z>>13))*0xc2b2ae35)&0xffffffff
            self.s.append((z ^ (z>>16))&0xffffffff)
        for _ in range(12):
            self.next()

    def next(self):
        a,b,c,d = self.s
        t = (a+b+d)&0xffffffff
        self.s = [(b^(b>>9))&0xffffffff, (9*c)&0xffffffff,
                  (((c<<21)|(c>>11))+t)&0xffffffff, (d+1)&0xffffffff]
        return t/4294967296

    def uniform(self, a,b):
        return a+(b-a)*self.next()


def proposal(seed):
    rng = Rng(f"seed:{seed}\0s16.geometry.v1")
    gap, speed = rng.uniform(50,1200), rng.uniform(30,40)
    y,z = rng.uniform(-150,150), rng.uniform(-150,150)
    vy,vz = speed*rng.uniform(-.001,.001), speed*rng.uniform(-.001,.001)
    centers = CENTERS.copy()
    for i in (1,2):
        for j in range(3):
            centers[i,j] += rng.uniform(-7500,7500)
    yaw, pitch = rng.uniform(-math.pi/6, math.pi/6), rng.uniform(-math.pi/9, math.pi/9)
    cy,sy,cp,sp = math.cos(yaw), math.sin(yaw), math.cos(pitch), math.sin(pitch)
    rotation = np.array([[cy*cp,-sy,cy*sp],[sy*cp,cy,sy*sp],[-sp,0,cp]])
    return initial(gap,speed,y,z,vy,vz), centers, rotation
