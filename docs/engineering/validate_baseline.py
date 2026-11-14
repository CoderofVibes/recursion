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


def mass_properties(d, configuration="stowed", remaining=None, deployed_ids=None):
    remaining = remaining or {}
    if deployed_ids is None:
        deployed_ids = {a["id"] for a in d["configuration"]["appendages"]
                        if configuration == "allDeployed" or
                        (configuration == "radiators" and a["id"].startswith("radiator")) or
                        (configuration == "solar" and a["id"].startswith("solar"))}
    parts = []
    app = {a["id"]: a for a in d["configuration"]["appendages"]}
    for e in d["equipment"]:
        pos, inertia = e["position"], e["intrinsicInertia"]
        if e["id"] in deployed_ids:
            pos, inertia = app[e["id"]]["deployedPosition"], app[e["id"]]["deployedInertia"]
        parts.append((e["mass"], pos, inertia))
    for r in d["propellant"] + d["reactants"]:
        m = remaining.get(r["id"], r["initialMass"])
        parts.append((m, r["position"], m * r["intrinsicInertiaPerKg"]))
    mass = sum(m for m, _, _ in parts)
    center = [sum(m * p[k] for m, p, _ in parts) / mass for k in range(2)]
    inertia = sum(i + m * sum((p[k] - center[k])**2 for k in range(2)) for m, p, i in parts)
    return mass, center, inertia


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
    lines = [START, "", "All numbers in this appendix are **[ASSUMED]** unless a row explicitly says otherwise. Units follow the JSON's `provenance.unitConventions`; byte counts are decimal bytes. Tables are generated from the JSON and checked exactly by `validate_baseline.py`.", "", "### Equipment inventory and modes", "", "Each physical assembly is counted once. `off` has zero commanded electrical draw and data; it does not stop metabolism, erase stored heat, remove mass or cure damage. Crew cannot be commanded off. Positions are the stowed structural coordinates; configuration overrides move appendages. Heat is deposited onboard, not total energy released. Generator/storage mode values are rated endpoints; dispatch formulas determine actual values.", "", "| ID / subsystem | Mass kg; (x,y) m; intrinsic I kg m² | Modes: power / onboard heat / output data rate / generated power (W / W / byte s⁻¹ / W) | Allowed assembly K | Node / bus / initial mode |", "|---|---|---|---|---|"]
    for e in d["equipment"]:
        modes = "; ".join(f"{name}: {f(m['power'])}/{f(m['heat'])}/{f(m['dataRate'])}/{f(m['generatedPower'])}" for name,m in e["modes"].items())
        lines.append(f"| `{e['id']}` / {e['subsystem']} | {f(e['mass'])}; {f(e['position'])}; {f(e['intrinsicInertia'])} | {modes} | {f(e['limits']['tempMin'])}–{f(e['limits']['tempMax'])} | {e['thermalNode']} / {e['bus'] or 'none'} / {e['initialMode']} |")
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
    lines += ["### Calculated mass and power checks", "", "**[ASSUMED]** These are derived from proposed ratings, rounded for display. The validator recomputes them. They establish bookkeeping consistency only.", "", "| Mass case | M kg | COM x,y m | Yaw inertia kg m² |", "|---|---|---|---|"]
    cases = [("wet-stowed", "stowed", {}, None), ("wet-radiators", "radiators", {}, None), ("wet-all-deployed", "allDeployed", {}, None), ("main-empty", "stowed", {"main-propellant":0}, None), ("left-RCS-empty", "stowed", {"rcs-left":0}, None), ("left-radiator-only", "stowed", {}, {"radiator-left"}), ("reactants-converted", "stowed", {"fuel-cell-hydrogen":0,"fuel-cell-oxygen":0,"product-water":54}, None)]
    for name, config, remaining, deployed in cases:
        m, c, i = mass_properties(d, config, remaining, deployed)
        lines.append(f"| {name} | {m:.3f} | {c[0]:.6f}, {c[1]:.6f} | {i:.3f} |")
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
        assert len(e["position"]) == 2 and e["thermalNode"] in nodes
        assert e["bus"] is None or e["bus"] in buses
        assert e["initialMode"] in e["modes"]
        assert e["limits"]["tempMin"] < e["limits"]["tempMax"]
        assert e["radiationProfile"] in d["radiation"]["profiles"]
        for m in e["modes"].values():
            assert all(m[k] >= 0 for k in ("power","heat","dataRate","generatedPower"))
    near(sum(e["mass"] for e in eq.values()),d["ship"]["dryMass"])
    near(mass_properties(d)[0],d["ship"]["initialWetMass"])
    for r in resources.values(): assert 0 <= r["initialMass"] <= r["capacity"]
    for loop in d["thermalLoops"]:
        assert loop["from"] in nodes and loop["to"] in nodes
        assert all(p in eq for p in loop["pumpIds"])
    for a in d["configuration"]["appendages"]:
        assert a["id"] in eq
        assert a["stowedPosition"] == eq[a["id"]]["position"]
        near(a["stowedInertia"],eq[a["id"]]["intrinsicInertia"])
    for name,poly in d["ship"]["footprints"].items():
        assert len(poly) >= 3
        area = sum(p[0]*q[1]-q[0]*p[1] for p,q in zip(poly,poly[1:]+poly[:1]))/2
        assert area > 0, name
    for s in d["scenarios"]:
        assert s["configuration"] in d["ship"]["footprints"]
        for id,mode in s["overrides"].items(): assert mode in eq[id]["modes"]
        demand,heat,deficit,essential = budget(d,s)
        assert essential <= next(b["maxPower"] for b in d["buses"] if b["id"]=="essential")
        assert deficit <= 2*d["generation"]["battery"]["maxDischargePowerPerPack"]
        assert heat > 0 and demand > 0
        thermal_check(d,s)
    for jet in d["propulsion"]["rcs"]["jets"]:
        assert jet["equipmentId"] in eq and all(r in resources for r in jet["resourceIds"])
        near(sum(x*x for x in jet["direction"]),1)
    for bank in ("a","b"):
        jets = [j for j in d["propulsion"]["rcs"]["jets"] if j["bank"]==bank]
        for axis in (0,1): assert {j["direction"][axis] for j in jets} >= {-1,1}
        torques=[eq[j["equipmentId"]]["position"][0]*j["direction"][1]-eq[j["equipmentId"]]["position"][1]*j["direction"][0] for j in jets]
        assert min(torques)<0<max(torques)
        thrust=d["propulsion"]["rcs"]["thrustPerJet"]
        expected=d["propulsion"]["rcs"]["zeroNetForceYawTorquePerBank"]
        near(sum(t for t in torques if t<0)*thrust,expected[0])
        near(sum(t for t in torques if t>0)*thrust,expected[1])
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
    print("PASS: reference thermal transport and louver range; stowed heating commitment; RCS yaw authority")


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
