import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  AVATAR_GRADIENTS, AVATAR_BACKGROUNDS, AVATAR_COLOUR_NAMES,
  hashUserIdToIndex, avatarGradient, avatarIndexFor, avatarColor, isAvatarColourName,
} from '../avatarGradient'

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
  // ⚠ The floor is 25, not 40. No palette of this size can put every pair above 40;
  // at thirteen colours, 9 of the 78 pairings still sit under it and are meant to be
  // resolved by shifting one side at duel time. 25 is the line below which two
  // colours are indistinguishable rather than merely close, and it is what the
  // current set clears. Raising it means dropping colours.
  const FLOOR = 25

  it('keeps every pair of glow tones at least ΔE 25 apart', () => {
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
    for (const gone of ['violet', 'indigo', 'amber', 'chartreuse', 'NOT A COLOUR']) {
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
    for (const bad of ['Teal', 'violet', '', null, undefined, 7, {}, 'teal ']) {
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
