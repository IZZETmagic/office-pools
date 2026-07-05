import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiFootballClient } from './client'
import type { ApiFootballFixture } from './types'

// Team-pair fixtures must fall within this window of our scheduled kickoff.
const MATCH_DATE_WINDOW_MS = 6 * 60 * 60 * 1000 // ±6h

export type KnockoutLinkResult = {
  linked: Array<{ match_id: string; match_number: number; external_match_id: string; label: string }>
  ambiguous: Array<{ match_number: number; stage: string; candidates: number; label: string }>
  unresolved: Array<{ match_number: number; stage: string; reason: string }>
  fetchedFixtures: boolean
}

/**
 * Auto-link knockout matches to their api-football fixture id once the bracket
 * has paired their teams — the automated form of scripts/map-knockout-fixtures.ts.
 *
 * Matches by resolved team pair (external_team_id, either orientation) + a ±6h
 * kickoff window, and never reuses a fixture id already mapped to another row.
 *
 * SAFE FOR UNATTENDED USE:
 *  - only touches knockout rows with BOTH teams resolved and external_match_id NULL;
 *  - only auto-commits when EXACTLY ONE candidate fixture matches — anything
 *    ambiguous is returned for manual review, never guessed;
 *  - makes ZERO api-football calls when there is nothing to link;
 *  - `leadDays` bounds how far ahead we bother looking, so a not-yet-published
 *    fixture can't make us re-fetch the season feed every minute for days.
 *  - the write is guarded with `.is('external_match_id', null)` against races.
 */
export async function linkKnockoutFixtures(
  admin: SupabaseClient,
  opts: { tournamentId: string; league: number; season: number; commit: boolean; leadDays?: number }
): Promise<KnockoutLinkResult> {
  const { tournamentId, league, season, commit } = opts
  const leadDays = opts.leadDays ?? 7
  const result: KnockoutLinkResult = { linked: [], ambiguous: [], unresolved: [], fetchedFixtures: false }

  // Unlinked knockout matches with both teams resolved, kicking off within lead window (or already past).
  const cutoffIso = new Date(Date.now() + leadDays * 24 * 60 * 60 * 1000).toISOString()
  const { data: ourMatches, error: matchErr } = await admin
    .from('matches')
    .select('match_id, match_number, stage, match_date, home_team_id, away_team_id')
    .eq('tournament_id', tournamentId)
    .neq('stage', 'group')
    .is('external_match_id', null)
    .not('home_team_id', 'is', null)
    .not('away_team_id', 'is', null)
    .lte('match_date', cutoffIso)
    .order('match_date', { ascending: true })
  if (matchErr) throw matchErr
  if (!ourMatches || ourMatches.length === 0) return result // nothing to link → no api call

  // team_id -> external_team_id / name
  const { data: teams } = await admin
    .from('teams')
    .select('team_id, country_name, external_team_id')
    .eq('tournament_id', tournamentId)
  const extByTeam = new Map<string, number>()
  const nameByTeam = new Map<string, string>()
  for (const t of teams || []) {
    if (t.external_team_id) extByTeam.set(t.team_id, t.external_team_id)
    nameByTeam.set(t.team_id, t.country_name)
  }

  // Never reuse a fixture id already mapped to another row.
  const { data: mapped } = await admin
    .from('matches')
    .select('external_match_id')
    .eq('tournament_id', tournamentId)
    .not('external_match_id', 'is', null)
  const usedFixtureIds = new Set<number>()
  for (const m of mapped || []) {
    const n = parseInt(m.external_match_id as string, 10)
    if (Number.isFinite(n)) usedFixtureIds.add(n)
  }

  const fixtures = await ApiFootballClient.getFixtures({ league, season })
  result.fetchedFixtures = true

  for (const ours of ourMatches) {
    const label = `${nameByTeam.get(ours.home_team_id!) ?? '?'} vs ${nameByTeam.get(ours.away_team_id!) ?? '?'}`
    const homeExt = extByTeam.get(ours.home_team_id!)
    const awayExt = extByTeam.get(ours.away_team_id!)
    if (!homeExt || !awayExt) {
      result.unresolved.push({ match_number: ours.match_number, stage: ours.stage, reason: `a team has no external_team_id (${label})` })
      continue
    }

    const ourTime = new Date(ours.match_date).getTime()
    const candidates = fixtures.filter((f: ApiFootballFixture) => {
      if (usedFixtureIds.has(f.fixture.id)) return false
      const h = f.teams.home.id
      const a = f.teams.away.id
      const samePair = (h === homeExt && a === awayExt) || (h === awayExt && a === homeExt)
      if (!samePair) return false
      return Math.abs(new Date(f.fixture.date).getTime() - ourTime) <= MATCH_DATE_WINDOW_MS
    })

    if (candidates.length === 0) {
      result.unresolved.push({ match_number: ours.match_number, stage: ours.stage, reason: `no api fixture for ${label} within ±6h of ${ours.match_date}` })
      continue
    }
    if (candidates.length > 1) {
      // Ambiguous — never auto-link; surface for manual resolution.
      result.ambiguous.push({ match_number: ours.match_number, stage: ours.stage, candidates: candidates.length, label })
      continue
    }

    const fixtureId = candidates[0].fixture.id
    usedFixtureIds.add(fixtureId) // guard against two of our rows grabbing the same fixture this run
    result.linked.push({ match_id: ours.match_id, match_number: ours.match_number, external_match_id: fixtureId.toString(), label })
  }

  if (commit) {
    for (const m of result.linked) {
      const { error } = await admin
        .from('matches')
        .update({ external_match_id: m.external_match_id })
        .eq('match_id', m.match_id)
        .is('external_match_id', null) // race guard: only if still unlinked
      if (error) throw error
    }
  }

  return result
}
