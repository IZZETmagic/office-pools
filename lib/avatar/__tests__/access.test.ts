import { describe, expect, it } from 'vitest'

import { ownedSource, pickableKeys, toAvatarAccess, type GatedAssetRow } from '../storedConfig'

// The VIEW half of migration 183. The lock is the database trigger, proven by
// scripts/verify-avatar-grants.sql; these pin what a picker OFFERS.

const HAIR = ['f01-bob', 'm03-quiff', 'x-gift-crown']

const rows: GatedAssetRow[] = [
  // gated, owned by the caller (the embed carries their grant)
  { slot: 'hair', asset_key: 'x-gift-crown', avatar_asset_grants: [{ source: 'gift' }] },
  // gated, NOT owned (RLS returned no grant row)
  { slot: 'glasses', asset_key: 'x-gift-specs', avatar_asset_grants: [] },
]

describe('toAvatarAccess', () => {
  it('gates every row and owns only the ones with a grant', () => {
    const a = toAvatarAccess(rows)
    expect([...a.gated].sort()).toEqual(['glasses:x-gift-specs', 'hair:x-gift-crown'])
    expect([...a.owned]).toEqual([['hair:x-gift-crown', 'gift']])
  })

  it('a malformed grant leaves the asset gated but never owned', () => {
    // ⚠ The failure that matters: an unrecognised source must not make an asset pickable.
    const a = toAvatarAccess([
      { slot: 'hair', asset_key: 'x-gift-crown', avatar_asset_grants: [{ source: 'stolen' }] },
      { slot: 'hair', asset_key: 'x-odd', avatar_asset_grants: null },
    ])
    expect(a.gated.has('hair:x-gift-crown')).toBe(true)
    expect(a.owned.size).toBe(0)
    expect(pickableKeys('hair', ['x-gift-crown', 'x-odd', 'f01-bob'], a)).toEqual(['f01-bob'])
  })

  it('skips a row with no usable slot or key rather than throwing', () => {
    expect(toAvatarAccess([{ slot: null, asset_key: 1, avatar_asset_grants: [] }]).gated.size).toBe(0)
  })
})

describe('pickableKeys', () => {
  it('the owner sees their gift among the free options', () => {
    expect(pickableKeys('hair', HAIR, toAvatarAccess(rows))).toEqual(HAIR)
  })

  it('anyone else does not', () => {
    const someoneElse = toAvatarAccess(rows.map((r) => ({ ...r, avatar_asset_grants: [] })))
    expect(pickableKeys('hair', HAIR, someoneElse)).toEqual(['f01-bob', 'm03-quiff'])
  })

  it('gating is per SLOT — the same key in another slot is untouched', () => {
    const a = toAvatarAccess([
      { slot: 'garment', asset_key: 'f01-bob', avatar_asset_grants: [] },
    ])
    expect(pickableKeys('hair', HAIR, a)).toEqual(HAIR)
  })

  it('nothing gated means nothing hidden', () => {
    expect(pickableKeys('hair', HAIR, toAvatarAccess([]))).toEqual(HAIR)
  })
})

describe('ownedSource', () => {
  const a = toAvatarAccess(rows)
  it('names how the owner got it — the Gift tag reads this', () => {
    expect(ownedSource('hair', 'x-gift-crown', a)).toBe('gift')
  })
  it('is null for a free asset, for None, and for a gated asset someone else owns', () => {
    expect(ownedSource('hair', 'f01-bob', a)).toBeNull()
    expect(ownedSource('hair', null, a)).toBeNull()
    expect(ownedSource('glasses', 'x-gift-specs', a)).toBeNull()
  })
})
