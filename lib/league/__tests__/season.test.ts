// =============================================================
// The season read — the cacheable half of the contract
// =============================================================
// Decision 12. What is testable here is the SHAPE and the FAILURE POSTURE; the
// caching itself is Next's, and whether the RLS assumption still holds is a
// property of the database (`scripts/verify-league-season-cache.ts`).
//
// The one that matters most is `throws rather than returning empties`. This
// function is wrapped in `unstable_cache`, which caches whatever it returns —
// so a swallowed PostgREST error would cache an EMPTY SEASON for the TTL and
// render every pool playing it as having no fixtures. A thrown error is not
// cached. Getting that backwards is the same class as the discarded-error
// pattern that has cost this codebase real incidents.
// =============================================================

import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readLeagueSeasonUncached, leagueSeasonCacheTag, invalidateLeagueSeason } from '../season'

// The cache is Next's; what this file tests is the shape, the failure posture,
// and the fallback. `cacheMode` lets a test choose which of those it is in.
let cacheMode: 'passthrough' | 'no-request-context' = 'passthrough'
vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => unknown) => () => {
    if (cacheMode === 'no-request-context') {
      throw new Error('Invariant: incrementalCache missing in unstable_cache')
    }
    return fn()
  },
  revalidateTag: vi.fn(() => { throw new Error('called outside a request context') }),
}))

type TableResult = { data: unknown[] | null; error: { message: string } | null }

/** A client that answers each table once, and records the columns asked for. */
function fakeAdmin(byTable: Record<string, TableResult>) {
  const selects: Record<string, string> = {}
  const client = {
    from(table: string) {
      const res = byTable[table] ?? { data: [], error: null }
      const chain = {
        select(cols: string) { selects[table] = cols; return chain },
        eq() { return chain },
        order() { return chain },
        range() { return Promise.resolve(res) },
      }
      return chain
    },
  } as unknown as SupabaseClient
  return { client, selects }
}

const OK = {
  league_clubs: { data: [{ club_id: 'c1', name: 'Arsenal', short_name: 'Arsenal', abbreviation: 'ARS', crest_url: null }], error: null },
  league_matchweeks: { data: [{ matchweek_id: 'm1', matchweek_number: 1 }], error: null },
  league_fixtures: { data: [{ fixture_id: 'f1', matchweek_id: 'm1', fixture_number: 1 }], error: null },
}

describe('readLeagueSeasonUncached', () => {
  it('returns the three collections that make up a season', async () => {
    const { client } = fakeAdmin(OK)
    const view = await readLeagueSeasonUncached(client, 's1')
    expect(view.clubs).toHaveLength(1)
    expect(view.matchweeks).toHaveLength(1)
    expect(view.fixtures).toHaveLength(1)
  })

  it('names its columns — never select star', async () => {
    // The single largest World Cup cost was `SELECT *` on two tables: 39.3% of
    // all database time across 22.1M calls. The league code has never done it
    // and this is the line that keeps it that way for the read every league page
    // makes.
    const { client, selects } = fakeAdmin(OK)
    await readLeagueSeasonUncached(client, 's1')
    for (const [table, cols] of Object.entries(selects)) {
      expect(cols, `${table} must name its columns`).not.toBe('*')
      expect(cols.length, `${table} must name its columns`).toBeGreaterThan(5)
    }
  })

  for (const table of ['league_clubs', 'league_matchweeks', 'league_fixtures']) {
    it(`THROWS when ${table} errors — an empty season must never be cached`, async () => {
      const { client } = fakeAdmin({ ...OK, [table]: { data: null, error: { message: 'boom' } } })
      await expect(readLeagueSeasonUncached(client, 's1')).rejects.toThrow(/boom/)
    })
  }

  it('pages the fixtures rather than trusting one request', async () => {
    // 380 fixtures is inside PostgREST's 1,000-row cap today. A bigger league,
    // or a competition carrying two seasons, is not — and over the cap PostgREST
    // returns exactly 1,000 rows with error null.
    let call = 0
    const client = {
      from(table: string) {
        const chain = {
          select() { return chain },
          eq() { return chain },
          order() { return chain },
          range() {
            if (table !== 'league_fixtures') return Promise.resolve({ data: [], error: null })
            call++
            // A full page first, then a short one.
            return Promise.resolve({
              data: call === 1
                ? Array.from({ length: 1000 }, (_, i) => ({ fixture_id: `f${i}` }))
                : [{ fixture_id: 'last' }],
              error: null,
            })
          },
        }
        return chain
      },
    } as unknown as SupabaseClient
    const view = await readLeagueSeasonUncached(client, 's1')
    expect(call, 'a full page must be followed by another request').toBe(2)
    expect(view.fixtures).toHaveLength(1001)
  })
})

describe('the cache tag', () => {
  it('is per SEASON, not per pool — that is the whole point', () => {
    expect(leagueSeasonCacheTag('s1')).toBe('league-season-s1')
    expect(leagueSeasonCacheTag('s1')).not.toBe(leagueSeasonCacheTag('s2'))
  })

  it('invalidation never throws at its caller', () => {
    // It is called from the fixture sync. Losing a fixture write to protect a
    // cache would be exactly the wrong way round, and `revalidateTag` only runs
    // in a request context — the mock above throws to prove the guard is real.
    expect(() => invalidateLeagueSeason('s1')).not.toThrow()
  })
})

describe('outside a request context', () => {
  // `readLeaguePoolView` is called from scripts as well as from the page and the
  // API route, and a script has no Next request scope — `unstable_cache` throws
  // `Invariant: incrementalCache missing` there. That is not a data problem and
  // must not be reported as one.
  //
  // ⚠ This test exists because the first version of season.ts did report it as
  // one, and broke all 36 checks in verify-league-pool-member-view.ts. It was
  // found by RUNNING the script, not by reading the code.
  it('falls back to reading directly instead of failing', async () => {
    vi.resetModules()
    vi.doMock('@/lib/supabase/server', () => ({
      createAdminClient: () => fakeAdmin(OK).client,
    }))
    cacheMode = 'no-request-context'
    const { getLeagueSeasonCached: fresh } = await import('../season')
    const view = await fresh('s1')
    expect(view.fixtures).toHaveLength(1)
    cacheMode = 'passthrough'
  })

  it('still throws a REAL error rather than swallowing it', async () => {
    // The fallback must be narrow. A PostgREST failure has to keep throwing, or
    // an empty season gets returned as a real one — which is the entire reason
    // the uncached reader throws in the first place.
    vi.resetModules()
    vi.doMock('@/lib/supabase/server', () => ({
      createAdminClient: () => fakeAdmin({ ...OK, league_fixtures: { data: null, error: { message: 'boom' } } }).client,
    }))
    cacheMode = 'passthrough'
    const { getLeagueSeasonCached: fresh } = await import('../season')
    await expect(fresh('s1')).rejects.toThrow(/boom/)
  })
})
