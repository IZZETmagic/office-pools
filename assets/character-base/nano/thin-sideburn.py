#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Thin a hair asset's sideburns down to the facial hair's own width at the junction.

    uv run thin-sideburn.py hair/assets/hair-m01-buzz.asset.svg out.asset.svg

## The defect this fixes

Measured at 1024px, width inboard of the head edge:

    y      beard (fullbeard, the widest)   buzz   receding   shortsides
    420          2                          25       20         16
    440          4                          22       21         16
    460          8                           0       23         17
    480         12                           0        0          0

⭐ The junction never failed on HEIGHT — a hair sideburn ends y396-489 and a beard's starts
y409-452, which is the same place. It fails on WIDTH. The beard arrives as a 2-8px needle and
the hair meets it with a 16-25px block that stops dead in a flat horizontal cut. Two shapes of
different thickness, butted end to end.

So the fix is not to move anything, and not to widen the beard — it is to take the hair down to
the beard's thickness over the last ~80px and let it come to a point where the beard's point is.

## Why a painted polygon and not a clip or a regeneration

The ears sit ENTIRELY OUTSIDE the head edge (y400-511, all of it at x < 258 of 1024). The strip
just inboard of the edge is therefore flat skin with no feature in it, so a skin-token polygon
laid over it is invisible against the base and subtracts only what is painted above the base —
which, in the hair asset, is the hair. No clip-path, no mask, no id to collide: plain `<path>`,
so `react-native-svg` renders it.

⚠ It follows that the polygon also trims the FACIAL hair, which composes underneath. That is
deliberate and it is the unification: both sides of the junction are cut to one envelope, so
they cannot disagree. The envelope is set ABOVE the beard's own profile everywhere it matters,
so in practice the beard loses at most ~2px, and the band stops at y480 before the beard starts
widening onto the jaw (17px at y500, 24 at y520 — those must not be touched).

## Why the top of the band is not a horizontal line

An earlier strip fix had a flat top and it read as a step, differently placed on every style.
Here the cut line starts at the full band width, so at the top of the band it removes nothing at
all and there is no edge to see. It only begins to bite around y400, by which point it is below
the hairline on every style in the list.

## Which styles

⭐ Not all of them. The long styles run past y619 and cover the side of the face completely, so
no junction is ever visible on them — cutting there would gouge a hole in the hair. The list is
in SIDEBURN_STYLES, and `pixie` is deliberately absent: Ryan asked for it to be left alone.
"""

import sys
from pathlib import Path

SKIN = "rgb(254,205,180)"

# 2048 user units, the asset space. The head's sides are a straight vertical line here.
LEFT_EDGE, RIGHT_EDGE = 516.0, 1532.0

# ⚠⚠ BAND IS A HARD CEILING, NOT A PREFERENCE. The first version used 260 (130px at 1024) and
# the polygon reached across the EYE WHITE, which rendered as a white block with a square
# corner. Measured across all twelve expressions, the nearest ink to the head edge in these
# rows is `laughing` at +74px; every other expression clears +77px. 120 units is 60px, which
# leaves 14px of margin. Re-measure before raising it.
#
# The band's TOP is chosen so the polygon's first edge lands on BARE SKIN on every style in the
# list. At y760 (=y380 at 1024) the widest listed sideburn is `curls` at 53px, inside the 60px
# band, so there is nothing there to cut and no horizontal edge appears. A visible step was the
# defect in the earlier full-height strip: it fell at a different place on every style.
#
# ⭐ THE CAP LINE MUST STAY WIDER THAN THE BEARD, ALL THE WAY DOWN.
#
# The polygon lies over the facial hair as well as the hair, so the rule is cap(y) >= beard(y)
# everywhere the polygon exists. Both ways of breaking that rule were built and seen:
#
#   cap ends flat at y960  -> it undercut the beard by 4 units and a HAIRLINE CRACK of skin
#                             opened inside the beard, which is worse than the gap being fixed
#   cap ends flat at y940  -> no crack, but `receding` and `shortsides` reach y950 and their
#                             uncut tips stuck out below the band as WHISKERS
#
# So the cap does not end. It falls to the beard's own thickness, holds there through the
# junction, and then WIDENS along the beard's profile — because that is what the beard does.
# Measured fullbeard widths in these units: 8 at y880, 16 at y920, 20 at y940, 24 at y960,
# 34 at y1000. The knots below clear that line by 4-10 units, which is the antialiasing margin.
#
#     y760  the cap IS the band, so nothing is cut and no horizontal edge appears
#     y880  20 units = 10px, the beard's own width through the junction
#     y940  24, where the beard starts to thicken
#     y1000 44, following it out onto the jaw
CAP = [(BAND := 120.0, 760.0), (20.0, 880.0), (24.0, 940.0), (44.0, 1000.0)]

# Styles whose sideburn ends high and blunt. Everything not listed is left exactly as it is.
SIDEBURN_STYLES = ["m01-buzz", "m02-sidepart", "m07-curls", "m10-mohawk",
                   "m11-receding", "m12-shortsides"]


def wedge(edge: float, inward: int) -> str:
    """The region to erase: everything inboard of the CAP line, out to the band's edge."""
    pts = CAP + [(CAP[0][0], CAP[-1][1])]     # close along the band's inboard side
    d = " L ".join(f"{edge + inward * off:.1f} {y:.1f}" for off, y in pts)
    return f'<path d="M {d} Z" fill="{SKIN}"/>'


# ⚠ The marker exists because the target files are LOCKED and applying this twice would stack
# two polygons. It is a refusal, not a warning — a second run must not silently widen the cut.
MARKER = "<!--sideburn-thinned-->"


def thin(svg: str) -> str:
    if MARKER in svg:
        raise SystemExit("already thinned — refusing to stack a second cut")
    cut = svg.rindex("</svg>") if "</svg>" in svg else len(svg)
    strips = MARKER + wedge(LEFT_EDGE, 1) + wedge(RIGHT_EDGE, -1)
    return svg[:cut] + strips + svg[cut:]


def main() -> None:
    cap = " ".join(f"{o:.0f}@y{y:.0f}" for o, y in CAP)
    if sys.argv[1] == "--apply":
        # In place across SIDEBURN_STYLES. The files are chmod 444, so unlock exactly these
        # paths first — never the directory. `chmod 644 .` once stripped a directory's execute
        # bit while the shell was inside it and every command in the session failed, including
        # `echo`, which made a silent lock failure look like a success.
        d = Path(sys.argv[2])
        for name in SIDEBURN_STYLES:
            f = d / f"hair-{name}.asset.svg"
            f.write_text(thin(f.read_text()))
            print(f"  {f.name}: capped to {cap}")
        return
    src, dst = sys.argv[1], sys.argv[2]
    open(dst, "w").write(thin(open(src).read()))
    print(f"{dst}: sideburn capped to {cap}")


if __name__ == "__main__":
    main()
