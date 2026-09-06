/**
 * M4 parity gate — verify the precomputed entry_xp_state analytics columns
 * (what the column read-path serves) match a FRESH recompute (what the current
 * recompute read-path produces). Read-only: computes + compares, writes NOTHING.
 *
 * Usage:
 *   npx tsx scripts/parity-entry-analytics.ts <poolId> [poolId ...]
 *   npx tsx scripts/parity-entry-analytics.ts --sample 10      (10 richest full/progressive pools)
 *   npx tsx scripts/parity-entry-analytics.ts                  (defaults to --sample 10)
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
 * Exit code 0 = 0 diffs; 1 = diffs found (CI-friendly).
 *
 * Note on precision: the writer (computePoolEntryAnalytics) rounds hit_rate /
 * crowd_agreement_pct to 2dp; the live recompute route returns the raw float.
 * This script compares at 2dp (the column path serves the 2dp value) and also
 * reports the max raw-float delta so the rounding nuance is quantified, not
 * hidden. See drafts/M4_read_path_flip.md §5.
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
import { computePoolEntryAnalytics } from '@/lib/analytics/entryAnalytics'

type Admin = ReturnType<typeof createAdminClient>

const round2 = (n: unknown) => Math.round(Number(n ?? 0) * 100) / 100
const arrEq = (a: unknown[], b: unknown[]) =>
  a.length === b.length && a.every((v, i) => v === b[i])

async function pickSamplePools(admin: Admin, n: number): Promise<string[]> {
  // Tally memberships per pool (paginated — pool_members can exceed 1000 rows),
  // restrict to the modes this leaderboard route's analytics apply to, take the
  // N with the most members.
  const counts = new Map<string, number>()
  let off = 0
  for (;;) {
    const { data: page } = await admin
      .from('pool_members')
      .select('pool_id')
      .range(off, off + 999)
    if (!page || page.length === 0) break
    for (const r of page as Array<{ pool_id: string }>) {
      counts.set(r.pool_id, (counts.get(r.pool_id) ?? 0) + 1)
    }
    if (page.length < 1000) break
    off += page.length
  }
  const poolIds = [...counts.keys()]
  const modes = new Map<string, string>()
  for (let i = 0; i < poolIds.length; i += 300) {
    const { data: pools } = await admin
      .from('pools')
      .select('pool_id, prediction_mode')
      .in('pool_id', poolIds.slice(i, i + 300))
    for (const p of (pools ?? []) as Array<{ pool_id: string; prediction_mode: string }>) {
      modes.set(p.pool_id, p.prediction_mode)
    }
  }
  return poolIds
    .filter(id => ['full_tournament', 'progressive'].includes(modes.get(id) ?? ''))
    .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))
    .slice(0, n)
}

async function parityForPool(admin: Admin, poolId: string) {
  const fresh = await computePoolEntryAnalytics(admin, poolId)
  const freshById = new Map(fresh.map(r => [r.entry_id, r]))
  const entryIds = fresh.map(r => r.entry_id)

  const stored = new Map<string, any>()
  for (let i = 0; i < entryIds.length; i += 500) {
    const { data } = await admin
      .from('entry_xp_state')
      .select('entry_id, total_xp, current_level, last_five, current_streak, hit_rate, total_completed, exact_count, contrarian_wins, crowd_agreement_pct')
      .in('entry_id', entryIds.slice(i, i + 500))
    for (const r of (data ?? []) as any[]) stored.set(r.entry_id, r)
  }

  const diffs: string[] = []
  let missing = 0
  let maxFloatDelta = 0 // raw-float delta on hit_rate/crowd (rounding nuance)

  for (const entryId of entryIds) {
    const f = freshById.get(entryId)!
    const s = stored.get(entryId)
    if (!s) { missing++; diffs.push(`${entryId}: NO stored row (stale/missing)`); continue }

    const mism: string[] = []
    if (Number(s.total_xp) !== f.total_xp) mism.push(`total_xp ${s.total_xp}≠${f.total_xp}`)
    if (Number(s.current_level) !== f.current_level) mism.push(`current_level ${s.current_level}≠${f.current_level}`)
    if (Number(s.total_completed) !== f.total_completed) mism.push(`total_completed ${s.total_completed}≠${f.total_completed}`)
    if (Number(s.exact_count) !== f.exact_count) mism.push(`exact_count ${s.exact_count}≠${f.exact_count}`)
    if (Number(s.contrarian_wins) !== f.contrarian_wins) mism.push(`contrarian_wins ${s.contrarian_wins}≠${f.contrarian_wins}`)
    if (round2(s.hit_rate) !== round2(f.hit_rate)) mism.push(`hit_rate ${s.hit_rate}≠${f.hit_rate}`)
    if (round2(s.crowd_agreement_pct) !== round2(f.crowd_agreement_pct)) mism.push(`crowd_agreement_pct ${s.crowd_agreement_pct}≠${f.crowd_agreement_pct}`)
    if (!arrEq((s.last_five ?? []) as unknown[], (f.last_five ?? []) as unknown[])) mism.push(`last_five [${s.last_five}]≠[${f.last_five}]`)
    const ss = s.current_streak ?? {}
    if (ss.type !== f.current_streak.type || Number(ss.length) !== f.current_streak.length) {
      mism.push(`current_streak ${JSON.stringify(ss)}≠${JSON.stringify(f.current_streak)}`)
    }

    // Raw-float delta (informational: the recompute route serves unrounded).
    maxFloatDelta = Math.max(maxFloatDelta, Math.abs(Number(s.hit_rate ?? 0) - f.hit_rate), Math.abs(Number(s.crowd_agreement_pct ?? 0) - f.crowd_agreement_pct))

    if (mism.length) diffs.push(`${entryId}: ${mism.join(', ')}`)
  }

  return { poolId, compared: entryIds.length, missing, diffs, maxFloatDelta }
}

async function main() {
  const admin = createAdminClient()
  const args = process.argv.slice(2)

  let poolIds: string[]
  const sampleIdx = args.indexOf('--sample')
  if (sampleIdx !== -1) {
    poolIds = await pickSamplePools(admin, Number(args[sampleIdx + 1] ?? 10))
  } else if (args.length > 0) {
    poolIds = args
  } else {
    poolIds = await pickSamplePools(admin, 10)
  }

  if (poolIds.length === 0) { console.error('No pools to check.'); process.exit(1) }
  console.log(`Parity check over ${poolIds.length} pool(s)...\n`)

  let totalCompared = 0
  let totalDiffs = 0
  let totalMissing = 0
  let overallMaxFloatDelta = 0

  for (const poolId of poolIds) {
    const r = await parityForPool(admin, poolId)
    totalCompared += r.compared
    totalDiffs += r.diffs.length
    totalMissing += r.missing
    overallMaxFloatDelta = Math.max(overallMaxFloatDelta, r.maxFloatDelta)
    const status = r.diffs.length === 0 ? '✅' : '❌'
    console.log(`${status} ${poolId} — ${r.compared} entries, ${r.diffs.length} diff(s)${r.missing ? `, ${r.missing} missing` : ''}`)
    for (const d of r.diffs.slice(0, 15)) console.log(`     · ${d}`)
    if (r.diffs.length > 15) console.log(`     · … ${r.diffs.length - 15} more`)
  }

  console.log(`\n──────── SUMMARY ────────`)
  console.log(`pools:           ${poolIds.length}`)
  console.log(`entries compared:${totalCompared}`)
  console.log(`diffs:           ${totalDiffs}`)
  console.log(`missing rows:    ${totalMissing}`)
  console.log(`max raw-float Δ on hit_rate/crowd (rounding nuance, UI-invisible): ${overallMaxFloatDelta.toFixed(6)}`)
  console.log(totalDiffs === 0 ? `\n✅ PARITY CLEAN — safe to flip (at 2dp).` : `\n❌ ${totalDiffs} diff(s) — do NOT flip; investigate above.`)
  process.exit(totalDiffs === 0 ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(1) })
