import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { AVATAR_GRADIENTS, hashUserIdToIndex, avatarGradient } from '../avatarGradient'

// Drift guard for the avatar palette.
//
// A user's colour is AVATAR_GRADIENTS[hash(userId) % length], so the palette's
// CONTENTS, ORDER and LENGTH all have to match the RN copy or the same person
// renders in a different colour on each platform. The RN file is read as text
// rather than imported — it pulls in react-native, which is not a root
// dependency, and the runner is environment: 'node'.

const rnSource = readFileSync(
  new URL('../../../mobile/components/pool-detail/BanterSheet.tsx', import.meta.url),
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
    expect(rn, 'could not parse AVATAR_GRADIENTS from mobile/…/BanterSheet.tsx').not.toBeNull()
    expect(rn!.length).toBeGreaterThan(0)
  })

  it('has the same colours in the same order', () => {
    // Order matters as much as contents — the hash indexes into this array.
    expect(AVATAR_GRADIENTS.map((p) => [...p])).toEqual(rn!)
  })

  it('is the same length, so the modulo lands on the same bucket', () => {
    expect(AVATAR_GRADIENTS.length).toBe(rn!.length)
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
