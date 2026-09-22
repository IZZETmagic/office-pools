#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["shapely"]
# ///
"""Extract an earring asset from a traced avatar.

    uv run extract-earrings.py /tmp/ea-e02-hoop/vectorize-00.svg earrings/assets/e02-hoop.asset.svg

⭐ SELECTION IS BY REGION AND THEN BY COLOUR, in that order. The two ear zones are the only
place jewellery can be, and inside them the metal is simply whatever is not a base colour. The
region comes first because it is what keeps the SHIRT out: the shirt shadow requantises all over
the place (it has come back rgb(56,116,178), rgb(64,119,194) and rgb(92,125,155) on this family's
traces alone) and no colour rule survives that. Position does.

⚠ CONTAINED in a zone, not overlapping it. The head spans x506..1534 and would otherwise be
pulled in by any zone wide enough to hold a large hoop.

⭐⭐ A HOOP'S HOLE IS THE SAME JIGSAW AS A LENS OPENING. The vectorizer paints the ring solid and
butts the hole back over it — here in WHITE, because a hoop hangs off the head into the
background, where a lens opening sat on skin. Take the ring whole and every hoop is a solid
blob.

⚠⚠ AND THE EAR IS NOT A HOLE. The ear bump is a base colour, sits inside the zone, and overlaps
the stud that is painted on top of it — so a naive "subtract the base-coloured paths" erases the
jewellery completely. A hole is a base-coloured shape CONTAINED IN THE METAL'S OWN GEOMETRY; the
ear is far bigger than the stud and fails that, as it should. Same shape of guard as the nose and
ears in extract-hair.py: nothing in the tone tells them apart, their position does.
"""
import re
import sys
from pathlib import Path

from shapely.geometry import Polygon, box
from shapely.ops import unary_union

# ⭐ The two ear zones. Wide and deep enough for the largest hoop (x385..1663, down to y1492),
# and nowhere near the shirt at y1518 or the neck at x849..1199.
ZONES = [box(300, 760, 660, 1560), box(1390, 760, 1750, 1560)]

BASE_COLOURS = [(254, 205, 180), (245, 178, 150), (30, 118, 214), (50, 118, 183), (255, 255, 255)]
METAL = "rgb(212,160,54)"

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


def close(a, b, tol: int = 16) -> bool:
    """Recraft requantises on every trace — the gold came back rgb(224,169,63) on the stud and
    rgb(215,157,53) on the big hoop, from one prompt and one reference."""
    return all(abs(x - y) <= tol for x, y in zip(a, b))


def clean(g, floor: float = 300):
    if g.is_empty:
        return g
    parts = [g] if g.geom_type == "Polygon" else [x for x in g.geoms if x.area > floor]
    return unary_union(parts) if parts else g.__class__()


def main() -> None:
    src, dst = sys.argv[1], sys.argv[2]
    metal, holes = [], []
    for p in re.findall(r"<path[^>]*/?>", Path(src).read_text()):
        f = re.search(r'fill="rgb\((\d+),\s*(\d+),\s*(\d+)\)"', p)
        if not f:
            continue
        c = tuple(int(x) for x in f.groups())
        d = re.search(r'd="([^"]*)"', p).group(1)
        v = [float(x) for x in re.findall(r"-?\d+\.?\d*", d)]
        xs, ys = v[0::2], v[1::2]
        bb = box(min(xs), min(ys), max(xs), max(ys))
        if not any(z.contains(bb) for z in ZONES):
            continue
        g = flatten(d)
        if g is None or g.is_empty:
            continue
        (holes if any(close(c, b) for b in BASE_COLOURS) else metal).append(g)

    if not metal:
        sys.exit(f"{src}: no jewellery found in either ear zone — check the trace")
    m = unary_union(metal).buffer(0)
    # ⚠ CONTAINED IN THE METAL, not merely touching it. The ear overlaps the stud painted on it
    # and would otherwise erase it.
    cut = [h for h in holes if m.contains(h.buffer(-1))]
    if cut:
        m = m.difference(unary_union(cut).buffer(0)).buffer(0)
    m = clean(m)
    if m.is_empty:
        sys.exit(f"{src}: the jewellery vanished once the holes were cut")
    m = m.simplify(0.5)

    frag = f'<path transform="translate(0,0)" fill="{METAL}" d="{to_d(m)}"/>'
    Path(dst).write_text(HEAD + frag + "</svg>")
    subpaths = to_d(m).count("M ")
    print(f"  {Path(dst).name:<24} metal {m.area:7.0f}u²  {len(cut)} hole(s) cut  "
          f"{subpaths} subpath(s)")


if __name__ == "__main__":
    main()
