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

/** Recraft emits this on every path; it is a no-op and the locked assets carry it. */
const GRANDFATHERED = 'translate(0,0)'

/** Canonical hair tones. Three, not two: some styles trace as a DARK base with LIGHTER
 *  texture (short-sides), so collapsing texture to a single darker token erases the detail. */
const HAIR_BASE = 'rgb(140,122,110)'
const HAIR_SHADE = 'rgb(114,97,86)'
const HAIR_LIGHT = 'rgb(168,150,138)'

/** The base's face tone. Six SHORT hair styles carry a polygon in it, painted over their own
 *  sideburn to cap its width where the beard meets it — see `thin-sideburn.py`. It is legal
 *  in a hair asset ONLY as that cut, which is why the marker is required alongside it: an
 *  off-palette fill that arrives by accident has no marker and still fails. */
const FACE_SKIN = 'rgb(254,205,180)'
const THINNED = '<!--sideburn-thinned-->'

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
      const allowed = new Set([HAIR_BASE, HAIR_SHADE, HAIR_LIGHT, FACE_SKIN])
      const unexpected = [...new Set(fills)].filter((c) => !allowed.has(c))
      expect(unexpected, `${f.name} has off-palette fills`).toEqual([])
      if (fills.includes(FACE_SKIN)) {
        expect(f.body, `${f.name} paints in the face tone without the sideburn-cut marker`)
          .toContain(THINNED)
      }
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
    for (const dir of [BASES, HAIR, EYES, MOUTHS]) {
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
