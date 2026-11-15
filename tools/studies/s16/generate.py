"""Run: python -B tools/studies/s16/generate.py [--check]. No installs.

Writes deterministic JSON beside this file. --check reruns every assertion and
compares bytes, without writing. The catalogue is finite, not a Monte Carlo
claim that every arbitrary incoming ship state is safe.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import numpy as np
from reference import (ACCEL_BOUND, CENTERS, CORE, EXIT_RADIUS, EXIT_X, FORCE,
                       HULL, INNER, MASS, OUTER, VE, Rng, advance, burn,
                       certificate, fly, initial, norm, pack, proposal, transform,
                       weight)

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]


def warning(s0, centers, step=1., keep_samples=True):
    commands = [burn(600,30,[-1,0,0])]
    wrong = fly(s0,commands,centers,step=step)
    forecast = fly(s0,commands,centers,step=step,ordinary=True,end=wrong['t_s'],exit_enabled=False)
    # Sample times agree up to the final, localized contact sample.
    by_time = {round(s['t_s'],7):s for s in forecast['samples']}
    first, comparisons = None, []
    for actual in wrong['samples']:
        predicted = by_time.get(round(actual['t_s'],7))
        if predicted is None:
            continue
        residual = norm(np.array(actual['position_m'])-predicted['position_m'])
        threshold = max(1000., .01*norm(actual['position_m']))
        record = {'t_s':actual['t_s'], 'residual_m':residual,
                  'threshold_m':threshold, 'actual':actual, 'ordinary_forecast':predicted}
        if 600 <= actual['t_s'] <= 750:
            comparisons.append(record)
        if first is None and residual >= threshold:
            first = record
    assert first is not None
    rescue_start = first['t_s']+240.
    rescue = fly(s0,[*commands,burn(rescue_start,16,[0,0,1])],centers,
                 step=step,samples=keep_samples)
    # An immediate cutoff would help; this pessimistically finishes the mistaken
    # 30 s burn before the warning, then budgets a full 240 s quarter-turn.
    result = {'commanded_old_belief':commands, 'warning':first,
              'contact_t_s':wrong['t_s'] if wrong['outcome']=='contact' else None,
              'lead_s':wrong['t_s']-first['t_s'], 'wrong_outcome':wrong['outcome'],
              'rescue':rescue, 'comparisons':comparisons}
    if keep_samples:
        result['uncorrected'] = wrong
        result['frozen_ordinary_forecast'] = forecast
    return result


def law_vectors():
    x = np.array([6000.,8000.,24000.])
    f = np.array([16000.,-4000.,6000.])
    e = x/norm(x)
    actual = transform(x,f)
    assert abs(np.dot(actual,e)+np.dot(f,e)) < 1e-10
    assert norm((actual-np.dot(actual,e)*e)-(f-np.dot(f,e)*e)) < 1e-10
    tangent1=np.cross(e,[1.,0.,0.])
    tangent1/=norm(tangent1)
    tangent2=np.cross(e,tangent1)
    for tangent in (tangent1,tangent2):
        assert norm(transform(x,tangent)-tangent)<1e-14
    assert norm(transform(x,e)+e)<1e-14
    assert norm(transform(x,np.zeros(3)))==0
    axis = np.array([1.,0.,0.])
    assert np.array_equal(transform(45000*axis,f),np.array([0.,-4000.,6000.]))
    assert np.array_equal(transform(50000*axis,f),f)
    for r in (0,500,1000):
        try:
            transform(r*axis,f)
        except ValueError:
            pass
        else:
            raise AssertionError('core accepted')
    return {'position_m':x.tolist(), 'mass_kg':MASS, 'nominal_force_N':f.tolist(),
            'modified_force_N':actual.tolist(), 'radial_before_N':float(np.dot(f,e)),
            'radial_after_N':float(np.dot(actual,e)),
            'added_torque_N_m':[0.,0.,0.],
            'shells':[{'radius_m':r,'weight':weight(r),'radial_gain':1-2*weight(r)}
                      for r in (40000.,42500.,45000.,47500.,50000.)]}


def boundary():
    s0 = np.array([-39000.,0.,0.,-150.,0.,0.,MASS])
    commands = [burn(0,100,[-1,0,0])]
    ref = fly(s0,commands,step=1/32,end=100,exit_enabled=False)
    fine = fly(s0,commands,step=1/64,end=100,exit_enabled=False,samples=False)
    dp = norm(np.array(ref['final']['position_m'])-fine['final']['position_m'])
    dv = norm(np.array(ref['final']['velocity_m_s'])-fine['final']['velocity_m_s'])
    assert dp < 1e-7 and dv < 1e-9
    convergence = []
    for h in (1.,.5,.25,.125,.0625):
        case = fly(s0,commands,step=h,end=100,method='midpoint',exit_enabled=False,samples=False)
        convergence.append({'step_s':h,
            'position_error_m':norm(np.array(case['final']['position_m'])-ref['final']['position_m']),
            'velocity_error_m_s':norm(np.array(case['final']['velocity_m_s'])-ref['final']['velocity_m_s'])})
    ratios = [a['position_error_m']/b['position_error_m'] for a,b in zip(convergence,convergence[1:])]
    assert all(3.8<r<4.2 for r in ratios)
    assert [e['surface'] for e in ref['events']]==['inner','zero-gain','outer']
    assert abs(ref['propellant_kg']-100*FORCE/VE)<1e-6
    # Thin this vector for a readable port; integration itself stays 1/32 s.
    ref['samples'] = [s for s in ref['samples'] if abs(s['t_s']%10)<1e-8]
    return {'reference':ref,'self_check':{'position_m':dp,'velocity_m_s':dv},
            'midpoint_convergence':convergence,'halving_ratios':ratios,
            'port_tolerances':{'position_m':.01,'velocity_m_s':1e-5,
                               'mass_kg':1e-6,'event_time_s':.001}}


def outside_bypass():
    # Counterexample to a global fuel-only claim from the earlier observation
    # skirt. Three impulses are only a cost estimate; polyline misses each well.
    waypoints = np.array([[-100000.,0.,0.],[-100000.,180000.,0.],
                          [330000.,180000.,0.],[330000.,0.,0.]])
    from reference import segment_minimum
    clearance = np.full(3,np.inf)
    for a,b in zip(waypoints,waypoints[1:]):
        clearance = np.minimum(clearance,segment_minimum(a,b,CENTERS)-OUTER)
    # Stop the incoming 35 m/s; travel very slowly in the exterior; arrive 35
    # m/s prograde. Finite slow turns can fit in this wide-open exterior skirt.
    dv = 35+1+math.sqrt(2)+math.sqrt(2)+1+35
    return {'waypoints_m':waypoints.tolist(),'polyline_influence_clearance_m':clearance.tolist(),
            'impulsive_cost_m_s':dv,'main_equivalent_kg':MASS*(1-math.exp(-dv/VE)),
            'limitation':'Exterior counterexample cost, not a finite-attitude flight certificate.'}


def finite_outside_bypass():
    """Finite-thrust counterexample from the upstream skirt. Stop, turn, slow
    exterior legs, then restore incoming speed. No distance-as-fuel shortcut.
    Plans turns as 480 s engine-off slots; actual RCS cost remains an allowance.
    """
    s0=np.array([-100000.,0.,0.,35.,0.,0.,MASS])
    s,t,commands=s0.copy(),0.,[]
    def coast(dt):
        nonlocal s,t
        s[:3]+=s[3:6]*dt
        t+=dt
    def fire(dv,direction):
        nonlocal s,t
        duration=s[6]*VE/FORCE*(-math.expm1(-dv/VE))
        c=burn(t,duration,direction)
        commands.append(c)
        # Exact ordinary finite-burn formula for planning only. Verification
        # below uses independent RK4 and the actual well response.
        mdot=FORCE/VE
        mf=s[6]-mdot*duration
        displacement=VE*(duration+mf/mdot*math.log(mf/s[6]))
        d=np.asarray(direction)/norm(direction)
        s[:3]+=s[3:6]*duration+displacement*d
        s[3:6]+=dv*d
        s[6]=mf
        t+=duration
    fire(35,[-1,0,0])
    waypoints=[[float(s[0]),180000.,0.],[330000.,180000.,0.],[330000.,0.,0.]]
    for target in waypoints:
        coast(480.)
        target=np.array(target)
        direction=(target-s[:3])/norm(target-s[:3])
        fire(1,direction)
        # The two turns (after accel and before braking) are coast travel too.
        mdot=FORCE/VE
        duration=s[6]*VE/FORCE*(-math.expm1(-1/VE))
        mf=s[6]-mdot*duration
        brake_travel=duration-VE*(duration+mf/mdot*math.log(mf/s[6]))
        remaining=norm(target-s[:3])-brake_travel
        assert remaining>480.
        coast(remaining)
        fire(1,-direction)
        assert norm(s[:3]-target)<1e-5
    coast(480.)
    fire(35,[1,0,0])
    result=fly(s0,commands,step=.25,end=t,exit_enabled=False,samples=False)
    assert result['outcome']=='timeout' and result['influences_met']==[]
    assert result['propellant_kg']<730
    assert norm(np.array(result['final']['position_m'])-s[:3])<.01
    assert result['final']['position_m'][0]>EXIT_X
    assert norm(result['final']['position_m'][1:])<1
    result['description']='Completed exterior plan; timeout means requested integration endpoint.'
    result['analytic_final']=pack(s)
    result['turn_allowance_s']=480.
    return result


def catalogue():
    rows, rejects = [], Counter()
    weakest = {'clearance_m':1e100, 'rescue_clearance_m':1e100,
               'warning_lead_s':1e100, 'forced_penetration_m':1e100}
    route_count = 0
    for seed in range(16000,16128):
        s0, centers, rotation = proposal(seed)
        cert = certificate(s0)
        pair_gap = min(norm(a-b)-2*OUTER for i,a in enumerate(centers) for b in centers[i+1:])
        reason = None
        if pair_gap < 10000:
            reason = 'influence-gap'
        elif not cert['certified']:
            reason = 'unavoidable-certificate'
        results = []
        if reason is None:
            # Two signs and a 3x3 timing/duration neighborhood, not a single
            # exact saved maneuver. Continuous ranges between samples unproved.
            for sign in (-1,1):
                for start in (560,600,640):
                    for duration in (6,8,10):
                        result = fly(s0,[burn(start,duration,[0,0,sign])],centers,samples=False)
                        results.append(result)
                        route_count += 1
            if not all(r['outcome']=='exit' and min(r['minimum_core_clearance_m'])>=2000
                       for r in results):
                reason = 'two-route-neighborhood'
        warn = None
        if reason is None:
            warn = warning(s0,centers,keep_samples=False)
            if (warn['wrong_outcome']!='contact' or warn['lead_s']<360 or
                warn['rescue']['outcome']!='exit' or
                min(warn['rescue']['minimum_core_clearance_m'])<500):
                reason = 'warning-or-rescue'
        row = {'seed':seed,'admitted':reason is None,'reason':reason,
               'initial':pack(s0),'centers_m':centers.tolist(),
               'garden_to_encounter_rotation':rotation.tolist(),
               'certificate':cert,'minimum_influence_gap_m':pair_gap}
        # Safe initial and preparation window for every raw proposal, even
        # those rejected for another reason. Straight coast minima are exact.
        from reference import segment_minimum
        prepare_clear=float(min(segment_minimum(s0[:3],s0[:3]+560*s0[3:6],centers))-CORE-HULL)
        assert prepare_clear>25000
        row['preparation_coast_clearance_m']=prepare_clear
        if reason is not None:
            rejects[reason]+=1
            if results:
                row['failed_control']=min(results,key=lambda r:min(r['minimum_core_clearance_m']))
        else:
            clear = min(min(r['minimum_core_clearance_m']) for r in results)
            rescue_clear = min(warn['rescue']['minimum_core_clearance_m'])
            row.update(route_count=len(results), minimum_route_clearance_m=clear,
                maximum_route_main_kg=max(r['propellant_kg'] for r in results),
                warning_t_s=warn['warning']['t_s'], warning_lead_s=warn['lead_s'],
                rescue_main_kg=warn['rescue']['propellant_kg'], rescue_clearance_m=rescue_clear)
            weakest['clearance_m']=min(weakest['clearance_m'],clear)
            weakest['rescue_clearance_m']=min(weakest['rescue_clearance_m'],rescue_clear)
            weakest['warning_lead_s']=min(weakest['warning_lead_s'],warn['lead_s'])
            weakest['forced_penetration_m']=min(weakest['forced_penetration_m'],cert['forced_penetration_m'])
        rows.append(row)
    accepted = sum(r['admitted'] for r in rows)
    assert accepted>=10, accepted
    return {'distribution':'128 fixed proposals: integer seeds 16000..16127, named sfc32 stream s16.geometry.v1',
            'proposal_count':len(rows),'accepted':accepted,'rejected':len(rows)-accepted,
            'rejection_fraction':(len(rows)-accepted)/len(rows),
            'first_failure_counts':dict(sorted(rejects.items())),
            'tested_route_controls':route_count,'accepted_worst_cases':weakest,'candidates':rows}


def build():
    baseline = json.loads((ROOT/'data/ship-baseline.json').read_text(encoding='utf-8'))
    assert baseline['ship']['initialWetMass']==MASS
    assert baseline['propulsion']['main']['thrust']==FORCE
    assert baseline['propulsion']['main']['Isp']*baseline['constants']['g0']['value']==VE
    assert len(baseline['propulsion']['rcs']['jets'])==40
    assert baseline['ship']['dryMass']==24000
    rng=Rng('seed:16000\0s16.geometry.v1')
    rng_expected=[3744950808,718765878,1072496303,3010543048,3621254057,337399829]
    assert [round(rng.next()*4294967296) for _ in rng_expected]==rng_expected
    s0 = initial()
    routes = [fly(s0,[burn(600,8,[0,0,sign])]) for sign in (-1,1)]
    route_convergence=[]
    for route in routes:
        assert route['outcome']=='exit' and min(route['minimum_core_clearance_m'])>4000
        assert route['propellant_kg']<62
        fine=fly(s0,route['commands'],step=.125,samples=False)
        dp=norm(np.array(fine['final']['position_m'])-route['final']['position_m'])
        dv=norm(np.array(fine['final']['velocity_m_s'])-route['final']['velocity_m_s'])
        assert dp<.01 and dv<1e-6
        route_convergence.append({'position_difference_m':dp,'velocity_difference_m_s':dv,
                                  'coarse_step_s':1.,'fine_step_s':.125})
    warn = warning(s0,CENTERS)
    assert warn['wrong_outcome']=='contact' and warn['lead_s']>400
    assert warn['rescue']['outcome']=='exit'
    assert min(warn['rescue']['minimum_core_clearance_m'])>1400
    # Coast invariance, plus actual dynamics rotated into a non-planar frame.
    coast = fly(initial(y=10000,z=6000),[],ordinary=False,samples=False)
    assert coast==fly(initial(y=10000,z=6000),[],ordinary=True,samples=False)
    _,_,q = proposal(16000)
    state = np.array([-35000.,6000.,4000.,35.,0.,0.,MASS])
    rotated = np.r_[q@state[:3],q@state[3:6],state[6]]
    f = np.array([12000.,16000.,8000.])
    for _ in range(160):
        state=advance(state,.125,f)
        rotated=advance(rotated,.125,q@f,CENTERS@q.T)
    rotation_error = norm(q@state[:3]-rotated[:3])
    assert rotation_error<1e-7 and norm(q@state[3:6]-rotated[3:6])<1e-9
    # Arrival-mass/authority sensitivity. Fixed duration stays feasible; mass is
    # carried, never reset. Power/thermal/attitude still need the session harness.
    inherited=[]
    for mass in (25000.,27500.,MASS):
        for sign in (-1,1):
            r=fly(initial(mass=mass),[burn(600,8,[0,0,sign])],samples=False)
            assert r['outcome']=='exit' and min(r['minimum_core_clearance_m'])>4000
            inherited.append(r)
    cat = catalogue()
    rejected = next(r for r in cat['candidates'] if not r['admitted'])
    initial_contact_rejected = False
    bad = initial()
    bad[:3] = [1005.,0.,0.]
    try:
        fly(bad,[],samples=False)
    except ValueError as error:
        initial_contact_rejected = str(error)=='initial whole-ship contact'
    assert initial_contact_rejected
    # Full-load overestimate includes the optional ion engine. This is an
    # impulse budget, not a promise that its tiny thrust is useful in time.
    fuel_upper = sum(p['initialMass']*p['Isp']*9.80665/24000.
                     for p in baseline['propellant'])
    # A small projected influence touch is not guaranteed to reveal the rule.
    # The certificate proves influence entry; an old-belief powered example
    # separately proves a large discrepancy. Never conflate these statements.
    return {'vectors.json':{'schema':'recursion.s16.v1','units':'SI',
        'labels':{'law':'FICTIONAL','layout_ratings':'ASSUMED','numbers':'DEMONSTRATED by this independent reference'},
        'source_baseline_sha256':hashlib.sha256((ROOT/'data/ship-baseline.json').read_bytes()).hexdigest(),
        'layout':{'centers_m':CENTERS.tolist(),'core_m':CORE,'inner_m':INNER,'outer_m':OUTER,
                  'hull_bound_m':HULL,'gravity_sources':[],'shared_reference_radius_m':1000000.,
                  'arrival':pack(s0),'exit':{'x_m':EXIT_X,'disc_radius_m':EXIT_RADIUS,'outbound':True}},
        'projection':law_vectors(),'edge_band':boundary(),
        'unavoidability':certificate(s0),'informed_crossings':routes,
        'informed_convergence':route_convergence,
        'full_load_propulsive_integral_upper_bound_m_s':fuel_upper,
        'initial_contact_rejection':{'state':pack(bad),'rejected':initial_contact_rejected},
        'old_belief':warn,'inherited_mass_crossings':inherited,
        'coast_field_identity':True,'rotational_position_error_m':rotation_error,
        'outside_bypass':outside_bypass(),'finite_outside_bypass':finite_outside_bypass(),
        'rng_first_uint32':rng_expected,'rejected_seed':rejected,
        'port_tolerances':{'route_position_m':.1,'route_velocity_m_s':.001,'mass_kg':1e-6,
                           'coast_event_time_s':.01,'force_N':1e-8}},
        'seeds.json':cat}


def main():
    if not __debug__:
        raise SystemExit('Assertions required; do not use -O.')
    parser=argparse.ArgumentParser()
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    results=build()
    for name,value in results.items():
        text=json.dumps(value,indent=2,sort_keys=True,allow_nan=False)+'\n'
        path=HERE/name
        if args.check:
            if not path.exists() or path.read_text(encoding='utf-8')!=text:
                raise SystemExit(f'{name}: missing or different; regenerate')
        else:
            path.write_text(text,encoding='utf-8',newline='\n')
    cat=results['seeds.json']
    print(f"S16: all assertions passed; {cat['accepted']}/{cat['proposal_count']} seeds admitted; "
          f"{cat['tested_route_controls']} route controls checked; "
          + ('JSON bytes match.' if args.check else 'JSON written.'))
    print(json.dumps({'rejections':cat['first_failure_counts'],
                      'accepted_worst_cases':cat['accepted_worst_cases']},sort_keys=True))


if __name__=='__main__':
    main()
