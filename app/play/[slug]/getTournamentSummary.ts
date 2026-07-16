import { createAdminClient } from '@/lib/supabase/server'
import { ROUND_LABELS, type RoundKey } from '@/lib/tournament'

/**
 * Tournament-phase summary for the branded landing page. Lets the page swap
 * between a pre-tournament acquisition layout and an in-progress ("live")
 * layout that leads with standings + the next match — the same phase concept
 * the roadmap's "In-progress pool landing page" calls for.
 *
 * Phase is derived purely from the tournament's matches (no separate status
 * column): nothing completed and nothing live → `pre`; every match completed →
 * `complete`; anything in between → `live`.
 */

export type NextMatch = {
  stageLabel: string
  homeTeam: string | null
  awayTeam: string | null
  homeFlag: string | null
  awayFlag: string | null
  kickoff: string // ISO timestamptz
  isLiveNow: boolean
}

export type TournamentSummary = {
  phase: 'pre' | 'live' | 'complete'
  total: number
  completed: number
  nextMatch: NextMatch | null
  champion: { name: string; flag: string | null } | null
}

type TeamEmbed = { country_name: string | null; flag_url: string | null }

type MatchRow = {
  stage: string
  status: string | null
  is_completed: boolean | null
  match_date: string
  winner_team_id: string | null
  home_team_id: string | null
  away_team_id: string | null
  // Supabase returns a to-one embed as an object, but the generated types widen
  // it to an array in places — accept either shape.
  home_team: TeamEmbed | TeamEmbed[] | null
  away_team: TeamEmbed | TeamEmbed[] | null
}

function one(v: TeamEmbed | TeamEmbed[] | null | undefined): TeamEmbed | null {
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
}

function stageLabel(stage: string): string {
  return ROUND_LABELS[stage as RoundKey] ?? 'Match'
}

export async function getTournamentSummary(tournamentId: string): Promise<TournamentSummary> {
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('matches')
    .select(`
      stage, status, is_completed, match_date, winner_team_id, home_team_id, away_team_id,
      home_team:teams!matches_home_team_id_fkey(country_name, flag_url),
      away_team:teams!matches_away_team_id_fkey(country_name, flag_url)
    `)
    .eq('tournament_id', tournamentId)
    .order('match_date', { ascending: true })

  const rows = (data ?? []) as unknown as MatchRow[]
  const total = rows.length
  const completed = rows.filter((m) => m.is_completed).length
  const liveRow = rows.find((m) => m.status === 'live') ?? null

  let phase: TournamentSummary['phase']
  if (total > 0 && completed === total) phase = 'complete'
  else if (completed === 0 && !liveRow) phase = 'pre'
  else phase = 'live'

  // A match in play takes precedence; otherwise the earliest unfinished match.
  const upcoming = liveRow ?? rows.find((m) => !m.is_completed) ?? null
  const nextMatch: NextMatch | null = upcoming
    ? {
        stageLabel: stageLabel(upcoming.stage),
        homeTeam: one(upcoming.home_team)?.country_name ?? null,
        awayTeam: one(upcoming.away_team)?.country_name ?? null,
        homeFlag: one(upcoming.home_team)?.flag_url ?? null,
        awayFlag: one(upcoming.away_team)?.flag_url ?? null,
        kickoff: upcoming.match_date,
        isLiveNow: upcoming.status === 'live',
      }
    : null

  let champion: TournamentSummary['champion'] = null
  if (phase === 'complete') {
    const finalMatch = rows.find((m) => m.stage === 'final' && m.is_completed)
    if (finalMatch?.winner_team_id) {
      const winner =
        finalMatch.winner_team_id === finalMatch.home_team_id
          ? one(finalMatch.home_team)
          : one(finalMatch.away_team)
      champion = { name: winner?.country_name ?? 'Champion', flag: winner?.flag_url ?? null }
    }
  }

  return { phase, total, completed, nextMatch, champion }
}
