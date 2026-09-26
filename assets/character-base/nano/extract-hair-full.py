#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["shapely", "pillow"]
# ///
"""Extract a COMPLETE hair asset — the hairstyle as a hairstyle, with no body bitten out of it.

    uv run extract-hair-full.py traced.svg ref.svg out.asset.svg [--shade shade-traced.svg]
                                [--tones "#8C7A6E,#6D5F55"]

⭐⭐⭐ WHY THIS REPLACES `extract-behind.py`. Every hair asset was traced on a body, so the body
is cut out of the art, and the picker shows the hair with a bite in it. The first answer was a
display-only FILL for that bite, reconstructed with geometry rules — a back curtain, a strand
corridor, a seam gate. Ryan, 2026-09-25: *"there is no texture and it does not look like it
belongs... SHOULD we do it properly and have the layered assets instead of this back and
forth?"* He is right. **Geometry rules cannot make texture.** A rule can close a hole; only art
can put hair in it.

So the asset becomes complete instead, and everything downstream gets simpler:

  the picker   draws the asset on a bare head. No fill, no curtain, nothing synthesised.
  an avatar    composes base → hair → body-in-front, and the body covers what it should —
               which is already how `compose` works.

⭐ THE GENERATION IS THE SAME ONE THAT ALREADY WORKS: the avatar composed WITH its body, and the
hair asked to fall in FRONT of the shoulder dome (hair/behind/PROMPT.md). That draws the whole
hairstyle. The only change here is that nothing is clipped away afterwards.

⚠ PAINTER'S ALGEBRA, replaying the document in order — Recraft returns an INVERTED trace for
some images (one full-canvas path in the hair tone with the face and body painted over it), and
unioning the hair tones would take the whole canvas. Replaying also gives the face and ear
cut-outs for free: whatever the body, the face or an ear covers in the picture is simply not
hair, so the asset carries exactly the holes it should.

⚠ TWO PASSES FOR TWO TONES. Recraft merges tones that are close — 14/255 was enough to lose the
distinction on `m14-longhair` — so the darker tone is isolated by `isolate-tone.py` and traced
on its own, then subtracted from the lighter one. Without it a style extracts flat and the
texture is gone, which is the exact complaint this file exists to answer.

⚠ SEALED WITH A STROKE of its own fill at width 1.2 — the hair convention, `seal-hair-seams.py`,
and a guard test holds it. ⚠ `transform="translate(0,0)"` is the grandfathered form the guards
allow; any other transform is dropped silently by react-native-svg.
"""
import re
import sys
from pathlib import Path

from shapely.geometry import Polygon
from shapely.ops import unary_union

HERE = Path(__file__).parent
HAIR_BASE, HAIR_SHADE = "rgb(140,122,110)", "rgb(114,97,86)"
REF_HAIR = ((140, 122, 110), (109, 95, 85))
SEAL = 1.2
HEAD = ('<svg version="1.1" xmlns="http://www.w3.org/2000/svg" '
        'viewBox="0 0 2048 2048" width="1024" height="1024">')


def arg(flag, default=None):
    return sys.argv[sys.argv.index(flag) + 1] if flag in sys.argv else default


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


def rgb_of(p):
    m = re.search(r'fill="rgb\((\d+),\s*(\d+),\s*(\d+)\)"', p)
    return tuple(int(x) for x in m.groups()) if m else None


def d_of(p):
    return re.search(r'd="([^"]*)"', p).group(1)


def nearest(c, palette):
    return min(palette, key=lambda q: sum((a - b) ** 2 for a, b in zip(c, q)))


def main():
    trace, ref_svg, dest = sys.argv[1], sys.argv[2], sys.argv[3]
    tones = arg("--tones")
    ref_hair = (tuple(tuple(int(h[k:k + 2], 16) for k in (1, 3, 5)) for h in tones.split(","))
                if tones else REF_HAIR)
    svg = Path(trace).read_text()
    palette = ({rgb_of(p) for p in re.findall(r"<path[^>]*/?>", Path(ref_svg).read_text())}
               - {None}) | set(ref_hair)

    lums = sorted({sum(c) for c in (rgb_of(p) for p in re.findall(r"<path[^>]*/?>", svg))
                   if c is not None and nearest(c, palette) in ref_hair})
    cut = (lums[0] + lums[-1]) / 2 if len(lums) > 1 else float("inf")

    tone = {HAIR_BASE: None, HAIR_SHADE: None}

    def sub(key, g):
        if tone[key] is not None:
            tone[key] = tone[key].difference(g).buffer(0)

    for p in re.findall(r"<path[^>]*/?>", svg):
        c = rgb_of(p)
        if c is None:
            continue
        g = flatten(d_of(p))
        if g is None or g.is_empty:
            continue
        if nearest(c, palette) in ref_hair:
            key = HAIR_BASE if sum(c) >= cut else HAIR_SHADE
            tone[key] = g if tone[key] is None else tone[key].union(g).buffer(0)
            sub(HAIR_SHADE if key is HAIR_BASE else HAIR_BASE, g)
        else:
            for k in tone:
                sub(k, g)

    shade_svg = arg("--shade")
    if shade_svg:
        gs = [flatten(d_of(p)) for p in re.findall(r"<path[^>]*/?>", Path(shade_svg).read_text())
              if (rgb_of(p) or (255, 255, 255)) and sum(rgb_of(p) or (255, 255, 255)) <= 200]
        gs = [g for g in gs if g is not None and not g.is_empty and g.area > 400]
        if gs:
            dark = unary_union(gs).buffer(0)
            whole = unary_union([g for g in tone.values() if g is not None]).buffer(0)
            tone[HAIR_SHADE] = dark.intersection(whole).buffer(0)
            tone[HAIR_BASE] = whole.difference(dark).buffer(0)

    out = []
    for token in (HAIR_BASE, HAIR_SHADE):
        g = tone[token]
        if g is None or g.is_empty:
            continue
        g = g.simplify(0.6)
        if g.geom_type == "MultiPolygon":
            g = unary_union([q for q in g.geoms if q.area > 400])
        if g.is_empty:
            continue
        out.append(f'<path transform="translate(0,0)" fill="{token}" stroke="{token}" '
                   f'stroke-width="{SEAL}" d="{to_d(g)}"/>')
    if not out:
        sys.exit("no hair found in the trace")
    Path(dest).write_text(HEAD + "".join(out) + "</svg>")
    print(f"   {dest}  {len(out)} paths  {Path(dest).stat().st_size} bytes")


if __name__ == "__main__":
    main()
