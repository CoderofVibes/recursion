"""A second integrator and analytic controls; meaningful reference tests."""
import math
import numpy as np
import core

def verlet(end,dt):
    x,v=core.arrival(); t=0.
    def force(t,x):
        a=core.OMEGA*t; c,s=math.cos(a),math.sin(a)
        ax=ay=az=0.
        for mu,r in [(1e10,-800000.),(2.5e9,3200000.)]:
            dx,dy,dz=x[0]-r*c,x[1]-r*s,x[2]
            r2=dx*dx+dy*dy+dz*dz
            f=-mu*1000/r2**1.75
            ax+=f*dx; ay+=f*dy; az+=f*dz
        return np.array([ax,ay,az])
    acc=force(t,x)
    while t<end-1e-9:
        if abs(t-3960)<1e-8:
            # Independently reconstruct Alpha velocity for the impulse.
            va=np.array([800000*core.OMEGA*math.sin(core.OMEGA*t),
                         -800000*core.OMEGA*math.cos(core.OMEGA*t),0.])
            u=v-va; v+=14*u/math.sqrt(float(u@u))
        h=min(dt,end-t)
        xn=x+v*h+acc*h*h/2
        an=force(t+h,xn)
        v+=(acc+an)*h/2; x=xn; acc=an; t+=h
    return x,v

def results():
    end=259200.
    tr=core.fly(end=end,dt=30)
    errors=[]
    for dt in [5.,2.5]:
        x,v=verlet(end,dt)
        errors.append(dict(dt=dt,position_m=float(core.norm(x-tr[1][-1])),
                           velocity_m_s=float(core.norm(v-tr[2][-1]))))
    assert errors[1]['position_m']<errors[0]['position_m']/3.9
    assert errors[1]['position_m']<10
    # Analytic source circular acceleration check by differentiating ephemeris.
    b,bv=core.bodies(12345)
    u=b[1]-b[0]; d=float(core.norm(u))
    f=np.array([core.GM[1]*1000*u/d**3.5,-core.GM[0]*1000*u/d**3.5])
    ephemeris_error=float(np.max(abs(f+core.OMEGA**2*b)))
    assert ephemeris_error<1e-16
    # Rotational equivariance of a coasting arrival and the entire pair.
    theta=.73
    q=np.array([[math.cos(theta),-math.sin(theta),0],
                [math.sin(theta),math.cos(theta),0],[0,0,1.]])
    xa,va=core.arrival(); xb,vb=core.arrival(math.pi+theta,theta)
    xa,va=core.integrate(xa,va,0,6000,30)
    xb,vb=core.integrate(xb,vb,0,6000,30,phase=theta)
    rotation_error=float(core.norm(xb-q@xa))
    assert rotation_error<1e-6
    return dict(independent_verlet_vs_rk4=errors,analytic_binary_acceleration_error=ephemeris_error,
                rotation_error_m=rotation_error)

if __name__=='__main__':
    import json
    from pathlib import Path
    data=results(); Path(__file__).with_name('verification.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(data,indent=2))
