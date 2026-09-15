#!/usr/bin/env python3
"""Rebuild the traced avatar base with a given neck width.

    uv run neck-width.py base-traced.svg 1.0  base-canonical.svg
    uv run neck-width.py base-traced.svg 1.4  /tmp/thick.svg

Input must be the raw Recraft `vectorize` output (9 paths). Output is a
restructured SVG that is safe to re-edit.

What this does beyond scaling
-----------------------------
Recraft's tracer draws every shape as exactly its *visible* region and butts the
edges together. That looks right at one configuration and falls apart the moment
anything moves — widen the neck and white wedges open up where the jaw curves
away from it (verified 2026-09-15). Two structural fixes:

1. EXPLICIT PAINT ORDER — background, shirt, neck, neck shadow, head, nose, ears.
   The neck sits above the shirt and below the head. Getting this wrong either
   buries the neck under the blue or draws it over the chin.

2. HIDDEN OVERLAP — the neck's top edge is pushed OVERLAP_Y units up into the
   skull. None of it is visible; the head paints over it. The head then clips the
   neck along its own jaw curve, so the join is exact at any width and the neck no
   longer has to agree with the head geometrically.

Remaining coupling: the shirt carries a neck-shaped notch, so its boundary must be
remapped along with the neck. That is the `gated` pass. Head, nose, ears and the
neck shadow are otherwise free to move independently.
"""
import re
import sys

CX = 1024.0                          # canvas centreline, viewBox units
OVERLAP_Y = 170.0                    # how far the neck tucks up behind the head
TOP_EDGE = 1535.0                    # points above this y are the neck's top edge
NECK_NOTCH = (1500, 1790, 820, 1230)  # y0, y1, x0, x1 — boundary shared with the shirt

# path indices as Recraft's tracer emits them
BG, HEAD, NOSE, SHIRT, NECK, SHADOW, EAR_R, EAR_L, SHOULDER = range(9)
PAINT_ORDER = [BG, SHIRT, SHOULDER, NECK, SHADOW, HEAD, NOSE, EAR_R, EAR_L]


def xform(path: str, scale: float, gated: bool, raise_top: float = 0.0) -> str:
    """Scale x about CX; optionally lift the top edge. Gated limits it to the notch."""
    d = re.search(r'd="([^"]*)"', path).group(1)
    y0, y1, x0, x1 = NECK_NOTCH
    out: list[str] = []
    buf: list[float] = []
    for tok in re.findall(r"[A-Za-z]|-?\d+\.?\d*", d):
        if re.match(r"[A-Za-z]", tok):
            out.append(tok)
            continue
        buf.append(float(tok))
        if len(buf) == 2:
            x, y = buf
            touch = (not gated) or (y0 < y < y1 and x0 < x < x1)
            nx = CX + (x - CX) * scale if touch else x
            ny = y - raise_top if (raise_top and y < TOP_EDGE) else y
            out += [f"{nx:.3f}", f"{ny:.3f}"]
            buf = []
    return path.replace(d, " ".join(out))


def main() -> None:
    src_path, scale, dst_path = sys.argv[1], float(sys.argv[2]), sys.argv[3]
    svg = open(src_path).read()
    paths = [m.group(0) for m in re.finditer(r"<path[^>]*/?>", svg)]
    if len(paths) != 9:
        sys.exit(f"expected 9 traced paths, found {len(paths)} — the indices above are wrong")

    rebuilt = dict(enumerate(paths))
    rebuilt[NECK] = xform(paths[NECK], scale, False, raise_top=OVERLAP_Y)
    rebuilt[SHADOW] = xform(paths[SHADOW], scale, False, raise_top=OVERLAP_Y)
    rebuilt[SHIRT] = xform(paths[SHIRT], scale, True)

    prefix = svg[: svg.index(paths[0])]          # <svg> tag and any metadata
    open(dst_path, "w").write(prefix + "".join(rebuilt[i] for i in PAINT_ORDER) + "</svg>")
    print(f"{dst_path}: neck width x{scale}, paint order normalised, {OVERLAP_Y:.0f}u head overlap")


if __name__ == "__main__":
    main()
