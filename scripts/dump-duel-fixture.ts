/**
 * DUMP ONE SETTLED DUEL TO A REMOTION FIXTURE. READ-ONLY.
 *
 * The duel-recap composition in `remotion/` is previewed and rendered outside
 * Next, so it has no Supabase session and no server component to fetch from.
 * This writes a real settled duel to `remotion/fixtures/duel.json`, which the
 * composition reads as its `defaultProps`.
 *
 *   npx tsx scripts/dump-duel-fixture.ts                  # newest settled duel
 *   npx tsx scripts/dump-duel-fixture.ts --duel=<uuid>    # a specific one
 *   npx tsx scripts/dump-duel-fixture.ts --reveal         # an UNSETTLED one
 *
 * ⚠ `--reveal` IS A DIFFERENT CARD, not the same one earlier. A settled duel
 * has a result; an unsettled one has only two entries and a matchweek number,
 * which is why the reveal fixture carries each side's season record instead —
 * that is the only thing on it that answers "what am I up against".
 *
 * ⚠ A FIXTURE, NOT A DATA PATH. When rendering moves server-side the props come
 * from the render request, not from this file — the fixture exists so Studio has
 * something true to draw while the design is being worked out.
 *
 * ⚠ SEEDED ACCOUNTS ONLY, AND IT IS ENFORCED. The output is committed, so a
 * real member's duel would put their name and their `user_id` in git for a
 * preview nobody needs it for. Both sides must be `ux-` throwaways from
 * scripts/seed-league-ux-pools.ts; anything else is skipped. `--any` overrides
 * it for a local one-off — do not commit what that produces.
 *
 * ⚠ THE BYE IS STRUCTURAL. `entry_b` null means no opponent, and it must be
 * carried through as `them: null` — a bye pays DUEL_BYE which IS DUEL_TIE, so
 * anything reading the points would call it a tie. See lib/league/duelPoints.ts.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'

// .env.local, the same way the other scripts in here do it.
const envPath = resolve(process.cwd(), '.env.local')
const envContent = readFileSync(envPath, 'utf8')
for (const line of envContent.split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i === -1) continue
  const k = t.slice(0, i).trim()
  let v = t.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (!process.env[k]) process.env[k] = v
}

import { createClient } from '@supabase/supabase-js'

import { duelResult } from '../lib/league/duelPoints'

const REVEAL = process.argv.includes('--reveal')
const OUT = resolve(
  process.cwd(),
  REVEAL ? 'remotion/fixtures/reveal.json' : 'remotion/fixtures/duel.json',
)

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const arg = process.argv.find((a) => a.startsWith('--duel='))?.split('=')[1]
const ANY = process.argv.includes('--any')

/**
 * The prefix scripts/seed-league-ux-pools.ts gives its throwaway accounts.
 * Kept in step with `TEST_EMAIL_PREFIX` there — if that changes, this stops
 * matching and every duel is skipped, which is the safe direction to fail.
 */
const TEST_EMAIL_PREFIX = 'ux-'

type DuelRow = {
  duel_id: string
  pool_id: string
  matchweek_number: number
  entry_a: string
  entry_b: string | null
  accuracy_a: number | null
  accuracy_b: number | null
  points_a: number | null
  points_b: number | null
  settled_at: string | null
}

/**
 * entry → the person behind it. `pool_entries` reaches users via `member_id`.
 *
 * ⚠ `email` is selected to decide whether this is a seeded account and is NEVER
 * written to the fixture — the file is committed.
 */
async function personFor(entryId: string) {
  const { data, error } = await db
    .from('pool_entries')
    .select('entry_id, entry_name, pool_members!inner(user_id, users!inner(full_name, username, email))')
    .eq('entry_id', entryId)
    .single()
  if (error) throw new Error(`entry ${entryId}: ${error.message}`)
  const row = data as unknown as {
    entry_name: string | null
    pool_members: {
      user_id: string
      users: { full_name: string | null; username: string | null; email: string | null }
    }
  }
  const u = row.pool_members.users
  return {
    seeded: (u.email ?? '').startsWith(TEST_EMAIL_PREFIX),
    side: {
      name: u.full_name?.trim() || u.username?.trim() || row.entry_name || 'Unknown',
      person: {
        user_id: row.pool_members.user_id,
        full_name: u.full_name,
        username: u.username,
      },
    },
  }
}

/**
 * A side's season so far: duel points, rank, and a W/T/L record.
 *
 * ⚠ THE RECORD IS DERIVED, and it has to be. `league_entry_totals` carries
 * `duel_points` and `final_rank` but no win/tie/loss columns, so the record is
 * counted off settled duels the same way `DuelsTab` does — via `duelResult`,
 * never by re-deciding what a win is.
 *
 * ⚠ Byes are skipped structurally, before the points are read. DUEL_BYE equals
 * DUEL_TIE, so counting a bye as a tie would quietly inflate everyone's record
 * in an odd-sized pool — where every member gets one.
 */
async function seasonFor(entryId: string, poolId: string) {
  const { data: totals } = await db
    .from('league_entry_totals')
    .select('duel_points, final_rank')
    .eq('entry_id', entryId)
    .maybeSingle()

  const { data: past, error } = await db
    .from('league_duels')
    .select('entry_a, entry_b, points_a, points_b')
    .eq('pool_id', poolId)
    .not('settled_at', 'is', null)
    .or(`entry_a.eq.${entryId},entry_b.eq.${entryId}`)
  if (error) throw new Error(`record ${entryId}: ${error.message}`)

  let won = 0, tied = 0, lost = 0
  for (const d of (past ?? []) as Array<{ entry_a: string; entry_b: string | null; points_a: number | null; points_b: number | null }>) {
    const isA = d.entry_a === entryId
    if (isA ? d.entry_b === null : false) continue // a bye — no opponent, not a tie
    const pts = isA ? d.points_a : d.points_b
    const r = duelResult(pts ?? null)
    if (r === 'won') won++
    else if (r === 'tied') tied++
    else if (r === 'lost') lost++
  }

  const t = totals as { duel_points: number | null; final_rank: number | null } | null
  return { duelPoints: t?.duel_points ?? 0, rank: t?.final_rank ?? null, won, tied, lost }
}

async function main() {
  // A page of candidates rather than one row: the newest settled duel is often
  // the admin's, and those are the ones we refuse to commit.
  let q = db
    .from('league_duels')
    .select('duel_id, pool_id, matchweek_number, entry_a, entry_b, accuracy_a, accuracy_b, points_a, points_b, settled_at')
  if (REVEAL) {
    // ⚠ The OPEN matchweek only. The sealed draw (migration 116) hides future
    // opponents behind `league_duel_is_revealed`, and this script runs with the
    // service-role client, which does not go through RLS. Ordering ascending
    // takes the EARLIEST unsettled week — the one that just opened — rather
    // than the furthest-out fixture the table happens to hold.
    q = q.is('settled_at', null).order('matchweek_number', { ascending: true }).limit(arg ? 1 : 60)
  } else {
    q = q
      .not('settled_at', 'is', null)
      .order('settled_at', { ascending: false })
      .limit(arg ? 1 : 60)
  }
  if (arg) q = q.eq('duel_id', arg) as typeof q

  const { data, error } = await q
  if (error) throw new Error(error.message)
  const candidates = (data ?? []) as DuelRow[]
  if (candidates.length === 0) throw new Error(`no ${REVEAL ? 'unsettled' : 'settled'} duel found`)

  let chosen: { duel: DuelRow; a: Awaited<ReturnType<typeof personFor>>; b: Awaited<ReturnType<typeof personFor>> | null } | null = null
  let skipped = 0
  for (const duel of candidates) {
    const a = await personFor(duel.entry_a)
    // ⚠ Structural bye check — see the header.
    const b = duel.entry_b ? await personFor(duel.entry_b) : null
    const allSeeded = a.seeded && (b === null || b.seeded)
    if (!allSeeded && !ANY && !arg) { skipped++; continue }
    if (!allSeeded && (ANY || arg)) {
      console.warn('⚠ this duel involves a NON-SEEDED account — do not commit the result')
    }
    chosen = { duel, a, b }
    break
  }
  if (!chosen) {
    throw new Error(
      `no ${REVEAL ? 'unsettled ' : ''}duel found where both sides are seeded '${TEST_EMAIL_PREFIX}' accounts ` +
        `(skipped ${skipped}). Re-run scripts/seed-league-ux-pools.ts, or pass --any ` +
        `for a local-only fixture you will not commit.`,
    )
  }
  const { duel, a, b } = chosen

  const { data: pool, error: pErr } = await db
    .from('pools')
    .select('pool_name')
    .eq('pool_id', duel.pool_id)
    .single()
  if (pErr) throw new Error(`pool: ${pErr.message}`)

  const poolName = (pool as { pool_name: string }).pool_name

  // ⚠ TWO DIFFERENT CARDS, so two different shapes. A reveal has no result to
  // report — carrying `score: 0` and `points: 0` into it would render a duel
  // that everybody drew 0–0 rather than one that has not been played.
  const fixture = REVEAL
    ? {
        duelId: duel.duel_id,
        poolName,
        matchweek: duel.matchweek_number,
        you: { ...a.side, season: await seasonFor(duel.entry_a, duel.pool_id) },
        them: b && duel.entry_b
          ? { ...b.side, season: await seasonFor(duel.entry_b, duel.pool_id) }
          : null,
      }
    : {
        duelId: duel.duel_id,
        poolName,
        matchweek: duel.matchweek_number,
        settledAt: duel.settled_at,
        you: { ...a.side, score: duel.accuracy_a ?? 0 },
        them: b ? { ...b.side, score: duel.accuracy_b ?? 0 } : null,
        /** What the engine paid entry A. Never recomputed — read from the row. */
        points: duel.points_a ?? 0,
      }

  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, `${JSON.stringify(fixture, null, 2)}\n`)
  console.log(`wrote ${OUT}`)
  console.log(JSON.stringify(fixture, null, 2))
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
