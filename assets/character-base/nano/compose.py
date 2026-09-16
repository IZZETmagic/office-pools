#!/usr/bin/env python3
"""Composite avatar layers onto a locked base.

    uv run compose.py bases/base-neck-100.svg out.svg \
        --hair hair/assets/hair-m01-buzz.asset.svg \
        --hair-colour "#8B5E3C" --skin "#F5C9A6" --shirt "#3B6EFF" --bg "#FFFFFF"

Assets are SVG fragments carrying only their own paths, in the base's coordinate
space (viewBox 0 0 2048 2048). They register by construction — see extract-hair.py
for why no anchoring transform is needed.

Colour is never baked into an asset. Hair assets use two canonical tokens
(HAIR_BASE / HAIR_TEXTURE) and the base uses fixed skin/shirt/background values;
this script swaps them at compose time. The texture tone is derived by darkening
the requested hair colour, so a single colour input drives both.
"""
import re
import sys

# tokens as they appear in the asset and base files
HAIR_BASE = "rgb(140,122,110)"
HAIR_SHADE = "rgb(114,97,86)"
HAIR_LIGHT = "rgb(168,150,138)"
BASE_SKIN = "rgb(254,205,180)"
BASE_SHADE = "rgb(245,178,150)"
BASE_SHIRT = "rgb(30,118,214)"
BASE_SHIRT2 = "rgb(50,118,183)"
BASE_BG = "rgb(255,255,255)"
MOUTH_INK = "rgb(182,122,112)"
MOUTH_DARK = "rgb(118,72,68)"   # the inside of an open mouth
MOUTH_TONGUE = "rgb(206,116,112)"
BROW_INK = "rgb(101,70,52)"
BLUSH = "rgb(240,158,138)"


def hex_to_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def darken(rgb, f: float = 0.78) -> str:
    return "rgb({},{},{})".format(*(max(0, int(c * f)) for c in rgb))


def lighten(rgb, f: float = 1.22) -> str:
    return "rgb({},{},{})".format(*(min(255, int(c * f)) for c in rgb))


def rgb_str(rgb) -> str:
    return "rgb({},{},{})".format(*rgb)


def arg(name: str, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def main() -> None:
    positional = [a for a in sys.argv[1:] if not a.startswith("--")
                  and not (sys.argv.index(a) > 0 and sys.argv[sys.argv.index(a) - 1].startswith("--"))]
    base_path, dst = positional[0], positional[1]
    svg = open(base_path).read()

    # ---------------------------------------------------------------------------------
    # PHASE 1 — stack every layer. PHASE 2 — recolour once, over the finished document.
    #
    # ⚠ These two phases must not interleave. They used to: --eye-colour was applied right
    # after the --eyes layer, and --expression appended its paths further down. So an
    # expression's irises were added AFTER the swap that was meant to colour them, and
    # --eye-colour silently did nothing to a whole-face asset. A recolour can only be
    # trusted if it runs when the document is complete.
    # ---------------------------------------------------------------------------------
    def inner(path: str) -> str:
        # The asset's FULL inner markup, not just its <path> elements. Hair styles that
        # overlap the face carry a <defs><mask> and a masked <g>; pulling paths out with a
        # regex drops the mask wrapper and paints its black silhouette onto the face.
        a = open(path).read()
        return a[a.index(">", a.index("<svg")) + 1: a.rindex("</svg>")]

    # Paint order, first to last. HAIR GOES LAST, over the face — that is the physical
    # truth: a lock falling past the eye should pass in front of it, not behind.
    #
    # The face used to go last, to guarantee a fringe could never bury the eyes. Measured
    # against all 28 hair assets that guarantee was protecting against nothing: not one
    # overlaps the eye whites by a single pixel, and the closest — the bob — clears them by
    # 6px. So the safeguard cost correctness and bought nothing.
    #
    # ⚠ If a future hair style DOES reach the eyes, this order will occlude them. That is the
    # intended behaviour, but it makes eye clearance a property of the HAIR asset now, which
    # is where it belongs. Re-run the overlap check when adding hair.
    for flag in ("--eyes", "--mouth", "--expression", "--brows", "--hair"):
        if p := arg(flag):
            svg = svg.replace("</svg>", inner(p) + "</svg>")

    if c := arg("--eye-colour"):
        # The iris has TWO tones — a darker core and a lighter rim — and both come from one
        # input. Flattening them to a single colour loses a real feature of the artwork.
        rgb = hex_to_rgb(c)
        svg = svg.replace('fill="rgb(117,62,21)"', f'fill="{rgb_str(rgb)}"')
        svg = svg.replace('fill="rgb(150,84,34)"', f'fill="{lighten(rgb, 1.28)}"')

    if c := arg("--mouth-colour"):
        # One input drives all three, same shape as the iris and the hair: the open mouth's
        # interior is the lip colour darkened and the tongue lightened, so a recoloured lip
        # never leaves a mismatched gap behind it.
        rgb = hex_to_rgb(c)
        svg = svg.replace(f'fill="{MOUTH_INK}"', f'fill="{rgb_str(rgb)}"')
        svg = svg.replace(f'fill="{MOUTH_DARK}"', f'fill="{darken(rgb, 0.65)}"')
        svg = svg.replace(f'fill="{MOUTH_TONGUE}"', f'fill="{lighten(rgb, 1.13)}"')

    # Brows default to the HAIR colour, darkened. Real brows track hair, and a bald avatar
    # still needs them coloured — so the token is the brow's own, not hair's, and the default
    # is derived rather than shared. --brow-colour overrides for dyed hair or grey.
    if c := (arg("--brow-colour") or arg("--hair-colour")):
        svg = svg.replace(f'fill="{BROW_INK}"', f'fill="{darken(hex_to_rgb(c), 0.82)}"')

    if c := arg("--hair-colour"):
        rgb = hex_to_rgb(c)
        svg = svg.replace(f'fill="{HAIR_BASE}"', f'fill="{rgb_str(rgb)}"')
        svg = svg.replace(f'fill="{HAIR_SHADE}"', f'fill="{darken(rgb)}"')
        svg = svg.replace(f'fill="{HAIR_LIGHT}"', f'fill="{lighten(rgb)}"')
    if c := arg("--skin"):
        rgb = hex_to_rgb(c)
        svg = svg.replace(f'fill="{BASE_SKIN}"', f'fill="{rgb_str(rgb)}"')
        svg = svg.replace(f'fill="{BASE_SHADE}"', f'fill="{darken(rgb, 0.88)}"')
        # A blush is the skin pulled a little toward rose, never a fixed pink. Generated
        # verbatim it read as clown makeup on light skin and would be plain wrong on dark.
        # 22% is deliberately subtle — a blush should be noticed, not seen.
        blush = tuple(int(v + (t - v) * 0.22) for v, t in zip(rgb, (232, 112, 104)))
        svg = svg.replace(f'fill="{BLUSH}"', f'fill="{rgb_str(blush)}"')
    if c := arg("--shirt"):
        rgb = hex_to_rgb(c)
        svg = svg.replace(f'fill="{BASE_SHIRT}"', f'fill="{rgb_str(rgb)}"')
        svg = svg.replace(f'fill="{BASE_SHIRT2}"', f'fill="{darken(rgb, 0.9)}"')
    if c := arg("--bg"):
        svg = svg.replace(f'fill="{BASE_BG}"', f'fill="{rgb_str(hex_to_rgb(c))}"')

    open(dst, "w").write(svg)
    print(f"{dst}")


if __name__ == "__main__":
    main()
