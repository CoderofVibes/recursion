"""Route/height reproduction and numerical error controls."""
import math
import numpy as np
import core

def precise_summary(trace, dv=14.0):
    t,x,v=trace
    s=core.summary(trace,delta_v=dv)
    bp,bv=core.bodies(t)
    r=core.norm(x-bp[:,1])
    i=int(r.argmin())
    if 0<i<len(t)-1:
        coeff=np.polyfit(t[i-1:i+2]-t[i],r[i-1:i+2],2)
        tp=float(t[i]-coeff[1]/(2*coeff[0]))
        j=int(np.searchsorted(t,tp)-1)
        xp,vp=core.integrate(x[j],v[j],t[j],tp,dt=2)
        b,bv=core.bodies(tp)
        s.update(beta_peri_t=tp,beta_peri_m=float(core.norm(xp-b[1])),
                 beta_peri_relative_speed=float(core.norm(vp-bv[1])),beta_peri_z=float(xp[2]))
    e=np.flatnonzero((core.norm(x)>=9e6)&(np.sum(x*v,axis=-1)>0))
    if len(e):
        i=int(e[0]); lo,hi=float(t[i-1]),float(t[i])
        for _ in range(30):
            mid=(lo+hi)/2
            xp,vp=core.integrate(x[i-1],v[i-1],t[i-1],mid,dt=10)
            if core.norm(xp)<9e6: lo=mid
            else: hi=mid
        s.update(exit_t=mid,exit_speed=float(core.norm(vp)),exit_position=xp.tolist(),exit_velocity=vp.tolist())
    return s

def route_grid(dt=60):
    """Explicit reconstruction of 13 impulses x 53 first-orbit burn times."""
    burns=np.repeat(np.arange(10,16.01,.5),53)
    starts=np.tile(np.arange(53)*1200.,13)
    x0,v0=core.arrival()
    x=np.tile(x0,(len(burns),1)); v=np.tile(v0,(len(burns),1))
    status=np.zeros(len(burns),dtype=int)
    min_beta=np.full(len(burns),np.inf); exit_speed=np.zeros(len(burns))
    exit_time=np.zeros(len(burns)); hit_time=np.zeros(len(burns))
    for t in np.arange(0,160*3600,dt):
        fire=(starts==t)&(status==0)
        if np.any(fire): v[fire]+=burns[fire,None]*core.prograde(t,v[fire])
        active=np.flatnonzero(status==0)
        if not len(active): break
        old=x[active].copy()
        xn,vn=core.rk4(t,old,v[active],dt)
        b0,_=core.bodies(t); b1,_=core.bodies(t+dt)
        p0=old[:,None,:]-b0; dr=(xn[:,None,:]-b1)-p0
        lam=np.clip(-np.sum(p0*dr,axis=-1)/np.maximum(np.sum(dr*dr,axis=-1),1e-30),0,1)
        dist=core.norm(p0+lam[...,None]*dr)
        min_beta[active]=np.minimum(min_beta[active],dist[:,1])
        hit_a=dist[:,0]<=core.RADII[0]+core.HULL
        hit_b=dist[:,1]<=core.RADII[1]+core.HULL
        status[active[hit_a]]=2; status[active[hit_b]]=3
        hit_time[active[hit_a|hit_b]]=t+dt
        outside=(core.norm(xn)>=9e6)&(np.sum(xn*vn,axis=-1)>0)&~(hit_a|hit_b)
        status[active[outside]]=1
        exit_speed[active[outside]]=core.norm(vn[outside])
        exit_time[active[outside]]=t+dt
        x[active]=xn; v[active]=vn
    good=(status==1)&(exit_speed>=50)
    early_exit=(status==1)&(exit_time<=90*3600)
    early_good=early_exit&(exit_speed>=50)
    at90=dict(left=int(sum(early_exit)),hit_alpha=int(sum((status==2)&(hit_time<=90*3600))),
              hit_beta=int(sum((status==3)&(hit_time<=90*3600))),qualifying=int(sum(early_good)),
              qualifying_peri_range_m=[float(min_beta[early_good].min()),float(min_beta[early_good].max())])
    return dict(count=len(burns),horizon_h=160,dt_s=dt,
                left=int(sum(status==1)),hit_alpha=int(sum(status==2)),hit_beta=int(sum(status==3)),
                not_exited_by_horizon=int(sum(status==0)),qualifying=int(sum(good)),at_90_hours=at90,
                qualifying_peri_range_m=[float(min_beta[good].min()),float(min_beta[good].max())],
                flights=[dict(burn=float(b),time=float(t),status=int(s),beta_min=float(r),exit_speed=float(e),exit_time=float(et),hit_time=float(ht))
                         for b,t,s,r,e,et,ht in zip(burns,starts,status,min_beta,exit_speed,exit_time,hit_time)])

def finite_burn(dt=30):
    dv=14.; used=core.fuel(dv); thrust=24000*.975
    duration=used*320*core.G0/thrust
    start=3960-duration/2
    x,v=core.integrate(*core.arrival(),0,start,dt)
    direction=core.prograde(start,v)
    mdot=thrust/(320*core.G0)
    # Fourth-order full state integration; constant delivered thrust direction.
    state=np.concatenate((x,v,[core.MASS])); t=start
    def rhs(t,y):
        return np.concatenate((y[3:6],core.acceleration(t,y[:3])+thrust/y[6]*direction,[-mdot]))
    while t<start+duration-1e-10:
        h=min(.25,start+duration-t)
        a=rhs(t,state); b=rhs(t+h/2,state+a*h/2)
        c=rhs(t+h/2,state+b*h/2); d=rhs(t+h,state+c*h)
        state+=h*(a+2*b+2*c+d)/6; t+=h
    trace=core.integrate(state[:3],state[3:6],t,300000,dt,sample=True)
    return dict(duration_s=duration,propellant_kg=used,summary=precise_summary(trace))

def results():
    coarse=core.fly(dt=60); fine=core.fly(dt=30)
    base=precise_summary(fine)
    ref=precise_summary(coarse)
    heights=[]
    for kick,at in [(0.3,3960),(0.6,3960),(1,base['beta_peri_t']-8*3600),(1,base['beta_peri_t']-4*3600)]:
        tr=core.fly(dt=30,kicks=[(at,[0,0,kick])])
        ss=precise_summary(tr,dv=14+kick)
        t,x,v=tr
        before=(t>at+1)&(t<=base['beta_peri_t'])
        z=x[before,2]; tt=t[before]
        crossings=tt[1:][z[1:]*z[:-1]<0].tolist()
        heights.append(dict(kick_m_s=kick,kick_t=at,peri_z_m=ss['beta_peri_z'],
                            max_abs_z_before_peri=float(abs(z).max()),zero_crossings_before_peri=crossings,
                            exit_speed=ss['exit_speed']))
    sample_times=[0,3960,21600,64800,108000,172800,230000,259200]
    checkpoints=[]
    for t in sample_times:
        tr=core.fly(end=t,dt=30) if t>=3960 else core.integrate(*core.arrival(),0,t,30,sample=True)
        checkpoints.append(dict(t=t,position=tr[1][-1].tolist(),velocity=tr[2][-1].tolist()))
    t,x,v=fine
    j=core.jacobi(t,x,v)
    before=t<3960; after=t>=3960
    conservation=max(float(np.ptp(j[before])),float(np.ptp(j[after])))
    true_pass=core.fly(end=base['beta_peri_t'],dt=30)
    _,truth_burn_v=core.integrate(*core.arrival(),0,3960,30)
    shared_command=14*core.prograde(3960,truth_burn_v)
    nx,nv=core.integrate(*core.arrival(),0,3960,30,exponent=2)
    newton_pass=core.integrate(nx,nv+shared_command,3960,base['beta_peri_t'],30,exponent=2,sample=True)
    wrong_law=dict(position_error_at_true_peri_m=float(core.norm(true_pass[1][-1]-newton_pass[1][-1])),
                   forecast_beta_min_before_true_peri_m=core.summary(newton_pass)['beta_peri_m'],
                   command_time=3960,command_inertial_delta_v=shared_command.tolist(),
                   assumption='Same initial state and identical inertial command, fixed GM at r0; supplied true binary ephemeris in both, ship force exponent2 versus2.5. No estimator or horizon claim.')
    return dict(representative=base,
                representative_deltas=dict(beta_peri_m=base['beta_peri_m']-980000,
                    beta_peri_t_s=base['beta_peri_t']-30.1*3600,
                    beta_peri_speed=base['beta_peri_relative_speed']-65,
                    exit_speed=base['exit_speed']-66,exit_t_s=base['exit_t']-64*3600),
                convergence_60_vs_30={k:abs(base[k]-ref[k]) for k in ['beta_peri_m','beta_peri_t','beta_peri_relative_speed','exit_t','exit_speed']},
                jacobi_range_m2_s2=conservation,finite_main=finite_burn(),vertical=heights,same_burn_newton=wrong_law,
                fuel=dict(main_14_kg=core.fuel(14),main_remaining_kg=6000-core.fuel(14),
                    rcs_1_kg=core.fuel(1,core.MASS-core.fuel(14),220)),checkpoints=checkpoints,
                route_grid=route_grid())

if __name__=='__main__':
    import json
    from pathlib import Path
    data=results()
    Path(__file__).with_name('routes.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in data.items() if k not in ['route_grid','checkpoints']},indent=2))
    print({k:v for k,v in data['route_grid'].items() if k!='flights'})
