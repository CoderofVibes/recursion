"""One-command deterministic S8 regeneration; --check never writes results.

Only standard library and NumPy. No source, game, private scratch or network imports.
Run from any directory. Complete reference/ensemble replay takes several minutes.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import numpy as np
import core
import objective
import pass_table
import ring
import routes
import scattering
import seeds
import verification

ROOT=Path(__file__).resolve().parent

def encode(data):
    return json.dumps(data,indent=2,allow_nan=False)+'\n'

def check_inputs():
    inputs=json.loads((ROOT/'inputs.json').read_text(encoding='utf-8'))
    c=inputs['constants']
    assert c['exponent']==core.P and c['reference_radius_m']==core.R0
    assert [c['alpha_gm'],c['beta_gm']]==core.GM.tolist()
    assert [c['alpha_radius_m'],c['beta_radius_m']]==core.RADII.tolist()
    assert inputs['ship']['initialWetMass']==core.MASS
    assert c['binary_separation_m']==core.D and inputs['g0']==core.G0
    # Hull and every deployed/stowed prism fit inside conservative20m sphere.
    for appendage in inputs['appendages']:
        for config in ['stowedPolygon','deployedPolygon']:
            for x,y in appendage[config]:
                z=max(abs(appendage['zMin']),abs(appendage['zMax']))
                assert (x*x+y*y+z*z)**.5<core.HULL-1
    return inputs

def vectors(data):
    """Small index plus complete states in adjacent detailed references."""
    witness=data['ring-witness.json']
    sd=data['seeds.json']
    x0,v0=core.arrival()
    _,vburn=core.integrate(x0,v0,0,3960,30)
    main_vector=witness['policy']['main_dv']*core.prograde(3960,vburn)
    rejected=next(c for c in sd['catalogue']['candidates'] if not c['admitted'])
    rx,rv=core.arrival(np.pi+np.deg2rad(rejected['bearing_offset_deg']))
    return dict(schema='s8-reference-v1',units='m, s, kg, m/s, radians; inertial barycentric right-handed frame',
        inputs_file='inputs.json',
        tolerance=dict(ship_position_m=20,ship_velocity_m_s=.002,closest_clearance_m=200,event_time_s=120),
        comparison_semantics='Position/velocity tolerance applies at exact stored sample epochs, including the first sampled outward exit state; do not compare that state to an earlier interpolated gate crossing. Event time/clearance tolerances are separate. The wrong-law contact is refined to the20m-expanded surface; no penetrated sample is a flight state.',
        instructions='Use the exact stored states and impulses; do not port the RNG or replace the law with conic formulas. Refine collision events; no post-contact ship trajectory is physical.',
        informed_exit=dict(file='ring-witness.json',initial_ship=dict(t=0,position=x0.tolist(),velocity=v0.tolist()),
            commands=[dict(t=3960,delta_v=main_vector.tolist(),frame='inertial'),
                      dict(t=witness['policy']['kick_t'],delta_v=witness['policy']['kick_dv'],frame='inertial')],
            expected=witness['summary'],minimum_rock_clearance_m=witness['min_clearance_m'],
            description='Full Alpha-field and Beta-belt lifted assist; explicit initial rock states and all closest approaches in linked file'),
        wrong_law=dict(file='seeds.json',case=sd['wrong_law'],description='Newton300km plan, true Alpha impact and pre-impact frozen-forecast residual/abort'),
        rejected_seed=dict(file='seeds.json',candidate=rejected,initial_ship=dict(t=0,position=rx.tolist(),velocity=rv.tolist()),
            reason='No robust witness in declared first-window search; this does not prove the geometry impossible.',
            strict_combined_rule=dict(rejected=13,denominator=13,reason='No certified low-orbit-then-exit witness within committed16m/s budget')),
        ring_crossing=dict(file='ring-witness.json',closest_approaches=witness['closest_approaches'][:8],
            description='Same physical informed run; center distance includes stored rock radius plus20m conservative ship sphere'),
        analytic_checks_file='verification.json',scattering_file='scattering.json')

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true',help='recompute all data and compare exact serialized outputs')
    args=parser.parse_args()
    check_inputs()
    data={}
    def publish(name,result):
        serialized=encode(result)
        dest=ROOT/name
        if args.check:
            if not dest.exists() or dest.read_text(encoding='utf-8')!=serialized:
                raise AssertionError(f'{name} does not reproduce; rerun without --check only after reviewing the change')
        else:
            dest.write_text(serialized,encoding='utf-8',newline='\n')
        data[name]=result
        print(f'{"CHECKED" if args.check else "WROTE"} {name}',flush=True)
    for name,fn in [('scattering.json',scattering.results),('routes.json',routes.results),
                    ('pass-table.json',pass_table.results),('objective.json',objective.results),
                    ('seeds.json',seeds.generate),('verification.json',verification.results)]:
        publish(name,fn())
    for name,result in ring.generate_all().items():
        publish(name,result)
    publish('vectors.json',vectors(data))
    print(f'PASS: {len(data)} deterministic files; NumPy {np.__version__}',flush=True)

if __name__=='__main__':
    main()
