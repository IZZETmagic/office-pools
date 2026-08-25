// =============================================================
// LEAGUE STANDINGS SYNC — the real table, from the feed
// =============================================================
// Plan §0.3, which overturns §3.5. The table is INGESTED, not derived, because
// a table computed from our own fixtures cannot see points deductions — Everton
// −10 then −8, Forest −4, all in 2023/24 — and Table mode scores against it.
//
// ## When this runs
//
// Only when a fixture actually COMPLETED on that tick. The table cannot move
// for any other reason, so polling it on a timer would spend the api-football
// allowance to re-read a number that had not changed. That mirrors how the rest
// of the league engine schedules itself: the event that changes the data is the
// thing that triggers the work.
//
// ## What it deliberately does not do
//
// It never recomputes `rank` from `points`. The feed's rank has already applied
// the competition's real tiebreakers, which for the Premier League ends at
// head-to-head — and reimplementing that is precisely the work §0.3 decided not
// to do.
// =============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { getStandings } from './client'
import type { ApiFootballStandingRow } from './types'

export type StandingsSyncResult = {
  /** Rows the feed returned. */
  seen: number
  /** Rows written. */
  written: number
  /**
   * Clubs the feed named that we have no `league_clubs` row for. Never silently
   * dropped: a mismatch here means the season was imported against a different
   * club set, and the table would render with holes.
   */
  unmapped: Array<{ externalId: number; name: string }>
  error: string | null
}

export async function syncLeagueStandings(
  admin: SupabaseClient,
  season: { seasonId: string; externalLeagueId: number; externalSeason: number },
): Promise<StandingsSyncResult> {
  const empty: StandingsSyncResult = { seen: 0, written: 0, unmapped: [], error: null }

  let rows: ApiFootballStandingRow[]
  try {
    // Throws on a populated `errors` object — api-football answers a refusal
    // with HTTP 200, so a caught throw here is the ONLY way a refusal is
    // distinguishable from "this league has no table".
    rows = await getStandings({
      league: season.externalLeagueId,
      season: season.externalSeason,
    })
  } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : String(err) }
  }

  if (rows.length === 0) {
    // Not an error and not silence: a season genuinely has no table before its
    // first match is played, and saying so beats writing zero rows and leaving
    // the caller to guess which of the two happened.
    return { ...empty, error: null }
  }

  const { data: clubs, error: clubErr } = await admin
    .from('league_clubs')
    .select('club_id, external_club_id')
    .eq('season_id', season.seasonId)
  if (clubErr) return { ...empty, seen: rows.length, error: `league_clubs: ${clubErr.message}` }

  const byExternal = new Map(
    ((clubs ?? []) as Array<{ club_id: string; external_club_id: number }>)
      .map((c) => [c.external_club_id, c.club_id]),
  )

  const unmapped: StandingsSyncResult['unmapped'] = []
  const payload = rows.flatMap((r) => {
    const clubId = byExternal.get(r.team.id)
    if (!clubId) {
      unmapped.push({ externalId: r.team.id, name: r.team.name })
      return []
    }
    return [{
      season_id: season.seasonId,
      club_id: clubId,
      // Straight from the feed. See the header: not recomputed.
      rank: r.rank,
      points: r.points,
      goals_diff: r.goalsDiff,
      played: r.all.played,
      won: r.all.win,
      drawn: r.all.draw,
      lost: r.all.lose,
      goals_for: r.all.goals.for,
      goals_against: r.all.goals.against,
      form: r.form ?? null,
      description: r.description ?? null,
      movement: r.status === 'up' || r.status === 'down' || r.status === 'same' ? r.status : null,
      group_label: r.group ?? null,
      fetched_at: new Date().toISOString(),
    }]
  })

  if (payload.length === 0) {
    return { seen: rows.length, written: 0, unmapped, error: 'no feed club matched a league_clubs row' }
  }

  const { error: upErr } = await admin
    .from('league_standings')
    .upsert(payload, { onConflict: 'season_id,club_id' })
  if (upErr) return { seen: rows.length, written: 0, unmapped, error: upErr.message }

  return { seen: rows.length, written: payload.length, unmapped, error: null }
}
