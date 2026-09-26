# /// script
# requires-python = ">=3.11"
# dependencies = ["shapely"]
# ///
"""Merge a display-only fill into its locked hair asset, as a complete asset.

⚠⚠ THE FILL MUST HAVE THE HEAD AND EARS CUT OUT OF IT. It was built to be painted at the very
BOTTOM of the stack, under the base, so it never needed a face hole — the head simply covered
it. Merged into the hair it paints AFTER the head, so without the cut it lies over the face,
and the asset's own mask (which for `f02-ponytail` subtracts only the two ears) punches a hole
straight through it beside the right ear. That is the misalignment Ryan circled.
"""
import re, sys
from shapely.geometry import Polygon
from shapely.ops import unary_union

sys.path.insert(0, '/Users/ryansousa/Documents/GitHub/office-pools/assets/character-base/nano')
HERE = '/Users/ryansousa/Documents/GitHub/office-pools/assets/character-base/nano'

def flatten(d, n=48):
    toks = re.findall(r"[MLCZz]|-?\d+\.?\d*", d)
    i, cur, rings, ring = 0, None, [], []
    while i < len(toks):
        t = toks[i]
        if t == "M":
            if len(ring) > 2: rings.append(ring)
            cur = (float(toks[i+1]), float(toks[i+2])); ring = [cur]; i += 3
        elif t == "L":
            cur = (float(toks[i+1]), float(toks[i+2])); ring.append(cur); i += 3
        elif t == "C":
            p1=(float(toks[i+1]),float(toks[i+2])); p2=(float(toks[i+3]),float(toks[i+4])); p3=(float(toks[i+5]),float(toks[i+6]))
            for k in range(1, n+1):
                u=k/n; a,b,c,e=(1-u)**3,3*(1-u)**2*u,3*(1-u)*u**2,u**3
                ring.append((a*cur[0]+b*p1[0]+c*p2[0]+e*p3[0], a*cur[1]+b*p1[1]+c*p2[1]+e*p3[1]))
            cur = p3; i += 7
        else: i += 1
    if len(ring) > 2: rings.append(ring)
    ps = [Polygon(r).buffer(0) for r in rings if len(r) > 2]
    return unary_union(ps) if ps else None

def to_d(g, nd=1):
    def ring(cs):
        pts=list(cs); out=f"M {round(pts[0][0],nd)} {round(pts[0][1],nd)}"
        for x,y in pts[1:-1]: out += f" L {round(x,nd)} {round(y,nd)}"
        return out + " z"
    gs=[g] if g.geom_type=="Polygon" else list(g.geoms)
    return " ".join(ring(q.exterior.coords)+"".join(" "+ring(h.coords) for h in q.interiors) for q in gs)

# How far the fill is grown so it runs UNDER the locked hair instead of meeting it edge to edge.
# 4 units is just under two pixels on a 900px card — enough to cover an anti-aliased seam,
# small enough that nothing reaches past the hair it hides beneath.
BLEED = 4.0

style = sys.argv[1]
locked = open(f'{HERE}/hair/assets/hair-{style}.asset.svg').read()
fill = open(f'{HERE}/hair/behind/{style}.svg').read()
base = open(f'{HERE}/bases/base-neck-100.svg').read()

# the head and the two ears, from the base
face = []
for p in re.findall(r'<path[^>]*/?>', base):
    f = re.search(r'fill="([^"]*)"', p)
    v = [float(x) for x in re.findall(r'-?\d+\.?\d*', re.search(r' d="([^"]*)"', p).group(1))]
    xs, ys = v[0::2], v[1::2]
    w, cx = max(xs)-min(xs), (min(xs)+max(xs))/2
    if f.group(1) == 'rgb(254,205,180)' and w > 900:            # the head
        face.append(flatten(re.search(r' d="([^"]*)"', p).group(1)))
    elif f.group(1) == 'rgb(245,178,150)' and (cx < 600 or cx > 1448):   # the ears
        face.append(flatten(re.search(r' d="([^"]*)"', p).group(1)))
cut = unary_union(face).buffer(0)

out = []
for p in re.findall(r'<path[^>]*/?>', fill):
    tok = re.search(r'fill="([^"]*)"', p).group(1)
    g = flatten(re.search(r' d="([^"]*)"', p).group(1))
    if g is None or g.is_empty: continue
    # ⚠⚠ BLEED FIRST, THEN CUT THE FACE. The fill and the locked hair are separate paths that
    # ABUT, and two anti-aliased edges on one line leak a light hairline — the display-only
    # version hid it behind a stroke of width 8, which a hair asset may not carry (the guard
    # holds every hair path at 1.2). So the overlap goes into the GEOMETRY: grow the fill so it
    # runs under the hair, and only then subtract the head and ears, or the bleed creeps over
    # the face.
    g = g.buffer(BLEED).difference(cut).buffer(0).simplify(0.6)
    if g.geom_type == "MultiPolygon":
        g = unary_union([q for q in g.geoms if q.area > 400])
    if g.is_empty: continue
    out.append(f'<path transform="translate(0,0)" fill="{tok}" stroke="{tok}" '
               f'stroke-width="1.2" d="{to_d(g)}"/>')

# ⚠⚠ INSIDE the masked group, or AFTER it? The mask is what cuts the ears, so a fill placed
# after it would cover them — unless the ears have already been subtracted, which they have,
# a few lines up. And a mask that subtracts the BODY (f09-midwavy, m15-locs) would cut the
# fill's curls to ribbons if the fill sat inside it. So: after the group, always.
i = locked.rindex('</g>') + len('</g>')
open(sys.argv[2], 'w').write(locked[:i] + "".join(out) + locked[i:])
print(f'   merged {len(out)} fill paths, head and ears cut out')
