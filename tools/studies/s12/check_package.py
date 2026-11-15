"""Offline S12 copy/claim/link/timing audit; no application or dependency writes.

Run: python -B tools/studies/s12/check_package.py [--check]
Without --check, writes claim-ledger.md and validation.json in S12-owned paths.
Coverage and evidence locations are checked, not factual entailment,
portal acceptance, browser behavior, or the unrecorded final demo.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[3]
DOCS = ROOT / 'docs/studies/s12'
HERE = Path(__file__).resolve().parent
CLAIM = re.compile(r'<!-- ([A-Z]\d{2}) -->\s*([^\n|]+)')
FIELD = re.compile(r'<!-- field: ([\w-]+) -->\n(.*?)<!-- /field -->', re.S)
READINESS = {'shows in the live build now', "needs 2G's 3D merge"}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def read(path: Path) -> str:
    return path.read_text(encoding='utf-8-sig')


def table(text: str, tag: str) -> list[list[str]]:
    body = text.split(f'<!-- {tag} -->', 1)[1].split(f'<!-- /{tag} -->', 1)[0]
    rows = [line.strip().strip('|').split('|') for line in body.splitlines() if line.startswith('|')]
    return [[part.strip() for part in row] for row in rows[2:]]


def safe_cell(value: str) -> str:
    return value.replace('|', '&#124;').replace('\n', ' ')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='verify outputs without writing')
    args = parser.parse_args()
    evidence = json.loads(read(DOCS / 'claim-evidence.json'))
    drafts = read(DOCS / 'drafts.md')
    demo = read(DOCS / 'demo.md')
    sentences: dict[str, tuple[str, str]] = {}
    for name, content in (('drafts.md', drafts), ('demo.md', demo)):
        for match in CLAIM.finditer(content):
            claim_id, sentence = match.groups()
            require(claim_id not in sentences, f'Duplicate sentence ID: {claim_id}')
            sentences[claim_id] = (sentence.strip(), name)

    claims = {}
    for group in evidence['claims']:
        require(bool(group['needed']), 'Every group must state evidence/release follow-through')
        require(re.match(r'\[(ESTABLISHED:|DEMONSTRATED:|ASSUMED\]|FICTIONAL\])', group['label']) is not None,
                f"Missing convention label: {group['ids']}")
        for source in group['sources']:
            require(source in evidence['sources'], f'Unknown source {source}')
        for claim_id in group['ids']:
            require(claim_id not in claims, f'Duplicate ledger ID: {claim_id}')
            claims[claim_id] = group
    require(set(sentences) == set(claims),
            f'Copy/ledger mismatch: missing {set(sentences)-set(claims)}, unused {set(claims)-set(sentences)}')

    counts = {}
    for name, block in FIELD.findall(drafts):
        require(name not in counts, f'Duplicate field {name}')
        for line in block.splitlines():
            require(not line.strip() or re.match(r'> <!-- [A-Z]\d{2} --> ', line) is not None,
                    f'Untracked field line in {name}: {line}')
        copy = ' '.join(match.group(2).strip() for match in CLAIM.finditer(block))
        require(bool(copy), f'Empty field {name}')
        if name.startswith('opening-'):
            require(len(re.findall(r'[.!?](?:\s|$)', copy)) == 1, f'Opening must be one sentence: {name}')
        counts[name] = {
            'words_whitespace_split': len(copy.split()),
            'unicode_characters_including_spaces': len(copy),
            'utf16_code_units_including_spaces': len(copy.encode('utf-16-le')) // 2,
            'verified_portal_cap': None,
            'claim_ids': [match.group(1) for match in CLAIM.finditer(block)],
        }
    require(len(counts) == 10, 'Expected seven fields/conditional blocks plus three openings')
    ai_copy = ' '.join(sentences[key][0] for key in counts['ai']['claim_ids'])
    require(not re.search(r'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}', ai_copy), 'Email in AI disclosure')
    require('the owner' in ai_copy.lower(), 'Owner wording missing')

    shots = table(demo, 'storyboard')
    require(len(shots) == 6, 'Expected six shots')
    previous = 0
    durations = []
    for row in shots:
        start, end, duration = map(int, row[1:4])
        require(start == previous and end - start == duration and duration > 0,
                f'Gap/overlap or invalid duration: {row[0]}')
        require(row[4] in READINESS, f'Missing shot readiness: {row[0]}')
        require(CLAIM.search(row[6]) is not None, f'Untracked caption: {row[0]}')
        durations.append(duration)
        previous = end
    require(previous == 30 and sum(durations) <= 30, 'Storyboard exceeds 30 seconds')
    slides = table(demo, 'slides')
    require([row[0] for row in slides] == [str(i) for i in range(1, 8)], 'Expected seven ordered slides')
    for row in slides:
        require(row[1] in READINESS, f'Missing slide readiness: {row[0]}')

    source_hashes = {}
    for source_id, source in evidence['sources'].items():
        records = []
        for path in source['paths']:
            if 'ref' in source:
                require(path in {'docs/handoffs/2G.md', 'docs/verification/gmat.md'},
                        'Only requested 2G documents may be read')
                data = subprocess.run(['git', 'show', f"{source['ref']}:{path}"], cwd=ROOT,
                                      check=True, capture_output=True).stdout
            else:
                target = ROOT / path
                require(target.exists(), f'Missing evidence: {path}')
                data = target.read_bytes()
            if Path(path).suffix not in {'.jpg', '.png'}:
                data = data.replace(b'\r\n', b'\n')
            records.append({'path': path, 'ref': source.get('ref', 'working-tree'),
                            'sha256_lf_normalized_text_or_original_image': hashlib.sha256(data).hexdigest()})
        source_hashes[source_id] = records

    # Generated ledger links come from checked evidence paths.
    link_count = 0
    for doc in sorted(DOCS.glob('*.md')):
        if doc.name == 'claim-ledger.md':
            continue
        for link in re.findall(r'\]\(([^)]+)\)', read(doc)):
            if re.match(r'https?://', link) or link.startswith('#'):
                continue
            path = unquote(link.split('#', 1)[0].strip('<>'))
            target = (doc.parent / path).resolve()
            generated = {DOCS / 'claim-ledger.md', HERE / 'validation.json'}
            require(target.exists() or target in generated, f'Broken local link: {doc.name} -> {link}')
            link_count += 1

    lines = ['# S12 — Sentence-by-sentence claim ledger', '',
             'Generated by `python -B tools/studies/s12/check_package.py`; edit `drafts.md`/`demo.md` and `claim-evidence.json`, then regenerate.', '',
             f"Baseline `{evidence['baseline']}`; read-only 2G document snapshot `{evidence['branch_2g']}`.", '',
             'Every field sentence, alternative opening and public demo caption is quoted below. Instructions, questions and fictional premises are included so they cannot silently turn into factual results. Source labels distinguish reported prior tests from S12 reruns. **HOLD** rows are not current-release claims. Editorial notes outside the copy blocks retain their own citations and qualifications.', '',
             '## Copy lengths', '',
             'Copy only, with sentences joined by one space; attached links and paragraph breaks are excluded. Verify the actual pasted text in the editor. **All portal text caps remain unknown.**', '',
             '| Block | Words | Characters including spaces |', '|---|---:|---:|']
    for name, count in counts.items():
        lines.append(f"| {name} | {count['words_whitespace_split']} | {count['unicode_characters_including_spaces']} |")
    lines.extend(['', '## Claims', '',
                  '| ID | Exact copy | Label / status | Evidence | Qualification and required follow-through |',
                  '|---|---|---|---|---|'])
    for claim_id, (sentence, filename) in sentences.items():
        group = claims[claim_id]
        refs = ', '.join(f'[{source}](#source-{source})' for source in group['sources'])
        row = [f'{claim_id} ({filename})', sentence, f"{group['label']} **{group['status']}**", refs,
               f"{group['qualification']} **Needed:** {group['needed']}"]
        lines.append('| ' + ' | '.join(safe_cell(cell) for cell in row) + ' |')
    lines.extend(['', '## Source register', ''])
    for source_id, source in evidence['sources'].items():
        lines.extend([f'<a id="source-{source_id}"></a>', f'### {source_id}', '', source['scope'], ''])
        for path in source['paths']:
            if 'ref' in source:
                lines.append(f"- `git show {source['ref']}:{path}` (unmerged 2G evidence).")
            else:
                lines.append(f'- [{path}](../../../{path})')
        for url in source.get('urls', []):
            lines.append(f'- [Publisher source]({url})')
        lines.append('')

    report = {
        'baseline': evidence['baseline'], 'branch_2g_document_snapshot': evidence['branch_2g'],
        'claim_count': len(sentences), 'field_counts': counts,
        'count_convention': 'Copy only, sentences joined by one space; excludes IDs, Markdown, paragraph breaks and attached URLs. Verify final pasted text plus links in the portal.',
        'storyboard_seconds': sum(durations), 'shot_durations_seconds': durations,
        'slide_count_including_title_and_close': len(slides),
        'checked_local_links': link_count, 'source_hashes': source_hashes,
        'limits': ['No text cap is verified', 'No browser, export, publication or eligibility check performed by this checker',
                   'Evidence existence and coverage are checked; semantic support requires editorial review'],
    }
    outputs = {DOCS / 'claim-ledger.md': '\n'.join(lines).rstrip() + '\n',
               HERE / 'validation.json': json.dumps(report, ensure_ascii=False, indent=2) + '\n'}
    for path, content in outputs.items():
        if args.check:
            require(path.exists() and read(path) == content, f'Stale generated output: {path.relative_to(ROOT)}')
        else:
            path.write_text(content, encoding='utf-8', newline='\n')
    print(f'PASS: {len(sentences)} mapped sentences; {len(counts)} copy blocks; 30-second storyboard; 7 slides; {link_count} local links')
    for name, count in counts.items():
        print(f"{name}: {count['words_whitespace_split']} words, {count['unicode_characters_including_spaces']} characters; portal cap unknown")


if __name__ == '__main__':
    main()
