// Matchday + weekly recap pushes.
//
// MATCHDAY RECAP — fires when a calendar date's matches all transition to
// is_completed. One push per user per pool per date summarising their
// matchday performance:
//
//   "📅 Matchday recap — Sun, Jun 14"
//   "3 matches · +12 pts · 1 exact · 2 winner · Main · Office Pool"
//
// WEEKLY RECAP — fires once per week (Sunday evening) summarising the
// week's points + best moment across all the user's pools. One push per
// user (not per pool).
//
// Both use atomic claim-on-insert dedupe (push_matchday_recaps_sent +
// push_weekly_recaps_sent) so concurrent runs can't double-send.

import { createAdminClient } from '@/lib/supabase/server'
import { sendPushToUser } from './apns'

// ===== MATCHDAY RECAP =====

type CompletedMatchByDate = {
  date: string // YYYY-MM-DD
  match_ids: string[]
  tournament_id: string
}

/**
 * Find calendar dates where every match scheduled for that date is now
 * completed AND we haven't yet sent recap pushes for that date in at
 * least one pool that uses the tournament. Returns the candidate dates
 * grouped by tournament.
 */
async function findReadyMatchdays(
  adminClient: ReturnType<typeof createAdminClient>,
): Promise<CompletedMatchByDate[]> {
  // Strategy:
  //  - Find dates that have at least one completed match in the last 48h
  //  - For each, verify EVERY match on that date in the same tournament is
  //    completed (no live/scheduled stragglers)
  //  - Cap at the last 48h so we don't reprocess ancient days every run.

  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const { data: recent } = await adminClient
    .from('matches')
    .select('match_id, tournament_id, match_date, is_completed')
    .gte('match_date', since)

  type Row = {
    match_id: string
    tournament_id: string
    match_date: string
    is_completed: boolean | null
  }
  const rows = (recent ?? []) as Row[]

  // Group by (tournament_id, date)
  const byKey = new Map<string, { tournament_id: string; date: string; matches: Row[] }>()
  for (const r of rows) {
    if (!r.match_date) continue
    const date = r.match_date.slice(0, 10)
    const key = `${r.tournament_id}::${date}`
    const bucket = byKey.get(key) ?? { tournament_id: r.tournament_id, date, matches: [] }
    bucket.matches.push(r)
    byKey.set(key, bucket)
  }

  // Keep only fully-completed dates.
  const ready: CompletedMatchByDate[] = []
  for (const b of byKey.values()) {
    if (b.matches.length === 0) continue
    if (b.matches.every((m) => m.is_completed === true)) {
      ready.push({
        date: b.date,
        match_ids: b.matches.map((m) => m.match_id),
        tournament_id: b.tournament_id,
      })
    }
  }
  return ready
}

type ScoreAgg = {
  matches: number
  exact: number
  winner_gd: number
  winner: number
  miss: number
  points: number
}

function emptyAgg(): ScoreAgg {
  return { matches: 0, exact: 0, winner_gd: 0, winner: 0, miss: 0, points: 0 }
}

/**
 * Run a pass over all completed matchdays and send recap pushes to users
 * whose entries had at least one prediction on that day.
 */
export async function firePendingMatchdayRecaps(): Promise<{
  matchdays_checked: number
  pushes_sent: number
  pushes_skipped_dedup: number
}> {
  const adminClient = createAdminClient()
  const matchdays = await findReadyMatchdays(adminClient)
  if (matchdays.length === 0) {
    return { matchdays_checked: 0, pushes_sent: 0, pushes_skipped_dedup: 0 }
  }

  let pushes_sent = 0
  let pushes_skipped_dedup = 0

  for (const md of matchdays) {
    // 1. Pull all match_scores for this date's matches.
    type ScoreRow = {
      entry_id: string
      pool_id: string
      score_type: 'exact' | 'winner_gd' | 'winner' | 'miss'
      total_points: number
    }
    const { data: rawScores } = await adminClient
      .from('match_scores')
      .select('entry_id, pool_id, score_type, total_points')
      .in('match_id', md.match_ids)
    const scores = (rawScores ?? []) as ScoreRow[]
    if (scores.length === 0) continue

    // 2. Map entries → users (via pool_entries + pool_members).
    const entryIds = [...new Set(scores.map((s) => s.entry_id))]
    const { data: rawEntries } = await adminClient
      .from('pool_entries')
      .select('entry_id, member_id, entry_name')
      .in('entry_id', entryIds)
    const entries = (rawEntries ?? []) as Array<{
      entry_id: string
      member_id: string
      entry_name: string
    }>

    const memberIds = [...new Set(entries.map((e) => e.member_id))]
    const { data: rawMembers } = await adminClient
      .from('pool_members')
      .select('member_id, user_id, pool_id')
      .in('member_id', memberIds)
    const members = (rawMembers ?? []) as Array<{
      member_id: string
      user_id: string
      pool_id: string
    }>

    const memberByMemberId = new Map(members.map((m) => [m.member_id, m]))
    const entryById = new Map<
      string,
      { userId: string; poolId: string; entryName: string }
    >()
    for (const e of entries) {
      const m = memberByMemberId.get(e.member_id)
      if (m) {
        entryById.set(e.entry_id, {
          userId: m.user_id,
          poolId: m.pool_id,
          entryName: e.entry_name,
        })
      }
    }

    // 3. Pool names.
    const poolIds = [...new Set(scores.map((s) => s.pool_id))]
    const { data: pools } = await adminClient
      .from('pools')
      .select('pool_id, pool_name')
      .in('pool_id', poolIds)
    const poolNameById = new Map((pools ?? []).map((p) => [p.pool_id, p.pool_name]))

    // 4. Bucket by (user × pool) for the day, pick best entry per bucket.
    type BucketKey = string // `${userId}::${poolId}`
    const buckets = new Map<BucketKey, { agg: ScoreAgg; entryName: string }>()
    // For multi-entry users, sum across their best entry — but we don't know
    // "best" until we aggregate. Simpler: aggregate per entry first, then
    // for each (user × pool) pick the entry with highest points.
    type EntryDayAgg = { agg: ScoreAgg; entryName: string }
    const perEntry = new Map<string, EntryDayAgg>()
    for (const s of scores) {
      const e = entryById.get(s.entry_id)
      if (!e) continue
      const cur = perEntry.get(s.entry_id) ?? {
        agg: emptyAgg(),
        entryName: e.entryName,
      }
      cur.agg.matches += 1
      cur.agg.points += s.total_points
      cur.agg[s.score_type] += 1
      perEntry.set(s.entry_id, cur)
    }
    for (const [entryId, ea] of perEntry) {
      const e = entryById.get(entryId)!
      const key: BucketKey = `${e.userId}::${e.poolId}`
      const existing = buckets.get(key)
      if (!existing || ea.agg.points > existing.agg.points) {
        buckets.set(key, ea)
      }
    }

    // 5. Send one push per bucket, with atomic claim.
    for (const [key, b] of buckets) {
      const [userId, poolId] = key.split('::')
      // Skip if zero matches predicted (shouldn't happen given the join, but safe)
      if (b.agg.matches === 0) continue
      const claimed = await claimMatchday(adminClient, userId, poolId, md.date)
      if (!claimed) {
        pushes_skipped_dedup++
        continue
      }
      const poolName = poolNameById.get(poolId) ?? 'Pool'
      const niceDate = new Date(`${md.date}T12:00:00Z`).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
      const detail = formatRecapDetail(b.agg)
      try {
        await sendPushToUser(
          userId,
          {
            title: `📅 Matchday recap — ${niceDate}`,
            body: `${b.agg.matches} matches · +${b.agg.points} pts${detail ? ` · ${detail}` : ''} · ${b.entryName} · ${poolName}`,
            data: {
              type: 'matchday_recap',
              pool_id: poolId,
              matchday: md.date,
            },
          },
          'MATCH_RESULTS',
        )
        pushes_sent++
      } catch (err) {
        console.error('[recaps] matchday push failed', userId, poolId, md.date, err)
      }
    }
  }

  return {
    matchdays_checked: matchdays.length,
    pushes_sent,
    pushes_skipped_dedup,
  }
}

async function claimMatchday(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  poolId: string,
  matchday: string,
): Promise<boolean> {
  const { data } = await adminClient
    .from('push_matchday_recaps_sent')
    .insert({ user_id: userId, pool_id: poolId, matchday })
    .select('user_id')
    .maybeSingle()
  return !!data
}

function formatRecapDetail(agg: ScoreAgg): string {
  const parts: string[] = []
  if (agg.exact) parts.push(`${agg.exact} exact`)
  if (agg.winner_gd) parts.push(`${agg.winner_gd} winner+GD`)
  if (agg.winner) parts.push(`${agg.winner} winner`)
  if (agg.miss) parts.push(`${agg.miss} miss`)
  return parts.join(' · ')
}

// ===== WEEKLY RECAP =====

/**
 * Send a "your week" digest to each user with at least one scored match in
 * the past week. Cross-pool — one push per user (not per pool). Designed to
 * be called by a Sunday evening cron.
 */
export async function firePendingWeeklyRecaps(): Promise<{
  users_checked: number
  pushes_sent: number
  pushes_skipped_dedup: number
}> {
  const adminClient = createAdminClient()

  // Pick the Monday of the last completed week (we run on Sunday evening
  // for the week that just ended).
  const now = new Date()
  const dayOfWeek = now.getUTCDay() // 0 = Sunday
  // Most recent Monday at 00:00 UTC. If it's currently Sunday, that's "this"
  // week starting Mon. If it's any other day, we summarise the week starting
  // the previous Monday.
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const weekStart = new Date(now)
  weekStart.setUTCDate(now.getUTCDate() - daysSinceMonday)
  weekStart.setUTCHours(0, 0, 0, 0)
  const weekEnd = new Date(weekStart)
  weekEnd.setUTCDate(weekStart.getUTCDate() + 7)
  const weekStartIso = weekStart.toISOString().slice(0, 10)

  // Aggregate match_scores in the window. We use calculated_at as the time
  // anchor (when scoring ran for each row), which is close enough to match
  // completion for a weekly window.
  type ScoreRow = {
    entry_id: string
    score_type: 'exact' | 'winner_gd' | 'winner' | 'miss'
    total_points: number
  }
  const { data: rawScores } = await adminClient
    .from('match_scores')
    .select('entry_id, score_type, total_points, calculated_at')
    .gte('calculated_at', weekStart.toISOString())
    .lt('calculated_at', weekEnd.toISOString())
  const scores = (rawScores ?? []) as ScoreRow[]
  if (scores.length === 0) {
    return { users_checked: 0, pushes_sent: 0, pushes_skipped_dedup: 0 }
  }

  const entryIds = [...new Set(scores.map((s) => s.entry_id))]
  const { data: rawEntries } = await adminClient
    .from('pool_entries')
    .select('entry_id, member_id')
    .in('entry_id', entryIds)
  const entries = (rawEntries ?? []) as Array<{ entry_id: string; member_id: string }>
  const memberIds = [...new Set(entries.map((e) => e.member_id))]
  const { data: rawMembers } = await adminClient
    .from('pool_members')
    .select('member_id, user_id')
    .in('member_id', memberIds)
  const members = (rawMembers ?? []) as Array<{ member_id: string; user_id: string }>
  const memberByMemberId = new Map(members.map((m) => [m.member_id, m]))
  const entryToUser = new Map<string, string>()
  for (const e of entries) {
    const m = memberByMemberId.get(e.member_id)
    if (m) entryToUser.set(e.entry_id, m.user_id)
  }

  // Aggregate per user.
  const userAggs = new Map<string, ScoreAgg>()
  for (const s of scores) {
    const userId = entryToUser.get(s.entry_id)
    if (!userId) continue
    const agg = userAggs.get(userId) ?? emptyAgg()
    agg.matches += 1
    agg.points += s.total_points
    agg[s.score_type] += 1
    userAggs.set(userId, agg)
  }

  let pushes_sent = 0
  let pushes_skipped_dedup = 0
  for (const [userId, agg] of userAggs) {
    if (agg.matches === 0) continue
    const claimed = await claimWeek(adminClient, userId, weekStartIso)
    if (!claimed) {
      pushes_skipped_dedup++
      continue
    }
    const detail = formatRecapDetail(agg)
    try {
      await sendPushToUser(
        userId,
        {
          title: 'Your week in predictions',
          body: `${agg.matches} matches · +${agg.points} pts${detail ? ` · ${detail}` : ''}`,
          data: {
            type: 'weekly_recap',
            week_starting: weekStartIso,
          },
        },
        'MATCH_RESULTS',
      )
      pushes_sent++
    } catch (err) {
      console.error('[recaps] weekly push failed', userId, err)
    }
  }

  return {
    users_checked: userAggs.size,
    pushes_sent,
    pushes_skipped_dedup,
  }
}

async function claimWeek(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  weekStarting: string,
): Promise<boolean> {
  const { data } = await adminClient
    .from('push_weekly_recaps_sent')
    .insert({ user_id: userId, week_starting: weekStarting })
    .select('user_id')
    .maybeSingle()
  return !!data
}
