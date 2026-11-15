"""Independent S8 point-particle reference. SI units; no game imports.

The circular massive pair is analytic; particles use classical fourth-order RK.
Burns are measured velocity impulses unless explicitly labelled finite burns.
"""
from __future__ import annotations
import math
import numpy as np

R0 = 1_000_000.0
GM = np.array([1.0e10, 2.5e9])
RADII = np.array([250_000.0, 160_000.0])
D = 4_000_000.0
P = 2.5
OMEGA = math.sqrt(sum(GM) * math.sqrt(R0) / D**3.5)
MASS = 30374.0
G0 = 9.80665
HULL = 20.0  # conservative sphere enclosing every deployed prism

def norm(x):
    return np.linalg.norm(x, axis=-1)

def bodies(t, phase=0.0):
    """Return (...,2,3) barycentric positions, velocities; phase in radians."""
    a = OMEGA * np.asarray(t) + np.asarray(phase)
    u = np.stack([np.cos(a), np.sin(a), np.zeros_like(a)], axis=-1)
    tangent = np.stack([-np.sin(a), np.cos(a), np.zeros_like(a)], axis=-1)
    radii = np.array([-0.2*D, 0.8*D])
    return u[..., None, :]*radii[:, None], tangent[..., None, :]*(radii*OMEGA)[:, None]

def acceleration(t, x, exponent=P, phase=0.0):
    bp, _ = bodies(t, phase)
    r = np.asarray(x)[..., None, :] - bp
    distance = norm(r)
    return -np.sum(r * (GM * R0**(exponent-2) / distance**(exponent+1))[..., None], axis=-2)

def rk4(t, x, v, dt, exponent=P, phase=0.0):
    a = acceleration(t, x, exponent, phase)
    b = acceleration(t+dt/2, x+v*dt/2, exponent, phase)
    c = acceleration(t+dt/2, x+v*dt/2+a*dt*dt/4, exponent, phase)
    d = acceleration(t+dt, x+v*dt+b*dt*dt/2, exponent, phase)
    return x + v*dt + (a+b+c)*dt*dt/6, v+(a+2*b+2*c+d)*dt/6

def arrival(bearing=math.pi, phase=0.0, radius=R0):
    bp, bv = bodies(0, phase)
    a = np.asarray(bearing)
    u = np.stack([np.cos(a), np.sin(a), np.zeros_like(a)], axis=-1)
    q = np.stack([-np.sin(a), np.cos(a), np.zeros_like(a)], axis=-1)
    speed = np.sqrt(GM[0]*np.sqrt(R0)/np.asarray(radius)**1.5)
    return bp[..., 0, :]+u*np.asarray(radius)[..., None], bv[..., 0, :]+q*speed[..., None]

def integrate(x, v, start, end, dt=60.0, exponent=P, phase=0.0, sample=False):
    x, v = np.array(x, dtype=float, copy=True), np.array(v, dtype=float, copy=True)
    t = float(start)
    history = [(t, x.copy(), v.copy())] if sample else None
    while t < end-1e-8:
        h = min(dt, end-t)
        x, v = rk4(t, x, v, h, exponent, phase)
        t += h
        if sample:
            history.append((t, x.copy(), v.copy()))
    if sample:
        return np.array([a[0] for a in history]), np.array([a[1] for a in history]), np.array([a[2] for a in history])
    return x, v

def prograde(t, v, phase=0.0):
    _, bv = bodies(t, phase)
    q = np.asarray(v)-bv[..., 0, :]
    return q/norm(q)[..., None]

def fly(burn=14.0, burn_time=3960.0, end=300000.0, dt=60.0,
        bearing=math.pi, phase=0.0, kicks=(), exponent=P):
    """Trace one ship. kicks sequence (absolute seconds, inertial dv[3])."""
    x, v = arrival(bearing, phase)
    events = [(float(burn_time), 'main', burn)] + [(float(t), 'kick', np.array(dv)) for t,dv in kicks]
    events.sort(key=lambda e:e[0])
    events.append((end, 'end', 0))
    times, positions, velocities = [], [], []
    t = 0.0
    for stop, kind, value in events:
        if stop < t or stop > end:
            continue
        ts, xs, vs = integrate(x,v,t,stop,dt,exponent,phase,True)
        times.extend(ts[:-1]); positions.extend(xs[:-1]); velocities.extend(vs[:-1])
        t,x,v = stop,xs[-1],vs[-1]
        if kind == 'main':
            v = v+value*prograde(t,v,phase)
        elif kind == 'kick':
            v = v+value
    times.append(t); positions.append(x); velocities.append(v)
    return np.array(times), np.array(positions), np.array(velocities)

def summary(trace, phase=0.0, delta_v=14.0):
    t,x,v=trace
    bp,bv=bodies(t,phase)
    dist=norm(x[:,None,:]-bp)
    i=int(np.argmin(dist[:,1]))
    exits=np.flatnonzero((norm(x)>=9e6)&(np.sum(x*v,axis=-1)>0))
    e=int(exits[0]) if len(exits) else None
    return dict(beta_peri_m=float(dist[i,1]), beta_peri_t=float(t[i]),
                beta_peri_relative_speed=float(norm(v[i]-bv[i,1])),
                alpha_min_m=float(dist[:,0].min()),
                exit_t=None if e is None else float(t[e]),
                exit_speed=None if e is None else float(norm(v[e])),
                exit_position=None if e is None else x[e].tolist(),
                exit_velocity=None if e is None else v[e].tolist(),
                qualifies=bool(e is not None and norm(v[e])>=50 and delta_v<=16 and np.all(dist>RADII+HULL)))

def fuel(delta_v, mass=MASS, isp=320.0):
    return float(mass*(-math.expm1(-delta_v/(isp*G0))))

def jacobi(t,x,v,phase=0.0):
    bp,_=bodies(t,phase)
    d=norm(np.asarray(x)[...,None,:]-bp)
    potential=-np.sum(GM*np.sqrt(R0)/(1.5*d**1.5),axis=-1)
    h=np.asarray(x)[...,0]*np.asarray(v)[...,1]-np.asarray(x)[...,1]*np.asarray(v)[...,0]
    return norm(v)**2/2+potential-OMEGA*h

def target_burn(peri_m, lower=13.0, upper=15.0, dt=60.0):
    """Local monotone branch near 2G's representative burn, fixed t=3960 s."""
    for _ in range(28):
        mid=(lower+upper)/2
        r=summary(fly(mid,end=145000,dt=dt))['beta_peri_m']
        # In this branch periapsis grows with impulse.
        if r < peri_m:
            lower=mid
        else:
            upper=mid
    return (lower+upper)/2
