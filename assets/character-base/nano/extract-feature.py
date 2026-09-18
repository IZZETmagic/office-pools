#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow", "numpy"]
# ///
"""Extract a face feature (eyes, brows, mouth) from a traced avatar, by REGION.

    uv run extract-feature.py traced.svg bases/base-neck-100.svg eye out.asset.svg

Why region and not colour
-------------------------
`extract-hair.py` selects by colour, which works because hair is the only thing on the canvas
in a hair tone. Face features cannot be selected that way:

- the eye whites are the same colour as the background,
- the iris brown is indistinguishable from hair brown,
- a mouth line is often the same tone as a brow.

But every face feature lives in a known box — see `landmarks.json`, measured across the
generated avatar set. So selection is: paths whose bounding box sits inside the feature's
zone, with a margin. The zone is the contract; colour is irrelevant.

Registration is free, exactly as it is for hair: the feature was generated onto the locked
base, so it already lives in the base's coordinate space. Nothing is moved.
"""
import json
import re
import sys

MARGIN = 40          # viewBox units of slack around the landmark box
SVG_OPEN = ('<svg version="1.1" xmlns="http://www.w3.org/2000/svg" '
            'viewBox="0 0 2048 2048" width="1024" height="1024">')

# Colours the locked base already draws. A feature path in one of these is the base showing
# through, not the feature.
BASE_COLOURS = [(254, 205, 180), (245, 178, 150), (30, 118, 214), (50, 118, 183)]

# Canonical feature tones. Two per feature: the white of an eye, and the "ink" — iris, brow or
# mouth line. compose.py swaps the ink from one colour input.
FEATURE_WHITE = "rgb(255,255,255)"
FEATURE_INK = "rgb(117,62,21)"        # the darker core of an iris / the body of a brow or mouth
FEATURE_INK_RIM = "rgb(150,84,34)"    # the lighter rim around an iris
FEATURE_LINE = "rgb(90,60,45)"        # a LID line, brow or mouth — not an iris, never recoloured
                                      # by --eye-colour

# Mouth tokens, deliberately sharing NOTHING with the iris. compose.py --eye-colour swaps the
# iris tokens across the whole composed document, so a mouth painted in one would turn blue
# every time the eyes did.
MOUTH_INK = "rgb(182,122,112)"
MOUTH_DARK = "rgb(118,72,68)"
MOUTH_TEETH = "rgb(255,255,255)"
MOUTH_TONGUE = "rgb(206,116,112)"

# Brows get their own token so they can follow the HAIR colour without being hair.
BROW_INK = "rgb(101,70,52)"
HAIR_BASE = "rgb(140,122,110)"   # facial hair follows the head-hair colour
STUBBLE = "rgb(164,150,140)"   # five o'clock shadow: hair colour blended toward skin
FADE = "rgb(126,110,150)"      # the beard-fade marker; see facialhair/FADE.md
FACE_SHADE = "rgb(245,178,150)"   # skin modelling — follows --skin, same token as the base
BLUSH = "rgb(240,158,138)"        # warmer than shade; follows --skin but keeps a rosy cast


def paths_of(svg: str) -> list[str]:
    return [m.group(0) for m in re.finditer(r"<path[^>]*/?>", svg)]


def d_of(path: str) -> str:
    return re.search(r'd="([^"]*)"', path).group(1)


def nums(path: str) -> list[float]:
    return [float(x) for x in re.findall(r"-?\d+\.?\d*", d_of(path))]


def box(path: str):
    n = nums(path)
    xs, ys = n[0::2], n[1::2]
    return min(xs), max(xs), min(ys), max(ys)


def fill_of(path: str):
    m = re.search(r'fill="rgb\((\d+),\s*(\d+),\s*(\d+)\)"', path)
    return (int(m.group(1)), int(m.group(2)), int(m.group(3))) if m else None


def poly_area(path: str) -> float:
    """Shoelace area of the path's points — how much ink the shape actually lays down."""
    n = nums(path)
    xs, ys = n[0::2], n[1::2]
    k = min(len(xs), len(ys))
    if k < 3:
        return 0.0
    return abs(sum(xs[i] * ys[(i + 1) % k] - xs[(i + 1) % k] * ys[i] for i in range(k))) / 2


def solidity(path: str) -> float:
    """Area / bounding-box area. A curved STROKE fills about 0.39 of its box; a filled
    OPENING fills 0.76 or more. Measured across the set: closed smile 0.39, closed frown
    0.39, open-with-teeth 0.76, open "O" 0.87."""
    x0, x1, y0, y1 = box(path)
    b = (x1 - x0) * (y1 - y0)
    return poly_area(path) / b if b else 0.0


def lum(c) -> float:
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2] if c else 0.0


def close(a, b, tol: int = 24) -> bool:
    return a is not None and b is not None and all(abs(x - y) <= tol for x, y in zip(a, b))


def main() -> None:
    traced_path, base_path, zone_name, dst = sys.argv[1:5]
    here = __file__.rsplit("/", 1)[0]
    lm = json.load(open(f"{here}/landmarks.json"))[zone_name]
    # A zone may declare an explicit `extract` band. The mouth needs one: `placement` is the
    # median of the closed LINE mouths and only 28px tall, and `observed` predates any open
    # mouth — the laugh's tooth band centred 7 units above the `observed` ceiling and was
    # dropped without a word. Same failure that lost both eye whites on the first eye run.
    zone = lm.get("extract") or lm["placement"]
    # --band overrides the zone for one run, in 1024-space. The special eyes need it: a
    # teardrop hangs on the CHEEK, well below any band measured from ordinary eyes, and it
    # would be dropped in silence. Overriding per-run beats widening the shared zone, which
    # would start swallowing brows and mouths on every other extraction.
    if "--band" in sys.argv:
        i = sys.argv.index("--band")
        zone = dict(zip(("x0", "x1", "y0", "y1"), (float(v) for v in sys.argv[i + 1:i + 5])))

    # landmarks.json is in 1024-space; traces are in viewBox units (2x)
    x0, x1 = zone["x0"] * 2 - MARGIN, zone["x1"] * 2 + MARGIN
    y0, y1 = zone["y0"] * 2 - MARGIN, zone["y1"] * 2 + MARGIN

    picked = []
    for p in paths_of(open(traced_path).read()):
        bx0, bx1, by0, by1 = box(p)
        # CENTRE inside the zone, not full containment. The landmark boxes were measured on
        # the generated set; a new feature drawn slightly larger spills past them and a
        # containment test then silently drops it — that lost both eye whites on the first
        # run while keeping the irises.
        cx, cy = (bx0 + bx1) / 2, (by0 + by1) / 2
        if not (x0 <= cx <= x1 and y0 <= cy <= y1):
            continue
        if (bx1 - bx0) * (by1 - by0) / (2048 * 2048) > 0.80:
            continue                       # the canvas background, whose centre is anywhere
        if any(close(fill_of(p), c) for c in BASE_COLOURS):
            continue                       # the base showing through, not the feature
        picked.append(p)

    if not picked:
        sys.exit(f"no {zone_name} paths found inside x {x0:.0f}-{x1:.0f} y {y0:.0f}-{y1:.0f}")

    if zone_name == "expression" and "--verbatim" not in sys.argv:
        # A whole face, classified by POSITION RELATIVE TO THE EYE WHITES rather than by a
        # fixed y band. A fixed band cannot work: `g03-pleading` has eyes so large that its
        # irises sit at y357, which is inside any band tight enough to call `f04-disgusted`'s
        # brows at y325 a brow. The eye white is the only landmark that moves with the art.
        # An eye white must be IN THE EYE BAND. Without that test the white band of TEETH in
        # an open mouth is taken for an eye — it is near-white and wider than 120 — and then
        # everything above it, including the actual eyes, is classified as eyebrows. That is
        # exactly what `laughing` did: crescent eyes at y874 read as brows because the teeth
        # at y1220 had been adopted as the eye line.
        #
        # The band is fixed rather than measured because every generated image registers to
        # the locked base by construction: the nose lands at y954-1131 in all of them, so the
        # eyes can only be here.
        EYE_BAND = (700, 1150)
        # ⚠ The width floor must be SMALL. A narrowed eye's white is cut into slivers by the
        # iris — `angry` measured 54-118px against a wide-open eye's 270 — so a floor of 120
        # found no eye whites at all, decided the eyes were shut, and turned the irises and
        # both eyebrows into "lids". 30 admits the slivers. Teeth cannot sneak in because the
        # band already excludes them, and a highlight dot inside an iris is harmless here: it
        # is inside the eye, so it cannot move eye_top or eye_bot anywhere wrong.
        whites = [box(p) for p in picked
                  if close(fill_of(p), (255, 255, 255), 24)
                  and (box(p)[1] - box(p)[0]) > 30
                  and EYE_BAND[0] <= (box(p)[2] + box(p)[3]) / 2 <= EYE_BAND[1]]
        # Closed or crescent eyes have no white at all, so fall back to the band itself.
        eyes_open = bool(whites)
        # ⚠ PER SIDE, not per face. A wink has an open eye on one side and a shut one on the
        # other, so an asset-wide "are the eyes open?" recolours the winking lid — it was
        # tagged as an iris and --eye-colour painted it blue, which reads as paint rather than
        # a shut eye. Same rule the locked eye assets already use.
        white_side = {"L": False, "R": False}
        for w in whites:
            white_side["L" if (w[0] + w[1]) / 2 < 1024 else "R"] = True
        eye_top = min((b[2] for b in whites), default=EYE_BAND[0])
        eye_bot = max((b[3] for b in whites), default=EYE_BAND[1])

        def in_an_eye(b):
            return any(wx0 - 8 <= b[0] and b[1] <= wx1 + 8 and wy0 - 8 <= b[2] and b[3] <= wy1 + 8
                       for wx0, wx1, wy0, wy1 in whites)

        inks = [p for p in picked
                if not close(fill_of(p), (255, 255, 255), 40) and fill_of(p)
                and not (fill_of(p)[0] > 190 and lum(fill_of(p)) > 150)]
        darkest = min((lum(fill_of(p)) for p in inks), default=0)

        # --- the mouth region, worked out once -------------------------------------------
        # Solidity alone cannot sort an open mouth with a TONGUE: on `cheeky` the dark opening
        # measured 0.53 and the tongue 0.56, straddling the cut, and they came out swapped —
        # the dark hole rendered as a pale lip and the rose tongue as the dark interior.
        #
        # So darkness picks out the interior, shape rescues a thin one, and a mid tone that
        # hangs BELOW the interior is the tongue.
        mouth = [p for p in picked if (box(p)[2] + box(p)[3]) / 2 > eye_bot and fill_of(p)
                 and not close(fill_of(p), (255, 255, 255), 24)
                 and not (fill_of(p)[0] > 190 and lum(fill_of(p)) > 150)]
        m_dark = [p for p in mouth if lum(fill_of(p)) < 100]
        m_mid = [p for p in mouth if lum(fill_of(p)) >= 100]

        def overlaps_a_mid(b):
            return any(not (b[1] < box(q)[0] or b[0] > box(q)[1]
                            or b[3] < box(q)[2] or b[2] > box(q)[3]) for q in m_mid)

        deepest_dark = max((box(p)[3] for p in m_dark), default=None)

        def inside_the_interior(b, tol: int = 6):
            """A tongue sitting INSIDE an open mouth, rather than lolling out below it.

            Containment is safe in this direction only: a tongue is enclosed by the opening,
            whereas a LIP would enclose the opening instead. `excited` needed it because its
            tongue shares a bottom edge with the interior exactly (both y1472), so the
            "hangs lower" test failed on a tie and the tongue was tagged a lip."""
            return any(box(q)[0] - tol <= b[0] and b[1] <= box(q)[1] + tol
                       and box(q)[2] - tol <= b[2] and b[3] <= box(q)[3] + tol
                       for q in m_dark)

        out = []
        for p in picked:
            c = fill_of(p)
            if c is None:
                continue
            b = box(p)
            cy = (b[2] + b[3]) / 2
            sat = max(c) - min(c)
            if close(c, (255, 255, 255), 24):
                token = FEATURE_WHITE if cy < eye_bot else MOUTH_TEETH
            elif c[0] > 190 and lum(c) > 150 and c[0] > c[1] > c[2]:
                # Skin modelling. Saturation separates a blush from a shadow: the base's own
                # shade tone is 95, the generated cheek blushes measure 107-132. A tight cut,
                # and the consequence of getting it wrong is a cheek that reads slightly warm
                # or slightly grey — not a broken face.
                token = BLUSH if sat >= 105 else FACE_SHADE
            elif cy < eye_top:
                # Above the eye, but a drooping upper LID overlaps the eye white while a BROW
                # sits clear of it. Measured on f05-exhausted: lids at -52/-57, brows at
                # +88/+95. A lid is face and follows skin; a brow follows hair.
                over = [w for w in whites if not (b[1] < w[0] or b[0] > w[1])]
                sep = min((w[2] - b[3] for w in over), default=999)
                # OVERLAP, not a gap threshold. A drooping LID intrudes into the eye (measured
                # -52 and -57); a BROW stops short of it. A fixed "at least 40px clear" cut
                # rejected angry's brows, which clear the eye by only 8px BY BOUNDING BOX —
                # the brow is angled, so its lowest corner and the eye's highest corner are
                # nowhere near the same column. Zero is the honest boundary: touch the eye and
                # you are a lid, stay out of it and you are a brow.
                token = BROW_INK if sep >= 0 else (
                    BLUSH if (c[0] > 190 and sat >= 105) else FACE_SHADE)
            elif in_an_eye(b):
                token = FEATURE_INK if lum(c) - darkest <= 14 else FEATURE_INK_RIM
            elif cy <= eye_bot and not white_side["L" if (b[0] + b[1]) / 2 < 1024 else "R"]:
                # No white anywhere in the eye band means no eyeball is showing: these marks
                # are closed LIDS, not irises, and must not take --eye-colour. Recolouring a
                # shut eye to blue reads as paint. Same rule the locked eye assets use.
                token = FEATURE_LINE
            elif cy > eye_bot:
                # SHAPE decides lip versus interior, not darkness and not contents.
                #
                # Darkness alone fails: a closed-lip smile is a single dark stroke, and called
                # an interior it gets darkened to 0.65 by --mouth-colour and turns near-black.
                #
                # "Does it contain teeth or a tongue?" was the next attempt and it fails the
                # other way: a surprised open "O" has neither, so it was called a LIP and
                # rendered in the pale rose lip token — a dark hole came out light pink.
                #
                # Solidity separates a stroke (~0.39) from an opening (0.76+) where the
                # mouth holds nothing; where it holds a tongue, darkness and overlap decide.
                if lum(c) < 100:
                    # A dark shape is an INTERIOR if it is filled, or if something lighter
                    # sits inside it — a thin dark opening above a tongue is still an opening.
                    token = MOUTH_DARK if (solidity(p) >= 0.55 or overlaps_a_mid(b)) \
                        else MOUTH_INK
                elif deepest_dark is not None and (b[3] > deepest_dark or inside_the_interior(b)):
                    # Lighter than the interior AND hanging below it: a tongue. Lightness
                    # alone cannot do this — lip and tongue tones overlap — so the bottom
                    # edge is what separates them, same as in the mouth-only assets.
                    token = MOUTH_TONGUE
                else:
                    token = MOUTH_INK
            else:
                token = FEATURE_INK
            out.append(re.sub(r'fill="rgb\([^)]*\)"', f'fill="{token}"', p))

        open(dst, "w").write(SVG_OPEN + "".join(out) + "</svg>")
        from collections import Counter
        names = {FEATURE_WHITE: "white", BROW_INK: "brow", FEATURE_LINE: "lid",
                 FEATURE_INK: "iris", FEATURE_INK_RIM: "iris-rim", MOUTH_DARK: "mouth-in",
                 MOUTH_INK: "lip", MOUTH_TONGUE: "tongue", BLUSH: "blush",
                 FACE_SHADE: "shade"}
        # `next(...)` with no default raises StopIteration inside a generator, which Python
        # turns into a RuntimeError that looks nothing like the real cause. A token missing
        # from this map should be reported, not crash the run.
        tally = Counter(next((n for t, n in names.items() if t in p), "?") for p in out)
        print(f"{dst}: {len(out)} paths ({', '.join(f'{v} {k}' for k, v in tally.most_common())})")
        return

    if "--verbatim" in sys.argv:
        # Keep the traced fills exactly as generated. The canonical tokens exist so one colour
        # input can drive a part, but a rainbow starstruck iris or a blue teardrop is NOT a
        # recolourable part — it is the whole point of the asset. Forcing it through the
        # iris core/rim classifier would flatten 28 paths into two browns.
        open(dst, "w").write(SVG_OPEN + "".join(picked) + "</svg>")
        fills = {re.search(r'fill="(rgb\([^)]*\))"', p).group(1) for p in picked
                 if re.search(r'fill="rgb\([^)]*\)"', p)}
        print(f"{dst}: {len(picked)} paths kept verbatim, {len(fills)} distinct fills")
        return

    if zone_name == "facialhair":
        # One flat mass, so there is nothing to classify — every path in the band is facial
        # hair. It takes the HAIR token so it follows --hair-colour: a blonde avatar with a
        # black beard looks like a mistake, and nobody wants to pick the colour twice.
        # --stubble marks a five o'clock shadow, which must stay LIGHTER than a real beard.
        # Tokenised as hair it would render at full hair strength and read as a short beard,
        # losing the only thing that distinguishes it.
        tok = STUBBLE if "--stubble" in sys.argv else HAIR_BASE

        # ⭐ --fade-band: tokenise the SIDEBURN BAND separately so compose.py can fill it with
        # a hair-to-skin gradient. See facialhair/FADE.md.
        #
        # ⚠⚠ BACK-OUT: without the flag this whole branch is skipped and every path takes the
        # single token exactly as before. `git revert` of the fade commits removes it.
        #
        # The band is identified by POSITION, not colour: it is the part of the beard hugging
        # the head's straight vertical sides (x516 / x1532 in 2048 units) above the jaw. Colour
        # cannot do it — a generated band may be painted a distinct tone or may not, and the
        # trace quantises tones unpredictably.
        def is_band(path: str) -> bool:
            # ⚠ Parse the `d` attribute ONLY. Running the number regex over the whole element
            # swallows the fill's rgb() components as coordinates — 140,122,110 dragged every
            # bounding box toward the origin and no band ever matched.
            m = re.search(r'd="([^"]*)"', path)
            if not m:
                return False
            n = [float(v) for v in re.findall(r"-?\d+\.?\d*", m.group(1))]
            xs, ys = n[0::2], n[1::2]
            if not xs:
                return False
            x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
            near_edge = x0 < 516 + 160 or x1 > 1532 - 160
            above_jaw = y1 < 1150                       # the jaw mass starts below this
            return near_edge and above_jaw and (x1 - x0) < 400

        if "--fade-band" in sys.argv:
            out = [re.sub(r'fill="rgb\([^)]*\)"',
                          f'fill="{FADE}"' if is_band(p) else f'fill="{tok}"', p)
                   for p in picked]
            nb = sum(1 for p in picked if is_band(p))
            open(dst, "w").write(SVG_OPEN + "".join(out) + "</svg>")
            print(f"{dst}: {len(out)} facial-hair paths, {nb} tokenised as the FADE band")
            return

        out = [re.sub(r'fill="rgb\([^)]*\)"', f'fill="{tok}"', p) for p in picked]
        open(dst, "w").write(SVG_OPEN + "".join(out) + "</svg>")
        print(f"{dst}: {len(out)} facial-hair paths"
              + ("  [stubble tone]" if tok is STUBBLE else ""))
        return

    if zone_name == "brow":
        # A brow is one flat shape per side and carries no internal structure, so there is
        # nothing to classify — every path in the band is brow. The work is all in the band
        # itself: see landmarks.json, the eyes are only 21 units clear of it.
        out = [re.sub(r'fill="rgb\([^)]*\)"', f'fill="{BROW_INK}"', p) for p in picked]

        # PLACEMENT IS A PARAMETER, exactly as gaze is. The generator draws brows relative to
        # the eyes IT drew and likes them close: measured across four generations the brow
        # bottom landed at y408-439 (1024-space) against an eye top of y337 — overlapping by
        # up to 20px. Prompting did not move it, the same resistance the eye-height round hit
        # (asking for 1.3/1.45/1.6 returned 1.66/1.57/1.60).
        #
        # So the SHAPE is generated and the PLACEMENT is arithmetic: translate the pair as a
        # unit so its lowest point lands on the target. The drawn form is untouched — this is
        # the gaze.py operation, not an edit to the art.
        #
        # The default of y395 is MEASURED, not chosen. Sweeping the brow bottom from y308 to
        # y418 against 12 hair assets and the eye asset, there is no clean band: raise the brow
        # and the hairline buries it, lower it and it lands on the eye. y395 is the only place
        # where nothing is buried (worst case 23% of one brow under a fringe, which is what a
        # fringe does) and eye overlap is 1.3%.
        #
        # ⚠ That corridor exists because OUR HAIR SITS LOW. Ten of twelve styles bury a brow
        # placed at y318. If the hair set is ever regenerated with higher hairlines, re-run the
        # sweep — brows could then sit where they anatomically belong.
        #
        # Pass --brow-bottom to raise a surprised brow or drop a heavy one.
        target = float(sys.argv[sys.argv.index("--brow-bottom") + 1]) * 2 \
            if "--brow-bottom" in sys.argv else 395.0 * 2
        low = max(box(p)[3] for p in out)
        dy = target - low
        if abs(dy) > 0.5:
            def shift(path: str) -> str:
                d = d_of(path)
                toks, buf, acc = re.findall(r"[A-Za-z]|-?\d+\.?\d*", d), [], []
                for t in toks:
                    if re.match(r"[A-Za-z]", t):
                        acc.append(t)
                        continue
                    buf.append(float(t))
                    if len(buf) == 2:
                        acc += [f"{buf[0]:.3f}", f"{buf[1] + dy:.3f}"]
                        buf = []
                return path.replace(d, " ".join(acc))
            out = [shift(p) for p in out]
        open(dst, "w").write(SVG_OPEN + "".join(out) + "</svg>")
        sides = {"L" if (box(p)[0] + box(p)[1]) / 2 < 1024 else "R" for p in picked}
        warn = "" if sides == {"L", "R"} else f"  ⚠ only {sorted(sides)} — a brow is missing"
        print(f"{dst}: {len(out)} brow paths{warn}  "
              f"| moved {dy:+.0f} so the brow bottom sits at y{target/2:.0f}")
        return

    if zone_name == "mouth":
        # A mouth has no iris, so none of the core/rim/lid reasoning below applies. Tones are
        # read straight off: white is teeth, the darkest is the inside of an open mouth, and
        # anything else is the lip. A closed line mouth traces as a single tone and must come
        # out as the LIP — not the interior — which is why "darkest = interior" only applies
        # when there is more than one non-white tone to choose between.
        inks = [p for p in picked if not close(fill_of(p), (255, 255, 255), 30)]
        # The INTERIOR of an open mouth is the deep maroon, and it is the one tone that can be
        # named absolutely: measured across the set it lands at 62-69 while every lip and
        # tongue sits at 131-148. Ordering alone could not do this — "darkest = interior"
        # called the open-O a lip (it has only one tone) and called the tongue-out mouth's LINE
        # an interior (there its darker tone is the lip and the lighter one is the tongue).
        INTERIOR_MAX_LUM = 100
        # The interior is the darkest shape; a TONGUE sits inside it, whereas a LIP would
        # enclose it. Both are lighter than the interior, so luminance alone cannot tell them
        # apart and the tongue came out tagged as a lip — which would have handed it the lip
        # colour on recolour.
        interiors = [box(p) for p in inks if lum(fill_of(p)) < INTERIOR_MAX_LUM]
        mids = [p for p in inks if lum(fill_of(p)) >= INTERIOR_MAX_LUM]
        mid_tones = sorted({round(lum(fill_of(p))) for p in mids})

        def inside_interior(b, tol: int = 6) -> bool:
            return any(ix0 - tol <= b[0] and b[1] <= ix1 + tol
                       and iy0 - tol <= b[2] and b[3] <= iy1 + tol
                       for ix0, ix1, iy0, iy1 in interiors)

        # A tongue that is NOT inside an interior — the tongue-out mouth, where it hangs below
        # a closed line — is the lighter of two mid tones AND reaches further down than the
        # darker one. Lightness alone is not enough: lip and tongue tones overlap (131-135 vs
        # 139-148), so the bottom edge is what actually separates them.
        lowest_bottom = {}
        for p in mids:
            k = round(lum(fill_of(p)))
            lowest_bottom[k] = max(lowest_bottom.get(k, 0), box(p)[3])
        tongue_tone = None
        if len(mid_tones) > 1:
            dark_t, light_t = mid_tones[0], mid_tones[-1]
            if lowest_bottom[light_t] > lowest_bottom[dark_t] + 20:
                tongue_tone = light_t

        out = []
        for p in picked:
            c = fill_of(p)
            if close(c, (255, 255, 255), 30):
                token = MOUTH_TEETH
            elif lum(c) < INTERIOR_MAX_LUM:
                token = MOUTH_DARK
            elif inside_interior(box(p)) or round(lum(c)) == tongue_tone:
                token = MOUTH_TONGUE
            else:
                token = MOUTH_INK
            out.append(re.sub(r'fill="rgb\([^)]*\)"', f'fill="{token}"', p))
        open(dst, "w").write(SVG_OPEN + "".join(out) + "</svg>")
        kinds = {MOUTH_TEETH: "teeth", MOUTH_DARK: "interior", MOUTH_TONGUE: "tongue", MOUTH_INK: "lip"}
        tally = {k: sum(1 for p in out if t in p) for t, k in kinds.items()}
        print(f"{dst}: {len(out)} paths in the mouth zone "
              f"({', '.join(f'{n} {k}' for k, n in tally.items() if n)}) "
              f"| source tones {sorted({round(lum(fill_of(p))) for p in inks})}")
        return

    # Normalise to canonical tokens so recolouring is one swap per part. The tracer invents
    # extra tones from antialiasing — this eye traced with TWO browns, a lighter rim around a
    # darker centre, which would otherwise need two recolour rules and drift between assets.
    # Normalise to canonical tokens so recolouring is one input per feature — but PRESERVE
    # a genuine second tone. This eye is drawn with a lighter rim around a darker core, and
    # collapsing both to one ink flattened a real design feature. Tones are told apart by
    # luminance: the darker is the core, the lighter is the rim.
    inks = [p for p in picked if not close(fill_of(p), (255, 255, 255), 30)]
    darkest = min((lum(fill_of(p)) for p in inks), default=0)

    # An iris RIM sits INSIDE the eyeball; the eye white is always at least as big as it.
    # A lighter shape that CONTAINS the whites is not a rim — it is the eye socket or a lower
    # lid, and giving it the iris colour turns the whole socket blue on recolour (which is
    # exactly what the worried eyes did).
    #
    # This is a containment test and not a size ratio because a ratio cannot separate them:
    # the worried socket is 2.2x its core and the wide rim is 1.7x its, with no safe gap in
    # between. A first attempt at "much taller than the core" split the wide eyes down the
    # middle — one side rim, the other lid — on a symmetric asset.
    # An iris RIM hugs its core; a lighter shape MUCH bigger than the core on its own side is
    # the eye socket / lower lid, and giving it the iris colour turns the whole socket blue on
    # recolour — which is what the worried eyes did.
    #
    # Measured over the eight assets, the ratio of a lighter shape's area to its own core's:
    # every genuine rim lands at 0.19-2.75, the worried socket at 4.16 and 4.66. Nothing sits
    # in between, so 3.5 is the cut.
    #
    # Two other tests were tried and both failed. Containment ("does it wrap the eyeball
    # white?") marks narrowed and sleepy as lids, because their rims are drawn full-width with
    # the sclera slivers painted back over the ends — in the source art that band is the same
    # rgb(155,92,40) as every other rim. And a GLOBAL height ratio split the wide eyes down the
    # middle, one side rim and the other lid, on a symmetric asset: the core it compared
    # against came from the opposite eye. The comparison has to be per side.
    RIM_MAX_AREA = 3.5

    def core_area(k: str) -> float:
        areas = [(b[1] - b[0]) * (b[3] - b[2])
                 for p in inks
                 for b in [box(p)]
                 if abs(lum(fill_of(p)) - darkest) <= 12
                 and (("L" if (b[0] + b[1]) / 2 < 1024 else "R") == k)]
        return max(areas) if areas else 0.0

    # Lid-vs-iris is decided PER SIDE of the face, not per asset. No white on a side means no
    # eyeball showing there — the marks are closed LIDS and must not take the iris colour
    # (recolouring to blue turned closed eyelids bright blue, which reads as paint).
    #
    # Per side rather than per asset because of the wink: it has an open eye on one side and a
    # closed lid on the other, so an asset-wide test would recolour the winking lid.
    mid = 2048 / 2
    white_side = {"L": False, "R": False}
    for p in picked:
        if close(fill_of(p), (255, 255, 255), 30):
            bx0, bx1, _, _ = box(p)
            white_side["L" if (bx0 + bx1) / 2 < mid else "R"] = True
    out = []
    for p in picked:
        c = fill_of(p)
        bx0, bx1, _, _ = box(p)
        side = "L" if (bx0 + bx1) / 2 < mid else "R"
        if close(c, (255, 255, 255), 30):
            token = FEATURE_WHITE
        elif not white_side[side]:
            token = FEATURE_LINE
        elif lum(c) - darkest > 12:
            b = box(p)
            ca = core_area(side)
            ratio = ((b[1] - b[0]) * (b[3] - b[2]) / ca) if ca else 0.0
            token = FEATURE_LINE if ratio > RIM_MAX_AREA else FEATURE_INK_RIM
        else:
            token = FEATURE_INK
        out.append(re.sub(r'fill="rgb\([^)]*\)"', f'fill="{token}"', p))

    open(dst, "w").write(SVG_OPEN + "".join(out) + "</svg>")
    n_w = sum(1 for p in out if FEATURE_WHITE in p)
    n_r = sum(1 for p in out if FEATURE_INK_RIM in p)
    n_l = sum(1 for p in out if FEATURE_LINE in p)
    n_c = len(out) - n_w - n_r - n_l
    parts = [f"{n} {k}" for n, k in ((n_w, "white"), (n_c, "core"), (n_r, "rim"), (n_l, "lid")) if n]
    kind = " + ".join(parts)
    print(f"{dst}: {len(out)} paths in the {zone_name} zone ({kind})")


if __name__ == "__main__":
    main()
