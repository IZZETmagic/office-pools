#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Point an eye asset's irises in a direction.

    uv run gaze.py eyes/assets/eye-01-base.asset.svg  0.8 -0.4  out.asset.svg

dx and dy are -1..1 of the available travel: -1 is hard left / up, +1 is hard right / down,
0 is centred. Travel is computed per eye from how much room the iris has inside its white, so
the iris can never escape the eyeball.

Why this is not a generation
---------------------------
Gaze direction is the one axis Nano Banana reliably ignores — asking for irises "looking up",
"slid to one side" or "toward the outer edge" returned centred irises every time across three
separate attempts. But in the extracted asset the iris is its own path, so pointing it is
arithmetic, not art direction: exact, instant, free, and reversible.

Why coordinates and not a transform
-----------------------------------
`react-native-svg` silently ignores an SVG transform attribute (see the guard test). So the
offset is baked into the path data, exactly as `neck-width.py` does for the neck.

Only non-white paths move. The white of the eye stays put — it is the eyeball, not the iris.
The highlight travels with the iris because the tracer draws it as a notch in the iris path.
"""
import re
import sys

WHITE = "rgb(255,255,255)"


def paths_of(svg: str) -> list[str]:
    return [m.group(0) for m in re.finditer(r"<path[^>]*/?>", svg)]


def d_of(p: str) -> str:
    return re.search(r'd="([^"]*)"', p).group(1)


def coords(p: str):
    n = [float(x) for x in re.findall(r"-?\d+\.?\d*", d_of(p))]
    return n[0::2], n[1::2]


def bbox(p: str):
    xs, ys = coords(p)
    return min(xs), max(xs), min(ys), max(ys)


def is_white(p: str) -> bool:
    return WHITE in p


def shift(p: str, dx: float, dy: float) -> str:
    """Bake a translation into the path data. No transform attribute — RN would drop it."""
    d = d_of(p)
    out, buf = [], []
    for tok in re.findall(r"[A-Za-z]|-?\d+\.?\d*", d):
        if re.match(r"[A-Za-z]", tok):
            out.append(tok)
            continue
        buf.append(float(tok))
        if len(buf) == 2:
            out += [f"{buf[0] + dx:.3f}", f"{buf[1] + dy:.3f}"]
            buf = []
    return p.replace(d, " ".join(out))


def main() -> None:
    src, dx_f, dy_f, dst = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), sys.argv[4]
    svg = open(src).read()
    ps = paths_of(svg)

    whites = [p for p in ps if is_white(p)]
    if not whites:
        sys.exit(f"{src}: no eye whites — a closed eye has no iris to point")

    mid = 2048 / 2
    out = svg
    moved = 0
    for side, pick in (("L", lambda c: c < mid), ("R", lambda c: c >= mid)):
        w = [p for p in whites if pick(sum(bbox(p)[:2]) / 2)]
        irises = [p for p in ps if not is_white(p) and pick(sum(bbox(p)[:2]) / 2)]
        if not w or not irises:
            continue                      # a closed lid on this side: nothing to point

        wx0, wx1, wy0, wy1 = bbox(max(w, key=lambda p: len(p)))
        ix0 = min(bbox(p)[0] for p in irises)
        ix1 = max(bbox(p)[1] for p in irises)
        iy0 = min(bbox(p)[2] for p in irises)
        iy1 = max(bbox(p)[3] for p in irises)

        # room to move before the iris leaves the white, in each direction
        room_l, room_r = ix0 - wx0, wx1 - ix1
        room_u, room_d = iy0 - wy0, wy1 - iy1
        dx = (dx_f * room_r) if dx_f >= 0 else (dx_f * room_l)
        dy = (dy_f * room_d) if dy_f >= 0 else (dy_f * room_u)

        for p in irises:
            out = out.replace(p, shift(p, dx, dy), 1)
            moved += 1

    open(dst, "w").write(out)
    print(f"{dst}: pointed {moved} iris paths  dx={dx_f:+.2f} dy={dy_f:+.2f}")


if __name__ == "__main__":
    main()
