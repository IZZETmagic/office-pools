#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Remove the eyebrow paths from a whole-face expression asset.

    uv run strip-brows.py expressions/assets/f02-smug.asset.svg

Brows are the exception, not the default. Two reasons, both measured rather than aesthetic:

- Our hairlines sit low. A brow placed where brows anatomically belong is buried by 10 of 12
  hair assets, and in a whole-face asset it cannot be moved independently to dodge them.
- The 53-expression catalogue showed eyes and mouth alone carry almost every emotion. Only
  the anger family genuinely needed a brow, and even there the gritted mouth does much of it.

So an expression earns a brow by collapsing without one, and it has to be checked by looking.
"""
import re
import sys

BROW_INK = 'fill="rgb(101,70,52)"'

for path in sys.argv[1:]:
    svg = open(path).read()
    kept, dropped = [], 0
    for m in re.finditer(r"<path[^>]*/?>", svg):
        p = m.group(0)
        if BROW_INK in p:
            dropped += 1
            continue
        kept.append(p)
    head = svg[:svg.index(">", svg.index("<svg")) + 1]
    open(path, "w").write(head + "".join(kept) + "</svg>")
    print(f"  {path.split('/')[-1]:30} removed {dropped} brow paths, {len(kept)} remain")
