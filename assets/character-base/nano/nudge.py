#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Shift an asset vertically, baking the offset into its coordinates.

    uv run nudge.py in.asset.svg -40 out.asset.svg      # negative = up

Placement is a parameter, not artwork — the same operation gaze.py performs on an iris and
extract-feature.py performs on a brow pair. The drawn shape is untouched; only where it sits
changes. No transform attribute: react-native-svg silently drops those.
"""
import re
import sys

src, dy, dst = sys.argv[1], float(sys.argv[2]), sys.argv[3]
svg = open(src).read()
out = svg
for m in re.finditer(r'd="([^"]*)"', svg):
    d = m.group(1)
    toks, buf, acc = re.findall(r"[A-Za-z]|-?\d+\.?\d*", d), [], []
    for t in toks:
        if re.match(r"[A-Za-z]", t):
            acc.append(t)
            continue
        buf.append(float(t))
        if len(buf) == 2:
            acc += [f"{buf[0]:.2f}", f"{buf[1] + dy:.2f}"]
            buf = []
    out = out.replace(f'd="{d}"', 'd="' + " ".join(acc) + '"', 1)
open(dst, "w").write(out)
print(f"{dst}: shifted {dy:+.0f}")
