"""S18 load gate. Python/numpy only; SI; no application imports or randomness.

Run from any directory: python tools/studies/s18/reference.py [--check]
Body-to-world quaternions wxyz; world angular momentum. Assumptions and
limitations, including endpoint-lumped line mass, in docs/studies/s18/README.md.
"""
from __future__ import annotations

import argparse
import hashlib
import itertools
import json
import math
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
BASE_PATH = ROOT / 'data/ship-baseline.json'
KIT_PATH = ROOT / 'docs/studies/s2/hardware-fragment.json'
BASE = json.loads(BASE_PATH.read_text())
KIT = json.loads(KIT_PATH.read_text())
G0 = BASE['constants']['g0']['value']
EYE = np.eye(3)
LINE_LENGTH = 30.
PAID_MASS = LINE_LENGTH*.04


def cross(a, b):
    return np.array([a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]])


def rotation(q):
    w, x, y, z = q / np.linalg.norm(q)
    return np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
                     [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
                     [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])


def quaternion(R):
    # Largest eigenvector of the symmetric attitude matrix; sign canonicalized.
    K = np.array([[R[0,0]-R[1,1]-R[2,2], R[1,0]+R[0,1], R[2,0]+R[0,2], R[2,1]-R[1,2]],
                  [R[1,0]+R[0,1], R[1,1]-R[0,0]-R[2,2], R[2,1]+R[1,2], R[0,2]-R[2,0]],
                  [R[2,0]+R[0,2], R[2,1]+R[1,2], R[2,2]-R[0,0]-R[1,1], R[1,0]-R[0,1]],
                  [R[2,1]-R[1,2], R[0,2]-R[2,0], R[1,0]-R[0,1], np.trace(R)]]) / 3
    q = np.linalg.eigh(K)[1][:, -1][[3,0,1,2]]
    return q if q[0] >= 0 else -q


def qdot(q, omega):
    return .5*np.r_[-np.dot(omega, q[1:]), q[0]*omega+cross(omega,q[1:])]


def properties(parts):
    mass = sum(p[1] for p in parts)
    com = sum(m*r for _,m,r,_ in parts)/mass
    tensor = np.zeros((3,3))
    for _,m,r,I in parts:
        a=r-com
        tensor += I+m*(np.dot(a,a)*EYE-np.outer(a,a))
    return mass, com, tensor


def ship(configuration='radiators', main_fuel=6000., kit=True, loaded=True):
    parts=[]
    app={a['id']:a for a in BASE['configuration']['appendages']}
    for p in BASE['equipment']:
        a=app.get(p['id'])
        if a:
            deployed = configuration=='allDeployed' or (configuration=='radiators' and p['id'].startswith('radiator')) or (configuration=='solar' and p['id'].startswith('solar'))
            key='deployed' if deployed else 'stowed'
            r=np.array(a[key+'Position'],float)
            I=np.diag([a[key+'InertiaRoll'],a[key+'InertiaPitch'],a[key+'Inertia']])
        else:
            r=np.array(p['position'],float)
            I=np.diag([p['intrinsicInertiaRoll'],p['intrinsicInertiaPitch'],p['intrinsicInertia']])
        parts.append((p['id'],p['mass'],r,I))
    for p in BASE['propellant']+BASE['reactants']:
        m=main_fuel if p['id']=='main-propellant' else p['initialMass']
        parts.append((p['id'],m,np.array(p['position'],float),EYE*m*p['intrinsicInertiaPerKg']))
    if kit:
        for p in KIT['equipment']:
            z=KIT['tetherProposal']['assemblyZ'][p['id']]+KIT['tetherProposal']['deployedDeltaZ'].get(p['id'],0)
            m=float(p['mass'])
            if loaded and p['id']=='tether-cassette': m-=PAID_MASS
            if loaded and p['id']=='tether-grapple': m-=15 # head at target
            parts.append((p['id'],m,np.array([-.35,0,z]),EYE*p['intrinsicInertia']*m/p['mass']))
        parts.append(('buffer-and-catcher',20.,np.array([-.35,0,2.6]),EYE*2))
        if loaded:
            # Lump half of the deployed line at each attachment. This is
            # an explicit low-frequency approximation, not a resolved cable.
            parts.append(('line-ship-half',PAID_MASS/2,np.array([-.35,0,3.2]),np.zeros((3,3))))
    return (*properties(parts),parts)


def target(layout):
    a,b,c={'compact':(200.,200.,100.), 'spread':(600.,600.,100.), 'cross':(1000.,400.,100.)}[layout]
    parts=[('hub',100000.,np.zeros(3),EYE*(.4*100000*50**2))]
    # Four uniform radial rods, 25 t each, 3 km long, 2 m square envelope.
    for axis,sgn in itertools.product([0,1],[-1,1]):
        r=np.zeros(3);r[axis]=sgn*1500
        I=np.full(3,25000*(3000**2+2**2)/12); I[axis]=25000*8/12
        parts.append((f'arm-{axis}-{sgn}',25000.,r,np.diag(I)))
    for i,s in enumerate(itertools.product([-1,1],repeat=3)):
        parts.append((f'ballast-{i}',225000.,np.array(s)*[a,b,c],EYE*(.4*225000*20**2)))
    bare=properties(parts)
    # Head + target half of line attached at the surveyed rail.
    parts.append(('head-and-half-line',15+PAID_MASS/2,np.array([3000.,0,0]),EYE*.2))
    return (*properties(parts),bare,parts)


def allocate(torque):
    """Real jet subset: four z jets for roll/pitch, axial jets for yaw.

    No net force; one vertical and one axial valve per pod at most. Continuous
    duty relaxation of the 10 Ns pulse allocator, explicitly bounded in report.
    """
    positions=np.array([[5.,2.,0],[5.,-2.,0],[-5.,2.,0],[-5.,-2.,0]])
    fz=torque[0]*positions[:,1]/16-torque[1]*positions[:,0]/100
    fx=-torque[2]*positions[:,1]/16
    scale=min(1.,200/max(1e-30,float(np.max(np.abs(fz))),float(np.max(np.abs(fx)))))
    forces=np.column_stack([fx*scale,np.zeros(4),fz*scale])
    actual=sum(cross(p,f) for p,f in zip(positions,forces))
    flow=float(np.sum(np.abs(forces)))/(220*G0)
    return actual,flow,scale,forces


class Model:
    def __init__(self,layout='compact',fuel=6000.,radial=.1,angle=-.06,gm=1e10):
        self.layout=layout; self.radial=radial;self.angle=angle;self.gm=gm
        ms,cs,Is,self.parts=ship(main_fuel=fuel)
        mt,ct,It,self.bare_target,_=target(layout)
        self.mass=[ms,mt];self.inertia=[Is,It];self.inv=[np.linalg.inv(Is),np.linalg.inv(It)]
        self.anchor=[np.array([-.35,0,3.2])-cs,np.array([3000.,0,0])-ct]
        self.com=[cs,ct]
        self.spin=.004;self.length=LINE_LENGTH;self.krope=1e6/LINE_LENGTH;self.kbuffer=20000.;self.damper=8000.
        self.origin=np.array([3e6,0,0.])
        self.global_R=rotation(np.array([math.cos(.3),math.sin(.3),0,0]))

    def initial(self):
        y=np.zeros(51)
        n=np.array([math.cos(self.angle),math.sin(self.angle),0.])
        Rs=self.global_R@np.column_stack([[-n[1],n[0],0],[0,0,-1],-n])
        Rt=self.global_R
        y[13:16]=self.origin+Rt@self.com[1]
        p=y[13:16]+Rt@self.anchor[1]
        y[:3]=p+self.length*(Rt@n)-Rs@self.anchor[0]
        for j,R,I in [(0,Rs,self.inertia[0]),(13,Rt,self.inertia[1])]:
            y[j+6:j+10]=quaternion(R)
            y[j+10:j+13]=R@I@R.T@(Rt@np.array([0,0,self.spin]))
        # Rail and ship endpoint velocities; 0.1 m/s radial take-up.
        omega=Rt@np.array([0,0,self.spin])
        target_endpoint_velocity=cross(omega,Rt@self.anchor[1])
        y[3:6]=target_endpoint_velocity+cross(omega,self.length*(Rt@n))+self.radial*(Rt@n)-cross(omega,Rs@self.anchor[0])
        y[43:49]=y[:6] # gravity-only counterfactual
        return y

    def gravity(self,x):
        r=np.linalg.norm(x)
        return -self.gm*1000*x/r**3.5

    def geometry(self,y):
        R=[rotation(y[6:10]),rotation(y[19:23])]
        r=[R[i]@self.anchor[i] for i in range(2)]
        w=[R[i]@self.inv[i]@R[i].T@y[13*i+10:13*i+13] for i in range(2)]
        d=y[:3]+r[0]-y[13:16]-r[1];dist=np.linalg.norm(d);n=d/dist
        velocity=y[3:6]+cross(w[0],r[0])-y[16:19]-cross(w[1],r[1])
        return R,r,w,dist,n,velocity

    def rhs(self,y,attached=True,control=True):
        R,r,w,d,n,velocity=self.geometry(y)
        T=self.krope*max(0.,d-self.length-y[26]) if attached else 0.
        sd=(T-self.kbuffer*y[26])/self.damper
        request=self.inertia[0]@(.4*np.where(np.abs(np.array([0,-self.spin,0])-R[0].T@w[0])>.0004,np.array([0,-self.spin,0])-R[0].T@w[0],0)) if control else np.zeros(3)
        tau,flow,scale,_=allocate(request)
        out=np.zeros_like(y)
        f=[-T*n,T*n]
        for i in range(2):
            j=13*i;g=self.gravity(y[j:j+3]);tc=R[i]@tau if i==0 else np.zeros(3)
            out[j:j+3]=y[j+3:j+6]
            out[j+3:j+6]=g+f[i]/self.mass[i]
            out[j+6:j+10]=qdot(y[j+6:j+10],w[i])
            out[j+10:j+13]=cross(r[i],f[i])+tc
            out[31:34]+=self.mass[i]*g
            out[34:37]+=cross(y[j:j+3]-self.origin,self.mass[i]*g)
        out[26]=sd
        out[27]=self.damper*sd*sd
        out[28]=np.dot(R[0]@tau,w[0])
        out[29]=flow
        out[37:40]=R[0]@tau
        out[40:43]=f[0]
        out[43:46]=y[46:49];out[46:49]=self.gravity(y[43:46])
        # Scalar probe regression integral: phi'' = torque_z / Izz for a
        # principal-axis target. Full target dynamics above remains 3D.
        out[49]=(R[1].T@cross(r[1],f[1]))[2]
        out[50]=y[49]
        angle=math.acos(np.clip(np.dot(R[0][:,2],-n),-1,1))
        line_rate=np.linalg.norm(cross(n,velocity))/d
        return out,{'T':T,'distance':d,'rate':np.linalg.norm(w[0]),'line_rate':line_rate,'angle':angle,'torque':tau,'scale':scale,'specific_force':f[0]/self.mass[0], 'target_rate':R[1].T@w[1]}

    def step(self,y,h,attached=True,control=True):
        a=self.rhs(y,attached,control)[0]
        b=self.rhs(y+h*a/2,attached,control)[0]
        c=self.rhs(y+h*b/2,attached,control)[0]
        d=self.rhs(y+h*c,attached,control)[0]
        z=y+h*(a+2*b+2*c+d)/6
        for j in [6,19]:z[j:j+4]/=np.linalg.norm(z[j:j+4])
        return z

    def invariants(self,y,attached=True):
        R,_,w,d,_,_=self.geometry(y)
        E=P=H=None
        E=0.;P=np.zeros(3);H=np.zeros(3)
        for i in range(2):
            j=13*i;x=y[j:j+3];v=y[j+3:j+6];L=y[j+10:j+13]
            E+=.5*self.mass[i]*np.dot(v,v)+.5*np.dot(w[i],L)-self.mass[i]*self.gm*1000/(1.5*np.linalg.norm(x)**1.5)
            P+=self.mass[i]*v;H+=cross(x-self.origin,self.mass[i]*v)+L
        U=.5*self.kbuffer*y[26]**2
        if attached:U+=.5*self.krope*max(0.,d-self.length-y[26])**2
        return E+U+y[27]+y[30]-y[28],P-y[31:34],H-y[34:37]-y[37:40]


def simulate(layout='compact',h=.1,release=400.,end=420.,fuel=6000.,radial=.1,angle=-.06,gm=1e10,control=True,break_limit=None):
    model=Model(layout,fuel,radial,angle,gm);y=model.initial();initial=y.copy();attached=True
    E0,P0,H0=model.invariants(y)
    peak={k:0. for k in ['T','rate','line_rate','angle','buffer','accel','torque','brake_power']}
    min_scale=1.;errors=np.zeros(3);samples=[];event=None
    tick_count=round(end/h)
    for step in range(tick_count+1):
        t=step*h
        if attached and abs(t-release)<h/4:
            _,pre_values=model.rhs(y,True,control)
            for key in ['T','rate','line_rate','angle']:
                peak[key]=max(peak[key],float(pre_values[key]))
            before=y.copy();_,_,_,d,_,_=model.geometry(y)
            rope_energy=.5*model.krope*max(0.,d-model.length-y[26])**2
            y[30]+=rope_energy;attached=False
            event={'kind':'commanded-release','t':t,'tension_before_N':float(pre_values['T']),'before':before.tolist(),'after':y.tolist(),'exported_line_energy_J':rope_energy,'buffer_energy_J':.5*model.kbuffer*y[26]**2}
        derivative,v=model.rhs(y,attached,control)
        for k in ['T','rate','line_rate','angle']:
            if attached:peak[k]=max(peak[k],float(v[k]))
        peak['buffer']=max(peak['buffer'],float(y[26]))
        peak['accel']=max(peak['accel'],float(np.linalg.norm(v['specific_force'])))
        peak['torque']=max(peak['torque'],float(np.linalg.norm(v['torque'])))
        peak['brake_power']=max(peak['brake_power'],float(derivative[27]))
        min_scale=min(min_scale,v['scale'])
        E,P,H=model.invariants(y,attached)
        errors=np.maximum(errors,[abs(E-E0),np.linalg.norm(P-P0),np.linalg.norm(H-H0)])
        if step%round(10/h)==0 or step==tick_count:
            samples.append({'t':t,'state':y.tolist(),'tension_N':float(v['T']),'target_rate_body':v['target_rate'].tolist(),'ship_rate_rad_s':float(v['rate']),'line_angle_rad':float(v['angle'])})
        if step==tick_count:break
        next_y=model.step(y,h,attached,control)
        if attached and break_limit is not None and model.rhs(next_y,True,control)[1]['T']>=break_limit:
            lo,hi=0.,h
            for _ in range(32):
                mid=(lo+hi)/2
                if model.rhs(model.step(y,mid,True,control),True,control)[1]['T']>=break_limit:hi=mid
                else:lo=mid
            y_break=model.step(y,hi,True,control)
            before=y_break.copy();_,_,_,distance,_,_=model.geometry(y_break)
            cable_energy=.5*model.krope*max(0.,distance-model.length-y_break[26])**2
            crush_energy=.5*model.kbuffer*y_break[26]**2
            y_break[30]+=cable_energy;y_break[27]+=crush_energy;y_break[26]=0.
            attached=False;peak['T']=max(peak['T'],float(break_limit))
            peak['buffer']=max(peak['buffer'],float(before[26]))
            peak['accel']=max(peak['accel'],float(break_limit/model.mass[0]))
            event={'kind':'weakened-line-break','t':t+hi,'threshold_N':break_limit,'before':before.tolist(),'after':y_break.tolist(),'exported_line_energy_J':cable_energy,'crush_energy_J':crush_energy,'damage':failures(model.mass[0])['assumed_after_loaded_cut_or_failure']}
            next_y=model.step(y_break,h-hi,False,control)
        y=next_y
    dv=y[3:6]-y[46:49]
    egress=model.global_R@np.array([-1.,-1.,0.])/math.sqrt(2)
    spin0=.5*initial[23:26]@(model.global_R@model.inv[1]@model.global_R.T@initial[23:26])
    R=rotation(y[19:23]);spin1=.5*y[23:26]@(R@model.inv[1]@R.T@y[23:26])
    result={'layout':layout,'dt_s':h,'release_s':release,'end_s':end,'initial':initial.tolist(),'final':y.tolist(),'peak':peak,'minimum_allocator_scale':float(min_scale),'delta_v_world_m_s':dv.tolist(),'delta_v_norm_m_s':float(np.linalg.norm(dv)),'useful_component_m_s':float(dv@egress),'speed_gain_m_s':float(np.linalg.norm(y[3:6])-np.linalg.norm(y[46:49])),'target_spin_energy_change_J':float(spin1-spin0),'damper_heat_J':float(y[27]),'rcs_kg':float(y[29]),'control_work_J':float(y[28]),'max_ledger_errors':dict(zip(['energy_J','momentum_Ns','angular_kg_m2_s'],errors.tolist())),'release':event,'samples':samples}
    if event and 'crush_energy_J' in event:
        result['damper_heat_J']-=event['crush_energy_J']
        result['crush_energy_J']=event['crush_energy_J']
    result['parameters']={
        'mass_kg':model.mass,'body_com_m':model.com,'body_inertia_kg_m2':model.inertia,
        'body_attachment_from_com_m':model.anchor,'main_fuel_kg':fuel,
        'line_length_m':model.length,'rope_stiffness_N_m':model.krope,
        'buffer_stiffness_N_m':model.kbuffer,'buffer_damping_Ns_m':model.damper,
        'source_GM_m3_s2':model.gm,'source_origin_world_m':[0,0,0],
        'moment_ledger_origin_world_m':model.origin,'gravity_r0_m':1e6,
        'initial_radial_mismatch_m_s':radial,'initial_line_angle_rad':angle,
        'control_enabled':control,'body_rate_command_rad_s':[0,-model.spin,0],
        'break_threshold_N':break_limit,
    }
    return model,result


def clean(value):
    if isinstance(value,np.ndarray):return clean(value.tolist())
    if isinstance(value,(float,np.floating)):
        if not math.isfinite(value):raise ValueError('Nonfinite result')
        return float(f'{float(value):.12g}') if abs(value)>1e-14 else 0.
    if isinstance(value,dict):return {k:clean(v) for k,v in value.items()}
    if isinstance(value,(list,tuple)):return [clean(v) for v in value]
    return value


def probe(model,case):
    """Identifiability from a declared pose/torque observation design, no RNG.

    This uses synthetic observations sampled from the integrated pull. It is a
    sensitivity calculation; production must acquire metric features and torque.
    Fit phi0 and omega0 as nuisance parameters so they cannot fake inertia.
    """
    records=[s for s in case['samples'] if s['t']<=400]
    t=np.array([s['t'] for s in records]);states=np.array([s['state'] for s in records])
    phi=np.unwrap([math.atan2((model.global_R.T@rotation(y[19:23]))[1,0],(model.global_R.T@rotation(y[19:23]))[0,0]) for y in states])
    # A separately acquired 120 s unloaded arc establishes the initial rate.
    # Without it a short early impulse is degenerate with unknown initial spin.
    pre=np.arange(-120.,0.,10.)
    t=np.r_[pre,t];phi=np.r_[model.spin*pre,phi]
    kernel=np.r_[np.zeros(len(pre)),states[:,50]]
    Z=kernel/1e12
    A=np.column_stack([np.ones(len(t)),t/400,Z])
    fit=np.linalg.lstsq(A,phi,rcond=None)[0]
    covariance=np.linalg.inv(A.T@A)*(.0002**2)
    inertia_fit=1e12/fit[2]
    frac_white=math.sqrt(covariance[2,2])/abs(fit[2])
    # 5% torque/metric systematic prior is correlated across samples; does not
    # shrink as sqrt(N). Never pretend passive images alone supply this scale.
    frac_total=math.hypot(frac_white,.05)
    free=np.column_stack([np.ones(len(t)),t])
    free_fit=free@np.linalg.lstsq(free,phi,rcond=None)[0]
    return {'assumed_pose_sigma_rad':.0002,'assumed_torque_scale_sigma_fraction':.05,'estimated_Izz_kg_m2':inertia_fit,'actual_Izz_kg_m2':model.inertia[1][2,2],'fractional_sigma':frac_total,'max_passive_fit_residual_rad':float(np.max(np.abs(phi-free_fit))),'max_loaded_fit_residual_rad':float(np.max(np.abs(phi-A@fit))),'phase_observations_rad':phi.tolist(),'integrated_torque_kernel_Nms2':kernel.tolist(),'observation_times_s':t.tolist()}


def budgets():
    mass=ship(kit=False)[0];installed=ship(loaded=False)[0];loaded=ship()[0]
    ve=320*G0
    rows=[]
    for name in ['stowed','radiators','solar','allDeployed']:
        for fuel in [6000.,3000.,0.]:
            m,c,I,_=ship(name,fuel)
            rows.append({'configuration':name,'main_fuel_kg':fuel,'mass_kg':m,'com_m':c,'tensor_kg_m2':I,'principal_moments_kg_m2':np.linalg.eigvalsh(I),'dorsal_3500N_torque_Nm':cross(np.array([-.35,0,3.2])-c,[0,0,3500])})
    return {'baseline_mass_kg':mass,'installed_mass_kg':installed,'rigid_loaded_mass_kg':loaded-PAID_MASS/2,'effective_loaded_mass_kg':loaded,'kit_mass_kg':275,'released_inventory_kg':40,'retained_kit_kg':235,'baseline_main_delta_v_m_s':ve*math.log(mass/(mass-6000)),'kit_main_delta_v_m_s':ve*math.log(installed/(installed-6000)),'kit_penalty_m_s':ve*(math.log(mass/(mass-6000))-math.log(installed/(installed-6000))),'mass_properties':rows,'monitor_source_W':30+35/.95,'retrieval_6000N_03m_s':{'electrical_W':2500,'mechanical_W':1800,'heat_W':700},'brake_6000N_05m_s_60s':{'power_W':3000,'heat_J':180000,'adiabatic_rise_K':3}}


def failures(mass):
    rows=[]
    for T in [3500.,4300.,8000.,16000.]:
        L=LINE_LENGTH;EA=1e6;density=.04;c=math.sqrt(EA/density);Ub=T*T/(2*20000);Ul=T*T*L/(2*EA)
        rows.append({'load_N':T,'rope_energy_J':Ul,'buffer_energy_J':Ub,'combined_energy_J':Ul+Ub,'buffer_stroke_m':T/20000,'wave_one_way_s':L/c,'wave_impulse_bound_Ns':2*T*L/c,'ship_delta_v_wave_bound_m_s':2*T*L/c/mass,'uncontained_8kg_slider_speed_energy_ceiling_m_s':math.sqrt(2*(Ul+Ub)/8),'catcher_4000J_margin_J':4000-Ul-Ub})
    # Explicit emergency-damage state, not a probabilistic health decrement.
    return {'rows':rows,'assumed_after_loaded_cut_or_failure':{'line':'broken-or-cut','cassetteUsable':False,'bufferCatcher':'crushed','mast':'jammed-deployed','kit_z_max_m':3.5,'tetherPowerBranch':'isolated','repairWithinRun':False},'damage_boundary':'catcher capacity is an ASSUMED engineering requirement, not a simulated collision or a qualified component'}


def capture(mass):
    # Independent 1D analytic payout capture, 1 s force ramp then constant
    # mechanical 3 kN slip. Not a simulation of rail interception or rotor pull.
    meff=1/(1/mass+1/2000000);F=3000.;tau=1.;v0=.5
    v1=v0-F*tau/(2*meff)
    tstop=tau+meff*v1/F
    distance=v0*tau-F*tau*tau/(6*meff)+meff*v1*v1/(2*F)
    return {'assumptions':'one dimensional normal take-up, no centrifugal forcing, 1 s brake ramp, 3000 N thereafter','effective_mass_kg':meff,'initial_relative_speed_m_s':v0,'stop_time_s':tstop,'payout_m':distance,'heat_J':.5*meff*v0*v0,'peak_power_W':F*v1,'peak_tension_N':F,'locked_rope_without_buffer_screen_N':v0*math.sqrt(meff*20000)}


def launch_screen():
    # Analytic momentum/energy solution for a conservative one-dimensional
    # snowplow: all paid material picked up at head speed, initially at rest.
    # d(m v)/dt = -drag, m = headMass + density*s.
    m0=15.;mu=.04;drag=.1;v0=2.;L=LINE_LENGTH
    # v(s)^2 = ((m0*v0)^2 - drag/mu*(m(s)^2-m0^2))/m(s)^2.
    def speed(s):
        m=m0+mu*s
        return math.sqrt((m0*v0)**2-drag/mu*(m*m-m0*m0))/m
    grid=np.linspace(0,L,1001)
    flight=float(np.trapezoid([1/speed(s) for s in grid],grid))
    vf=speed(L);energy_final=.5*(m0+mu*L)*vf*vf
    heat_pickup=.5*m0*v0*v0-drag*L-energy_final
    n=np.array([math.cos(-.06),math.sin(-.06),0.])
    w=np.array([0,0,.004]);rail=np.array([3000.,0,0.])
    vship=cross(w,rail+L*n)+.1*n
    ship_initial=rail+L*n-vship*flight
    rail_initial=np.array([3000*math.cos(.004*flight),-3000*math.sin(.004*flight),0.])
    relative_at_latch=cross(w,L*n)+(.1-vf)*n
    transverse=np.linalg.norm(cross(n,relative_at_latch))
    return {'model':'point-endpoint ballistic screen; line pickup/drag energy included; no collision or latch simulation','flight_s':flight,'initial_range_m':np.linalg.norm(ship_initial-rail_initial),'launch_head_speed_m_s':2.,'final_head_relative_ship_m_s':vf,'head_relative_rail_speed_m_s':np.linalg.norm(relative_at_latch),'head_impact_energy_J':.5*15*np.dot(relative_at_latch,relative_at_latch),'transverse_speed_m_s':transverse,'worst_025m_rail_dwell_s':(.3-.25)/transverse,'launcher_trim_rad':.004*flight,'energy_J':{'initial':30.,'final_moving_head_line':energy_final,'guide_heat':drag*L,'inelastic_pickup_heat':heat_pickup},'initial_ship_relative_velocity_m_s':vship-cross(w,rail_initial)}


def algebra_checks():
    checks=[]
    def check(name,ok):
        assert ok,name;checks.append(name)
    m,c,I,_=ship(kit=False)
    check('final 2G wet mass',m==30374)
    check('final 2G radiators inertia',np.max(np.abs(np.diag(I)-[102615,307412,325049]))<1)
    for config in ['compact','spread','cross']:
        m,c,I,bare,_=target(config)
        check(config+' fixed bare mass and center',bare[0]==2000000 and np.linalg.norm(bare[1])<1e-12)
        moments=np.linalg.eigvalsh(bare[2])
        check(config+' physical inertia',min(moments)>0 and max(moments)<sum(moments)-max(moments))
    tau=np.array([200.,-300.,150.]);actual,_,scale,forces=allocate(tau)
    check('real jet couples deliver demanded torque',np.linalg.norm(actual-tau)<1e-10 and scale==1 and np.linalg.norm(np.sum(forces,axis=0))<1e-10)
    model=Model();y=model.initial();y[:3]+=model.global_R@np.array([.12,.07,.03]);y[26]=.03
    dy,values=model.rhs(y,control=False)
    eps=.001 # avoids cancellation of ~1e9 angular momentum at a 3e6 m origin
    Ep,Pp,Hp=model.invariants(y+eps*dy);Em,Pm,Hm=model.invariants(y-eps*dy)
    check('3D differential energy including damper and P4',abs((Ep-Em)/(2*eps))<.2)
    check('3D differential linear and angular momentum',np.linalg.norm((Pp-Pm)/(2*eps))<.001 and np.linalg.norm((Hp-Hm)/(2*eps))<.1)
    # Rotate an arbitrary off-axis internal-force state. No gravity/control:
    model.gm=0;d0,v0=model.rhs(y,control=False)
    Q=rotation(np.array([.8,.2,-.3,.4]));z=y.copy()
    for j in [0,13]:
        for off in [0,3,10]:z[j+off:j+off+3]=Q@y[j+off:j+off+3]
        z[j+6:j+10]=quaternion(Q@rotation(y[j+6:j+10]))
    dz,vz=model.rhs(z,control=False)
    check('3D rotation covariance',np.linalg.norm(dz[3:6]-Q@d0[3:6])<1e-7 and np.linalg.norm(dz[23:26]-Q@d0[23:26])<.1)
    check('force is unilateral',model.rhs(model.initial())[1]['T']<1e-4)
    # JSON state replay is exact in this runtime.
    saved=np.array(json.loads(json.dumps(y.tolist())))
    check('serialized state restart',np.array_equal(model.step(y,.1),model.step(saved,.1)))
    check('passive spin has no inertia-scale information',np.linalg.matrix_rank(np.column_stack([np.ones(41),np.arange(41),np.zeros(41)]))==2)
    return checks


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');parser.add_argument('--quick',action='store_true');args=parser.parse_args()
    checks=algebra_checks();cases=[];probes=[]
    for layout in ['compact','spread','cross']:
        model,case=simulate(layout)
        cases.append(case)
        probes.append(probe(model,case))
        print(layout,json.dumps(clean({k:case[k] for k in ['peak','delta_v_norm_m_s','useful_component_m_s','speed_gain_m_s','target_spin_energy_change_J','rcs_kg','max_ledger_errors']})),flush=True)
    if args.quick:return
    diagnosis=[]
    for layout in ['compact','spread','cross']:
        model,case=simulate(layout,angle=-math.pi/2,radial=.25,release=4,end=120)
        diagnosis.append({'trajectory':case,'measurement_design':probe(model,case)})
    _,refined=simulate(h=.05)
    _,depleted=simulate(fuel=0.)
    _,early=simulate(release=200.)
    _,weakened=simulate(break_limit=3000,end=30)
    _,weakened_fine=simulate(break_limit=3000,end=30,h=.05)
    nominal=cases[0]
    refinement={'position_m':np.linalg.norm(np.array(nominal['final'][:3])-refined['final'][:3]),'velocity_m_s':np.linalg.norm(np.array(nominal['final'][3:6])-refined['final'][3:6]),'peak_tension_N':abs(nominal['peak']['T']-refined['peak']['T']),'rcs_kg':abs(nominal['rcs_kg']-refined['rcs_kg'])}
    for case in cases+[refined,depleted,early]:
        assert case['peak']['T']<8000
        assert case['peak']['rate']<.008
        assert case['peak']['buffer']<.4
        assert case['peak']['brake_power']<4000
        assert case['peak']['angle']<math.radians(35)
        assert case['minimum_allocator_scale']==1
        assert case['max_ledger_errors']['energy_J']<2
        assert case['max_ledger_errors']['momentum_Ns']<1e-5
        assert case['max_ledger_errors']['angular_kg_m2_s']<.1
        assert case['release']['before'][:26]==case['release']['after'][:26]
    assert refinement['position_m']<.1 and refinement['velocity_m_s']<.001 and refinement['peak_tension_N']<20
    checks+=['six load/rate/thermal/torque envelopes','six external-work conservation ledgers','six continuous release states','half-step refinement']
    b=budgets()
    for case in cases:
        assert case['useful_component_m_s']>17
        assert case['rcs_kg']<5
    checks+=['three useful velocity changes','three RCS budgets']
    output={'schema':'s18-v1','units':'SI; quaternions wxyz body-to-world; angular momenta WORLD','state_layout':{'0:13':'ship x[3],v[3],q[4],L[3]','13:26':'target x,v,q,L','26':'buffer extension','27':'damper heat','28':'RCS mechanical work','29':'RCS propellant cost (fixed-mass dynamics approximation)','30':'released cable elastic energy','31:34':'external gravity impulse','34:37':'external gravity angular impulse about initial target origin','37:40':'external RCS angular impulse','40:43':'ship tether impulse','43:49':'same-start gravity-only coast x,v','49':'integrated target body-z torque','50':'twice-integrated target body-z torque'},'inputs_sha256':{str(p.relative_to(ROOT)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in [BASE_PATH,KIT_PATH]},'assumptions':{'spin_rad_s':.004,'arm_radius_m':3000,'initial_line_angle_rad':-.06,'initial_radial_speed_m_s':.1,'deployed_length_m':50,'rope_EA_N':1000000,'buffer_stiffness_N_m':20000,'buffer_viscosity_Ns_m':8000,'inclination_rad':.6,'gravity_GM_m3_s2':1e10,'gravity_r0_m':1e6,'initial_source_distance_m':3e6},'budgets':b,'configurations':{name:{'mass_kg':target(name)[3][0],'com_m':target(name)[3][1],'tensor_kg_m2':target(name)[3][2],'ballast_centers_m':[p[2] for p in target(name)[4] if p[0].startswith('ballast')]} for name in ['compact','spread','cross']},'cases':cases,'refinement':refinement,'depleted_ship':depleted,'early_abort':early,'inertia_measurement_design':probes,'capture_payout_auxiliary':capture(ship()[0]),'failure_bounds':failures(ship()[0]),'checks':checks}
    output['assumptions']['deployed_length_m']=LINE_LENGTH
    output['diagnostic_pulls']=diagnosis
    output['launch_screen']=launch_screen()
    output['weakened_line']=weakened
    output['weakened_line_refinement']={
        'event_time_difference_s':abs(weakened['release']['t']-weakened_fine['release']['t']),
        'position_difference_m':np.linalg.norm(np.array(weakened['final'][:3])-weakened_fine['final'][:3]),
        'velocity_difference_m_s':np.linalg.norm(np.array(weakened['final'][3:6])-weakened_fine['final'][3:6]),
    }
    assert output['weakened_line_refinement']['event_time_difference_s']<.001
    for failure in [weakened,weakened_fine]:
        assert failure['release']['before'][:26]==failure['release']['after'][:26]
        assert failure['max_ledger_errors']['energy_J']<.1
        assert failure['release']['damage']['repairWithinRun'] is False
        assert json.loads(json.dumps(failure['release']['damage']))==failure['release']['damage']
    checks+=['substep weakened-line break and refinement','failure energy and continuous kinematics','persistent damage JSON roundtrip']
    assert 20<output['launch_screen']['initial_range_m']<50
    assert output['launch_screen']['head_impact_energy_J']<60
    assert output['launch_screen']['worst_025m_rail_dwell_s']>.04
    assert output['launch_screen']['launcher_trim_rad']<math.radians(5)
    for trial in diagnosis:
        c=trial['trajectory'];p=trial['measurement_design']
        assert c['peak']['T']<4300 and c['peak']['angle']<.02
        assert c['peak']['rate']<.008 and c['peak']['brake_power']<4000
        assert abs(p['estimated_Izz_kg_m2']/p['actual_Izz_kg_m2']-1)<1e-5
        assert p['fractional_sigma']<.16
    checks+=['ballistic launch energy and geometry screen','three measurable diagnostic pulls (declared sensor assumptions)']
    print('auxiliary',json.dumps(clean({'refinement':refinement,'depleted_peak':depleted['peak'],'depleted_rcs_kg':depleted['rcs_kg'],'early_useful':early['useful_component_m_s'],'probe_fractional_sigma':[p['fractional_sigma'] for p in probes],'kit_penalty_m_s':b['kit_penalty_m_s']})),flush=True)
    encoded=json.dumps(clean(output),indent=2,allow_nan=False)+'\n'
    path=HERE/'vectors.json'
    if args.check:
        assert path.read_text()==encoded,'vectors.json is stale'
        print('PASS: byte-identical reference vectors')
    else:
        path.write_text(encoded,encoding='utf-8',newline='\n');print('Wrote tools/studies/s18/vectors.json')


if __name__=='__main__':main()
