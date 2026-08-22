/**
 * Import a league season from api-football into the league's OWN tables.
 *
 * Retargeted 2026-08-22 (L2). This previously wrote a league into the World
 * Cup's `teams` and `matches` — clubs in `country_name`, a matchweek bolted on
 * as `round_number`, a `regular_season` value forced into a bracket's stage
 * CHECK. That whole arrangement was reverted in L1. A league now has its own
 * structure and this writes to it:
 *
 *   league_seasons     one competition instance
 *   league_clubs       name / short_name / abbreviation / crest_url
 *   league_matchweeks  one row per matchweek, carrying the frozen `lock_at`
 *   league_fixtures    matchweek_id as a hard FK, not a loose ordinal
 *
 * REGULAR SEASON ONLY, and that is not a simplification — it is what the feed
 * forces. Verified across ten European leagues on 2026-08-14: four of the eight
 * top divisions carry a play-off tail inside the same league id, Scotland calls
 * its league phase "1st Phase", and split leagues run parallel groups that
 * reuse each other's round ordinals. Play-off rounds are reported and skipped,
 * because the league path has no bracket to score them with.
 *
 * Three refusals, all of them loud:
 *   - no phase with numbered rounds        -> throw (not a league season)
 *   - two rounds sharing an ordinal        -> throw (two matchweeks would merge)
 *   - a fixture in the phase with no ordinal -> skipped, with a reason
 *
 * Idempotent by the natural keys the schema already enforces:
 * `(season_id, external_club_id)`, `(season_id, matchweek_number)` and
 * `(season_id, external_fixture_id)`. Re-running inserts only what is new.
 *
 * Designed for a PRE-SEASON import: it writes the schedule only and lets the
 * sync arm fill results. A mid-season import additionally needs past results
 * backfilled, which is deliberately out of scope.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiFootballClient } from './client'
import type { ApiFootballFixture, ApiFootballTeam } from './types'

export type LeagueClubPlan = {
  external_club_id: number
  name: string
  abbreviation: string
  crest_url: string | null
  status: 'new' | 'existing'
  club_id?: string
}

export type LeagueMatchweekPlan = {
  matchweek_number: number
  provider_round: string
  label: string
  fixture_count: number
  status: 'new' | 'existing'
  matchweek_id?: string
}

export type LeagueFixturePlan = {
  external_fixture_id: string
  fixture_number: number
  matchweek_number: number | null
  provider_round: string
  kickoff_at: string
  venue: string | null
  home: string
  away: string
  status: 'new' | 'existing' | 'skipped'
  reason?: string
}

export type ImportLeagueResult = {
  season_id: string | null
  competition: string
  league: number
  season: number
  phase: {
    imported: string | null
    all: PhaseSummary[]
    skippedByPhase: Record<string, number>
  }
  clubs:      { external_total: number; to_insert: number; existing: number; plan: LeagueClubPlan[] }
  matchweeks: { to_insert: number; existing: number; plan: LeagueMatchweekPlan[] }
  fixtures: {
    external_total: number
    to_insert: number
    existing: number
    skipped: number
    date_first: string | null
    date_last: string | null
    plan: LeagueFixturePlan[]
  }
  committed: boolean
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n)
}

function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3)
}

/**
 * A 3-char abbreviation for `league_clubs.abbreviation` (char(3), NOT NULL,
 * UNIQUE per season). Prefer api-football's `team.code` (e.g. "MUN"); fall back
 * to the first alnum of the name; disambiguate collisions on the last char.
 */
function deriveCode(team: ApiFootballTeam['team'], used: Set<string>): string {
  const fromCode = team.code ? normalizeCode(team.code) : ''
  const fromName = normalizeCode(team.name)
  const base = (fromCode.length === 3 ? fromCode : fromName || fromCode || 'TBD').padEnd(3, 'X').slice(0, 3)
  if (!used.has(base)) {
    used.add(base)
    return base
  }
  const prefix = base.slice(0, 2)
  for (const ch of '23456789ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const candidate = (prefix + ch).slice(0, 3)
    if (!used.has(candidate)) {
      used.add(candidate)
      return candidate
    }
  }
  used.add(base)
  return base // exhausted — will surface as a unique-violation on insert
}

/** api-football `league.round` is e.g. "Regular Season - 12" → 12. */
function parseRound(round: string): number | null {
  const m = round.match(/(\d+)\s*$/)
  return m ? parseInt(m[1], 10) : null
}

/**
 * The phase part of a round label: `"Regular Season - 12"` → `"Regular Season"`.
 *
 * A round's identity is `(phase, ordinal)`, not the ordinal alone. Checking the
 * feed's real vocabulary across ten European leagues on 2026-08-14:
 *
 *   ENG / ESP / ITA   "Regular Season - 1..38"                    one phase
 *   GER / FRA / POR   "Regular Season - 1..34" + "Final"          + relegation play-off
 *   NED               + "Semi-finals", "Final"                    + European play-off
 *   ENG Championship  "Regular Season - 1..46" + "Semi-finals", "Final"
 *   BEL               "Regular Season - 1..30", then THREE parallel groups
 *                     ("Championship" / "Relegation" / "Conference League")
 *                     that all reuse 31..40 as each other's ordinals
 *   SCO               phase is "1st Phase" (1..33), not "Regular Season";
 *                     then two parallel groups both numbered 34..38
 *
 * So the ordinal is NOT unique across phases, and the phase name is not a
 * constant either.
 */
function phaseOf(round: string): string {
  return round.replace(/\s*-?\s*\d+\s*$/, '').trim()
}

function buildVenue(f: ApiFootballFixture): string | null {
  const v = f.fixture.venue
  if (!v) return null
  const name = (v.name ?? '').trim()
  const city = (v.city ?? '').trim()
  if (name && city) return `${name}, ${city}`
  return name || city || null
}

export type PhaseSummary = {
  phase: string
  /** Distinct ordinals seen in this phase. */
  rounds: number
  /** Rounds in this phase with no trailing ordinal (e.g. "Final"). */
  unnumbered: number
  earliestFixture: string | null
}

/**
 * Which phase is the regular season?
 *
 * Chosen by size rather than by matching a known name, because the name is not
 * stable — Scotland calls it `"1st Phase"` — and an allowlist would silently
 * import nothing the first time a league used a word we had not seen. The
 * league phase is always the long one: 30–46 rounds against a handful for any
 * play-off group. Ties break on the earliest fixture, so the phase a season
 * *starts* with wins.
 *
 * Returning the full summary rather than just the winner matters: the caller
 * reports what was skipped, so a season that imports 34 of 60 rounds says which
 * 26 and why, instead of looking like a clean import of a short league.
 */
export function detectRegularSeasonPhase(
  fixtures: Array<{ round: string; date: string }>
): { phase: string | null; phases: PhaseSummary[] } {
  const byPhase = new Map<string, { ordinals: Set<number>; unnumbered: number; earliest: string | null }>()

  for (const f of fixtures) {
    const phase = phaseOf(f.round)
    let entry = byPhase.get(phase)
    if (!entry) {
      entry = { ordinals: new Set(), unnumbered: 0, earliest: null }
      byPhase.set(phase, entry)
    }
    const n = parseRound(f.round)
    if (n === null) entry.unnumbered++
    else entry.ordinals.add(n)
    if (!entry.earliest || f.date < entry.earliest) entry.earliest = f.date
  }

  const phases: PhaseSummary[] = [...byPhase.entries()]
    .map(([phase, v]) => ({
      phase,
      rounds: v.ordinals.size,
      unnumbered: v.unnumbered,
      earliestFixture: v.earliest,
    }))
    .sort((a, b) => {
      if (b.rounds !== a.rounds) return b.rounds - a.rounds
      return (a.earliestFixture ?? '').localeCompare(b.earliestFixture ?? '')
    })

  const winner = phases[0]
  // A phase with no numbered rounds at all is a play-off bracket, not a season.
  if (!winner || winner.rounds === 0) return { phase: null, phases }
  return { phase: winner.phase, phases }
}

export async function importLeagueSeason(
  supabase: SupabaseClient,
  args: {
    competition_slug: string      // 'premier-league'
    competition_name: string      // 'Premier League'
    season_label: string          // '2026/27'
    season_start_year: number     // 2026
    country_code: string          // 'ENG'
    league: number                // api-football league id
    season: number                // api-football season
    logo_url?: string | null
    commit?: boolean
  }
): Promise<ImportLeagueResult> {
  const { competition_slug, competition_name, season_label, season_start_year, country_code, league, season } = args
  const commit = !!args.commit

  // ------------------------------------------------------------------ Feed
  const externalTeams = await ApiFootballClient.getTeamsForLeague({ league, season })
  if (externalTeams.length === 0) {
    throw new Error(
      `api-football returned 0 teams for league=${league} season=${season} — check the ids, API_FOOTBALL_KEY, and daily quota`
    )
  }
  const fixtures = await ApiFootballClient.getFixtures({ league, season })
  if (fixtures.length === 0) {
    throw new Error(
      `api-football returned 0 fixtures for league=${league} season=${season} — check the ids, API_FOOTBALL_KEY, and daily quota`
    )
  }

  // ----------------------------------------------------------------- Phase
  const { phase: regularSeasonPhase, phases } = detectRegularSeasonPhase(
    fixtures.map((f) => ({ round: f.league.round, date: f.fixture.date }))
  )
  if (!regularSeasonPhase) {
    throw new Error(
      `league=${league} season=${season}: no numbered round phase found — the feed offered ` +
        `${phases.map((p) => `"${p.phase}" (${p.rounds} rounds)`).join(', ') || 'nothing'}. ` +
        `Cannot identify a regular season.`
    )
  }

  // Ordinal collision guard. `league_matchweeks` now enforces this declaratively
  // via UNIQUE (season_id, provider_round) + UNIQUE (season_id, matchweek_number),
  // but failing here names both labels instead of surfacing a 23505 at insert.
  const labelsByOrdinal = new Map<number, Set<string>>()
  for (const f of fixtures) {
    if (phaseOf(f.league.round) !== regularSeasonPhase) continue
    const n = parseRound(f.league.round)
    if (n === null) continue
    const set = labelsByOrdinal.get(n) ?? new Set<string>()
    set.add(f.league.round)
    labelsByOrdinal.set(n, set)
  }
  const collisions = [...labelsByOrdinal.entries()].filter(([, l]) => l.size > 1)
  if (collisions.length > 0) {
    throw new Error(
      `league=${league} season=${season}: round ordinal collision inside phase "${regularSeasonPhase}" — ` +
        collisions.map(([n, l]) => `matchweek ${n} claimed by ${[...l].map((x) => `"${x}"`).join(' and ')}`).join('; ') +
        `. Refusing to import: two rounds sharing a matchweek would merge silently.`
    )
  }

  // ---------------------------------------------------------------- Season
  const { data: existingSeason, error: seasonErr } = await supabase
    .from('league_seasons')
    .select('season_id')
    .eq('external_provider', 'api_football')
    .eq('external_league_id', league)
    .eq('external_season', season)
    .maybeSingle()
  if (seasonErr) throw seasonErr

  const matchweekNumbers = [...labelsByOrdinal.keys()].sort((a, b) => a - b)
  let seasonId: string | null = existingSeason?.season_id ?? null

  if (commit && !seasonId) {
    const { data: inserted, error } = await supabase
      .from('league_seasons')
      .insert({
        competition_slug,
        competition_name,
        season_label,
        season_start_year,
        country_code,
        club_count: externalTeams.length,
        matchweek_count: matchweekNumbers.length,
        external_provider: 'api_football',
        external_league_id: league,
        external_season: season,
        regular_season_phase: regularSeasonPhase,
        logo_url: args.logo_url ?? null,
        imported_at: new Date().toISOString(),
      })
      .select('season_id')
      .single()
    if (error) throw error
    seasonId = inserted.season_id
  }

  // ----------------------------------------------------------------- Clubs
  const { data: existingClubs, error: clubErr } = seasonId
    ? await supabase.from('league_clubs').select('club_id, external_club_id, abbreviation').eq('season_id', seasonId)
    : { data: [], error: null }
  if (clubErr) throw clubErr

  const clubIdByExternal = new Map<number, string>()
  const usedAbbr = new Set<string>()
  for (const c of existingClubs ?? []) {
    const row = c as { club_id: string; external_club_id: number; abbreviation: string }
    clubIdByExternal.set(row.external_club_id, row.club_id)
    if (row.abbreviation) usedAbbr.add(row.abbreviation)
  }

  const clubPlan: LeagueClubPlan[] = []
  const clubRows: Array<Record<string, unknown>> = []
  for (const et of externalTeams) {
    const existing = clubIdByExternal.get(et.team.id)
    if (existing) {
      clubPlan.push({ external_club_id: et.team.id, name: et.team.name, abbreviation: '(existing)', crest_url: et.team.logo, status: 'existing', club_id: existing })
      continue
    }
    const abbreviation = deriveCode(et.team, usedAbbr)
    clubPlan.push({ external_club_id: et.team.id, name: et.team.name, abbreviation, crest_url: et.team.logo, status: 'new' })
    clubRows.push({
      season_id: seasonId,
      name: truncate(et.team.name, 100),
      // api-football carries no short name. Using the full name is honest;
      // inventing an abbreviation for display would be fabricating data.
      short_name: truncate(et.team.name, 100),
      abbreviation,
      crest_url: et.team.logo,
      external_club_id: et.team.id,
    })
  }

  if (commit && clubRows.length > 0) {
    const { data: inserted, error } = await supabase.from('league_clubs').insert(clubRows).select('club_id, external_club_id')
    if (error) throw error
    for (const row of inserted ?? []) {
      const r = row as { club_id: string; external_club_id: number }
      clubIdByExternal.set(r.external_club_id, r.club_id)
    }
    for (const p of clubPlan) if (p.status === 'new') p.club_id = clubIdByExternal.get(p.external_club_id)
  }

  // ------------------------------------------------------------ Matchweeks
  const { data: existingMws, error: mwErr } = seasonId
    ? await supabase.from('league_matchweeks').select('matchweek_id, matchweek_number').eq('season_id', seasonId)
    : { data: [], error: null }
  if (mwErr) throw mwErr

  const mwIdByNumber = new Map<number, string>()
  for (const m of existingMws ?? []) {
    const row = m as { matchweek_id: string; matchweek_number: number }
    mwIdByNumber.set(row.matchweek_number, row.matchweek_id)
  }

  const fixturesPerMw = new Map<number, number>()
  for (const f of fixtures) {
    if (phaseOf(f.league.round) !== regularSeasonPhase) continue
    const n = parseRound(f.league.round)
    if (n === null) continue
    fixturesPerMw.set(n, (fixturesPerMw.get(n) ?? 0) + 1)
  }

  const mwPlan: LeagueMatchweekPlan[] = []
  const mwRows: Array<Record<string, unknown>> = []
  for (const n of matchweekNumbers) {
    const providerRound = [...(labelsByOrdinal.get(n) ?? [])][0]
    const existing = mwIdByNumber.get(n)
    if (existing) {
      mwPlan.push({ matchweek_number: n, provider_round: providerRound, label: `Matchweek ${n}`, fixture_count: fixturesPerMw.get(n) ?? 0, status: 'existing', matchweek_id: existing })
      continue
    }
    mwPlan.push({ matchweek_number: n, provider_round: providerRound, label: `Matchweek ${n}`, fixture_count: fixturesPerMw.get(n) ?? 0, status: 'new' })
    // fixture_count and lock_at are left at their defaults (0 / NULL) so the
    // empty-has-no-lock CHECK holds on insert. refresh_league_matchweek_window
    // fills both the moment fixtures land.
    mwRows.push({ season_id: seasonId, matchweek_number: n, label: `Matchweek ${n}`, provider_round: providerRound })
  }

  if (commit && mwRows.length > 0) {
    const { data: inserted, error } = await supabase.from('league_matchweeks').insert(mwRows).select('matchweek_id, matchweek_number')
    if (error) throw error
    for (const row of inserted ?? []) {
      const r = row as { matchweek_id: string; matchweek_number: number }
      mwIdByNumber.set(r.matchweek_number, r.matchweek_id)
    }
    for (const p of mwPlan) if (p.status === 'new') p.matchweek_id = mwIdByNumber.get(p.matchweek_number)
  }

  // -------------------------------------------------------------- Fixtures
  const { data: existingFixtures, error: fxErr } = seasonId
    ? await supabase.from('league_fixtures').select('external_fixture_id, fixture_number').eq('season_id', seasonId)
    : { data: [], error: null }
  if (fxErr) throw fxErr

  const existingExt = new Set<string>()
  let maxFixtureNumber = 0
  for (const f of existingFixtures ?? []) {
    const row = f as { external_fixture_id: string; fixture_number: number }
    existingExt.add(row.external_fixture_id)
    if (row.fixture_number > maxFixtureNumber) maxFixtureNumber = row.fixture_number
  }

  const sorted = [...fixtures].sort((a, b) => {
    const ta = Date.parse(a.fixture.date), tb = Date.parse(b.fixture.date)
    return ta !== tb ? ta - tb : a.fixture.id - b.fixture.id
  })

  const fixturePlan: LeagueFixturePlan[] = []
  const fixtureRows: Array<Record<string, unknown>> = []
  const skippedByPhase: Record<string, number> = {}
  let nextNumber = maxFixtureNumber + 1

  for (const f of sorted) {
    const ext = String(f.fixture.id)
    const providerRound = f.league.round
    const mwNumber = parseRound(providerRound)
    const home = f.teams.home.name
    const away = f.teams.away.name
    const kickoff = f.fixture.date
    const venue = buildVenue(f)
    const base = { external_fixture_id: ext, provider_round: providerRound, matchweek_number: mwNumber, kickoff_at: kickoff, venue, home, away }

    if (existingExt.has(ext)) {
      fixturePlan.push({ ...base, fixture_number: -1, status: 'existing' })
      continue
    }

    const fixturePhase = phaseOf(providerRound)
    if (fixturePhase !== regularSeasonPhase) {
      skippedByPhase[fixturePhase] = (skippedByPhase[fixturePhase] ?? 0) + 1
      fixturePlan.push({ ...base, fixture_number: -1, status: 'skipped',
        reason: `phase "${fixturePhase}" is not the regular season ("${regularSeasonPhase}") — play-off rounds are out of scope` })
      continue
    }
    if (mwNumber === null) {
      skippedByPhase[fixturePhase] = (skippedByPhase[fixturePhase] ?? 0) + 1
      fixturePlan.push({ ...base, fixture_number: -1, status: 'skipped',
        reason: `round "${providerRound}" carries no matchweek ordinal` })
      continue
    }

    const homeId = clubIdByExternal.get(f.teams.home.id)
    const awayId = clubIdByExternal.get(f.teams.away.id)
    const mwId = mwIdByNumber.get(mwNumber)
    if (commit && (!homeId || !awayId || !mwId)) {
      fixturePlan.push({ ...base, fixture_number: -1, status: 'skipped',
        reason: 'club or matchweek not resolved — an earlier insert in this run was incomplete' })
      continue
    }

    const fixtureNumber = nextNumber++
    fixturePlan.push({ ...base, fixture_number: fixtureNumber, status: 'new' })
    fixtureRows.push({
      season_id: seasonId,
      matchweek_id: mwId ?? null,
      fixture_number: fixtureNumber,
      home_club_id: homeId ?? null,
      away_club_id: awayId ?? null,
      kickoff_at: kickoff,
      original_kickoff_at: kickoff,
      venue,
      external_fixture_id: ext,
      status: 'scheduled',
      is_completed: false,
    })
  }

  if (commit && fixtureRows.length > 0) {
    const BATCH = 100
    for (let i = 0; i < fixtureRows.length; i += BATCH) {
      const { error } = await supabase.from('league_fixtures').insert(fixtureRows.slice(i, i + BATCH))
      if (error) throw error
    }
  }

  const newFixtures = fixturePlan.filter((f) => f.status === 'new')
  const dates = newFixtures.map((f) => f.kickoff_at).sort()

  return {
    season_id: seasonId,
    competition: `${competition_name} ${season_label}`,
    league,
    season,
    phase: { imported: regularSeasonPhase, all: phases, skippedByPhase },
    clubs: {
      external_total: externalTeams.length,
      to_insert: clubPlan.filter((c) => c.status === 'new').length,
      existing: clubPlan.filter((c) => c.status === 'existing').length,
      plan: clubPlan,
    },
    matchweeks: {
      to_insert: mwPlan.filter((m) => m.status === 'new').length,
      existing: mwPlan.filter((m) => m.status === 'existing').length,
      plan: mwPlan,
    },
    fixtures: {
      external_total: fixtures.length,
      to_insert: newFixtures.length,
      existing: fixturePlan.filter((f) => f.status === 'existing').length,
      skipped: fixturePlan.filter((f) => f.status === 'skipped').length,
      date_first: dates[0] ?? null,
      date_last: dates[dates.length - 1] ?? null,
      plan: fixturePlan,
    },
    committed: commit,
  }
}
