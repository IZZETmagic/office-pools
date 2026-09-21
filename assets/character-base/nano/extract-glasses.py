#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["shapely"]
# ///
"""Extract an eyewear asset from a traced avatar.

    uv run extract-glasses.py /tmp/gl-g01-round/vectorize-00.svg glasses/assets/g01-round.asset.svg

⭐⭐ WHY THIS IS NOT A COLOUR SELECTION, the way hair is. Recraft requantises on every trace,
and on this family it collides with the BASE: the slate lens of `s01-classic` traced as
rgb(64,119,194) and so did the shirt shadow, and `s02-aviator`'s lens and the shirt shadow both
came back rgb(92,125,155). Nothing in the tone tells a lens from a shirt. Their POSITION does —
eyewear lives at y660..1190 and the shirt starts at y1518 — so selection is by REGION, and a
path must be CONTAINED in it, not merely overlap it. Overlap would take the skull, which spans
y296..1523 straight through the middle of the band.

⭐⭐ AND WHY IT IS A SUBTRACTION. A trace is a jigsaw, not a component: the vectorizer paints
the frame as a SOLID blob and then paints the lens openings back over it as skin-coloured discs
butted into the hole. Take the frame path alone and every pair of spectacles is filled in. The
openings have to be cut out of the frame for real, because the asset is composed OVER the eyes
and anything opaque there hides them.

  frame = union(the dark paths) MINUS union(the openings)
  lens  = union(the mid-tone paths), painted after the frame so it covers the frame's interior

⚠ An opening is a skin path CONTAINED in the frame's own box that actually touches the frame.
The nose and the ears pass that first test and are not openings — they are cut out by position,
the same guard `extract-hair.py` needed when the quiff claimed both ears and the nose as
"lighter texture". Nothing in the tone told them apart there either.

⚠ flatten() at n=48, not 14. These polygons are SUBTRACTED, and a chord that cuts a corner
leaves a sliver of frame across the lens. build-body-layers.py learned the same thing.
"""
import re
import sys
from pathlib import Path

from shapely.geometry import Polygon, box
from shapely.ops import unary_union

# The eyewear band, in the shared 2048 space. Measured across the five traced candidates: the
# widest frame box is x481..1574, y659..1183. The margin is deliberate — a new style may sit a
# little wider — and the shirt at y1518 is still far outside it.
REGION = box(300, 600, 1750, 1300)

SKIN, SHADE = (254, 205, 180), (245, 178, 150)
FRAME_INK = "rgb(64,70,78)"
LENS_TINT = "rgb(96,126,156)"
DARK_MAX_LUM = 110.0

HEAD = ('<svg version="1.1" xmlns="http://www.w3.org/2000/svg" '
        'viewBox="0 0 2048 2048" width="1024" height="1024">')


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


def lum(c) -> float:
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def close(a, b, tol: int = 14) -> bool:
    """Recraft requantises on every trace, so match with tolerance — the base's ear shade came
    back rgb(245,175,148) here and rgb(245,176,148) one file over."""
    return all(abs(x - y) <= tol for x, y in zip(a, b))


def main() -> None:
    src, dst = sys.argv[1], sys.argv[2]
    svg = Path(src).read_text()

    frames, lenses, skins = [], [], []
    for p in re.findall(r"<path[^>]*/?>", svg):
        f = re.search(r'fill="rgb\((\d+),\s*(\d+),\s*(\d+)\)"', p)
        if not f:
            continue
        c = tuple(int(x) for x in f.groups())
        d = re.search(r'd="([^"]*)"', p).group(1)
        v = [float(x) for x in re.findall(r"-?\d+\.?\d*", d)]
        xs, ys = v[0::2], v[1::2]
        # ⚠ CONTAINED, not intersecting. The skull spans y296..1523 and runs straight through
        # the band; an overlap test would pull the whole face into the asset.
        if not REGION.contains(box(min(xs), min(ys), max(xs), max(ys))):
            continue
        cx, w = (min(xs) + max(xs)) / 2, max(xs) - min(xs)
        if close(c, SHADE) and w < 200 and 900 < cx < 1150 and 900 < min(ys) < 1200:
            continue                                   # the nose — position, never tone
        if close(c, SHADE) and (cx < 600 or cx > 1448):
            continue                                   # the ears — likewise
        g = flatten(d)
        if g is None or g.is_empty:
            continue
        if close(c, SKIN) or close(c, SHADE):
            skins.append(g)
        elif lum(c) < DARK_MAX_LUM:
            frames.append(g)
        else:
            lenses.append(g)

    if not frames:
        sys.exit(f"{src}: no frame found in the eyewear band — check the trace")

    frame = unary_union(frames).buffer(0)
    # An opening is a skin shape that actually TOUCHES the frame. Anything else that survived
    # the region test is a face fragment and must not be cut out of anything.
    holes = [s for s in skins if s.intersects(frame)]
    before = frame.area
    if holes:
        frame = frame.difference(unary_union(holes).buffer(0)).buffer(0)

    frags = [f'<path transform="translate(0,0)" fill="{FRAME_INK}" d="{to_d(frame.simplify(0.6))}"/>']
    lens = None
    if lenses:
        lens = unary_union(lenses).buffer(0)
        frags.append(f'<path transform="translate(0,0)" fill="{LENS_TINT}" d="{to_d(lens.simplify(0.6))}"/>')

    Path(dst).write_text(HEAD + "".join(frags) + "</svg>")
    cut = 100 * (1 - frame.area / before) if before else 0
    print(f"  {Path(dst).name:<26} frame {frame.area:8.0f}u²  "
          f"{len(holes)} opening(s) cut {cut:4.1f}%  "
          f"lens {(lens.area if lens else 0):7.0f}u²")


if __name__ == "__main__":
    main()
