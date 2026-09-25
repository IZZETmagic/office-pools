"""Place an outside-art card screenshot into asset coordinates, fitted on the head.

⚠ The card mapping alone is not enough: an image model returns the head at its own size. This
measures the SKIN region's widest span and its bottom (the chin) and fits a uniform scale so
both land on the base's — head width 1032 and chin y1530 on base-neck-100.
"""
import sys, base64
sys.path.insert(0, '/private/tmp')
from png import read, px

SRC, OUT = sys.argv[1], sys.argv[2]
w, h, ch, bd, buf = read(SRC)
skin = lambda c: sum((a - b) ** 2 for a, b in zip(c, (245, 201, 166))) < 900
card = lambda c: sum((a - b) ** 2 for a, b in zip(c, (238, 241, 248))) < 900

# the card inside the screenshot
mid_r = ''.join('C' if card(px(w, h, ch, bd, buf, x, h // 2)[:3]) else '.' for x in range(w))
mid_c = ''.join('C' if card(px(w, h, ch, bd, buf, w // 2, y)[:3]) else '.' for y in range(h))
cx = [i for i, k in enumerate(mid_r) if k == 'C'] or [0, w - 1]
cy = [i for i, k in enumerate(mid_c) if k == 'C'] or [0, h - 1]
x0, y0 = cx[0], cy[0]
cw = max(cx[-1] - cx[0] + 1, cy[-1] - cy[0] + 1)
s0 = 2050.0 / cw
ix, iy, iw, ih = -5 - x0 * s0, -65 - y0 * s0, w * s0, h * s0

# the head, in the coordinates that placement produces
V = lambda py: iy + py * (ih / h)
U = lambda pxl: ix + pxl * (iw / w)
widest, chin = 0.0, None
lo, hi = None, None
for y in range(h):
    xs = [x for x in range(0, w, 2) if skin(px(w, h, ch, bd, buf, x, y)[:3])]
    if not xs:
        continue
    chin = V(y)
    span = U(max(xs)) - U(min(xs))
    if span > widest:
        widest, lo, hi = span, U(min(xs)), U(max(xs))
BW, BCX, BCHIN = float(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5])
s = BW / widest
tx = BCX - s * (lo + hi) / 2
ty = BCHIN - s * chin
open(OUT, 'w').write(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2048 2048" width="1024" height="1024">'
    '<rect width="2048" height="2048" fill="#EEF1F8"/>'
    f'<image href="data:image/png;base64,{base64.b64encode(open(SRC,"rb").read()).decode()}" '
    f'x="{s*ix+tx:.2f}" y="{s*iy+ty:.2f}" width="{s*iw:.2f}" height="{s*ih:.2f}"/></svg>')
print(f'   head was {widest:.0f} wide, chin y{chin:.0f} -> fitted scale {s:.4f}')
