"""Independent belt experiment. python tools/studies/s8/ring.py [--check]

The RNG is deliberately independent of the uninspected game RNG. Statistical
reproduction and a fixed-layout phase experiment are distinct populations.
All geometry is SI; published JSON includes exact RNG seed and burn choices.
"""
from __future__ import annotations
import argparse
import json
import math
from pathlib import Path
import numpy as np
import core

ROOT = Path(__file__).resolve().parent
N = 40
ROCKS = 320
TARGETS = [(715, 13.647323984652758), (830, 13.79710440710187),
           (980, 13.997999969869852)]


def initial_ring(seed=8008, phase=0.0):
    """Committed distributions, independent PCG64 draw order; no game imports."""
    rng = np.random.Generator(np.random.PCG64(seed))
    r = np.sqrt(700000.0**2 + (860000.0**2-700000.0**2)*rng.random(ROCKS))
    a = rng.uniform(-math.pi, math.pi, ROCKS) + phase
    vt = 1+rng.normal(0, .015, ROCKS)
    vr = rng.normal(0, .015, ROCKS)
    radius = 3000*4**rng.random(ROCKS)
    z = rng.normal(0, .006*r)
    vz = rng.normal(0, .006, ROCKS)
    vc = np.sqrt(core.GM[1]*np.sqrt(core.R0)/r**1.5)
    u = np.column_stack([np.cos(a), np.sin(a), np.zeros(ROCKS)])
    q = np.column_stack([-np.sin(a), np.cos(a), np.zeros(ROCKS)])
    bp,bv = core.bodies(0)
    x = bp[1] + r[:,None]*u
    v = bv[1] + vc[:,None]*(vr[:,None]*u + vt[:,None]*q)
    x[:,2] = z
    v[:,2] = vc*vz
    return x,v,radius


def initial_alpha_field(seed=8008):
    """Independent realization of the committed 14-disc + 2-dipping field."""
    rng = np.random.Generator(np.random.PCG64(seed+100000))
    bp,bv = core.bodies(0)
    xx,vv,rr = [],[],[]
    for i in range(16):
        r = 580000+(960000-580000)*(i+rng.random())/14 if i<14 else 700000.
        angle = rng.uniform(-math.pi,math.pi)
        tangential = 1+rng.uniform(-.02,.02) if i<14 else .86
        radial = rng.uniform(-.015,.015) if i<14 else 0.
        radius = 400*(3500/400)**rng.random()
        node = rng.uniform(-math.pi,math.pi)
        tilt = rng.uniform(-math.pi/30,math.pi/30)
        axis = np.array([math.cos(node),math.sin(node),0.])
        def rotate(vector):
            return vector*math.cos(tilt)+np.cross(axis,vector)*math.sin(tilt)+axis*np.dot(axis,vector)*(1-math.cos(tilt))
        u = rotate(np.array([math.cos(angle),math.sin(angle),0.]))
        q = rotate(np.array([-math.sin(angle),math.cos(angle),0.]))
        vc = math.sqrt(core.GM[0]*math.sqrt(core.R0)/r**1.5)
        xx.append(bp[0]+r*u)
        vv.append(bv[0]+vc*(radial*u+tangential*q))
        rr.append(radius)
    x,v,radius = np.array(xx),np.array(vv),np.array(rr)
    keep = core.norm(x-core.arrival()[0])>60000+radius
    return x[keep],v[keep],radius[keep]


def body_contacts(t,x,xn,radii,dt):
    """Absorb rocks at either finite body's surface; never cross a singularity."""
    bp,_=core.bodies(t); bn,_=core.bodies(t+dt)
    start=x[...,None,:]-bp
    delta=xn[...,None,:]-bn-start
    f=np.clip(-np.sum(start*delta,axis=-1)/np.maximum(np.sum(delta*delta,axis=-1),1e-30),0,1)
    return np.any(core.norm(start+f[...,None]*delta)<=radii[...,None]+core.RADII,axis=-1)


def full_witness(result,dt=60.):
    """One lifted 830 km crossing with every body/rock to the exit gate."""
    row = result['rows'][1]
    acceptable = np.flatnonzero(np.array(row['clearances_m'][1])>=1000)
    for ring in acceptable:
        seed = 8008+int(ring)
        r=initial_ring(seed); a=initial_alpha_field(seed)
        x,v,radii = [np.concatenate([a[i],r[i]]) for i in range(3)]
        initial = dict(positions=x.tolist(),velocities=v.tolist(),radii=radii.tolist())
        policy=row['policies'][1]
        trace=core.fly(row['main_dv'],dt=dt,kicks=[(policy['kick_t'],policy['kick_dv'])])
        summary=core.summary(trace,delta_v=row['main_dv']+1)
        minimum=np.full(len(radii),np.inf)
        active=np.ones(len(radii),dtype=bool)
        events=[None]*len(radii)
        snapshots=[]
        times,sx,sv=trace
        for k,t in enumerate(times[:-1]):
            if t>=summary['exit_t']:
                break
            h=times[k+1]-t
            xn,vn=core.rk4(t,x,v,h)
            active &= ~body_contacts(t,x,xn,radii,h)
            p0=x-sx[k]; change=xn-sx[k+1]-p0
            f=np.clip(-np.sum(p0*change,axis=-1)/np.maximum(np.sum(change*change,axis=-1),1e-30),0,1)
            d=core.norm(p0+f[:,None]*change)-radii-core.HULL
            d[~active]=np.inf
            for i in np.flatnonzero(d<minimum):
                frac=float(f[i])
                events[i]=dict(rock=int(i),host='alpha' if i<len(a[2]) else 'beta',
                    t=float(t+h*frac),clearance_m=float(d[i]),
                    center_distance_m=float(d[i]+radii[i]+core.HULL),
                    relative_speed=float(core.norm(v[i]*(1-frac)+vn[i]*frac-sv[k]*(1-frac)-sv[k+1]*frac)),
                    ship_position=(sx[k]*(1-frac)+sx[k+1]*frac).tolist(),
                    ship_velocity=(sv[k]*(1-frac)+sv[k+1]*frac).tolist(),
                    rock_position=(x[i]*(1-frac)+xn[i]*frac).tolist(),
                    rock_velocity=(v[i]*(1-frac)+vn[i]*frac).tolist())
            minimum=np.minimum(minimum,d)
            if int(t)%3600==0:
                snapshots.append(dict(t=float(t),position=sx[k].tolist(),velocity=sv[k].tolist()))
            x,v=np.where(active[:,None],xn,x),np.where(active[:,None],vn,0.)
        if minimum.min()<1000:
            continue
        return dict(seed=seed,dt=dt,initial_rocks=initial,
                    alpha_count=len(a[2]),ring_count=320,policy=policy,summary=summary,
                    main_propellant_kg=core.fuel(row['main_dv']),
                    lift_propellant_kg=core.fuel(1,mass=core.MASS-core.fuel(row['main_dv']),isp=220),
                    min_clearance_m=float(minimum.min()),
                    body_absorbed_rocks=int(np.sum(~active)),snapshots=snapshots,
                    closest_approaches=sorted([q for q in events if q is not None],key=lambda q:q['clearance_m']))
    raise AssertionError('No full-field safe lifted witness in supplied ensemble')


def policies(burn, burn_time=3960., dt=120., bearing=math.pi, quick=False):
    base = core.fly(burn, burn_time=burn_time, dt=dt, bearing=bearing)
    peri = core.summary(base)['beta_peri_t']
    kick_t = round((peri-8*3600)/dt)*dt
    j = np.searchsorted(base[0], kick_t)
    bp,bv = core.bodies(kick_t)
    radial = base[1][j]-bp[1]
    radial[2] = 0
    radial /= core.norm(radial)
    tangent = np.array([-radial[1],radial[0],0.])
    specs = [('blind', np.zeros(3)), ('lift', np.array([0.,0.,1.]))]
    if quick:
        specs.append(('lift-down',np.array([0.,0.,-1.])))
    else:
        for magnitude in (.4,.8,1.6):
            for name,direction in [('r+',radial),('r-',-radial),('t+',tangent),('t-',-tangent)]:
                specs.append((f'{name}{magnitude}', magnitude*direction))
    ts = np.arange(0.,300000+dt/2,dt)
    xs,vs,summaries = [],[],[]
    for name,kick in specs:
        tr = base if name == 'blind' else core.fly(burn,burn_time=burn_time,dt=dt,
                  bearing=bearing,kicks=[(kick_t,kick)])
        xs.append(np.column_stack([np.interp(ts,tr[0],tr[1][:,i]) for i in range(3)]))
        vs.append(np.column_stack([np.interp(ts,tr[0],tr[2][:,i]) for i in range(3)]))
        s = core.summary(tr,delta_v=burn+float(core.norm(kick)))
        s.update(policy=name,kick_t=kick_t,kick_dv=kick.tolist(),
                 trim_dv=float(core.norm(kick)),main_dv=burn)
        summaries.append(s)
    return ts,np.array(xs),np.array(vs),summaries


def run_suite(mode='independent',dt=120., targets=TARGETS,quick=False):
    """Swept spheres along each RK interval, plus a 1 km acceptance buffer.

    Crossing positions use the closest point of relative straight chords;
    the dt/2 convergence test bounds curvature/integration error separately.
    No post-contact physics is claimed: a path with any contact is a loss.
    """
    routes = [dict(target_peri_km=q[0],burn=q[1],burn_time=3960.,bearing=math.pi)
              if not isinstance(q,dict) else q for q in targets]
    cases = [policies(q['burn'],burn_time=q['burn_time'],bearing=q['bearing'],dt=dt,quick=quick) for q in routes]
    sample_t = cases[0][0]
    shipx = np.array([c[1] for c in cases])
    shipv = np.array([c[2] for c in cases])
    rings = [initial_ring(8008+i if mode=='independent' else 8008,
                        0 if mode=='independent' else i*2*math.pi/N) for i in range(N)]
    x,v,radii = [np.array([r[i] for r in rings]) for i in range(3)]
    shape = (len(targets),len(cases[0][3]),N)
    minimum = np.full(shape,np.inf)
    events = np.empty(shape,dtype=object)
    radial_min,radial_max,z_rms_max = math.inf,0.,0.
    surface_min = math.inf
    active=np.ones((N,ROCKS),dtype=bool)
    radial_samples=[]
    arrival_clearance = float(np.min(core.norm(x-core.arrival()[0])-radii-core.HULL))
    for k,t in enumerate(sample_t[:-1]):
        # 42 h spans every belt crossing in these local pass families.
        if t >= 42*3600:
            break
        xn,vn = core.rk4(t,x,v,dt)
        active &= ~body_contacts(t,x,xn,radii,dt)
        bp,_ = core.bodies(t+dt)
        if k%10 == 0:
            rb = core.norm(xn-bp[1])
            radial_samples.append(rb[active].copy())
            radial_min = min(radial_min,float(rb[active].min()))
            radial_max = max(radial_max,float(rb[active].max()))
            z_rms_max = max(z_rms_max,float(np.sqrt(np.mean(xn[:,:,2][active]**2))))
            surface_min = min(surface_min,float(np.min((rb-radii-core.RADII[1])[active])))
        for row in range(len(targets)):
            if np.min(core.norm(shipx[row,:,k]-bp[1]))>2e6:
                continue
            p0 = x[None,:,:,:]-shipx[row,:,k,None,None,:]
            p1 = xn[None,:,:,:]-shipx[row,:,k+1,None,None,:]
            change = p1-p0
            denom = np.sum(change*change,axis=-1)
            f = np.clip(-np.sum(p0*change,axis=-1)/np.maximum(denom,1e-30),0,1)
            close = p0+f[...,None]*change
            clearance = core.norm(close)-radii[None,:,:]-core.HULL
            clearance[:,~active]=np.inf
            arg = np.argmin(clearance,axis=-1)
            value = np.take_along_axis(clearance,arg[...,None],axis=-1)[...,0]
            updated = value<minimum[row]
            for pol,ring in np.argwhere(updated):
                rock = int(arg[pol,ring]); frac = float(f[pol,ring,rock])
                ship_p = shipx[row,pol,k]*(1-frac)+shipx[row,pol,k+1]*frac
                rock_p = x[ring,rock]*(1-frac)+xn[ring,rock]*frac
                ship_v = shipv[row,pol,k]*(1-frac)+shipv[row,pol,k+1]*frac
                rock_v = v[ring,rock]*(1-frac)+vn[ring,rock]*frac
                events[row,pol,ring] = dict(t=float(t+dt*frac),rock=int(rock),
                    clearance_m=float(value[pol,ring]),center_distance_m=float(core.norm(rock_p-ship_p)),
                    radius_m=float(radii[ring,rock]),ship_position=ship_p.tolist(),
                    rock_position=rock_p.tolist(),ship_velocity=ship_v.tolist(),
                    rock_velocity=rock_v.tolist(),relative_speed=float(core.norm(rock_v-ship_v)))
            minimum[row] = np.minimum(minimum[row],value)
        x,v = np.where(active[:,:,None],xn,x),np.where(active[:,:,None],vn,0.)
    rows = []
    for row,route in enumerate(routes):
        target,burn=route['target_peri_km'],route['burn']
        summaries = cases[row][3]
        choices = []
        for ring in range(N):
            valid = [i for i in range(len(summaries)) if 'lift' not in summaries[i]['policy']
                     if minimum[row,i,ring]>=1000 and summaries[i]['qualifies']]
            valid.sort(key=lambda i:(summaries[i]['trim_dv'],-minimum[row,i,ring]))
            choices.append(valid[0] if valid else None)
        costs = [summaries[i]['trim_dv'] for i in choices if i is not None]
        rows.append(dict(target_peri_km=target, main_dv=burn,
            bearing=route['bearing'],burn_time=route['burn_time'],
            policies=summaries,blind_losses=int(np.sum(minimum[row,0]<0)),
            lift_losses=int(np.sum(minimum[row,1]<0)),
            threading_uncertified=sum(i is None for i in choices),
            threading_mean_dv=float(np.mean(costs)) if costs else None,
            threading_max_dv=float(max(costs)) if costs else None,
            threading_mean_trims=float(np.mean(np.array(costs)>0)) if costs else None,
            threading_choices=choices,clearances_m=minimum[row].tolist(),
            closest_approaches=[[events[row,i,j] for j in range(N)] for i in range(shape[1])]))
    return dict(mode=mode,dt=dt,count=N,rng='NumPy PCG64',base_seed=8008,
                phase_step_deg=9 if mode=='phase' else None,
                window_s=42*3600,hull_sphere_m=core.HULL,thread_buffer_m=1000,
                arrival_min_clearance_m=arrival_clearance,
                ring_radial_extent_m=[radial_min,radial_max],
                ring_radial_quantiles_m=np.quantile(np.concatenate(radial_samples),[.01,.05,.5,.95,.99]).tolist(),
                ring_max_z_rms_m=z_rms_max,beta_min_surface_clearance_m=surface_min,
                body_absorbed_count=int(np.sum(~active)),
                outside_2Mm_count=int(np.sum(active & (core.norm(x-core.bodies(42*3600)[0][1])>2e6))),rows=rows)


def phase_routes():
    return [dict(target_peri_km=q[0],burn=q[1],burn_time=q[2],
                 bearing=math.pi+math.radians(q[3])) for q in
            [(974.746,13.6,6360.,-15),(981.456,14.,3960.,0),(977.766,14.2,1320.,15)]]


def neighborhood(witness,dt=60.,time_offset=60.,dv_offset=.05):
    """Nine open-loop command perturbations on the identical full-field layout."""
    policy=witness['policy']
    axes=[(-time_offset,-dv_offset),(-time_offset,0),(-time_offset,dv_offset),
          (0,-dv_offset),(0,0),(0,dv_offset),
          (time_offset,-dv_offset),(time_offset,0),(time_offset,dv_offset)]
    ts=np.arange(0.,300000+dt/2,dt)
    xs,vs,rows=[],[],[]
    for timing,magnitude in axes:
        burn=policy['main_dv']+magnitude
        tr=core.fly(burn,burn_time=3960+timing,dt=dt,
                    kicks=[(policy['kick_t'],policy['kick_dv'])])
        xs.append(np.column_stack([np.interp(ts,tr[0],tr[1][:,i])for i in range(3)]))
        vs.append(np.column_stack([np.interp(ts,tr[0],tr[2][:,i])for i in range(3)]))
        rows.append(dict(main_time=3960+timing,main_dv=burn,
                    summary=core.summary(tr,delta_v=burn+1)))
    sx,sv=np.array(xs),np.array(vs)
    initial=witness['initial_rocks']
    x,v,radii=[np.array(initial[key])for key in ('positions','velocities','radii')]
    active=np.ones(len(radii),dtype=bool)
    minimum=np.full(9,np.inf)
    events=[None]*9
    end=np.array([r['summary']['exit_t'] or 300000 for r in rows])
    for k,t in enumerate(ts[:-1]):
        if t>=end.max():
            break
        xn,vn=core.rk4(t,x,v,dt)
        active &= ~body_contacts(t,x,xn,radii,dt)
        p0=x[None,:,:]-sx[:,k,None,:]
        delta=xn[None,:,:]-sx[:,k+1,None,:]-p0
        f=np.clip(-np.sum(p0*delta,axis=-1)/np.maximum(np.sum(delta*delta,axis=-1),1e-30),0,1)
        d=core.norm(p0+f[:,:,None]*delta)-radii[None,:]-core.HULL
        d[:,~active]=np.inf
        d[t>=end,:]=np.inf
        arg=d.argmin(axis=-1)
        value=d[np.arange(9),arg]
        for i in np.flatnonzero(value<minimum):
            rock=int(arg[i]); frac=float(f[i,rock])
            events[i]=dict(rock=rock,t=float(t+dt*frac),
                clearance_m=float(value[i]),
                relative_speed=float(core.norm(v[rock]*(1-frac)+vn[rock]*frac-sv[i,k]*(1-frac)-sv[i,k+1]*frac)))
        minimum=np.minimum(minimum,value)
        x,v=np.where(active[:,None],xn,x),np.where(active[:,None],vn,0.)
    for i,row in enumerate(rows):
        row.update(closest=events[i],certified=bool(minimum[i]>=1000 and row['summary']['qualifies']))
    return dict(seed=witness['seed'],dt=dt,initial_rocks_file='ring-witness.json',
            time_offset_s=time_offset,dv_offset_m_s=dv_offset,
            fixed_lift_time=policy['kick_t'],fixed_lift_dv=policy['kick_dv'],
            certified_count=sum(q['certified']for q in rows),count=9,
            minimum_clearance_m=float(minimum.min()),rows=rows)


def generate_all():
    """Public API for the one-command study runner; returns filename->JSON value."""
    statistical=run_suite()
    phase=run_suite('phase',120.,phase_routes(),True)
    witness=full_witness(statistical,60.)
    coarse=full_witness(statistical,120.)
    fine=full_witness(statistical,30.)
    convergence=dict(witness_seed=witness['seed'],steps_s=[120,60,30],
        closest_clearance_m=[q['min_clearance_m'] for q in (coarse,witness,fine)],
        exit_speed_m_s=[q['summary']['exit_speed'] for q in (coarse,witness,fine)],
        exit_t_s=[q['summary']['exit_t'] for q in (coarse,witness,fine)],
        method='Same route, all336rocks, swept chords; gate sampled to step precision.')
    return {'ring.json':statistical,'ring-phase.json':phase,
            'ring-witness.json':witness,'ring-convergence.json':convergence,
            'ring-neighborhood.json':neighborhood(witness)}


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--check',action='store_true')
    parser.add_argument('--phase',action='store_true')
    parser.add_argument('--dt',type=float,default=120.)
    parser.add_argument('--all',action='store_true')
    args=parser.parse_args()
    if args.all:
        for name,result in generate_all().items():
            text=json.dumps(result,indent=2,allow_nan=False)+'\n'
            if args.check:
                assert json.loads((ROOT/name).read_text(encoding='utf-8'))==result,name
            else:
                (ROOT/name).write_text(text,encoding='utf-8',newline='\n')
            print(name,flush=True)
        return
    result=run_suite('phase' if args.phase else 'independent',args.dt)
    name='ring-phase.json' if args.phase else 'ring.json'
    out=ROOT/name
    data=json.dumps(result,indent=2,allow_nan=False)+'\n'
    if args.check:
        assert out.read_text(encoding='utf-8')==data, f'{name} differs'
    else:
        out.write_text(data,encoding='utf-8',newline='\n')
    print(json.dumps([{k:r[k] for k in ('target_peri_km','blind_losses','lift_losses',
          'threading_uncertified','threading_mean_dv','threading_max_dv','threading_mean_trims')}
          for r in result['rows']],indent=2))


if __name__=='__main__':
    main()
