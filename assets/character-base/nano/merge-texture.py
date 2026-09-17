#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow", "numpy"]
# ///
"""Merge a second-pass texture trace into an expression asset, keeping its true colour.

    uv run merge-texture.py <texture-trace.svg> <source.png> <expression.asset.svg>

The second pass traces the detail as near-black on white, so it carries SHAPE but no colour.
Forcing every recovered path to the base shade tone was wrong: it is right for a shadow under
a lip and wrong for a blush, and it turned rosy cheeks into grey-brown patches.

So each path's colour is sampled from the ORIGINAL generated image at the path's centroid.
That recovers what the generator actually drew rather than assuming what it meant.

⚠ These colours are verbatim, so they do NOT follow --skin. A blush on a dark skin tone will
still be the pink it was generated as. That is a real limitation: shading ought to track skin
and a blush arguably ought not, and nothing here tells the two apart.
"""
import re
import sys

import numpy as np
from PIL import Image

BROW_INK = "rgb(101,70,52)"
FACE_SHADE = "rgb(245,178,150)"
BLUSH = "rgb(240,158,138)"

texture_svg, source_png, asset_path = sys.argv[1], sys.argv[2], sys.argv[3]
im = np.asarray(Image.open(source_png).convert("RGB").resize((2048, 2048))).astype(int)

# The eye line, read off the asset the extractor already tokenised. Eye whites are the only
# landmark that moves with the art; a fixed y band cannot work across expressions.
_asset = open(asset_path).read()
# ⚠ An eye white must be IN THE EYE BAND. Without that test the white band of TEETH in an
# open mouth is adopted as the eye line — it is near-white and wide — and then every cheek
# shape below the eyes measures as being ABOVE the (false) eye line and is classified as a
# BROW. On `laughing` that turned both cheek blushes into hair-coloured patches.
#
# The band is fixed because every generated image registers to the locked base by
# construction: the nose lands at y954-1131 in all of them, so the eyes can only be here.
EYE_BAND = (700, 1150)
_eyes = []
for _m in re.finditer(r"<path[^>]*/?>", _asset):
    _p = _m.group(0)
    if 'fill="rgb(255,255,255)"' not in _p:
        continue
    _n = [float(x) for x in re.findall(r"-?\d+\.?\d*", re.search(r'd="([^"]*)"', _p).group(1))]
    _xs, _ys = _n[0::2], _n[1::2]
    if max(_xs) - min(_xs) > 30 and EYE_BAND[0] <= (min(_ys) + max(_ys)) / 2 <= EYE_BAND[1]:
        _eyes.append((min(_xs), max(_xs), min(_ys), max(_ys)))
# Closed or crescent eyes leave no white at all; fall back to the band itself.
eye_top = min((e[2] for e in _eyes), default=EYE_BAND[0])


def gap_to_eye(x0, x1, y1):
    """Vertical distance from this shape's BOTTOM to the top of the eye beneath it.

    Negative means the shape overlaps the eye. A drooping upper EYELID overlaps (measured
    -52 and -57 on `f05-exhausted`); the EYEBROW above it is clearly separated (+88, +95).
    Nothing else distinguishes them — both sit above the eye's midline, and either may be
    drawn dark or skin-toned depending on the expression.
    """
    over = [e for e in _eyes if not (x1 < e[0] or x0 > e[1])]
    # No eye beneath this column means nothing to be a brow ABOVE — a lone shape out on the
    # cheek is not a brow. Defaulting to "very far above an eye" was what let cheeks qualify.
    return min((e[2] - y1 for e in over), default=-999)

under, over = [], []
for m in re.finditer(r"<path[^>]*/?>", open(texture_svg).read()):
    p = m.group(0)
    fl = re.search(r'fill="rgb\((\d+),\s*(\d+),\s*(\d+)\)"', p)
    if not fl or sum(int(x) for x in fl.groups()) > 600:
        continue                                   # the white background of the pass
    n = [float(x) for x in re.findall(r"-?\d+\.?\d*", re.search(r'd="([^"]*)"', p).group(1))]
    xs, ys = n[0::2], n[1::2]
    if (max(xs) - min(xs)) * (max(ys) - min(ys)) / (2048 * 2048) > 0.8:
        continue
    cx = int(min(2047, max(0, (min(xs) + max(xs)) / 2)))
    cy = int(min(2047, max(0, (min(ys) + max(ys)) / 2)))
    r, g, b = (int(v) for v in im[cy, cx])
    # Tokenise rather than keep the sampled colour. Verbatim was the first attempt and it
    # broke both ways: a recovered eyebrow stayed its generated brown no matter what hair the
    # avatar wore, and a recovered blush stayed a fixed pink that read as clown makeup on
    # light skin and would be plainly wrong on dark.
    #
    # The sample still decides WHICH token — it is how we know a shape is a brow rather than a
    # cheek — it just no longer decides the final colour.
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    sat = max(r, g, b) - min(r, g, b)
    g = gap_to_eye(min(xs), max(xs), max(ys))
    if g >= 0:
        # A BROW: above the eye and clearly clear of it. Whatever tone it was drawn in, it
        # follows hair — `f05-exhausted` and `f01-furious` draw theirs as pale skin-toned
        # ridges, and left as skin they stayed light against black hair.
        token = BROW_INK
    elif cy < eye_top:
        # Above the eye but TOUCHING or overlapping it: that is the upper EYELID, not a brow.
        # It is part of the face and must follow SKIN. Colouring it with the hair put a dark
        # band across the eye.
        token = BLUSH if sat >= 105 else FACE_SHADE
    elif sat >= 105:
        token = BLUSH
    else:
        token = FACE_SHADE
    painted = re.sub(r'fill="rgb\([^)]*\)"', f'fill="{token}"', p)
    # Paint order matters as much as colour. Skin modelling normally belongs UNDER the
    # features — a cheek shadow must not wash over an eye. But an upper EYELID is skin drawn
    # ON TOP of the eyeball, and inserted underneath it simply vanishes: `smug`'s half-mast
    # lids were both present in the asset and invisible in the render, which removed the
    # entire expression. Overlapping the eye is what tells them apart.
    (over if g < 0 else under).append(painted)

a = open(asset_path).read()
cut = a.index(">", a.index("<svg")) + 1
# Texture paints FIRST: it is skin modelling, and must sit under the eyes and mouth.
open(asset_path, "w").write(
    a[:cut] + "".join(under) + a[cut:a.rindex("</svg>")] + "".join(over) + "</svg>")
print(f"{asset_path}: merged {len(under)} texture paths under the features"
      + (f", {len(over)} over (eyelids)" if over else ""))
