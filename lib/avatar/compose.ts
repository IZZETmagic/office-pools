// =============================================================
// Compose an avatar SVG from a config
// =============================================================
// A port of `assets/character-base/nano/compose.py`, which is the reference implementation.
// If the two drift, anything rendering from here shows something the pipeline does not.
// The port is checked by comparing path count and fill ORDER for every facial hair style —
// order matters because facial hair lifts the nose out of the base and re-inserts it.
//
// ## Why a config and not an image
//
// Every field below is applied at compose time, so fixing an asset updates every avatar
// using it. Store rendered images and that becomes impossible — you would be reissuing
// files instead of changing a row. A config is ~230 bytes.
//
// ## The derived colours are not decoration
//
// A blush is the skin pulled 22% toward rose, and stubble is the hair pulled 83% toward the
// skin and then 55% toward its own grey. Both exist because fixed colours were wrong on dark
// skin: a fixed pink blush read as clown makeup, and stubble at full hair strength read as a
// second short beard.
// =============================================================

export type AvatarAssets = {
  bases: Record<string, string>
  hair: Record<string, string>
  expressions: Record<string, string>
  /**
   * Derived body layers — see THE STACK. Optional so older fixtures still compose.
   *
   * ⭐⭐ TWO of them, split so a GARMENT can replace the shirt without going near the neck.
   * `frontShirt` is what a garment substitutes for; `frontNeck` is painted after either, and
   * it is what cuts the collar: a traced garment comes back SOLID, so the per-base neck laid
   * on top gives the right collar for that base. The collar is paint order, not geometry —
   * which is why a garment needs only ONE asset even though the four bases' shirts differ.
   */
  frontShirt?: Record<string, string>
  frontNeck?: Record<string, string>
  /** Garments — a whole alternative shirt silhouette, in the SHIRT tokens. */
  garments?: Record<string, string>
  /**
   * The SP chest mark. ONE asset, not a family — see build-mark.py.
   *
   * 🔴 THIS SLOT TAKES THE SPORTPOOL MARK ONLY. Never a club crest, name or kit design: those
   * are protected marks, and the licence covers showing a crest in a fixture list, not putting
   * one on a garment. The recorded rule is colourways, never badges.
   */
  mark?: string
  hairBackfill?: Record<string, string>
  hairManifest?: Record<string, boolean>
  facialhair: Record<string, string>
  /** Eyewear — glasses and sunglasses. Optional so older fixtures still compose. */
  glasses?: Record<string, string>
  earrings?: Record<string, string>
  eyes: Record<string, string>
  specialEyes: Record<string, string>
  mouths: Record<string, string>
  fhManifest: Record<string, { over?: boolean }>
}

export type AvatarConfig = {
  base: string
  skin: string
  hair: string | null
  hairColour: string
  facialHair: string | null
  glasses?: string | null
  earrings?: string | null
  garment?: string | null
  /** Wear the SP chest mark. A boolean, because there is exactly one and only ever will be. */
  mark?: boolean
  /** Whole-face expression. Mutually exclusive with eyes+mouth. */
  expression?: string | null
  eyes?: string | null
  mouth?: string | null
  eyeColour: string
  mouthColour: string
  shirt: string
  background: string
  /** Eyewear frame. On a tinted style the lens is black regardless — see LENS_BLACK. */
  frameColour?: string
  /** Earring metal. One flat tone — the art carries no second highlight tone. */
  metalColour?: string
  /**
   * ⚠⚠ BACK-OUT: the beard fade is behind this flag and defaults to OFF. With it off the
   * fade token is swapped for the flat hair colour — exactly what this did before the
   * feature existed — and no <linearGradient> is emitted. Remove the feature entirely with
   * `git revert` of the commit that added it; the guard test asserts the default path emits
   * no gradient, so a regression fails the build rather than shipping a violet sideburn.
   *
   * ⚠ <linearGradient> is supported by react-native-svg but has never been proven on a
   * device in this project. It joins the <mask> on three hair assets in that same pile.
   */
  fade?: boolean
}

/** Tokens exactly as the asset files carry them. */
const T = {
  hairBase: 'rgb(140,122,110)',
  hairShade: 'rgb(114,97,86)',
  hairLight: 'rgb(168,150,138)',
  skin: 'rgb(254,205,180)',
  skinShade: 'rgb(245,178,150)',
  shirt: 'rgb(30,118,214)',
  shirt2: 'rgb(50,118,183)',
  /**
   * ⭐ THE THIRD GARMENT TONE, and it is a LIGHT one on purpose. `shirt` → `shirt2` is already
   * the dark step, so the direction the ramp was missing is up — and it is what the designs
   * actually need: the sports top's largest panel is LIGHTER than its body, and a third dark
   * token would render it backwards.
   *
   * Derived from the one shirt colour like the other two, the same shape as the mouth's ink,
   * interior and tongue. Nothing is added to the config.
   *
   * ⚠ Only garments use it. The four locked bases carry two shirt tones and always will.
   */
  shirtLight: 'rgb(96,170,240)',
  /**
   * ⭐ THE CHEST MARK'S OWN TONE. Not the garment's light token, for two reasons: a crest wants
   * more contrast than one step of lightening gives, and the sports top paints PANELS in the
   * light token — a mark in the same tone would vanish wherever it crossed one. Pulled most of
   * the way to white, so it reads on the near-black shirt and the amber one alike.
   */
  markInk: 'rgb(200,225,255)',
  bg: 'rgb(255,255,255)',
  irisCore: 'rgb(117,62,21)',
  irisRim: 'rgb(150,84,34)',
  mouthInk: 'rgb(182,122,112)',
  mouthDark: 'rgb(118,72,68)',
  mouthTongue: 'rgb(206,116,112)',
  browInk: 'rgb(101,70,52)',
  blush: 'rgb(240,158,138)',
  stubble: 'rgb(164,150,140)',
  /**
   * The BEARD FADE marker. A facial hair asset paints its sideburn band in this tone and
   * compose turns that one path into a vertical gradient, skin at the top to hair at the
   * bottom, so the beard dissolves into the face the way a barber fade does.
   *
   * Measured off Ryan's reference: 63 distinct tones across 64 rows, all on the hair-to-skin
   * blend line. A true gradient, not steps — which is why it is composed rather than drawn.
   *
   * ⚠ Deliberately OFF the avatar palette (a violet nothing else uses) so it cannot be
   * confused with a hair or stubble tone.
   */
  fade: 'rgb(126,110,150)',
  /**
   * ⭐ THE BEARD MARKER. Facial hair and head hair used to share the hairBase token, so they
   * were filled with the SAME colour — and against long hair a beard vanished into it. Ryan,
   * 2026-09-19: "the full beard blends into the long hair in the background."
   *
   * A facial-hair fragment has its hairBase swapped for this marker as it is stacked, and the
   * recolour pass fills the marker with the hair colour LIGHTENED. One colour input still
   * drives both, so nothing is added to the config, and it is right on every hair and skin
   * combination — the same shape as stubble and the fade.
   *
   * ⚠ Deliberately OFF the avatar palette (a green nothing else uses) so a stray one is
   * obvious rather than silently plausible. It must never reach the output.
   */
  beard: 'rgb(110,150,126)',
  /**
   * ⭐ EYEWEAR, two tokens from one input. The frame takes `frameColour` verbatim and the lens
   * is derived from it, the same shape as the iris (core + rim from one colour) and the mouth
   * (ink + interior + tongue from one). `AVATAR_CONFIG.md` is explicit about why: "ask whether
   * it is a parameter" — 5 frames x 6 colours is 5 assets and 6 values, never 30 assets.
   *
   * ⚠ A CLEAR pair has no lens path at all. The opening is cut out of the frame for real (see
   * extract-glasses.py), because eyewear composes OVER the eyes and anything opaque there
   * hides them. Only tinted styles carry the lens token.
   */
  frameInk: 'rgb(64,70,78)',
  lensTint: 'rgb(96,126,156)',
  /**
   * ⭐ THE GLASS HIGHLIGHT. Ryan, 2026-09-21: an empty opening "just seems like they are empty
   * frames" — a clear lens needs something in it that says glass.
   *
   * ⚠⚠ It cannot keep the tone it traced as. The generator draws the highlight in near-white
   * and Recraft quantises that to rgb(255,255,255) — which is the BACKGROUND token. Left
   * alone, every highlight would be repainted with the avatar's background colour and vanish
   * on a white one. extract-glasses.py retokenises it on the way in.
   */
  glint: 'rgb(226,240,250)',
  /**
   * ⭐ EARRING METAL. One flat tone, taken verbatim from `metalColour` — the generated art
   * carries no second highlight tone, so there is nothing to derive and no derivation to write.
   */
  metal: 'rgb(212,160,54)',
} as const

/**
 * ⚠⚠ ADDITIVE, not a factor. This was ×1.14 and that is wrong at both ends of the palette,
 * because a multiplier moves a colour in proportion to how bright it already is:
 *
 *     #1A1110 (black)    ×1.14 -> +2.2 luminance   <- no separation at all, the original bug
 *     #4A3B32 (default)  ×1.14 -> +8.3             <- what Ryan approved, on that one swatch
 *     #E8E8ED (platinum) ×1.14 -> clamps to pure WHITE
 *
 * Adding a constant to each channel moves the luminance by exactly that constant whatever the
 * input, so all nine hair swatches get the same visible step and none clamps. 12 is close to
 * the +8.3 approved on the default swatch and enough to read on black.
 */
const BEARD_LIFT = 12

/**
 * ⭐ THE LENS IS BLACK, FULL STOP. Ryan, 2026-09-22: "Just leave them black the lenses that is."
 *
 * It used to be derived from the frame — leaned toward a glass blue so one swatch drove both,
 * the way the iris core drives its rim. That was defensible and it was also a slate-blue lens,
 * which is a photographic tint, not what sunglasses read as. A black lens reads as sunglasses
 * at any size, and the frame colour still does visible work as the rim around it.
 *
 * ⚠ NOT pure black — Ryan, 2026-09-22: "slightly lighter than black". A dark slate that still
 * reads as a black lens at a glance, with the frame legible as a rim around it.
 *
 * ⚠⚠ The floor is set by the DARKEST FRAME, not by taste. The default frame is rgb(34,38,46),
 * so a lens at rgb(38,42,50) sits 6.6 luminance from it and the frame stops reading at all on
 * a black pair. rgb(52,58,68) keeps 20 luminance of separation, which holds the rim. Going
 * further — rgb(68,75,87) — starts reading as mid-grey rather than a sunglass lens.
 */
const LENS_BLACK: RGB = [52, 58, 68]

/**
 * ⭐⭐ THE HIGHLIGHT IS TRANSLUCENT, AND THAT IS WHY IT IS A CONSTANT. Ryan, 2026-09-21: "The
 * glint is there but you can't see through it. It is glass and should be subtle so you can
 * still see through it."
 *
 * It was opaque, and derived from the skin so it would stay lighter than whatever it sat on —
 * a whole derivation whose only job was to fake what transparency does for free. With
 * `fill-opacity` the highlight composites over the skin, the eye white and the iris alike and
 * lightens each of them, which is what glass does. So the derivation is gone and the tint is
 * one cool constant.
 *
 * ⚠ The tint is COOL against warm skin, which is what carries it on the palest swatch: at
 * #FFE0C4 the skin is already at luminance 228.6 and a highlight has nowhere lighter to go, so
 * it reads by temperature rather than by lightness.
 *
 * ⚠⚠ `fill-opacity` is the first transparency in the avatar system. It lives in the asset, not
 * here — see extract-glasses.py — and it joins <mask> and <linearGradient> in the pile that has
 * never been proven on a device with react-native-svg.
 */
const GLASS_TINT: RGB = [214, 234, 250]

/** The frame colour used when a config names eyewear but no colour. */
const DEFAULT_FRAME = '#22262E'
const DEFAULT_METAL = '#D4A017'

const FADE_ID = 'beardfade'

/**
 * ⚠⚠ How far down the band the fade reaches, as a fraction of the band's own height.
 *
 * The gradient uses objectBoundingBox units, so without this it stretches over the WHOLE
 * marked path — and the band runs from its flat top all the way down into the beard. The
 * result was every side strip fading along its entire length instead of dissolving at the top.
 *
 * Three stops, not two: skin at the top, full hair by FADE_SPAN, full hair again at the
 * bottom. Everything below FADE_SPAN is solid beard.
 */
const FADE_SPAN = 0.3

type RGB = [number, number, number]

const hex2rgb = (h: string): RGB => {
  const s = h.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)) as RGB
}
const rgbStr = (c: number[]) => `rgb(${c[0]},${c[1]},${c[2]})`
const darken = (c: RGB, f = 0.78) => rgbStr(c.map((v) => Math.max(0, Math.trunc(v * f))))
const lighten = (c: RGB, f = 1.22) => rgbStr(c.map((v) => Math.min(255, Math.trunc(v * f))))
const mix = (a: RGB, b: RGB, t: number) => rgbStr(a.map((v, i) => Math.trunc(v + (b[i] - v) * t)))

/**
 * Stubble is a SHADOW on the skin, not a short beard. Measured off the art Ryan approved on
 * 2026-09-18: 84% of the way from the beard to the skin in lightness, and clearly greyer than
 * the hair-to-skin line. A plain 55% mix gave a mid brown that read as a lighter full beard,
 * which is what the stubble looked like for a week. So: toward the skin, then toward grey.
 *
 * ⚠⚠ The same two numbers live in compose.py and builder-template.html. The guard test
 * asserts all three agree, because a builder that lies about the product's colour is worse
 * than no builder.
 */
const STUBBLE_TOWARD_SKIN = 0.83
const STUBBLE_TOWARD_GREY = 0.55

/**
 * ⚠⚠ ...and then a FLOOR against the skin it sits on. The derivation tracks the HAIR, which is
 * right — a blonde with black stubble looks wrong — but it says nothing about the skin, and on
 * half the palette the two landed on top of each other. Measured over all 72 hair x skin
 * combinations: 35 put stubble within 12 luminance of the skin, 20 of them LIGHTER than it.
 *
 * ⭐ Lighter is not itself wrong — white hair on dark skin should give pale stubble — so the
 * floor is on the DISTANCE, not the direction. It only bites when the two are too close, so
 * every combination already approved is untouched (the default palette sits at 18.1).
 */
const STUBBLE_MIN_CONTRAST = 14

const lum = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

const stubbleTone = (hair: RGB, skin: RGB) => {
  let m = hair.map((v, i) => v + (skin[i] - v) * STUBBLE_TOWARD_SKIN)
  const grey = lum(m)
  m = m.map((v) => v + (grey - v) * STUBBLE_TOWARD_GREY)
  // ⭐ adding a constant to every channel shifts the luminance by exactly that constant, so
  // the correction is one subtraction and the hue is untouched.
  const d = lum(m) - lum(skin)
  if (Math.abs(d) < STUBBLE_MIN_CONTRAST) {
    const target = lum(skin) + (d > 0 ? STUBBLE_MIN_CONTRAST : -STUBBLE_MIN_CONTRAST)
    const k = target - lum(m)
    m = m.map((v) => Math.max(0, Math.min(255, v + k)))
  }
  return rgbStr(m.map((v) => Math.trunc(v)))
}

/**
 * ⚠⚠ ...and STROKE as well as fill. Every hair path carries a hairline stroke of its own
 * fill, which is how the tracer's butted edges are sealed — see seal-hair-seams.py. The stroke
 * holds the same TOKEN, so a recolour that only swapped fill would leave grey-brown outlines on
 * every recoloured avatar.
 */
const swap = (s: string, find: string, rep: string) =>
  s.split(`fill="${find}"`).join(`fill="${rep}"`).split(`stroke="${find}"`).join(`stroke="${rep}"`)

/**
 * ⭐⭐ EVERY ID IN A COMPOSED DOCUMENT IS SUFFIXED, because an id is scoped to the DOCUMENT
 * and an avatar is not a document — it is one element among many on a page.
 *
 * A composed avatar declares up to four: `facehole` (the face cut-out every hair asset
 * carries), `facehole-front` (its renamed second copy), `faceonly` (the head silhouette) and
 * `beardfade`. Inline two avatars and the browser resolves every `url(#facehole)` to the
 * FIRST definition in the document, so avatars 2..n silently borrow avatar 1's mask.
 *
 * ⚠⚠ It is not subtle. Several hair styles paint their mass as a full-canvas fill and rely
 * entirely on the mask to cut it to shape; handed the wrong mask the tile FLOODS with hair.
 * The admin contact sheet inlines a whole grid and has been wrong this whole time; the
 * leaderboard, member list and every other planned surface show more than one too.
 *
 * ⭐ THE SUFFIX IS A HASH OF THE DOCUMENT ITSELF — not a counter, not a random value:
 *
 *   deterministic   one config composes to the same bytes every time, so a server render and
 *                   the client render that hydrates it agree. A counter or a random suffix is
 *                   a hydration mismatch on every avatar, and unstable test fixtures.
 *   drift-proof     compose.py, this file and builder-template.html hash the SAME string, so
 *                   they cannot disagree about the suffix unless they already disagree about
 *                   the document — which is what the byte-for-byte parity check tests.
 *   safe to collide two documents can only share a suffix if they are IDENTICAL, and
 *                   identical documents carry identical masks, so sharing an id changes
 *                   nothing about what is drawn.
 */
const idHash = (s: string): string => {
  // FNV-1a, 32-bit. Over UTF-16 code units, which for ASCII are also the bytes and the code
  // points — so JS charCodeAt and Python ord agree exactly. ⚠ That equivalence is the whole
  // reason the three composers land on the same suffix, and a guard test asserts the composed
  // document is ASCII so it cannot quietly stop being true.
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  // ⚠ The LENGTH rides along. 32 bits is already four billion values against a page holding
  // tens of avatars, so this is belt and braces — but it costs one expression and it makes a
  // collision need two documents that agree on both.
  return (h >>> 0).toString(36) + s.length.toString(36)
}

/**
 * ⚠ `(\s)id=` and not `\bid=`: a word boundary also sits inside `data-fade-id="…"`, so the
 * looser pattern would rewrite an attribute that merely ENDS in id as though it were one.
 * ⚠ `id="…"` and `url(#…)` are every reference form the assets actually use. A guard test
 * fails the build if one ever arrives carrying `href="#…"`, which would sail straight past
 * this and re-introduce the bug silently.
 */
function uniquifyIds(svg: string): string {
  if (!svg.includes('id="')) return svg
  const uid = idHash(svg)
  return svg
    .replace(/(\s)id="([^"]+)"/g, (_, sp, id) => `${sp}id="${id}--${uid}"`)
    .replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${id}--${uid})`)
}

/**
 * Locate the base's nose path BY SHAPE.
 *
 * Colour alone cannot do it: the ears carry the same tone, and so does the neck shadow.
 * The nose is the narrow, centred, upper-middle one.
 */
function findNose(doc: string, fill: string = T.skinShade): string | null {
  for (const m of doc.matchAll(/<path[^>]*\/?>/g)) {
    const p = m[0]
    if (!p.includes(`fill="${fill}"`)) continue
    const d = /d="([^"]*)"/.exec(p)
    if (!d) continue
    const n = (d[1].match(/-?\d+\.?\d*/g) || []).map(Number)
    const xs = n.filter((_, i) => i % 2 === 0)
    const ys = n.filter((_, i) => i % 2 === 1)
    if (!xs.length) continue
    const x0 = Math.min(...xs)
    const x1 = Math.max(...xs)
    const y0 = Math.min(...ys)
    if (x1 - x0 < 200 && (x0 + x1) / 2 > 900 && (x0 + x1) / 2 < 1150 && y0 > 900 && y0 < 1200) {
      return p
    }
  }
  return null
}

/**
 * A composed avatar with the nose taken back out — FOR PREVIEWS ONLY.
 *
 * ⭐ Why this exists at all: an asset picker shows one feature at a time, and a hair thumbnail
 * with a nose in the middle of it is showing the member the wrong thing. Eyes and mouth are
 * already suppressible (`expression`/`eyes`/`mouth` take null); the nose is not, because it is
 * part of the base and compose lifts and re-lays it rather than treating it as a slot.
 *
 * ⚠⚠ A POST-PROCESS, NOT A CONFIG FLAG, and deliberately. `AvatarConfig` is the contract three
 * compositors share — compose.py and builder-template.html would both have to grow the same
 * field, and a display-only concern is not worth widening that contract for. Nothing about
 * composition changes here; a rendered document simply has one path removed afterwards.
 *
 * ⚠ It takes the SKIN because by this point the document has been recoloured: the nose no
 * longer carries `T.skinShade`, it carries whatever that token was swapped to. The shape rule
 * itself is not repeated — `findNose` is the single owner of "which path is the nose", and it
 * is told which fill to look for.
 */
export function stripNose(svg: string, skin: string): string {
  const shade = darken(hex2rgb(skin), 0.88)
  const nose = findNose(svg, shade)
  return nose ? svg.replace(nose, '') : svg
}

/**
 * The two ear paths. They share the nose's tone and the neck shadow's, so colour cannot
 * separate them — what makes an ear an ear is that it sits OUTBOARD of the head's straight
 * sides, where nothing else in the base does.
 */
/** The head: the only skin path that spans the canvas. The neck shares its tone but is narrow. */
function findHead(doc: string): string | null {
  for (const m of doc.matchAll(/<path[^>]*\/?>/g)) {
    const p = m[0]
    if (!p.includes(`fill="${T.skin}"`)) continue
    const d = /d="([^"]*)"/.exec(p)
    if (!d) continue
    const n = (d[1].match(/-?\d+\.?\d*/g) || []).map(Number)
    const xs = n.filter((_, i) => i % 2 === 0)
    if (xs.length && Math.max(...xs) - Math.min(...xs) > 900) return d[1]
  }
  return null
}

/**
 * The base's own shirt, lifted out when a garment replaces it.
 *
 * ⚠ Lifted, not painted over. A garment defines its own silhouette and may be narrower than
 * the default shirt somewhere; leaving the old one underneath would show it peeking out as a
 * second collar, which reads far worse than the background showing through a garment that does
 * not cover enough. If a garment leaves a gap, that is an art problem to catch in review.
 */
function findShirt(doc: string): string[] {
  return [...doc.matchAll(/<path[^>]*\/?>/g)]
    .map((m) => m[0])
    .filter((p) => p.includes(`fill="${T.shirt}"`) || p.includes(`fill="${T.shirt2}"`))
}

function findEars(doc: string): string[] {
  const out: string[] = []
  for (const m of doc.matchAll(/<path[^>]*\/?>/g)) {
    const p = m[0]
    if (!p.includes(`fill="${T.skinShade}"`)) continue
    const d = /d="([^"]*)"/.exec(p)
    if (!d) continue
    const n = (d[1].match(/-?\d+\.?\d*/g) || []).map(Number)
    const xs = n.filter((_, i) => i % 2 === 0)
    if (!xs.length) continue
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2
    if (cx < 600 || cx > 1448) out.push(p)
  }
  return out
}

/**
 * ⭐⭐ THE EYE TOKENS, for one purpose: a tinted lens is OPAQUE, so nothing behind it is drawn.
 * Ryan, 2026-09-21: "When wearing sunglasses, the eyes should not be able to be seen."
 *
 * ⚠ Painting the eyes and letting the lens cover them is not enough, because THE EYE IS BIGGER
 * THAN THE LENS. Measured across all 13 eye assets: the default leaks 8.8% of its area past
 * `s01-classic` and 11.1% past `s02-aviator`, `eye-04-wide` leaks 27.8%, and `eye-hearts` 29.5%
 * — a rim of white and iris standing proud of the frame on every one of them.
 *
 * ⭐ Dropped BY TOKEN and not by position, because position needs polygon geometry and this has
 * to give the same answer in compose.py and in the builder, neither of which has shapely.
 * ⚠ BROWS ARE NOT IN THIS LIST and must not be. They sit at y700..817 against a frame whose top
 * edge is y715, so paint order already hides all but the sliver that stands above the rim —
 * which is what brows do above real sunglasses. Cheeks, blush and tear tracks stay for the same
 * reason. ⚠ The eye white shares its token with an open mouth's TEETH; only the expression's
 * UPPER half is stripped, and teeth are in the lower one.
 */
const EYE_TOKENS = [
  'rgb(255,255,255)', // the eye white
  'rgb(117,62,21)',   // the iris core
  'rgb(150,84,34)',   // the iris rim
  'rgb(90,60,45)',    // the lid line
]

const stripEyes = (frag: string) =>
  frag.replace(/<path[^>]*\/?>/g, (p) =>
    EYE_TOKENS.some((t) => p.includes(`fill="${t}"`)) ? '' : p)

/**
 * Repaint ONLY the canvas rectangle, never every white path in the document.
 *
 * ⚠⚠⚠ THE BACKGROUND AND THE EYE WHITE ARE THE SAME TOKEN, rgb(255,255,255). A global swap
 * therefore repaints every eye white — and the teeth, which share the eye-white token — with
 * the background colour. It has always done this; it has never been VISIBLE because every
 * background in the palette is a near-white tint, so the eye shifted by a degree nobody could
 * see. Put a bold colour in and the avatar gets blue, red or orange eyeballs.
 *
 * ⭐ Fixed by position rather than by tone, because tone cannot tell them apart and BOTH the
 * bases and the eye assets are LOCKED. The background is the canvas rect the base paints first:
 * it is the FIRST path in all four bases and the only one that starts at the canvas origin.
 * Matching `M 0 0` as well as the position means a base that ever stopped leading with it fails
 * to recolour — visibly, on a white avatar — rather than silently painting an eyeball again.
 */
const paintCanvas = (svg: string, colour: string): string => {
  let done = false
  return svg.replace(/<path[^>]*\/?>/g, (p) => {
    if (done || !p.includes(`fill="${T.bg}"`) || !/d="M\s*0[.,\s]+0[\s,]/.test(p)) return p
    done = true
    return p.replace(`fill="${T.bg}"`, `fill="${colour}"`)
  })
}

/** See THE STACK below: an expression is split so its brows go under the hair and its
 *  mouth over a beard. Paths are grouped by their TOP edge against this line. */
const EXPRESSION_SPLIT = 1072

function splitExpression(frag: string): [string, string] {
  const upper: string[] = []
  const lower: string[] = []
  for (const m of frag.matchAll(/<path[^>]*\/?>/g)) {
    const p = m[0]
    const d = /d="([^"]*)"/.exec(p)
    const n = d ? (d[1].match(/-?\d+\.?\d*/g) || []).map(Number) : []
    const ys = n.filter((_, i) => i % 2 === 1)
    ;(ys.length && Math.min(...ys) >= EXPRESSION_SPLIT ? lower : upper).push(p)
  }
  return [upper.join(''), lower.join('')]
}

export function composeAvatar(cfg: AvatarConfig, A: AvatarAssets): string {
  let svg = A.bases[cfg.base]
  if (!svg) throw new Error(`unknown base: ${cfg.base}`)
  const add = (frag: string) => {
    svg = svg.replace('</svg>', frag + '</svg>')
  }

  const fh = cfg.facialHair ? A.facialhair[cfg.facialHair] : null
  const fhOver = !!(cfg.facialHair && A.fhManifest[cfg.facialHair]?.over)

  // ---- phase 1: stack every layer -----------------------------------------------------
  //
  // THE STACK. Everything that goes on top of the head is laid out in ONE place, in one
  // order. The base's own NOSE and EARS are lifted out and re-laid with it, because where
  // the base puts them (last) cannot satisfy all of these at once:
  //
  //   ears          hair falls OVER the ear; a beard's tufts grow in FRONT of it
  //   eyes, brows   a lock falling past the eye passes in front of it, so hair is later
  //   hair          ...but EARLIER than facial hair. Ryan, 2026-09-19: with long hair the
  //                 bushy beard was buried behind it. A beard is on the FACE and the hair
  //                 falls beside it, so the beard wins. The two rules are not in tension:
  //                 the eyes are high and the beard is low, and both hold at once.
  //   facial hair   over the hair, under the nose
  //   mouth         UNDER a moustache (it hangs over the lip) but OVER a beard (the mouth
  //                 sits in the mass) — declared per style in facialhair/manifest.json,
  //                 because coverage cannot decide it: a moustache overlaps the mouth
  //                 region by 34% and stubble by 78%, with nothing clean in between
  //   nose          always last: a raised moustache must never swallow its tip
  const ears = findEars(svg)
  for (const e of ears) svg = svg.replace(e, '')
  const garment = cfg.garment ? A.garments?.[cfg.garment] ?? '' : ''
  if (garment) for (const sh of findShirt(svg)) svg = svg.replace(sh, '')
  const nose = findNose(svg)
  if (nose) svg = svg.replace(nose, '')

  // ⚠⚠ An EXPRESSION is a whole face in ONE fragment — eyes, brows, cheeks AND mouth — so
  // there is no single place for it: its brows must sit UNDER the hair and its mouth must
  // sit OVER a beard. It is therefore SPLIT, on each path's TOP edge.
  //
  // ⭐ The line is not arbitrary. Measured across all 102 paths in the 12 shipped
  // expressions: the upper group — eyes, irises, brows, cheeks, tears — never starts below
  // y999.5, and the lower group — lips, mouth interior, tongue, teeth and chin marks —
  // never starts above y1145.5. y1072 is the middle of that gap and sits just above the
  // beard's own top edge at y1105.8, which is the boundary the split exists for.
  //
  // ⚠ Classifying by TOKEN does not work: an open mouth's TEETH carry the eye-white token,
  // and `laughing`/`sad` put a skin-shade chin mark below the lip. Position does work. A
  // guard test re-derives the gap from the shipped assets, so a new expression straddling
  // the line fails the build instead of rendering a brow over a fringe.
  const [exprUpper, exprLower] = splitExpression(
    cfg.expression ? A.expressions[cfg.expression] ?? '' : '',
  )

  // ---- the body goes in FRONT of the hair ----------------------------------------------
  //
  // ⭐⭐ Every hair asset was traced against base-neck-100 and carries that base's body
  // silhouette as a DIP in its own outline, so on any other base the hair was wrong: a
  // narrower neck left a background crack between the hair and the neck, and a wider one was
  // simply covered — at neck-140 the hair hid 35px of neck on each side, which is why the two
  // wider necks rendered almost identically to the default. Ryan, 2026-09-20.
  //
  // Two derived layers fix it without touching a single locked hair asset:
  //   hairBackfill[h] PER STYLE: the part of the dip next to THAT style's own hair, in the
  //                  HAIR token, painted BEFORE the hair. ⚠ Per style because one shared fill
  //                  draws a hair-coloured rim along the shoulder and down the neck of every
  //                  style that does not cover it — Ryan saw it on the shorter ones.
  //   frontBody[N]   this base's own body MINUS the head, painted AFTER the hair so the body
  //                  sits in front of it at its true width
  //
  // ⚠ "minus the head" is the trick: the neck's top extends 170 units up into the skull and is
  // meant to be hidden there, so re-painting the whole neck later would block the chin.
  // ⚠ The backfill is only for styles long enough to BRACKET the neck — a buzz cut never
  // reaches it, and filling the dip for one would paint hair beside a narrow neck.
  const backfill =
    cfg.hair && A.hairManifest?.[cfg.hair] ? A.hairBackfill?.[cfg.hair] ?? '' : ''

  // ⭐ HAIR THAT FALLS IN FRONT OF THE FACE GOES BACK ON TOP OF THE BEARD. The stack puts
  // facial hair over the hair, which is right for the length hanging BESIDE the head — but
  // wrong for the strands falling across the cheek, which should pass in front of a beard the
  // way they pass in front of everything else on the face. Ryan, 2026-09-20.
  //
  // ⭐⭐ The hair fragment is simply painted A SECOND TIME after the facial hair, masked to the
  // head's own silhouette, so only the part over the face comes back. No asset changes and no
  // new geometry — the bundle does not grow at all, only the composed document.
  //
  // ⚠ Only when there is BOTH hair and facial hair; otherwise it is a copy that cannot change
  // a pixel. ⚠ The copy's own <mask id="facehole"> is renamed, or two elements in one document
  // would carry the same id.
  const headD = fh && cfg.hair ? findHead(svg) : null
  const hairFront = headD
    ? `<defs><mask id="faceonly" maskUnits="userSpaceOnUse" x="0" y="0" width="2048" ` +
      `height="2048"><path d="${headD}" fill="white"/></mask></defs>` +
      `<g mask="url(#faceonly)">${(A.hair[cfg.hair!] ?? '').split('facehole').join('facehole-front')}</g>`
    : ''
  // ⚠ Painted when there is hair OR a garment. With hair it is what puts the body back in
  // front of the hair; with a garment it is the only thing painting a body at all, because the
  // base's own shirt has just been lifted out.
  // ⭐ The mark rides on the body layer, so it needs one too even on a bare default shirt.
  const markLayer = cfg.mark ? A.mark ?? '' : ''
  const neckKey = /(\d+)$/.exec(cfg.base)?.[1] ?? ''
  const bodyFront =
    cfg.hair || garment || markLayer
      ? (garment || (A.frontShirt?.[neckKey] ?? '')) + (A.frontNeck?.[neckKey] ?? '')
      : ''
  // ⭐⭐ EYEWEAR GOES IN FRONT OF THE HAIR. Ryan, 2026-09-21: "The sunglasses should also be in
  // front of some hair of some the hair assets."
  //
  // It first sat UNDER the hair, on the reasoning that a temple arm disappears into hair the way
  // a real one does. That reasoning was sound and the placement still wrong, because the hair
  // that covers eyewear is not mostly at the ear: it is at the TEMPLE, and the temple is inside
  // the head. Measured against the head silhouette (x506..1534), 98.4-99.5% of every eyewear
  // asset sits INSIDE it — only the arm tips beyond the head's own edge fall outside. So there
  // was never a placement that put the lenses in front and left the arms behind; the choice is
  // binary, and in front is the one that reads.
  //
  // ⭐ "Some hair assets" is satisfied by a single global move: putting eyewear in front only
  // changes the styles whose hair actually reaches it — 13.4% of the lens zone on the bob's
  // fringe, nothing at all on a buzz cut.
  //
  // ⚠ Still BEFORE the nose, which stays last: the eyes span y674-1026 and the nose starts at
  // y954.7, so the bridge is above it and the two never meet.
  const glassesLayer = cfg.glasses ? A.glasses?.[cfg.glasses] ?? '' : ''

  // ⭐⭐ AN EARRING BELONGS TO THE EAR, so it is painted WITH the ear — first, before anything
  // that could cover it. Ryan, 2026-09-22: "if you can't see the ears then there should be no
  // seen earring."
  //
  // It first went in front of the hair, reasoning that a chosen accessory should never be
  // invisible. That is the wrong instinct here: hair hanging over an ear hides an earring in
  // life, and an earring floating on top of the hair reads as a mistake. Painting it with the
  // ear makes the rule automatic — no per-style flag, no test of what covers what.
  //
  // ⚠ It is binary in practice. Measured across all 25 hair styles, only f09-midwavy and
  // m15-locs reach the ear at all, and both cover it COMPLETELY — so an earring is either
  // fully visible or fully hidden, never half-eaten.
  const earringsLayer = cfg.earrings ? A.earrings?.[cfg.earrings] ?? '' : ''

  // ⭐ A TINTED LENS HIDES THE EYES ENTIRELY — see EYE_TOKENS. Inferred from the asset rather
  // than declared in a manifest: a style is tinted exactly when it paints a lens, and a clear
  // pair has no lens path at all. Nothing to keep in step.
  const tinted = glassesLayer.includes(T.lensTint)
  const eyeLayer = tinted ? '' : cfg.eyes ? A.eyes[cfg.eyes] ?? A.specialEyes[cfg.eyes] ?? '' : ''
  // ⚠ not `mouth` — phase 2 binds that name to the mouth COLOUR.
  const mouthLayer = (cfg.mouth ? A.mouths[cfg.mouth] ?? '' : '') + exprLower

  add(
    ears.join('') +
      earringsLayer +
      eyeLayer +
      (tinted ? stripEyes(exprUpper) : exprUpper) +
      (fhOver ? mouthLayer : '') +
      backfill +
      (cfg.hair ? A.hair[cfg.hair] ?? '' : '') +
      bodyFront +
      markLayer +
      (fh ? swap(fh, T.hairBase, T.beard) : '') +
      hairFront +
      glassesLayer +
      (fhOver ? '' : mouthLayer) +
      (nose || ''),
  )

  // ---- phase 2: recolour, once, over the finished document ----------------------------
  //
  // ⚠ The two phases must not interleave. They once did, and --eye-colour silently did
  // nothing to a whole-face expression because the swap ran before the paths it was meant
  // to catch existed.
  const eye = hex2rgb(cfg.eyeColour)
  const mouth = hex2rgb(cfg.mouthColour)
  const hair = hex2rgb(cfg.hairColour)
  const skin = hex2rgb(cfg.skin)
  const shirt = hex2rgb(cfg.shirt)

  svg = swap(svg, T.irisCore, rgbStr(eye))
  svg = swap(svg, T.irisRim, lighten(eye, 1.28))

  svg = swap(svg, T.mouthInk, rgbStr(mouth))
  svg = swap(svg, T.mouthDark, darken(mouth, 0.65))
  svg = swap(svg, T.mouthTongue, lighten(mouth, 1.13))

  // The beard tone, derived from the hair colour so one input still drives both. Computed
  // here because the fade below ends at it.
  const beardTone = rgbStr(hair.map((v) => Math.min(255, v + BEARD_LIFT)))
  svg = swap(svg, T.beard, beardTone)

  // ---- the beard fade, off unless cfg.fade ---------------------------------------------
  if (svg.includes(T.fade)) {
    // ⚠⚠ The fade must end at the asset's OWN body tone, not always the hair colour. A
    // stubble asset's body is the STUBBLE token — the derived shadow tone — so fading its
    // band to full hair made the band far darker than the stubble it joins. It read as a dark
    // bar rather than a fade.
    // ⚠ For anything that is not stubble the body is now the BEARD tone, not the raw hair
    // colour — otherwise the band ends darker than the beard it joins, which is the same
    // dark-bar failure the stubble case was written for.
    const body = svg.includes(T.stubble) ? stubbleTone(hair, skin) : beardTone
    if (cfg.fade) {
      // objectBoundingBox units, so the gradient spans whatever path carries it and no
      // coordinates have to be kept in step with the artwork.
      const grad =
        `<defs><linearGradient id="${FADE_ID}" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0" stop-color="${rgbStr(skin)}"/>` +
        `<stop offset="${FADE_SPAN}" stop-color="${body}"/>` +
        `<stop offset="1" stop-color="${body}"/>` +
        `</linearGradient></defs>`
      const cut = svg.indexOf('>', svg.indexOf('<svg')) + 1
      svg = svg.slice(0, cut) + grad + svg.slice(cut)
      svg = swap(svg, T.fade, `url(#${FADE_ID})`)
    } else {
      // ⭐ Graceful fallback, and why the flag is safe: with the feature off the band is
      // simply solid hair, rather than an unswapped marker rendering as violet.
      svg = swap(svg, T.fade, body)
    }
  }

  if (svg.includes(T.frameInk) || svg.includes(T.lensTint) || svg.includes(T.glint)) {
    const frame = hex2rgb(cfg.frameColour ?? DEFAULT_FRAME)
    svg = swap(svg, T.frameInk, rgbStr(frame))
    svg = swap(svg, T.lensTint, rgbStr(LENS_BLACK))
    svg = swap(svg, T.glint, rgbStr(GLASS_TINT))
  }

  if (svg.includes(T.metal)) {
    svg = swap(svg, T.metal, rgbStr(hex2rgb(cfg.metalColour ?? DEFAULT_METAL)))
  }

  svg = swap(svg, T.browInk, darken(hair, 0.82)) // brows track hair, not skin
  svg = swap(svg, T.stubble, stubbleTone(hair, skin))
  svg = swap(svg, T.hairBase, rgbStr(hair))
  svg = swap(svg, T.hairShade, darken(hair))
  svg = swap(svg, T.hairLight, lighten(hair))

  svg = swap(svg, T.skin, rgbStr(skin))
  svg = swap(svg, T.skinShade, darken(skin, 0.88))
  svg = swap(svg, T.blush, mix(skin, [232, 112, 104], 0.22))

  svg = swap(svg, T.shirt, rgbStr(shirt))
  svg = swap(svg, T.shirt2, darken(shirt, 0.9))
  svg = swap(svg, T.shirtLight, lighten(shirt, 1.25))
  svg = swap(svg, T.markInk, mix(shirt, [255, 255, 255], 0.72))
  svg = paintCanvas(svg, rgbStr(hex2rgb(cfg.background)))

  // ⚠ LAST, over the finished document. Before this point the hair copy is still being
  // renamed by literal id and the gradient is still being referenced by name.
  return uniquifyIds(svg)
}

/** Palettes offered in the customiser. Values, not assets — see AVATAR_CONFIG.md. */
export const PALETTE = {
  skin: ['#FFE0C4', '#F7D9BC', '#F5C9A6', '#E0AC7E', '#C68642', '#8D5524', '#6B4226', '#4A2C14'],
  hair: ['#1A1110', '#2B1B12', '#4A3B32', '#6B4A2F', '#A9713B', '#D4A857', '#B33A3A', '#8E8E93', '#E8E8ED'],
  eye: ['#3E2612', '#5B3A1E', '#8B5E3C', '#2E7D32', '#2E6FD9', '#4B5563'],
  mouth: ['#B67A70', '#C4736B', '#A85E58', '#D08A82'],
  shirt: ['#3B6EFF', '#16A34A', '#C2410C', '#7C3AED', '#0F766E', '#DB2777', '#111827', '#F59E0B'],
  // ⭐⭐ THE SAME LIST A PERSON IS RECOGNISED BY, not a palette of its own. Ryan,
  // 2026-09-25: the avatar's background IS the member's colour, and that colour is
  // what a Showdown duel glows with. Two lists would let a member's avatar and their
  // duel side disagree, which is the one thing this colour exists to prevent.
  //
  // ⚠ These are the DARK tone of each entry. The glow stop is light so it survives
  // the midnight duel ground; a background has the opposite job, because the head is
  // pale skin and needs a dark ground to have an edge. See AVATAR_BACKGROUNDS.
  //
  // ⚠⚠ COPIED, NOT IMPORTED — and that is deliberate. This file has no imports: it is
  // a port of compose.py and is itself mirrored into builder-template.html, which is
  // plain HTML that can import nothing. So the same thirteen values exist in three
  // places and TWO guard tests pin them together. Change one, change all three.
  background: [
    '#F47A93', // rose
    '#FFC3C4', // blush
    '#FE9F98', // salmon
    '#E98661', // coral
    '#BB9E43', // olive
    '#BDBD71', // sage
    '#88AC52', // moss
    '#BDDAA9', // fern
    '#7EC993', // jade
    '#0DB68B', // emerald
    '#93E0CE', // mint
    '#0DB3A9', // teal
    '#17CBDE', // lagoon
    '#8CDDFA', // ice
    '#5AC3FE', // sky
    '#41A6FA', // azure
    '#BFD2FE', // powder
    '#A6B5FF', // periwinkle
    '#AB92EB', // lilac
    '#D285D3', // orchid
    '#F8C1E7', // petal
    '#EA7CB4', // pink
  ],
  frame: ['#22262E', '#6B4A2F', '#C9A227', '#9AA3AD', '#1F3A64', '#B36A72'],
  metal: ['#D4A017', '#B8BCC4', '#C08878', '#2A2A2E', '#E8E0C8', '#8C6239'],
} as const
