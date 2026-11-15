"""Offline S10 npm audit. Run from any directory with Python 3.14, no installs.

Writes dependency-inventory.json beside this script, plus dependencies.md and
third-party-notices.txt under docs/studies/s10. The lock defines package scope;
installed package metadata and original legal files supply evidence. Missing
optional packages remain explicit gaps, never silently certified.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "docs/studies/s10"
LICENSE_RULES = {
    "MIT": "Retain the copyright and permission notice in copies or substantial portions; retain the disclaimer with the license text.",
    "ISC": "Retain the copyright and permission notice in all copies; preserve the disclaimer.",
    "BSD-2-Clause": "Source: retain copyright, conditions and disclaimer. Binary: reproduce them in accompanying documentation/materials.",
    "BSD-3-Clause": "BSD-2-Clause requirements, plus no endorsement using the copyright holder/contributor names without permission.",
    "Apache-2.0": "Supply the license; mark changed files; retain relevant copyright, patent, trademark and attribution notices; reproduce applicable NOTICE attribution if supplied. Patent terms apply; no trademark grant.",
    "BlueOak-1.0.0": "Give every recipient the license text or its https://blueoakcouncil.org/license/1.0.0 link; retain this audit's original notices.",
    "CC-BY-4.0": "When sharing covered material, retain supplied creator/attribution, copyright, license and disclaimer notices, link to the material where practicable, identify changes, and give the license text or link. Do not impose additional restrictions.",
    "MPL-2.0": "When distributing covered source, keep it under MPL and preserve notices. For covered executable distribution, make corresponding covered source available by reasonable means and tell recipients where; modifications to covered files remain MPL. Separate larger-work files may use another license.",
    "0BSD": "No copyright-retention condition in this license; retain its permission/disclaimer text as a conservative provenance practice.",
    "CC0-1.0": "No attribution condition in the dedication/fallback license; retain its text and source as provenance. No trademark or patent grant.",
}


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_text(path: Path) -> tuple[str, str]:
    raw = path.read_bytes()
    try:
        return raw.decode("utf-8-sig"), "utf-8"
    except UnicodeDecodeError:
        return raw.decode("cp1252"), "cp1252"


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def legal_files(directory: Path) -> list[Path]:
    result = []
    for base, dirs, files in os.walk(directory):
        dirs[:] = sorted(d for d in dirs if d != "node_modules")
        for name in sorted(files):
            if re.search(r"licen[cs]e|copying|copyright|notice", name, re.I):
                candidate = Path(base) / name
                if candidate.suffix.lower() not in {".map", ".js", ".ts"}:
                    result.append(candidate)
    return sorted(result, key=rel)


def embedded_legal(directory: Path, name: str) -> list[tuple[Path, str, str, bool]]:
    """Explicitly inspected files whose legal text is embedded, not freestanding."""
    choices = {
        "esrecurse": ("esrecurse.js", "first-block", True),
        "imurmurhash": ("README.md", "License (MIT)", True),
        "natural-compare": ("README.md", "Licence\n-------", False),
        "@humanfs/types": ("README.md", "## License", False),
    }
    if name not in choices:
        return []
    filename, marker, complete = choices[name]
    path = directory / filename
    if not path.exists():
        return []
    content, encoding = read_text(path)
    content = content.replace("\r\n", "\n")
    if marker == "first-block":
        text = content[: content.index("*/") + 2]
    else:
        text = content[content.index(marker) :].rstrip()
    return [(path, text, encoding, complete)]


def bundled_components(texts: dict[str, str], installed: dict) -> list[dict]:
    """Use upstream manifests/notice headings, without resolving version ranges."""
    result = []
    sources = {
        "node_modules/prettier/THIRD-PARTY-NOTICES.md": "prettier",
        "node_modules/vite/LICENSE.md": "vite",
        "node_modules/vitest/LICENSE.md": "vitest",
    }
    for path, container in sources.items():
        if path not in texts:
            continue
        content = texts[path]
        headings = list(re.finditer(r"^## ([^\n]+)$", content, re.M))
        meta = installed.get("node_modules/" + container, {})
        specs = meta.get("devDependencies", {}) | meta.get("dependencies", {})
        for i, match in enumerate(headings):
            block = content[match.end() : headings[i + 1].start() if i + 1 < len(headings) else len(content)]
            licenses = sorted(set(re.findall(r"^License: ([^\n]+)", block, re.M)))
            for label in match.group(1).strip().split(", "):
                versioned = re.fullmatch(r"(.+)@v([0-9][^ ]*)", label)
                name, version = versioned.groups() if versioned else (label, None)
                declared = specs.get(name)
                result.append({
                    "container": container,
                    "name": name,
                    "version": version,
                    "version_evidence": "upstream notice heading" if version else "not stated in installed notice",
                    "declared_build_specifier": declared,
                    "license": [value.strip() for value in licenses],
                    "notice_path": path,
                    "notice_heading": match.group(1).strip(),
                    "full_legal_text_present": bool(re.search(r"permission (?:is hereby granted|to use)|redistribution and use|apache license|blue oak|creative commons|copyright and related rights", block, re.I)),
                    "attribution": "Preserve the complete component block in this notice file, including its original copyright and legal text.",
                })
    # Non-Markdown notice files do not provide versions; report their actual limits.
    extra = {
        "node_modules/rolldown/THIRD-PARTY-LICENSE": ("rolldown", [("Rollup contributors", "MIT"), ("Evan Wallace material (project unnamed in notice)", "MIT")]),
        "node_modules/typescript/ThirdPartyNoticeText.txt": ("typescript", [
            ("DefinitelyTyped", "MIT"),
            ("Unicode data files and software", "Unicode notice; see exact text"),
            ("Document Object Model (W3C)", "W3C License; preserve full notice and mark changes"),
            ("Document Object Model (WHATWG)", "CC-BY-4.0"),
            ("Web Background Synchronization Specification", "W3C Community Final Specification Agreement; attribution includes specification name and version"),
            ("WebGL (Khronos Group)", "MIT-style Materials license; preserve exact text"),
        ]),
        "node_modules/three/examples/jsm/misc/SculptGL.LICENSE.txt": ("three", [("SculptGL", "MIT")]),
    }
    for path, (container, components) in extra.items():
        if path in texts:
            for name, license_id in components:
                result.append({"container": container, "name": name, "version": None,
                               "version_evidence": "not stated in installed notice", "declared_build_specifier": None,
                               "license": [license_id], "notice_path": path, "notice_heading": None,
                               "full_legal_text_present": True,
                               "attribution": "Preserve this complete upstream notice; no bundled version was inferred."})
    return result


def collect() -> tuple[dict, dict[str, str]]:
    lock_path = ROOT / "package-lock.json"
    package_path = ROOT / "package.json"
    lock = read_json(lock_path)
    root = read_json(package_path)
    records, legal, texts, installed = [], [], {}, {}
    for path, entry in sorted(lock["packages"].items()):
        if not path:
            continue
        name = path.rsplit("node_modules/", 1)[-1]
        directory = ROOT / path
        metadata_path = directory / "package.json"
        metadata = read_json(metadata_path) if metadata_path.exists() else {}
        if metadata:
            installed[path] = metadata
        direct = "runtime direct" if path == "node_modules/" + name and name in root.get("dependencies", {}) else (
            "build/test direct" if path == "node_modules/" + name and name in root.get("devDependencies", {}) else "transitive")
        evidence = []
        complete = False
        for file in legal_files(directory) if metadata else []:
            content, encoding = read_text(file)
            file_path = rel(file)
            texts[file_path] = content.replace("\r\n", "\n").rstrip() + "\n"
            legal.append({"path": file_path, "sha256": sha(file.read_bytes()), "encoding": encoding, "excerpt": False})
            evidence.append(file_path)
            complete = True
        for file, content, encoding, full in embedded_legal(directory, name) if metadata else []:
            file_path = rel(file)
            texts[file_path] = content.rstrip() + "\n"
            legal.append({"path": file_path, "sha256": sha(file.read_bytes()), "encoding": encoding, "excerpt": True,
                          "complete_license_text": full})
            evidence.append(file_path)
            complete = complete or full
        locked_license = entry.get("license", "UNSPECIFIED")
        installed_license = metadata.get("license")
        author = metadata.get("author", {})
        supplied_author_name = author.get("name") if isinstance(author, dict) else re.sub(r"\s*<[^>]*>|\s*\([^)]*\)", "", str(author)).strip()
        mismatches = []
        if metadata and metadata.get("version") != entry.get("version"):
            mismatches.append("installed version differs from lock")
        if metadata and installed_license != locked_license:
            mismatches.append("installed license declaration differs from lock")
        record = {
            "path": path, "name": name, "version": entry.get("version"), "directness": direct,
            "scope": "build/test" if entry.get("dev", False) else "runtime",
            "optional": entry.get("optional", False), "os": entry.get("os", []), "cpu": entry.get("cpu", []),
            "lock_license": locked_license, "installed": bool(metadata), "installed_version": metadata.get("version"),
            "installed_license": installed_license, "package_json": path + "/package.json" if metadata else None,
            "repository": metadata.get("repository"), "homepage": metadata.get("homepage"),
            "supplied_author_name": supplied_author_name or None,
            "package_json_sha256": sha(metadata_path.read_bytes()) if metadata else None,
            "license_evidence": evidence, "complete_local_license_text": complete,
            "attribution_requirement": LICENSE_RULES.get(installed_license or locked_license, "Inspect the original license text."),
            "attribution_material": "Exact copyright and legal text retained in third-party-notices.txt by evidence path." if evidence else "Unavailable locally; obtain original package legal notices before redistributing it.",
            "evidence_status": "installed metadata + full legal text" if complete else (
                "installed metadata; full legal text missing" if metadata else "lock declaration only; package absent"),
            "mismatches": mismatches,
            "dependencies": entry.get("dependencies", {}), "optional_dependencies": entry.get("optionalDependencies", {}),
            "peer_dependencies": entry.get("peerDependencies", {}),
        }
        records.append(record)
    bundles = bundled_components(texts, installed)
    report = {
        "schema_version": 1, "method": "offline installed-file audit; no registry lookup or package installation",
        "inputs": {"package.json_sha256": sha(package_path.read_bytes()), "package-lock.json_sha256": sha(lock_path.read_bytes())},
        "counts": {"locked_package_locations": len(records), "installed": len(installed),
                   "runtime": sum(r["scope"] == "runtime" for r in records),
                   "direct_runtime": len(root.get("dependencies", {})), "direct_build_test": len(root.get("devDependencies", {})),
                   "absent": sum(not r["installed"] for r in records),
                   "absent_nonoptional": sum(not r["installed"] and not r["optional"] for r in records),
                   "installed_missing_full_legal_text": sum(r["installed"] and not r["complete_local_license_text"] for r in records),
                   "metadata_mismatches": sum(bool(r["mismatches"]) for r in records),
                   "legal_sources": len(legal), "bundled_notice_components": len(bundles),
                   "bundled_versions_unspecified": sum(b["version"] is None for b in bundles),
                   "bundled_legal_blocks_requiring_review": sum(not b["full_legal_text_present"] for b in bundles)},
        "license_rules": LICENSE_RULES, "packages": records, "legal_sources": legal, "bundled_components": bundles,
    }
    return report, texts


def markdown(report: dict) -> str:
    c = report["counts"]
    out = ["# S10 — Offline npm dependency inventory", "",
           "[DEMONSTRATED: `python tools/studies/s10/dependency_inventory.py --check`] The lockfile defines "
           f"**{c['locked_package_locations']} package locations**, including nested duplicate versions: **{c['installed']} installed**, "
           f"**{c['absent']} absent optional packages**, **{c['metadata_mismatches']} installed version/license declaration mismatches**. "
           f"There are **{c['runtime']} runtime dependencies ({c['direct_runtime']} direct, "
           f"{c['runtime'] - c['direct_runtime']} transitive)** and "
           f"**{c['locked_package_locations'] - c['runtime']} build/test dependencies ({c['direct_build_test']} direct, "
           f"{c['locked_package_locations'] - c['runtime'] - c['direct_build_test']} transitive)**. "
           f"**{c['installed_missing_full_legal_text']} installed packages lack full local legal text**.", "",
           "This is an offline evidence inventory, not a blanket redistribution clearance. `node_modules` is a shared junction; "
           "the generator checks each installed version and hashes manifests and legal files. It reads no git identity data. "
           "Run from the S10 worktree: `python tools/studies/s10/dependency_inventory.py`; use `--check` to verify committed artifacts "
           "against the same installed files without rewriting them. JSON is next to the script. No downloads or installations are performed.", "",
           "[ESTABLISHED: package.json; package-lock.json; installed legal files below] Browser runtime is React 19.3.1, React DOM 19.3.1, "
           "scheduler 0.28.0 and Three.js 0.187.0, all MIT. Build/test tooling includes **MPL-2.0 Lightning CSS**, "
           "**CC-BY-4.0 caniuse-lite**, Apache-2.0, BSD, ISC, BlueOak and 0BSD material. Bundled Vite material also includes CC0. "
           "Executing a tool does not by itself establish that the tool is redistributed in the game. Verify the final build's included "
           "code/data and retained license comments before publishing; distributing a tooling archive or vendored dependencies carries "
           "their own conditions.", "",
           "[ESTABLISHED: `node_modules/caniuse-lite/package.json`; `node_modules/caniuse-lite/README.md`] "
           "For CC-BY-4.0 attribution, caniuse-lite's supplied author name is **Ben Briggs**, with source repository "
           "`browserslist/caniuse-lite`; its README identifies it as a smaller caniuse-db. Preserve these credits alongside "
           "the CC-BY-4.0 text/link, and describe any team changes if distributing the data. A generic CC license text alone "
           "does not supply this creator/source attribution. Lightning CSS package metadata identifies "
           "`https://github.com/parcel-bundler/lightningcss.git`; the release owner still needs a corresponding-source "
           "location for the exact distributed version if shipping its MPL-covered binary.", "",
           "[ASSUMED: release recommendation] Preserve complete upstream notices with any redistributed dependency. "
           "The accompanying [third-party-notices.txt](third-party-notices.txt) is review material copied from installed legal sources, "
           "including bundled notices. It is **not complete for absent packages or missing legal text**, and its location in a study "
           "does not automatically put notices in the deployed site. Give a release owner the runtime notices for deployment and the "
           "full inventory for a source/tooling release.", "",
           "## Gaps requiring release follow-through", "",
           f"- The **{c['absent']} absent packages** below have only lockfile declarations; "
           "their package.json and license text were unavailable offline. Audit the actual CI/release install, especially Linux "
           "bindings, before asserting those artifacts have been reviewed.",
           "- `@humanfs/types`, `@rolldown/binding-win32-x64-msvc` and `natural-compare` lack a complete local legal text. "
           "The first and third have README declarations/attribution; these are preserved but are not full licenses. "
           "Obtain exact-version original notices if these packages will be redistributed.",
           "- `prototypes/visual/index.html` and `prototypes/room/index.html` load Three.js **0.170.0** and examples from jsDelivr "
           "outside the lock. Installed **0.187.0** is not exact-version offline license evidence for that CDN code. "
           "See the asset audit for file references; audit the pinned CDN artifact if prototypes are distributed.",
           f"- Bundled upstream notices identify **{c['bundled_notice_components']} component entries** (not necessarily unique packages). "
           f"**{c['bundled_versions_unspecified']}** do not specify exact versions. A manifest's build version range is reported only as a "
           "range, never promoted to the exact bundled version. Original notices supply the actual attribution; an upstream SBOM "
           "would be needed to close missing bundled versions and any unenumerated native-library components.",
           f"- **{c['bundled_legal_blocks_requiring_review']} bundled component blocks** declare a license without reproducing "
           "its full legal text. Their identities are listed below. Preserve supplied attribution and obtain the original "
           "terms before redistributing the affected tooling; an SPDX label alone does not preserve required notices.",
           "- No runtime output bundle was audited by this generator. Source imports, build outputs and tooling archives have "
           "different contents; the final release owner must reconcile the actual distributed files with these notices.", "",
           "## Attribution key", "",
           "[ESTABLISHED: original license text in the evidence paths and notice archive] Each inventory row uses the following "
           "obligation key. Full original legal text controls; these summaries do not replace it.", "",
           "| License | Required handling when covered material is distributed |", "| --- | --- |"]
    out.extend(f"| {name} | {rule} |" for name, rule in LICENSE_RULES.items())
    out += ["", "## Every locked package location", "",
            "Paths in the first column start at the repository root. `R` = browser runtime; `B` = build/test. "
            "`direct` means named in root package.json; `optional` is the lockfile flag. Package metadata evidence is "
            "`<location>/package.json` for installed rows. Every license file column is an exact repository-relative path; "
            "the JSON supplies original-byte SHA-256 hashes. `LOCK ONLY` means neither installed manifest nor legal text was read.", "",
            "| Package location | Version | Use | License / obligation key | Local legal evidence |", "| --- | --- | --- | --- | --- |"]
    for r in report["packages"]:
        scope = "R" if r["scope"] == "runtime" else "B"
        if r["directness"] != "transitive":
            scope += ", direct"
        if r["optional"]:
            scope += ", optional"
        evidence = "; ".join(f"`{p}`" for p in r["license_evidence"])
        if not r["installed"]:
            evidence = "**LOCK ONLY — absent**"
        elif not r["complete_local_license_text"]:
            evidence = (evidence + "; " if evidence else "") + "**full legal text missing**"
        out.append(f"| `{r['path']}` | {r['version']} | {scope} | {r['lock_license']} | {evidence} |")
    out += ["", "## Bundled blocks with declarations but no full legal text", "",
            "[DEMONSTRATED: generator identifies blocks without recognized legal-text phrases] These gaps are in upstream "
            "tooling distributions. The archived notice files preserve exactly what was supplied, including author/repository "
            "information where present.", "",
            "| Container | Component | Declared license |", "| --- | --- | --- |"]
    for b in report["bundled_components"]:
        if not b["full_legal_text_present"]:
            out.append(f"| {b['container']} | {b['name']} | {', '.join(b['license'])} |")
    out += ["", "## Components named inside upstream bundle notices", "",
            "[ESTABLISHED: installed upstream notices] These are additional attribution entries embedded in package artifacts; "
            "some overlap the lock graph at different versions. `Unstated` is an evidence gap, not permission to assume the lock's "
            "version. Preserve the complete named component's block in the notice archive. Three's SculptGL example is recorded "
            "because it ships in that package; its presence here does not assert that the app imports it. The TypeScript notice "
            "also reproduces Unicode, W3C DOM, WHATWG DOM (CC-BY-4.0), W3C Background Synchronization and Khronos WebGL "
            "terms, preserved verbatim in the archive. The W3C specification notice calls for specification name/version "
            "attribution; the installed notice does not identify a version, so that remains a distribution-evidence gap.", "",
            "| Container | Component | Exact version in notice | License | Manifest build specifier, if any | Notice path |",
            "| --- | --- | --- | --- | --- | --- |"]
    for b in report["bundled_components"]:
        out.append(f"| {b['container']} | {b['name']} | {b['version'] or 'Unstated'} | {', '.join(b['license']) or 'See notice'} | "
                   f"{b['declared_build_specifier'] or '—'} | `{b['notice_path']}` |")
    return "\n".join(out) + "\n"


def notices(report: dict, texts: dict[str, str]) -> str:
    counts = report["counts"]
    caniuse = next(p for p in report["packages"] if p["name"] == "caniuse-lite")
    lines = ["S10 OFFLINE THIRD-PARTY LEGAL-TEXT EVIDENCE", "",
             "This is an audit archive, not a claim that all dependencies are redistributed.",
             f"Full text is unavailable for {counts['absent']} absent packages and",
             f"{counts['installed_missing_full_legal_text']} installed packages identified in dependencies.md.",
             "README/source extracts are marked below.",
             "Original legal-source names/contact text, where present, are preserved because",
             "they belong to upstream copyright notices, not to the repository's git identities.",
             "No license for Recursion itself is selected or granted by this file.", "",
             "SUPPLEMENTARY PACKAGE METADATA ATTRIBUTION",
             f"caniuse-lite {caniuse['version']}: author {caniuse['supplied_author_name']}; repository {caniuse['repository']}.",
             "The README describes it as a smaller version of caniuse-db. Licensed CC-BY-4.0.",
             "Exact locked version is authoritative in dependency-inventory.json; preserve",
             "supplied creator/source attribution and disclose any changes when redistributing.", ""]
    for item in report["legal_sources"]:
        legal_text = "\n".join(line.rstrip() for line in texts[item["path"]].splitlines()).rstrip()
        lines += ["=" * 78, item["path"], "Original file SHA-256: " + item["sha256"],
                  "Legal section extracted from source/README; trailing whitespace normalized." if item["excerpt"] else "Complete legal text; LF line endings, UTF-8 encoding, trailing line/file whitespace normalized.",
                  "=" * 78, legal_text, ""]
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="compare generated files without writing")
    args = parser.parse_args()
    report, texts = collect()
    outputs = {
        Path(__file__).with_name("dependency-inventory.json"): json.dumps(report, indent=2, ensure_ascii=False) + "\n",
        OUT / "dependencies.md": markdown(report),
        OUT / "third-party-notices.txt": notices(report, texts),
    }
    failed = []
    for path, content in outputs.items():
        if args.check:
            if not path.exists() or path.read_bytes() != content.encode("utf-8"):
                failed.append(rel(path))
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content.encode("utf-8"))
    print(json.dumps({"counts": report["counts"], "check": "FAIL" if failed else "PASS", "different": failed}, indent=2))
    return 1 if failed or report["counts"]["metadata_mismatches"] or report["counts"]["absent_nonoptional"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
