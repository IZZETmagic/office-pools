#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow", "numpy"]
# ///
"""Isolate ONE hair tone into its own black-on-white image, for a second trace pass.

    uv run isolate-tone.py in.png out.png "#4A3B32,#392E27" shade

⭐ THE SAME TWO-PASS TRICK AS `isolate-texture.py`, for art that came from outside the pipeline.
Recraft merges two tones when they are close: Ryan's Gemini fill for `m14-longhair` uses
rgb(69,59,50) for the curtains and rgb(55,45,38) for the mass behind the neck, and the
vectorizer returned ONE path for both. The hair then extracted as a flat slab — "the colours
and feeling of depth is not" right. Tracing the darker tone ALONE, with no large competing
shape, gives it back.

⚠ NOT `isolate-texture.py`: its `hair_mask` needs `r > 60` and this art's dark tone is r=55, so
every pixel of the thing we are isolating is thrown away. That heuristic was fitted to the
house palette; outside art needs the tones stated.

⚠ Nearest-tone, not a threshold — the same rule as extract-behind.py, and for the same reason:
a JPEG shifts every tone and a fixed cut-off lands in a different place on each image.
"""
import sys

import numpy as np
from PIL import Image


def main() -> None:
    src, dst, tones, which = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
    pal = [tuple(int(h[k:k + 2], 16) for k in (1, 3, 5)) for h in tones.split(",")]
    want = pal[0] if which == "base" else pal[1]
    im = np.asarray(Image.open(src).convert("RGB")).astype(int)
    # distance to each hair tone and to a few things that are definitely not hair
    others = [(255, 255, 255), (238, 241, 248), (245, 201, 166), (215, 176, 146)]
    cands = pal + others
    d = np.stack([((im - np.array(c)) ** 2).sum(axis=2) for c in cands], axis=0)
    nearest = d.argmin(axis=0)
    hit = nearest == cands.index(want)
    out = np.where(hit[:, :, None], 0, 255).astype(np.uint8).repeat(3, axis=2)
    Image.fromarray(out).save(dst)
    print(f"   {dst}  {hit.sum()} px of {want}")


if __name__ == "__main__":
    main()
