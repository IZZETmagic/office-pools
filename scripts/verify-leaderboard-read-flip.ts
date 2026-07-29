/**
 * Does the leaderboard render the SAME numbers after the read flip?
 *
 * Step 2 of drafts/2026-07-29_leaderboard_precomputed_handoff.md replaced
 * LeaderboardTab's browser-side derivation (over every prediction + score row in
 * the pool) with a read of the precomputed `entry_xp_state` columns. This
 * re-implements the OLD client derivation exactly as it was and diffs it
 * against what the new read path returns, per entry, per field.
 *
 * This is deliberately NOT the same check as scripts/verify-analytics-parity.ts.
 * That one compares the stored row against the analytics WRITER — two callers of
 * the same function, so it proves freshness, not agreement with the UI. This one
 * compares the stored row against the code that actually drew the pixels.
 *
 * TWO DIFFERENCES ARE EXPECTED AND ARE REPORTED SEPARATELY, NOT AS FAILURES:
 *
 *   1. `level` — the client computed it WITHOUT the ratchet, so it could show a
 *      lower level than the same entry's mobile screen, which reads the floored
 *      value. Reading the stored (floored) level is the point: it ends that
 *      split. Expect stored >= client, never below.
 *   2. `crowdAgreementPct` — the client divided by EVERY crowd match; the writer
 *      divides by those the entry actually predicted. On an entry that skipped
 *      matches the client's figure is diluted toward 0. The writer's is the
 *      honest one ("of the picks you made, how many followed the crowd"), and it
 *      is what mobile has always shown.
 *
 * Anything else differing is a real regression.
 *
 * Read-only. Writes nothing. Exits non-zero on a real mismatch.
 *
 * Usage:
 *   npx tsx scripts/verify-leaderboard-read-flip.ts <poolId> [<poolId>…]
 *   npx tsx scripts/verify-leaderboard-read-flip.ts          # default sample
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

const envPath = resolve(process.cwd(), '.env.local')
try {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
} catch {
  console.error('Could not read .env.local')
  process.exit(1)
}

import { getPoolDataUncached, getPoolBulkDataUncached } from '@/lib/poolData'
import { getLevelName } from '@/lib/levelNames'
import {
  computeStreaks,
  computeCrowdConsensus,
  applyCrowdOverlay,
} from '@/app/pools/[pool_id]/analytics/analyticsHelpers'
import { computeFullXPBreakdown, computeLevel } from '@/app/pools/[pool_id]/analytics/xpSystem'
import type { MatchData, PredictionData, MatchScoreNarrow } from '@/app/pools/[pool_id]/types'

const DEFAULT_POOLS = [
  'b7ddbf9d-687d-4e61-a415-807798d972e2', // 192 entries, full_tournament — the measurement pool
  '4ed0d3b6-850a-4ef6-887a-edeccc50a774', // 77 entries
  'fef5260a-0b25-4c22-8adf-8445ff2f3bfa', // 62 entries
  'd166d281-c998-48ce-b728-e667ec174051', // 25 entries
]

type Diff = { entry: string; field: string; client: string; stored: string }

async function checkPool(poolId: string) {
  const data = await getPoolDataUncached(poolId, true)
  if (!data.pool) return { entries: 0, real: [] as Diff[], ratchet: 0, crowd: 0 }
  // The arrays left pool open in step 3 — read them the way the per-tab route
  // does, so this check still replays the old derivation against real inputs.
  const bulk = await getPoolBulkDataUncached(poolId, true)
  if (data.pool.prediction_mode === 'bracket_picker') {
    console.log(`  · ${poolId}: bracket_picker — the flip does not touch this mode, skipped`)
    return { entries: 0, real: [] as Diff[], ratchet: 0, crowd: 0 }
  }

  const { members, matches, entryStats } = data
  const { allPredictions, matchScores } = bulk

  // ---- Replay the OLD client derivation, verbatim ----------------------------
  const matchScoresByEntry = new Map<string, MatchScoreNarrow[]>()
  for (const ms of matchScores) {
    const list = matchScoresByEntry.get(ms.entry_id) || []
    list.push(ms)
    matchScoresByEntry.set(ms.entry_id, list)
  }
  const predsByEntry = new Map<string, PredictionData[]>()
  for (const p of allPredictions) {
    const list = predsByEntry.get(p.entry_id) || []
    list.push(p)
    predsByEntry.set(p.entry_id, list)
  }

  const completedMatches = matches.filter(
    (m) => m.is_completed && m.home_score_ft !== null && m.away_score_ft !== null,
  )
  if (completedMatches.length === 0) {
    console.log(`  · ${poolId}: no completed matches — nothing to compare, skipped`)
    return { entries: 0, real: [] as Diff[], ratchet: 0, crowd: 0 }
  }

  const crowdConsensus = computeCrowdConsensus(matches as MatchData[], allPredictions, members)
  const storedByEntry = new Map(entryStats.map((s) => [s.entry_id, s]))

  const real: Diff[] = []
  let ratchet = 0
  let crowd = 0
  let crowdDelta = 0
  let compared = 0
  let clientCrowdTop: { entry: string; pct: number } | null = null
  let storedCrowdTop: { entry: string; pct: number } | null = null

  for (const member of members) {
    for (const entry of member.entries || []) {
      const entryPreds = predsByEntry.get(entry.entry_id) || []
      const entryMatchScores = (matchScoresByEntry.get(entry.entry_id) || [])
        .slice()
        .sort((a, b) => a.match_number - b.match_number)
      if (entryMatchScores.length === 0 && entryPreds.length === 0) continue

      const predResults = entryMatchScores.map((ms) => ({
        matchId: ms.match_id,
        matchNumber: ms.match_number,
        type: ms.score_type as 'exact' | 'winner_gd' | 'winner' | 'miss',
        points: ms.total_points,
        stage: ms.stage,
      }))

      const streakData = computeStreaks(predResults)
      const hits = predResults.filter((r) => r.type !== 'miss').length
      const clientHitRate = predResults.length > 0 ? (hits / predResults.length) * 100 : 0
      const clientExact = predResults.filter((r) => r.type === 'exact').length
      const clientLast5 = predResults.slice(-5).map((r) => r.type)

      const crowdForEntry = applyCrowdOverlay(crowdConsensus, entryPreds)
      const clientContrarian = crowdForEntry.filter((c) => c.userIsContrarian && c.userWasCorrect).length
      const clientCrowdPct =
        crowdForEntry.length > 0
          ? (crowdForEntry.filter((c) => !c.userIsContrarian).length / crowdForEntry.length) * 100
          : 0

      let clientLevel = 1
      try {
        const xp = computeFullXPBreakdown({
          predictionResults: predResults,
          matches: matches as MatchData[],
          crowdData: crowdForEntry,
          streaks: streakData,
          entryPredictions: entryPreds,
          entryRank: entry.current_rank ?? null,
          totalMatches: matches.length,
        })
        clientLevel = computeLevel(xp.totalXP).currentLevel.level
      } catch {
        /* the client swallowed this too */
      }

      const stored = storedByEntry.get(entry.entry_id)
      if (!stored) {
        real.push({ entry: entry.entry_id, field: 'MISSING ROW', client: 'derived', stored: 'none' })
        continue
      }
      compared++

      const near = (a: number, b: number) => Math.abs(a - b) < 0.02 // numeric(5,2) storage
      const push = (field: string, c: unknown, st: unknown) =>
        real.push({ entry: entry.entry_id, field, client: String(c), stored: String(st) })

      if (!near(clientHitRate, stored.hit_rate)) push('hitRate', clientHitRate.toFixed(2), stored.hit_rate)
      if (clientExact !== stored.exact_count) push('exactCount', clientExact, stored.exact_count)
      if (predResults.length !== stored.total_completed) push('totalCompleted', predResults.length, stored.total_completed)
      if (clientContrarian !== stored.contrarian_wins) push('contrarianWins', clientContrarian, stored.contrarian_wins)

      const storedLast5 = (stored.last_five ?? []).filter((t) => t !== 'no_pick')
      if (clientLast5.join(',') !== storedLast5.join(',')) push('last5', clientLast5.join(','), storedLast5.join(','))

      const cs = stored.current_streak ?? { type: 'none', length: 0 }
      if (streakData.currentStreak.type !== cs.type || streakData.currentStreak.length !== cs.length) {
        push('currentStreak', `${streakData.currentStreak.type}/${streakData.currentStreak.length}`, `${cs.type}/${cs.length}`)
      }

      // --- expected-difference buckets ---
      if (clientLevel !== stored.current_level) {
        if (stored.current_level > clientLevel) ratchet++
        else push('level DEMOTED', `${clientLevel} ${getLevelName(clientLevel)}`, `${stored.current_level} ${getLevelName(stored.current_level)}`)
      }
      if (!near(clientCrowdPct, stored.crowd_agreement_pct)) {
        crowd++
        crowdDelta = Math.max(crowdDelta, Math.abs(clientCrowdPct - stored.crowd_agreement_pct))
      }
      // The ONLY place crowd_agreement_pct is user-visible is picking the single
      // "Crowd Follower" — so track whether the winner itself moves. Mirrors the
      // component's rule (highest pct, min 3 completed).
      if (predResults.length >= 3) {
        if (clientCrowdPct > (clientCrowdTop?.pct ?? 0)) clientCrowdTop = { entry: entry.entry_id, pct: clientCrowdPct }
        if (stored.crowd_agreement_pct > (storedCrowdTop?.pct ?? 0)) {
          storedCrowdTop = { entry: entry.entry_id, pct: stored.crowd_agreement_pct }
        }
      }
    }
  }

  if (clientCrowdTop?.entry !== storedCrowdTop?.entry) {
    console.log(
      `    ⚠ Crowd Follower CHANGES: ${clientCrowdTop?.entry ?? 'none'} (${clientCrowdTop?.pct.toFixed(1) ?? '-'}%)` +
        ` → ${storedCrowdTop?.entry ?? 'none'} (${storedCrowdTop?.pct.toFixed(1) ?? '-'}%)`,
    )
  }
  if (crowd > 0) console.log(`    crowd-pct max delta: ${crowdDelta.toFixed(1)} points`)

  const status = real.length === 0 ? '✓' : '✗'
  console.log(
    `  ${status} ${poolId}  entries=${compared}  real-diffs=${real.length}  ratcheted-levels=${ratchet}  crowd-pct-diffs=${crowd}`,
  )
  return { entries: compared, real, ratchet, crowd }
}

async function main() {
  const pools = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const targets = pools.length ? pools : DEFAULT_POOLS

  console.log(`Comparing the OLD client derivation against the stored rows — ${targets.length} pools\n`)

  let entries = 0
  let ratchet = 0
  let crowd = 0
  const real: Diff[] = []
  for (const poolId of targets) {
    const r = await checkPool(poolId)
    entries += r.entries
    ratchet += r.ratchet
    crowd += r.crowd
    real.push(...r.real)
  }

  console.log('\n==================================================================')
  console.log(`Entries compared        : ${entries}`)
  console.log(`REAL differences        : ${real.length}`)
  console.log(`Levels ratcheted UP     : ${ratchet}   [expected — ends the web/mobile split]`)
  console.log(`crowd_agreement_pct     : ${crowd}   [expected — denominator now excludes unpredicted matches]`)
  if (real.length) {
    console.log('\nSamples:')
    for (const d of real.slice(0, 15)) console.log(`  ${d.entry} ${d.field}: client=${d.client} stored=${d.stored}`)
  }
  console.log(real.length === 0 ? '\n✅ LEADERBOARD NUMBERS UNCHANGED' : '\n❌ REAL DIFFERENCES — do NOT ship')
  console.log('==================================================================')
  process.exit(real.length === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
