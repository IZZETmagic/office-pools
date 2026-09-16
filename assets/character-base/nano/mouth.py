#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Draw a closed-lip mouth asset directly, as geometry.

    uv run mouth.py --curve 0   --out mouths/assets/mouth-01-neutral.asset.svg
    uv run mouth.py --curve 26  --out mouths/assets/mouth-02-smile.asset.svg
    uv run mouth.py --curve -22 --out mouths/assets/mouth-04-frown.asset.svg

Why this is not a generation
---------------------------
A closed-lip mouth is one stroke. There is nothing for a generator to invent, and asking
for one costs a Nano Banana call, a 10-unit Recraft trace, an extraction, and it still
lands wherever the model feels like putting it. The eye round proved the model will not
take direction on a dimension: asking for eye height ratios of 1.3 / 1.45 / 1.6 returned
1.66 / 1.57 / 1.60. Here width, thickness, position and curvature are exact and free.

This is NOT a hand-edit of generated art. That rule exists because traced art has opaque
structure — shapes that look like a background can be a mask painted over the skin. A
primitive authored from scratch has no hidden structure to break.

⭐ It also collapses three planned assets into one parameter. Neutral, smile and frown are
the same stroke at curve 0, +26 and -22 — the same lesson as gaze in `gaze.py`. Only mouths
that OPEN (teeth, tongue, an O) need generating, because those have interior structure.

Geometry
--------
The centreline is a quadratic Bezier; the outline is that curve offset along its true
normals, closed with semicircular caps. Emitted as M/L only, so every number in the path is
one half of an x,y pair — `gaze.py`, `extract-feature.py` and the guard test all parse path
data that way, and an `A` arc command (7 params, not 2) would silently corrupt every box
they compute.

No transform attribute: `react-native-svg` drops them. Coordinates are baked, exactly as
`neck-width.py` and `gaze.py` do.

Units: arguments are in 1024-space to match `landmarks.json`; output is viewBox units (2x).
"""
import math
import sys

MOUTH_INK = "rgb(182,122,112)"   # sampled from the approved line weight, C-lightest.png
SVG_OPEN = ('<svg version="1.1" xmlns="http://www.w3.org/2000/svg" '
            'viewBox="0 0 2048 2048" width="1024" height="1024">')

# Defaults measured off the locked base and the approved reference:
#   width 186 and thickness 17 are C-lightest's own line;
#   y 634 sits where landmarks.json puts the mouth (centre 637) and at the same fraction
#   between nose-bottom and chin that the reference used (0.34 of a 194px band).
DEFAULTS = dict(cx=512.0, y=634.0, width=186.0, thickness=17.0, curve=0.0, tilt=0.0, wave=0.0, waves=2.0,
                lift=0.0, bend=0.6, side=1.0, shift=0.0)

SAMPLES = 96      # along the centreline; a wavy mouth needs more than a plain arc
CAP = 16          # points per semicircular cap


def arg(name: str, default: float) -> float:
    return float(sys.argv[sys.argv.index(name) + 1]) if name in sys.argv else default


def make_centreline(p0, p2, ctrl_y, wave, waves, lift=0.0, bend=0.6, side=1.0):
    """The mouth's centreline as one parametric CUBIC, t in 0..1.

    Cubic rather than quadratic because of the smirk. A smirk is not a tilted straight line
    — that only pivots the whole mouth and reads as a lopsided face. It is ASYMMETRIC
    curvature: flat along one side, rounding up into a half smile at the other. Symmetric
    curvature cannot express that, and a tilt cannot either; the bend has to be concentrated
    at one end, which needs two independent control points.

    With lift=0 this reduces EXACTLY to the old quadratic — a quadratic Q is the cubic with
    C1 = P0 + 2/3(Q-P0) and C2 = P3 + 2/3(Q-P3) — so neutral, smile and frown are untouched.

    y also carries an optional sine, which is what makes the wavy mouth possible: a single
    arc can only bend one way.
    """
    x0, x1 = p0[0], p2[0]
    w = x1 - x0
    if lift:
        a = (x0, p0[1])
        d = (x1, p2[1] - lift)
        b = (x0 + w * bend, p0[1])              # holds the flat side flat
        c = (x1 - w * 0.10, p2[1] - lift * 0.55)   # turns up close to the corner
    else:
        a, d = p0, p2
        b = (x0 + (((x0 + x1) / 2) - x0) * 2 / 3, p0[1] + (ctrl_y - p0[1]) * 2 / 3)
        c = (x1 + (((x0 + x1) / 2) - x1) * 2 / 3, p2[1] + (ctrl_y - p2[1]) * 2 / 3)

    def at(t: float):
        u = 1 - t
        px = (u ** 3 * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t ** 3 * d[0])
        py = (u ** 3 * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t ** 3 * d[1])
        if wave:
            py += wave * math.sin(2 * math.pi * waves * t)
        if side < 0:                            # mirror the curved side to the left
            px = (x0 + x1) - px
        return (px, py)
    return at


def deriv(at, t: float, h: float = 1e-4):
    """Central difference. The centreline is analytic outside 0..1 too, so the endpoints
    need no special case."""
    a, b = at(t - h), at(t + h)
    return ((b[0] - a[0]) / (2 * h), (b[1] - a[1]) / (2 * h))


def main() -> None:
    cx = arg("--cx", DEFAULTS["cx"])
    y = arg("--y", DEFAULTS["y"])
    w = arg("--width", DEFAULTS["width"])
    th = arg("--thickness", DEFAULTS["thickness"])
    # +curve = corners UP and the middle low on screen, i.e. a smile. Screen y grows
    # downward, so a smile's midpoint has the LARGER y.
    curve = arg("--curve", DEFAULTS["curve"])
    tilt = arg("--tilt", DEFAULTS["tilt"])      # right end higher than left, for a smirk
    wave = arg("--wave", DEFAULTS["wave"])      # sine amplitude, for a nervous squiggle
    waves = arg("--waves", DEFAULTS["waves"])
    lift = arg("--lift", DEFAULTS["lift"])      # smirk: how far the curling corner rises
    bend = arg("--bend", DEFAULTS["bend"])      # smirk: how much of the mouth stays flat
    side = arg("--side", DEFAULTS["side"])      # smirk: +1 curls right, -1 curls left
    # A smirk also sits OFF CENTRE, pulled toward the side that curls.
    shift = arg("--shift", DEFAULTS["shift"]) * (1 if side >= 0 else -1)
    dst = sys.argv[sys.argv.index("--out") + 1]

    cx += shift
    p0 = (cx - w / 2, y + tilt / 2)
    p2 = (cx + w / 2, y - tilt / 2)
    # A quadratic sits at half its control offset at t=0.5, so double the sagitta.
    at = make_centreline(p0, p2, (p0[1] + p2[1]) / 2 + curve * 2, wave, waves, lift, bend, side)

    r = th / 2
    upper, lower = [], []
    for i in range(SAMPLES + 1):
        t = i / SAMPLES
        px, py = at(t)
        dx, dy = deriv(at, t)
        n = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / n, dx / n              # unit normal
        upper.append((px + nx * r, py + ny * r))
        lower.append((px - nx * r, py - ny * r))

    def cap(centre, frm, to, outward):
        """Semicircle from `frm` to `to` that bulges along `outward`.

        The direction has to be chosen explicitly. At a cap the two offset points are
        exactly pi apart, so "take the shorter sweep" is degenerate — it picked the sign
        arbitrarily and half the time arced back THROUGH the ribbon, which showed up as a
        notch bitten out of each end of the mouth.
        """
        a0 = math.atan2(frm[1] - centre[1], frm[0] - centre[0])
        a1 = math.atan2(to[1] - centre[1], to[0] - centre[0])
        target = math.atan2(outward[1], outward[0])
        sweep = (a1 - a0) % (2 * math.pi)                     # the positive way round
        if abs((a0 + sweep / 2 - target + math.pi) % (2 * math.pi) - math.pi) > math.pi / 2:
            sweep -= 2 * math.pi                              # midpoint fell inward; go the other way
        return [(centre[0] + r * math.cos(a0 + sweep * k / CAP),
                 centre[1] + r * math.sin(a0 + sweep * k / CAP))
                for k in range(1, CAP)]

    end, start = at(1), at(0)
    t_end, t_start = deriv(at, 1), deriv(at, 0)
    ring = (upper
            + cap(end, upper[-1], lower[-1], t_end)            # bulges forward, past the curve
            + lower[::-1]
            + cap(start, lower[0], upper[0], (-t_start[0], -t_start[1])))   # and backward

    d = "M " + " L ".join(f"{px * 2:.2f} {py * 2:.2f}" for px, py in ring) + " Z"
    open(dst, "w").write(
        f'{SVG_OPEN}<path d="{d}" fill="{MOUTH_INK}"/></svg>')

    xs = [px * 2 for px, _ in ring]
    ys = [py * 2 for _, py in ring]
    print(f"{dst}: 1 path  x{min(xs):.0f}-{max(xs):.0f} y{min(ys):.0f}-{max(ys):.0f}  "
          f"(1024-space w{w:.0f} th{th:.0f} curve{curve:+.0f})")


if __name__ == "__main__":
    main()
