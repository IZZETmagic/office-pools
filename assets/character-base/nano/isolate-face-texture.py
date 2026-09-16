#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow", "numpy"]
# ///
"""Isolate a generated face's low-contrast SKIN-TONED detail for a second trace pass.

    uv run isolate-face-texture.py expressions/nano/f01-furious.png /tmp/tex.png

Why this exists
---------------
Given creative freedom, the generator draws part of an expression as subtle tonal modelling
rather than as line work: brow ridges, the furrow between the brows, the shadow under a lower
lip, hollow cheeks. On `f01-furious` the eyebrows came out at rgb(242,176,148) against a face
of rgb(255,204,177) — a contrast of 70 out of 765.

Recraft merges that into the face. The long brow strokes never became paths at all; two 39px
fragments survived out of a pair of full eyebrows. Nothing downstream can recover what was
never traced.

This is the same failure, and the same fix, as the hair texture: `isolate-texture.py` took
short-sides from 52% to 99% retention by tracing its texture tone alone. Near-black on white
has nothing to be merged into.

⚠ This is NOT hand-drawing the missing detail. It is the same source art traced twice, once
per tone — which is the difference between recovering the artist's shapes and inventing
replacements. Hand-editing generated art is what broke approved work on 2026-09-14.

What counts as texture
----------------------
Skin-family pixels that are DARKER than the face but lighter than any ink: the shade band.
The nose is drawn in that same tone and is excluded by position, since the locked base already
draws it — re-tracing it would stack a second nose on top of the real one.
"""
import sys

import numpy as np
from PIL import Image

# The locked base's own tones, in the generated images' 1024-space.
FACE = np.array([255, 204, 177])
NOSE_BOX = (455, 545, 470, 570)      # x0,x1,y0,y1 — the locked base nose, 1024-space


def main() -> None:
    src, dst = sys.argv[1], sys.argv[2]
    im = np.asarray(Image.open(src).convert("RGB").resize((1024, 1024))).astype(int)
    r, g, b = im[:, :, 0], im[:, :, 1], im[:, :, 2]

    # Skin family: warm, ordered r>g>b, and not near-white.
    skin_family = (r > 195) & (r > g) & (g > b) & (g > 140) & (b > 110)
    darker = np.abs(im - FACE).sum(axis=2) > 24
    texture = skin_family & darker

    # Only inside the face, never the neck, ears or shoulder.
    band = np.zeros(im.shape[:2], bool)
    band[200:720, 280:745] = True
    texture &= band

    x0, x1, y0, y1 = NOSE_BOX
    texture[y0:y1, x0:x1] = False

    # Drop anything too thin to be a drawn shape. Every hard edge in a flat vector image is
    # antialiased, and those 1-3px ramps sit in the same tonal band as the detail we want —
    # unfiltered they trace as a spurious outline around every eye, lip and jaw. A
    # morphological opening (erode, then dilate by the same amount) deletes structures thinner
    # than the kernel while leaving real strokes their original size.
    def shift_and(m, k):
        out = m.copy()
        for dy in range(-k, k + 1):
            for dx in range(-k, k + 1):
                out &= np.roll(np.roll(m, dy, axis=0), dx, axis=1)
        return out

    def shift_or(m, k):
        out = m.copy()
        for dy in range(-k, k + 1):
            for dx in range(-k, k + 1):
                out |= np.roll(np.roll(m, dy, axis=0), dx, axis=1)
        return out

    K = 2                                   # removes anything under ~5px across
    texture = shift_or(shift_and(texture, K), K)

    if texture.sum() < 300:
        sys.exit(f"{src}: only {int(texture.sum())}px of face texture — nothing to recover")

    out = np.full_like(im, 255)
    out[texture] = [40, 35, 32]          # near-black on white traces without merging
    Image.fromarray(out.astype("uint8")).resize((1024, 1024)).save(dst)
    print(f"{dst}: {int(texture.sum())}px of skin-toned detail isolated")


if __name__ == "__main__":
    main()
