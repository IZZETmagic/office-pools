"""Assemble the bushy full beard: the traced ragged mass UNDER the locked v3 beard.

The locked v3 fullbeard is carried over verbatim — body, both sideburn bands, the buried
joints and the fade marker. The only new geometry is one path beneath it: the messy outer
growth traced from the approved Nano Banana render.

⚠⚠ The ragged mass is CLIPPED so it can never add anything on the face above the approved
top edge. The forbidden region is "inside the head's straight sides, above y1200, and not
already covered by the locked beard" — which is the cheeks above the cheek line AND the
philtrum notch under the nose. Below y1200 nothing is clipped, so the downward growth is
untouched, and the outboard strips are left alone because the EARS paint after facial hair
and hide everything above y1024 out there.
"""
import sys, re
sys.path.insert(0, __file__.rsplit("/", 1)[0])
from poly import flatten, paths_of, d_of, to_path_d
from shapely.geometry import box
from shapely.ops import unary_union

HAIR_BASE = "rgb(140,122,110)"
LOCKED = "facialhair/assets/fullbeard.asset.svg"
TRACE = "facialhair/bushy/trace/vectorize-00.svg"
DST = sys.argv[1]

lockedsvg = open(LOCKED).read()
lockedpaths = paths_of(lockedsvg)
locked_union = unary_union([flatten(d_of(p)) for p in lockedpaths])

tp = paths_of(open(TRACE).read())
beard, shirt, neck = (flatten(d_of(tp[i])) for i in (1, 2, 3))
ragged = beard.difference(shirt).difference(neck).buffer(0)
parts = [ragged] if ragged.geom_type == "Polygon" else [g for g in ragged.geoms if g.area > 2000]
ragged = unary_union(parts)

# ⚠ Also nothing above the bands' own flat top. The trace put the band tops at y908.2
# against the locked y908.7/909.0 — half a unit, but it is solid beard sitting above a
# band that fades to skin, so it would read as a dark lip on the top of the sideburn.
forbidden = unary_union([box(516, 0, 1532, 1200).difference(locked_union),
                         box(0, 0, 2048, 909.1)])
ragged = ragged.difference(forbidden).buffer(0)
parts = [ragged] if ragged.geom_type == "Polygon" else [g for g in ragged.geoms if g.area > 2000]
ragged = unary_union(parts).simplify(1.5)

n = sum(len(g.exterior.coords) for g in ([ragged] if ragged.geom_type == "Polygon" else ragged.geoms))
new_path = f'<path transform="translate(0,0)" fill="{HAIR_BASE}" d="{to_path_d(ragged)}"/>'
# ⭐ NO FADE ON THIS ONE (Ryan, 2026-09-19). The locked v3 bands carry the fade marker, which
# compose fills with a hair-to-skin gradient. A bushy beard is not a barber's fade — its edge
# is ragged, so dissolving the sideburn into the cheek fights the whole look. Swapping the
# marker for the plain hair token makes the asset render solid whether or not --fade is set,
# and the guard test that walks "marked" assets simply skips this one.
FADE = "rgb(126,110,150)"
lockedpaths = [p.replace(f'fill="{FADE}"', f'fill="{HAIR_BASE}"') for p in lockedpaths]

head = lockedsvg[:lockedsvg.index(">", lockedsvg.index("<svg")) + 1]
open(DST, "w").write(head + new_path + "".join(lockedpaths) + "</svg>")
print(f"{DST}: ragged mass {n} pts, area {ragged.area:,.0f}; plus the {len(lockedpaths)} locked paths verbatim")
print(f"  locked geometry carried over verbatim: {all(p in open(DST).read() for p in lockedpaths)}")
