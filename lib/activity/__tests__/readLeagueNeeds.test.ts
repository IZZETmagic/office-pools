// readLeagueNeeds — which league pools may ask anything of the member at all.

import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readLeagueNeeds, type LeagueActivityPool } from '../readLeagueActivity'

const pool = (o: Partial<LeagueActivityPool> = {}): LeagueActivityPool => ({
  poolId: 'pl',
  poolName: 'Office PL',
  seasonId: 'pl-2026',
  mode: 'pickem',
  tableLockAt: null,
  startMatchweek: 1,
  archivedAt: null,
  entries: [{ entryId: 'e1', entryName: 'Ryan' }],
  entrantCount: 12,
  ...o,
})

/** Any read at all fails the test: an archived pool must be dropped before the facts read. */
const noReads = new Proxy({}, {
  get() {
    throw new Error('read the database for an archived pool')
  },
}) as unknown as SupabaseClient

describe('readLeagueNeeds', () => {
  it('an archived pool asks nothing, and is dropped before the card-facts read', async () => {
    const archived = pool({ archivedAt: '2026-10-01T00:00:00Z' })
    expect(await readLeagueNeeds(noReads, [archived], Date.now())).toEqual([])
  })

  it('an active pool still reaches the facts read', async () => {
    await expect(readLeagueNeeds(noReads, [pool()], Date.now())).rejects.toThrow('read the database')
  })
})
