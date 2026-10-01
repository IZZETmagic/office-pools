// =============================================================
// verify-league-stranded-fixtures — the provider says played, we say scheduled
// =============================================================
// The invariant, and it is one sentence: A FIXTURE THE PROVIDER HAS FINISHED
// MUST NOT BE `scheduled` IN OUR DATABASE, whatever date we hold for it.
//
// It has been broken twice, both times silently, both times found from a
// screenshot rather than from an alarm:
//
//   2026-09-19  7 fixtures across three leagues, stranded 6 days
//   2026-10-01  5 La Liga matchweek-7 fixtures, stranded 11 days
//
// Both were the same shape. A provider publishes a TBD placeholder kickoff
// (La Liga: Sunday 15:00Z) and moves the game to the Friday only once it has
// been played. The live sync builds its feed request from the date WE hold, so
// it asks about Sunday and the Friday game is never in the answer; the daily
// reconcile used to decline to touch a fixture the feed called finished; and
// the catch-up pass used to stop offering it seven days on. Every tick then
// reported `window=0 stale=0 errors=[] ok=true` — healthy, and wrong.
//
// ## Why a script and not a test
//
// Both arms have unit tests, and both arms passed throughout. What no unit
// test can assert is the thing that actually matters: that THIS season, in
// production, holds what the provider holds. That is a fact about live data
// and one api-football call per league.
//
// Run: npx tsx scripts/verify-league-stranded-fixtures.ts
// Exit code is 1 if anything is stranded, so it can gate a deploy.
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

/** Provider statuses that mean the match is over. */
const FINAL = new Set(['FT', 'AET', 'PEN', 'WO', 'AWD'])
/** Ours that mean "and we know it is over, or it is never happening". */
const SETTLED = new Set(['completed', 'cancelled', 'postponed'])

type Season = {
  season_id: string
  competition_name: string
  external_league_id: number
  external_season: number
}

type Row = {
  external_fixture_id: string
  kickoff_at: string
  status: string
  is_completed: boolean
  last_synced_at: string | null
}

async function main() {
  const admin = createAdminClient()
  const key = process.env.API_FOOTBALL_KEY
  if (!key) throw new Error('API_FOOTBALL_KEY missing')

  const { data: seasons, error } = await admin
    .from('league_seasons')
    .select('season_id, competition_name, external_league_id, external_season')
    .order('season_start_year', { ascending: false })
    .range(0, 999)
  if (error) throw error

  let stranded = 0
  let drifted = 0

  for (const s of (seasons ?? []) as Season[]) {
    const { data: ours, error: fErr } = await admin
      .from('league_fixtures')
      .select('external_fixture_id, kickoff_at, status, is_completed, last_synced_at')
      .eq('season_id', s.season_id)
      .range(0, 999)
    if (fErr) throw fErr
    const rows = (ours ?? []) as Row[]
    // ⚠ An exact 1,000 is a truncated read, not a season — PostgREST caps
    // silently and a season larger than the cap would verify only its first
    // page while printing a clean bill of health.
    if (rows.length >= 1000) throw new Error(`${s.competition_name}: read capped at ${rows.length}`)

    const res = await fetch(
      `https://v3.football.api-sports.io/fixtures?league=${s.external_league_id}&season=${s.external_season}`,
      { headers: { 'x-apisports-key': key } },
    )
    const body = (await res.json()) as {
      response?: Array<{ fixture: { id: number; date: string; status: { short: string } } }>
      errors?: unknown
    }
    const feed = body.response ?? []
    if (feed.length === 0) {
      console.log(`${s.competition_name}: feed returned nothing (${JSON.stringify(body.errors)}) — SKIPPED`)
      continue
    }
    const byId = new Map(feed.map((f) => [String(f.fixture.id), f]))

    const bad: string[] = []
    const moved: string[] = []
    for (const r of rows) {
      const f = byId.get(r.external_fixture_id)
      if (!f) continue // a mapping break; the reconcile reports those as unmatched
      const providerDone = FINAL.has(f.fixture.status.short)

      // THE INVARIANT.
      if (providerDone && !r.is_completed && !SETTLED.has(r.status)) {
        bad.push(
          `    ${r.external_fixture_id}  we: ${r.kickoff_at} ${r.status}  ` +
            `provider: ${f.fixture.date} ${f.fixture.status.short}  ` +
            `synced=${r.last_synced_at ?? 'never'}`,
        )
      }

      // Date drift on a fixture not yet played is not stranding — the daily
      // reconcile owns it — but it is the thing that BECOMES stranding, and a
      // long-lived one means the reconcile is not running.
      if (!providerDone && Date.parse(f.fixture.date) !== Date.parse(r.kickoff_at)) {
        moved.push(`    ${r.external_fixture_id}  we: ${r.kickoff_at}  provider: ${f.fixture.date}`)
      }
    }

    stranded += bad.length
    drifted += moved.length
    console.log(
      `${s.competition_name.padEnd(16)} fixtures=${String(rows.length).padEnd(4)} ` +
        `stranded=${bad.length}  unreconciled_moves=${moved.length}`,
    )
    for (const line of bad) console.log(line)
    if (moved.length > 0 && moved.length <= 10) for (const line of moved) console.log(line)
  }

  console.log(
    `\n${stranded === 0 ? 'PASS' : 'FAIL'} — ${stranded} fixture(s) the provider has finished and we have not. ` +
      `${drifted} future fixture(s) awaiting the daily reconcile.`,
  )
  if (stranded > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
