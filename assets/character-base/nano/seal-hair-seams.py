#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Seal the hairline cracks in the traced hair assets.

    uv run seal-hair-seams.py [--check]

⭐ THE DEFECT. The tracer cuts every shape to exactly its visible region and BUTTS it against
its neighbour, so two same-colour shapes share an edge. Each anti-aliases against whatever is
behind, and 50% + 50% is 75%, not 100% — a one-pixel LIGHT line runs along the join. Measured
across the set: 17 of 27 styles, 1,613 crack pixels, worst m13-manbun at 377. Ryan called them
"hairline breaking points that make it look bad", 2026-09-20. Same defect the beard's sideburn
joint had; there it was cured by burying one edge inside the other.

⭐⭐ THE CURE HERE IS A STROKE, not geometry. Every path gets a hairline stroke of its OWN fill,
so each shape grows half a stroke-width in every direction and two butting shapes now OVERLAP
instead of meeting. Nothing is re-traced, no outline moves, and it costs a few hundred bytes an
asset — against 7-10KB for a backing shape, which also only removed three quarters of them.

⚠ 1.2, not more. It removes 92-98% of the cracks; the silhouette grows by 0.6 units, which is
0.3px at 1024 and invisible. Wider closes the last few and starts to fatten the art.

⚠⚠ THE STROKE CARRIES A TOKEN, so the compositors must recolour `stroke="..."` as well as
`fill="..."`. All three do; a guard test pins it. Without that a recoloured avatar would keep
grey-brown outlines.

⚠ Mask paths are left alone — they are fill="black" silhouettes, and stroking one would eat
into the face hole.
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).parent
TONES = ("rgb(140,122,110)", "rgb(114,97,86)", "rgb(168,150,138)")
WIDTH = "1.2"


def seal(svg: str) -> tuple[str, int]:
    n = 0

    def one(m: re.Match) -> str:
        nonlocal n
        p = m.group(0)
        if "stroke=" in p:
            return p
        f = re.search(r'fill="(rgb\([^)]*\))"', p)
        if not f or f.group(1) not in TONES:
            return p                      # the mask's black silhouettes, and anything off-palette
        n += 1
        return p[:-2].rstrip() + f' stroke="{f.group(1)}" stroke-width="{WIDTH}"/>'

    return re.sub(r"<path[^>]*/>", one, svg), n


def main() -> None:
    check = "--check" in sys.argv
    bad, done = [], 0
    for f in sorted(HERE.glob("hair/assets/*.asset.svg")):
        src = f.read_text()
        out, n = seal(src)
        if check:
            if out != src:
                bad.append(f"{f.name}: {n} path(s) without a stroke")
            continue
        if out != src:
            f.chmod(0o644)
            f.write_text(out)
            f.chmod(0o444)
            done += 1
            print(f"  {f.name}: sealed {n} paths, {len(out) - len(src):+,} bytes")
    if check:
        print("\n".join(bad) if bad else "every hair path already carries its stroke")
        sys.exit(1 if bad else 0)
    print(f"sealed {done} assets")


if __name__ == "__main__":
    main()
