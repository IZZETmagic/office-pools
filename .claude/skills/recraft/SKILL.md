---
name: recraft
description: Generate, restyle, vectorize or edit images with the Recraft AI API — raster or true SVG, with custom styles built from reference images. Use whenever the task is to make or change a picture, icon, avatar, illustration or vector asset, when the user says "recraft", "generate an image/icon/avatar", "regenerate this art", "make an SVG", or asks to remove a background, vectorize, or upscale. Also covers Recraft costs, API units, balance, style_id and model choice.
---

# Recraft

The image API SportPool uses for generated art. It is the only image generator here that emits
**real SVG** — actual `<path>` data, no embedded bitmaps — and its custom-style system is the
reason to reach for it over a general model.

Everything runs through `scripts/recraft.sh`, which is dependency-free curl + python3 and works in
a fresh worktree with no `npm install`.

---

## Before you spend anything

```bash
.claude/skills/recraft/scripts/recraft.sh balance
```

Free, and it is the first call every time. If the balance is empty, **say so and stop** — do not
substitute a hand-built asset as a way of delivering something.

> ⚠️ **Two wallets that do not exchange.** `RECRAFT_API_KEY` spends prepaid **API units**
> (1,000 units = $1.00). Recraft Studio and the remote MCP server at `mcp.recraft.ai` spend
> **subscription credits** — a different balance, billed differently. An OAuth-authenticated tool
> is not spending this balance and cannot. Use the HTTP API for anything programmatic.

The key lives in `.env.local` as `RECRAFT_API_KEY`; the script walks up from `$PWD` to find it, so
run it from inside the repo.

---

## Five rules that actually bite

1. **Download on receipt.** Result URLs are signed and expire in **~24 hours**. There is no
   fetching it later, and lost links are unrecoverable. The script downloads before it does
   anything else, including before reporting the charge — a reporting bug must never strand a
   paid-for image.
2. **Failed calls are free.** Units are deducted only on a `2xx`. So when the docs are ambiguous,
   **probe instead of assuming** — `recraft.sh probe images/generations '{"prompt":""}'` costs
   nothing and the error message usually answers the question outright.
3. **Creating a style is a rounding error.** 5 units, $0.005. Never treat "build another style to
   test it" as expensive — it is the *generations* against it that cost.
4. **State the model explicitly.** The default is `recraftv4_1`, except with style references
   attached where it silently becomes `recraftv4_styles`. Silent defaults produce surprising bills.
5. **Raster and vector must agree twice** — the model *and* the style. Mismatches fail with
   `Style 'any' is not a vector style`, which names the style, not the model.

---

## Doing the thing

```bash
R=.claude/skills/recraft/scripts/recraft.sh

$R balance
$R generate --prompt "..." --model recraftv4_styles_vector --style-id <uuid> --size 1:1 --out assets/foo
$R generate --prompt "..." --ref a.png --ref b.png          # inline refs; server makes the style
$R style ref1.png ref2.png --match precise                  # -> a reusable style_id, 5 units
$R vectorize in.png ; $R removebg in.png ; $R upscale in.png
$R probe images/generations '{"prompt":""}'                 # free
```

`--dry-run` prints the request body and the cost estimate without sending. Use it whenever the
call is non-obvious; it costs nothing and catches the mismatches above before they bill.

Every generating command prints an estimate first, downloads results into `--out`, and then
reports the actual `credits` charged.

---

## Which call

| The job | Use |
|---|---|
| A set of images that must look like each other | **V4 Styles** + one `style_id` — `recraftv4_styles` (raster) / `recraftv4_styles_vector` (SVG) |
| One image, no house style to hold | `recraftv4_1` |
| An SVG asset | any `…_vector` model. `recraftv4_styles_vector` at $0.05 is the cheapest V4 vector |
| Print or large format | a `_pro` variant — but 3–6× the price |
| Turn an existing bitmap into SVG | `vectorize`, 10 units |
| Cut out a subject | `removebg`, 10 units |
| Bigger, same content | `upscale` (crisp), 4 units — **not** `bigupscale`, which is 250 |
| Inpaint, outpaint, replace a background | **V3 only.** The V4 line cannot do these |
| Cheap smoke test of a pipeline | `recraftv2` (22) / `recraftv2_vector` (44) |

Full model table, sizes and prompt ceilings: **`reference/models.md`**.
Every endpoint and parameter: **`reference/api.md`**.
The style systems and the ~136 curated V2/V3 style names: **`reference/styles.md`**.

---

## What Recraft is good and bad at

Measured on this project's own avatar work (27 generations, Sept 2026), not inferred:

| ✅ | ❌ |
|---|---|
| Native SVG — real `d` attributes, zero `<image>` tags | Ignores a prompt's structural intent without a `style_id` |
| A `style_id` is the whole ballgame: **462 coordinates and correct structure with one, 4,344 and an editorial portrait without** | Cannot vary skull structure or other deep geometry |
| Isolated parts, if the hole is framed as a **positive object** ("filled with the same magenta as the background") | **Cannot hold all variables at once** — every generation fixes one thing and regresses another |
| Output is freely recolourable | No coordinate system; anchors must be measured afterwards |
| Prompt ceiling is 10,000 chars on V4 — far more room than it looks | V2/V3 are capped at 1,000 |

⚠️ **Because it cannot hold all variables at once, do not generate whole characters.** Generate
parts and composite them, or generate a whole figure and decompose it. The generator is an *asset
source*, not a character system.

Generated output carries **embedded C2PA provenance metadata** (`xmlns:c2pa` in the SVG). It
travels with the file unless deliberately stripped.

---

## SportPool doctrine

**Regenerate art. Never hand-edit it.** If approved art needs a visual change, change the prompt
and generate again. No warps, no recolour-by-path, no clip-path construction, no shapes added to
the file. Ryan called this out on 2026-09-14 after three consecutive geometry edits each broke
approved art.

The reason is structural, not stylistic: *a generated asset is a picture, not a component.* In
that art the two background-coloured shapes were a **mask painted over the skin**, not a
background behind it — so deleting them to "enlarge the background" unmasked the face and it
ballooned to canvas width. Each fix needed another fix. Being able to *measure* a file is not the
same as being able to *edit* it safely. Geometry work is still fine for measuring (widths,
coverage, fill counts) — never for repairing.

**Whose images go into a style is a legal question, not a craft one.** `POST /styles` makes it one
command to build a style from five reference images. In September 2026 that is exactly how this
project ended up with an avatar set descended, in two documented generations, from a style trained
on five Duolingo avatars — and the chain is discoverable: Recraft stores the reference images
against the account, style objects persist, and the derivation is written into commit messages.
Recolouring the output does not cure it. See `drafts/2026-09-14_avatar_duolingo_similarity.md`.

Before creating a style, ask where the references came from. Own work, licensed assets, CC0
sources and public-domain material are fine. A competitor's product art is not — and "we changed
the colours" is not a defence.

⚠️ Licence terms cut both ways: the paid tier assigns you copyright in the output, but **§7.7
grants Recraft a perpetual, sublicensable, irrevocable licence back**, surviving termination, on
both tiers. Training is opt-out; the licence-back is not. And AI output may not be copyrightable
at all (*Thaler v. Perlmutter*) — a contract cannot assign a right that does not exist. That
matters specifically where the plan is to **sell** cosmetics.

---

## Sources and staleness

Authoritative: **<https://www.recraft.ai/docs/llms-full.txt>** (the whole doc set in one file) and
the per-page markdown at `https://www.recraft.ai/docs/api-reference/<page>.md`. The index is
`https://www.recraft.ai/docs/llms.txt`. Interactive Swagger:
<https://external.api.recraft.ai/doc/#/>.

⚠️ **The third-party profile at `api-evangelist/recraft-ai` is not safe to generate a client
from.** Checked 2026-09-15: its OpenAPI `model` enum lists 8 models and omits 12 — **every vector
model and the entire V4 Styles line** — and it has no knowledge of `style_match`, `image_weights`,
`style_reference_urls` or `zoom_out_percentage`. It was generated 2026-07-15, before the August
V4 Styles release. It is a usable map of *paths* and its two-wallet finance model is correct; it
is wrong about *parameters*.

Recraft ships fast — V4 Feb 2026, V4.1 May 2026, V4 Styles Aug 2026. When a detail matters,
`probe` it (free) or re-read the `.md` page rather than trusting this file. Everything here was
verified on **2026-09-15**.
