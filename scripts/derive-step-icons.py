#!/usr/bin/env python3
"""
Derive builder step icons from the avatar art.

    uv run scripts/derive-step-icons.py          # print the constants
    uv run scripts/derive-step-icons.py --check   # verify the checked-in file still matches

The seven builder tabs are icon-only, so each glyph carries the whole meaning of its step. Five
come from Hugeicons; the ones here come from the avatar assets themselves, which is what the note
above STEPS has always wanted: "the icon for `Facial hair` could BE a beard."

⚠⚠ THIS READS THE ASSETS AND NEVER WRITES THEM. The art is locked. A path is lifted verbatim and
every coordinate is put through ONE affine transform to land it in Hugeicons' 24x24 box — no
smoothing, no simplification, no hand-tuned control points. If an icon looks wrong the fix is the
framing constants below, or the asset, never a number in the output.

⚠ The transform is baked into the coordinates rather than emitted as transform="...". A transform
string is ignored outright by react-native-svg, so it would work on web and silently collapse the
glyph the day these are reused on the phone.
"""

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Hugeicons' own solid-rounded glyphs span roughly 1.25..22.75 of the 24 box, so 21 with the
# remainder as margin matches the pack the other five icons come from.
#
# ⚠ A WIDE GLYPH OVERRIDES IT. That margin exists so a SQUARE icon does not touch the edges; a
# 4:1 moustache has no vertical extent to protect and spending 3 units on side margins only makes
# an already-thin shape lighter still next to full-height neighbours. Icon sets do the same thing
# — a "minus" runs edge to edge. Per-icon `span` below.
BOX = 24.0
SPAN = 21.0

ICONS = [
    {
        "name": "HeadIcon",
        "asset": "assets/character-base/nano/bases/base-neck-100.svg",
        # ⭐ HEAD + BOTH EARS, and nothing else — Ryan: "the outline or shape of our avatars head
        # (only ears on it)". The same rule the hair tiles already follow: "no eyes, no mouth, no
        # nose, only the ears".
        #
        # ⚠⚠ BY INDEX, because fill cannot separate these. The head is rgb(254,205,180) and so is
        # the NECK; the ears are rgb(245,178,150) and so are the neck shadow and the NOSE. Only
        # position tells them apart. Indices are safe here and nowhere else: the bases are LOCKED
        # art (bases/LOCKED.sha256), so `expect_paths` below fails loudly if that ever stops
        # being true rather than silently drawing a nose.
        "paths": [5, 7, 8],
        "expect_paths": 9,
        # ⚠ NO evenodd. The ears OVERLAP the head, so an even-odd rule would punch holes where
        # they meet; nonzero (the default) unions them into one silhouette. Verified by eye at
        # 220px before this was wired.
    },
    {
        "name": "GlassesIcon",
        "asset": "assets/character-base/nano/glasses/assets/s01-classic.asset.svg",
        # ⚠ THE FRAME ONLY. The asset also carries a lens tint and a glint, and an icon is ONE
        # colour — flattened together they would merge into a featureless slab. The frame path is
        # the silhouette that reads as glasses, verified by rendering it alone at 300px and 60px
        # before this was wired.
        "fill": "rgb(64,70,78)",
        # 2.95:1. Full width, same reasoning as the moustache.
        "span": 23.0,
    },
    {
        "name": "MoustacheIcon",
        "asset": "assets/character-base/nano/facialhair/assets/moustache.asset.svg",
        # 4.18:1. Full width, because the vertical margin is free and the width is not.
        "span": 23.0,
    },
]


def cubic(p0: float, p1: float, p2: float, p3: float, t: float) -> float:
    u = 1 - t
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3


def parse(d: str):
    """Absolute M/C/Z only — every avatar asset is emitted that way by the tracer."""
    toks = re.findall(r"[MCLZz]|-?\d*\.?\d+", d)
    used = {t for t in toks if t.isalpha()}
    unsupported = used - {"M", "C", "L", "Z", "z"}
    if unsupported:
        raise SystemExit(
            f"unsupported path commands {sorted(unsupported)} — this script only handles the "
            "absolute M/C/L/Z the asset tracer emits, and guessing at the rest would silently "
            "distort the art"
        )
    return toks


def bbox(toks):
    """Tight bounds: cubics are SAMPLED, not approximated by their control hull, which would
    inflate the box and shrink the glyph inside it."""
    xs, ys, cur, start, i = [], [], None, None, 0
    while i < len(toks):
        t = toks[i]
        if t == "M":
            x, y = float(toks[i + 1]), float(toks[i + 2])
            cur = start = (x, y)
            xs.append(x)
            ys.append(y)
            i += 3
        elif t == "C":
            n = [float(toks[i + k]) for k in range(1, 7)]
            x0, y0 = cur
            for s in range(41):
                tt = s / 40
                xs.append(cubic(x0, n[0], n[2], n[4], tt))
                ys.append(cubic(y0, n[1], n[3], n[5], tt))
            cur = (n[4], n[5])
            i += 7
        elif t == "L":
            x, y = float(toks[i + 1]), float(toks[i + 2])
            cur = (x, y)
            xs.append(x)
            ys.append(y)
            i += 3
        else:
            cur = start
            i += 1
    return min(xs), min(ys), max(xs), max(ys)


def fmt(v: float) -> str:
    return "%g" % round(v, 3)


def transform(toks, s: float, tx: float, ty: float) -> str:
    out, i = [], 0
    while i < len(toks):
        t = toks[i]
        if t == "M":
            out.append(f"M{fmt(float(toks[i + 1]) * s + tx)} {fmt(float(toks[i + 2]) * s + ty)}")
            i += 3
        elif t == "C":
            n = [float(toks[i + k]) for k in range(1, 7)]
            pairs = [f"{fmt(n[k] * s + tx)} {fmt(n[k + 1] * s + ty)}" for k in (0, 2, 4)]
            out.append("C" + " ".join(pairs))
            i += 7
        elif t == "L":
            out.append(f"L{fmt(float(toks[i + 1]) * s + tx)} {fmt(float(toks[i + 2]) * s + ty)}")
            i += 3
        else:
            out.append("Z")
            i += 1
    return " ".join(out)


def derive(spec) -> tuple[str, str]:
    svg = (ROOT / spec["asset"]).read_text()
    want = spec.get("fill")
    idx = spec.get("paths")
    if idx:
        all_paths = re.findall(r'<path[^>]*d="([^"]+)"', svg)
        expected = spec.get("expect_paths")
        if expected is not None and len(all_paths) != expected:
            raise SystemExit(
                f"{spec['asset']}: expected {expected} paths, found {len(all_paths)}. This icon "
                "selects by INDEX, so a changed asset would silently draw the wrong parts — "
                "re-read the file and update both the indices and expect_paths."
            )
        paths = [" ".join(all_paths[i] for i in idx)]
    elif want:
        found = re.findall(rf'<path[^>]*fill="{re.escape(want)}"[^>]*d="([^"]+)"', svg)
        if len(found) != 1:
            raise SystemExit(
                f"{spec['asset']}: expected exactly one path filled {want}, found {len(found)}. "
                "An icon is one path; picking silently would be picking at random."
            )
        paths = found
    else:
        paths = re.findall(r'\sd="([^"]+)"', svg)
        if len(paths) != 1:
            raise SystemExit(
                f"{spec['asset']} has {len(paths)} paths and no `fill` selector; this script emits "
                "ONE path per icon, so a multi-path asset needs a deliberate decision about which "
                "part an icon shows"
            )
    toks = parse(paths[0])
    x0, y0, x1, y1 = bbox(toks)
    w, h = x1 - x0, y1 - y0
    s = spec.get("span", SPAN) / max(w, h)
    tx = (BOX - w * s) / 2 - x0 * s
    ty = (BOX - h * s) / 2 - y0 * s
    note = f"{w:.0f}x{h:.0f} source, aspect {w / h:.2f} -> {w * s:.1f}x{h * s:.1f} in {BOX:.0f}"
    return transform(toks, s, tx, ty), note


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="fail if components/avatar/stepIcons.ts has drifted from the assets")
    args = ap.parse_args()

    target = ROOT / "components/avatar/stepIcons.ts"
    current = target.read_text() if target.exists() else ""
    drifted = []

    for spec in ICONS:
        d, note = derive(spec)
        if args.check:
            if d not in current:
                drifted.append(spec["name"])
        else:
            print(f"// {spec['name']}: {note}")
            print(f"  ['path', {{ d: '{d}', fill: 'currentColor', key: '0' }}],\n")

    if args.check:
        if drifted:
            print("DRIFTED from the assets: " + ", ".join(drifted), file=sys.stderr)
            return 1
        print(f"{len(ICONS)}/{len(ICONS)} step icons match their assets")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
