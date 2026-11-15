"""S2 deterministic hardware arithmetic; stdlib + numpy, no game dependencies.

Run: python tools/studies/s2/reference.py
Writes reference-vectors.json beside this script. No flight/route simulation.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[3]
BASE_PATH = ROOT / "data/ship-baseline.json"
KIT_PATH = ROOT / "docs/studies/s2/hardware-fragment.json"
OUTPUT = Path(__file__).with_name("reference-vectors.json")
B = json.loads(BASE_PATH.read_text(encoding="utf-8"))
K = json.loads(KIT_PATH.read_text(encoding="utf-8"))
P = K["tetherProposal"]
L = P["line"]
D = P["drive"]
E = P["storedEnergy"]
CHECKS: list[str] = []


def check(name, condition):
    if not condition:
        raise AssertionError(name)
    CHECKS.append(name)


def close(a, b, tol=1e-8):
    return bool(np.allclose(a, b, atol=tol, rtol=tol))


def shift_tensor(m, r):
    r = np.asarray(r, dtype=float)
    return m * (np.dot(r, r) * np.eye(3) - np.outer(r, r))


def combine(parts):
    mass = sum(m for m, _, _ in parts)
    center = sum((m * r for m, r, _ in parts), np.zeros(3)) / mass
    tensor = sum((i + shift_tensor(m, r - center) for m, r, i in parts), np.zeros((3, 3)))
    return mass, center, tensor


def base_parts(configuration, remaining=None):
    """Exact 1C COM/Iz; isotropic TOTAL Iz is the current 2G step-1 placeholder."""
    remaining = remaining or {}
    appendages = {a["id"]: a for a in B["configuration"]["appendages"]}
    parts = []
    for e in B["equipment"]:
        pos, iz = e["position"], e["intrinsicInertia"]
        dep = configuration == "allDeployed" or (
            configuration == "radiators" and e["id"].startswith("radiator-")
        ) or (configuration == "solar" and e["id"].startswith("solar-"))
        if e["id"] in appendages and dep:
            pos = appendages[e["id"]]["deployedPosition"]
            iz = appendages[e["id"]]["deployedInertia"]
        parts.append((e["mass"], np.array([*pos, 0.0]), np.eye(3) * iz))
    for r in B["propellant"] + B["reactants"]:
        m = remaining.get(r["id"], r["initialMass"])
        parts.append((m, np.array([*r["position"], 0.0]), np.eye(3) * m * r["intrinsicInertiaPerKg"]))
    m, c, tensor = combine(parts)
    return [(m, c, np.eye(3) * tensor[2, 2])]


def kit_parts(mast=0.0, paid=0.0, head_launched=False, cassette_released=False):
    parts = []
    for e in K["equipment"]:
        mass = e["mass"]
        if e["id"] == "tether-cassette":
            mass = 0.0 if cassette_released else mass - L["linearDensity"] * paid
        if e["id"] == "tether-grapple" and head_launched:
            mass -= L["headMass"]
        if not mass:
            continue
        z = P["assemblyZ"][e["id"]] + mast * P["deployedDeltaZ"].get(e["id"], 0)
        pos = np.array([*e["position"], z])
        # Partial assembly inertia scales with retained mass, a labelled study approximation.
        tensor = np.eye(3) * e["intrinsicInertia"] * mass / e["mass"]
        parts.append((mass, pos, tensor))
    return parts


def serial_mass(parts):
    m, c, i = combine(parts)
    return {"mass": m, "center": c.tolist(), "tensor": i.tolist(),
            "principalMoments": np.linalg.eigvalsh(i).tolist()}


def dispatch(overrides=None, extras=None):
    overrides, extras = overrides or {}, extras or {}
    direct = {"main-a": 0.0, "main-b": 0.0, "essential": 0.0}
    equipment_heat = 0.0
    for e in B["equipment"]:
        if e["subsystem"] in ("generation", "storage"):
            continue
        mode = e["modes"][overrides.get(e["id"], e["initialMode"])]
        if e["bus"]:
            direct["main-b" if e["bus"] == "payload" else e["bus"]] += mode["power"]
        equipment_heat += mode["heat"]
    for bus, power in extras.items():
        direct["main-b" if bus == "payload" else bus] += power
    eta = next(b["converterEfficiency"] for b in B["buses"] if b["id"] == "essential")
    conversion = direct["essential"] * (1 / eta - 1)
    a = direct["main-a"] + direct["essential"] / eta
    b = direct["main-b"]
    fc_limit = B["generation"]["fuelCell"]["maxPowerPerStack"]
    return {"mainA": a, "mainB": b, "essential": direct["essential"],
            "total": a+b, "converterLoss": conversion,
            "batteryRequiredA": max(0.0, a-fc_limit), "batteryRequiredB": max(0.0, b-fc_limit),
            "baselineEquipmentHeat": equipment_heat}


def wear_delta(paid_distance, tension, duration, snag_distance=0.0):
    w = P["wear"]
    ratio = tension / L["workingTension"]
    bend = abs(paid_distance) / w["bendingBudget"]
    abrasion = abs(paid_distance) * ratio**2 / w["abrasionBudget"]
    creep = w["creepRate"] * duration * ratio**4
    snag = snag_distance * w["snagDamagePerMeter"]
    return {"bending": bend, "abrasion": abrasion, "creep": creep,
            "snag": snag, "total": bend+abrasion+creep+snag}


def main():
    fields = set(B["equipment"][-1])
    ids = [e["id"] for e in K["equipment"]]
    check("eight unique, new assembly IDs", len(ids) == len(set(ids)) == 8 and not set(ids) & {e["id"] for e in B["equipment"]})
    nodes = {n["id"] for n in B["thermalNodes"] + K["thermalNodes"]}
    buses = {b["id"] for b in B["buses"]} | {None}
    for e in K["equipment"]:
        check(e["id"] + " baseline assembly shape", set(e) == fields and len(e["position"]) == 2)
        check(e["id"] + " references", e["thermalNode"] in nodes and e["bus"] in buses and e["initialMode"] in e["modes"])
        check(e["id"] + " modes nonnegative", all(v >= 0 for mode in e["modes"].values() for v in mode.values()))
    check("255 kg kit mass", sum(e["mass"] for e in K["equipment"]) == 255)
    check("line cassette partition", L["length"] * L["linearDensity"] + L["carrierMass"] == 25)
    check("spring launch energy", close(0.5*L["headMass"]*E["launchSpeed"]**2, E["launchSpring"]))
    cases = {}
    for config in ["stowed", "radiators", "solar", "allDeployed"]:
        for mast in [0, 1]:
            cases[f"wet-{config}-mast-{mast}"] = serial_mass(base_parts(config) + kit_parts(mast))
    for paid in [50, 500]:
        case = serial_mass(base_parts("radiators") + kit_parts(1, paid, True))
        case["flexibleLineAndHeadMass"] = L["linearDensity"]*paid+L["headMass"]
        check(f"{paid} m deployment conserves total mass", close(case["mass"] + case["flexibleLineAndHeadMass"], 30629))
        cases[f"paid-{paid}"] = case
    cases["released"] = serial_mass(base_parts("radiators") + kit_parts(1, 500, True, True))
    cases["released-at-50"] = serial_mass(base_parts("radiators") + kit_parts(1, 50, True, True))
    cases["main-empty"] = serial_mass(base_parts("radiators", {"main-propellant": 0}) + kit_parts(1))
    check("release loses only 40 kg kit inventory", close(cases["released"]["mass"], 30589))
    check("partial payout release partitions 17 kg remote plus 23 kg cassette", close(cases["paid-50"]["mass"]-cases["released-at-50"]["mass"],23) and close(cases["paid-50"]["flexibleLineAndHeadMass"],17))
    for name, case in cases.items():
        check(name + " tensor physically admissible", min(case["principalMoments"]) > 0 and max(case["principalMoments"]) <= sum(case["principalMoments"])/2 + 1e-8)
    # Rotation covariance of the complete rigid mass sum, including a nonplanar axis.
    axis = np.array([1.0, 2.0, 3.0]); axis /= np.linalg.norm(axis)
    x, y, z = axis
    cross = np.array([[0,-z,y], [z,0,-x], [-y,x,0]])
    angle = 0.71
    rot = np.eye(3)*math.cos(angle)+(1-math.cos(angle))*np.outer(axis,axis)+math.sin(angle)*cross
    parts = base_parts("allDeployed") + kit_parts(1)
    m, center, tensor = combine(parts)
    mr, cr, ir = combine([(pm, rot@r, rot@ii@rot.T) for pm,r,ii in parts])
    check("3D rigid rotation covariance", close(m,mr) and close(cr,rot@center) and close(ir,rot@tensor@rot.T))
    mount = np.array(P["geometry"]["fairleadDeployed"])
    torque_cases = {}
    for name in ["wet-radiators-mast-1", "main-empty"]:
        c = np.array(cases[name]["center"])
        arm = mount-c
        torque_cases[name] = {"arm": arm.tolist(), "normalTorque": np.cross(arm,[0,0,6000]).tolist(),
                              "alignedDirection": (arm/np.linalg.norm(arm)).tolist(),
                              "twoDegreeTorque": 6000*np.linalg.norm(arm)*math.sin(math.radians(2)),
                              "fifteenDegreeTorque": 6000*np.linalg.norm(arm)*math.sin(math.radians(15))}
        check(name + " force through COM no torque", close(np.cross(arm,arm/np.linalg.norm(arm)*6000),np.zeros(3)))
    mass = cases["paid-50"]["mass"]
    elastic = []
    for length in [50, 500]:
        k = L["axialRigidity"]/length
        tension = L["nominalTension"]
        for closing in [0.5, 2.0]:
            energy = 0.5*mass*closing**2
            elastic.append({"length":length, "closingSpeed":closing, "stiffness":k,
                            "extensionAt6kN":tension/k, "elasticEnergyAt6kN":tension*tension/(2*k),
                            "lockedUndampedPeak":closing*math.sqrt(mass*k),
                            "radialKineticEnergyInfiniteTarget":energy,
                            "idealConstant6kNStoppingDistance":energy/tension,
                            "idealConstant6kNStoppingTime":mass*closing/tension,
                            "initialBrakePowerAt6kN":tension*closing})
    input_reel = D["overhead"] + 6000*0.3/D["efficiency"]
    reel_heat = input_reel-6000*0.3
    check("reel power ledger", close(input_reel, 2500) and close(reel_heat,700))
    brake_power = 6000*0.5
    brake_capacity = next(n["capacity"] for n in K["thermalNodes"] if n["id"] == "tether-brake")
    check("brake ledger", close(brake_power*60,180000) and close(brake_power*60/brake_capacity,3))
    budgets = {
        "arrival":dispatch(),
        "observing":dispatch(extras={"essential":35,"payload":30}),
        "reel6kN03mps":dispatch(extras={"essential":35,"payload":30+input_reel}),
        "reelHighRecorder":dispatch({"black-box":"high"}, {"essential":35,"payload":30+input_reel}),
        "reelMaxPlusIon":dispatch({"ion-drive":"firing"},{"essential":35,"payload":30+D["inputMax"]}),
    }
    check("isolated B bus shortage exposed", budgets["reelMaxPlusIon"]["batteryRequiredB"] > B["generation"]["battery"]["maxDischargePowerPerPack"])
    mission_wear = wear_delta(1000,6000,1800)
    check("wear monotonic and modest normal deployment", 0 < mission_wear["total"] < 0.01 and wear_delta(1000,6000,1800,2)["total"] > 0.2)
    # Mechanical head launch conserves momentum; speed is relative to the carrier.
    launch_mass = cases["wet-radiators-mast-1"]["mass"]
    recoil = -L["headMass"]*E["launchSpeed"]/launch_mass
    head_v = E["launchSpeed"]+recoil
    check("launch momentum closes", close((launch_mass-L["headMass"])*recoil + L["headMass"]*head_v,0))
    launch_ke = 0.5*(launch_mass-L["headMass"])*recoil**2 + 0.5*L["headMass"]*head_v**2
    launch_loss = E["launchSpring"]-launch_ke
    check("launch spring ledger including finite carrier", 0 <= launch_loss < 0.02 and close(launch_ke+launch_loss,30))
    grapple_arm=next(e["modes"]["arm"] for e in K["equipment"] if e["id"]=="tether-grapple")
    check("arming includes jaw spring", close((grapple_arm["power"]-grapple_arm["heat"])*E["armDuration"],E["launchSpring"]+E["jawSpring"]))
    # A screen, not a simulated throw: spend drag and a conservative 2 m/s line KE allowance.
    throw_residual=launch_ke - D["freePayoutDrag"]*50 - 0.5*L["linearDensity"]*50*E["launchSpeed"]**2
    check("low drag 50 m throw energy screen", throw_residual>0)
    capture=P["geometry"]
    rail_transverse=(capture["jawAperture"]-capture["railDiameterMax"])/capture["latchClosingTime"]
    check("largest rail rejects fast transverse pass in dwell screen", rail_transverse < capture["headContactSpeedMax"] and close(rail_transverse,1.25))
    eject_mass=23.0
    after_release=cases["released"]["mass"]
    reduced=eject_mass*after_release/(eject_mass+after_release)
    eject_relative=math.sqrt(2*E["releaseEjectionEnergy"]/reduced)
    eject_ship=-eject_mass/(after_release+eject_mass)*eject_relative
    eject_carrier=eject_relative+eject_ship
    check("release ejection momentum ledger", close(after_release*eject_ship+eject_mass*eject_carrier,0))
    check("release ejection energy ledger", close(0.5*after_release*eject_ship**2+0.5*eject_mass*eject_carrier**2,E["releaseEjectionEnergy"]))
    # IMU reports non-gravitational force, even if an unrelated gravity field changes.
    specific_force = 6000/mass
    check("tether IMU signal meaningful", specific_force > 1000*B["sensing"]["imu"]["accelerationSigma"])
    handson_rate=0.01  # Current src/contracts/commands.ts; a capability constraint, not a new rating.
    circle_rate=math.sqrt(6000/(500*mass))
    check("500 m fixed-point 6 kN swing exceeds inherited hands-on rate", circle_rate > handson_rate)
    g0=B["constants"]["g0"]["value"]
    rocket_old=g0*320*math.log(30374/(30374-6000))
    rocket_new=g0*320*math.log(30629/(30629-6000))
    result = {
        "label":"DEMONSTRATED: arithmetic and invariants only, with ASSUMED inputs; not a route or flexible-line simulation",
        "inputSha256":{str(p.relative_to(ROOT)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in [BASE_PATH,KIT_PATH]},
        "baseline3DLimitation":"Inherited 2G step-1 total isotropic yaw inertia; replace after the physical 3D baseline lands. Kit tensor and rotations are 3D.",
        "massCases":cases, "torqueCases":torque_cases, "elasticScreening":elastic, "powerCases":budgets,
        "derived":{
            "kitMassFraction":255/30374, "oldMainDeltaV":rocket_old,"newMainDeltaV":rocket_new,
            "reelInput":input_reel,"reelHeat":reel_heat,"reelSpeedAt6kNInputMax":(D["inputMax"]-D["overhead"])*D["efficiency"]/6000,
            "reelDrumTorqueAt6kN":6000*D["effectiveDrumRadius"],
            "brake60sHeat":brake_power*60,"brake60sAdiabaticRise":brake_power*60/brake_capacity,
            "brakeTimeToWarnAt4kWNoCooling":brake_capacity*(330-295)/4000,
            "brakeSteadyHeatToServiceAt330K":D["brakePumpedConductance"]*(330-295),
            "brakePassiveTimeConstant":brake_capacity/D["brakePassiveConductance"],
            "tetherSpecificForceAt6kN":specific_force,"launchRecoil":recoil,
            "launchSpringLoss":launch_loss,"launchKineticEnergy":launch_ke,
            "fiftyMeterThrowResidualEnergyScreen":throw_residual,
            "largestRailTransverseDwellSpeedCeiling":rail_transverse,
            "partialReleaseEjectShipRecoil":eject_ship,"partialReleaseEjectRelativeSpeed":eject_relative,
            "fixedPointCircularSpeedAt500m6kN":math.sqrt(6000*500/mass),
            "fixedPointAngularRateAt500m6kN":math.sqrt(6000/(500*mass)),
            "fixedPointTensionAt500mInheritedHandsonRate":mass*500*handson_rate**2,
            "fixedPointRadiusAt6kNInheritedHandsonRate":6000/(mass*handson_rate**2),
            "lineWaveSpeed":math.sqrt(L["axialRigidity"]/L["linearDensity"]),
            "waveTravel500m":500/math.sqrt(L["axialRigidity"]/L["linearDensity"]),
            "elasticShipSpeedEnergyBound500m":math.sqrt(2*9000/mass),
            "elasticLineSpeedEnergyBound500m":math.sqrt(2*9000/20),
            "normalWearExample":mission_wear,
            "loadedSnagTwoMetersWear":wear_delta(1000,6000,1800,2),
        }, "checks":CHECKS
    }
    encoded = json.dumps(result,indent=2,sort_keys=True,allow_nan=False)+"\n"
    OUTPUT.write_text(encoded,encoding="utf-8",newline="\n")
    print(f"PASS: {len(CHECKS)} checks; wrote {OUTPUT.relative_to(ROOT)}")
    print(json.dumps(result["derived"],indent=2))


if __name__ == "__main__":
    main()
