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
# ⭐ THE GLASS HIGHLIGHT. Ryan, 2026-09-21: an empty opening "just seems like they are empty
# frames" — a clear lens needs something in it that says glass.
#
# ⚠⚠ IT CANNOT KEEP THE TONE IT TRACED AS. The generator draws the highlight in near-white and
# Recraft quantises it to rgb(255,255,255) — which is the BACKGROUND token. Left alone, every
# glint would be repainted with the avatar's background colour and vanish on a white one.
GLINT = "rgb(226,240,250)"
# ⭐⭐ AND IT IS TRANSLUCENT. Ryan, 2026-09-21: "The glint is there but you can't see through it.
# It is glass and should [be] subtle so you can still see through it." An opaque band is a
# blind; glass lightens what is behind it and lets it read. 0.35 was picked off a strip of
# candidates from 0.18 to 0.55 — below 0.25 it disappears, above 0.45 it starts hiding the iris.
#
# ⚠ This is the first `fill-opacity` in the avatar system. It joins <mask> and <linearGradient>
# in the pile that has never been proven on a device with react-native-svg.
GLINT_ALPHA = 0.35
DARK_MAX_LUM = 110.0
GLINT_MIN_LUM = 195.0

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


def clean(g, floor: float = 400):
    """Drop slivers. A subtraction of two traced outlines leaves hairline crumbs along every
    shared edge, and each one becomes a subpath in the output."""
    if g.is_empty:
        return g
    parts = [g] if g.geom_type == "Polygon" else [x for x in g.geoms if x.area > floor]
    return unary_union(parts) if parts else g.__class__()


def rings_of(d: str, n: int = 48):
    """Every subpath of `d` as its OWN polygon.

    ⚠⚠ Not flatten(). flatten() unions the subpaths, and a hole unioned with the shape it sits
    in is not a hole — it is a filled disc lying on top, and the interiors vanish. An SVG hole
    is a subpath wound the other way and resolved by fill-rule at paint time, so the only way
    to get it back is to keep the rings apart and work out the nesting here.
    """
    out = []
    for sub in re.findall(r"M[^Mz]*z?", d):
        g = flatten("M" + sub.lstrip("M"), n)
        if g is not None and not g.is_empty:
            out.append(g)
    return out


def openings_of(asset: str):
    """The lens holes already cut into a finished asset: a ring that sits inside another one."""
    m = re.search(rf'fill="{re.escape(FRAME_INK)}"[^>]*d="([^"]*)"', asset)
    if not m:
        m = re.search(rf'd="([^"]*)"[^>]*fill="{re.escape(FRAME_INK)}"', asset)
    if not m:
        return None
    rings = rings_of(m.group(1))
    holes = [r for r in rings if any(o is not r and o.area > r.area and o.contains(r.buffer(-1))
                                     for o in rings)]
    return unary_union(holes).buffer(0) if holes else None


def add_glint(trace_path: str, asset_path: str) -> None:
    """Take ONLY the highlight from a new trace and add it to an approved asset.

    ⭐⭐ The frame is NOT re-traced. Same discipline as build-bushy.py: the approved geometry is
    reused byte-for-byte and exactly one new path is layered onto it, so a highlight pass cannot
    silently move a frame Ryan has already signed off.

    ⚠ The highlight is CLIPPED to the openings the asset already has, so it can never spill over
    the frame even if the generation painted a little past it.
    """
    asset = Path(asset_path).read_text()
    holes = openings_of(asset)
    if holes is None or holes.is_empty:
        sys.exit(f"{asset_path}: no lens opening to put a highlight in")
    # ⚠⚠ THE SAME JIGSAW AS THE FRAME, one level down. The vectorizer fills the WHOLE lens
    # white and then butts the two skin-coloured corners back over it, so the white path is the
    # entire opening and taking it whole gives an opaque lens — 99.8% of the hole, which is a
    # blind, not a highlight. The band is what is left after the corners are subtracted.
    light, cover = [], []
    for p in re.findall(r"<path[^>]*/?>", Path(trace_path).read_text()):
        f = re.search(r'fill="rgb\((\d+),\s*(\d+),\s*(\d+)\)"', p)
        if not f:
            continue
        c = tuple(int(x) for x in f.groups())
        d = re.search(r'd="([^"]*)"', p).group(1)
        v = [float(x) for x in re.findall(r"-?\d+\.?\d*", d)]
        xs, ys = v[0::2], v[1::2]
        if not REGION.contains(box(min(xs), min(ys), max(xs), max(ys))):
            continue
        g = flatten(d)
        if g is None or g.is_empty:
            continue
        if close(c, SKIN):
            cover.append(g)
        elif not close(c, SHADE) and lum(c) >= GLINT_MIN_LUM:
            light.append(g)
    if not light:
        sys.exit(f"{trace_path}: no highlight found inside the lens openings")
    glint = unary_union(light).buffer(0)
    if cover:
        glint = glint.difference(unary_union(cover).buffer(0)).buffer(0)
    glint = clean(glint.intersection(holes).buffer(0), floor=400)
    if glint.is_empty:
        sys.exit(f"{trace_path}: the highlight vanished once the corners were subtracted")
    glint = glint.simplify(0.6)
    frag = (f'<path transform="translate(0,0)" fill="{GLINT}" '
            f'fill-opacity="{GLINT_ALPHA}" d="{to_d(glint)}"/>')
    Path(asset_path).write_text(asset.replace("</svg>", frag + "</svg>"))
    print(f"  {Path(asset_path).name:<26} highlight {glint.area:7.0f}u²  "
          f"= {100 * glint.area / holes.area:4.1f}% of the lens openings")


def main() -> None:
    if sys.argv[1] == "--glint":
        add_glint(sys.argv[2], sys.argv[3])
        return
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
