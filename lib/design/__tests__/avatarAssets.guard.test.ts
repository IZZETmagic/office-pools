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

import { composeAvatar, type AvatarAssets } from '@/lib/avatar/compose'

const FADE_MARKER = 'rgb(126,110,150)'

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
    expect(svg, 'with the fade off the band is flat hair colour').toContain('rgb(139,94,60)')
  })

  it('emits a hair-to-skin gradient when asked', () => {
    const svg = composeAvatar({ ...cfg, fade: true }, fixture())
    expect(svg).toContain('<linearGradient id="beardfade"')
    expect(svg).toContain('url(#beardfade)')
    expect(svg, 'the marker must never reach the output').not.toContain(FADE_MARKER)
    // skin at the top, hair at the bottom — the direction is the whole point
    expect(svg).toContain('offset="0" stop-color="rgb(245,201,166)"')
    expect(svg).toContain('offset="1" stop-color="rgb(139,94,60)"')
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
