/**
 * M4 correctness re-materialize — recompute entry_xp_state analytics columns with
 * the CURRENT canonical writer and overwrite the frozen-bad values left by the
 * 07-12 backfill (see drafts/M4_read_path_flip.md §11).
 *
 * Gentle by design: computes fresh via computePoolEntryAnalytics (the same code
 * the sweep + leaderboard use) and upserts ONLY the entries whose values actually
 * changed — so unchanged pools produce zero writes (no WAL / realtime churn).
 *
 * Usage:
 *   npx tsx scripts/rematerialize-entry-analytics.ts --dry-run            (report only, NO writes)
 *   npx tsx scripts/rematerialize-entry-analytics.ts                      (write corrections, all full/progressive pools)
 *   npx tsx scripts/rematerialize-entry-analytics.ts --dry-run <poolId>   (one pool)
 *   npx tsx scripts/rematerialize-entry-analytics.ts --limit 50           (cap pool count, e.g. for a first pass)
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

const envPath = resolve(process.cwd(), '.env.local')
try {
  const envContent = readFileSync(envPath, 'utf8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
} catch {
  console.error('Could not read .env.local')
  process.exit(1)
}

import { createAdminClient } from '@/lib/supabase/server'
import { computePoolEntryAnalytics, type EntryAnalyticsRow } from '@/lib/analytics/entryAnalytics'

type Admin = ReturnType<typeof createAdminClient>

const round2 = (n: unknown) => Math.round(Number(n ?? 0) * 100) / 100
const arrEq = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((v, i) => v === b[i])

/** True if the freshly-computed row differs from what's stored (at display precision). */
function changed(fresh: EntryAnalyticsRow, s: any): boolean {
  if (!s) return true
  if (Number(s.total_xp) !== fresh.total_xp) return true
  if (Number(s.current_level) !== fresh.current_level) return true
  if (Number(s.total_completed) !== fresh.total_completed) return true
  if (Number(s.exact_count) !== fresh.exact_count) return true
  if (Number(s.contrarian_wins) !== fresh.contrarian_wins) return true
  if (round2(s.hit_rate) !== round2(fresh.hit_rate)) return true
  if (round2(s.crowd_agreement_pct) !== round2(fresh.crowd_agreement_pct)) return true
  if (!arrEq((s.last_five ?? []) as unknown[], (fresh.last_five ?? []) as unknown[])) return true
  const ss = s.current_streak ?? {}
  if (ss.type !== fresh.current_streak.type || Number(ss.length) !== fresh.current_streak.length) return true
  return false
}

async function allTargetPools(admin: Admin): Promise<string[]> {
  const ids: string[] = []
  let off = 0
  for (;;) {
    const { data } = await admin
      .from('pools')
      .select('pool_id')
      .in('prediction_mode', ['full_tournament', 'progressive'])
      .range(off, off + 999)
    if (!data || data.length === 0) break
    ids.push(...(data as Array<{ pool_id: string }>).map(p => p.pool_id))
    if (data.length < 1000) break
    off += data.length
  }
  return ids
}

async function processPool(admin: Admin, poolId: string, dryRun: boolean) {
  const fresh = await computePoolEntryAnalytics(admin, poolId)
  if (fresh.length === 0) return { corrected: 0, scanned: 0 }
  const entryIds = fresh.map(r => r.entry_id)

  const stored = new Map<string, any>()
  for (let i = 0; i < entryIds.length; i += 500) {
    const { data } = await admin
      .from('entry_xp_state')
      .select('entry_id, total_xp, current_level, last_five, current_streak, hit_rate, total_completed, exact_count, contrarian_wins, crowd_agreement_pct')
      .in('entry_id', entryIds.slice(i, i + 500))
    for (const r of (data ?? []) as any[]) stored.set(r.entry_id, r)
  }

  const toWrite = fresh.filter(r => changed(r, stored.get(r.entry_id)))
  if (toWrite.length > 0 && !dryRun) {
    for (let i = 0; i < toWrite.length; i += 100) {
      const batch = toWrite.slice(i, i + 100)
      const { error } = await admin.from('entry_xp_state').upsert(batch, { onConflict: 'entry_id' })
      if (error) throw new Error(error.message)
    }
  }
  return { corrected: toWrite.length, scanned: fresh.length }
}

async function main() {
  const admin = createAdminClient()
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const limIdx = args.indexOf('--limit')
  const limit = limIdx !== -1 ? Number(args[limIdx + 1]) : Infinity
  const explicit = args.filter(a => !a.startsWith('--') && a !== String(limit))

  let pools = explicit.length > 0 ? explicit : await allTargetPools(admin)
  if (Number.isFinite(limit)) pools = pools.slice(0, limit)

  console.log(`${dryRun ? '[DRY RUN] ' : ''}Re-materialize over ${pools.length} full/progressive pool(s)...\n`)

  let totalCorrected = 0, totalScanned = 0, poolsWithFixes = 0
  const errors: Array<{ pool: string; msg: string }> = []
  let done = 0
  for (const poolId of pools) {
    try {
      const { corrected, scanned } = await processPool(admin, poolId, dryRun)
      totalCorrected += corrected
      totalScanned += scanned
      if (corrected > 0) { poolsWithFixes++; console.log(`  ${dryRun ? 'would fix' : 'fixed'} ${String(corrected).padStart(4)} / ${scanned} — ${poolId}`) }
    } catch (e: any) {
      errors.push({ pool: poolId, msg: e?.message ?? String(e) })
      console.error(`  ERROR ${poolId}: ${e?.message ?? e}`)
    }
    if (++done % 25 === 0) console.log(`  … ${done}/${pools.length} pools`)
  }

  console.log(`\n──────── ${dryRun ? 'DRY-RUN ' : ''}SUMMARY ────────`)
  console.log(`pools:              ${pools.length}`)
  console.log(`pools with fixes:   ${poolsWithFixes}`)
  console.log(`entries scanned:    ${totalScanned}`)
  console.log(`entries ${dryRun ? 'to correct' : 'corrected'}: ${totalCorrected}`)
  console.log(`errors:             ${errors.length}`)
  if (dryRun) console.log(`\nDry run — NO writes. Re-run without --dry-run to apply.`)
  else console.log(`\n✅ Re-materialize complete.`)
  process.exit(errors.length > 0 ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
