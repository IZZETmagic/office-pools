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
        def u_row(y):
            return dark[y, edge + step*2]
        widths, breaks = {}, []
        for y in range(300, 720):
            w = 0
            while 0 <= edge + step*w < 1024 and dark[y, edge + step*w]: w += 1
            if y % 40 == 0: widths[y] = w
            if 320 <= y <= 700 and w == 0: breaks.append(y)
        # ⚠ Report the LOWEST row that still has hair, not the first bare one. A mohawk is
        # shaved at the sides high up, so "first bare row" reported y320 on it — the number
        # that matters is where the sideburn ENDS. The contract wants that at y399.
        lowest = max([y for y in range(320, 700) if u_row(y)], default=0)
        run = f"  >> SIDEBURN ENDS y{lowest}" if lowest else "  >> no hair at the edge"
        # ⚠⚠ The OUTBOARD check. Everything above walks INWARD from the head edge, so it is
        # blind to hair sticking OUT past the edge — and that is what makes a sideburn look
        # like it is sitting on the ear. The ear occupies x201-258 (left) from y400 to y511,
        # so any hair outboard of the edge in the rows just above y400 lands on top of it.
        # buzz, mohawk and receding all measure 0 here; shortsides measures +18 to +22.
        ob = []
        for y in (370, 385, 395):
            if side == "L":
                xs = np.where(dark[y, :edge])[0]
                ob.append(edge - xs.min() if len(xs) else 0)
            else:
                xs = np.where(dark[y, edge:])[0]
                ob.append(xs.max() if len(xs) else 0)
        flag = "" if max(ob) == 0 else f"   ⚠ OVERHANGS THE EAR by {max(ob)}px"
        print(f"  {side}: " + " ".join(f"y{y}:{w}" for y, w in widths.items()) + run + flag)
