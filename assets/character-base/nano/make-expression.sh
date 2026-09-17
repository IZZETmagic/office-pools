#!/bin/zsh
# Build one whole-face expression, end to end.
#
#   ./make-expression.sh <name> "<the feeling to express>"
#   ./make-expression.sh sad "SAD — crestfallen and downcast, a small downturned mouth."
#
# Generate -> Recraft trace -> extract -> second-pass texture recovery -> merge -> preview.
# One expression at a time, on purpose: every step below has failed silently at least once,
# so each one is checked before the next runs.
set -e
cd "${0:A:h}"

NAME="$1"; FEELING="$2"
[[ -z "$NAME" || -z "$FEELING" ]] && { echo "usage: make-expression.sh <name> \"<feeling>\""; exit 1; }

SKILL_DIR=/Users/ryansousa/.claude/plugins/cache/buildatscale-claude-code/nano-banana/4f1bf867bb62/skills/generate
R=../../../.claude/skills/recraft/scripts/recraft.sh
PNG="expressions/nano/$NAME.png"
ASSET="expressions/assets/$NAME.asset.svg"

echo "── 1. generate ─────────────────────────────────────────"
uv run "$SKILL_DIR/scripts/image.py" \
  --prompt "$(cat expressions/PROMPT.md)

THE FEELING TO EXPRESS IS: $FEELING" \
  --output "$PNG" --model pro --size 1K --aspect 1:1 \
  --reference bases/base-neck-100.png --reference bases/base-with-eyes.png >/dev/null 2>&1
[[ -f "$PNG" ]] || { echo "   FAILED — no image written"; exit 1; }
echo "   $PNG"

echo "── 2. trace (10 units) ─────────────────────────────────"
$R vectorize "$PNG" --out "/tmp/mx-$NAME" >/dev/null 2>&1
[[ -f "/tmp/mx-$NAME/vectorize-00.svg" ]] || { echo "   FAILED — no trace"; exit 1; }
echo "   /tmp/mx-$NAME/vectorize-00.svg"

echo "── 3. check the head did not move ──────────────────────"
# A feature that will not fit makes the model shift the NOSE rather than shrink the feature —
# the first laugh moved it 110px, the first afro shrank the skull 31%. Registration is by
# construction, so this breaks everything downstream and is invisible until you composite.
#
# ⚠ Checked on the TRACE, not the PNG. A pixel-space "topmost darker-skin pixel" test reads
# 430 on every generated image and 477 on the bare base, because the generated faces put
# something darker above the nose — it flags correct images and would have rejected the one
# known-good expression we have. The traced nose is an actual path with an actual bbox.
uv run --with pillow python - "/tmp/mx-$NAME/vectorize-00.svg" <<'PY2'
import re, sys
best = None
for m in re.finditer(r"<path[^>]*/?>", open(sys.argv[1]).read()):
    p = m.group(0)
    f = re.search(r'fill="rgb\((\d+),\s*(\d+),\s*(\d+)\)"', p)
    if not f:
        continue
    c = tuple(int(x) for x in f.groups())
    n = [float(x) for x in re.findall(r"-?\d+\.?\d*", re.search(r'd="([^"]*)"', p).group(1))]
    xs, ys = n[0::2], n[1::2]
    if (abs(c[0] - 245) < 16 and abs(c[1] - 176) < 18 and abs(c[2] - 148) < 20
            and max(xs) - min(xs) < 220 and 900 < (min(xs) + max(xs)) / 2 < 1150
            and 900 < min(ys) < 1100):
        best = min(ys)
if best is None:
    print("   nose path NOT FOUND — cannot verify registration"); sys.exit(1)
d = best - 954
print(f"   nose y{best:.0f}  drift {d:+.0f}px" + ("" if abs(d) <= 8 else "   <-- ⚠ THE FACE MOVED"))
sys.exit(1 if abs(d) > 8 else 0)
PY2

echo "── 4. extract ──────────────────────────────────────────"
# Guarded: an expression drawn entirely in skin tones traces to nothing, and without this
# the next step happily merges into a stale asset from a previous run.
uv run extract-feature.py "/tmp/mx-$NAME/vectorize-00.svg" bases/base-neck-100.svg expression "$ASSET"

echo "── 5. recover skin-toned detail ────────────────────────"
if uv run isolate-face-texture.py "$PNG" "/tmp/tex-$NAME.png" 2>/dev/null; then
  $R vectorize "/tmp/tex-$NAME.png" --out "/tmp/tx-$NAME" >/dev/null 2>&1
  uv run merge-texture.py "/tmp/tx-$NAME/vectorize-00.svg" "$PNG" "$ASSET"
else
  echo "   nothing low-contrast to recover"
fi

echo "── 6. preview ──────────────────────────────────────────"
prev(){ uv run compose.py bases/base-neck-100.svg "/tmp/pv-$NAME-$1.svg" --expression "$ASSET" ${=2} >/dev/null
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
          --hide-scrollbars --screenshot="/tmp/pv-$NAME-$1.png" --window-size=1024,1024 \
          "file:///tmp/pv-$NAME-$1.svg" >/dev/null 2>&1; }
# ⚠ ${=2} not $2 — zsh does NOT word-split an unquoted variable, so $2 passes every flag as
# a single argument and compose.py silently applies none of them. Cost an hour, three times.
prev bald  "--skin #F5C9A6 --shirt #3B6EFF"
prev hair  "--hair hair/assets/hair-m03-quiff.asset.svg --hair-colour #4A3B32 --skin #F5C9A6 --shirt #3B6EFF"
prev alt   "--hair hair/assets/hair-f04-longcurly.asset.svg --hair-colour #1A1110 --skin #8D5524 --eye-colour #2E6FD9 --shirt #C2410C"
echo "   /tmp/pv-$NAME-{bald,hair,alt}.png"
echo "── done ────────────────────────────────────────────────"
