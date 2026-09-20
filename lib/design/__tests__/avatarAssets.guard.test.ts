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
    for (const f of [...svgsIn(BASES), ...svgsIn(HAIR), ...svgsIn(EYES), ...svgsIn(MOUTHS)]) {
      for (const m of f.body.matchAll(/transform="([^"]*)"/g)) {
        if (m[1].replace(/\s/g, '') !== GRANDFATHERED) offenders.push(`${f.name}: ${m[1]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps every asset in the base coordinate space', () => {
    for (const f of [...svgsIn(BASES), ...svgsIn(HAIR), ...svgsIn(EYES), ...svgsIn(MOUTHS)]) {
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
    for (const dir of [BASES, HAIR, EYES, MOUTHS, FACIALHAIR]) {
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

import { composeAvatar, PALETTE, type AvatarAssets } from '@/lib/avatar/compose'

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
    expect(svg).toContain('<linearGradient id="beardfade"')
    expect(svg).toContain('url(#beardfade)')
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
        { ...cfg, hairColour: hair, skin, facialHair: 'f' },
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
      }
    }
    expect(worst, 'stubble must stay clear of the skin everywhere').toEqual([])
  })

  it('still lifts a beard by the same amount on every hair swatch', () => {
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
