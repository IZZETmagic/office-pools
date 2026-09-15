#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow", "numpy"]
# ///
"""Isolate a hair asset's texture tone into its own image, for a second trace pass.

    uv run isolate-texture.py hair/men/12-short-sides.png /tmp/tex.png

Why two passes
--------------
Recraft's vectorizer simplifies thin shapes when they sit inside a much larger one. On
short-sides it kept only 52% of the texture area; the buzz lost the tips of its swooshes the
same way. Tracing the texture ALONE — near-black on white, with no large competing shape —
recovers 95%.

Both passes come from the same PNG at the same canvas size, so their paths register exactly.
Nothing is drawn, warped or added by hand; it is the same source art traced twice, once per
tone. That distinction matters: hand-editing generated art is what broke approved work on
2026-09-14.

The base mass is the tone covering the most area. Everything else in the hair is texture,
whether lighter or darker than it — short-sides traces as a DARK base with LIGHTER texture.
"""
import sys

import numpy as np
from PIL import Image


def hair_mask(im: np.ndarray) -> np.ndarray:
    """Brownish, not skin, not white, not the blue shirt."""
    r, g, b = im[:, :, 0], im[:, :, 1], im[:, :, 2]
    return (r > 60) & (r < 230) & (b < r) & (g < r) & (im.sum(axis=2) < 680)


def main() -> None:
    src, dst = sys.argv[1], sys.argv[2]
    im = np.asarray(Image.open(src).convert("RGB")).astype(int)
    hair = hair_mask(im)
    if not hair.any():
        sys.exit(f"{src}: no hair pixels found")

    lum = 0.299 * im[:, :, 0] + 0.587 * im[:, :, 1] + 0.114 * im[:, :, 2]
    base_lum = np.median(lum[hair])
    texture = hair & (np.abs(lum - base_lum) > 12)

    if texture.sum() < 500:
        sys.exit(f"{src}: only {int(texture.sum())}px of texture — nothing worth a second pass")

    out = np.full_like(im, 255)
    out[texture] = [60, 50, 45]          # near-black on white traces cleanly
    Image.fromarray(out.astype("uint8")).save(dst)
    print(f"{dst}: {int(texture.sum())}px of texture isolated "
          f"(base luminance {base_lum:.0f})")


if __name__ == "__main__":
    main()
