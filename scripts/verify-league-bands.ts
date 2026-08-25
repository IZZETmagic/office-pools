// =============================================================
// verify-league-bands — the band matcher, against eight real competitions
// =============================================================
// Table mode pays a bonus for the top band and the relegation band, and those
// bands are DERIVED from api-football's `description` column (migrations 089 and
// 090). Deriving from free text is only safe if it has been tried against the
// text competitions actually produce — so every string below was pulled live
// from `/standings` on 2026-08-24 and is reproduced verbatim.
//
// The one that made this file necessary: the Scottish Premiership tags its
// bottom-half split `"Premiership (Relegation Group)"` — SIX clubs of twelve.
// Counting that as relegation would have paid a relegation bonus for half the
// league, every season, silently.
//
//   npx tsx scripts/verify-league-bands.ts
//
// Exits 1 on any failure. Scratch seasons, torn down in a `finally`.
// =============================================================

import { readFileSync } from 'fs'
import { resolve } from 'path'

;(() => {
  const c = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  for (const line of c.split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue
    const i = t.indexOf('='); if (i === -1) continue
    const k = t.slice(0, i).trim(); let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!process.env[k]) process.env[k] = v
  }
})()

import { createAdminClient } from '../lib/supabase/server'
const admin = createAdminClient()

const S = 'dd140000-0000-4000-8000-'
const hex = (n: number) => n.toString(16).padStart(12, '0')

let failures = 0
const ok = (m: string, x = '') => console.log(`    ✓ ${m}${x ? `  — ${x}` : ''}`)
const bad = (m: string, x = '') => { failures++; console.log(`    ✗ ${m}${x ? `  — ${x}` : ''}`) }
const note = (m: string) => console.log(`    · ${m}`)
const head = (m: string) => console.log(`\n  ${m}\n  ${'-'.repeat(70)}`)

async function must<T>(l: string, p: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await p
  if (error) throw new Error(`${l}: ${error.message}`)
  return data
}

/** `[description, howManyClubsCarryIt]`, in rank order. Verbatim from the feed. */
type Band = [string | null, number]

type Case = {
  label: string
  clubs: number
  bands: Band[]
  topN: number; topSrc: string
  relN: number; relSrc: string
  /** Rank bounds, or null where the competition has no Europa places. */
  eurFrom: number | null; eurTo: number | null
  why?: string
}

const CASES: Case[] = [
  {
    label: 'Premier League (ENG)', clubs: 20,
    bands: [
      ['Promotion - Champions League (League phase)', 4],
      ['Promotion - Europa League (League phase)', 1],
      [null, 12],
      ['Relegation - Championship', 3],
    ],
    topN: 4, topSrc: 'feed', relN: 3, relSrc: 'feed',
    eurFrom: 5, eurTo: 5,
  },
  {
    label: 'La Liga (ESP)', clubs: 20,
    bands: [
      ['Champions League league stage', 4], ['Europa League league stage', 1],
      ['ECL Playoffs', 1], [null, 11], ['Relegation', 3],
    ],
    topN: 4, topSrc: 'feed', relN: 3, relSrc: 'feed',
    eurFrom: 5, eurTo: 5,
    why: 'phrased completely differently from England, same answer',
  },
  {
    label: 'Bundesliga (GER)', clubs: 18,
    bands: [
      ['Champions League league stage', 4], ['Europa League league stage', 2],
      ['Conference League  league stage', 1], [null, 8],
      ['Relegation Playoffs', 1], ['Relegation', 2],
    ],
    topN: 4, topSrc: 'feed', relN: 3, relSrc: 'feed',
    eurFrom: 5, eurTo: 6,
    why: '2 automatic + 1 playoff counted as 3 — the places genuinely at risk',
  },
  {
    label: 'Serie A (ITA)', clubs: 20,
    bands: [
      ['Champions League league stage', 4], ['Europa League league stage', 1],
      ['Play-offs', 1], [null, 11], ['Relegation', 3],
    ],
    topN: 4, topSrc: 'feed', relN: 3, relSrc: 'feed',
    eurFrom: 5, eurTo: 5,
  },
  {
    label: 'Ligue 1 (FRA)', clubs: 18,
    bands: [
      ['Champions League league stage', 3], [' Qualifying', 1],
      ['Europa League league stage', 1], ['Play-offs', 1], [null, 9],
      ['Relegation Playoffs', 1], ['Relegation', 2],
    ],
    topN: 3, topSrc: 'feed', relN: 3, relSrc: 'feed',
    eurFrom: 5, eurTo: 5,
    why: 'rank 4 reads " Qualifying" — no competition named, so it is not guessed at',
  },
  {
    label: 'Eredivisie (NED)', clubs: 18,
    bands: [
      ['Promotion - Champions League (League phase)', 1],
      ['Promotion - Champions League (Qualification)', 1],
      ['Promotion - Europa League (Qualification)', 1],
      ['Promotion - Eredivisie (Conference League - Play Offs)', 4],
      [null, 8],
      ['Eredivisie (Relegation)', 1], ['Relegation - Eerste Divisie', 2],
    ],
    topN: 2, topSrc: 'feed', relN: 3, relSrc: 'feed',
    eurFrom: 3, eurTo: 3,
    why: 'two Champions League places, not four — a direct one and a qualifier',
  },
  {
    label: 'Scottish Premiership (SCO)', clubs: 12,
    bands: [
      ['Promotion - Premiership (Championship Group)', 6],
      ['Premiership (Relegation Group)', 6],
    ],
    topN: 2, topSrc: 'proportional', relN: 2, relSrc: 'unclear',
    eurFrom: null, eurTo: null,
    why: 'THE case: "Relegation Group" is a post-split half, not six relegation places',
  },
  {
    label: 'MLS (USA)', clubs: 30,
    bands: [
      ['Promotion - MLS (Play Offs: 1/8-finals)', 14],
      ['Promotion - MLS (Play Offs: 1/16-finals)', 4],
      [null, 12],
    ],
    topN: 6, topSrc: 'proportional', relN: 0, relSrc: 'feed',
    eurFrom: null, eurTo: null,
    why: 'a described table that never says relegation is a league without it — zero is the answer',
  },
]

async function run(c: Case, idx: number) {
  const base = (idx + 1) * 100000
  const SEASON = `${S}${hex(base + 1)}`
  const CLUB = (n: number) => `${S}${hex(base + 1000 + n)}`

  await must('season', admin.from('league_seasons').insert({
    season_id: SEASON, competition_slug: `scratch-140-${idx}`, competition_name: c.label,
    season_label: '2026/2027', season_start_year: 2026, country_code: 'GB',
    club_count: c.clubs, matchweek_count: 34, external_provider: 'scratch',
    external_league_id: -(14000 + idx), external_season: -2026, regular_season_phase: 'regular',
  }).select('season_id'))

  await must('clubs', admin.from('league_clubs').insert(
    Array.from({ length: c.clubs }, (_, i) => ({
      club_id: CLUB(i + 1), season_id: SEASON, name: `C${i + 1}`,
      short_name: `C${i + 1}`, abbreviation: `C${i + 1}`, external_club_id: -(base + i),
    })),
  ).select('club_id'))

  // Lay the real descriptions down the table in rank order.
  const rows: Array<Record<string, unknown>> = []
  let rank = 0
  for (const [desc, count] of c.bands) {
    for (let k = 0; k < count; k++) {
      rank++
      rows.push({
        season_id: SEASON, club_id: CLUB(rank), rank, points: 100 - rank,
        goals_diff: 40 - rank, played: 34, won: 1, drawn: 0, lost: 0,
        goals_for: 3, goals_against: 0, description: desc,
        fetched_at: new Date().toISOString(),
      })
    }
  }
  if (rank !== c.clubs) throw new Error(`${c.label}: bands cover ${rank} of ${c.clubs} clubs`)
  await must('standings', admin.from('league_standings').insert(rows).select('club_id'))

  const got = await must('bands', admin.rpc('league_default_bands', { p_season_id: SEASON })) as {
    top_n: number; relegation_n: number; top_source: string; relegation_source: string
    europa_from: number | null; europa_to: number | null; europa_source: string
  }

  const pad = c.label.padEnd(28)
  const okTop = got.top_n === c.topN && got.top_source === c.topSrc
  const okRel = got.relegation_n === c.relN && got.relegation_source === c.relSrc
  const okEur = (got.europa_from ?? null) === c.eurFrom && (got.europa_to ?? null) === c.eurTo
  const eurTxt = c.eurFrom === null ? 'none'
    : got.europa_from === got.europa_to ? `${got.europa_from}` : `${got.europa_from}-${got.europa_to}`
  if (okTop && okRel && okEur) {
    ok(`${pad} top ${got.top_n}  ·  europa ${eurTxt}  ·  down ${got.relegation_n}   (${got.top_source}/${got.europa_source}/${got.relegation_source})`)
  } else {
    bad(`${pad} top ${got.top_n} · europa ${got.europa_from}-${got.europa_to} · down ${got.relegation_n}`,
        `expected top ${c.topN} · europa ${c.eurFrom}-${c.eurTo} · down ${c.relN}`)
  }
  if (c.why) note(`  ${' '.repeat(26)}${c.why}`)

  return SEASON
}

/**
 * Deriving the band is half of it; the other half is that the engine pays for
 * it. Played out on a real Premier League shape, where the Europa band is one
 * club at rank 5.
 */
async function europaIsPaid() {
  head('The Europa band, scored')

  const base = 900000
  const SEASON = `${S}${hex(base + 1)}`
  const POOL = `${S}${hex(base + 2)}`
  const MEM = `${S}${hex(base + 3)}`
  const ENTRY = `${S}${hex(base + 4)}`
  const CLUB = (n: number) => `${S}${hex(base + 1000 + n)}`

  const users = await must('u', admin.from('users').select('user_id').eq('username', 'IZZETmagic').limit(1))
  const adminUser = ((users ?? [])[0] as { user_id: string }).user_id
  const tp = await must('t', admin.from('pools').select('tournament_id').not('league_season_id', 'is', null).limit(1))
  const tournamentId = ((tp ?? [])[0] as { tournament_id: string }).tournament_id
  const future = new Date(Date.now() + 90 * 864e5).toISOString()

  try {
    await must('season', admin.from('league_seasons').insert({
      season_id: SEASON, competition_slug: 'scratch-140-eur', competition_name: 'Scratch Europa',
      season_label: '2026/2027', season_start_year: 2026, country_code: 'GB',
      club_count: 20, matchweek_count: 38, external_provider: 'scratch',
      external_league_id: -14099, external_season: -2026, regular_season_phase: 'regular',
    }).select('season_id'))
    await must('clubs', admin.from('league_clubs').insert(
      Array.from({ length: 20 }, (_, i) => ({
        club_id: CLUB(i + 1), season_id: SEASON, name: `C${i + 1}`,
        short_name: `C${i + 1}`, abbreviation: `C${i + 1}`, external_club_id: -(base + i),
      })),
    ).select('club_id'))

    // The Premier League's own shape, verbatim.
    const desc = (rank: number) =>
      rank <= 4 ? 'Promotion - Champions League (League phase)'
      : rank === 5 ? 'Promotion - Europa League (League phase)'
      : rank >= 18 ? 'Relegation - Championship'
      : null
    await must('standings', admin.from('league_standings').insert(
      Array.from({ length: 20 }, (_, i) => ({
        season_id: SEASON, club_id: CLUB(i + 1), rank: i + 1, points: 100 - i,
        goals_diff: 40 - i, played: 38, won: 1, drawn: 0, lost: 0,
        goals_for: 3, goals_against: 0, description: desc(i + 1),
        fetched_at: new Date().toISOString(),
      })),
    ).select('club_id'))

    await must('pool', admin.from('pools').insert({
      pool_id: POOL, tournament_id: tournamentId, admin_user_id: adminUser,
      pool_name: '__scratch 140 europa (auto-deleted)', prediction_deadline: future,
      status: 'open', prediction_mode: 'league_pickem', league_season_id: SEASON,
      league_mode: 'table', league_depth: null, league_table_profile: 'full_table',
      league_table_lock_at: future, max_entries_per_user: 5,
    }).select('pool_id'))
    await must('mem', admin.from('pool_members').insert({
      member_id: MEM, pool_id: POOL, user_id: adminUser, role: 'admin',
    }).select('member_id'))
    await must('entry', admin.from('pool_entries').insert({
      entry_id: ENTRY, member_id: MEM, entry_name: 'Perfect', entry_number: 1,
    }).select('entry_id'))
    await must('picks', admin.from('league_table_predictions').insert(
      Array.from({ length: 20 }, (_, i) => ({
        entry_id: ENTRY, club_id: CLUB(i + 1), predicted_position: i + 1,
      })),
    ).select('club_id'))

    const scored = await must('score', admin.rpc('league_score_table', { p_pool_id: POOL })) as
      { bands?: { top_n: number; europa_from: number | null; relegation_n: number } }
    const totals = await must('tot', admin.from('league_entry_totals')
      .select('bonus_points').eq('entry_id', ENTRY))
    const bonus = ((totals ?? [])[0] as { bonus_points: number } | undefined)?.bonus_points ?? 0

    //  2000 positional + 500 champion + 400 top-four + 250 perfect
    //  + 300 relegation + 50 Europa
    if (bonus === 3500) ok('a perfect Premier League table now scores 3500', '+50 for the Europa place')
    else bad('a perfect Premier League table scores 3500', `got ${bonus}`)
    eq2('the engine read the Europa band from the feed', scored.bands?.europa_from ?? null, 5)

    const bd = await must('bd', admin.rpc('league_table_breakdown', { p_entry_id: ENTRY })) as
      Array<{ predicted_position: number; europa_hit: boolean }>
    const hits = bd.filter((r) => r.europa_hit).map((r) => r.predicted_position)
    eq2('the breakdown marks exactly the Europa place', JSON.stringify(hits), '[5]')
    note('50 a club — half the top band, because fifth is worth less than fourth')
  } finally {
    await admin.from('pool_entries').delete().eq('pool_id', POOL)
    await admin.from('pools').delete().eq('pool_id', POOL)
    await admin.from('league_seasons').delete().eq('season_id', SEASON)
  }
}

const eq2 = (m: string, a: unknown, e: unknown) =>
  a === e ? ok(m, String(a)) : bad(m, `expected ${String(e)}, got ${String(a)}`)

;(async () => {
  console.log('\n  LEAGUE BANDS — eight real competitions, verbatim feed text')
  console.log('  ' + '='.repeat(70))
  const built: string[] = []
  try {
    head('Derived top band and relegation band, per competition')
    for (let i = 0; i < CASES.length; i++) built.push(await run(CASES[i], i))
    await europaIsPaid()
  } catch (err) {
    bad('threw', err instanceof Error ? err.message : String(err))
  } finally {
    for (const s of built) await admin.from('league_seasons').delete().eq('season_id', s)
    const { count } = await admin.from('league_seasons')
      .select('*', { count: 'exact', head: true }).like('competition_slug', 'scratch-140-%')
    if ((count ?? 0) > 0) bad('scratch removed', `${count} left`)
    else ok('scratch data fully removed')
  }
  console.log('\n  ' + '='.repeat(70))
  console.log(failures === 0 ? '  ALL CHECKS PASSED\n' : `  ${failures} CHECK(S) FAILED\n`)
  process.exit(failures === 0 ? 0 : 1)
})()
