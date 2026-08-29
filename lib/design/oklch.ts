// =============================================================
// OKLab — enough of it to derive a stripe's top stop from a brand colour
// =============================================================
// The pool card's left stripe is the competition's brand colour. It is drawn as
// a two-stop gradient rather than a flat bar, because every stripe in the app
// already is one (`poolModeGradient` is three such pairs) and a flat bar beside
// them would read as a different component.
//
// So one authored colour has to yield two stops. Doing that in sRGB — scaling
// the channels toward white — DESATURATES as it lightens: Premier League purple
// lightened 18% that way comes out a dusty lilac, because the shortest path to
// white in the RGB cube runs through grey. Moving lightness in OKLab holds hue
// and chroma steady, so the top stop still looks like the same purple.
//
// That is the whole job. Coefficients are Björn Ottosson's OKLab matrices, kept
// here rather than pulled from a package: it is thirty lines, it has no
// versioning risk, and lib/design is mirrored into the React Native app where a
// transitive dependency costs more than the maths does.
// =============================================================

export type Oklab = { L: number; a: number; b: number }

export function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number]
}

export function toHex(rgb: [number, number, number]): string {
  return (
    '#' +
    rgb
      .map((v) => {
        const s = Math.max(0, Math.min(255, Math.round(v))).toString(16)
        return s.length === 1 ? '0' + s : s
      })
      .join('')
      .toUpperCase()
  )
}

const toLinear = (v: number): number => {
  const n = v / 255
  return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4)
}

const toSrgb = (v: number): number =>
  255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)

export function toOklab(hex: string): Oklab {
  const [r, g, b] = parseHex(hex).map(toLinear)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  }
}

/** The raw, UNCLAMPED sRGB channels. Values outside 0–255 mean out of gamut. */
function toRawRgb({ L, a, b }: Oklab): [number, number, number] {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3)
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3)
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3)
  return [
    toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}

/** Back to an sRGB hex. Out-of-gamut results are clamped per channel. */
export function fromOklab(c: Oklab): string {
  return toHex(toRawRgb(c))
}

const EPSILON = 0.5 / 255
const inGamut = (c: Oklab): boolean =>
  toRawRgb(c).every((v) => v >= -EPSILON * 255 && v <= 255 + EPSILON * 255)

/** Perceptual lightness, 0 (black) to 1 (white). */
export function lightness(hex: string): number {
  return toOklab(hex).L
}

/**
 * Move a colour's lightness, holding hue, and holding chroma as far as sRGB
 * allows.
 *
 * `delta` is in OKLab lightness units, so +0.14 is the same perceived step on
 * Ligue 1's navy as on the World Cup's gold — which is the whole reason for
 * doing this here rather than by scaling each channel toward white.
 *
 * ⚠ CHROMA HAS TO GIVE, or the promise above is false for exactly the colours
 * that need it most. sRGB is narrowest at high chroma, so a saturated red asked
 * to go 0.14 lighter at constant chroma lands outside the gamut; clamping the
 * channels then silently drops it back to about half the lift. La Liga's
 * #EE2737 reached 0.698 instead of 0.752 that way, so the two reddest
 * competitions had visibly flatter stripes than everyone else and nothing said
 * so.
 *
 * The fix is the standard one: keep the lightness, keep the hue, and bisect
 * chroma down until the colour fits. Sixteen iterations puts the result within
 * ~0.002% of the gamut boundary, which is far below a rounded 8-bit channel.
 * A colour that already fits skips the loop entirely, which is most of them.
 */
export function adjustLightness(hex: string, delta: number): string {
  const c = toOklab(hex)
  const target: Oklab = { ...c, L: Math.max(0.05, Math.min(0.97, c.L + delta)) }
  if (inGamut(target)) return fromOklab(target)

  let lo = 0
  let hi = 1
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2
    if (inGamut({ ...target, a: target.a * mid, b: target.b * mid })) lo = mid
    else hi = mid
  }
  return fromOklab({ ...target, a: target.a * lo, b: target.b * lo })
}

/**
 * Set a colour to an absolute lightness, holding hue and as much chroma as
 * sRGB allows.
 *
 * Used for the mode pill's text. Deriving the ink from a TARGET lightness
 * rather than from a delta is what makes seven differently-lit brand colours
 * come out at comparable contrast: #059669 and #E11D48 start 0.14 apart, so the
 * same delta would leave one pill noticeably fainter than the other.
 */
export function withLightness(hex: string, L: number): string {
  return adjustLightness(hex, L - lightness(hex))
}
