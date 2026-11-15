"""Deterministic S4 document audit; no simulation or playability assertions.

Run from any directory: python <worktree>/tools/studies/S4/check_design.py
Reads the authored design and original proposal, writes report.json beside this file.
Python 3.14 standard library only; there are no random draws.
"""

from __future__ import annotations

import json
import re
from pathlib import Path


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
DESIGN = ROOT / "docs/design/expedition.md"
REGIONS = ROOT / "docs/design/regions"
ID = r"(?:C0[1-6]|P0[1-4]|N0[1-4]|R0[1-4]|H0[12]|A0[1-3])"
EXPECTED_IDS = {
    *(f"C0{i}" for i in range(1, 7)),
    *(f"P0{i}" for i in range(1, 5)),
    *(f"N0{i}" for i in range(1, 5)),
    *(f"R0{i}" for i in range(1, 5)),
    "H01", "H02", "A01", "A02", "A03",
}
DETOURS = {
    "A02": ("C02", "C03"), "R01": ("P02", "P03"),
    "R02": ("P03", "P04"), "N04": ("N02", "N03"),
    "R03": ("N02", "N03"), "A01": ("P04", "C04"),
    "A03": ("N03", "C04"), "R04": ("C04", "C05"),
}
ROUTES = {
    "first_power": "C01 C02 C03 P01 P02 R01 P03 N03 C04 R04 C05 C06 H01 H02",
    "first_sensing": "C01 C02 C03 N01 N02 N04 N03 P03 R02 P04 C04 R04 C05 C06 H01 H02",
    "expert_power": "C01 C02 C03 P01 P02 P03 P04 C04 C05 C06 H01 H02",
    "expert_sensing": "C01 C02 C03 N01 N02 N03 C04 C05 C06 H01 H02",
}


def require(condition: bool, explanation: str) -> None:
    if not condition:
        raise ValueError(explanation)


def graph_from_design(text: str) -> tuple[set[str], set[tuple[str, str]]]:
    block = re.search(r"```mermaid\n(.*?)```", text, re.S)
    require(block is not None, "Missing Mermaid route graph")
    graph = re.sub(r'\["[^"\n]+"\]', "", block.group(1))
    graph = re.sub(r"\|[^|\n]*\|", "", graph)
    nodes = set(re.findall(rf"\b{ID}\b", graph))
    edges: set[tuple[str, str]] = set()
    for line in graph.splitlines():
        tokens = re.findall(rf"{ID}|<-->|-->|-\.->", line)
        for index in range(0, len(tokens) - 2, 2):
            start, arrow, end = tokens[index:index + 3]
            edges.add((start, end))
            if arrow == "<-->":
                edges.add((end, start))
    return nodes, edges


def simple_paths(edges: set[tuple[str, str]], end: str) -> list[list[str]]:
    adjacency = {node: sorted(b for a, b in edges if a == node) for node in EXPECTED_IDS}
    paths: list[list[str]] = []

    def visit(path: list[str]) -> None:
        if path[-1] == end:
            paths.append(path)
            return
        for node in adjacency[path[-1]]:
            if node not in path:
                visit([*path, node])

    visit(["C01"])
    return paths


def read_pacing(text: str) -> dict[str, dict[str, list[float]]]:
    result = {}
    for line in text.splitlines():
        cells = [cell.strip() for cell in line.split("|")]
        if len(cells) != 6 or cells[1] not in EXPECTED_IDS:
            continue
        if not re.fullmatch(r"[\d.]+–[\d.]+", cells[3]):
            continue
        result[cells[1]] = {
            "first": [float(x) for x in cells[3].split("–")],
            "expert": [float(x) for x in cells[4].split("–")],
        }
    require(set(result) == EXPECTED_IDS, "Pacing table must cover all 23 IDs exactly")
    return result


def main() -> None:
    text = DESIGN.read_text(encoding="utf-8-sig")
    nodes, edges = graph_from_design(text)
    require(nodes == EXPECTED_IDS, "Route graph catalogue IDs differ")
    proposal = (ROOT / "docs/handoffs/region-proposal/flow.fragment.html").read_text(encoding="utf-8-sig")
    source_block = re.search(r"const edges = \[(.*?)\n  \];", proposal, re.S)
    require(source_block is not None, "Original proposal edge list missing")
    source_edges = set()
    drawn_count = 0
    for start, end, kind in re.findall(r"\['([^']+)','([^']+)'(?:,'([^']+)')?\]", source_block.group(1)):
        drawn_count += 1
        source_edges.add((start, end))
        if kind == "transfer":
            source_edges.add((end, start))
    require(edges == source_edges, "Design graph differs from A13/proposal connections")
    require(("C03", "C04") not in edges, "Obsolete outer bypass remains")
    require({("P03", "N03"), ("N03", "P03")} <= edges, "Cross-transfer must work both directions")
    for node, (start, end) in DETOURS.items():
        require({(start, node), (node, end)} <= edges, f"Missing forward rejoin for {node}")

    pages = sorted(REGIONS.glob("*.md"))
    page_ids: list[str] = []
    page_report = []
    for page in pages:
        content = page.read_text(encoding="utf-8-sig")
        title = re.match(rf"# ({ID})\b", content)
        require(title is not None, f"Missing stable ID: {page.name}")
        page_ids.append(title.group(1))
        require(re.findall(r"^## ([1-5])\.", content, re.M) == list("12345"), f"Template sections: {page.name}")
        for field in ("Question", "Engineering decision", "Success teaches", "Failure teaches", "Model evidence", "Proceed", "Optional", "Systems"):
            require(field.lower() in content.lower(), f"Missing {field}: {page.name}")
        for term in ("variation", "Black Box", "roll", "tenth", "P5", "P6", "P8", "P9"):
            require(term.lower() in content.lower(), f"Missing {term}: {page.name}")
        require("[ASSUMED]" in content, f"Missing assumption label: {page.name}")
        page_report.append({"id": title.group(1), "path": page.relative_to(ROOT).as_posix(), "words": len(content.split())})
    require(len(page_ids) == 23 and set(page_ids) == EXPECTED_IDS, "Expected exactly one page per region")

    links_checked = 0
    documents = [DESIGN, *pages, ROOT / "docs/studies/S4/README.md", ROOT / "docs/handoffs/S4.md"]
    for document in documents:
        require(document.exists(), f"Missing deliverable: {document.relative_to(ROOT)}")
        for match in re.finditer(r"(?<!!)\[[^\]\n]*\]\(([^)\n]+)\)", document.read_text(encoding="utf-8-sig")):
            target = match.group(1).strip("<>").split("#", 1)[0]
            if not target or re.match(r"^[a-zA-Z]+:", target):
                continue
            resolved = (document.parent / target).resolve()
            # This command creates the report on its first run, after the audit succeeds.
            require(resolved.exists() or resolved == HERE / "report.json", f"Broken link in {document.name}: {target}")
            links_checked += 1

    pacing = read_pacing(text)
    route_report = {}
    for name, sequence in ROUTES.items():
        route = sequence.split()
        require(len(route) == len(set(route)), f"Repeated region in {name}")
        require(all(edge in edges for edge in zip(route, route[1:])), f"Broken route: {name}")
        contact = route[:route.index("C06") + 1]
        profile = "first" if name.startswith("first") else "expert"
        total = lambda path: [round(sum(pacing[node][profile][i] for node in path), 2) for i in range(2)]
        route_report[name] = {
            "route": route, "profile": profile, "entries_through_contact": len(contact),
            "active_minutes_to_contact_assumed": total(contact),
            "active_minutes_to_earth_assumed": total(route),
        }
    paths = simple_paths(edges, "H02")
    require(bool(paths), "No route to Earth")
    require(all("C02" in path and "C05" in path and "H01" in path for path in paths), "Required route vertex bypassed")
    require(set().union(*(set(path) for path in paths)) == EXPECTED_IDS, "Unreachable/stranded region")
    report = {
        "scope": "Document consistency and arithmetic only; not gameplay, timing or physics validation",
        "unique_regions": len(nodes), "drawn_connections": drawn_count,
        "directed_connections_with_reverse_cross_transfer": len(edges),
        "detours_with_forward_rejoin": len(DETOURS),
        "simple_paths_to_earth_no_required_revisit": len(paths),
        "all_simple_earth_paths_include": ["C02", "C05", "H01"],
        "local_links_checked": links_checked,
        "routes": route_report, "pacing_assumptions_by_region": pacing,
        "region_pages": page_report,
        "limitations": [
            "Graph dominance does not prove physical hazard gating or an assist",
            "Timing is the sum of design estimates, not measured player performance",
            "Template checks establish field/section presence, not semantic completeness",
            "No simulation, seed generation, render, browser or playtest was run",
        ],
    }
    destination = HERE / "report.json"
    destination.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"PASS: {len(nodes)} regions, {drawn_count} drawn connections, {len(paths)} simple Earth paths, {links_checked} local links")
    for name, result in route_report.items():
        print(f"{name}: {result['entries_through_contact']} entries to contact; minutes {result['active_minutes_to_contact_assumed']} / Earth {result['active_minutes_to_earth_assumed']}")
    print("Wrote tools/studies/S4/report.json; no playability claim.")


if __name__ == "__main__":
    main()
