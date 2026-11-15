"""S21 reference, extending S8's independently checked mechanics (no game imports).

All distances are metres, times seconds, powers watts, energies joules.
The cloud is explicitly fictional. This is an authoring reference, not a planner.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import numpy as np

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE.parent / "s8"))
import core  # noqa: E402
import ring  # noqa: E402


def smooth(u):
    u = np.clip(u, 0, 1)
    return u * u * (3 - 2 * u)


def intensity(t, position):
    """Trailing cloud crescent, co-rotating with the binary; no thin-z escape.

    Spherical radial bounds, azimuthal banks; spans all elevations. Pole values
    use the limiting maximum (polar cap) rather than atan2(0,0) creating a hole.
    """
    bp, _ = core.bodies(t)
    q = position - bp[..., 1, :]
    r = core.norm(q)
    a = np.arctan2(q[..., 1], q[..., 0]) - core.OMEGA * np.asarray(t)
    a = np.rad2deg(np.arctan2(np.sin(a), np.cos(a)))
    azimuth = smooth((a + 90) / 5) * smooth((-30 - a) / 5)
    polar = smooth((0.2 - core.norm(q[..., :2]) / np.maximum(r, 1)) / .1)
    angular = np.maximum(azimuth, polar)
    return .05 * smooth((r - 1_000_000) / 50_000) * smooth((2_600_000 - r) / 200_000) * angular


def cloud_report(trace):
    t, x, v = trace
    # COM integral; separate geometric support clearance below certifies the
    # whole 20 m hull is outside the field for zero-dose witness routes.
    rate = intensity(t, x)
    dt = np.diff(t)
    dose = np.r_[0, np.cumsum((rate[:-1] + rate[1:]) * .5 * dt)]
    def crossing(level):
        ids = np.flatnonzero(dose >= level)
        if not len(ids):
            return None
        i = int(ids[0])
        if i == 0:
            return float(t[0])
        return float(t[i-1] + (t[i]-t[i-1]) * (level-dose[i-1]) / (dose[i]-dose[i-1]))
    bp, _ = core.bodies(t)
    q = x-bp[:,1]
    r = core.norm(q)
    a = np.rad2deg(np.arctan2(q[:,1],q[:,0])-core.OMEGA*t)
    a = (a+180)%360-180
    # Distance lower bound to the intersection of radial and angular support.
    # For a zero-dose equatorial route, max(radial gap, wedge-plane gap)
    # lower-bounds distance to the crescent; include the separate polar cap.
    radial_gap = np.maximum.reduce([1e6-r, r-2.6e6, np.zeros_like(r)])
    angular_gap = np.minimum(abs((a+90+180)%360-180),abs((a+30+180)%360-180))
    wedge_gap = np.where((a>=-90)&(a<=-30),0,core.norm(q[:,:2])*np.sin(np.deg2rad(np.minimum(angular_gap,90))))
    cap_gap = np.maximum(0,core.norm(q[:,:2])-.2*r)/1.2
    support_gap = np.minimum(np.maximum(radial_gap,wedge_gap),np.maximum(radial_gap,cap_gap))
    return dict(raw_exposure=float(dose[-1]), peak_intensity=float(max(rate)),
                sampled_support_clearance_lower_bound_m=float(min(support_gap)-core.HULL),
                caution_t=crossing(1), standard_failure_t=crossing(80),
                power_switch_failure_t=crossing(150), hardened_failure_t=crossing(320))


def route(burn, burn_time=3960., lift=0., lift_t=80040., dt=120., bearing=math.pi, end=360000.):
    tr = core.fly(burn, burn_time=burn_time, kicks=[] if lift == 0 else [(lift_t, [0, 0, lift])],
                  dt=dt, bearing=bearing, end=end)
    s = core.summary(tr, delta_v=burn+abs(lift))
    if s['exit_t'] is not None:
        j = int(np.searchsorted(tr[0], s['exit_t'])) + 1
        tr = tuple(a[:j] for a in tr)
    return tr, s


def route_grid(dt=120.):
    """689 S8 controls plus 3D lifts at fixed epochs, 160 h horizon.

    All draws are enumerated, no optimizer and no claim of continuous coverage.
    A failure terminates a physical route; cloud totals also track the ghost
    route to classify the mechanism (never claimed to survive that failure).
    """
    specs = [(float(t), float(dv), 0., 80040.) for t in range(0, 62401, 1200)
             for dv in np.arange(10., 16.01, .5)]
    specs += [(3960., float(dv), float(z), float(kt))
              for dv in (13.8, 14., 14.2, 14.4, 14.6, 14.8, 15., 15.2, 15.5)
              for z in (-2., -1., 1., 2.) for kt in (3960., 39600., 79200.)
              if dv+abs(z) <= 16]
    n = len(specs)
    x, v = [np.tile(a, (n, 1)) for a in core.arrival()]
    burn_t, burns, lifts, lift_t = np.array(specs).T
    peri = np.full(n, np.inf)
    dose = np.zeros(n)
    exits = [None] * n
    hit = np.zeros(n, bool)
    active = np.ones(n, bool)
    for t in np.arange(0., 160*3600, dt):
        for epoch, dv, is_main in ((burn_t, burns, True), (lift_t, lifts, False)):
            choose = active & (abs(epoch-t) < .01)
            if is_main:
                v[choose] += dv[choose, None]*core.prograde(t, v[choose])
            else:
                v[choose, 2] += dv[choose]
        xn, vn = core.rk4(t, x, v, dt)
        impact = active & ring.body_contacts(t, x, xn, np.full(n, core.HULL), dt)
        hit |= impact
        active &= ~impact
        bp, _ = core.bodies(t+dt)
        peri = np.minimum(peri, np.where(active, core.norm(xn-bp[1]), np.inf))
        dose += np.where(active, .5*(intensity(t, x)+intensity(t+dt, xn))*dt, 0)
        departed = active & (core.norm(xn) >= 9e6) & (np.sum(xn*vn, axis=-1) > 0)
        for i in np.flatnonzero(departed):
            exits[i] = dict(t=float(t+dt), speed=float(core.norm(vn[i])),
                            beta_peri_m=float(peri[i]), raw_exposure=float(dose[i]))
        active &= ~departed
        x = np.where(active[:, None], xn, x)
        v = np.where(active[:, None], vn, v)
    return [dict(burn_time=q[0], main_dv=q[1], lift=q[2], lift_t=q[3],
                 impact=bool(hit[i]), exit=exits[i]) for i, q in enumerate(specs)]


def clearance(traces, phase_degrees, dt=120.):
    """All 336 moving rocks, every route until its own exit, swept spheres.

    PCG64 8008's fixed sizes/relative elements; rotate Beta layout only. Alpha
    layout fixed. These are layout phases, not independent population draws.
    """
    initial = []
    alpha = ring.initial_alpha_field()
    for phase in phase_degrees:
        beta = ring.initial_ring(phase=math.radians(phase))
        initial.append([np.concatenate((alpha[k], beta[k])) for k in range(3)])
    x, v, radii = [np.array([r[k] for r in initial]) for k in range(3)]
    active = np.ones(radii.shape, bool)
    end = max(tr[0][-1] for tr in traces)
    times = np.arange(0., end+dt*.5, dt)
    ships = np.array([np.column_stack([np.interp(times, tr[0], tr[1][:,j]) for j in range(3)]) for tr in traces])
    minimum = np.full((len(traces), len(initial)), np.inf)
    near_t = np.zeros_like(minimum)
    near_rock = np.zeros(minimum.shape, int)
    first_contact = np.full(minimum.shape, np.nan)
    first_20km = np.full(minimum.shape, np.nan)
    warnings = np.full((len(traces), len(initial), len(radii[0])), np.nan)
    contact_rock = np.full(minimum.shape,-1,int)
    for k, t in enumerate(times[:-1]):
        xn, vn = core.rk4(t, x, v, dt)
        removed = ring.body_contacts(t, x, xn, radii, dt)
        # Keep the interval ending in absorption; removing before the sweep
        # could conceal an earlier ship contact in that same interval.
        start = x[None, :, :, :] - ships[:, k, None, None, :]
        change = xn[None, :, :, :] - ships[:, k+1, None, None, :] - start
        frac = np.clip(-np.sum(start*change, axis=-1)/np.maximum(np.sum(change*change, axis=-1), 1e-30), 0, 1)
        gap = core.norm(start+frac[..., None]*change)-radii[None, :, :]-core.HULL
        gap[:, ~active] = np.inf
        for j, tr in enumerate(traces):
            if t >= tr[0][-1]:
                continue
            ix = np.argmin(gap[j], axis=-1)
            g = gap[j, np.arange(len(initial)), ix]
            changed = g < minimum[j]
            minimum[j] = np.minimum(minimum[j], g)
            near_t[j, changed] = (t+dt*frac[j, np.arange(len(initial)), ix])[changed]
            near_rock[j, changed] = ix[changed]
            warned = np.isnan(warnings[j]) & (gap[j] < 20000)
            warnings[j, warned] = t
            found = np.isnan(first_contact[j]) & (g < 0)
            first_contact[j,found] = t  # conservative interval start, +/- dt
            first_20km[j,found] = warnings[j,np.arange(len(initial)),ix][found]
            contact_rock[j,found] = ix[found]
        active &= ~removed
        x, v = np.where(active[..., None], xn, x), np.where(active[..., None], vn, 0)
    def finite(value):
        return None if not np.isfinite(value) else float(value)
    rows = [[dict(phase_deg=float(p), clearance_m=float(minimum[j,i]),
                  closest_t=float(near_t[j,i]), rock=int(near_rock[j,i]),
                  contact_rock=int(contact_rock[j,i]),
                  first_contact_t=finite(first_contact[j,i]), first_20km_t=finite(first_20km[j,i]))
             for i,p in enumerate(phase_degrees)] for j in range(len(traces))]
    return rows, initial


def shadow(t, x, phase=0.):
    sun = np.array([math.cos(math.radians(12))*math.cos(math.radians(200)),
                    math.cos(math.radians(12))*math.sin(math.radians(200)), math.sin(math.radians(12))])
    bp, _ = core.bodies(t,phase)
    if phase:
        rot=np.array([[math.cos(phase),-math.sin(phase),0],[math.sin(phase),math.cos(phase),0],[0,0,1]])
        x=x@rot.T
    q = bp-x[..., None, :]
    along = np.sum(q*sun, axis=-1)
    return np.any((along > 0) & (core.norm(q-along[..., None]*sun) < core.RADII), axis=-1)


def baseline_loads():
    d = json.loads((ROOT/'data/ship-baseline.json').read_text())
    loads = []
    for e in d['equipment']:
        if not e.get('bus') or e['id'].startswith('battery'):
            continue
        p = e['modes'][e['initialMode']]['power']
        if e['id'] == 'black-box':
            p = 15.  # encounter's .05 Hz is below the 1 Hz minimum draw
        if p:
            loads.append(dict(id=e['id'], bus=e['bus'], watts=p))
    essential = sum(e['watts'] for e in loads if e['bus'] == 'essential')
    a = sum(e['watts'] for e in loads if e['bus'] == 'main-a')
    b = sum(e['watts'] for e in loads if e['bus'] in ('main-b', 'payload'))
    return d, loads, np.array([a+essential/.95, b])


def power(trace, policy='planned', dt=30., end=None, phase=0., compact=False):
    """Two isolated buses with a dual-fed essential converter.

    Conservative fixed operating-load envelope. The essential feed follows
    the side with more available source power/charge, as the game does; no tie
    is assumed. Healthy 295 K batteries, no thermal/damage transient simulated.
    Informed schedules include explicit no-generation windows for turns,
    tracking and manual delays. Commands/illumination, never truth in UI.
    """
    d, loads, base = baseline_loads()
    bspec = d['generation']['battery']
    hydrogen = 6.
    energy = np.full(2, bspec['initialEnergyPerPack'], dtype=float)
    initial = energy.copy()
    cumulative = dict(load_J=0., solar_used_J=0., solar_available_J=0., fuel_J=0.,
                      battery_out_J=0., battery_in_J=0., unmet_J=0., conversion_loss_J=0.)
    events = dict(fuel_empty_t=None, caution_t=None, reserve_t=None, brownout_t=None, death_t=None)
    snapshots = []
    tvec = np.arange(0, (trace[0][-1] if end is None else end)+dt*.5, dt)
    pos = np.column_stack([np.interp(tvec, trace[0], trace[1][:,i]) for i in range(3)])
    dark = shadow(tvec, pos,phase)
    # At most 8 h off-sun in planned operation; manual envelope adds 8 h.
    windows = [(0, 2*3600), (20*3600, 26*3600)]
    if policy == 'manual':
        windows += [(40*3600, 48*3600)]
    fc_prev = np.zeros(2)
    brownout_duration = 0.
    for k,t in enumerate(tvec[:-1]):
        incidence = math.cos(math.radians(45 if policy == 'manual' else 30))
        if policy in ('stowed', 'edge-on') or any(lo <= t < hi for lo,hi in windows) or dark[k]:
            incidence = 0.
        solar = np.full(2, 600*40*.22*incidence)
        # 150/300 W extra essential demand for manoeuvres, recorder and manual
        # overhead is charged continuously: deliberately above scheduled peaks.
        overhead = 300. if policy == 'manual' else 150. if policy == 'planned' else 0.
        side = int(np.argmax(solar + np.minimum(6000., fc_prev+1000*dt) + np.minimum(4000.,energy*.95/dt)))
        demand = np.array([30.,210.])
        demand[side] += (2625.+overhead)/.95
        demand += 100. if t < 30 and policy not in ('stowed','edge-on') else 0.
        if t < 30 and policy not in ('stowed','edge-on'):
            solar[:] = 0.
        solar_used = np.minimum(demand, solar)
        deficit = demand-solar_used
        rise = np.minimum(dt, (6000.-fc_prev)/1000.)
        capacity = (fc_prev*rise + .5*1000*rise**2 + 6000*(dt-rise))/dt
        requested_fc = np.minimum(deficit, capacity)
        remaining_fc = hydrogen*71e6
        fuel = requested_fc*min(1., remaining_fc/max(float(sum(requested_fc))*dt, 1e-30))
        hydrogen = max(0., hydrogen-float(sum(fuel))*dt/71e6)
        fc_prev = fuel
        if hydrogen < 1e-12 and events['fuel_empty_t'] is None:
            events['fuel_empty_t'] = float(t+dt)
        remaining = deficit-fuel
        discharge = np.minimum(remaining, np.minimum(4000., energy*.95/dt))
        energy -= discharge*dt/.95
        charge = np.minimum(np.maximum(solar-solar_used,0), np.minimum(2000., (36e6-energy)/(.95*dt)))
        charge = np.where(discharge>0, 0, charge)
        energy += charge*.95*dt
        unmet = remaining-discharge
        # Operational loss rule is a proposed A18 policy, not human physiology.
        # There is enough optional load to shed first; only deficits above that
        # envelope count as a critical-service brownout.
        critical_unmet = max(0., float(unmet[side])-450.)
        if critical_unmet > .05*(2235/.95):
            brownout_duration += dt
            if events['brownout_t'] is None:
                events['brownout_t'] = float(t)
        else:
            brownout_duration = 0.
        if brownout_duration >= 120 and events['death_t'] is None:
            events['death_t'] = float(t+dt)
        dark_reserve = (hydrogen*71e6 + float(sum(energy))*.95) / float(sum(demand))
        if dark_reserve <= 4*3600 and events['caution_t'] is None:
            events['caution_t'] = float(t+dt)
        if min(energy) <= 7.2e6 and events['reserve_t'] is None:
            events['reserve_t'] = float(t+dt)
        cumulative['load_J'] += float(sum(demand))*dt
        cumulative['solar_available_J'] += float(sum(solar))*dt
        cumulative['solar_used_J'] += float(sum(solar_used+charge))*dt
        cumulative['fuel_J'] += float(sum(fuel))*dt
        cumulative['battery_out_J'] += float(sum(discharge))*dt
        cumulative['battery_in_J'] += float(sum(charge))*dt
        cumulative['unmet_J'] += float(sum(unmet))*dt
        cumulative['conversion_loss_J'] += (2625+overhead)*(1/.95-1)*dt
        if int(t)%3600 == 0 or events['death_t'] is not None or k == len(tvec)-2:
            snapshots.append(dict(t=float(t+dt), hydrogen_kg=hydrogen, battery_J=energy.tolist(),
                                  solar_W=float(sum(solar)), load_W=float(sum(demand)), dark_reserve_s=dark_reserve))
        if events['death_t'] is not None:
            break
    residual = cumulative['solar_used_J']+cumulative['fuel_J']+cumulative['battery_out_J']-cumulative['load_J']-cumulative['battery_in_J']+cumulative['unmet_J']
    battery_residual = float(sum(energy-initial))-cumulative['battery_in_J']*.95+cumulative['battery_out_J']/.95
    return dict(policy=policy, events=events, hydrogen_kg=hydrogen, oxygen_kg=8*hydrogen,
                product_water_kg=9*(6-hydrogen), batteries_J=energy.tolist(),
                reserve_s=dark_reserve, eclipse_s=float(sum(dark[:-1])*dt), ledger=cumulative,
                ledger_residual_J=residual, battery_residual_J=battery_residual, snapshots=[] if compact else snapshots,
                windows_s=windows, incidence_deg=None if policy in ('stowed','edge-on') else 45 if policy=='manual' else 30,
                constant_overhead_W=overhead, dt=dt)


def write_or_check(name, value, check):
    content = json.dumps(value, indent=2, allow_nan=False)+'\n'
    path = HERE/name
    if check:
        if not path.exists() or path.read_text(encoding='utf-8') != content:
            raise AssertionError(f'{name} differs; regenerate and review')
    else:
        path.write_text(content, encoding='utf-8', newline='\n')


def adapted_catalogue():
    candidates = json.loads((HERE.parent/'s8/seeds.json').read_text())['catalogue']['candidates']
    result, traces = [], []
    for c in candidates:
        offset = c['bearing_offset_deg']
        if abs(offset)>15:
            continue
        # Retain S8's timed opportunity; shift its main impulse inward by .2.
        burn = c['main_delta_v']-.2
        kick = round((c['beta_peri_t']-8*3600)/120)*120
        tr,s = route(burn,c['burn_time'],lift=1.,lift_t=kick,bearing=math.pi+math.radians(offset))
        result.append(dict(offset_deg=offset, main_dv=burn,burn_t=c['burn_time'],lift_t=kick,
                           summary=s, cloud=cloud_report(tr)))
        traces.append(tr)
    gaps,initial = clearance(traces,[0])
    for q,cs,tr in zip(result,gaps,traces):
        q['full_field']=cs[0]
        alpha=ring.initial_alpha_field()
        arrival_position=core.arrival(math.pi+math.radians(q['offset_deg']))[0]
        q['arrival_rock_surface_gap_m']=float(min(core.norm(alpha[0]-arrival_position)-alpha[2]))
        q['power_by_binary_phase']=[]
        for phase in (0,90,180,270):
            theta=math.radians(phase)
            # Rotate ship/binary together, leaving the distant sun fixed.
            q['power_by_binary_phase'].append(dict(phase_deg=phase,**power(tr,'manual',dt=120.,phase=theta,compact=True)))
    return result


def finite_route(dt=30.):
    """Quarter-throttle main and 750 N translation, both centred on impulses.

    Fixed inertial delivered directions, exact rocket-equation impulse over
    each subinterval. Does not model a controller, pointing errors or torque.
    """
    main_dv=13.79710440710187
    x0,v0=core.integrate(*core.arrival(),0,3960,30)
    main_direction=core.prograde(3960,v0)
    mass=core.MASS
    main_fuel=core.fuel(main_dv)
    lift_fuel=core.fuel(1.,mass-main_fuel,isp=220)
    segments=[(3960.,24000*.975*.25,320.,main_fuel,main_direction),
              (80040.,750.,220.,lift_fuel,np.array([0.,0.,1.]))]
    events=[]
    for centre,force,isp,fuel,_ in segments:
        duration=fuel/(force/(isp*core.G0))
        events.append((centre-duration/2,centre+duration/2,force,isp))
    x,v=core.arrival()
    t=0.
    times=[t];xx=[x.copy()];vv=[v.copy()]
    while t<300000:
        stops=[q for start,end,_,_ in events for q in (start,end) if q>t+1e-8]
        h=min(dt,min(stops)-t if stops else dt)
        thrust=None
        for j,(start,end,force,isp) in enumerate(events):
            if start-1e-8<=t<end-1e-8:
                h=min(h,1.)
                flow=force/(isp*core.G0)
                impulse=isp*core.G0*math.log(mass/(mass-flow*h))
                thrust=segments[j][4]*impulse
                mass-=flow*h
                break
        if thrust is not None:
            v+=thrust/2
        x,v=core.rk4(t,x,v,h)
        if thrust is not None:
            v+=thrust/2
        t+=h
        times.append(t);xx.append(x.copy());vv.append(v.copy())
        if core.norm(x)>=9e6 and x@v>0:
            break
    return (np.array(times),np.array(xx),np.array(vv)),dict(main_propellant_kg=main_fuel,
            lift_propellant_kg=lift_fuel,segments=[dict(start=a,end=b,force_N=f,isp_s=i) for a,b,f,i in events])


def robustness():
    rows=[];traces=[]
    for shift in (-30.,0.,30.):
        for delta in (-.025,0.,.025):
            tr,s=route(13.79710440710187+delta,3960.+shift,lift=1.)
            rows.append(dict(main_time_shift_s=shift,main_dv_shift=delta,summary=s,cloud=cloud_report(tr)))
            traces.append(tr)
    finite,spec=finite_route()
    traces.append(finite)
    gaps,_=clearance(traces,[0],dt=60.)
    for row,gap in zip(rows,gaps[:-1]):
        row['clearance']=gap[0]
    fs=core.summary(finite,delta_v=14.79710440710187)
    manual=[];manual_traces=[]
    for shift in (-60.,0.,60.):
        for delta in (-.05,0.,.05):
            tr,s=route(13.79710440710187+delta,3960.+shift,lift=1.)
            manual.append(dict(main_time_shift_s=shift,main_dv_shift=delta,summary=s,cloud=cloud_report(tr)))
            manual_traces.append(tr)
    manual_gaps,_=clearance(manual_traces,[150.],dt=120.)
    for row,gap in zip(manual,manual_gaps):
        row['clearance']=gap[0]
    return dict(neighborhood=rows,manual_neighborhood=manual,
                finite=dict(commands=spec,summary=fs,clearance=gaps[-1][0],cloud=cloud_report(finite)))


def catalogue_neighborhoods():
    cat=json.loads((HERE/'catalogue.json').read_text())
    rows=[];traces=[]
    for q in cat:
        for shift in (-30.,0.,30.):
            for delta in (-.025,0.,.025):
                tr,s=route(q['main_dv']+delta,q['burn_t']+shift,lift=1.,lift_t=q['lift_t'],
                           bearing=math.pi+math.radians(q['offset_deg']))
                rows.append(dict(offset_deg=q['offset_deg'],time_shift_s=shift,dv_shift=delta,summary=s,cloud=cloud_report(tr)))
                traces.append(tr)
    gaps,_=clearance(traces,[0],dt=120.)
    for row,gap in zip(rows,gaps):
        row['clearance']=gap[0]
        row['passes']=bool(row['summary']['qualifies'] and row['cloud']['raw_exposure']==0 and gap[0]['clearance_m']>=1000)
    return rows


def vector(tr, summary, commands, expectations):
    chosen=np.unique(np.r_[np.arange(0,len(tr[0]),30),len(tr[0])-1]).astype(int)
    return dict(initial_ship=dict(position=tr[1][0].tolist(),velocity=tr[2][0].tolist()),
                commands=commands, summary=summary,expectations=expectations,
                samples=[dict(t=float(tr[0][i]),position=tr[1][i].tolist(),velocity=tr[2][i].tolist()) for i in chosen])


def vectors_and_checks(check):
    tr,s=route(13.79710440710187,lift=1.)
    commands=[dict(t=3960.,kind='impulse',frame='alpha-relative-prograde',delta_v=13.79710440710187),
              dict(t=80040.,kind='impulse',frame='inertial',delta_v=[0.,0.,1.])]
    rings=json.loads((HERE/'ring.json').read_text())
    grid=json.loads((HERE/'grid.json').read_text())
    outside=max((q for q in grid if q['exit'] and q['exit']['beta_peri_m']>=2.6e6), key=lambda q:q['exit']['speed'])
    otr,os=route(outside['main_dv'],outside['burn_time'],end=160*3600)
    baseline,loads,buses=baseline_loads()
    p=json.loads((HERE/'power.json').read_text())
    death=p[0]['events']['death_t']
    ids=tr[0]<death
    death_trace=(np.r_[tr[0][ids],death],
                 np.vstack((tr[1][ids],[np.interp(death,tr[0],tr[1][:,i]) for i in range(3)])),
                 np.vstack((tr[2][ids],[np.interp(death,tr[0],tr[2][:,i]) for i in range(3)])))
    value=dict(schema='s21-v1', units='SI; exposure in fictional lattice-unit seconds',
               frame='barycentric inertial; co-rotating cloud azimuth from Alpha-to-Beta axis',
               law=dict(exponent=2.5,reference_radius=1e6,gm=[1e10,2.5e9],separation=4e6,radii=[250000,160000]),
               rock_fixture=rings['initial_rocks'][0],hull_enclosing_radius=20.,
               power_fixture=dict(loads=loads,source_bus_W=buses.tolist(),temperature_K=295.,
                                  hydrogen_kg=6.,oxygen_kg=48.,battery_each_J=28.8e6,
                                  caveat='Reduced electrical fixture; no thermal, attitude or sensor solver'),
               vectors={
                   'power-death':vector(death_trace,dict(outcome='power-loss',loss_t=death),commands,dict(power=p[0],outcome='power-loss before exit')),
                   'informed-arrays':vector(tr,s,commands,dict(power=p[2],outcome='depart',cloud=cloud_report(tr))),
                   'outside-gate-failure':vector(otr,os,[dict(t=outside['burn_time'],kind='impulse',frame='alpha-relative-prograde',delta_v=outside['main_dv'])],dict(outcome='insufficient exit speed',cloud=cloud_report(otr),rocks='not certified; body-only gate isolation')),
                   'informed-belt-thread':vector(tr,s,commands,dict(outcome='depart',clearance=rings['rows'][1][0],cloud=cloud_report(tr),manual_power=p[3]))},
               tolerances=dict(same_epoch_position_m=10.,same_epoch_velocity_m_s=.002,
                               sampled_gate_time_s=120.,rock_clearance_m=20.,power_event_time_s=60.,energy_J=1000.),
               integration_boundary='Impulses are delivered velocity, not timed throttle. Game adapter must independently show finite thrust/attitude feasibility; do not assert these tolerances for a different control tape.')
    write_or_check('vectors.json',value,check)
    convergence=[]
    for dt in (120.,60.,30.):
        tr1,s1=route(13.79710440710187,lift=1.,dt=dt)
        gap,_=clearance([tr1],[0],dt)
        wtr,ws=route(14.394668,dt=dt)
        convergence.append(dict(dt=dt,summary=s1,clearance=gap[0][0],cloud=cloud_report(tr1),
                                wide_cloud=cloud_report(wtr),power=power(tr1,'stowed',dt=dt/4,compact=True)))
    assert max(q['clearance']['clearance_m'] for q in convergence)-min(q['clearance']['clearance_m'] for q in convergence)<20
    assert all(q['cloud']['raw_exposure']==0 for q in convergence)
    assert all(q['cloud']['sampled_support_clearance_lower_bound_m']>20000 for q in convergence)
    assert os['exit_speed']<40
    # Stronger than just scanning the fixed 1.1 h family: no >=1,100 km
    # qualifying wide route in this declared finite grid survives both PDUs.
    wide=[q for q in grid if q['exit'] and q['exit']['speed']>=50 and q['exit']['beta_peri_m']>=1.1e6]
    assert wide and all(q['exit']['raw_exposure']>150 for q in wide)
    write_or_check('verification.json',dict(convergence=convergence,grid_count=len(grid),
                   wide_gate_candidates=len(wide),wide_surviving_pdus=0,
                   numerical_checks='Swept clearance convergence, cloud-free support margin, electrical/battery ledgers, finite-grid bypass screen'),check)


def assertions():
    cat=json.loads((HERE/'catalogue.json').read_text())
    assert len(cat)==7
    assert all(q['summary']['qualifies'] and q['cloud']['raw_exposure']==0 and q['full_field']['clearance_m']>1000 and q['arrival_rock_surface_gap_m']>60020 for q in cat)
    assert all(p['events']['death_t'] is None and p['reserve_s']>24*3600 for q in cat for p in q['power_by_binary_phase'])
    robust=json.loads((HERE/'robustness.json').read_text())
    assert len(robust['neighborhood'])==9
    for q in robust['neighborhood']+robust['manual_neighborhood']+[robust['finite']]:
        assert q['summary']['qualifies'] and q['clearance']['clearance_m']>1000 and q['cloud']['raw_exposure']==0
    neighborhoods=json.loads((HERE/'catalogue-neighborhoods.json').read_text())
    passing={str(o):sum(q['passes'] for q in neighborhoods if q['offset_deg']==o) for o in range(-15,16,5)}
    assert all(n>=3 for n in passing.values())
    # Energy alone bounds ANY fully dark endurance even if every optional
    # load is removed: active air, cooling, flight CPU and one IMU remain.
    dark_max=(426e6+2*28.8e6*.95)/(2235/.95)+120
    assert dark_max < min(q['summary']['exit_t'] for q in cat)
    for q in json.loads((HERE/'power.json').read_text()):
        assert q['hydrogen_kg']>=0 and min(q['batteries_J'])>=-1e-6
        assert abs(q['ledger_residual_J'])<.01 and abs(q['battery_residual_J'])<.01
    return dict(catalogue_cases=7,solar_phase_cases=28,robust_controls=9,manual_error_controls=9,catalogue_passing_controls=passing,
                finite_thrust_checked=True,fully_dark_upper_bound_s=dark_max,
                scope='Finite catalogue and reduced resource schedules; production model, thermal, input and UI tests remain integration work')


def manifest(check):
    paths=['data/ship-baseline.json','src/content/gravity-range/world.ts',
           'src/content/gravity-range/briefing.ts','src/ship/power/index.ts',
           'tools/studies/s8/core.py','tools/studies/s8/ring.py','tools/studies/s8/pass-table.json',
           'tools/studies/s8/seeds.json','docs/studies/s15/README.md',
           'tools/studies/s21/reference.py']
    write_or_check('inputs.json',dict(source_commit='0b5cc25',
        sources={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in paths},
        runtime='Python standard library + numpy; no downloads',
        independence='Reuses S8 reference RK4 and initial rock distribution; new cloud, electrical, admission and comparison code. Does not import TypeScript.'),check)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--section', choices=['all','passes','power','grid','ring','catalogue','vectors','robustness','neighborhoods'], default='all')
    args = parser.parse_args()
    checks = []
    if args.section in ('all','passes'):
        rows = json.loads((HERE.parent/'s8/pass-table.json').read_text())['rows']
        result = []
        for row in rows:
            tr,s = route(row['burn_m_s'])
            result.append(dict(burn_m_s=row['burn_m_s'], summary=s, cloud=cloud_report(tr)))
        write_or_check('passes.json', result, args.check)
        checks.append('passes')
    tr,s = route(13.79710440710187,lift=1.)
    if args.section in ('all','power'):
        result = [power(tr,p) for p in ('stowed','edge-on','planned','manual')]
        for p in result:
            assert abs(p['ledger_residual_J']) < .01
            assert abs(p['battery_residual_J']) < .01
        assert result[0]['events']['death_t'] < s['exit_t']
        assert result[2]['events']['death_t'] is None and result[3]['events']['death_t'] is None
        write_or_check('power.json',result,args.check)
        checks.append('power')
    if args.section in ('all','grid'):
        grid = route_grid()
        write_or_check('grid.json',grid,args.check)
        checks.append('grid')
    if args.section in ('all','ring'):
        blind,_ = route(13.79710440710187)
        lift_minus,_ = route(13.79710440710187,lift=-1.)
        gaps, initial = clearance([blind,tr,lift_minus],list(range(0,360,30)))
        write_or_check('ring.json',dict(policies=['blind','lift+','lift-'],rows=gaps,
                                       initial_rocks=[dict(phase_deg=i*30,positions=a[0].tolist(),
                                                          velocities=a[1].tolist(),radii=a[2].tolist())
                                                      for i,a in enumerate(initial)]),args.check)
        checks.append('ring')
    if args.section in ('all','catalogue'):
        write_or_check('catalogue.json',adapted_catalogue(),args.check)
        checks.append('catalogue')
    if args.section in ('all','robustness'):
        write_or_check('robustness.json',robustness(),args.check)
        checks.append('robustness')
    if args.section in ('all','neighborhoods'):
        write_or_check('catalogue-neighborhoods.json',catalogue_neighborhoods(),args.check)
        checks.append('neighborhoods')
    if args.section in ('all','vectors'):
        vectors_and_checks(args.check)
        checks.append('vectors')
    if args.section=='all':
        write_or_check('acceptance.json',assertions(),args.check)
    manifest(args.check)
    print(('Verified' if args.check else 'Generated')+': '+', '.join(checks), flush=True)


if __name__ == '__main__':
    main()
