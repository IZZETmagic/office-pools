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
  /** Derived body layers — see THE STACK. Optional so older fixtures still compose. */
  frontBody?: Record<string, string>
  hairBackfill?: string
  hairManifest?: Record<string, boolean>
  facialhair: Record<string, string>
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
  /** Whole-face expression. Mutually exclusive with eyes+mouth. */
  expression?: string | null
  eyes?: string | null
  mouth?: string | null
  eyeColour: string
  mouthColour: string
  shirt: string
  background: string
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

const swap = (s: string, find: string, rep: string) => s.split(`fill="${find}"`).join(`fill="${rep}"`)

/**
 * Locate the base's nose path BY SHAPE.
 *
 * Colour alone cannot do it: the ears carry the same tone, and so does the neck shadow.
 * The nose is the narrow, centred, upper-middle one.
 */
function findNose(doc: string): string | null {
  for (const m of doc.matchAll(/<path[^>]*\/?>/g)) {
    const p = m[0]
    if (!p.includes(`fill="${T.skinShade}"`)) continue
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
 * The two ear paths. They share the nose's tone and the neck shadow's, so colour cannot
 * separate them — what makes an ear an ear is that it sits OUTBOARD of the head's straight
 * sides, where nothing else in the base does.
 */
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
  //   hairBackfill   the neck-100 body in the HAIR token, painted BEFORE the hair so the hair
  //                  is solid behind the body and the dip cannot show through
  //   frontBody[N]   this base's own body MINUS the head, painted AFTER the hair so the body
  //                  sits in front of it at its true width
  //
  // ⚠ "minus the head" is the trick: the neck's top extends 170 units up into the skull and is
  // meant to be hidden there, so re-painting the whole neck later would block the chin.
  // ⚠ The backfill is only for styles long enough to BRACKET the neck — a buzz cut never
  // reaches it, and filling the dip for one would paint hair beside a narrow neck.
  const backfill = cfg.hair && A.hairManifest?.[cfg.hair] ? A.hairBackfill ?? '' : ''
  const frontBody = cfg.hair ? A.frontBody?.[/(\d+)$/.exec(cfg.base)?.[1] ?? ''] ?? '' : ''
  const eyeLayer = cfg.eyes ? A.eyes[cfg.eyes] ?? A.specialEyes[cfg.eyes] ?? '' : ''
  // ⚠ not `mouth` — phase 2 binds that name to the mouth COLOUR.
  const mouthLayer = (cfg.mouth ? A.mouths[cfg.mouth] ?? '' : '') + exprLower

  add(
    ears.join('') +
      eyeLayer +
      exprUpper +
      (fhOver ? mouthLayer : '') +
      backfill +
      (cfg.hair ? A.hair[cfg.hair] ?? '' : '') +
      frontBody +
      (fh ? swap(fh, T.hairBase, T.beard) : '') +
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
  svg = swap(svg, T.bg, rgbStr(hex2rgb(cfg.background)))
  return svg
}

/** Palettes offered in the customiser. Values, not assets — see AVATAR_CONFIG.md. */
export const PALETTE = {
  skin: ['#FFE0C4', '#F7D9BC', '#F5C9A6', '#E0AC7E', '#C68642', '#8D5524', '#6B4226', '#4A2C14'],
  hair: ['#1A1110', '#2B1B12', '#4A3B32', '#6B4A2F', '#A9713B', '#D4A857', '#B33A3A', '#8E8E93', '#E8E8ED'],
  eye: ['#3E2612', '#5B3A1E', '#8B5E3C', '#2E7D32', '#2E6FD9', '#4B5563'],
  mouth: ['#B67A70', '#C4736B', '#A85E58', '#D08A82'],
  shirt: ['#3B6EFF', '#16A34A', '#C2410C', '#7C3AED', '#0F766E', '#DB2777', '#111827', '#F59E0B'],
  background: ['#FFFFFF', '#EEF2FF', '#ECFDF5', '#FEF3C7', '#FCE7F3', '#F3F4F6'],
} as const
