#!/usr/bin/env python3
"""Extract a reusable hair asset from a traced avatar.

    uv run extract-hair.py traced.svg bases/base-neck-100.svg out.asset.svg   # asset
    uv run extract-hair.py traced.svg bases/base-neck-100.svg preview.svg     # composite

Why there is no anchoring maths
-------------------------------
Hair avatars are generated with a locked base PNG as the Nano Banana reference, so the
output inherits the base's canvas, viewBox and head position. Measured 2026-09-15: nose
within 3px, neck within 2px, head within 9px of 1024. The shared coordinate space IS the
anchor. This only holds for assets generated that way.

Selection is by COLOUR, not index
---------------------------------
Recraft orders paths by size and stacking, and the order changes per image — the
side-part's hair landed at indices 2,7,8,9 with the nose and neck interleaved, while the
afro's mass was index 1 because it sits behind the face. Any index rule breaks on the
next style. Hair is whatever is neither a base colour nor blue.

The face hole
-------------
SOME styles trace as one solid hair mass with the face painted on top — the hair carries
no hole of its own. Painted in front it swallows the face; painted behind, the forehead
goes bare. Those need the face silhouette carried along as an SVG mask.

But MOST styles don't: the tracer gives their hair as exactly the visible hair, and a mask
then hides anything sitting inside the head outline — which silently ate the undercut's
sideburns (6,786px). The test is whether the largest hair path actually covers the nose.
Only a solid-blob trace does. Measured across six styles, the afro was the only one.
"""
import re
import sys

BASE_HEAD_IDX = 5          # in a base written by neck-width.py
BASE_NOSE_IDX = 6
NOSE_POINT = (1024, 1043)  # the nose centre on the locked base, in viewBox units

# every colour the locked base uses; anything else in a trace is hair
BASE_COLOURS = [(254, 205, 180), (245, 178, 150), (255, 255, 255),
                (30, 118, 214), (50, 118, 183)]

# canonical hair tones — every asset uses these two, so one recolour rule fits all
HAIR_BASE = "rgb(140,122,110)"
HAIR_TEXTURE = "rgb(114,97,86)"

SVG_OPEN = ('<svg version="1.1" xmlns="http://www.w3.org/2000/svg" '
            'viewBox="0 0 2048 2048" width="1024" height="1024">')


def paths_of(svg: str) -> list[str]:
    return [m.group(0) for m in re.finditer(r"<path[^>]*/?>", svg)]


def d_of(path: str) -> str:
    return re.search(r'd="([^"]*)"', path).group(1)


def xs_of(path: str) -> list[float]:
    n = [float(x) for x in re.findall(r"-?\d+\.?\d*", d_of(path))]
    return n[0::2]


def ys_of(path: str) -> list[float]:
    n = [float(x) for x in re.findall(r"-?\d+\.?\d*", d_of(path))]
    return n[1::2]


def fill_of(path: str):
    m = re.search(r'fill="rgb\((\d+),\s*(\d+),\s*(\d+)\)"', path)
    return (int(m.group(1)), int(m.group(2)), int(m.group(3))) if m else None


def close(a, b, tol: int = 12) -> bool:
    """Recraft requantises colours on every trace, so match with tolerance.

    The base's ear shade traced as rgb(245,178,150) in one file and rgb(245,176,148) in
    another. Exact matching silently swept the ears into the hair asset.
    """
    return a is not None and b is not None and all(abs(x - y) <= tol for x, y in zip(a, b))


def find_hair(traced: list[str]) -> list[str]:
    out = []
    for p in traced:
        c = fill_of(p)
        if c is None or any(close(c, b, tol=24) for b in BASE_COLOURS):
            continue
        r, _g, bl = c
        if bl > r + 20:          # blue-ish => shirt fold shading, not hair
            continue
        out.append(p)
    return out


def face_mask(traced: list[str], base_paths: list[str]) -> str:
    """Return an SVG mask hiding the hair over the face, or '' if the hair doesn't overlap."""
    skin = fill_of(base_paths[BASE_HEAD_IDX])
    shade = fill_of(base_paths[BASE_NOSE_IDX])
    face = [p for p in traced if close(fill_of(p), skin, 24) or close(fill_of(p), shade, 24)]
    if not face:
        return ""
    # Only a solid-blob trace needs the mask. If the hair is already the VISIBLE hair,
    # masking it hides legitimate hair inside the head outline — sideburns especially.
    hair = find_hair(traced)
    big = max(hair, key=lambda p: (max(xs_of(p)) - min(xs_of(p))) * (max(ys_of(p)) - min(ys_of(p))))
    nx, ny = NOSE_POINT
    if not (min(xs_of(big)) < nx < max(xs_of(big)) and min(ys_of(big)) < ny < max(ys_of(big))):
        return ""                                  # hair does not cover the face
    shapes = "".join(f'<path d="{d_of(p)}" fill="black"/>' for p in face)
    return ('<defs><mask id="facehole" maskUnits="userSpaceOnUse" x="0" y="0" '
            'width="2048" height="2048">'
            '<rect x="0" y="0" width="2048" height="2048" fill="white"/>'
            f'{shapes}</mask></defs>')


def normalise(hair: list[str]) -> str:
    base_tone = fill_of(hair[0])
    out = []
    for p in hair:
        token = HAIR_BASE if close(fill_of(p), base_tone, tol=8) else HAIR_TEXTURE
        out.append(re.sub(r'fill="rgb\([^)]*\)"', f'fill="{token}"', p))
    return "".join(out)


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    traced_path, base_path, dst = args

    base_svg = open(base_path).read()
    base_paths = paths_of(base_svg)
    traced = paths_of(open(traced_path).read())

    hair = find_hair(traced)
    if not hair:
        sys.exit("no hair paths found — has the trace layout changed?")

    # Conformance: the generation must have kept the base's head size. Nano Banana
    # shrinks the skull to make room for big hair — the afro came back 31% narrower
    # (712 vs 1032) and the mask faithfully carried that smaller face across, producing
    # a visibly shrunken head. Catch it here instead of by eye three steps later.
    skin = fill_of(base_paths[BASE_HEAD_IDX])
    faces = [p for p in traced if close(fill_of(p), skin, 24)]
    if faces:
        widest = max(faces, key=lambda p: max(xs_of(p)) - min(xs_of(p)))
        got = max(xs_of(widest)) - min(xs_of(widest))
        want = max(xs_of(base_paths[BASE_HEAD_IDX])) - min(xs_of(base_paths[BASE_HEAD_IDX]))
        if abs(got - want) / want > 0.05:
            sys.exit(f"head width {got:.0f} differs from the base's {want:.0f} by "
                     f"{abs(got-want)/want*100:.0f}% — regenerate holding the head size")

    mask = face_mask(traced, base_paths)
    body = normalise(hair)
    payload = mask + (f'<g mask="url(#facehole)">{body}</g>' if mask else body)

    if dst.endswith(".asset.svg"):
        open(dst, "w").write(SVG_OPEN + payload + "</svg>")
    else:
        open(dst, "w").write(base_svg.replace("</svg>", payload + "</svg>"))

    n_tex = body.count(HAIR_TEXTURE)
    print(f"{dst}: {len(hair)} paths ({len(hair)-n_tex} base + {n_tex} texture)"
          f"{' | face mask' if mask else ''}")


if __name__ == "__main__":
    main()
