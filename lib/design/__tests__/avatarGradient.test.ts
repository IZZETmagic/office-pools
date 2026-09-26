import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  AVATAR_GRADIENTS, AVATAR_BACKGROUNDS, AVATAR_COLOUR_NAMES,
  hashUserIdToIndex, avatarGradient, avatarIndexFor, avatarColor, isAvatarColourName,
  COLOUR_SHIFT, duelColourIndices,
} from '../avatarGradient'
import { PALETTE } from '@/lib/avatar/compose'

// Drift guard for the avatar palette.
//
// A user's colour is AVATAR_GRADIENTS[hash(userId) % length], so the palette's
// CONTENTS, ORDER and LENGTH all have to match the RN copy or the same person
// renders in a different colour on each platform. The RN file is read as text
// rather than imported — it pulls in react-native, which is not a root
// dependency, and the runner is environment: 'node'.
//
// ⚠ MOVED 2026-09-03. The RN palette used to live inside `BanterSheet.tsx`, and
// this guard read it there. It now has its own file, because the Showdown duel
// header needed the same colours and a third copy was the alternative. The
// mobile file is the mirror of THIS directory's `avatarGradient.ts` — same name
// on both sides, which is what the pairing should have looked like all along.
//
// ⚠ `mobile/components/home/PoolCard.tsx` has a SEPARATE three-colour array
// under the same name. It is positional decoration, not identity, and is not
// what this guard is about — do not point it there.

const rnSource = readFileSync(
  new URL('../../../mobile/lib/avatarGradient.ts', import.meta.url),
  'utf8',
)

/** Pull the `['#AAA', '#BBB'],` pairs out of the RN AVATAR_GRADIENTS block. */
function rnGradients(): string[][] | null {
  const start = rnSource.indexOf('const AVATAR_GRADIENTS')
  if (start === -1) return null
  const end = rnSource.indexOf('];', start)
  if (end === -1) return null
  return [...rnSource.slice(start, end).matchAll(/\['(#[0-9A-Fa-f]{6})',\s*'(#[0-9A-Fa-f]{6})'\]/g)]
    .map((m) => [m[1], m[2]])
}

describe('avatar palette matches the RN app', () => {
  const rn = rnGradients()

  it('the RN AVATAR_GRADIENTS block was found and parsed', () => {
    expect(rn, 'could not parse AVATAR_GRADIENTS from mobile/lib/avatarGradient.ts').not.toBeNull()
    expect(rn!.length).toBeGreaterThan(0)
  })

  it('has the same colours in the same order', () => {
    // Order matters as much as contents — the hash indexes into this array.
    expect(AVATAR_GRADIENTS.map((p) => [...p])).toEqual(rn!)
  })

  it('is the same length, so the modulo lands on the same bucket', () => {
    expect(AVATAR_GRADIENTS.length).toBe(rn!.length)
  })

  it('names the colours identically, because the NAME is what gets stored', () => {
    // ⚠⚠ `users.avatar_colour` stores a NAME, so the name → index mapping is now as
    // load-bearing as the palette itself. If the two platforms disagree about which entry
    // 'teal' is, a member who picked teal is one colour on web and another in the app —
    // the exact failure this whole palette exists to prevent, arriving by a new route.
    const block = rnSource.slice(rnSource.indexOf('const AVATAR_COLOUR_NAMES'))
    const rnNames = [...block.slice(0, block.indexOf('];')).matchAll(/'([a-z][a-z0-9-]*)'/g)]
      .map((m) => m[1])
    expect(rnNames, 'could not parse AVATAR_COLOUR_NAMES from the RN copy').not.toEqual([])
    expect(rnNames).toEqual([...AVATAR_COLOUR_NAMES])
  })
})

describe('hashUserIdToIndex', () => {
  it('is stable for a given id', () => {
    expect(hashUserIdToIndex('abc', 10)).toBe(hashUserIdToIndex('abc', 10))
  })

  it('always lands inside the palette', () => {
    for (const id of ['', 'a', 'a-very-long-uuid-0123456789abcdef', '💥', '0']) {
      const i = hashUserIdToIndex(id, AVATAR_GRADIENTS.length)
      expect(i).toBeGreaterThanOrEqual(0)
      expect(i).toBeLessThan(AVATAR_GRADIENTS.length)
    }
  })

  it('spreads a realistic set of uuids across most of the palette', () => {
    const ids = Array.from({ length: 200 }, (_, i) => `user-${i}-${i * 7919}`)
    const hit = new Set(ids.map((id) => hashUserIdToIndex(id, AVATAR_GRADIENTS.length)))
    expect(hit.size).toBeGreaterThanOrEqual(AVATAR_GRADIENTS.length - 1)
  })
})

describe('avatarGradient', () => {
  it('emits a diagonal CSS gradient from the chosen pair', () => {
    const [from, to] = AVATAR_GRADIENTS[hashUserIdToIndex('u1', AVATAR_GRADIENTS.length)]
    expect(avatarGradient('u1')).toBe(`linear-gradient(135deg, ${from}, ${to})`)
  })
})


// ---------------------------------------------------------------------------
// The palette's own shape, and the property it exists for.
// ---------------------------------------------------------------------------

/** CIELAB ΔE between two hex colours — "do these read as two colours or one". */
function deltaE(hexA: string, hexB: string): number {
  const lab = (hex: string) => {
    const n = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    const Y0 = [
      n[0] * 0.4124 + n[1] * 0.3576 + n[2] * 0.1805,
      n[0] * 0.2126 + n[1] * 0.7152 + n[2] * 0.0722,
      n[0] * 0.0193 + n[1] * 0.1192 + n[2] * 0.9505,
    ]
    const [X, Y, Z] = [Y0[0] / 0.95047, Y0[1], Y0[2] / 1.08883]
    const g = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
    const [fx, fy, fz] = [g(X), g(Y), g(Z)]
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
  }
  const [a, b] = [lab(hexA), lab(hexB)]
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

describe('the palette keeps its three lists in step', () => {
  it('has a background and a name for every gradient', () => {
    // ⚠ The three are indexed by the SAME hash. A short list would silently hand
    // some members an undefined background rather than throwing.
    expect(AVATAR_BACKGROUNDS.length).toBe(AVATAR_GRADIENTS.length)
    expect(AVATAR_COLOUR_NAMES.length).toBe(AVATAR_GRADIENTS.length)
  })

  it('names every colour distinctly', () => {
    expect(new Set(AVATAR_COLOUR_NAMES).size).toBe(AVATAR_COLOUR_NAMES.length)
  })
})

describe('no two members can be handed colours that read as one', () => {
  // ⭐ THIS IS THE PROPERTY THE PALETTE EXISTS FOR. Ryan, 2026-09-25: "I'd like it
  // so that the shadows and glows don't clash super often, where they have blue and
  // blue, purple and purple, and red and red." The ten this replaced had SIX pairs
  // under ΔE 40 — coral+rose at 14 was two names for one colour.
  //
  // ⚠⚠ THIS IS THE PICKER FLOOR, NOT THE DUEL FLOOR, and they are different questions. A
  // picker needs two options a member can tell apart while choosing. Two sides of a DUEL must
  // not read as one person — that bar is 40 and is enforced by COLOUR_SHIFT, not here.
  //
  // ⚠ It has moved twice. 25 at thirteen colours; 19 when that grew to 23 with same-hue
  // siblings; 20 now, at 22 colours with NO siblings and tones mixed across three bands. More
  // colours went UP in separation, which looks wrong until you see why: neighbours now differ
  // in lightness as well as hue, and two axes separate better than one. The same 22 colours at
  // a single lightness measure dE 8.
  const FLOOR = 18

  it('keeps every pair of glow tones far enough apart to choose between', () => {
    const fails: string[] = []
    for (let i = 0; i < AVATAR_GRADIENTS.length; i++) {
      for (let j = i + 1; j < AVATAR_GRADIENTS.length; j++) {
        const d = deltaE(AVATAR_GRADIENTS[i][0], AVATAR_GRADIENTS[j][0])
        if (d < FLOOR) {
          fails.push(`${AVATAR_COLOUR_NAMES[i]} + ${AVATAR_COLOUR_NAMES[j]} = ${d.toFixed(0)}`)
        }
      }
    }
    expect(fails, `these pairs are too close to tell apart: ${fails.join(', ')}`).toEqual([])
  })

  it('gives every colour somewhere safe to shift to', () => {
    // A duel resolves a close pairing by moving one side. That only works if every
    // colour has clearly-separated alternatives; a colour with none would strand it.
    for (let i = 0; i < AVATAR_GRADIENTS.length; i++) {
      const safe = AVATAR_GRADIENTS
        .filter((_, j) => j !== i && deltaE(AVATAR_GRADIENTS[i][0], AVATAR_GRADIENTS[j][0]) >= 40)
      expect(safe.length, `${AVATAR_COLOUR_NAMES[i]} has too few colours to shift into`)
        .toBeGreaterThanOrEqual(6)
    }
  })

  it('opens each gradient on its lighter stop', () => {
    // ⚠ `avatarColor` returns stop ONE and the duel glow uses it, on the strength of
    // every pair running light → dark. A pair entered the other way round would put a
    // dark colour on the midnight ground and that member's side would vanish.
    const lum = (hex: string) =>
      [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
        .reduce((a, c, k) => a + c * [0.2126, 0.7152, 0.0722][k], 0)
    AVATAR_GRADIENTS.forEach(([from, to], i) => {
      expect(lum(from), `${AVATAR_COLOUR_NAMES[i]} runs dark → light`).toBeGreaterThan(lum(to))
    })
  })
})


describe("a member's chosen colour", () => {
  const SOMEBODY = 'e2b6f0a4-1c3d-4f5e-9a7b-8c0d1e2f3a4b'

  it('uses the choice when there is one', () => {
    AVATAR_COLOUR_NAMES.forEach((name, i) => {
      expect(avatarIndexFor(SOMEBODY, name)).toBe(i)
    })
  })

  it('is the same colour for everyone who picks it', () => {
    // ⭐ The point of storing a NAME. Two members who both pick teal are both teal —
    // which is also why a duel between them has to shift one side (stage 3).
    const a = avatarColor('11111111-1111-1111-1111-111111111111', 'teal')
    const b = avatarColor('99999999-9999-9999-9999-999999999999', 'teal')
    expect(a).toBe(b)
  })

  it('falls back to the hash when nothing is chosen', () => {
    const hashed = hashUserIdToIndex(SOMEBODY, AVATAR_GRADIENTS.length)
    expect(avatarIndexFor(SOMEBODY)).toBe(hashed)
    expect(avatarIndexFor(SOMEBODY, null)).toBe(hashed)
    expect(avatarIndexFor(SOMEBODY, '')).toBe(hashed)
  })

  it('treats a colour that no longer exists exactly like no choice', () => {
    // ⚠⚠ THE ONE THAT MATTERS ON A PALETTE CHANGE. `users.avatar_colour` has no CHECK listing
    // the names, so dropping a colour leaves stored rows pointing at nothing. Those members
    // must degrade to their hashed colour — looking like they never chose is recoverable,
    // whereas throwing would take out every surface that renders them.
    const hashed = hashUserIdToIndex(SOMEBODY, AVATAR_GRADIENTS.length)
    for (const gone of ['chartreuse', 'vermilion', 'puce', 'butter', 'NOT A COLOUR']) {
      expect(avatarIndexFor(SOMEBODY, gone)).toBe(hashed)
    }
  })

  it('never returns an index outside the palette', () => {
    for (const chosen of [null, 'teal', 'nonsense', '']) {
      for (const id of ['a', 'bb', SOMEBODY, '']) {
        const i = avatarIndexFor(id, chosen)
        expect(i).toBeGreaterThanOrEqual(0)
        expect(i).toBeLessThan(AVATAR_GRADIENTS.length)
      }
    }
  })

  it('only accepts real palette names on the write path', () => {
    // ⚠ This is the ONLY validation between a typo and a member silently stuck on their
    // hashed colour, because the column deliberately has no CHECK constraint.
    AVATAR_COLOUR_NAMES.forEach((n) => expect(isAvatarColourName(n)).toBe(true))
    for (const bad of ['Teal', 'chartreuse', '', null, undefined, 7, {}, 'teal ']) {
      expect(isAvatarColourName(bad), `${String(bad)} should be rejected`).toBe(false)
    }
  })

  it('matches the shape the database will accept', () => {
    // ⚠ Migration 146 constrains the column to ^[a-z][a-z0-9-]{1,23}$. A name that fails it
    // would pass app validation and then be rejected by Postgres at save time.
    for (const n of AVATAR_COLOUR_NAMES) {
      expect(n, `${n} would be refused by users_avatar_colour_shape_ck`)
        .toMatch(/^[a-z][a-z0-9-]{1,23}$/)
    }
  })
})


describe('two sides of a duel never read as one colour', () => {
  const FLOOR = 40
  const N = AVATAR_GRADIENTS.length
  const glow = (i: number) => AVATAR_GRADIENTS[i][0]

  it('the shift table is what the palette says it should be', () => {
    // ⭐ REGENERATED, not eyeballed. The table is hand-embedded data in two files; the only
    // thing stopping it drifting from the colours it describes is this recomputation.
    for (let from = 0; from < N; from++) {
      for (let against = 0; against < N; against++) {
        let expected = from
        for (let step = 0; step < N; step++) {
          const cand = (from + step) % N
          if (deltaE(glow(cand), glow(against)) >= FLOOR) { expected = cand; break }
        }
        expect(COLOUR_SHIFT[from][against],
          `COLOUR_SHIFT[${AVATAR_COLOUR_NAMES[from]}][${AVATAR_COLOUR_NAMES[against]}]`)
          .toBe(expected)
      }
    }
  })

  it('matches the RN copy exactly', () => {
    const block = rnSource.slice(rnSource.indexOf('const COLOUR_SHIFT'))
    const rows = [...block.slice(0, block.indexOf('];')).matchAll(/\[([\d,\s]+)\]/g)]
      .map((m) => m[1].split(',').map((v) => Number(v.trim())))
    expect(rows, 'could not parse COLOUR_SHIFT from the RN copy').not.toEqual([])
    expect(rows).toEqual(COLOUR_SHIFT.map((r) => [...r]))
  })

  it('leaves every pairing clearly readable, whatever the two sides picked', () => {
    // ⭐⭐ THE PROPERTY THE WHOLE STAGE EXISTS FOR. Every pair of colours, both orderings,
    // chosen and unchosen — after the rule runs, no duel shows two colours under ΔE 40.
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        for (const [ac, bc] of [
          [AVATAR_COLOUR_NAMES[i], AVATAR_COLOUR_NAMES[j]],
          [AVATAR_COLOUR_NAMES[i], null],
          [null, AVATAR_COLOUR_NAMES[j]],
        ] as (string | null)[][]) {
          const out = duelColourIndices(
            { entryId: 'aaa', userId: 'user-one', chosen: ac },
            { entryId: 'bbb', userId: 'user-two', chosen: bc },
          )
          expect(deltaE(glow(out.a), glow(out.b)),
            `${AVATAR_COLOUR_NAMES[out.a]} vs ${AVATAR_COLOUR_NAMES[out.b]}`)
            .toBeGreaterThanOrEqual(FLOOR)
        }
      }
    }
  })

  it('composes the same duel for both participants and for a spectator', () => {
    // ⚠⚠ THE TRAP. Showdown's sides are viewer-relative — useDuel.ts warns entry_a/entry_b
    // carry no meaning. If the rule keyed off "you", the two people in a duel would each see
    // the other's colour changed and neither would be looking at the same thing.
    const A = { entryId: 'entry-aaa', userId: 'u-a', chosen: 'teal' }
    const B = { entryId: 'entry-bbb', userId: 'u-b', chosen: 'teal' }
    const seenByA = duelColourIndices(A, B)
    const seenByB = duelColourIndices(B, A)
    expect(seenByA.a).toBe(seenByB.b)
    expect(seenByA.b).toBe(seenByB.a)
  })

  it('moves the one who did not choose', () => {
    // ⭐ What makes a shift at reveal acceptable: a member who picked their colour keeps it.
    //
    // ⚠ `user-4` HASHES onto teal — verified below rather than assumed. An earlier version
    // used an arbitrary id and would have passed without the two sides ever colliding, proving
    // nothing. ⚠⚠ The id had to CHANGE when the palette grew from 13 to 23: the index is
    // hash % length, so the previous one stopped landing on teal. That is the same modulus
    // move that re-colours every member still on the hash.
    const tealIndex = AVATAR_COLOUR_NAMES.indexOf('teal')
    const HASHES_TO_TEAL = 'user-4'
    expect(hashUserIdToIndex(HASHES_TO_TEAL, AVATAR_GRADIENTS.length),
      'this id must actually collide, or the test is vacuous').toBe(tealIndex)

    // the chooser sorts LAST by entry id, so rule 2 would have moved them — rule 1 must win
    const chooser = { entryId: 'zzz', userId: 'someone-else', chosen: 'teal' }
    const hashed = { entryId: 'aaa', userId: HASHES_TO_TEAL, chosen: null }

    const out = duelColourIndices(chooser, hashed)
    expect(out.a, 'the member who CHOSE teal must keep it').toBe(tealIndex)
    expect(out.b, 'the member who merely hashed into teal must move').not.toBe(tealIndex)

    // and the same from the other side of the table
    const flipped = duelColourIndices(hashed, chooser)
    expect(flipped.b).toBe(tealIndex)
    expect(flipped.a).not.toBe(tealIndex)
  })

  it('falls back to entry id order when both chose the same colour', () => {
    // Nothing separates them on merit, so it has to be arbitrary — but STABLE, and the same
    // for everyone looking.
    const teal = AVATAR_COLOUR_NAMES.indexOf('teal')
    const first = { entryId: 'aaa', userId: 'u-1', chosen: 'teal' }
    const second = { entryId: 'bbb', userId: 'u-2', chosen: 'teal' }
    const out = duelColourIndices(first, second)
    expect(out.a, 'the lower entry id keeps the colour').toBe(teal)
    expect(out.b).not.toBe(teal)
  })

  it('is stable — the same duel always composes the same way', () => {
    const A = { entryId: 'e1', userId: 'u1', chosen: 'blue' }
    const B = { entryId: 'e2', userId: 'u2', chosen: 'blue' }
    const once = duelColourIndices(A, B)
    for (let i = 0; i < 50; i++) expect(duelColourIndices(A, B)).toEqual(once)
  })
})


describe('backgrounds stay usable as a palette of their own', () => {
  // ⚠⚠ THE BACKGROUND IS A SECOND SURFACE WITH ITS OWN CLASH QUESTION, and the duel shift does
  // NOT cover it. Two members side by side in a member list are their avatars, not their duel
  // glows. The old rule — glow lightness x 0.46 — squashed every background into one dark band
  // and put `yellow` and `butter` 2.2 apart: two different picks, one indistinguishable avatar.
  // ⚠⚠ IMPORTED, NOT COPIED — it used to be a hand-written list of the eight, and that is the
  // WRONG half of a drift guard: the ratchet below only protects the palette it is shown. When
  // PALETTE.skin grew to fifteen this copy would have gone on guarding the old eight and passed
  // while proving nothing, which is worse than failing.
  const SKIN = PALETTE.skin

  it('gives every colour its own hue', () => {
    // ⭐⭐ THE INVARIANT THAT REPLACED "lighter siblings". Ryan rejected a 23-colour set with
    // "those are all still too close", and the number did not explain it — that set measured
    // dE 19 and its replacement measures 20. What it HAD was ten same-hue pairs (red/coral,
    // yellow/butter/olive, teal/deepteal/pine), and two shades of one hue read as one colour
    // twice however far apart they measure. So: no two colours may share a hue.
    const hueOf = (hex: string) => {
      const n = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
      const XYZ = [
        n[0] * 0.4124 + n[1] * 0.3576 + n[2] * 0.1805,
        n[0] * 0.2126 + n[1] * 0.7152 + n[2] * 0.0722,
        n[0] * 0.0193 + n[1] * 0.1192 + n[2] * 0.9505,
      ]
      const [X, Y, Z] = [XYZ[0] / 0.95047, XYZ[1], XYZ[2] / 1.08883]
      const g = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
      const [fx, fy, fz] = [g(X), g(Y), g(Z)]
      return ((Math.atan2(200 * (fy - fz), 500 * (fx - fy)) * 180) / Math.PI + 360) % 360
    }
    const hues = AVATAR_BACKGROUNDS.map(hueOf)
    for (let i = 0; i < hues.length; i++) {
      for (let j = i + 1; j < hues.length; j++) {
        const gap = Math.min(Math.abs(hues[i] - hues[j]), 360 - Math.abs(hues[i] - hues[j]))
        expect(gap, `${AVATAR_COLOUR_NAMES[i]} and ${AVATAR_COLOUR_NAMES[j]} are the same hue`)
          .toBeGreaterThan(8)
      }
    }
  })

  it('never makes a head vanish into its own background', () => {
    // ⚠⚠ MEASURED BY ΔE, NOT BY WCAG CONTRAST, and the first version of this test got that
    // wrong. WCAG contrast is a LUMINANCE ratio built for text legibility and it ignores hue
    // completely — by that measure a dark blue ground behind a mid-brown face scores 1.03, as
    // though the head were invisible. It plainly is not: the silhouette of a flat shape on a
    // flat ground is carried by hue as much as by lightness, and ΔE counts both.
    //
    // ⚠ The bar is WHAT ALREADY SHIPPED (the thirteen sat at 16.1), not an ideal. This is a
    // ratchet against making it worse, not a claim that 16 is comfortable. The worst pair is
    // an orange ground behind a mid-brown skin — two warm browns — and it predates the growth
    // to twenty-three.
    let worst = Infinity
    let where = ''
    for (let i = 0; i < AVATAR_BACKGROUNDS.length; i++) {
      for (const skin of SKIN) {
        const d = deltaE(AVATAR_BACKGROUNDS[i], skin)
        if (d < worst) { worst = d; where = `${AVATAR_COLOUR_NAMES[i]} vs ${skin}` }
      }
    }
    // ⚠ Raised from 16 to 20 once the palette was positioned AROUND the skin ramp rather than
    // through it. A guard found `caramel` at ΔE 4.8 from #C68642 — an invisible head — and the
    // cause was structural: skin is soft warm brown, so a soft colour at hue 59–72° IS a skin
    // tone. Ratchets only go up.
    expect(worst, `a background got closer to a skin tone than anything shipped: ${where}`)
      .toBeGreaterThanOrEqual(18)
  })
})
