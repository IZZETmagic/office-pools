/**
 * Does the archive filter actually filter?
 *
 * The mobile home read (`mobile/lib/useHomeData.ts`) asks for every membership
 * of the signed-in user and embeds `pools!inner`. Archived pools were arriving
 * in that list — archiving stamps `pools.archived_at` and leaves
 * `pools.status` alone, so an archived pool is still `status = 'open'` and
 * every list that filtered on status drew it.
 *
 * The fix is one embedded filter: `.is('pools.archived_at', null)`. The risk
 * with an embedded filter is that it silently does nothing — PostgREST applies
 * it to the embedded resource, and without `!inner` the parent row survives
 * with a null child instead of being dropped. So this script proves the
 * behaviour against the real database rather than trusting the syntax:
 *
 *   1. Are there archived pools that are still `status = 'open'`? (If not, the
 *      bug is unreproducible here and the counts below prove nothing.)
 *   2. For a member of one, does the unfiltered query return it and the
 *      filtered query not?
 *
 * Read-only. Usage: npx tsx scripts/verify-archived-pools-hidden.ts
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

try {
  for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    const k = t.slice(0, eq).trim()
    if (!process.env[k]) process.env[k] = v
  }
} catch {
  console.error('Could not read .env.local')
  process.exit(1)
}

import { createAdminClient } from '@/lib/supabase/server'

async function main() {
  const admin = createAdminClient()

  // --- 1. the premise -------------------------------------------------------
  const { data: archived, error: archErr } = await admin
    .from('pools')
    .select('pool_id, pool_name, status, archived_at')
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false })
  if (archErr) throw archErr

  const rows = archived ?? []
  console.log(`archived pools: ${rows.length}`)
  const stillOpen = rows.filter((p) => p.status === 'open')
  console.log(`  of which status='open' (i.e. a status filter would NOT hide them): ${stillOpen.length}`)
  for (const p of rows.slice(0, 10)) {
    console.log(`  · ${p.pool_name} — status=${p.status} archived_at=${p.archived_at}`)
  }
  if (rows.length === 0) {
    console.log('\nNothing archived in this database — the queries below prove nothing.')
    return
  }

  // --- 2. the filter --------------------------------------------------------
  // Pick a member of an archived pool and run the home read's shape both ways.
  const poolIds = rows.map((p) => p.pool_id)
  const { data: members, error: memErr } = await admin
    .from('pool_members')
    .select('user_id, pool_id')
    .in('pool_id', poolIds)
    .limit(1)
  if (memErr) throw memErr
  const subject = (members ?? [])[0]
  if (!subject) {
    console.log('\nNo member of any archived pool — cannot test the read.')
    return
  }

  const SHAPE = 'role, pools!inner(pool_id, pool_name, status, archived_at)'

  const [unfiltered, filtered] = await Promise.all([
    admin.from('pool_members').select(SHAPE).eq('user_id', subject.user_id),
    admin
      .from('pool_members')
      .select(SHAPE)
      .eq('user_id', subject.user_id)
      .is('pools.archived_at', null),
  ])
  if (unfiltered.error) throw unfiltered.error
  if (filtered.error) throw filtered.error

  type Row = { pools: { pool_id: string; pool_name: string; archived_at: string | null } }
  const before = (unfiltered.data ?? []) as unknown as Row[]
  const after = (filtered.data ?? []) as unknown as Row[]

  console.log(`\nsubject user ${subject.user_id} — a member of an archived pool`)
  console.log(`  memberships without the filter: ${before.length}`)
  console.log(`  memberships with    the filter: ${after.length}`)

  const archivedBefore = before.filter((r) => r.pools?.archived_at)
  const archivedAfter = after.filter((r) => r.pools?.archived_at)
  console.log(`  archived pools visible before: ${archivedBefore.length} — ${archivedBefore.map((r) => r.pools.pool_name).join(', ') || 'none'}`)
  console.log(`  archived pools visible after:  ${archivedAfter.length} — ${archivedAfter.map((r) => r.pools.pool_name).join(', ') || 'none'}`)

  // The two things that have to hold. The second is the no-op check: a filter
  // that drops nothing and a filter that drops everything both "pass" a naive
  // count comparison, so assert the surviving non-archived memberships too.
  const nonArchivedBefore = before.filter((r) => !r.pools?.archived_at).length
  const ok = archivedBefore.length > 0 && archivedAfter.length === 0 && after.length === nonArchivedBefore

  console.log(
    `\n${ok ? 'PASS' : 'FAIL'} — the embedded filter drops the archived membership rows and keeps the rest ` +
      `(${nonArchivedBefore} non-archived before, ${after.length} after)`,
  )

  // --- 3. the same filter in the home-scoring route -------------------------
  // That route carries TWO embeds (`pool_entries` and `pools`) alongside the
  // filter, and it surfaces its error as a 500 — so a shape PostgREST refuses
  // is the home screen failing to load, not a silent miss. Run its exact
  // select here.
  const scoring = await admin
    .from('pool_members')
    .select('pool_id, pool_entries(entry_id), pools!inner(archived_at)')
    .eq('user_id', subject.user_id)
    .is('pools.archived_at', null)
  const scoringOk = !scoring.error && (scoring.data ?? []).length === nonArchivedBefore
  console.log(
    `\n${scoringOk ? 'PASS' : 'FAIL'} — home-scoring's select accepts the filter: ` +
      `${scoring.error ? scoring.error.message : `${(scoring.data ?? []).length} rows, expected ${nonArchivedBefore}`}`,
  )

  if (!ok || !scoringOk) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
