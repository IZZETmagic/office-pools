// =============================================================
// verify-league-season-cache — the assumption the season cache rests on
// =============================================================
// `lib/league/season.ts` serves ONE cached copy of a season to every viewer of
// every pool playing it, read with the ADMIN client. That is only correct
// because the three tables it reads are the same for everybody:
//
//   league_clubs · league_matchweeks · league_fixtures
//
// all carry a single RLS policy of `USING (true)`.
//
// ⚠ IF ONE OF THEM EVER GAINS A POLICY THAT FILTERS BY USER, the cache becomes
// a LEAK — one viewer's copy served to another — and nothing in the TypeScript
// would notice, because the admin client bypasses RLS entirely. That is a
// property of the database, so it cannot be a unit test. This is the check.
//
// ## ⚠ IT TESTS THE CONSEQUENCE, NOT THE POLICY TEXT
//
// The first version read `pg_policies` and asserted `USING (true)`. It could
// not run: that view lives in `pg_catalog`, PostgREST only exposes `public`,
// and this codebase deliberately has no generic SQL RPC. Which was useful,
// because reading the policy was the wrong test anyway.
//
// What the cache actually depends on is not how a policy is WORDED but whether
// **every reader sees the same rows**. So: read each table as an ordinary
// anonymous client and as the admin, and compare. Identical counts mean one
// cached copy is correct for everybody. A shortfall means it is not, whatever
// the policy says — including cases a text check would miss, like a policy on a
// joined table or a changed default.
//
// It also measures what the cache is actually saving, so the claim in the
// review ("175 kB per load, per viewer") stays a measured number rather than a
// remembered one.
//
//   npx tsx scripts/verify-league-season-cache.ts
//
// Exits 1 on any failure. Read-only — it writes nothing.
// =============================================================

import { readFileSync } from 'fs'
import { resolve } from 'path'

;(() => {
  const envContent = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  for (const line of envContent.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    const k = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (!process.env[k]) process.env[k] = v
  }
})()

import { createClient } from '@supabase/supabase-js'

const SHARED_TABLES = ['league_clubs', 'league_matchweeks', 'league_fixtures'] as const

let failures = 0
function ok(label: string, pass: boolean, detail = '') {
  console.log(`${pass ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!pass) failures++
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required')
  const admin = createClient(url, key, { auth: { persistSession: false } })

  console.log('\nThe RLS assumption — every reader sees the same rows\n')

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!anonKey) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY required — it is the whole test')
  const anon = createClient(url, anonKey, { auth: { persistSession: false } })

  for (const table of SHARED_TABLES) {
    const [a, b] = await Promise.all([
      admin.from(table).select('*', { count: 'exact', head: true }),
      anon.from(table).select('*', { count: 'exact', head: true }),
    ])
    if (a.error) { ok(`${table} readable as admin`, false, a.error.message); continue }
    if (b.error) { ok(`${table} readable as anon`, false, b.error.message); continue }
    const same = (a.count ?? -1) === (b.count ?? -2)
    ok(
      `${table} — anon sees what admin sees`,
      same,
      same
        ? `${a.count} rows both ways`
        : `⚠ admin ${a.count} vs anon ${b.count} — VIEWER-DEPENDENT, THE CACHE IS A LEAK`,
    )
  }

  console.log('\nWhat the cache is saving\n')

  const { data: seasons } = await admin
    .from('league_seasons')
    .select('season_id')
    .limit(5)
  for (const s of (seasons ?? []) as Array<{ season_id: string }>) {
    const { data: fx } = await admin
      .from('league_fixtures')
      .select('fixture_id, matchweek_id, fixture_number, home_club_id, away_club_id, kickoff_at, venue, status, home_goals, away_goals, is_completed, live_minute, live_period, live_added')
      .eq('season_id', s.season_id)
    const bytes = Buffer.byteLength(JSON.stringify(fx ?? []))
    const { count: pools } = await admin
      .from('pools')
      .select('pool_id', { count: 'exact', head: true })
      .eq('league_season_id', s.season_id)
    console.log(
      `  season ${s.season_id.slice(0, 8)}…  ${(fx ?? []).length} fixtures  ` +
      `${(bytes / 1024).toFixed(1)} kB  shared by ${pools ?? 0} pool(s)`,
    )
  }

  console.log(
    failures === 0
      ? '\n✓ the season cache is safe to serve from one copy\n'
      : `\n✗ ${failures} check(s) failed — do NOT rely on the season cache\n`,
  )
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
