"""Reconstruct exit-speed versus Beta distance on the fixed 1.1 h branch."""
import numpy as np
import core
from routes import precise_summary

def results():
    targets=np.array([680,830,980,1120,1250,1400,1570,1660])*1000.
    x,v=core.integrate(*core.arrival(),0,3960,60)
    u=core.prograde(3960,v)
    lower=np.full(len(targets),13.0); upper=np.full(len(targets),15.3)
    for _ in range(24):
        burns=(lower+upper)/2
        xx=np.broadcast_to(x,(len(targets),3)).copy(); vv=v+burns[:,None]*u
        minimum=np.full(len(targets),np.inf)
        for t in np.arange(3960,145000,120.):
            bp,_=core.bodies(t)
            minimum=np.minimum(minimum,core.norm(xx-bp[1]))
            xx,vv=core.rk4(t,xx,vv,120)
        lower=np.where(minimum<targets,burns,lower)
        upper=np.where(minimum>=targets,burns,upper)
    rows=[]
    for target,burn,claim in zip(targets,(lower+upper)/2,[(49,49),(64,64),(66,66),(64,64),(61,61),(57,60),(53,53),(51,51)]):
        s=precise_summary(core.fly(float(burn),dt=30),float(burn))
        rows.append(dict(target_peri_m=float(target),burn_m_s=float(burn),summary=s,
                         claim_speed_interval=list(claim),
                         difference_from_claim_interval=[s['exit_speed']-claim[0],s['exit_speed']-claim[1]]))
    lo=precise_summary(core.fly(13.99,dt=60)); hi=precise_summary(core.fly(14.01,dt=60))
    return dict(rows=rows,local_dperi_dv_m_per_m_s=(hi['beta_peri_m']-lo['beta_peri_m'])/.02)

if __name__=='__main__':
    import json
    from pathlib import Path
    d=results(); Path(__file__).with_name('pass-table.json').write_text(json.dumps(d,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(d,indent=2))
