"""S22 independent SI mechanics. Only stdlib; reuses S16's seeded RNG.

Study scope: COM translation, spherical 20 m hull bound, finite main burns.
No production imports, attitude, noisy navigation, power or thermal simulation.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict, replace
import math
from pathlib import Path
import importlib.util

_spec = importlib.util.spec_from_file_location('s16_reference', Path(__file__).resolve().parents[1] / 's16/reference.py')
_s16 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_s16)
Rng = _s16.Rng

LENGTH, MOUTH, THROAT, CAP, EDGE, HULL = 120000., 20000., 1000., 5000., 2000., 20.
OFFSET = (LENGTH + CAP) / 2
BOUND = math.hypot(OFFSET, MOUTH)
PITCH, CELL = 160000., 140000.
MASS, FORCE, VE = 30374., 24000., 320 * 9.80665
GMIN, GMAX = .02, .10
AMAX = (24000 + 40*200 + .236)/24000 + GMAX
EXIT = 1450000.
ZERO = (0., 0., 0.)


def add(a, b): return tuple(x+y for x,y in zip(a,b))
def sub(a, b): return tuple(x-y for x,y in zip(a,b))
def mul(a, k): return tuple(x*k for x in a)
def dot(a, b): return sum(x*y for x,y in zip(a,b))
def norm(a): return math.sqrt(dot(a,a))
def unit(a): return mul(a,1/norm(a))
def smooth(x):
    x = max(0., min(1., x))
    return x*x*x*(10+x*(-15+6*x))


@dataclass(frozen=True)
class Funnel:
    id: int
    center: tuple
    axis: tuple
    on: float = 0.

    @property
    def mouth(self): return sub(self.center, mul(self.axis, OFFSET))
    @property
    def throat(self): return add(self.mouth, mul(self.axis, LENGTH))
    def json(self): return asdict(self)


def shape(x, f):
    d = sub(x, f.mouth)
    s = dot(d, f.axis)
    if not 0 < s < LENGTH+CAP:
        return s, 0., 0., 0.
    rho = norm(sub(d, mul(f.axis, s)))
    u = min(1., s/LENGTH)
    radius = THROAT + (MOUTH-THROAT)*(1-u)**2
    band = min(EDGE, radius/4)
    w = smooth(s/CAP)*smooth((LENGTH+CAP-s)/CAP)*smooth((radius-rho)/band)
    return s, rho, radius, w


class Field:
    """Insert conservative bounding balls into every intersected hash cell.
    Point queries have no false negatives; sweeps query the swept padded AABB.
    Dormant volumes are indexed too, and pair separation is checked at authoring.
    """
    def __init__(self, funnels):
        self.funnels = tuple(sorted(funnels, key=lambda f:f.id))
        if len({f.id for f in self.funnels})!=len(self.funnels): raise ValueError('duplicate-id')
        for f in self.funnels:
            if not all(math.isfinite(v) for v in (*f.center,*f.axis)) or abs(norm(f.axis)-1)>1e-10:
                raise ValueError('invalid-geometry')
        self.buckets = {}
        for f in self.funnels:
            for key in self.box_keys(sub(f.center,(BOUND,)*3), add(f.center,(BOUND,)*3)):
                self.buckets.setdefault(key, []).append(f)

    @staticmethod
    def box_keys(lo, hi):
        a = [math.floor(x/CELL) for x in lo]
        b = [math.floor(x/CELL) for x in hi]
        for i in range(a[0], b[0]+1):
            for j in range(a[1], b[1]+1):
                for k in range(a[2], b[2]+1): yield i,j,k

    def point(self, x): return self.buckets.get(tuple(math.floor(v/CELL) for v in x), ())

    def sweep(self, a, b, pad=0.):
        found = {}
        for key in self.box_keys(tuple(min(x,y)-pad for x,y in zip(a,b)), tuple(max(x,y)+pad for x,y in zip(a,b))):
            for f in self.buckets.get(key, ()): found[f.id] = f
        return [found[k] for k in sorted(found)]


def effect(x, t, force, field, ordinary=False):
    if ordinary is True: return ZERO, force, None
    for f in field.point(x):
        if t < f.on or dot(sub(x,f.center),sub(x,f.center)) > BOUND**2: continue
        s, _, _, w = shape(x, f)
        if f.on>0: w*=smooth((t-f.on)/120.)
        if w:
            g = GMIN + (GMAX-GMIN)*min(1.,max(0.,s/LENGTH))**2
            # The small rear cap pulls BACK toward the throat. The direction
            # changes only across the excluded crush disk; no valid trajectory
            # sees a force jump through that disk. Reflection is sign-invariant.
            return mul(f.axis,w*g*(1 if s<LENGTH else -1)), force if ordinary=='pull-only' else sub(force,mul(f.axis,2*w*dot(force,f.axis))), f.id
    return ZERO, force, None


def rhs(state, t, force, field, ordinary=False):
    gravity, delivered, _ = effect(state[:3],t,force,field,ordinary)
    return (*state[3:6], *add(gravity,mul(delivered,1/state[6])), -norm(force)/VE)


def advance(state, t, h, force, field, ordinary=False, method='rk4'):
    k1 = rhs(state,t,force,field,ordinary)
    k2 = rhs(add(state,mul(k1,h/2)),t+h/2,force,field,ordinary)
    if method == 'midpoint': return add(state,mul(k2,h))
    k3 = rhs(add(state,mul(k2,h/2)),t+h/2,force,field,ordinary)
    k4 = rhs(add(state,mul(k3,h)),t+h,force,field,ordinary)
    return tuple(s+h*(a+2*b+2*c+d)/6 for s,a,b,c,d in zip(state,k1,k2,k3,k4))


def segment_distance(a,b,c):
    d = sub(b,a)
    q = max(0.,min(1.,dot(sub(c,a),d)/dot(d,d))) if dot(d,d) else 0.
    return norm(sub(add(a,mul(d,q)),c))


def burn(start, duration, direction):
    return {'start_s':float(start), 'duration_s':float(duration), 'force_N':list(mul(unit(direction),FORCE))}


def pack(s):
    return {'position_m':list(s[:3]), 'velocity_m_s':list(s[3:6]), 'mass_kg':s[6]}


def fly(state, commands, field, end=26000., step=2., ordinary=False, samples=False, exit_x=EXIT, method='rk4'):
    start, t, s = tuple(state), 0., tuple(state)
    assert s[6] >= 24000 and all(math.isfinite(v) for v in s)
    if any(f.on<=0 and norm(sub(s[:3],f.throat))<=THROAT+HULL for f in field.point(s[:3])):
        raise ValueError('initial-crush')
    cuts = sorted({end, *(c['start_s'] for c in commands), *(c['start_s']+c['duration_s'] for c in commands),
                   *(f.on for f in field.funnels if 0 < f.on < end)})
    pending={time:[f for f in field.funnels if f.on==time] for time in sorted({f.on for f in field.funnels if f.on>0})}
    if pending: field=Field([replace(f,on=math.inf) if f.on>0 else f for f in field.funnels])
    cut = 0
    events, trace, met = [], [], set()
    minimum, outcome = float('inf'), 'endpoint'
    next_sample = 0.
    while t < end-1e-8:
        due=pending.pop(t,[])
        if due:
            activated={}
            for f in due:
                margin=activation_guard(f,s)
                if margin>0: activated[f.id]=f
                events.append({'t_s':t,'event':'birth' if margin>0 else 'birth-veto',
                               'id':f.id,'reachable_clearance_m':margin})
            field=Field([activated.get(f.id,f) for f in field.funnels])
        while cuts[cut] <= t+1e-8: cut += 1
        h = min(step,cuts[cut]-t,end-t)
        force = ZERO
        for c in commands:
            if c['start_s']-1e-8<=t<c['start_s']+c['duration_s']-1e-8: force=add(force,c['force_N'])
        _, _, active = effect(s[:3],t,force,field,ordinary)
        if active is not None and active not in met:
            met.add(active); events.append({'t_s':t,'event':'influence-sampled','id':active})
        if samples and t>=next_sample-1e-8:
            trace.append({'t_s':t,**pack(s)}); next_sample+=20.
        nxt = advance(s,t,h,force,field,ordinary,method)
        assert nxt[6] >= 24000, 'main budget exceeds dry mass'
        # Conservative curved-path deviation from endpoint chord. At activation
        # we split at the event; guard checks elsewhere keep the hull far away.
        error = AMAX*h*h/8
        candidates = field.sweep(s[:3],nxt[:3],HULL+error)
        near = [(segment_distance(s[:3],nxt[:3],f.throat)-THROAT-HULL-error,f)
                for f in candidates if t>=f.on]
        if near:
            margin, closest = min(near,key=lambda z:z[0]); minimum=min(minimum,margin)
            if margin<=0:
                # Sufficient-clearance bound is inconclusive: refine to a 1 ms
                # contact bracket. Do not call a coarse chord margin a collision.
                if h > .001:
                    h/=2
                    # Temporarily refine through this local interval by recursion
                    # is unnecessary: integrate small steps until contact here.
                    local_h = .001
                    elapsed=0.
                    while elapsed < min(step,cuts[cut]-t)-1e-10:
                        hh=min(local_h,min(step,cuts[cut]-t)-elapsed)
                        nn=advance(s,t+elapsed,hh,force,field,ordinary,method)
                        if norm(sub(nn[:3],closest.throat))<=THROAT+HULL:
                            t+=elapsed+hh; s=nn; outcome='crush'
                            events.append({'t_s':t,'event':'crush','id':closest.id,'bracket_s':hh})
                            break
                        s=nn; elapsed+=hh
                    if outcome=='crush': break
                    t+=elapsed
                    continue
                outcome='crush'
        if exit_x is not None and s[0]<exit_x<=nxt[0]:
            # Fine event interpolation followed by actual RK4 integration.
            h*= (exit_x-s[0])/(nxt[0]-s[0]); nxt=advance(s,t,h,force,field,ordinary,method)
            outcome='exit' if norm(nxt[1:3])<=350000. else 'missed-exit'
        t+=h; s=nxt
        if outcome in ('exit','crush','missed-exit'): break
    return {'initial':pack(start),'commands':commands,'step_s':step,'outcome':outcome,'t_s':t,
            'final':pack(s),'main_kg':start[6]-s[6], 'minimum_crush_clearance_bound_m':None if minimum==float('inf') else minimum,
            'influences_met':sorted(met),'events':events, **({'samples':trace+[{'t_s':t,**pack(s)}]} if samples else {})}


def random_axis(rng):
    z=rng.uniform(-1,1); phi=rng.uniform(0,2*math.pi); r=math.sqrt(1-z*z)
    return r*math.cos(phi), r*math.sin(phi), z


def placement(seed):
    """Uniform axis and roll; matrix columns rotate garden +x,+y,+z."""
    rng=Rng(f'seed:{seed}\0s22.placement.v2'); n=random_axis(rng)
    cross=lambda a,b:(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
    helper=(0.,0.,1.) if abs(n[2])<.9 else (0.,1.,0.)
    u=unit(cross(helper,n)); v=cross(n,u); roll=rng.uniform(0,2*math.pi)
    y=add(mul(u,math.cos(roll)),mul(v,math.sin(roll))); z=cross(n,y)
    return tuple(zip(n,y,z))


def make_field(seed, half=8, layers=9):
    rng=Rng(f'seed:{seed}\0s22.geometry.v2')
    funnels=[Funnel(0,(OFFSET,0.,0.),(1.,0.,0.))]
    for i in range(layers):
        for j in range(-half,half+1):
            for k in range(-half,half+1):
                if (i,j,k)==(0,0,0): continue
                c=(OFFSET+i*PITCH+rng.uniform(-4000,4000),j*PITCH+rng.uniform(-4000,4000),k*PITCH+rng.uniform(-4000,4000))
                # One quarter of reserved sites has a fixed run-epoch birth.
                ident=len(funnels)
                on=1200.+600*(i%3) if ident%4==0 else 0.
                funnels.append(Funnel(ident,c,random_axis(rng),on))
    return Field(funnels)


def pair_gap(field):
    best=float('inf')
    # Every pair closer than 2*BOUND shares an AABB bucket. For an exact minimum
    # gap, enumerate spatial neighbors within two cells (distant pairs cannot win).
    centers={}
    for f in field.funnels:
        key=tuple(math.floor(v/PITCH) for v in f.center)
        centers.setdefault(key,[]).append(f)
    for f in field.funnels:
        key=tuple(math.floor(v/PITCH) for v in f.center)
        for i in range(-2,3):
            for j in range(-2,3):
                for k in range(-2,3):
                    for other in centers.get((key[0]+i,key[1]+j,key[2]+k),()):
                        if other.id>f.id: best=min(best,norm(sub(f.center,other.center))-2*BOUND)
    return best


def activation_guard(f, state, response_s=240.):
    # Stronger than 'outside': the complete reachable ball for 240 seconds
    # cannot reach the enclosing ball, even with all jets and dry mass.
    return norm(sub(state[:3],f.center))-BOUND-HULL-norm(state[3:6])*response_s-AMAX*response_s**2/2


def activation_attempt(f, state, tick, nominal):
    if tick < nominal: return 'precursor'
    return 'active' if activation_guard(f,state)>0 else 'dormant-blocked'
