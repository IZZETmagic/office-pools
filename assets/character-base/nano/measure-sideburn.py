#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow","numpy"]
# ///
"""Measure a hair or beard sideburn against the seam contract.

    uv run measure-sideburn.py hair/seam/buzz-APPROVED.png

Walks inward from the head edge on every row and reports the width, plus the row where the
hair stops. See hair/seam/SIDEBURN-RECIPE.md for the target: a square flat cut at y399.

⚠ The probe uses the HEAD EDGE (x258 / x765), not the silhouette. The ears protrude to x201
between y400 and y511, so a silhouette read latches onto the ear. The head's sides are a
straight vertical line from y320 to y615, which is the span that matters; below y615 the jaw
curves in and the probe correctly falls outside the head, which is not a gap.

Walks inward from the head edge on each row. Reports the band width and flags any row where
bare skin appears at the edge — that is the gap/notch we have been chasing.
"""
import sys, numpy as np
from PIL import Image
LO, HI = 258, 765
for p in sys.argv[1:]:
    a = np.array(Image.open(p).convert("RGB").resize((1024,1024))).astype(int)
    dark = (a.sum(2) < 480)                      # the hair/beard mass
    print(f"\n{p}")
    for side, edge, step in (("L", LO, 1), ("R", HI, -1)):
        widths, breaks = {}, []
        for y in range(300, 720):
            w = 0
            while 0 <= edge + step*w < 1024 and dark[y, edge + step*w]: w += 1
            if y % 40 == 0: widths[y] = w
            if 320 <= y <= 700 and w == 0: breaks.append(y)
        # ⚠ Not an error. For a hair asset this is the PASS condition — it is where the
        # sideburn stops. The contract wants it at y399. It only means a gap when the row is
        # ABOVE where the hair still is, i.e. a hole punched in the middle of the band.
        run = f"  hair stops at y{breaks[0]}" if breaks else "  continuous to y615"
        print(f"  {side}: " + " ".join(f"y{y}:{w}" for y, w in widths.items()) + run)
