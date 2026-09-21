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

# Stubble is a SHADOW on the skin, not a short beard. Measured off the art Ryan approved on
# 2026-09-18: 84% of the way from the beard to the skin in lightness, and clearly greyer than
# the hair-to-skin line. A plain 55% mix gave a mid brown that read as a lighter full beard.
# ⚠⚠ The same two numbers live in lib/avatar/compose.ts and builder-template.html; the guard
# test asserts all three agree.
STUBBLE_TOWARD_SKIN = 0.83
STUBBLE_TOWARD_GREY = 0.55

# ⚠⚠ ...and then a FLOOR against the skin it sits on. The derivation above tracks the hair,
# which is right — a blonde with black stubble looks wrong — but it says nothing about the
# skin, and on half the palette the two landed on top of each other. Measured over all 72
# hair x skin combinations: 35 put stubble within 12 luminance of the skin, and on 20 of them
# stubble came out LIGHTER than the skin.
#
# ⭐ Lighter is not itself wrong — white hair on dark skin SHOULD give pale stubble — so the
# floor is on the DISTANCE, not the direction. It pushes the tone further along whichever side
# it already sits, and only when it is too close, so every combination Ryan has approved is
# untouched (the default palette sits at 18.1 and never moves).
STUBBLE_MIN_CONTRAST = 14


def _lum(c) -> float:
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def stubble_tone(hair, skin) -> str:
    m = [h + (s - h) * STUBBLE_TOWARD_SKIN for h, s in zip(hair, skin)]
    grey = _lum(m)
    m = [v + (grey - v) * STUBBLE_TOWARD_GREY for v in m]
    # ⭐ adding a constant to every channel shifts the luminance by exactly that constant, so
    # the correction is one subtraction and the hue is untouched.
    d = _lum(m) - _lum(skin)
    if abs(d) < STUBBLE_MIN_CONTRAST:
        target = _lum(skin) + (STUBBLE_MIN_CONTRAST if d > 0 else -STUBBLE_MIN_CONTRAST)
        k = target - _lum(m)
        m = [max(0.0, min(255.0, v + k)) for v in m]
    return rgb_str(tuple(int(v) for v in m))

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
# ⭐ THE BEARD MARKER. Facial hair and head hair used to share the HAIR_BASE token, so they
# were filled with the SAME colour — and against long hair a beard vanished into it. Ryan,
# 2026-09-19: "the full beard blends into the long hair in the background."
#
# A facial-hair fragment therefore has its HAIR_BASE swapped for this marker as it is
# stacked, and the recolour pass fills the marker with the hair colour LIGHTENED. One colour
# input still drives both, so nothing is added to the config, and it is correct on every
# hair and skin combination — the same shape as STUBBLE and the fade.
#
# ⚠ Deliberately OFF the avatar palette (a green nothing else uses) so a stray one is
# obvious rather than silently plausible. It must never reach the output; a guard test says so.
BEARD = "rgb(110,150,126)"

# ⚠⚠ ADDITIVE, not a factor. This was ×1.14 and that is wrong at both ends of the palette,
# because a multiplier moves a colour in proportion to how bright it already is:
#
#     #1A1110 (black)     ×1.14 -> +2.2 luminance   <- no separation at all, the original bug
#     #2B1B12             ×1.14 -> +3.6             <- likewise
#     #4A3B32 (default)   ×1.14 -> +8.3             <- what Ryan actually approved, on one swatch
#     #E8E8ED (platinum)  ×1.14 -> clamps to pure WHITE
#
# Adding a constant to each channel moves the luminance by exactly that constant, whatever the
# input, so all nine hair swatches get the same visible step and none clamps. 12 is close to
# the +8.3 Ryan approved on the default swatch and enough to read on black.
BEARD_LIFT = 12

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

    # ---------------------------------------------------------------------------------
    # THE STACK. Everything that goes on top of the head is laid out in ONE place, in one
    # order. The base's own NOSE and EARS are lifted out and re-laid with it, because where
    # the base puts them (last) cannot satisfy all of these at once:
    #
    #   ears          hair falls OVER the ear; a beard's tufts grow in FRONT of it
    #   eyes, brows   a lock falling past the eye passes in front of it, so hair is later
    #   hair          ⭐⭐ ...but EARLIER than facial hair. Ryan, 2026-09-19: with long hair
    #                 the bushy beard was buried behind it. A beard is on the FACE and the
    #                 hair falls beside it, so the beard wins. These two are not in tension:
    #                 the eyes are high and the beard is low, and both rules hold at once.
    #   facial hair   over the hair, under the nose
    #   mouth         UNDER a moustache, OVER a beard — see below
    #   nose          always last
    #
    # ⚠ Hair is still after the eyes. The face used to go last to guarantee a fringe could
    # never bury them; measured against all 27 hair assets that guarantee was protecting
    # against nothing — not one overlaps the eye whites by a pixel, and the closest, the bob,
    # clears them by 6px. If a future style DOES reach the eyes it will occlude them, which
    # is intended: eye clearance is a property of the HAIR asset. Re-run the check.
    #
    # FACIAL HAIR: where it sits, which is three separate questions.
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
    # 3. Which means the NOSE HAS TO MOVE. It lives in the base, painted before everything,
    #    so it is lifted out and re-laid last — otherwise "mouth under the moustache" and
    #    "nose over the moustache" cannot both hold.
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

    def find_head(doc: str):
        # The only skin path that spans the canvas. The neck shares its tone but is narrow.
        for m in re.finditer(r"<path[^>]*/?>", doc):
            path = m.group(0)
            if BASE_SKIN not in path:
                continue
            n = [float(x) for x in re.findall(r"-?\d+\.?\d*",
                                              re.search(r'd="([^"]*)"', path).group(1))]
            xs = n[0::2]
            if max(xs) - min(xs) > 900:
                return re.search(r'd="([^"]*)"', path).group(1)
        return None

    def find_ears(doc: str) -> list:
        # Same tone as the nose AND the neck shadow, so colour cannot separate them. What
        # makes an ear an ear is that it sits OUTBOARD of the head's straight sides; the
        # nose and the neck shadow are both centred.
        out = []
        for m in re.finditer(r"<path[^>]*/?>", doc):
            path = m.group(0)
            if BASE_SHADE not in path:
                continue
            n = [float(x) for x in re.findall(r"-?\d+\.?\d*",
                                              re.search(r'd="([^"]*)"', path).group(1))]
            xs = n[0::2]
            cx = (min(xs) + max(xs)) / 2
            if cx < 600 or cx > 1448:
                out.append(path)
        return out

    # ⭐ THE EARS MOVE TOO. The base paints them last, so a beard whose sideburns grow
    # outboard was clipped square by them. Ryan asked for the bushy beard's hair to sit
    # slightly IN FRONT of the ears. For a flush-sided beard it is a no-op: the band's outer
    # edge and the ear's inner edge share about one unit.
    ears = find_ears(svg)
    for e in ears:
        svg = svg.replace(e, "", 1)
    nose = find_nose(svg)
    if nose:
        svg = svg.replace(nose, "", 1)

    def part(flag: str) -> str:
        p = arg(flag)
        return inner(p) if p else ""

    # ⚠⚠ An EXPRESSION is a whole face in ONE fragment — eyes, brows, cheeks AND mouth — so
    # there is no single place for it: its brows must sit UNDER the hair and its mouth must
    # sit OVER a beard. It is therefore SPLIT, on each path's TOP edge.
    #
    # ⭐ The line is not arbitrary. Measured across all 102 paths in the 12 shipped
    # expressions: the upper group — eyes, irises, brows, cheeks, tears — never starts below
    # y999.5, and the lower group — lips, mouth interior, tongue, teeth and chin marks —
    # never starts above y1145.5. y1072 is the middle of that gap, and it sits just above the
    # beard's own top edge at y1105.8, which is the boundary the split exists for.
    #
    # ⚠ Classifying by TOKEN does not work: an open mouth's TEETH carry the eye-white token
    # and `laughing`/`sad` put a skin-shade chin mark below the lip. Position does work.
    # A guard test re-derives the gap from the shipped assets, so a new expression that
    # straddles the line fails the build instead of rendering a brow over a fringe.
    EXPRESSION_SPLIT = 1072.0

    def split_expression(frag: str):
        upper, lower = [], []
        for path in re.findall(r"<path[^>]*/?>", frag):
            d = re.search(r'd="([^"]*)"', path)
            ys = [float(v) for v in re.findall(r"-?\d+\.?\d*", d.group(1))][1::2] if d else []
            (lower if ys and min(ys) >= EXPRESSION_SPLIT else upper).append(path)
        return "".join(upper), "".join(lower)

    expr_upper, expr_lower = split_expression(part("--expression"))
    mouth = part("--mouth") + expr_lower

    # ---- the body goes in FRONT of the hair ------------------------------------------------
    #
    # ⭐⭐ Every hair asset was traced against base-neck-100 and carries that base's body
    # silhouette as a DIP in its own outline, so on any other base the hair is wrong: a
    # narrower neck leaves a background crack between the hair and the neck, and a wider one is
    # simply covered — at neck-140 the hair hid 35px of neck on each side, which is why the two
    # wider necks rendered almost identically to the default. Ryan, 2026-09-20.
    #
    # Two derived layers fix it without touching a single locked hair asset — see
    # build-body-layers.py, which generates both from the locked bases:
    #
    #   hair/backfill/   PER STYLE: the part of the dip that sits next to THAT style's own
    #                    hair, in the HAIR token, painted BEFORE the hair. ⚠ Per style because
    #                    one shared fill draws a hair-coloured rim along the shoulder and down
    #                    the neck of every style that does not cover it.
    #   front-neck-<N>   this base's own body MINUS the head, painted AFTER the hair so the
    #                    body sits in front of it at its true width
    #
    # ⚠ The backfill is only for styles long enough to BRACKET the neck (hair/manifest.json).
    # A buzz cut never reaches it, and filling the dip for one would paint hair beside a
    # narrow neck out of nowhere.
    # ⭐ HAIR THAT FALLS IN FRONT OF THE FACE GOES BACK ON TOP OF THE BEARD. The stack puts
    # facial hair over the hair, which is right for the length hanging BESIDE the head — but
    # wrong for the strands falling across the cheek, which should pass in front of a beard the
    # way they pass in front of everything else on the face. Ryan, 2026-09-20.
    #
    # ⭐⭐ The hair fragment is simply painted A SECOND TIME after the facial hair, masked to
    # the head's own silhouette, so only the part over the face comes back. No asset changes and
    # no new geometry — the bundle does not grow at all, only the composed document.
    #
    # ⚠ Emitted ONLY when there is both hair and facial hair; otherwise it is a second copy of
    # the hair that could never change a pixel.
    # ⚠ The copy's own <mask id="facehole"> is renamed, or two elements in one document would
    # carry the same id.
    backfill = front_body = hair_front = ""
    if arg("--hair"):
        here = __file__.rsplit("/", 1)[0]
        style = arg("--hair").rsplit("/", 1)[-1].replace(".asset.svg", "").replace("hair-", "")
        try:
            if json.load(open(f"{here}/hair/manifest.json"))["backfill"].get(style):
                backfill = inner(f"{here}/hair/backfill/{style}.svg")
        except Exception:
            backfill = ""
        m = re.search(r"base-neck-(\d+)", base_path)
        try:
            front_body = inner(f"{here}/bases/front-neck-{m.group(1)}.svg") if m else ""
        except Exception:
            front_body = ""
        if fh and (head_d := find_head(svg)):
            copy = part("--hair").replace("facehole", "facehole-front")
            hair_front = (
                '<defs><mask id="faceonly" maskUnits="userSpaceOnUse" x="0" y="0"'
                f' width="2048" height="2048"><path d="{head_d}" fill="white"/></mask></defs>'
                f'<g mask="url(#faceonly)">{copy}</g>')
    svg = svg.replace("</svg>", (
        "".join(ears)
        + part("--eyes") + part("--brows") + expr_upper
        + (mouth if fh_over else "")
        + backfill + part("--hair") + front_body
        + (inner(fh).replace(f'fill="{HAIR_BASE}"', f'fill="{BEARD}"') if fh else "")
        + hair_front
        + ("" if fh_over else mouth)
        + (nose or "")
    ) + "</svg>")

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

    # The beard tone, derived from the hair colour so one input still drives both. Computed
    # here because the fade block below needs it as the tone its gradient ends at.
    # ⚠ Unconditional: with no --hair-colour the marker must still be filled, or it reaches
    # the output as raw green.
    _hair_rgb = (hex_to_rgb(arg("--hair-colour")) if arg("--hair-colour")
                 else tuple(int(v) for v in re.findall(r"\d+", HAIR_BASE)))
    beard_tone = rgb_str(tuple(min(255, v + BEARD_LIFT) for v in _hair_rgb))
    svg = svg.replace(f'fill="{BEARD}"', f'fill="{beard_tone}"')

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
        # A stubble asset's body is the STUBBLE token — the derived shadow tone — so fading its
        # band to full hair made the band far DARKER than the stubble it joins. It read as a
        # dark bar, not a fade, which is exactly what it looked like.
        # ⚠ For anything that is not stubble the body is now the BEARD tone, not the raw hair
        # colour — otherwise the band ends darker than the beard it joins, which is the same
        # dark-bar failure the stubble case above was written for.
        body = (stubble_tone(hex_to_rgb(hair_c), hex_to_rgb(skin_c))
                if (hair_c and skin_c and STUBBLE in svg) else beard_tone)

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
        # Stubble tracks the hair (a blonde with black stubble looks wrong) but is derived as a
        # shadow — see stubble_tone — which is the only thing that makes it read as stubble.
        if sk := arg("--skin"):
            svg = svg.replace(f'fill="{STUBBLE}"', f'fill="{stubble_tone(rgb, hex_to_rgb(sk))}"')
        # ⚠⚠ STROKE as well as fill. Every hair path carries a hairline stroke of its own
        # fill, which is how the tracer's butted edges are sealed — see seal-hair-seams.py.
        # The stroke holds the same TOKEN, so swapping only the fill would leave grey-brown
        # outlines on every recoloured avatar. A guard test pins all three compositors.
        def swap_tone(doc: str, token: str, value: str) -> str:
            return (doc.replace(f'fill="{token}"', f'fill="{value}"')
                       .replace(f'stroke="{token}"', f'stroke="{value}"'))

        svg = swap_tone(svg, HAIR_BASE, rgb_str(rgb))
        svg = swap_tone(svg, HAIR_SHADE, darken(rgb))
        svg = swap_tone(svg, HAIR_LIGHT, lighten(rgb))
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
