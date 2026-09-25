#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["shapely", "pillow"]
# ///
"""Extract the hair that lives BEHIND the body, from a traced avatar.

    uv run extract-behind.py /tmp/t3-f01-bob/vectorize-00.svg f01-bob /tmp/ref/f01-bob.png

⭐ THE PROBLEM. Five hair assets — f01-bob, f03-bobswept, f12-halfup, f14-shag, m14-longhair —
were traced on a body and carry the shirt/neck bite INSIDE their drawn paths, so it cannot be
composited away. The other four that reach the body carry it in a `<mask>`, which `headOnly()`
opens instead. See hair/behind/PROMPT.md.

⭐⭐ WHAT THIS WRITES, AND WHY IT IS SAFE. `hair/behind/<style>.svg`: only the part of the
generated hair that falls INSIDE the body silhouette. Painted after the backfill and before the
hair, it is covered by the body on every real avatar, so the product cannot change — a guard
test holds that. Only the asset picker, which deletes the body, ever sees it.

⭐⭐ TWO SOURCES, BECAUSE THE BITE HAS TWO HALVES.

  the SHOULDERS  from the generated art. The body cut the hair off along the top of the shirt,
                 and only a redraw knows what was there.
  the NECK       from `hair/backfill/<style>.svg`, which already IS the hair behind the neck,
                 per style, derived from the locked geometry. ⚠ Generation cannot supply this:
                 the generated image still has a neck, and the model will not draw hair in
                 front of one — correctly.

⚠ THE NECK HALF RIDES ON THE SHOULDER HALF and is dropped with it. On its own it is two thin
legs of backfill hanging below the chin: the backfill carries nubs that were only ever meant to
sit behind the shirt, and `f01-bob` sprouted them the moment the body went. Hair behind the
neck only means anything underneath hair that reaches the neck, which is the same condition.

⚠⚠ THE SHOULDER HALF IS GATED ON THE SEAM, measured, not eyeballed. The generation redraws the
style and can put the new length somewhere the locked hair never reaches: `f01-bob` and
`f03-bobswept` came back 138 and 158 units adrift, because their hem sits ABOVE the shirt and
nothing ever cut them there. A detached blob is worse than the notch it was meant to fill, so
anything further than SEAM_MAX from the locked hair is dropped and the style keeps its neck
half alone. The locked hair's own silhouette is read off the reference PNG, which is the only
place it exists as a shape — the assets carry it inside a mask.

⚠⚠ MINUS THE HEAD, and this is the whole trick — the same one `build-body-layers.py` needs.
The neck's top runs 170 units up into the skull and is meant to be hidden there. Clip to the
body alone and the new layer paints hair across the chin, because `behind` is stacked after the
base has already painted the head.

⚠ SELECTION IS BY COLOUR, never by index — `extract-hair.py`'s rule, for its reason: Recraft
orders paths by size and stacking and the order changes per image.

⚠⚠ BUT IT IS NEAREST-TONE, NOT A TOLERANCE. A first version hard-coded the base's own tones and
asked "is this within 14 of one of them"; the reference is built by `compose.py`, which DERIVES
the neck shadow from the skin rather than carrying the base's, so its shadow is rgb(223,180,158)
where the base's is rgb(245,178,150) — 23 apart on red, outside any sane tolerance. Every neck
shadow was therefore classified as hair and each of the five came out a solid shoulder dome.
Matching each traced tone to its NEAREST tone in the reference has no threshold to get wrong,
and it absorbs both the tracer's requantisation and the JPEG bytes Nano Banana returns under a
.png name.

⚠ Two tones out, mapped by luminance — the lighter mass to HAIR_BASE and the darker texture to
HAIR_SHADE — never by which one the tracer emitted first. On an INVERTED trace the texture tone
is the one with the most paths.
"""
import re
import sys
from pathlib import Path

from shapely.geometry import Polygon
from shapely.ops import unary_union

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))

HAIR_BASE, HAIR_SHADE = "rgb(140,122,110)", "rgb(114,97,86)"
SKIN, SHADE = (254, 205, 180), (245, 178, 150)
SHIRT, SHIRT2 = (30, 118, 214), (50, 118, 183)
WHITE = (255, 255, 255)
HEAD = ('<svg version="1.1" xmlns="http://www.w3.org/2000/svg" '
        'viewBox="0 0 2048 2048" width="1024" height="1024">')

# How far the new length may sit from the locked hair before it is judged detached. 12 units
# is under a pixel at the size these render; the three that work measure 4-6, and the two that
# do not measure 138 and 158, so there is no judgement in the number.
SEAM_MAX = 12

# The two hair tones the reference was composed with — hair/behind/PROMPT.md records the
# palette. Everything else in the reference is a body tone.
REF_HAIR = ((140, 122, 110), (109, 95, 85))


def close(a, b, tol=6):
    return all(abs(x - y) <= tol for x, y in zip(a, b))


def nearest(c, palette):
    return min(palette, key=lambda q: sum((a - b) ** 2 for a, b in zip(c, q)))


def flatten(d: str, n: int = 48):
    """Bezier path -> polygon. Lifted from build-body-layers.py; 48 segments for the same
    reason recorded there — a coarser chord cuts corners and the shapes are SUBTRACTED."""
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


def rgb_of(p: str):
    m = re.search(r'fill="rgb\((\d+),\s*(\d+),\s*(\d+)\)"', p)
    return tuple(int(x) for x in m.groups()) if m else None


def d_of(p: str) -> str:
    return re.search(r'd="([^"]*)"', p).group(1)


def seam_gap(ref_png: str, behind, region):
    """How far the new length sits below the locked hair, per column, in viewBox units.

    ⚠ Read off the RASTER. A hair asset keeps its silhouette inside a `<mask>`, so there is no
    polygon to measure against — but the reference PNG is that style composed and rendered.
    """
    from PIL import Image
    im = Image.open(ref_png).convert("RGB")
    w, h = im.size
    px = im.load()
    gaps = []
    for col in range(0, w, 3):
        x = col / w * 2048
        lock = [y for y in range(h)
                if min(sum((a - b) ** 2 for a, b in zip(px[col, y], t)) for t in REF_HAIR) < 700]
        if not lock:
            continue
        strip = behind.intersection(region).intersection(
            Polygon([(x - 1, 0), (x + 1, 0), (x + 1, 2048), (x - 1, 2048)]))
        if strip.is_empty:
            continue
        gaps.append(strip.bounds[1] - max(lock) / h * 2048)
    if not gaps:
        return None
    gaps.sort()
    return gaps[len(gaps) // 2]


def body_minus_head(base_svg: str):
    """The base's own shirt + neck + neck shadow, MINUS the head. See the header."""
    shirt, neck, head = [], [], None
    for p in re.findall(r"<path[^>]*/?>", base_svg):
        c = rgb_of(p)
        if c is None:
            continue
        v = [float(x) for x in re.findall(r"-?\d+\.?\d*", d_of(p))]
        xs, ys = v[0::2], v[1::2]
        w, cx = max(xs) - min(xs), (min(xs) + max(xs)) / 2
        if close(c, SHIRT) or close(c, SHIRT2):
            shirt.append(p)
        elif close(c, SKIN) and w > 900:
            head = p
        elif close(c, SKIN):
            neck.append(p)
        elif close(c, SHADE) and w < 200 and 900 < cx < 1150 and 900 < min(ys) < 1200:
            pass                                   # the nose
        elif close(c, SHADE) and (cx < 600 or cx > 1448):
            pass                                   # the ears
        elif close(c, SHADE):
            neck.append(p)                         # the neck shadow
    skull = flatten(d_of(head))
    body = unary_union([flatten(d_of(p)) for p in shirt + neck]).difference(skull).buffer(0)
    just_neck = unary_union([flatten(d_of(p)) for p in neck]).difference(skull).buffer(0)
    return body, just_neck


def main():
    trace, style, ref_png = sys.argv[1], sys.argv[2], sys.argv[3]
    svg = Path(trace).read_text()
    region, neck_region = body_minus_head((HERE / "bases/base-neck-100.svg").read_text())

    # every tone the reference actually carries — the nearest one decides what a traced path is
    ref_svg = Path(ref_png).with_suffix(".svg")
    palette = {rgb_of(p) for p in re.findall(r"<path[^>]*/?>", ref_svg.read_text())} - {None}
    palette |= set(REF_HAIR)
    if not set(REF_HAIR) <= palette:
        sys.exit(f"{style}: the reference does not carry the hair tones this script expects")

    # ⚠⚠ PAINTER'S ALGEBRA, NOT A UNION. Recraft sometimes returns an INVERTED trace: one
    # full-canvas path in the hair tone with the face and the body painted over it. Unioning
    # the hair tones and clipping gave a solid shoulder dome on four of the five styles,
    # because the "hair" it clipped was the whole canvas. `extract-hair.py` meets the same
    # thing and tests whether the largest hair path covers the nose; replaying the document in
    # order needs no test at all and is right for a normal trace too — a later path covers an
    # earlier one, whatever either is made of.
    tone = {HAIR_BASE: None, HAIR_SHADE: None}

    def sub(key, g):
        tone[key] = None if tone[key] is None else tone[key].difference(g).buffer(0)

    lums = sorted({sum(c) for c in (rgb_of(p) for p in re.findall(r"<path[^>]*/?>", svg))
                   if c is not None and nearest(c, palette) in REF_HAIR})
    cut = (lums[0] + lums[-1]) / 2 if len(lums) > 1 else float("inf")

    for p in re.findall(r"<path[^>]*/?>", svg):
        c = rgb_of(p)
        if c is None:
            continue
        g = flatten(d_of(p))
        if g is None or g.is_empty:
            continue
        if nearest(c, palette) in REF_HAIR:
            # ⚠ Luminance, not trace order — see the header.
            key = HAIR_BASE if sum(c) >= cut else HAIR_SHADE
            other = HAIR_SHADE if key is HAIR_BASE else HAIR_BASE
            tone[key] = g if tone[key] is None else tone[key].union(g).buffer(0)
            sub(other, g)
        else:
            for k in tone:
                sub(k, g)

    # ⭐ the NECK half, from this style's backfill — see the header
    bf = HERE / "hair/backfill" / f"{style}.svg"
    neck_hair = None
    if bf.exists():
        gs = [flatten(d_of(p)) for p in re.findall(r"<path[^>]*/?>", bf.read_text())]
        gs = [g for g in gs if g is not None and not g.is_empty]
        if gs:
            neck_hair = unary_union(gs).buffer(0).intersection(neck_region).buffer(0)
    # ⚠ the SHOULDER half, gated on the seam — see the header
    shoulders = unary_union([g for g in tone.values() if g is not None]).buffer(0)
    gap = seam_gap(ref_png, shoulders, region) if not shoulders.is_empty else None
    attached = gap is not None and gap <= SEAM_MAX
    print(f"   seam {'-' if gap is None else f'{gap:.0f}u'}"
          f"  {'attached' if attached else 'DETACHED — shoulder half dropped'}", end="")

    # ⚠ THE NECK HALF RIDES ON THE SHOULDER HALF. It is the hair BEHIND the neck, which only
    # means anything underneath hair that reaches the neck in the first place. Kept on its own
    # it is two thin legs of backfill hanging below the chin — see the nubs in hem().
    if not attached:
        neck_hair = None

    out = []
    for token in (HAIR_BASE, HAIR_SHADE):
        g = tone[token]
        if g is None:
            continue
        g = g.intersection(region).buffer(0) if attached else None
        if g is None:
            g = neck_hair if token is HAIR_BASE else None
            if g is None:
                continue
        elif token is HAIR_BASE and neck_hair is not None:
            g = g.union(neck_hair).buffer(0)
        g = g.simplify(0.6)
        # ⚠ Specks: the tracer leaves slivers along the clip edge. 400 sq units is under a
        # pixel at the size these render, and they cost bytes in every bundle.
        if g.geom_type == "MultiPolygon":
            g = unary_union([q for q in g.geoms if q.area > 400])
        if g.is_empty:
            continue
        out.append(f'<path transform="translate(0,0)" fill="{token}" d="{to_d(g)}"/>')

    if not out:
        sys.exit(f"\n{style}: nothing fell inside the body — did the hair actually extend?")
    dest = HERE / "hair/behind" / f"{style}.svg"
    dest.write_text(HEAD + "".join(out) + "</svg>")
    print(f"   {dest.relative_to(HERE)}  {len(out)} paths  {dest.stat().st_size} bytes")


if __name__ == "__main__":
    main()
