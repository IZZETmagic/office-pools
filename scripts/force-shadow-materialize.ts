/**
 * FORCE SHADOW RE-MATERIALIZATION for explicit pools.
 *
 * WHY THIS EXISTS
 * ---------------
 * The shadow-materialize cron only picks up pools whose PREDICTIONS changed
 * since a watermark (`shadow_pools_needing_materialize` tests
 * `predictions.updated_at > p_since`). That means shadow's derived tables can
 * only ever be refreshed by a member editing an input — so a fix to the
 * DERIVATION LOGIC never reaches existing entries once a competition goes
 * quiet. Discovered 2026-07-27: the July podium fix landed in
 * `resolveEntryPodiumPick` but `shadow_resolved_podium` still held the pre-fix
 * cascade values (e.g. 19 progressive entries recorded as picking France),
 * because the last prediction change in the whole database was 2026-07-19.
 *
 * This script is the scoped manual escape hatch. It calls EXACTLY the same
 * three steps, in the same order, as `app/api/cron/shadow-materialize`:
 *
 *   1. backfillResolvedBrackets(admin, tournamentId, { poolIds })
 *   2. backfillBonusInputs(admin, tournamentId, { poolIds })
 *   3. rpc shadow_apply_changes(p_match_ids: [], p_pool_ids: poolIds)
 *
 * No new derivation logic — deliberately, so this can never become another
 * divergent copy. The alternative (rolling the watermark back) is rejected: it
 * would sweep in every pool at once and then advance the watermark again.
 *
 * SHADOW-ONLY. Reads prod tables read-only; writes ONLY shadow_* tables.
 * Nothing customer-facing reads those today (`shadow_read_enabled_pools = []`).
 *
 *   npx tsx scripts/force-shadow-materialize.ts <pool_id> [<pool_id> ...]
 *   npx tsx scripts/force-shadow-materialize.ts --dry-run <pool_id>
 *
 * Prints podium row counts for the pools BEFORE and AFTER, next to prod's, so
 * the run is self-verifying.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

;(() => {
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
})()

import { createAdminClient } from '../lib/supabase/server'
import { backfillResolvedBrackets, backfillBonusInputs } from '../lib/scoring/shadowBrackets'

const TOURNAMENT = process.env.API_FOOTBALL_TOURNAMENT_ID || '00000000-0000-0000-0000-000000000001'
const PODIUM_TYPES = ['champion_correct', 'second_place_correct', 'third_place_correct']

/** Podium row counts for a pool, prod vs shadow, so the run proves itself. */
async function podiumCounts(admin: any, poolIds: string[]) {
  const { data: members } = await admin.from('pool_members').select('member_id').in('pool_id', poolIds)
  const memberIds = (members ?? []).map((m: any) => m.member_id)
  const entryIds: string[] = []
  for (let i = 0; i < memberIds.length; i += 500) {
    const { data } = await admin.from('pool_entries').select('entry_id').in('member_id', memberIds.slice(i, i + 500))
    entryIds.push(...(data ?? []).map((e: any) => e.entry_id))
  }

  const tally = async (table: string) => {
    const out: Record<string, number> = {}
    for (let i = 0; i < entryIds.length; i += 500) {
      const { data } = await admin
        .from(table)
        .select('bonus_type')
        .in('entry_id', entryIds.slice(i, i + 500))
        .in('bonus_type', PODIUM_TYPES)
      for (const r of (data ?? []) as any[]) out[r.bonus_type] = (out[r.bonus_type] ?? 0) + 1
    }
    return out
  }

  return { entries: entryIds.length, prod: await tally('bonus_scores'), shadow: await tally('shadow_bonus_scores') }
}

function render(label: string, c: Awaited<ReturnType<typeof podiumCounts>>) {
  console.log(`\n${label}  (${c.entries} entries)`)
  for (const t of PODIUM_TYPES) {
    const p = c.prod[t] ?? 0
    const s = c.shadow[t] ?? 0
    console.log(`  ${t.padEnd(22)} prod ${String(p).padStart(5)}   shadow ${String(s).padStart(5)}   ${p === s ? '✅ match' : '❌ differs'}`)
  }
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const poolIds = args.filter((a) => !a.startsWith('--'))

  if (poolIds.length === 0) {
    console.error('Usage: npx tsx scripts/force-shadow-materialize.ts [--dry-run] <pool_id> [...]')
    process.exit(1)
  }

  const admin = createAdminClient()

  const before = await podiumCounts(admin, poolIds)
  render('BEFORE', before)

  if (dryRun) {
    console.log('\n--dry-run: no writes performed.')
    return
  }

  console.log(`\nRe-materializing ${poolIds.length} pool(s)…`)
  const brackets = await backfillResolvedBrackets(admin, TOURNAMENT, { poolIds })
  console.log('  brackets:', JSON.stringify(brackets))
  const bonus = await backfillBonusInputs(admin, TOURNAMENT, { poolIds })
  console.log('  bonus inputs:', JSON.stringify(bonus))

  const { error } = await admin.rpc('shadow_apply_changes', { p_match_ids: [], p_pool_ids: poolIds })
  if (error) {
    console.error('  shadow_apply_changes FAILED:', error.message)
    process.exit(1)
  }
  console.log('  shadow_apply_changes: ok')

  const after = await podiumCounts(admin, poolIds)
  render('AFTER', after)

  const clean = PODIUM_TYPES.every((t) => (after.prod[t] ?? 0) === (after.shadow[t] ?? 0))
  console.log(clean ? '\n✅ podium rows now match prod.' : '\n❌ still differs — STOP and diagnose before widening scope.')
  process.exit(clean ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
