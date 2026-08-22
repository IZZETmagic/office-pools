// =============================================================
// League write path (vertical slice, S2).
// =============================================================
// The reason this file exists is one measured fact:
//
//   enforce_league_prediction_before_lock is a BEFORE INSERT OR UPDATE trigger
//   that RETURN NULLs once a matchweek has locked. Probed against production:
//   the INSERT does NOT raise, and writes NOTHING.
//
// So an upsert that "succeeded" tells you nothing. Every assertion below is
// about the read-back that follows it.
// =============================================================

import { describe, it, expect } from 'vitest'
import { saveLeaguePredictions, type LeaguePick } from '@/lib/league/write'

type Row = { fixture_id: string; predicted_home_score: number; predicted_away_score: number }

/**
 * Stub whose `league_predictions` read-back returns only what the fake trigger
 * ALLOWED — which is how the real database behaves.
 */
function fakeDb(opts: {
  seasonFixtures: string[]
  /** Fixtures the lock trigger silently drops. */
  locked?: string[]
  /** Rows already stored before this call. */
  existing?: Row[]
}) {
  const locked = new Set(opts.locked ?? [])
  const stored = new Map<string, Row>((opts.existing ?? []).map((r) => [r.fixture_id, r]))
  let upserts = 0

  const client = {
    from(table: string) {
      const api: Record<string, unknown> = {}
      let inIds: string[] = []
      const self = () => api
      for (const m of ['select', 'eq', 'order', 'range', 'limit']) api[m] = self
      api.in = (_col: string, ids: string[]) => { inIds = ids; return api }

      api.upsert = (rows: Array<{ fixture_id: string; predicted_home_score: number; predicted_away_score: number }>) => {
        upserts++
        for (const r of rows) {
          // The trigger: a locked fixture is dropped silently, no error.
          if (locked.has(r.fixture_id)) continue
          stored.set(r.fixture_id, {
            fixture_id: r.fixture_id,
            predicted_home_score: r.predicted_home_score,
            predicted_away_score: r.predicted_away_score,
          })
        }
        return { then: (res: (v: { error: null }) => unknown) => res({ error: null }) }
      }

      api.then = (res: (v: { data: unknown[] | null; error: null; count?: number }) => unknown) => {
        if (table === 'league_fixtures') {
          return res({ data: opts.seasonFixtures.filter((f) => inIds.includes(f)).map((f) => ({ fixture_id: f })), error: null })
        }
        const rows = inIds.length ? [...stored.values()].filter((r) => inIds.includes(r.fixture_id)) : [...stored.values()]
        return res({ data: rows, error: null, count: stored.size })
      }
      return api
    },
  }
  return { client: client as never, get upserts() { return upserts } }
}

const pick = (id: string, h = 2, a = 1): LeaguePick => ({ matchId: id, homeScore: h, awayScore: a })

describe('saveLeaguePredictions — the lock is silent, so it reads back', () => {
  it('accepts picks for an open matchweek', async () => {
    const { client } = fakeDb({ seasonFixtures: ['f1', 'f2'] })
    const r = await saveLeaguePredictions(client, {
      entryId: 'e1', seasonId: 's1', picks: [pick('f1'), pick('f2')],
    })
    expect(r.error).toBeNull()
    expect(r.accepted).toBe(2)
    expect(r.rejected).toEqual([])
    expect(r.predicted).toBe(2)
  })

  it('REPORTS a pick the lock trigger silently dropped', async () => {
    const { client } = fakeDb({ seasonFixtures: ['f1', 'f2'], locked: ['f2'] })
    const r = await saveLeaguePredictions(client, {
      entryId: 'e1', seasonId: 's1', picks: [pick('f1'), pick('f2')],
    })
    // The upsert did not error. Only the read-back reveals the truth.
    expect(r.error).toBeNull()
    expect(r.accepted).toBe(1)
    expect(r.rejected.map((p) => p.matchId)).toEqual(['f2'])
  })

  it('detects a REFUSED UPDATE, not just a missing row', async () => {
    // The subtle case: the row already exists with old values and the trigger
    // refuses the update. Counting rows would say "2 stored, all good".
    const { client } = fakeDb({
      seasonFixtures: ['f1'],
      locked: ['f1'],
      existing: [{ fixture_id: 'f1', predicted_home_score: 0, predicted_away_score: 0 }],
    })
    const r = await saveLeaguePredictions(client, {
      entryId: 'e1', seasonId: 's1', picks: [pick('f1', 3, 3)],
    })
    expect(r.rejected.map((p) => p.matchId)).toEqual(['f1'])
    expect(r.accepted).toBe(0)
  })
})

describe('saveLeaguePredictions — refuses before it writes', () => {
  it('rejects a fixture from another competition', async () => {
    const { client, upserts } = fakeDb({ seasonFixtures: ['f1'] })
    const r = await saveLeaguePredictions(client, {
      entryId: 'e1', seasonId: 's1', picks: [pick('f1'), pick('OTHER')],
    })
    expect(r.error).toMatch(/do not belong/)
    // Nothing is written when any fixture is foreign — `league_predictions` has
    // an FK to `league_fixtures` but nothing ties that fixture to the entry's
    // pool, and the trigger that would is deferred to the full L4.
    expect(upserts).toBe(0)
  })

  it('rejects a score outside the CHECK range before hitting the database', async () => {
    const { client, upserts } = fakeDb({ seasonFixtures: ['f1'] })
    const r = await saveLeaguePredictions(client, {
      entryId: 'e1', seasonId: 's1', picks: [pick('f1', 21, 0)],
    })
    expect(r.error).toMatch(/whole number/)
    expect(upserts).toBe(0)
  })

  it('rejects a non-integer score', async () => {
    const { client } = fakeDb({ seasonFixtures: ['f1'] })
    const r = await saveLeaguePredictions(client, {
      entryId: 'e1', seasonId: 's1', picks: [{ matchId: 'f1', homeScore: 1.5, awayScore: 0 }],
    })
    expect(r.error).toBeTruthy()
  })

  it('an empty save reports the current count without writing', async () => {
    const { client, upserts } = fakeDb({
      seasonFixtures: ['f1'],
      existing: [{ fixture_id: 'f1', predicted_home_score: 1, predicted_away_score: 1 }],
    })
    const r = await saveLeaguePredictions(client, { entryId: 'e1', seasonId: 's1', picks: [] })
    expect(r.predicted).toBe(1)
    expect(upserts).toBe(0)
  })
})
