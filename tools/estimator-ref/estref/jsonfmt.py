"""Compact, diff-friendly JSON: nested containers break onto lines only when
they do not fit in `width` characters, so one measurement stays on one line."""
from __future__ import annotations

import json

import numpy as np


def _default(o):
    if isinstance(o, np.bool_):
        return bool(o)
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, np.floating):
        return float(o)
    if isinstance(o, np.ndarray):
        return o.tolist()
    raise TypeError(type(o))


def clean(o):
    """Plain Python containers and scalars (round-trips through JSON)."""
    return json.loads(json.dumps(o, default=_default))


def dumps(obj, indent=0, width=170):
    compact = json.dumps(obj, separators=(", ", ": "))
    if len(compact) + indent <= width or not isinstance(obj, (dict, list)) or not obj:
        return compact
    pad = " " * (indent + 1)
    if isinstance(obj, dict):
        items = [pad + json.dumps(k) + ": " + dumps(v, indent + 1, width) for k, v in obj.items()]
        return "{\n" + ",\n".join(items) + "\n" + " " * indent + "}"
    items = [pad + dumps(v, indent + 1, width) for v in obj]
    return "[\n" + ",\n".join(items) + "\n" + " " * indent + "]"


def diff(a, b, path="", rtol=1e-6, atol=1e-9, out=None, limit=20):
    """Numeric comparison of two JSON-like values. Inputs (attempts, truth) use a
    tighter relative tolerance than fitted outputs."""
    out = [] if out is None else out
    if len(out) >= limit:
        return out
    tight = "/attempts" in path or "/truth" in path
    if isinstance(a, dict) and isinstance(b, dict):
        for k in sorted(set(a) | set(b)):
            if k not in a or k not in b:
                out.append(f"{path}/{k}: missing on one side")
            else:
                diff(a[k], b[k], f"{path}/{k}", rtol, atol, out, limit)
    elif isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            out.append(f"{path}: length {len(a)} != {len(b)}")
        else:
            for i, (x, y) in enumerate(zip(a, b)):
                diff(x, y, f"{path}[{i}]", rtol, atol, out, limit)
    elif isinstance(a, bool) or isinstance(b, bool) or isinstance(a, str) or isinstance(b, str) or a is None or b is None:
        if a != b:
            out.append(f"{path}: {a!r} != {b!r}")
    else:
        rt = 1e-10 if tight else rtol
        at = 1e-12 if tight else atol
        if abs(a - b) > rt * max(abs(a), abs(b)) + at:
            out.append(f"{path}: {a!r} != {b!r}")
    return out
