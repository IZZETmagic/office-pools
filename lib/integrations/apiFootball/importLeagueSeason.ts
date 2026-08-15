/**
 * Import a full league season (teams + fixtures) FROM api-football into our
 * schema. This is the mirror image of `seed.ts`: for the World Cup we authored
 * the bracket skeleton by hand and only *mapped* it to api-football ids; a flat
 * round-robin league (e.g. the Premier League — 20 teams, 380 fixtures, no
 * groups, no knockout placeholders) is fully specified by the feed up front, so
 * we pull the whole thing and insert it with `external_team_id`/`external_match_id`
 * already populated. Once inserted, the existing live sync (`fixtureToMatchUpdate`,
 * events→conduct, reconcile) works unchanged — it only ever keys off those ids.
 *
 * Requires migrations 024 (the 'league'/'regular_season' CHECK values and
 * `matches.round_number`) and 045 (`matches.round_label`), plus an existing
 * `tournaments` row to import into.
 *
 * REGULAR SEASON ONLY. The feed's round vocabulary is not uniform: four of the
 * eight top European leagues carry a play-off tail in the same league id
 * (Germany, France and Portugal a relegation "Final"; the Netherlands a
 * European play-off bracket), and Belgium and Scotland reuse round ordinals
 * across phases. Play-off fixtures are reported and skipped rather than
 * imported, because the league path has no bracket to score them with — they
 * would land with no matchweek and sit inert. See `detectRegularSeasonPhase`.
 *
 * Idempotent: teams already present (by external_team_id) and fixtures already
 * present (by external_match_id) are reported and skipped, so re-running only
 * inserts what's new (e.g. next season, or fixtures added late by the feed).
 *
 * Designed for a PRE-SEASON import (every fixture not-yet-started). It writes the
 * schedule only — status defaults to 'scheduled', no scores — and lets the live
 * sync fill results. A mid-season import would additionally need past results
 * backfilled; that's intentionally out of scope here (see the note in the caller).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiFootballClient } from './client'
import type { ApiFootballFixture, ApiFootballTeam } from './types'

const REGULAR_SEASON_STAGE = 'regular_season'

export type LeagueTeamPlan = {
  external_team_id: number
  name: string
  /** Assigned 3-char code -> teams.country_code (unique within the tournament). */
  code: string
  logo: string | null
  status: 'new' | 'existing'
  team_id?: string
}

export type LeagueMatchPlan = {
  external_match_id: string
  /** Assigned sequential number; -1 in the plan for existing/skipped rows. */
  match_number: number
  round_number: number | null
  /** The provider's raw round string, stored so a collision is diagnosable. */
  round_label: string
  match_date: string
  venue: string | null
  home: string
  away: string
  status: 'new' | 'existing' | 'skipped'
  reason?: string
}

export type ImportLeagueResult = {
  tournament_id: string
  league: number
  season: number
  teams: { external_total: number; to_insert: number; existing: number; plan: LeagueTeamPlan[] }
  matches: {
    external_total: number
    to_insert: number
    existing: number
    skipped: number
    round_min: number | null
    round_max: number | null
    date_first: string | null
    date_last: string | null
    plan: LeagueMatchPlan[]
  }
  /** Which phase was imported, and every phase the feed offered. */
  phase: {
    imported: string | null
    all: PhaseSummary[]
    /** Fixtures skipped because they belong to another phase, by phase. */
    skippedByPhase: Record<string, number>
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
 * A 3-char, tournament-unique code for `teams.country_code` (char(3), NOT NULL,
 * unique per tournament). Prefer api-football's `team.code` (e.g. "MUN"); fall
 * back to the first alnum of the name; disambiguate collisions on the last char.
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

function buildVenue(f: ApiFootballFixture): string | null {
  const v = f.fixture.venue
  if (!v) return null
  const name = (v.name ?? '').trim()
  const city = (v.city ?? '').trim()
  if (name && city) return `${name}, ${city}`
  return name || city || null
}

export async function importLeagueSeason(
  supabase: SupabaseClient,
  args: { tournament_id: string; league: number; season: number; commit?: boolean }
): Promise<ImportLeagueResult> {
  const { tournament_id, league, season } = args
  const commit = !!args.commit

  // Guard: the tournament row must exist (FK target for teams/matches).
  const { data: tournamentRow, error: tErr } = await supabase
    .from('tournaments')
    .select('tournament_id')
    .eq('tournament_id', tournament_id)
    .maybeSingle()
  if (tErr) throw tErr
  if (!tournamentRow) {
    throw new Error(`tournament ${tournament_id} does not exist — create the tournaments row first`)
  }

  // ---------------------------------------------------------------- Teams
  const externalTeams = await ApiFootballClient.getTeamsForLeague({ league, season })
  if (externalTeams.length === 0) {
    throw new Error(
      `api-football returned 0 teams for league=${league} season=${season} — check the ids, API_FOOTBALL_KEY, and daily quota`
    )
  }

  const { data: existingTeams, error: teamErr } = await supabase
    .from('teams')
    .select('team_id, external_team_id, country_code')
    .eq('tournament_id', tournament_id)
  if (teamErr) throw teamErr

  const teamIdByExternal = new Map<number, string>()
  const usedCodes = new Set<string>()
  for (const t of existingTeams || []) {
    if (t.external_team_id != null) teamIdByExternal.set(t.external_team_id, t.team_id)
    if (t.country_code) usedCodes.add(t.country_code)
  }

  const teamPlan: LeagueTeamPlan[] = []
  const teamRowsToInsert: Array<Record<string, unknown>> = []
  for (const et of externalTeams) {
    const existingId = teamIdByExternal.get(et.team.id)
    if (existingId) {
      teamPlan.push({
        external_team_id: et.team.id,
        name: et.team.name,
        code: '(existing)',
        logo: et.team.logo,
        status: 'existing',
        team_id: existingId,
      })
      continue
    }
    const code = deriveCode(et.team, usedCodes)
    teamPlan.push({ external_team_id: et.team.id, name: et.team.name, code, logo: et.team.logo, status: 'new' })
    teamRowsToInsert.push({
      tournament_id,
      country_name: truncate(et.team.name, 100),
      country_code: code,
      group_letter: null,
      group_position: null,
      flag_url: et.team.logo,
      external_team_id: et.team.id,
    })
  }

  if (commit && teamRowsToInsert.length > 0) {
    const { data: inserted, error: insErr } = await supabase
      .from('teams')
      .insert(teamRowsToInsert)
      .select('team_id, external_team_id')
    if (insErr) throw insErr
    for (const row of inserted || []) {
      if (row.external_team_id != null) teamIdByExternal.set(row.external_team_id, row.team_id)
    }
    for (const p of teamPlan) {
      if (p.status === 'new') p.team_id = teamIdByExternal.get(p.external_team_id)
    }
  }

  // -------------------------------------------------------------- Fixtures
  // One round-trip: /fixtures?league&season returns the whole season (single
  // page for a league). We sort deterministically and number what's new.
  const fixtures = await ApiFootballClient.getFixtures({ league, season })
  if (fixtures.length === 0) {
    throw new Error(
      `api-football returned 0 fixtures for league=${league} season=${season} — check the ids, API_FOOTBALL_KEY, and daily quota`
    )
  }

  const { data: existingMatches, error: matchErr } = await supabase
    .from('matches')
    .select('external_match_id, match_number')
    .eq('tournament_id', tournament_id)
  if (matchErr) throw matchErr

  const existingExt = new Set<string>()
  let maxMatchNumber = 0
  for (const m of existingMatches || []) {
    if (m.external_match_id) existingExt.add(m.external_match_id)
    if (typeof m.match_number === 'number' && m.match_number > maxMatchNumber) maxMatchNumber = m.match_number
  }

  const sorted = [...fixtures].sort((a, b) => {
    const ta = Date.parse(a.fixture.date)
    const tb = Date.parse(b.fixture.date)
    if (ta !== tb) return ta - tb
    return a.fixture.id - b.fixture.id
  })

  // --------------------------------------------------------------- Phase
  // Import the regular season only. Play-off rounds are a bracket, and the
  // league path deliberately has no bracket — importing them would produce
  // fixtures with no matchweek, which cannot be round-keyed, opened, or given a
  // deadline. They would sit inert. Skipped loudly instead.
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

  // --------------------------------------------- Ordinal collision guard
  // Within the chosen phase an ordinal must identify exactly one round. It does
  // in every league checked, but the guard is the point. Belgium and Scotland
  // split into PARALLEL groups after the regular season, and those groups reuse
  // each other's ordinals — Scotland runs "Championship Group - 34" and
  // "Relegation Group - 34" at the same time, Belgium has three phases all
  // sharing 31..40. Verified against the live feed 2026-08-14. If the phase
  // filter ever failed open, two concurrent groups would merge into one
  // matchweek and members would find fixtures they never predicted inside a
  // matchweek they had already submitted.
  const labelsByOrdinal = new Map<number, Set<string>>()
  for (const f of fixtures) {
    if (phaseOf(f.league.round) !== regularSeasonPhase) continue
    const n = parseRound(f.league.round)
    if (n === null) continue
    const set = labelsByOrdinal.get(n) ?? new Set<string>()
    set.add(f.league.round)
    labelsByOrdinal.set(n, set)
  }
  const collisions = [...labelsByOrdinal.entries()].filter(([, labels]) => labels.size > 1)
  if (collisions.length > 0) {
    throw new Error(
      `league=${league} season=${season}: round ordinal collision inside phase "${regularSeasonPhase}" — ` +
        collisions
          .map(([n, labels]) => `matchweek ${n} claimed by ${[...labels].map((l) => `"${l}"`).join(' and ')}`)
          .join('; ') +
        `. Refusing to import: two rounds sharing a matchweek would merge silently.`
    )
  }

  const matchPlan: LeagueMatchPlan[] = []
  const matchRowsToInsert: Array<Record<string, unknown>> = []
  const skippedByPhase: Record<string, number> = {}
  let nextNumber = maxMatchNumber + 1

  for (const f of sorted) {
    const ext = String(f.fixture.id)
    const home = f.teams.home.name
    const away = f.teams.away.name
    const round_label = f.league.round
    const round_number = parseRound(round_label)
    const match_date = f.fixture.date
    const venue = buildVenue(f)

    if (existingExt.has(ext)) {
      matchPlan.push({ external_match_id: ext, match_number: -1, round_number, round_label, match_date, venue, home, away, status: 'existing' })
      continue
    }

    const fixturePhase = phaseOf(round_label)
    if (fixturePhase !== regularSeasonPhase) {
      skippedByPhase[fixturePhase] = (skippedByPhase[fixturePhase] ?? 0) + 1
      matchPlan.push({
        external_match_id: ext, match_number: -1, round_number, round_label, match_date, venue, home, away,
        status: 'skipped',
        reason: `phase "${fixturePhase}" is not the regular season ("${regularSeasonPhase}") — play-off rounds are out of scope for v1`,
      })
      continue
    }

    if (round_number === null) {
      // Inside the regular-season phase but with no ordinal. Not expected, and
      // not something to guess at: an un-numbered fixture has no matchweek.
      skippedByPhase[fixturePhase] = (skippedByPhase[fixturePhase] ?? 0) + 1
      matchPlan.push({
        external_match_id: ext, match_number: -1, round_number, round_label, match_date, venue, home, away,
        status: 'skipped',
        reason: `round "${round_label}" carries no matchweek ordinal`,
      })
      continue
    }

    const homeId = teamIdByExternal.get(f.teams.home.id)
    const awayId = teamIdByExternal.get(f.teams.away.id)
    // Commit mode requires both sides resolved. In a dry run against a fresh
    // tournament the teams aren't inserted yet, so ids are undefined — expected;
    // we still preview the fixture (by name) and assign a provisional number.
    if (commit && (!homeId || !awayId)) {
      matchPlan.push({
        external_match_id: ext,
        match_number: -1,
        round_number,
        round_label,
        match_date,
        venue,
        home,
        away,
        status: 'skipped',
        reason: 'home/away team has no external mapping (team import incomplete)',
      })
      continue
    }

    const match_number = nextNumber++
    matchPlan.push({ external_match_id: ext, match_number, round_number, round_label, match_date, venue, home, away, status: 'new' })
    matchRowsToInsert.push({
      tournament_id,
      match_number,
      stage: REGULAR_SEASON_STAGE,
      group_letter: null,
      home_team_id: homeId ?? null,
      away_team_id: awayId ?? null,
      match_date,
      venue,
      round_number,
      round_label,
      external_match_id: ext,
      data_source: 'api',
      status: 'scheduled',
      is_completed: false,
    })
  }

  if (commit && matchRowsToInsert.length > 0) {
    const BATCH = 100
    for (let i = 0; i < matchRowsToInsert.length; i += BATCH) {
      const { error } = await supabase.from('matches').insert(matchRowsToInsert.slice(i, i + BATCH))
      if (error) throw error
    }
  }

  const newMatches = matchPlan.filter((m) => m.status === 'new')
  const rounds = newMatches.map((m) => m.round_number).filter((r): r is number => r != null)
  const dates = newMatches.map((m) => m.match_date).sort()

  return {
    tournament_id,
    league,
    season,
    teams: {
      external_total: externalTeams.length,
      to_insert: teamPlan.filter((t) => t.status === 'new').length,
      existing: teamPlan.filter((t) => t.status === 'existing').length,
      plan: teamPlan,
    },
    matches: {
      external_total: fixtures.length,
      to_insert: newMatches.length,
      existing: matchPlan.filter((m) => m.status === 'existing').length,
      skipped: matchPlan.filter((m) => m.status === 'skipped').length,
      round_min: rounds.length ? Math.min(...rounds) : null,
      round_max: rounds.length ? Math.max(...rounds) : null,
      date_first: dates[0] ?? null,
      date_last: dates[dates.length - 1] ?? null,
      plan: matchPlan,
    },
    phase: {
      imported: regularSeasonPhase,
      all: phases,
      skippedByPhase,
    },
    committed: commit,
  }
}
