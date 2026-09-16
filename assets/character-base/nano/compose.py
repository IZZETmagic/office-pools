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

    hair_path = arg("--hair")
    if hair_path:
        # Take the asset's FULL inner markup, not just its <path> elements. Assets for
        # styles that overlap the face carry a <defs><mask> and a masked <g>; pulling
        # paths out with a regex drops the mask wrapper and paints its black silhouette
        # straight onto the face.
        asset = open(hair_path).read()
        inner = asset[asset.index(">", asset.index("<svg")) + 1: asset.rindex("</svg>")]
        svg = svg.replace("</svg>", inner + "</svg>")   # hair paints last, over the ears

    # Eyes paint AFTER hair. Every hair asset is verified to leave the eye zone clear, so
    # this cannot hide them, and it guarantees the eyes are never buried by a fringe.
    if eyes_path := arg("--eyes"):
        a = open(eyes_path).read()
        svg = svg.replace("</svg>", a[a.index(">", a.index("<svg")) + 1: a.rindex("</svg>")] + "</svg>")

    if c := arg("--eye-colour"):
        # The iris has TWO tones — a darker core and a lighter rim — and both come from one
        # input. Flattening them to a single colour loses a real feature of the artwork.
        rgb = hex_to_rgb(c)
        svg = svg.replace('fill="rgb(117,62,21)"', f'fill="{rgb_str(rgb)}"')
        svg = svg.replace('fill="rgb(150,84,34)"', f'fill="{lighten(rgb, 1.28)}"')

    # The mouth has its own token, deliberately NOT the iris tokens. extract-feature.py
    # assigns iris core/rim to any non-white path in a zone, so a mouth sharing them would
    # be repainted by --eye-colour and the mouth would turn blue with the eyes.
    if mouth_path := arg("--mouth"):
        a = open(mouth_path).read()
        svg = svg.replace("</svg>", a[a.index(">", a.index("<svg")) + 1: a.rindex("</svg>")] + "</svg>")

    if c := arg("--mouth-colour"):
        svg = svg.replace(f'fill="{MOUTH_INK}"', f'fill="{rgb_str(hex_to_rgb(c))}"')

    if c := arg("--hair-colour"):
        rgb = hex_to_rgb(c)
        svg = svg.replace(f'fill="{HAIR_BASE}"', f'fill="{rgb_str(rgb)}"')
        svg = svg.replace(f'fill="{HAIR_SHADE}"', f'fill="{darken(rgb)}"')
        svg = svg.replace(f'fill="{HAIR_LIGHT}"', f'fill="{lighten(rgb)}"')
    if c := arg("--skin"):
        rgb = hex_to_rgb(c)
        svg = svg.replace(f'fill="{BASE_SKIN}"', f'fill="{rgb_str(rgb)}"')
        svg = svg.replace(f'fill="{BASE_SHADE}"', f'fill="{darken(rgb, 0.88)}"')
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
