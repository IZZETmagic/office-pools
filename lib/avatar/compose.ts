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
// A blush is the skin pulled 22% toward rose, and stubble is the hair pulled 55% toward the
// skin. Both exist because fixed colours were wrong on dark skin: a fixed pink blush read as
// clown makeup, and stubble at full hair strength read as a second short beard.
// =============================================================

export type AvatarAssets = {
  bases: Record<string, string>
  hair: Record<string, string>
  expressions: Record<string, string>
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
} as const

const FADE_ID = 'beardfade'

type RGB = [number, number, number]

const hex2rgb = (h: string): RGB => {
  const s = h.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)) as RGB
}
const rgbStr = (c: number[]) => `rgb(${c[0]},${c[1]},${c[2]})`
const darken = (c: RGB, f = 0.78) => rgbStr(c.map((v) => Math.max(0, Math.trunc(v * f))))
const lighten = (c: RGB, f = 1.22) => rgbStr(c.map((v) => Math.min(255, Math.trunc(v * f))))
const mix = (a: RGB, b: RGB, t: number) => rgbStr(a.map((v, i) => Math.trunc(v + (b[i] - v) * t)))

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
  // Facial hair that sits UNDER the mouth goes in before the NOSE, so a moustache tucks
  // behind the nose rather than swallowing its tip when it is raised.
  if (fh && !fhOver) {
    const nose = findNose(svg)
    if (nose) svg = svg.replace(nose, fh + nose)
    else add(fh)
  }

  if (cfg.expression) {
    add(A.expressions[cfg.expression] ?? '')
  } else {
    if (cfg.eyes) add(A.eyes[cfg.eyes] ?? A.specialEyes[cfg.eyes] ?? '')
    if (cfg.mouth) add(A.mouths[cfg.mouth] ?? '')
  }

  // An "over" style goes on after the face, taking the nose with it so the nose stays on
  // top. Declared per style in facialhair/manifest.json — it cannot be inferred, because a
  // moustache overlaps the mouth region by 34% and stubble by 78% with nothing clean between.
  if (fh && fhOver) {
    const nose = findNose(svg)
    if (nose) svg = svg.replace(nose, '')
    add(fh + (nose || ''))
  }

  if (cfg.hair) add(A.hair[cfg.hair] ?? '')

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

  // ---- the beard fade, off unless cfg.fade ---------------------------------------------
  if (svg.includes(T.fade)) {
    if (cfg.fade) {
      // objectBoundingBox units, so the gradient spans whatever path carries it and no
      // coordinates have to be kept in step with the artwork.
      const grad =
        `<defs><linearGradient id="${FADE_ID}" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0" stop-color="${rgbStr(skin)}"/>` +
        `<stop offset="1" stop-color="${rgbStr(hair)}"/>` +
        `</linearGradient></defs>`
      const cut = svg.indexOf('>', svg.indexOf('<svg')) + 1
      svg = svg.slice(0, cut) + grad + svg.slice(cut)
      svg = swap(svg, T.fade, `url(#${FADE_ID})`)
    } else {
      // ⭐ Graceful fallback, and why the flag is safe: with the feature off the band is
      // simply solid hair, rather than an unswapped marker rendering as violet.
      svg = swap(svg, T.fade, rgbStr(hair))
    }
  }

  svg = swap(svg, T.browInk, darken(hair, 0.82)) // brows track hair, not skin
  svg = swap(svg, T.stubble, mix(hair, skin, 0.55))
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
