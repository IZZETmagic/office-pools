#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Thin a hair asset's sideburns to the facial hair's own width — HAIR ONLY.

    uv run thin-sideburn.py --apply hair/assets
    uv run thin-sideburn.py hair/assets/hair-m01-buzz.asset.svg out.asset.svg

## The defect

Measured at 1024px, width inboard of the head edge:

    y      fullbeard   chinstrap   stubble  |  buzz   receding   shortsides
    420        2           0          0     |   25       20          16
    440        4           0          0     |   22       21          16
    460        8           2          2     |    0       23          17

The facial hair arrives at the junction as a 2-8px needle and the hair meets it with a
16-25px block that stops in a flat cut. Ryan's instruction is to take the HAIR down to the
facial hair's width — and to leave the facial hair alone.

## ⚠ WHY THIS IS A MASK AND NOT A PAINTED POLYGON

The first version painted a skin-coloured polygon at the end of the hair asset. Hair composes
LAST, over everything, so that polygon also erased whatever facial hair lay under it. I built
that in deliberately and wrote it up as a feature — "both sides of the junction obey one
envelope" — and it is not what was asked for. Thinning the hair must not reach the beard.

All six styles in the list already carry `<mask id="facehole">` with their paths inside
`<g mask="url(#facehole)">`. The cut therefore goes in as extra BLACK polygons inside that
existing mask. A mask applies to the group that references it, so:

  - it subtracts from the hair and from nothing else. The facial hair is a SIBLING in the
    composed document and is unreachable. Verified per beard by asserting that no pixel which
    is beard in a beard-only render becomes skin once the thinned hair is composed over it.
  - the eye-clearance ceiling that constrained the painted version is gone. That polygon had
    to stay inside 60px of the head edge because `laughing` brings ink to +74px and the
    polygon crossed the eye white. A mask cannot affect the expression, so the band is now
    limited only by where the HAIR legitimately is.
  - no new mechanism and no new platform risk: these six are already masked assets.

## The envelope

Two knots below the band's top, following fullbeard's own profile — the widest of the three,
so the hair is never left thinner than the beard it meets.

    y760  (y380)  the cap IS the band, so nothing is cut and no horizontal edge appears
    y880  (y440)  16 units = 8px   (fullbeard measures 4px here)
    y960  (y480)  24 units = 12px  (fullbeard 12px)
    y1040 (y520)  48 units = 24px  (fullbeard 24px)

The band's TOP matters: at y760 the widest listed sideburn is `curls` at 53px, inside the 60px
band, so the first edge lands on bare skin and there is no step to see. A flat-topped strip was
an earlier attempt and its step fell at a different height on every style.
"""

import sys
from pathlib import Path

# 2048 user units. The head's sides are a straight vertical line here, read off the base's
# own path data — so a polygon hugging the edge is exact, not an approximation.
LEFT_EDGE, RIGHT_EDGE = 516.0, 1532.0

BAND = 120.0
CAP = [(BAND, 760.0), (16.0, 880.0), (24.0, 960.0), (48.0, 1040.0)]

# Styles whose sideburn ends high and blunt. Everything else is left exactly as it is: the long
# styles run past y619 and cover the whole side of the face, so no junction is ever visible on
# them and cutting there would gouge a hole. `pixie` is deliberately absent — Ryan asked for it
# to be left alone.
SIDEBURN_STYLES = ["m01-buzz", "m02-sidepart", "m07-curls", "m10-mohawk",
                   "m11-receding", "m12-shortsides"]

# ⚠ A refusal, not a warning. The targets are chmod 444 and a second run must not stack a
# second cut.
MARKER = "<!--sideburn-thinned-->"


def wedge(edge: float, inward: int) -> str:
    """Black: the region of HAIR to hide — everything inboard of the cap line."""
    pts = CAP + [(BAND, CAP[-1][1])]
    d = " L ".join(f"{edge + inward * off:.1f} {y:.1f}" for off, y in pts)
    return f'<path d="M {d} Z" fill="black"/>'


def thin(svg: str) -> str:
    if MARKER in svg:
        raise SystemExit("already thinned — refusing to stack a second cut")
    if 'mask="url(#facehole)"' not in svg:
        raise SystemExit("no facehole mask — this style cannot be thinned this way")
    at = svg.index("</mask>")
    return svg[:at] + MARKER + wedge(LEFT_EDGE, 1) + wedge(RIGHT_EDGE, -1) + svg[at:]


def main() -> None:
    cap = " ".join(f"{o:.0f}@y{y:.0f}" for o, y in CAP)
    if sys.argv[1] == "--apply":
        # ⚠ Unlock exactly these paths, never the directory. `chmod 644 .` once stripped a
        # directory's execute bit while the shell was inside it and every command in the
        # session failed, including `echo` — which made a silent lock failure look like success.
        d = Path(sys.argv[2])
        for name in SIDEBURN_STYLES:
            f = d / f"hair-{name}.asset.svg"
            f.write_text(thin(f.read_text()))
            print(f"  {f.name}: masked back to {cap}")
        return
    src, dst = sys.argv[1], sys.argv[2]
    Path(dst).write_text(thin(Path(src).read_text()))
    print(f"{dst}: masked back to {cap}")


if __name__ == "__main__":
    main()
