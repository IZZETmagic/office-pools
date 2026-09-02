// =============================================================
// verify-rn-fixtures — the football the phone will actually render
// =============================================================
// `GET /api/users/:id/fixtures` exists so the Expo app can see league fixtures
// at all: they are not in `matches`, so every mobile match surface returned
// nothing for a league pool — a blank Results tab, no next kickoff, and "Match
// not found" on a tap.
//
// ## ⚠ WHAT THIS CHECKS THAT A UNIT TEST CANNOT
//
// The unit tests pin the shaping against fixtures I wrote, which proves the
// mapping is self-consistent and nothing about the real season. The failure
// this guards is the other kind: the club fields are read POSITIONALLY on the
// phone — name in `country_name`, abbreviation in `country_code`, crest in
// `flag_url` — so a real season with, say, no crests renders 380 nameless grey
// rows and throws nothing. That is a fact about production data.
//
// It also runs the phone's OWN list logic — `roundSections` and
// `homeMatchesFrom`, imported straight out of `mobile/` — over the real season.
// Those modules hold no React Native import precisely so this can reach them,
// and it is the closest thing to a device available without a device.
//
// Run: npx tsx scripts/verify-rn-fixtures.ts
// =============================================================

import { readFileSync } from 'fs'
import { resolve } from 'path'
;(() => {
  const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  for (const line of env.split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue
    const i = t.indexOf('='); if (i === -1) continue
    const k = t.slice(0, i).trim(); let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!process.env[k]) process.env[k] = v
  }
})()

import { createAdminClient } from '../lib/supabase/server'
import { readLeagueSeasonUncached } from '../lib/league/seasonRead'
import { readLeagueSeasonMatches } from '../lib/league/read'
// ⚠ Straight out of `mobile/`. These two modules import nothing but a type, so
// they run here — which is the whole reason the list logic was moved out of the
// Results screen. If either ever gains a `react-native` import this stops
// resolving, and that is the intended alarm.
import { roundSections, dateSections, windowSections, anchorSectionIndex, ROW_BUDGET } from '../mobile/lib/resultsSections'
import { homeMatchesFrom } from '../mobile/lib/homeMatches'
import type { ResultsMatch } from '../mobile/lib/useTournamentMatches'

const admin = createAdminClient()
let failures = 0
const bad = (m: string) => { failures++; console.log(`    ✗ ${m}`) }
const ok = (m: string) => console.log(`    ✓ ${m}`)

/**
 * The route hands the phone snake_case rows and the phone's `normalizeMatch`
 * turns them into this. Reproduced here rather than imported because the real
 * one lives beside a `@tanstack/react-query` import.
 */
function toResultsMatch(row: Record<string, unknown>, competition: string | null): ResultsMatch {
  const team = (raw: unknown) => {
    if (!raw) return null
    const t = raw as { country_name?: string; country_code?: string | null; flag_url?: string | null }
    return { countryName: t.country_name ?? '', countryCode: t.country_code ?? null, flagUrl: t.flag_url ?? null }
  }
  return {
    matchId: row.match_id as string,
    matchNumber: (row.match_number as number) ?? 0,
    stage: (row.stage as string) ?? '',
    groupLetter: (row.group_letter as string | null) ?? null,
    matchDate: (row.match_date as string) ?? '',
    status: (row.status as string) ?? 'scheduled',
    statusDetail: (row.status_detail as string | null) ?? null,
    originalMatchDate: (row.original_match_date as string | null) ?? null,
    venue: (row.venue as string | null) ?? null,
    homeTeamId: (row.home_team_id as string | null) ?? null,
    awayTeamId: (row.away_team_id as string | null) ?? null,
    homeScoreFt: (row.home_score_ft as number | null) ?? null,
    awayScoreFt: (row.away_score_ft as number | null) ?? null,
    homeScorePso: null,
    awayScorePso: null,
    liveMinute: (row.live_minute as number | null) ?? null,
    livePeriod: (row.live_period as string | null) ?? null,
    liveAdded: (row.live_added as number | null) ?? null,
    homeTeamPlaceholder: null,
    awayTeamPlaceholder: null,
    homeTeam: team(row.home_team),
    awayTeam: team(row.away_team),
    roundNumber: (row.round_number as number | null) ?? null,
    competition,
  }
}

async function main() {
  const { data: seasons, error } = await admin
    .from('league_seasons')
    .select('season_id, competition_name, season_label, matchweek_count')
    .returns<Array<{ season_id: string; competition_name: string; season_label: string; matchweek_count: number }>>()
  if (error) { console.error('league_seasons:', error.message); process.exit(1) }
  if (!seasons?.length) { console.log('No league seasons imported. Nothing to check.'); return }

  for (const s of seasons) {
    console.log(`\n${s.competition_name} ${s.season_label}`)

    const season = await readLeagueSeasonUncached(admin, s.season_id)
    const { matches, teams, error: shapeErr } = readLeagueSeasonMatches(season, 'verify')
    if (shapeErr) { bad(`shaping: ${shapeErr}`); continue }

    // ---- the shaping, against real rows ----
    if (matches.length === 0) { bad('the season shaped to zero matches'); continue }
    ok(`${matches.length} fixtures, ${teams.length} clubs`)

    const noMatchweek = matches.filter((m) => m.round_number === null)
    if (noMatchweek.length > 0) bad(`${noMatchweek.length} fixture(s) with no matchweek — they would section as nothing`)
    else ok(`every fixture carries a matchweek (1–${Math.max(...matches.map((m) => m.round_number ?? 0))})`)

    // ⚠ The positional half. A wrong key here renders "TBD" and no crest, and
    // throws nothing — the whole reason this script exists.
    const nameless = matches.filter((m) => !m.home_team?.country_name || !m.away_team?.country_name)
    if (nameless.length > 0) bad(`${nameless.length} fixture(s) with an unnamed club — check the country_name mapping`)
    else ok('every club is named through country_name')

    const crestless = new Set<string>()
    for (const m of matches) {
      if (m.home_team && !m.home_team.flag_url) crestless.add(m.home_team.country_name)
      if (m.away_team && !m.away_team.flag_url) crestless.add(m.away_team.country_name)
    }
    // Not a failure: a club with no crest still renders its name. Reported
    // because a whole season of them means the mapping, not the data.
    if (crestless.size > 0) console.log(`    · ${crestless.size} club(s) with no crest: ${[...crestless].slice(0, 5).join(', ')}`)
    else ok('every club has a crest')

    const postponed = matches.filter((m) => m.status === 'postponed' || m.status_detail)
    if (postponed.length > 0) {
      const silent = postponed.filter((m) => !m.status_detail && !m.original_match_date)
      if (silent.length > 0) bad(`${silent.length} abnormal fixture(s) carry neither status_detail nor an original kickoff — they will render a kickoff time as though the game were on`)
      else ok(`${postponed.length} abnormal fixture(s), all carrying a badge`)
    }

    // ---- the phone's own list logic, over the real season ----
    const rn = matches.map((m) => toResultsMatch(m as unknown as Record<string, unknown>, s.competition_name))

    const rounds = roundSections(rn)
    if (rounds.length === 0) bad('roundSections returned nothing — the Results tab would say "No Matches" on a full season')
    else ok(`${rounds.length} matchweek sections, first "${rounds[0].label}", last "${rounds[rounds.length - 1].label}"`)
    const rawEnum = rounds.filter((r) => r.label.includes('regular_season'))
    if (rawEnum.length > 0) bad(`${rawEnum.length} section(s) labelled with the raw stage enum`)

    const days = dateSections(rn)
    const w = windowSections(days, anchorSectionIndex(days), ROW_BUDGET)
    const mounted = days.slice(w.start, w.end).reduce((n, x) => n + x.matches.length, 0)
    if (mounted > ROW_BUDGET * 2) bad(`the date window mounts ${mounted} rows — the budget is ${ROW_BUDGET}`)
    else ok(`date mode mounts ${mounted} of ${rn.length} rows (${days.length} days, window ${w.start}–${w.end})`)

    const home = homeMatchesFrom(rn)
    console.log(`    · home: ${home.live.length} live, next ${home.next ? `${home.next.homeTeam?.countryName} v ${home.next.awayTeam?.countryName} at ${home.next.matchDate}` : 'none'}, ${home.matchesToday} that day`)
    // ⚠ The defect that started this: a season with football still to come must
    // never leave the Home screen with nothing to say.
    const stillToCome = rn.some((m) => m.status === 'scheduled' && new Date(m.matchDate).getTime() >= Date.now())
    if (stillToCome && !home.next && home.live.length === 0) {
      bad('fixtures remain but Home has no next kickoff — the blank-home defect')
    }
  }

  console.log(failures === 0 ? '\n✅ all checks passed' : `\n❌ ${failures} failure(s)`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
