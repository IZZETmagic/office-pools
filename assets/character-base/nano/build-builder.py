#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Bake every avatar asset into one self-contained HTML avatar builder.

    uv run build-builder.py  ->  avatar-builder.html

The page has no dependencies and no network calls: every asset is inlined, and the compose
logic is a direct port of compose.py. Open the file and it works.

⚠ The port must stay faithful. compose.py is the reference implementation — if the two drift,
the builder lies about what the product will render. The derived colours in particular are
not decoration: the blush is skin pulled 22% toward rose, stubble is hair pulled 55% toward
skin, and both exist because fixed colours looked wrong on dark skin.
"""
import json
import re
from pathlib import Path

HERE = Path(__file__).parent


def inner(p: Path) -> str:
    s = p.read_text()
    return s[s.index(">", s.index("<svg")) + 1: s.rindex("</svg>")]


def collect(globpat, strip=""):
    out = {}
    for f in sorted(HERE.glob(globpat)):
        name = f.name.replace(".asset.svg", "").replace(".svg", "")
        if strip:
            name = name.replace(strip, "")
        out[name] = inner(f)
    return out


bases = {f.stem: f.read_text() for f in sorted(HERE.glob("bases/base-neck-*.svg"))}
data = {
    "bases": bases,
    "hair": collect("hair/assets/*.asset.svg", "hair-"),
    "expressions": collect("expressions/assets/*.asset.svg"),
    "facialhair": collect("facialhair/assets/*.asset.svg"),
    "eyes": collect("eyes/assets/*.asset.svg"),
    "specialEyes": collect("eyes/special/assets/*.asset.svg"),
    "mouths": collect("mouths/assets/*.asset.svg"),
    "fhManifest": {k: v for k, v in
                   json.loads((HERE / "facialhair/manifest.json").read_text()).items()
                   if not k.startswith("_")},
}

html = (HERE / "builder-template.html").read_text()
out = html.replace("/*__DATA__*/", "const ASSETS = " + json.dumps(data) + ";")
(HERE / "avatar-builder.html").write_text(out)
kb = len(out) / 1024
print(f"avatar-builder.html  {kb:.0f}KB  "
      f"({len(data['hair'])} hair, {len(data['expressions'])} expressions, "
      f"{len(data['facialhair'])} facial hair, {len(data['eyes'])}+{len(data['specialEyes'])} eyes, "
      f"{len(data['mouths'])} mouths, {len(bases)} bases)")
