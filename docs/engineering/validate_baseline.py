"""Check the 1C proposal and its generated numerical appendix (Python stdlib only).

Run from any directory. --write-doc refreshes only the marked numerical appendix.
This is a document/data arithmetic check, not a flight simulator or playtest.
"""
import argparse
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data/ship-baseline.json"
DOC = ROOT / "docs/engineering/ship-baseline.md"
START = "<!-- BEGIN BASELINE NUMBERS -->"
END = "<!-- END BASELINE NUMBERS -->"


def near(a, b, tolerance=1e-8):
    assert math.isclose(a, b, rel_tol=tolerance, abs_tol=tolerance), (a, b)


def f(value):
    if isinstance(value, float):
        return format(value, ".9g")
    if isinstance(value, list):
        return "[" + ", ".join(f(v) for v in value) + "]"
    return str(value)


def numeric_rows(obj, path="", label="ASSUMED", source=None):
    """Preserve label inheritance; collapse numeric vectors for readable tables."""
    if isinstance(obj, dict):
        label, source = obj.get("label", label), obj.get("source", source)
        for key, value in obj.items():
            if key not in ("label", "source"):
                yield from numeric_rows(value, f"{path}.{key}".strip("."), label, source)
    elif isinstance(obj, list):
        if obj and all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in obj):
            yield path, obj, label, source
        else:
            for i, value in enumerate(obj):
                name = value.get("id", str(i)) if isinstance(value, dict) else str(i)
                yield from numeric_rows(value, f"{path}[{name}]", label, source)
    elif isinstance(obj, (int, float)) and not isinstance(obj, bool):
        yield path, obj, label, source


def deployed_set(d, configuration):
    return {a["id"] for a in d["configuration"]["appendages"]
            if configuration == "allDeployed" or
            (configuration == "radiators" and a["id"].startswith("radiator")) or
            (configuration == "solar" and a["id"].startswith("solar"))}


def mass_parts(d, configuration="stowed", remaining=None, deployed_ids=None):
    """(mass, [x, y, z], [roll, pitch, yaw] intrinsic inertia) of every part."""
    remaining = remaining or {}
    if deployed_ids is None:
        deployed_ids = deployed_set(d, configuration)
    parts = []
    app = {a["id"]: a for a in d["configuration"]["appendages"]}
    for e in d["equipment"]:
        pos = e["position"]
        inertia = [e["intrinsicInertiaRoll"], e["intrinsicInertiaPitch"], e["intrinsicInertia"]]
        if e["id"] in deployed_ids:
            a = app[e["id"]]
            pos = a["deployedPosition"]
            inertia = [a["deployedInertiaRoll"], a["deployedInertiaPitch"], a["deployedInertia"]]
        parts.append((e["mass"], pos, inertia))
    for r in d["propellant"] + d["reactants"]:
        m = remaining.get(r["id"], r["initialMass"])
        parts.append((m, r["position"], [m * r["intrinsicInertiaPerKg"]] * 3))
    return parts


def mass_properties(d, configuration="stowed", remaining=None, deployed_ids=None):
    """Mass, planar centre and yaw inertia exactly as 1C computed them (heights never enter)."""
    parts = mass_parts(d, configuration, remaining, deployed_ids)
    mass = sum(m for m, _, _ in parts)
    center = [sum(m * p[k] for m, p, _ in parts) / mass for k in range(2)]
    inertia = sum(i[2] + m * sum((p[k] - center[k])**2 for k in range(2)) for m, p, i in parts)
    return mass, center, inertia


def jacobi(t):
    """Eigenvalues of a symmetric 3x3 by cyclic Jacobi rotations, kept in x, y, z order
    (smaller-angle rotations, so a nearly diagonal tensor keeps its axes), and the accumulated
    rotation (columns are the principal axes)."""
    a = [row[:] for row in t]
    v = [[1.0 if i == j else 0.0 for j in range(3)] for i in range(3)]
    for _ in range(30):
        if abs(a[0][1]) + abs(a[0][2]) + abs(a[1][2]) < 1e-9:
            break
        for p, q in ((0, 1), (0, 2), (1, 2)):
            if a[p][q] == 0:
                continue
            theta = (a[q][q] - a[p][p]) / (2 * a[p][q])
            tan = math.copysign(1, theta) / (abs(theta) + math.sqrt(theta * theta + 1))
            c = 1 / math.sqrt(tan * tan + 1)
            sn = tan * c
            for k in range(3):
                akp, akq = a[k][p], a[k][q]
                a[k][p], a[k][q] = c * akp - sn * akq, sn * akp + c * akq
            for k in range(3):
                apk, aqk = a[p][k], a[q][k]
                a[p][k], a[q][k] = c * apk - sn * aqk, sn * apk + c * aqk
            for k in range(3):
                vkp, vkq = v[k][p], v[k][q]
                v[k][p], v[k][q] = c * vkp - sn * vkq, sn * vkp + c * vkq
    return [a[0][0], a[1][1], a[2][2]], v


def mass_properties_3d(d, configuration="stowed", remaining=None, deployed_ids=None):
    """Mass, centre [x, y, z], inertia tensor about the centre (body axes, 3x3), principal
    moments (about x', y', z') and the tilt of the principal frame from the body frame (rad)."""
    parts = mass_parts(d, configuration, remaining, deployed_ids)
    mass = sum(m for m, _, _ in parts)
    c = [sum(m * p[k] for m, p, _ in parts) / mass for k in range(3)]
    t = [[0.0] * 3 for _ in range(3)]
    for m, p, i in parts:
        r = [p[k] - c[k] for k in range(3)]
        r2 = sum(x * x for x in r)
        for j in range(3):
            t[j][j] += i[j] + m * (r2 - r[j] * r[j])
            for k in range(3):
                if j != k:
                    t[j][k] -= m * r[j] * r[k]
    moments, axes = jacobi(t)
    tilt = math.acos(max(-1.0, min(1.0, (axes[0][0] + axes[1][1] + axes[2][2] - 1) / 2)))
    return mass, c, t, moments, tilt


def cross(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def rcs_authority(d, bank="a"):
    """Largest zero-net-force torque about each body axis (both signs) and largest force along
    each axis, from every jet of a bank that helps, about the structural origin. Each torque
    set is a set of couples, so its torque is the same about the centre of mass."""
    eq = {e["id"]: e for e in d["equipment"]}
    rcs = d["propulsion"]["rcs"]
    thrust = rcs["thrustPerJet"]
    jets = [j for j in rcs["jets"] if j["bank"] == bank]
    arm = lambda j: cross(eq[j["equipmentId"]]["position"], j["direction"])
    torque = {}
    for k, axis in enumerate(("roll", "pitch", "yaw")):
        pair = []
        for sign in (-1, 1):
            used = [j for j in jets if sign * arm(j)[k] > 1e-9]
            total = sum(arm(j)[k] for j in used) * thrust
            net = [sum(j["direction"][c] for j in used) * thrust for c in range(3)]
            other = [sum(arm(j)[c] for j in used) * thrust for c in range(3) if c != k]
            assert all(abs(x) < 1e-9 for x in net + other), (axis, sign, net, other)
            per_pod = {}
            for j in used:
                per_pod[j["equipmentId"]] = per_pod.get(j["equipmentId"], 0) + 1
            assert max(per_pod.values()) <= rcs["maxSimultaneousJetsPerPod"], (axis, per_pod)
            pair.append(total)
        torque[axis] = pair
    force = {}
    for k, axis in enumerate("xyz"):
        force[axis] = [sum(min(0, j["direction"][k]) for j in jets) * thrust,
                       sum(max(0, j["direction"][k]) for j in jets) * thrust]
    return torque, force


def budget(d, scenario):
    """Steady, zero solar, full service; no battery charge, deployment or failures."""
    essential = heat = 0.0
    local = {"main-a":0.0,"main-b":0.0}
    for e in d["equipment"]:
        if e["subsystem"] in ("generation", "storage"):
            continue
        m = e["modes"][scenario["overrides"].get(e["id"], e["initialMode"])]
        if e["bus"] == "essential":
            essential += m["power"]
        elif e["bus"]:
            local["main-b" if e["bus"] == "payload" else e["bus"]] += m["power"]
        heat += m["heat"]
    eta = next(b["converterEfficiency"] for b in d["buses"] if b["id"] == "essential")
    loss = essential * (1 / eta - 1)
    local["main-a"] += essential + loss
    demand = sum(local.values())
    cap=d["generation"]["fuelCell"]["maxPowerPerStack"]
    generation = sum(min(load,cap) for load in local.values())
    if scenario.get("tieClosed",False):
        generation = min(demand, 2*cap, generation+d["power"]["tieMaxPower"])
    deficit = demand - generation
    fc_heat = generation * (1 / d["generation"]["fuelCell"]["netEfficiencyHHV"] - 1)
    battery_heat = deficit * (1 / d["generation"]["battery"]["dischargeEfficiency"] - 1)
    return demand, heat + loss + fc_heat + battery_heat, deficit, essential


def thermal_check(d, scenario):
    """Steady reference check: heat paths have capacity, regulated area has range."""
    _,total,_,essential=budget(d,scenario)
    heat={n["id"]:0.0 for n in d["thermalNodes"]}
    for e in d["equipment"]:
        if e["subsystem"] in ("generation","storage"):
            continue
        mode=e["modes"][scenario["overrides"].get(e["id"],e["initialMode"])]
        heat[e["thermalNode"]] += mode["heat"]
    # Dynamic source/battery/converter losses go to service; the static table
    # above deliberately excludes generator endpoint ratings.
    heat["service"] += total-sum(heat.values())
    targets={n["id"]:n["controlTargetTemperature"] for n in d["thermalNodes"]}
    water=next(x for x in d["thermalLoops"] if x["id"]=="internal-water")
    hx=d["thermalLinks"][0]
    external=next(x for x in d["thermalLoops"] if x["id"]=="external-ammonia")
    for flow,link in ((heat["cabin"],water),(heat["cabin"]+heat["hx-water"],hx),(heat["service"],external)):
        cap=min(link["maxHeatTransport"],link["conductance"]*(targets[link["from"]]-targets[link["to"]]))
        assert 0 <= flow <= cap, (scenario["id"],link["id"],flow,cap)
    r=d["radiators"]
    deployed=scenario["configuration"] in ("radiators","allDeployed")
    area=2*r["emittingAreaPerWing" if deployed else "stowedEffectiveAreaPerWing"]
    full=r["emissivity"]*d["constants"]["sigma"]["value"]*area*r["referenceViewFactor"]*(r["louverTargetTemperature"]**4-r["referenceSinkTemperature"]**4)
    if deployed:
        assert full*r["louverMinEmissionFraction"] <= total <= full*r["louverMaxEmissionFraction"], (scenario["id"],total,full)
    else:
        assert total > full, "Stowed-transit must be described as warming, not steady-safe"
    return full, total/full


def appendix(d):
    lines = [START, "", "All numbers in this appendix are **[ASSUMED]** unless a row explicitly says otherwise. Units follow the JSON's `provenance.unitConventions`; byte counts are decimal bytes. Tables are generated from the JSON and checked exactly by `validate_baseline.py`.", "", "### Equipment inventory and modes", "", "Each physical assembly is counted once. `off` has zero commanded electrical draw and data; it does not stop metabolism, erase stored heat, remove mass or cure damage. Crew cannot be commanded off. Positions are the stowed structural coordinates (x forward, y left, z up); configuration overrides move appendages. Intrinsic inertia is about the centre of the assembly, about body x (roll), y (pitch) and z (yaw). Heat is deposited onboard, not total energy released. Generator/storage mode values are rated endpoints; dispatch formulas determine actual values.", "", "| ID / subsystem | Mass kg; (x,y,z) m; intrinsic I roll/pitch/yaw kg m² | Modes: power / onboard heat / output data rate / generated power (W / W / byte s⁻¹ / W) | Allowed assembly K | Node / bus / initial mode |", "|---|---|---|---|---|"]
    for e in d["equipment"]:
        modes = "; ".join(f"{name}: {f(m['power'])}/{f(m['heat'])}/{f(m['dataRate'])}/{f(m['generatedPower'])}" for name,m in e["modes"].items())
        lines.append(f"| `{e['id']}` / {e['subsystem']} | {f(e['mass'])}; {f(e['position'])}; {f(e['intrinsicInertiaRoll'])}/{f(e['intrinsicInertiaPitch'])}/{f(e['intrinsicInertia'])} | {modes} | {f(e['limits']['tempMin'])}–{f(e['limits']['tempMax'])} | {e['thermalNode']} / {e['bus'] or 'none'} / {e['initialMode']} |")
    lines += ["", "### Fault containment and dependencies", "", "All policies are **[ASSUMED]**; listed sources support mechanisms, not ratings. Radiation profile names select the explicitly fictional mapping below.", "", "| Assembly | Redundancy / shared dependency | Failure, protection and source mechanism | Radiation profile |", "|---|---|---|---|"]
    for e in d["equipment"]:
        lines.append(f"| `{e['id']}` | {e['redundancy']} | {e['failureProtection']} ({', '.join(e['mechanismSources'])}) | {e['radiationProfile']} |")
    lines += ["", "### Geometry, resources and subsystem parameters", "", "Parameter paths are exact JSON keys; array entries use their `id` when available. Geometric envelopes and rates are design assumptions, not measured hardware. Formula/policy strings in the JSON define how these parameters combine.", ""]
    for section in d:
        if section in ("equipment", "scenarios"):
            continue
        rows = list(numeric_rows(d[section], section))
        if not rows:
            continue
        lines += [f"#### `{section}`", "", "| Parameter | Value | Label / source |", "|---|---|---|"]
        for path, value, label, source in rows:
            evidence = f"[{label}: {source}]" if source else f"[{label}]"
            lines.append(f"| `{path}` | {f(value)} | {evidence} |")
        lines.append("")
    lines += ["### Calculated mass and power checks", "", "**[ASSUMED]** These are derived from proposed ratings, rounded for display. The validator recomputes them. They establish bookkeeping consistency only. The yaw inertia is the zz term of the tensor about the centre of mass; heights do not enter it, so it is the planar 1C value.", "", "| Mass case | M kg | COM x,y,z m | Yaw inertia kg m² |", "|---|---|---|---|"]
    cases = [("wet-stowed", "stowed", {}, None), ("wet-radiators", "radiators", {}, None), ("wet-all-deployed", "allDeployed", {}, None), ("main-empty", "stowed", {"main-propellant":0}, None), ("left-RCS-empty", "stowed", {"rcs-left":0}, None), ("left-radiator-only", "stowed", {}, {"radiator-left"}), ("reactants-converted", "stowed", {"fuel-cell-hydrogen":0,"fuel-cell-oxygen":0,"product-water":54}, None)]
    for name, config, remaining, deployed in cases:
        m, c, i = mass_properties(d, config, remaining, deployed)
        z = mass_properties_3d(d, config, remaining, deployed)[1][2]
        lines.append(f"| {name} | {m:.3f} | {c[0]:.6f}, {c[1]:.6f}, {z:.6f} | {i:.3f} |")
    empty = {r["id"]: 0 for r in d["propellant"] + d["reactants"]}
    lines += ["", "Inertia about the centre of mass in three dimensions (parallel-axis theorem over every part). Tensor terms are in body axes; the principal moments are about the principal axes nearest body x, y and z, and the tilt is the angle between the two frames. `full` is the arrival loading; `empty` has every propellant and reactant tank at zero.", "", "| Configuration, tanks | M kg | COM x,y,z m | Ixx, Iyy, Izz kg m² | Ixy, Ixz, Iyz kg m² | Principal moments kg m² | Tilt ° |", "|---|---|---|---|---|---|---|"]
    for config in d["ship"]["configurations"]:
        for label, remaining in (("full", {}), ("empty", empty)):
            m, c, t, moments, tilt = mass_properties_3d(d, config, remaining)
            lines.append(f"| {config}, {label} | {m:.0f} | {c[0]:.4f}, {c[1]:.4f}, {c[2]:.4f} | {t[0][0]:.0f}, {t[1][1]:.0f}, {t[2][2]:.0f} | {t[0][1]:.0f}, {t[0][2]:.0f}, {t[1][2]:.0f} | {moments[0]:.0f}, {moments[1]:.0f}, {moments[2]:.0f} | {math.degrees(tilt):.2f} |")
    torque, force = rcs_authority(d)
    m, c, t, moments, tilt = mass_properties_3d(d, d["ship"]["initialConfiguration"])
    lines += ["", "RCS authority of one bank at arrival (configuration `" + d["ship"]["initialConfiguration"] + "`, full tanks). Torques are the zero-net-force sets (couples) with every helping jet firing, at most two per pod; angular acceleration is torque over the diagonal term of the tensor. Forces are every jet along that axis; a clean translation also needs the torque about the centre of mass balanced, which the allocator does by throttling pods.", "", "| Axis | Torque − / + N m | Angular acceleration rad s⁻² | Axis | Force − / + N | Acceleration m s⁻² |", "|---|---|---|---|---|---|"]
    for k, (axis, along) in enumerate((("roll", "x"), ("pitch", "y"), ("yaw", "z"))):
        lines.append(f"| {axis} ({'xyz'[k]}) | {torque[axis][0]:.0f} / {torque[axis][1]:.0f} | {torque[axis][1]/t[k][k]:.5f} | {along} | {force[along][0]:.0f} / {force[along][1]:.0f} | {force[along][1]/m:.5f} |")
    lines += ["", "Hull prisms (the occupied volume is their union). Outline corners are (x, y) m, counter-clockwise seen from +z; the wing prisms are shown stowed and deployed and move linearly between.", "", "| Part | z min, max m | Outline stowed | Outline deployed |", "|---|---|---|---|"]
    hull = d["ship"]["hull"]
    lines.append(f"| `{hull['part']}` (pressure hull) | {f(hull['zMin'])}, {f(hull['zMax'])} | {f(hull['outline'])} | same |")
    for a in d["configuration"]["appendages"]:
        lines.append(f"| `{a['id']}` | {f(a['zMin'])}, {f(a['zMax'])} | {f(a['stowedPolygon'])} | {f(a['deployedPolygon'])} |")
    lines += ["", "| Operating case | Configuration | Main-bus demand W | Heat deposited W | Battery output needed W | Essential load W |", "|---|---|---|---|---|---|"]
    for s in d["scenarios"]:
        demand, heat, deficit, essential = budget(d,s)
        lines.append(f"| {s['id']} | {s['configuration']} | {demand:.3f} | {heat:.3f} | {deficit:.3f} | {essential:.3f} |")
    lines += ["", "Zero solar assumed; stacks follow each isolated bus demand up to their local rating. Only `ion-survey` closes the healthy tie, permitting spare source capacity to transfer; `ion-survey-tie-open` shows the otherwise stranded capacity. Batteries supply any remainder, with conversion losses. No charging, deployment motors or fault current is included in these steady cases. The one active essential converter includes its loss; each PDU's housekeeping is separate. Solar power, if available, replaces fuel-cell generation and its heat. Cases use initial modes except:", ""]
    for s in d["scenarios"]:
        lines.append(f"- `{s['id']}`: " + (", ".join(f"{k}={v}" for k,v in s["overrides"].items()) or "initial modes") + ".")
    lines += ["", END]
    return "\n".join(lines)


def validate(d):
    bibliography = (ROOT / "References/BIBLIOGRAPHY.md").read_text(encoding="utf-8")
    rows = list(numeric_rows(d))
    for path, value, label, source in rows:
        assert label in ("ASSUMED", "ESTABLISHED", "FICTIONAL"), path
        if label == "ESTABLISHED":
            assert source and f"| {source} |" in bibliography, path
        for n in value if isinstance(value,list) else [value]:
            assert math.isfinite(n), path
    def sources(obj):
        if isinstance(obj,dict):
            for source in obj.get("mechanismSources",[]):
                assert f"| {source} |" in bibliography, source
            for v in obj.values(): sources(v)
        elif isinstance(obj,list):
            for v in obj: sources(v)
    sources(d)
    eq = {e["id"]:e for e in d["equipment"]}
    assert len(eq) == len(d["equipment"])
    nodes = {n["id"] for n in d["thermalNodes"]}
    buses = {b["id"] for b in d["buses"]}
    resources = {r["id"]:r for r in d["propellant"]+d["reactants"]}
    for e in eq.values():
        assert e["mass"] > 0 and e["intrinsicInertia"] >= 0, e["id"]
        assert e["intrinsicInertiaRoll"] >= 0 and e["intrinsicInertiaPitch"] >= 0, e["id"]
        # Stated shapes (ship.inertiaShapes): cylinder, thin plates, everything else isotropic.
        if e["subsystem"] == "structure":
            radius = d["ship"]["hull"]["zMax"]
            near(e["intrinsicInertiaPitch"], e["intrinsicInertia"])
            assert abs(e["intrinsicInertiaRoll"] - e["mass"] * radius**2 / 2) <= 50, e["id"]
        elif e["id"] in {a["id"] for a in d["configuration"]["appendages"]}:
            near(e["intrinsicInertiaRoll"] + e["intrinsicInertiaPitch"], e["intrinsicInertia"])
        else:
            near(e["intrinsicInertiaRoll"], e["intrinsicInertia"])
            near(e["intrinsicInertiaPitch"], e["intrinsicInertia"])
        assert len(e["position"]) == 3 and e["thermalNode"] in nodes
        assert e["bus"] is None or e["bus"] in buses
        assert e["initialMode"] in e["modes"]
        assert e["limits"]["tempMin"] < e["limits"]["tempMax"]
        assert e["radiationProfile"] in d["radiation"]["profiles"]
        for m in e["modes"].values():
            assert all(m[k] >= 0 for k in ("power","heat","dataRate","generatedPower"))
    near(sum(e["mass"] for e in eq.values()),d["ship"]["dryMass"])
    near(mass_properties(d)[0],d["ship"]["initialWetMass"])
    for r in resources.values():
        assert 0 <= r["initialMass"] <= r["capacity"]
        assert len(r["position"]) == 3
    for loop in d["thermalLoops"]:
        assert loop["from"] in nodes and loop["to"] in nodes
        assert all(p in eq for p in loop["pumpIds"])
    def convex_ccw(poly):
        turns = [(q[0]-p[0])*(r[1]-q[1])-(q[1]-p[1])*(r[0]-q[0]) for p,q,r in zip(poly,poly[1:]+poly[:1],poly[2:]+poly[:2])]
        return len(poly) >= 3 and all(t > 0 for t in turns)
    hull=d["ship"]["hull"]
    assert convex_ccw(hull["outline"]) and hull["zMin"] < hull["zMax"] and hull["part"] in eq
    xs=[p[0] for p in hull["outline"]]; ys=[p[1] for p in hull["outline"]]
    for a in d["configuration"]["appendages"]:
        assert a["id"] in eq
        assert a["stowedPosition"] == eq[a["id"]]["position"] and len(a["deployedPosition"]) == 3
        near(a["stowedInertia"],eq[a["id"]]["intrinsicInertia"])
        near(a["stowedInertiaRoll"],eq[a["id"]]["intrinsicInertiaRoll"])
        near(a["stowedInertiaPitch"],eq[a["id"]]["intrinsicInertiaPitch"])
        # A thin plate in the x-y plane, stowed and deployed: yaw = roll + pitch, split by span^2 : chord^2.
        for state in ("stowed","deployed"):
            near(a[state+"InertiaRoll"]+a[state+"InertiaPitch"],a[state+"Inertia"])
            poly=a[state+"Polygon"]
            chord=max(p[0] for p in poly)-min(p[0] for p in poly)
            span=max(p[1] for p in poly)-min(p[1] for p in poly)
            assert abs(a[state+"InertiaRoll"]-a[state+"Inertia"]*span**2/(span**2+chord**2)) <= 0.5, a["id"]
            assert convex_ccw(poly), (a["id"], state)
        assert a["zMin"] < a["zMax"] and hull["zMin"] <= a["zMin"] and a["zMax"] <= hull["zMax"]
        # Stowed, a wing lies inside the prism of the pressure hull: stowing never adds to the envelope.
        assert all(min(xs) <= p[0] <= max(xs) and min(ys) <= p[1] <= max(ys) for p in a["stowedPolygon"]), a["id"]
    assert d["ship"]["initialConfiguration"] in d["ship"]["configurations"]
    assert set(d["ship"]["configurations"]) == {"stowed","radiators","solar","allDeployed"}
    for s in d["scenarios"]:
        assert s["configuration"] in d["ship"]["configurations"]
        for id,mode in s["overrides"].items(): assert mode in eq[id]["modes"]
        demand,heat,deficit,essential = budget(d,s)
        assert essential <= next(b["maxPower"] for b in d["buses"] if b["id"]=="essential")
        assert deficit <= 2*d["generation"]["battery"]["maxDischargePowerPerPack"]
        assert heat > 0 and demand > 0
        thermal_check(d,s)
    rcs=d["propulsion"]["rcs"]
    opposite={"fore":[-1,0,0],"aft":[1,0,0],"up":[0,0,-1],"down":[0,0,1]}
    for jet in rcs["jets"]:
        assert jet["equipmentId"] in eq and all(r in resources for r in jet["resourceIds"])
        assert len(jet["direction"]) == 3
        near(sum(x*x for x in jet["direction"]),1)
        # The force on the ship is opposite the nozzle; an outboard nozzle pushes toward the centreline.
        side=1 if eq[jet["equipmentId"]]["position"][1] > 0 else -1
        assert jet["direction"] == opposite.get(jet["nozzle"],[0,-side,0]), jet["id"]
        assert jet["id"] == f"{jet['equipmentId']}-{jet['bank']}-{jet['id'].rsplit('-',1)[1]}"
    for pod in {j["equipmentId"] for j in rcs["jets"]}:
        for bank in ("a","b"):
            mine=[j for j in rcs["jets"] if j["equipmentId"]==pod and j["bank"]==bank]
            assert sorted(int(j["id"].rsplit("-",1)[1]) for j in mine) == [0,1,2,3,4], (pod,bank)
            assert {j["nozzle"] for j in mine} == {"fore","aft","up","down","outboard"}
    for bank in ("a","b"):
        jets = [j for j in rcs["jets"] if j["bank"]==bank]
        for axis in (0,1,2): assert {j["direction"][axis] for j in jets} >= {-1,1}
        torque,force=rcs_authority(d,bank)
        for axis in ("roll","pitch","yaw"):
            near(torque[axis][0],rcs["zeroNetForceTorquePerBank"][axis][0])
            near(torque[axis][1],rcs["zeroNetForceTorquePerBank"][axis][1])
            assert torque[axis][0] < 0 < torque[axis][1]
        for axis in "xyz":
            near(force[axis][0],rcs["translationForcePerBank"][axis][0])
            near(force[axis][1],rcs["translationForcePerBank"][axis][1])
    # Attitude-control play values against the hardware they must respect.
    control=d["propulsion"]["attitudeControl"]
    assert 0 < control["slewRate"] < d["sensing"]["starTracker"]["maxAngularRate"]
    assert 0 < control["handsOnTurnRate"] <= control["slewRate"]
    assert control["rateGain"] > 0 and control["attitudeGain"] > 0 and control["attitudeDeadband"] > 0
    # One minimum bit on a two-jet couple must not cross the whole rate deadband, in any
    # configuration with any loading (the lightest ship turns most per bit), or the jets would
    # answer each other for ever. Couples: roll 4 m apart, pitch 10 m, yaw 10 m.
    bit=rcs["minimumImpulsePerJet"]
    empty={r["id"]:0 for r in d["propellant"]+d["reactants"]}
    for config in d["ship"]["configurations"]:
        _,_,t,_,_=mass_properties_3d(d,config,empty)
        for k,arm in ((0,4),(1,10),(2,10)):
            assert bit*arm/t[k][k] < 2*control["rateDeadband"], (config,k)
    near(sum(x*x for x in d["sensing"]["camera"]["boresight"]),1)
    assert 0 < d["sensing"]["camera"]["fovHalfAngle"] < math.pi/2
    near(sum(x*x for x in d["generation"]["solar"]["arrayNormal"]),1)
    near(sum(x*x for x in d["propulsion"]["main"]["direction"]),1)
    assert len(d["propulsion"]["main"]["direction"]) == 3 and len(d["propulsion"]["ion"]["direction"]) == 3
    # Heights cannot change the 1C yaw inertia or planar centre of mass.
    for config in d["ship"]["configurations"]:
        m2,c2,i2=mass_properties(d,config)
        m3,c3,t3,moments,_=mass_properties_3d(d,config)
        near(m2,m3); near(c2[0],c3[0]); near(c2[1],c3[1]); near(i2,t3[2][2],1e-12)
        assert min(moments) > 0 and abs(sum(moments)-(t3[0][0]+t3[1][1]+t3[2][2])) < 1e-6*sum(moments)
    fc = d["generation"]["fuelCell"]
    near(1+fc["oxygenPerHydrogen"],fc["waterPerHydrogen"])
    near(resources["fuel-cell-hydrogen"]["initialMass"]*fc["oxygenPerHydrogen"],resources["fuel-cell-oxygen"]["initialMass"])
    near(resources["product-water"]["capacity"],resources["fuel-cell-hydrogen"]["initialMass"]*fc["waterPerHydrogen"])
    m0,c0,_=mass_properties(d)
    m1,c1,_=mass_properties(d,remaining={"fuel-cell-hydrogen":0,"fuel-cell-oxygen":0,"product-water":54})
    near(m0,m1)
    assert c1[0] > c0[0]
    for name,rate in (("minimum","minimumSampleRate"),("normal","normalSampleRate"),("high","highSampleRate")):
        near(eq["black-box"]["modes"][name]["dataRate"],d["recorder"][rate]*d["recorder"]["bytesPerSample"])
    main=d["propulsion"]["main"]
    near(eq["main-engine"]["modes"]["firing"]["heat"]-eq["main-engine"]["modes"]["firing"]["power"],main["chemicalHeatAtFullThrust"])
    ion=d["propulsion"]["ion"]
    near(eq["ion-drive"]["modes"]["firing"]["power"],ion["busPower"])
    assert ion["busPower"] >= ion["onboardHeatUpperBound"] + ion["thrust"]*ion["Isp"]*d["constants"]["g0"]["value"]/2
    print(f"PASS: {len(eq)} equipment assemblies, {len(rows)} labelled numeric fields/vectors, resource/energy references and mass checks")
    print("PASS: reference thermal transport and louver range; stowed heating commitment; RCS authority on three axes, hull prisms, inertia shapes")


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--write-doc", action="store_true")
    args=parser.parse_args()
    d=json.loads(DATA.read_text(encoding="utf-8"))
    validate(d)
    doc=DOC.read_text(encoding="utf-8")
    assert doc.count(START)==doc.count(END)==1
    before,rest=doc.split(START)
    _,after=rest.split(END)
    expected=before+appendix(d)+after
    if args.write_doc:
        DOC.write_text(expected,encoding="utf-8",newline="\n")
        print("Updated numerical appendix from JSON")
    else:
        assert doc==expected, "Numerical appendix differs: run --write-doc and review the change"
        print("PASS: document numerical appendix matches JSON exactly")
    g=d["constants"]["g0"]["value"]
    main=d["propulsion"]["main"]
    wet=d["ship"]["initialWetMass"]
    fuel=next(r["initialMass"] for r in d["propellant"] if r["id"]=="main-propellant")
    print(f"Main: mdot={main['thrust']/(main['Isp']*g):.6f} kg/s; ideal delta-v={main['Isp']*g*math.log(wet/(wet-fuel)):.3f} m/s")
    print("Scope: arithmetic and document consistency only; no simulation/playability claim")


if __name__=="__main__": main()
