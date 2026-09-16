# The avatar config

What gets stored per member. **A config, never an image.**

```jsonc
{
  "base":       "neck-100",        // one of the four locked bases
  "skin":       "#F5C9A6",

  "hair":       "m03-quiff",       // null for bald
  "hairColour": "#4A3B32",

  "eyes":       "eye-01-base",
  "eyeColour":  "#8B4513",
  "gaze":       [0.0, 0.0],        // dx, dy in -1..1 — see gaze.py

  "brows":      null,              // slot not built yet
  "mouth":      "mouth-02-smile", // 10 assets
  "mouthColour": "#B67A70",       // optional; drives lip, interior and tongue

  "shirt":      "#3B6EFF",
  "background": "#FFFFFF"
}
```

Roughly 200 bytes. Not a blob.

## Why a config and not a rendered image

Every field above is applied at compose time by `compose.py`, so a fix to an asset updates every
avatar that uses it. Store rendered images and that becomes impossible — you would be reissuing
files instead of changing a row.

It also makes the shop trivial: owning a colourway is a value, not a file.

## What is a parameter and what is an asset

This distinction is the whole architecture, and getting it wrong is expensive.

| Parameter (a value) | Asset (a file) |
|---|---|
| skin, hair, eye, shirt, background colour | hair style, eye expression, mouth |
| neck width (`neck-width.py`) | |
| **gaze** (`gaze.py`) | |

⭐ Gaze belongs on the left. It was originally planned as a set of side-glance assets and
dropped because "the generator can't do gaze" — which was true and beside the point. In the
vector, pointing an iris is arithmetic. **Before generating a variant, ask whether it is a
parameter.** 28 hair styles x 8 colours is 28 assets and 8 values, never 224.

⭐ The mouths tested that rule and came out the other way. Six were drawn as pure geometry
first — free, exact, and for the closed-lip lines indistinguishable from the generated ones
(7% narrower, and the generated colour does not survive extraction anyway). But the OPEN
mouths were decisively better generated, so the whole set is generated for one provenance.
**Generation earns its cost where there is interior structure to invent, and earns nothing on
a shape that is one stroke.** See `mouths/assets/LOCKED.md`.

## Rendering

**Interactive surfaces** (leaderboards, profiles, the customiser) compose client-side from the
bundled assets — web inline SVG, mobile `react-native-svg`. Recolouring is a string swap, so
the customiser previews instantly with no round trip.

**Non-interactive surfaces** (email recaps, Banter share cards, OG images) must be raster. Render
server-side and cache by a hash of the config: the same config always yields the same image, so
it caches forever with no invalidation.

⚠ The `<mask>` used by several hair assets is still unproven on a physical device. It cannot be
tested from this machine. That is the largest open risk in the system.
