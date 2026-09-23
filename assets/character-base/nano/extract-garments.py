#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["shapely"]
# ///
"""Extract a garment asset from a traced avatar.

    uv run extract-garments.py /tmp/ga-w04-polo/vectorize-00.svg garments/assets/w04-polo.asset.svg

⭐ A GARMENT IS PAINTED IN THE BASE'S OWN SHIRT TOKENS, so `--shirt` recolours it exactly as it
recolours the default shirt. No new token, no new config field, no new palette.

⚠⚠ THE ART COMES BACK WITH THREE OR FOUR TONES and there are three tokens, so they are sorted
by LUMINANCE against the body tone rather than counted:

  lighter than the body   -> SHIRT3, the light token (the sports top's panels)
  the body itself         -> SHIRT, taken verbatim from --shirt
  darker                  -> SHIRT2, the shadow token (collars, pockets, plackets, ribbing)

⚠ Anything darker collapses into ONE token, so two dark tones in one design merge. That is why
the direction of the third token matters: `shirt -> shirt2` was already the dark step, and a
second dark one would have left the sports top's LIGHT panel with nowhere to go but a dark
token, rendering it backwards.

⚠⚠ THE BODY TONE IS THE ONE THAT OWNS THE DOME'S OUTER RIM. Three rules were tried and two
are wrong:

  closest to the base's blue   the generator designs in its OWN hue — these came back green,
                               olive and teal, and none of them matches
  the largest area             the sports top's biggest area is its LIGHT PANEL at 39% against
                               a 22% body, so this inverts the garment
  a probe point                landed inside the knitwear's fair-isle band, which crosses the
                               whole chest, and inverted that one instead

  the outer rim                the SHADOW PANEL is large and owns the whole right rim, so it
                               wins the vote and inverts the garment again

⚠⚠ AND ALL THREE SHARE ONE BLIND SPOT: THE JIGSAW. The vectorizer lays ONE tone down as the
whole dome and butts every other shape on top of it, and which tone it picks is arbitrary — on
the knitwear it chose the DARK one, so the dark has 547k of area against the body's 318k and
wins any vote taken on raw geometry. Worse, emitting that dark blob as the detail layer paints
it back over the whole garment.

So every path is first reduced to what is actually VISIBLE — painter's algorithm, each shape
minus everything drawn after it. Then the body is whichever visible tone owns the outer rim of
the LEFT half: collars, plackets and pockets sit inboard, and the prompt pins the shadow panel
to the right.

⚠ THE GARMENT IS ALSO CUT BY THE HEAD, for the same reason the body layers are: the body slot
is painted AFTER the head, so anything a garment puts above the shoulder would land on the jaw.
⚠⚠ On today's art this removes 89.5u² — 0.015% of the hoodie, pure anti-aliasing — because the
tracer only ever sees VISIBLE pixels and the hood was generated BEHIND the head, so its blue
path already stopped at the head's edge. The subtraction is insurance against a generation that
draws the hood in front, not something the current art needs. ⚠ The head is identical in all
four bases, so one subtraction serves them all.

⭐⭐ AND IT IS CLIPPED TO THE BODY. The dome is the body's silhouette, so a garment can no more
be WIDER than it than narrower — an overhang renders as a sleeve floating in the background. The
brief says so and the generator does not always listen: the ribbed track top came back 48 units
wide of the dome on each side even after the clause was hardened. Clipping makes it structural
instead of hopeful.

⚠ Everything ABOVE the shirt's top edge is exempt, because that is where a collar or a hood
legitimately rises — the hoodie reaches y1459 against a shirt that starts at y1519.

⚠ The garment is NOT cut by the neck. It stays SOLID and the per-base neck is painted on top of
it by compose — that is what gives the right collar on all four bases from one asset. See
build-body-layers.py.

⭐⭐ A LOWER NECKLINE HAS TO BRING ITS OWN CHEST. Ryan, 2026-09-22: "The crew and v neck doesn't
show any more skin." The reason is not the art: THE NECK IS ALREADY PAINTED OVER THE SHIRT all
the way to its bottom at y1763, by front-neck-<N>. So every garment already shows the whole
neck, and cutting the neckline lower cannot reveal any more of it — there is nothing below.

The avatar is a bust with no chest. So a garment that opens below the neck carries the skin it
exposes, as a BASE_SKIN path of its own: `traced skin MINUS the base-100 neck`, which is exactly
the part the generation invented. Compose paints it after the garment and before the per-base
neck, and `--skin` recolours it like any other skin.
"""
import re
import sys
from pathlib import Path

from shapely.geometry import Polygon, box
from shapely.ops import unary_union

# ⭐ The body band — a SANITY gate, not the boundary. The boundary is the clip below (the dome,
# plus anything above the shoulder line); this only rejects ink that is not garment at all, such
# as hair a generation was not asked for.
#
# ⚠⚠ IT IS A MAJORITY TEST, NEVER CONTAINMENT. `REGION.contains(bbox)` DROPS an oversized path
# when the whole point is to TRIM it: the ribbed track top's entire right-hand body reached
# x1801 against a region ending at x1760, so 41 units of overhang cost the garment half its
# body and it came out 270k against a 530k shirt — a garment with a hole where the shoulder is,
# because the base shirt underneath is lifted out when a garment is chosen. Containment and
# clipping cannot both be the boundary; the clip is the one that can be right.
REGION = box(120, 1000, 1930, 2060)
REGION_SHARE = 0.5

NECKS = ("085", "100", "125", "140")
BASE_SHIRT = (30, 118, 214)
SHIRT_TOK = "rgb(30,118,214)"
SHADE_TOK = "rgb(50,118,183)"
LIGHT_TOK = "rgb(96,170,240)"
SKIN_TOK = "rgb(254,205,180)"
SEAM_BURY = 6.0
COLLAR_MARGIN = 60.0    # how far past the neck a collar may stand
CHEST_FLOOR = 2000.0    # below this, an "opening" is trace noise, not a neckline
RIM_BAND = 40.0
SHIRT_TOP = 1519.0      # above this a collar or hood may rise past the dome
# ⚠ Slack, not zero: the trace's edge and the base's edge are two different curves fitted to
# the same line, so they disagree by a hair all the way round. 1.0u of buffer plus this absorbs
# that; a real gap is orders of magnitude bigger (the track top's was 260k).
COVER_SLACK = 2500.0
argv = sys.argv
VERBOSE = "-v" in sys.argv
SKIN = (254, 205, 180)
SHADE = (245, 178, 150)      # the neck shadow, which is skin as far as a garment is concerned

HEAD = ('<svg version="1.1" xmlns="http://www.w3.org/2000/svg" '
        'viewBox="0 0 2048 2048" width="1024" height="1024">')


def flatten(d: str, n: int = 48):
    toks = re.findall(r"[MLCZz]|-?\d+\.?\d*", d)
    i, cur, rings, ring = 0, None, [], []
    while i < len(toks):
        t = toks[i]
        if t == "M":
            if len(ring) > 2:
                rings.append(ring)
            cur = (float(toks[i + 1]), float(toks[i + 2])); ring = [cur]; i += 3
        elif t == "L":
            cur = (float(toks[i + 1]), float(toks[i + 2])); ring.append(cur); i += 3
        elif t == "C":
            p1 = (float(toks[i + 1]), float(toks[i + 2]))
            p2 = (float(toks[i + 3]), float(toks[i + 4]))
            p3 = (float(toks[i + 5]), float(toks[i + 6]))
            for k in range(1, n + 1):
                u = k / n
                a, b, c, e = (1 - u) ** 3, 3 * (1 - u) ** 2 * u, 3 * (1 - u) * u ** 2, u ** 3
                ring.append((a * cur[0] + b * p1[0] + c * p2[0] + e * p3[0],
                             a * cur[1] + b * p1[1] + c * p2[1] + e * p3[1]))
            cur = p3; i += 7
        else:
            i += 1
    if len(ring) > 2:
        rings.append(ring)
    polys = [Polygon(r).buffer(0) for r in rings if len(r) > 2]
    return unary_union(polys) if polys else None


def to_d(geom, nd: int = 1) -> str:
    def ring(coords):
        pts = list(coords)
        out = f"M {round(pts[0][0], nd)} {round(pts[0][1], nd)}"
        for x, y in pts[1:-1]:
            out += f" L {round(x, nd)} {round(y, nd)}"
        return out + " z"
    gs = [geom] if geom.geom_type == "Polygon" else list(geom.geoms)
    return " ".join(ring(g.exterior.coords) + "".join(" " + ring(h.coords) for h in g.interiors)
                    for g in gs)


def d_of_path(p: str) -> str:
    return re.search(r'd="([^"]*)"', p).group(1)


def close(a, b, tol: int = 20) -> bool:
    return all(abs(x - y) <= tol for x, y in zip(a, b))


def lum(c) -> float:
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def clean(g, floor: float = 250):
    if g.is_empty:
        return g
    parts = [g] if g.geom_type == "Polygon" else [x for x in g.geoms if x.area > floor]
    return unary_union(parts) if parts else g.__class__()


def main() -> None:
    src, dst = sys.argv[1], sys.argv[2]

    here = Path(__file__).parent
    base = (here / "bases/base-neck-100.svg").read_text()
    head = None
    for p in re.findall(r"<path[^>]*/?>", base):
        if f'fill="rgb({SKIN[0]},{SKIN[1]},{SKIN[2]})"' not in p:
            continue
        d = re.search(r'd="([^"]*)"', p).group(1)
        xs = [float(x) for x in re.findall(r"-?\d+\.?\d*", d)][0::2]
        if max(xs) - min(xs) > 900:
            head = flatten(d)
    if head is None:
        sys.exit("could not find the head in base-neck-100.svg")

    # ⭐ Every base's neck, and only their UNION is ever used. The trace was generated against
    # base-100, so base-100's neck is the one the art is shaped around — and that is exactly why
    # it is the wrong thing to cut against: a garment shaped to base-100 has a base-100-shaped
    # hole, and the other three bases show it. The widest neck is the only one that is safe on
    # all four, both as the fill below and as the cut for the chest.
    necks = {}
    for k in NECKS:
        for p in re.findall(r"<path[^>]*/?>", (here / f"bases/base-neck-{k}.svg").read_text()):
            if f'fill="rgb({SKIN[0]},{SKIN[1]},{SKIN[2]})"' not in p:
                continue
            d = re.search(r'd="([^"]*)"', p).group(1)
            v = [float(x) for x in re.findall(r"-?\d+\.?\d*", d)]
            xs, ys = v[0::2], v[1::2]
            if max(xs) - min(xs) < 900 and min(ys) > 1200:
                necks[k] = flatten(d)
        if k not in necks:
            sys.exit(f"could not find the neck in base-neck-{k}.svg")
    neck_any = unary_union(list(necks.values())).buffer(0)

    # every garment-coloured path in the body band, kept with its colour
    cand = []
    for p in re.findall(r"<path[^>]*/?>", Path(src).read_text()):
        f = re.search(r'fill="rgb\((\d+),\s*(\d+),\s*(\d+)\)"', p)
        if not f:
            continue
        c = tuple(int(x) for x in f.groups())
        if close(c, SKIN, 26) or close(c, SHADE, 26) or min(c) > 240:
            continue                                 # skin, its shade, or the background
        g = flatten(re.search(r'd="([^"]*)"', p).group(1))
        if g is None or g.is_empty:
            continue
        if g.intersection(REGION).area < REGION_SHARE * g.area:
            continue
        cand.append((c, g))

    if not cand:
        sys.exit(f"{src}: no garment found in the body band — check the trace")

    silhouette = unary_union([g for _, g in cand]).buffer(0)

    # ⭐⭐ PAINTER'S ALGORITHM FIRST. Each shape minus everything drawn after it, so what is
    # measured and emitted is what is actually seen — not the tracer's arbitrary base blob.
    vis = []
    for i, (c, g) in enumerate(cand):
        later = [h for _, h in cand[i + 1:]]
        v = g.difference(unary_union(later).buffer(0)).buffer(0) if later else g
        if not v.is_empty:
            vis.append((c, v))

    rim = (silhouette.difference(silhouette.buffer(-RIM_BAND))
           .intersection(box(0, 0, 1024, 2048)).buffer(0))
    tally: dict = {}
    for c, v in vis:
        tally[c] = tally.get(c, 0.0) + v.intersection(rim).area
    body_c = max(tally, key=tally.get) if tally else max(vis, key=lambda t: t[1].area)[0]
    # ⭐⭐ AND IT CAN BE OVERRULED, because after five rules this is not a geometry question.
    # Which tone is "the body" is a fact about the DESIGN, not about the shapes: closest-to-blue,
    # largest-area, a probe point, the outer rim and the rim-minus-the-crop have each been right
    # on some of the art and wrong on the rest. The cable knit is the case that settles it — its
    # light cables run the full height and reach the outline, so on every measure that looks at
    # edges they ARE the ground, and no refinement of the measure will say otherwise.
    #
    # So the vote stays as the default (it is right on five of the six) and `--body R,G,B` states
    # the answer when it is not. ⚠ The override is recorded in PROMPT.md with the build command:
    # a guess that is reviewed and written down beats a guess that is inferred and trusted.
    if "--body" in argv:
        want = tuple(int(x) for x in argv[argv.index("--body") + 1].split(","))
        match = [c for c, _ in vis if close(c, want, 6)]
        if not match:
            sys.exit(f"{src}: --body {want} matches no traced tone. Present: "
                     + ", ".join(f"rgb{c}" for c, _ in vis))
        body_c = match[0]
    if VERBOSE:
        for c, a in sorted(tally.items(), key=lambda kv: -kv[1]):
            print(f"      rgb{str(c):<18} visible left rim {a:8.0f}"
                  + ("   <- body" if c == body_c else ""))

    main_g, dark, light = [], [], []
    for c, v in vis:
        if close(c, body_c):
            main_g.append(v)
        else:
            (light if lum(c) > lum(body_c) else dark).append(v)
    skin = []

    # the skin the garment invents below the neckline — everything the trace paints in skin
    # inside the body band, minus what the body already provides
    for p in re.findall(r"<path[^>]*/?>", Path(src).read_text()):
        f = re.search(r'fill="rgb\((\d+),\s*(\d+),\s*(\d+)\)"', p)
        if not f or not close(tuple(int(x) for x in f.groups()), SKIN):
            continue
        d = re.search(r'd="([^"]*)"', p).group(1)
        v = [float(x) for x in re.findall(r"-?\d+\.?\d*", d)]
        xs, ys = v[0::2], v[1::2]
        if max(ys) < 1400 or min(ys) < 1300:        # the head, not a neckline
            continue
        g = flatten(d)
        if g is not None and not g.is_empty:
            skin.append(g)

    if not main_g:
        sys.exit(f"{src}: no garment body found — check the trace")

    # The garment's whole silhouette: the body plus every detail laid on it. Solid, because the
    # per-base neck is what cuts the collar.
    # ⭐ clip to the body: the dome below the shoulder line, anything at all above it
    dome = unary_union([flatten(d_of_path(p)) for p in re.findall(r"<path[^>]*/?>", base)
                        if 'fill="rgb(30,118,214)"' in p or 'fill="rgb(50,118,183)"' in p]).buffer(0)
    # ⚠⚠ ABOVE THE SHOULDER, ONLY A COLLAR. `box(0, 0, 2048, SHIRT_TOP)` let a garment paint
    # ANYWHERE above the shoulder line, which is almost all background: the quilted jacket put a
    # 10,794u² band across x625..1423 at y1455, and beside a neck that is 780..1268 at its widest
    # that rendered as two sharp blue WINGS poking out from under the jaw on every base. What may
    # legitimately rise past the shoulder is a collar, and a collar hugs the neck — so that is
    # what the allowance says.
    # ⚠ A HOOD would not fit this envelope. There is no hooded garment in the set; when one comes
    # back, widen it to the head rather than to the canvas.
    collar = neck_any.buffer(COLLAR_MARGIN).intersection(box(0, 0, 2048, SHIRT_TOP)).buffer(0)
    allowed = unary_union([dome, collar]).buffer(0)
    over = silhouette.difference(allowed).area
    silhouette = silhouette.intersection(allowed).buffer(0)

    # ⭐⭐ SOLID UNDER THE NECK, and this is what makes one asset serve four bases. The trace was
    # generated against base-100, so it paints SKIN in base-100's neck column and the garment
    # comes back with a neck-shaped hole. base-085's neck is 26 units narrower on each side, so
    # that hole is 26 units of BACKGROUND beside the neck — the base's own shirt used to fill it
    # and a garment lifts that shirt out.
    #
    # ⚠ Filling to the WIDEST neck is safe on every base, because whatever the neck does not
    # cover, the chest patch does: compose paints body → chest → details → per-base neck, so this
    # fill is under all three. On a narrow base a low neckline correctly shows MORE garment
    # beside the neck, not more skin.
    fill = neck_any.intersection(dome).buffer(0)
    whole = clean(unary_union([silhouette, fill]).difference(head).buffer(0))

    # ⭐⭐ AND A COLLAR IS PART OF THE GARMENT. Clipping to a collar envelope bounds WHERE a
    # fragment may sit but not WHETHER it belongs: the quilted jacket left two small blue tabs
    # hanging in the gap between the jaw and the shoulder, inside the envelope, touching nothing.
    # They read as a rendering bug, which is what they were. Anything above the shoulder that is
    # not CONTIGUOUS WITH THE BODY is an artefact of the cut, so only the pieces that reach the
    # dome survive — a real collar rises out of the garment and always does.
    parts = [whole] if whole.geom_type == "Polygon" else list(whole.geoms)
    joined = [q for q in parts if q.intersects(dome.buffer(1.0))]
    adrift = sum(q.area for q in parts) - sum(q.area for q in joined)
    if not joined:
        sys.exit(f"{src}: nothing in the garment reaches the body — check the trace")
    whole = unary_union(joined).buffer(0)
    # ⚠⚠ A DETAIL IS PAINT ON THE GARMENT, so it is clipped to the body — not merely cut by the
    # head. These two lines used to subtract the head alone, which let the clip apply to the
    # silhouette and to nothing else: the ribbed track top's stripes carried on out to x1800,
    # 94 units past the widest the shoulder ever gets, and rendered as bars floating in the
    # background beside the avatar. Clipping to `whole` makes it impossible by construction.
    shade = clean(unary_union(dark).buffer(0).intersection(whole).buffer(0)) if dark else None
    panel = clean(unary_union(light).buffer(0).intersection(whole).buffer(0)) if light else None
    # ⚠⚠ THE SEAM IS BURIED, NOT BUTTED. Subtracting the neck exactly leaves the chest's top
    # edge coincident with the neck compose paints on top of it — two anti-aliased edges on one
    # line cover ~75% between them, and the garment BLUE leaks through as a dashed hairline
    # across the opening. Visible at 4x on the v-neck. Shrinking the neck first pushes the seam
    # SEAM_BURY units inside the neck's solid interior, where nothing can show through it.
    # Same cure as the beard bands: overlap hidden geometry, never butt edges.
    # ⚠⚠ CUT AGAINST THE WIDEST NECK, NOT THE ONE IT WAS TRACED AGAINST. The trace sees
    # base-100's neck, so a chest cut to base-100 sticks out past base-085's narrower one and
    # renders as a pale RING of skin around the neck — the same mistake as the neck-shaped hole,
    # one layer further on. Cut to the widest and the band beside any neck is garment, which the
    # fill above guarantees is solid. What is left is the opening the design actually invented.
    chest = (clean(unary_union(skin).buffer(0)
                   .difference(neck_any.buffer(-SEAM_BURY)).buffer(0), floor=600)
             if skin else None)
    # ⚠ `clean`'s floor drops small PARTS but never a small whole, and what survives the cut
    # above is a ~500u² sliver along the bottom of the neck — the trace's edge and the base's
    # disagreeing by a hair. On a 530,000u² garment that is 0.09%, and it renders as a fleck of
    # skin on the chest. A real opening is two orders of magnitude bigger.
    if chest is not None and chest.area < CHEST_FLOOR:
        chest = None

    frags = [f'<path transform="translate(0,0)" fill="{SHIRT_TOK}" d="{to_d(whole.simplify(0.7))}"/>']
    # ⚠ the chest goes between the body and the details, so a collar rib still edges the opening
    if chest is not None and not chest.is_empty:
        frags.append(f'<path transform="translate(0,0)" fill="{SKIN_TOK}" '
                     f'd="{to_d(chest.simplify(0.7))}"/>')
    if panel is not None and not panel.is_empty:
        frags.append(f'<path transform="translate(0,0)" fill="{LIGHT_TOK}" '
                     f'd="{to_d(panel.simplify(0.7))}"/>')
    if shade is not None and not shade.is_empty:
        frags.append(f'<path transform="translate(0,0)" fill="{SHADE_TOK}" '
                     f'd="{to_d(shade.simplify(0.7))}"/>')
    # ⭐⭐ AND IT MUST COVER WHAT IT REPLACES. compose LIFTS the base's shirt out when a garment
    # is chosen, so the garment is the only thing between the viewer and the background. A
    # garment narrower than the dome does not read as a different cut — it reads as a HOLE, and
    # the four that came back undersized all looked like a bug rather than a design.
    #
    # ⚠ The skin a low neckline invents counts as cover: it is painted in the same slot, so a
    # v-neck legitimately leaves part of the dome to the chest patch rather than to the body.
    covered = unary_union([g for g in (whole, chest) if g is not None and not g.is_empty])
    bare = clean(dome.difference(head).difference(covered.buffer(1.0)).buffer(0), floor=400)
    if bare.area > COVER_SLACK:
        sys.exit(f"{src}: the garment leaves {bare.area:.0f}u² of the shirt uncovered "
                 f"(bounds {tuple(round(v) for v in bare.bounds)}). compose lifts the base shirt "
                 f"out, so that renders as background showing through. Regenerate the art — this "
                 f"is the brief's silhouette clause, and no clip can add geometry that is absent.")

    Path(dst).write_text(HEAD + "".join(frags) + "</svg>")
    print(f"  {Path(dst).name:<24} body {whole.area:8.0f}u²  "
          f"{'clipped ' + format(over, '.0f') + 'u²  ' if over > 50 else ''}"
          f"detail {(shade.area if shade is not None else 0):7.0f}u²  "
          f"light {(panel.area if panel is not None else 0):7.0f}u²  "
          f"chest {(chest.area if chest is not None else 0):6.0f}u²"
          + (f"  adrift {adrift:.0f}u²" if adrift > 50 else "")
          + (f"  bare {bare.area:.0f}u²" if bare.area > 50 else ""))


if __name__ == "__main__":
    main()
