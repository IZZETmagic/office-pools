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
import json
import math
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
STUBBLE = "rgb(164,150,140)"

# ⭐ The BEARD FADE marker. A facial hair asset paints its sideburn band in this tone; compose
# turns that one path into a vertical gradient running from the SKIN colour at the top to the
# HAIR colour at the bottom, so the beard dissolves into the face the way a barber fade does.
#
# Measured off the reference Ryan supplied: 63 distinct tones across 64 rows, every one on the
# hair-to-skin blend line. A true gradient, not steps — which is why this is done at compose
# time rather than drawn. Thirteen generated stripes vectorised to 26 paths and still banded.
#
# ⚠ It is deliberately OFF the avatar palette (a violet nothing else uses) so the extractor
# cannot confuse it with a hair or stubble tone, and so a stray one is obvious rather than
# silently plausible.
FADE = "rgb(126,110,150)"
FADE_ID = "beardfade"

# ⚠⚠ HOW FAR DOWN THE BAND THE FADE REACHES, as a fraction of the band's own height.
#
# The gradient uses objectBoundingBox units, so without this it stretches over the WHOLE marked
# path — and the band runs from its flat top all the way down into the beard. The result was
# every side strip fading along its entire length instead of just dissolving at the top.
#
# Three stops, not two: skin at the top, full hair by FADE_SPAN, and full hair again at the
# bottom. Everything below FADE_SPAN is therefore solid beard.
FADE_SPAN = 0.30


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
    # FACIAL HAIR: where it sits in the stack, which is three separate questions.
    #
    # 1. UNDER OR OVER THE MOUTH — declared per style in facialhair/manifest.json. A
    #    moustache hangs over the lip, so the mouth is drawn first and the hair covers its
    #    top edge. A beard is a mass the mouth sits IN, so the mouth must be drawn last or a
    #    solid beard simply hides it. Coverage cannot decide this: the moustache overlaps the
    #    mouth region by 34% and stubble by 78%, with nothing clean in between.
    #
    # 2. ALWAYS UNDER THE NOSE. A moustache sits against the nose's underside; painted over
    #    it, a raised moustache swallows the nose tip.
    #
    # 3. Which means for an "over" style the NOSE HAS TO MOVE. It lives in the base, which is
    #    painted before everything, so it is re-inserted after the hair — otherwise "mouth
    #    under the moustache" and "nose over the moustache" cannot both hold.
    #
    # ⚠ And that is ALL it does. A previous version derived a clean-shaven patch from each
    # expression's mouth box and punched it through the beard. It sized correctly but made the
    # beard a different shape in every expression, which is not a beard, it is twelve beards.
    fh = arg("--facial-hair")
    fh_over = False
    if fh:
        name = fh.rsplit("/", 1)[-1].replace(".asset.svg", "")
        manifest = f"{__file__.rsplit('/', 1)[0]}/facialhair/manifest.json"
        try:
            fh_over = bool(json.load(open(manifest)).get(name, {}).get("over"))
        except Exception:
            fh_over = False

    def find_nose(doc: str):
        for m in re.finditer(r"<path[^>]*/?>", doc):
            path = m.group(0)
            if BASE_SHADE not in path:
                continue
            n = [float(x) for x in re.findall(r"-?\d+\.?\d*",
                                              re.search(r'd="([^"]*)"', path).group(1))]
            xs, ys = n[0::2], n[1::2]
            # Narrow, centred, upper-middle. The ears share this tone but sit out at the
            # sides; the neck shadow shares it too but is far wider and lower.
            if (max(xs) - min(xs) < 200 and 900 < (min(xs) + max(xs)) / 2 < 1150
                    and 900 < min(ys) < 1200):
                return path
        return None

    if fh and not fh_over:
        nose = find_nose(svg)
        svg = svg.replace(nose, inner(fh) + nose, 1) if nose \
            else svg.replace("</svg>", inner(fh) + "</svg>")

    for flag in ("--eyes", "--mouth", "--expression", "--brows"):
        if p := arg(flag):
            svg = svg.replace("</svg>", inner(p) + "</svg>")

    # An "over" style goes on after the face, taking the nose with it so the nose stays on top.
    if fh and fh_over:
        nose = find_nose(svg)
        if nose:
            svg = svg.replace(nose, "", 1)
        svg = svg.replace("</svg>", inner(fh) + (nose or "") + "</svg>")

    if p := arg("--hair"):
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

    # ---- the beard fade -------------------------------------------------------------------
    #
    # ⚠⚠ BACK-OUT: this whole feature is behind --fade and defaults to OFF. Without the flag the
    # FADE token is swapped for the flat hair colour, which is exactly what the compositor did
    # before it existed, and no <linearGradient> is emitted at all. To remove it entirely:
    #
    #     git revert <the commit that added this>
    #
    # The guard test asserts the default path emits no gradient, so a regression here fails CI
    # rather than shipping a purple sideburn.
    if FADE in svg:
        hair_c = arg("--hair-colour")
        skin_c = arg("--skin")
        # ⚠⚠ THE FADE MUST END AT THE ASSET'S OWN BODY TONE, NOT ALWAYS THE HAIR COLOUR.
        #
        # A stubble asset's body is the STUBBLE token — the hair mixed 55% toward the skin — so
        # fading its band to full hair made the band far DARKER than the stubble it joins. It
        # read as a dark bar, not a fade, which is exactly what it looked like.
        body = (rgb_str(tuple(int(h + (s2 - h) * 0.55)
                              for h, s2 in zip(hex_to_rgb(hair_c), hex_to_rgb(skin_c))))
                if (hair_c and skin_c and STUBBLE in svg) else
                (rgb_str(hex_to_rgb(hair_c)) if hair_c else HAIR_BASE))

        if "--fade" in sys.argv and hair_c and skin_c:
            # objectBoundingBox units, so the gradient spans whatever path carries it and no
            # coordinates have to be kept in step with the artwork.
            grad = (f'<defs><linearGradient id="{FADE_ID}" x1="0" y1="0" x2="0" y2="1">'
                    f'<stop offset="0" stop-color="{rgb_str(hex_to_rgb(skin_c))}"/>'
                    f'<stop offset="{FADE_SPAN}" stop-color="{body}"/>'
                    f'<stop offset="1" stop-color="{body}"/>'
                    f'</linearGradient></defs>')
            cut = svg.index(">", svg.index("<svg")) + 1
            svg = svg[:cut] + grad + svg[cut:]
            svg = svg.replace(f'fill="{FADE}"', f'fill="url(#{FADE_ID})"')
        else:
            # ⭐ Graceful fallback, and the reason the flag is safe: with the feature off the
            # band is simply solid hair — today's behaviour — rather than an unswapped marker
            # rendering as violet.
            svg = svg.replace(f'fill="{FADE}"', f'fill="{body}"')

    if c := arg("--hair-colour"):
        rgb = hex_to_rgb(c)
        # Stubble is the hair colour mixed 55% toward the skin — it has to track hair (a
        # blonde with black stubble looks wrong) while staying obviously lighter than a beard,
        # which is the only thing that makes it read as stubble at all.
        if sk := arg("--skin"):
            mix = tuple(int(h + (s2 - h) * 0.55) for h, s2 in zip(rgb, hex_to_rgb(sk)))
            svg = svg.replace(f'fill="{STUBBLE}"', f'fill="{rgb_str(mix)}"')
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
