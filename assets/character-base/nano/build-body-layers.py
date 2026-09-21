#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["shapely"]
# ///
"""Derive the two body layers that let long hair work on every neck width.

    uv run build-body-layers.py

⭐ THE PROBLEM. Every hair asset was traced against base-neck-100 and carries that base's
body silhouette as a DIP in its own outline. The dip's edges sit at the default neck's edges,
so on any other base the hair is wrong: a narrower neck leaves a background crack between the
hair and the neck, and a wider neck is simply covered — at neck-140 the hair hides 35px of neck
on each side, which is why the two wider necks render almost identically to the default.

⭐⭐ THE FIX, without touching a single locked hair asset. Two derived layers:

  hair-backfill.svg    the neck-100 body silhouette, in the HAIR token. Painted just BEFORE
                       the hair, it fills the dip, so the hair is solid behind the body.
  front-neck-<N>.svg   that base's own body (shirt, neck, neck shadow) MINUS the head,
                       painted just AFTER the hair, so the body sits in front of it at its
                       true width whatever the hair does.

  ⚠ "minus the head" is the whole trick. The neck cannot simply be re-painted later: its top
  extends 170 units up into the skull and is meant to be hidden there, so painted over the
  head it would show as a block on the chin. Subtracting the head keeps only the part that
  was visible anyway.

Everything is derived from the LOCKED bases and written next to them; the bases themselves are
read-only and never modified. Re-run this after any change to a base.
"""
import json
import re
import sys
from pathlib import Path

from shapely.geometry import Polygon, Point
from shapely.ops import unary_union

HERE = Path(__file__).parent
SKIN, SHADE = "rgb(254,205,180)", "rgb(245,178,150)"
SHIRT, SHIRT2 = "rgb(30,118,214)", "rgb(50,118,183)"
HAIR_BASE = "rgb(140,122,110)"
GROW = 5.0
HEAD = '<svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2048 2048" width="1024" height="1024">'


def flatten(d: str, n: int = 14):
    toks = re.findall(r"[MLCZz]|-?\d+\.?\d*", d)
    i, cur, rings, ring = 0, None, [], []
    while i < len(toks):
        t = toks[i]
        if t == "M":
            if len(ring) > 2:
                rings.append(ring)
            cur = (float(toks[i + 1]), float(toks[i + 2])); ring = [cur]; i += 3
        elif t == "L":
            cur = (float(toks[i + 1]), float(toks[i + 2])); ring.append(cur); i += 3
        elif t == "C":
            p1 = (float(toks[i + 1]), float(toks[i + 2]))
            p2 = (float(toks[i + 3]), float(toks[i + 4]))
            p3 = (float(toks[i + 5]), float(toks[i + 6]))
            for k in range(1, n + 1):
                u = k / n
                a, b, c, e = (1 - u) ** 3, 3 * (1 - u) ** 2 * u, 3 * (1 - u) * u ** 2, u ** 3
                ring.append((a * cur[0] + b * p1[0] + c * p2[0] + e * p3[0],
                             a * cur[1] + b * p1[1] + c * p2[1] + e * p3[1]))
            cur = p3; i += 7
        else:
            i += 1
    if len(ring) > 2:
        rings.append(ring)
    polys = [Polygon(r).buffer(0) for r in rings if len(r) > 2]
    return unary_union(polys) if polys else None


def paths_of(svg: str):
    return re.findall(r"<path[^>]*/?>", svg)


def d_of(p: str) -> str:
    return re.search(r'd="([^"]*)"', p).group(1)


def to_d(geom, nd: int = 1) -> str:
    def ring(coords):
        pts = list(coords)
        out = f"M {round(pts[0][0], nd)} {round(pts[0][1], nd)}"
        for x, y in pts[1:-1]:
            out += f" L {round(x, nd)} {round(y, nd)}"
        return out + " z"
    gs = [geom] if geom.geom_type == "Polygon" else list(geom.geoms)
    return " ".join(ring(g.exterior.coords) + "".join(" " + ring(h.coords) for h in g.interiors)
                    for g in gs)


def classify(svg: str):
    """The base's parts, by fill and shape. Same tests compose uses."""
    out = {"shirt": [], "neck": [], "shadow": [], "head": None}
    for p in paths_of(svg):
        fill = re.search(r'fill="([^"]*)"', p).group(1)
        v = [float(x) for x in re.findall(r"-?\d+\.?\d*", d_of(p))]
        xs, ys = v[0::2], v[1::2]
        w, cx = max(xs) - min(xs), (min(xs) + max(xs)) / 2
        if fill in (SHIRT, SHIRT2):
            out["shirt"].append(p)
        elif fill == SKIN and w > 900:
            out["head"] = p                       # the only skin path that spans the canvas
        elif fill == SKIN:
            out["neck"].append(p)
        elif fill == SHADE and w < 200 and 900 < cx < 1150 and 900 < min(ys) < 1200:
            pass                                   # the nose
        elif fill == SHADE and (cx < 600 or cx > 1448):
            pass                                   # the ears
        elif fill == SHADE:
            out["shadow"].append(p)
    return out


def clean(g, floor: float = 500):
    if g.is_empty:
        return g
    parts = [g] if g.geom_type == "Polygon" else [x for x in g.geoms if x.area > floor]
    return unary_union(parts) if parts else g


def main() -> None:
    bases = sorted(HERE.glob("bases/base-neck-*.svg"))
    notch = None
    for b in bases:
        n = b.stem.split("-")[-1]
        svg = b.read_text()
        P = classify(svg)
        head = flatten(d_of(P["head"]))
        frags = []
        for p in P["shirt"] + P["shadow"] + P["neck"]:
            g = clean(flatten(d_of(p)).difference(head).buffer(0))
            if g.is_empty:
                continue
            fill = re.search(r'fill="([^"]*)"', p).group(1)
            frags.append(f'<path transform="translate(0,0)" fill="{fill}" d="{to_d(g.simplify(0.8))}"/>')
        (HERE / f"bases/front-neck-{n}.svg").write_text(HEAD + "".join(frags) + "</svg>")
        print(f"  front-neck-{n}.svg  {len(frags)} paths")
        if n == "100":
            body = unary_union([flatten(d_of(p)) for p in P["shirt"] + P["neck"] + P["shadow"]])
            notch = clean(body.difference(head).buffer(0)).simplify(0.8)

    # ⚠ GROWN by a few units, because the dip traced into the hair is very slightly LARGER
    # than the body it was traced from — about 2-4 units — and that difference shows as a
    # one-pixel background crack where the hair meets the shoulder. The halo is hidden under
    # the hair above and under the front body below, so it never shows as a rim.
    #
    # ⚠⚠ ...but only down to y1780. Below that the hair has ended, and a halo on the bare
    # shoulder dome would read as a dark outline round the shirt for the whole lower canvas.
    from shapely.geometry import box
    grown = notch.buffer(GROW, join_style=2)
    notch = unary_union([grown.intersection(box(0, 0, 2048, 1780)), notch]).simplify(0.8)
    (HERE / "bases/hair-backfill.svg").write_text(
        HEAD + f'<path transform="translate(0,0)" fill="{HAIR_BASE}" d="{to_d(notch)}"/></svg>')
    print(f"  hair-backfill.svg   area {notch.area:,.0f} (grown {GROW}u above y1780)")

    # ⭐ Which hair styles need the backfill? Only the ones long enough to BRACKET the neck —
    # a buzz cut never reaches it, and filling the dip for one would paint hair beside a narrow
    # neck out of nowhere. Tested by asking whether the style has ink on BOTH sides of the neck
    # at the rows where the dip is.
    flags = {}
    for f in sorted(HERE.glob("hair/assets/*.asset.svg")):
        g = unary_union([flatten(d_of(p)) for p in paths_of(f.read_text())
                         if re.search(r'fill="rgb\(', p)])
        def hits(x, y):
            return g is not None and not g.is_empty and g.contains(Point(x, y))
        brackets = any(hits(820, y) and hits(1230, y) for y in (1540, 1580, 1620))
        flags[f.name.replace(".asset.svg", "").replace("hair-", "")] = brackets
    (HERE / "hair/manifest.json").write_text(json.dumps({
        "_comment": "backfill: this style is long enough to BRACKET the neck, so the body-shaped "
                    "dip traced into it shows as a background crack on a narrower neck. compose "
                    "paints bases/hair-backfill.svg behind these styles to fill it. Generated by "
                    "build-body-layers.py — do not hand-edit.",
        "backfill": flags,
    }, indent=2) + "\n")
    yes = [k for k, v in flags.items() if v]
    print(f"  hair/manifest.json  {len(yes)} of {len(flags)} styles need the backfill: {', '.join(yes)}")


if __name__ == "__main__":
    main()
