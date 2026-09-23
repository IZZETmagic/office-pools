#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["fonttools"]
# ///
"""Build the SP chest mark from the real brand letterforms.

    uv run build-mark.py  ->  garments/mark/sp-mark.asset.svg

⭐⭐ THIS ONE IS NOT GENERATED, AND THAT IS DELIBERATE. Everything else in this family comes out
of Nano Banana, but the SportPool mark is TYPE, not art: `components/ui/Wordmark.tsx` is one
word set in Nunito 900, and its compact form is the two letters `SP`. A generator asked for
letters returns something letter-SHAPED, and a garbled mark is worse than no mark. So the
outlines are taken from the actual font the product ships.

⚠ The font lives in `mobile/node_modules/@expo-google-fonts/nunito` — a dependency, not
something this repo owns. The ASSET is committed; this script is provenance, and it will only
re-run where that dependency is installed.

⭐ COMPACT, NOT THE FULL WORDMARK. Wordmark.tsx: the `SP` form is "for a band, a tab bar, a
favicon — anywhere the full wordmark would crowd". A chest crest is that, and then some: at the
40px an avatar renders in a list, a real-crest-sized mark is under 4px across. `SportPool`
spelled out there is a smudge; two letters are a mark.

⭐ MONO, NOT THE BRAND TWO-TONE. Wordmark.tsx again: mono is "for surfaces that require
all-white or all-black — a pool's brand-coloured header … where the brand blue would either
clash with the background or disappear into it." A garment IS a brand-coloured background, and
the brand blue on a blue shirt is invisible. So the mark is painted in the garment's own LIGHT
token, which means one `--shirt` input still drives it and it can never collide with the body.

🔴 THIS SLOT TAKES THE SPORTPOOL MARK ONLY. Never a club crest, name or kit design. Those are
protected marks and the licence we hold covers displaying a crest in a fixture list, not putting
one on a garment someone wears. See the monetisation record: colourways, never badges.
"""
import re
import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont

HERE = Path(__file__).parent
FONT = (HERE.parents[2] / "mobile/node_modules/@expo-google-fonts/nunito"
        / "900Black/Nunito_900Black.ttf")

# ⭐ The crest slot: the wearer's LEFT chest, which is the VIEWER'S RIGHT — where a crest
# actually sits, and what Ryan asked for.
#
# ⚠⚠ MEASURED AGAINST THE SHOULDER, not eyeballed. The dome is a curve, not a rectangle: at
# y1650 it only reaches x1421, so a mark centred at x1372 hung 8.5% of itself off the shoulder
# and into the background. The first row where a 180x100 crest fits ENTIRELY on the garment is
# y1700, centred at x1400 — which is also clear of the neck (x849..1199 at its widest).
MARK_W = 180.0
MARK_CX, MARK_TOP = 1400.0, 1706.0

# ⭐ The mark gets its OWN token rather than reusing the garment's light tone. Two reasons: a
# crest wants more contrast than one step of lightening gives, and the sports top already paints
# PANELS in the light token — a mark in the same tone would vanish wherever it crossed one.
MARK_TOK = "rgb(200,225,255)"

HEAD = ('<svg version="1.1" xmlns="http://www.w3.org/2000/svg" '
        'viewBox="0 0 2048 2048" width="1024" height="1024">')


def glyph_paths(font: TTFont, text: str):
    """Each glyph's outline in font units, with its advance, in order."""
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    out = []
    for ch in text:
        name = cmap.get(ord(ch))
        if name is None:
            sys.exit(f"the font has no glyph for {ch!r}")
        pen = SVGPathPen(gs)
        gs[name].draw(pen)
        out.append((pen.getCommands(), gs[name].width))
    return out


def transform(d: str, sx: float, sy: float, dx: float, dy: float) -> str:
    """Scale, flip and translate a glyph outline into an M/L/C/Z path.

    ⚠ Baked into the coordinates, never emitted as a transform attribute — react-native-svg
    drops transform strings silently, which is the rule the whole asset set is built on.
    ⚠ sy is NEGATIVE: font space is y-up and SVG is y-down.

    ⚠⚠ QUADRATICS ARE CONVERTED TO CUBICS. A TrueType outline is quadratic and SVGPathPen emits
    it as `Q`, which renders fine in a browser and in react-native-svg — and is invisible to
    every tool in this pipeline, all of which parse M, L, C and Z only. A Q path measured by
    them comes back as a fraction of its real size (this mark read 26 units wide instead of
    180), so an asset that speaks a different dialect is a trap for the next person, not just
    for the check that caught it. C1 = P0 + 2/3(Q-P0), C2 = P2 + 2/3(Q-P2) is exact.
    """
    toks = re.findall(r"[MLCQZz]|-?\d+\.?\d*", d)
    out, i, cur, start = [], 0, (0.0, 0.0), (0.0, 0.0)
    T = lambda x, y: (x * sx + dx, y * sy + dy)
    def fmt(pt):
        return f"{pt[0]:.1f} {pt[1]:.1f}"
    while i < len(toks):
        c = toks[i]
        if c == "M":
            cur = start = (float(toks[i + 1]), float(toks[i + 2])); i += 3
            out.append("M " + fmt(T(*cur)))
        elif c == "L":
            cur = (float(toks[i + 1]), float(toks[i + 2])); i += 3
            out.append("L " + fmt(T(*cur)))
        elif c == "C":
            p1 = (float(toks[i + 1]), float(toks[i + 2]))
            p2 = (float(toks[i + 3]), float(toks[i + 4]))
            p3 = (float(toks[i + 5]), float(toks[i + 6])); i += 7
            out.append("C " + " ".join(fmt(T(*p)) for p in (p1, p2, p3)))
            cur = p3
        elif c == "Q":
            q = (float(toks[i + 1]), float(toks[i + 2]))
            p2 = (float(toks[i + 3]), float(toks[i + 4])); i += 5
            c1 = (cur[0] + 2 / 3 * (q[0] - cur[0]), cur[1] + 2 / 3 * (q[1] - cur[1]))
            c2 = (p2[0] + 2 / 3 * (q[0] - p2[0]), p2[1] + 2 / 3 * (q[1] - p2[1]))
            out.append("C " + " ".join(fmt(T(*p)) for p in (c1, c2, p2)))
            cur = p2
        elif c in "Zz":
            out.append("z"); cur = start; i += 1
        else:
            i += 1
    return " ".join(out)


def main() -> None:
    if not FONT.exists():
        sys.exit(f"font not found: {FONT}\n"
                 "It ships with mobile/node_modules; run npm install in mobile/ first. "
                 "The built asset is committed, so this is only needed to rebuild it.")
    font = TTFont(FONT)
    upm = font["head"].unitsPerEm
    glyphs = glyph_paths(font, "SP")

    # lay the two letters out on one baseline, then scale the pair to MARK_W
    total = sum(w for _, w in glyphs)
    scale = MARK_W / (total / upm) / upm
    # ⚠ cap height, not em: the mark must sit on a real optical box or it floats in its slot
    cap = font["OS/2"].sCapHeight if hasattr(font["OS/2"], "sCapHeight") else upm * 0.7
    height = cap * scale

    frags, pen_x = [], MARK_CX - MARK_W / 2
    for d, adv in glyphs:
        if d.strip():
            frags.append(transform(d, scale, -scale, pen_x, MARK_TOP + height))
        pen_x += adv * scale

    body = "".join(f'<path transform="translate(0,0)" fill="{MARK_TOK}" d="{d}"/>' for d in frags)
    out = HERE / "garments/mark/sp-mark.asset.svg"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(HEAD + body + "</svg>")
    print(f"  sp-mark.asset.svg  {len(frags)} glyphs  "
          f"{MARK_W:.0f}x{height:.0f} units at ({MARK_CX:.0f},{MARK_TOP:.0f})")


if __name__ == "__main__":
    main()
