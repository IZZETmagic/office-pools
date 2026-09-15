# Locked avatar bases

**These four files are frozen. Do not regenerate, redraw, retrace, restyle, resize or "fix" them.**
Ryan locked them on 2026-09-15. They change only when he asks for a change, by name, explicitly.

This applies to any process that would rewrite them — a nicer trace, a corrected proportion, a
tidier path order, a batch resize. If something downstream doesn't fit one of these bases, change
the downstream thing.

| file | neck width |
|---|---|
| `base-neck-085.svg` | ×0.85 |
| `base-neck-100.svg` | ×1.00 — the default |
| `base-neck-125.svg` | ×1.25 |
| `base-neck-140.svg` | ×1.40 |

Each has a matching 1024×1024 PNG rendered from it. The SVG is the source; the PNG is a render.
If they ever disagree, re-render the PNG — never hand-edit either.

## Verifying they are untouched

```sh
shasum -a 256 -c LOCKED.sha256
```

## What they are

A broad squircle head in one flat pale peach, a small soft wedge nose low on the face, two rounded
ear bumps, a neck with a rounded crescent shadow beneath the chin, and a royal blue shoulder dome.
No eyes, brows, mouth or hair — those are added per character.

Construction, which is why they are robust: an explicit paint order (background → shirt → neck →
neck shadow → head → nose → ears), and the neck's top edge extends 170 units up *behind* the head
so the head clips it along its own jaw curve. See `../neck-width.py` for the detail.

## Provenance

Generated with Nano Banana Pro from `../base-canonical.png`, vectorized via Recraft into
`../base-traced.svg` (9 paths), then restructured by `../neck-width.py`. `base-traced.svg` is the
raw tracer output and is kept so the chain is reproducible — but reproducing it is not a licence to
replace these files.
