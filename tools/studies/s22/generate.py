"""python -B tools/studies/s22/generate.py [--check]

Rebuild deterministic independent vectors, catalogue and geometry. No installs.
"""
from __future__ import annotations
import argparse
from collections import Counter
from dataclasses import replace
import hashlib
import json
import math
from pathlib import Path

from reference import (AMAX, BOUND, CAP, CELL, EDGE, EXIT, FORCE, GMAX, GMIN,
    HULL, LENGTH, MASS, MOUTH, OFFSET, PITCH, THROAT, VE, ZERO, Field, Funnel,
    Rng, activation_attempt, activation_guard, add, advance, burn, dot, effect,
    fly, make_field, mul, norm, pack, pair_gap, placement, random_axis, segment_distance,
    shape, smooth, sub, unit)

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
S0=(10000.,0.,0.,35.,0.,0.,MASS)
ONE=Field([Funnel(0,(OFFSET,0.,0.),(1.,0.,0.))])


def compact(result):
    out={k:v for k,v in result.items() if k!='samples'}
    births=[e for e in out.get('events',[]) if e['event']=='birth']
    if births:
        # Keep complete wave tapes in the two nominal vectors. Catalogue
        # certificates need counts/minimum guard plus all exceptional events,
        # not 650 repeated successful birth records for every control.
        out['birth_certificate']={'activated_count':len(births),
                                  'minimum_reachable_clearance_m':min(e['reachable_clearance_m'] for e in births)}
        out['events']=[e for e in out['events'] if e['event']!='birth']
    return out


def teaching(s0=S0, step=2.):
    commands=[burn(400,30,(-1,0,0))]
    actual=fly(s0,commands,ONE,end=4000,exit_x=None,step=step,samples=True)
    # A stronger negative control: it already knows the pull, but treats thrust
    # as ordinary. Thus the divergence isolates reversal rather than gravity.
    forecast=fly(s0,commands,ONE,end=actual['t_s'],exit_x=None,step=step,samples=True,ordinary='pull-only')
    by_t={round(s['t_s'],6):s for s in forecast['samples']}
    warning=None
    for measured in actual['samples']:
        predicted=by_t.get(round(measured['t_s'],6))
        if predicted is None: continue
        residual=norm(sub(measured['position_m'],predicted['position_m']))
        if residual>=1000.:
            warning={'t_s':measured['t_s'],'position_residual_m':residual,
                     'assumed_threshold_m':1000.,'actual':measured,'forecast':predicted}
            break
    if warning is None: return {'pass':False,'reason':'no-visible-residual','actual':compact(actual)}
    rescue=fly(s0,[*commands,burn(warning['t_s']+240,24,(0,1,0))],ONE,end=4000,exit_x=None,step=step,samples=True)
    lead=actual['t_s']-warning['t_s']
    passed=(actual['outcome']=='crush' and lead>=600 and rescue['outcome']=='endpoint'
            and rescue['minimum_crush_clearance_bound_m']>=3000)
    return {'pass':passed,'warning':warning,'lead_before_crush_s':lead,
            'actual':actual,'frozen_pull_only_forecast':forecast,'rescue':rescue}


def projection_vectors():
    f=Funnel(7,(OFFSET,0.,0.),(1.,0.,0.))
    field=Field([f]); x=(40000.,0.,0.); force=(-24000.,4000.,-6000.)
    g,tf,_=effect(x,0,force,field)
    assert tf==(24000.,4000.,-6000.)
    assert norm(tf)==norm(force)
    assert effect(x,0,ZERO,field)[0]!=ZERO
    assert effect(x,0,ZERO,field)[1]==ZERO
    assert effect((123000.,0.,0.),0,ZERO,field)[0][0]<0
    assert effect((123000.,0.,0.),0,ZERO,field)[1]==ZERO
    assert effect((-1.,0.,0.),0,force,field)[:2]==(ZERO,force)
    radius=shape(x,f)[2]
    mid=(x[0],radius-min(EDGE,radius/4)/2,0.)
    assert abs(shape(mid,f)[3]-.5)<1e-12
    assert abs(effect(mid,0,force,field)[1][0])<1e-8
    # Rotation covariance with an exact rational orthogonal matrix.
    q=((.36,-.8,.48),(.48,.6,.64),(-.8,0.,.6))
    rotate=lambda v:tuple(dot(row,v) for row in q)
    rf=Funnel(7,rotate(f.center),rotate(f.axis)); rfield=Field([rf])
    rg,rt,_=effect(rotate(x),0,rotate(force),rfield)
    assert norm(sub(rg,rotate(g)))<1e-12 and norm(sub(rt,rotate(tf)))<1e-8
    state=(40000.,1000.,500.,35.,2.,-1.,MASS)
    rstate=(*rotate(state[:3]),*rotate(state[3:6]),MASS)
    for i in range(80):
        state=advance(state,i*.25,.25,force,field)
        rstate=advance(rstate,i*.25,.25,rotate(force),rfield)
    rotation_error=norm(sub(rstate[:3],rotate(state[:3])))
    assert rotation_error<1e-6
    return {'position_m':x,'axis':f.axis,'nominal_force_N':force,'pull_m_s2':g,
            'modified_force_N':tf,'accelerometer_inertial_m_s2':mul(tf,1/MASS),
            'coast_accelerometer_inertial_m_s2':ZERO,'added_torque_N_m':ZERO,
            'rear_cap':{'position_m':[123000.,0.,0.],
                        'pull_m_s2':effect((123000.,0.,0.),0,ZERO,field)[0]},
            'edge_midpoint_position_m':mid,'edge_weight':shape(mid,f)[3],
            'rotation_matrix':q,'rotational_position_error_m':rotation_error}


def popup_vectors():
    f=Funnel(100,(320000.,0.,0.),(0.,0.,1.),1200.)
    samples=[]
    for t in (300.,600.,900.,1200.,1230.,1260.,1290.,1320.):
        samples.append({'t_s':t,'precursor_progress':smooth((t-300)/900),
                        'force_gain':smooth((t-1200)/120)})
    outside=(100000.,0.,0.,40.,0.,0.,MASS)
    inside=(*f.center,0.,0.,0.,MASS)
    fast=(100000.,0.,0.,1000.,0.,0.,MASS)
    assert activation_attempt(f,outside,1200,1200)=='active'
    assert activation_attempt(f,inside,1200,1200)=='dormant-blocked'
    assert activation_attempt(f,fast,1200,1200)=='dormant-blocked'
    # Exercise the lifecycle in propagation, not only the guard formula: a
    # hull already at the future throat remains stationary and cannot be lost.
    imminent=Funnel(100,(OFFSET,0.,0.),(1.,0.,0.),10.)
    occupied=(LENGTH,0.,0.,0.,0.,0.,MASS)
    veto=fly(occupied,[],Field([imminent]),end=30,exit_x=None)
    assert veto['outcome']=='endpoint' and veto['final']==pack(occupied)
    assert len(veto['events'])==1 and veto['events'][0]['event']=='birth-veto'
    # Veto saves/resumes as a permanent cancellation for this run. A new run's
    # fixed catalogue gets its own epoch; no retries that hunt the player's path.
    saved=json.loads(json.dumps({'id':f.id,'status':'dormant-blocked','at_s':1200}))
    assert saved['status']=='dormant-blocked'
    return {'funnel':f.json(),'precursor_start_s':300,'scheduled_on_s':1200,
            'lead_s':900,'ramp_s':120,'response_guard_s':240,'samples':samples,
            'outside_state':pack(outside),'outside_guard_m':activation_guard(f,outside),
            'inside_state':pack(inside),'inside_result':'dormant-blocked',
            'fast_state':pack(fast),'fast_result':'dormant-blocked','saved_veto':saved}


def escape_depths():
    rows=[]
    for x in (60000.,90000.,110000.,115000.):
        for speed in (35.,80.):
            for delay in (0.,240.):
                s=(x,0.,0.,speed,0.,0.,MASS)
                r=fly(s,[burn(delay,16,(0,1,0))],ONE,end=2500,exit_x=None)
                # Conservative analytic sufficient avoidance of the crush sphere:
                # monotone lateral displacement clears its entire cylinder while
                # worst-case axial travel has not yet reached its near cap.
                a=FORCE/MASS; duration=16.
                lateral_time=duration+(THROAT+HULL-.5*a*duration**2)/(a*duration)
                total=delay+lateral_time
                required=THROAT+HULL+speed*total+.5*GMAX*total**2
                sufficient=LENGTH-x>required
                if sufficient: assert r['outcome']!='crush'
                rows.append({'initial_depth_m':x,'initial_speed_m_s':speed,'turn_delay_s':delay,
                             'sufficient_distance_from_throat_m':required,
                             'sufficient_certificate':sufficient,**compact(r)})
    return rows


def finite_bypass(field,speed):
    """Stop, three exterior legs, restore 35 m/s; exact finite ordinary burns.
    Every segment is along a fixed line outside ALL reserved bounding balls,
    so pull and reversal are identically zero even after every possible birth.
    Hypothetical over-budget plans are costed but never called feasible flights.
    """
    s=(-100000.,0.,0.,35.,0.,0.,MASS); t=0.; commands=[]; segments=[]
    def coast(dt):
        nonlocal s,t
        old=s; s=(*add(s[:3],mul(s[3:6],dt)),*s[3:6],s[6])
        segments.append((old[:3],s[:3])); t+=dt
    def fire(dv,direction):
        nonlocal s,t
        d=unit(direction); mi=s[6]; mf=mi*math.exp(-dv/VE); duration=(mi-mf)*VE/FORCE
        displacement=VE*(duration+mf/(FORCE/VE)*math.log(mf/mi))
        old=s
        s=(*add(add(s[:3],mul(s[3:6],duration)),mul(d,displacement)),*add(s[3:6],mul(d,dv)),mf)
        commands.append(burn(t,duration,d)); segments.append((old[:3],s[:3])); t+=duration
    fire(35,(-1,0,0))
    for target in ((s[0],1450000.,0.),(EXIT,1450000.,0.),(EXIT,0.,0.)):
        coast(480); d=unit(sub(target,s[:3])); fire(speed,d)
        mi=s[6]; mf=mi*math.exp(-speed/VE); dt=(mi-mf)*VE/FORCE
        brake_distance=speed*dt-VE*(dt+mf/(FORCE/VE)*math.log(mf/mi))
        duration=(norm(sub(target,s[:3]))-brake_distance)/speed
        assert duration>=480
        coast(duration); fire(speed,mul(d,-1))
        assert norm(sub(s[:3],target))<1e-5
    coast(480); fire(35,(1,0,0))
    gap=min(segment_distance(a,b,f.center)-BOUND-HULL for a,b in segments for f in field.funnels)
    assert gap>10000
    dv=70+6*speed; used=MASS*(1-math.exp(-dv/VE))
    assert abs(used-(MASS-s[6]))<1e-7
    return {'initial':pack((-100000.,0.,0.,35.,0.,0.,MASS)),'leg_speed_m_s':speed,
            'commands':commands,'final':pack(s),'t_s':t,'ideal_impulse_m_s':dv,
            'required_main_kg':used,'within_6000_kg':used<=6000,
            'within_1000_kg':used<=1000,'minimum_reserved_ball_clearance_m':gap,
            'turn_slots_s':480,'segments_m':segments,
            'status':'translation witness; attitude/power unverified' if used<=6000 else 'infeasible with baseline tank; hypothetical cost only'}


def convergence():
    # Cross the side's C2 transition under thrust and pull; compare independent
    # midpoint with RK4, not just two instances of the same integration formula.
    s=(60000.,4000.,0.,40.,30.,0.,MASS)
    c=[burn(0,80,(1,1,0))]
    ref=fly(s,c,ONE,end=160,exit_x=None,step=.125)
    fine=fly(s,c,ONE,end=160,exit_x=None,step=.0625)
    difference=norm(sub(ref['final']['position_m'],fine['final']['position_m']))
    assert difference<.001
    rows=[]
    for h in (4.,2.,1.,.5):
        r=fly(s,c,ONE,end=160,exit_x=None,step=h,method='midpoint')
        rows.append({'step_s':h,'position_error_m':norm(sub(r['final']['position_m'],fine['final']['position_m']))})
    ratios=[a['position_error_m']/b['position_error_m'] for a,b in zip(rows,rows[1:])]
    assert all(3.4<r<4.6 for r in ratios),ratios
    return {'reference':fine,'rk4_position_difference_m':difference,'midpoint_errors':rows,'ratios':ratios}


def catalogue():
    rows=[]; reasons=Counter(); controls=0
    for seed in range(22000,22032):
        rng=Rng(f'seed:{seed}\0s22.arrival.v2')
        s=S0 if seed==22000 else (rng.uniform(5000,95000),rng.uniform(-200,200),rng.uniform(-200,200),rng.uniform(25,80),0.,0.,MASS)
        # A sufficient 560 s preparation certificate, using global max pull.
        margin=LENGTH-THROAT-HULL-s[0]-s[3]*560-.5*GMAX*560**2
        reason=None; results=[]; teach=None
        if margin<20000: reason='preparation-margin'
        if reason is None:
            teach=teaching(s,step=4.)
            if not teach['pass']: reason='warning-or-recovery'
        if reason is None:
            field=make_field(seed)
            for sign in (-1,1):
                for start,duration in ((560,14),(640,18)):
                    r=fly(s,[burn(start,duration,(0,sign,0))],field,end=35000,step=4.)
                    controls+=1; results.append(r)
            if not all(r['outcome']=='exit' and r['minimum_crush_clearance_bound_m']>=5000 and r['main_kg']<=200 for r in results):
                reason='crossing-neighborhood'
        row={'seed':seed,'initial':pack(s),'admitted':reason is None,'first_rejection':reason,
             'garden_to_encounter_rotation':placement(seed),
             'preparation_clearance_bound_m':margin,'tested_routes':[compact(r) for r in results]}
        if teach is not None:
            row['teaching']={k:teach[k] for k in ('pass','lead_before_crush_s','warning') if k in teach}
            if 'rescue' in teach: row['teaching']['rescue']=compact(teach['rescue'])
        if reason: reasons[reason]+=1
        rows.append(row)
        if (seed-21999)%8==0: print(f'S22 catalogue: {seed-21999}/32 proposals checked',flush=True)
    admitted=[r for r in rows if r['admitted']]
    assert rows[0]['admitted'] and len(admitted)>=2
    return {'schema':'recursion.s22.catalogue.v2','proposal_count':32,'accepted':len(admitted),
            'rejected':32-len(admitted),'rejection_fraction':(32-len(admitted))/32,
            'first_failure_counts':dict(sorted(reasons.items())),'tested_controls':controls,
            'admitted_ids':[r['seed'] for r in admitted],'candidates':rows}


def build():
    baseline=json.loads((ROOT/'data/ship-baseline.json').read_text(encoding='utf8'))
    assert baseline['ship']['initialWetMass']==MASS
    assert baseline['propulsion']['main']['thrust']==FORCE
    assert baseline['propulsion']['main']['Isp']*baseline['constants']['g0']['value']==VE
    rng=Rng('seed:16000\0s16.geometry.v1')
    assert [round(rng.next()*4294967296) for _ in range(6)]==[3744950808,718765878,1072496303,3010543048,3621254057,337399829]
    field=make_field(22000)
    gap=pair_gap(field); assert gap>20000
    # All possible jittered neighbors are separated even before seed admission.
    universal_gap=PITCH-8000*math.sqrt(3)-2*BOUND
    assert universal_gap>14000
    # Rejection fixtures separate invalid geometry from merely uncertified
    # arrival/flight candidates. An overlap must fail BEFORE any force query.
    bad_field=Field([Funnel(0,(0.,0.,0.),(1.,0.,0.)),Funnel(1,(1000.,0.,0.),(0.,1.,0.))])
    assert pair_gap(bad_field)<0
    for bad in (Funnel(1,(0.,0.,0.),(2.,0.,0.)),Funnel(1,(math.nan,0.,0.),(1.,0.,0.))):
        try: Field([bad])
        except ValueError as error: assert str(error)=='invalid-geometry'
        else: raise AssertionError('invalid geometry accepted')
    coast=fly(S0,[],ONE,end=4000,exit_x=None,samples=True)
    assert coast['outcome']=='crush' and coast['main_kg']==0
    plain=fly(S0,[],ONE,end=coast['t_s'],exit_x=None,ordinary=True)
    assert plain['outcome']=='endpoint' and plain['final']['position_m'][0]<80000
    sides=[fly(S0,[burn(600,16,(0,sign,0))],ONE,end=4000,exit_x=None,samples=True) for sign in (-1,1)]
    assert all(r['outcome']=='endpoint' and r['minimum_crush_clearance_bound_m']>16000 for r in sides)
    teach=teaching(); assert teach['pass']
    routes=[fly(S0,[burn(600,16,(0,sign,0))],field,samples=True) for sign in (-1,1)]
    assert all(r['outcome']=='exit' and len(r['influences_met'])>=2 for r in routes)
    assert any(any(i%4==0 and i!=0 for i in r['influences_met']) for r in routes)
    assert all(e['reachable_clearance_m']>0 for r in routes for e in r['events'] if e['event']=='birth')
    route_fine=fly(S0,[burn(600,16,(0,-1,0))],field,step=1.)
    route_error=norm(sub(route_fine['final']['position_m'],routes[0]['final']['position_m']))
    assert route_error<1.,route_error
    try: fly((120000.,0.,0.,0.,0.,0.,MASS),[],ONE)
    except ValueError as e: assert str(e)=='initial-crush'
    else: raise AssertionError('initial crush admitted')
    # Brute-force vs spatial query on random positions; no independent scalar
    # kernel is claimed, but this catches broadphase omissions at cell boundaries.
    rng=Rng('seed:22000\0s22.query-tests.v2'); query_cases=[]
    for _ in range(100):
        p=(rng.uniform(-1e5,1.5e6),rng.uniform(-1.4e6,1.4e6),rng.uniform(-1.4e6,1.4e6))
        actual=effect(p,5000,(12000.,-6000.,9000.),field)
        broad=field.point(p)
        assert all(f in broad for f in field.funnels if norm(sub(p,f.center))<BOUND)
        query_cases.append({'position_m':p,'t_s':5000.,'force_N':[12000.,-6000.,9000.],
                            'pull_m_s2':actual[0],'modified_force_N':actual[1]})
    for f in field.funnels[::26]:
        p=f.center
        actual=effect(p,5000,(12000.,-6000.,9000.),field)
        query_cases.append({'position_m':p,'t_s':5000.,'force_N':[12000.,-6000.,9000.],
                            'pull_m_s2':actual[0],'modified_force_N':actual[1]})
    p=(123000.,0.,0.); actual=effect(p,5000,(12000.,-6000.,9000.),field)
    query_cases.append({'position_m':p,'t_s':5000.,'force_N':[12000.,-6000.,9000.],
                        'pull_m_s2':actual[0],'modified_force_N':actual[1]})
    cat=catalogue()
    bypasses=[finite_bypass(field,speed) for speed in (1.,35.,125.)]
    assert bypasses[0]['required_main_kg']<730 and bypasses[-1]['required_main_kg']>6000
    time=routes[0]['t_s']; d=8*PITCH+4000+BOUND; b=350000.
    dv_bound=2*(math.sqrt(d)+math.sqrt(d-b))**2/time
    vectors={'schema':'recursion.s22.v2','units':'SI','baseline_sha256':hashlib.sha256((ROOT/'data/ship-baseline.json').read_bytes()).hexdigest(),
        'parameters':{'length_m':LENGTH,'mouth_radius_m':MOUTH,'throat_radius_m':THROAT,'end_cap_m':CAP,
                      'radial_edge_max_m':EDGE,'hull_m':HULL,'pull_min_m_s2':GMIN,'pull_max_m_s2':GMAX,
                      'shared_gravity_reference_radius_m':1000000.,'massive_sources':[]},
        'field':{'count':len(field.funnels),'birth_sites':sum(f.on>0 for f in field.funnels),
                 'pitch_m':PITCH,'bounding_ball_radius_m':BOUND,'measured_ball_gap_m':gap,
                 'universal_ball_gap_lower_bound_m':universal_gap,'exit_x_m':EXIT,'exit_disc_radius_m':350000.,
                 'maximum_bucket_population':max(map(len,field.buckets.values()))},
        'projection':projection_vectors(),'coast_pulled_to_crush':coast,'no_funnel_coast':plain,
        'sideways_escapes':sides,'instinctive_burn':teach,'escape_depth_sweep':escape_depths(),
        'popup':popup_vectors(),'many_funnel_crossings':routes,'route_halving_position_difference_m':route_error,
        'edge_convergence':convergence(),'bypasses':bypasses,
        'conditional_exterior_time_bound':{'scope':'outside reserved bounding box; same duration, not all physical routes',
            'duration_s':time,'transverse_excursion_m':d,'allowed_exit_offset_m':b,
            'impulse_lower_bound_m_s':dv_bound,'main_only_equivalent_kg':MASS*(1-math.exp(-dv_bound/VE))},
        'initial_crush_rejected':True,'invalid_geometry_rejected':True,
        'overlap_rejection':{'centers_m':[[0,0,0],[1000,0,0]],'ball_gap_m':pair_gap(bad_field),'admissible':False},
        'rejected_seed':next(r for r in cat['candidates'] if not r['admitted']),
        'kernel_queries':query_cases,
        'port_tolerances':{'position_m':1.,'velocity_m_s':.002,'mass_kg':1e-6,'crush_time_s':.02,'force_N':1e-7,'acceleration_m_s2':1e-10}}
    geometry={'schema':'recursion.s22.geometry.v2','seed':22000,'frame':'garden authoring frame; rotate entire encounter for placement',
              'garden_to_encounter_rotation':placement(22000),
              'funnels':[f.json() for f in field.funnels]}
    return {'vectors.json':vectors,'seeds.json':cat,'field.json':geometry}


def diagram(vectors):
    """Native vector plot of the reference, no raster generation or packages."""
    point=lambda x,y:f'{80+x/200:.3f},{225-y/200:.3f}'
    outline=[]
    for x in range(0,125001,1000):
        r=THROAT+(MOUTH-THROAT)*(1-min(1,x/LENGTH))**2
        outline.append((x,r))
    polygon=' '.join(point(x,y) for x,y in [*outline,*[(x,-y) for x,y in reversed(outline)]])
    paths=[]
    for route,color in zip(vectors['sideways_escapes'],('#0476a8','#c45a13')):
        points=' '.join(point(s['position_m'][0],s['position_m'][1]) for s in route['samples'] if s['position_m'][0]<=135000)
        paths.append(f'<polyline points="{points}" fill="none" stroke="{color}" stroke-width="3"/>')
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="920" height="430" viewBox="0 0 920 430">
<title>S22 funnel cross-section and both demonstrated sideways escapes</title>
<desc>To scale in the local axial and transverse coordinates. The funnel tapers from a 20 kilometre mouth radius to a one kilometre throat over 120 kilometres. Two 16 second transverse burns escape the sides. The coasting route ends at the crushing throat.</desc>
<rect width="920" height="430" fill="#faf9f5"/>
<g font-family="sans-serif" fill="#222">
<text x="38" y="34" font-size="23">Real funnel, two sideways escapes</text>
<text x="38" y="60" font-size="14">Local cross-section · axes and lengths rotate together in the 3D field</text>
<polygon points="{polygon}" fill="#a696dc" fill-opacity=".22" stroke="#7764ad" stroke-width="2"/>
<line x1="80" y1="105" x2="80" y2="345" stroke="#888" stroke-dasharray="4 4"/>
<line x1="65" y1="225" x2="805" y2="225" stroke="#888" stroke-dasharray="4 4"/>
<line x1="130" y1="225" x2="674.9" y2="225" stroke="#9c2732" stroke-width="3"/>
<circle cx="680" cy="225" r="5.1" fill="#9c2732"/>
{''.join(paths)}
<text x="38" y="98" font-size="14">+20 km</text>
<text x="38" y="366" font-size="14">−20 km</text>
<text x="74" y="390" font-size="14">Mouth · 0 km</text>
<text x="590" y="390" font-size="14">Throat · 120 km</text>
<text x="715" y="210" font-size="14">Crush radius 1 km</text>
<text x="330" y="199" font-size="14" fill="#9c2732">Coast → pull → crush</text>
<text x="440" y="105" font-size="14" fill="#c45a13">16 s sideways burn</text>
<text x="435" y="350" font-size="14" fill="#0476a8">Opposite escape also works</text>
<text x="38" y="420" font-size="12">From reference vectors: 122.366 kg main each; 16.425 km minimum throat clearance. Not a sensor screenshot.</text>
</g></svg>\n'''


def main():
    if not __debug__: raise SystemExit('Assertions required; do not use -O.')
    parser=argparse.ArgumentParser(); parser.add_argument('--check',action='store_true'); args=parser.parse_args()
    results=build()
    for name,value in results.items():
        content=json.dumps(value,indent=2,sort_keys=True,allow_nan=False)+'\n'; p=HERE/name
        if args.check:
            if not p.exists() or p.read_text(encoding='utf8')!=content: raise SystemExit(f'{name}: differs; regenerate')
        else: p.write_text(content,encoding='utf8',newline='\n')
    plot=ROOT/'docs/studies/s22/funnel.svg'; content=diagram(results['vectors.json'])
    if args.check:
        if not plot.exists() or plot.read_text(encoding='utf8')!=content: raise SystemExit('funnel.svg: differs; regenerate')
    else: plot.write_text(content,encoding='utf8',newline='\n')
    cat=results['seeds.json']
    print(json.dumps({'all_assertions':'passed','accepted':cat['accepted'],'proposals':cat['proposal_count'],
                     'rejections':cat['first_failure_counts'],'tested_controls':cat['tested_controls'],
                     'bytes':'match' if args.check else 'written'},sort_keys=True))


if __name__=='__main__': main()
