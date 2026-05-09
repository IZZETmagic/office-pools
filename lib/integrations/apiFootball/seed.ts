/**
 * Seed helpers for mapping our teams/matches to api-football entities.
 * Designed to be runnable as scripts via `npx tsx` and importable by an
 * admin UI button.
 *
 * Strategy:
 *   - Teams: match by normalized country name (case-insensitive, diacritic-strip).
 *   - Group-stage fixtures: match by (home_external_id, away_external_id) +
 *     match_date within ±6h. Both teams must already be mapped.
 *   - Knockout fixtures: cannot reliably auto-map (placeholder teams).
 *     Returns them in `unresolved` so an operator can map manually.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiFootballClient } from './client'
import type { ApiFootballFixture } from './types'

function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

export type SeedTeamsResult = {
  matched: Array<{ team_id: string; country_name: string; external_team_id: number }>
  unmatched_external: Array<{ id: number; name: string }>
  unmatched_internal: Array<{ team_id: string; country_name: string }>
}

export async function seedTeamMapping(
  supabase: SupabaseClient,
  args: { tournament_id: string; league: number; season: number }
): Promise<SeedTeamsResult> {
  const { data: teams, error: teamsErr } = await supabase
    .from('teams')
    .select('team_id, country_name, external_team_id')
    .eq('tournament_id', args.tournament_id)
  if (teamsErr) throw teamsErr
  if (!teams) throw new Error('No teams returned')

  const externalTeams = await ApiFootballClient.getTeamsForLeague({ league: args.league, season: args.season })

  const byNorm = new Map<string, { id: number; name: string }>()
  for (const t of externalTeams) byNorm.set(normalize(t.team.name), { id: t.team.id, name: t.team.name })

  const matched: SeedTeamsResult['matched'] = []
  const unmatched_internal: SeedTeamsResult['unmatched_internal'] = []
  const used = new Set<number>()

  for (const ours of teams) {
    const ext = byNorm.get(normalize(ours.country_name))
    if (!ext) {
      unmatched_internal.push({ team_id: ours.team_id, country_name: ours.country_name })
      continue
    }
    used.add(ext.id)
    matched.push({ team_id: ours.team_id, country_name: ours.country_name, external_team_id: ext.id })
  }

  // Apply updates
  for (const m of matched) {
    await supabase.from('teams').update({ external_team_id: m.external_team_id }).eq('team_id', m.team_id)
  }

  const unmatched_external = externalTeams
    .filter((t) => !used.has(t.team.id))
    .map((t) => ({ id: t.team.id, name: t.team.name }))

  return { matched, unmatched_external, unmatched_internal }
}

export type SeedFixturesResult = {
  matched: Array<{ match_id: string; match_number: number; external_match_id: string }>
  unresolved: Array<{ match_id: string; match_number: number; reason: string }>
}

export async function seedFixtureMapping(
  supabase: SupabaseClient,
  args: { tournament_id: string; league: number; season: number }
): Promise<SeedFixturesResult> {
  const { data: ourMatches, error } = await supabase
    .from('matches')
    .select('match_id, match_number, stage, match_date, home_team_id, away_team_id, external_match_id')
    .eq('tournament_id', args.tournament_id)
    .order('match_number', { ascending: true })
  if (error) throw error
  if (!ourMatches) throw new Error('No matches returned')

  const { data: teams } = await supabase
    .from('teams')
    .select('team_id, external_team_id')
    .eq('tournament_id', args.tournament_id)
  const extByTeam = new Map<string, number>()
  for (const t of teams || []) {
    if (t.external_team_id) extByTeam.set(t.team_id, t.external_team_id)
  }

  const fixtures = await ApiFootballClient.getFixtures({ league: args.league, season: args.season })

  const matched: SeedFixturesResult['matched'] = []
  const unresolved: SeedFixturesResult['unresolved'] = []
  const usedFixtureIds = new Set<number>()

  for (const ours of ourMatches) {
    if (ours.stage !== 'group') {
      unresolved.push({
        match_id: ours.match_id,
        match_number: ours.match_number,
        reason: 'Knockout match — map manually after bracket fills.',
      })
      continue
    }
    if (!ours.home_team_id || !ours.away_team_id) {
      unresolved.push({
        match_id: ours.match_id,
        match_number: ours.match_number,
        reason: 'Missing team_id on our match row.',
      })
      continue
    }
    const homeExt = extByTeam.get(ours.home_team_id)
    const awayExt = extByTeam.get(ours.away_team_id)
    if (!homeExt || !awayExt) {
      unresolved.push({
        match_id: ours.match_id,
        match_number: ours.match_number,
        reason: 'One or both teams have no external_team_id (run seedTeamMapping first).',
      })
      continue
    }

    const ourTime = new Date(ours.match_date).getTime()
    const candidate = fixtures.find((f: ApiFootballFixture) => {
      if (usedFixtureIds.has(f.fixture.id)) return false
      const home = f.teams.home.id
      const away = f.teams.away.id
      const samePair = (home === homeExt && away === awayExt) || (home === awayExt && away === homeExt)
      if (!samePair) return false
      const fxTime = new Date(f.fixture.date).getTime()
      return Math.abs(fxTime - ourTime) <= 6 * 60 * 60 * 1000
    })

    if (!candidate) {
      unresolved.push({
        match_id: ours.match_id,
        match_number: ours.match_number,
        reason: `No external fixture matches teams ${homeExt} vs ${awayExt} within ±6h.`,
      })
      continue
    }
    usedFixtureIds.add(candidate.fixture.id)
    const ext_id = candidate.fixture.id.toString()
    matched.push({ match_id: ours.match_id, match_number: ours.match_number, external_match_id: ext_id })
  }

  for (const m of matched) {
    await supabase.from('matches').update({ external_match_id: m.external_match_id }).eq('match_id', m.match_id)
  }

  return { matched, unresolved }
}
