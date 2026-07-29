/**
 * Does GET /api/pools/:id/bulk actually withhold other members' unlocked picks?
 *
 * Step 3 moved the pool-wide predictions array off pool open and behind that
 * route. The reveal gate moved with it — page.tsx used to strip other members'
 * still-editable picks before they crossed to the browser, and now the route
 * does. This asserts the property against REAL pools and REAL members, using the
 * exact functions the route calls (no re-implementation, so it cannot drift).
 *
 * THE PROPERTY: for a non-admin viewer, the response may contain
 *   - every prediction belonging to that viewer's own entries, and
 *   - other members' predictions ONLY for scopes that are locked pool-wide.
 * Anything else is a leak: the picks would be in the network payload, and
 * hiding them in the UI would not make them private.
 *
 * It deliberately targets pools where the gate can actually say NO — those
 * before their deadline, and progressive pools with unlocked rounds. In a
 * finished competition everything is revealed and the check is vacuous.
 *
 * Read-only. Exits non-zero on a leak.
 *
 * Usage: npx tsx scripts/verify-bulk-reveal-gate.ts [<poolId>…]
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

import { createAdminClient } from '@/lib/supabase/server'
import { getPoolBulkDataUncached } from '@/lib/poolData'
import {
  computeReveal,
  gatePoolPredictions,
  type PredictionMode,
} from '@/lib/predictions/revealGate'

type Leak = { pool: string; viewer: string; entry: string; match: string; stage: string }

async function pickTargetPools(admin: ReturnType<typeof createAdminClient>): Promise<string[]> {
  // Pools where the gate can still say no.
  const { data: preDeadline } = await admin
    .from('pools')
    .select('pool_id')
    .gt('prediction_deadline', new Date().toISOString())
    .limit(4)

  const { data: unlockedRounds } = await admin
    .from('pool_round_states')
    .select('pool_id')
    .neq('state', 'locked')
    .limit(400)

  const ids = new Set<string>((preDeadline ?? []).map((p: { pool_id: string }) => p.pool_id))
  // Only progressive pools that still have predictions to hide are interesting.
  for (const r of (unlockedRounds ?? []) as Array<{ pool_id: string }>) {
    if (ids.size >= 12) break
    ids.add(r.pool_id)
  }
  return [...ids]
}

/**
 * `stillOpen` re-runs the gate as if the pool were still taking picks.
 *
 * WHY IT IS NEEDED: verified against production — EVERY round row in the
 * database is `completed` (1,840) or `locked` (121), and both count as locked.
 * So with real state the gate always reveals, and a green run proves nothing
 * about the branch that withholds. Shifting the clock does not help either:
 * `state` locks a round regardless of time.
 *
 * This pass keeps the real pool, real members and real predictions, and
 * overrides ONLY the two inputs that say "still editable" — round state and the
 * pool deadline. That is the state every pool will be in next season, and it is
 * the only way to watch the gate say no before it has to.
 */
async function checkPool(
  admin: ReturnType<typeof createAdminClient>,
  poolId: string,
  stillOpen = false,
) {
  const { data: pool } = await admin
    .from('pools')
    .select('pool_id, pool_name, prediction_mode, prediction_deadline, tournament_id')
    .eq('pool_id', poolId)
    .maybeSingle()
  if (!pool) return { checked: 0, leaks: [] as Leak[], withheld: 0 }

  // A real NON-ADMIN member — the viewer the gate exists for.
  const { data: members } = await admin
    .from('pool_members')
    .select('member_id, role')
    .eq('pool_id', poolId)
    .neq('role', 'admin')
  if (!members?.length) return { checked: 0, leaks: [] as Leak[], withheld: 0 }

  const { allPredictions } = await getPoolBulkDataUncached(poolId, true)
  if (allPredictions.length === 0) return { checked: 0, leaks: [] as Leak[], withheld: 0 }

  const { data: roundStates } = await admin
    .from('pool_round_states')
    .select('round_key, state, deadline')
    .eq('pool_id', poolId)

  const { data: matchRows } = await admin
    .from('matches')
    .select('match_id, stage')
    .eq('tournament_id', pool.tournament_id)
  const matchStageById = new Map(
    ((matchRows ?? []) as Array<{ match_id: string; stage: string | null }>).map(
      (m) => [m.match_id, m.stage ?? ''] as [string, string],
    ),
  )

  const FUTURE = '2099-01-01T00:00:00Z'
  const reveal = computeReveal(
    {
      prediction_mode: (pool.prediction_mode ?? 'full_tournament') as PredictionMode,
      prediction_deadline: stillOpen ? FUTURE : pool.prediction_deadline,
    },
    (roundStates ?? []).map((r: { round_key: string; state: string; deadline: string | null }) => ({
      round_key: r.round_key,
      state: stillOpen ? 'open' : r.state,
      deadline: stillOpen ? FUTURE : r.deadline,
    })),
    new Date(),
  )

  // Which scopes are legitimately visible right now?
  const allowedStages: Set<string> | 'all' | 'none' = !reveal.revealed
    ? 'none'
    : reveal.scope === 'all'
      ? 'all'
      : new Set(reveal.roundKeys)

  const leaks: Leak[] = []
  let withheld = 0
  let checked = 0

  for (const m of members as Array<{ member_id: string; role: string }>) {
    const { data: ownEntries } = await admin
      .from('pool_entries')
      .select('entry_id')
      .eq('member_id', m.member_id)
    const ownIds = new Set((ownEntries ?? []).map((e: { entry_id: string }) => e.entry_id))

    const visible = gatePoolPredictions({
      predictions: allPredictions,
      ownEntryIds: ownIds,
      isAdmin: false,
      reveal,
      matchStageById,
    })
    checked++
    withheld += allPredictions.length - visible.length

    for (const p of visible) {
      if (ownIds.has(p.entry_id)) continue // your own picks are always yours
      const stage = matchStageById.get(p.match_id) ?? ''
      const ok = allowedStages === 'all' ? true : allowedStages === 'none' ? false : allowedStages.has(stage)
      if (!ok) {
        leaks.push({ pool: poolId, viewer: m.member_id, entry: p.entry_id, match: p.match_id, stage })
      }
    }
    if (leaks.length > 20) break
  }

  const scope = allowedStages === 'all' ? 'ALL revealed' : allowedStages === 'none' ? 'NOTHING revealed' : `rounds: ${[...allowedStages].join(',')}`
  console.log(
    `  ${leaks.length ? '✗' : '✓'} ${pool.pool_name?.slice(0, 34).padEnd(34)} ${pool.prediction_mode?.padEnd(15)} viewers=${String(checked).padStart(3)}  ${scope}`,
  )
  return { checked, leaks, withheld }
}

async function main() {
  const admin = createAdminClient()
  const explicit = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const pools = explicit.length ? explicit : await pickTargetPools(admin)

  console.log(`Reveal-gate check — ${pools.length} pools, as of now\n`)

  let checked = 0
  let withheld = 0
  const leaks: Leak[] = []
  for (const poolId of pools) {
    const r = await checkPool(admin, poolId)
    checked += r.checked
    withheld += r.withheld
    leaks.push(...r.leaks)
  }

  // Second pass: same real pools, but with the rounds and deadline forced back
  // to "still taking picks" — the only way to exercise the branch that refuses,
  // because no production round is in an open state any more.
  console.log('\nSame pools, with rounds/deadline forced OPEN (the refuse branch)\n')
  let openChecked = 0
  let openWithheld = 0
  const openLeaks: Leak[] = []
  for (const poolId of pools) {
    const r = await checkPool(admin, poolId, true)
    openChecked += r.checked
    openWithheld += r.withheld
    openLeaks.push(...r.leaks)
  }
  checked += openChecked
  withheld += openWithheld
  leaks.push(...openLeaks)

  if (openChecked > 0 && openWithheld === 0) {
    console.log('\n⚠ Forced-open pass withheld NOTHING — the refuse branch was NOT exercised. Treat this run as vacuous.')
  }

  console.log('\n==================================================================')
  console.log(`Viewers checked         : ${checked}`)
  console.log(`Predictions WITHHELD    : ${withheld}   (would have leaked without the gate)`)
  console.log(`LEAKS                   : ${leaks.length}`)
  for (const l of leaks.slice(0, 10)) {
    console.log(`  pool=${l.pool} viewer=${l.viewer} foreign entry=${l.entry} stage=${l.stage || '(unknown)'}`)
  }
  console.log(leaks.length === 0 ? '\n✅ GATE HOLDS' : '\n❌ LEAK — do NOT ship')
  console.log('==================================================================')
  process.exit(leaks.length === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
