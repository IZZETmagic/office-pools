# Recraft models, prices and limits

Source: <https://www.recraft.ai/docs/api-reference/pricing> and `/appendix`, read 2026-09-15.
Prompt ceilings and model-name validity were additionally **verified against the live API** on
that date (see "Verified live" at the end).

Money: **1,000 API units = USD $1.00**. Packages are prepaid, non-refundable, and do not expire.

---

## The 20 models

Variant grammar, from the `model` string itself:

- `…_vector` → SVG output. Everything else is raster.
- `…_pro` → higher resolution (2K raster / 4MP), several times the price.
- `…_utility` → V4.1 only. Flat lighting, simple composition, predictable.
- `…_styles` → the dedicated style-driven line. **Always requires a style.**

| `model` | Output | Units | USD |
|---|---|---:|---:|
| `recraftv4_1` | raster 1K | 35 | $0.035 |
| `recraftv4_1_vector` | SVG | 80 | $0.08 |
| `recraftv4_1_pro` | raster 2K | 210 | $0.21 |
| `recraftv4_1_pro_vector` | SVG | 300 | $0.30 |
| `recraftv4_1_utility` | raster 1K | 35 | $0.035 |
| `recraftv4_1_utility_vector` | SVG | 80 | $0.08 |
| `recraftv4_1_utility_pro` | raster 2K | 210 | $0.21 |
| `recraftv4_1_utility_pro_vector` | SVG | 300 | $0.30 |
| `recraftv4` | raster 1K | 40 | $0.04 |
| `recraftv4_vector` | SVG | 80 | $0.08 |
| `recraftv4_pro` | raster 2K | 250 | $0.25 |
| `recraftv4_pro_vector` | SVG | 300 | $0.30 |
| **`recraftv4_styles`** | raster 1K | **35** | **$0.035** |
| **`recraftv4_styles_vector`** | SVG | **50** | **$0.05** |
| `recraftv4_styles_pro` | raster 2K | 100 | $0.10 |
| `recraftv4_styles_pro_vector` | SVG | 120 | $0.12 |
| `recraftv3` | raster | 40 | $0.04 |
| `recraftv3_vector` | SVG | 80 | $0.08 |
| `recraftv2` | raster | 22 | $0.022 |
| `recraftv2_vector` | SVG | 44 | $0.044 |

**Default when `model` is omitted:** `recraftv4_1` — *except* when style references are attached,
where it defaults to `recraftv4_styles`. Never rely on the default; state the model.

### Which one

- **Style-consistent sets** (a character, a brand, a matching series) → **V4 Styles**. It is both
  the best style matcher and the cheapest vector generation in the V4 line. `recraftv4_styles_vector`
  at $0.05 undercuts every other V4 vector model by 38%.
- **One-off, no style to hold** → `recraftv4_1`.
- **Print / large format** → a `_pro` variant, but note it is 3–6× the price.
- **Inpainting, outpainting, background ops** → **V3 only**. The V4 line does not do them.
- **Cheap smoke tests** → `recraftv2` (22 units) or `recraftv2_vector` (44 units).

---

## Non-generation operations

These are nearly free, which changes what is worth attempting. Creating a style to test an idea is
a rounding error; it is the *generations against it* that cost.

| Operation | Endpoint | Units | USD |
|---|---|---:|---:|
| Erase region | `/images/eraseRegion` | 2 | $0.002 |
| Crisp upscale | `/images/crispUpscale` | 4 | $0.004 |
| **Create style** | `/styles` | **5** | **$0.005** |
| Vectorize | `/images/vectorize` | 10 | $0.01 |
| Remove background | `/images/removeBackground` | 10 | $0.01 |
| Enhance prompt | `/prompts/enhance` | 10 | $0.01 |
| Image to image | `/images/imageToImage` | 40 | $0.04 |
| Inpaint / outpaint / backgrounds (V3 raster) | various | 40 | $0.04 |
| Inpaint / outpaint / backgrounds (V3 vector) | various | 80 | $0.08 |
| Variate image | `/images/variateImage` | 40 | $0.04 |
| Creative upscale | `/images/creativeUpscale` | 250 | $0.25 |

Creative upscale is the one expensive utility — 250 units is more than most generations.

---

## Prompt ceilings

| Models | Max prompt |
|---|---:|
| All V4, V4.1 and V4 Styles | **10,000 chars** |
| V3 and V2 | **1,000 chars** |

`/prompts/enhance` has its own ceiling: 2,000 characters of input.

---

## Image sizes

Give `size` as either explicit `WxH` or an aspect ratio `w:h`. Omit it and the size is chosen from
the prompt. **Vector models accept aspect ratios only** — no explicit pixel dimensions.

Fourteen aspects are supported across the board: `1:1 2:1 1:2 3:2 2:3 4:3 3:4 5:4 4:5 6:10 14:10
16:9 9:16 10:14`.

| Aspect | V4 Styles / V4.1 / V4.1 Utility / V4 | The `_pro` variants | V2 / V3 |
|---|---|---|---|
| `1:1` | 1024x1024 | 2048x2048 | 1024x1024 |
| `16:9` | 1344x768 | 2688x1536 | 1820x1024 |
| `9:16` | 768x1344 | 1536x2688 | 1024x1820 |
| `3:2` | 1280x832 | 2560x1664 | 1536x1024 |
| `2:3` | 832x1280 | 1664x2560 | 1024x1536 |
| `4:3` | 1216x896 | 2432x1792 | 1365x1024 |
| `3:4` | 896x1216 | 1792x2432 | 1024x1365 |
| `5:4` | 1152x896 | 2304x1792 | 1280x1024 |
| `4:5` | 896x1152 | 1792x2304 | 1024x1280 |
| `2:1` | 1536x768 | 3072x1536 | 2048x1024 |
| `1:2` | 768x1536 | 1536x3072 | 1024x2048 |
| `6:10` | 832x1344 | 1664x2688 | 1024x1707 |
| `14:10` | 1280x896 | 2560x1792 | 1434x1024 |
| `10:14` | 896x1280 | 1792x2560 | 1024x1434 |

Passing an aspect ratio is safer than pixels — the same `1:1` is valid on every model, whereas
`1024x1024` is wrong for a `_pro` model.

---

## Operating limits

- **5 requests/second** and **100 images/minute**, per user.
- A request is accepted only while the unit balance is positive.
- **Results expire in ~24 hours.** URLs are signed and public-but-unguessable. Lost links are
  unrecoverable. Download on receipt, always.
- Input images: PNG / JPG / WEBP (SVG also accepted on some edit endpoints), **max 10 MB each**,
  max 16 MP, max dimension 4096px, min dimension 256px.

---

## Verified live, 2026-09-15

Probed with deliberately-invalid requests, which are free — units are deducted only on a 2xx.

| Probe | Result |
|---|---|
| `{"prompt":"","model":"recraftv4_styles_vector"}` | `prompt length should be in [1, 10000]` — model valid |
| `{"prompt":"","model":"recraftv4_1_utility_pro_vector"}` | same — model valid |
| `{"prompt":"","model":"recraftv3"}` | `prompt length should be in [1, 1000]` |
| `{"prompt":"","model":"NOT_A_MODEL"}` | `{"code":"invalid_model"}` |
| raster model on `/images/generations/vector` | `Style 'any' is not a vector style` |
| vector model on `/images/generations/raster` | `Style 'vector_illustration' is not a raster style` |
| `POST /images/explore` | 400, not 404 — real but undocumented |
| `POST /images/notARealOp` | 404 plain text — the control |

Error shape is `{"code": "...", "message": "..."}`. Validation order puts `prompt` before `style`,
so a prompt error can mask a style error.

Re-run any of these with `scripts/recraft.sh probe <path> '<json>'`.
