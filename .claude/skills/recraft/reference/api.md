# Recraft API — endpoint and parameter reference

Base URL `https://external.api.recraft.ai/v1` · Auth `Authorization: Bearer $RECRAFT_API_KEY`
Source: <https://www.recraft.ai/docs/api-reference/endpoints>, read 2026-09-15.

Interactive Swagger: <https://external.api.recraft.ai/doc/#/>

---

## The 17 documented operations

| Endpoint | What it does | Units |
|---|---|---:|
| `POST /images/generations` | Generate from a prompt | per model |
| `POST /images/generations/raster` | Same, output type enforced raster | per model |
| `POST /images/generations/vector` | Same, output type enforced SVG | per model |
| `POST /styles` | Create a reusable style from 1–10 references | 5 |
| `POST /images/imageToImage` | Variations guided by a prompt | 40 |
| `POST /images/inpaint` | Regenerate masked regions (V3 only) | 40 / 80 |
| `POST /images/outpaint` | Extend beyond the borders (V3 only) | 40 / 80 |
| `POST /images/replaceBackground` | Swap background (V3 only) | 40 / 80 |
| `POST /images/generateBackground` | Generate around a subject (V3 only) | 40 / 80 |
| `POST /images/vectorize` | Raster → SVG | 10 |
| `POST /images/removeBackground` | Transparent cutout | 10 |
| `POST /images/crispUpscale` | Resolution up, content unchanged | 4 |
| `POST /images/creativeUpscale` | Resolution up, detail regenerated | 250 |
| `POST /images/eraseRegion` | Remove a masked object | 2 |
| `POST /images/variateImage` | New versions, concept intact | 40 |
| `POST /prompts/enhance` | Rewrite a short prompt richer | 10 |
| `GET  /users/me` | Account + balance | **0** |

Two further paths exist and answer 400 rather than 404, but are undocumented and unsupported:
`/images/explore` and `/explore/similar`. Do not build on them.

---

## Two interchangeable request formats

Every endpoint taking an image accepts **either**:

- `multipart/form-data` — upload bytes directly, or
- `application/json` — pass a **public URL or a `data:` URL** instead.

The field mapping:

| Multipart | JSON | Used by |
|---|---|---|
| `image` | `image_url` | imageToImage, inpaint, outpaint, replaceBackground, generateBackground, eraseRegion, variateImage |
| `mask` | `mask_url` | inpaint, generateBackground, eraseRegion |
| `file` | `image_url` | vectorize, removeBackground, crispUpscale, creativeUpscale |
| `files` | `image_urls` | `POST /styles` |
| `style_references` | `style_reference_urls` | generations |

All other parameters are identical between the two.

---

## `POST /images/generations`

| Parameter | Type | Notes |
|---|---|---|
| `prompt` **(required)** | string | Ceiling is 10,000 chars on V4 family, 1,000 on V2/V3 |
| `n` | int, default 1 | 1–6 |
| `model` | string | Default `recraftv4_1`; `recraftv4_styles` when references are attached |
| `size` | string | `WxH` or `w:h`. Auto-selected from the prompt if omitted |
| `style` | string | A curated V2/V3 style name — see `styles.md` |
| `style_id` | UUID | A custom style. **Mutually exclusive with style references** |
| `style_match` | string | `precise` \| `flexible` (V4/V4.1), `regular` (V2/V3). Overrides the style's stored value for this request |
| `style_references` | files | multipart only, max 10 images |
| `style_reference_urls` | string[] | JSON only, max 10 |
| `negative_prompt` | string | **V2/V3 only** |
| `random_seed` | int | Reproducibility |
| `response_format` | string | `url` (default) or `b64_json` |
| `text_layout` | object[] | **V3 only** — per-word bounding boxes |
| `controls` | object | See Controls below |

Response: `{"data": [{"url": ...}], "credits": N, "style_id": "..."}`.

**`/generations/raster` and `/generations/vector`** take the same body but reject the wrong output
type — useful when a workflow must not silently produce the other kind. Note the rejection message
names the *style*, not the model: `Style 'any' is not a vector style`.

### Attaching style references inline

Instead of a `style_id`, attach the reference images to the generation itself. The server creates
a private style, applies it, and returns the resolved `style_id` so later calls can reuse it.

- 1–10 images, PNG/JPG/WEBP, 64 MB total, each under 10 MB.
- **Billing is composite**: style creation (5) *plus* the per-image cost. The response `credits`
  field is the sum.
- Sending both `style_id` and references is rejected.

---

## `POST /styles`

| Parameter | Type | Notes |
|---|---|---|
| `files` / `image_urls` | files / string[] | 1–10 references, PNG/JPG/WEBP, 64 MB total |
| `model` | string, default `recraftv4_styles` | The style is **bound to this model** and must be used with a matching one |
| `match` | string | `precise` (V4 default) \| `flexible` \| `regular` (V2/V3 only). Stored on the style |
| `image_weights` | number[] | One per image — bias the style toward specific references |
| `source_styles` | UUID[] | **V2/V3 only** — mix existing styles in |
| `source_style_weights` | number[] | **V2/V3 only** |
| `prompt` | string | Optional text associated with the style |
| `palette` | object | `colors` + `background_color` stored with the style |
| `style` | string | Base style. Defaults: `vector_illustration` for vector models, `realistic_image` for V2/V3 raster, `any` for V4/V4.1 raster |
| `mix_policy` | string | **V2/V3 only** — `PaletteMatch` \| `MaxWeight` |

At least one of `files`, `image_urls` or `source_styles` is required.

Response: `{"id": "<uuid>", "style": "any", "creation_time": ..., "is_private": true, "credits": 5}`.

A `style_id` never expires and can be reused indefinitely. Style IDs from the Recraft web platform
also work if you own the style, it is public, or it was shared to your account.

---

## Editing endpoints

**`POST /images/imageToImage`** — `image`/`image_url`, `prompt`, **`strength`** (0–1; 0 ≈ identical,
1 ≈ minimal similarity), plus `n`, `model` (V3 and V4 families), `random_seed`, `response_format`.
`style`/`style_id` are V3-only here.

**`POST /images/inpaint`** — `image`, **`mask`**, `prompt`. **`model` must be `recraftv3` or
`recraftv3_vector`.** The mask is *grayscale*: **white = repaint, black = keep**, and must be
exactly the same pixel size as the image.

**`POST /images/outpaint`** — `image`, `prompt`, plus either `expand_left/right/top/bottom`
(0–4096 each) **or** `size` — never both. `zoom_out_percentage` (0–100) scales the source down
first and may be combined with either. V3 only.

**`POST /images/replaceBackground`** — `image`, `prompt`. V3 only.
**`POST /images/generateBackground`** — `image`, `mask`, `prompt`. V3 only.

**`POST /images/eraseRegion`** — `image` + `mask`. White = erase. Cheapest operation on the API at
2 units.

**`POST /images/variateImage`** ("remix") — `image`, **`size` (required)**, `n` (1–6), `model`,
`random_seed`.

**`POST /images/vectorize` / `removeBackground` / `crispUpscale` / `creativeUpscale`** — take the
image as `file` (or `image_url`) and nothing else but `response_format`. Response shape is
`{"image": {"url": ...}}`, *not* the `data[]` array the generation endpoints return.

**`POST /prompts/enhance`** — `prompt`, max 2,000 chars.

---

## Controls

Passed as the `controls` object on generation and editing endpoints.

| Field | Type | Compatibility |
|---|---|---|
| `colors` | array of colours | All models, max 10 |
| `background_color` | colour | All models |
| `artistic_level` | int 0–5 | **V3 only** — 0 static and clean, 5 dynamic and eccentric |
| `no_text` | bool | **V3 only** |

A colour is `{"rgb": [0-255, 0-255, 0-255], "weight": 0.0-1.0}`. Weights must be set for every
colour or none, and must sum to ≤ 1.0.

```json
{"controls": {"colors": [{"rgb": [0,255,0], "weight": 0.6}], "background_color": {"rgb": [40,40,40]}}}
```

The same colour objects populate the `palette` parameter of `POST /styles`, where they are stored
on the style instead of applied per-request.

---

## Text layout (V3 only)

`text_layout` places individual **words** at explicit positions: `{"text": "Recraft", "bbox":
[[x,y],[x,y],[x,y],[x,y]]}`. Exactly four points, coordinates relative to the image where `(0,0)`
is top-left and `(1,1)` bottom-right; values outside `[0,1]` crop. Only a restricted character set
is accepted — uppercase Latin, digits, common punctuation, and a handful of Greek/Cyrillic
look-alikes. Lowercase letters are **not** in the supported set. Anything else is a validation error.

---

## Errors and rate limits

Errors are `{"code": "...", "message": "..."}` with HTTP 400. Useful codes: `invalid_model`,
`invalid_request_parameter`, `invalid_image_type`. 401 unauthorised, 402 payment required,
429 throttled.

- **5 requests/second**, **100 images/minute**, per user.
- **Failed calls are free.** Units are deducted only on a 2xx — so probing an assumption costs
  nothing and should be the first move whenever the docs are ambiguous.

---

## The OpenAI Python client works, with caveats

The API is close enough to OpenAI's that their client can drive it:

```python
from openai import OpenAI
client = OpenAI(base_url='https://external.api.recraft.ai/v1', api_key=RECRAFT_API_TOKEN)
response = client.images.generate(prompt='race car on a track',
                                  extra_body={'style_id': style_id, 'controls': {...}})
```

Recraft-specific parameters must go through `extra_body`. Parameters OpenAI knows but Recraft does
not may be **silently ignored** rather than rejected — which is a good reason to use plain HTTP
when correctness matters.
