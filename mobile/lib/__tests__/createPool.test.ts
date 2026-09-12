// =============================================================
// The create-pool wizard's decisions
// =============================================================
// The wizard's own logic, which until 2026-09-05 lived inside a 900-line screen
// and was therefore untestable — `mobile/**` may only be globbed by the root
// vitest config for modules that never reach `react-native`.
//
// The cases that matter are the ones where getting it wrong produces a POOL
// THAT CANNOT BE PLAYED rather than a visual defect: a league offered without a
// season row, a stale bracket mode riding along onto a league pool, a deadline
// already in the past, a depth sent for a mode whose CHECK constraint refuses
// one.
//
// ⚠ No assertion here compares a formatted date STRING. Those go through
// `toLocaleDateString(undefined, …)` and depend on the runner's locale; the
// tests assert the Date the chip carries instead, which is the part the pool is
// actually created with.

import { describe, it, expect } from 'vitest'

import {
  LEAGUE_MODES,
  WC_MODES,
  asksStartMatchweek,
  buildCreatePayload,
  closesInLabel,
  deadlineTitle,
  defaultDeadline,
  defaultStartMatchweek,
  effectiveMode,
  hasCompetitionEnded,
  isLeague,
  modeHasDepth,
  pairSeasons,
  parseLocalDate,
  quickPicks,
  selectableCompetitions,
  startMatchweekOptions,
  validateDeadline,
  withoutSeason,
  type Competition,
  type SeasonRow,
  type TournamentRow,
} from '../createPool'

// ------------------------------------------------------------------ fixtures

const PREMIER_LEAGUE: TournamentRow = {
  tournament_id: 't-pl',
  name: 'Premier League 2026/27',
  short_name: 'Premier League',
  host_countries: 'England',
  start_date: '2026-08-21',
  end_date: '2027-05-23',
  format: 'league',
  logo_url: 'https://media.api-sports.io/football/leagues/39.png',
  external_provider: 'api_football',
  external_league_id: 39,
  external_season: 2026,
}

const WORLD_CUP: TournamentRow = {
  tournament_id: 't-wc',
  name: 'FIFA World Cup 2026',
  short_name: 'WC2026',
  host_countries: 'USA, Canada, Mexico',
  start_date: '2026-06-11',
  end_date: '2026-07-16',
  format: 'groups_knockout',
  logo_url: null,
  external_provider: null,
  external_league_id: null,
  external_season: null,
}

const PL_SEASON: SeasonRow = {
  season_id: 's-pl',
  club_count: 20,
  external_provider: 'api_football',
  external_league_id: 39,
  external_season: 2026,
}

/** The Premier League, paired. The competition every league case below uses. */
const pl = (): Competition => pairSeasons([PREMIER_LEAGUE], [PL_SEASON])[0]
const wc = (): Competition => pairSeasons([WORLD_CUP], [])[0]

// ------------------------------------------------------------------ naming

describe('withoutSeason', () => {
  it('drops a slashed season', () => {
    expect(withoutSeason('Premier League 2026/27')).toBe('Premier League')
    expect(withoutSeason('Premier League 2026/2027')).toBe('Premier League')
  })

  it('drops a plain year', () => {
    expect(withoutSeason('FIFA World Cup 2026')).toBe('FIFA World Cup')
  })

  it('leaves a year that is not the season alone', () => {
    // Anchored to the END, so a year doing real work survives.
    expect(withoutSeason('Copa America 2024 Qualifiers')).toBe('Copa America 2024 Qualifiers')
  })

  it('leaves a name with no season alone', () => {
    expect(withoutSeason('Premier League')).toBe('Premier League')
  })

  it('does not eat a number that is part of the name', () => {
    expect(withoutSeason('Big Bash 20')).toBe('Big Bash 20')
  })
})

// ------------------------------------------------------------------ dates

describe('parseLocalDate', () => {
  it('reads a bare date as LOCAL midnight, not UTC', () => {
    // ⚠ THE REGRESSION THIS MODULE EXISTS FOR. `new Date('2026-08-21')` is UTC
    // midnight by spec — 20:00 on the 20th in Bermuda — so the screen rendered
    // the Premier League as starting a day early for everyone west of
    // Greenwich, and `hasStarted` flipped a day early with it.
    const d = parseLocalDate('2026-08-21')!
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(7) // August
    expect(d.getDate()).toBe(21)
    expect(d.getHours()).toBe(0)
  })

  it('passes a full timestamp through untouched', () => {
    // That one carries its own offset and must not be reinterpreted.
    const iso = '2026-08-21T19:00:00.000Z'
    expect(parseLocalDate(iso)!.toISOString()).toBe(iso)
  })

  it('is null for missing or unparseable input', () => {
    expect(parseLocalDate(null)).toBeNull()
    expect(parseLocalDate('')).toBeNull()
    expect(parseLocalDate('not a date')).toBeNull()
  })
})

describe('hasCompetitionEnded', () => {
  it('is false during the competition', () => {
    expect(hasCompetitionEnded('2027-05-23', new Date('2026-09-05T12:00:00Z'))).toBe(false)
  })

  it('is false on the final day itself', () => {
    // End of the FINAL DAY, not its start — a pool is still live while the
    // final is being played.
    expect(hasCompetitionEnded('2026-07-16', new Date('2026-07-16T20:00:00Z'))).toBe(false)
  })

  it('is true once the final day has passed', () => {
    expect(hasCompetitionEnded('2026-07-16', new Date('2026-09-05T12:00:00Z'))).toBe(true)
  })

  it('treats a null end date as not ended', () => {
    expect(hasCompetitionEnded(null, new Date())).toBe(false)
  })
})

// ------------------------------------------------------------------ pairing

describe('pairSeasons', () => {
  it('resolves a league to its season row and club count', () => {
    const [c] = pairSeasons([PREMIER_LEAGUE], [PL_SEASON])
    expect(c.league_season_id).toBe('s-pl')
    expect(c.league_club_count).toBe(20)
  })

  it('leaves a bracket competition unpaired', () => {
    const [c] = pairSeasons([WORLD_CUP], [PL_SEASON])
    expect(c.league_season_id).toBeNull()
    expect(c.league_club_count).toBeNull()
  })

  it('defaults a null provider to api_football on BOTH sides', () => {
    // The importer writes the provider inconsistently on older rows; the triple
    // has to agree about what a null means or the pairing silently misses.
    const t = { ...PREMIER_LEAGUE, external_provider: null }
    const s = { ...PL_SEASON, external_provider: null }
    expect(pairSeasons([t], [s])[0].league_season_id).toBe('s-pl')
    expect(pairSeasons([t], [PL_SEASON])[0].league_season_id).toBe('s-pl')
  })

  it('leaves a league with no matching season unpaired', () => {
    const otherSeason = { ...PL_SEASON, external_league_id: 61 }
    expect(pairSeasons([PREMIER_LEAGUE], [otherSeason])[0].league_season_id).toBeNull()
  })

  it('does not pair on league id alone', () => {
    // Same league, different SEASON. Pairing these would create a 2026/27 pool
    // against last season's fixtures.
    const lastSeason = { ...PL_SEASON, season_id: 's-old', external_season: 2025 }
    expect(pairSeasons([PREMIER_LEAGUE], [lastSeason])[0].league_season_id).toBeNull()
  })
})

describe('selectableCompetitions', () => {
  const now = new Date('2026-09-05T12:00:00Z')

  it('drops a competition that has finished', () => {
    // The World Cup ended 16 Jul 2026 and would otherwise sit at the top of
    // this list for ever.
    const list = selectableCompetitions([wc(), pl()], now)
    expect(list.map((c) => c.tournament_id)).toEqual(['t-pl'])
  })

  it('drops a league with no season row', () => {
    // An entry that has never been imported is a claim, not a capability — its
    // pool would have no fixtures, clubs or matchweeks, and the create route
    // 409s on it anyway.
    const unimported = pairSeasons([PREMIER_LEAGUE], [])
    expect(selectableCompetitions(unimported, now)).toEqual([])
  })

  it('keeps a bracket competition with no season row', () => {
    // A bracket has no season row BY DESIGN — the league filter must not eat it.
    const upcoming = { ...WORLD_CUP, end_date: '2027-07-16' }
    const list = selectableCompetitions(pairSeasons([upcoming], []), now)
    expect(list).toHaveLength(1)
  })
})

// ------------------------------------------------------------------ mode

describe('effectiveMode', () => {
  it('forces every league pool to league_pickem', () => {
    // ⚠ The defect this exists for: pick Full Tournament for the World Cup,
    // step back, switch to the Premier League, step forward. A mode held in
    // state rides along and creates a league pool that scores ZERO for every
    // fixture, silently.
    expect(effectiveMode('full_tournament', true)).toBe('league_pickem')
    expect(effectiveMode('bracket_picker', true)).toBe('league_pickem')
    expect(effectiveMode('progressive', true)).toBe('league_pickem')
  })

  it('leaves a bracket mode alone on a bracket competition', () => {
    expect(effectiveMode('progressive', false)).toBe('progressive')
    expect(effectiveMode('bracket_picker', false)).toBe('bracket_picker')
  })

  it('falls back to full_tournament if a league mode reaches a bracket', () => {
    expect(effectiveMode('league_pickem', false)).toBe('full_tournament')
  })
})

describe('isLeague', () => {
  it('reads the competition FORMAT, not the presence of a season id', () => {
    expect(isLeague(pl())).toBe(true)
    expect(isLeague(wc())).toBe(false)
    expect(isLeague(null)).toBe(false)
  })
})

describe('modeHasDepth', () => {
  it('is true only for the two modes with weekly picks', () => {
    // There is no "predict the scoreline" version of ordering twenty clubs, and
    // the database CHECK refuses the pairing outright.
    expect(modeHasDepth('pickem')).toBe(true)
    expect(modeHasDepth('showdown')).toBe(true)
    expect(modeHasDepth('table')).toBe(false)
    expect(modeHasDepth('last_man_standing')).toBe(false)
  })
})

describe('mode catalogues', () => {
  it('offers all four league modes', () => {
    expect(LEAGUE_MODES.map((m) => m.value)).toEqual([
      'pickem',
      'showdown',
      'last_man_standing',
      'table',
    ])
  })

  it('names the real club count in the table blurb', () => {
    const table = LEAGUE_MODES.find((m) => m.value === 'table')!
    // "all twenty clubs" is wrong for every league that is not England, Spain
    // or Italy — Bundesliga is 18, the Championship 24.
    expect(table.desc(20)).toContain('all 20 clubs')
    expect(table.desc(18)).toContain('all 18 clubs')
  })

  it('says something honest when the club count is unknown', () => {
    const table = LEAGUE_MODES.find((m) => m.value === 'table')!
    expect(table.desc(null)).toContain('every club')
    expect(table.desc(null)).not.toContain('null')
  })

  it('drops the icons that resolved to the wrong glyph', () => {
    // square.grid.2x2 resolves to Hugeicons' Grid02, which reads as a crop
    // tool; arrow.forward.circle says nothing about rounds.
    const icons = WC_MODES.map((m) => m.icon)
    expect(icons).not.toContain('square.grid.2x2')
    expect(icons).not.toContain('arrow.forward.circle')
  })
})

// ------------------------------------------------------------------ deadline

describe('deadlineTitle', () => {
  it('names what the date actually locks in each mode', () => {
    expect(deadlineTitle('league_pickem', 'table')).toBe('Table deadline')
    expect(deadlineTitle('progressive', null)).toBe('Group stage deadline')
    expect(deadlineTitle('full_tournament', null)).toBe('Prediction deadline')
  })

  /**
   * ⬅ 143. This used to return "First matchweek deadline" for Pick'em and
   * Showdown and "First round deadline" for Last Man Standing. BOTH WERE
   * CLAIMS THE SCREEN COULD NOT KEEP: the create route overwrote that date with
   * the season's last kickoff and started the pool in whichever matchweek
   * happened to be unlocked. Those modes now ask `startMatchweekTitle` instead,
   * and this function must not grow a league title back.
   */
  it('no longer titles itself a matchweek or a round it does not set', () => {
    for (const mode of ['pickem', 'showdown', 'last_man_standing'] as const) {
      const title = deadlineTitle('league_pickem', mode)
      expect(title).not.toMatch(/matchweek|round/i)
      expect(asksStartMatchweek(pl(), mode)).toBe(true)
    }
  })
})

describe('quickPicks', () => {
  it('offers kick-off and the day and week before, while the season is ahead', () => {
    const now = new Date('2026-07-01T12:00:00Z')
    const picks = quickPicks(pl(), [], now)

    expect(picks.map((p) => p.key)).toEqual(['start', 'day', 'week'])
    // Kick-off is 21 Aug; the other two are one day and one week before it, all
    // at 13:00 local.
    expect(picks[0].at.getDate()).toBe(21)
    expect(picks[1].at.getDate()).toBe(20)
    expect(picks[2].at.getDate()).toBe(14)
    for (const p of picks) expect(p.at.getHours()).toBe(13)
  })

  it('every pre-start chip is in the future', () => {
    // The whole point of a shortcut is that the form accepts what it sets.
    const now = new Date('2026-07-01T12:00:00Z')
    for (const p of quickPicks(pl(), [], now)) {
      expect(validateDeadline(p.at, now)).toBeNull()
    }
  })

  it('switches to the matchweek locks once the season is under way', () => {
    // ⚠ "Tournament Start (Aug 21)" in September is not a shortcut, it is a
    // button that sets a date the form immediately rejects.
    const now = new Date('2026-09-05T12:00:00Z')
    const picks = quickPicks(
      pl(),
      [
        { number: 4, label: null, lockAt: '2026-09-12T11:30:00Z' },
        { number: 5, label: 'Matchweek 5', lockAt: '2026-09-19T11:30:00Z' },
      ],
      now,
    )

    expect(picks.map((p) => p.key)).toEqual(['mw4', 'mw5'])
    // The REAL lock time, not a made-up 13:00 — the point is to match the
    // competition.
    expect(picks[0].at.toISOString()).toBe('2026-09-12T11:30:00.000Z')
    // A null label falls back to the matchweek number rather than rendering
    // "null".
    expect(picks[0].label).toContain('Matchweek 4')
  })

  it('offers nothing for a started competition with no matchweeks', () => {
    // Any World Cup, or a league whose fixtures have not been imported. An
    // empty row is honest; a row of dead buttons is not.
    const now = new Date('2026-09-05T12:00:00Z')
    const started = { ...pl(), start_date: '2026-08-21' }
    expect(quickPicks(started, [], now)).toEqual([])
  })

  it('offers nothing with no competition chosen', () => {
    expect(quickPicks(null, [], new Date())).toEqual([])
  })
})

describe('defaultDeadline', () => {
  it('is kick-off at 13:00 while the season is ahead', () => {
    const now = new Date('2026-07-01T12:00:00Z')
    const d = defaultDeadline(pl(), now)
    expect(d.getDate()).toBe(21)
    expect(d.getMonth()).toBe(7)
    expect(d.getHours()).toBe(13)
  })

  it('is a week out for a season already under way', () => {
    // ⚠ Kick-off would be a deadline months in the PAST, and for a table pool
    // that date is the real lock, not decoration — the pool would be created
    // shut.
    const now = new Date('2026-10-01T12:00:00Z')
    const d = defaultDeadline(pl(), now)
    expect(validateDeadline(d, now)).toBeNull()
    expect(d.getTime() - now.getTime()).toBeGreaterThan(6 * 24 * 60 * 60 * 1000)
  })
})

describe('validateDeadline', () => {
  const now = new Date('2026-09-05T12:00:00Z')

  it('accepts a future deadline', () => {
    expect(validateDeadline(new Date('2026-09-06T12:00:00Z'), now)).toBeNull()
  })

  it('rejects a deadline earlier the same day', () => {
    // ⚠ THE CASE A DAY-LEVEL FLOOR CANNOT CATCH. The native picker can be
    // constrained to a minimum DAY; "today at 09:00" chosen at noon is still in
    // the past and used to be submitted.
    expect(validateDeadline(new Date('2026-09-05T09:00:00Z'), now)).toMatch(/future/)
  })

  it('rejects a missing or unparseable deadline', () => {
    expect(validateDeadline(null, now)).toBeTruthy()
    expect(validateDeadline(new Date('nonsense'), now)).toBeTruthy()
  })
})

// ------------------------------------------------------------------ payload

describe('buildCreatePayload', () => {
  const base = {
    poolName: '  Office Pool  ',
    description: '   ',
    leagueMode: 'pickem' as const,
    leagueDepth: 'results' as const,
    predictionMode: 'full_tournament' as const,
    deadline: new Date('2026-10-01T13:00:00Z'),
    isPrivate: true,
    maxEntriesPerUser: 3,
    startMatchweek: null as number | null,
  }

  it('trims the name and nulls an empty description', () => {
    const p = buildCreatePayload({ ...base, competition: wc() })
    expect(p.pool_name).toBe('Office Pool')
    expect(p.description).toBeNull()
  })

  it('sends a bracket pool with no league fields', () => {
    const p = buildCreatePayload({ ...base, competition: wc() })
    expect(p.prediction_mode).toBe('full_tournament')
    expect(p.league_season_id).toBeNull()
    expect(p.league_mode).toBeNull()
    expect(p.league_depth).toBeNull()
    expect(p.max_entries_per_user).toBe(3)
  })

  it('sends a Pick’em league pool with its season, mode and depth', () => {
    const p = buildCreatePayload({
      ...base,
      competition: pl(),
      leagueMode: 'pickem',
      leagueDepth: 'scores',
    })
    expect(p.prediction_mode).toBe('league_pickem')
    expect(p.league_season_id).toBe('s-pl')
    expect(p.league_mode).toBe('pickem')
    expect(p.league_depth).toBe('scores')
  })

  it('sends no depth for Table or Last Man Standing', () => {
    // The database CHECK refuses the pairing outright.
    for (const leagueMode of ['table', 'last_man_standing'] as const) {
      const p = buildCreatePayload({ ...base, competition: pl(), leagueMode })
      expect(p.league_mode).toBe(leagueMode)
      expect(p.league_depth).toBeNull()
    }
  })

  it('forces one entry per member on every league pool', () => {
    // ⚠ A second entry is unreachable by construction — both pickers resolve to
    // the member's FIRST entry, so entry 2 would sit at 0 all season. Showdown
    // is worse: the draw is per entry.
    for (const leagueMode of ['pickem', 'showdown', 'last_man_standing', 'table'] as const) {
      const p = buildCreatePayload({
        ...base,
        competition: pl(),
        leagueMode,
        maxEntriesPerUser: 5,
      })
      expect(p.max_entries_per_user).toBe(1)
    }
  })

  it('cannot carry a stale bracket mode onto a league pool', () => {
    // Chose Bracket Picker for the World Cup, stepped back, switched to the PL.
    const p = buildCreatePayload({
      ...base,
      competition: pl(),
      predictionMode: 'bracket_picker',
    })
    expect(p.prediction_mode).toBe('league_pickem')
  })

  it('always sends max_participants: 0', () => {
    // Migration 075: `pools.max_participants` is stored, displayed and editable
    // but enforced NOWHERE. The route turns 0 into NULL; the real ceiling is the
    // tier one, enforced by a BEFORE INSERT trigger.
    expect(buildCreatePayload({ ...base, competition: wc() }).max_participants).toBe(0)
    expect(buildCreatePayload({ ...base, competition: pl() }).max_participants).toBe(0)
  })

  it('clamps entries per member to 1-10 on a bracket pool', () => {
    const at = (n: number) =>
      buildCreatePayload({ ...base, competition: wc(), maxEntriesPerUser: n })
        .max_entries_per_user
    expect(at(0)).toBe(1)
    expect(at(-4)).toBe(1)
    expect(at(99)).toBe(10)
  })

  it('sends the deadline as an ISO instant', () => {
    const p = buildCreatePayload({ ...base, competition: wc() })
    expect(p.prediction_deadline).toBe('2026-10-01T13:00:00.000Z')
  })
})

// ------------------------------------------------------- ⬅ 143 start matchweek

describe('startMatchweekOptions (mirror of lib/league/startMatchweek.ts)', () => {
  const NOW = new Date('2026-09-12T12:00:00Z').getTime()
  const HOUR = 3_600_000
  const DAY = 24 * HOUR
  const lock = (number: number, atMs: number, label: string | null = null) => ({
    number,
    label,
    lockAt: new Date(atMs).toISOString(),
  })

  it('offers the open matchweek first and marks it', () => {
    const opts = startMatchweekOptions([lock(4, NOW + HOUR), lock(5, NOW + 6 * DAY)], NOW)
    expect(opts.map((o) => o.number)).toEqual([4, 5])
    expect(opts[0].isOpenNow).toBe(true)
  })

  it('drops a matchweek that locked while the wizard was open', () => {
    const opts = startMatchweekOptions([lock(4, NOW - HOUR), lock(5, NOW + 6 * DAY)], NOW)
    expect(opts.map((o) => o.number)).toEqual([5])
  })

  it('orders by lock time, not by matchweek number', () => {
    const opts = startMatchweekOptions([lock(29, NOW + DAY), lock(28, NOW + 20 * DAY)], NOW)
    expect(opts.map((o) => o.number)).toEqual([29, 28])
  })

  it('lands on the open matchweek by default', () => {
    const opts = startMatchweekOptions([lock(4, NOW + HOUR), lock(5, NOW + 6 * DAY)], NOW)
    expect(defaultStartMatchweek(opts)).toBe(4)
    expect(defaultStartMatchweek([])).toBeNull()
  })

  it('floors the day count and speaks 0 and 1', () => {
    expect(closesInLabel(new Date(NOW + 2 * HOUR).toISOString(), NOW)).toBe('today')
    expect(closesInLabel(new Date(NOW + 44 * HOUR).toISOString(), NOW)).toBe('tomorrow')
    expect(closesInLabel(new Date(NOW + 95 * HOUR).toISOString(), NOW)).toBe('in 3 days')
    expect(closesInLabel(new Date(NOW - HOUR).toISOString(), NOW)).toBe('closed')
  })
})

describe('asksStartMatchweek', () => {
  it('asks every league mode except table', () => {
    expect(asksStartMatchweek(pl(), 'last_man_standing')).toBe(true)
    expect(asksStartMatchweek(pl(), 'pickem')).toBe(true)
    expect(asksStartMatchweek(pl(), 'showdown')).toBe(true)
  })

  /**
   * ⚠ Decision 11: a league table is a FULL-TIME table — one prediction about
   * the final standings, with no matchweek it begins in. Its date IS the
   * question and reaches the route intact as `league_table_lock_at`. A CHECK
   * constraint (143) refuses the pair, so sending one would 23514 on create.
   */
  it('never asks a table pool', () => {
    expect(asksStartMatchweek(pl(), 'table')).toBe(false)
  })

  it('never asks a bracket pool', () => {
    expect(asksStartMatchweek(wc(), 'pickem')).toBe(false)
    expect(asksStartMatchweek(null, 'pickem')).toBe(false)
  })
})

describe('buildCreatePayload — the start matchweek', () => {
  const base = {
    poolName: 'Football Daddies Standing',
    description: '',
    leagueDepth: 'results' as const,
    predictionMode: 'full_tournament' as const,
    deadline: new Date('2026-10-01T13:00:00Z'),
    isPrivate: true,
    maxEntriesPerUser: 1,
  }

  it('sends the chosen matchweek for a Last Man Standing pool', () => {
    const p = buildCreatePayload({
      ...base,
      competition: pl(),
      leagueMode: 'last_man_standing',
      startMatchweek: 5,
    })
    expect(p.league_start_matchweek).toBe(5)
  })

  it('sends null for a table pool even when one is selected', () => {
    // The state can legitimately hold a stale number: pick Last Man Standing,
    // choose matchweek 5, step back and switch to Table. The payload is what
    // the database sees, so the rule has to be applied here and not only in the
    // screen that hides the control.
    const p = buildCreatePayload({
      ...base,
      competition: pl(),
      leagueMode: 'table',
      startMatchweek: 5,
    })
    expect(p.league_start_matchweek).toBeNull()
  })

  it('sends null for a World Cup pool', () => {
    const p = buildCreatePayload({
      ...base,
      competition: wc(),
      leagueMode: 'pickem',
      startMatchweek: 5,
    })
    expect(p.league_start_matchweek).toBeNull()
  })
})
