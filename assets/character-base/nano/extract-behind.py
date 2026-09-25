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
  the NECK       the neck silhouette filled solid, capped at the hem of the hair beside it.
                 ⚠ Generation cannot supply this: the generated image still HAS a neck, and the
                 model will not draw hair in front of one — correctly. ⚠ Nor can the backfill:
                 it is a RIM built to seal the dip beside a narrower neck, so using its own
                 shape left `f03-bobswept` a hole in the middle. Hair behind a neck is solid.

⚠⚠ THE TWO HALVES ARE INDEPENDENT, and believing otherwise cost a whole pass. `f01-bob` and
`f03-bobswept` fail the seam gate — their redrawn length lands 130 and 153 units adrift — but
they are exactly the two styles that need the NECK half most: neither has a single path across
x849..1199, because the trace cut the neck out of a blunt hem that runs dead flat at y1554 and
y1560. Dropping the neck half with the shoulder half left them with the hole they started with.

⚠ The nubs that looked like a reason to drop it were never in this layer at all. They are the
BACKFILL's own, visible only in a scratch preview that had not deleted it; `headOnly()` does.
Capping the neck fill at the hem is still right — it keeps the fill flush with a blunt cut —
but it is a tidiness rule, not a reason to refuse.

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

# Where the body starts, and the only bound the fill needs.
SHOULDER_LINE = 1519

# Sealing the neck fill against the hair beside it. ⚠⚠ Burying the shape sideways does NOT
# work here and the reason is worth keeping: at the fill's own y the body IS the neck, nothing
# wider, so `∩ region` pulls any sideways growth straight back to x849/x1199 and the two
# anti-aliased edges still meet on a line. One column read rgb(83,72,66) against rgb(57,46,39).
#
# ⭐ So the OVERLAP comes from the stroke instead, and it has to be wider than hair's usual 1.2:
# that is 0.6 units a side, a quarter of a pixel at card size, and it left the seam reading
# rgb(83,72,66). 4.0 took `f01-bob` to within 4/255 but left `f03-bobswept` at 18. 8.0 is 4
# units a side, just under two pixels on a 900px card, and closes both.
#
# ⚠ A stroke grows EVERY edge, including the top, and the top edge sits on the chin — the head
# is painted before this layer, so 2 units of stroke would paint 2 units of hair onto the jaw.
# CHIN_CLEAR holds the fill back from the skull by exactly what the stroke puts on, so the two
# cancel and the top edge lands where it always did. ⚠ It also caps the BOTTOM: the fill is cut
# at the hem, and the stroke would hang half its width below it, so the cut is raised to match.
SEAL_STROKE = 8.0
CHIN_CLEAR = SEAL_STROKE / 2

# The two hair tones the reference was composed with — hair/behind/PROMPT.md records the
# palette. Everything else in the reference is a body tone.
REF_HAIR = ((140, 122, 110), (109, 95, 85))


def shade_trace_from_argv():
    """`--shade <traced.svg>` — the darker hair tone, traced on its own. See isolate-tone.py.

    ⚠ Recraft MERGES two close tones into one path. Ryan's fill for `m14-longhair` separates
    rgb(69,59,50) curtains from an rgb(55,45,38) mass behind the neck by 14/255 and the
    vectorizer returned a single shape for both, so the hair extracted as a flat slab. The
    second pass is the same trick `hair-prompt.md` rule 5 uses for texture.
    """
    for i, a in enumerate(sys.argv):
        if a == "--shade":
            return sys.argv[i + 1]
    return None


def ref_hair_from_argv():
    """Override the two hair tones — `--tones #4A3B32,#38271F`.

    ⭐ For art that did NOT come from this pipeline. Ryan generates fills straight from a
    PICKER CARD, which is already in the product's own palette, so the tones the tracer returns
    are the member's hair colour and its derived shade rather than the house ash browns.
    Everything downstream is identical; only what counts as "hair" changes.
    """
    for i, a in enumerate(sys.argv):
        if a == "--tones":
            return tuple(tuple(int(h[k:k + 2], 16) for k in (1, 3, 5))
                         for h in sys.argv[i + 1].split(","))
    return REF_HAIR


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


def hem(ref_png: str, x0: float, x1: float):
    """How far down the locked hair reaches in a band of columns, in viewBox units.

    ⚠ The neck fill is clipped to this. The backfill is the WHOLE neck silhouette and carries
    two downward nubs that only ever sat behind the shirt; uncapped they hang below a blunt hem.
    `f01-bob` is cut dead flat at y1554 and `f03-bobswept` at y1560, so the cap is the hem.
    """
    from PIL import Image
    im = Image.open(ref_png).convert("RGB")
    w, h = im.size
    px = im.load()
    lows = [max(ys) / h * 2048
            for col in range(int(x0 / 2048 * w), int(x1 / 2048 * w), 2)
            if (ys := [y for y in range(h)
                       if min(sum((a - b) ** 2 for a, b in zip(px[col, y], t))
                              for t in REF_HAIR) < 700])]
    return max(lows) if lows else None


def dominant_tone(ref_png: str, x0: float, x1: float, y0: float, y1: float):
    """Which of the two hair tones the locked hair actually uses beside a region.

    ⭐ Ryan, 2026-09-25: the neck fill "is a hairline different all the way around". It was —
    filled with HAIR_BASE while the hair either side of the neck on `f01-bob` and
    `f03-bobswept` is HAIR_SHADE, rgb(74,59,50) against rgb(57,46,39). A patch that has to
    disappear into its neighbours takes its tone FROM them; there is nothing to derive.
    """
    from PIL import Image
    im = Image.open(ref_png).convert("RGB")
    w, h = im.size
    px = im.load()
    votes = {t: 0 for t in REF_HAIR}
    for col in range(max(0, int(x0 / 2048 * w)), min(w, int(x1 / 2048 * w)), 2):
        for row in range(max(0, int(y0 / 2048 * h)), min(h, int(y1 / 2048 * h)), 2):
            c = px[col, row]
            near = min(REF_HAIR, key=lambda t: sum((a - b) ** 2 for a, b in zip(c, t)))
            if sum((a - b) ** 2 for a, b in zip(c, near)) < 700:
                votes[near] += 1
    best = max(votes, key=lambda t: votes[t])
    return None if votes[best] == 0 else (HAIR_BASE if best == REF_HAIR[0] else HAIR_SHADE)


def seam_gap(ref_png: str, piece):
    """How far one PIECE of new length sits below the locked hair, in viewBox units.

    ⚠ Read off the RASTER. A hair asset keeps its silhouette inside a `<mask>`, so there is no
    polygon to measure against — but the reference PNG is that style composed and rendered.

    ⚠⚠ PER PIECE, never over the whole layer. `f02-ponytail`'s redraw put the tail back where
    it belongs AND invented a second fall of hair on the empty left side; one figure over both
    threw the good half away with the bad. Each connected component is judged on its own.
    """
    from PIL import Image
    im = Image.open(ref_png).convert("RGB")
    w, h = im.size
    px = im.load()
    x0, _, x1, _ = piece.bounds
    gaps = []
    for col in range(max(0, int(x0 / 2048 * w)), min(w, int(x1 / 2048 * w) + 1), 3):
        x = col / w * 2048
        lock = [y for y in range(h)
                if min(sum((a - b) ** 2 for a, b in zip(px[col, y], t)) for t in REF_HAIR) < 700]
        if not lock:
            continue
        strip = piece.intersection(
            Polygon([(x - 1, 0), (x + 1, 0), (x + 1, 2048), (x - 1, 2048)]))
        if strip.is_empty:
            continue
        gaps.append(strip.bounds[1] - max(lock) / h * 2048)
    if not gaps:
        return None
    # ⚠⚠ THE MINIMUM, not the median. A piece is a continuation if it meets the locked hair
    # ANYWHERE along it. `f02-ponytail` has hair only at the crown for most of the columns its
    # tail passes through — at x1200 the lowest locked pixel is y468 — so a median read 1115u
    # and rejected the tail that was the entire point of the exercise.
    return min(gaps)


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
    return body, just_neck, skull


def main():
    global REF_HAIR
    REF_HAIR = ref_hair_from_argv()
    trace, style, ref_png = sys.argv[1], sys.argv[2], sys.argv[3]
    svg = Path(trace).read_text()
    body, neck_region, skull = body_minus_head((HERE / "bases/base-neck-100.svg").read_text())
    # ⚠⚠ NOT the body silhouette. The fill is painted only by headOnly() now, so it no longer
    # has to hide inside the body — and clipping it there was what cut Ryan's locs, which hang
    # past the shirt dome: a hairline along the dome edge and a loc sliced in two. The bound is
    # simply "below the shoulder line", where the bite always is.
    region = Polygon([(0, SHOULDER_LINE), (2048, SHOULDER_LINE), (2048, 2048), (0, 2048)])
    # ⚠⚠ ...but the GATE still judges against the body silhouette. With the half-plane the
    # pieces merge into one mass that touches the locked hair somewhere, so `f01-bob` and
    # `f03-bobswept` went from 130u/153u adrift to -35u and their detached blobs sailed through.
    # The body is the shape that separated them cleanly; it stays the ruler even though it is
    # no longer the clip.
    gate_region = body

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

    # ⭐ the NECK half — see the header. The neck silhouette filled SOLID, capped at the hem of
    # the hair beside it. ⚠ Not the backfill's own shape: that is a RIM, built to seal the dip
    # beside a narrower neck, and it left `f03-bobswept` a hole in the middle of the fill. Hair
    # behind a neck is solid.
    nx0, nx1 = neck_region.bounds[0], neck_region.bounds[2]
    floors = [f for f in (hem(ref_png, nx0 - 110, nx0), hem(ref_png, nx1, nx1 + 110))
              if f is not None]
    neck_hair = neck_tone = None
    if floors:
        g = neck_region.intersection(
            Polygon([(0, 0), (2048, 0), (2048, max(floors) - CHIN_CLEAR),
                     (0, max(floors) - CHIN_CLEAR)])).buffer(0)
        if not g.is_empty:
            # ⚠ held clear of the chin by what the stroke will add back — see SEAL_STROKE
            neck_hair = g.difference(skull.buffer(CHIN_CLEAR)).buffer(0)
            neck_hair = None if neck_hair.is_empty else neck_hair
            # ⭐ the tone the hair BESIDE the neck actually uses — see dominant_tone()
            ny0 = g.bounds[1]
            neck_tone = (dominant_tone(ref_png, nx0 - 110, nx0, ny0, max(floors))
                         or dominant_tone(ref_png, nx1, nx1 + 110, ny0, max(floors))
                         or HAIR_BASE)

    # ⚠ the SHOULDER half, gated on the seam — PIECE BY PIECE, see seam_gap()
    whole = unary_union([g for g in tone.values() if g is not None]).buffer(0)
    gated = whole.intersection(gate_region).buffer(0) if not whole.is_empty else whole
    pieces = ([] if gated.is_empty else
              [gated] if gated.geom_type == "Polygon" else list(gated.geoms))
    whole = whole.intersection(region).buffer(0) if not whole.is_empty else whole
    out_parts = ([] if whole.is_empty else
                 [whole] if whole.geom_type == "Polygon" else list(whole.geoms))
    keep, report = [], []
    for piece in pieces:
        if piece.area < 400:
            continue
        gap = seam_gap(ref_png, piece)
        ok = gap is not None and gap <= SEAM_MAX
        report.append(f"{'-' if gap is None else f'{gap:.0f}'}{'' if ok else '✗'}")
        if ok:
            # the OUTPUT part this gated piece belongs to — the half-plane version of it
            keep += [q for q in out_parts if q.intersects(piece)]
    attached = bool(keep)
    # ⚠⚠ THE PIECES ARE A MASK, NOT THE OUTPUT. Gating works on the union of both tones,
    # because a light mass and the dark mass inside it are one connected piece of hair — but
    # the union is all this ever emitted for a while, so every shoulder half shipped as flat
    # HAIR_BASE. Ryan, 2026-09-25: "the colours and feeling of depth is not" right. The two
    # tones ARE the depth: the curtain that hangs in front is the light one, the mass behind
    # the neck is the dark one, and with both collapsed the hair reads as a slab.
    kept = unary_union(keep).buffer(0) if keep else None
    print(f"   seam [{' '.join(report) or '-'}]  {len(keep)}/{len(report)} kept", end="")

    # ⚠ HAIR_BASE first, HAIR_SHADE second: they are disjoint by construction (the painter's
    # replay subtracts one from the other), but the order is the one the hair assets use.
    # ⭐ the darker tone from its own pass, when the single trace could not separate them
    shade_svg = shade_trace_from_argv()
    if shade_svg:
        gs = []
        for p in re.findall(r"<path[^>]*/?>", Path(shade_svg).read_text()):
            c = rgb_of(p)
            if c is None or sum(c) > 200:      # keep only the near-black mass
                continue
            g = flatten(d_of(p))
            if g is not None and not g.is_empty and g.area > 400:
                gs.append(g)
        if gs:
            dark = unary_union(gs).buffer(0)
            whole_hair = unary_union([g for g in tone.values() if g is not None]).buffer(0)
            tone[HAIR_SHADE] = dark.intersection(whole_hair).buffer(0)
            tone[HAIR_BASE] = whole_hair.difference(dark).buffer(0)

    out = []
    for token in (HAIR_BASE, HAIR_SHADE):
        g = tone[token]
        if g is not None and kept is not None:
            g = g.intersection(region).intersection(kept).buffer(0)
        elif g is not None:
            g = None
        if neck_hair is not None and token == neck_tone:
            g = neck_hair if g is None or g.is_empty else g.union(neck_hair).buffer(0)
        if g is None or g.is_empty:
            continue
        g = g.simplify(0.6)
        # ⚠ Specks: the tracer leaves slivers along the clip edge. 400 sq units is under a
        # pixel at the size these render, and they cost bytes in every bundle.
        if g.geom_type == "MultiPolygon":
            g = unary_union([q for q in g.geoms if q.area > 400])
        if g.is_empty:
            continue
        # ⚠ SEALED WITH A STROKE OF ITS OWN FILL, the same convention every hair path carries
        # (see seal-hair-seams.py). Two anti-aliased edges meeting on one line leak a light
        # one-pixel crack; a stroke makes the shapes OVERLAP instead of meet. The compositors
        # already swap stroke as well as fill, and a guard test holds that.
        out.append(f'<path transform="translate(0,0)" fill="{token}" stroke="{token}" '
                   f'stroke-width="{SEAL_STROKE}" d="{to_d(g)}"/>')

    if not out:
        sys.exit(f"\n{style}: nothing fell inside the body — did the hair actually extend?")
    dest = HERE / "hair/behind" / f"{style}.svg"
    dest.write_text(HEAD + "".join(out) + "</svg>")
    print(f"   {dest.relative_to(HERE)}  {len(out)} paths  {dest.stat().st_size} bytes")


if __name__ == "__main__":
    main()
