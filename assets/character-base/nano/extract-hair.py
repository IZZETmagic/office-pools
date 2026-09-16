#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow", "numpy"]
# ///
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
import json
import re
import subprocess
import sys
import tempfile

BASE_HEAD_IDX = 5          # in a base written by neck-width.py
BASE_NOSE_IDX = 6
BASE_EAR_IDX = (7, 8)      # ear paths in a base written by neck-width.py
NOSE_POINT = (1024, 1043)  # the nose centre on the locked base, in viewBox units

# Face landmark zones, 1024-space. A hair asset must leave the eyes clear; the brow zone is
# advisory, because a low fringe legitimately encroaches and that is a design call, not a bug.
LANDMARKS = json.load(open(__file__.rsplit("/", 1)[0] + "/landmarks.json"))
JAW_ROW = 620            # 1024-space row that crosses the jaw, clear of hair on every style
JAW_WIDTH_BASE = 500     # the locked base measured at that row
EYE_CLEAR_MIN = 0.97     # fraction of the eye zone that must not be hair
BROW_BAND_MIN = 20       # px between the hairline and the eyes for a slim brow

# every colour the locked base uses; anything else in a trace is hair
BASE_COLOURS = [(254, 205, 180), (245, 178, 150), (255, 255, 255),
                (30, 118, 214), (50, 118, 183)]

# Canonical hair tones. Three, not two: the base mass plus texture that may be DARKER or
# LIGHTER than it. short-sides traced as a dark base with lighter swooshes, and collapsing
# that to one "texture" token painted its texture darker than its base, erasing the detail.
HAIR_BASE = "rgb(140,122,110)"
HAIR_SHADE = "rgb(114,97,86)"     # texture darker than the base
HAIR_LIGHT = "rgb(168,150,138)"   # texture lighter than the base

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

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
        # A path covering the whole canvas is the background, never hair. The locs image is
        # so hair-dominated that Recraft laid down a BROWN canvas first — rgb(126,108,95),
        # not white — and painted everything on top. Colour alone cannot tell that apart
        # from a big hair mass.
        xs, ys = xs_of(p), ys_of(p)
        span = (max(xs) - min(xs)) * (max(ys) - min(ys)) / (2048 * 2048)
        if span > 0.80:
            continue
        out.append(p)
    return out


def inverted_trace(traced: list[str]):
    """Detect a trace where the hair is NEGATIVE SPACE, and return (hair_path, white_path).

    On a very hair-dominant image Recraft can invert the layering: it floods the canvas with
    the hair colour, then paints a canvas-sized WHITE path over it with the hair silhouette
    cut out as holes. The locs traced this way. Colour-based selection cannot see it — the
    "hair" is a full-canvas rectangle and the shape lives in a path being discarded as
    background.
    """
    if len(traced) < 2:
        return None
    first, second = traced[0], traced[1]
    def full(p):
        xs, ys = xs_of(p), ys_of(p)
        return (max(xs) - min(xs)) > 2000 and (max(ys) - min(ys)) > 2000
    c0, c1 = fill_of(first), fill_of(second)
    # The flood layer must be a HAIR colour. The box-braids trace flooded with SKIN
    # (254,204,180) and then white, which satisfied "non-white then white" and made the
    # extractor treat the skin flood as the hair mass — composing to a bald head.
    if not (full(first) and full(second) and c0 and c1):
        return None
    if not close(c1, (255, 255, 255), 24):
        return None
    if any(close(c0, b, tol=24) for b in BASE_COLOURS):
        return None
    r, _g, bl = c0
    if bl > r + 20:                      # blue-ish flood is the shirt, not hair
        return None
    return first, second


def ear_is_drawn(traced_path: str, ex0, ex1, ey0, ey1, floor: int = 400) -> bool:
    """Did the generation actually draw an ear here? Measured off the rendered trace."""
    from PIL import Image
    import numpy as np
    with tempfile.TemporaryDirectory() as t:
        subprocess.run([CHROME, "--headless", "--disable-gpu", "--hide-scrollbars",
                        f"--screenshot={t}/t.png", "--window-size=1024,1024",
                        f"file://{traced_path}"], capture_output=True)
        im = np.asarray(Image.open(f"{t}/t.png").convert("RGB")).astype(int)
    box = im[int(ey0 // 2):int(ey1 // 2), int(ex0 // 2):int(ex1 // 2)]
    return int((np.abs(box - np.array(BASE_COLOURS[1])).sum(axis=2) < 60).sum()) > floor


def ear_holes(base_paths: list[str], traced_path: str) -> str:
    """Black shapes for any ear the generation actually drew."""
    out = ""
    for idx in BASE_EAR_IDX:
        ex0, ex1 = min(xs_of(base_paths[idx])), max(xs_of(base_paths[idx]))
        ey0, ey1 = min(ys_of(base_paths[idx])), max(ys_of(base_paths[idx]))
        if traced_path and ear_is_drawn(traced_path, ex0, ex1, ey0, ey1):
            out += f'<path d="{d_of(base_paths[idx])}" fill="black"/>'
    return out


def face_mask(traced: list[str], base_paths: list[str], traced_path: str = "") -> str:
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
    # Intersect the hole with the head's actual SHAPE. The traced "face" is not reliably
    # just the face: on the long-hair trace it came back FUSED with the shoulder region,
    # spanning the full canvas below y423. Unbounded, it masked 26,856px of legitimate hair
    # — the gaps either side of the neck. Bounding it to the head's bounding BOX still lost
    # 5,733px, because the head narrows toward the chin and hair fills the space beside the
    # jaw. Only the head's outline is precise enough.
    #
    # Painting white over everything OUTSIDE the head path (full-canvas rect + head path,
    # evenodd) leaves black only where face AND head overlap.
    head_d = d_of(base_paths[BASE_HEAD_IDX])
    outside = f'<path d="M0 0 H2048 V2048 H0 Z {head_d}" fill="white" fill-rule="evenodd"/>'

    # The ears stick out PAST the head outline, so the white-outside-the-head pass above
    # re-permits hair over them — five assets lost their ears that way while their source
    # PNGs plainly drew them. Re-protect the ears last, but only if the generation actually
    # drew them: the afro and locs legitimately cover the ears, and their traces have no ear
    # shapes at all.
    ears = ""
    for idx in BASE_EAR_IDX:
        ex0, ex1 = min(xs_of(base_paths[idx])), max(xs_of(base_paths[idx]))
        ey0, ey1 = min(ys_of(base_paths[idx])), max(ys_of(base_paths[idx]))
        # Test the RENDERED trace, not path bounding boxes. A half-covered ear traces as a
        # crescent that merges into the face path and is far wider than an ear, so the
        # shape-size test missed it — the topknot lost ears its PNG plainly drew.
        drawn = ear_is_drawn(traced_path, ex0, ex1, ey0, ey1) if traced_path else any(
            min(xs_of(p)) < ex1 and max(xs_of(p)) > ex0
            and min(ys_of(p)) < ey1 and max(ys_of(p)) > ey0
            and (max(xs_of(p)) - min(xs_of(p))) < 400
            for p in face)
        if drawn:
            ears += f'<path d="{d_of(base_paths[idx])}" fill="black"/>'

    return ('<defs><mask id="facehole" maskUnits="userSpaceOnUse" x="0" y="0" '
            'width="2048" height="2048">'
            '<rect x="0" y="0" width="2048" height="2048" fill="white"/>'
            f'{shapes}{outside}{ears}</mask></defs>')


def head_jaw_width(traced_path: str) -> int:
    """Rasterise a traced avatar and measure the skin run across the jaw row."""
    from PIL import Image
    import numpy as np
    with tempfile.TemporaryDirectory() as t:
        subprocess.run([CHROME, "--headless", "--disable-gpu", "--hide-scrollbars",
                        f"--screenshot={t}/t.png", "--window-size=1024,1024",
                        f"file://{traced_path}"], capture_output=True)
        im = np.asarray(Image.open(f"{t}/t.png").convert("RGB")).astype(int)
    return int((np.abs(im - np.array(BASE_COLOURS[0])).sum(axis=2) < 40).sum(axis=1)[JAW_ROW])


def check_landmarks(hair: list[str], mask: str) -> dict:
    """Render the hair alone and measure how much of each landmark zone it covers.

    Rasterising is the only honest way to do this — a path's bounding box says nothing about
    whether its actual outline crosses a zone. A fringe's box may span the whole forehead
    while the hair itself clears the brows entirely.
    """
    # Measure what the asset ACTUALLY paints, mask included — the afro's raw blob covers
    # the whole face and is only made correct by its mask.
    body = "".join(hair)
    svg = SVG_OPEN + mask + (f'<g mask="url(#facehole)">{body}</g>' if mask else body) + "</svg>"
    with tempfile.TemporaryDirectory() as tmp:
        open(f"{tmp}/h.svg", "w").write(svg)
        subprocess.run([CHROME, "--headless", "--disable-gpu", "--hide-scrollbars",
                        f"--screenshot={tmp}/h.png", "--window-size=1024,1024",
                        f"file://{tmp}/h.svg"], capture_output=True)
        from PIL import Image
        import numpy as np
        im = np.asarray(Image.open(f"{tmp}/h.png").convert("RGB")).astype(int)
        covered = im.sum(axis=2) < 740          # anything drawn; the rest is white canvas
        areas = {c: int((np.abs(im - np.array(c)).sum(axis=2) < 30).sum())
                 for c in {fill_of(p) for p in hair} if c}
    eye = LANDMARKS["eye"]["placement"]
    brow = LANDMARKS["brow"]["placement"]

    clear = 1 - covered[eye["y0"]:eye["y1"], eye["x0"]:eye["x1"]].mean()
    if clear < EYE_CLEAR_MIN:
        msg = (f"hair covers {(1-clear)*100:.0f}% of the eye zone — only {clear*100:.0f}% "
               f"clear, needs {EYE_CLEAR_MIN*100:.0f}%")
        # --allow-tight is a DELIBERATE override, not a way round the check. f07-braids
        # measures 96%: its hair edge just touches the top of the eye box, the same fact as
        # its 1px brow band. Ryan chose that version over a compliant one that lost the
        # silhouette. The check still reports; the decision is recorded in LOCKED.md.
        if "--allow-tight" not in sys.argv:
            sys.exit(msg)
        print(f"  ⚠ OVERRIDDEN: {msg}")

    # How far down does hair reach across the brow span? The gap between that and the top of
    # the eyes is the band a brow has to live in. A percentage here is useless — what a
    # designer needs is "you have N pixels".
    strip = covered[:, brow["x0"]:brow["x1"]]
    dense = [y for y in range(strip.shape[0]) if strip[y].mean() > 0.35]
    low = max(dense) if dense else 0
    band = eye["y0"] - low
    flag = "⚠ " if band < BROW_BAND_MIN else ""
    print(f"  eye zone {clear*100:.0f}% clear | {flag}brow band {band}px "
          f"(hair reaches y{low}, eyes start y{eye['y0']})")
    return areas


def lum(c) -> float:
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def normalise(hair: list[str], areas: dict) -> str:
    """Map each traced tone to a canonical token.

    The base mass is identified by AREA, not by path order and not by luminance. Path order
    is arbitrary — Recraft sorts by size and stacking, so the first hair path is often a
    texture swoosh. Luminance fails too: short-sides traced as a DARK base with LIGHTER
    texture, so "lightest is the base" inverts it. Only area is reliable.
    """
    base_tone = max(areas, key=lambda c: areas[c])
    out = []
    for p in hair:
        c = fill_of(p)
        if close(c, base_tone, tol=8):
            token = HAIR_BASE
        else:
            token = HAIR_SHADE if lum(c) < lum(base_tone) else HAIR_LIGHT
        out.append(re.sub(r'fill="rgb\([^)]*\)"', f'fill="{token}"', p))
    return "".join(out)


def merge_texture(hair: list[str], areas: dict, texture_trace: str) -> str:
    """Replace the traced texture with a second, dedicated trace of the same tone.

    Recraft simplifies thin shapes sitting inside a much larger one: short-sides kept only
    52% of its texture area, and the buzz lost the tips of its swooshes the same way.
    Tracing the texture ALONE recovers 95%.

    Both passes come from the same PNG at the same canvas size, so the paths register with no
    transform. Nothing is drawn by hand — it is the same source art traced twice, once per
    tone.
    """
    base_tone = max(areas, key=lambda c: areas[c])
    kept = [p for p in hair if close(fill_of(p), base_tone, tol=8)]

    others = [c for c in areas if not close(c, base_tone, tol=8)]
    token = HAIR_SHADE if (others and lum(others[0]) < lum(base_tone)) else HAIR_LIGHT

    tex = [p for p in paths_of(open(texture_trace).read())
           if close(fill_of(p), (61, 51, 48), tol=25)]
    if not tex:
        print("  ⚠ texture trace had no usable shapes — keeping the single-pass texture")
        return normalise(hair, areas)

    out = "".join(re.sub(r'fill="rgb\([^)]*\)"', f'fill="{HAIR_BASE}"', p) for p in kept)
    out += "".join(re.sub(r'fill="rgb\([^)]*\)"', f'fill="{token}"', p) for p in tex)
    print(f"  two-pass: {len(kept)} base + {len(tex)} texture (was {len(hair)-len(kept)})")
    return out


def main() -> None:
    flags = {a for a in sys.argv[1:] if a.startswith("--")}
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    texture_trace = None
    if "--texture" in sys.argv:
        texture_trace = sys.argv[sys.argv.index("--texture") + 1]
        args = [a for a in args if a != texture_trace]
    traced_path, base_path, dst = args

    base_svg = open(base_path).read()
    base_paths = paths_of(base_svg)
    traced = paths_of(open(traced_path).read())

    inv = inverted_trace(traced)
    if inv:
        base_shape, white = inv
        texture = [p for p in find_hair(traced) if p is not base_shape]
        # Two things must be punched out of the flood-filled hair: the background (the white
        # path, whose holes ARE the hair silhouette) and the face — the white path's holes
        # include the face region, because the face is painted after it in the trace.
        # Everything the base itself draws — face, nose, neck, shadow AND the shirt — is
        # painted after the white path, so all of it falls inside the silhouette holes and
        # must be punched out too. Anything base-coloured except white.
        wanted = [c for c in BASE_COLOURS if not close(c, (255, 255, 255), 24)]
        faces = [p for p in traced if any(close(fill_of(p), c, 24) for c in wanted)]
        holes = f'<path d="{d_of(white)}" fill="black"/>'
        holes += "".join(f'<path d="{d_of(p)}" fill="black"/>' for p in faces)
        mask = ('<defs><mask id="facehole" maskUnits="userSpaceOnUse" x="0" y="0" '
                'width="2048" height="2048">'
                '<rect x="0" y="0" width="2048" height="2048" fill="white"/>'
                f'{holes}</mask></defs>')
        body = re.sub(r'fill="rgb\([^)]*\)"', f'fill="{HAIR_BASE}"', base_shape)
        body += "".join(re.sub(r'fill="rgb\([^)]*\)"', f'fill="{HAIR_SHADE}"', p) for p in texture)
        payload = mask + f'<g mask="url(#facehole)">{body}</g>'
        out = SVG_OPEN + payload + "</svg>" if dst.endswith(".asset.svg") \
            else base_svg.replace("</svg>", payload + "</svg>")
        open(dst, "w").write(out)
        print(f"{dst}: inverted trace — 1 base + {len(texture)} texture, silhouette from the white path")
        return

    hair = find_hair(traced)
    if not hair:
        sys.exit("no hair paths found — has the trace layout changed?")

    # Conformance: the generation must have kept the base's head size. Nano Banana shrinks
    # the skull to make room for big hair — the first afro came back 31% narrower, and both
    # face-framing styles (long hair, locs) came back 26-32% narrower.
    #
    # Measured by rasterising and taking the skin run across the JAW ROW, not by picking the
    # widest skin path: on the long-hair trace the widest skin path was the face merged with
    # the shoulder region, 1363px, and the check rejected a perfectly conforming generation.
    jaw = head_jaw_width(traced_path)
    want = JAW_WIDTH_BASE
    if abs(jaw - want) / want > 0.05:
        sys.exit(f"jaw width {jaw} differs from the base's {want} by "
                 f"{abs(jaw-want)/want*100:.0f}% — regenerate holding the head size")

    mask = face_mask(traced, base_paths, traced_path)
    if not mask:
        # An UNMASKED asset paints hair over everything, ears included. Most styles never
        # reach them; a pulled-back one like the topknot sweeps across and buries ears its
        # PNG plainly drew. Give those an ear-only mask.
        ears = ear_holes(base_paths, traced_path)
        if ears:
            mask = ('<defs><mask id="facehole" maskUnits="userSpaceOnUse" x="0" y="0" '
                    'width="2048" height="2048">'
                    '<rect x="0" y="0" width="2048" height="2048" fill="white"/>'
                    f'{ears}</mask></defs>')
    areas = check_landmarks(hair, mask)
    body = normalise(hair, areas)
    if texture_trace:
        body = merge_texture(hair, areas, texture_trace)
    payload = mask + (f'<g mask="url(#facehole)">{body}</g>' if mask else body)

    if dst.endswith(".asset.svg"):
        open(dst, "w").write(SVG_OPEN + payload + "</svg>")
    else:
        open(dst, "w").write(base_svg.replace("</svg>", payload + "</svg>"))

    n_sh, n_li, n_ba = body.count(HAIR_SHADE), body.count(HAIR_LIGHT), body.count(HAIR_BASE)
    print(f"{dst}: {n_ba+n_sh+n_li} paths ({n_ba} base + {n_sh} shade + {n_li} light)"
          f"{' | face mask' if mask else ''}")


if __name__ == "__main__":
    main()
