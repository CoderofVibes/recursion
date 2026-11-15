"""Adversarial departure controls, independent of game objective code.

Uses only the declarative 9,000 km / 50 m/s / 16 m/s gate and S8 core.
``results()`` returns JSON-ready analytics and a finite control grid.
"""
from __future__ import annotations
import json
import math
from pathlib import Path
import numpy as np
from core import GM, R0, D, OMEGA, RADII, HULL, bodies, arrival, norm, rk4, jacobi, fly, summary


def _bisect(function, lo, hi):
    for _ in range(90):
        mid = (lo+hi)/2
        if function(mid) > 0:
            hi = mid
        else:
            lo = mid
    return (lo+hi)/2


def analytics():
    """Classical Jacobi C=-2(E-omega Lz), necks and one-body controls."""
    def f(u):
        return u - .8*(u+.2)/abs(u+.2)**3.5 - .2*(u-.8)/abs(u-.8)**3.5
    necks = {}
    for name, bracket in {"L1": (-.2+1e-8, .8-1e-8),
                          "L2": (.8+1e-8, 3),
                          "L3": (-3, -.2-1e-8)}.items():
        x = D*_bisect(f, *bracket)
        p = np.array([x, 0., 0.])
        v = np.array([0., OMEGA*x, 0.])
        necks[name] = {"x_m": x, "C_m2_s2": float(-2*jacobi(0,p,v))}
    p, v = arrival()
    c0 = float(-2*jacobi(0,p,v))
    conservative_all_bearings_C = (
        2*GM[0]*math.sqrt(R0)/(1.5*R0**1.5)
        +2*GM[1]*math.sqrt(R0)/(1.5*(D+R0)**1.5)
        +OMEGA**2*(R0-.2*D)**2-(100-OMEGA*R0)**2)
    # dC/dcos(bearing)=0 when distance to Beta equals D; cos=R0/(2D).
    exact_min_C = (2*GM[0]*math.sqrt(R0)/(1.5*R0**1.5)
                   +2*GM[1]*math.sqrt(R0)/(1.5*D**1.5)
                   +OMEGA**2*((.2*D)**2+.8*R0**2)-(100-OMEGA*R0)**2)
    # A fixed isolated Alpha is an analytic control, not the actual binary.
    one_body = []
    for dv in (0., 14., 16.):
        vinf2 = (100+dv)**2 - 2*GM[0]*math.sqrt(R0)/(1.5*R0**1.5)
        v9sq = vinf2 + 2*GM[0]*math.sqrt(R0)/(1.5*(9e6)**1.5)
        radial9sq = v9sq - ((100+dv)*R0/(9e6))**2
        one_body.append({"delta_v_m_s": dv, "vinfinity_squared_m2_s2": vinf2,
                         "speed_at_9Mm_m_s": math.sqrt(v9sq) if radial9sq>=0 else None,
                         "radial_speed_squared_at_9Mm_m2_s2": radial9sq,
                         "unbound": bool(vinf2>=0)})
    return {"nominal_arrival_C_m2_s2": c0,
            "nominal_radial_16_C_m2_s2": c0-16**2,
            "all_arrival_bearings_conservative_C_lower_bound_m2_s2": conservative_all_bearings_C,
            "all_arrival_bearings_exact_minimum_C_m2_s2": exact_min_C,
            "all_arrival_bearings_radial_16_minimum_C_m2_s2": exact_min_C-16**2,
            "necks": necks,
            "fixed_isolated_alpha_prograde_controls": one_body}


def controls(dt=60., horizon=540000., cases=None):
    """First orbit burn grid, exact command grid, swept body contacts.

    One instantaneous burn at t=0,600,...,62400 s, magnitude14 or16 m/s,
    either prograde or outward radial in the instantaneous Alpha frame.
    No rocks; a physically valid body contact terminates its trajectory.
    """
    full_grid = cases is None
    if cases is None:
        cases = [("drift", 0., 0.)]
        cases += [(mode, dv, float(t)) for mode in ("prograde", "radial")
                  for dv in (14.,16.) for t in range(0,62401,600)]
    size = len(cases)
    p0,v0 = arrival()
    x = np.tile(p0,(size,1)); v = np.tile(v0,(size,1))
    active = np.ones(size,dtype=bool)
    fired = np.zeros(size,dtype=bool)
    mode = np.array([c[0] for c in cases])
    dv = np.array([c[1] for c in cases])
    burn_t = np.array([c[2] for c in cases])
    beta_min = np.full(size,np.inf)
    alpha_min = np.full(size,np.inf)
    exit_speed = np.full(size,np.nan)
    exit_t = np.full(size,np.nan)
    impact_body = np.full(size,-1)
    t = 0.
    while t < horizon-1e-8:
        bp,bv = bodies(t)
        burn_now = active & (~fired) & (np.abs(burn_t-t)<1e-8)
        radial = x-bp[0]
        tangent = v-bv[0]
        direction = np.where((mode=="radial")[:,None],radial,tangent)
        direction /= norm(direction)[:,None]
        v[burn_now] += dv[burn_now,None]*direction[burn_now]
        fired[burn_now] = True
        h = min(dt,horizon-t)
        nx,nv = rk4(t,x,v,h)
        nbp,_ = bodies(t+h)
        rel0 = x[:,None,:]-bp
        rel1 = nx[:,None,:]-nbp
        dr = rel1-rel0
        denominator = np.sum(dr*dr,axis=-1)
        frac = np.clip(-np.sum(rel0*dr,axis=-1)/np.maximum(denominator,1e-30),0,1)
        nearest = norm(rel0+frac[:,:,None]*dr)
        beta_min[active] = np.minimum(beta_min[active],nearest[active,1])
        alpha_min[active] = np.minimum(alpha_min[active],nearest[active,0])
        contacts = nearest <= RADII+HULL
        collide = active & contacts.any(axis=1)
        impact_body[collide] = np.argmin(nearest[collide]-RADII,axis=1)
        crossed = active & (~collide) & (norm(nx)>=9e6) & (np.sum(nx*nv,axis=-1)>0)
        # Linear event interpolation at this small step. Cross-check dt30.
        if crossed.any():
            j = np.flatnonzero(crossed)
            q = np.clip((9e6-norm(x[j]))/(norm(nx[j])-norm(x[j])),0,1)
            exit_speed[j] = norm(v[j]+q[:,None]*(nv[j]-v[j]))
            exit_t[j] = t+h*q
        continue_now = active & (~collide) & (~crossed)
        x[continue_now] = nx[continue_now]; v[continue_now] = nv[continue_now]
        active &= (~collide) & (~crossed)
        t += h
    rows = []
    for i,(kind,amount,epoch) in enumerate(cases):
        rows.append({"kind":kind,"delta_v_m_s":amount,"burn_t_s":epoch,
                     "alpha_min_m":float(alpha_min[i]),"beta_min_m":float(beta_min[i]),
                     "exit_speed_m_s":None if np.isnan(exit_speed[i]) else float(exit_speed[i]),
                     "exit_t_s":None if np.isnan(exit_t[i]) else float(exit_t[i]),
                     "impact_body":None if impact_body[i]<0 else ("alpha","beta")[impact_body[i]],
                     "qualifies":bool(exit_speed[i]>=50 and amount<=16)})
    summaries = []
    for kind in ("prograde","radial"):
        for amount in (14.,16.):
            subset = [r for r in rows if r['kind']==kind and r['delta_v_m_s']==amount]
            direct = [r for r in subset if r['beta_min_m']>=2e6 and r['exit_speed_m_s'] is not None]
            best = max(direct,key=lambda r:r['exit_speed_m_s']) if direct else None
            summaries.append({"kind":kind,"delta_v_m_s":amount,"count":len(subset),
                              "exits":sum(r['exit_speed_m_s'] is not None for r in subset),
                              "qualifying":sum(r['qualifies'] for r in subset),
                              "direct_exits_beta_at_least_2Mm":len(direct),
                              "best_direct":best})
    return {"dt_s":dt,"horizon_s":horizon,"first_orbit_burn_grid_s":[0,62400,600] if full_grid else None,
            "direct_definition":"minimum Beta centre distance at least 2,000 km",
            "summaries":summaries,"rows":rows}


def results():
    from routes import precise_summary
    trace = fly(14.,3960.,dt=30.)
    reference = precise_summary(trace,dv=14.)
    times, positions, _ = trace
    bp,bv = bodies(times)
    relative = positions-bp[:,1]
    ranges = norm(relative)
    inside = ranges<=2e6
    beta_acceleration = -GM[1]*math.sqrt(R0)*relative/ranges[:,None]**3.5
    beta_power = np.sum(bv[:,1]*beta_acceleration,axis=-1)
    beta_work = {"sphere_radius_m":2e6,"dt_s":30.,
                 "first_inside_sample_t_s":float(times[inside][0]),
                 "last_inside_sample_t_s":float(times[inside][-1]),
                 "integral_v_beta_dot_a_beta_m2_s2":float(np.trapezoid(beta_power[inside],times[inside])),
                 "scope":"sampled inside-sphere interval; illustrative witness, no proposed acceptance threshold"}
    grid = controls()
    gains = [{"plain_burn_delta_v_m_s":row['delta_v_m_s'],
              "plain_exit_speed_m_s":row['best_direct']['exit_speed_m_s'],
              "slingshot_gain_m_s":reference['exit_speed']-row['best_direct']['exit_speed_m_s']}
             for row in grid['summaries'] if row['kind']=='prograde']
    refine = controls(dt=30.,cases=[('prograde',14.,43200.),('prograde',16.,46200.)])
    errors = [abs(coarse['plain_exit_speed_m_s']-fine['exit_speed_m_s'])
              for coarse,fine in zip(gains,refine['rows'])]
    assert max(errors) < 1e-5
    return {"analytics":analytics(),"controls":grid,
            "representative_14m_s":reference,"gain_against_best_direct_grid":gains,
            "representative_beta_work_witness":beta_work,
            "best_direct_refined_dt30":refine['rows'],
            "best_direct_dt60_dt30_speed_difference_m_s":errors,
            "unrestricted_arrival_counterexample":{
                "position_m":[9000001.,0.,0.],"velocity_m_s":[51.,0.,0.],
                "spent_delta_v_m_s":0.,"passes_declared_gate":True,
                "admissible_nominal_arrival":False}}


if __name__=="__main__":
    result=results()
    Path(__file__).with_name("objective.json").write_text(json.dumps(result,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"analytics":result['analytics'],"summaries":result['controls']['summaries']},indent=2))
