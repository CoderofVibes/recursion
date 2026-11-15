"""S8 geometry screening, low-orbit conflict, and readable wrong-law vector.

Author-side search only; these controls must never become a player-side planner.
Only standard library and numpy. The output describes a finite tested catalogue,
not a proof for every point between its samples.
"""
from __future__ import annotations
import argparse
import json
import math
from pathlib import Path
import numpy as np
from core import (R0, GM, RADII, OMEGA, HULL, MASS, arrival, bodies,
                  rk4, integrate, prograde, fly, summary, norm, fuel)


def batch(cases, dt=120.0, end=360000.0, initial=None, start=0.0):
    """Fly all scalar (relative_bearing_deg,burn_time,dv) controls in parallel."""
    cases=np.asarray(cases,float)
    bearings=np.pi+np.deg2rad(cases[:,0])
    x,v=arrival(bearings) if initial is None else tuple(
        np.tile(np.asarray(z),(len(cases),1)) for z in initial)
    active=np.ones(len(cases),bool)
    fired=np.zeros(len(cases),bool)
    exited=np.zeros(len(cases),bool)
    minimum=np.full((len(cases),2),np.inf)
    peri_t=np.zeros(len(cases))
    exit_speed=np.zeros(len(cases))
    exit_time=np.zeros(len(cases))
    for t in np.arange(start,end+dt/2,dt):
        bp,bv=bodies(t)
        distances=norm(x[:,None,:]-bp)
        live=active&~exited
        changed=(distances[:,1]<minimum[:,1])&live
        peri_t[changed]=t
        minimum[live]=np.minimum(minimum[live],distances[live])
        active[live] &= np.all(distances[live]>RADII+HULL,axis=1)
        leaving=(norm(x)>=9e6)&(np.sum(x*v,axis=1)>0)&live&active
        exit_speed[leaving]=norm(v[leaving])
        exit_time[leaving]=t
        exited |= leaving
        firing=(cases[:,1]<=t)&~fired&live&active
        if firing.any():
            v[firing]+=cases[firing,2,None]*prograde(t,v[firing])
            fired[firing]=True
        # Freeze first-contact / first-exit states. A post-contact mathematical
        # continuation must never turn a loss into an escape certificate.
        if t<end:
            xn,vn=rk4(t,x,v,dt)
            moving=active&~exited
            x[moving],v[moving]=xn[moving],vn[moving]
    return [dict(bearing_offset_deg=float(c[0]), burn_time=float(c[1]),
                 main_delta_v=float(c[2]), beta_peri_m=float(m[1]),
                 beta_peri_t=float(p), alpha_min_m=float(m[0]),
                 exit_t=float(et) if e else None,
                 exit_speed=float(s) if e else None,
                 survives_bodies=bool(a),
                 qualifies=bool(a and e and s>=50 and c[2]<=16))
            for c,m,p,et,e,s,a in zip(cases,minimum,peri_t,exit_time,exited,exit_speed,active)]


def seed_catalogue():
    # 13 actual relative geometries. Common rotation does not change dynamics.
    offsets=np.arange(-30,31,5)
    cases=[]
    for off in offsets:
        nominal=3960-math.radians(float(off))/(1e-4-OMEGA)
        center=120*round(nominal/120)
        for delay in range(-720,721,240):
            bt=center+delay
            if bt<600:
                continue
            for dv in [13.4,13.6,13.8,14.0,14.2,14.4,14.6]:
                cases.append((off,bt,dv))
    scanned=batch(cases)
    chosen=[]
    for off in offsets:
        eligible=[x for x in scanned if x['bearing_offset_deg']==off
                  and x['qualifies'] and x['exit_speed']>=60
                  and 900000<x['beta_peri_m']<1100000 and x['main_delta_v']<=14.6]
        if not eligible:
            chosen.append(dict(bearing_offset_deg=int(off), admitted=False,
                               reason='No candidate in declared finite control search'))
            continue
        choice=min(eligible,key=lambda x:abs(x['beta_peri_m']-980000))
        choice=choice.copy()
        chosen.append(choice)
    # Independent timing/magnitude perturbations, nine combinations per geometry.
    tested=[x for x in chosen if 'burn_time' in x]
    controls=[(c['bearing_offset_deg'],c['burn_time']+ds,c['main_delta_v']+dv)
              for c in tested for ds in [-120,0,120] for dv in [-0.1,0,0.1]]
    all_checks=batch(controls,dt=30)
    for index,choice in enumerate(tested):
        checks=all_checks[index*9:index*9+9]
        robust=all(x['qualifies'] for x in checks)
        choice.update(admitted=robust, robustness=checks,
                      reason='Nine timing/magnitude controls pass' if robust else 'Perturbation failure')
    return dict(offset_grid_deg=offsets.tolist(), control_count=len(cases),
                qualifying_controls=sum(x['qualifies'] for x in scanned),
                candidates=chosen, rejected=sum(not x['admitted'] for x in chosen),
                denominator=len(chosen), all_controls=scanned)


def wrong_law(bearing=math.pi, dt=10.0):
    """Newton's circular-to-300-km transfer impulse, flown in the true law.

    Both predictions use the measured circular binary ephemeris, isolating the
    ship's distance-law error rather than adding an error in Beta's ephemeris.
    """
    dv=100-math.sqrt(GM[0]*(2/R0-2/(R0+300000)))
    initial=arrival(bearing)
    bx,bv=integrate(*initial,0,600,dt)
    kick=-dv*prograde(600,bv)
    # One recorded inertial command, identical in the two law integrations.
    truth=fly(0,600,end=45000,dt=dt,bearing=bearing,kicks=[(600,kick)])
    prediction=fly(0,600,end=45000,dt=dt,bearing=bearing,exponent=2,kicks=[(600,kick)])
    t,x,v=truth
    bp,_=bodies(t)
    distances=norm(x[:,None,:]-bp)
    hit=np.flatnonzero(np.any(distances<=RADII+HULL,axis=1))
    end=int(hit[0]) if len(hit) else len(t)-1
    contact_bracket=None
    if len(hit):
        left,right=float(t[end-1]),float(t[end])
        contact_bracket=[left,right]
        for _ in range(35):
            mid=(left+right)/2
            mx,mv=integrate(x[end-1],v[end-1],float(t[end-1]),mid,dt)
            mbp,_=bodies(mid)
            if np.any(norm(mx-mbp)<=RADII+HULL):
                right=mid
            else:
                left=mid
        contact=(left+right)/2
        tx,tv=integrate(x[end-1],v[end-1],float(t[end-1]),contact,dt)
        fx,fv=integrate(prediction[1][end-1],prediction[2][end-1],float(t[end-1]),contact,dt,exponent=2)
        t[end]=contact;x[end]=tx;v[end]=tv
        prediction[1][end]=fx;prediction[2][end]=fv
        cbp,_=bodies(contact)
        distances[end]=norm(tx-cbp)
    discrepancy=norm(x-prediction[1])
    # An explicit visibility proxy, not an implemented estimator covariance.
    # 10 km absolute, and 5 times the range-per-fix sigma = .002*r.
    threshold=np.maximum(10000,5*.002*distances[:,0])
    warning=np.flatnonzero(discrepancy[:end+1]>threshold[:end+1])
    first=int(warning[0]) if len(warning) else None
    abort=None
    if first is not None:
        abort_dv=40.0
        ats,axs,avs=integrate(x[first],v[first]+abort_dv*prograde(t[first],v[first]),
                              float(t[first]),45000,dt,sample=True)
        abp,_=bodies(ats)
        abort=dict(delta_v=abort_dv,alpha_min_m=float(norm(axs-abp[:,0]).min()))
    sample_indices=sorted(set([0,int(np.argmin(abs(t-600))),end-1,end]+list(range(0,end,300))+([] if first is None else [first])))
    samples=[]
    for i in sample_indices:
        if i>end:
            continue
        samples.append(dict(t=float(t[i]), position=x[i].tolist(),velocity=v[i].tolist(),
                            forecast_position=prediction[1][i].tolist(),
                            forecast_velocity=prediction[2][i].tolist(),
                            alpha_range=float(distances[i,0]),
                            separation=float(discrepancy[i])))
    return dict(bearing_deg=math.degrees(bearing),retrograde_delta_v=dv,
                initial=dict(position=initial[0].tolist(),velocity=initial[1].tolist()),
                commands=[dict(t=600,delta_v_vector=kick.tolist())],
                hit_t=float(t[end]) if len(hit) else None,
                contact_bracket=contact_bracket,contact_time_tolerance=0.01,
                warning_t=None if first is None else float(t[first]),
                warning_alpha_range=None if first is None else float(distances[first,0]),
                warning_position_error=None if first is None else float(discrepancy[first]),
                lead_seconds=None if first is None else float(t[end]-t[first]),
                abort_at_warning=abort,
                warning_threshold='max(10000m, 5*0.002*true Alpha range)',
                samples=samples)


def low_orbit():
    """Two-impulse 500-km circularization, actually propagated with both bodies."""
    rp=500000.; ra=R0; k=GM[0]*math.sqrt(R0)
    va=math.sqrt(2*k/1.5*(rp**-1.5-ra**-1.5)/(ra**2/rp**2-1))
    first=100-va
    t,x,v=fly(-first,600,end=30000,dt=10)
    bp,bv=bodies(t)
    distance=norm(x-bp[:,0])
    idx=int(np.argmin(distance))
    r=x[idx]-bp[idx,0]
    tangent=np.array([-r[1],r[0],0])/norm(r)
    vc=math.sqrt(k/norm(r)**1.5)
    final_v=bv[idx,0]+tangent*vc
    second=float(norm(final_v-v[idx]))
    period=2*math.pi*norm(r)/vc
    ts,xs,vs=integrate(x[idx],final_v,float(t[idx]),float(t[idx]+period*1.05),10,sample=True)
    bps,_=bodies(ts)
    ranges=norm(xs-bps[:,0])
    rel=xs-bps[:,0]
    az=np.unwrap(np.arctan2(rel[:,1],rel[:,0]))
    crossed=np.flatnonzero(az-az[0]>=2*math.pi)
    finish=int(crossed[0])
    return dict(first_burn_t=600,first_retrograde_delta_v=first,
                circularize_t=float(t[idx]), circularize_radius=float(norm(r)),
                circularize_delta_v=second,circularize_vector=(final_v-v[idx]).tolist(),
                one_turn_t=float(ts[finish]),band_min=float(ranges[:finish+1].min()),
                band_max=float(ranges[:finish+1].max()),total_delta_v=first+second,
                main_kg=fuel(first+second), remaining_main_kg=6000-fuel(first+second),
                depart_budget_excess=first+second-16,
                state_at_turn=dict(t=float(ts[finish]),position=xs[finish].tolist(),velocity=vs[finish].tolist()))


def after_low_orbit(low):
    state=low['state_at_turn']
    controls=[(0,state['t']+delay,dv) for delay in range(0,18601,600)
              for dv in np.arange(18,36.1,1)]
    runs=batch(controls,dt=60,end=state['t']+540000,
               initial=(state['position'],state['velocity']),start=state['t'])
    successes=[r for r in runs if r['survives_bodies'] and r['exit_speed'] is not None
               and r['exit_speed']>=55 and 800000<r['beta_peri_m']<1400000]
    if not successes:
        return dict(controls=len(runs),success_count=0)
    selected=min(successes,key=lambda r:(r['main_delta_v'],abs(r['beta_peri_m']-980000)))
    selected=selected.copy()
    selected.update(cumulative_delta_v=low['total_delta_v']+selected['main_delta_v'],
                    cumulative_main_kg=fuel(low['total_delta_v']+selected['main_delta_v']),
                    remaining_main_kg=6000-fuel(low['total_delta_v']+selected['main_delta_v']),
                    accepted_by_committed_depart=False)
    trace=low_then_exit_trace(low,dt=10)
    result=summary(trace,delta_v=low['total_delta_v']+24)
    result.update(main_delta_v=24,burn_time=50590,
                  cumulative_delta_v=low['total_delta_v']+24,
                  remaining_main_kg=6000-fuel(low['total_delta_v']+24))
    indices=list(range(0,len(trace[0]),360))+[len(trace[0])-1]
    result['samples']=[dict(t=float(trace[0][i]),position=trace[1][i].tolist(),
                            velocity=trace[2][i].tolist()) for i in indices]
    return dict(controls=len(runs),success_count=len(successes),selected=selected,
                ring_band_refined=result)


def low_then_exit_trace(low=None,dt=30,lift=0.0):
    """Optional science-then-assist witness, over the committed 16 m/s budget."""
    low=low_orbit() if low is None else low
    # The low-orbit circularization vector is specified, not recomputed from
    # the sampled state, so refinements reproduce the same controls.
    main_time=50590.
    lift_time=144490.-28800
    x,v=arrival()
    events=[(600.,'prograde',-low['first_retrograde_delta_v']),
            (low['circularize_t'],'vector',low['circularize_vector']),
            (main_time,'prograde',24.),(lift_time,'vector',[0,0,lift]),
            (300000.,'end',0)]
    times=[]; positions=[]; velocities=[]; t=0.
    for stop,kind,value in events:
        ts,xs,vs=integrate(x,v,t,stop,dt,sample=True)
        times.extend(ts[:-1]);positions.extend(xs[:-1]);velocities.extend(vs[:-1])
        t=stop;x=xs[-1];v=vs[-1]
        if kind=='prograde':
            v+=value*prograde(t,v)
        elif kind=='vector':
            v+=np.asarray(value)
    times.append(t);positions.append(x);velocities.append(v)
    return np.asarray(times),np.asarray(positions),np.asarray(velocities)


def generate():
    catalogue=seed_catalogue()
    low=low_orbit()
    wrong=[wrong_law(math.pi+math.radians(d),dt=30) for d in range(-15,16,5)]
    rx,rv=arrival(math.radians(205))
    data=dict(schema='s8-seeds-v1',low_orbit=low,after_low_orbit=after_low_orbit(low),
                wrong_law=wrong_law(),
                wrong_law_geometry_grid=[{k:v for k,v in w.items() if k!='samples'} for w in wrong],
                catalogue=catalogue,
                rejected_seed=dict(id='s8-rejected-delta-plus25',binary_phase_deg=0,
                    arrival_bearing_deg=205,relative_arrival_offset_deg=25,ring_phase_deg=0,
                    initial=dict(position=rx.tolist(),velocity=rv.tolist()),
                    reason='Outside proposed +/-15 degree pilot corridor; no control at t>=600 s in declared first-opportunity search',
                    physical_impossibility_claim=False),
                combined_low_orbit_and_depart_certified=0,
                scope='Impulsive truth mechanics. No claim of game, sensor, or systems certification.')
    assert 450000<low['band_min']<=low['band_max']<550000
    assert low['total_delta_v']>16 and low['remaining_main_kg']>5600
    assert data['wrong_law']['lead_seconds']>3600
    assert abs(data['wrong_law']['samples'][-1]['alpha_range']-RADII[0]-HULL)<0.01
    assert data['wrong_law']['abort_at_warning']['alpha_min_m']>350000
    assert all(c['admitted'] for c in catalogue['candidates'] if abs(c['bearing_offset_deg'])<=15)
    assert not data['after_low_orbit']['ring_band_refined']['qualifies']
    return data


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    path=Path(__file__).with_suffix('.json')
    text=json.dumps(generate(),indent=2,allow_nan=False)+'\n'
    if args.check:
        assert path.read_text()==text, 'seed reference differs; regenerate and inspect'
        print('seeds.json reproduced')
    else:
        path.write_text(text)
        data=json.loads(text)
        print('wrote seeds.json; low-orbit delta-v:',data['low_orbit']['total_delta_v'])
        print('wrong-law warning/contact:',data['wrong_law']['warning_t'],data['wrong_law']['hit_t'])
        print('candidate rejections:',data['catalogue']['rejected'],'/',data['catalogue']['denominator'])
