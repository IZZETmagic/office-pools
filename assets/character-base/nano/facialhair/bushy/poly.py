import re
from shapely.geometry import Polygon
from shapely.ops import unary_union

def flatten(d, n=14):
    toks = re.findall(r"[MLCZz]|-?\d+\.?\d*", d)
    i = 0; cur = None; rings = []; ring = []
    while i < len(toks):
        t = toks[i]
        if t == "M":
            if len(ring) > 2: rings.append(ring)
            cur = (float(toks[i+1]), float(toks[i+2])); ring = [cur]; i += 3
        elif t == "L":
            cur = (float(toks[i+1]), float(toks[i+2])); ring.append(cur); i += 3
        elif t == "C":
            p1 = (float(toks[i+1]), float(toks[i+2])); p2 = (float(toks[i+3]), float(toks[i+4])); p3 = (float(toks[i+5]), float(toks[i+6]))
            for k in range(1, n+1):
                u = k/n; a, b, c, e = (1-u)**3, 3*(1-u)**2*u, 3*(1-u)*u**2, u**3
                ring.append((a*cur[0]+b*p1[0]+c*p2[0]+e*p3[0], a*cur[1]+b*p1[1]+c*p2[1]+e*p3[1]))
            cur = p3; i += 7
        else: i += 1
    if len(ring) > 2: rings.append(ring)
    polys = [Polygon(r).buffer(0) for r in rings if len(r) > 2]
    return unary_union(polys) if polys else None

def paths_of(svg):
    return re.findall(r"<path[^>]*/?>", svg)

def d_of(p): return re.search(r'd="([^"]*)"', p).group(1)

def to_path_d(geom, nd=1):
    def ring(coords):
        pts = list(coords)
        out = f"M {round(pts[0][0],nd)} {round(pts[0][1],nd)}"
        for x, y in pts[1:-1]:
            out += f" L {round(x,nd)} {round(y,nd)}"
        return out + " z"
    geoms = [geom] if geom.geom_type == "Polygon" else list(geom.geoms)
    return " ".join(ring(g.exterior.coords) + "".join(" " + ring(h.coords) for h in g.interiors) for g in geoms)
