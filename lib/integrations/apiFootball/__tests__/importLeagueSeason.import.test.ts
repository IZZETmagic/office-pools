// =============================================================
// League import — the integrated path.
// =============================================================
// importLeagueSeason.phase.test.ts covers the phase heuristic in isolation.
// This covers what the importer DOES with it: which fixtures reach the insert,
// what is skipped and why, that round_label is carried through, and that an
// ordinal collision inside the chosen phase refuses to commit rather than
// silently merging two matchweeks into one.
// =============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

const getTeamsForLeague = vi.fn()
const getFixtures = vi.fn()

vi.mock('@/lib/integrations/apiFootball/client', () => ({
  ApiFootballClient: {
    getTeamsForLeague: (...a: unknown[]) => getTeamsForLeague(...a),
    getFixtures: (...a: unknown[]) => getFixtures(...a),
  },
  getLastQuota: () => ({ requestsRemaining: null, rateLimitRemaining: null }),
}))

const { importLeagueSeason } = await import('@/lib/integrations/apiFootball/importLeagueSeason')

type Inserted = Record<string, unknown>

/** Minimal Supabase double: a tournament exists, no teams/matches yet. */
function fakeSupabase() {
  const inserted: Record<string, Inserted[]> = { teams: [], matches: [] }
  const client = {
    from(table: string) {
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () =>
          table === 'tournaments' ? { data: { tournament_id: 't1' }, error: null } : { data: null, error: null },
        // teams / matches "already present" lookups resolve to empty
        then: undefined,
        insert: (rows: Inserted[]) => {
          inserted[table] = [...(inserted[table] ?? []), ...rows]
          return {
            select: async () => ({
              data: rows.map((r, i) => ({ team_id: `team-${i}`, external_team_id: r.external_team_id })),
              error: null,
            }),
            then: (res: (v: { error: null }) => unknown) => res({ error: null }),
          }
        },
      }
      // `await supabase.from(x).select(...).eq(...)` resolves to {data:[],error:null}
      ;(builder as { then: unknown }).then = (res: (v: { data: never[]; error: null }) => unknown) =>
        res({ data: [], error: null })
      return builder
    },
  }
  return { client: client as never, inserted }
}

function team(id: number, name: string, code: string) {
  return { team: { id, name, code, logo: null } }
}

function fixture(id: number, round: string, date: string, home: number, away: number) {
  return {
    fixture: { id, date, venue: { name: 'Ground', city: 'Town' }, status: { short: 'NS' } },
    league: { round },
    teams: { home: { id: home, name: `T${home}` }, away: { id: away, name: `T${away}` } },
  }
}

beforeEach(() => {
  getTeamsForLeague.mockReset()
  getFixtures.mockReset()
})

describe('importLeagueSeason — regular season only', () => {
  it('imports the league phase and skips the play-off tail with a reason', async () => {
    getTeamsForLeague.mockResolvedValue([team(1, 'Alpha', 'ALP'), team(2, 'Beta', 'BET')])
    getFixtures.mockResolvedValue([
      fixture(100, 'Regular Season - 1', '2026-08-15T12:00:00Z', 1, 2),
      fixture(101, 'Regular Season - 2', '2026-08-22T12:00:00Z', 2, 1),
      // Bundesliga / Ligue 1 / Portugal all carry exactly this.
      fixture(102, 'Final', '2027-05-30T12:00:00Z', 1, 2),
    ])

    const { client, inserted } = fakeSupabase()
    const res = await importLeagueSeason(client, { tournament_id: 't1', league: 78, season: 2026, commit: true })

    expect(res.phase.imported).toBe('Regular Season')
    expect(res.matches.to_insert).toBe(2)
    expect(res.phase.skippedByPhase).toEqual({ Final: 1 })

    const skipped = res.matches.plan.filter((m) => m.status === 'skipped')
    expect(skipped).toHaveLength(1)
    expect(skipped[0].reason).toMatch(/not the regular season/)

    // Only regular-season fixtures reach the table, each with its matchweek.
    expect(inserted.matches).toHaveLength(2)
    expect(inserted.matches.map((m) => m.round_number)).toEqual([1, 2])
    expect(inserted.matches.every((m) => m.stage === 'regular_season')).toBe(true)
  })

  it('carries round_label through to the insert', async () => {
    getTeamsForLeague.mockResolvedValue([team(1, 'Alpha', 'ALP'), team(2, 'Beta', 'BET')])
    getFixtures.mockResolvedValue([fixture(100, 'Regular Season - 7', '2026-10-03T12:00:00Z', 1, 2)])

    const { client, inserted } = fakeSupabase()
    const res = await importLeagueSeason(client, { tournament_id: 't1', league: 39, season: 2026, commit: true })

    // The provider's own string is the audit trail that makes a future ordinal
    // problem diagnosable instead of an unexplained duplicate matchweek.
    expect(inserted.matches[0].round_label).toBe('Regular Season - 7')
    expect(res.matches.plan[0].round_label).toBe('Regular Season - 7')
  })

  it('picks the phase by size, so Scotland\'s "1st Phase" imports', async () => {
    getTeamsForLeague.mockResolvedValue([team(1, 'Alpha', 'ALP'), team(2, 'Beta', 'BET')])
    getFixtures.mockResolvedValue([
      fixture(1, '1st Phase - 1', '2026-08-01T12:00:00Z', 1, 2),
      fixture(2, '1st Phase - 2', '2026-08-08T12:00:00Z', 2, 1),
      fixture(3, '1st Phase - 3', '2026-08-15T12:00:00Z', 1, 2),
      fixture(4, 'Championship Group - 34', '2027-04-01T12:00:00Z', 1, 2),
    ])

    const { client } = fakeSupabase()
    const res = await importLeagueSeason(client, { tournament_id: 't1', league: 179, season: 2026, commit: true })
    expect(res.phase.imported).toBe('1st Phase')
    expect(res.matches.to_insert).toBe(3)
  })
})

describe('importLeagueSeason — refuses rather than corrupting', () => {
  it('throws on an ordinal collision inside the chosen phase', async () => {
    getTeamsForLeague.mockResolvedValue([team(1, 'Alpha', 'ALP'), team(2, 'Beta', 'BET')])
    getFixtures.mockResolvedValue([
      fixture(1, 'Regular Season - 1', '2026-08-01T12:00:00Z', 1, 2),
      fixture(2, 'Regular Season - 2', '2026-08-08T12:00:00Z', 2, 1),
      // Same phase after normalisation, same ordinal, different label. This is
      // the shape that would merge two matchweeks into one.
      fixture(3, 'Regular Season- 2', '2026-08-09T12:00:00Z', 1, 2),
    ])

    const { client, inserted } = fakeSupabase()
    await expect(
      importLeagueSeason(client, { tournament_id: 't1', league: 1, season: 2026, commit: true })
    ).rejects.toThrow(/ordinal collision/)

    // Nothing written — the guard runs before any fixture insert.
    expect(inserted.matches).toHaveLength(0)
  })

  it('throws when no phase has numbered rounds at all', async () => {
    getTeamsForLeague.mockResolvedValue([team(1, 'Alpha', 'ALP'), team(2, 'Beta', 'BET')])
    getFixtures.mockResolvedValue([
      fixture(1, 'Semi-finals', '2027-05-01T12:00:00Z', 1, 2),
      fixture(2, 'Final', '2027-05-10T12:00:00Z', 1, 2),
    ])

    const { client } = fakeSupabase()
    await expect(
      importLeagueSeason(client, { tournament_id: 't1', league: 1, season: 2026, commit: true })
    ).rejects.toThrow(/no numbered round phase/)
  })
})
