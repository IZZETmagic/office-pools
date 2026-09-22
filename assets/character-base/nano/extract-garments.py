#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["shapely"]
# ///
"""Extract a garment asset from a traced avatar.

    uv run extract-garments.py /tmp/ga-w04-polo/vectorize-00.svg garments/assets/w04-polo.asset.svg

⭐ A GARMENT IS PAINTED IN THE BASE'S OWN SHIRT TOKENS, so `--shirt` recolours it exactly as it
recolours the default shirt. No new token, no new config field, no new palette.

⚠⚠ THE ART COMES BACK WITH MORE THAN TWO BLUES and the system has exactly two shirt tokens.
w01-crew traced three (the ribbed collar split into two darks) and w04-polo three. Everything
that is not the main body tone is collapsed into the SHADOW token. That is not a loss: the
collapse merges the rib's spokes into one band, and the gaps between them are the MAIN tone,
which is not in the dark set — so the rib survives as light gaps in a dark arc.

⚠ THE GARMENT IS ALSO CUT BY THE HEAD, for the same reason the body layers are: the body slot
is painted AFTER the head, so anything a garment puts above the shoulder would land on the jaw.
⚠⚠ On today's art this removes 89.5u² — 0.015% of the hoodie, pure anti-aliasing — because the
tracer only ever sees VISIBLE pixels and the hood was generated BEHIND the head, so its blue
path already stopped at the head's edge. The subtraction is insurance against a generation that
draws the hood in front, not something the current art needs. ⚠ The head is identical in all
four bases, so one subtraction serves them all.

⚠ The garment is NOT cut by the neck. It stays SOLID and the per-base neck is painted on top of
it by compose — that is what gives the right collar on all four bases from one asset. See
build-body-layers.py.

⭐⭐ A LOWER NECKLINE HAS TO BRING ITS OWN CHEST. Ryan, 2026-09-22: "The crew and v neck doesn't
show any more skin." The reason is not the art: THE NECK IS ALREADY PAINTED OVER THE SHIRT all
the way to its bottom at y1763, by front-neck-<N>. So every garment already shows the whole
neck, and cutting the neckline lower cannot reveal any more of it — there is nothing below.

The avatar is a bust with no chest. So a garment that opens below the neck carries the skin it
exposes, as a BASE_SKIN path of its own: `traced skin MINUS the base-100 neck`, which is exactly
the part the generation invented. Compose paints it after the garment and before the per-base
neck, and `--skin` recolours it like any other skin.
"""
import re
import sys
from pathlib import Path

from shapely.geometry import Polygon, box
from shapely.ops import unary_union

# ⭐ The body band. The hoodie's hood is the highest thing a garment may reach (y1459) and the
# shirt runs to the bottom of the canvas. Nothing above the band can be a garment.
REGION = box(300, 1400, 1760, 2060)

BASE_SHIRT = (30, 118, 214)
SHIRT_TOK = "rgb(30,118,214)"
SHADE_TOK = "rgb(50,118,183)"
SKIN_TOK = "rgb(254,205,180)"
SEAM_BURY = 6.0
SKIN = (254, 205, 180)

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


def close(a, b, tol: int = 20) -> bool:
    return all(abs(x - y) <= tol for x, y in zip(a, b))


def clean(g, floor: float = 250):
    if g.is_empty:
        return g
    parts = [g] if g.geom_type == "Polygon" else [x for x in g.geoms if x.area > floor]
    return unary_union(parts) if parts else g.__class__()


def main() -> None:
    src, dst = sys.argv[1], sys.argv[2]

    here = Path(__file__).parent
    base = (here / "bases/base-neck-100.svg").read_text()
    head = None
    for p in re.findall(r"<path[^>]*/?>", base):
        if f'fill="rgb({SKIN[0]},{SKIN[1]},{SKIN[2]})"' not in p:
            continue
        d = re.search(r'd="([^"]*)"', p).group(1)
        xs = [float(x) for x in re.findall(r"-?\d+\.?\d*", d)][0::2]
        if max(xs) - min(xs) > 900:
            head = flatten(d)
    if head is None:
        sys.exit("could not find the head in base-neck-100.svg")

    # base-100's neck — what the body already provides, and therefore what a garment must NOT
    # carry, or a narrow-necked base would render a base-100-width neck.
    neck100 = None
    for p in re.findall(r"<path[^>]*/?>", base):
        if f'fill="rgb({SKIN[0]},{SKIN[1]},{SKIN[2]})"' not in p:
            continue
        d = re.search(r'd="([^"]*)"', p).group(1)
        v = [float(x) for x in re.findall(r"-?\d+\.?\d*", d)]
        xs, ys = v[0::2], v[1::2]
        if max(xs) - min(xs) < 900 and min(ys) > 1200:
            neck100 = flatten(d)
    if neck100 is None:
        sys.exit("could not find the neck in base-neck-100.svg")

    main_g, dark, skin = [], [], []
    for p in re.findall(r"<path[^>]*/?>", Path(src).read_text()):
        f = re.search(r'fill="rgb\((\d+),\s*(\d+),\s*(\d+)\)"', p)
        if not f:
            continue
        c = tuple(int(x) for x in f.groups())
        if c[2] - c[0] <= 40:                       # not a blue
            continue
        d = re.search(r'd="([^"]*)"', p).group(1)
        v = [float(x) for x in re.findall(r"-?\d+\.?\d*", d)]
        xs, ys = v[0::2], v[1::2]
        if not REGION.contains(box(min(xs), min(ys), max(xs), max(ys))):
            continue
        g = flatten(d)
        if g is None or g.is_empty:
            continue
        (main_g if close(c, BASE_SHIRT) else dark).append(g)

    # the skin the garment invents below the neckline — everything the trace paints in skin
    # inside the body band, minus what the body already provides
    for p in re.findall(r"<path[^>]*/?>", Path(src).read_text()):
        f = re.search(r'fill="rgb\((\d+),\s*(\d+),\s*(\d+)\)"', p)
        if not f or not close(tuple(int(x) for x in f.groups()), SKIN):
            continue
        d = re.search(r'd="([^"]*)"', p).group(1)
        v = [float(x) for x in re.findall(r"-?\d+\.?\d*", d)]
        xs, ys = v[0::2], v[1::2]
        if max(ys) < 1400 or min(ys) < 1300:        # the head, not a neckline
            continue
        g = flatten(d)
        if g is not None and not g.is_empty:
            skin.append(g)

    if not main_g:
        sys.exit(f"{src}: no garment body found — check the trace")

    # The garment's whole silhouette: the body plus every detail laid on it. Solid, because the
    # per-base neck is what cuts the collar.
    whole = clean(unary_union(main_g + dark).buffer(0).difference(head).buffer(0))
    shade = clean(unary_union(dark).buffer(0).difference(head).buffer(0)) if dark else None
    # ⚠⚠ THE SEAM IS BURIED, NOT BUTTED. Subtracting the neck exactly leaves the chest's top
    # edge coincident with the neck compose paints on top of it — two anti-aliased edges on one
    # line cover ~75% between them, and the garment BLUE leaks through as a dashed hairline
    # across the opening. Visible at 4x on the v-neck. Shrinking the neck first pushes the seam
    # SEAM_BURY units inside the neck's solid interior, where nothing can show through it.
    # Same cure as the beard bands: overlap hidden geometry, never butt edges.
    chest = (clean(unary_union(skin).buffer(0)
                   .difference(neck100.buffer(-SEAM_BURY)).buffer(0), floor=600)
             if skin else None)

    frags = [f'<path transform="translate(0,0)" fill="{SHIRT_TOK}" d="{to_d(whole.simplify(0.7))}"/>']
    # ⚠ the chest goes between the body and the details, so a collar rib still edges the opening
    if chest is not None and not chest.is_empty:
        frags.append(f'<path transform="translate(0,0)" fill="{SKIN_TOK}" '
                     f'd="{to_d(chest.simplify(0.7))}"/>')
    if shade is not None and not shade.is_empty:
        frags.append(f'<path transform="translate(0,0)" fill="{SHADE_TOK}" '
                     f'd="{to_d(shade.simplify(0.7))}"/>')
    Path(dst).write_text(HEAD + "".join(frags) + "</svg>")
    print(f"  {Path(dst).name:<24} body {whole.area:8.0f}u²  "
          f"detail {(shade.area if shade is not None else 0):7.0f}u²  "
          f"chest {(chest.area if chest is not None else 0):7.0f}u²")


if __name__ == "__main__":
    main()
