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

  hair/backfill/<s>    per style: the part of the neck-100 body dip that sits next to THAT
                       style's own hair, in the HAIR token. Painted just BEFORE the hair, it
                       fills the dip so the hair is solid behind the body. ⚠ Per style because
                       one shared shape leaves a hair-coloured rim on the shoulders of every
                       style that does not cover it.
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
BRIDGE = 44.0   # must span the dip beside the NARROWEST neck (~30 units), with margin
SEAL = 3.0      # the grown rim is kept only this close to the hair, or it reads as an outline
HEAD = '<svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2048 2048" width="1024" height="1024">'


# ⚠ 48, not 14. These polygons are SUBTRACTED from each other, so a chord that cuts a corner
# makes the head WIDER than it really is and eats into the backfill beside the neck — at 14 it
# left a 9px background gap on f12-halfup at neck-085. The output is simplified afterwards, so
# the extra points cost nothing in the file.
def flatten(d: str, n: int = 48):
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
    head_100 = None
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
            head_100 = head

    # ⭐ Which hair styles need a backfill at all? Only the ones long enough to BRACKET the
    # neck — a buzz cut never reaches it, and filling the dip for one would paint hair beside a
    # narrow neck out of nowhere. Tested by asking whether the style has ink on BOTH sides of
    # the neck at the rows where the dip is.
    flags = {}
    hairs = {}
    for f in sorted(HERE.glob("hair/assets/*.asset.svg")):
        g = unary_union([flatten(d_of(p)) for p in paths_of(f.read_text())
                         if re.search(r'fill="rgb\(', p)]).buffer(0)
        style = f.name.replace(".asset.svg", "").replace("hair-", "")
        hairs[style] = g
        flags[style] = any(g.contains(Point(820, y)) and g.contains(Point(1230, y))
                           for y in (1540, 1580, 1620))

    # ⭐⭐ THE BACKFILL IS PER STYLE, and this is why. One shape covering the whole body notch
    # draws a HAIR-COLOURED RIM along the shoulder and down the neck wherever the hair does not
    # happen to cover it — up to 899px on f03-bobswept. Ryan saw it at once on the shorter
    # styles: "for short long hair there is like a brown outline over the shoulders and down
    # the neck." The fill has to be restricted to the hair that needs it.
    #
    # Two pieces, clipped to two different distances from that style's own silhouette:
    #
    #   inside the notch  within BRIDGE of the hair — the fill that closes the gap beside a
    #                     narrower neck, so it has to reach right across the dip
    #   the grown rim     within SEAL of the hair — two or three units, just enough to cover
    #                     the one-pixel crack where the hair's traced dip sits very slightly
    #                     outside the body it was traced from
    #
    # ⚠⚠ ...and the whole thing is CUT OUT OF THE HEAD. The backfill paints after the head, so
    # anything crossing the jaw draws a band across the chin — Ryan saw that too. The margin is
    # 1 unit: enough that flattening cannot creep back over the jaw, small enough that the fill
    # still reaches the neck's own edge. It is only safe because flatten() runs at 48 segments.
    from shapely.geometry import box
    grown = notch.buffer(GROW, join_style=2).intersection(box(0, 0, 2048, 1780))
    rim = grown.difference(notch)

    out_dir = HERE / "hair/backfill"
    out_dir.mkdir(exist_ok=True)
    for old in out_dir.glob("*.svg"):
        old.unlink()
    made = []
    for style, g in hairs.items():
        if not flags[style] or g.is_empty:
            continue
        fill = unary_union([notch.intersection(g.buffer(BRIDGE)),
                            rim.intersection(g.buffer(SEAL))])
        fill = clean(fill.difference(head_100.buffer(1)).buffer(0))
        if fill.is_empty:
            continue
        fill = fill.simplify(0.8)
        (out_dir / f"{style}.svg").write_text(
            HEAD + f'<path transform="translate(0,0)" fill="{HAIR_BASE}" d="{to_d(fill)}"/></svg>')
        made.append(style)

    (HERE / "hair/manifest.json").write_text(json.dumps({
        "_comment": "backfill: this style is long enough to BRACKET the neck, so the body-shaped "
                    "dip traced into it shows as a background crack on a narrower neck. compose "
                    "paints hair/backfill/<style>.svg behind it to fill that dip. The fill is "
                    "PER STYLE because one shared shape leaves a hair-coloured rim on the "
                    "shoulders of every style that does not cover it. Generated by "
                    "build-body-layers.py — do not hand-edit.",
        "backfill": flags,
    }, indent=2) + "\n")
    print(f"  hair/backfill/      {len(made)} per-style fills: {', '.join(made)}")
    print(f"  hair/manifest.json  {sum(flags.values())} of {len(flags)} styles flagged")


if __name__ == "__main__":
    main()
