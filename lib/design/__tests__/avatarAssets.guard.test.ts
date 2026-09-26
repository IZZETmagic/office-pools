// =============================================================
// Avatar bases and layer assets must stay renderable on BOTH platforms
// =============================================================
// The avatar system composites SVG fragments onto a locked base: `assets/character-base/
// nano/bases/*.svg` plus `assets/character-base/nano/hair/assets/*.asset.svg`. Web renders
// them inline; mobile renders them through `react-native-svg`.
//
// ## Why the transform rule exists
//
// An SVG shape is a list of coordinates. You can also attach a `transform` attribute —
// "draw it, then shift it 50px right" — as a shortcut instead of editing the numbers.
// **Browsers honour it. `react-native-svg` silently ignores it.** No error, no type
// complaint, no log line. On the home card a `transform="rotate(-90 12 12)"` did nothing
// on the phone and the wrong-looking arc shipped; only Ryan looking at his device caught
// it (see commit f14ebc0).
//
// So a transform is a picture that differs per platform, and it fails in the one direction
// nothing catches: correct on the machine you're developing on. The rule is therefore that
// geometry lives in coordinates, never in a transform. `neck-width.py` already works that
// way — it remaps coordinates rather than wrapping shapes in a scaled group.
//
// `translate(0,0)` is grandfathered: Recraft's vectorizer emits it on every path, it is a
// no-op, and the four locked assets carry it. Stripping it was verified to change exactly
// 0 pixels of 1,048,576 — but the files are locked, so the rule bends instead. New assets
// should emit no transform at all.
//
// ## Why the checksums are in here
//
// The locked files are chmod 444 with a LOCKED.sha256 beside them, and a LOCKED.md saying
// they do not change without an explicit request. A rule nothing checks is a wish. This
// turns the lock into a build failure.
//
// ⚠ THIS PROVES THE FILES, NOT THE RENDER. It cannot prove `react-native-svg` draws them
// correctly — in particular the `<mask>` on three hair assets, which is only provable on a
// device. Same limitation the competition-mark guard has.
// =============================================================

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { createHash } from 'crypto'
import { resolve, join, basename } from 'path'

const ROOT = process.cwd()
const BASES = 'assets/character-base/nano/bases'
const HAIR = 'assets/character-base/nano/hair/assets'
const EYES = 'assets/character-base/nano/eyes/assets'
const MOUTHS = 'assets/character-base/nano/mouths/assets'
const FACIALHAIR = 'assets/character-base/nano/facialhair/assets'
const GLASSES = 'assets/character-base/nano/glasses/assets'
const EARRINGS = 'assets/character-base/nano/earrings/assets'
const GARMENTS = 'assets/character-base/nano/garments/assets'

/** Recraft emits this on every path; it is a no-op and the locked assets carry it. */
const GRANDFATHERED = 'translate(0,0)'

/** Canonical hair tones. Three, not two: some styles trace as a DARK base with LIGHTER
 *  texture (short-sides), so collapsing texture to a single darker token erases the detail. */
const HAIR_BASE = 'rgb(140,122,110)'
const HAIR_SHADE = 'rgb(114,97,86)'
const HAIR_LIGHT = 'rgb(168,150,138)'

/** The shared coordinate space. Assets register by living in the base's viewBox. */
const VIEWBOX = 'viewBox="0 0 2048 2048"'

/** The iris tokens. compose.py recolours these from --eye-colour with a plain string swap
 *  across the whole composed document, so ANY other feature painted in them gets dragged
 *  along. A mouth drawn in iris brown would turn blue whenever the eyes did. */
const IRIS_CORE = 'rgb(117,62,21)'
const IRIS_RIM = 'rgb(150,84,34)'

const svgsIn = (dir: string) =>
  readdirSync(resolve(ROOT, dir))
    .filter((f) => f.endsWith('.svg'))
    .map((f) => ({ name: f, path: join(dir, f), body: readFileSync(resolve(ROOT, dir, f), 'utf8') }))

describe('avatar assets stay cross-platform', () => {
  it('uses no transform that react-native-svg would silently drop', () => {
    const offenders: string[] = []
    for (const f of [...svgsIn(BASES), ...svgsIn(HAIR), ...svgsIn(EYES), ...svgsIn(MOUTHS),
                     ...svgsIn(GLASSES), ...svgsIn(EARRINGS), ...svgsIn(GARMENTS)]) {
      for (const m of f.body.matchAll(/transform="([^"]*)"/g)) {
        if (m[1].replace(/\s/g, '') !== GRANDFATHERED) offenders.push(`${f.name}: ${m[1]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps every asset in the base coordinate space', () => {
    for (const f of [...svgsIn(BASES), ...svgsIn(HAIR), ...svgsIn(EYES), ...svgsIn(MOUTHS),
                     ...svgsIn(GLASSES), ...svgsIn(EARRINGS), ...svgsIn(GARMENTS)]) {
      expect(f.body, `${f.name} must declare ${VIEWBOX}`).toContain(VIEWBOX)
    }
  })

  it('paints hair only in the canonical tones', () => {
    for (const f of svgsIn(HAIR)) {
      const fills = [...f.body.matchAll(/fill="(rgb\([^)]*\))"/g)].map((m) => m[1])
      const allowed = new Set([HAIR_BASE, HAIR_SHADE, HAIR_LIGHT])
      const unexpected = [...new Set(fills)].filter((c) => !allowed.has(c))
      expect(unexpected, `${f.name} has off-palette fills`).toEqual([])
    }
  })

  it('wraps masked hair in a group so consumers cannot drop the mask', () => {
    // A style overlapping the face carries its face silhouette as a mask. Anything
    // consuming the asset must take its FULL inner markup — pulling <path> elements out
    // with a regex drops the wrapper and paints the black silhouette onto the face.
    for (const f of svgsIn(HAIR)) {
      if (!f.body.includes('<mask')) continue
      expect(f.body, `${f.name} defines a mask but never applies it`).toContain('mask="url(#facehole)"')
    }
  })

  it('keeps mouths off the iris palette', () => {
    // Not "mouths use only the mouth ink" — the open-mouth assets still to come carry white
    // teeth and a dark interior, so a closed palette would have to be reopened. The durable
    // invariant is the collision: a mouth must never share a token with the iris.
    for (const f of svgsIn(MOUTHS)) {
      const fills = [...f.body.matchAll(/fill="(rgb\([^)]*\))"/g)].map((m) => m[1])
      const clash = [...new Set(fills)].filter((c) => c === IRIS_CORE || c === IRIS_RIM)
      expect(clash, `${f.name} paints in an iris token — --eye-colour would repaint it`).toEqual([])
    }
  })

  it('has not altered a locked file', () => {
    for (const dir of [BASES, HAIR, EYES, MOUTHS, FACIALHAIR, GLASSES, EARRINGS, GARMENTS]) {
      const manifest = resolve(ROOT, dir, 'LOCKED.sha256')
      if (!existsSync(manifest)) continue
      for (const line of readFileSync(manifest, 'utf8').trim().split('\n')) {
        const [expected, file] = line.trim().split(/\s+/)
        const actual = createHash('sha256')
          .update(readFileSync(resolve(ROOT, dir, basename(file))))
          .digest('hex')
        expect(actual, `${file} has changed — it is locked, see ${dir}/LOCKED.md`).toBe(expected)
      }
    }
  })
})

// =============================================================
// The beard fade is OFF by default — this is the back-out
// =============================================================
// `compose.ts` can turn a facial-hair asset's sideburn band into a vertical gradient running
// from the skin colour to the hair colour, so the beard dissolves into the face. It is behind
// `cfg.fade` and defaults to off.
//
// ⚠⚠ Two things make that back-out real rather than a promise:
//
//   1. with the flag off the marker is swapped for the FLAT HAIR COLOUR — the behaviour that
//      existed before the feature — so nothing renders differently and nothing renders violet
//   2. these tests fail if either property breaks, so a regression stops the build instead of
//      shipping a gradient nobody asked for, or a raw marker tone on a customer's avatar
//
// To remove the feature entirely: `git revert` the commit that introduced it. Nothing else
// depends on it — no asset carries the marker yet, which is why `composes clean` below holds.
//
// ⚠ <linearGradient> is supported by react-native-svg but has NEVER been proven on a device in
// this project. It is in the same unverified pile as the <mask> on three hair assets.
// =============================================================

import { composeAvatar, headOnly, PALETTE, type AvatarAssets } from '@/lib/avatar/compose'
import { AVATAR_BACKGROUNDS } from '@/lib/design/avatarGradient'

const FADE_MARKER = 'rgb(126,110,150)'
const BEARD_MARKER = 'rgb(110,150,126)'
/** hex2rgb('#8B5E3C') + BEARD_LIFT on each channel — the tone facial hair is filled with. */
const BEARD_TONE = 'rgb(151,106,72)'

/** The smallest thing that exercises the compositor: a base plus one facial-hair band. */
const fixture = (): AvatarAssets => ({
  bases: {
    b: '<svg viewBox="0 0 2048 2048"><path d="M 0 0 L 1 0 L 1 1 Z" fill="rgb(254,205,180)"/></svg>',
  },
  hair: {},
  expressions: {},
  facialhair: { f: `<path d="M 516 860 L 616 860 L 616 1200 Z" fill="${FADE_MARKER}"/>` },
  eyes: {},
  specialEyes: {},
  mouths: {},
  fhManifest: {},
})

const cfg = {
  base: 'b', skin: '#F5C9A6', hair: null, hairColour: '#8B5E3C', facialHair: 'f',
  eyeColour: '#5B3A1E', mouthColour: '#B67A70', shirt: '#3B6EFF', background: '#FFFFFF',
}

describe('the beard fade is opt-in', () => {
  it('emits no gradient by default, and leaves no raw marker behind', () => {
    const svg = composeAvatar(cfg, fixture())
    expect(svg, 'default must not emit a gradient').not.toContain('linearGradient')
    expect(svg, 'default must not reference one').not.toContain('url(#')
    expect(svg, 'the marker must never reach the output').not.toContain(FADE_MARKER)
    // ⚠ the BEARD tone, not the raw hair colour — facial hair is the hair colour lightened
    // 14% so a beard does not vanish into long hair. lighten('#8B5E3C', 1.14).
    expect(svg, 'with the fade off the band is the flat beard tone').toContain(BEARD_TONE)
  })

  it('emits a hair-to-skin gradient when asked', () => {
    const svg = composeAvatar({ ...cfg, fade: true }, fixture())
    // ⚠ the id carries a per-document suffix — see 'ids are scoped to the document' below.
    expect(svg).toMatch(/<linearGradient id="beardfade--[a-z0-9]+"/)
    expect(svg).toMatch(/url\(#beardfade--[a-z0-9]+\)/)
    expect(svg, 'the marker must never reach the output').not.toContain(FADE_MARKER)
    // skin at the top, hair at the bottom — the direction is the whole point
    expect(svg).toContain('offset="0" stop-color="rgb(245,201,166)"')
    expect(svg, 'the fade ends at the BEARD tone, or the band is darker than the beard it joins')
      .toContain(`offset="1" stop-color="${BEARD_TONE}"`)
  })

  // ⚠ This test USED to assert that no shipped asset carried the marker, which is how the
  // feature stayed inert. Three beards now carry it deliberately, so the assertion that matters
  // has moved: a marked asset must still render correctly with the fade OFF. That is the
  // back-out — `cfg.fade` false must produce today's flat behaviour and never a raw violet.
  it('a marked asset still renders flat with the fade off', () => {
    const marked = svgsIn(FACIALHAIR)
      .filter((f) => f.body.includes(FADE_MARKER))
    expect(marked.length, 'the marked beards should be present').toBeGreaterThan(0)

    for (const f of marked) {
      const assets = { ...fixture(), facialhair: { f: f.body } }
      const off = composeAvatar(cfg, assets)
      expect(off, `${f.name}: no gradient with the fade off`).not.toContain('linearGradient')
      expect(off, `${f.name}: the marker must never reach output`).not.toContain(FADE_MARKER)

      const on = composeAvatar({ ...cfg, fade: true }, assets)
      expect(on, `${f.name}: gradient when asked`).toContain('linearGradient')
      expect(on, `${f.name}: the marker must never reach output`).not.toContain(FADE_MARKER)
    }
  })

  // ⚠⚠ The flag being opt-in is the back-out, but it also means the fade is INVISIBLE until a
  // caller asks for it — and that is exactly how a build reached dev with the fullbeard and
  // chinstrap sideburn bands rendering as solid hair bars. Every asset was correct; nobody
  // turned it on. The admin builder is the surface where the fade was approved, so it must ask.
  it('the admin builder asks for the fade — the flag is useless unless a caller sets it', () => {
    const tab = readFileSync(
      join(process.cwd(), 'app/admin/super/AvatarsTab.tsx'),
      'utf8',
    )
    expect(tab, 'AvatarsTab must set fade: true in its DEFAULT config').toMatch(/fade:\s*true/)
  })

  it('no HAIR asset carries the fade marker — it is a facial-hair token', () => {
    for (const dir of [HAIR, EYES, MOUTHS]) {
      for (const f of svgsIn(dir)) {
        expect(f.body, `${f.name} carries the fade marker`).not.toContain(FADE_MARKER)
      }
    }
  })
})

// =============================================================
// Stubble is a shadow, not a short beard — and every composer must agree
// =============================================================
// Measured off the art Ryan approved on 2026-09-18, stubble is 84% of the way from the beard
// to the skin in lightness and clearly greyer than the hair-to-skin line. The token used to
// be filled with a plain 55% mix, a mid brown that read as a lighter full beard for a week.
//
// ⚠⚠ The derivation lives in THREE places: lib/avatar/compose.ts (the product), compose.py
// (the asset pipeline) and builder-template.html (the admin builder's port). If they drift,
// the builder lies about what the product renders. These tests pin the product's output to a
// literal and pin the other two files to the same constants.
// =============================================================

const STUBBLE_TOKEN = 'rgb(164,150,140)'
/** stubbleTone(#8B5E3C, #F5C9A6) — 83% toward skin, then 55% toward its own grey. */
const STUBBLE_EXPECTED = 'rgb(206,186,170)'

const stubbleFixture = (): AvatarAssets => ({
  ...fixture(),
  facialhair: {
    f:
      `<path d="M 700 1200 L 1300 1200 L 1300 1500 Z" fill="${STUBBLE_TOKEN}"/>` +
      `<path d="M 516 860 L 616 860 L 616 1200 Z" fill="${FADE_MARKER}"/>`,
  },
})

describe('stubble is derived as a shadow, identically everywhere', () => {
  it('fills the stubble token with the derived shadow tone', () => {
    const svg = composeAvatar(cfg, stubbleFixture())
    expect(svg, 'the token must never reach the output').not.toContain(STUBBLE_TOKEN)
    expect(svg).toContain(`fill="${STUBBLE_EXPECTED}"`)
    expect(svg, 'a 55% mix is the old beard-coloured stubble').not.toContain('rgb(197,152,118)')
  })

  it('fades a stubble band to the stubble tone, not to full hair', () => {
    const off = composeAvatar(cfg, stubbleFixture())
    expect(off, 'fade off: the band is flat stubble').not.toContain('rgb(139,94,60)')
    const on = composeAvatar({ ...cfg, fade: true }, stubbleFixture())
    expect(on).toContain(`offset="1" stop-color="${STUBBLE_EXPECTED}"`)
  })

  it('keeps the same two constants in the Python composer and the builder port', () => {
    for (const file of [
      'assets/character-base/nano/compose.py',
      'assets/character-base/nano/builder-template.html',
    ]) {
      const src = readFileSync(join(process.cwd(), file), 'utf8')
      expect(src, `${file}: STUBBLE_TOWARD_SKIN`).toMatch(/STUBBLE_TOWARD_SKIN\s*=\s*0\.83\b/)
      expect(src, `${file}: STUBBLE_TOWARD_GREY`).toMatch(/STUBBLE_TOWARD_GREY\s*=\s*0\.55\b/)
      expect(src, `${file}: still mixes stubble the old way`).not.toMatch(/stubble[^\n]*0\.55\)/i)
    }
    const ts = readFileSync(join(process.cwd(), 'lib/avatar/compose.ts'), 'utf8')
    expect(ts).toMatch(/STUBBLE_TOWARD_SKIN = 0\.83\b/)
    expect(ts).toMatch(/STUBBLE_TOWARD_GREY = 0\.55\b/)
  })
})

// =============================================================
// Facial hair paints OVER the ears
// =============================================================
// The base paints the ears last, so a beard whose sideburns grow outboard was clipped by
// them — the bushy beard's tufts hit a square edge at the ear. Ryan asked for that hair to
// sit slightly in front. The ears are therefore re-inserted ahead of the facial hair, which
// also makes "under" styles agree with "over" ones: a moustache is appended after the whole
// face and so has always painted over the ears.
//
// ⚠ The nose still goes LAST of the three. A moustache tucks behind the nose rather than
// swallowing its tip, and that ordering is what this test pins alongside the ears.
// =============================================================

const SKIN_SHADE = 'rgb(245,178,150)'
// ⚠ Match on the PATH DATA, never the whole element: phase 2 recolours every fill, so the
// ear you put in is not the string that comes out. `d` is the only stable handle.
const D_EAR_L = 'M 371 799 L 517 799 L 517 1024 L 371 1024 Z'
const D_EAR_R = 'M 1531 799 L 1649 799 L 1649 1024 L 1531 1024 Z'
const D_NOSE = 'M 961 955 L 1084 955 L 1084 1131 L 961 1131 Z'
const D_BEARD = 'M 700 1200 L 1300 1200 L 1300 1500 Z'

const earedFixture = (over: boolean): AvatarAssets => ({
  ...fixture(),
  bases: {
    b:
      `<svg viewBox="0 0 2048 2048">` +
      `<path d="${D_EAR_L}" fill="${SKIN_SHADE}"/>` +
      `<path d="${D_EAR_R}" fill="${SKIN_SHADE}"/>` +
      `<path d="${D_NOSE}" fill="${SKIN_SHADE}"/>` +
      `</svg>`,
  },
  facialhair: { f: `<path d="${D_BEARD}" fill="rgb(140,122,110)"/>` },
  fhManifest: { f: { over } },
})

describe('facial hair paints over the ears', () => {
  it('puts both ears before the beard, and the nose after it', () => {
    const svg = composeAvatar(cfg, earedFixture(false))
    const at = (d: string) => svg.indexOf(`d="${d}"`)
    for (const [name, d] of [['left ear', D_EAR_L], ['right ear', D_EAR_R],
                             ['beard', D_BEARD], ['nose', D_NOSE]] as const) {
      expect(at(d), `${name} must survive composition`).toBeGreaterThan(-1)
    }
    expect(at(D_EAR_L), 'the left ear must paint before the beard').toBeLessThan(at(D_BEARD))
    expect(at(D_EAR_R), 'the right ear must paint before the beard').toBeLessThan(at(D_BEARD))
    expect(at(D_BEARD), 'the nose must still paint after the beard').toBeLessThan(at(D_NOSE))
    expect(svg.split(`d="${D_EAR_L}"`).length - 1, 'the ear is MOVED, never duplicated').toBe(1)
  })

  it('leaves an "over" style alone — it already lands after the ears', () => {
    const svg = composeAvatar(cfg, earedFixture(true))
    const at = (d: string) => svg.indexOf(`d="${d}"`)
    expect(at(D_EAR_L), 'ear before the moustache').toBeLessThan(at(D_BEARD))
    expect(at(D_BEARD), 'nose still last').toBeLessThan(at(D_NOSE))
    expect(svg.split(`d="${D_EAR_L}"`).length - 1, 'never duplicated').toBe(1)
  })

  it('keeps the same ear move in the Python composer and the builder port', () => {
    for (const file of [
      'assets/character-base/nano/compose.py',
      'assets/character-base/nano/builder-template.html',
      'lib/avatar/compose.ts',
    ]) {
      const src = readFileSync(join(process.cwd(), file), 'utf8')
      expect(src, `${file} must locate the ears`).toMatch(/find_ears|findEars/)
    }
  })
})

// =============================================================
// THE STACK — one order, and an expression is split to satisfy it
// =============================================================
// Three rules have to hold at once and the base's own paint order cannot give all three:
// hair falls over the brows, a beard sits over the hair, and the mouth sits over the beard.
// ⭐ Ryan, 2026-09-19: with long hair the bushy beard was buried behind it.
//
// An expression is a whole face in ONE fragment, so it is split on each path's TOP edge at
// y1072 — brows and eyes above, mouth and teeth below. The third test here re-derives that
// gap from the SHIPPED expression assets, so a new expression that straddles the line fails
// the build instead of quietly rendering a brow on top of a fringe.
// =============================================================

const EXPRESSIONS = 'assets/character-base/nano/expressions/assets'
const SPLIT = 1072
const D_HAIR = 'M 300 300 L 800 300 L 800 900 Z'
const D_FH = 'M 700 1200 L 1300 1200 L 1300 1500 Z'
const D_EYES = 'M 700 700 L 900 700 L 900 900 Z'
const D_MOUTH = 'M 900 1250 L 1150 1250 L 1150 1350 Z'

const stackFixture = (over: boolean): AvatarAssets => ({
  ...fixture(),
  bases: {
    b:
      `<svg viewBox="0 0 2048 2048">` +
      `<path d="${D_EAR_L}" fill="${SKIN_SHADE}"/>` +
      `<path d="${D_NOSE}" fill="${SKIN_SHADE}"/>` +
      `</svg>`,
  },
  hair: { h: `<path d="${D_HAIR}" fill="rgb(140,122,110)"/>` },
  eyes: { e: `<path d="${D_EYES}" fill="rgb(255,255,255)"/>` },
  mouths: { m: `<path d="${D_MOUTH}" fill="rgb(182,122,112)"/>` },
  facialhair: { f: `<path d="${D_FH}" fill="rgb(140,122,110)"/>` },
  fhManifest: { f: { over } },
})

describe('the stack paints in one order', () => {
  const full = { ...cfg, hair: 'h', eyes: 'e', mouth: 'm', facialHair: 'f' }

  it('puts a beard over the hair, the mouth over the beard and the nose last', () => {
    const svg = composeAvatar(full, stackFixture(false))
    const at = (d: string) => svg.indexOf(`d="${d}"`)
    for (const [n, d] of [['ear', D_EAR_L], ['eyes', D_EYES], ['hair', D_HAIR],
                          ['beard', D_FH], ['mouth', D_MOUTH], ['nose', D_NOSE]] as const) {
      expect(at(d), `${n} must survive composition`).toBeGreaterThan(-1)
    }
    expect(at(D_EAR_L), 'ear before hair').toBeLessThan(at(D_HAIR))
    expect(at(D_EYES), 'eyes before hair — a lock passes in front of the eye')
      .toBeLessThan(at(D_HAIR))
    expect(at(D_HAIR), '⭐ hair before the beard — the beard is on the FACE')
      .toBeLessThan(at(D_FH))
    expect(at(D_FH), 'the mouth sits IN a beard, so it goes over it').toBeLessThan(at(D_MOUTH))
    expect(at(D_MOUTH), 'the nose is always last').toBeLessThan(at(D_NOSE))
  })

  it('puts the mouth UNDER an "over" style, but still the hair under it', () => {
    const svg = composeAvatar(full, stackFixture(true))
    const at = (d: string) => svg.indexOf(`d="${d}"`)
    expect(at(D_MOUTH), 'a moustache hangs over the lip').toBeLessThan(at(D_FH))
    expect(at(D_HAIR), 'hair still goes under the facial hair').toBeLessThan(at(D_FH))
    expect(at(D_FH), 'the nose is always last').toBeLessThan(at(D_NOSE))
  })

  it('splits a shipped expression cleanly at the line — no path straddles it', () => {
    const MOUTH_TOKENS = ['rgb(182,122,112)', 'rgb(118,72,68)', 'rgb(206,116,112)']
    let highestUpperTop = 0
    let lowestMouthTop = Infinity
    let seen = 0
    for (const f of svgsIn(EXPRESSIONS)) {
      for (const m of f.body.matchAll(/<path[^>]*\/?>/g)) {
        const d = /d="([^"]*)"/.exec(m[0])
        if (!d) continue
        const n = (d[1].match(/-?\d+\.?\d*/g) || []).map(Number)
        const ys = n.filter((_, i) => i % 2 === 1)
        if (!ys.length) continue
        seen++
        const top = Math.min(...ys)
        if (MOUTH_TOKENS.some((t) => m[0].includes(t))) lowestMouthTop = Math.min(lowestMouthTop, top)
        else if (top < SPLIT) highestUpperTop = Math.max(highestUpperTop, top)
      }
    }
    expect(seen, 'the expression assets should be present').toBeGreaterThan(50)
    expect(highestUpperTop, 'nothing above the line may reach it').toBeLessThan(SPLIT)
    expect(lowestMouthTop, 'no mouth path may start above the line').toBeGreaterThan(SPLIT)
  })

  it('keeps the same split line in the Python composer and the builder port', () => {
    for (const file of [
      'assets/character-base/nano/compose.py',
      'assets/character-base/nano/builder-template.html',
    ]) {
      const src = readFileSync(join(process.cwd(), file), 'utf8')
      expect(src, `${file} must carry the split line`).toMatch(/1072/)
    }
  })
})

// =============================================================
// Facial hair is the hair colour LIGHTENED
// =============================================================
// Beard and head hair shared the hairBase token, so they got the same fill — and once the
// beard painted OVER the hair it vanished into it. Ryan, 2026-09-19: "the full beard blends
// into the long hair in the background." The facial-hair fragment is now marked as it is
// stacked and filled with the hair colour lightened 14%, so one colour input still drives
// both and nothing is added to the config.
// =============================================================

describe('facial hair is lighter than the head hair', () => {
  const hairPath = `<path d="M 300 300 L 800 300 L 800 900 Z" fill="rgb(140,122,110)"/>`
  const beardPath = `<path d="M 700 1200 L 1300 1200 L 1300 1500 Z" fill="rgb(140,122,110)"/>`
  const both = (): AvatarAssets => ({
    ...fixture(),
    hair: { h: hairPath },
    facialhair: { f: beardPath },
    fhManifest: { f: { over: false } },
  })

  it('lightens the beard but leaves the head hair alone', () => {
    const svg = composeAvatar({ ...cfg, hair: 'h', facialHair: 'f' }, both())
    expect(svg, 'the marker must never reach the output').not.toContain(BEARD_MARKER)
    expect(svg, 'the beard takes the lightened tone').toContain(BEARD_TONE)
    expect(svg, 'the head hair keeps the raw hair colour').toContain('rgb(139,94,60)')
  })

  // ⭐⭐ THE LIFT BELONGS TO THE FALLBACK ALONE, and this is the test of the one consequence
  // that surprises people: UNSET and SET-TO-THE-SAME-HEX are DIFFERENT RENDERS, by exactly
  // BEARD_LIFT. `BEARD_LIFT` exists for one problem — a beard vanishing into head hair of the
  // same colour — which choosing a colour rules out, and every other colour input in this
  // system (frame, metal, shirt, hair, iris, lip) is applied verbatim. Ryan, 2026-09-26.
  //
  // ⚠ So a config must NEVER be written with facialHairColour copied from hairColour. The
  // builder's publicConfig() omits it when unset for exactly this reason.
  it('applies a chosen facial hair colour verbatim, and lifts only the fallback', () => {
    const lift = (h: string) => {
      const n = (h.replace('#', '').match(/../g) || []).map((x) => parseInt(x, 16))
      return `rgb(${n.map((v) => Math.min(255, v + 12)).join(',')})`
    }
    const HAIR = '#8B5E3C'
    const CHOSEN = '#8E8E93'

    const chosen = composeAvatar(
      { ...cfg, hairColour: HAIR, facialHair: 'f', facialHairColour: CHOSEN }, both())
    expect(chosen, 'a chosen colour is the colour — no lift').toContain('rgb(142,142,147)')
    expect(chosen, 'the lifted form must not appear').not.toContain(lift(CHOSEN))

    const fallback = composeAvatar({ ...cfg, hairColour: HAIR, facialHair: 'f' }, both())
    expect(fallback, 'unset still follows the hair, lifted').toContain(lift(HAIR))

    // the deliberate asymmetry, pinned so it cannot be "fixed" by accident
    const copied = composeAvatar(
      { ...cfg, hairColour: HAIR, facialHair: 'f', facialHairColour: HAIR }, both())
    expect(copied, 'copying the hair hex in is NOT the same as leaving it out')
      .not.toBe(fallback)
    expect(copied, 'it renders the hair colour verbatim instead').toContain('rgb(139,94,60)')
  })

  // ⚠ An empty string is a real input — the builder's publicConfig() coerces unset optional
  // fields to '' — and `'' ?? x` is '', which reaches hex2rgb as NaN and paints
  // rgb(NaN,NaN,NaN) over the whole beard. Hence `||`, not `??`.
  it('treats an empty facial hair colour as unset, not as a colour', () => {
    const svg = composeAvatar(
      { ...cfg, hairColour: '#8B5E3C', facialHair: 'f', facialHairColour: '' }, both())
    expect(svg, 'an empty string must never reach the paint').not.toContain('NaN')
    expect(svg).toBe(composeAvatar({ ...cfg, hairColour: '#8B5E3C', facialHair: 'f' }, both()))
  })

  it('does not lighten hair when there is no facial hair', () => {
    const svg = composeAvatar({ ...cfg, hair: 'h', facialHair: null }, both())
    expect(svg).toContain('rgb(139,94,60)')
    expect(svg, 'nothing should be lightened').not.toContain(BEARD_TONE)
  })

  it('leaves stubble on its own derivation — it is not a beard tone', () => {
    const stub = `<path d="M 700 1200 L 1300 1200 L 1300 1500 Z" fill="${STUBBLE_TOKEN}"/>`
    const svg = composeAvatar({ ...cfg, facialHair: 'f' },
      { ...fixture(), facialhair: { f: stub }, fhManifest: { f: { over: false } } })
    expect(svg, 'the stubble token must not reach the output').not.toContain(STUBBLE_TOKEN)
    expect(svg, 'stubble keeps its shadow tone, not the beard tone').not.toContain(BEARD_TONE)
    expect(svg).toContain(STUBBLE_EXPECTED)
  })

  it('keeps the same marker and factor in the Python composer and the builder port', () => {
    for (const file of [
      'assets/character-base/nano/compose.py',
      'assets/character-base/nano/builder-template.html',
    ]) {
      const src = readFileSync(join(process.cwd(), file), 'utf8')
      expect(src, `${file} must carry the beard marker`).toContain('110,150,126')
      expect(src, `${file} must carry the lift`).toMatch(/BEARD_LIFT\s*=\s*12\b/)
      // ⚠⚠ A GREP IS ALL THAT HOLDS THE THREE TOGETHER for anything the parity harness does
      // not compose. builder-template.html is executed by nothing in CI, so without this a
      // facial-hair colour could be honoured in two implementations and ignored in the third.
      expect(src, `${file} must honour the facial hair colour`)
        .toMatch(/facial[-_]?hair[-_]?colour/i)
    }
  })

  // ⚠⚠ THE GAP THIS LEAVES. Only hairBase is marked, so a facial-hair asset painted in the
  // hair TEXTURE tones would keep them verbatim and match the head hair exactly — the very
  // blending this feature exists to stop, and silent, because it would look fine on a bald
  // avatar. No shipped asset does it today. If one needs a second tone, mark it too rather
  // than deleting this test.
  it('no facial-hair asset paints in the hair TEXTURE tones — they are not marked', () => {
    for (const f of svgsIn(FACIALHAIR)) {
      for (const [name, tone] of [['shade', HAIR_SHADE], ['light', HAIR_LIGHT]] as const) {
        expect(f.body, `${f.name} uses the hair ${name} tone, which is never lightened`)
          .not.toContain(tone)
      }
    }
  })

  // ⭐ Stubble is NOT given the beard's lift: it is already the hair pulled 83% toward the
  // skin, and lifting it again would push it into the skin. What it gets instead is a FLOOR
  // against the skin — the same idea, a guaranteed minimum separation from its neighbour.
  // This walks the REAL palette, all 72 hair x skin pairs, because that is where it broke:
  // 35 of them landed within 12 luminance of the skin and 20 came out lighter than it.
  it('keeps stubble clear of the skin on every palette combination', () => {
    const lumOf = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    const hex = (h: string) => (h.replace('#', '').match(/../g) || []).map((x) => parseInt(x, 16))
    const nums = (t: string) => (t.match(/\d+/g) || []).map(Number)
    const D = 'M 1 1 L 2 2 Z'
    const tone = (hair: string, skin: string, token: string) => {
      const svg = composeAvatar(
        // ⚠⚠ DRIVEN THROUGH `facialHairColour`, NOT `hairColour`. Once the two are separable
        // this test measures whatever drives the stubble; passing only `hairColour` would
        // exercise the FALLBACK and pass forever while proving nothing about the input a
        // member actually picks. The hair is set to something else on purpose.
        { ...cfg, hairColour: '#1A1110', facialHairColour: hair, skin, facialHair: 'f' },
        {
          ...fixture(),
          facialhair: { f: `<path d="${D}" fill="${token}"/>` },
          fhManifest: { f: { over: false } },
        },
      )
      // ⚠ the fill on OUR path, not the first rgb in the document — the base's own skin path
      // comes first, and an earlier version of this test measured that by mistake.
      const m = new RegExp(`<path[^>]*d="${D}"[^>]*>`).exec(svg)
      return nums(/fill="(rgb\([^)]*\))"/.exec(m![0])![1])
    }
    const worst: string[] = []
    for (const hair of PALETTE.hair) {
      for (const skin of PALETTE.skin) {
        const gap = Math.abs(lumOf(tone(hair, skin, STUBBLE_TOKEN)) - lumOf(hex(skin)))
        // ⚠ 13, not the floor's 14: the tone is truncated to whole channels afterwards,
        // which costs up to a unit. Before the floor the worst pair sat at 0.3.
        if (gap < 13) worst.push(`${hair} on ${skin}: ${gap.toFixed(1)}`)
        // ⚠ 9 x 15 = 135 pairs since the skin ramp grew. The worst sits at ~13.1, so the
        // margin over the 13 written above is 0.1 — do not "tidy" either number.
      }
    }
    expect(worst, 'stubble must stay clear of the skin everywhere').toEqual([])
  })

  // ⚠ THE FALLBACK PATH SPECIFICALLY — no `facialHairColour` is passed. That is the only path
  // the lift survives on; the verbatim case is pinned separately above.
  it('still lifts a beard by the same amount on every hair swatch (fallback path)', () => {
    const lumOf = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    const hex = (h: string) => (h.replace('#', '').match(/../g) || []).map((x) => parseInt(x, 16))
    const nums = (t: string) => (t.match(/\d+/g) || []).map(Number)
    const D = 'M 1 1 L 2 2 Z'
    for (const hair of PALETTE.hair) {
      const svg = composeAvatar(
        { ...cfg, hairColour: hair, facialHair: 'f' },
        {
          ...fixture(),
          facialhair: { f: `<path d="${D}" fill="rgb(140,122,110)"/>` },
          fhManifest: { f: { over: false } },
        },
      )
      const m = new RegExp(`<path[^>]*d="${D}"[^>]*>`).exec(svg)
      const gap = lumOf(nums(/fill="(rgb\([^)]*\))"/.exec(m![0])![1])) - lumOf(hex(hair))
      // ⚠ this is what a MULTIPLIER could not do: ×1.14 gave +2.2 on #1A1110 and clamped
      // #E8E8ED to white. A constant gives the same step on all nine.
      expect(gap, `beard separation on ${hair}`).toBeGreaterThan(10)
      expect(gap, `beard separation on ${hair}`).toBeLessThan(14)
    }
  })
})

// =============================================================
// The standalone builder must at least PARSE
// =============================================================
// ⚠⚠ avatar-builder.html is generated from builder-template.html and nothing type-checks it.
// A duplicate `const mouth` — the layer and the mouth COLOUR, in one scope — shipped in it and
// would have blanked the page; tsc caught the identical mistake in compose.ts and said nothing
// about the template. One cheap parse is the whole safety net this file has.
// =============================================================

describe('the standalone avatar builder', () => {
  it('parses as JavaScript', () => {
    for (const file of [
      'assets/character-base/nano/builder-template.html',
      'assets/character-base/nano/avatar-builder.html',
    ]) {
      const html = readFileSync(join(process.cwd(), file), 'utf8')
      const blocks = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1])
      expect(blocks.length, `${file} should carry a script`).toBeGreaterThan(0)
      expect(() => new Function(blocks.join('\n')), `${file} must parse`).not.toThrow()
    }
  })
})

// =============================================================
// The body goes in front of the hair — every neck width works
// =============================================================
// Every hair asset was traced against base-neck-100 and carries that base's body silhouette as
// a DIP in its own outline. On any other base the hair was wrong: a narrower neck left a
// background crack beside it, and a wider one was simply covered, so neck-125 and neck-140
// rendered almost identically to the default. Two derived layers fix it without touching a
// locked hair asset — see build-body-layers.py.
// =============================================================

describe('long hair works on every neck width', () => {
  const D_HAIR2 = 'M 300 300 L 800 300 L 800 900 Z'
  const D_BACK = 'M 850 1500 L 1200 1500 L 1200 1700 Z'
  const D_FRONT = 'M 840 1500 L 1210 1500 L 1210 1700 Z'
  const layered = (): AvatarAssets => ({
    ...fixture(),
    // ⚠ the base must be named like the real ones: the front body is looked up by the neck
    // number at the end of the base key, which is what ties a base to its derived layer.
    bases: { 'base-neck-100': '<svg viewBox="0 0 2048 2048"><path d="M 0 0 L 1 0 L 1 1 Z" fill="rgb(254,205,180)"/></svg>' },
    hair: { long: `<path d="${D_HAIR2}" fill="rgb(140,122,110)"/>` },
    // ⚠ keyed by STYLE — one shared fill drew a hair-coloured rim along the shoulder of
    // every style that did not cover it.
    hairBackfill: { long: `<path d="${D_BACK}" fill="rgb(140,122,110)"/>` },
    frontShirt: { '100': `<path d="${D_FRONT}" fill="rgb(30,118,214)"/>` },
    frontNeck: { '100': '' },
    hairManifest: { long: true, short: false },
  })

  it('sandwiches the hair between the backfill and the body', () => {
    const svg = composeAvatar({ ...cfg, base: 'base-neck-100', hair: 'long' }, layered())
    const at = (d: string) => svg.indexOf(`d="${d}"`)
    expect(at(D_BACK), 'the backfill must be present').toBeGreaterThan(-1)
    expect(at(D_BACK), 'backfill goes behind the hair').toBeLessThan(at(D_HAIR2))
    expect(at(D_HAIR2), 'the body goes in front of the hair').toBeLessThan(at(D_FRONT))
  })

  it('does not backfill a style that never reaches the neck', () => {
    const A = layered()
    A.hair = { short: `<path d="${D_HAIR2}" fill="rgb(140,122,110)"/>` }
    const svg = composeAvatar({ ...cfg, base: 'base-neck-100', hair: 'short' }, A)
    expect(svg, 'a buzz cut must not gain hair beside the neck').not.toContain(`d="${D_BACK}"`)
    expect(svg, 'but the body still goes in front').toContain(`d="${D_FRONT}"`)
  })

  it('paints the neck BEFORE its shadow, the same order the base does', () => {
    // ⚠⚠ This layer read shirt + shadow + neck while the base reads shirt + neck + shadow, so
    // the re-painted neck covered its own crescent shadow. Bald avatars showed the shadow (no
    // front-body layer, so the base's order applied) and every avatar WITH HAIR lost it — 24 of
    // the 25 hair options. neck-width.py calls this order out as EXPLICIT; the derived layer
    // quietly disagreed, and nothing compared the two.
    const A = JSON.parse(
      readFileSync(join(process.cwd(), 'public/avatar-assets.json'), 'utf8'),
    ) as AvatarAssets
    const bases = Object.keys(A.frontNeck ?? {})
    expect(bases.length, 'the front-body layers should be bundled').toBeGreaterThan(0)
    for (const b of bases) {
      const frag = A.frontNeck![b]
      const neck = frag.indexOf('fill="rgb(254,205,180)"')
      const shadow = frag.indexOf('fill="rgb(245,178,150)"')
      expect(neck, `front-neck-${b}: no neck path`).toBeGreaterThan(-1)
      expect(shadow, `front-neck-${b}: no neck shadow path`).toBeGreaterThan(-1)
      expect(neck, `front-neck-${b}: the neck must come before its shadow, or the shadow is hidden`)
        .toBeLessThan(shadow)
    }
  })

  it('shows the same neck shadow with hair as without', () => {
    // The invariant the order exists for, checked end to end rather than on the fragment.
    const A = JSON.parse(
      readFileSync(join(process.cwd(), 'public/avatar-assets.json'), 'utf8'),
    ) as AvatarAssets
    const shadowD = /fill="rgb\(245,178,150\)"[^>]*d="([^"]*)"/.exec(A.frontNeck!['100'])![1]
    const withHair = composeAvatar(
      { ...cfg, base: 'base-neck-100', facialHair: null, hair: 'm01-buzz' }, A)
    const i = withHair.indexOf(`d="${shadowD}"`)
    expect(i, 'the shadow should be in the composed document').toBeGreaterThan(-1)
    // nothing from the body layer may be painted after it
    const neckD = /fill="rgb\(254,205,180\)"[^>]*d="([^"]*)"/.exec(A.frontNeck!['100'])![1]
    expect(withHair.indexOf(`d="${neckD}"`), 'the neck must not be painted over the shadow')
      .toBeLessThan(i)
  })

  it('adds neither layer when there is no hair', () => {
    const svg = composeAvatar({ ...cfg, base: 'base-neck-100', hair: null }, layered())
    expect(svg).not.toContain(`d="${D_BACK}"`)
    expect(svg).not.toContain(`d="${D_FRONT}"`)
  })

  it('ships a front body for every base, and a backfill flag for every hair style', () => {
    const A = JSON.parse(
      readFileSync(join(process.cwd(), 'public/avatar-assets.json'), 'utf8'),
    ) as AvatarAssets
    const bases = Object.keys(A.bases)
    expect(bases.length, 'the four locked bases').toBeGreaterThan(0)
    for (const b of bases) {
      const key = /(\d+)$/.exec(b)?.[1] ?? ''
      expect(A.frontShirt?.[key], `no front shirt for ${b}`).toBeTruthy()
      expect(A.frontNeck?.[key], `no front neck for ${b}`).toBeTruthy()
    }
    for (const h of Object.keys(A.hair)) {
      expect(A.hairManifest?.[h], `no backfill flag for ${h}`).toBeDefined()
    }
    // every flagged style must ship its OWN fill, and no unflagged style may have one
    for (const [h, on] of Object.entries(A.hairManifest ?? {})) {
      if (on) expect(A.hairBackfill?.[h], `${h} is flagged but has no backfill`).toBeTruthy()
      else expect(A.hairBackfill?.[h], `${h} is not flagged but ships a backfill`).toBeUndefined()
    }
    // ⚠ the flag is what stops a buzz cut gaining hair beside a narrow neck; if this ever
    // becomes all-true or all-false, build-body-layers.py's bracket test has broken.
    const on = Object.values(A.hairManifest ?? {}).filter(Boolean).length
    expect(on).toBeGreaterThan(3)
    expect(on).toBeLessThan(Object.keys(A.hair).length)
  })

  // =============================================================
  // The BEHIND layer is display-only
  // =============================================================
  // `hair/behind/<style>.svg` is art for the region the body cut out of five styles. It is
  // painted ONLY by headOnly(), for the asset picker, and never by composeAvatar — which is
  // what makes a real avatar incapable of changing. It used to be painted by every compositor
  // and clipped to the body silhouette to stay hidden; that clip cut Ryan's locs, which hang
  // past the shirt dome, so it went. The guarantee is now structural, and this is the test of
  // it: compose has to produce the SAME BYTES with the layer and without it.
  it('composeAvatar never paints the behind layer', () => {
    const A = JSON.parse(
      readFileSync(join(process.cwd(), 'public/avatar-assets.json'), 'utf8'),
    ) as AvatarAssets
    const behind = A.hairBehind ?? {}
    expect(Object.keys(behind).length, 'styles with a behind layer').toBeGreaterThan(0)
    const without = { ...A, hairBehind: {} }
    for (const style of Object.keys(behind)) {
      for (const base of Object.keys(A.bases)) {
        const cfg2 = { ...cfg, base, hair: style }
        expect(
          composeAvatar(cfg2, A),
          `${style} on ${base} differs when the behind layer is present`,
        ).toBe(composeAvatar(cfg2, without))
      }
    }
  })

  // ⚠⚠ A FULL-CANVAS PATH MUST NOT REACH THE PICKER STROKED. Hair assets carry a stroke of
  // their own fill at width 1.2 to seal their seams, and an inverted trace's base path IS the
  // 2048x2048 canvas — so that stroke runs along the canvas boundary. A real avatar never
  // shows it (its viewBox is exactly the canvas, so the outer half falls outside), but the
  // picker crops to -63 -55 2166 2166 to fit the head, which brings the boundary inside the
  // frame: `f09-midwavy` and `m15-locs` each drew a grey hairline rectangle around their card
  // and it went unnoticed until the whole set was laid out side by side. Ryan found it by
  // LOOKING; none of the numeric checks were pointed at the card's edge.
  it('headOnly strips the seal stroke from a full-canvas path', () => {
    const A = JSON.parse(
      readFileSync(join(process.cwd(), 'public/avatar-assets.json'), 'utf8'),
    ) as AvatarAssets
    let seen = 0
    for (const style of Object.keys(A.hair)) {
      const card = headOnly(
        composeAvatar({ ...cfg, base: 'base-neck-100', hair: style, facialHair: null }, A),
        { skin: cfg.skin, shirt: cfg.shirt, hair: cfg.hairColour },
        A.hairBackfill?.[style] || '',
        A.hairBehind?.[style] || '',
      )
      for (const m of card.matchAll(/<path[^>]*\/?>/g)) {
        const d = / d="([^"]*)"/.exec(m[0])?.[1]
        if (!d) continue
        const n = (d.match(/-?\d+\.?\d*/g) || []).map(Number)
        const xs = n.filter((_, i) => i % 2 === 0)
        const ys = n.filter((_, i) => i % 2 === 1)
        if (!xs.length) continue
        if (Math.min(...xs) > 0 || Math.max(...xs) < 2047) continue
        if (Math.min(...ys) > 0 || Math.max(...ys) < 2047) continue
        seen += 1
        expect(m[0], `${style} ships a STROKED full-canvas path to the picker`).not.toMatch(/stroke=/)
      }
    }
    expect(seen, 'no full-canvas path was examined — the check proved nothing').toBeGreaterThan(0)
  })

  // ⭐⭐ AN EARRING IS BIGGER THAN AN EAR — the whole bug in one sentence, and two rules missed
  // it. The original painted the earring WITH the ear, defended by "only f09-midwavy and
  // m15-locs reach the ear". That premise is TRUE: measured, those two show 0% of the ear and
  // every other style 96-100%. The INFERENCE was wrong, because a hoop hangs BELOW the ear into
  // hair that passes behind the ear and in front of the drop.
  //
  // ⚠ The first fix was wrong too: it split on "tied back", and Ryan found the hole at once —
  // f04-longcurly leaves 96.6% of the ear showing and still clipped the earring to 5%. "Tied
  // back" was a proxy; the real question is whether the EAR IS VISIBLE, and that is measurable.
  it('paints the earring after the hair unless the style hides the ear', () => {
    const A = JSON.parse(
      readFileSync(join(process.cwd(), 'public/avatar-assets.json'), 'utf8'),
    ) as AvatarAssets
    const covers = A.hairCoversEar ?? []
    expect(covers.length, 'no style is listed as covering the ear').toBeGreaterThan(0)
    expect(covers.length, 'this is an EXCEPTION list — if it grows past a handful, the rule is '
      + 'wrong again').toBeLessThan(6)
    for (const h of covers) {
      expect(A.hair[h], `${h} is listed as covering the ear but has no hair asset`).toBeTruthy()
    }

    // a long path is unique enough to locate a layer, and `d` survives phase 2 untouched
    const longestD = (markup: string) =>
      [...markup.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]).sort((a, b) => b.length - a.length)[0]
    const earD = longestD(A.earrings!['e04-bighoop'])
    expect(earD, 'the earring fixture should have a path').toBeTruthy()

    // ⚠ BOTH branches, and the exposed one is a LONG style on purpose. Testing only a tied-back
    // style would have passed under the rule Ryan caught — f04-longcurly is exactly the case
    // that was broken, so it is the case that guards it.
    for (const style of ['f04-longcurly', covers[0]] as const) {
      const svg = composeAvatar(
        { ...cfg, base: 'base-neck-100', hair: style, facialHair: null, earrings: 'e04-bighoop' },
        A,
      )
      const atHair = svg.indexOf(longestD(A.hair[style]))
      const atEar = svg.indexOf(earD)
      expect(atHair, `${style}: hair not found in the document`).toBeGreaterThan(-1)
      expect(atEar, `${style}: earring not found in the document`).toBeGreaterThan(-1)
      if (covers.includes(style)) {
        expect(atEar, `${style} hides the ear, so the earring must paint BEFORE the hair`)
          .toBeLessThan(atHair)
      } else {
        expect(atEar, `${style} leaves the ear visible, so the earring must paint AFTER the hair`)
          .toBeGreaterThan(atHair)
      }
    }
  })

  it('the behind layer carries only tokens, sealed', () => {
    const A = JSON.parse(
      readFileSync(join(process.cwd(), 'public/avatar-assets.json'), 'utf8'),
    ) as AvatarAssets
    const behind = A.hairBehind ?? {}
    expect(Object.keys(behind).length).toBeLessThanOrEqual(9)
    for (const [style, markup] of Object.entries(behind)) {
      expect(A.hair[style], `${style} has a behind layer but no hair asset`).toBeTruthy()
      const ds = [...markup.matchAll(/ d="([^"]*)"/g)].map((m) => m[1])
      expect(ds.length, `${style}'s behind layer has no paths`).toBeGreaterThan(0)
      // ⚠ NO GEOMETRIC BOUND ANY MORE, on purpose. A shoulder-line bound was the last thing
      // cutting Ryan's locs — they are wider than ours above it too — and the layer is painted
      // under the head, the ears and the locked hair, so it can only show where the locked art
      // is absent. The guarantee that matters is the byte-identity test above, not where this
      // geometry sits.
      // ⚠ Tokens, not literals. headOnly recolours this markup by token AFTER phase 2 has
      // finished with the document, so an un-tokenised fill ships a grey-taupe patch on every
      // hair colour — which is exactly what happened the first time it was painted there.
      for (const m of markup.matchAll(/<path[^>]*\/?>/g)) {
        const fill = /fill="([^"]*)"/.exec(m[0])?.[1]
        const stroke = /stroke="([^"]*)"/.exec(m[0])?.[1]
        expect(['rgb(140,122,110)', 'rgb(114,97,86)'], `${style} fill ${fill}`).toContain(fill)
        expect(stroke, `${style} has a path with no stroke`).toBe(fill)
        expect(m[0], `${style} stroke-width`).toMatch(/stroke-width="8(\.0)?"/)
      }
    }
  })
})

// =============================================================
// Hair paths are sealed with a hairline stroke
// =============================================================
// The tracer butts same-colour shapes against each other, and two anti-aliased edges on one
// line leak a light one-pixel crack. Ryan, 2026-09-20: "hairline breaking points that make it
// look bad" — 17 of 27 styles, 1,613 crack pixels. Every hair path now carries a stroke of its
// own fill, which makes the shapes OVERLAP instead of meet. See seal-hair-seams.py.
// =============================================================

describe('hair is sealed against hairline cracks', () => {
  it('gives every hair path a stroke of its own fill', () => {
    const offenders: string[] = []
    for (const f of svgsIn(HAIR)) {
      for (const m of f.body.matchAll(/<path[^>]*\/?>/g)) {
        const p = m[0]
        const fill = /fill="(rgb\([^)]*\))"/.exec(p)
        if (!fill) continue // the mask's black silhouettes
        const stroke = /stroke="(rgb\([^)]*\))"/.exec(p)
        if (!stroke) offenders.push(`${f.name}: a path with no stroke`)
        else if (stroke[1] !== fill[1]) offenders.push(`${f.name}: stroke ${stroke[1]} != fill ${fill[1]}`)
        else if (!/stroke-width="1\.2"/.test(p)) offenders.push(`${f.name}: wrong stroke-width`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('recolours the stroke, not just the fill', () => {
    const svg = composeAvatar(
      { ...cfg, hair: 'h' },
      { ...fixture(), hair: { h: '<path d="M 1 1 L 2 2 Z" fill="rgb(140,122,110)" stroke="rgb(140,122,110)" stroke-width="1.2"/>' } },
    )
    expect(svg, 'the token must not survive as a stroke').not.toContain('stroke="rgb(140,122,110)"')
    expect(svg, 'the stroke takes the hair colour').toContain('stroke="rgb(139,94,60)"')
    expect(svg).toContain('fill="rgb(139,94,60)"')
  })

  it('keeps the stroke out of every other asset family', () => {
    // ⚠ only HAIR is sealed this way. A stroke on a mouth or an iris would fatten a feature
    // that was drawn at its final weight, and on facial hair it would fight the fade.
    for (const dir of [BASES, EYES, MOUTHS, FACIALHAIR, GLASSES, EARRINGS, GARMENTS]) {
      for (const f of svgsIn(dir)) {
        expect(f.body, `${f.name} should not carry a stroke`).not.toContain('stroke="rgb(')
      }
    }
  })

  it('keeps the same stroke swap in the Python composer and the builder port', () => {
    for (const file of [
      'assets/character-base/nano/compose.py',
      'assets/character-base/nano/builder-template.html',
    ]) {
      const src = readFileSync(join(process.cwd(), file), 'utf8')
      expect(src, `${file} must swap stroke too`).toMatch(/stroke="/)
    }
  })
})

// =============================================================
// Hair that falls in front of the FACE goes back on top of the beard
// =============================================================
// The stack puts facial hair over the hair, which is right for the length hanging BESIDE the
// head — but wrong for the strands falling across the cheek. Ryan, 2026-09-20: "for the long
// hair options that go in front of the face the beard should be under that hair."
//
// The hair fragment is painted a SECOND time after the facial hair, masked to the head's own
// silhouette, so only the part over the face comes back. Nothing is added to the bundle.
// =============================================================

describe('hair over the face passes in front of a beard', () => {
  const D_HEAD = 'M 506 298 L 1534 298 L 1534 1530 L 506 1530 Z'
  const D_HAIR3 = 'M 300 300 L 800 300 L 800 900 Z'
  const D_BEARD3 = 'M 700 1200 L 1300 1200 L 1300 1500 Z'
  const faceFixture = (): AvatarAssets => ({
    ...fixture(),
    bases: { b: `<svg viewBox="0 0 2048 2048"><path d="${D_HEAD}" fill="rgb(254,205,180)"/></svg>` },
    hair: { h: `<path d="${D_HAIR3}" fill="rgb(140,122,110)"/>` },
    facialhair: { f: `<path d="${D_BEARD3}" fill="rgb(140,122,110)"/>` },
    fhManifest: { f: { over: false } },
  })

  it('paints the hair again, masked to the head, after the facial hair', () => {
    const svg = composeAvatar({ ...cfg, base: 'b', hair: 'h', facialHair: 'f' }, faceFixture())
    const copies = svg.split(`d="${D_HAIR3}"`).length - 1
    expect(copies, 'the hair is painted twice').toBe(2)
    expect(svg, 'the second copy is masked to the head').toMatch(/mask="url\(#faceonly--[a-z0-9]+\)"/)
    expect(svg, 'the mask is the head silhouette').toContain(`<path d="${D_HEAD}" fill="white"/>`)
    // order: first hair, then the beard, then the masked copy
    const first = svg.indexOf(`d="${D_HAIR3}"`)
    const beard = svg.indexOf(`d="${D_BEARD3}"`)
    const second = svg.indexOf(`d="${D_HAIR3}"`, first + 1)
    expect(first).toBeLessThan(beard)
    expect(beard, 'the face copy goes over the beard').toBeLessThan(second)
  })

  it('adds nothing when there is no facial hair', () => {
    const svg = composeAvatar({ ...cfg, base: 'b', hair: 'h', facialHair: null }, faceFixture())
    expect(svg.split(`d="${D_HAIR3}"`).length - 1, 'a single copy').toBe(1)
    expect(svg).not.toContain('faceonly')
  })

  it('adds nothing when there is no hair', () => {
    const svg = composeAvatar({ ...cfg, base: 'b', hair: null, facialHair: 'f' }, faceFixture())
    expect(svg).not.toContain('faceonly')
  })

  it('renames the copy\'s own mask id so no two elements share one', () => {
    const A = faceFixture()
    A.hair = {
      h:
        `<defs><mask id="facehole"><rect width="2048" height="2048" fill="white"/></mask></defs>` +
        `<g mask="url(#facehole)"><path d="${D_HAIR3}" fill="rgb(140,122,110)"/></g>`,
    }
    const svg = composeAvatar({ ...cfg, base: 'b', hair: 'h', facialHair: 'f' }, A)
    // ⚠ matched with the per-document suffix attached, and `facehole--` must not also match
    // `facehole-front--` — the point of the test is that the two copies are told apart.
    const holes = [...svg.matchAll(/id="(facehole(?:-front)?)--[a-z0-9]+"/g)].map((m) => m[1])
    expect(holes.sort(), 'the copy keeps its own mask').toEqual(['facehole', 'facehole-front'])
  })

  it('keeps the same layer in the Python composer and the builder port', () => {
    for (const file of [
      'assets/character-base/nano/compose.py',
      'assets/character-base/nano/builder-template.html',
    ]) {
      const src = readFileSync(join(process.cwd(), file), 'utf8')
      expect(src, `${file} must emit the face-only layer`).toContain('faceonly')
      expect(src, `${file} must rename the copy's mask`).toContain('facehole-front')
    }
  })
})

// =============================================================
// Ids are scoped to the DOCUMENT, so a composed avatar suffixes its own
// =============================================================
// An avatar declares up to four ids — `facehole` (the face cut-out every hair asset carries),
// `facehole-front` (its renamed second copy), `faceonly` and `beardfade`. Inline two avatars
// and the browser resolves every `url(#facehole)` to the FIRST definition in the document, so
// avatars 2..n silently borrow avatar 1's mask.
//
// ⚠⚠ It is not subtle: several hair styles paint their mass as a full-canvas fill and rely
// entirely on the mask to cut it to shape, so the wrong mask floods the tile with hair. The
// admin contact sheet inlines a whole grid and was wrong the entire time this shipped.
//
// The suffix is a HASH OF THE DOCUMENT, which buys three things a counter cannot: it is
// deterministic (so a server render and the client render that hydrates it agree), it is the
// same in all three composers without them having to share anything but the document, and a
// collision is harmless because only identical documents can collide.
// =============================================================

describe('ids are scoped to the document', () => {
  const D_HEAD4 = 'M 506 298 L 1534 298 L 1534 1530 L 506 1530 Z'
  const masked = (d: string): AvatarAssets => ({
    ...fixture(),
    bases: { b: `<svg viewBox="0 0 2048 2048"><path d="${D_HEAD4}" fill="rgb(254,205,180)"/></svg>` },
    hair: {
      h:
        '<defs><mask id="facehole"><rect width="2048" height="2048" fill="white"/></mask></defs>' +
        `<g mask="url(#facehole)"><path d="${d}" fill="rgb(140,122,110)"/></g>`,
    },
    facialhair: { f: `<path d="M 700 1200 L 1300 1200 L 1300 1500 Z" fill="${FADE_MARKER}"/>` },
    fhManifest: { f: { over: false } },
  })
  const idsIn = (s: string) => [...s.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])
  const refsIn = (s: string) => [...s.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1])

  it('suffixes every id it declares, and every reference still resolves', () => {
    const svg = composeAvatar(
      { ...cfg, base: 'b', hair: 'h', facialHair: 'f', fade: true },
      masked('M 300 300 L 800 300 L 800 900 Z'),
    )
    const ids = idsIn(svg)
    expect(ids.length, 'facehole, faceonly, facehole-front, beardfade').toBe(4)
    for (const id of ids) expect(id, `${id} is not suffixed`).toMatch(/--[a-z0-9]+$/)
    expect(new Set(ids).size, 'no id is declared twice in one document').toBe(ids.length)
    const dangling = refsIn(svg).filter((r) => !ids.includes(r))
    expect(dangling, 'every url(#..) must point at an id in the same document').toEqual([])
  })

  it('gives two different avatars no id in common — the actual bug', () => {
    // Two DIFFERENT avatars on one page. Before the suffix both declared `facehole`, and the
    // second one's masked <g> resolved to the first one's mask.
    const a = composeAvatar({ ...cfg, base: 'b', hair: 'h' }, masked('M 300 300 L 800 300 L 800 900 Z'))
    const b = composeAvatar({ ...cfg, base: 'b', hair: 'h' }, masked('M 300 300 L 700 300 L 700 950 Z'))
    const shared = idsIn(a).filter((id) => idsIn(b).includes(id))
    expect(shared, 'two avatars inlined together must not share an id').toEqual([])
  })

  it('composes the same bytes every time, or SSR and hydration disagree', () => {
    // ⚠ This is why the suffix is a hash and not a counter or a random value: a counter makes
    // the markup depend on call order, and either makes the server and the client emit
    // different ids for the same avatar — a hydration mismatch on every one of them.
    const c = { ...cfg, base: 'b', hair: 'h', facialHair: 'f', fade: true }
    const A = masked('M 300 300 L 800 300 L 800 900 Z')
    expect(composeAvatar(c, A)).toBe(composeAvatar(c, A))
  })

  it('leaves a document with no ids alone', () => {
    const svg = composeAvatar(cfg, fixture())
    expect(svg).not.toContain('id="')
    expect(svg).not.toContain('--')
  })

  it('never lets two real avatars collide, across the whole shipped set', () => {
    // The fixtures above are three paths each; this is the real thing. Every hair style on
    // every base, with and without a beard — the population a leaderboard actually draws from.
    const A = JSON.parse(
      readFileSync(join(process.cwd(), 'public/avatar-assets.json'), 'utf8'),
    ) as AvatarAssets
    const byId = new Map<string, string>()
    let withIds = 0
    for (const base of Object.keys(A.bases)) {
      for (const hair of Object.keys(A.hair)) {
        for (const facialHair of [null, 'fullbeard'] as const) {
          const svg = composeAvatar({ ...cfg, base, hair, facialHair }, A)
          const ids = idsIn(svg)
          if (!ids.length) continue
          withIds++
          const suffix = ids[0].split('--').pop()!
          for (const id of ids) {
            expect(id.endsWith(`--${suffix}`), `${id} disagrees with its own document`).toBe(true)
          }
          const prev = byId.get(suffix)
          // ⭐ Identical documents SHARING a suffix is fine and expected — they carry
          // identical masks. Two DIFFERENT documents sharing one is the failure.
          if (prev !== undefined) expect(prev, `suffix ${suffix} collides`).toBe(svg)
          else byId.set(suffix, svg)
        }
      }
    }
    expect(withIds, 'the shipped set should produce plenty of masked avatars').toBeGreaterThan(50)
  })

  it('composes only ASCII — the three composers hash code units and must agree', () => {
    // ⚠⚠ FNV-1a runs over code units, so JS charCodeAt and Python ord only agree while the
    // document stays ASCII. A non-ASCII asset would make compose.py and compose.ts pick
    // DIFFERENT suffixes for the same avatar, which the parity check would then report as a
    // drift with no obvious cause. Catch it here instead.
    const A = JSON.parse(
      readFileSync(join(process.cwd(), 'public/avatar-assets.json'), 'utf8'),
    ) as AvatarAssets
    for (const hair of Object.keys(A.hair)) {
      const svg = composeAvatar({ ...cfg, base: 'base-neck-100', hair, facialHair: 'fullbeard' }, A)
      expect(/[^\x00-\x7F]/.test(svg), `${hair} composes a non-ASCII document`).toBe(false)
    }
  })

  it('uses no reference form the pass does not rewrite', () => {
    // The pass rewrites `id="…"` and `url(#…)`. `href="#…"` — <use>, a gradient inheriting
    // another's stops, an animation target — would sail straight past it and re-introduce the
    // bug silently. No asset uses one today; this fails the build on the day one does.
    for (const dir of [HAIR, BASES, FACIALHAIR, EYES, MOUTHS, EXPRESSIONS, GLASSES, EARRINGS, GARMENTS]) {
      for (const f of svgsIn(dir)) {
        expect(f.body, `${f.name} uses href="#" — teach uniquifyIds about it`)
          .not.toMatch(/href="#/)
      }
    }
  })

  it('carries the same pass in the Python composer and the builder port', () => {
    // ⚠⚠ The third composer is type-checked by NOTHING. If the suffix drifts between the
    // three, the pipeline and the product disagree about the bytes of the same avatar.
    for (const file of [
      'assets/character-base/nano/compose.py',
      'assets/character-base/nano/builder-template.html',
    ]) {
      const src = readFileSync(join(process.cwd(), file), 'utf8')
      expect(src, `${file} must suffix its ids`).toMatch(/uniquify_?[iI]ds/)
      expect(src, `${file} must use the same FNV-1a offset basis`).toContain('811')
      expect(src, `${file} must use the same FNV-1a prime`).toContain('01000193')
      expect(src, `${file} must mix the length in`).toMatch(/len\(s\)|s\.length/)
    }
  })
})

// =============================================================
// Eyewear — glasses and sunglasses
// =============================================================
// The first accessory family. Two things about it are load-bearing and neither is obvious from
// looking at an asset:
//
// ⭐⭐ THE LENS OPENING IS A REAL HOLE. A trace is a jigsaw: the vectorizer paints the frame as
// a SOLID blob and butts the openings back over it as skin-coloured discs. extract-glasses.py
// subtracts them for real, because eyewear composes OVER the eyes and anything opaque there
// hides them. Take the frame path alone and every pair of spectacles is filled in.
//
// ⭐ IT SITS OVER THE EYES AND UNDER THE HAIR. Over the eyes is not a choice. Under the hair is:
// a temple arm runs back to the ear bump, and real arms disappear into hair.
// =============================================================

describe('eyewear', () => {
  const D_EYE = 'M 700 700 L 980 700 L 980 1020 Z'
  const D_FRAME = 'M 500 720 L 1550 720 L 1550 1080 Z'
  const D_LENS = 'M 560 760 L 950 760 L 950 1040 Z'
  const D_HAIR5 = 'M 300 300 L 800 300 L 800 900 Z'
  const FRAME_INK = 'rgb(64,70,78)'
  const LENS_TINT = 'rgb(96,126,156)'

  const eyewearFixture = (tinted: boolean): AvatarAssets => ({
    ...fixture(),
    bases: { b: '<svg viewBox="0 0 2048 2048"><path d="M 0 0 L 1 0 L 1 1 Z" fill="rgb(254,205,180)"/></svg>' },
    eyes: { e: `<path d="${D_EYE}" fill="rgb(255,255,255)"/>` },
    hair: { h: `<path d="${D_HAIR5}" fill="rgb(140,122,110)"/>` },
    glasses: {
      g: `<path d="${D_FRAME}" fill="${FRAME_INK}"/>` +
         (tinted ? `<path d="${D_LENS}" fill="${LENS_TINT}"/>` : ''),
    },
  })

  const base = { ...cfg, base: 'b', facialHair: null, eyes: 'e', glasses: 'g', frameColour: '#22262E' }

  it('paints the frame in the chosen colour and the lens black, whatever the frame', () => {
    // ⭐ Ryan, 2026-09-22: "Just leave them black the lenses that is." The lens used to be
    // derived from the frame; a black lens is what reads as sunglasses at any size, and the
    // frame colour still does visible work as the rim around it.
    const svg = composeAvatar({ ...base, glasses: 'g' }, eyewearFixture(true))
    expect(svg, 'the frame takes the input verbatim').toContain('fill="rgb(34,38,46)"')
    expect(svg, 'the lens is a near-black slate').toContain('fill="rgb(52,58,68)"')
    for (const frameColour of PALETTE.frame) {
      const s2 = composeAvatar({ ...base, frameColour }, eyewearFixture(true))
      expect(s2, `${frameColour}: the lens must stay black`).toContain('fill="rgb(52,58,68)"')
    }
  })

  it('never lets either token reach the output, on any frame in the palette', () => {
    for (const frameColour of PALETTE.frame) {
      for (const tinted of [true, false]) {
        const svg = composeAvatar({ ...base, frameColour }, eyewearFixture(tinted))
        expect(svg, `${frameColour}: the frame marker leaked`).not.toContain(FRAME_INK)
        expect(svg, `${frameColour}: the lens marker leaked`).not.toContain(LENS_TINT)
      }
    }
  })

  it('sits over the eyes AND over the hair', () => {
    // ⭐⭐ Eyewear was under the hair at first, on the reasoning that a temple arm disappears
    // into hair the way a real one does. Ryan, 2026-09-21: "The sunglasses should also be in
    // front of some hair of some the hair assets." The reasoning was sound and the placement
    // wrong — the hair that covers eyewear is at the TEMPLE, not the ear, and 98.4-99.5% of
    // every eyewear asset sits inside the head silhouette, so no order fronts the lenses and
    // leaves the arms behind. ⚠ The nose still comes last.
    const svg = composeAvatar({ ...base, hair: 'h' }, eyewearFixture(false))
    const eye = svg.indexOf(`d="${D_EYE}"`)
    const hair = svg.indexOf(`d="${D_HAIR5}"`)
    const frame = svg.indexOf(`d="${D_FRAME}"`)
    expect(eye, 'the eye is painted first').toBeLessThan(frame)
    expect(hair, 'the eyewear goes over the hair, not under it').toBeLessThan(frame)
  })

  it('still lets the nose come last', () => {
    // The bridge sits above the nose (eyes y674-1026, nose starts y954.7) so they never meet —
    // but the rule that a raised moustache must not swallow the nose tip is not negotiable, and
    // eyewear moved later in the stack is exactly the kind of change that could break it.
    const A = JSON.parse(
      readFileSync(join(process.cwd(), 'public/avatar-assets.json'), 'utf8'),
    ) as AvatarAssets
    const svg = composeAvatar(
      { ...cfg, base: 'base-neck-100', hair: 'm03-quiff', facialHair: 'moustache',
        glasses: 's01-classic' }, A,
    )
    // ⚠ The nose is found the way compose finds it — by SHAPE in the base, narrow and centred
    // in the upper middle. Matching on the recoloured fill would depend on the skin swatch, and
    // a fallback that silently picks "the last path" would make this test pass vacuously.
    const baseSvg = readFileSync(
      join(process.cwd(), 'assets/character-base/nano/bases/base-neck-100.svg'), 'utf8')
    let noseD = ''
    for (const m of baseSvg.matchAll(/<path[^>]*\/?>/g)) {
      if (!m[0].includes('fill="rgb(245,178,150)"')) continue
      const d = /d="([^"]*)"/.exec(m[0])?.[1] ?? ''
      const n = (d.match(/-?\d+\.?\d*/g) ?? []).map(Number)
      const xs = n.filter((_, i) => i % 2 === 0)
      const ys = n.filter((_, i) => i % 2 === 1)
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2
      if (Math.max(...xs) - Math.min(...xs) < 200 && cx > 900 && cx < 1150
          && Math.min(...ys) > 900 && Math.min(...ys) < 1200) noseD = d
    }
    expect(noseD, 'the nose should be findable in the base').not.toBe('')
    const nose = svg.indexOf(`d="${noseD}"`)
    expect(nose, 'the nose should be in the composed document').toBeGreaterThan(-1)
    const lastGlass = Math.max(
      ...[...A.glasses!['s01-classic'].matchAll(/d="([^"]*)"/g)].map((m) => svg.indexOf(`d="${m[1]}"`)),
    )
    expect(lastGlass, 'the eyewear should be in the document').toBeGreaterThan(-1)
    expect(nose, 'the nose is still painted after the eyewear').toBeGreaterThan(lastGlass)
  })

  it('adds nothing when no eyewear is chosen', () => {
    const svg = composeAvatar({ ...base, glasses: null }, eyewearFixture(true))
    expect(svg).not.toContain(`d="${D_FRAME}"`)
    expect(svg).not.toContain(FRAME_INK)
  })

  it('cuts a real hole in every clear style, and none in a tinted one', () => {
    // ⭐⭐ The whole reason extract-glasses.py does a boolean subtraction. A clear frame whose
    // interior is solid renders as two opaque discs over the eyes — which is what taking the
    // traced frame path at face value gives you. A hole shows as an INTERIOR RING in the path
    // data: shapely emits it as a second subpath, so a holed frame has more than one 'M'.
    const A = JSON.parse(
      readFileSync(join(process.cwd(), 'public/avatar-assets.json'), 'utf8'),
    ) as AvatarAssets
    const styles = Object.keys(A.glasses ?? {})
    expect(styles.length, 'the eyewear family should be bundled').toBeGreaterThan(0)
    for (const k of styles) {
      const frag = A.glasses![k]
      const tinted = frag.includes(LENS_TINT)
      const framePath = /<path[^>]*fill="rgb\(64,70,78\)"[^>]*d="([^"]*)"/.exec(frag)
        ?? /d="([^"]*)"[^>]*fill="rgb\(64,70,78\)"/.exec(frag)
      expect(framePath, `${k} has no frame path`).toBeTruthy()
      const subpaths = (framePath![1].match(/M /g) ?? []).length
      if (tinted) {
        expect(frag, `${k} is tinted so it must carry a lens`).toContain(LENS_TINT)
      } else {
        expect(subpaths, `${k} is clear but its frame has no opening cut out`).toBeGreaterThan(1)
      }
    }
  })

  // ---------------------------------------------------------------------------------
  // ⭐⭐ A TINTED LENS IS OPAQUE — Ryan, 2026-09-21: "When wearing sunglasses, the eyes should
  // not be able to be seen." Painting the eyes and letting the lens cover them is NOT enough,
  // because THE EYE IS BIGGER THAN THE LENS: measured across all 13 eye assets, the default
  // leaks 8.8% of its area past s01-classic and 11.1% past s02-aviator, eye-04-wide leaks
  // 27.8% and eye-hearts 29.5% — a rim of white and iris standing proud of the frame.
  // ---------------------------------------------------------------------------------

  it('hides the eyes behind a tinted lens, and only behind a tinted one', () => {
    const A = JSON.parse(
      readFileSync(join(process.cwd(), 'public/avatar-assets.json'), 'utf8'),
    ) as AvatarAssets
    const eyeKeys = [...Object.keys(A.eyes), ...Object.keys(A.specialEyes)]
    expect(eyeKeys.length, 'eyes should be bundled').toBeGreaterThan(5)
    for (const g of Object.keys(A.glasses ?? {})) {
      const isTinted = A.glasses![g].includes(LENS_TINT)
      for (const e of eyeKeys) {
        const svg = composeAvatar(
          { ...cfg, base: 'base-neck-100', hair: null, facialHair: null, eyes: e, glasses: g }, A,
        )
        const ds = [...(A.eyes[e] ?? A.specialEyes[e]).matchAll(/d="([^"]*)"/g)].map((m) => m[1])
        const kept = ds.filter((d) => svg.includes(`d="${d}"`)).length
        if (isTinted) expect(kept, `${g} + ${e}: an eye showed through a tinted lens`).toBe(0)
        // ⚠ the other half of the rule: a CLEAR frame must not eat the eyes
        else expect(kept, `${g} + ${e}: a clear frame dropped the eyes`).toBeGreaterThan(0)
      }
    }
  })

  it('strips an expression\'s eyes but keeps its brows, cheeks and teeth', () => {
    const A = JSON.parse(
      readFileSync(join(process.cwd(), 'public/avatar-assets.json'), 'utf8'),
    ) as AvatarAssets
    const EYE_TOKENS = ['rgb(255,255,255)', 'rgb(117,62,21)', 'rgb(150,84,34)', 'rgb(90,60,45)']
    const BROW = 'rgb(101,70,52)'
    const topY = (d: string) => {
      const n = (d.match(/-?\d+\.?\d*/g) ?? []).map(Number)
      const ys = n.filter((_, i) => i % 2 === 1)
      return ys.length ? Math.min(...ys) : 0
    }
    const tinted = Object.keys(A.glasses ?? {}).filter((k) => A.glasses![k].includes(LENS_TINT))
    expect(tinted.length, 'there should be tinted styles').toBeGreaterThan(0)

    let sawTeeth = false
    for (const g of tinted) {
      for (const x of Object.keys(A.expressions)) {
        const svg = composeAvatar(
          { ...cfg, base: 'base-neck-100', hair: null, facialHair: null,
            eyes: null, mouth: null, expression: x, glasses: g }, A,
        )
        for (const m of A.expressions[x].matchAll(/<path[^>]*\/?>/g)) {
          const d = /d="([^"]*)"/.exec(m[0])?.[1]
          if (!d) continue
          const isEyeToken = EYE_TOKENS.some((t) => m[0].includes(`fill="${t}"`))
          const present = svg.includes(`d="${d}"`)
          if (isEyeToken && topY(d) < 1072) {   // the split compose uses, pinned above
            expect(present, `${g} + ${x}: an expression eye survived`).toBe(false)
          } else if (isEyeToken) {
            // ⭐ the eye white is ALSO an open mouth's teeth, at y1192. They must survive —
            // this is exactly why the strip is confined to the expression's upper half.
            expect(present, `${g} + ${x}: the teeth were stripped with the eyes`).toBe(true)
            sawTeeth = true
          }
          if (m[0].includes(`fill="${BROW}"`)) {
            expect(present, `${g} + ${x}: a brow was dropped`).toBe(true)
          }
        }
      }
    }
    expect(sawTeeth, 'an open-mouth expression should have exercised the teeth case').toBe(true)
  })

  // ---------------------------------------------------------------------------------
  // ⭐ THE GLASS HIGHLIGHT. Ryan, 2026-09-21: an empty opening "just seems like they are empty
  // frames". A clear lens carries a highlight so it reads as glass rather than a hole.
  // ---------------------------------------------------------------------------------

  it('gives every clear style a highlight, and never lets its token reach the output', () => {
    const A = JSON.parse(
      readFileSync(join(process.cwd(), 'public/avatar-assets.json'), 'utf8'),
    ) as AvatarAssets
    const GLINT = 'rgb(226,240,250)'
    let clear = 0
    for (const g of Object.keys(A.glasses ?? {})) {
      const frag = A.glasses![g]
      if (!frag.includes(LENS_TINT)) {
        clear++
        expect(frag, `${g} is clear but has no glass highlight — it reads as an empty frame`)
          .toContain(GLINT)
      }
      for (const skin of PALETTE.skin) {
        const svg = composeAvatar({ ...cfg, base: 'base-neck-100', hair: null, facialHair: null,
          glasses: g, skin }, A)
        expect(svg, `${g} on ${skin}: the glint marker leaked`).not.toContain(GLINT)
      }
    }
    expect(clear, 'there should be clear styles').toBeGreaterThan(0)
  })

  it('makes the highlight translucent, so the eye reads through the glass', () => {
    // ⭐⭐ Ryan, 2026-09-21: "The glint is there but you can't see through it. It is glass and
    // should be subtle so you can still see through it." An opaque band is a blind. This is
    // the first fill-opacity in the avatar system, so it is worth a test of its own: without
    // it the highlight is a solid stripe across the iris and nobody notices until they look.
    const A = JSON.parse(
      readFileSync(join(process.cwd(), 'public/avatar-assets.json'), 'utf8'),
    ) as AvatarAssets
    const GLINT = 'rgb(226,240,250)'
    let checked = 0
    for (const g of Object.keys(A.glasses ?? {})) {
      const frag = A.glasses![g]
      if (!frag.includes(GLINT)) continue
      checked++
      const path = new RegExp(`<path[^>]*fill="${GLINT.replace(/[()]/g, '\\$&')}"[^>]*/?>`).exec(frag)
      expect(path, `${g}: no highlight path`).toBeTruthy()
      const a = /fill-opacity="([0-9.]+)"/.exec(path![0])
      expect(a, `${g}: the highlight is opaque — it will read as a blind, not glass`).toBeTruthy()
      const v = Number(a![1])
      expect(v, `${g}: the highlight is too solid to see through`).toBeLessThanOrEqual(0.45)
      expect(v, `${g}: the highlight is too faint to read as glass`).toBeGreaterThanOrEqual(0.25)
    }
    expect(checked, 'some style should carry a highlight').toBeGreaterThan(0)
  })

  it('paints the glass as one constant tint, not a derivation', () => {
    // ⚠ The highlight USED to be derived from the skin, purely so it would stay lighter than
    // whatever it sat on. Transparency does that for free, so the derivation went. If someone
    // reintroduces a per-skin glint they have rebuilt a workaround for a solved problem.
    const A = JSON.parse(
      readFileSync(join(process.cwd(), 'public/avatar-assets.json'), 'utf8'),
    ) as AvatarAssets
    const seen = new Set<string>()
    for (const skin of PALETTE.skin) {
      const svg = composeAvatar({ ...cfg, base: 'base-neck-100', hair: null, facialHair: null,
        glasses: 'g02-rect', skin }, A)
      const m = /fill="(rgb\(214,234,250\))"/.exec(svg)
      expect(m, `${skin}: the glass tint is missing`).toBeTruthy()
      seen.add(m![1])
    }
    expect(seen.size, 'the glass tint must not vary with the skin').toBe(1)
  })

  it('keeps the highlight inside the lens, never over the frame', () => {
    // The extractor clips it to the openings the asset already has. If that ever stops
    // happening a highlight paints over the frame and the spectacles lose their outline.
    const A = JSON.parse(
      readFileSync(join(process.cwd(), 'public/avatar-assets.json'), 'utf8'),
    ) as AvatarAssets
    for (const g of Object.keys(A.glasses ?? {})) {
      const frag = A.glasses![g]
      const glint = /fill="rgb\(226,240,250\)"[^>]*d="([^"]*)"/.exec(frag)
      if (!glint) continue
      const frame = /fill="rgb\(64,70,78\)"[^>]*d="([^"]*)"/.exec(frag)
      expect(frame, `${g} has a highlight but no frame`).toBeTruthy()
      const bbox = (d: string) => {
        const n = (d.match(/-?\d+\.?\d*/g) ?? []).map(Number)
        const xs = n.filter((_, i) => i % 2 === 0)
        const ys = n.filter((_, i) => i % 2 === 1)
        return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
      }
      const [gx0, gy0, gx1, gy1] = bbox(glint[1])
      const [fx0, fy0, fx1, fy1] = bbox(frame![1])
      expect(gx0 >= fx0 && gy0 >= fy0 && gx1 <= fx1 && gy1 <= fy1,
        `${g}: the highlight escapes the frame's own bounds`).toBe(true)
    }
  })

  it('keeps the same highlight derivation in the Python composer and the builder port', () => {
    for (const file of [
      'assets/character-base/nano/compose.py',
      'assets/character-base/nano/builder-template.html',
    ]) {
      const src = readFileSync(join(process.cwd(), file), 'utf8')
      expect(src, `${file} must carry the glint token`).toContain('226,240,250')
      expect(src, `${file} must use the same glass tint`).toMatch(/214,\s*234,\s*250/)
    }
  })

  it('keeps the same eye-token list in the Python composer and the builder port', () => {
    for (const file of [
      'assets/character-base/nano/compose.py',
      'assets/character-base/nano/builder-template.html',
    ]) {
      const src = readFileSync(join(process.cwd(), file), 'utf8')
      expect(src, `${file} must strip the eyes behind a tinted lens`).toMatch(/strip_?[eE]yes/)
      for (const t of ['255,255,255', '117,62,21', '150,84,34', '90,60,45']) {
        expect(src, `${file} is missing eye token ${t}`).toContain(t)
      }
      expect(src, `${file} must not strip the brow token`).not.toMatch(/EYE_TOKENS[^\n]*101,70,52/)
    }
  })

  it('keeps the same lens derivation in the Python composer and the builder port', () => {
    // ⚠⚠ The builder is type-checked by nothing, and a builder that lies about the product's
    // colour is worse than no builder.
    for (const file of [
      'assets/character-base/nano/compose.py',
      'assets/character-base/nano/builder-template.html',
    ]) {
      const src = readFileSync(join(process.cwd(), file), 'utf8')
      expect(src, `${file} must carry the frame token`).toContain('64,70,78')
      expect(src, `${file} must carry the lens token`).toContain('96,126,156')
      expect(src, `${file} must paint the lens the same black`).toMatch(/52,\s*58,\s*68/)
    }
  })
})

// =============================================================
// Earrings
// =============================================================
// ⭐ Only 2 of the 25 hair styles cover the ear lobe at all — f09-midwavy and m15-locs, and
// those cover it completely. So the stack slot is nearly free, and earrings sit with the
// eyewear: over the hair, where a chosen accessory is never invisible.
//
// ⭐⭐ A HOOP'S HOLE IS THE SAME JIGSAW AS A LENS OPENING — the vectorizer paints the ring solid
// and butts the hole back over it, here in WHITE because a hoop hangs off the head into the
// background. ⚠⚠ And the EAR is not a hole: it is a base colour sitting inside the ear zone that
// OVERLAPS the stud painted on it, so "subtract the base-coloured paths" erases the jewellery
// outright. A hole is one CONTAINED IN THE METAL'S OWN GEOMETRY.
// =============================================================

describe('earrings', () => {
  const METAL = 'rgb(212,160,54)'
  const D_EAR = 'M 420 980 L 500 980 L 500 1060 Z'
  const D_HAIR6 = 'M 300 300 L 800 300 L 800 900 Z'
  const D_FRAME6 = 'M 500 720 L 1550 720 L 1550 1080 Z'
  const fixture6 = (): AvatarAssets => ({
    ...fixture(),
    bases: { b: '<svg viewBox="0 0 2048 2048"><path d="M 0 0 L 1 0 L 1 1 Z" fill="rgb(254,205,180)"/></svg>' },
    hair: { h: `<path d="${D_HAIR6}" fill="rgb(140,122,110)"/>` },
    glasses: { g: `<path d="${D_FRAME6}" fill="rgb(64,70,78)"/>` },
    earrings: { e: `<path d="${D_EAR}" fill="${METAL}"/>` },
  })
  const base6 = { ...cfg, base: 'b', facialHair: null, earrings: 'e', metalColour: '#D4A017' }

  it('paints the metal in the chosen colour and never leaks the token', () => {
    for (const metalColour of PALETTE.metal) {
      const svg = composeAvatar({ ...base6, metalColour }, fixture6())
      expect(svg, `${metalColour}: the metal marker leaked`).not.toContain(METAL)
    }
    const svg = composeAvatar(base6, fixture6())
    expect(svg, 'the metal takes the input verbatim').toContain('fill="rgb(212,160,23)"')
  })

  it('is hidden by a style that covers the ear, and only by such a style', () => {
    // ⭐⭐ Ryan, 2026-09-22: "if you can't see the ears then there should be no seen earring."
    // That requirement is unchanged and still the point of this test. What changed, 2026-09-26,
    // is the MECHANISM. It used to be satisfied by painting the earring WITH the ear, which
    // needed no per-style flag — but it hid the earring whenever hair sat in front of the
    // DROP, not just when hair covered the ear, and an earring is bigger than an ear. On
    // f04-longcurly the ear stayed 96.6% visible while the hoop was clipped to 5%.
    //
    // So the rule is now declared where it can be measured: hair/manifest.json coversEar.
    const covering = { ...fixture6(), hairCoversEar: ['h'] }
    const hidden = composeAvatar({ ...base6, hair: 'h', glasses: 'g' }, covering)
    expect(hidden.indexOf(`d="${D_EAR}"`),
      'a style that covers the ear paints the earring BEFORE the hair, so the hair hides it')
      .toBeLessThan(hidden.indexOf(`d="${D_HAIR6}"`))

    // ⚠ The other half, which is the half that was broken: a style that leaves the ear showing
    // must NOT clip the earring.
    const exposed = composeAvatar({ ...base6, hair: 'h', glasses: 'g' }, fixture6())
    expect(exposed.indexOf(`d="${D_EAR}"`),
      'a style that leaves the ear visible paints the earring AFTER the hair')
      .toBeGreaterThan(exposed.indexOf(`d="${D_HAIR6}"`))

    // eyewear stays in front of the earring in both, being the frontmost accessory
    for (const svg of [hidden, exposed]) {
      expect(svg.indexOf(`d="${D_EAR}"`), 'eyewear is painted after the earring')
        .toBeLessThan(svg.indexOf(`d="${D_FRAME6}"`))
    }
  })

  it('really is hidden by the two styles that cover the ear', () => {
    // The rule is only worth anything if it bites on the real assets. f09-midwavy and m15-locs
    // are the only two styles that reach the ear, and they cover it completely.
    const A = JSON.parse(
      readFileSync(join(process.cwd(), 'public/avatar-assets.json'), 'utf8'),
    ) as AvatarAssets
    const earD = /d="([^"]*)"/.exec(A.earrings!['e04-bighoop'])![1]
    for (const hair of ['f09-midwavy', 'm15-locs']) {
      const svg = composeAvatar(
        { ...cfg, base: 'base-neck-100', facialHair: null, hair, earrings: 'e04-bighoop' }, A)
      const ear = svg.indexOf(`d="${earD}"`)
      expect(ear, `${hair}: the earring should be in the document`).toBeGreaterThan(-1)
      const hairDs = [...A.hair[hair].matchAll(/d="([^"]*)"/g)].map((m) => m[1])
      const firstHair = Math.min(...hairDs.map((d) => svg.indexOf(`d="${d}"`)).filter((i) => i > -1))
      expect(ear, `${hair}: the earring must be painted before the hair that covers the ear`)
        .toBeLessThan(firstHair)
    }
  })

  it('adds nothing when none is chosen', () => {
    const svg = composeAvatar({ ...base6, earrings: null }, fixture6())
    expect(svg).not.toContain(`d="${D_EAR}"`)
    expect(svg).not.toContain(METAL)
  })

  it('keeps a hoop a RING, not a solid blob', () => {
    // ⭐⭐ The failure this exists for: the extractor's containment test stops working, the
    // white hole is no longer subtracted, and every hoop ships as a solid lozenge of gold over
    // the ear. Measured: a solid shape scores 1.00 against its own convex hull, e02-hoop
    // scores 0.54 and e04-bighoop 0.33. Anything at 0.8+ has lost its hole.
    const A = JSON.parse(
      readFileSync(join(process.cwd(), 'public/avatar-assets.json'), 'utf8'),
    ) as AvatarAssets
    const pts = (d: string) => {
      const n = (d.match(/-?\d+\.?\d*/g) ?? []).map(Number)
      const out: Array<[number, number]> = []
      for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i], n[i + 1]])
      return out
    }
    const shoelace = (p: Array<[number, number]>) => {
      let a = 0
      for (let i = 0; i < p.length; i++) {
        const j = (i + 1) % p.length
        a += p[i][0] * p[j][1] - p[j][0] * p[i][1]
      }
      return Math.abs(a) / 2
    }
    // Andrew's monotone chain
    const hull = (p: Array<[number, number]>) => {
      const s = [...p].sort((a, b) => a[0] - b[0] || a[1] - b[1])
      const cross = (o: number[], a: number[], b: number[]) =>
        (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
      const half = (arr: Array<[number, number]>) => {
        const h: Array<[number, number]> = []
        for (const q of arr) {
          while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop()
          h.push(q)
        }
        return h
      }
      const lo = half(s), up = half([...s].reverse())
      return [...lo.slice(0, -1), ...up.slice(0, -1)]
    }
    const hoops = Object.keys(A.earrings ?? {}).filter((k) => k.includes('hoop'))
    expect(hoops.length, 'there should be hoop styles to check').toBeGreaterThan(0)
    for (const k of hoops) {
      // one subpath per ear; check the left one
      const d = /d="([^"]*)"/.exec(A.earrings![k])![1]
      const subs = d.split('M ').filter(Boolean).map((x) => pts('M ' + x))
      const left = subs.filter((p) => p[0][0] < 1024).sort((a, b) => shoelace(b) - shoelace(a))[0]
      expect(left, `${k}: no left-hand subpath`).toBeTruthy()
      const ratio = shoelace(left) / shoelace(hull(left))
      expect(ratio, `${k} is a solid blob (${ratio.toFixed(2)}), its hole was not cut`)
        .toBeLessThan(0.8)
    }
  })

  it('keeps the same metal token in the Python composer and the builder port', () => {
    for (const file of [
      'assets/character-base/nano/compose.py',
      'assets/character-base/nano/builder-template.html',
    ]) {
      const src = readFileSync(join(process.cwd(), file), 'utf8')
      expect(src, `${file} must carry the metal token`).toContain('212,160,54')
      expect(src, `${file} must stack the earrings`).toMatch(/earrings/i)
    }
  })
})

// =============================================================
// Garments
// =============================================================
// ⭐ A garment is painted in the base's OWN SHIRT TOKENS, so `--shirt` recolours it exactly as
// it recolours the default shirt. No new token, no new config field, no new palette.
//
// ⭐⭐ ONE ASSET SERVES ALL FOUR BASES even though their shirts differ — base-140's is 2.16%
// larger in area than base-100's, because the collar opening widens with the neck. A traced
// garment comes back SOLID and the per-base neck painted on top cuts the right collar. The
// collar is paint order, not geometry.
// =============================================================

describe('background', () => {
  const bundle = () => JSON.parse(
    readFileSync(join(process.cwd(), 'public/avatar-assets.json'), 'utf8'),
  ) as AvatarAssets

  it('offers the same backgrounds the identity palette does', () => {
    // ⚠⚠ THE SAME THIRTEEN VALUES LIVE IN THREE PLACES. `AVATAR_BACKGROUNDS` is the
    // source; `PALETTE.background` in lib/avatar/compose.ts copies them because that
    // file has NO imports by design (it is a port of compose.py and is itself mirrored
    // into builder-template.html, which can import nothing); and `BGS` in the builder
    // copies them again. Two tests pin the chain — this one, and the BGS one below.
    //
    // ⭐ Why they must agree: the avatar's background IS the member's colour, and that
    // colour is what a Showdown duel glows with. A drift here would let a member's
    // avatar and their duel side be different colours, which is the single thing this
    // colour exists to prevent.
    expect(PALETTE.background.map((c) => c.toUpperCase()))
      .toEqual(AVATAR_BACKGROUNDS.map((c) => c.toUpperCase()))
  })

  it('offers the same swatches in the builder as in the product', () => {
    // ⚠⚠ `PALETTE.background` and builder-template's `BGS` are the SAME LIST WRITTEN TWICE.
    // Nothing type-checks the builder, so a palette changed in one place and not the other
    // drifts silently and the admin builder quietly previews colours nobody can pick — or
    // misses ones they can. This is the same drift the three compositors are already guarded
    // against; the palettes were not.
    const html = readFileSync(
      join(process.cwd(), 'assets/character-base/nano/builder-template.html'), 'utf8')
    const m = /const BGS\s*=\s*\[([^\]]*)\]/.exec(html)
    expect(m, 'builder-template.html should declare BGS').toBeTruthy()
    const bgs = [...m![1].matchAll(/'(#[0-9A-Fa-f]{6})'/g)].map((x) => x[1].toUpperCase())
    expect(bgs, 'the builder\'s backgrounds must match PALETTE.background exactly')
      .toEqual(PALETTE.background.map((c) => c.toUpperCase()))
  })

  // ⚠⚠ THE SAME DRIFT, FOR THE OTHER TWO PALETTES. `BGS` was pinned above and `SKINS`/`HAIRS`
  // were not, which is an arbitrary place to stop: all three are lists written twice, and
  // nothing type-checks the builder. Skin drifted the moment PALETTE.skin went from eight to
  // fifteen — the builder went on previewing eight with nothing failing.
  it.each([
    ['SKINS', 'skin'],
    ['HAIRS', 'hair'],
  ] as const)('offers the same %s swatches in the builder as in the product', (name, key) => {
    const html = readFileSync(
      join(process.cwd(), 'assets/character-base/nano/builder-template.html'), 'utf8')
    const m = new RegExp(`const ${name}\\s*=\\s*\\[([^\\]]*)\\]`).exec(html)
    expect(m, `builder-template.html should declare ${name}`).toBeTruthy()
    const got = [...m![1].matchAll(/'(#[0-9A-Fa-f]{6})'/g)].map((x) => x[1].toUpperCase())
    expect(got, `the builder's ${name} must match PALETTE.${key} exactly`)
      .toEqual(PALETTE[key].map((c) => c.toUpperCase()))
  })

  // ⚠⚠ REMOVED 2026-09-25: 'offers no near-white background'.
  //
  // It asserted every background sat under relative luminance 0.45, written when Ryan said
  // "don't keep white" and the palette was four deep colours. He has since chosen the
  // opposite — 22 soft tones "just slightly darker than pastel" — so the assertion now
  // contradicts the design rather than protecting it.
  //
  // ⭐ Its own comment said to DELETE it rather than work around it if a pale background was
  // ever wanted back, precisely so this moment would not turn into a fudged threshold. The
  // thing actually worth guarding — that a head never disappears into its own background — is
  // in avatarGradient.test.ts, measured by ΔE against every skin tone.


  it('repaints the canvas only, never the eye whites', () => {
    // ⚠⚠⚠ THE BACKGROUND AND THE EYE WHITE ARE THE SAME TOKEN, rgb(255,255,255), and the
    // recolour used to be a global swap — so every eye white, and every tooth, was painted the
    // background colour. It shipped that way for as long as the palette has existed and NOBODY
    // COULD SEE IT, because every background offered is a near-white tint: the pink one tints
    // the eyes pink by a degree no eye can catch. It only became visible when a bold colour was
    // tried and the avatar looked back with red eyeballs.
    //
    // ⭐ This test exists because the bug is INVISIBLE AT THE PALETTE WE SHIP. It deliberately
    // uses a colour that is not in the palette, so it keeps biting even if every background is
    // pale again tomorrow.
    const A = bundle()
    const BOLD = '#BE123C'
    for (const expression of ['laughing', 'x-happy']) {
      const svg = composeAvatar(
        { ...cfg, base: 'base-neck-100', hair: null, facialHair: null,
          eyes: null, mouth: null, expression, background: BOLD }, A)
      const white = (svg.match(/fill="rgb\(255,255,255\)"/g) ?? []).length
      const bold = (svg.match(/fill="rgb\(190,18,60\)"/g) ?? []).length
      expect(bold, `${expression}: exactly one path — the canvas — takes the background`).toBe(1)
      expect(white, `${expression}: the eye white must survive a bold background`)
        .toBeGreaterThan(0)
    }
  })

  it('leaves no path holding the raw background token once recoloured', () => {
    // ⚠ The other direction: the canvas must actually BE repainted. Position-matching could
    // miss it if a base ever stopped leading with its canvas rect, and the failure would be a
    // white background that silently ignores the setting.
    const A = bundle()
    for (const base of Object.keys(A.bases)) {
      const svg = composeAvatar(
        { ...cfg, base, hair: null, facialHair: null, eyes: null, mouth: null,
          expression: null, background: '#BE123C' }, A)
      expect(svg, `${base}: the canvas kept the raw background token`)
        .toContain('fill="rgb(190,18,60)"')
    }
  })
})

describe('garments', () => {
  const SHIRT = 'rgb(30,118,214)'
  const SHIRT2 = 'rgb(50,118,183)'
  const SKIN = 'rgb(254,205,180)'
  const SHIRT3 = 'rgb(96,170,240)'
  const bundle = () => JSON.parse(
    readFileSync(join(process.cwd(), 'public/avatar-assets.json'), 'utf8'),
  ) as AvatarAssets

  it('paints only in the shirt tokens and the skin token', () => {
    // ⭐ THREE shirt tokens, all from the one `--shirt` input: the body verbatim, a darker
    // shadow, and a LIGHTER one for panelling. The light token is the third, added because
    // `shirt -> shirt2` was already the dark step — and the sports top's largest panel is
    // lighter than its body, which a second dark token would have rendered backwards.
    // ⭐⭐ The SKIN token is the other half, and it is not a leak: a garment whose neckline opens
    // below the neck has to bring the chest it exposes, because the avatar is a bust and there
    // is none. Ryan, 2026-09-22: "The crew and v neck doesn't show any more skin." Carried in
    // the skin token so `--skin` recolours it with the face.
    const A = bundle()
    const keys = Object.keys(A.garments ?? {})
    expect(keys.length, 'garments should be bundled').toBeGreaterThan(0)
    for (const k of keys) {
      const fills = [...A.garments![k].matchAll(/fill="(rgb\([^)]*\))"/g)].map((m) => m[1])
      const off = [...new Set(fills)]
        .filter((c) => c !== SHIRT && c !== SHIRT2 && c !== SHIRT3 && c !== SKIN)
      expect(off, `${k} paints off palette — nothing would recolour it`).toEqual([])
    }
  })

  it('recolours the exposed chest with the SKIN, not the shirt', () => {
    // ⚠ The failure worth catching: the chest emitted in a shirt token instead of the skin
    // token. It would look right on the default palette and turn blue the moment anyone
    // changed their shirt.
    //
    // ⭐⭐ THE CHEST IS INJECTED, NOT LOOKED FOR. This test used to filter the bundle for a
    // garment carrying the skin token and assert there was one. That held while the set
    // included a v-neck and a crew; the textured set that replaced them is six closed
    // necklines, so the filter went empty and the test failed — reporting the ART, not the
    // code. The mechanism still has to work the day a v-neck comes back, so the garment is
    // fabricated here and the assertion is about `composeAvatar`. That also makes it a real
    // test rather than one that passes trivially whenever nothing exercises it.
    const A = bundle()
    const key = Object.keys(A.garments ?? {})[0]
    // ⚠ A bundled asset is INNER MARKUP — no <svg> wrapper and no closing tag. The first
    // version of this injected by replacing '</svg>', which is not there, so nothing was added
    // and `not.toContain(SKIN)` passed on a garment that had no chest. Appending is the only
    // thing that works, and the positive assertion below is what proves it did.
    const chestD = 'M 900 1800 L 1150 1800 L 1025 1980 z'
    const withChest = {
      ...A,
      garments: { ...A.garments,
        [key]: `${A.garments![key]}<path fill="${SKIN}" d="${chestD}"/>` },
    }
    const rgbOf = (hex: string) => {
      const n = parseInt(hex.replace('#', ''), 16)
      return `rgb(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255})`
    }
    for (const skin of PALETTE.skin) {
      const svg = composeAvatar(
        { ...cfg, base: 'base-neck-100', hair: null, facialHair: null, garment: key, skin },
        withChest)
      expect(svg, `${key}: the injected chest never reached the output`).toContain(chestD)
      expect(svg, `${key} on ${skin}: the chest kept the raw skin token`).not.toContain(SKIN)
      expect(svg, `${key} on ${skin}: the chest should be painted in the chosen skin`)
        .toContain(rgbOf(skin))
    }
    // and the light tone is in use by the art as it stands — by ANY garment, never by name.
    // ⚠ The old assertion named `g03-sport`, which no longer exists: a key is a filename and
    // filenames change every time the set is regenerated.
    expect(Object.values(A.garments ?? {}).some((g) => g.includes(SHIRT3)),
      'some garment should use the light tone').toBe(true)
  })

  it('replaces the base shirt rather than sitting on top of it', () => {
    // ⚠ The base's shirt is LIFTED OUT. A garment defines its own silhouette and may be
    // narrower somewhere; the old shirt left underneath would show as a second collar.
    const A = bundle()
    const baseSvg = readFileSync(
      join(process.cwd(), 'assets/character-base/nano/bases/base-neck-100.svg'), 'utf8')
    const shirtDs = [...baseSvg.matchAll(/<path[^>]*\/?>/g)]
      .filter((m) => m[0].includes(SHIRT) || m[0].includes(SHIRT2))
      .map((m) => /d="([^"]*)"/.exec(m[0])![1])
    expect(shirtDs.length, 'the base should have shirt paths').toBe(2)
    const c = { ...cfg, base: 'base-neck-100', hair: null, facialHair: null }
    const withG = composeAvatar({ ...c, garment: Object.keys(A.garments!)[0] }, A)
    for (const d of shirtDs) {
      expect(withG.includes(`d="${d}"`), 'the base shirt must be lifted out').toBe(false)
    }
    // ...and with no garment it is still there
    const without = composeAvatar(c, A)
    for (const d of shirtDs) {
      expect(without.includes(`d="${d}"`), 'no garment must leave the base shirt alone').toBe(true)
    }
  })

  it('covers the shirt it replaces, on the widest neck', () => {
    // ⭐ The failure this exists for: a garment narrower than the base shirt leaves BACKGROUND
    // showing at the shoulder, because the shirt underneath was lifted out. Measured at
    // extraction: every garment leaves under 0.1% of the base shirt uncovered, and that is
    // anti-aliasing at the outline. A bounding box is the cheap version of the same check.
    const A = bundle()
    const baseSvg = readFileSync(
      join(process.cwd(), 'assets/character-base/nano/bases/base-neck-140.svg'), 'utf8')
    const bbox = (d: string) => {
      const n = (d.match(/-?\d+\.?\d*/g) ?? []).map(Number)
      const xs = n.filter((_, i) => i % 2 === 0)
      const ys = n.filter((_, i) => i % 2 === 1)
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
    }
    const shirtD = [...baseSvg.matchAll(/<path[^>]*\/?>/g)]
      .filter((m) => m[0].includes(SHIRT))
      .map((m) => /d="([^"]*)"/.exec(m[0])![1])[0]
    const [sx0, , sx1, sy1] = bbox(shirtD)
    for (const k of Object.keys(A.garments ?? {})) {
      const gd = /fill="rgb\(30,118,214\)"[^>]*d="([^"]*)"/.exec(A.garments![k])![1]
      const [gx0, , gx1, gy1] = bbox(gd)
      expect(gx0, `${k}: narrower than the shirt on the left`).toBeLessThanOrEqual(sx0 + 2)
      expect(gx1, `${k}: narrower than the shirt on the right`).toBeGreaterThanOrEqual(sx1 - 2)
      expect(gy1, `${k}: does not reach the bottom`).toBeGreaterThanOrEqual(sy1 - 2)
    }
  })

  it('never reaches the jaw, whatever rises above the shoulder', () => {
    // ⚠ The body layer is painted AFTER the head, so anything a garment puts above the
    // shoulder — a hood, a scarf, a raised collar — lands on the jaw if it reaches that far.
    //
    // ⚠⚠ THIS PASSES TRIVIALLY ON TODAY'S ART, and it is worth saying so. The tracer only ever
    // sees VISIBLE pixels: the hood was generated BEHIND the head, so its blue path already
    // stopped at the head's edge. extract-garments.py subtracts the head as well, and on this
    // art that removes 89.5u² — 0.015% of the garment, pure anti-aliasing. So the subtraction
    // is insurance, not the thing under test here. What this catches is a FUTURE garment whose
    // art covers the chin and whose extraction lets it through.
    //
    // ⚠ Tested by CONTAINMENT, not by a bounding box. My first attempt used the head's full
    // width (x506..1534) and failed on points nowhere near it: the head is a squircle and
    // narrows sharply at its base — at y1470 it spans x687..1361.
    const A = bundle()
    // whichever garment rises highest above the shoulder is the one worth testing
    const highest = Object.keys(A.garments!).sort((a, b) => {
      const top = (k: string) => Math.min(...(A.garments![k].match(/-?\d+\.?\d*/g) ?? [])
        .map(Number).filter((_, i) => i % 2 === 1))
      return top(a) - top(b)
    })[0]
    const gd = /fill="rgb\(30,118,214\)"[^>]*d="([^"]*)"/.exec(A.garments![highest])![1]
    const rings: Array<Array<[number, number]>> = gd.split('M ').filter(Boolean).map((sub) => {
      const n = ('M ' + sub).match(/-?\d+\.?\d*/g)!.map(Number)
      const r: Array<[number, number]> = []
      for (let i = 0; i + 1 < n.length; i += 2) r.push([n[i], n[i + 1]])
      return r
    })
    const contains = (x: number, y: number) => {
      let inside = false
      for (const r of rings) {
        for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
          const [xi, yi] = r[i], [xj, yj] = r[j]
          if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
        }
      }
      return inside
    }
    // points solidly inside the head's lower half, where no garment may reach
    for (const [x, y] of [[1024, 1400], [1024, 1450], [900, 1420], [1150, 1420]]) {
      expect(contains(x, y), `the garment covers the jaw at ${x},${y}`).toBe(false)
    }
  })

  it('keeps the same two body layers in the Python composer and the builder port', () => {
    for (const file of [
      'assets/character-base/nano/compose.py',
      'assets/character-base/nano/builder-template.html',
    ]) {
      const src = readFileSync(join(process.cwd(), file), 'utf8')
      expect(src, `${file} must use the split shirt layer`).toMatch(/front[-_]?shirt/i)
      expect(src, `${file} must use the split neck layer`).toMatch(/front[-_]?neck/i)
      expect(src, `${file} must stack garments`).toMatch(/garment/i)
    }
  })
})

// =============================================================
// The SP chest mark
// =============================================================
// ⭐⭐ The one asset here that is NOT generated. The SportPool mark is TYPE — Wordmark.tsx is
// one word in Nunito 900 — so the outlines come from the real font (build-mark.py). A generator
// asked for letters returns something letter-SHAPED, and a garbled mark is worse than none.
//
// 🔴 THIS SLOT TAKES THE SPORTPOOL MARK ONLY. Never a club crest, name or kit design: those are
// protected marks, and the licence covers showing a crest in a fixture list, not putting one on
// a garment. The recorded rule is colourways, never badges.
// =============================================================

describe('the SP chest mark', () => {
  const MARK = 'rgb(200,225,255)'
  const bundle = () => JSON.parse(
    readFileSync(join(process.cwd(), 'public/avatar-assets.json'), 'utf8'),
  ) as AvatarAssets

  it('speaks the same path vocabulary as every other asset', () => {
    // ⚠⚠ THE TRAP THIS EXISTS FOR. A TrueType outline is QUADRATIC, and the font pen emits it
    // as `Q`. That renders correctly in a browser and in react-native-svg — and is invisible to
    // every tool in this pipeline, all of which parse M, L, C and Z only. Measured through one,
    // a Q path came back 26 units wide instead of 180. An asset that speaks a different dialect
    // is a trap for the next person, not just for the check that caught it.
    const A = bundle()
    expect(A.mark, 'the mark should be bundled').toBeTruthy()
    // ⚠ the `d` attributes ONLY. Scanning the whole file picks up letters from `height`,
    // `width` and `translate`, and reports commands that are not there.
    const ds = [...A.mark!.matchAll(/ d="([^"]*)"/g)].map((m) => m[1])
    expect(ds.length, 'the mark should have path data').toBeGreaterThan(0)
    const cmds = new Set(ds.join(' ').match(/[A-Za-z]/g) ?? [])
    for (const c of cmds) {
      expect('MLCz', `the mark uses "${c}" — this pipeline parses M, L, C and Z only`)
        .toContain(c)
    }
  })

  it('keeps the counter in the P — the glyphs are whole', () => {
    // ⚠⚠⚠ THE BUG THIS EXISTS FOR, and it is the nastiest kind: a corrupted glyph that still
    // looks like a glyph. build-mark.py's first parser skipped any command it did not
    // recognise, and SVGPathPen emits H and V as an optimisation. The S contains neither and
    // came out perfect; the P is full of them, so every coordinate after the first was read as
    // the wrong axis and it rendered as a slashed wedge. It shipped, and Ryan caught it by eye.
    //
    // The structural tell is the COUNTER — the enclosed hole in the P. A whole P is two
    // subpaths (outer contour plus counter); the mangled one was a single contour.
    const A = JSON.parse(
      readFileSync(join(process.cwd(), 'public/avatar-assets.json'), 'utf8'),
    ) as AvatarAssets
    const ds = [...A.mark!.matchAll(/ d="([^"]*)"/g)].map((m) => m[1])
    expect(ds.length, 'the mark is S and P, one path each').toBe(2)
    const subpaths = ds.map((d) => (d.match(/M /g) ?? []).length)
    expect(subpaths[0], 'the S is one closed contour').toBe(1)
    expect(subpaths[1], 'the P has lost its counter — the glyph is corrupt').toBe(2)
  })

  it('never lets its token reach the output, on any shirt', () => {
    const A = bundle()
    for (const shirt of PALETTE.shirt) {
      const svg = composeAvatar(
        { ...cfg, base: 'base-neck-100', hair: null, facialHair: null, mark: true, shirt }, A)
      expect(svg, `${shirt}: the mark token leaked`).not.toContain(MARK)
    }
  })

  it('appears only when asked', () => {
    const A = bundle()
    const c = { ...cfg, base: 'base-neck-100', hair: null, facialHair: null }
    const d = /d="([^"]*)"/.exec(A.mark!)![1]
    expect(composeAvatar({ ...c, mark: true }, A)).toContain(`d="${d}"`)
    expect(composeAvatar({ ...c, mark: false }, A)).not.toContain(`d="${d}"`)
  })

  it('sits entirely ON the garment, never off the shoulder', () => {
    // ⚠⚠ Three things bound this slot at once, so it is SOLVED rather than chosen: the dome is
    // a CURVE (at y1650 the shirt only reaches x1421, and placed by eye the mark hung 8.5% of
    // itself off the shoulder); the NECK is painted OVER the garment and base-140's reaches
    // x1268, so anything inboard of that is swallowed on the widest base; and the slot has to
    // be on all five garments, not just the default shirt. Every corner, every garment.
    const A = bundle()
    const rings = (d: string): Array<Array<[number, number]>> =>
      d.split('M ').filter(Boolean).map((sub) => {
        const n = ('M ' + sub).match(/-?\d+\.?\d*/g)!.map(Number)
        const r: Array<[number, number]> = []
        for (let i = 0; i + 1 < n.length; i += 2) r.push([n[i], n[i + 1]])
        return r
      })
    const inside = (rs: Array<Array<[number, number]>>, x: number, y: number) => {
      let o = false
      for (const r of rs) {
        for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
          const [xi, yi] = r[i], [xj, yj] = r[j]
          if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) o = !o
        }
      }
      return o
    }
    // ⚠ the `d` attributes ONLY, or the viewBox's "0 0 2048 2048" drags a corner to 0,0.
    const mn = [...A.mark!.matchAll(/ d="([^"]*)"/g)]
      .flatMap((m) => m[1].match(/-?\d+\.?\d*/g) ?? []).map(Number)
    const mx = mn.filter((_, i) => i % 2 === 0), my = mn.filter((_, i) => i % 2 === 1)
    const corners: Array<[number, number]> = [
      [Math.min(...mx), Math.min(...my)], [Math.max(...mx), Math.min(...my)],
      [Math.min(...mx), Math.max(...my)], [Math.max(...mx), Math.max(...my)],
    ]
    const targets: Record<string, string> = { ...(A.garments ?? {}) }
    const baseSvg = readFileSync(
      join(process.cwd(), 'assets/character-base/nano/bases/base-neck-100.svg'), 'utf8')
    targets['the default shirt'] =
      [...baseSvg.matchAll(/<path[^>]*\/?>/g)].filter((m) => m[0].includes('rgb(30,118,214)'))
        .map((m) => m[0]).join('')
    for (const [name, frag] of Object.entries(targets)) {
      const body = /fill="rgb\(30,118,214\)"[^>]*d="([^"]*)"/.exec(frag)
      expect(body, `${name}: no body path`).toBeTruthy()
      const rs = rings(body![1])
      for (const [x, y] of corners) {
        expect(inside(rs, x, y), `${name}: the mark hangs off the garment at ${x},${y}`).toBe(true)
      }
    }
  })

  it('keeps the same mark token in the Python composer and the builder port', () => {
    for (const file of [
      'assets/character-base/nano/compose.py',
      'assets/character-base/nano/builder-template.html',
    ]) {
      const src = readFileSync(join(process.cwd(), file), 'utf8')
      expect(src, `${file} must carry the mark token`).toContain('200,225,255')
      expect(src, `${file} must stack the mark`).toMatch(/mark/i)
    }
  })
})
