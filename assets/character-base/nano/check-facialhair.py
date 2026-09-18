#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow", "numpy"]
# ///
"""Check a generated facial-hair PNG against the seam contract.

    uv run check-facialhair.py facialhair/v2/stubble.png

Reports the four things that have actually gone wrong, so none of them has to be caught by eye.
"""
import sys
import numpy as np
from PIL import Image

LO, HI = 258, 765          # the head's straight vertical sides at 1024
SKIN = np.array([254, 205, 180])


def main() -> None:
    base = np.array(Image.open("bases/base-neck-100.png").convert("RGB")
                    .resize((1024, 1024))).astype(int)
    for p in sys.argv[1:]:
        a = np.array(Image.open(p).convert("RGB").resize((1024, 1024))).astype(int)
        ink = (np.abs(a - base).sum(2) > 15)

        def top(x):
            c = [y for y in range(430, 780) if ink[y, x]]
            return c[0] if c else 0

        w = 0
        while w < 200 and ink[470, LO + w]:
            w += 1

        # 1. one flat tone. A gradient cannot be tokenised — compose.py recolours by swapping
        #    flat fills, so a faded beard would stay fixed-grey while the avatar recoloured.
        tones = [int(a[y, x].sum()) for y, x in
                 ((700, 512), (660, 360), (600, 330), (540, 275), (470, 275)) if ink[y, x]]
        spread = max(tones) - min(tones) if tones else 0

        # 2. ⚠ no hole where the mouth would be. Two of three samples punched one despite the
        #    prompt forbidding it, and a hole in the beard is what killed the per-expression
        #    beard approach earlier in this project.
        #
        # ⚠⚠ ONLY MEANINGFUL FOR A FULL-COVERAGE BEARD. A chinstrap is a strap around the jaw
        # and is SUPPOSED to be bare in the middle — the check reported 19,100px of "hole" on
        # the locked chinstrap, which is just its face. A permanently-red signal is one people
        # learn to ignore, so pass --strap to skip it.
        hole = (0 if "--strap" in sys.argv
                else int((np.abs(a[600:700, 420:611] - SKIN).sum(2) < 45).sum()))

        # 3. ⚠ no overhang past the head edge. The ears sit OUTSIDE it (x201-258, y400-511), so
        #    anything outboard there lands on top of them. Found on m12-shortsides only after
        #    Ryan spotted it by eye.
        ob = 0
        for y in (370, 385, 395):
            xs = np.where(ink[y, :LO])[0]
            if len(xs):
                ob = max(ob, LO - xs.min())
            xs = np.where(ink[y, HI:])[0]
            if len(xs):
                ob = max(ob, xs.max())

        print(f"\n{p}")
        print(f"  band      flat top y{top(262)}  thickness {w}px  (spec: y454, ~50px)")
        # ⚠ The centre probe must NOT sit at x512 — the NOSE is there (x484-540, y477-565) and
        # a moustache wrapping it shifts those pixels, so x512 reported y478 on a fullbeard whose
        # moustache actually sits at y565. Probe just OUTSIDE the nose on both sides.
        ctr = min(top(470), top(554))
        print(f"  moustache y{ctr}   cheek y{top(374)}   (probed beside the nose, not on it)")
        print(f"  tone      spread {spread}" + ("  ✔ one flat tone" if spread <= 6
                                                else "  ⚠ NOT FLAT — cannot be tokenised"))
        print("  mouth     n/a (--strap: a chinstrap is bare in the middle by design)"
              if "--strap" in sys.argv else
              f"  mouth     {hole}px of skin inside the mass"
              + ("  ✔" if hole < 200 else "  ⚠ HOLE PUNCHED IN THE BEARD"))
        print(f"  ears      overhang {ob}px" + ("  ✔" if ob <= 2 else "  ⚠ SITS ON THE EAR"))


if __name__ == "__main__":
    main()
