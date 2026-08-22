// =============================================================
// Target resolution (L3) — which competition, and into WHICH STORAGE.
// =============================================================
// The World Cup assertions here are a regression fence, not decoration. This
// function decides what a cron that runs every 60 seconds against 623 live
// pools will sync, and the discriminated union changed its return shape.
// =============================================================

import { describe, it, expect } from 'vitest'
import {
  loadSyncTargets,
  resolveSweepTournamentIds,
  envFallbackTarget,
  type SyncTarget,
  type WorldCupSyncTarget,
} from '@/lib/integrations/apiFootball/syncTargets'

type Res = { data: unknown[] | null; error: { message: string } | null }

/** Chainable PostgREST stub; every builder method returns itself and awaits to `res`. */
function fakeDb(byTable: Record<string, Res>) {
  return {
    from(table: string) {
      const res: Res = byTable[table] ?? { data: [], error: null }
      const api: Record<string, unknown> = {}
      const self = () => api
      for (const m of ['select', 'order', 'range', 'not', 'eq', 'gte', 'lte', 'lt', 'gt', 'or', 'limit']) {
        api[m] = self
      }
      api.then = (resolve: (v: Res) => unknown) => resolve(res)
      return api
    },
  } as never
}

const WC_ROW = {
  tournament_id: '00000000-0000-0000-0000-000000000001',
  name: 'FIFA World Cup 2026',
  external_league_id: 1,
  external_season: 2026,
  external_provider: 'api_football',
  format: 'groups_knockout',
}

const PL_TOURNAMENT_ROW = {
  tournament_id: 'b1299174-d459-420d-ba0e-b6397186b935',
  name: 'Premier League 2026/27',
  external_league_id: 39,
  external_season: 2026,
  external_provider: 'api_football',
  format: 'league',
}

const PL_SEASON_ROW = {
  season_id: 'season-pl-2026',
  competition_name: 'Premier League',
  season_label: '2026/27',
  external_provider: 'api_football',
  external_league_id: 39,
  external_season: 2026,
}

function collect() {
  const errors: Array<{ stage: string; message: string }> = []
  const notes: string[] = []
  return {
    errors,
    notes,
    diag: {
      onError: (stage: string, message: string) => errors.push({ stage, message }),
      onNote: (message: string) => notes.push(message),
    },
  }
}

describe('loadSyncTargets — the World Cup must not regress', () => {
  it('V1.1 resolves the World Cup row unchanged', async () => {
    const c = collect()
    const targets = await loadSyncTargets(
      fakeDb({ league_seasons: { data: [], error: null }, tournaments: { data: [WC_ROW], error: null } }),
      c.diag,
    )
    expect(targets).toHaveLength(1)
    expect(targets[0]).toEqual({
      kind: 'world_cup',
      tournamentId: '00000000-0000-0000-0000-000000000001',
      league: 1,
      season: 2026,
      name: 'FIFA World Cup 2026',
      source: 'tournaments_row',
    })
    expect(c.errors).toHaveLength(0)
  })

  it('V1.2 falls back to env when tournaments is unreadable', async () => {
    const c = collect()
    const targets = await loadSyncTargets(
      fakeDb({
        league_seasons: { data: [], error: null },
        tournaments: { data: null, error: { message: 'column does not exist' } },
      }),
      c.diag,
    )
    expect(targets.some((t) => t.source === 'env_fallback')).toBe(true)
    expect(targets.every((t) => t.kind === 'world_cup')).toBe(true)
    expect(c.errors[0].stage).toBe('load_sync_targets')
  })

  it('V1.3 a league_seasons read failure never stops the World Cup', async () => {
    const c = collect()
    const targets = await loadSyncTargets(
      fakeDb({
        league_seasons: { data: null, error: { message: 'boom' } },
        tournaments: { data: [WC_ROW], error: null },
      }),
      c.diag,
    )
    // Exactly one World Cup target — not two, which is what falling back to env
    // inside the league arm would have produced.
    expect(targets.filter((t) => t.kind === 'world_cup')).toHaveLength(1)
    expect(c.errors.some((e) => e.message.includes('league_seasons unreadable'))).toBe(true)
  })
})

describe('loadSyncTargets — the zombie tournaments row', () => {
  it('V1.4 supersedes a format=league tournaments row with the league season, as a NOTE', async () => {
    const c = collect()
    const targets = await loadSyncTargets(
      fakeDb({
        league_seasons: { data: [PL_SEASON_ROW], error: null },
        tournaments: { data: [WC_ROW, PL_TOURNAMENT_ROW], error: null },
      }),
      c.diag,
    )
    expect(targets).toHaveLength(2)
    expect(targets.filter((t) => t.kind === 'world_cup')).toHaveLength(1)
    const league = targets.find((t) => t.kind === 'league')
    expect(league).toMatchObject({
      kind: 'league',
      seasonId: 'season-pl-2026',
      league: 39,
      season: 2026,
      name: 'Premier League 2026/27',
      source: 'league_seasons_row',
    })
    // A permanent, expected fact belongs in notes. In errors it would be a red
    // light every 60 seconds, hiding real failures.
    expect(c.errors).toHaveLength(0)
    expect(c.notes.some((n) => n.includes('superseded by league_seasons'))).toBe(true)
  })

  it('V1.5 the Premier League is emitted exactly ONCE, never into `matches`', async () => {
    const c = collect()
    const targets = await loadSyncTargets(
      fakeDb({
        league_seasons: { data: [PL_SEASON_ROW], error: null },
        tournaments: { data: [PL_TOURNAMENT_ROW], error: null },
      }),
      c.diag,
    )
    const pl = targets.filter((t) => t.league === 39)
    expect(pl).toHaveLength(1)
    expect(pl[0].kind).toBe('league')
  })
})

describe('loadSyncTargets — fails closed, never into the bracket path', () => {
  it('V1.6 a triple collision on a NON-league format emits NEITHER target', async () => {
    const c = collect()
    // The dangerous case: a league_seasons row carrying the World Cup's own
    // (api_football, 1, 2026). Superseding silently here would stop syncing 623
    // pools and report only a note.
    const targets = await loadSyncTargets(
      fakeDb({
        league_seasons: {
          data: [{ ...PL_SEASON_ROW, season_id: 'rogue', external_league_id: 1 }],
          error: null,
        },
        tournaments: { data: [WC_ROW], error: null },
      }),
      c.diag,
    )
    expect(targets.some((t) => t.league === 1 && t.kind === 'league')).toBe(false)
    expect(targets.some((t) => t.kind === 'world_cup' && t.source === 'tournaments_row')).toBe(false)
    expect(c.errors.some((e) => e.message.includes('both claim'))).toBe(true)
  })

  it('V1.7 a format=league tournaments row with no season is skipped, not World-Cup-defaulted', async () => {
    const c = collect()
    const targets = await loadSyncTargets(
      fakeDb({
        league_seasons: { data: [], error: null },
        tournaments: { data: [WC_ROW, PL_TOURNAMENT_ROW], error: null },
      }),
      c.diag,
    )
    expect(targets.some((t) => t.league === 39)).toBe(false)
    expect(c.errors.some((e) => e.message.includes('nothing to sync it into'))).toBe(true)
  })

  it('V1.8 an unrecognised format is skipped rather than treated as a bracket', async () => {
    const c = collect()
    const targets = await loadSyncTargets(
      fakeDb({
        league_seasons: { data: [], error: null },
        tournaments: { data: [WC_ROW, { ...WC_ROW, tournament_id: 't-x', format: 'ladder' }], error: null },
      }),
      c.diag,
    )
    expect(targets.some((t) => t.kind === 'world_cup' && t.tournamentId === 't-x')).toBe(false)
    expect(c.errors.some((e) => e.message.includes("format 'ladder'"))).toBe(true)
  })

  it('V1.9 a non-api_football provider is skipped on both arms', async () => {
    const c = collect()
    const targets = await loadSyncTargets(
      fakeDb({
        league_seasons: { data: [{ ...PL_SEASON_ROW, external_provider: 'opta' }], error: null },
        tournaments: { data: [{ ...WC_ROW, external_provider: 'opta' }], error: null },
      }),
      c.diag,
    )
    expect(targets.every((t) => t.source === 'env_fallback')).toBe(true)
    expect(c.errors.filter((e) => e.message.includes('opta'))).toHaveLength(2)
  })
})

describe('loadSyncTargets — the safety net is keyed on kind, not on emptiness', () => {
  it('V1.10 a league-only target list still injects the env World Cup fallback', async () => {
    const c = collect()
    const targets = await loadSyncTargets(
      fakeDb({
        league_seasons: { data: [PL_SEASON_ROW], error: null },
        // A tournaments row that gets skipped: examined, but resolved nothing.
        tournaments: { data: [{ ...WC_ROW, format: 'ladder' }], error: null },
      }),
      c.diag,
    )
    // Keyed on total emptiness, the league would keep targets.length non-zero
    // and the World Cup would silently stop syncing.
    expect(targets.some((t) => t.kind === 'world_cup')).toBe(true)
    expect(c.errors.some((e) => e.message.includes('no bracket competition resolved'))).toBe(true)
  })

  it('V1.11 no rows at all falls back to env', async () => {
    const c = collect()
    const targets = await loadSyncTargets(
      fakeDb({ league_seasons: { data: [], error: null }, tournaments: { data: [], error: null } }),
      c.diag,
    )
    expect(targets).toEqual([envFallbackTarget()])
  })

  it('V1.13 World Cup targets sort before league targets', async () => {
    const targets = await loadSyncTargets(
      fakeDb({
        league_seasons: { data: [PL_SEASON_ROW], error: null },
        tournaments: { data: [WC_ROW, PL_TOURNAMENT_ROW], error: null },
      }),
      collect().diag,
    )
    expect(targets.map((t) => t.kind)).toEqual(['world_cup', 'league'])
  })
})

describe('resolveSweepTournamentIds — the regression the union introduces', () => {
  const wc: WorldCupSyncTarget = {
    kind: 'world_cup',
    tournamentId: 'wc-1',
    league: 1,
    season: 2026,
    name: 'WC',
    source: 'tournaments_row',
  }
  const league: SyncTarget = {
    kind: 'league',
    seasonId: 'season-1',
    league: 39,
    season: 2026,
    name: 'PL',
    source: 'league_seasons_row',
  }

  it('never yields undefined for a league target', () => {
    const ids = resolveSweepTournamentIds([wc, league], new Set())
    // `targets.map(t => t.tournamentId)` would give ['wc-1', undefined], and
    // `.in('tournament_id', [...])` with an undefined returns ZERO pools at
    // HTTP 200 — the World Cup drain stopping in silence.
    expect(ids).toEqual(['wc-1'])
    expect(ids.every((id) => typeof id === 'string')).toBe(true)
  })

  it('prefers the touched set when there is one', () => {
    expect(resolveSweepTournamentIds([wc, league], new Set(['t-9']))).toEqual(['t-9'])
  })

  it('returns empty for a league-only run, which the route reports', () => {
    expect(resolveSweepTournamentIds([league], new Set())).toEqual([])
  })
})
