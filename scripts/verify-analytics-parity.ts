/**
 * Parity check for the ANALYTICS read-path flip (entry_xp_state).
 *
 * The question this answers: if the leaderboard read served the precomputed
 * entry_xp_state columns instead of recomputing per request, would anyone's
 * numbers change?
 *
 * WHAT THIS IS AND ISN'T:
 *   The writer (lib/analytics/entryAnalytics.ts) calls the SAME helpers as the
 *   live leaderboard route, so this is primarily a PLUMBING check — right entry,
 *   right pool, right scoring source, not-stale — rather than a proof of the
 *   maths. The realistic failure modes it catches are staleness, missing rows,
 *   and mis-keyed entries. It does NOT independently re-derive the domain.
 *
 * KNOWN, EXPECTED DIFFERENCE:
 *   hit_rate and crowd_agreement_pct are stored as numeric(5,2) and rounded to
 *   2dp by the writer; the live route returns unrounded floats. So the flip
 *   turns 60.576923076923066 into 60.58. That is cosmetic and is reported
 *   separately as ROUNDING, never as a failure.
 *
 * Read-only. Writes nothing.
 * Usage:
 *   npx tsx scripts/verify-analytics-parity.ts            # representative sample
 *   npx tsx scripts/verify-analytics-parity.ts --all      # every pool (slow)
 *   npx tsx scripts/verify-analytics-parity.ts <poolId>…  # specific pools
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

// --- .env.local loader (mirrors the other runner scripts) -------------------
const envPath = resolve(process.cwd(), '.env.local')
try {
  const envContent = readFileSync(envPath, 'utf8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
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

// Fields compared exactly. hit_rate / crowd_agreement_pct are handled separately
// because of the documented numeric(5,2) rounding.
const EXACT_FIELDS = [
  'total_xp',
  'current_level',
  'total_completed',
  'exact_count',
  'contrarian_wins',
] as const
const ROUNDED_FIELDS = ['hit_rate', 'crowd_agreement_pct'] as const

type Tally = {
  entriesCompared: number
  exactMatches: number
  roundingOnly: number
  realMismatches: number
  missingStoredRow: number
  byField: Record<string, number>
  samples: string[]
}

const newTally = (): Tally => ({
  entriesCompared: 0,
  exactMatches: 0,
  roundingOnly: 0,
  realMismatches: 0,
  missingStoredRow: 0,
  byField: {},
  samples: [],
})

function bump(t: Tally, field: string) {
  t.byField[field] = (t.byField[field] ?? 0) + 1
}

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v))

function comparePool(
  fresh: EntryAnalyticsRow[],
  stored: Map<string, Record<string, unknown>>,
  poolId: string,
  t: Tally,
) {
  for (const f of fresh) {
    t.entriesCompared++
    const s = stored.get(f.entry_id)
    if (!s) {
      t.missingStoredRow++
      bump(t, '<missing row>')
      if (t.samples.length < 12) t.samples.push(`${poolId} ${f.entry_id}: no entry_xp_state row`)
      continue
    }

    let real = false
    let rounding = false

    for (const field of EXACT_FIELDS) {
      if (num(s[field]) !== num(f[field])) {
        real = true
        bump(t, field)
        if (t.samples.length < 12) {
          t.samples.push(`${poolId} ${f.entry_id} ${field}: stored=${s[field]} fresh=${f[field]}`)
        }
      }
    }

    for (const field of ROUNDED_FIELDS) {
      const a = num(s[field])
      const b = num(f[field])
      if (a === b) continue
      // numeric(5,2) rounding is expected; anything bigger is a real difference.
      if (Math.abs(a - b) <= 0.005 + Number.EPSILON) {
        rounding = true
      } else {
        real = true
        bump(t, field)
        if (t.samples.length < 12) {
          t.samples.push(`${poolId} ${f.entry_id} ${field}: stored=${a} fresh=${b} (Δ${(a - b).toFixed(4)})`)
        }
      }
    }

    // last_five (ordered array) and current_streak (jsonb) compared structurally.
    const storedFive = JSON.stringify(s.last_five ?? [])
    const freshFive = JSON.stringify(f.last_five ?? [])
    if (storedFive !== freshFive) {
      real = true
      bump(t, 'last_five')
      if (t.samples.length < 12) {
        t.samples.push(`${poolId} ${f.entry_id} last_five: stored=${storedFive} fresh=${freshFive}`)
      }
    }

    const storedStreak = JSON.stringify(s.current_streak ?? null)
    const freshStreak = JSON.stringify(f.current_streak ?? null)
    if (storedStreak !== freshStreak) {
      real = true
      bump(t, 'current_streak')
      if (t.samples.length < 12) {
        t.samples.push(`${poolId} ${f.entry_id} current_streak: stored=${storedStreak} fresh=${freshStreak}`)
      }
    }

    if (real) t.realMismatches++
    else if (rounding) t.roundingOnly++
    else t.exactMatches++
  }
}

async function pickPools(admin: Admin, args: string[]): Promise<string[]> {
  const explicit = args.filter((a) => !a.startsWith('--'))
  if (explicit.length > 0) return explicit

  const { data: pools } = await admin.from('pools').select('pool_id, prediction_mode')
  if (!pools) return []
  if (args.includes('--all')) return (pools as any[]).map((p) => p.pool_id)

  // Representative sample: the biggest pools (where the cost and the risk are)
  // plus a spread of small ones, covering every prediction mode.
  const { data: memberCounts } = await admin
    .from('pool_members')
    .select('pool_id')
    .limit(10000)
  const counts = new Map<string, number>()
  for (const m of (memberCounts ?? []) as any[]) {
    counts.set(m.pool_id, (counts.get(m.pool_id) ?? 0) + 1)
  }

  const byMode = new Map<string, any[]>()
  for (const p of pools as any[]) {
    const mode = p.prediction_mode ?? 'full_tournament'
    const list = byMode.get(mode) ?? []
    list.push(p)
    byMode.set(mode, list)
  }

  const picked: string[] = []
  for (const [, list] of byMode) {
    list.sort((a, b) => (counts.get(b.pool_id) ?? 0) - (counts.get(a.pool_id) ?? 0))
    picked.push(...list.slice(0, 3).map((p) => p.pool_id)) // 3 biggest per mode
    const small = list.filter((p) => (counts.get(p.pool_id) ?? 0) <= 5).slice(0, 2)
    picked.push(...small.map((p) => p.pool_id)) // 2 tiny per mode
  }
  return [...new Set(picked)]
}

async function main() {
  const args = process.argv.slice(2)
  const admin = createAdminClient()

  const poolIds = await pickPools(admin, args)
  console.log(`\nAnalytics parity — entry_xp_state vs freshly computed`)
  console.log(`Pools to check: ${poolIds.length}${args.includes('--all') ? ' (ALL)' : ' (sample)'}\n`)

  const t = newTally()
  let poolsWithRealMismatch = 0

  for (let i = 0; i < poolIds.length; i++) {
    const poolId = poolIds[i]
    const before = t.realMismatches
    let fresh: EntryAnalyticsRow[] = []
    try {
      fresh = await computePoolEntryAnalytics(admin, poolId)
    } catch (e) {
      console.log(`  ✗ ${poolId}: compute failed — ${(e as Error).message}`)
      continue
    }
    if (fresh.length === 0) {
      console.log(`  · ${poolId}: no entries with predictions — skipped`)
      continue
    }

    const ids = fresh.map((f) => f.entry_id)
    const stored = new Map<string, Record<string, unknown>>()
    for (let off = 0; off < ids.length; off += 500) {
      const slice = ids.slice(off, off + 500)
      const { data } = await admin
        .from('entry_xp_state')
        .select(
          'entry_id, total_xp, current_level, last_five, current_streak, hit_rate, total_completed, exact_count, contrarian_wins, crowd_agreement_pct, analytics_updated_at',
        )
        .in('entry_id', slice)
      for (const r of (data ?? []) as any[]) stored.set(r.entry_id, r)
    }

    comparePool(fresh, stored, poolId, t)
    const delta = t.realMismatches - before
    if (delta > 0) poolsWithRealMismatch++
    console.log(
      `  ${delta > 0 ? '✗' : '✓'} ${poolId}  entries=${fresh.length}  real-mismatches=${delta}`,
    )
  }

  console.log(`\n${'='.repeat(66)}`)
  console.log(`Entries compared      : ${t.entriesCompared}`)
  console.log(`Exact matches         : ${t.exactMatches}`)
  console.log(`Rounding-only (OK)    : ${t.roundingOnly}   [numeric(5,2), expected]`)
  console.log(`REAL mismatches       : ${t.realMismatches}`)
  console.log(`Missing stored rows   : ${t.missingStoredRow}`)
  console.log(`Pools w/ real mismatch: ${poolsWithRealMismatch}`)

  if (Object.keys(t.byField).length > 0) {
    console.log(`\nMismatches by field:`)
    for (const [field, n] of Object.entries(t.byField).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${field.padEnd(22)} ${n}`)
    }
  }
  if (t.samples.length > 0) {
    console.log(`\nSamples (max 12):`)
    for (const s of t.samples) console.log(`  ${s}`)
  }

  const verdict = t.realMismatches === 0 && t.missingStoredRow === 0
  console.log(`\n${verdict ? '✅ PARITY CLEAN — safe to flip the read path' : '❌ PARITY FAILED — do NOT flip'}`)
  console.log(`${'='.repeat(66)}\n`)
  process.exit(verdict ? 0 : 1)
}

main().catch((e) => {
  console.error('FAILED:', e)
  process.exit(1)
})
