# Recraft styles

Source: <https://www.recraft.ai/docs/api-reference/styles> and `/models/recraft-v4-styles`,
read 2026-09-15.

There are **two style systems**, and they do not mix.

---

## 1. V4 Styles — custom styles from your own references

This is the current system and the reason to use Recraft over a general image model. You supply
1–10 reference images, get back a `style_id`, and every subsequent generation holds to them —
rendering technique, colour, texture, composition — not just the general impression.

- **No training or fine-tuning step.** Upload, receive the id, generate immediately.
- **References can come from anywhere.** Unlike most models, V4 Styles does not require that a
  reference was produced by the same model.
- **One reference is enough.** More changes the result predictably: *similar references sharpen
  the match, varied references widen the range.*
- **Style creation costs 5 units ($0.005)** and the id never expires.

```bash
scripts/recraft.sh style ref1.png ref2.png --model recraftv4_styles --match precise
# -> 745b584d-e451-49c3-94f3-38b8ab1af3bb
scripts/recraft.sh generate --prompt "..." --model recraftv4_styles_vector --style-id 745b58…
```

### Two ways to apply one

| | `style_id` | Inline style references |
|---|---|---|
| How | create once at `/styles`, pass the id | attach images to the generation |
| Billing | 5 units once, then generation only | 5 units **every** request, on top of generation |
| Best for | a style reused across a set — the normal case | a genuine one-off |

The response to an inline-reference generation returns the resolved `style_id`, so a "one-off"
can be promoted to a reusable style after the fact. Sending both forms in one request is rejected.

### Style match

Stored on the style at creation via `match`, overridable per-request via `style_match`:

- **`precise`** (V4 default) — follows the style meticulously: technique, colour, composition, lighting.
- **`flexible`** — matches the general vibe. Closer to how V3 styles behaved.
- **`regular`** — the only valid value for V2/V3 models.

Passing a value the resolved model does not support is rejected.

### A style is bound to its model

The style records the `model` passed at creation (defaulting to `recraftv4_styles`) and **must be
used with a matching model at generation time**. A style built for `recraftv4_styles` will not
apply to a V3 request. If you need both raster and vector output in one look, note that
`recraftv4_styles` and `recraftv4_styles_vector` are the same family — but verify rather than
assume, with a `probe`.

### Rejections

| Condition | Result |
|---|---|
| V4 Styles model with no `style_id` and no references | Rejected |
| `style_id` *and* references in one request | Rejected |
| More than 10 references, or over 64 MB total | Rejected |
| A reference that is not PNG / JPG / WEBP | Rejected |
| References with no `model` | **Accepted**, silently defaults to `recraftv4_styles` |

---

## 2. V2 / V3 curated styles — a fixed library, selected by name

Pass a name as the `style` parameter. These work **only** with V2/V3 models. If a name exists on
both, the API prefers V3 unless you pin `model` explicitly.

Defaults when neither `style` nor `style_id` is given: V3 → `Recraft V3 Raw`, V3 Vector →
`Vector art`, V2 → `Photorealism`, V2 Vector → `Vector art`.

**Recraft V3 — photorealistic (21):** `Photorealism`, `Enterprise`, `Natural light`, `Studio photo`,
`HDR`, `Hard flash`, `Motion blur`, `Black & white`, `Evening light`, `Faded Nostalgia`,
`Forest life`, `Mystic Naturalism`, `Natural Tones`, `Organic Calm`, `Real-Life Glow`,
`Retro Realism`, `Retro Snapshot`, `Urban Drama`, `Village Realism`, `Warm Folk`, `Product photo`

**Recraft V3 — illustration (39):** `Illustration`, `Hand-drawn`, `Grain`, `Bold Sketch`,
`Pencil sketch`, `Retro Pop`, `Clay`, `Risograph`, `Color engraving`, `Pixel art`, `Antiquarian`,
`Bold fantasy`, `Child book`, `Cover`, `Crosshatch`, `Digital engraving`, `Expressionism`,
`Freehand details`, `Grain 2.0`, `Graphic intensity`, `Hard Comics`, `Long shadow`, `Modern Folk`,
`Multicolor`, `Neon Calm`, `Noir`, `Nostalgic pastel`, `Outline details`, `Pastel gradient`,
`Pastel sketch`, `Pop art`, `Pop renaissance`, `Street art`, `Tablet sketch`, `Urban Glow`,
`Urban sketching`, `Young adult book`, `Young adult book 2`, `Seamless Digital`

**Recraft V3 — emblem (5):** `Prestige Emblem`, `Pop Graphic`, `Stamp`, `Punk Graphic`,
`Vintage Emblem`

**Recraft V3 Vector (23):** `Vector art`, `Line art`, `Linocut`, `Color blobs`, `Engraving`,
`Bold stroke`, `Chemistry`, `Colored stencil`, `Cosmics`, `Cutout`, `Depressive`, `Editorial`,
`Emotional flat`, `Marker outline`, `Mosaic`, `Naivector`, `Roundish flat`, `Segmented Colors`,
`Sharp contrast`, `Thin`, `Vector Photo`, `Vivid shapes`, `Seamless Vector`

**Recraft V2 — photorealistic (9):** `Photorealism`, `Enterprise`, `Natural light`, `Studio photo`,
`HDR`, `Hard flash`, `Motion blur`, `Black & white`, `Product photo`

**Recraft V2 — illustration (18):** `Illustration`, `3D render`, `Glow`, `Watercolor`,
`Hand-drawn`, `Kawaii`, `Grain`, `Bold Sketch`, `Pencil sketch`, `Retro Pop`, `Clay`, `Risograph`,
`Psychedelic`, `Seamless Digital`, `Color engraving`, `Pixel art`, `80's`, `Voxel art`

**Recraft V2 Vector (10):** `Vector art`, `Line art`, `Linocut`, `Cartoon`, `Flat 2.0`,
`Color blobs`, `Vector Kawaii`, `Doodle Line art`, `Seamless Vector`, `Engraving`

**Recraft V2 Vector — icon (11):** `Icon`, `Outline`, `Pictogram`, `Colored outline`, `Doodle`,
`Colored shape`, `Gradient outline`, `Offset doodle`, `Gradient shape`, `Broken line`, `Offset fill`

### Base style categories

The `style` parameter on `POST /styles` takes a *category*, not one of the names above:
`vector_illustration` (all models), `any` (V4/V4.1), `realistic_image` and `digital_illustration`
(V2/V3), `icon` (V2 only).

---

## Raster vs vector is decided twice

The model name decides the output format, and the style has to agree. This is the single most
common 400:

```
Style 'any' is not a vector style            # raster style, vector endpoint
Style 'vector_illustration' is not a raster style
```

Match them: `…_vector` model ↔ vector style. `/generations/raster` and `/generations/vector` exist
precisely so the server enforces this rather than a workflow discovering it at the wrong moment.
