#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow", "numpy"]
# ///
"""Extract a face feature (eyes, brows, mouth) from a traced avatar, by REGION.

    uv run extract-feature.py traced.svg bases/base-neck-100.svg eye out.asset.svg

Why region and not colour
-------------------------
`extract-hair.py` selects by colour, which works because hair is the only thing on the canvas
in a hair tone. Face features cannot be selected that way:

- the eye whites are the same colour as the background,
- the iris brown is indistinguishable from hair brown,
- a mouth line is often the same tone as a brow.

But every face feature lives in a known box — see `landmarks.json`, measured across the
generated avatar set. So selection is: paths whose bounding box sits inside the feature's
zone, with a margin. The zone is the contract; colour is irrelevant.

Registration is free, exactly as it is for hair: the feature was generated onto the locked
base, so it already lives in the base's coordinate space. Nothing is moved.
"""
import json
import re
import sys

MARGIN = 40          # viewBox units of slack around the landmark box
SVG_OPEN = ('<svg version="1.1" xmlns="http://www.w3.org/2000/svg" '
            'viewBox="0 0 2048 2048" width="1024" height="1024">')

# Colours the locked base already draws. A feature path in one of these is the base showing
# through, not the feature.
BASE_COLOURS = [(254, 205, 180), (245, 178, 150), (30, 118, 214), (50, 118, 183)]

# Canonical feature tones. Two per feature: the white of an eye, and the "ink" — iris, brow or
# mouth line. compose.py swaps the ink from one colour input.
FEATURE_WHITE = "rgb(255,255,255)"
FEATURE_INK = "rgb(117,62,21)"        # the darker core of an iris / the body of a brow or mouth
FEATURE_INK_RIM = "rgb(150,84,34)"    # the lighter rim around an iris
FEATURE_LINE = "rgb(90,60,45)"        # a LID line, brow or mouth — not an iris, never recoloured
                                      # by --eye-colour


def paths_of(svg: str) -> list[str]:
    return [m.group(0) for m in re.finditer(r"<path[^>]*/?>", svg)]


def d_of(path: str) -> str:
    return re.search(r'd="([^"]*)"', path).group(1)


def nums(path: str) -> list[float]:
    return [float(x) for x in re.findall(r"-?\d+\.?\d*", d_of(path))]


def box(path: str):
    n = nums(path)
    xs, ys = n[0::2], n[1::2]
    return min(xs), max(xs), min(ys), max(ys)


def fill_of(path: str):
    m = re.search(r'fill="rgb\((\d+),\s*(\d+),\s*(\d+)\)"', path)
    return (int(m.group(1)), int(m.group(2)), int(m.group(3))) if m else None


def lum(c) -> float:
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2] if c else 0.0


def close(a, b, tol: int = 24) -> bool:
    return a is not None and b is not None and all(abs(x - y) <= tol for x, y in zip(a, b))


def main() -> None:
    traced_path, base_path, zone_name, dst = sys.argv[1:5]
    here = __file__.rsplit("/", 1)[0]
    zone = json.load(open(f"{here}/landmarks.json"))[zone_name]["placement"]

    # landmarks.json is in 1024-space; traces are in viewBox units (2x)
    x0, x1 = zone["x0"] * 2 - MARGIN, zone["x1"] * 2 + MARGIN
    y0, y1 = zone["y0"] * 2 - MARGIN, zone["y1"] * 2 + MARGIN

    picked = []
    for p in paths_of(open(traced_path).read()):
        bx0, bx1, by0, by1 = box(p)
        # CENTRE inside the zone, not full containment. The landmark boxes were measured on
        # the generated set; a new feature drawn slightly larger spills past them and a
        # containment test then silently drops it — that lost both eye whites on the first
        # run while keeping the irises.
        cx, cy = (bx0 + bx1) / 2, (by0 + by1) / 2
        if not (x0 <= cx <= x1 and y0 <= cy <= y1):
            continue
        if (bx1 - bx0) * (by1 - by0) / (2048 * 2048) > 0.80:
            continue                       # the canvas background, whose centre is anywhere
        if any(close(fill_of(p), c) for c in BASE_COLOURS):
            continue                       # the base showing through, not the feature
        picked.append(p)

    if not picked:
        sys.exit(f"no {zone_name} paths found inside x {x0:.0f}-{x1:.0f} y {y0:.0f}-{y1:.0f}")

    # Normalise to canonical tokens so recolouring is one swap per part. The tracer invents
    # extra tones from antialiasing — this eye traced with TWO browns, a lighter rim around a
    # darker centre, which would otherwise need two recolour rules and drift between assets.
    # Normalise to canonical tokens so recolouring is one input per feature — but PRESERVE
    # a genuine second tone. This eye is drawn with a lighter rim around a darker core, and
    # collapsing both to one ink flattened a real design feature. Tones are told apart by
    # luminance: the darker is the core, the lighter is the rim.
    inks = [fill_of(p) for p in picked if not close(fill_of(p), (255, 255, 255), 30)]
    darkest = min((lum(c) for c in inks), default=0)

    # No white in the zone means there is no eyeball showing — the marks are closed LIDS, not
    # irises. Closed lids must not take the iris colour: recolouring blue eyes turned the
    # closed eyelids bright blue, which reads as paint rather than a shut eye.
    has_white = any(close(fill_of(p), (255, 255, 255), 30) for p in picked)
    out = []
    for p in picked:
        c = fill_of(p)
        if close(c, (255, 255, 255), 30):
            token = FEATURE_WHITE
        elif not has_white:
            token = FEATURE_LINE
        elif lum(c) - darkest > 12:
            token = FEATURE_INK_RIM
        else:
            token = FEATURE_INK
        out.append(re.sub(r'fill="rgb\([^)]*\)"', f'fill="{token}"', p))

    open(dst, "w").write(SVG_OPEN + "".join(out) + "</svg>")
    n_w = sum(1 for p in out if FEATURE_WHITE in p)
    n_r = sum(1 for p in out if FEATURE_INK_RIM in p)
    n_l = sum(1 for p in out if FEATURE_LINE in p)
    kind = "lids" if n_l else f"{n_w} white + {len(out)-n_w-n_r-n_l} core + {n_r} rim"
    print(f"{dst}: {len(out)} paths in the {zone_name} zone ({kind})")


if __name__ == "__main__":
    main()
