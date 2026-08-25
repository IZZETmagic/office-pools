// =============================================================
// la-fix-live-league-pool — phase L-A, steps 3 and 4
// =============================================================
// PTQPZ797 ("Premier League 2026/2027 Pool", 3 real members, created
// 2026-08-16) had its league_season_id backfilled on 2026-08-24
// (drafts/2026-08-24_ptqpz797_backfill_rollback.sql). Two things were left
// deliberately undone because they were product decisions, not repairs. Ryan
// settled both on 2026-08-24:
//
//   decision 1 — UN-ARCHIVE it. It is archived_at = 2026-08-22 and therefore
//                hidden from its three members. Ryan chose "un-archive" over
//                "un-archive and message the members", so this does NOT send
//                the restore email/push that app/api/pools/[pool_id]/restore
//                sends. It writes the same admin_audit_log row that route
//                writes, so the change is still traceable.
//
//   decision 2 — DELETE its 38 stale pool_round_states rows. A league pool
//                derives round state from league_matchweeks and reads none of
//                them, so they are inert today — but they will be misread by
//                the next person who audits round state.
//
// SAFETY
//   * dry run by default; --apply is required to write anything
//   * captures a full rollback (archived_at + every pool_round_states row,
//     all columns) to drafts/ BEFORE the first write
//   * every write is scoped by pool_id resolved from pool_code, and the
//     round-state delete asserts the pool is a league pool first
//   * re-running is safe: both writes are no-ops once applied
//
//   npx tsx scripts/la-fix-live-league-pool.ts            # dry run
//   npx tsx scripts/la-fix-live-league-pool.ts --apply
// =============================================================

import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

// Same .env.local reader the other scripts use — the repo has no dotenv dependency.
;(() => {
  const envContent = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
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
})()

import { createAdminClient } from '../lib/supabase/server'

const admin = createAdminClient()
const APPLY = process.argv.includes('--apply')
const POOL_CODE = 'PTQPZ797'
const ROLLBACK_PATH = 'drafts/2026-08-24_ptqpz797_unarchive_roundstates_rollback.sql'

function log(s = '') {
  console.log(s)
}
function fail(s: string): never {
  console.error(`\n  ✗ ${s}`)
  process.exit(1)
}

async function main() {
  log(`\n${'='.repeat(70)}`)
  log(`  L-A · un-archive + stale round-state cleanup · ${POOL_CODE}`)
  log(`  mode: ${APPLY ? 'APPLY (writes)' : 'DRY RUN (no writes)'}`)
  log('='.repeat(70))

  // ---------------------------------------------------------- 1. read state
  const { data: pool, error: poolErr } = await admin
    .from('pools')
    .select('pool_id, pool_code, pool_name, archived_at, status, prediction_mode, league_season_id')
    .eq('pool_code', POOL_CODE)
    .single()

  if (poolErr) fail(`could not read the pool: ${poolErr.message}`)
  if (!pool) fail(`no pool with code ${POOL_CODE}`)

  log(`\n  pool_id            ${pool.pool_id}`)
  log(`  name               ${pool.pool_name}`)
  log(`  prediction_mode    ${pool.prediction_mode}`)
  log(`  league_season_id   ${pool.league_season_id ?? 'NULL'}`)
  log(`  status             ${pool.status}`)
  log(`  archived_at        ${pool.archived_at ?? 'null (already un-archived)'}`)

  // Guards. Both writes below assume this is the league pool we think it is.
  if (pool.prediction_mode !== 'league_pickem') {
    fail(`prediction_mode is "${pool.prediction_mode}", expected "league_pickem" — refusing to touch it`)
  }
  if (!pool.league_season_id) {
    fail('league_season_id is NULL — run the backfill first, this script assumes it is done')
  }

  // pool_entries has no pool_id; it reaches a pool through pool_members.
  const { data: members, error: memErr } = await admin
    .from('pool_members')
    .select('member_id')
    .eq('pool_id', pool.pool_id)
  if (memErr) fail(`could not read members: ${memErr.message}`)

  const memberIds = (members ?? []).map((m) => m.member_id)
  const { count: entryCount, error: entErr } = await admin
    .from('pool_entries')
    .select('entry_id', { count: 'exact', head: true })
    .in('member_id', memberIds.length ? memberIds : ['00000000-0000-0000-0000-000000000000'])
  if (entErr) fail(`could not count entries: ${entErr.message}`)

  const { data: roundStates, error: rsErr } = await admin
    // A VERIFIER reads the raw table on purpose: routing through lib/ would ask
    // the abstraction whether a row exists, and the point is to check what is
    // physically there regardless of what the abstraction reports.
    // eslint-disable-next-line no-restricted-syntax
    .from('pool_round_states')
    .select('*')
    .eq('pool_id', pool.pool_id)
  if (rsErr) fail(`could not read pool_round_states: ${rsErr.message}`)

  const rs = roundStates ?? []
  log(`\n  members            ${memberIds.length}`)
  log(`  entries            ${entryCount ?? 0}`)
  log(`  pool_round_states  ${rs.length}`)

  const needsUnarchive = pool.archived_at !== null
  const needsCleanup = rs.length > 0

  if (!needsUnarchive && !needsCleanup) {
    log('\n  Nothing to do — already un-archived and already clean.\n')
    return
  }

  log('\n  Planned changes:')
  if (needsUnarchive) log(`    · archived_at ${pool.archived_at} → NULL   (pool becomes visible to its ${memberIds.length} members)`)
  else log('    · archived_at already NULL — skipping')
  if (needsCleanup) log(`    · DELETE ${rs.length} pool_round_states row(s)`)
  else log('    · no pool_round_states rows — skipping')

  if (!APPLY) {
    log('\n  DRY RUN — nothing written. Re-run with --apply to make these changes.\n')
    return
  }

  // ------------------------------------------------------- 2. write rollback
  // Before the first write, not after. Captures every column of every deleted
  // row so the delete is fully reversible.
  const cols = rs.length ? Object.keys(rs[0]).sort() : []
  const lit = (v: unknown): string => {
    if (v === null || v === undefined) return 'NULL'
    if (typeof v === 'number') return String(v)
    if (typeof v === 'boolean') return v ? 'true' : 'false'
    if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`
    return `'${String(v).replace(/'/g, "''")}'`
  }

  const sql = `-- Rollback for the ${POOL_CODE} un-archive + stale round-state cleanup.
-- Generated by scripts/la-fix-live-league-pool.ts on ${new Date().toISOString()}.
-- Plan: drafts/2026-08-24_league_pools_full_plan.md, phase L-A steps 3 and 4.
--
-- WHAT WAS CHANGED
--   1. pools.archived_at ${pool.archived_at ?? 'NULL'} -> NULL
--      The pool was archived on 2026-08-22 and therefore hidden from its
--      ${memberIds.length} members. Ryan's decision 1 (2026-08-24) was to un-archive it, and
--      to do so WITHOUT the restore email/push, so the members are not messaged.
--      Note migration 044 predates the league tables: league_predictions has no
--      archive gate in its RLS, so archiving never actually blocked a league
--      pick — it only hid the pool from the people who would make one.
--
--   2. DELETE ${rs.length} pool_round_states rows for this pool.
--      Inert for a league pool (round state derives from league_matchweeks) but
--      a trap for future audits. Every column of every row is restored below.
--
-- ⚠ Rolling back step 1 re-hides the pool from its ${memberIds.length} members.

BEGIN;

UPDATE pools
   SET archived_at = ${lit(pool.archived_at)},
       updated_at  = now()
 WHERE pool_id = '${pool.pool_id}';

${
  rs.length
    ? `INSERT INTO pool_round_states (${cols.join(', ')}) VALUES\n` +
      rs.map((r) => `  (${cols.map((c) => lit((r as Record<string, unknown>)[c])).join(', ')})`).join(',\n') +
      ';'
    : '-- (no pool_round_states rows were deleted)'
}

SELECT pool_code, archived_at,
       (SELECT count(*) FROM pool_round_states WHERE pool_id = '${pool.pool_id}') AS round_states
  FROM pools WHERE pool_id = '${pool.pool_id}';

COMMIT;
`
  writeFileSync(resolve(process.cwd(), ROLLBACK_PATH), sql, 'utf8')
  log(`\n  ✓ rollback written → ${ROLLBACK_PATH}`)

  // ---------------------------------------------------------- 3. un-archive
  if (needsUnarchive) {
    const { error } = await admin
      .from('pools')
      .update({ archived_at: null, updated_at: new Date().toISOString() })
      .eq('pool_id', pool.pool_id)
    if (error) fail(`un-archive failed: ${error.message}`)

    // Mirrors what app/api/pools/[pool_id]/restore writes, minus the member
    // email and push — Ryan chose not to message them.
    //
    // `performed_by` is NOT NULL, and a script has no session user, so the
    // actor is resolved by email. Without this the insert fails (harmlessly —
    // the un-archive itself is already committed) and the change goes
    // unrecorded, which is how the first run of this script behaved.
    const { data: actor } = await admin
      .from('users')
      .select('user_id')
      .eq('email', process.env.AUDIT_ACTOR_EMAIL ?? 'ryansousa93@gmail.com')
      .single()

    const { error: auditErr } = await admin.from('admin_audit_log').insert({
      action: 'pool_restored',
      performed_by: actor?.user_id ?? null,
      pool_id: pool.pool_id,
      summary: `Restored pool "${pool.pool_name}" (L-A, script, members not notified)`,
      details: {
        pool_name: pool.pool_name,
        was_archived_at: pool.archived_at,
        source: 'scripts/la-fix-live-league-pool.ts',
        notified_members: false,
      },
    })
    if (auditErr) log(`  ! audit log insert failed (change still applied): ${auditErr.message}`)
    log('  ✓ un-archived')
  }

  // ------------------------------------------------------- 4. stale cleanup
  if (needsCleanup) {
    const { error, count } = await admin
      // A VERIFIER reads the raw table on purpose: routing through lib/ would ask
      // the abstraction whether a row exists, and the point is to check what is
      // physically there regardless of what the abstraction reports.
      // eslint-disable-next-line no-restricted-syntax
      .from('pool_round_states')
      .delete({ count: 'exact' })
      .eq('pool_id', pool.pool_id)
    if (error) fail(`round-state delete failed: ${error.message}`)
    log(`  ✓ deleted ${count ?? 0} pool_round_states row(s)`)
  }

  // ------------------------------------------------------------- 5. verify
  const { data: after, error: afterErr } = await admin
    .from('pools')
    .select('archived_at')
    .eq('pool_id', pool.pool_id)
    .single()
  if (afterErr) fail(`post-verify read failed: ${afterErr.message}`)

  const { count: rsAfter } = await admin
    // A VERIFIER reads the raw table on purpose: routing through lib/ would ask
    // the abstraction whether a row exists, and the point is to check what is
    // physically there regardless of what the abstraction reports.
    // eslint-disable-next-line no-restricted-syntax
    .from('pool_round_states')
    .select('pool_id', { count: 'exact', head: true })
    .eq('pool_id', pool.pool_id)

  log('\n  Verify:')
  log(`    archived_at        ${after?.archived_at ?? 'NULL'}   ${after?.archived_at === null ? '✓' : '✗'}`)
  log(`    pool_round_states  ${rsAfter ?? 0}   ${(rsAfter ?? 0) === 0 ? '✓' : '✗'}`)

  if (after?.archived_at !== null || (rsAfter ?? 0) !== 0) {
    fail('post-verify did not match the expected state')
  }
  log('\n  Done.\n')
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)))
