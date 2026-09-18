#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow", "numpy"]
# ///
"""Extend a facial hair asset up the face edge so hair sideburns always meet it.

    uv run extend-sideburn.py facialhair/assets/chinstrap.asset.svg out.asset.svg [--top 300]

The problem
-----------
Short hair stops high on the side of the head and a beard starts low, leaving bare skin
between them. Measured across combinations: quiff + chinstrap leaves a gap of up to 221px,
quiff + fullbeard up to 159. Long hair covers the whole side of the head so it never shows.

Why a strip and not a precise join
----------------------------------
⭐ Hair and facial hair are THE SAME COLOUR — both follow --hair-colour. So an overlap is
invisible and only a gap shows. The fix therefore does not need to meet the sideburn exactly;
it needs to OVER-REACH it. A constant-width strip up the face edge merges seamlessly with
both the strap below and any sideburn above.

This is also what the assets should have looked like: a chinstrap runs ear to ear by
definition, and a full beard connects to the sideburns. Stopping at the jaw was the anomaly.

Why this is not the rejected mouth patch
----------------------------------------
That one derived a shape from the EXPRESSION, so the beard changed in every expression —
twelve beards, not one. This is a single fixed shape baked into the asset once. Every
combination gets the identical silhouette, which is the property that makes an asset an asset.

The edge is read from the locked base itself, so the strip hugs the real head outline rather
than an approximation of it.
"""

import re
import sys

HAIR_BASE = "rgb(140,122,110)"

# The locked base's head edges, read off its own path data, not a rasterisation.
#
# ⚠ Two earlier versions derived these from a screenshot of the base and both produced
# artifacts: min/max per row shot out to stray antialiased pixels at the ears and rendered as
# whiskers; taking the largest contiguous run instead picked the wrong run on some rows and
# drew a line straight across the face. The head's sides are a STRAIGHT VERTICAL LINE at
# x516 / x1532 between y631 and y1207 — there is no curve here to follow, so a rectangle is
# both exact and incapable of producing an artifact.
LEFT_EDGE, RIGHT_EDGE = 516.0, 1532.0
TOP, BOTTOM = 760.0, 1220.0     # above the highest hair sideburn, down well inside the strap

# ⚠ The strip TAPERS. Every hair style's sideburn ends in a point 1-6px wide, but at a
# different height — y429 to y488 across the set. A constant-width rectangle therefore
# appears at full width exactly where each taper ends, and because that height differs per
# style the step lands somewhere different every time. It reads as "the sideburns are
# different sizes per hair style", which is exactly what it is.
#
# Tapering from near-nothing at the top to the strap's own thickness at the bottom continues
# both the hair's taper above and the strap's thickening below, so the join is unremarkable
# wherever it happens to fall.
W_TOP, W_BOTTOM = 3.0, 36.0


def arg(name, default):
    return type(default)(sys.argv[sys.argv.index(name) + 1]) if name in sys.argv else default


def main() -> None:
    src, dst = sys.argv[1], sys.argv[2]
    top, bottom = arg("--top", TOP), arg("--bottom", BOTTOM)
    w_top, w_bot = arg("--w-top", W_TOP), arg("--w-bottom", W_BOTTOM)

    def wedge(edge, inward):
        pts = [(edge, top), (edge, bottom),
               (edge + inward * w_bot, bottom), (edge + inward * w_top, top)]
        return ('<path d="M ' + " L ".join(f"{x:.1f} {y:.1f}" for x, y in pts)
                + f' Z" fill="{HAIR_BASE}"/>')

    strips = wedge(LEFT_EDGE, 1) + wedge(RIGHT_EDGE, -1)

    svg = open(src).read()
    cut = svg.index(">", svg.index("<svg")) + 1
    # The strips go FIRST so the original asset paints over them — its outline stays the
    # authority wherever the two overlap.
    open(dst, "w").write(svg[:cut] + strips + svg[cut:])
    print(f"{dst}: tapered strips y{top:.0f}-{bottom:.0f}, {w_top:.0f}->{w_bot:.0f} wide, both edges")


if __name__ == "__main__":
    main()
